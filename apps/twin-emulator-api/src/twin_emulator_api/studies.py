"""Persistencia de estudios Fractal y frames futuros por sesión."""

from __future__ import annotations

import json
from typing import Any

from .historian import historian


class StudyStore:
    def __init__(self) -> None:
        with historian._connect() as conn:
            conn.execute(
                "CREATE TABLE IF NOT EXISTS fractal_studies ("
                "session_id TEXT, study_id TEXT, t REAL, payload TEXT, "
                "PRIMARY KEY(session_id, study_id))"
            )

    def save(self, session_id: str, study_id: str, t: float, payload: dict[str, Any]) -> None:
        with historian._connect() as conn:
            conn.execute("INSERT OR REPLACE INTO fractal_studies VALUES (?, ?, ?, ?)", (session_id, study_id, t, json.dumps(payload)))

    def list(self, session_id: str) -> list[dict[str, Any]]:
        with historian._connect() as conn:
            rows = conn.execute("SELECT payload FROM fractal_studies WHERE session_id=? ORDER BY t DESC", (session_id,)).fetchall()
        return [json.loads(row[0]) for row in rows]

    def get(self, session_id: str, study_id: str) -> dict[str, Any] | None:
        with historian._connect() as conn:
            row = conn.execute("SELECT payload FROM fractal_studies WHERE session_id=? AND study_id=?", (session_id, study_id)).fetchone()
        return json.loads(row[0]) if row else None

    def update(self, session_id: str, study_id: str, t: float, payload: dict[str, Any]) -> None:
        self.save(session_id, study_id, t, payload)


studies = StudyStore()
