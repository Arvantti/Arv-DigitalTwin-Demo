import io
import json

import pytest
from fastapi.testclient import TestClient
from fractal_engineering_api import main as fractal_api
from fractal_engineering_api.main import app

from fractal.hydraulics.runtime import mpc
from fractal.optimization import instant_search, optimizer

client = TestClient(app)


def test_from_plc_rejects_a_profile_different_from_the_session_history(monkeypatch) -> None:
    monkeypatch.setenv("FRACTAL_PLC_API_URL", "https://plc.example")
    def read_active_session(_url, *_args):
        return {
            "id": "session-1",
            "plant_id": "water-network-scale-v1",
            "profile_id": "active-profile",
            "running": True,
            "paused": False,
        }

    monkeypatch.setattr(fractal_api, "gateway_json", read_active_session)
    response = client.post(
        "/studies/horizon/from-plc",
        json={"plant_id": "water-network-scale-v1", "session_id": "session-1", "profile_id": "different-profile"},
    )
    assert response.status_code == 409
    assert "perfil activo del PLC" in response.json()["detail"]


def test_out_of_calibration_range_does_not_produce_an_acceptable_profile(monkeypatch) -> None:
    monkeypatch.setattr(
        fractal_api,
        "submit_optimization_job",
        lambda *_args: {
            "job_id": "OPT-test",
            "hours": [{"profile_hour": 0, "commands": {"constraints_satisfied": False}}],
            "requires_operator_acceptance": False,
            "draft_profile": None,
            "vrp_opening_profile_pct": {"0": None},
            "vrp_opening_required_profile_pct": {"0": None},
        },
    )
    response = client.post(
        "/studies/horizon",
        json={
            "session_id": "session-test",
            "plc_tags": {},
            "profile": {"hours": {}},
            "objective_id": "OBJ-PRESSURE-MIN",
            "target_pressure_mca": 18,
            "study_type": "optimized",
        },
    )
    assert response.status_code == 200
    assert response.json()["draft_profile"] is None
    assert response.json()["requires_operator_acceptance"] is False


def test_horizon_rejects_unsupported_objectives() -> None:
    response = client.post(
        "/studies/horizon",
        json={
            "session_id": "session-test",
            "plc_tags": {},
            "profile": {"hours": {}},
            "objective_id": "OBJ-ENERGY-01",
            "study_type": "baseline",
        },
    )
    assert response.status_code == 422
    assert "solo está disponible" in response.json()["detail"]


def test_publish_optimization_run_sends_immutable_forecast_frames(monkeypatch) -> None:
    seen = {}
    profile = {"id": "PFL-run", "hours": {"0": {"global_consumers_pct": 42}}}
    study = {
        "optimization_job_id": "OPT-run",
        "study_id": "EST-run",
        "objective_id": "OBJ-PRESSURE-MIN",
        "target_pressure_mca": 20,
        "base_time": 900,
        "hours": [{
            "profile_hour": 0,
            "plc_tags": {"PLC.Session.SimulatedTime": 3600},
            "snapshot": {"equipment": {"grid-01": {"state": "ok"}}},
            "commands": {"target_pressure_mca": 20},
        }],
    }

    def fake_urlopen(request, timeout):
        seen["url"] = request.full_url
        seen["payload"] = json.loads(request.data)
        seen["timeout"] = timeout
        return io.BytesIO(b'{"run_id":"OPT-run"}')

    monkeypatch.setattr(fractal_api, "urlopen", fake_urlopen)
    response = fractal_api.publish_optimization_run(
        "http://plc.local", "water-network-scale-v1", "session-1", "CMP-1", profile, study, "demo-token"
    )
    assert response["run_id"] == "OPT-run"
    assert seen["url"].endswith("/comparisons/CMP-1/runs")
    assert seen["payload"]["applied_to_plc"] is False
    assert seen["payload"]["study_id"] == "EST-run"
    assert seen["payload"]["target_pressure_mca"] == 20
    assert seen["payload"]["profile_hash"] == fractal_api.profile_fingerprint(profile)
    assert seen["payload"]["frames"][0]["simulation_time_s"] == 3600
    assert seen["payload"]["frames"][0]["temporal_context"] == "forecast"
    assert seen["payload"]["frames"][0]["state"]["snapshot"] == study["hours"][0]["snapshot"]
    assert seen["timeout"] == 15


def test_gateway_json_forwards_the_anonymous_demo_capability(monkeypatch) -> None:
    seen = {}

    def fake_urlopen(request, timeout):
        seen["headers"] = dict(request.header_items())
        seen["timeout"] = timeout
        return io.BytesIO(b'{"id":"session-1"}')

    monkeypatch.setattr(fractal_api, "urlopen", fake_urlopen)
    assert fractal_api.gateway_json("https://gateway.example/api/session", "demo-capability") == {"id": "session-1"}
    assert seen["headers"]["Authorization"] == "Bearer demo-capability"
    assert seen["timeout"] == 10


