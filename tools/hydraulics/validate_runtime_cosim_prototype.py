"""Compara copia autónoma del runtime con el PLC desde H01/H02 hasta H24.

uv run python -m tools.hydraulics.validate_runtime_cosim_prototype --start-hour 2 --output /tmp/runtime-cosim-h02.json
Prototipo local: copia estado interno in-process; NO es todavía un modelo
portable ni una interfaz de snapshot segura para procesos separados.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from time import monotonic

from twin_emulator_api.main import _plant_model, session_manager
from twin_emulator_api.plc_tags import plc_tags

from cosimulation.adapters.water_network_runtime_prototype import clone_at_snapshot, run_until
from tools.hydraulics.validate_fractal_hourly import PLANT, PROFILE

TAGS = (
    "PLC.Tank.Supply.LevelPct", "PLC.Tank.Recirc01.LevelPct", "PLC.Tank.Recirc02.LevelPct",
    "PLC.Pump.FlowM3h", "PLC.PRS.OutletPressureMca", "PLC.PRS.CriticalPressureMca",
)


def validate(start_hour: int, output: Path, end_hour: int = 24) -> dict:
    if start_hour not in (1, 2) or not start_hour < end_hour <= 24:
        raise ValueError("hora de origen inválida")
    profile = json.loads(PROFILE.read_text(encoding="utf-8"))
    session = session_manager.create(PLANT, _plant_model(PLANT), profile_id=profile["id"], profile=profile)
    while session.plant.t < start_hour * 3600:
        session.apply_profile_hour(int(session.plant.t // 3600) % 24)
        session.plant.step()
    replica = clone_at_snapshot(session.plant)
    assert session.plant.t == replica.t
    report = {"start_hour": start_hour, "source_t_s": session.plant.t,
              "mode": "in_process_full_state_clone_diagnostic", "samples": []}
    projected_hour = start_hour - 1
    forecast_seconds = 0.0
    real_seconds = 0.0
    for hour in range(start_hour + 1, end_hour + 1):
        start = monotonic()
        projected_hour = run_until(replica, profile, hour * 3600, projected_hour)
        forecast_seconds += monotonic() - start
        predicted = plc_tags(replica.snapshot(), profile_id=profile["id"], profile_hour=hour, simulated_time=replica.t)
        start = monotonic()
        while session.plant.t < hour * 3600:
            session.apply_profile_hour(int(session.plant.t // 3600) % 24)
            session.plant.step()
        real_seconds += monotonic() - start
        observed = session.message()["plc_tags"]
        report["samples"].append({
            "hour": hour, "difference": {key: round(predicted[key] - observed[key], 5) for key in TAGS},
            "predicted": {key: predicted[key] for key in TAGS},
            "observed": {key: observed[key] for key in TAGS},
        })
        report["forecast_seconds"] = round(forecast_seconds, 2)
        report["real_seconds"] = round(real_seconds, 2)
        output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"H{hour:02d}: " + ", ".join(
            f"{report['samples'][-1]['difference'][key]:+.2f}" for key in TAGS[:3]
        ), flush=True)
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--start-hour", type=int, choices=(1, 2), required=True)
    parser.add_argument("--end-hour", type=int, default=24)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    validate(args.start_hour, args.output, args.end_hour)


if __name__ == "__main__":
    main()
