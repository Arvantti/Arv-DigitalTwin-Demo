"""Compara 24 horas CONTINUAS de operación con las 24 proyecciones Fractal.

Ejecutar fuera de CI: 86.400 pasos de 1 s pueden tardar decenas de minutos.
Este validador es el único lugar que importa ambos motores; Fractal sigue
independiente del runtime del emulador. Escribe un checkpoint por hora.
"""

from __future__ import annotations

import argparse
import json
import statistics
from pathlib import Path
from time import monotonic
from typing import Any

from twin_emulator_api.main import _plant_model, session_manager

from fractal.hydraulics.runtime.mpc import project_24h
from tools.hydraulics.validate_fractal_hourly import CHANNELS, PLANT, PROFILE

TANKS = {
    "supply_level_pct": "PLC.Tank.Supply.LevelPct",
    "recirc01_level_pct": "PLC.Tank.Recirc01.LevelPct",
    "recirc02_level_pct": "PLC.Tank.Recirc02.LevelPct",
}


def metric(predicted: float, actual: float) -> dict[str, float]:
    return {
        "fractal": round(predicted, 5),
        "emulator": round(actual, 5),
        "absolute_error": round(abs(predicted - actual), 5),
        "error_pct": round(100 * abs(predicted - actual) / max(1.0, abs(actual)), 4),
    }


def summary(samples: list[dict[str, Any]]) -> dict[str, Any]:
    names = (*CHANNELS, *TANKS, "recirculated_m3")
    return {
        name: {
            "mean_error_pct": round(statistics.mean(item["metrics"][name]["error_pct"] for item in samples), 4),
            "peak_error_pct": max(item["metrics"][name]["error_pct"] for item in samples),
            "peak_hour": max(range(len(samples)), key=lambda hour: samples[hour]["metrics"][name]["error_pct"]),
        }
        for name in names
    }


def compare(output: Path, hours: int = 24) -> dict[str, Any]:
    profile = json.loads(PROFILE.read_text(encoding="utf-8"))
    session = session_manager.create(PLANT, _plant_model(PLANT), profile_id=profile["id"], profile=profile)
    session.apply_profile_hour(0)
    for _ in range(30):
        session.plant.step()
    base_tags = session.message()["plc_tags"]
    if base_tags["PLC.Pump.RunningCount"] == 0:
        raise RuntimeError("la bomba no se estabilizó")
    started = monotonic()
    frames = project_24h(base_tags, profile, "baseline", horizon_hours=hours)
    if len(frames) != hours:
        raise ValueError(f"Fractal no devolvió {hours} horas")
    report: dict[str, Any] = {
        "scope": f"continuous {hours}-hour emulator run compared to {hours} hourly Fractal forecasts",
        "validation_status": "post_session_snapshot_cache",
        "recirculation_policy": "supply_start_30_or_either_return_90; supply_stop_90_or_source_mean_below_20",
        "sampling": "one PLC sensor sample per simulated tick",
        "execution_mode": "offline_physics; playback cadence controlled separately",
        "plant_id": PLANT,
        "profile_id": profile["id"],
        "start_t_s": session.plant.t,
        "alignment_note": "Fractal inicia a t=30 s tras estabilización; el emulador se muestrea a 3600,7200,...,86400 s (desfase ≤30 s).",
        "samples": [],
    }
    previous_return = float(session.snapshot()["equipment"]["pumpset-recirc-01"]["variables"]["volume_m3"])
    for hour, frame in enumerate(frames):
        target = (hour + 1) * 3600
        while session.plant.t < target:
            session.apply_profile_hour(int(session.plant.t // 3600) % 24)
            session.plant.step()
        snapshot = session.snapshot()
        measured = session.message()["plc_tags"]
        state = frame["scenarios"][1]["state"]
        metrics = {name: metric(float(state[name]), float(measured[tag])) for name, tag in CHANNELS.items()}
        for name, tag in TANKS.items():
            tank_id = {
                "supply_level_pct": "tank-supply-01",
                "recirc01_level_pct": "tank-recirc-01",
                "recirc02_level_pct": "tank-recirc-02",
            }[name]
            metrics[name] = metric(float(frame["tank_levels_pct"][tank_id]), float(measured[tag]))
        actual_return = float(snapshot["equipment"]["pumpset-recirc-01"]["variables"]["volume_m3"])
        projected_return = float(frame["snapshot"]["lines"]["recirculacion"]["output_units"])
        metrics["recirculated_m3"] = metric(projected_return, actual_return - previous_return)
        previous_return = actual_return
        pressure_agreement = (float(state["critical_pressure_mca"]) >= 15) == (float(measured["PLC.PRS.CriticalPressureMca"]) >= 15)
        report["samples"].append(
            {
                "profile_hour": hour,
                "emulator_t_s": session.plant.t,
                "forecast_t_s": frame["plc_tags"]["PLC.Session.SimulatedTime"],
                "pressure_safety_agreement": pressure_agreement,
                "fractal_feasible": frame["scenarios"][1]["feasible"],
                "metrics": metrics,
            }
        )
        report["summary"] = summary(report["samples"])
        report["safety_disagreements"] = [item["profile_hour"] for item in report["samples"] if not item["pressure_safety_agreement"]]
        report["elapsed_real_s"] = round(monotonic() - started, 2)
        output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(
            f"hora {hour + 1:02}/{hours:02} · caudal {metrics['flow_m3h']['error_pct']:.2f} % · "
            f"suministro {metrics['supply_level_pct']['absolute_error']:.2f} pp · "
            f"retorno {metrics['recirculated_m3']['absolute_error']:.3f} m³",
            flush=True,
        )
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True, help="Archivo JSON de resultados y checkpoints horarios")
    parser.add_argument("--hours", type=int, default=24, choices=range(1, 25), metavar="1..24")
    args = parser.parse_args()
    result = compare(args.output, hours=args.hours)
    print(json.dumps({"summary": result["summary"], "safety_disagreements": result["safety_disagreements"]}, indent=2))
    if result["safety_disagreements"]:
        parser.exit(1, "Fractal y emulador discrepan sobre el umbral de 15 mca\n")


if __name__ == "__main__":
    main()