def test_horizon_baseline_is_forecast_without_operator_acceptance() -> None:
    response = client.post(
        "/studies/horizon",
        json={
            "session_id": "session-test",
            "plc_tags": {
                "PLC.Tank.Supply.LevelPct": 70,
                "PLC.Pump.FlowM3h": 1,
                "PLC.Pump.RecirculationFlowM3h": 0,
                "PLC.PRS.ManualSettingMca": 20,
                "PLC.PRS.CriticalPressureMca": 17,
            },
            "profile": {"hours": {}},
            "objective_id": "OBJ-PRESSURE-MIN",
            "study_type": "baseline",
        },
    )
    assert response.status_code == 200
    study = response.json()
    assert study["temporal_context"] == "forecast"
    assert study["validation_status"] == "hydraulic_setpoints_only"
    assert study["applied"] is False
    assert study["requires_operator_acceptance"] is False
    assert len(study["hours"]) == 24
    assert all(hour["study_type"] == "baseline" for hour in study["hours"])
    frame = study["hours"][0]
    assert set(frame["snapshot"]["equipment"]) >= {"tank-supply-01", "pumpset-main-01", "prs-01", "grid-04"}
    assert frame["snapshot"]["equipment"]["tank-supply-01"]["animation"]["level"] >= 0
    assert frame["temporal_context"] == "forecast" and frame["applied"] is False
    snapshot = frame["snapshot"]
    states = frame["scenarios"][0]["state"]
    first_riser = snapshot["links"]["grid-01:riser_out>valve-between-12:inlet"]["flow_kg_h"] / 1000
    assert abs(first_riser - sum(states["level_flows_m3h"][str(level)] for level in (2, 3, 4))) < 0.0001
    return_1 = snapshot["links"]["drain-manifold-01:tank_1_out>tank-recirc-01:inlet"]
    return_2 = snapshot["links"]["drain-manifold-01:tank_2_out>tank-recirc-02:inlet"]
    assert return_1["flowing"] and return_2["flowing"]
    assert (return_1["flow_kg_h"] + return_2["flow_kg_h"]) / 1000 == pytest.approx(sum(frame["end_state"]["level_flows_m3h"].values()))
    for level in range(1, 5):
        grid = snapshot["equipment"][f"grid-0{level}"]
        assert grid["animation"]["q_l1"] > 0 and grid["animation"]["q_l2"] > 0
        drain = snapshot["links"][f"grid-0{level}:drain>drain-manifold-01:floor_{level}_in"]
        assert abs(drain["flow_kg_h"] / 1000 - states["level_flows_m3h"][str(level)]) < 0.0001


def test_forecast_frames_represent_tank_changes_and_return_flows() -> None:
    tags = {
        "PLC.Tank.Supply.LevelPct": 70,
        "PLC.Tank.Recirc01.LevelPct": 40,
        "PLC.Tank.Recirc02.LevelPct": 40,
        "PLC.Pump.RecirculationAutoActive": False,
    }
    profile = {"hours": {"0": {"global_consumers_pct": 50}, "1": {"global_consumers_pct": 50}}}
    frames = mpc.project_24h(tags, profile, horizon_hours=2)

    supply_levels = [frame["snapshot"]["equipment"]["tank-supply-01"]["variables"]["level_pct"] for frame in frames]
    return_levels = [frame["snapshot"]["equipment"]["tank-recirc-01"]["variables"]["level_pct"] for frame in frames]
    assert supply_levels[0] != pytest.approx(supply_levels[1])
    assert return_levels[0] != pytest.approx(return_levels[1])
    for frame in frames:
        links = frame["snapshot"]["links"]
        assert links["drain-manifold-01:tank_1_out>tank-recirc-01:inlet"]["flow_kg_h"] > 0
        assert links["drain-manifold-01:tank_2_out>tank-recirc-02:inlet"]["flow_kg_h"] > 0


def test_horizon_starts_with_partial_interval_to_absolute_plc_hour_boundary() -> None:
    tags = {
        "PLC.Session.SimulatedTime": 30,
        "PLC.Tank.Supply.LevelPct": 70,
        "PLC.Tank.Recirc01.LevelPct": 40,
        "PLC.Tank.Recirc02.LevelPct": 40,
        "PLC.Pump.RecirculationAutoActive": False,
    }
    frames = mpc.project_24h(tags, {"hours": {}}, horizon_hours=2)
    assert [frame["duration_s"] for frame in frames] == [3570, 3600]
    assert [frame["start_t_s"] for frame in frames] == [30, 3600]
    assert [frame["end_t_s"] for frame in frames] == [3600, 7200]
    assert [frame["profile_hour"] for frame in frames] == [0, 1]
    assert frames[0]["snapshot"]["equipment"]["pumpset-main-01"]["variables"]["flow_m3h"] == frames[0]["end_state"]["flow_m3h"]


