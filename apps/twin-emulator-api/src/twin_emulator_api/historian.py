"""Historian SQLite compartido por sesión simulada."""

from __future__ import annotations

import json
import os
import sqlite3
from pathlib import Path
from typing import Any


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
            conn.execute(
                "CREATE TABLE IF NOT EXISTS recommendations ("
                "session_id TEXT, recommendation_id TEXT, t REAL, payload TEXT, "
                "PRIMARY KEY(session_id, recommendation_id))"
            )

    def _connect(self) -> sqlite3.Connection:
        return sqlite3.connect(self.path)

    def sample(self, session_id: str, t: float, payload: dict[str, Any]) -> None:
        with self._connect() as conn:
            conn.execute("INSERT OR REPLACE INTO samples VALUES (?, ?, ?)", (session_id, t, json.dumps(payload)))

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
