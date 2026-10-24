"""Diagnostica cuál petición activa primero la recirculación sin alterar PLC ni Fractal.

Ejemplo: uv run python -m tools.hydraulics.trace_recirculation_start --supply 70 --returns 40
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from twin_emulator_api.main import _plant_model, session_manager

PLANT = "water-network-scale-v1"
PROFILE = Path(__file__).resolve().parents[2] / "industrial-models" / PLANT / "operation-profiles" / "pdd-rca-01.json"


def trace(supply: float, returns: float, max_seconds: int = 3600) -> dict:
    profile = json.loads(PROFILE.read_text(encoding="utf-8"))
    session = session_manager.create(PLANT, _plant_model(PLANT), profile_id=profile["id"], profile=profile)
    tanks = session.plant.equipment
    for tank, pct in (("tank-supply-01", supply), ("tank-recirc-01", returns), ("tank-recirc-02", returns)):
        vessel = tanks[tank]
        vessel.mass = vessel.capacity_kg * pct / 100
    session.apply_profile_hour(0)
    pump = tanks["pumpset-recirc-01"]
    capacity = {tank: tanks[tank].p["volume_l"] / 1000 for tank in ("tank-supply-01", "tank-recirc-01", "tank-recirc-02")}
    start_inventory = sum(capacity[tank] * tanks[tank].level_pct / 100 for tank in capacity)
    for _ in range(max_seconds):
        session.plant.step()
        if pump.level_on:
            levels = {tank: tanks[tank].level_pct for tank in capacity}
            causes = []
            if levels["tank-supply-01"] <= pump.p["supply_start_pct"] + 0.1:
                causes.append("suministro_bajo")
            if max(levels["tank-recirc-01"], levels["tank-recirc-02"]) >= pump.p["return_high_start_pct"] - 0.1:
                causes.append("retorno_alto")
            return {
                "t_s": session.plant.t,
                "causes": causes,
                "tank_levels_pct": {tank: round(level, 3) for tank, level in levels.items()},
                "initial_inventory_m3": round(start_inventory, 5),
                "current_inventory_m3": round(sum(capacity[tank] * levels[tank] / 100 for tank in capacity), 5),
                "note": "Tuberías ya llenas, sin inventario dinámico; diagnóstico offline con política del PLC emulado.",
            }
    raise RuntimeError(f"No hubo petición de arranque de retorno en {max_seconds} s simulados")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--supply", type=float, default=70, help="Nivel inicial de suministro (%)")
    parser.add_argument("--returns", type=float, default=40, help="Nivel inicial de cada retorno (%)")
    parser.add_argument("--max-seconds", type=int, default=3600)
    args = parser.parse_args()
    if not 0 <= args.supply <= 100 or not 0 <= args.returns <= 100:
        parser.error("Los niveles deben estar entre 0 y 100 %")
    print(json.dumps(trace(args.supply, args.returns, args.max_seconds), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
