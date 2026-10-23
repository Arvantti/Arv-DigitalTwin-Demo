"""API Fractal: recomendaciones simuladas, sin escritura hacia PLC ni emulador."""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any
from urllib.request import Request, urlopen

from fastapi import FastAPI, HTTPException

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT))
from fractal.hydraulics.runtime.optimizer import recommend_instant  # noqa: E402

app = FastAPI(title="Fractal Engineering API", version="0.1.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "mode": "simulated-read-only"}


@app.post("/studies/instant/publish")
def instant_study_publish(payload: dict[str, Any]) -> dict[str, Any]:
    """Lee tags PLC publicados y deposita una propuesta; nunca aplica mandos."""
    emulator_api = str(payload.get("emulator_api", "")).rstrip("/")
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
    session_id = payload.get("session_id")
    tags = payload.get("plc_tags")
    objective_id = payload.get("objective_id")
    if not isinstance(session_id, str) or not isinstance(tags, dict) or not isinstance(objective_id, str):
        raise HTTPException(422, "session_id, plc_tags y objective_id son obligatorios")
    recommendation = recommend_instant(tags, objective_id)
    return {"session_id": session_id, "mode": "instant", "requires_operator_acceptance": True, "recommendation": recommendation}
