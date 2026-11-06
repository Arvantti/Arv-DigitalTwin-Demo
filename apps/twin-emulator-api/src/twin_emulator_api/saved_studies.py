"""Biblioteca durable de estudios, separada del ciclo de vida de sesiones PLC."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from .historian import historian

MAX_STUDIES_PER_OWNER = 50
MAX_VERSIONS_PER_STUDY = 50
MAX_STUDY_BYTES = 950_000
MAX_LIBRARY_BYTES = 50_000_000


class SavedStudyStore:
    def __init__(self) -> None:
        with historian._connect() as conn:
            conn.execute(
                "CREATE TABLE IF NOT EXISTS saved_studies ("
                "id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, plant_id TEXT NOT NULL, "
                "name TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"
            )
            conn.execute(
                "CREATE TABLE IF NOT EXISTS saved_study_versions ("
                "study_id TEXT NOT NULL, version INTEGER NOT NULL, source_session_id TEXT NOT NULL, "
                "source_study_id TEXT NOT NULL, created_at TEXT NOT NULL, payload TEXT NOT NULL, "
                "payload_size INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(study_id, version))"
            )
            columns = {row[1] for row in conn.execute("PRAGMA table_info(saved_study_versions)").fetchall()}
            if "payload_size" not in columns:
                conn.execute("ALTER TABLE saved_study_versions ADD COLUMN payload_size INTEGER NOT NULL DEFAULT 0")
            conn.execute("UPDATE saved_study_versions SET payload_size = length(payload) WHERE payload_size = 0")
            conn.execute(
                "CREATE INDEX IF NOT EXISTS saved_studies_by_owner "
                "ON saved_studies(owner_id, plant_id, updated_at DESC)"
            )
            conn.execute(
                "CREATE TRIGGER IF NOT EXISTS delete_saved_study_versions "
                "AFTER DELETE ON saved_studies BEGIN "
                "DELETE FROM saved_study_versions WHERE study_id = OLD.id; END"
            )

    @staticmethod
    def _json(payload: dict[str, Any]) -> str:
        return json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)

    def create(
        self,
        owner_id: str,
        plant_id: str,
        name: str,
        source_session_id: str,
        source_study_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        study_id = f"SAVED-{uuid4().hex[:16].upper()}"
        now = datetime.now(UTC).isoformat()
        serialized = self._json(payload)
        size = len(serialized.encode("utf-8"))
        if size > MAX_STUDY_BYTES:
            raise ValueError("El resultado excede el límite de bytes por estudio")
        with historian._connect() as conn:
            count, stored_bytes = conn.execute(
                "SELECT COUNT(DISTINCT s.id), COALESCE(SUM(v.payload_size), 0) FROM saved_studies s "
                "LEFT JOIN saved_study_versions v ON v.study_id = s.id WHERE s.owner_id = ? AND s.plant_id = ?",
                (owner_id, plant_id),
            ).fetchone()
            if int(count) >= MAX_STUDIES_PER_OWNER:
                raise ValueError("Se alcanzó el límite de estudios guardados para este navegador")
            if int(stored_bytes) + size > MAX_LIBRARY_BYTES:
                raise ValueError("Se alcanzó la cuota total de la biblioteca")
            conn.execute(
                "INSERT INTO saved_studies VALUES (?, ?, ?, ?, ?, ?)",
                (study_id, owner_id, plant_id, name, now, now),
            )
            conn.execute(
                "INSERT INTO saved_study_versions VALUES (?, 1, ?, ?, ?, ?, ?)",
                (study_id, source_session_id, source_study_id, now, serialized, size),
            )
        return self.summary(owner_id, plant_id, study_id) or {}

    def summary(self, owner_id: str, plant_id: str, study_id: str) -> dict[str, Any] | None:
        with historian._connect() as conn:
            row = conn.execute(
                "SELECT s.id, s.name, s.created_at, s.updated_at, COUNT(v.version), MAX(v.version) "
                "FROM saved_studies s LEFT JOIN saved_study_versions v ON v.study_id = s.id "
                "WHERE s.owner_id = ? AND s.plant_id = ? AND s.id = ? GROUP BY s.id",
                (owner_id, plant_id, study_id),
            ).fetchone()
        if row is None:
            return None
        return {
            "id": row[0], "name": row[1], "created_at": row[2], "updated_at": row[3],
            "version_count": row[4], "latest_version": row[5],
        }

    def list(self, owner_id: str, plant_id: str) -> list[dict[str, Any]]:
        with historian._connect() as conn:
            rows = conn.execute(
                "SELECT s.id, s.name, s.created_at, s.updated_at, COUNT(v.version), MAX(v.version) "
                "FROM saved_studies s JOIN saved_study_versions v ON v.study_id = s.id "
                "WHERE s.owner_id = ? AND s.plant_id = ? GROUP BY s.id ORDER BY s.updated_at DESC",
                (owner_id, plant_id),
            ).fetchall()
        return [
            {"id": row[0], "name": row[1], "created_at": row[2], "updated_at": row[3], "version_count": row[4], "latest_version": row[5]}
            for row in rows
        ]

    def get(self, owner_id: str, plant_id: str, study_id: str) -> dict[str, Any] | None:
        with historian._connect() as conn:
            study = conn.execute(
                "SELECT id, name, created_at, updated_at FROM saved_studies "
                "WHERE owner_id = ? AND plant_id = ? AND id = ?",
                (owner_id, plant_id, study_id),
            ).fetchone()
            if study is None:
                return None
            rows = conn.execute(
                "SELECT version, source_session_id, source_study_id, created_at, "
                "json_extract(payload, '$.study_type'), json_extract(payload, '$.profile_id'), "
                "json_extract(payload, '$.base_time') FROM saved_study_versions "
                "WHERE study_id = ? ORDER BY version",
                (study_id,),
            ).fetchall()
        return {
            "id": study[0], "name": study[1], "created_at": study[2], "updated_at": study[3],
            "versions": [
                {
                    "version": row[0], "source_session_id": row[1], "source_study_id": row[2],
                    "created_at": row[3], "study_type": row[4], "profile_id": row[5], "base_time": row[6],
                }
                for row in rows
            ],
        }

    def get_version(self, owner_id: str, plant_id: str, study_id: str, version: int) -> dict[str, Any] | None:
        with historian._connect() as conn:
            row = conn.execute(
                "SELECT v.version, v.source_session_id, v.source_study_id, v.created_at, v.payload "
                "FROM saved_study_versions v JOIN saved_studies s ON s.id = v.study_id "
                "WHERE s.owner_id = ? AND s.plant_id = ? AND s.id = ? AND v.version = ?",
                (owner_id, plant_id, study_id, version),
            ).fetchone()
        if row is None:
            return None
        return {
            "version": row[0], "source_session_id": row[1], "source_study_id": row[2],
            "created_at": row[3], "result": json.loads(row[4]),
        }

    def add_version(
        self,
        owner_id: str,
        plant_id: str,
        study_id: str,
        source_session_id: str,
        source_study_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any] | None:
        now = datetime.now(UTC).isoformat()
        serialized = self._json(payload)
        size = len(serialized.encode("utf-8"))
        if size > MAX_STUDY_BYTES:
            raise ValueError("El resultado excede el límite de bytes por estudio")
        with historian._connect() as conn:
            inserted = conn.execute(
                "INSERT INTO saved_study_versions "
                "(study_id, version, source_session_id, source_study_id, created_at, payload, payload_size) "
                "SELECT ?, (SELECT COALESCE(MAX(version), 0) + 1 FROM saved_study_versions WHERE study_id = ?), "
                "?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM saved_studies WHERE owner_id = ? AND plant_id = ? AND id = ?) "
                "AND (SELECT COUNT(*) FROM saved_study_versions WHERE study_id = ?) < ? "
                "AND COALESCE((SELECT SUM(v.payload_size) FROM saved_study_versions v "
                "JOIN saved_studies s ON s.id = v.study_id WHERE s.owner_id = ? AND s.plant_id = ?), 0) + ? <= ?",
                (study_id, study_id, source_session_id, source_study_id, now, serialized, size,
                 owner_id, plant_id, study_id, study_id, MAX_VERSIONS_PER_STUDY,
                 owner_id, plant_id, size, MAX_LIBRARY_BYTES),
            )
            if inserted.rowcount == 0:
                owned = conn.execute(
                    "SELECT 1 FROM saved_studies WHERE owner_id = ? AND plant_id = ? AND id = ?",
                    (owner_id, plant_id, study_id),
                ).fetchone()
                if owned is None:
                    return None
                versions_count = conn.execute(
                    "SELECT COUNT(*) FROM saved_study_versions WHERE study_id = ?", (study_id,)
                ).fetchone()[0]
                if int(versions_count) >= MAX_VERSIONS_PER_STUDY:
                    raise ValueError("Se alcanzó el límite de versiones para este estudio")
                stored_bytes = conn.execute(
                    "SELECT COALESCE(SUM(v.payload_size), 0) FROM saved_study_versions v "
                    "JOIN saved_studies s ON s.id = v.study_id WHERE s.owner_id = ? AND s.plant_id = ?",
                    (owner_id, plant_id),
                ).fetchone()[0]
                if int(stored_bytes) + size > MAX_LIBRARY_BYTES:
                    raise ValueError("Se alcanzó la cuota total de la biblioteca")
                raise ValueError("No se pudo agregar la versión; vuelva a intentarlo")
            conn.execute("UPDATE saved_studies SET updated_at = ? WHERE id = ?", (now, study_id))
        return self.summary(owner_id, plant_id, study_id)

    def rename(self, owner_id: str, plant_id: str, study_id: str, name: str) -> dict[str, Any] | None:
        now = datetime.now(UTC).isoformat()
        with historian._connect() as conn:
            cursor = conn.execute(
                "UPDATE saved_studies SET name = ?, updated_at = ? WHERE owner_id = ? AND plant_id = ? AND id = ?",
                (name, now, owner_id, plant_id, study_id),
            )
            if cursor.rowcount == 0:
                return None
        return self.summary(owner_id, plant_id, study_id)

    def delete(self, owner_id: str, plant_id: str, study_id: str) -> bool:
        with historian._connect() as conn:
            owned = conn.execute(
                "SELECT 1 FROM saved_studies WHERE owner_id = ? AND plant_id = ? AND id = ?",
                (owner_id, plant_id, study_id),
            ).fetchone()
            if owned is None:
                return False
            conn.execute("DELETE FROM saved_studies WHERE id = ?", (study_id,))
        return True


saved_studies = SavedStudyStore()
