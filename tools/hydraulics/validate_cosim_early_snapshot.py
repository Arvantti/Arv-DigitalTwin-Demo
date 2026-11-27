"""Validación prospectiva del pronóstico fijado en H01/H02 contra PLC hasta H24.

uv run python -m tools.hydraulics.validate_cosim_early_snapshot --start-hour 2 --output /tmp/cosim-h02.json
El PLC posterior al snapshot solo se lee para evaluar. No recalibra ni reancla el pronóstico.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from time import monotonic

from twin_emulator_api.main import _plant_model, session_manager

from fractal.hydraulics.runtime.mpc import project_24h
from tools.hydraulics.validate_fractal_hourly import PLANT, PROFILE

TANKS = {"tank-supply-01": "Supply", "tank-recirc-01": "Recirc01", "tank-recirc-02": "Recirc02"}


def validate(start_hour: int, output: Path) -> dict:
    if start_hour not in (1, 2):
        raise ValueError("start_hour debe ser 1 o 2")
    profile = json.loads(PROFILE.read_text(encoding="utf-8"))
    session = session_manager.create(PLANT, _plant_model(PLANT), profile_id=profile["id"], profile=profile)
    started = monotonic()
    while session.plant.t < start_hour * 3600:
        session.apply_profile_hour(int(session.plant.t // 3600) % 24)
        session.plant.step()
    snap = session.snapshot()["equipment"]
    tags = session.message()["plc_tags"]
    volumes = {tank: snap[tank]["variables"]["volume_l"] for tank in TANKS}
    speed = snap["pumpset-recirc-01"]["variables"]["speed_pct"]
    forecast_started = monotonic()
    projected = project_24h(
        tags, profile, horizon_hours=24 - start_hour,
        initial_tank_volumes_l=volumes, initial_recirc_speed_pct=speed,
    )
    report = {"start_hour": start_hour, "initial_volumes_l": volumes, "initial_speed_pct": speed,
              "forecast_elapsed_s": round(monotonic() - forecast_started, 2), "samples": []}
    for frame in projected:
        while session.plant.t < frame["end_t_s"]:
            session.apply_profile_hour(int(session.plant.t // 3600) % 24)
            session.plant.step()
        actual = session.message()["plc_tags"]
        keys = [f"PLC.Tank.{key}.LevelPct" for key in TANKS.values()]
        keys += ["PLC.Pump.FlowM3h", "PLC.PRS.OutletPressureMca", "PLC.PRS.CriticalPressureMca"]
        report["samples"].append({
            "hour": int(frame["end_t_s"] / 3600),
            "errors": {key: round(frame["plc_tags"][key] - actual[key], 4) for key in keys},
            "tank_real": {key: actual[key] for key in keys[:3]},
            "tank_forecast": {key: frame["plc_tags"][key] for key in keys[:3]},
        })
        report["total_elapsed_s"] = round(monotonic() - started, 2)
        output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"H{report['samples'][-1]['hour']:02d} · tanques: " + ", ".join(
            f"{report['samples'][-1]['errors'][key]:+.2f} pp" for key in keys[:3]
        ), flush=True)
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--start-hour", type=int, choices=(1, 2), required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    validate(args.start_hour, args.output)


if __name__ == "__main__":
    main()
