"""Checkpoints de sesión para recuperar el runtime tras dormir/reiniciar el Container.

Los datos van a D1 en Cloudflare y a SQLite local durante desarrollo. El estado
hidráulico Python se comprime y se etiqueta con versión para rechazar snapshots
incompatibles en vez de reanudarlos silenciosamente.
"""

from __future__ import annotations

import os
import pickle
import zlib
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .d1_storage import connect

CHECKPOINT_VERSION = 2
MAX_CHECKPOINT_BYTES = 2_000_000


def _database_path() -> Path:
    root = Path(os.environ.get("TWIN_DATA", Path.cwd() / ".twin-data"))
    root.mkdir(parents=True, exist_ok=True)
    return root / "session-checkpoints.sqlite3"


class SessionCheckpointStore:
    def __init__(self) -> None:
        self.path = _database_path()
        with connect(self.path) as connection:
            connection.execute(
                "CREATE TABLE IF NOT EXISTS session_checkpoints ("
                "session_id TEXT PRIMARY KEY, plant_id TEXT NOT NULL, simulated_t REAL NOT NULL, "
                "schema_version INTEGER NOT NULL, payload BLOB NOT NULL, updated_at TEXT NOT NULL)"
            )

    def save(self, session: Any) -> None:
        state = {
            "session_id": session.id,
            "plant_id": session.plant_id,
            "plant": session.plant,
            "profile_id": session.profile_id,
            "profile": session.profile,
            "demo_client_id": session.demo_client_id,
            "demo_expires_at": session.demo_expires_at,
            "speed": session.speed,
            "paused": session.paused,
            "running": session.running,
            "created_at": session.created_at,
            "last_activity": session.last_activity,
            "applied_profile_hour": session.applied_profile_hour,
            "pending_profile": session.pending_profile,
            "budget": session.budget,
            "sent_events": session.sent_events,
            "last_sample_t": session.last_sample_t,
            "last_checkpoint_t": session.last_checkpoint_t,
            "recommendations": session.recommendations,
        }
        payload = zlib.compress(pickle.dumps(state, protocol=pickle.HIGHEST_PROTOCOL), level=6)
        if len(payload) > MAX_CHECKPOINT_BYTES:
            raise ValueError(f"checkpoint de sesión excede {MAX_CHECKPOINT_BYTES} bytes")
        with connect(self.path) as connection:
            connection.execute(
                "INSERT OR REPLACE INTO session_checkpoints "
                "(session_id, plant_id, simulated_t, schema_version, payload, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
                (
                    session.id,
                    session.plant_id,
                    float(session.plant.t),
                    CHECKPOINT_VERSION,
                    payload,
                    datetime.now(UTC).isoformat(),
                ),
            )

    def load(self, plant_id: str, session_id: str) -> dict[str, Any] | None:
        with connect(self.path) as connection:
            row = connection.execute(
                "SELECT schema_version, payload FROM session_checkpoints WHERE plant_id = ? AND session_id = ?",
                (plant_id, session_id),
            ).fetchone()
        if row is None:
            return None
        version, payload = row
        if version != CHECKPOINT_VERSION or not isinstance(payload, (bytes, bytearray, memoryview)):
            raise ValueError("checkpoint de sesión incompatible o corrupto")
        if len(payload) > MAX_CHECKPOINT_BYTES:
            raise ValueError("checkpoint de sesión excede el límite de lectura")
        decompressor = zlib.decompressobj()
        decoded = decompressor.decompress(bytes(payload), 20_000_001)
        if len(decoded) > 20_000_000 or decompressor.unconsumed_tail:
            raise ValueError("checkpoint de sesión descomprimido excede el límite")
        state = pickle.loads(decoded)
        if not isinstance(state, dict) or state.get("session_id") != session_id or state.get("plant_id") != plant_id:
            raise ValueError("checkpoint no corresponde a la sesión solicitada")
        return state


checkpoints = SessionCheckpointStore()
