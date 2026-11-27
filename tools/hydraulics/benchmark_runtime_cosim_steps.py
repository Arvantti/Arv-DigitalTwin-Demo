"""Perfila réplica de planta con dt 1/2/5/10 s desde el mismo estado H02.

uv run python -m tools.hydraulics.benchmark_runtime_cosim_steps --duration 3600 --output /tmp/runtime-steps.json
Diagnóstico offline; la tolerancia y las condiciones de control no se cambian.
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

SIGNALS = (
    "PLC.Tank.Supply.LevelPct", "PLC.Tank.Recirc01.LevelPct", "PLC.Tank.Recirc02.LevelPct",
    "PLC.Pump.FlowM3h", "PLC.PRS.OutletPressureMca", "PLC.PRS.CriticalPressureMca",
)


def benchmark(duration_s: int, steps: tuple[float, ...] = (1.0, 2.0, 5.0, 10.0)) -> dict:
    if duration_s < 1 or duration_s > 86400 - 7200 or duration_s % 10:
        raise ValueError("duration debe ser múltiplo de 10 s y no superar el fin del día")
    profile = json.loads(PROFILE.read_text(encoding="utf-8"))
    session = session_manager.create(PLANT, _plant_model(PLANT), profile_id=profile["id"], profile=profile)
    while session.plant.t < 7200:
        session.apply_profile_hour(int(session.plant.t // 3600) % 24)
        session.plant.step()
    if not steps or steps[0] != 1.0 or any(step not in (1.0, 2.0, 5.0, 10.0) for step in steps):
        raise ValueError("se requiere referencia de 1 s y pasos soportados")
    rows = []
    for dt in steps:
        copy = clone_at_snapshot(session.plant)
        copy.sim.dt = dt
        started = monotonic()
        applied_hour = 1
        samples = []
        for target in range(10800, 7200 + duration_s + 1, 3600):
            applied_hour = run_until(copy, profile, target, applied_hour)
            tags = plc_tags(copy.snapshot(), profile_id=profile["id"], profile_hour=int(copy.t // 3600), simulated_time=copy.t)
            samples.append({"hour": target // 3600, "tags": {key: tags[key] for key in SIGNALS}})
        rows.append({"dt_s": dt, "elapsed_s": round(monotonic() - started, 3),
                     "steps": int(duration_s / dt), "samples": samples,
                     "tags": samples[-1]["tags"],
                     "pump_events": [(e.type, e.t) for e in copy.events if e.equipment_id == "pumpset-recirc-01"
                                     and e.type in {"pump_started", "pump_stopped"} and e.t >= 7200]})
    reference = rows[0]["samples"]
    for row in rows:
        for sample, expected in zip(row["samples"], reference, strict=True):
            sample["difference"] = {key: round(sample["tags"][key] - expected["tags"][key], 5) for key in SIGNALS}
        row["difference"] = row["samples"][-1]["difference"]
        row["max_abs_difference"] = {
            key: max(abs(sample["difference"][key]) for sample in row["samples"]) for key in SIGNALS
        }
    return {"duration_s": duration_s, "rows": rows}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--duration", type=int, default=3600)
    parser.add_argument("--steps", default="1,2,5,10", help="Pasos en segundos; iniciar con 1")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    report = benchmark(args.duration, tuple(float(step) for step in args.steps.split(",")))
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for row in report["rows"]:
        print(f"dt={row['dt_s']:.0f} s · {row['elapsed_s']:.2f} s · diferencias {row['difference']}", flush=True)


if __name__ == "__main__":
    main()
