"""API HTTP aislada para el adaptador de modelo hidráulico de cosimulación."""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT))
from cosimulation.adapters.water_network_scale import MODEL_ID, QUALITY, project  # noqa: E402

app = FastAPI(title="Water Network Cosimulation Model API", version="2.0.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "model_id": MODEL_ID, "quality": QUALITY}


@app.post("/v2/project")
def project_timeline(payload: dict[str, Any]) -> dict[str, Any]:
    try:
        return project(payload)
    except (ValueError, KeyError, TypeError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
