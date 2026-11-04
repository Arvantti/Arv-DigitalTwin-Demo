"""API independiente de optimización: acepta snapshots, nunca conversa con el PLC."""

from __future__ import annotations

import json
import os
import sqlite3
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import BackgroundTasks, FastAPI, HTTPException

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT))
from fractal.optimization.engine import JOB_CONTRACT_VERSION, OBJECTIVE_ID, optimize_job, profile_fingerprint  # noqa: E402

app = FastAPI(title="Fractal Optimization API", version="1.0.0")


def _database_path() -> Path:
    root = Path(os.environ.get("TWIN_DATA", Path.cwd() / ".twin-data"))
    root.mkdir(parents=True, exist_ok=True)
    return root / "fractal-optimization-jobs.sqlite3"


def _connect() -> sqlite3.Connection:
    connection = sqlite3.connect(_database_path(), timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute(
        """CREATE TABLE IF NOT EXISTS optimization_jobs (
        job_id TEXT PRIMARY KEY, status TEXT NOT NULL, request_json TEXT NOT NULL,
        result_json TEXT, error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"""
    )
    return connection


def _now() -> str:
    return datetime.now(UTC).isoformat()


def _job_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "contract_version": JOB_CONTRACT_VERSION,
        "job_id": row["job_id"],
        "status": row["status"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "result": json.loads(row["result_json"]) if row["result_json"] else None,
        "error": row["error"],
    }


def _set_status(job_id: str, status: str, *, result: dict[str, Any] | None = None, error: str | None = None) -> None:
    with _connect() as connection:
        connection.execute(
            "UPDATE optimization_jobs SET status = ?, result_json = ?, error = ?, updated_at = ? WHERE job_id = ?",
            (status, json.dumps(result, ensure_ascii=False) if result is not None else None, error, _now(), job_id),
        )


def _run_job(job_id: str) -> None:
    with _connect() as connection:
        row = connection.execute("SELECT request_json FROM optimization_jobs WHERE job_id = ?", (job_id,)).fetchone()
    if row is None:
        return
    _set_status(job_id, "running")
    try:
        request = json.loads(row["request_json"])
        result = optimize_job({**request, "job_id": job_id})
    except Exception as exc:  # Guardar el tipo, no rutas/configuración del proceso.
        _set_status(job_id, "failed", error=f"{type(exc).__name__}: {str(exc)[:240]}")
        return
    _set_status(job_id, "succeeded", result=result)


def _validate_request(payload: dict[str, Any]) -> None:
    if payload.get("contract_version") != JOB_CONTRACT_VERSION:
        raise HTTPException(422, f"contract_version debe ser {JOB_CONTRACT_VERSION}")
    if payload.get("kind") not in {"instant", "profile-horizon"}:
        raise HTTPException(422, "kind debe ser instant o profile-horizon")
    snapshot = payload.get("snapshot")
    if not isinstance(snapshot, dict) or not isinstance(snapshot.get("snapshot_id"), str):
        raise HTTPException(422, "snapshot.snapshot_id es obligatorio")
    if isinstance(snapshot.get("simulation_time_s"), bool) or not isinstance(snapshot.get("simulation_time_s"), (int, float)):
        raise HTTPException(422, "snapshot.simulation_time_s debe ser numérico")
    if not isinstance(snapshot.get("plc_tags"), dict):
        raise HTTPException(422, "snapshot.plc_tags debe ser un objeto")
    if payload.get("objective_id") != OBJECTIVE_ID:
        raise HTTPException(422, f"objective_id debe ser {OBJECTIVE_ID}")
    target = payload.get("target_pressure_mca")
    if isinstance(target, bool) or not isinstance(target, (int, float)) or not 10 <= target <= 45:
        raise HTTPException(422, "target_pressure_mca debe ser un valor seleccionado entre 10 y 45 mca")
    if payload["kind"] == "profile-horizon":
        profile = payload.get("profile")
        if not isinstance(profile, dict) or not isinstance(profile.get("id"), str) or not isinstance(profile.get("hours"), dict):
            raise HTTPException(422, "profile debe incluir id y hours del perfil guardado")
        if payload.get("profile_hash") != profile_fingerprint(profile):
            raise HTTPException(422, "profile_hash no coincide con el perfil enviado")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "process": "fractal-optimization", "mode": "snapshot-in/recommendation-out"}


@app.post("/v2/jobs", status_code=202)
def create_job(payload: dict[str, Any], background_tasks: BackgroundTasks) -> dict[str, Any]:
    _validate_request(payload)
    if os.getenv("FRACTAL_ENABLE_OPTIMIZATION", "1") != "1":
        raise HTTPException(409, "optimización deshabilitada por FRACTAL_ENABLE_OPTIMIZATION=0")
    job_id, now = f"OPT-{uuid4().hex[:16].upper()}", _now()
    with _connect() as connection:
        connection.execute(
            "INSERT INTO optimization_jobs (job_id,status,request_json,created_at,updated_at) VALUES (?, ?, ?, ?, ?)",
            (job_id, "queued", json.dumps(payload, ensure_ascii=False), now, now),
        )
    background_tasks.add_task(_run_job, job_id)
    return {"contract_version": JOB_CONTRACT_VERSION, "job_id": job_id, "status": "queued", "created_at": now}


@app.get("/v2/jobs/{job_id}")
def get_job(job_id: str) -> dict[str, Any]:
    with _connect() as connection:
        row = connection.execute("SELECT * FROM optimization_jobs WHERE job_id = ?", (job_id,)).fetchone()
    if row is None:
        raise HTTPException(404, "trabajo desconocido")
    return _job_row(row)
