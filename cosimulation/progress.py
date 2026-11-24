"""Small bounded progress ledger: no PLC data, credentials or model results."""
from __future__ import annotations

import json
import os
import sqlite3
import time
from pathlib import Path
from typing import Any


def _connect() -> sqlite3.Connection:
    root = Path(os.getenv("TWIN_DATA", ".twin-data"))
    root.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(root / "calculation-progress.sqlite3", timeout=10)
    connection.execute("CREATE TABLE IF NOT EXISTS progress (id TEXT PRIMARY KEY, updated REAL, data TEXT)")
    return connection


def put(key: str, data: dict[str, Any]) -> None:
    with _connect() as connection:
        connection.execute("DELETE FROM progress WHERE updated < ?", (time.time() - 3600,))
        connection.execute("INSERT OR REPLACE INTO progress VALUES (?, ?, ?)", (key, time.time(), json.dumps(data)))


def get(key: str) -> dict[str, Any] | None:
    with _connect() as connection:
        row = connection.execute("SELECT data FROM progress WHERE id=? AND updated>=?", (key, time.time() - 3600)).fetchone()
    return json.loads(row[0]) if row else None


def hourly(key: str, phase: str, total: int, *, offset: int = 0, work_total: int | None = None):
    def report(frame: dict[str, Any]) -> None:
        done = int(frame["hour"]) + 1
        put(key, {"status": "running", "phase": phase, "completed_hours": done, "total_hours": total,
                  "simulation_time_s": frame["end_t_s"], "percent": min(99, 100 * (offset + done) / (work_total or total))})
    return report
