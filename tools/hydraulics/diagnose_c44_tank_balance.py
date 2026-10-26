"""P1–P3: balance efectivo PLC y primer ciclo C44, sin modificar modelos.

uv run python -m tools.hydraulics.diagnose_c44_tank_balance
"""
from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any

from twin_emulator_api.main import _plant_model
from twin_emulator_api.profiles import normalize_profile
from twin_emulator_api.sessions import PlantSession

from fractal.hydraulics.runtime.mpc import _MODEL, _recirc, project_24h

ROOT = Path(__file__).resolve().parents[2]
PLANT = "water-network-scale-v1"
TAGS = {
    "tank-supply-01": "PLC.Tank.Supply.LevelPct",
    "tank-recirc-01": "PLC.Tank.Recirc01.LevelPct",
    "tank-recirc-02": "PLC.Tank.Recirc02.LevelPct",
}


def run(output: Path) -> dict[str, Any]:
    profile_path = ROOT / "industrial-models" / PLANT / "operation-profiles/pdd-prs-punto-critico-18-01.json"
    profile = normalize_profile(json.loads(profile_path.read_text()))
    plant = _plant_model(PLANT).create(seed=1, random_faults=False, horizon_s=1800)
    session = PlantSession("c44-balance", PLANT, plant, "c44-balance", profile)
    session.apply_profile_hour(0)
    while plant.t < 30:
        plant.step()
    tags = session.message()["plc_tags"]
    pump = plant.equipment["pumpset-recirc-01"]
    initial_pump_volume = pump.volume_m3
    initial = {tank: plant.equipment[tank].true_values() for tank in TAGS}
    densities = {tank: plant.equipment[tank].p["density_kg_m3"] for tank in TAGS}
    capacities = {tank: plant.equipment[tank].p["volume_l"] / 1000 for tank in TAGS}
    # Una sola evaluación de distribución para aislar exclusivamente el cambio de niveles iniciales en P2.
    frame = project_24h(tags, profile, horizon_hours=1)[0]
    demand = frame["scenarios"][1]["state"]["level_flows_m3h"]
    forecasts = {}
    for mode in ("plc_tags", "true_levels"):
        levels = {tank: float(tags[tag]) if mode == "plc_tags" else initial[tank]["level_pct"] for tank, tag in TAGS.items()}
        events: list[dict[str, Any]] = []
        end, moved, on, overflow = _recirc.advance_hour(
            _MODEL, levels, demand, pump.level_on, duration_s=1770, on_transition=events.append
        )
        forecasts[mode] = {
            "initial_levels_pct": levels, "final_levels_pct": end, "recirculated_m3": moved,
            "final_on": on, "overflow": overflow,
            "events": [{**event, "t_s": 30 + event["t_s"]} for event in events],
            "total_inventory_change_m3": sum(capacities[tank] * (end[tank] - levels[tank]) / 100 for tank in TAGS),
        }
    integrals = {tank: {"in_m3": 0.0, "out_m3": 0.0, "max_step_residual_m3": 0.0} for tank in TAGS}
    previous = initial
    events = []
    was_on = pump.level_on
    output.parent.mkdir(parents=True, exist_ok=True)
    fields = ["t_s", "tank", "level_pct", "volume_m3", "in_m3h", "out_m3h", "step_residual_m3",
              "in_since_base_m3", "out_since_base_m3", "pump_on", "pump_speed_pct", "pump_flow_m3h", "pump_volume_m3"]
    with output.with_suffix(".csv").open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        while plant.t < 1800:
            plant.step()  # Ningún cambio de perfil: toda la prueba permanece en la hora 0.
            current = {tank: plant.equipment[tank].true_values() for tank in TAGS}
            for tank, values in current.items():
                density = densities[tank]
                incoming = values["inflow_kg_h"] / density
                outgoing = values["outflow_kg_h"] / density
                residual = (values["mass_kg"] - previous[tank]["mass_kg"]) / density - (incoming - outgoing) * plant.model.dt / 3600
                acc = integrals[tank]
                acc["in_m3"] += incoming * plant.model.dt / 3600
                acc["out_m3"] += outgoing * plant.model.dt / 3600
                acc["max_step_residual_m3"] = max(acc["max_step_residual_m3"], abs(residual))
                writer.writerow({
                    "t_s": plant.t, "tank": tank, "level_pct": values["level_pct"], "volume_m3": values["volume_l"] / 1000,
                    "in_m3h": incoming, "out_m3h": outgoing, "step_residual_m3": residual,
                    "in_since_base_m3": acc["in_m3"], "out_since_base_m3": acc["out_m3"],
                    "pump_on": pump.level_on, "pump_speed_pct": pump.speed * 100, "pump_flow_m3h": pump.flow,
                    "pump_volume_m3": pump.volume_m3 - initial_pump_volume,
                })
            if pump.level_on != was_on:
                events.append({
                    "t_s": plant.t, "action": "start" if pump.level_on else "stop",
                    "levels_pct": {tank: values["level_pct"] for tank, values in current.items()},
                    "pump_volume_m3": pump.volume_m3 - initial_pump_volume,
                    "received_supply_m3": integrals["tank-supply-01"]["in_m3"],
                })
            was_on = pump.level_on
            previous = current
    balances = {}
    for tank, values in previous.items():
        density = densities[tank]
        acc = integrals[tank]
        change = (values["mass_kg"] - initial[tank]["mass_kg"]) / density
        balances[tank] = {
            **acc, "volume_change_m3": change, "residual_m3": change - acc["in_m3"] + acc["out_m3"],
            "counter_in_m3": (values["total_in_kg"] - initial[tank]["total_in_kg"]) / density,
            "counter_out_m3": (values["total_out_kg"] - initial[tank]["total_out_kg"]) / density,
            "initial_level_pct": initial[tank]["level_pct"], "final_level_pct": values["level_pct"],
        }
        assert acc["max_step_residual_m3"] < 1e-8, (tank, acc)
        assert abs(balances[tank]["residual_m3"]) < 1e-8, (tank, balances[tank])
        for side in ("in", "out"):
            assert abs(balances[tank][f"counter_{side}_m3"] - acc[f"{side}_m3"]) < 1e-8
    result = {
        "scope": "P1-P3; C44, constant 30% opening; t=30..1800; no physics modifications",
        "coverage_t_s": [30, 1800], "emulator_dt_s": plant.model.dt, "profile_path": str(profile_path.relative_to(ROOT)),
        "distribution_fixed_for_fractal_m3h": demand, "emulator_events": events, "emulator_balances": balances,
        "emulator_total_inventory_change_m3": sum(b["volume_change_m3"] for b in balances.values()),
        "pump_accounted_m3": pump.volume_m3 - initial_pump_volume,
        "pump_minus_received_supply_m3": pump.volume_m3 - initial_pump_volume - integrals["tank-supply-01"]["in_m3"],
        "fractal": forecasts,
        "limits": [
            "P2 changes only initial tank levels; distribution remains identical across the two forecasts.",
            "Fractal per-tank internal inflow/outflow trace and step-size sensitivity still pending.",
            "No declaration of full-day parity or physical validation; sensor uncertainty not eliminated in baseline.",
        ],
    }
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    return result


if __name__ == "__main__":
    path = ROOT / "docs/architecture/validation/pdd-prs-c44-balance-first-cycle.json"
    result = run(path)
    print(json.dumps(result, ensure_ascii=False, indent=2))
