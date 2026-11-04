"""API independiente para ejecutar trabajos sobre un único modelo cosimulado."""

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
from cosimulation.runner import JOB_CONTRACT_VERSION, profile_fingerprint, run_trajectory  # noqa: E402

app = FastAPI(title="Cosimulation Engine API", version="2.0.0")


def _database_path() -> Path:
    root = Path(os.environ.get("TWIN_DATA", Path.cwd() / ".twin-data"))
    root.mkdir(parents=True, exist_ok=True)
    return root / "cosimulation-jobs.sqlite3"


def _connect() -> sqlite3.Connection:
    connection = sqlite3.connect(_database_path(), timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute(
        """CREATE TABLE IF NOT EXISTS cosimulation_jobs (
        job_id TEXT PRIMARY KEY, status TEXT NOT NULL, request_json TEXT NOT NULL,
        result_json TEXT, error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"""
    )
    return connection


def _now() -> str:
    return datetime.now(UTC).isoformat()


def _update(job_id: str, status: str, *, result: dict[str, Any] | None = None, error: str | None = None) -> None:
    with _connect() as connection:
        connection.execute(
            "UPDATE cosimulation_jobs SET status=?, result_json=?, error=?, updated_at=? WHERE job_id=?",
            (status, json.dumps(result, ensure_ascii=False) if result is not None else None, error, _now(), job_id),
        )


def _run_job(job_id: str) -> None:
    with _connect() as connection:
        row = connection.execute("SELECT request_json FROM cosimulation_jobs WHERE job_id=?", (job_id,)).fetchone()
    if row is None:
        return
    model_endpoint = os.getenv("COSIMULATION_MODEL_URL", "").rstrip("/")
    if not model_endpoint:
        _update(job_id, "blocked", error="falta COSIMULATION_MODEL_URL para el único modelo cosimulado")
        return
    _update(job_id, "running")
    try:
        result = run_trajectory(job_id, json.loads(row["request_json"]), model_endpoint)
    except Exception as exc:  # La respuesta pública no incluye configuración del proceso.
        _update(job_id, "failed", error=f"{type(exc).__name__}: {str(exc)[:240]}")
        return
    _update(job_id, "succeeded", result=result)


def _validate(payload: dict[str, Any]) -> None:
    if payload.get("contract_version") != JOB_CONTRACT_VERSION:
        raise HTTPException(422, f"contract_version debe ser {JOB_CONTRACT_VERSION}")
    for field in ("plant_id", "session_id"):
        if not isinstance(payload.get(field), str) or not payload[field]:
            raise HTTPException(422, f"{field} es obligatorio")
    snapshot = payload.get("initial_snapshot")
    if not isinstance(snapshot, dict) or not isinstance(snapshot.get("snapshot_id"), str) or not snapshot["snapshot_id"]:
        raise HTTPException(422, "initial_snapshot.snapshot_id es obligatorio")
    now = snapshot.get("simulation_time_s")
    if isinstance(now, bool) or not isinstance(now, (int, float)) or now < 0:
        raise HTTPException(422, "initial_snapshot.simulation_time_s debe ser no negativo")
    if not isinstance(snapshot.get("plc_tags"), dict):
        raise HTTPException(422, "initial_snapshot.plc_tags debe ser un objeto")
    profile = payload.get("profile")
    if not isinstance(profile, dict) or not isinstance(profile.get("hours"), dict) or not isinstance(profile.get("id"), str):
        raise HTTPException(422, "profile debe incluir id y hours del perfil guardado")
    profile_hash = payload.get("profile_hash")
    if not isinstance(profile_hash, str) or profile_hash != profile_fingerprint(profile):
        raise HTTPException(422, "profile_hash no coincide con el perfil enviado")
    history = payload.get("history_frames")
    if not isinstance(history, list):
        raise HTTPException(422, "history_frames debe ser una lista, aunque esté vacía")
    previous = -1.0
    for index, frame in enumerate(history):
        if not isinstance(frame, dict):
            raise HTTPException(422, f"history_frames[{index}] debe ser un objeto")
        at = frame.get("simulation_time_s")
        if isinstance(at, bool) or not isinstance(at, (int, float)) or at < 0 or at >= now or at <= previous:
            raise HTTPException(422, "history_frames debe estar ordenado antes del presente, sin tiempos duplicados")
        if not isinstance(frame.get("plc_tags"), dict):
            raise HTTPException(422, f"history_frames[{index}].plc_tags debe ser un objeto")
        previous = float(at)
    for field in ("time_step_s", "horizon_s"):
        value = payload.get(field)
        if isinstance(value, bool) or not isinstance(value, (int, float)) or value <= 0:
            raise HTTPException(422, f"{field} debe ser positivo")
    ticks = payload["horizon_s"] / payload["time_step_s"]
    if ticks < 1 or ticks > 10_000 or abs(round(ticks) - ticks) > 1e-8:
        raise HTTPException(422, "horizon_s debe ser múltiplo de time_step_s y generar entre 1 y 10000 ticks")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "process": "cosimulation-engine", "mode": "single-model-timeline"}


@app.post("/v2/jobs", status_code=202)
def create_job(payload: dict[str, Any], background_tasks: BackgroundTasks) -> dict[str, Any]:
    _validate(payload)
    job_id, now = f"COSIM-{uuid4().hex[:16].upper()}", _now()
    with _connect() as connection:
        connection.execute(
            "INSERT INTO cosimulation_jobs (job_id,status,request_json,created_at,updated_at) VALUES (?, ?, ?, ?, ?)",
            (job_id, "queued", json.dumps(payload, ensure_ascii=False), now, now),
        )
    background_tasks.add_task(_run_job, job_id)
    return {"contract_version": JOB_CONTRACT_VERSION, "job_id": job_id, "status": "queued", "created_at": now}


@app.get("/v2/jobs/{job_id}")
def get_job(job_id: str) -> dict[str, Any]:
    with _connect() as connection:
        row = connection.execute("SELECT * FROM cosimulation_jobs WHERE job_id=?", (job_id,)).fetchone()
    if row is None:
        raise HTTPException(404, "trabajo desconocido")
    return {
        "contract_version": JOB_CONTRACT_VERSION,
        "job_id": row["job_id"],
        "status": row["status"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "result": json.loads(row["result_json"]) if row["result_json"] else None,
        "error": row["error"],
    }
