"""Solución nodal hidráulica Fractal; independiente del runtime operativo."""

from __future__ import annotations

import importlib.util
import math
from pathlib import Path
from typing import Any

HERE = Path(__file__).parent


def _load(name: str, filename: str) -> Any:
    spec = importlib.util.spec_from_file_location(name, HERE / filename)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    # dataclasses resuelve anotaciones a través de sys.modules
    import sys

    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


_config = _load("fractal_water_model_parameters", "parameters.py")
_nodal = _load("fractal_water_nodal", "nodal.py")
_supply = _load("fractal_water_supply", "supply.py")
MODEL = _config.load()
MIN_PRESSURE_MCA = float(MODEL["constraints"]["critical_pressure_min_mca"])
PUMP_MIN_MCA = float(MODEL["constraints"]["pump_discharge_min_mca"])


def _pipe_lookup() -> dict[tuple[str, str], dict[str, Any]]:
    return {(pipe["from"], pipe["to"]): pipe for pipe in MODEL["plant"]["flows"] if pipe.get("piped")}


def _pipe_loss(flow_m3h: float, pipe: dict[str, Any]) -> float:
    """Pérdida aproximada del tubo aislado, útil para verificar monotonicidad."""
    points = pipe.get("route") or []
    length = sum(math.dist(a, b) for a, b in zip(points, points[1:], strict=False))
    d = float(pipe["inner_diameter_mm"]) / 1000 if pipe.get("inner_diameter_mm") else _nodal.INNER_DIAMETER_M[float(pipe["diameter_in"])]
    area = math.pi * d**2 / 4
    velocity = flow_m3h / 3600 / area
    re = abs(velocity) * d / 1e-6
    friction = 64 / max(re, 1e-9) if re < 2000 else 0.25 / math.log10(1.5e-6 / d / 3.7 + 5.74 / re**0.9) ** 2
    return (friction * length / d + float(pipe.get("minor_k", 0.5))) * velocity**2 / (2 * _nodal.G)


