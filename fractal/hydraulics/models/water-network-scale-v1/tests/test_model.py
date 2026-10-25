from __future__ import annotations

import importlib.util
from pathlib import Path

MODEL_FILE = Path(__file__).resolve().parent.parent / "model.py"
spec = importlib.util.spec_from_file_location("fractal_water_model_test", MODEL_FILE)
model = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(model)
recirc_spec = importlib.util.spec_from_file_location("fractal_recirc_test", MODEL_FILE.with_name("recirculation.py"))
recirc = importlib.util.module_from_spec(recirc_spec)
assert recirc_spec and recirc_spec.loader
recirc_spec.loader.exec_module(recirc)


def base_tags() -> dict[str, float]:
    tags = {
        "PLC.PRS.CriticalPressureMca": 15.45,
        "PLC.PRS.OutletPressureMca": 20.94,
        "PLC.PRS.ManualSettingMca": 20.94,
        "PLC.Pump.FlowM3h": 11.53,
        "PLC.Pump.DischargePressureMca": 72.1,
        "PLC.Tank.Supply.LevelPct": 70,
    }
    consumption_per_level = (11.53 - 0.6) / 4
    for level in range(1, 5):
        leakage = 0.3 if level in (2, 4) else 0.0
        tags[f"PLC.Grid.L{level}.MinimumPressureMca"] = 15.45 + (4 - level) * 0.8
        tags[f"PLC.Grid.L{level}.ConsumptionM3h"] = consumption_per_level
        tags[f"PLC.Grid.L{level}.LeakageM3h"] = leakage
        for branch in range(1, 5):
            for position in range(1, 5):
                valve = f"C{branch}{position}"
                tags[f"PLC.Grid.L{level}.Consumer.{valve}.OpeningPct"] = 100
                tags[f"PLC.Grid.L{level}.Consumer.{valve}.FlowLMin"] = consumption_per_level * 1000 / 60 / 16
        if level in (2, 4):
            leak = "L1" if level == 2 else "L2"
            tags[f"PLC.Grid.L{level}.Leak.{leak}.OpeningPct"] = 100
            tags[f"PLC.Grid.L{level}.Leak.{leak}.FlowLMin"] = 0.3 * 1000 / 60
    for link in (12, 23, 34):
        tags[f"PLC.Valve.Vertical{link}OpeningPct"] = 100
    return tags


def test_declared_base_point_is_calibrated_and_feasible() -> None:
    result = model.evaluate(base_tags(), prs_mca=20.94)
    assert abs(result["critical_pressure_mca"] - 15.46149) < 0.03  # banco operativo, PRS manual 20,94 mca
    assert result["feasible"] is True
    assert result["constraint_results"]["pump_discharge"] is True
    assert result["constraint_results"]["hydraulic_convergence"] is True
    assert abs(result["flow_m3h"] - 11.53691) < 0.03
    assert abs(result["leakage_m3h"] - 1.28188) < 0.03


def test_valve_restriction_increases_loss_and_reduces_critical_pressure() -> None:
    tags = base_tags()
    baseline = model.evaluate(tags, prs_mca=20.94)
    restricted = model.evaluate(tags, prs_mca=20.94, vertical_openings_pct=(50, 100, 100))
    assert restricted["critical_pressure_mca"] < baseline["critical_pressure_mca"]
    assert restricted["feasible"] is False


def test_individual_household_closure_changes_only_projected_emitter_flow() -> None:
    tags = base_tags()
    baseline = model.evaluate(tags, prs_mca=20.94)
    tags["PLC.Grid.L4.Consumer.C44.OpeningPct"] = 0
    closed = model.evaluate(tags, prs_mca=20.94)
    assert len(closed["consumer_flows_l_min"]) == 64
    assert closed["consumer_flows_l_min"]["L4.C44"] == 0
    assert closed["flow_m3h"] < baseline["flow_m3h"]


def test_increased_pressure_increases_leakage_estimate() -> None:
    tags = base_tags()
    baseline = model.evaluate(tags, prs_mca=20.94)
    elevated = model.evaluate(tags, prs_mca=22)
    assert elevated["leakage_m3h"] > baseline["leakage_m3h"]