def test_fixed_outlet_prs_profile_checks_every_dwelling_and_keeps_auto_branch() -> None:
    tags = {
        "PLC.Session.SimulatedTime": 30,
        "PLC.Tank.Supply.LevelPct": 70,
        "PLC.Tank.Recirc01.LevelPct": 40,
        "PLC.Tank.Recirc02.LevelPct": 40,
        "PLC.Pump.FlowM3h": 11.53,
        "PLC.Pump.RunningCount": 2,
        "PLC.Pump.DischargePressureMca": 72,
        "PLC.Pump.SetpointMca": 70,
        "PLC.PRS.InletPressureMca": 70,
        "PLC.PRS.OutletPressureMca": 20,
        "PLC.PRS.BranchAuto": True,
        "PLC.PRS.CriticalSetpointMca": 15.45,
        "PLC.Pump.RecirculationAutoActive": False,
    }
    profile = {
        "hours": {
            "0": {
                "global_consumers_pct": 30,
                "prs": {
                    "branch": "auto",
                    "control_mode": "fixed_outlet",
                    "inlet_pressure_mca": 70,
                    "auto_outlet_mca": 40,
                },
            }
        }
    }
    frame = mpc.project_24h(tags, profile, horizon_hours=1)[0]
    state = frame["end_state"]
    dwelling_min = min(state["consumer_pressures_mca"].values())
    assert frame["plc_tags"]["PLC.Pump.SetpointMca"] == 70
    next_boundary = {**tags, "PLC.Session.SimulatedTime": 3600}
    next_profile = {"hours": {"1": profile["hours"]["0"]}}
    boundary_frame = mpc.project_24h(next_boundary, next_profile, horizon_hours=1)[0]
    assert abs(boundary_frame["plc_tags"]["PLC.Pump.SetpointMca"] - 72) < 0.01
    assert state["prs_mca"] == 40
    assert state["prs_inlet_mca"] > 40
    assert state["prs_outlet_mca"] <= 40
    assert dwelling_min == state["critical_pressure_mca"] and dwelling_min >= 15
    assert all(min(item["state"]["consumer_pressures_mca"].values()) >= 15 for item in frame["scenarios"])
    assert frame["plc_tags"]["PLC.PRS.BranchAuto"] is True
    assert frame["snapshot"]["equipment"]["prs-01"]["animation"]["valve_b_open"] == 0


def test_critical_point_prs_controls_c44_but_checks_all_houses_and_keeps_global_telemetry() -> None:
    tags = {
        "PLC.Session.SimulatedTime": 30,
        "PLC.Tank.Supply.LevelPct": 70,
        "PLC.Tank.Recirc01.LevelPct": 40,
        "PLC.Tank.Recirc02.LevelPct": 40,
        "PLC.Pump.FlowM3h": 11.53,
        "PLC.Pump.RunningCount": 2,
        "PLC.Pump.DischargePressureMca": 72,
        "PLC.Pump.SetpointMca": 70,
        "PLC.PRS.InletPressureMca": 70,
        "PLC.PRS.OutletPressureMca": 20,
        "PLC.PRS.BranchAuto": True,
        "PLC.PRS.CriticalSetpointMca": 18,
        "PLC.Pump.RecirculationAutoActive": False,
    }
    profile = {
        "hours": {
            "0": {
                "prs": {
                    "branch": "auto",
                    "control_mode": "critical_point",
                    "critical_control_point": "L4.C44",
                    "critical_setpoint_mca": 18,
                }
            }
        }
    }
    frame = mpc.project_24h(tags, profile, horizon_hours=1)[0]
    state = frame["end_state"]
    assert frame["profile_commands"]["prs"]["critical_control_point"] == "L4.C44"
    assert state["control_point_pressure_mca"] == pytest.approx(18, abs=0.003)
    assert state["consumer_pressures_mca"]["L4.C44"] == state["control_point_pressure_mca"]
    assert state["critical_pressure_mca"] == min(state["consumer_pressures_mca"].values())
    assert state["critical_pressure_mca"] >= 15
    assert all(min(scenario["state"]["consumer_pressures_mca"].values()) >= 15 for scenario in frame["scenarios"])
    assert all(
        scenario["state"]["consumer_pressures_mca"]["L4.C44"]
        == min(scenario["state"]["consumer_pressures_mca"].values())
        for scenario in frame["scenarios"]
    )
    prs_snapshot = frame["snapshot"]["equipment"]["prs-01"]
    assert prs_snapshot["animation"]["critical_pressure_mca"] == state["control_point_pressure_mca"]
    assert prs_snapshot["variables"]["control_point_pressure_mca"] == state["control_point_pressure_mca"]
    assert prs_snapshot["variables"]["critical_pressure_mca"] == state["critical_pressure_mca"]
    assert prs_snapshot["animation"]["valve_b_open"] == 0


