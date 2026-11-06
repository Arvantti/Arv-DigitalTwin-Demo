"""Adaptador horario del solver hidráulico existente al contrato de modelo v2.

Esta implementación resuelve estados horarios cuasiestacionarios con el solver
Fractal existente. No representa transitorios ni constituye validación física.
"""

from __future__ import annotations

import math
from typing import Any

from cosimulation.runner import MODEL_REQUEST_CONTRACT_VERSION, MODEL_RESULT_CONTRACT_VERSION, profile_fingerprint

MODEL_ID = "fractal/water-network-scale-v1/quasi-steady-hourly-assumed"
QUALITY = "assumed_quasi_steady_hourly_not_transient_validated"


def project(request: dict[str, Any]) -> dict[str, Any]:
    """Adapta el solver horario existente; solo acepta su rejilla soportada de 1 h/≤24 h."""
    if request.get("contract_version") != MODEL_REQUEST_CONTRACT_VERSION:
        raise ValueError("contrato de solicitud de modelo incompatible")
    profile = request.get("profile")
    snapshot = request.get("initial_snapshot")
    if not isinstance(profile, dict) or not isinstance(profile.get("hours"), dict):
        raise ValueError("profile debe incluir hours")
    expected_hash = profile_fingerprint(profile)
    if request.get("profile_hash") != expected_hash:
        raise ValueError("profile_hash no coincide con el perfil recibido")
    if not isinstance(snapshot, dict) or not isinstance(snapshot.get("plc_tags"), dict):
        raise ValueError("initial_snapshot debe contener plc_tags")
    now = snapshot.get("simulation_time_s")
    if isinstance(now, bool) or not isinstance(now, (int, float)) or not math.isfinite(now):
        raise ValueError("simulation_time_s debe ser finito")
    step, horizon = request.get("time_step_s"), request.get("horizon_s")
    if step != 3600 or isinstance(horizon, bool) or not isinstance(horizon, (int, float)) or not 3600 <= horizon <= 86400:
        raise ValueError("este adaptador solo soporta paso 1 h y horizonte 1–24 h")
    hours = horizon / 3600
    forecast_times = request.get("forecast_times_s")
    if (
        not isinstance(forecast_times, list)
        or len(forecast_times) != int(hours)
        or any(isinstance(at, bool) or not isinstance(at, (int, float)) or not math.isfinite(at) for at in forecast_times)
        or any(float(a) >= float(b) for a, b in zip(forecast_times, forecast_times[1:], strict=False))
    ):
        raise ValueError("forecast_times_s debe declarar la rejilla horaria exacta")
    history = request.get("history_frames")
    if not isinstance(history, list):
        raise ValueError("history_frames debe ser una lista")

    # Import local: el proceso de ingeniería no se convierte en una dependencia
    # del servicio de cosimulación salvo que este adaptador se elija explícitamente.
    from fractal.hydraulics.runtime.mpc import project_24h

    projected = project_24h(
        snapshot["plc_tags"],
        profile,
        study_type="baseline",
        horizon_hours=int(hours),
    )
    forecast_frames: list[dict[str, Any]] = []
    for expected_time, frame in zip(forecast_times, projected, strict=True):
        at = frame.get("end_t_s")
        if not isinstance(at, (int, float)) or not math.isclose(float(at), float(expected_time), abs_tol=1e-6):
            raise ValueError("el solver horario produjo tiempos distintos a la rejilla congelada")
        forecast_frames.append({
            "simulation_time_s": float(at),
            "temporal_context": "forecast",
            "state": {
                "snapshot": frame["snapshot"],
                "plc_tags": frame["plc_tags"],
                "quality": QUALITY,
                "profile_hour": frame["profile_hour"],
                "applied": False,
            },
        })
    frames = [
        {
            "simulation_time_s": float(frame["simulation_time_s"]),
            "temporal_context": "history",
            "state": {"plc_tags": frame["plc_tags"], "quality": "observed_plc_history"},
        }
        for frame in history
    ]
    frames.extend([
        {
            "simulation_time_s": float(now),
            "temporal_context": "present",
            "state": {
                "snapshot_id": snapshot["snapshot_id"],
                "plc_tags": snapshot["plc_tags"],
                "quality": "observed_plc_snapshot",
            },
        },
        *forecast_frames,
    ])
    return {
        "contract_version": MODEL_RESULT_CONTRACT_VERSION,
        "model_id": MODEL_ID,
        "profile_hash": expected_hash,
        "quality": QUALITY,
        "frames": frames,
    }
