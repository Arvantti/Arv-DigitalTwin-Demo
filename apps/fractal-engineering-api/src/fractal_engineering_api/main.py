"""API Fractal: recomendaciones simuladas, sin escritura hacia PLC ni emulador."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT))
from fractal.hydraulics.runtime.mpc import project_24h  # noqa: E402
from fractal.hydraulics.runtime.optimizer import recommend_instant  # noqa: E402

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
    return os.getenv("FRACTAL_ENABLE_OPTIMIZATION", "0") == "1"


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


def gateway_json(url: str) -> dict[str, Any]:
    try:
        with urlopen(url, timeout=10) as response:  # noqa: S310 — host configurado por despliegue
            return json.load(response)
    except (HTTPError, URLError, TimeoutError, ValueError) as exc:
        raise HTTPException(502, f"No se pudo leer el gateway PLC: {type(exc).__name__}") from exc


@app.post("/studies/horizon/from-plc")
def horizon_from_plc(payload: dict[str, Any]) -> dict[str, Any]:
    """Lee estado y perfil persistido de la misma sesión; ignora copias de navegador."""
    session_id = payload.get("session_id")
    plant_id = payload.get("plant_id")
    if not all(isinstance(value, str) and value for value in (session_id, plant_id)):
        raise HTTPException(422, "plant_id y session_id son obligatorios")
    if "/" in session_id or "/" in plant_id or ".." in session_id or ".." in plant_id:
        raise HTTPException(422, "identificador de sesión/planta inválido")
    origin = plc_gateway(payload)
    base = f"{origin}/api/plants/{plant_id}"
    session = gateway_json(f"{base}/sessions/{session_id}")
    if session.get("id") != session_id or session.get("plant_id") != plant_id or not session.get("profile_id"):
        raise HTTPException(409, "la sesión PLC debe tener un perfil activo guardado")
    profile = gateway_json(f"{base}/operation-profiles/{session['profile_id']}")
    tags = gateway_json(f"{base}/sessions/{session_id}/plc-tags").get("plc_tags")
    if not isinstance(tags, dict) or tags.get("PLC.Profile.ActiveId") != session["profile_id"]:
        raise HTTPException(409, "el perfil y los tags PLC no corresponden a la misma sesión")
    # La red cuasiestacionaria no representa el arranque: con bomba parada la
    # PRS no tiene cabeza y resolver 24 horas de esa condición sería engañoso.
    if int(tags.get("PLC.Pump.RunningCount") or 0) == 0 or float(tags.get("PLC.PRS.OutletPressureMca") or 0) < 5:
        raise HTTPException(409, "espere a que arranquen las bombas y se presurice la PRS antes de proyectar")
    study_type = payload.get("study_type", "baseline")
    overrides = payload.get("overrides", {}) if study_type == "alternative" else {}
    return _horizon_study(
        {
            "session_id": session_id,
            "plant_id": plant_id,
            "emulator_api": origin,
            "plc_tags": tags,
            "profile": {**profile, "overrides": overrides},
            "objective_id": payload.get("objective_id", "OBJ-LEAK-01"),
            "study_type": study_type,
        },
        publish=True,
    )


@app.post("/studies/horizon")
def horizon_study(payload: dict[str, Any]) -> dict[str, Any]:
    """Estudio offline: acepta hipótesis, pero nunca publica una sesión PLC."""
    return _horizon_study(payload, publish=False)


def _horizon_study(payload: dict[str, Any], *, publish: bool) -> dict[str, Any]:
    """Proyección futura: solo la ruta from-plc publica en la sesión verificada."""
    session_id, tags, profile, objective_id = (
        payload.get("session_id"),
        payload.get("plc_tags"),
        payload.get("profile"),
        payload.get("objective_id"),
    )
    study_type = payload.get("study_type", "baseline")
    if study_type not in {"baseline", "alternative", "optimized"}:
        raise HTTPException(422, "study_type debe ser baseline, alternative u optimized")
    if study_type == "optimized" and not optimization_enabled():
        raise HTTPException(409, "primero se valida la proyección PLC; optimización deshabilitada en esta fase")
    if not isinstance(session_id, str) or not isinstance(tags, dict) or not isinstance(profile, dict) or not isinstance(objective_id, str):
        raise HTTPException(422, "session_id, plc_tags, profile y objective_id son obligatorios")
    overrides = profile.get("overrides", {}) if study_type == "alternative" else {}
    if not isinstance(overrides, dict):
        raise HTTPException(422, "overrides debe ser un objeto")
    bounds = {
        "demand_multiplier": (0, 2),
        "leakage_multiplier": (0, 5),
        "prs_mca": (15, 35),
        "valve_12_pct": (0, 100),
        "valve_23_pct": (0, 100),
        "valve_34_pct": (0, 100),
    }
    for name, (low, high) in bounds.items():
        value = overrides.get(name)
        if value is not None and (isinstance(value, bool) or not isinstance(value, (int, float)) or not low <= value <= high):
            raise HTTPException(422, f"{name} debe estar entre {low} y {high}")
    hours = project_24h(tags, profile, study_type, objective_id)
    draft_hours: dict[str, Any] = {}
    if study_type == "optimized":
        for frame in hours:
            planned = dict(profile.get("hours", {}).get(str(frame["profile_hour"]), {}))
            settings = frame.get("commands") or {}
            if settings:
                planned["prs"] = {**planned.get("prs", {}), **settings["prs"]}
                planned["between_levels"] = settings["between_levels"]
            draft_hours[str(frame["profile_hour"])] = planned
    result = {
        "session_id": session_id,
        "mode": "horizon",
        "study_type": study_type,
        "objective_id": objective_id,
        "temporal_context": "forecast",
        "applied": False,
        "validation_status": "hydraulic_setpoints_only",
        "study_id": payload.get("study_id") or f"EST-{uuid4().hex[:12].upper()}",
        "base_time": tags.get("PLC.Session.SimulatedTime", 0),
        "hours": hours,
        "draft_profile": (
            {
                "name": f"PFL-FRA-{session_id[:8].upper()} · optimizado",
                "description": f"Perfil optimizado para {objective_id}; requiere aprobación del operador PLC.",
                "hours": draft_hours,
            }
            if study_type == "optimized"
            else None
        ),
        "requires_operator_acceptance": study_type == "optimized",
    }
    plant_id = payload.get("plant_id")
    if publish and isinstance(plant_id, str):
        emulator_api = plc_gateway(payload)
        request = Request(
            f"{emulator_api}/api/plants/{plant_id}/sessions/{session_id}/fractal/studies",
            data=json.dumps(result).encode(),
            headers={"content-type": "application/json"},
            method="POST",
        )
        with urlopen(request, timeout=5) as response:  # noqa: S310
            result["published"] = json.load(response)
    return result


@app.post("/studies/instant/publish")
def instant_study_publish(payload: dict[str, Any]) -> dict[str, Any]:
    """Lee tags PLC publicados y deposita una propuesta; nunca aplica mandos."""
    if not optimization_enabled():
        raise HTTPException(409, "optimización deshabilitada hasta validar la proyección PLC")
    emulator_api = plc_gateway(payload)
    plant_id = payload.get("plant_id")
    session_id = payload.get("session_id")
    objective_id = payload.get("objective_id")
    if not emulator_api or not all(isinstance(value, str) for value in (plant_id, session_id, objective_id)):
        raise HTTPException(422, "emulator_api, plant_id, session_id y objective_id son obligatorios")
    with urlopen(f"{emulator_api}/api/plants/{plant_id}/sessions/{session_id}/plc-tags", timeout=5) as response:  # noqa: S310
        tags = json.load(response)["plc_tags"]
    result = recommend_instant(tags, objective_id)
    request = Request(
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
        raise HTTPException(409, "optimización deshabilitada hasta validar la proyección PLC")
    session_id = payload.get("session_id")
    tags = payload.get("plc_tags")
    objective_id = payload.get("objective_id")
    if not isinstance(session_id, str) or not isinstance(tags, dict) or not isinstance(objective_id, str):
        raise HTTPException(422, "session_id, plc_tags y objective_id son obligatorios")
    recommendation = recommend_instant(tags, objective_id)
    return {"session_id": session_id, "mode": "instant", "requires_operator_acceptance": True, "recommendation": recommendation}