def test_horizon_transition_trace_is_observational() -> None:
    tags = {
        "PLC.Session.SimulatedTime": 30,
        "PLC.Tank.Supply.LevelPct": 30,
        "PLC.Tank.Recirc01.LevelPct": 70,
        "PLC.Tank.Recirc02.LevelPct": 70,
        "PLC.Pump.RecirculationAutoActive": False,
    }
    events = []
    plain = mpc.project_24h(tags, {"hours": {}}, horizon_hours=1)
    traced = mpc.project_24h(tags, {"hours": {}}, horizon_hours=1, on_recirculation_transition=events.append)
    assert plain == traced
    assert events and events[0]["action"] == "start" and events[0]["t_s"] >= 30


def test_sparse_custom_profile_keeps_hourly_house_and_leak_commands() -> None:
    tags = {
        "PLC.Session.SimulatedTime": 30,
        "PLC.Tank.Supply.LevelPct": 70,
        "PLC.Tank.Recirc01.LevelPct": 40,
        "PLC.Tank.Recirc02.LevelPct": 40,
        "PLC.Pump.FlowM3h": 11,
        "PLC.PRS.OutletPressureMca": 20.94,
        "PLC.PRS.BranchAuto": 1,
        "PLC.Grid.L1.Consumer.C11.OpeningPct": 100,
        "PLC.Grid.L1.Leak.L1.OpeningPct": 100,
    }
    profile = {"hours": {"0": {"global_consumers_pct": 30, "leaks": {"grid-01": {"l1": 0}}}}}
    frames = mpc.project_24h(tags, profile, horizon_hours=2)
    for frame in frames:
        assert frame["plc_tags"]["PLC.Grid.L1.Consumer.C11.OpeningPct"] == 30
        assert frame["plc_tags"]["PLC.Grid.L1.Leak.L1.OpeningPct"] == 0


def test_legacy_alternative_overrides_are_rejected_to_preserve_profile_inputs() -> None:
    response = client.post("/studies/horizon", json={"study_type": "alternative"})
    assert response.status_code == 422
    assert "seleccione el perfil guardado" in response.json()["detail"]


def test_optimized_hour_uses_selected_controls_in_snapshot_and_forecast_tags(monkeypatch) -> None:
    calls = []

    def fake_optimize(tags, *, vertical_openings_pct, **_kwargs):
        calls.append({
            "vertical": vertical_openings_pct,
            "dwelling": tags.get("PLC.Grid.L1.Consumer.C11.OpeningPct"),
            "leak": tags.get("PLC.Grid.L1.Leak.L1.OpeningPct"),
        })
        return {
            "fixed_flows_m3h": {},
            "optimized": {
                "prs_mca": 22.0,
                "valve_12_pct": vertical_openings_pct[0],
                "valve_23_pct": vertical_openings_pct[1],
                "valve_34_pct": vertical_openings_pct[2],
                "vrp_opening_pct": 72.0,
                "target_pressure_mca": 18.0,
                "applied_pressure_target_mca": 18.0,
                "target_met": True,
            }
        }

    monkeypatch.setattr(instant_search, "optimize", fake_optimize)
    tags = {
        "PLC.Pump.FlowM3h": 10.0,
        "PLC.Pump.DischargePressureMca": 72.1,
        "PLC.PRS.OutletPressureMca": 20.94,
        "PLC.PRS.CriticalPressureMca": 15.45,
        "PLC.Tank.Supply.LevelPct": 70,
        "PLC.Tank.Recirc01.LevelPct": 50,
        "PLC.Tank.Recirc02.LevelPct": 50,
        **{f"PLC.Grid.L{level}.MinimumPressureMca": 15.45 + (4 - level) * 0.8 for level in range(1, 5)},
        **{f"PLC.Grid.L{level}.ConsumptionM3h": 2.5 for level in range(1, 5)},
    }
    profile = {"hours": {
        "0": {"global_consumers_pct": 40, "between_levels": {"12": 80}},
        "1": {
            "global_consumers_pct": 60,
            "dwellings": {"grid-01": {"c11": 25}},
            "leaks": {"grid-01": {"l1": 35}},
            "between_levels": {"12": 50},
        },
    }}
    frames = mpc.project_24h(tags, profile, study_type="optimized", target_pressure_mca=18, horizon_hours=2)
    frame = frames[0]
    assert frame["snapshot"]["equipment"]["valve-between-12"]["animation"]["opening"] == 0.8
    assert frame["plc_tags"]["PLC.Valve.Vertical12OpeningPct"] == 80.0
    assert frame["commands"]["vrp_opening_pct"] == 72.0
    assert frame["commands"]["target_pressure_mca"] == 18.0
    assert frame["commands"]["prs"]["branch"] == "manual"
    assert len(frame["scenarios"]) == 1
    assert frame["scenarios"][0]["demand_factor"] == 1.0
    assert len(calls) == 2
    assert calls[0] == {"vertical": (80.0, 100.0, 100.0), "dwelling": 40.0, "leak": None}
    assert calls[1] == {"vertical": (50.0, 100.0, 100.0), "dwelling": 25.0, "leak": 35.0}
    assert frame["plc_tags"]["PLC.PRS.BranchAuto"] is False
    assert frame["plc_tags"]["PLC.Pump.DischargePressureMca"] == frame["scenarios"][0]["state"]["pump_discharge_mca"]


