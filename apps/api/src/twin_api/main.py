"""API del gemelo digital.

    GET  /api/health
    GET  /api/equipment                      tipos de la librería (resumen)
    GET  /api/equipment/{type}               contrato completo, presets y escenarios
    WS   /api/equipment/{type}/simulate      simulación en vivo de un equipo
    GET  /api/plants                         plantas con plano (y si tienen simulación conectada)
    GET  /api/plants/{id}                    plano para la escena 3D: zonas, equipos y su tipo/parámetros de librería
    WS   /api/plants/{id}/simulate           simulación en vivo de la planta conectada (motor de planta)

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
import json
import math
from typing import Any

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from twin_runtime import Library, Simulator
from twin_runtime.plant import SIM_FILE, PlantModel, find_models_root
from twin_runtime.spec import SpecError, load_yaml

TICK_S = 0.1
MAX_STEPS_PER_TICK = 4000

app = FastAPI(title="Industrial Twin API", version="0.1.0")
library = Library()
_plant_models: dict[str, PlantModel] = {}


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
    return {"status": "ok", "library": str(library.root), "types": len(library.folders())}


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
    root = find_models_root(library.root)
    return {f.name: f for f in sorted(root.iterdir()) if (f / "plant.yaml").exists()} if root.exists() else {}


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
                **{k: f[k] for k in ("from", "to", "medium", "rate", "unit") if k in f},
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
    }


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
    except (HTTPException, KeyError, SpecError, ValueError) as exc:
        await ws.send_json({"error": str(getattr(exc, "detail", exc))})
        await ws.close()
        return

    speed = float(q.get("speed", 60.0))
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
            await ws.send_text(
                json.dumps(_clean({"t": plant.t, "speed": speed, "paused": paused, "snapshot": plant.snapshot(), "events": new_events}))
            )
            await asyncio.sleep(TICK_S)
    except WebSocketDisconnect:
        pass
    finally:
        receiver.cancel()
