"""El reloj representativo ×240 no reemplaza la física del emulador."""

import json
from pathlib import Path

import pytest


def _replay_tools(monkeypatch):
    monkeypatch.syspath_prepend(str(Path(__file__).resolve().parents[3]))
    from tools.hydraulics.replay_fractal_day import replay, validate_report

    return replay, validate_report


def _report():
    return {
        "scope": "continuous 24-hour emulator run compared to 24 hourly Fractal forecasts",
        "validation_status": "post_session_snapshot_cache",
        "samples": [
            {
                "profile_hour": hour,
                "metrics": {
                    name: {"fractal": 15.45, "emulator": 15.46}
                    for name in ("flow_m3h", "critical_pressure_mca", "supply_level_pct", "recirculated_m3")
                },
            }
            for hour in range(24)
        ],
    }


def test_precomputed_day_plays_24_hours_in_360_real_seconds(monkeypatch) -> None:
    replay, _ = _replay_tools(monkeypatch)
    clock = [0.0]
    messages = []
    ticks = replay(_report(), now=lambda: clock[0], sleep=lambda seconds: clock.__setitem__(0, clock[0] + seconds), emit=messages.append)
    assert len(ticks) == 24 and ticks[0]["real_elapsed_s"] == 15
    assert clock[0] == 360 and ticks[-1]["real_elapsed_s"] == 360
    assert all(tick["real_elapsed_s"] == tick["scheduled_s"] for tick in ticks)
    assert "PRECALCULADA" in messages[0] and "NO EN VIVO" in messages[0]


def test_replay_rejects_partial_and_pre_cache_diagnostic(monkeypatch) -> None:
    _, validate_report = _replay_tools(monkeypatch)
    report = _report()
    report["validation_status"] = "diagnostic_non_accepted"
    with pytest.raises(ValueError, match="poscorrección"):
        validate_report(report)
    report["validation_status"] = "post_session_snapshot_cache"
    report["samples"].pop()
    with pytest.raises(ValueError, match="24 horas completas"):
        validate_report(report)
    report["scope"] = "24 hourly steady-state setpoints; not a continuous 24-hour tank/transient validation"
    with pytest.raises(ValueError, match="corrida continua"):
        validate_report(report)
    old_file = Path(__file__).resolve().parents[3] / "docs/architecture/validation/pdd-rca-01-continuous-pre-cache.json"
    with pytest.raises(ValueError, match="poscorrección"):
        validate_report(json.loads(old_file.read_text(encoding="utf-8")))