def _test_flow_outputs() -> dict[str, object]:
    consumers = {
        f"L{level}.C{branch}{position}": 10.0
        for level in range(1, 5)
        for branch in range(1, 5)
        for position in range(1, 5)
    }
    leaks = {f"L{level}.{leak}": 2.0 for level in range(1, 5) for leak in ("L1", "L2")}
    return {"consumer_flows_l_min": consumers, "leak_flows_l_min": leaks, "flow_m3h": 1.0, "leakage_m3h": 0.1}


def test_optimizer_interpolates_prs_pressure_for_18_mca_and_keeps_scenario_valves_fixed(monkeypatch) -> None:
    seen_openings = []

    def fake_evaluate(
        _tags, *, prs_mca, vertical_openings_pct, demand_factor=1.0, critical_consumer_id=None,
        fixed_flows_m3h=None, **_kwargs,
    ):
        seen_openings.append(vertical_openings_pct)
        pressure = prs_mca - 3.0
        return {
            "critical_pressure_mca": pressure,
            "control_point_pressure_mca": pressure,
            "prs_inlet_mca": 30.0,
            "prs_outlet_mca": prs_mca,
            **_test_flow_outputs(),
            "feasible": pressure >= 15.0,
        }

    monkeypatch.setattr(instant_search.module, "evaluate", fake_evaluate)
    result = instant_search.optimize(
        {"PLC.PRS.OutletPressureMca": 30.0}, 22.0,
        vertical_openings_pct=(30.0, 55.0, 96.0),
    )
    optimized = result["optimized"]
    assert optimized["prs_mca"] == pytest.approx(25.05, abs=0.01)
    assert optimized["critical_pressure_mca"] >= 22.0
    assert optimized["target_met"] is True
    assert optimized["optimization_status"] == "target_met"
    assert optimized["valve_12_pct"] == 30.0
    assert optimized["valve_23_pct"] == 55.0
    assert optimized["valve_34_pct"] == 96.0
    assert set(seen_openings) == {(30.0, 55.0, 96.0)}


def test_real_hydraulic_optimizer_calculates_flow_for_selected_pressure_target() -> None:
    tags = {
        "PLC.Tank.Supply.LevelPct": 70,
        "PLC.Tank.Recirc01.LevelPct": 40,
        "PLC.Tank.Recirc02.LevelPct": 40,
        "PLC.Pump.FlowM3h": 11.53,
        "PLC.Pump.RunningCount": 2,
        "PLC.Pump.DischargePressureMca": 72.1,
        "PLC.Pump.SetpointMca": 70,
        "PLC.PRS.ManualSettingMca": 26.66,
        "PLC.PRS.OutletPressureMca": 20.94,
    }
    for level in range(1, 5):
        for branch in range(1, 5):
            for position in range(1, 5):
                tags[f"PLC.Grid.L{level}.Consumer.C{branch}{position}.OpeningPct"] = 100
        for leak in ("L1", "L2"):
            tags[f"PLC.Grid.L{level}.Leak.{leak}.OpeningPct"] = 100

    result = instant_search.optimize(tags, 18.0, vertical_openings_pct=(100.0, 100.0, 100.0))
    base, optimized = result["base"], result["optimized"]
    assert result["constraints_satisfied"] is True
    assert optimized["critical_pressure_mca"] >= 18.0
    assert optimized["flow_m3h"] > 0
    assert optimized["flow_m3h"] != pytest.approx(base["flow_m3h"], abs=1e-5)
    assert optimized["vrp_opening_pct"] is not None
    assert optimized["opening_curve_status"] == "within_assumed_range"


def test_optimizer_reports_user_target_unreachable_without_substituting_a_lower_target(monkeypatch) -> None:
    def fake_evaluate(
        _tags, *, prs_mca, vertical_openings_pct, demand_factor=1.0, critical_consumer_id=None,
        fixed_flows_m3h=None, **_kwargs,
    ):
        pressure = prs_mca - 25.0
        return {
            "critical_pressure_mca": pressure,
            "control_point_pressure_mca": pressure,
            "prs_inlet_mca": 60.0,
            "prs_outlet_mca": prs_mca,
            **_test_flow_outputs(),
            "feasible": pressure >= 15.0,
        }

    monkeypatch.setattr(instant_search.module, "evaluate", fake_evaluate)
    result = instant_search.optimize({}, 22.0, vertical_openings_pct=(100.0, 100.0, 100.0))
    assert result["constraints_satisfied"] is False
    assert result["target_met"] is False
    assert result["optimized"]["critical_pressure_mca"] < 22.0
    assert result["optimized"]["optimization_status"] == "target_unreachable"


