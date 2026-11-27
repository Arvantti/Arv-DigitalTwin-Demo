"""Traza el primer intervalo de divergencia de tanques PLC/proyección base.

uv run python -m tools.hydraulics.trace_tank_first_divergence --minutes 120 --output /tmp/tank-trace.json
Solo diagnóstico; no modifica los estados operativos.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from twin_emulator_api.main import _plant_model, session_manager

from fractal.hydraulics.runtime.mpc import _MODEL, _recirc, project_24h
from tools.hydraulics.validate_fractal_hourly import PLANT, PROFILE

TANKS = ("tank-supply-01", "tank-recirc-01", "tank-recirc-02")


def trace(minutes: int) -> list[dict]:
    profile = json.loads(PROFILE.read_text(encoding="utf-8"))
    session = session_manager.create(PLANT, _plant_model(PLANT), profile_id=profile["id"], profile=profile)
    session.apply_profile_hour(0)
    for _ in range(30):
        session.plant.step()
    initial = session.snapshot()
    levels = {tank: initial["equipment"][tank]["variables"]["level_pct"] for tank in TANKS}
    on = bool(session.message()["plc_tags"]["PLC.Pump.RecirculationAutoActive"])
    rows = []
    for _ in range(minutes):
        start = session.plant.t
        tags = session.message()["plc_tags"]
        # Cada minuto resuelve el caudal con el estado actual del modelo proyectado,
        # pero NO reancla niveles ni estado de la bomba al PLC.
        forecast_tags = dict(tags)
        for tank, key in zip(TANKS, ("Supply", "Recirc01", "Recirc02"), strict=True):
            forecast_tags[f"PLC.Tank.{key}.LevelPct"] = levels[tank]
        forecast = project_24h(forecast_tags, profile, horizon_hours=1)[0]
        distribution = forecast["scenarios"][0]["state"]["level_flows_m3h"]
        transitions = []
        levels, returned, on, overflow = _recirc.advance_hour(
            _MODEL, levels, distribution, on, duration_s=60, on_transition=transitions.append,
        )
        while session.plant.t < start + 60:
            session.apply_profile_hour(int(session.plant.t // 3600) % 24)
            session.plant.step()
        snap = session.snapshot()["equipment"]
        real_events = [
            event.to_dict() for event in session.plant.events
            if start < event.t <= session.plant.t and event.equipment_id == "pumpset-recirc-01"
        ]
        real = {tank: snap[tank]["variables"]["level_pct"] for tank in TANKS}
        row = {
            "t_s": session.plant.t, "real": real, "forecast": dict(levels),
            "difference_pp": {tank: levels[tank] - real[tank] for tank in TANKS},
            "real_return_m3h": snap["pumpset-recirc-01"]["variables"]["flow_m3h"],
            "forecast_return_m3": returned, "forecast_on": on, "forecast_overflow": overflow,
            "forecast_transitions": transitions, "real_pump_events": real_events,
            "real_drain_m3h": [snap[f"grid-0{level}"]["variables"]["flow_in_m3h"] for level in range(1, 5)],
            "forecast_drain_m3h": distribution,
        }
        rows.append(row)
    return rows


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--minutes", type=int, default=60)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    rows = trace(args.minutes)
    args.output.write_text(json.dumps(rows, indent=2) + "\n", encoding="utf-8")
    for row in rows:
        if max(abs(delta) for delta in row["difference_pp"].values()) > 1:
            print(json.dumps(row, ensure_ascii=False))
            break
    else:
        print(f"Sin diferencia >1 pp en {len(rows)} minutos; último: {rows[-1]['difference_pp']}")


if __name__ == "__main__":
    main()
