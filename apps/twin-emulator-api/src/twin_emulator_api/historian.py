"""Historian SQLite compartido por sesión simulada."""

from __future__ import annotations

import json
import os
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

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
        return {"comparison_id": comparison_id, "run_id": run_id, "source": source, "frame_count": len(frames)}

    def list_model_comparisons(self, session_id: str) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT comparison_id, profile_id, profile_hash, source, run_id, model_id, created_at "
                "FROM model_runs WHERE session_id = ? ORDER BY created_at, source",
                (session_id,),
            ).fetchall()
        grouped: dict[str, dict[str, Any]] = {}
        for comparison_id, profile_id, profile_hash, source, run_id, model_id, created_at in rows:
            item = grouped.setdefault(comparison_id, {
                "comparison_id": comparison_id,
                "profile_id": profile_id,
                "profile_hash": profile_hash,
                "runs": {},
                "created_at": created_at,
            })
            item["runs"][source] = {"run_id": run_id, "model_id": model_id}
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
                    sources[source] = None if saved is None else {
                        "run_id": run_id,
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