def test_optimizer_reports_candidate_below_selected_target(monkeypatch) -> None:
    def fake_evaluate(
        _tags, *, prs_mca, vertical_openings_pct, demand_factor=1.0, critical_consumer_id=None,
        fixed_flows_m3h=None, **_kwargs,
    ):
        pressure = prs_mca - 26.0
        return {
            "critical_pressure_mca": pressure,
            "control_point_pressure_mca": pressure,
            "prs_inlet_mca": 60.0,
            "prs_outlet_mca": prs_mca,
            **_test_flow_outputs(),
            "feasible": False,
        }

    monkeypatch.setattr(instant_search.module, "evaluate", fake_evaluate)
    result = instant_search.optimize({}, 22.0, vertical_openings_pct=(100.0, 100.0, 100.0))
    assert result["constraints_satisfied"] is False
    assert result["optimized"]["optimization_status"] == "target_unreachable"


def test_sinusoidal_vrp_curve_has_soft_endpoints_and_roundtrips() -> None:
    for opening in (20.0, 21.0, 30.0, 60.0, 90.0, 99.0, 100.0):
        outlet = instant_search._outlet_for_opening(opening, 70.0)
        assert instant_search._opening_for_outlet(outlet, 70.0) == pytest.approx(opening, abs=0.01)
    assert instant_search._outlet_for_opening(20.0, 70.0) == 15.0
    assert instant_search._outlet_for_opening(100.0, 70.0) == 70.0
    assert instant_search._outlet_for_opening(60.0, 70.0) == pytest.approx(42.5)
    opening_delta_low = instant_search._outlet_for_opening(21.0, 70.0) - 15
    opening_delta_next = instant_search._outlet_for_opening(22.0, 70.0) - instant_search._outlet_for_opening(21.0, 70.0)
    closing_delta_end = 70 - instant_search._outlet_for_opening(99.0, 70.0)
    closing_delta_previous = instant_search._outlet_for_opening(99.0, 70.0) - instant_search._outlet_for_opening(98.0, 70.0)
    assert opening_delta_low < opening_delta_next
    assert closing_delta_end < closing_delta_previous
    assert instant_search._opening_for_outlet(10.0, 70.0) is None


def test_infeasible_nodal_result_cannot_become_instant_command(monkeypatch) -> None:
    monkeypatch.setattr(
        optimizer,
        "optimize",
        lambda *_args, **_kwargs: {"base": {}, "optimized": {"prs_mca": 20}, "constraints_satisfied": False},
    )
    result = optimizer.recommend_instant({"PLC.PRS.CriticalPressureMca": 18, "PLC.PRS.ManualSettingMca": 22}, "OBJ-PRESSURE-MIN", 18.0)
    assert result["status"] == "no_change" and result["proposal"] == []


def test_forecast_reads_active_profile_and_tags_from_plc_not_browser(monkeypatch) -> None:
    monkeypatch.setenv("FRACTAL_PLC_API_URL", "http://plc-internal:8000")
    fetched = []

    def gateway(url):
        fetched.append(url)
        if url.endswith("/sessions/s1"):
            return {"id": "s1", "plant_id": "water-network-scale-v1", "profile_id": "pfl-1", "running": True}
        if url.endswith("/operation-profiles/pfl-1"):
            return {"id": "pfl-1", "hours": {"0": {"global_consumers_pct": 30}}}
        return {
            "plc_tags": {
                "PLC.Profile.ActiveId": "pfl-1",
                "PLC.Pump.FlowM3h": 11.53,
                "PLC.Pump.RunningCount": 2,
                "PLC.PRS.OutletPressureMca": 20.94,
            }
        }

    monkeypatch.setattr(fractal_api, "gateway_json", gateway)
    captured = []
    monkeypatch.setattr(fractal_api, "_horizon_study", lambda payload, publish: captured.append((payload, publish)) or {"source": "plc"})
    response = client.post(
        "/studies/horizon/from-plc",
        json={
            "session_id": "s1",
            "plant_id": "water-network-scale-v1",
            "study_type": "baseline",
            "plc_tags": {"PLC.Pump.FlowM3h": 999},
            "profile": {"hours": {"0": {"global_consumers_pct": 100}}},
        },
    )
    assert response.status_code == 200 and response.json() == {"source": "plc"}
    assert len(fetched) == 3
    assert captured[0][1] is True
    assert captured[0][0]["plc_tags"]["PLC.Pump.FlowM3h"] == 11.53
    assert captured[0][0]["profile"]["hours"]["0"]["global_consumers_pct"] == 30
    assert captured[0][0]["emulator_api"] == "http://plc-internal:8000"
    assert client.post("/studies/horizon/from-plc", json={"session_id": "../bad", "plant_id": "water-network-scale-v1"}).status_code == 422
    monkeypatch.setattr(
        fractal_api,
        "gateway_json",
        lambda _url: {"id": "s1", "plant_id": "water-network-scale-v1", "profile_id": "pfl-1", "running": False},
    )
    stopped = client.post("/studies/horizon/from-plc", json={"session_id": "s1", "plant_id": "water-network-scale-v1"})
    assert stopped.status_code == 409 and "play" in stopped.json()["detail"]


