"""API del gemelo digital.

    GET  /api/health
    GET  /api/equipment                      tipos de la librería (resumen)
    GET  /api/equipment/{type}               contrato completo, presets y escenarios
    WS   /api/equipment/{type}/simulate      simulación en vivo de un equipo
    GET  /api/plants                         plantas con plano (y si tienen simulación conectada)
    GET  /api/plants/{id}                    plano para la escena 3D: zonas, equipos y su tipo/parámetros de librería
    GET  /api/plants/{id}/plc-schema         contrato declarativo del PLC/HMI simulado (si la planta lo configura)
    WS   /api/plants/{id}/simulate           simulación en vivo de la planta conectada (motor de planta)
    POST /api/plants/{id}/products/check     valida un producto nuevo contra el catálogo y devuelve su ruta (no guarda)
    GET  /api/schedules/{id}                 programación de producción: pedidos y plan (?from, ?to, ?back=month|Nd)
    POST /api/schedules/{id}/urgent          replanea desde ahora con pedidos urgentes y dice qué cambia (no guarda)

Protocolo del WebSocket de un equipo
    Query: preset, scenario, params (JSON), speed (×tiempo real), seed
    Servidor → cliente cada 100 ms: {"t", "snapshot", "events"}
    Cliente → servidor: {"command": str, "args": {}} | {"speed": float} | {"pause": bool} | {"inputs": {}}

Protocolo del WebSocket de planta
    Query: scenario, speed
    Servidor → cliente cada 100 ms: {"t", "snapshot": {"equipment": {id: snapshot}, "lines"}, "events"}
    Cliente → servidor: {"equipment": id, "command": str, "args": {}} | {"speed": float} | {"pause": bool}
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import math
import os
import re
import time
from datetime import date
from typing import Annotated, Any

from fastapi import Body, FastAPI, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from twin_runtime import Library, Simulator, planning
from twin_runtime.catalog import Catalog
from twin_runtime.plant import SIM_FILE, PlantModel, plant_folders
from twin_runtime.spec import SpecError, load_yaml

from .audit import audit
from .historian import historian
from .plc_tags import opcua_schema, plc_tags
from .profiles import ProfileStore, commands_for_hour, current_prs_inlet_offset_mca
from .saved_studies import saved_studies
from .sessions import manager as session_manager
from .studies import studies

TICK_S = 0.1
MAX_STEPS_PER_TICK = 4000

app = FastAPI(title="Industrial Twin API", version="0.1.0")
# Pages sirve solamente la galería; el emulador puede vivir en otro origen HTTPS.
# En producción defina TWIN_CORS_ORIGINS con los dominios autorizados, separados por coma.
_cors_origins = [
    origin.strip()
    for origin in os.environ.get("TWIN_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["content-type"],
)
library = Library()
_plant_models: dict[str, PlantModel] = {}

_PIPE_KEYS = ("from", "to", "medium", "rate", "unit", "route", "diameter_in", "inner_diameter_mm", "reduce_at", "reduce_to_in")
PLC_FILE = "plc.yaml"


def _clean(value: Any) -> Any:
    """JSON estricto: NaN/inf a null."""
    if isinstance(value, float) and not math.isfinite(value):
        return None
    if isinstance(value, dict):
        return {k: _clean(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_clean(v) for v in value]
    return value


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "service": os.environ.get("TWIN_SERVICE_ID", "local"),
        "library": str(library.root),
        "types": len(library.folders()),
    }


@app.get("/api/equipment")
def list_equipment() -> list[dict[str, Any]]:
    out = []
    for eq in library.all():
        raw = eq.spec.raw
        out.append(
            {
                "type": raw["type"],
                "name": raw["name"],
                "manufacturing": raw["manufacturing"],
                "category": raw["category"],
                "fidelity": raw["fidelity"],
                "presets": list(eq.spec.presets),
                "scenarios": list(eq.scenarios),
            }
        )
    return out


@app.get("/api/equipment/{type_id}")
def get_equipment(type_id: str) -> dict[str, Any]:
    try:
        eq = library.get(type_id)
    except KeyError as exc:
        raise HTTPException(404, str(exc)) from exc
    return {
        **eq.spec.to_dict(),
        "scenarios": {sid: {"description": s.description, "preset": s.preset} for sid, s in eq.scenarios.items()},
    }


@app.websocket("/api/equipment/{type_id}/simulate")
async def simulate(ws: WebSocket, type_id: str) -> None:
    await ws.accept()
    q = ws.query_params
    try:
        eq = library.get(type_id)
        scenario = eq.scenarios.get(q.get("scenario", "")) if q.get("scenario") else None
        preset = q.get("preset") or (scenario.preset if scenario else None)
        overrides = json.loads(q.get("params") or "{}")
        if scenario:
            overrides = {**scenario.params, **overrides}
        inst = eq.create(
            "eq-01",
            preset=preset,
            params=overrides,
            seed=int(q.get("seed", scenario.seed if scenario else 1)),
            random_faults=scenario.random_faults if scenario else True,
        )
    except (KeyError, SpecError, ValueError) as exc:
        await ws.send_json({"error": str(exc)})
        await ws.close()
        return

    dt = scenario.dt if scenario else 0.25
    sim = Simulator([inst], dt=dt)
    if scenario:
        sim.inputs[inst.id].update(scenario.inputs)
        for step in scenario.timeline:
            sim.schedule(step.at_s, inst.id, step.command, step.args, step.inputs)
    speed = float(q.get("speed", 1.0))
    paused = False
    budget = 0.0

    async def receive() -> None:
        nonlocal speed, paused
        while True:
            msg = await ws.receive_json()
            try:
                if "speed" in msg:
                    speed = max(0.0, min(5000.0, float(msg["speed"])))
                if "pause" in msg:
                    paused = bool(msg["pause"])
                if "inputs" in msg:
                    sim.inputs[inst.id].update(msg["inputs"])
                if "command" in msg:
                    inst.command(msg["command"], msg.get("args") or {})
                    sim.events.extend(inst.drain_events())
            except (ValueError, KeyError) as exc:
                await ws.send_json({"error": str(exc)})

    receiver = asyncio.create_task(receive())
    sent_events = 0
    try:
        while not receiver.done():
            if not paused:
                budget += speed * TICK_S
                steps = 0
                while budget >= dt and steps < MAX_STEPS_PER_TICK:
                    sim.step()
                    budget -= dt
                    steps += 1
                if steps == MAX_STEPS_PER_TICK:
                    budget = 0.0  # no acumular atraso si la velocidad excede la capacidad
            new_events = [e.to_dict() for e in sim.events[sent_events:]][-200:]
            sent_events = len(sim.events)
            await ws.send_text(
                json.dumps(_clean({"t": sim.t, "speed": speed, "paused": paused, "snapshot": inst.snapshot(), "events": new_events}))
            )
            await asyncio.sleep(TICK_S)
    except WebSocketDisconnect:
        pass
    finally:
        receiver.cancel()


# ------------------------------------------------------------------ plantas
def _plant_folders() -> dict[str, Any]:
    allowed = {item.strip() for item in os.environ.get("TWIN_ALLOWED_PLANTS", "").split(",") if item.strip()}
    return {name: folder for name, folder in plant_folders(library.root).items() if not allowed or name in allowed}


def _plant_model(plant_id: str) -> PlantModel:
    folders = _plant_folders()
    if plant_id not in folders or not (folders[plant_id] / SIM_FILE).exists():
        raise HTTPException(404, f"planta sin simulación conectada: {plant_id}")
    if plant_id not in _plant_models:
        _plant_models[plant_id] = PlantModel(folders[plant_id], library)
    return _plant_models[plant_id]


@app.get("/api/plants")
def list_plants() -> list[dict[str, Any]]:
    out = []
    for pid, folder in _plant_folders().items():
        plant = load_yaml(folder / "plant.yaml")["plant"]
        out.append({"id": pid, "name": plant["name"], "kind": plant["kind"], "simulated": (folder / SIM_FILE).exists()})
    return out


@app.get("/api/plants/{plant_id}")
def get_plant(plant_id: str) -> dict[str, Any]:
    """Plano para la escena 3D. Cada equipo trae `sim` si el motor de planta lo simula: tipo de librería y parámetros ya resueltos."""
    folders = _plant_folders()
    if plant_id not in folders:
        raise HTTPException(404, f"planta desconocida: {plant_id}")
    layout = load_yaml(folders[plant_id] / "plant.yaml")
    model = _plant_model(plant_id) if (folders[plant_id] / SIM_FILE).exists() else None
    equipment = []
    for eq in layout.get("equipment", []):
        item = {k: eq[k] for k in ("id", "type", "zone", "position", "footprint", "rotation_deg", "overhead", "panel", "params") if k in eq}
        cfg = model.equipment.get(eq["id"]) if model else None
        if cfg:
            spec = library.get(cfg["type"]).spec
            item["sim"] = {
                "type": cfg["type"],
                "preset": cfg.get("preset"),
                "params": spec.resolve_params(cfg.get("preset"), cfg.get("params")),
            }
        equipment.append(item)
    return {
        "plant": layout["plant"],
        "zones": layout.get("zones", []),
        "equipment": equipment,
        "walkways": layout.get("walkways", []),
        "aisles": layout.get("aisles", []),
        "routes": layout.get("routes", []),
        "pipes": [
            {
                **{k: f[k] for k in _PIPE_KEYS if k in f},
                # Enlaces del motor que pasan por este tramo: la escena anima la tubería con su caudal.
                "links": model.links_for_flow(f["from"], f["to"]) if model else [],
            }
            for f in layout.get("flows", [])
            if f.get("piped")
        ],
        "lines": [{"id": ln.id, "name": ln.name, "equipment": ln.equipment} for ln in model.lines] if model else [],
        "scenarios": (
            {sid: {"description": s.description, "duration_s": s.duration_s} for sid, s in model.scenarios.items()} if model else {}
        ),
        # Catálogo de datos (docs/datos-reales.md): productos con su ruta por los equipos y tamaño de cada equipo.
        "catalog": catalog.summary(layout) if (catalog := _catalog(plant_id)) else None,
    }


def _catalog(plant_id: str) -> Catalog | None:
    folder = _plant_folders()[plant_id]
    return _plant_model(plant_id).catalog if (folder / SIM_FILE).exists() else Catalog.load(folder)


@app.get("/api/plants/{plant_id}/plc-schema")
def get_plant_plc_schema(plant_id: str) -> dict[str, Any]:
    """Contrato declarativo para una HMI/PLC exclusivamente simulada.

    El archivo vive junto al modelo, en ``industrial-models/<planta>/plc.yaml``. El contrato describe pantallas,
    activos, mandos permitidos, alarmas y procedencia; no concede escritura hacia infraestructura física.
    """
    folders = _plant_folders()
    if plant_id not in folders:
        raise HTTPException(404, f"planta desconocida: {plant_id}")
    path = folders[plant_id] / PLC_FILE
    if not path.exists():
        raise HTTPException(404, f"planta sin configuración PLC: {plant_id}")
    schema = load_yaml(path)
    return _clean({"plant_id": plant_id, "simulated": True, **schema})


@app.post("/api/plants/{plant_id}/sessions", status_code=201)
def create_plant_session(
    plant_id: str, request: Request, payload: Annotated[dict[str, Any] | None, Body()] = None
) -> dict[str, Any]:
    model = _plant_model(plant_id)
    demo_client_id = request.headers.get("x-twin-demo-id")
    try:
        demo_expires_at = float(request.headers["x-twin-demo-expires-at"]) if "x-twin-demo-expires-at" in request.headers else None
    except ValueError as exc:
        raise HTTPException(400, "demo expiry inválido") from exc
    profile_id = (payload or {}).get("profile_id")
    profile = ProfileStore(plant_id, demo_client_id).get(profile_id) if profile_id else None
    if profile_id and profile is None:
        raise HTTPException(404, "perfil desconocido")
    session = session_manager.create(
        plant_id, model, profile_id=profile_id, profile=profile,
        demo_client_id=demo_client_id, demo_expires_at=demo_expires_at,
    )
    return {"id": session.id, "plant_id": plant_id, "running": session.running, "profile_id": profile_id}


@app.get("/api/plants/{plant_id}/sessions/{session_id}")
def get_plant_session(plant_id: str, session_id: str) -> dict[str, Any]:
    session = session_manager.get(plant_id, session_id)
    if session is None:
        raise HTTPException(404, "sesión desconocida")
    return {
        "id": session.id,
        "plant_id": plant_id,
        "running": session.running,
        "paused": session.paused,
        "t": session.plant.t,
        "profile_id": session.profile_id,
        "pending_profile_id": session.pending_profile[1] if session.pending_profile else None,
    }


@app.post("/api/plants/{plant_id}/sessions/{session_id}/start")
async def start_plant_session(plant_id: str, session_id: str) -> dict[str, Any]:
    session = session_manager.get(plant_id, session_id)
    if session is None:
        raise HTTPException(404, "sesión desconocida")
    session_manager.start(session)
    return {"id": session.id, "running": True}


@app.post("/api/plants/{plant_id}/sessions/{session_id}/schedule-profile")
def schedule_saved_profile(
    plant_id: str, session_id: str, request: Request, payload: Annotated[dict[str, Any], Body()]
) -> dict[str, Any]:
    """El operador PLC programa un escenario persistido para la próxima hora, nunca Fractal."""
    session = session_manager.get(plant_id, session_id)
    if session is None:
        raise HTTPException(404, "sesión desconocida")
    if not session.running:
        raise HTTPException(409, "el PLC debe estar en play para programar un perfil")
    profile_id = payload.get("profile_id")
    profile = ProfileStore(plant_id, request.headers.get("x-twin-demo-id")).get(profile_id) if isinstance(profile_id, str) else None
    if profile is None:
        raise HTTPException(404, "escenario guardado desconocido")
    starts_at_hour = session_manager.schedule_profile(session, profile_id, profile)
    historian.command(
        session_id,
        session.plant.t,
        {"source": "operator_plc", "event": "profile_scheduled", "profile_id": profile_id, "starts_at_hour": starts_at_hour},
    )
    return {"session_id": session_id, "profile_id": profile_id, "starts_at_hour": starts_at_hour, "applied_now": False}


def _saved_study_owner(request: Request) -> str:
    owner_id = request.headers.get("x-twin-demo-id")
    if not owner_id and os.environ.get("TWIN_DATA_BACKEND", "sqlite").lower() == "sqlite":
        return "local-development"
    if not owner_id:
        raise HTTPException(401, "Se requiere una identidad anónima de demostración")
    return owner_id


def _owned_study_session(plant_id: str, session_id: str, owner_id: str):
    session = session_manager.get(plant_id, session_id)
    if session is None or (session.demo_client_id and session.demo_client_id != owner_id):
        raise HTTPException(404, "sesión desconocida o no propia")
    return session


@app.get("/api/plants/{plant_id}/saved-studies")
def list_saved_studies(plant_id: str, request: Request) -> list[dict[str, Any]]:
    if plant_id not in _plant_folders():
        raise HTTPException(404, f"planta desconocida: {plant_id}")
    return saved_studies.list(_saved_study_owner(request), plant_id)


@app.post("/api/plants/{plant_id}/saved-studies", status_code=201)
def save_study(plant_id: str, request: Request, payload: Annotated[dict[str, Any], Body()]) -> dict[str, Any]:
    owner_id = _saved_study_owner(request)
    name = payload.get("name")
    session_id = payload.get("source_session_id")
    source_study_id = payload.get("source_study_id")
    if not isinstance(name, str) or not name.strip() or len(name.strip()) > 120:
        raise HTTPException(422, "name debe tener entre 1 y 120 caracteres")
    if not isinstance(session_id, str) or not isinstance(source_study_id, str):
        raise HTTPException(422, "source_session_id y source_study_id son obligatorios")
    _owned_study_session(plant_id, session_id, owner_id)
    result = studies.get(session_id, source_study_id)
    if result is None or result.get("temporal_context") != "forecast" or result.get("applied") is not False:
        raise HTTPException(404, "estudio futuro no aplicado desconocido")
    try:
        size = len(json.dumps(result, ensure_ascii=False, allow_nan=False).encode())
    except (TypeError, ValueError) as exc:
        raise HTTPException(422, "el resultado debe ser JSON finito") from exc
    if size > 950_000:
        raise HTTPException(413, "el resultado excede el límite de almacenamiento")
    try:
        return saved_studies.create(owner_id, plant_id, name.strip(), session_id, source_study_id, result)
    except ValueError as exc:
        raise HTTPException(429, str(exc)) from exc


@app.get("/api/plants/{plant_id}/saved-studies/{study_id}")
def get_saved_study(plant_id: str, study_id: str, request: Request) -> dict[str, Any]:
    result = saved_studies.get(_saved_study_owner(request), plant_id, study_id)
    if result is None:
        raise HTTPException(404, "estudio guardado desconocido")
    return result


@app.get("/api/plants/{plant_id}/saved-studies/{study_id}/versions/{version}")
def get_saved_study_version(plant_id: str, study_id: str, version: int, request: Request) -> dict[str, Any]:
    if version < 1:
        raise HTTPException(422, "version debe ser un entero positivo")
    result = saved_studies.get_version(_saved_study_owner(request), plant_id, study_id, version)
    if result is None:
        raise HTTPException(404, "versión de estudio desconocida")
    return result


@app.post("/api/plants/{plant_id}/saved-studies/{study_id}/versions", status_code=201)
def add_saved_study_version(
    plant_id: str, study_id: str, request: Request, payload: Annotated[dict[str, Any], Body()]
) -> dict[str, Any]:
    owner_id = _saved_study_owner(request)
    session_id, source_study_id = payload.get("source_session_id"), payload.get("source_study_id")
    if not isinstance(session_id, str) or not isinstance(source_study_id, str):
        raise HTTPException(422, "source_session_id y source_study_id son obligatorios")
    _owned_study_session(plant_id, session_id, owner_id)
    result = studies.get(session_id, source_study_id)
    if result is None or result.get("temporal_context") != "forecast" or result.get("applied") is not False:
        raise HTTPException(404, "estudio futuro no aplicado desconocido")
    try:
        size = len(json.dumps(result, ensure_ascii=False, allow_nan=False).encode())
    except (TypeError, ValueError) as exc:
        raise HTTPException(422, "el resultado debe ser JSON finito") from exc
    if size > 950_000:
        raise HTTPException(413, "el resultado excede el límite de almacenamiento")
    try:
        updated = saved_studies.add_version(owner_id, plant_id, study_id, session_id, source_study_id, result)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    if updated is None:
        raise HTTPException(404, "estudio guardado desconocido")
    return updated


@app.post("/api/plants/{plant_id}/saved-studies/{study_id}/versions/from-result", status_code=201)
def append_recalculated_saved_study(
    plant_id: str, study_id: str, request: Request, payload: Annotated[dict[str, Any], Body()]
) -> dict[str, Any]:
    owner_id = _saved_study_owner(request)
    result = payload.get("result")
    if not isinstance(result, dict) or result.get("temporal_context") != "forecast" or result.get("applied") is not False:
        raise HTTPException(422, "result debe ser un futuro simulado no aplicado")
    if result.get("source_saved_study_id") != study_id or not isinstance(result.get("source_version"), int):
        raise HTTPException(422, "el resultado no identifica la versión de origen")
    try:
        if len(json.dumps(result, ensure_ascii=False, allow_nan=False).encode()) > 950_000:
            raise HTTPException(413, "el resultado excede el límite de almacenamiento")
    except (TypeError, ValueError) as exc:
        raise HTTPException(422, "result debe ser JSON finito") from exc
    source_session_id = str(result.get("session_id") or "saved-study-rerun")
    source_study_id = str(result.get("study_id") or "saved-study-rerun")
    try:
        updated = saved_studies.add_version(owner_id, plant_id, study_id, source_session_id, source_study_id, result)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    if updated is None:
        raise HTTPException(404, "estudio guardado desconocido")
    return updated


@app.put("/api/plants/{plant_id}/saved-studies/{study_id}")
def rename_saved_study(
    plant_id: str, study_id: str, request: Request, payload: Annotated[dict[str, Any], Body()]
) -> dict[str, Any]:
    name = payload.get("name")
    if not isinstance(name, str) or not name.strip() or len(name.strip()) > 120:
        raise HTTPException(422, "name debe tener entre 1 y 120 caracteres")
    updated = saved_studies.rename(_saved_study_owner(request), plant_id, study_id, name.strip())
    if updated is None:
        raise HTTPException(404, "estudio guardado desconocido")
    return updated


@app.delete("/api/plants/{plant_id}/saved-studies/{study_id}", status_code=204)
def delete_saved_study(plant_id: str, study_id: str, request: Request) -> None:
    if not saved_studies.delete(_saved_study_owner(request), plant_id, study_id):
        raise HTTPException(404, "estudio guardado desconocido")


@app.get("/api/plants/{plant_id}/sessions/{session_id}/fractal/studies")
def list_fractal_studies(plant_id: str, session_id: str) -> list[dict[str, Any]]:
    if session_manager.get(plant_id, session_id) is None:
        raise HTTPException(404, "sesión desconocida")
    return studies.list(session_id)


@app.post("/api/plants/{plant_id}/sessions/{session_id}/fractal/studies", status_code=201)
def publish_fractal_study(plant_id: str, session_id: str, payload: Annotated[dict[str, Any], Body()]) -> dict[str, Any]:
    session = session_manager.get(plant_id, session_id)
    if session is None:
        raise HTTPException(404, "sesión desconocida")
    study_id = payload.get("study_id")
    if not isinstance(study_id, str) or payload.get("temporal_context") != "forecast" or payload.get("applied") is not False:
        raise HTTPException(422, "study_id y forecast no aplicado son obligatorios")
    studies.save(session_id, study_id, session.plant.t, payload)
    historian.command(session_id, session.plant.t, {"source": "fractal", "study_id": study_id, "event": "study_published"})
    audit.record(plant_id, "fractal.study_published", session_id=session_id, details={"study_id": study_id})
    return {"study_id": study_id, "temporal_context": "forecast", "applied": False}


@app.get("/api/plants/{plant_id}/sessions/{session_id}/fractal/studies/{study_id}/frames")
def get_fractal_study_frames(plant_id: str, session_id: str, study_id: str, hour: int | None = None) -> dict[str, Any]:
    if session_manager.get(plant_id, session_id) is None:
        raise HTTPException(404, "sesión desconocida")
    study = studies.get(session_id, study_id)
    if study is None:
        raise HTTPException(404, "estudio desconocido")
    frames = study.get("hours", [])
    if hour is not None:
        if hour < 0 or hour >= len(frames):
            raise HTTPException(422, "hora fuera del horizonte")
        frames = [frames[hour]]
    return {
        "study_id": study_id,
        "temporal_context": "forecast",
        "applied": False,
        "base_time": study.get("base_time", 0),
        "frames": frames,
    }


@app.post("/api/plants/{plant_id}/sessions/{session_id}/fractal/studies/{study_id}/decision")
def decide_fractal_study(plant_id: str, session_id: str, study_id: str, payload: Annotated[dict[str, Any], Body()]) -> dict[str, Any]:
    session = session_manager.get(plant_id, session_id)
    study = studies.get(session_id, study_id)
    if session is None or study is None:
        raise HTTPException(404, "sesión o estudio desconocido")
    if study.get("study_type") != "optimized":
        raise HTTPException(409, "solo los estudios optimizados requieren decisión del operador")
    if study.get("decision"):
        raise HTTPException(409, "el estudio ya tiene una decisión")
    accept = payload.get("accept")
    if not isinstance(accept, bool):
        raise HTTPException(422, "accept debe ser booleano")
    if accept and any(frame.get("robust") is not True for frame in study.get("hours", [])):
        raise HTTPException(409, "el estudio no cumple restricciones en todas las horas/escenarios; no puede aprobarse")
    study["decision"] = "accepted" if accept else "rejected"
    study["applied"] = False
    if accept:
        draft = study.get("draft_profile")
        if not isinstance(draft, dict):
            raise HTTPException(422, "el estudio no incluye borrador de perfil")
        try:
            profile = ProfileStore(plant_id, session.demo_client_id).create(draft)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        study["profile_id"] = profile["id"]
        study["profile_status"] = "approved_pending_activation"
        audit.record(
            plant_id,
            "profile.created_from_fractal",
            session_id=session_id,
            details={"profile_id": profile["id"], "study_id": study_id},
        )
    studies.update(session_id, study_id, session.plant.t, study)
    historian.command(
        session_id,
        session.plant.t,
        {"source": "operator", "study_id": study_id, "decision": study["decision"], "profile_id": study.get("profile_id")},
    )
    audit.record(
        plant_id,
        "fractal.study_decided",
        session_id=session_id,
        details={"study_id": study_id, "decision": study["decision"], "profile_id": study.get("profile_id")},
    )
    return study


@app.post("/api/plants/{plant_id}/sessions/{session_id}/fractal/studies/{study_id}/activate")
def activate_fractal_profile(plant_id: str, session_id: str, study_id: str) -> dict[str, Any]:
    session = session_manager.get(plant_id, session_id)
    study = studies.get(session_id, study_id)
    if session is None or study is None:
        raise HTTPException(404, "sesión o estudio desconocido")
    if study.get("decision") != "accepted" or not study.get("profile_id"):
        raise HTTPException(409, "el estudio debe estar aprobado antes de programar el perfil")
    profile = ProfileStore(plant_id, session.demo_client_id).get(study["profile_id"])
    if profile is None:
        raise HTTPException(404, "perfil aprobado desconocido")
    starts_at_hour = session_manager.schedule_profile(session, profile["id"], profile)
    study["profile_status"] = "scheduled"
    study["starts_at_hour"] = starts_at_hour
    studies.update(session_id, study_id, session.plant.t, study)
    historian.command(
        session_id,
        session.plant.t,
        {
            "source": "operator",
            "study_id": study_id,
            "event": "profile_scheduled",
            "profile_id": profile["id"],
            "starts_at_hour": starts_at_hour,
        },
    )
    return {"study_id": study_id, "profile_id": profile["id"], "status": "scheduled", "starts_at_hour": starts_at_hour, "applied": False}


@app.get("/api/plants/{plant_id}/sessions/{session_id}/fractal/recommendations")
def list_fractal_recommendations(plant_id: str, session_id: str) -> list[dict[str, Any]]:
    session = session_manager.get(plant_id, session_id)
    if session is None:
        raise HTTPException(404, "sesión desconocida")
    return session.recommendations


@app.post("/api/plants/{plant_id}/sessions/{session_id}/fractal/recommendations", status_code=201)
def publish_fractal_recommendation(plant_id: str, session_id: str, payload: Annotated[dict[str, Any], Body()]) -> dict[str, Any]:
    session = session_manager.get(plant_id, session_id)
    if session is None:
        raise HTTPException(404, "sesión desconocida")
    return session_manager.publish_recommendation(session, payload)


@app.post("/api/plants/{plant_id}/sessions/{session_id}/fractal/recommendations/{recommendation_id}/decision")
def decide_fractal_recommendation(
    plant_id: str, session_id: str, recommendation_id: str, payload: Annotated[dict[str, Any], Body()]
) -> dict[str, Any]:
    session = session_manager.get(plant_id, session_id)
    if session is None:
        raise HTTPException(404, "sesión desconocida")
    try:
        return session_manager.decide_recommendation(session, recommendation_id, bool(payload.get("accept")))
    except KeyError as exc:
        raise HTTPException(404, str(exc)) from exc


@app.get("/api/plants/{plant_id}/sessions/{session_id}/historian")
def get_session_historian(plant_id: str, session_id: str) -> dict[str, Any]:
    if session_manager.get(plant_id, session_id) is None:
        raise HTTPException(404, "sesión desconocida")
    return {"session_id": session_id, **historian.read(session_id)}


def _canonical_fingerprint(value: Any) -> str:
    canonical = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _profile_fingerprint(profile: dict[str, Any]) -> str:
    return _canonical_fingerprint(profile)


def _validate_comparison_grid(time_step_s: Any, horizon_s: Any) -> tuple[float, float]:
    if any(
        isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value)
        for value in (time_step_s, horizon_s)
    ):
        raise HTTPException(422, "time_step_s y horizon_s deben ser números finitos")
    step, horizon = float(time_step_s), float(horizon_s)
    ticks = horizon / step if step > 0 else 0
    hour_grid = all(math.isclose(value / 3600, round(value / 3600), abs_tol=1e-8) for value in (step, horizon))
    if (
        not hour_grid or step < 3600 or step > 24 * 3600 or horizon < 3600 or horizon > 168 * 3600
        or ticks < 1 or ticks > 168 or not math.isclose(ticks, round(ticks), abs_tol=1e-8)
    ):
        raise HTTPException(422, "Use paso de 1–24 h y horizonte de 1–168 h, en horas enteras y múltiplos exactos")
    return step, horizon


@app.post("/api/plants/{plant_id}/sessions/{session_id}/comparisons/{comparison_id}/manifest")
def create_comparison_manifest(
    plant_id: str,
    session_id: str,
    comparison_id: str,
    request: Request,
    payload: Annotated[dict[str, Any], Body()],
) -> dict[str, Any]:
    """Fija un contexto PLC/profile/horizonte para asociar corridas independientes."""
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,96}", comparison_id):
        raise HTTPException(422, "comparison_id inválido")
    session = session_manager.get(plant_id, session_id)
    if session is None or (session.demo_client_id and session.demo_client_id != request.headers.get("x-twin-demo-id")):
        raise HTTPException(404, "sesión desconocida")
    step, horizon = _validate_comparison_grid(payload.get("time_step_s"), payload.get("horizon_s"))
    requested_profile_id = payload.get("profile_id")
    existing = historian.get_comparison_manifest(session_id, comparison_id)
    if existing is not None:
        if (
            requested_profile_id not in (None, existing["profile_id"])
            or step != existing["time_step_s"]
            or horizon != existing["horizon_s"]
        ):
            raise HTTPException(409, "comparison_id ya está fijado a otro perfil o rejilla temporal")
        return existing
    if not session.running or session.paused:
        raise HTTPException(409, "inicie o reanude el PLC para fijar un snapshot de comparación")
    profile_id = requested_profile_id or session.profile_id
    if not isinstance(profile_id, str) or profile_id != session.profile_id:
        raise HTTPException(409, "el manifiesto debe usar el perfil activo de la sesión PLC")
    owner_id = request.headers.get("x-twin-demo-id")
    profile = ProfileStore(plant_id, owner_id).get(profile_id)
    if profile is None:
        raise HTTPException(404, "perfil guardado desconocido")
    base_time = float(session.plant.t)
    profile_hour = int(base_time // 3600)
    tags = plc_tags(
        session.snapshot(), profile_id=profile_id, profile_hour=profile_hour, simulated_time=base_time
    )
    if tags.get("PLC.Profile.ActiveId") != profile_id:
        raise HTTPException(409, "el snapshot PLC no corresponde al perfil activo")
    if int(tags.get("PLC.Pump.RunningCount") or 0) == 0 or float(tags.get("PLC.PRS.OutletPressureMca") or 0) < 5:
        raise HTTPException(409, "espere a que arranquen las bombas y se presurice la VRP antes de fijar la comparación")
    history_frames: list[dict[str, Any]] = []
    for sample in historian.read(session_id)["samples"]:
        if sample["t"] >= base_time:
            continue
        stored_profile, sample_tags = sample.get("profile"), sample.get("plc_tags")
        if not isinstance(stored_profile, dict) or stored_profile.get("id") != profile_id:
            raise HTTPException(409, "el historial contiene otro perfil; inicie una sesión con perfil único")
        if not isinstance(sample_tags, dict) or sample_tags.get("PLC.Profile.ActiveId") != profile_id:
            raise HTTPException(409, "el historial PLC no permite verificar el perfil activo")
        history_frames.append({"simulation_time_s": sample["t"], "plc_tags": sample_tags})
    snapshot_id = f"{session_id}:{base_time:g}"
    profile_hash = _profile_fingerprint(profile)
    history_hash = _canonical_fingerprint(history_frames)
    first_forecast = (math.floor(base_time / step) + 1) * step if step != 3600 else (math.floor(base_time / 3600) + 1) * 3600
    forecast_times: list[float] = []
    at = first_forecast
    end_time = base_time + horizon
    while at <= end_time + 1e-8 and len(forecast_times) < 168:
        forecast_times.append(float(at))
        at += step
    identity = {
        "version": "comparison-context.v1",
        "plant_id": plant_id,
        "session_id": session_id,
        "profile_id": profile_id,
        "profile_hash": profile_hash,
        "snapshot_id": snapshot_id,
        "base_time_s": base_time,
        "time_step_s": step,
        "horizon_s": horizon,
        "forecast_times_s": forecast_times,
        "history_times_s": [frame["simulation_time_s"] for frame in history_frames],
        "history_hash": history_hash,
    }
    manifest = {
        **identity,
        "input_hash": _canonical_fingerprint(identity),
        "profile": profile,
        "snapshot": {"snapshot_id": snapshot_id, "simulation_time_s": base_time, "plc_tags": tags},
        "history_sample_count": len(history_frames),
    }
    try:
        return historian.create_comparison_manifest(session_id, comparison_id, manifest)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc


@app.get("/api/plants/{plant_id}/sessions/{session_id}/comparisons/{comparison_id}/manifest")
def get_comparison_manifest(
    plant_id: str, session_id: str, comparison_id: str, request: Request
) -> dict[str, Any]:
    session = session_manager.get(plant_id, session_id)
    if session is None or (session.demo_client_id and session.demo_client_id != request.headers.get("x-twin-demo-id")):
        raise HTTPException(404, "sesión desconocida")
    manifest = historian.get_comparison_manifest(session_id, comparison_id)
    if manifest is None or manifest.get("plant_id") != plant_id:
        raise HTTPException(404, "manifiesto de comparación desconocido")
    return manifest


@app.post("/api/plants/{plant_id}/sessions/{session_id}/comparisons/{comparison_id}/runs", status_code=201)
def publish_model_run(
    plant_id: str,
    session_id: str,
    comparison_id: str,
    request: Request,
    payload: Annotated[dict[str, Any], Body()],
) -> dict[str, Any]:
    """Guarda una trayectoria calculada aparte de la historia/tag operativos del emulador."""
    session = session_manager.get(plant_id, session_id)
    if session is None or (session.demo_client_id and session.demo_client_id != request.headers.get("x-twin-demo-id")):
        raise HTTPException(404, "sesión desconocida")
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,96}", comparison_id):
        raise HTTPException(422, "comparison_id inválido")
    source, run_id, profile_id, profile_hash, model_id, frames = (
        payload.get("source"), payload.get("run_id"), payload.get("profile_id"),
        payload.get("profile_hash"), payload.get("model_id"), payload.get("frames"),
    )
    if source not in {"cosimulation", "optimization"}:
        raise HTTPException(422, "source debe ser cosimulation u optimization")
    if not all(isinstance(value, str) and value for value in (run_id, profile_id, profile_hash, model_id)):
        raise HTTPException(422, "run_id, profile_id, profile_hash y model_id son obligatorios")
    if not isinstance(payload.get("model_quality"), str) or not payload["model_quality"].strip():
        raise HTTPException(422, "model_quality debe declarar evidencia y límites del modelo")
    comparison_input_hash, snapshot_id = payload.get("comparison_input_hash"), payload.get("snapshot_id")
    time_origin_s = payload.get("time_origin_s")
    if not isinstance(comparison_input_hash, str) or not isinstance(snapshot_id, str) or not snapshot_id:
        raise HTTPException(422, "comparison_input_hash y snapshot_id del manifiesto son obligatorios")
    if isinstance(time_origin_s, bool) or not isinstance(time_origin_s, (int, float)) or not math.isfinite(time_origin_s):
        raise HTTPException(422, "time_origin_s debe ser numérico y finito")
    _validate_comparison_grid(payload.get("time_step_s"), payload.get("horizon_s"))
    forecast_times = payload.get("forecast_times_s")
    if not isinstance(forecast_times, list) or any(
        isinstance(at, bool) or not isinstance(at, (int, float)) or not math.isfinite(at)
        for at in forecast_times
    ):
        raise HTTPException(422, "forecast_times_s debe ser una lista finita del manifiesto")
    manifest = historian.get_comparison_manifest(session_id, comparison_id)
    if manifest is None:
        raise HTTPException(409, "la comparación requiere un manifiesto antes de publicar ejecuciones")
    if profile_id != manifest.get("profile_id") or profile_hash != manifest.get("profile_hash"):
        raise HTTPException(409, "el resultado no corresponde al perfil inmutable del manifiesto")
    if (
        comparison_input_hash != manifest.get("input_hash")
        or snapshot_id != manifest.get("snapshot_id")
        or float(time_origin_s) != manifest.get("base_time_s")
        or payload.get("time_step_s") != manifest.get("time_step_s")
        or payload.get("horizon_s") != manifest.get("horizon_s")
        or forecast_times != manifest.get("forecast_times_s")
    ):
        raise HTTPException(409, "la ejecución no coincide con el contexto temporal inmutable del manifiesto")
    if payload.get("applied_to_plc") is not False:
        raise HTTPException(422, "los resultados calculados deben declarar applied_to_plc=false")
    if not isinstance(frames, list) or not frames:
        raise HTTPException(422, "frames debe ser una lista no vacía")
    previous = -1.0
    for index, frame in enumerate(frames):
        if not isinstance(frame, dict):
            raise HTTPException(422, f"frames[{index}] debe ser un objeto")
        at, context, state = frame.get("simulation_time_s"), frame.get("temporal_context"), frame.get("state")
        if isinstance(at, bool) or not isinstance(at, (int, float)) or at < 0 or at <= previous:
            raise HTTPException(422, "frames debe tener tiempos crecientes y sin duplicados")
        if context not in {"history", "present", "forecast"} or not isinstance(state, dict):
            raise HTTPException(422, f"frames[{index}] debe incluir temporal_context y state")
        if context == "present" and not math.isclose(float(at), float(manifest["base_time_s"]), abs_tol=1e-6):
            raise HTTPException(422, f"frames[{index}] present debe coincidir con el snapshot del manifiesto")
        if context == "forecast" and not any(
            math.isclose(float(at), float(expected), abs_tol=1e-6)
            for expected in manifest["forecast_times_s"]
        ):
            raise HTTPException(422, f"frames[{index}] forecast no pertenece a la rejilla del manifiesto")
        if context == "history" and not any(
            math.isclose(float(at), float(expected), abs_tol=1e-6)
            for expected in manifest["history_times_s"]
        ):
            raise HTTPException(422, f"frames[{index}] history no corresponde a una muestra PLC persistida")
        previous = float(at)
    stored = {
        **payload,
        "run_id": run_id,
        "source": source,
        "profile_id": profile_id,
        "profile_hash": profile_hash,
        "model_id": model_id,
        "frames": frames,
    }
    try:
        return historian.store_model_run(session_id, comparison_id, stored)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc


@app.get("/api/plants/{plant_id}/sessions/{session_id}/comparisons")
def list_model_comparisons(plant_id: str, session_id: str, request: Request) -> list[dict[str, Any]]:
    session = session_manager.get(plant_id, session_id)
    if session is None or (session.demo_client_id and session.demo_client_id != request.headers.get("x-twin-demo-id")):
        raise HTTPException(404, "sesión desconocida")
    return historian.list_model_comparisons(session_id)


@app.post("/api/plants/{plant_id}/sessions/{session_id}/comparisons/{comparison_id}/sources/{source}/status")
def record_comparison_source_status(
    plant_id: str, session_id: str, comparison_id: str, source: str, request: Request,
    payload: Annotated[dict[str, Any], Body()],
) -> dict[str, Any]:
    session = session_manager.get(plant_id, session_id)
    if session is None or (session.demo_client_id and session.demo_client_id != request.headers.get("x-twin-demo-id")):
        raise HTTPException(404, "sesión desconocida")
    status, detail = payload.get("status"), payload.get("detail")
    if status not in {"in_progress", "ready", "blocked", "failed"}:
        raise HTTPException(422, "status de fuente inválido")
    if detail is not None and not isinstance(detail, str):
        raise HTTPException(422, "detail debe ser texto")
    manifest = historian.get_comparison_manifest(session_id, comparison_id)
    if manifest is None or manifest.get("plant_id") != plant_id:
        raise HTTPException(404, "manifiesto de comparación desconocido")
    try:
        return historian.record_comparison_source_status(session_id, comparison_id, source, status, detail[:200] if detail else None)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@app.get("/api/plants/{plant_id}/sessions/{session_id}/comparisons/{comparison_id}/triads")
def get_comparison_triads(plant_id: str, session_id: str, comparison_id: str) -> dict[str, Any]:
    if session_manager.get(plant_id, session_id) is None:
        raise HTTPException(404, "sesión desconocida")
    comparisons = {item["comparison_id"]: item for item in historian.list_model_comparisons(session_id)}
    comparison = comparisons.get(comparison_id)
    if comparison is None:
        raise HTTPException(404, "comparación desconocida")
    return {**comparison, "triads": historian.comparison_triads(session_id, comparison_id)}


@app.get("/api/plants/{plant_id}/sessions/{session_id}/historian/frame")
def get_historical_scene_frame(plant_id: str, session_id: str, at_t: float) -> dict[str, Any]:
    session = session_manager.get(plant_id, session_id)
    if session is None:
        raise HTTPException(404, "sesión desconocida")
    if not math.isfinite(at_t) or at_t < 0 or at_t > session.plant.t:
        raise HTTPException(422, "instante fuera del historial de esta sesión")
    frame = historian.nearest_frame(session_id, at_t)
    if frame is None:
        raise HTTPException(404, "todavía no existen fotogramas históricos")
    return {"session_id": session_id, **frame}


@app.post("/api/plants/{plant_id}/sessions/{session_id}/stop")
def stop_plant_session(plant_id: str, session_id: str) -> dict[str, Any]:
    session = session_manager.get(plant_id, session_id)
    if session is None:
        raise HTTPException(404, "sesión desconocida")
    session_manager.stop(session)
    return {"id": session.id, "running": False}


@app.websocket("/api/plants/{plant_id}/sessions/{session_id}")
async def subscribe_plant_session(ws: WebSocket, plant_id: str, session_id: str) -> None:
    subprotocol = "arvantti-demo" if "arvantti-demo" in ws.scope.get("subprotocols", []) else None
    await ws.accept(subprotocol=subprotocol)
    session = session_manager.get(plant_id, session_id)
    role = ws.query_params.get("role", "viewer")
    if session is None or role not in {"plc", "viewer", "fractal"}:
        await ws.send_json({"error": "sesión o rol no válido"})
        await ws.close()
        return
    if role == "plc" and getattr(session, "plc_operator_connected", False):
        await ws.send_json({"error": "ya existe una conexión PLC para esta sesión"})
        await ws.close(code=1008)
        return
    if role == "plc":
        session.plc_operator_connected = True
        session_manager.start(session)
    queue = session_manager.subscribe(session)

    async def receive() -> None:
        window_started = time.monotonic()
        message_count = 0
        while True:
            payload = await ws.receive_json()
            if role != "plc":
                await ws.send_json({"error": "rol de solo lectura"})
                continue
            now = time.monotonic()
            if now - window_started >= 1:
                window_started = now
                message_count = 0
            message_count += 1
            if message_count > 30:
                await ws.send_json({"error": "límite de mandos PLC excedido"})
                await ws.close(code=1008)
                return
            try:
                session_manager.command(session, payload)
            except (KeyError, ValueError) as exc:
                await ws.send_json({"error": str(exc)})

    receiver = asyncio.create_task(receive())
    try:
        while not receiver.done():
            if session.demo_expires_at is not None and time.time() >= session.demo_expires_at:
                await ws.close(code=1008, reason="demo session expired")
                break
            try:
                message = await asyncio.wait_for(queue.get(), timeout=1.0)
            except TimeoutError:
                continue
            await ws.send_json(message)
    except WebSocketDisconnect:
        pass
    finally:
        receiver.cancel()
        session_manager.unsubscribe(session, queue)
        if role == "plc":
            session_manager.stop(session)
            session.plc_operator_connected = False


@app.get("/api/plants/{plant_id}/fractal/objectives")
def get_fractal_objectives(plant_id: str) -> dict[str, Any]:
    folder = _plant_folders().get(plant_id)
    if folder is None:
        raise HTTPException(404, "planta desconocida")
    objectives = folder / "fractal" / "optimization-objectives.yaml"
    constraints = folder / "fractal" / "optimization-constraints.yaml"
    if not objectives.exists() or not constraints.exists():
        raise HTTPException(404, "planta sin contrato Fractal")
    return {
        "plant_id": plant_id,
        "simulated": True,
        "objectives": load_yaml(objectives)["objectives"],
        "constraints": load_yaml(constraints)["constraints"],
    }


@app.get("/api/plants/{plant_id}/sessions/{session_id}/plc-tags")
def get_session_plc_tags(plant_id: str, session_id: str) -> dict[str, Any]:
    session = session_manager.get(plant_id, session_id)
    if session is None:
        raise HTTPException(404, "sesión desconocida")
    snapshot = session.snapshot()
    hour = int(session.plant.t // 3600)
    return {
        "session_id": session_id,
        "t": session.plant.t,
        "plc_tags": plc_tags(
            snapshot, profile_id=session.profile_id, profile_hour=hour if session.profile_id else None, simulated_time=session.plant.t
        ),
    }


@app.get("/api/plants/{plant_id}/sessions/{session_id}/opcua-schema")
def get_session_opcua_schema(plant_id: str, session_id: str) -> dict[str, Any]:
    session = session_manager.get(plant_id, session_id)
    if session is None:
        raise HTTPException(404, "sesión desconocida")
    return {"plant_id": plant_id, "session_id": session_id, "read_only": True, **opcua_schema()}


@app.websocket("/api/plants/{plant_id}/sessions/{session_id}/opcua")
async def stream_session_opcua(ws: WebSocket, plant_id: str, session_id: str) -> None:
    """Gateway simulado de tags PLC: Fractal recibe solo tags, nunca el runtime."""
    await ws.accept()
    session = session_manager.get(plant_id, session_id)
    if session is None:
        await ws.send_json({"error": "sesión desconocida"})
        await ws.close()
        return
    queue = session_manager.subscribe(session)
    try:
        while True:
            message = await queue.get()
            await ws.send_json({"session_id": session_id, "t": message["t"], "plc_tags": message["plc_tags"]})
    except WebSocketDisconnect:
        pass
    finally:
        session_manager.unsubscribe(session, queue)


@app.get("/api/plants/{plant_id}/opcua-schema")
def get_plant_opcua_schema(plant_id: str) -> dict[str, Any]:
    """Contrato de tags OPC UA simulado de solo lectura para Fractal."""
    if plant_id not in _plant_folders():
        raise HTTPException(404, f"planta desconocida: {plant_id}")
    return {"plant_id": plant_id, **opcua_schema()}


@app.get("/api/plants/{plant_id}/audit-events")
def list_audit_events(plant_id: str, limit: int = Query(100, ge=1, le=1000)) -> list[dict[str, Any]]:
    if plant_id not in _plant_folders():
        raise HTTPException(404, f"planta desconocida: {plant_id}")
    return audit.list(plant_id, limit=limit)


@app.get("/api/plants/{plant_id}/operation-profiles")
def list_operation_profiles(plant_id: str, request: Request) -> list[dict[str, Any]]:
    if plant_id not in _plant_folders():
        raise HTTPException(404, f"planta desconocida: {plant_id}")
    return ProfileStore(plant_id, request.headers.get("x-twin-demo-id")).list()


@app.post("/api/plants/{plant_id}/operation-profiles", status_code=201)
def create_operation_profile(
    plant_id: str, request: Request, profile: Annotated[dict[str, Any], Body()]
) -> dict[str, Any]:
    if plant_id not in _plant_folders():
        raise HTTPException(404, f"planta desconocida: {plant_id}")
    try:
        created = ProfileStore(plant_id, request.headers.get("x-twin-demo-id")).create(profile)
        audit.record(
            plant_id,
            "profile.created",
            actor_id=request.headers.get("x-twin-demo-id") or "operator",
            details={"profile_id": created["id"]},
        )
        return created
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@app.get("/api/plants/{plant_id}/operation-profiles/{profile_id}")
def get_operation_profile(plant_id: str, profile_id: str, request: Request) -> dict[str, Any]:
    profile = ProfileStore(plant_id, request.headers.get("x-twin-demo-id")).get(profile_id)
    if profile is None:
        raise HTTPException(404, f"perfil desconocido: {profile_id}")
    return profile


@app.put("/api/plants/{plant_id}/operation-profiles/{profile_id}")
def update_operation_profile(
    plant_id: str, profile_id: str, request: Request, profile: Annotated[dict[str, Any], Body()]
) -> dict[str, Any]:
    if plant_id not in _plant_folders():
        raise HTTPException(404, f"planta desconocida: {plant_id}")
    if profile_id.startswith("builtin-"):
        raise HTTPException(409, "clone la plantilla y edite la copia personalizada")
    if any(s.plant_id == plant_id and s.profile_id == profile_id and s.running for s in session_manager.sessions.values()):
        raise HTTPException(409, "no se puede editar el perfil activo mientras el PLC esté en play")
    try:
        updated = ProfileStore(plant_id, request.headers.get("x-twin-demo-id")).update(profile_id, profile)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    if updated is None:
        raise HTTPException(404, f"perfil desconocido: {profile_id}")
    audit.record(
        plant_id,
        "profile.updated",
        actor_id=request.headers.get("x-twin-demo-id") or "operator",
        details={"profile_id": profile_id},
    )
    return updated


@app.delete("/api/plants/{plant_id}/operation-profiles/{profile_id}", status_code=204)
def delete_operation_profile(plant_id: str, profile_id: str, request: Request) -> None:
    if profile_id.startswith("builtin-"):
        raise HTTPException(409, "las plantillas del modelo no se eliminan")
    if any(s.plant_id == plant_id and s.profile_id == profile_id and s.running for s in session_manager.sessions.values()):
        raise HTTPException(409, "no se puede eliminar el perfil activo mientras el PLC esté en play")
    if not ProfileStore(plant_id, request.headers.get("x-twin-demo-id")).delete(profile_id):
        raise HTTPException(404, f"perfil desconocido: {profile_id}")
    audit.record(
        plant_id,
        "profile.deleted",
        actor_id=request.headers.get("x-twin-demo-id") or "operator",
        details={"profile_id": profile_id},
    )


@app.post("/api/plants/{plant_id}/products/check")
def check_product(plant_id: str, product: Annotated[dict[str, Any], Body()]) -> dict[str, Any]:
    """Valida un producto (mismo formato que catalog/products.yaml) contra el catálogo y el plano, y devuelve su ruta.

    No guarda nada: el producto vive en la sesión del navegador hasta que exista el almacenamiento de la fase F.
    """
    folders = _plant_folders()
    if plant_id not in folders:
        raise HTTPException(404, f"planta desconocida: {plant_id}")
    catalog = _catalog(plant_id)
    if catalog is None:
        raise HTTPException(404, f"{plant_id} no tiene catálogo")
    layout = load_yaml(folders[plant_id] / "plant.yaml")
    extended, errors = catalog.with_product(product, layout, library)
    if extended is None or errors:
        return {"ok": False, "errors": errors}
    summary = extended.summary(layout)
    return {"ok": True, "errors": [], "product": next(p for p in summary["products"] if p["id"] == product["id"])}


# ------------------------------------------------------------------ programación (fase E, docs/programacion.md)
def _plan_inputs(plant_id: str) -> tuple[Catalog, dict[str, Any]]:
    folders = _plant_folders()
    if plant_id not in folders:
        raise HTTPException(404, f"planta desconocida: {plant_id}")
    catalog = _catalog(plant_id)
    if catalog is None or not catalog.data.get("demand"):
        raise HTTPException(404, f"{plant_id} no tiene demanda en su catálogo (catalog/demand.yaml)")
    return catalog, load_yaml(folders[plant_id] / "plant.yaml")


def _plan_range(catalog: Catalog, first: str | None, last: str | None, back: str) -> tuple[Any, Any]:
    try:
        d_first, d_last = planning.default_range(planning.tz_of(catalog), back)
        if first:
            d_first = date.fromisoformat(first)
        if last:
            d_last = date.fromisoformat(last)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    if d_last < d_first or (d_last - d_first).days > 400:
        raise HTTPException(422, "rango de fechas inválido (máximo 400 días)")
    return d_first, d_last


@app.get("/api/schedules/{plant_id}")
def get_schedule(
    plant_id: str,
    back: str = "month",
    first: Annotated[str | None, Query(alias="from")] = None,
    last: Annotated[str | None, Query(alias="to")] = None,
) -> dict[str, Any]:
    """Pedidos inventados y su plan en el rango: por defecto el mes en curso hacia atrás y 30 días hacia adelante.

    `from` y `to` (fechas ISO) fijan el rango; `back` (month o Nd, p. ej. 7d o 90d) cambia el inicio por defecto.
    El plan no depende de la hora: la escena calcula qué está hecho, en curso o programado con su propio reloj.
    """
    catalog, layout = _plan_inputs(plant_id)
    d_first, d_last = _plan_range(catalog, first, last, back)
    return planning.to_json(planning.build_plan(plant_id, catalog, layout, d_first, d_last), layout)


@app.post("/api/schedules/{plant_id}/urgent")
def urgent_schedule(plant_id: str, body: Annotated[dict[str, Any], Body()]) -> dict[str, Any]:
    """Replanea desde ahora con uno o más pedidos urgentes (producto, cantidad, entrega y color).

    Lo que empezó antes de ahora queda como está; el resto se vuelve a programar con los urgentes primero.
    Devuelve el plan nuevo y `impact`: órdenes movidas, pedidos que pasan a tarde y cómo sale cada urgente.
    No guarda nada: aceptar el escenario lo guarda la escena en el navegador hasta la fase F.
    """
    catalog, layout = _plan_inputs(plant_id)
    d_first, d_last = _plan_range(catalog, body.get("from"), body.get("to"), body.get("back") or "month")
    tz = planning.tz_of(catalog)
    try:
        now = planning.parse_local(body["now"], tz) if body.get("now") else planning.to_s(planning.local_now(tz))
        raw = body.get("orders") or []
        if not raw:
            raise ValueError("falta al menos un pedido urgente (orders)")
        urgent = [planning.urgent_order(catalog, r, now, i + 1, lambda s: planning.parse_local(s, tz)) for i, r in enumerate(raw)]
    except (KeyError, ValueError) as exc:
        raise HTTPException(422, f"pedido urgente inválido: {exc}") from exc
    base = planning.build_plan(plant_id, catalog, layout, d_first, d_last)
    new = planning.build_plan(plant_id, catalog, layout, d_first, d_last, urgent=urgent, now=now)
    return {**planning.to_json(new, layout), "impact": planning.impact(base, new)}


@app.websocket("/api/plants/{plant_id}/simulate")
async def simulate_plant(ws: WebSocket, plant_id: str) -> None:
    await ws.accept()
    q = ws.query_params
    try:
        model = _plant_model(plant_id)
        scenario = model.scenarios.get(q.get("scenario", "")) if q.get("scenario") else None
        if q.get("scenario") and scenario is None:
            raise KeyError(f"escenario desconocido: {q['scenario']}")
        plant = model.create(
            seed=scenario.seed if scenario else 1,
            random_faults=scenario.random_faults if scenario else False,
            horizon_s=scenario.duration_s if scenario else 86400.0,
        )
        if scenario:
            for eid, values in scenario.inputs.items():
                plant.sim.inputs[eid].update(values)
            for step in scenario.timeline:
                plant.schedule(step, until_s=scenario.duration_s)
        profile_id = q.get("profile_id")
        profile = ProfileStore(plant_id).get(profile_id) if profile_id else None
        if profile_id and profile is None:
            raise KeyError(f"perfil desconocido: {profile_id}")
    except (HTTPException, KeyError, SpecError, ValueError) as exc:
        await ws.send_json({"error": str(getattr(exc, "detail", exc))})
        await ws.close()
        return

    speed = float(q.get("speed", 60.0))
    paused = False
    budget = 0.0
    applied_profile_hour: int | None = None

    def apply_profile_hour(hour: int) -> None:
        nonlocal applied_profile_hour
        if profile is None or applied_profile_hour == hour:
            return
        inlet_offset = current_prs_inlet_offset_mca(plant)
        for item in commands_for_hour(profile, hour, inlet_pressure_offset_mca=inlet_offset):
            equipment = plant.equipment[item["equipment"]]
            equipment.command(item["command"], item["args"])
            plant.events.extend(equipment.drain_events())
        applied_profile_hour = hour

    async def receive() -> None:
        nonlocal speed, paused
        while True:
            msg = await ws.receive_json()
            try:
                if "speed" in msg:
                    speed = max(0.0, min(5000.0, float(msg["speed"])))
                if "pause" in msg:
                    paused = bool(msg["pause"])
                if "command" in msg:
                    eq = plant.equipment[msg["equipment"]]
                    eq.command(msg["command"], msg.get("args") or {})
                    plant.events.extend(eq.drain_events())
            except (ValueError, KeyError) as exc:
                await ws.send_json({"error": str(exc)})

    receiver = asyncio.create_task(receive())
    sent_events = 0
    try:
        while not receiver.done():
            if not paused:
                apply_profile_hour(int(plant.t // 3600))
                budget += speed * TICK_S
                steps = 0
                while budget >= model.dt and steps < MAX_STEPS_PER_TICK:
                    plant.step()
                    budget -= model.dt
                    steps += 1
                if steps == MAX_STEPS_PER_TICK:
                    budget = 0.0
            new_events = [e.to_dict() for e in plant.events[sent_events:]][-200:]
            sent_events = len(plant.events)
            snapshot = plant.snapshot()
            profile_state = {"id": profile_id, "hour": int(plant.t // 3600)} if profile else None
            await ws.send_text(
                json.dumps(
                    _clean(
                        {
                            "t": plant.t,
                            "speed": speed,
                            "paused": paused,
                            "profile": profile_state,
                            "snapshot": snapshot,
                            "plc_tags": plc_tags(
                                snapshot,
                                profile_id=profile_id,
                                profile_hour=profile_state["hour"] if profile_state else None,
                                simulated_time=plant.t,
                            ),
                            "events": new_events,
                        }
                    )
                )
            )
            await asyncio.sleep(TICK_S)
    except WebSocketDisconnect:
        pass
    finally:
        receiver.cancel()
