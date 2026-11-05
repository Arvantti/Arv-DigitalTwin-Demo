"""Ejecución de un único modelo de cosimulación mediante contrato HTTP v2."""

from __future__ import annotations

import hashlib
import json
from typing import Any
from urllib.request import Request, urlopen

JOB_CONTRACT_VERSION = "cosimulation-job.v2"
MODEL_REQUEST_CONTRACT_VERSION = "cosimulation-model-request.v2"
MODEL_RESULT_CONTRACT_VERSION = "cosimulation-model-result.v2"
RESULT_CONTRACT_VERSION = "cosimulation-result.v2"
MAX_TICKS = 10_000


def profile_fingerprint(profile: dict[str, Any]) -> str:
    """Hash canónico para comprobar que todos los motores usan el mismo perfil."""
    canonical = json.dumps(profile, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _project(endpoint: str, payload: dict[str, Any]) -> dict[str, Any]:
    request = Request(
        f"{endpoint.rstrip('/')}/v2/project",
        data=json.dumps(payload, ensure_ascii=False, allow_nan=False).encode(),
        headers={"content-type": "application/json"},
        method="POST",
    )
    with urlopen(request, timeout=120) as response:  # noqa: S310 — endpoint proviene de configuración del proceso
        result = json.load(response)
    if not isinstance(result, dict) or result.get("contract_version") != MODEL_RESULT_CONTRACT_VERSION:
        raise ValueError("modelo cosimulado devolvió un contrato incompatible")
    if result.get("profile_hash") != payload["profile_hash"]:
        raise ValueError("modelo cosimulado devolvió un perfil distinto al recibido")
    if not isinstance(result.get("model_id"), str) or not result["model_id"].strip():
        raise ValueError("el resultado debe identificar el modelo cosimulado")
    if not isinstance(result.get("quality"), str) or not result["quality"].strip():
        raise ValueError("el modelo debe declarar la calidad y límites de su resultado")
    frames = result.get("frames")
    if not isinstance(frames, list) or not frames:
        raise ValueError("el modelo cosimulado debe devolver frames")
    return result


def _validate_model_frames(model_result: dict[str, Any], request: dict[str, Any]) -> list[dict[str, Any]]:
    snapshot = request["initial_snapshot"]
    now = float(snapshot["simulation_time_s"])
    end = now + float(request["horizon_s"])
    forecast_times = [float(at) for at in request["forecast_times_s"]]
    frames = model_result["frames"]
    normalized: list[dict[str, Any]] = []
    previous = -1.0
    has_present = False
    has_forecast = False
    has_history = False
    for raw in frames:
        if not isinstance(raw, dict):
            raise ValueError("cada frame del modelo debe ser un objeto")
        at = raw.get("simulation_time_s")
        context = raw.get("temporal_context")
        state = raw.get("state")
        if isinstance(at, bool) or not isinstance(at, (int, float)) or not 0 <= at <= end:
            raise ValueError("frame del modelo fuera del horizonte solicitado")
        at = float(at)
        if at <= previous:
            raise ValueError("los frames del modelo deben estar ordenados y sin tiempos duplicados")
        if not isinstance(state, dict):
            raise ValueError("cada frame del modelo debe incluir state")
        if context not in {"history", "present", "forecast"}:
            raise ValueError("temporal_context debe ser history, present o forecast")
        if context == "history":
            if at >= now:
                raise ValueError("un frame history debe preceder al tiempo actual")
            has_history = True
        elif context == "present":
            if abs(at - now) > 1e-6:
                raise ValueError("el frame present debe coincidir con simulation_time_s del snapshot")
            has_present = True
        else:
            if at <= now or at > end:
                raise ValueError("un frame forecast debe estar después del presente y dentro del horizonte")
            if not any(abs(at - expected) <= 1e-6 for expected in forecast_times):
                raise ValueError("el frame forecast no pertenece a la rejilla temporal del manifiesto")
            has_forecast = True
        normalized.append({"simulation_time_s": at, "temporal_context": context, "state": state})
        previous = at
    if not has_present:
        raise ValueError("la trayectoria debe incluir el frame present")
    if not has_forecast:
        raise ValueError("la trayectoria debe incluir al menos un frame forecast")
    if request.get("history_frames") and not has_history:
        raise ValueError("el modelo recibió historial PLC pero no devolvió frames history")
    return normalized


def run_trajectory(job_id: str, request: dict[str, Any], model_endpoint: str) -> dict[str, Any]:
    """Pide una trayectoria completa a un modelo, sin participantes ni acople cruzado."""
    profile = request["profile"]
    expected_hash = profile_fingerprint(profile)
    if expected_hash != request["profile_hash"]:
        raise ValueError("profile_hash no coincide con el perfil inmutable de la solicitud")
    model_request = {
        "contract_version": MODEL_REQUEST_CONTRACT_VERSION,
        "job_id": job_id,
        "session_id": request["session_id"],
        "plant_id": request["plant_id"],
        "profile_id": profile.get("id"),
        "profile_hash": expected_hash,
        "profile": profile,
        "initial_snapshot": request["initial_snapshot"],
        "history_frames": request["history_frames"],
        "time_step_s": request["time_step_s"],
        "horizon_s": request["horizon_s"],
        "forecast_times_s": request["forecast_times_s"],
    }
    model_result = _project(model_endpoint, model_request)
    if model_result.get("profile_hash") != expected_hash:
        raise ValueError("modelo cosimulado devolvió un perfil distinto al recibido")
    frames = _validate_model_frames(model_result, request)
    return {
        "contract_version": RESULT_CONTRACT_VERSION,
        "job_id": job_id,
        "session_id": request["session_id"],
        "snapshot_id": request["initial_snapshot"]["snapshot_id"],
        "profile_id": profile.get("id"),
        "profile_hash": expected_hash,
        "model_id": model_result["model_id"],
        "model_quality": model_result["quality"],
        "time_origin_s": float(request["initial_snapshot"]["simulation_time_s"]),
        "time_step_s": float(request["time_step_s"]),
        "horizon_s": float(request["horizon_s"]),
        "forecast_times_s": request["forecast_times_s"],
        "source": "cosimulation",
        "applied_to_plc": False,
        "frames": frames,
    }
