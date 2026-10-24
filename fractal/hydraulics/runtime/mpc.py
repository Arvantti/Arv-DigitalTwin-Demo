"""Proyección de horizonte Fractal desde tags PLC y perfil publicado."""

from __future__ import annotations

import importlib.util
from pathlib import Path
from typing import Any

from .instant_search import optimize

MODEL_DIR = Path(__file__).resolve().parents[1] / "models" / "water-network-scale-v1"
PARAMETERS = MODEL_DIR / "parameters.py"
_spec = importlib.util.spec_from_file_location("fractal_water_parameters", PARAMETERS)
_module = importlib.util.module_from_spec(_spec)
assert _spec and _spec.loader
_spec.loader.exec_module(_module)
_MODEL = _module.load()
_MODEL_PATH = MODEL_DIR / "model.py"
_model_spec = importlib.util.spec_from_file_location("fractal_water_solver", _MODEL_PATH)
_solver = importlib.util.module_from_spec(_model_spec)
assert _model_spec and _model_spec.loader
_model_spec.loader.exec_module(_solver)
_recirc_spec = importlib.util.spec_from_file_location("fractal_water_recirculation", MODEL_DIR / "recirculation.py")
_recirc = importlib.util.module_from_spec(_recirc_spec)
assert _recirc_spec and _recirc_spec.loader
_recirc_spec.loader.exec_module(_recirc)


