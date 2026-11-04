from __future__ import annotations

from importlib import import_module

from cosimulation_engine_api import main as _api_main  # noqa: F401

runner = import_module("cosimulation.runner")


def test_runner_projects_one_model_with_the_shared_profile_and_returns_three_temporal_contexts(monkeypatch) -> None:
    profile = {"id": "profile-1", "hours": {"0": {"global_consumers_pct": 90, "leaks": {"grid-01": {"l1": 40}}}}}
    history = [{"simulation_time_s": 5, "plc_tags": {"pressure": 17}}]
    request = {
        "session_id": "session-1",
        "plant_id": "water-network-scale-v1",
        "profile": profile,
        "profile_hash": runner.profile_fingerprint(profile),
        "initial_snapshot": {"snapshot_id": "snap-1", "simulation_time_s": 10, "plc_tags": {"pressure": 18}},
        "history_frames": history,
        "time_step_s": 5,
        "horizon_s": 10,
    }
    received = {}

    def project(endpoint, payload):
        received.update(endpoint=endpoint, payload=payload)
        return {
            "contract_version": runner.MODEL_RESULT_CONTRACT_VERSION,
            "model_id": "water-network-hydraulic-v1",
            "profile_hash": payload["profile_hash"],
            "frames": [
                {"simulation_time_s": 5, "temporal_context": "history", "state": {"pressure": 17.1}},
                {"simulation_time_s": 10, "temporal_context": "present", "state": {"pressure": 18.1}},
                {"simulation_time_s": 15, "temporal_context": "forecast", "state": {"pressure": 18.2}},
                {"simulation_time_s": 20, "temporal_context": "forecast", "state": {"pressure": 18.3}},
            ],
        }

    monkeypatch.setattr(runner, "_project", project)
    result = runner.run_trajectory("COSIM-test", request, "http://one-model")

    assert received["endpoint"] == "http://one-model"
    assert received["payload"]["profile"] == profile
    assert received["payload"]["history_frames"] == history
    assert received["payload"]["profile_hash"] == request["profile_hash"]
    assert result["source"] == "cosimulation"
    assert result["model_id"] == "water-network-hydraulic-v1"
    assert [frame["temporal_context"] for frame in result["frames"]] == ["history", "present", "forecast", "forecast"]
    assert result["applied_to_plc"] is False


def test_runner_rejects_model_that_returns_a_different_profile(monkeypatch) -> None:
    profile = {"id": "profile-1", "hours": {}}
    request = {
        "session_id": "session-1",
        "plant_id": "water-network-scale-v1",
        "profile": profile,
        "profile_hash": runner.profile_fingerprint(profile),
        "initial_snapshot": {"snapshot_id": "snap-1", "simulation_time_s": 10, "plc_tags": {}},
        "history_frames": [],
        "time_step_s": 5,
        "horizon_s": 5,
    }
    monkeypatch.setattr(
        runner,
        "_project",
        lambda _endpoint, _payload: {
            "contract_version": runner.MODEL_RESULT_CONTRACT_VERSION,
            "model_id": "model-1",
            "profile_hash": "0" * 64,
            "frames": [],
        },
    )
    try:
        runner.run_trajectory("COSIM-test", request, "http://one-model")
    except ValueError as exc:
        assert "perfil distinto" in str(exc)
    else:
        raise AssertionError("se aceptó un resultado calculado con otro perfil")


def test_runner_rejects_missing_present_or_forecast_frames(monkeypatch) -> None:
    profile = {"id": "profile-1", "hours": {}}
    request = {
        "session_id": "session-1",
        "plant_id": "water-network-scale-v1",
        "profile": profile,
        "profile_hash": runner.profile_fingerprint(profile),
        "initial_snapshot": {"snapshot_id": "snap-1", "simulation_time_s": 0, "plc_tags": {}},
        "history_frames": [],
        "time_step_s": 1,
        "horizon_s": 2,
    }
    monkeypatch.setattr(
        runner,
        "_project",
        lambda _endpoint, payload: {
            "contract_version": runner.MODEL_RESULT_CONTRACT_VERSION,
            "model_id": "model-1",
            "profile_hash": payload["profile_hash"],
            "frames": [{"simulation_time_s": 1, "temporal_context": "forecast", "state": {}}],
        },
    )
    try:
        runner.run_trajectory("COSIM-test", request, "http://one-model")
    except ValueError as exc:
        assert "present" in str(exc)
    else:
        raise AssertionError("se aceptó una trayectoria sin frame presente")
