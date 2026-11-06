from fastapi.testclient import TestClient
from fractal_engineering_api import main

client = TestClient(main.app)


def test_horizon_result_carries_immutable_inputs_for_later_recalculation(monkeypatch) -> None:
    tags = {"PLC.Session.SimulatedTime": 3600, "PLC.Profile.ActiveId": "PFL-FROZEN"}
    profile = {"id": "PFL-FROZEN", "hours": {"0": {"global_consumers_pct": 80}}}
    monkeypatch.setattr(main, "project_24h", lambda *_args, **_kwargs: [])
    result = main._horizon_study({
        "session_id": "session-1", "plant_id": "water-network-scale-v1", "plc_tags": tags,
        "profile": profile, "objective_id": "OBJ-PRESSURE-MIN", "study_type": "baseline",
    }, publish=False)
    assert result["study_input"]["plc_tags"] == tags
    assert result["study_input"]["profile"] == profile
    assert result["study_input"]["snapshot_id"] == "session-1:3600"
    assert result["applied"] is False


def test_saved_study_rerun_uses_frozen_inputs_and_appends_without_live_plc(monkeypatch) -> None:
    monkeypatch.setenv("FRACTAL_PLC_API_URL", "https://plc.example")
    profile = {"id": "PFL-FROZEN", "hours": {"0": {"global_consumers_pct": 75}}}
    tags = {"PLC.Session.SimulatedTime": 7200, "PLC.Pump.RunningCount": 2, "pressure": 22.1}
    archived_result = {
        "study_id": "EST-ORIGINAL", "study_type": "baseline", "temporal_context": "forecast", "applied": False,
        "study_input": {
            "session_id": "expired-session", "plc_tags": tags, "profile": profile,
            "snapshot_id": "expired-session:7200", "study_type": "baseline", "objective_id": "OBJ-PRESSURE-MIN",
            "target_pressure_mca": None,
        },
    }
    saved = {"id": "SAVED-1", "versions": [{"version": 1}]}
    archived_version = {"version": 1, "result": archived_result}
    calls = {}

    def read_archived(url, token):
        calls.setdefault("reads", []).append((url, token))
        return archived_version if url.endswith("/versions/1") else saved

    monkeypatch.setattr(main, "_gateway_read", read_archived)

    def calculate(payload, *, publish):
        calls["calculation"] = payload
        assert publish is False
        return {
            "study_id": "EST-RERUN", "study_type": "baseline", "temporal_context": "forecast",
            "applied": False, "session_id": payload["session_id"], "study_input": payload,
        }

    monkeypatch.setattr(main, "_horizon_study", calculate)

    def append(url, payload, token):
        calls["append"] = (url, payload, token)
        return {"id": "SAVED-1", "latest_version": 2}

    monkeypatch.setattr(main, "gateway_post_json", append)
    response = client.post(
        "/studies/saved/rerun",
        headers={"x-twin-demo-token": "demo-capability"},
        json={"plant_id": "water-network-scale-v1", "saved_study_id": "SAVED-1", "version": 1},
    )
    assert response.status_code == 200, response.text
    assert calls["calculation"]["session_id"] == "expired-session"
    assert calls["calculation"]["plc_tags"] == tags
    assert calls["calculation"]["profile"] == profile
    assert calls["calculation"]["snapshot_id"] == "expired-session:7200"
    assert calls["append"][1]["result"]["source_saved_study_id"] == "SAVED-1"
    assert calls["append"][1]["result"]["source_version"] == 1
    assert calls["append"][2] == "demo-capability"
    assert response.json()["latest_version"] == 2


def test_saved_study_rerun_refuses_legacy_version_without_snapshot_inputs(monkeypatch) -> None:
    monkeypatch.setenv("FRACTAL_PLC_API_URL", "https://plc.example")
    def read_legacy(url, *_args):
        if "/versions/" not in url:
            return {"versions": [{"version": 1}]}
        return {"version": 1, "result": {"study_type": "baseline"}}

    monkeypatch.setattr(main, "_gateway_read", read_legacy)
    monkeypatch.setattr(main, "_horizon_study", lambda *_args, **_kwargs: AssertionError("no debe calcular sin snapshot"))
    response = client.post(
        "/studies/saved/rerun",
        json={"plant_id": "water-network-scale-v1", "saved_study_id": "SAVED-legacy", "version": 1},
    )
    assert response.status_code == 409
    assert "inputs congelados" in response.json()["detail"]