def evaluate(
    tags: dict[str, Any],
    *,
    prs_mca: float,
    vertical_openings_pct: tuple[float, float, float] = (100.0, 100.0, 100.0),
    demand_factor: float = 1.0,
    prs_auto: bool = False,
    critical_target_mca: float | None = None,
    critical_consumer_id: str | None = None,
) -> dict[str, Any]:
    """Acopla la red nodal con curva de bomba, disponibilidad PRS y lazo AUTO asentado."""

    def solve_at(setting: float) -> tuple[Any, dict[str, float], dict[str, float], bool, dict[str, Any]]:
        estimate = max(0.0, float(tags.get("PLC.Pump.FlowM3h") or 11.53) * max(0.0, demand_factor))
        supply = _supply.pump_and_prs(MODEL, tags, estimate, setting)
        net = _nodal.Network(MODEL, tags, float(supply["prs_outlet_mca"]), vertical_openings_pct, demand_factor)
        pressures, flows, converged = net.solve()
        for _ in range(3):
            measured = sum(
                flows[f"L{level}.C{branch}{position}"] for level in range(1, 5) for branch in range(1, 5) for position in range(1, 5)
            )
            measured += sum(flows[f"L{level}.L{leak}"] for level in range(1, 5) for leak in (1, 2))
            supply = _supply.pump_and_prs(MODEL, tags, measured, setting)
            if abs(float(supply["prs_outlet_mca"]) - net.fixed["prs"] + net.elevation["prs"]) < 1e-5:
                break
            net = _nodal.Network(MODEL, tags, float(supply["prs_outlet_mca"]), vertical_openings_pct, demand_factor)
            pressures, flows, converged = net.solve()
        return net, pressures, flows, converged, supply

    setting = float(prs_mca)
    net, pressures, flows, converged, supply = solve_at(setting)
    if prs_auto:
        station = MODEL["equipment_models"]["prs-01"]["params"]
        target = float(
            critical_target_mca
            if critical_target_mca is not None
            else tags.get("PLC.PRS.CriticalSetpointMca") or station["critical_setpoint_mca"]
        )
        for _ in range(5):
            critical_now = (
                pressures[net.emitters[critical_consumer_id]]
                if critical_consumer_id is not None
                else min(
                    pressures[net.emitters[f"L{level}.C{branch}{position}"]]
                    for level in range(1, 5)
                    for branch in range(1, 5)
                    for position in range(1, 5)
                )
            )
            if abs(critical_now - target) < 0.002:
                break
            setting = min(
                float(station["auto_max_outlet_mca"]), max(float(station["auto_min_outlet_mca"]), setting + target - critical_now)
            )
            net, pressures, flows, converged, supply = solve_at(setting)
    consumer_flows: dict[str, float] = {}
    consumer_pressures: dict[str, float] = {}
    leak_flows: dict[str, float] = {}
    leak_pressures: dict[str, float] = {}
    level_flows: dict[str, float] = {}
    leakage_by_level: dict[str, float] = {}
    level_pressures: dict[str, float] = {}
    for level in range(1, 5):
        prefix = f"L{level}."
        consumers = [f"{prefix}C{branch}{position}" for branch in range(1, 5) for position in range(1, 5)]
        leaks = [f"{prefix}L{index}" for index in (1, 2)]
        consumer_flows.update({key: round(float(flows[key]) * 1000 / 60, 5) for key in consumers})
        consumer_pressures.update({key: round(pressures[net.emitters[key]], 5) for key in consumers})
        leak_flows.update({key: round(float(flows[key]) * 1000 / 60, 5) for key in leaks})
        leak_pressures.update({key: round(pressures[net.emitters[key]], 5) for key in leaks})
        level_flows[str(level)] = round(float(sum(flows[key] for key in consumers + leaks)), 5)
        leakage_by_level[str(level)] = round(float(sum(flows[key] for key in leaks)), 5)
        level_pressures[str(level)] = round(float(min(pressures[net.emitters[key]] for key in consumers)), 5)
    critical = min(level_pressures.values())
    total_flow = sum(level_flows.values())
    leakage = sum(leakage_by_level.values())
    pump_cfg = MODEL["equipment_models"]["pumpset-main-01"]["params"]
    pump_count = int(pump_cfg.get("min_running", pump_cfg.get("pumps", 2)))
    pump_flow_limit = pump_count * float(pump_cfg["design_flow_m3h"])
    discharge = float(supply["pump_discharge_mca"])
    energy_kw = float(supply["pump_power_kw"])
    tank_level = float(tags.get("PLC.Tank.Supply.LevelPct") or 0)
    constraints = {
        "hydraulic_convergence": converged,
        "critical_pressure": critical >= MIN_PRESSURE_MCA,
        "pump_discharge": discharge >= PUMP_MIN_MCA,
        "pump_capacity": total_flow <= pump_flow_limit and bool(supply["pump_control_feasible"]),
        "prs_available": bool(supply["prs_regulating"]),
        "supply_tank_range": 0 <= tank_level <= 100,
        "valve_openings": all(0 <= opening <= 100 for opening in vertical_openings_pct),
    }
    return {
        "critical_pressure_mca": critical,
        "level_pressures_mca": level_pressures,
        "consumer_flows_l_min": consumer_flows,
        "consumer_pressures_mca": consumer_pressures,
        "control_point_pressure_mca": consumer_pressures.get(critical_consumer_id) if critical_consumer_id else critical,
        "leak_flows_l_min": leak_flows,
        "leak_pressures_mca": leak_pressures,
        "level_flows_m3h": level_flows,
        "leakage_m3h": round(leakage, 5),
        "leakage_by_level_m3h": leakage_by_level,
        "flow_m3h": round(total_flow, 5),
        "pump_discharge_mca": round(discharge, 4),
        "pump_power_kw": round(energy_kw, 4),
        "pump_speed_pct": supply["pump_speed_pct"],
        "pump_speed_required_pct": supply["pump_speed_required_pct"],
        "pump_suction_mca": supply["pump_suction_mca"],
        "pump_count": supply["pump_count"],
        "prs_inlet_mca": supply["prs_inlet_mca"],
        "prs_outlet_mca": supply["prs_outlet_mca"],
        "supply_level_pct": round(tank_level, 3),
        "prs_mca": round(setting, 4),
        "valve_12_pct": round(float(vertical_openings_pct[0]), 3),
        "valve_23_pct": round(float(vertical_openings_pct[1]), 3),
        "valve_34_pct": round(float(vertical_openings_pct[2]), 3),
        "feasible": all(constraints.values()),
        "constraint_results": constraints,
    }