def test_nodal_solution_conserves_flow_at_every_branch_and_crossing() -> None:
    net = model._nodal.Network(model.MODEL, base_tags(), 20.94, (100, 100, 100), 1.0)
    _, _, converged = net.solve()
    assert converged
    for node in net.elevation.keys() - net.fixed.keys():
        imbalance = sum(edge.flow * (1 if edge.start == node else -1 if edge.end == node else 0) for edge in net.edges.values())
        assert abs(imbalance * 3600) < 1e-6, node


def test_nodal_solver_matches_independent_operational_reference_cases() -> None:
    # Cifras generadas con el banco network.py del emulador en rama manual,
    # velocidad fija 1.0; aquí son oráculo fijo, no dependencia del runtime.
    cases = (
        ("night", 18.46, 0.3, (100, 100, 100), {}, 15.4535, 4.2592, 1.2527),
        ("valve-23", 23.28, 1.0, (100, 50, 100), {}, 15.4628, 11.8728, 1.3192),
        ("leak-burst", 21.25, 1.0, (100, 100, 100), {"PLC.Grid.L2.Leak.L1.Scale": 5}, 15.4669, 12.2119, 1.9367),
    )
    for name, setting, demand, openings, extra, pressure, flow, leakage in cases:
        projected = model.evaluate(base_tags() | extra, prs_mca=setting, vertical_openings_pct=openings, demand_factor=demand)
        assert projected["constraint_results"]["hydraulic_convergence"], name
        assert abs(projected["critical_pressure_mca"] - pressure) < 0.04, name
        assert abs(projected["flow_m3h"] - flow) < 0.04, name
        assert abs(projected["leakage_m3h"] - leakage) < 0.04, name


def test_return_pump_matches_operational_fixed_head_point_and_balances_tanks() -> None:
    levels = {"tank-supply-01": 70, "tank-recirc-01": 70, "tank-recirc-02": 70}
    flow, first, second = recirc.pump_flow(model.MODEL, levels)
    # Red operativa a velocidad de régimen, mismas cabezas (tras la rampa de 20 s): ≈21,30 m³/h.
    assert abs(flow - 21.30) < 0.05
    assert abs(flow - first - second) < 0.001
    next_levels, recirculated, on, overflow = recirc.advance_hour(model.MODEL, levels, {str(level): 2.88 for level in range(1, 5)}, False)
    assert on and not overflow and recirculated > 0
    assert next_levels["tank-supply-01"] > levels["tank-supply-01"]
    capacities = {tank: model.MODEL["equipment_models"][tank]["params"]["volume_l"] / 1000 for tank in levels}
    before = sum(capacities[tank] * levels[tank] / 100 for tank in levels)
    after = sum(capacities[tank] * next_levels[tank] / 100 for tank in levels)
    assert abs(after - before) < 1e-5  # circuito cerrado; no crea ni destruye agua


def test_pump_curve_and_prs_auto_react_to_hydraulic_demand() -> None:
    tags = base_tags()
    tags["PLC.Pump.SetpointMca"] = 72.1
    nominal = model.evaluate(tags, prs_mca=20.94, prs_auto=True, critical_target_mca=15.45)
    night = model.evaluate(tags, prs_mca=20.94, demand_factor=0.3, prs_auto=True, critical_target_mca=15.45)
    assert abs(nominal["pump_discharge_mca"] - 72.1) < 0.02
    assert abs(nominal["prs_inlet_mca"] - 71.09) < 0.04
    assert abs(nominal["critical_pressure_mca"] - 15.45) < 0.01
    assert abs(night["critical_pressure_mca"] - 15.45) < 0.01
    assert night["prs_mca"] < nominal["prs_mca"]
    assert night["pump_speed_pct"] < nominal["pump_speed_pct"]
    assert nominal["constraint_results"]["prs_available"]
    tags["PLC.Pump.RunningCount"] = 0
    assert not model.evaluate(tags, prs_mca=20.94)["feasible"]


def test_fractal_reads_declared_pump_preset_and_network_routes() -> None:
    config = model.MODEL
    pump = config["equipment_models"]["pumpset-main-01"]["params"]
    assert pump["design_flow_m3h"] == 13
    assert pump["efficiency"] == 0.62
    assert ("prs-01", "grid-01") in model._pipe_lookup()
    assert model._pipe_loss(11.0, model._pipe_lookup()[("prs-01", "grid-01")]) > model._pipe_loss(
        5.0, model._pipe_lookup()[("prs-01", "grid-01")]
    )
