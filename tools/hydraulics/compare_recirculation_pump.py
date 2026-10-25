"""Compara la curva de retorno de Fractal con la bomba operativa a iguales niveles/velocidad.

Validador offline: aquí sí se importan ambos motores; Fractal no importa el
solver operativo. El estudio de 24 h necesita compararse por separado.
"""

from __future__ import annotations

import argparse
import json
import statistics
from pathlib import Path
from typing import Any

from twin_emulator_api.main import _plant_model, session_manager

from fractal.hydraulics.runtime.mpc import _MODEL, _recirc
from tools.hydraulics.validate_fractal_hourly import PLANT, PROFILE


def compare(output: Path, duration_s: int = 3600, sample_every_s: int = 30) -> dict[str, Any]:
    if duration_s < 1 or sample_every_s < 1:
        raise ValueError("los intervalos deben ser positivos")
    profile = json.loads(PROFILE.read_text(encoding="utf-8"))
    session = session_manager.create(PLANT, _plant_model(PLANT), profile_id=profile["id"], profile=profile)
    session.apply_profile_hour(0)
    rows = []
    for _ in range(duration_s):
        session.apply_profile_hour(int(session.plant.t // 3600) % 24)
        session.plant.step()
        if session.plant.t % sample_every_s:
            continue
        equipment = session.snapshot()["equipment"]
        pump = equipment["pumpset-recirc-01"]["variables"]
        speed = float(pump["speed_pct"]) / 100
        if speed <= 0.05:
            continue
        levels = {tank: float(equipment[tank]["variables"]["level_pct"]) for tank in ("tank-supply-01", "tank-recirc-01", "tank-recirc-02")}
        predicted = _recirc.pump_flow(_MODEL, levels, speed)[0]
        measured = float(pump["flow_m3h"])
        rows.append(
            {
                "t": session.plant.t,
                "levels_pct": levels,
                "speed_pct": pump["speed_pct"],
                "fractal_m3h": round(predicted, 5),
                "emulator_m3h": measured,
                "delta_m3h": round(predicted - measured, 5),
            }
        )
    if not rows:
        raise RuntimeError("la bomba de retorno no arrancó durante el periodo observado")
    report = {
        "plant_id": PLANT,
        "profile_id": profile["id"],
        "duration_s": duration_s,
        "sample_every_s": sample_every_s,
        "mean_delta_m3h": round(statistics.mean(row["delta_m3h"] for row in rows), 5),
        "max_absolute_delta_m3h": max(abs(row["delta_m3h"]) for row in rows),
        "samples": rows,
    }
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--duration-s", type=int, default=3600)
    args = parser.parse_args()
    result = compare(args.output, args.duration_s)
    print(json.dumps({k: v for k, v in result.items() if k != "samples"}, indent=2))


if __name__ == "__main__":
    main()
