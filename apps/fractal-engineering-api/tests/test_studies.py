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
    assert study["applied"] is False
    assert study["requires_operator_acceptance"] is False
    assert len(study["hours"]) == 24
    assert all(hour["study_type"] == "baseline" for hour in study["hours"])
    frame = study["hours"][0]
    assert set(frame["snapshot"]["equipment"]) >= {"tank-supply-01", "pumpset-main-01", "prs-01", "grid-04"}
    assert frame["snapshot"]["equipment"]["tank-supply-01"]["animation"]["level"] >= 0
    assert frame["temporal_context"] == "forecast" and frame["applied"] is False


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
            return {"id": "s1", "plant_id": "water-network-scale-v1", "profile_id": "pfl-1"}
        if url.endswith("/operation-profiles/pfl-1"):
            return {"id": "pfl-1", "hours": {"0": {"global_consumers_pct": 30}}}
        return {"plc_tags": {"PLC.Profile.ActiveId": "pfl-1", "PLC.Pump.FlowM3h": 11.53}}

    monkeypatch.setattr(fractal_api, "gateway_json", gateway)
    captured = []
    monkeypatch.setattr(fractal_api, "horizon_study", lambda payload: captured.append(payload) or {"source": "plc"})
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
    assert captured[0]["plc_tags"]["PLC.Pump.FlowM3h"] == 11.53
    assert captured[0]["profile"]["hours"]["0"]["global_consumers_pct"] == 30
    assert captured[0]["emulator_api"] == "http://plc-internal:8000"
    assert client.post("/studies/horizon/from-plc", json={"session_id": "../bad", "plant_id": "water-network-scale-v1"}).status_code == 422


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
