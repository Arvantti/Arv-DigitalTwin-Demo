"""API del gemelo digital.

    GET  /api/health
    GET  /api/equipment                      tipos de la librería (resumen)
    GET  /api/equipment/{type}               contrato completo, presets y escenarios
    WS   /api/equipment/{type}/simulate      simulación en vivo de un equipo
    GET  /api/plants                         gemelos de planta (industrial-models/*/twin.yaml)
    GET  /api/plants/{plant}                 equipos, enlaces y escenarios de un gemelo
    WS   /api/plants/{plant}/simulate        simulación en vivo de una planta

Protocolo del WebSocket
    Query: preset, scenario, params (JSON), speed (×tiempo real), seed
    Servidor → cliente cada 100 ms: {"t", "snapshot", "events"}
    Cliente → servidor: {"command": str, "args": {}} | {"speed": float} | {"pause": bool} | {"inputs": {}}
    En la planta, los comandos y las entradas llevan además "equipment": id; las entradas así
    enviadas se imponen sobre los enlaces hasta que se liberan con {"equipment", "release": [..]}.
"""

from __future__ import annotations

import asyncio
import json
import math
from typing import Any

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from twin_runtime import Library, Simulator
from twin_runtime.plant import PlantSimulator, TimelineStep, find_plants, load_plant_scenarios, load_twin
from twin_runtime.spec import SpecError

TICK_S = 0.1
MAX_STEPS_PER_TICK = 4000
MAX_PLANT_STEPS_PER_TICK = 250  # ≈ 0,3 ms por paso de planta: no bloquear el bucle más de ≈ 80 ms

app = FastAPI(title="Industrial Twin API", version="0.1.0")
library = Library()


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


# ---------------------------------------------------------------------------- plantas
def _plant(plant: str) -> tuple[Any, dict[str, Any]]:
    plants = find_plants(library)
    if plant not in plants:
        raise HTTPException(404, f"planta desconocida: {plant}")
    twin = load_twin(plants[plant], library)
    scen_path = plants[plant].parent / "scenarios.yaml"
    scenarios = load_plant_scenarios(scen_path, twin, library) if scen_path.exists() else {}
    return twin, scenarios


@app.get("/api/plants")
def list_plants() -> list[dict[str, Any]]:
    out = []
    for name, path in find_plants(library).items():
        twin = load_twin(path, library)
        out.append({"plant": name, "twin": twin.id, "name": twin.name, "equipment": len(twin.equipment)})
    return out


@app.get("/api/plants/{plant}")
def get_plant(plant: str) -> dict[str, Any]:
    twin, scenarios = _plant(plant)
    return {
        "plant": plant,
        "twin": twin.id,
        "name": twin.name,
        "dt": twin.dt,
        "equipment": [
            {"id": e.id, "type": e.type, "preset": e.preset, "params": e.params, "virtual": e.virtual, "represents": e.represents}
            for e in twin.equipment.values()
        ],
        "links": [{"kind": lk.kind, "mode": lk.mode, "from": lk.src, "to": lk.dst} for lk in twin.links],
        "kpis": [{"id": k.id, "unit": k.unit, "description": k.description} for k in twin.kpis],
        "scenarios": {sid: {"description": s.description, "duration_s": s.duration_s} for sid, s in scenarios.items()},
    }


@app.websocket("/api/plants/{plant}/simulate")
async def simulate_plant(ws: WebSocket, plant: str) -> None:
    await ws.accept()
    q = ws.query_params
    try:
        twin, scenarios = _plant(plant)
        sc = scenarios.get(q.get("scenario", "")) if q.get("scenario") else None
        sim = PlantSimulator(
            twin,
            library,
            seed=int(q.get("seed", sc.seed if sc else 1)),
            random_faults=(q.get("faults") == "1") if "faults" in q else (sc.random_faults if sc else False),
            params=sc.params if sc else None,
            inputs=sc.inputs if sc else None,
            disable=sc.disable if sc else None,
            dt=sc.dt if sc else None,
        )
        if sc:
            for step in sc.timeline:
                sim.schedule(step)
    except (HTTPException, SpecError, ValueError, KeyError) as exc:
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
                eid = msg.get("equipment")
                if eid is not None and eid not in sim.equipment:
                    raise KeyError(f"equipo desconocido: {eid}")
                if "inputs" in msg or "release" in msg or "command" in msg:
                    if eid is None:
                        raise KeyError("falta 'equipment'")
                    sim.schedule(
                        TimelineStep(
                            at_s=sim.t,
                            equipment=eid,
                            command=msg.get("command"),
                            args=msg.get("args") or {},
                            inputs=msg.get("inputs") or {},
                            release=msg.get("release") or [],
                        )
                    )
            except (ValueError, KeyError) as exc:
                await ws.send_json({"error": str(exc)})

    receiver = asyncio.create_task(receive())
    sent_events = 0
    try:
        while not receiver.done():
            if not paused:
                budget += speed * TICK_S
                steps = 0
                while budget >= sim.dt and steps < MAX_PLANT_STEPS_PER_TICK:
                    try:
                        sim.step()
                    except ValueError as exc:  # comando inválido enviado por el cliente
                        await ws.send_json({"error": str(exc)})
                    budget -= sim.dt
                    steps += 1
                if steps == MAX_PLANT_STEPS_PER_TICK:
                    budget = 0.0
            new_events = [e.to_dict() for e in sim.events[sent_events:] if e.type != "state_changed"][-200:]
            sent_events = len(sim.events)
            payload = {"t": sim.t, "speed": speed, "paused": paused, "snapshot": sim.snapshot(), "events": new_events}
            await ws.send_text(json.dumps(_clean(payload)))
            await asyncio.sleep(TICK_S)
    except WebSocketDisconnect:
        pass
    finally:
        receiver.cancel()
