from __future__ import annotations

from cosimulation_engine_api import main
from fastapi.testclient import TestClient

PROFILE = {"id": "profile-1", "name": "Base", "hours": {"0": {"global_consumers_pct": 100, "leaks": {"grid-01": {"l1": 50}}}}}
PAYLOAD = {
    "contract_version": "cosimulation-job.v2",
    "plant_id": "water-network-scale-v1",
    "session_id": "session-1",
    "initial_snapshot": {"snapshot_id": "snap-1", "simulation_time_s": 0, "plc_tags": {}},
    "history_frames": [],
    "profile": PROFILE,
    "profile_hash": main.profile_fingerprint(PROFILE),
    "time_step_s": 1,
    "horizon_s": 2,
}


def test_job_blocks_until_one_model_endpoint_is_configured(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("TWIN_DATA", str(tmp_path))
    monkeypatch.delenv("COSIMULATION_MODEL_URL", raising=False)
    monkeypatch.delenv("COSIMULATION_EMULATOR_PARTICIPANT_URL", raising=False)
    monkeypatch.delenv("COSIMULATION_FRACTAL_PARTICIPANT_URL", raising=False)
    client = TestClient(main.app)
    accepted = client.post("/v2/jobs", json=PAYLOAD)
    job = client.get(f"/v2/jobs/{accepted.json()['job_id']}").json()
    assert accepted.status_code == 202
    assert job["status"] == "blocked"
    assert "único modelo" in job["error"]


def test_job_runs_single_model_and_persists_its_result(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("TWIN_DATA", str(tmp_path))
    monkeypatch.setenv("COSIMULATION_MODEL_URL", "http://model.internal")
    monkeypatch.setattr(
        main,
        "run_trajectory",
        lambda job_id, request, endpoint: {
            "job_id": job_id,
            "profile_hash": request["profile_hash"],
            "model_id": "model-1",
            "endpoint": endpoint,
            "source": "cosimulation",
            "applied_to_plc": False,
            "frames": [],
        },
    )
    client = TestClient(main.app)
    accepted = client.post("/v2/jobs", json=PAYLOAD)
    job = client.get(f"/v2/jobs/{accepted.json()['job_id']}").json()
    assert accepted.status_code == 202
    assert job["status"] == "succeeded"
    assert job["result"]["endpoint"] == "http://model.internal"
    assert job["result"]["source"] == "cosimulation"


def test_job_rejects_profile_hash_mismatch_and_unordered_history() -> None:
    client = TestClient(main.app)
    mismatch = {**PAYLOAD, "profile_hash": "0" * 64}
    assert client.post("/v2/jobs", json=mismatch).status_code == 422
    bad_history = {
        **PAYLOAD,
        "initial_snapshot": {"snapshot_id": "snap-1", "simulation_time_s": 10, "plc_tags": {}},
        "history_frames": [
            {"simulation_time_s": 8, "plc_tags": {}},
            {"simulation_time_s": 7, "plc_tags": {}},
        ],
    }
    assert client.post("/v2/jobs", json=bad_history).status_code == 422


def test_job_rejects_nonintegral_timeline() -> None:
    payload = {**PAYLOAD, "horizon_s": 1.5}
    assert TestClient(main.app).post("/v2/jobs", json=payload).status_code == 422


def test_v1_two_participant_route_is_not_available() -> None:
    assert TestClient(main.app).post("/v1/jobs", json=PAYLOAD).status_code == 404