def test_forecast_refuses_mismatched_session_profile(monkeypatch) -> None:
    monkeypatch.setenv("FRACTAL_PLC_API_URL", "http://plc-internal:8000")
    monkeypatch.setattr(
        fractal_api,
        "gateway_json",
        lambda url: (
            {"id": "s1", "plant_id": "water-network-scale-v1", "profile_id": "pfl-1"}
            if url.endswith("/sessions/s1")
            else {"id": "pfl-1", "hours": {}}
            if "operation-profiles" in url
            else {"plc_tags": {"PLC.Profile.ActiveId": "pfl-other"}}
        ),
    )
    assert client.post("/studies/horizon/from-plc", json={"session_id": "s1", "plant_id": "water-network-scale-v1"}).status_code == 409


def test_offline_horizon_never_publishes_unverified_browser_tags(monkeypatch) -> None:
    monkeypatch.setenv("FRACTAL_PLC_API_URL", "http://plc-internal:8000")
    monkeypatch.setattr(fractal_api, "urlopen", lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("publish forbidden")))
    response = client.post(
        "/studies/horizon",
        json={
            "session_id": "forged",
            "plant_id": "water-network-scale-v1",
            "emulator_api": "http://plc-internal:8000",
            "plc_tags": {"PLC.Tank.Supply.LevelPct": 70},
            "profile": {"hours": {}},
            "study_type": "baseline",
            "objective_id": "OBJ-PRESSURE-MIN",
        },
    )
    assert response.status_code == 200 and "published" not in response.json()


def test_forecast_requires_stabilized_plc_before_solving(monkeypatch) -> None:
    monkeypatch.setenv("FRACTAL_PLC_API_URL", "http://plc-internal:8000")
    monkeypatch.setattr(
        fractal_api,
        "gateway_json",
        lambda url: (
            {"id": "s1", "plant_id": "water-network-scale-v1", "profile_id": "pfl-1", "running": True}
            if url.endswith("/sessions/s1")
            else {"id": "pfl-1", "hours": {}}
            if "operation-profiles" in url
            else {"plc_tags": {"PLC.Profile.ActiveId": "pfl-1", "PLC.Pump.RunningCount": 0, "PLC.PRS.OutletPressureMca": 0}}
        ),
    )
    result = client.post("/studies/horizon/from-plc", json={"session_id": "s1", "plant_id": "water-network-scale-v1"})
    assert result.status_code == 409 and "bombas" in result.json()["detail"]


