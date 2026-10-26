"""Bitácora persistente de acciones relevantes del servicio."""

from __future__ import annotations

import json
import os
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from .d1_storage import connect


def _database_path() -> Path:
    root = Path(os.environ.get("TWIN_DATA", Path.cwd() / ".twin-data"))
    root.mkdir(parents=True, exist_ok=True)
    return root / "audit.sqlite3"


class AuditStore:
    def __init__(self, path: str | Path | None = None) -> None:
        self.path = Path(path) if path is not None else _database_path()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with connect(self.path) as connection:
            connection.execute(
                "CREATE TABLE IF NOT EXISTS audit_events ("
                "event_id TEXT PRIMARY KEY, service_id TEXT NOT NULL, plant_id TEXT NOT NULL, "
                "session_id TEXT, actor_id TEXT NOT NULL, action TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL)"
            )

    def record(
        self,
        plant_id: str,
        action: str,
        *,
        session_id: str | None = None,
        actor_id: str = "operator",
        details: dict[str, Any] | None = None,
    ) -> str:
        event_id = str(uuid4())
        with connect(self.path) as connection:
            connection.execute(
                "INSERT INTO audit_events VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    event_id,
                    os.environ.get("TWIN_SERVICE_ID", "local"),
                    plant_id,
                    session_id,
                    actor_id,
                    action,
                    json.dumps(details or {}, separators=(",", ":"), sort_keys=True),
                    datetime.now(UTC).isoformat(),
                ),
            )
        return event_id

    def list(self, plant_id: str, *, limit: int = 100) -> list[dict[str, Any]]:
        with connect(self.path) as connection:
            rows = connection.execute(
                "SELECT event_id, service_id, plant_id, session_id, actor_id, action, payload, created_at "
                "FROM audit_events WHERE plant_id = ? ORDER BY created_at DESC LIMIT ?",
                (plant_id, min(max(limit, 1), 1000)),
            ).fetchall()
        return [
            {
                "event_id": event_id,
                "service_id": service_id,
                "plant_id": row_plant_id,
                "session_id": session_id,
                "actor_id": actor_id,
                "action": action,
                "details": json.loads(payload),
                "created_at": created_at,
            }
            for event_id, service_id, row_plant_id, session_id, actor_id, action, payload, created_at in rows
        ]


audit = AuditStore()
