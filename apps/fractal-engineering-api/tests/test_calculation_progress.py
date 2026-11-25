"""Regression tests for measured calculation progress, without running a PLC."""
from uuid import uuid4

import pytest
from fastapi import HTTPException
from fractal_engineering_api import main

from cosimulation import progress


def test_hour_progress_uses_completed_frames_and_tracks_verification_phase(tmp_path, monkeypatch):
    monkeypatch.setenv("TWIN_DATA", str(tmp_path))
    report = progress.hourly("job", "Optimizing", 4, work_total=8)
    report({"hour": 1, "end_t_s": 7200})
    assert progress.get("job") == {
        "status": "running", "phase": "Optimizing", "completed_hours": 2,
        "total_hours": 4, "simulation_time_s": 7200, "percent": 25,
    }
    progress.hourly("job", "Verifying", 4, offset=4, work_total=8)({"hour": 3, "end_t_s": 14400})
    assert progress.get("job")["percent"] == 99  # 100 reserved for a published response


def test_progress_is_scoped_to_plant_and_session_and_completes_only_on_success(tmp_path, monkeypatch):
    monkeypatch.setenv("TWIN_DATA", str(tmp_path))
    key = str(uuid4())
    payload = {"progress_id": key, "plant_id": "plant", "session_id": "session"}

    @main.track_calculation
    def calculate(_payload, _request):
        main.observe_job({"progress": {"percent": 50, "phase": "Calculating", "completed_hours": 1, "total_hours": 2}})
        assert main.calculation_progress(payload)["percent"] == 50
        return {"published": True}

    assert calculate(payload, None) == {"published": True}
    assert main.calculation_progress(payload)["percent"] == 100
    assert main.calculation_progress(payload)["status"] == "succeeded"
    with pytest.raises(HTTPException) as exc:
        main.calculation_progress({**payload, "session_id": "another-session"})
    assert exc.value.status_code == 404
    assert main._calculation_id.get() is None


def test_failed_calculation_does_not_report_one_hundred_percent(tmp_path, monkeypatch):
    monkeypatch.setenv("TWIN_DATA", str(tmp_path))
    payload = {"progress_id": str(uuid4()), "plant_id": "plant", "session_id": "session"}

    @main.track_calculation
    def calculate(_payload, _request):
        main.observe_job({"progress": {"percent": 25, "phase": "Calculating"}})
        raise ValueError("fixture failure")

    with pytest.raises(ValueError):
        calculate(payload, None)
    observed = main.calculation_progress(payload)
    assert observed["status"] == "failed"
    assert observed["percent"] == 25
    assert main._calculation_id.get() is None