def test_plc_to_fractal_to_forecast_frames_without_applying_commands(monkeypatch, tmp_path) -> None:
    from twin_emulator_api.main import app as plc_app
    from twin_emulator_api.main import session_manager

    monkeypatch.setenv("TWIN_DATA", str(tmp_path))
    monkeypatch.setenv("FRACTAL_PLC_API_URL", "http://plc-internal:8000")
    plc = TestClient(plc_app)
    plant = "water-network-scale-v1"
    saved = plc.post(
        f"/api/plants/{plant}/operation-profiles",
        json={
            "name": "PFL-FORECAST-E2E",
            "hours": {"0": {"global_consumers_pct": 30, "prs": {"branch": "auto", "critical_setpoint_mca": 15.45}}},
        },
    )
    assert saved.status_code == 201
    session_id = plc.post(f"/api/plants/{plant}/sessions", json={"profile_id": saved.json()["id"]}).json()["id"]
    operation = session_manager.get(plant, session_id)
    assert operation is not None
    operation.apply_profile_hour(0)
    operation.running = True  # Prueba sin tarea de reloj; PLC en play, Fractal no avanza la sesión.
    for _ in range(12):
        operation.plant.step()  # se estabiliza la PRS; el estudio no altera el gemelo operativo
    t = operation.plant.t
    before = operation.message()["plc_tags"]
    event_count = len(operation.plant.events)

    def gateway(url):
        response = plc.get(url.removeprefix("http://plc-internal:8000"))
        assert response.status_code == 200
        return response.json()

    def publish(request, timeout):
        assert timeout == 5
        response = plc.post(
            request.full_url.removeprefix("http://plc-internal:8000"), content=request.data, headers={"content-type": "application/json"}
        )
        assert response.status_code == 201
        return io.BytesIO(json.dumps(response.json()).encode())

    monkeypatch.setattr(fractal_api, "gateway_json", gateway)
    monkeypatch.setattr(fractal_api, "urlopen", publish)
    response = client.post(
        "/studies/horizon/from-plc",
        json={
            "session_id": session_id,
            "plant_id": plant,
            "study_type": "baseline",
            "plc_tags": {"PLC.Pump.FlowM3h": 999},
            "profile": {"hours": {"0": {"global_consumers_pct": 100}}},
        },
    )
    assert response.status_code == 200, response.text
    result = response.json()
    assert len(result["hours"]) == 24
    assert result["hours"][0]["profile_commands"]["global_consumers_pct"] == 30
    # Circuito cerrado: suma de inventarios al inicio y al fin, no valores del antiguo control de retorno.
    first = result["hours"][0]
    capacities = {"tank-supply-01": 3.888, "tank-recirc-01": 2.256, "tank-recirc-02": 2.256}
    initial = (
        capacities["tank-supply-01"] * float(before["PLC.Tank.Supply.LevelPct"])
        + capacities["tank-recirc-01"] * float(before["PLC.Tank.Recirc01.LevelPct"])
        + capacities["tank-recirc-02"] * float(before["PLC.Tank.Recirc02.LevelPct"])
    ) / 100
    final = sum(capacity * first["tank_levels_pct"][tank] / 100 for tank, capacity in capacities.items())
    assert abs(final - initial) < 0.005
    assert all(0 <= first["tank_levels_pct"][tank] <= 100 for tank in capacities)
    assert first["snapshot"]["lines"]["recirculacion"]["output_units"] > 0
    assert result["base_time"] == t
    assert result["profile_id"] == saved.json()["id"]
    assert result["profile_name"] == "PFL-FORECAST-E2E"
    assert result["published"]["study_id"] == result["study_id"]
    assert all(not frame["applied"] and frame["commands"] == {} for frame in result["hours"])
    assert [frame["profile_hour"] for frame in result["hours"]] == list(range(24))
    for hour, projected in enumerate(result["hours"]):
        expected_boundary = (int(t // 3600) + hour + 1) * 3600
        assert projected["plc_tags"]["PLC.Session.SimulatedTime"] == expected_boundary
        state = projected["scenarios"][0]["state"]
        assert abs(state["flow_m3h"] - sum(state["level_flows_m3h"].values())) < 0.0001
    after = operation.message()["plc_tags"]
    assert operation.plant.t == t and len(operation.plant.events) == event_count
    for tag in (
        "PLC.Profile.ActiveId",
        "PLC.PRS.BranchAuto",
        "PLC.PRS.CriticalSetpointMca",
        "PLC.PRS.ManualSettingMca",
        "PLC.Pump.SetpointMca",
    ):
        assert before[tag] == after[tag]
    for connection in (12, 23, 34):
        tag = f"PLC.Valve.Vertical{connection}OpeningPct"
        assert abs(before[tag] - after[tag]) <= 0.2  # lectura nodal reitera el redondeo del sensor
    frame = plc.get(f"/api/plants/{plant}/sessions/{session_id}/fractal/studies/{result['study_id']}/frames?hour=0")
    assert frame.status_code == 200 and frame.json()["frames"][0]["temporal_context"] == "forecast"
    assert frame.json()["frames"][0]["applied"] is False
    last = plc.get(f"/api/plants/{plant}/sessions/{session_id}/fractal/studies/{result['study_id']}/frames?hour=23")
    assert last.status_code == 200 and last.json()["frames"][0]["hour"] == 23
    assert len(plc.get(f"/api/plants/{plant}/sessions/{session_id}/fractal/studies").json()) == 1
    assert (
        plc.post(
            f"/api/plants/{plant}/sessions/{session_id}/fractal/studies/{result['study_id']}/decision", json={"accept": True}
        ).status_code
        == 409
    )


def test_optimization_enabled_by_default_and_explicit_disable(monkeypatch) -> None:
    monkeypatch.delenv("FRACTAL_ENABLE_OPTIMIZATION", raising=False)
    assert fractal_api.optimization_enabled() is True
    monkeypatch.setenv("FRACTAL_ENABLE_OPTIMIZATION", "0")
    assert client.post("/studies/horizon", json={"study_type": "optimized"}).status_code == 409
    assert client.post("/studies/instant", json={}).status_code == 409


def test_horizon_rejects_unknown_study_type() -> None:
    response = client.post(
        "/studies/horizon",
        json={
            "session_id": "s",
            "plc_tags": {},
            "profile": {"hours": {}},
            "objective_id": "OBJ-PRESSURE-MIN",
            "study_type": "unknown",
        },
    )
    assert response.status_code == 422
