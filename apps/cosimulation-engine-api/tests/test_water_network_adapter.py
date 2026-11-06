from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))

from cosimulation.adapters.water_network_scale import MODEL_ID, QUALITY, project  # noqa: E402
from cosimulation.runner import profile_fingerprint  # noqa: E402


def request() -> dict:
    profile = {"id": "profile-adapter", "hours": {"0": {"global_consumers_pct": 80}, "1": {"global_consumers_pct": 75}}}
    return {
        "contract_version": "cosimulation-model-request.v2",
        "job_id": "COSIM-adapter-test",
        "plant_id": "water-network-scale-v1",
        "session_id": "session-adapter",
        "profile_id": profile["id"],
        "profile_hash": profile_fingerprint(profile),
        "profile": profile,
        "initial_snapshot": {
            "snapshot_id": "session-adapter:30",
            "simulation_time_s": 30,
            "plc_tags": {
                "PLC.Session.SimulatedTime": 30,
                "PLC.PRS.OutletPressureMca": 20.94,
                "PLC.PRS.CriticalSetpointMca": 15.45,
                "PLC.Pump.FlowM3h": 11.53,
                "PLC.Pump.DischargePressureMca": 72.1,
                "PLC.Pump.RunningCount": 2,
                "PLC.Pump.SetpointMca": 72.1,
                "PLC.Tank.Supply.LevelPct": 70,
                "PLC.Tank.Recirc01.LevelPct": 40,
                "PLC.Tank.Recirc02.LevelPct": 40,
                "PLC.Pump.RecirculationAutoActive": False,
                "PLC.PRS.BranchAuto": True,
                **{
                    f"PLC.Grid.L{level}.{signal}": value
                    for level in range(1, 5)
                    for signal, value in (("ConsumptionM3h", 2.6), ("LeakageM3h", 0.15), ("MinimumPressureMca", 18.0))
                },
                **{f"PLC.Valve.Vertical{connection}OpeningPct": 100 for connection in (12, 23, 34)},
            },
        },
        "history_frames": [{"simulation_time_s": 5, "plc_tags": {"pressure": 19}}],
        "time_step_s": 3600,
        "horizon_s": 7200,
        "forecast_times_s": [3600, 7200],
    }


def test_adapter_reuses_hourly_solver_and_marks_its_limits_without_faking_history() -> None:
    body = request()
    result = project(body)

    assert result["model_id"] == MODEL_ID
    assert result["quality"] == QUALITY
    assert [frame["temporal_context"] for frame in result["frames"]] == ["history", "present", "forecast", "forecast"]
    assert [frame["simulation_time_s"] for frame in result["frames"]] == [5, 30, 3600, 7200]
    assert result["frames"][0]["state"]["plc_tags"] == {"pressure": 19}
    assert result["frames"][1]["state"]["snapshot_id"] == "session-adapter:30"
    assert result["frames"][2]["state"]["quality"] == QUALITY
    assert set(result["frames"][2]["state"]["snapshot"]["equipment"]) >= {"prs-01", "grid-04"}
    assert result["frames"][2]["state"]["applied"] is False
    assert body["profile"]["hours"]["0"]["global_consumers_pct"] == 80


def test_adapter_refuses_unimplemented_steps_or_horizons() -> None:
    with pytest.raises(ValueError, match="solo soporta paso 1 h"):
        project({**request(), "time_step_s": 7200, "horizon_s": 7200, "forecast_times_s": [7200]})
    with pytest.raises(ValueError, match="solo soporta paso 1 h"):
        project({**request(), "horizon_s": 25 * 3600, "forecast_times_s": list(range(3600, 25 * 3600 + 1, 3600))})
