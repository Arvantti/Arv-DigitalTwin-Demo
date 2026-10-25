"""El informe de validación separa magnitud del error y seguridad hidráulica."""

import json
from pathlib import Path


def validation(monkeypatch):
    # tools/ es CLI del repositorio, no dependencia instalable del motor Fractal.
    monkeypatch.syspath_prepend(str(Path(__file__).resolve().parents[3]))
    from tools.hydraulics.validate_fractal_day import metric, summary
    from tools.hydraulics.validate_fractal_hourly import CHANNELS

    return metric, summary, CHANNELS


def test_report_metric_has_absolute_floor_for_near_zero_channels(monkeypatch) -> None:
    metric, _, _ = validation(monkeypatch)
    difference = metric(0.04, 0.02)
    assert difference["absolute_error"] == 0.02
    assert difference["error_pct"] == 2.0  # no 100 %: denominador mínimo 1 unidad


def test_full_day_diagnostic_shows_phase_shift_not_missing_water() -> None:
    report_file = Path(__file__).resolve().parents[3] / "docs/architecture/validation/pdd-rca-01-continuous-pre-cache.json"
    report = json.loads(report_file.read_text(encoding="utf-8"))
    assert len(report["samples"]) == 24 and report["validation_status"] == "diagnostic_non_accepted"
    assert max(sample["metrics"]["supply_level_pct"]["absolute_error"] for sample in report["samples"]) > 30
    capacities = {"supply_level_pct": 3.888, "recirc01_level_pct": 2.256, "recirc02_level_pct": 2.256}
    for sample in report["samples"]:
        volumes = {
            motor: sum(capacity * sample["metrics"][name][motor] / 100 for name, capacity in capacities.items())
            for motor in ("fractal", "emulator")
        }
        assert abs(volumes["fractal"] - volumes["emulator"]) < 0.025  # la diferencia es el reparto, no agua perdida


def test_report_summary_identifies_peak_hour_per_channel(monkeypatch) -> None:
    _, summary, channels = validation(monkeypatch)
    names = (*channels, "supply_level_pct", "recirc01_level_pct", "recirc02_level_pct", "recirculated_m3")
    samples = [{"metrics": {name: {"error_pct": error} for name in names}} for error in (0.5, 1.2, 0.7)]
    result = summary(samples)
    assert all(value["peak_hour"] == 1 and value["peak_error_pct"] == 1.2 for value in result.values())