def _snapshot(
    tags: dict[str, Any],
    state: dict[str, Any],
    tank_levels: dict[str, float],
    demand: float,
    openings: tuple[float, ...],
    entry: dict[str, Any],
) -> dict[str, Any]:
    """Construye el contrato visual desde estado PLC y resultados calculados por Fractal."""
    pressure = float(state["critical_pressure_mca"])
    leakage = float(state["leakage_m3h"])
    flow = float(state.get("flow_m3h", float(tags.get("PLC.Pump.FlowM3h") or 0) * demand))
    recirculation = float(tags.get("PLC.Pump.RecirculationFlowM3h") or 0)
    equipment: dict[str, Any] = {}
    for node in _MODEL["simulation"]["equipment"]:
        if node.startswith("tank-"):
            level = tank_levels[node]
            equipment[node] = {
                "state": "running",
                "phase": None,
                "animation": {"level": level / 100},
                "variables": {
                    "level_pct": level,
                    "volume_m3": float(_MODEL["simulation"]["equipment"][node]["params"]["volume_l"]) / 1000 * level / 100,
                },
            }
        elif node == "pumpset-main-01":
            running = int(state.get("pump_count", 2))
            equipment[node] = {
                "state": "running",
                "phase": None,
                "animation": {
                    "pump_1": 1 if running > 0 else 0,
                    "pump_2": 1 if running > 1 else 0,
                    "discharge_pressure_mca": state["pump_discharge_mca"],
                    "flow_norm": min(1, flow / 26),
                    "stack_light": 1,
                },
                "variables": {
                    "flow_m3h": flow,
                    "discharge_pressure_mca": state["pump_discharge_mca"],
                    "speed_pct": state["pump_speed_pct"],
                    "power_kw": state["pump_power_kw"],
                    "pumps_running": running,
                },
            }
        elif node == "pumpset-recirc-01":
            recirc = float(tags.get("PLC.Pump.RecirculationFlowM3h") or 0)
            equipment[node] = {
                "state": "running" if recirc else "idle",
                "phase": None,
                "animation": {
                    "pump_1": 1 if recirc else 0,
                    "pump_2": 1 if recirc else 0,
                    "discharge_pressure_mca": 15,
                    "flow_norm": min(1, recirc / 30),
                },
                "variables": {"flow_m3h": recirc},
            }
        elif node == "prs-01":
            outlet = float(state.get("prs_outlet_mca", tags.get("PLC.PRS.OutletPressureMca") or 20))
            branch_auto = entry.get("prs", {}).get("branch", "auto") == "auto"
            equipment[node] = {
                "state": "running",
                "phase": None,
                "animation": {
                    "valve_a_open": 1 if branch_auto else 0,
                    "valve_b_open": 0 if branch_auto else 1,
                    "flow_a_norm": min(1, flow / 26) if branch_auto else 0,
                    "flow_b_norm": 0 if branch_auto else min(1, flow / 26),
                    "inlet_pressure_mca": state["prs_inlet_mca"],
                    "outlet_pressure_mca": outlet,
                    "critical_pressure_mca": pressure,
                    "auto_setpoint_mca": outlet,
                    "stack_light": 1,
                },
                "variables": {
                    "inlet_pressure_mca": state["prs_inlet_mca"],
                    "outlet_pressure_mca": outlet,
                    "critical_pressure_mca": pressure,
                    "flow_m3h": flow,
                },
            }
        elif node.startswith("grid-"):
            level = int(node[-1])
            level_pressure = float(state.get("level_pressures_mca", {}).get(str(level), pressure + (4 - level) * 0.8))
            level_leak = float(state.get("leakage_by_level_m3h", {}).get(str(level), leakage / 4))
            global_pct = entry.get("global_consumers_pct")
            level_pct = entry.get("levels", {}).get(str(level), global_pct)
            dwellings = entry.get("dwellings", {}).get(node, {})
            animation = {"flow_in_norm": min(1, flow / 26), "inlet_pressure_mca": level_pressure, "min_pressure_mca": level_pressure}
            household_flow_l_min = (flow / 4) * 1000 / 60 / 4
            consumer_flows = state.get("consumer_flows_l_min", {})
            consumer_pressures = state.get("consumer_pressures_mca", {})
            for ramal in range(1, 5):
                for position in range(1, 5):
                    valve_id = f"c{level}{ramal}{position}"
                    opening_pct = float(
                        dwellings.get(
                            valve_id,
                            tags.get(
                                f"PLC.Grid.L{level}.Consumer.{valve_id.upper()}.OpeningPct", level_pct if level_pct is not None else 100
                            ),
                        )
                    )
                    animation[f"open_{valve_id}"] = opening_pct / 100
                    animation[f"q_{valve_id}"] = float(
                        consumer_flows.get(f"L{level}.{valve_id.upper()}", household_flow_l_min * opening_pct / 100)
                    )
                    if f"L{level}.{valve_id.upper()}" in consumer_pressures:
                        animation[f"p_{valve_id}"] = consumer_pressures[f"L{level}.{valve_id.upper()}"]
            leak_map = entry.get("leaks", {}).get(node, {})
            for leak_id in ("l1", "l2"):
                leak_opening = float(leak_map.get(leak_id, tags.get(f"PLC.Grid.L{level}.Leak.{leak_id.upper()}.OpeningPct", 100)))
                animation[f"open_{leak_id}"] = leak_opening / 100
                animation[f"q_{leak_id}"] = float(
                    state.get("leak_flows_l_min", {}).get(f"L{level}.{leak_id.upper()}", level_leak * 1000 / 120)
                )
                if f"L{level}.{leak_id.upper()}" in state.get("leak_pressures_mca", {}):
                    animation[f"p_{leak_id}"] = state["leak_pressures_mca"][f"L{level}.{leak_id.upper()}"]
            equipment[node] = {
                "state": "running",
                "phase": None,
                "animation": animation,
                "variables": {
                    "inlet_pressure_mca": level_pressure,
                    "flow_in_m3h": float(state.get("level_flows_m3h", {}).get(str(level), flow / 4)),
                    "consumption_m3h": float(state.get("level_flows_m3h", {}).get(str(level), flow / 4)) - level_leak,
                    "leakage_m3h": level_leak,
                    "min_pressure_mca": level_pressure,
                },
            }
        elif node.startswith("valve-between-"):
            key = node.removeprefix("valve-between-")
            index = (12, 23, 34).index(int(key))
            opening = openings[index]
            equipment[node] = {
                "state": "running",
                "phase": None,
                "animation": {"opening": opening / 100, "inlet_pressure_mca": pressure + 1, "outlet_pressure_mca": pressure},
                "variables": {"opening_pct": opening, "dp_mca": 0},
            }
    links: dict[str, Any] = {}
    level_flows = state["level_flows_m3h"]
    for link in _MODEL["simulation"].get("links", []):
        source, target = link["from"].split("."), link["to"].split(".")
        link_key = f"{source[0]}:{source[1]}>{target[0]}:{target[1]}"
        is_pressure_network = (
            source[0]
            in {
                "tank-supply-01",
                "pumpset-main-01",
                "prs-01",
                "grid-01",
                "grid-02",
                "grid-03",
                "valve-between-12",
                "valve-between-23",
                "valve-between-34",
            }
            and source[1] != "drain"
        )
        is_recirculation = source[0] in {"tank-recirc-01", "tank-recirc-02", "pumpset-recirc-01"}
        if source[0].startswith("grid-") and source[1] == "drain":
            link_flow = float(level_flows[str(int(source[0][-1]))])
        elif is_pressure_network and (source[0].startswith("valve-between-") or source[1] == "riser_out"):
            first_level = int(source[0][-1]) + (1 if source[1] == "riser_out" else 0)
            link_flow = sum(float(level_flows[str(level)]) for level in range(first_level, 5))
        elif is_pressure_network:
            link_flow = flow
        elif is_recirculation:
            link_flow = recirculation / 2 if source[0].startswith("tank-recirc-") else recirculation
        else:
            link_flow = 0.0
        links[link_key] = {
            "from": link["from"],
            "to": link["to"],
            "flow_kg_h": link_flow * 1000,
            "flowing": link_flow > 0,
        }
    return {
        "equipment": equipment,
        "links": links,
        "lines": {
            "red-distribucion": {
                "name": "Red de distribución (proyección Fractal)",
                "unit": "m³",
                "output_units": flow,
                "output_per_h": flow,
            },
            "recirculacion": {
                "name": "Recirculación (tags PLC)",
                "unit": "m³",
                "output_units": float(tags.get("PLC.Pump.RecirculationFlowM3h") or 0),
                "output_per_h": float(tags.get("PLC.Pump.RecirculationFlowM3h") or 0),
            },
        },
    }


