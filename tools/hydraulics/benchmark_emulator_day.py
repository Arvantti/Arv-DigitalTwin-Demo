"""Benchmark reproducible del scheduler local del emulador del acueducto.

No inicia un servidor, no guarda sesiones ni publica mandos. Ejecuta el mismo
PlantSession._run de producción en memoria, con persistencia/auditoría simuladas.
Ejemplo: uv run python tools/hydraulics/benchmark_emulator_day.py --speed 120
"""
from __future__ import annotations

import argparse
import asyncio
import json
from time import monotonic

import twin_emulator_api.sessions as session_module
from twin_emulator_api.main import _plant_model
from twin_emulator_api.sessions import PlantSession, SessionManager

PLANT_ID = "water-network-scale-v1"


def _disable_persistence() -> None:
    """Evita que una validación local escriba en la base de datos de la aplicación."""
    session_module.checkpoints.save = lambda *_args, **_kwargs: None
    session_module.audit.record = lambda *_args, **_kwargs: None
    session_module.historian.sample = lambda *_args, **_kwargs: None
    session_module.historian.frame = lambda *_args, **_kwargs: None


async def benchmark(speed: float, target_hours: float) -> dict[str, float | int | str | None]:
    target_s = target_hours * 3600
    plant = _plant_model(PLANT_ID).create(seed=1, random_faults=False, horizon_s=target_s)
    session = PlantSession("benchmark-local", PLANT_ID, plant, None, None)
    session.speed = speed
    session.running = True
    manager = SessionManager()
    started = monotonic()
    task = asyncio.create_task(manager._run(session))
    last_hour = -1
    try:
        while plant.t < target_s and session.running:
            await asyncio.sleep(0.25)
            hour = int(plant.t // 3600)
            if hour != last_hour:
                last_hour = hour
                print(json.dumps({
                    "progress_hour": hour,
                    "requested_speed": speed,
                    "effective_speed": session.effective_speed,
                    "pending_simulation_s": session.budget,
                    "wall_elapsed_s": round(monotonic() - started, 2),
                }), flush=True)
    finally:
        session.running = False
        await task

    wall_s = monotonic() - started
    snapshot = session.snapshot()
    equipment = snapshot["equipment"]
    result: dict[str, float | int | str | None] = {
        "requested_speed": speed,
        "target_simulation_s": target_s,
        "actual_simulation_s": plant.t,
        "overshoot_s": max(0.0, plant.t - target_s),
        "wall_elapsed_s": wall_s,
        "average_effective_speed": plant.t / wall_s,
        "last_reported_effective_speed": session.effective_speed,
        "pending_simulation_s": session.budget,
        "discard_steps_policy": "none; elapsed budget is retained",
        "plant_events": len(plant.events),
        "pump_flow_m3h": equipment["pumpset-main-01"]["variables"].get("flow_m3h"),
        "pump_discharge_pressure_mca": equipment["pumpset-main-01"]["variables"].get("discharge_pressure_mca"),
        "prs_inlet_pressure_mca": equipment["prs-01"]["variables"].get("inlet_pressure_mca"),
        "prs_outlet_pressure_mca": equipment["prs-01"]["variables"].get("outlet_pressure_mca"),
        "critical_pressure_mca": equipment["prs-01"]["variables"].get("critical_pressure_mca"),
    }
    print(json.dumps({"result": result}, sort_keys=True), flush=True)
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--speed", type=float, choices=(60, 120, 240, 600), required=True)
    parser.add_argument("--target-hours", type=float, default=24)
    args = parser.parse_args()
    if args.target_hours <= 0 or args.target_hours > 24:
        parser.error("--target-hours debe estar entre 0 y 24")
    _disable_persistence()
    asyncio.run(benchmark(args.speed, args.target_hours))


if __name__ == "__main__":
    main()
