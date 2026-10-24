"""Aísla error de retorno: horizonte abierto versus reanclaje horario al PLC.

Ejemplo: uv run python -m tools.hydraulics.diagnose_fractal_recirculation
         --hours 4 --output /tmp/recirculation-diagnostic.json
No modifica el motor Fractal: ambos motores solo se importan en este validador.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from time import monotonic
from typing import Any

from twin_emulator_api.main import _plant_model, session_manager

from fractal.hydraulics.runtime.mpc import project_24h
from tools.hydraulics.validate_fractal_day import TANKS, metric
from tools.hydraulics.validate_fractal_hourly import PLANT, PROFILE


def compare_frame(candidate: dict[str, Any], measured: dict[str, Any], hour_return: float) -> dict[str, Any]:
    tank_names = {"supply_level_pct": "tank-supply-01", "recirc01_level_pct": "tank-recirc-01", "recirc02_level_pct": "tank-recirc-02"}
    return {
        "levels": {
            name: metric(float(candidate["tank_levels_pct"][tank_names[name]]), float(measured[tag])) for name, tag in TANKS.items()
        },
        "recirculated_m3": metric(float(candidate["snapshot"]["lines"]["recirculacion"]["output_units"]), hour_return),
        "pump_auto_active": candidate["plc_tags"]["PLC.Pump.RecirculationAutoActive"],
    }


def diagnose(hours: int, output: Path) -> dict[str, Any]:
    if not 1 <= hours <= 24:
        raise ValueError("hours debe estar entre 1 y 24")
    profile = json.loads(PROFILE.read_text(encoding="utf-8"))
    session = session_manager.create(PLANT, _plant_model(PLANT), profile_id=profile["id"], profile=profile)
    session.apply_profile_hour(0)
    for _ in range(30):
        session.plant.step()
    tags = session.message()["plc_tags"]
    started = monotonic()
    open_loop = project_24h(tags, profile, "baseline", horizon_hours=hours)
    report: dict[str, Any] = {"hours": hours, "open_loop_source_t_s": session.plant.t, "samples": []}
    previous_return = float(session.snapshot()["equipment"]["pumpset-recirc-01"]["variables"]["volume_m3"])
    for hour, frame in enumerate(open_loop):
        # Reancla Fractal al estado PLC de la misma hora, sin importar la física operativa.
        current_tags = tags if hour == 0 else session.message()["plc_tags"]
        anchored = project_24h(current_tags, profile, "baseline", horizon_hours=1)[0]
        target = (hour + 1) * 3600
        while session.plant.t < target:
            session.apply_profile_hour(int(session.plant.t // 3600) % 24)
            session.plant.step()
        snapshot = session.snapshot()
        measured = session.message()["plc_tags"]
        actual_return = float(snapshot["equipment"]["pumpset-recirc-01"]["variables"]["volume_m3"])
        hour_return = actual_return - previous_return
        previous_return = actual_return

        report["samples"].append(
            {
                "hour": hour,
                "emulator_t_s": session.plant.t,
                "actual_return_m3": round(hour_return, 5),
                "actual_recirc_on": bool(measured["PLC.Pump.RecirculationAutoActive"]),
                "open_loop": compare_frame(frame, measured, hour_return),
                "reanchored": compare_frame(anchored, measured, hour_return),
            }
        )
        output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        a, b = report["samples"][-1]["open_loop"], report["samples"][-1]["reanchored"]
        print(
            f"hora {hour + 1}/{hours}: suministro error libre={a['levels']['supply_level_pct']['absolute_error']:.2f} pp, "
            f"reanclado={b['levels']['supply_level_pct']['absolute_error']:.2f} pp; "
            f"retorno error libre={a['recirculated_m3']['absolute_error']:.3f} m³, "
            f"reanclado={b['recirculated_m3']['absolute_error']:.3f} m³",
            flush=True,
        )
    report["elapsed_real_s"] = round(monotonic() - started, 2)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--hours", type=int, default=4)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    diagnose(args.hours, args.output)


if __name__ == "__main__":
    main()
