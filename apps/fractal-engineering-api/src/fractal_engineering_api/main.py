"""API Fractal: recomendaciones simuladas, sin escritura hacia PLC ni emulador."""

from __future__ import annotations

import hashlib
import json
import os
import sys
import time
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request as UrlRequest
from urllib.request import urlopen
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT))
from fractal.hydraulics.runtime.mpc import project_24h  # noqa: E402

SUPPORTED_OBJECTIVE_ID = "OBJ-PRESSURE-MIN"

app = FastAPI(title="Fractal Engineering API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["GET", "POST"],
    allow_headers=["content-type"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "mode": "simulated-read-only"}


def optimization_enabled() -> bool:
    return os.getenv("FRACTAL_ENABLE_OPTIMIZATION", "1") == "1"


def submit_optimization_job(payload: dict[str, Any]) -> dict[str, Any]:
    """Cruza el límite de proceso por contrato HTTP; no importa el motor optimizador."""
    origin = os.getenv("FRACTAL_OPTIMIZATION_API_URL", "http://127.0.0.1:8200").rstrip("/")
    request = UrlRequest(
        f"{origin}/v2/jobs",
        data=json.dumps(payload).encode(),
        headers={"content-type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=10) as response:  # noqa: S310 — origen configurado por despliegue
            accepted = json.load(response)
        job_id = accepted.get("job_id")
        if accepted.get("status") != "queued" or not isinstance(job_id, str):
            raise HTTPException(502, "el servicio de optimización devolvió una aceptación inválida")
        deadline = time.monotonic() + float(os.getenv("FRACTAL_OPTIMIZATION_JOB_TIMEOUT_S", "180"))
        while time.monotonic() < deadline:
            with urlopen(f"{origin}/v2/jobs/{job_id}", timeout=10) as response:  # noqa: S310
                job = json.load(response)
            if job.get("status") == "succeeded" and isinstance(job.get("result"), dict):
                return {"job_id": job_id, **job["result"]}
            if job.get("status") in {"failed", "blocked"}:
                raise HTTPException(502, f"trabajo de optimización {job.get('status')}: {job.get('error') or 'sin detalle'}")
            time.sleep(0.1)
        raise HTTPException(504, "el trabajo de optimización excedió el tiempo de espera")
    except HTTPException:
        raise
    except (HTTPError, URLError, TimeoutError, ValueError, KeyError) as exc:
        raise HTTPException(503, f"no se pudo completar el trabajo en Fractal Optimization API ({type(exc).__name__})") from exc


def validate_objective(objective_id: str) -> None:
    if objective_id != SUPPORTED_OBJECTIVE_ID:
        raise HTTPException(422, f"solo está disponible el objetivo {SUPPORTED_OBJECTIVE_ID}")


def profile_fingerprint(profile: dict[str, Any]) -> str:
    canonical = json.dumps(profile, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def publish_optimization_run(
    emulator_api: str,
    plant_id: str,
    session_id: str,
    comparison_id: str,
    profile: dict[str, Any],
    study: dict[str, Any],
    demo_token: str | None,
) -> dict[str, Any]:
    frames = []
    for hour in study.get("hours", []):
        tags = hour.get("plc_tags", {})
        at = tags.get("PLC.Session.SimulatedTime")
        if isinstance(at, bool) or not isinstance(at, (int, float)):
            raise HTTPException(502, "el resultado optimizado no tiene marcas de tiempo numéricas")
        frames.append({
            "simulation_time_s": at,
            "temporal_context": "forecast",
            "state": {
                key: hour.get(key)
                for key in ("profile_hour", "plc_tags", "snapshot", "commands", "scenarios", "tank_levels_pct")
                if key in hour
            },
        })
    payload = {
        "source": "optimization",
        "run_id": study["optimization_job_id"],
        "profile_id": profile["id"],
        "profile_hash": profile_fingerprint(profile),
        "model_id": "fractal/water-network-scale-v1",
        "study_id": study["study_id"],
        "objective_id": study["objective_id"],
        "target_pressure_mca": study["target_pressure_mca"],
        "base_time": study["base_time"],
        "applied_to_plc": False,
        "frames": frames,
    }
    request = UrlRequest(
        f"{emulator_api}/api/plants/{plant_id}/sessions/{session_id}/comparisons/{comparison_id}/runs",
        data=json.dumps(payload).encode(),
        headers={"content-type": "application/json", **({"authorization": f"Bearer {demo_token}"} if demo_token else {})},
        method="POST",
    )
    try:
        with urlopen(request, timeout=15) as response:  # noqa: S310
            return json.load(response)
    except (HTTPError, URLError, TimeoutError, ValueError) as exc:
        raise HTTPException(502, f"no se pudo persistir la ejecución optimizada ({type(exc).__name__})") from exc


def plc_gateway(payload: dict[str, Any]) -> str:
    configured = os.getenv("FRACTAL_PLC_API_URL", "").rstrip("/")
    if configured:
        return configured
    local = str(payload.get("emulator_api", "")).rstrip("/")
    parsed = urlparse(local)
    if (
        parsed.scheme == "http"
        and parsed.hostname in {"localhost", "127.0.0.1"}
        and parsed.port == 8000
        and not parsed.username
        and not parsed.password
    ):
        return local
    raise HTTPException(503, "Configure FRACTAL_PLC_API_URL para leer el gateway PLC de sesión")


def gateway_json(url: str, demo_token: str | None = None) -> dict[str, Any]:
    headers = {"authorization": f"Bearer {demo_token}"} if demo_token else {}
    request = UrlRequest(url, headers=headers)
    try:
        with urlopen(request, timeout=10) as response:  # noqa: S310 — host configurado por despliegue
            return json.load(response)
    except (HTTPError, URLError, TimeoutError, ValueError) as exc:
        raise HTTPException(502, f"No se pudo leer el gateway PLC: {type(exc).__name__}") from exc


def _gateway_read(url: str, demo_token: str | None) -> dict[str, Any]:
    return gateway_json(url, demo_token) if demo_token else gateway_json(url)


@app.post("/studies/horizon/from-plc")
def horizon_from_plc(payload: dict[str, Any], request: Request) -> dict[str, Any]:
    """Lee estado y perfil persistido de la misma sesión; ignora copias de navegador."""
    session_id = payload.get("session_id")
    plant_id = payload.get("plant_id")
    if not all(isinstance(value, str) and value for value in (session_id, plant_id)):
        raise HTTPException(422, "plant_id y session_id son obligatorios")
    if "/" in session_id or "/" in plant_id or ".." in session_id or ".." in plant_id:
        raise HTTPException(422, "identificador de sesión/planta inválido")
    origin = plc_gateway(payload)
    demo_token = request.headers.get("x-twin-demo-token")
    base = f"{origin}/api/plants/{plant_id}"
    session = _gateway_read(f"{base}/sessions/{session_id}", demo_token)
    if session.get("id") != session_id or session.get("plant_id") != plant_id or not session.get("profile_id"):
        raise HTTPException(409, "la sesión PLC debe tener un perfil activo guardado")
    if not session.get("running") or session.get("paused"):
        raise HTTPException(409, "el PLC debe estar en play para solicitar Fractal")
    selected_profile_id = payload.get("profile_id", session["profile_id"])
    if not isinstance(selected_profile_id, str) or not selected_profile_id or "/" in selected_profile_id or ".." in selected_profile_id:
        raise HTTPException(422, "profile_id inválido")
    if selected_profile_id != session["profile_id"]:
        raise HTTPException(409, "el perfil del estudio debe ser el perfil activo del PLC para alinear el historial")
    profile = _gateway_read(f"{base}/operation-profiles/{selected_profile_id}", demo_token)
    if profile.get("id") != selected_profile_id:
        raise HTTPException(409, "el perfil seleccionado no corresponde a un perfil guardado")
    tags = _gateway_read(f"{base}/sessions/{session_id}/plc-tags", demo_token).get("plc_tags")
    if not isinstance(tags, dict) or tags.get("PLC.Profile.ActiveId") != session["profile_id"]:
        raise HTTPException(409, "el perfil y los tags PLC no corresponden a la misma sesión")
    # La red cuasiestacionaria no representa el arranque: con bomba parada la
    # PRS no tiene cabeza y resolver 24 horas de esa condición sería engañoso.
    if int(tags.get("PLC.Pump.RunningCount") or 0) == 0 or float(tags.get("PLC.PRS.OutletPressureMca") or 0) < 5:
        raise HTTPException(409, "espere a que arranquen las bombas y se presurice la PRS antes de proyectar")
    study_type = payload.get("study_type", "baseline")
    return _horizon_study(
        {
            "session_id": session_id,
            "plant_id": plant_id,
            "emulator_api": origin,
            "plc_tags": tags,
            "profile": profile,
            "objective_id": payload.get("objective_id", SUPPORTED_OBJECTIVE_ID),
            "target_pressure_mca": payload.get("target_pressure_mca"),
            "study_type": study_type,
        },
        publish=True,
        **({"plc_token": demo_token} if demo_token else {}),
    )


@app.post("/studies/profile-preview/from-plc")
def profile_preview_from_plc(payload: dict[str, Any], request: Request) -> dict[str, Any]:
    """Vista de presión de un perfil guardado; lectura PLC, sin publicar estudio ni mandar controles."""
    plant_id, session_id, profile_id = (payload.get(key) for key in ("plant_id", "session_id", "profile_id"))
    if not all(isinstance(value, str) and value and "/" not in value and ".." not in value for value in (plant_id, session_id, profile_id)):
        raise HTTPException(422, "planta, sesión y perfil guardado son obligatorios")
    demo_token = request.headers.get("x-twin-demo-token")
    base = f"{plc_gateway(payload)}/api/plants/{plant_id}"
    session = _gateway_read(f"{base}/sessions/{session_id}", demo_token)
    if session.get("id") != session_id or session.get("plant_id") != plant_id or not session.get("running") or session.get("paused"):
        raise HTTPException(409, "el PLC debe estar en play para proyectar la presión")
    profile = _gateway_read(f"{base}/operation-profiles/{profile_id}", demo_token)
    if profile.get("id") != profile_id:
        raise HTTPException(409, "perfil no corresponde al guardado en PLC")
    tags = _gateway_read(f"{base}/sessions/{session_id}/plc-tags", demo_token).get("plc_tags")
    if (
        not isinstance(tags, dict)
        or int(tags.get("PLC.Pump.RunningCount") or 0) == 0
        or float(tags.get("PLC.PRS.OutletPressureMca") or 0) < 5
    ):
        raise HTTPException(409, "espere a la presurización del PLC")
    hours = project_24h(tags, profile, horizon_hours=24)
    return {
        "mode": "profile_preview",
        "source": "plc_session",
        "temporal_context": "forecast",
        "applied": False,
        "profile_id": profile_id,
        "base_time": tags.get("PLC.Session.SimulatedTime"),
        "pressure_outlet_mca": [
            {"profile_hour": hour["profile_hour"], "pressure_mca": hour["plc_tags"]["PLC.PRS.OutletPressureMca"]} for hour in hours
        ],
    }


@app.post("/studies/horizon")
def horizon_study(payload: dict[str, Any]) -> dict[str, Any]:
    """Estudio offline: acepta hipótesis, pero nunca publica una sesión PLC."""
    return _horizon_study(payload, publish=False)


def _horizon_study(payload: dict[str, Any], *, publish: bool, plc_token: str | None = None) -> dict[str, Any]:
    """Proyección futura: solo la ruta from-plc publica en la sesión verificada."""
    session_id, tags, profile, objective_id = (
        payload.get("session_id"),
        payload.get("plc_tags"),
        payload.get("profile"),
        payload.get("objective_id"),
    )
    study_type = payload.get("study_type", "baseline")
    if study_type not in {"baseline", "optimized"}:
        raise HTTPException(422, "study_type debe ser baseline u optimized; seleccione el perfil guardado que desea usar")
    if study_type == "optimized" and not optimization_enabled():
        raise HTTPException(409, "optimización deshabilitada por FRACTAL_ENABLE_OPTIMIZATION=0")
    if not isinstance(session_id, str) or not isinstance(tags, dict) or not isinstance(profile, dict) or not isinstance(objective_id, str):
        raise HTTPException(422, "session_id, plc_tags, profile y objective_id son obligatorios")
    validate_objective(objective_id)
    target_pressure = payload.get("target_pressure_mca")
    if study_type == "optimized" and (
        isinstance(target_pressure, bool) or not isinstance(target_pressure, (int, float)) or not 10 <= target_pressure <= 45
    ):
        raise HTTPException(422, "target_pressure_mca debe definirse entre 10 y 45 mca")
    optimization: dict[str, Any] | None = None
    if study_type == "optimized":
        simulation_time = float(tags.get("PLC.Session.SimulatedTime", 0) or 0)
        optimization = submit_optimization_job({
            "contract_version": "fractal-optimization-job.v2",
            "kind": "profile-horizon",
            "objective_id": objective_id,
            "target_pressure_mca": target_pressure,
            "profile_hash": profile_fingerprint(profile),
            "snapshot": {
                "snapshot_id": str(payload.get("snapshot_id") or f"{session_id}:{simulation_time:g}"),
                "simulation_time_s": simulation_time,
                "plc_tags": tags,
            },
            "profile": profile,
        })
        hours = optimization.get("hours", [])
    else:
        hours = project_24h(
            tags, profile, study_type, objective_id, target_pressure_mca=float(target_pressure) if target_pressure is not None else None
        )
    draft_feasible = bool(optimization and optimization.get("requires_operator_acceptance"))
    result = {
        "session_id": session_id,
        "mode": "horizon",
        "study_type": study_type,
        "objective_id": objective_id,
        "target_pressure_mca": target_pressure,
        "profile_id": profile.get("id"),
        "profile_hash": profile_fingerprint(profile),
        "profile_name": profile.get("name"),
        "temporal_context": "forecast",
        "applied": False,
        "validation_status": "hydraulic_setpoints_only",
        "study_id": payload.get("study_id") or f"EST-{uuid4().hex[:12].upper()}",
        "comparison_id": payload.get("comparison_id") or (f"CMP-{uuid4().hex[:12].upper()}" if optimization else None),
        "optimization_job_id": optimization.get("job_id") if optimization else None,
        "base_time": tags.get("PLC.Session.SimulatedTime", 0),
        "hours": hours,
        "draft_profile": optimization.get("draft_profile") if optimization else None,
        "vrp_opening_profile_pct": optimization.get("vrp_opening_profile_pct") if optimization else None,
        "vrp_opening_required_profile_pct": optimization.get("vrp_opening_required_profile_pct") if optimization else None,
        "requires_operator_acceptance": draft_feasible,
    }
    plant_id = payload.get("plant_id")
    if publish and isinstance(plant_id, str):
        emulator_api = plc_gateway(payload)
        request = UrlRequest(
            f"{emulator_api}/api/plants/{plant_id}/sessions/{session_id}/fractal/studies",
            data=json.dumps(result).encode(),
            headers={"content-type": "application/json", **({"authorization": f"Bearer {plc_token}"} if plc_token else {})},
            method="POST",
        )
        with urlopen(request, timeout=5) as response:  # noqa: S310
            result["published"] = json.load(response)
        if optimization and result["comparison_id"]:
            try:
                result["comparison_run_published"] = publish_optimization_run(
                    emulator_api, plant_id, session_id, result["comparison_id"], profile, result, plc_token
                )
            except HTTPException as exc:
                result["comparison_persistence_error"] = str(exc.detail)
    return result


@app.post("/studies/instant/publish")
def instant_study_publish(payload: dict[str, Any]) -> dict[str, Any]:
    """Lee tags PLC publicados y deposita una propuesta; nunca aplica mandos."""
    if not optimization_enabled():
        raise HTTPException(409, "optimización deshabilitada por FRACTAL_ENABLE_OPTIMIZATION=0")
    emulator_api = plc_gateway(payload)
    plant_id = payload.get("plant_id")
    session_id = payload.get("session_id")
    objective_id = payload.get("objective_id", SUPPORTED_OBJECTIVE_ID)
    target_pressure = payload.get("target_pressure_mca")
    if not emulator_api or not all(isinstance(value, str) for value in (plant_id, session_id, objective_id)):
        raise HTTPException(422, "emulator_api, plant_id y session_id son obligatorios")
    validate_objective(objective_id)
    if isinstance(target_pressure, bool) or not isinstance(target_pressure, (int, float)) or not 10 <= target_pressure <= 45:
        raise HTTPException(422, "target_pressure_mca debe definirse entre 10 y 45 mca")
    with urlopen(f"{emulator_api}/api/plants/{plant_id}/sessions/{session_id}/plc-tags", timeout=5) as response:  # noqa: S310
        tags = json.load(response)["plc_tags"]
    optimization = submit_optimization_job({
        "contract_version": "fractal-optimization-job.v2",
        "kind": "instant",
        "objective_id": objective_id,
        "target_pressure_mca": target_pressure,
        "snapshot": {
            "snapshot_id": session_id,
            "simulation_time_s": float(tags.get("PLC.Session.SimulatedTime", 0) or 0),
            "plc_tags": tags,
        },
    })
    result = optimization["recommendation"]
    request = UrlRequest(
        f"{emulator_api}/api/plants/{plant_id}/sessions/{session_id}/fractal/recommendations",
        data=json.dumps({**result, "source": "fractal-engineering-api"}).encode(),
        headers={"content-type": "application/json"},
        method="POST",
    )
    with urlopen(request, timeout=5) as response:  # noqa: S310
        recommendation = json.load(response)
    return {"session_id": session_id, "recommendation": recommendation, "requires_operator_acceptance": True}


@app.post("/studies/instant")
def instant_study(payload: dict[str, Any]) -> dict[str, Any]:
    """Recibe exclusivamente tags PLC ya publicados por el gateway de sesión."""
    if not optimization_enabled():
        raise HTTPException(409, "optimización deshabilitada por FRACTAL_ENABLE_OPTIMIZATION=0")
    session_id = payload.get("session_id")
    tags = payload.get("plc_tags")
    objective_id = payload.get("objective_id", SUPPORTED_OBJECTIVE_ID)
    target_pressure = payload.get("target_pressure_mca")
    if not isinstance(session_id, str) or not isinstance(tags, dict):
        raise HTTPException(422, "session_id y plc_tags son obligatorios")
    validate_objective(objective_id)
    if isinstance(target_pressure, bool) or not isinstance(target_pressure, (int, float)) or not 10 <= target_pressure <= 45:
        raise HTTPException(422, "target_pressure_mca debe definirse entre 10 y 45 mca")
    optimization = submit_optimization_job({
        "contract_version": "fractal-optimization-job.v2",
        "kind": "instant",
        "objective_id": objective_id,
        "target_pressure_mca": target_pressure,
        "snapshot": {
            "snapshot_id": session_id,
            "simulation_time_s": float(tags.get("PLC.Session.SimulatedTime", 0) or 0),
            "plc_tags": tags,
        },
    })
    return {
        "session_id": session_id,
        "mode": "instant",
        "optimization_job_id": optimization["job_id"],
        "requires_operator_acceptance": True,
        "recommendation": optimization["recommendation"],
    }
