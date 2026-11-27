"""Diagnóstico PDD-RCA-01: caudal recalculado a 60/10 min e integración a 60/1 s.

uv run python -m tools.hydraulics.benchmark_tank_intervals --hours 2 --output /tmp/tank-intervals.json
No reancla el futuro al PLC. La variante 'true-initial' es solo un oráculo
experimental: el contrato de cosimulación publica niveles medidos con ruido,
no los niveles internos verdaderos del emulador.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from time import monotonic
from typing import Any

from twin_emulator_api.main import _plant_model, session_manager
from twin_runtime.prs_curve import outlet_target_from_opening

from fractal.hydraulics.runtime.mpc import _MODEL, _recirc, _solver
from tools.hydraulics.validate_fractal_hourly import PLANT, PROFILE

TANKS = {"tank-supply-01": "Supply", "tank-recirc-01": "Recirc01", "tank-recirc-02": "Recirc02"}


def forecast(initial: dict[str, Any], profile: dict[str, Any], hours: int, interval_s: int, max_step_s: int = 60) -> dict[str, Any]:
    levels = {tank: float(initial[f"PLC.Tank.{key}.LevelPct"]) for tank, key in TANKS.items()}
    on = bool(initial["PLC.Pump.RecirculationAutoActive"])
    tags = dict(initial)
    rows: list[dict[str, Any]] = []
    started = monotonic()
    transitions: list[dict[str, Any]] = []
    for hour in range(hours):
        entry = profile["hours"][str(hour)]
        opening = float(entry["prs"]["auto_opening_pct"])
        for level in range(1, 5):
            for branch in range(1, 5):
                for position in range(1, 5):
                    tags[f"PLC.Grid.L{level}.Consumer.C{branch}{position}.OpeningPct"] = entry["global_consumers_pct"]
        volume_return = 0.0
        start_s = float(initial["PLC.Session.SimulatedTime"]) if hour == 0 else hour * 3600.0
        elapsed = start_s
        while elapsed < (hour + 1) * 3600 - 1e-9:
            for tank, key in TANKS.items():
                tags[f"PLC.Tank.{key}.LevelPct"] = levels[tank]
            setting = outlet_target_from_opening(opening, float(tags["PLC.PRS.InletPressureMca"]))
            state = _solver.evaluate(tags, prs_mca=setting)
            for _ in range(3):
                corrected = outlet_target_from_opening(opening, float(state["prs_inlet_mca"]))
                if abs(corrected - setting) < 1e-5:
                    break
                setting = corrected
                state = _solver.evaluate(tags, prs_mca=setting)
            step_transitions: list[dict[str, Any]] = []
            duration = min(interval_s, (hour + 1) * 3600 - elapsed)
            levels, moved, on, overflow = _recirc.advance_hour(
                _MODEL, levels, state["level_flows_m3h"], on, duration_s=duration,
                max_step_s=max_step_s, on_transition=step_transitions.append,
            )
            volume_return += moved
            transitions.extend({**event, "t_s": elapsed + event["t_s"]} for event in step_transitions)
            elapsed += duration
            if overflow:
                raise ValueError("Tanques fuera de capacidad")
        rows.append({"hour": hour + 1, "levels_pct": dict(levels), "return_m3": volume_return, "on": on})
    return {"interval_s": interval_s, "max_step_s": max_step_s,
            "seconds": round(monotonic() - started, 3), "hours": rows, "transitions": transitions}


def benchmark(hours: int) -> dict[str, Any]:
    profile = json.loads(PROFILE.read_text(encoding="utf-8"))
    session = session_manager.create(PLANT, _plant_model(PLANT), profile_id=profile["id"], profile=profile)
    session.apply_profile_hour(0)
    for _ in range(30):
        session.plant.step()
    initial = session.message()["plc_tags"]
    initial_true = {tank: session.plant.equipment[tank].level_pct for tank in TANKS}
    true_initial = dict(initial)
    for tank, key in TANKS.items():
        true_initial[f"PLC.Tank.{key}.LevelPct"] = initial_true[tank]
    runs = {
        "60m-60s": forecast(initial, profile, hours, 3600, 60),
        "60m-60s-true-initial-diagnostic": forecast(true_initial, profile, hours, 3600, 60),
        "10m-60s": forecast(initial, profile, hours, 600, 60),
        "60m-1s": forecast(initial, profile, hours, 3600, 1),
        "60m-1s-true-initial-diagnostic": forecast(true_initial, profile, hours, 3600, 1),
    }
    plc_started = monotonic()
    actual = []
    real_transitions: list[dict[str, Any]] = []
    event_index = len(session.plant.events)
    for hour in range(1, hours + 1):
        while session.plant.t < hour * 3600:
            session.apply_profile_hour(int(session.plant.t // 3600) % 24)
            session.plant.step()
            for event in session.plant.events[event_index:]:
                if event.equipment_id == "pumpset-recirc-01" and event.type in {"pump_started", "pump_stopped"}:
                    real_transitions.append({
                        "action": "start" if event.type == "pump_started" else "stop", "t_s": event.t,
                        "true_levels_pct": {tank: session.plant.equipment[tank].level_pct for tank in TANKS},
                    })
            event_index = len(session.plant.events)
        snap = session.snapshot()["equipment"]
        actual.append({"hour": hour, "levels_pct": {tank: snap[tank]["variables"]["level_pct"] for tank in TANKS}})
    for run in runs.values():
        for projected, reference in zip(run["hours"], actual, strict=True):
            projected["difference_pp"] = {
                tank: round(projected["levels_pct"][tank] - reference["levels_pct"][tank], 3) for tank in TANKS
            }
    return {"initial_time_s": initial["PLC.Session.SimulatedTime"],
            "initial_true_pct": initial_true,
            "initial_measured_pct": {tank: initial[f"PLC.Tank.{key}.LevelPct"] for tank, key in TANKS.items()},
            "runs": runs,
            "plc_seconds": round(monotonic() - plc_started, 3), "plc": actual,
            "plc_transitions": real_transitions}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--hours", type=int, default=2)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if not 1 <= args.hours <= 24:
        parser.error("hours debe estar entre 1 y 24")
    result = benchmark(args.hours)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for label, run in result["runs"].items():
        print(f"{label}: {run['seconds']} s · diferencias {[row['difference_pp'] for row in run['hours']]}")
    print(f"PLC: {result['plc_seconds']} s")


if __name__ == "__main__":
    main()
