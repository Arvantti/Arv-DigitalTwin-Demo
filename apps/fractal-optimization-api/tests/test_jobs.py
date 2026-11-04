from __future__ import annotations

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from fractal_optimization_api import main

from fractal.optimization.engine import OBJECTIVE_ID, optimize_job, profile_fingerprint

BASE_REQUEST = {
    "contract_version": "fractal-optimization-job.v2",
    "kind": "instant",
    "objective_id": OBJECTIVE_ID,
    "target_pressure_mca": 18,
    "snapshot": {"snapshot_id": "snap-1", "simulation_time_s": 10, "plc_tags": {}},
}


def test_optimizer_uses_snapshot_and_user_target_without_applying_a_command() -> None:
    result = optimize_job({
        **BASE_REQUEST,
        "job_id": "OPT-test",
    })
    assert result["applied"] is False
    assert result["snapshot_id"] == "snap-1"
    assert result["target_pressure_mca"] == 18
    assert result["recommendation"]["status"] == "no_change"


def test_job_is_persisted_and_returns_only_a_recommendation(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("TWIN_DATA", str(tmp_path))
    def fake_optimize(job):
        return {"applied": False, "proposal": [], "target_pressure_mca": job["target_pressure_mca"]}

    monkeypatch.setattr(main, "optimize_job", fake_optimize)
    client = TestClient(main.app)
    response = client.post("/v2/jobs", json=BASE_REQUEST)
    assert response.status_code == 202
    accepted = response.json()
    assert accepted["status"] == "queued"
    job = client.get(f"/v2/jobs/{accepted['job_id']}").json()
    assert job["status"] == "succeeded"
    assert job["result"] == {"applied": False, "proposal": [], "target_pressure_mca": 18}
    assert job["result"]["applied"] is False


def test_profile_horizon_requires_the_exact_profile_hash() -> None:
    profile = {"id": "PFL-test", "hours": {"0": {"dwellings": {"grid-01": {"c11": 37}}, "leaks": {"grid-01": {"l1": 12}}}}}
    request = {
        **BASE_REQUEST,
        "kind": "profile-horizon",
        "profile": profile,
        "profile_hash": profile_fingerprint(profile),
    }
    main._validate_request(request)
    changed = {**profile, "hours": {"0": {"dwellings": {"grid-01": {"c11": 38}}, "leaks": {"grid-01": {"l1": 12}}}}}
    with pytest.raises(HTTPException, match="profile_hash"):
        main._validate_request({**request, "profile": changed})


def test_job_rejects_unknown_contract_version_and_missing_target() -> None:
    client = TestClient(main.app)
    assert client.post("/v2/jobs", json={"contract_version": "fractal-optimization-job.v3"}).status_code == 422
    missing_target = {key: value for key, value in BASE_REQUEST.items() if key != "target_pressure_mca"}
    assert client.post("/v2/jobs", json=missing_target).status_code == 422
    out_of_range = {**BASE_REQUEST, "target_pressure_mca": 46}
    assert client.post("/v2/jobs", json=out_of_range).status_code == 422