def project_24h(
    tags: dict[str, Any],
    profile: dict[str, Any],
    study_type: str = "baseline",
    objective_id: str = "OBJ-LEAK-01",
    *,
    horizon_hours: int = 24,
) -> list[dict[str, Any]]:
    """Genera una rama horaria. Baseline y alternative nunca optimizan ni proponen mandos."""
    if not 1 <= horizon_hours <= 24:
        raise ValueError("horizon_hours debe estar entre 1 y 24")
    plan: list[dict[str, Any]] = []
    optimized_cache: dict[tuple[Any, ...], dict[str, Any]] = {}
    tank_levels = {
        "tank-supply-01": float(tags.get("PLC.Tank.Supply.LevelPct") or 70.0),
        "tank-recirc-01": float(tags.get("PLC.Tank.Recirc01.LevelPct") or 40.0),
        "tank-recirc-02": float(tags.get("PLC.Tank.Recirc02.LevelPct") or 40.0),
    }
    current_prs = float(tags.get("PLC.PRS.OutletPressureMca") or tags.get("PLC.PRS.ManualSettingMca") or 20.0)
    recirc_on = bool(tags.get("PLC.Pump.RecirculationAutoActive", tags.get("PLC.Pump.RecirculationFlowM3h") or 0))
    openings = tuple(
        float(tags.get(f"PLC.Valve.Vertical{n}OpeningPct") if tags.get(f"PLC.Valve.Vertical{n}OpeningPct") is not None else 100.0)
        for n in (12, 23, 34)
    )
    base_hour = int(float(tags.get("PLC.Session.SimulatedTime") or 0) // 3600) % 24
    carried_tags = dict(tags)  # Mandos horarios del PLC persisten cuando una hora no los redefine.
    prs_branch = "auto" if tags.get("PLC.PRS.BranchAuto") else "manual"
    critical_setpoint = float(tags.get("PLC.PRS.CriticalSetpointMca") or 15.45)
    for hour in range(horizon_hours):
        profile_hour = (base_hour + hour) % 24
        entry = profile.get("hours", {}).get(str(profile_hour), {})
        overrides = profile.get("overrides", {}) if study_type == "alternative" else {}
        global_pct = entry.get("global_consumers_pct")
        dwellings_by_grid = entry.get("dwellings", {})
        scenario_tags = dict(carried_tags)
        for tank_id, plc_id in (
            ("tank-supply-01", "PLC.Tank.Supply.LevelPct"),
            ("tank-recirc-01", "PLC.Tank.Recirc01.LevelPct"),
            ("tank-recirc-02", "PLC.Tank.Recirc02.LevelPct"),
        ):
            scenario_tags[plc_id] = tank_levels[tank_id]
        level_demands: list[float] = []
        for level in range(1, 5):
            level_pct = entry.get("levels", {}).get(str(level), global_pct)
            dwelling_overrides = dwellings_by_grid.get(f"grid-0{level}", {})
            openings_for_level: list[float] = []
            for branch in range(1, 5):
                for position in range(1, 5):
                    valve_id = f"c{branch}{position}"
                    tag_key = f"PLC.Grid.L{level}.Consumer.{valve_id.upper()}.OpeningPct"
                    current_opening = float(carried_tags.get(tag_key) if carried_tags.get(tag_key) is not None else 100.0)
                    target_opening = dwelling_overrides.get(valve_id, level_pct if level_pct is not None else current_opening)
                    scenario_tags[tag_key] = float(target_opening)
                    openings_for_level.append(float(target_opening))
            level_demands.append(sum(openings_for_level) / len(openings_for_level))
        profile_demand = sum(level_demands) / (100 * len(level_demands))
        demand_multiplier = float(overrides.get("demand_multiplier", 1.0))
        demand = max(0.0, profile_demand * demand_multiplier)
        prs_entry = entry.get("prs", {})
        current_prs = float(prs_entry.get("manual_setting_mca", current_prs))
        prs_branch = prs_entry.get("branch", prs_branch)
        critical_setpoint = float(prs_entry.get("critical_setpoint_mca", critical_setpoint))
        prs_setpoint = float(overrides.get("prs_mca", current_prs))
        prs_auto = prs_branch == "auto" and "prs_mca" not in overrides
        critical_target = critical_setpoint
        between = entry.get("between_levels", {})
        openings = tuple(float(between.get(str(n), opening)) for n, opening in zip((12, 23, 34), openings, strict=True))
        scenario_openings = tuple(
            float(overrides.get(f"valve_{n}_pct", opening)) for n, opening in zip((12, 23, 34), openings, strict=True)
        )
        leak_overrides = entry.get("leaks", {})
        leak_multiplier = float(overrides.get("leakage_multiplier", 1.0)) if study_type == "alternative" else 1.0
        for level in range(1, 5):
            valve_map = leak_overrides.get(f"grid-0{level}", {})
            for leak_id, opening_pct in valve_map.items():
                scenario_tags[f"PLC.Grid.L{level}.Leak.{leak_id.upper()}.OpeningPct"] = float(opening_pct)
            scenario_tags[f"PLC.Grid.L{level}.LeakageScale"] = leak_multiplier
        carried_tags.update({k: v for k, v in scenario_tags.items() if k.startswith("PLC.Grid.") and k.endswith(".OpeningPct")})
        factors = tuple(demand_multiplier * factor for factor in (0.9, 1.0, 1.1))
        scenarios: list[dict[str, Any]] = []
        optimized_controls: dict[str, Any] | None = None
        if study_type == "optimized":
            # La distribución estacionaria no cambia por la altura del tanque
            # mientras el bombeo pueda regular. Reutilizamos mandos candidatos
            # para horas con el mismo patrón; cada hora se comprueba de nuevo.
            key = (
                demand_multiplier,
                objective_id,
                tuple(sorted((name, value) for name, value in scenario_tags.items() if name.startswith("PLC.Grid."))),
            )
            if key not in optimized_cache:
                optimized_cache[key] = optimize(scenario_tags, demand_factor=demand_multiplier, objective_id=objective_id)["optimized"]
            optimized_controls = optimized_cache[key]
        for factor in factors:
            if optimized_controls is not None:
                candidate_prs = float(optimized_controls["prs_mca"])
                candidate_openings = tuple(float(optimized_controls[f"valve_{key}_pct"]) for key in ("12", "23", "34"))
                state = _solver.evaluate(
                    scenario_tags, prs_mca=candidate_prs, vertical_openings_pct=candidate_openings, demand_factor=factor
                )
            else:
                state = _solver.evaluate(
                    scenario_tags,
                    prs_mca=prs_setpoint,
                    vertical_openings_pct=scenario_openings,
                    demand_factor=factor,
                    prs_auto=prs_auto,
                    critical_target_mca=critical_target,
                )
            feasible = bool(state["feasible"])
            scenarios.append({"demand_factor": round(factor, 3), "state": state, "feasible": feasible})
        nominal_state = scenarios[1]["state"]
        # Una hora con control por nivel e histéresis; cada minuto usa la curva
        # de recirculación, la cabeza de los tres tanques y el caudal por piso.
        flow_out = float(nominal_state["flow_m3h"])
        tank_levels, recirc_volume, recirc_on, overflow = _recirc.advance_hour(
            _MODEL, tank_levels, nominal_state["level_flows_m3h"], recirc_on
        )
        supply_level = tank_levels["tank-supply-01"]
        recirc_end_flow, recirc_a, recirc_b = _recirc.pump_flow(_MODEL, tank_levels) if recirc_on else (0.0, 0.0, 0.0)
        levels_in_bounds = not overflow and all(0 <= value <= 100 for value in tank_levels.values())
        robust = all(item["feasible"] for item in scenarios) and levels_in_bounds and 20 <= supply_level <= 95
        nominal_state = scenarios[1]["state"]
        effective_openings = tuple(float(nominal_state[f"valve_{key}_pct"]) for key in ("12", "23", "34"))
        snapshot_entry = {
            **entry,
            "prs": {**prs_entry, "branch": "manual" if optimized_controls is not None else "auto" if prs_auto else "manual"},
        }
        frame_snapshot = _snapshot(scenario_tags, nominal_state, tank_levels, demand, effective_openings, snapshot_entry)
        recirc_snapshot = frame_snapshot["equipment"].get("pumpset-recirc-01")
        if recirc_snapshot:
            recirc_snapshot["state"] = "running" if recirc_on else "idle"
            recirc_snapshot["animation"].update({"pump_1": 1 if recirc_on else 0, "pump_2": 0, "flow_norm": min(1, recirc_end_flow / 15)})
            recirc_snapshot["variables"]["flow_m3h"] = round(recirc_end_flow, 4)
        for link in frame_snapshot["links"].values():
            source = link["from"].split(".", 1)[0]
            if source in {"tank-recirc-01", "tank-recirc-02", "pumpset-recirc-01"}:
                branch_flow = recirc_a if source == "tank-recirc-01" else recirc_b if source == "tank-recirc-02" else recirc_end_flow
                link["flow_kg_h"] = branch_flow * 1000
                link["flowing"] = branch_flow > 0
        frame_snapshot["lines"]["recirculacion"].update({"output_units": recirc_volume, "output_per_h": recirc_volume})
        forecast_tags = dict(tags)
        forecast_tags.update(
            {
                "PLC.Session.SimulatedTime": float(tags.get("PLC.Session.SimulatedTime") or 0) + (hour + 1) * 3600,
                "PLC.Profile.CurrentHour": profile_hour,
                "PLC.Tank.Supply.LevelPct": round(supply_level, 3),
                "PLC.Tank.Recirc01.LevelPct": round(tank_levels["tank-recirc-01"], 3),
                "PLC.Tank.Recirc02.LevelPct": round(tank_levels["tank-recirc-02"], 3),
                "PLC.Pump.FlowM3h": round(flow_out, 4),
                "PLC.Pump.DischargePressureMca": nominal_state["pump_discharge_mca"],
                "PLC.Pump.SpeedPct": nominal_state["pump_speed_pct"],
                "PLC.Pump.PowerKw": nominal_state["pump_power_kw"],
                "PLC.Pump.RecirculationFlowM3h": round(recirc_end_flow, 4),
                "PLC.Pump.RecirculationAutoActive": recirc_on,
                "PLC.PRS.CriticalPressureMca": nominal_state["critical_pressure_mca"],
                "PLC.PRS.OutletPressureMca": nominal_state["prs_outlet_mca"],
                "PLC.PRS.InletPressureMca": nominal_state["prs_inlet_mca"],
                "PLC.PRS.BranchAuto": prs_auto and optimized_controls is None,
            }
        )
        for connection, opening in zip((12, 23, 34), effective_openings, strict=True):
            forecast_tags[f"PLC.Valve.Vertical{connection}OpeningPct"] = opening
        for level in range(1, 5):
            prefix = f"PLC.Grid.L{level}"
            forecast_tags[f"{prefix}.ConsumptionM3h"] = max(
                0.0, nominal_state["level_flows_m3h"][str(level)] - nominal_state["leakage_by_level_m3h"][str(level)]
            )
            forecast_tags[f"{prefix}.LeakageM3h"] = nominal_state["leakage_by_level_m3h"][str(level)]
            forecast_tags[f"{prefix}.MinimumPressureMca"] = nominal_state["level_pressures_mca"][str(level)]
            for branch in range(1, 5):
                for position in range(1, 5):
                    valve_id = f"C{branch}{position}"
                    tag_prefix = f"{prefix}.Consumer.{valve_id}"
                    forecast_tags[f"{tag_prefix}.OpeningPct"] = scenario_tags.get(f"{tag_prefix}.OpeningPct", 100)
                    forecast_tags[f"{tag_prefix}.FlowLMin"] = nominal_state["consumer_flows_l_min"].get(f"L{level}.{valve_id}", 0)
                    forecast_tags[f"{tag_prefix}.PressureMca"] = nominal_state["consumer_pressures_mca"].get(
                        f"L{level}.{valve_id}", nominal_state["level_pressures_mca"][str(level)]
                    )
            for leak_id in ("L1", "L2"):
                tag_prefix = f"{prefix}.Leak.{leak_id}"
                forecast_tags[f"{tag_prefix}.OpeningPct"] = scenario_tags.get(f"{tag_prefix}.OpeningPct", 100)
                forecast_tags[f"{tag_prefix}.FlowLMin"] = nominal_state["leak_flows_l_min"].get(f"L{level}.{leak_id}", 0)
                forecast_tags[f"{tag_prefix}.PressureMca"] = nominal_state["leak_pressures_mca"].get(
                    f"L{level}.{leak_id}", nominal_state["level_pressures_mca"][str(level)]
                )
        plan.append(
            {
                "hour": hour,
                "profile_hour": profile_hour,
                "temporal_context": "forecast",
                "study_type": study_type,
                "applied": False,
                "profile_commands": entry,
                "scenarios": scenarios,
                "snapshot": frame_snapshot,
                "plc_tags": forecast_tags,
                "supply_level_pct": round(supply_level, 3),
                "tank_levels_pct": {tank: round(level, 3) for tank, level in tank_levels.items()},
                "robust": robust,
                "out_of_bounds": not levels_in_bounds,
                "commands": (
                    {
                        "prs": {"branch": "manual", "manual_setting_mca": scenarios[1]["state"]["prs_mca"]},
                        "between_levels": {key: scenarios[1]["state"][f"valve_{key}_pct"] for key in ("12", "23", "34")},
                    }
                    if study_type == "optimized"
                    else {}
                ),
            }
        )
    return plan
