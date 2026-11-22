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


def test_pressure_recovery_can_be_proposed_even_if_baseline_leaks_less(monkeypatch) -> None:
    from fractal.hydraulics.runtime import mpc

    def fake_project(_tags, _profile, *, study_type, **_kwargs):
        optimized = study_type == "optimized"
        pressure = 18.1 if optimized else 15.0
        return [{
            "start_t_s": 18000, "end_t_s": 21600, "duration_s": 3600,
            "profile_hour": 5, "robust": True,
            "end_state": {"consumer_pressures_mca": {f"house-{i}": pressure for i in range(64)}},
            "scenarios": [{"state": {"leakage_m3h": 2.0 if optimized else 1.0, "flow_m3h": 10.0}}],
            "commands": {
                "constraints_satisfied": True, "prs": {"manual_setting_mca": 24.0},
                "vrp_opening_pct": 42.0,
            } if optimized else {},
        }]

    monkeypatch.setattr(mpc, "project_24h", fake_project)
    profile = {"id": "manual-forecast", "hours": {"5": {"global_consumers_pct": 60}}}
    result = optimize_job({
        **BASE_REQUEST, "kind": "profile-horizon", "job_id": "OPT-recovery",
        "profile": profile, "profile_hash": profile_fingerprint(profile),
    })
    assert result["leakage_comparison"]["modeled_reduction_m3"] == -1
    assert result["leakage_comparison"]["interpretation"] == "pressure_recovery_vs_infeasible_baseline"
    assert result["draft_profile"] is not None
    assert result["requires_operator_acceptance"] is True
    assert result["applied"] is False


def test_adoptable_draft_replays_optimized_opening_without_changing_demand(monkeypatch) -> None:
    from twin_emulator_api.profiles import commands_for_hour, normalize_profile

    from fractal.hydraulics.runtime import mpc

    def fake_project(_tags, _profile, *, study_type, **_kwargs):
        optimized = study_type == "optimized"
        return [{
            "profile_hour": 12, "start_t_s": 43200, "end_t_s": 46800, "duration_s": 3600,
            "robust": True, "end_state": {"consumer_pressures_mca": {f"h{i}": 18.05 for i in range(64)}},
            "scenarios": [{"state": {"flow_m3h": 10.0, "leakage_m3h": 1.0}}],
            "commands": {"constraints_satisfied": True, "prs": {
                "branch": "auto", "control_mode": "fixed_opening", "auto_opening_pct": 42.0,
            }, "vrp_opening_pct": 42.0} if optimized else {},
        }]

    monkeypatch.setattr(mpc, "project_24h", fake_project)
    profile = {"id": "forecast", "hours": {"12": {
        "global_consumers_pct": 94, "prs": {"branch": "manual", "manual_setting_mca": 25},
    }}}
    result = optimize_job({**BASE_REQUEST, "kind": "profile-horizon", "job_id": "OPT-opening",
                           "profile": profile, "profile_hash": profile_fingerprint(profile), "horizon_hours": 1})
    draft = normalize_profile(result["draft_profile"])
    assert draft["hours"]["12"]["global_consumers_pct"] == 94
    assert draft["hours"]["12"]["prs"] == {
        "branch": "auto", "control_mode": "fixed_opening", "auto_opening_pct": 42.0,
    }
    commands = commands_for_hour(draft, 12)
    assert {"equipment": "prs-01", "command": "set_auto_opening", "args": {"pct": 42.0}} in commands
    assert not any(command["command"] == "set_manual_setting" for command in commands)
    assert result["applied"] is False


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


def test_profile_horizon_is_bounded_and_passed_to_solver(monkeypatch) -> None:
    from fractal.hydraulics.runtime import mpc

    profile = {"id": "PFL-test", "hours": {"0": {"global_consumers_pct": 80}}}
    request = {
        **BASE_REQUEST, "kind": "profile-horizon", "profile": profile,
        "profile_hash": profile_fingerprint(profile), "horizon_hours": 1,
    }
    main._validate_request(request)
    for invalid in (True, 0, 1.5, 25):
        with pytest.raises(HTTPException, match="horizon_hours"):
            main._validate_request({**request, "horizon_hours": invalid})
    received = []
    monkeypatch.setattr(mpc, "project_24h", lambda *_args, **kwargs: received.append(kwargs) or [{
        "profile_hour": 0, "start_t_s": 10, "end_t_s": 3600, "duration_s": 3590,
        "robust": False, "end_state": {"consumer_pressures_mca": {}},
        "scenarios": [{"state": {"flow_m3h": 2.0, "leakage_m3h": 0.2}}],
        "commands": {"constraints_satisfied": False, "vrp_opening_pct": None,
                     "vrp_opening_required_pct": None},
    }])
    result = optimize_job({**request, "job_id": "OPT-test"})
    assert received[0]["horizon_hours"] == received[1]["horizon_hours"] == 1
    assert len(result["hours"]) == 1
    assert result["applied"] is False


def test_job_rejects_unknown_contract_version_and_missing_target() -> None:
    client = TestClient(main.app)
    assert client.post("/v2/jobs", json={"contract_version": "fractal-optimization-job.v3"}).status_code == 422
    missing_target = {key: value for key, value in BASE_REQUEST.items() if key != "target_pressure_mca"}
    assert client.post("/v2/jobs", json=missing_target).status_code == 422
    out_of_range = {**BASE_REQUEST, "target_pressure_mca": 46}
    assert client.post("/v2/jobs", json=out_of_range).status_code == 422
