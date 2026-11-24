from __future__ import annotations

from fastapi.testclient import TestClient
from water_network_cosim_model_api import main

from cosimulation.runner import profile_fingerprint

client = TestClient(main.app)


def test_health_identifies_model_and_declares_assumed_quality() -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "model_id": "fractal/water-network-scale-v1/quasi-steady-hourly-assumed",
        "quality": "assumed_quasi_steady_hourly_not_transient_validated",
    }


def test_project_endpoint_delegates_to_model_adapter(monkeypatch) -> None:
    expected = {
        "contract_version": "cosimulation-model-result.v2",
        "model_id": "test/model",
        "profile_hash": "abc",
        "quality": "test_quality",
        "frames": [],
    }
    received = {}

    def fake_project(payload, *, on_hour_completed):
        assert callable(on_hour_completed)
        received.update(payload)
        return expected

    monkeypatch.setattr(main, "project", fake_project)
    payload = {"contract_version": "cosimulation-model-request.v2", "job_id": "COSIM-test", "horizon_s": 3600}

    response = client.post("/v2/project", json=payload)

    assert response.status_code == 200
    assert response.json() == expected
    assert received == payload


def test_project_endpoint_runs_real_solver_for_one_hour() -> None:
    profile = {"id": "profile-api", "hours": {"0": {"global_consumers_pct": 80}}}
    payload = {
        "contract_version": "cosimulation-model-request.v2",
        "plant_id": "water-network-scale-v1",
        "session_id": "session-api",
        "job_id": "COSIM-api-test",
        "profile_id": profile["id"],
        "profile": profile,
        "profile_hash": profile_fingerprint(profile),
        "initial_snapshot": {
            "snapshot_id": "session-api:30",
            "simulation_time_s": 30,
            "plc_tags": {"PLC.Session.SimulatedTime": 30, "PLC.Pump.RunningCount": 2},
        },
        "history_frames": [],
        "time_step_s": 3600,
        "horizon_s": 3600,
        "forecast_times_s": [3600],
    }

    response = client.post("/v2/project", json=payload)

    assert response.status_code == 200
    result = response.json()
    assert result["profile_hash"] == payload["profile_hash"]
    assert [(frame["simulation_time_s"], frame["temporal_context"]) for frame in result["frames"]] == [
        (30, "present"), (3600, "forecast"),
    ]
    assert result["frames"][-1]["state"]["applied"] is False


def test_project_endpoint_returns_contract_validation_errors_as_422(monkeypatch) -> None:
    def reject(_payload):
        raise ValueError("rejilla horaria incompatible")

    monkeypatch.setattr(main, "project", reject)

    response = client.post("/v2/project", json={})

    assert response.status_code == 422
    assert response.json()["detail"] == "rejilla horaria incompatible"
