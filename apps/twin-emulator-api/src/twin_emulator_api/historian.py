"""Historian SQLite compartido por sesión simulada."""

from __future__ import annotations

import json
import os
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from .d1_storage import connect


def _path() -> Path:
    root = Path(os.environ.get("TWIN_DATA", Path.cwd() / ".twin-data"))
    root.mkdir(parents=True, exist_ok=True)
    return root / "session-historian.sqlite3"


class SessionHistorian:
    def __init__(self) -> None:
        self.path = _path()
        with self._connect() as conn:
            conn.execute("CREATE TABLE IF NOT EXISTS samples (session_id TEXT, t REAL, payload TEXT, PRIMARY KEY(session_id, t))")
            conn.execute("CREATE TABLE IF NOT EXISTS commands (session_id TEXT, t REAL, payload TEXT)")
            conn.execute("CREATE TABLE IF NOT EXISTS scene_frames (session_id TEXT, t REAL, snapshot TEXT, PRIMARY KEY(session_id, t))")
            conn.execute(
                "CREATE TABLE IF NOT EXISTS recommendations ("
                "session_id TEXT, recommendation_id TEXT, t REAL, payload TEXT, "
                "PRIMARY KEY(session_id, recommendation_id))"
            )
            conn.execute(
                "CREATE TABLE IF NOT EXISTS model_runs ("
                "run_id TEXT PRIMARY KEY, comparison_id TEXT NOT NULL, session_id TEXT NOT NULL, "
                "source TEXT NOT NULL, profile_id TEXT NOT NULL, profile_hash TEXT NOT NULL, "
                "model_id TEXT NOT NULL, metadata TEXT NOT NULL, created_at TEXT NOT NULL, "
                "UNIQUE(comparison_id, source))"
            )
            conn.execute(
                "CREATE TABLE IF NOT EXISTS model_frames ("
                "run_id TEXT NOT NULL, frame_index INTEGER NOT NULL, t REAL NOT NULL, "
                "temporal_context TEXT NOT NULL, state TEXT NOT NULL, "
                "PRIMARY KEY(run_id, frame_index), UNIQUE(run_id, t))"
            )
            conn.execute(
                "CREATE TABLE IF NOT EXISTS comparison_triads ("
                "comparison_id TEXT NOT NULL, session_id TEXT NOT NULL, t REAL NOT NULL, "
                "profile_id TEXT NOT NULL, profile_hash TEXT NOT NULL, emulator_t REAL, "
                "cosimulation_run_id TEXT, cosimulation_frame_index INTEGER, "
                "optimization_run_id TEXT, optimization_frame_index INTEGER, "
                "PRIMARY KEY(comparison_id, t))"
            )
            conn.execute(
                "CREATE TABLE IF NOT EXISTS comparison_manifests ("
                "comparison_id TEXT PRIMARY KEY, session_id TEXT NOT NULL, "
                "input_hash TEXT NOT NULL, manifest_json TEXT NOT NULL, created_at TEXT NOT NULL, "
                "UNIQUE(session_id, comparison_id))"
            )
            conn.execute(
                "CREATE TABLE IF NOT EXISTS comparison_source_events ("
                "event_id TEXT PRIMARY KEY, session_id TEXT NOT NULL, comparison_id TEXT NOT NULL, "
                "source TEXT NOT NULL, status TEXT NOT NULL, detail TEXT, created_at TEXT NOT NULL)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS comparison_source_events_latest "
                "ON comparison_source_events (session_id, comparison_id, source, created_at)"
            )

    def _connect(self) -> Any:
        return connect(self.path)

    def sample(self, session_id: str, t: float, payload: dict[str, Any]) -> None:
        with self._connect() as conn:
            conn.execute("INSERT OR IGNORE INTO samples VALUES (?, ?, ?)", (session_id, t, json.dumps(payload)))

    def frame(self, session_id: str, t: float, snapshot: dict[str, Any]) -> None:
        """Fotograma operativo cada minuto simulado; nunca sustituye el estado vivo."""
        with self._connect() as conn:
            conn.execute("INSERT OR IGNORE INTO scene_frames VALUES (?, ?, ?)", (session_id, t, json.dumps(snapshot)))
            conn.execute(
                "UPDATE comparison_triads SET emulator_t = ? WHERE session_id = ? AND t = ? AND emulator_t IS NULL",
                (t, session_id, t),
            )

    def create_comparison_manifest(self, session_id: str, comparison_id: str, manifest: dict[str, Any]) -> dict[str, Any]:
        """Fija append-only el contexto temporal/operativo de una comparación."""
        serialized = json.dumps(manifest, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)
        input_hash = manifest["input_hash"]
        with self._connect() as conn:
            existing = conn.execute(
                "SELECT input_hash, manifest_json FROM comparison_manifests WHERE session_id = ? AND comparison_id = ?",
                (session_id, comparison_id),
            ).fetchone()
            if existing is not None:
                if existing[0] != input_hash:
                    raise ValueError("comparison_id ya está ligado a otro contexto; cree una comparación nueva")
                return json.loads(existing[1])
            prior_runs = conn.execute(
                "SELECT metadata FROM model_runs WHERE session_id = ? AND comparison_id = ?",
                (session_id, comparison_id),
            ).fetchall()
            if any(json.loads(row[0]).get("comparison_input_hash") != input_hash for row in prior_runs):
                raise ValueError("la comparación contiene corridas previas sin este manifiesto; cree una comparación nueva")
            conn.execute(
                "INSERT INTO comparison_manifests VALUES (?, ?, ?, ?, ?)",
                (comparison_id, session_id, input_hash, serialized, datetime.now(UTC).isoformat()),
            )
        return manifest

    def record_comparison_source_status(
        self, session_id: str, comparison_id: str, source: str, status: str, detail: str | None = None
    ) -> dict[str, Any]:
        if source not in {"cosimulation", "optimization"} or status not in {"in_progress", "ready", "blocked", "failed"}:
            raise ValueError("source/status de comparación no soportado")
        event = {
            "event_id": str(uuid4()), "session_id": session_id, "comparison_id": comparison_id,
            "source": source, "status": status, "detail": detail, "created_at": datetime.now(UTC).isoformat(),
        }
        with self._connect() as conn:
            if conn.execute(
                "SELECT 1 FROM comparison_manifests WHERE session_id = ? AND comparison_id = ?",
                (session_id, comparison_id),
            ).fetchone() is None:
                raise ValueError("la comparación requiere un manifiesto")
            conn.execute(
                "INSERT INTO comparison_source_events VALUES (?, ?, ?, ?, ?, ?, ?)",
                tuple(event.values()),
            )
        return event

    def get_comparison_manifest(self, session_id: str, comparison_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT manifest_json FROM comparison_manifests WHERE session_id = ? AND comparison_id = ?",
                (session_id, comparison_id),
            ).fetchone()
        return json.loads(row[0]) if row is not None else None

    def store_model_run(self, session_id: str, comparison_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        """Guarda una serie calculada append-only y materializa sus referencias de tríada."""
        source = payload["source"]
        run_id = payload["run_id"]
        profile_id = payload["profile_id"]
        profile_hash = payload["profile_hash"]
        model_id = payload["model_id"]
        frames = payload["frames"]
        metadata = {key: value for key, value in payload.items() if key != "frames"}
        metadata_json = json.dumps(metadata, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        with self._connect() as conn:
            manifest_row = conn.execute(
                "SELECT input_hash, manifest_json FROM comparison_manifests "
                "WHERE session_id = ? AND comparison_id = ?",
                (session_id, comparison_id),
            ).fetchone()
            if manifest_row is None:
                raise ValueError("la comparación requiere un manifiesto antes de publicar ejecuciones")
            manifest = json.loads(manifest_row[1])
            run_context = (
                payload.get("comparison_input_hash"), profile_id, profile_hash, payload.get("snapshot_id"),
                payload.get("time_origin_s"), payload.get("time_step_s"), payload.get("horizon_s"),
                payload.get("forecast_times_s"),
            )
            manifest_context = (
                manifest_row[0], manifest["profile_id"], manifest["profile_hash"], manifest["snapshot_id"],
                manifest["base_time_s"], manifest["time_step_s"], manifest["horizon_s"],
                manifest["forecast_times_s"],
            )
            if run_context != manifest_context:
                raise ValueError("la ejecución no coincide con el manifiesto de perfil, snapshot o rejilla temporal")
            siblings = conn.execute(
                "SELECT session_id, profile_id, profile_hash FROM model_runs WHERE comparison_id = ? LIMIT 1",
                (comparison_id,),
            ).fetchone()
            if siblings is not None and (siblings[0], siblings[1], siblings[2]) != (session_id, profile_id, profile_hash):
                raise ValueError("la comparación ya está ligada a otra sesión o versión de perfil")
            source_run = conn.execute(
                "SELECT run_id FROM model_runs WHERE comparison_id = ? AND source = ?",
                (comparison_id, source),
            ).fetchone()
            if source_run is not None and source_run[0] != run_id:
                raise ValueError("la comparación ya tiene una ejecución de este origen; cree otra comparación")
            existing = conn.execute(
                "SELECT comparison_id, session_id, source, profile_id, profile_hash, model_id, metadata "
                "FROM model_runs WHERE run_id = ?",
                (run_id,),
            ).fetchone()
            expected = (comparison_id, session_id, source, profile_id, profile_hash, model_id, metadata_json)
            if existing is not None and tuple(existing) != expected:
                raise ValueError("run_id ya existe con contenido distinto; las ejecuciones son inmutables")
            conn.execute(
                "INSERT OR IGNORE INTO model_runs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    run_id, comparison_id, session_id, source, profile_id, profile_hash, model_id,
                    metadata_json, datetime.now(UTC).isoformat(),
                ),
            )
            for index, frame in enumerate(frames):
                at = float(frame["simulation_time_s"])
                context = frame["temporal_context"]
                state_json = json.dumps(frame["state"], ensure_ascii=False, sort_keys=True, separators=(",", ":"))
                saved = conn.execute(
                    "SELECT t, temporal_context, state FROM model_frames WHERE run_id = ? AND frame_index = ?",
                    (run_id, index),
                ).fetchone()
                expected_frame = (at, context, state_json)
                if saved is not None and tuple(saved) != expected_frame:
                    raise ValueError("run_id ya contiene un frame distinto; la historia calculada es inmutable")
                conn.execute(
                    "INSERT OR IGNORE INTO model_frames VALUES (?, ?, ?, ?, ?)",
                    (run_id, index, at, context, state_json),
                )
                emulator = conn.execute("SELECT t FROM scene_frames WHERE session_id = ? AND t = ?", (session_id, at)).fetchone()
                conn.execute(
                    "INSERT OR IGNORE INTO comparison_triads "
                    "(comparison_id, session_id, t, profile_id, profile_hash, emulator_t) VALUES (?, ?, ?, ?, ?, ?)",
                    (comparison_id, session_id, at, profile_id, profile_hash, emulator[0] if emulator else None),
                )
                column = "cosimulation" if source == "cosimulation" else "optimization"
                conn.execute(
                    f"UPDATE comparison_triads SET {column}_run_id = ?, {column}_frame_index = ? "
                    f"WHERE comparison_id = ? AND t = ? AND {column}_run_id IS NULL",
                    (run_id, index, comparison_id, at),
                )
            conn.execute(
                "INSERT INTO comparison_source_events VALUES (?, ?, ?, ?, ?, ?, ?)",
                (str(uuid4()), session_id, comparison_id, source, "ready", None, datetime.now(UTC).isoformat()),
            )
        return {"comparison_id": comparison_id, "run_id": run_id, "source": source, "frame_count": len(frames)}

    def list_model_comparisons(self, session_id: str) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT comparison_id, profile_id, profile_hash, source, run_id, model_id, created_at "
                "FROM model_runs WHERE session_id = ? ORDER BY created_at, source",
                (session_id,),
            ).fetchall()
            manifests = conn.execute(
                "SELECT comparison_id, manifest_json, created_at FROM comparison_manifests WHERE session_id = ?",
                (session_id,),
            ).fetchall()
            status_events = conn.execute(
                "SELECT comparison_id, source, status, detail FROM comparison_source_events "
                "WHERE session_id = ? ORDER BY rowid",
                (session_id,),
            ).fetchall()
            has_emulator_frames = conn.execute(
                "SELECT 1 FROM scene_frames WHERE session_id = ? LIMIT 1", (session_id,)
            ).fetchone() is not None
        grouped: dict[str, dict[str, Any]] = {}
        for comparison_id, profile_id, profile_hash, source, run_id, model_id, created_at in rows:
            item = grouped.setdefault(comparison_id, {
                "comparison_id": comparison_id, "profile_id": profile_id, "profile_hash": profile_hash,
                "runs": {}, "created_at": created_at,
            })
            item["runs"][source] = {"run_id": run_id, "model_id": model_id}
        for comparison_id, serialized, created_at in manifests:
            manifest = json.loads(serialized)
            item = grouped.setdefault(comparison_id, {
                "comparison_id": comparison_id, "profile_id": manifest["profile_id"],
                "profile_hash": manifest["profile_hash"], "runs": {}, "created_at": created_at,
            })
            item["manifest"] = {
                key: manifest[key]
                for key in ("input_hash", "snapshot_id", "base_time_s", "time_step_s", "horizon_s", "history_sample_count")
            }
            item["source_status"] = {
                "emulator": {"status": "ready" if has_emulator_frames else "not_requested", "detail": None},
                "cosimulation": {"status": "ready" if "cosimulation" in item["runs"] else "not_requested", "detail": None},
                "optimization": {"status": "ready" if "optimization" in item["runs"] else "not_requested", "detail": None},
            }
        for comparison_id, source, status, detail in status_events:
            item = grouped.get(comparison_id)
            if item is not None:
                item.setdefault("source_status", {})[source] = {"status": status, "detail": detail}
        return list(grouped.values())

    def comparison_triads(self, session_id: str, comparison_id: str) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT t, profile_id, profile_hash, emulator_t, cosimulation_run_id, cosimulation_frame_index, "
                "optimization_run_id, optimization_frame_index FROM comparison_triads "
                "WHERE session_id = ? AND comparison_id = ? ORDER BY t",
                (session_id, comparison_id),
            ).fetchall()
            result: list[dict[str, Any]] = []
            for at, profile_id, profile_hash, emulator_t, cosim_run, cosim_index, opt_run, opt_index in rows:
                emulator = None
                if emulator_t is not None:
                    saved = conn.execute(
                        "SELECT snapshot FROM scene_frames WHERE session_id = ? AND t = ?",
                        (session_id, emulator_t),
                    ).fetchone()
                    if saved is not None:
                        emulator = {"simulation_time_s": emulator_t, "state": json.loads(saved[0])}
                sources: dict[str, Any] = {"emulator": emulator}
                for source, run_id, index in (("cosimulation", cosim_run, cosim_index), ("optimization", opt_run, opt_index)):
                    if run_id is None or index is None:
                        sources[source] = None
                        continue
                    saved = conn.execute(
                        "SELECT t, temporal_context, state FROM model_frames WHERE run_id = ? AND frame_index = ?",
                        (run_id, index),
                    ).fetchone()
                    run_metadata = conn.execute("SELECT metadata FROM model_runs WHERE run_id = ?", (run_id,)).fetchone()
                    metadata = json.loads(run_metadata[0]) if run_metadata is not None else {}
                    sources[source] = None if saved is None else {
                        "run_id": run_id,
                        "model_quality": metadata.get("model_quality"),
                        "simulation_time_s": saved[0],
                        "temporal_context": saved[1],
                        "state": json.loads(saved[2]),
                    }
                missing_sources = [name for name, item in sources.items() if item is None]
                result.append({
                    "simulation_time_s": at,
                    "profile_id": profile_id,
                    "profile_hash": profile_hash,
                    "sources": sources,
                    "missing_sources": missing_sources,
                    "aligned": not missing_sources and all(item["simulation_time_s"] == at for item in sources.values()),
                })
        return result

    def nearest_frame(self, session_id: str, t: float) -> dict[str, Any] | None:
        with self._connect() as conn:
            before = conn.execute(
                "SELECT t, snapshot FROM scene_frames WHERE session_id = ? AND t <= ? ORDER BY t DESC LIMIT 1", (session_id, t)
            ).fetchone()
            after = conn.execute(
                "SELECT t, snapshot FROM scene_frames WHERE session_id = ? AND t >= ? ORDER BY t LIMIT 1", (session_id, t)
            ).fetchone()
        candidates = [row for row in (before, after) if row is not None]
        if not candidates:
            return None
        instant, payload = min(candidates, key=lambda row: abs(row[0] - t))
        return {"t": instant, "snapshot": json.loads(payload), "temporal_context": "history", "applied": False}

    def command(self, session_id: str, t: float, payload: dict[str, Any]) -> None:
        with self._connect() as conn:
            conn.execute("INSERT INTO commands VALUES (?, ?, ?)", (session_id, t, json.dumps(payload)))

    def recommendation(self, session_id: str, recommendation_id: str, t: float, payload: dict[str, Any]) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO recommendations VALUES (?, ?, ?, ?)", (session_id, recommendation_id, t, json.dumps(payload))
            )

    def read(self, session_id: str) -> dict[str, Any]:
        with self._connect() as conn:
            samples = conn.execute("SELECT t, payload FROM samples WHERE session_id = ? ORDER BY t", (session_id,)).fetchall()
            commands = conn.execute("SELECT t, payload FROM commands WHERE session_id = ? ORDER BY t", (session_id,)).fetchall()
            recommendations = conn.execute(
                "SELECT t, payload FROM recommendations WHERE session_id = ? ORDER BY t", (session_id,)
            ).fetchall()
        return {
            "samples": [{"t": t, **json.loads(payload)} for t, payload in samples],
            "commands": [{"t": t, **json.loads(payload)} for t, payload in commands],
            "recommendations": [{"t": t, **json.loads(payload)} for t, payload in recommendations],
        }


historian = SessionHistorian()
