from __future__ import annotations

from fastapi.testclient import TestClient
from water_network_cosim_model_api import main

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

    def fake_project(payload):
        received.update(payload)
        return expected

    monkeypatch.setattr(main, "project", fake_project)
    payload = {"contract_version": "cosimulation-model-request.v2", "job_id": "COSIM-test"}

    response = client.post("/v2/project", json=payload)

    assert response.status_code == 200
    assert response.json() == expected
    assert received == payload


def test_project_endpoint_returns_contract_validation_errors_as_422(monkeypatch) -> None:
    def reject(_payload):
        raise ValueError("rejilla horaria incompatible")

    monkeypatch.setattr(main, "project", reject)

    response = client.post("/v2/project", json={})

    assert response.status_code == 422
    assert response.json()["detail"] == "rejilla horaria incompatible"
