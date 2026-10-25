import io
import json

from fastapi.testclient import TestClient
from fractal_engineering_api import main as fractal_api
from fractal_engineering_api.main import app

from fractal.hydraulics.runtime import mpc, optimizer

client = TestClient(app)


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
            "objective_id": "OBJ-LEAK-01",
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
    states = frame["scenarios"][1]["state"]
    first_riser = snapshot["links"]["grid-01:riser_out>valve-between-12:inlet"]["flow_kg_h"] / 1000
    assert abs(first_riser - sum(states["level_flows_m3h"][str(level)] for level in (2, 3, 4))) < 0.0001
    for level in range(1, 5):
        grid = snapshot["equipment"][f"grid-0{level}"]
        assert grid["animation"]["q_l1"] > 0 and grid["animation"]["q_l2"] > 0
        drain = snapshot["links"][f"grid-0{level}:drain>tank-recirc-0{1 if level <= 2 else 2}:inlet"]
        assert abs(drain["flow_kg_h"] / 1000 - states["level_flows_m3h"][str(level)]) < 0.0001


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


def test_alternative_applies_demand_leak_and_valve_overrides() -> None:
    response = client.post(
        "/studies/horizon",
        json={
            "session_id": "session-alt",
            "plc_tags": {
                "PLC.Tank.Supply.LevelPct": 70,
                "PLC.Tank.Recirc01.LevelPct": 50,
                "PLC.Tank.Recirc02.LevelPct": 50,
                "PLC.Pump.FlowM3h": 11.5,
                "PLC.Pump.RecirculationFlowM3h": 10,
                "PLC.Pump.DischargePressureMca": 72.1,
                "PLC.PRS.ManualSettingMca": 20.94,
                "PLC.PRS.OutletPressureMca": 20.94,
                "PLC.PRS.CriticalPressureMca": 15.45,
                **{f"PLC.Grid.L{i}.MinimumPressureMca": 15.45 + (4 - i) * 0.8 for i in range(1, 5)},
                **{f"PLC.Grid.L{i}.LeakageM3h": 0.3 for i in range(1, 5)},
            },
            "profile": {
                "hours": {},
                "overrides": {
                    "demand_multiplier": 1.2,
                    "leakage_multiplier": 2,
                    "valve_12_pct": 50,
                    "valve_23_pct": 100,
                    "valve_34_pct": 100,
                },
            },
            "objective_id": "OBJ-LEAK-01",
            "study_type": "alternative",
        },
    )
    assert response.status_code == 200
    frame = response.json()["hours"][0]
    assert frame["snapshot"]["equipment"]["valve-between-12"]["animation"]["opening"] == 0.5
    assert frame["scenarios"][1]["state"]["flow_m3h"] > frame["scenarios"][0]["state"]["flow_m3h"]
    assert frame["scenarios"][1]["state"]["leakage_m3h"] > 0.6
    assert response.json()["requires_operator_acceptance"] is False


def test_optimized_hour_uses_selected_controls_in_snapshot_and_forecast_tags(monkeypatch) -> None:
    calls = []

    def fake_optimize(*_args, **_kwargs):
        calls.append(1)
        return {"optimized": {"prs_mca": 22.0, "valve_12_pct": 50.0, "valve_23_pct": 90.0, "valve_34_pct": 80.0}}

    monkeypatch.setattr(mpc, "optimize", fake_optimize)
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
    frame = mpc.project_24h(tags, {"hours": {}}, study_type="optimized")[0]
    assert frame["snapshot"]["equipment"]["valve-between-12"]["animation"]["opening"] == 0.5
    assert frame["plc_tags"]["PLC.Valve.Vertical12OpeningPct"] == 50.0
    assert frame["commands"]["between_levels"]["12"] == 50.0
    assert frame["commands"]["prs"]["branch"] == "manual"
    assert len(calls) == 1  # mismo patrón horario, física/feasibilidad se reevalúa por hora
    assert frame["plc_tags"]["PLC.PRS.BranchAuto"] is False
    assert frame["plc_tags"]["PLC.Pump.DischargePressureMca"] == frame["scenarios"][1]["state"]["pump_discharge_mca"]


def test_infeasible_nodal_result_cannot_become_instant_command(monkeypatch) -> None:
    monkeypatch.setattr(
        optimizer,
        "optimize",
        lambda *_args, **_kwargs: {"base": {}, "optimized": {"prs_mca": 20}, "constraints_satisfied": False},
    )
    result = optimizer.recommend_instant({"PLC.PRS.CriticalPressureMca": 18, "PLC.PRS.ManualSettingMca": 22}, "OBJ-LEAK-01")
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
            "objective_id": "OBJ-LEAK-01",
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
    assert result["published"]["study_id"] == result["study_id"]
    assert all(not frame["applied"] and frame["commands"] == {} for frame in result["hours"])
    assert [frame["profile_hour"] for frame in result["hours"]] == list(range(24))
    for hour, projected in enumerate(result["hours"]):
        expected_boundary = (int(t // 3600) + hour + 1) * 3600
        assert projected["plc_tags"]["PLC.Session.SimulatedTime"] == expected_boundary
        state = projected["scenarios"][1]["state"]
        assert abs(state["flow_m3h"] - sum(state["level_flows_m3h"].values())) < 0.0001
    alternative = client.post(
        "/studies/horizon/from-plc",
        json={
            "session_id": session_id,
            "plant_id": plant,
            "study_type": "alternative",
            "overrides": {"demand_multiplier": 1.1, "leakage_multiplier": 2},
        },
    )
    assert alternative.status_code == 200, alternative.text
    alt = alternative.json()
    assert alt["hours"][0]["scenarios"][1]["state"]["flow_m3h"] > result["hours"][0]["scenarios"][1]["state"]["flow_m3h"]
    assert all(not frame["applied"] and frame["commands"] == {} for frame in alt["hours"])
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
    last = plc.get(f"/api/plants/{plant}/sessions/{session_id}/fractal/studies/{alt['study_id']}/frames?hour=23")
    assert last.status_code == 200 and last.json()["frames"][0]["hour"] == 23
    assert len(plc.get(f"/api/plants/{plant}/sessions/{session_id}/fractal/studies").json()) == 2
    assert (
        plc.post(
            f"/api/plants/{plant}/sessions/{session_id}/fractal/studies/{result['study_id']}/decision", json={"accept": True}
        ).status_code
        == 409
    )


def test_optimization_is_disabled_until_forecast_validation(monkeypatch) -> None:
    monkeypatch.delenv("FRACTAL_ENABLE_OPTIMIZATION", raising=False)
    assert client.post("/studies/horizon", json={"study_type": "optimized"}).status_code == 409
    assert client.post("/studies/instant", json={}).status_code == 409


def test_horizon_rejects_unknown_study_type() -> None:
    response = client.post(
        "/studies/horizon",
        json={
            "session_id": "s",
            "plc_tags": {},
            "profile": {"hours": {}},
            "objective_id": "OBJ-LEAK-01",
            "study_type": "unknown",
        },
    )
    assert response.status_code == 422
