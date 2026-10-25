"""Contrasta 24 consignas horarias en régimen, NO una corrida continua de 24 h.

El validador puede importar ambos motores; el runtime de Fractal no importa el
emulador. Cada consigna PLC se ejecuta durante una ventana de estabilización en
el emulador y se compara contra el frame nominal Fractal correspondiente.
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

PLANT = "water-network-scale-v1"
PROFILE = Path(__file__).resolve().parents[2] / "industrial-models" / PLANT / "operation-profiles" / "pdd-rca-01.json"
CHANNELS = {
    "flow_m3h": "PLC.Pump.FlowM3h",
    "critical_pressure_mca": "PLC.PRS.CriticalPressureMca",
    "pump_discharge_mca": "PLC.Pump.DischargePressureMca",
    "prs_outlet_mca": "PLC.PRS.OutletPressureMca",
}


def compare(window_s: int = 120) -> dict[str, Any]:
    """Ventanas consecutivas; los pasos por hora son locales, no 3600 s."""
    if window_s < 1:
        raise ValueError("window_s debe ser positivo")
    profile = json.loads(PROFILE.read_text(encoding="utf-8"))
    session = session_manager.create(PLANT, _plant_model(PLANT), profile_id=profile["id"], profile=profile)
    session.apply_profile_hour(0)
    for _ in range(30):
        session.plant.step()
    tags = session.message()["plc_tags"]
    if tags["PLC.Pump.RunningCount"] == 0:
        raise RuntimeError("la bomba no se estabilizó")
    started = monotonic()
    frames = project_24h(tags, profile, "baseline")
    samples = []
    for hour, frame in enumerate(frames):
        session.apply_profile_hour(hour)
        for _ in range(window_s):
            session.plant.step()
        measured = session.message()["plc_tags"]
        state = frame["scenarios"][1]["state"]
        metrics = {}
        for name, tag in CHANNELS.items():
            predicted = float(state[name])
            actual = float(measured[tag])
            metrics[name] = {
                "fractal": round(predicted, 5),
                "emulator": round(actual, 5),
                "absolute_error": round(abs(predicted - actual), 5),
                # Evita porcentajes explosivos cuando un canal es casi cero.
                "error_pct": round(100 * abs(predicted - actual) / max(1.0, abs(actual)), 4),
            }
        samples.append({"profile_hour": hour, "metrics": metrics, "fractal_feasible": frame["scenarios"][1]["feasible"]})
    safety_disagreements = [
        sample["profile_hour"]
        for sample in samples
        if (sample["metrics"]["critical_pressure_mca"]["fractal"] >= 15) != (sample["metrics"]["critical_pressure_mca"]["emulator"] >= 15)
    ]
    summary = {
        name: {
            "mean_error_pct": round(statistics.mean(sample["metrics"][name]["error_pct"] for sample in samples), 4),
            "peak_error_pct": max(sample["metrics"][name]["error_pct"] for sample in samples),
            "peak_hour": max(range(24), key=lambda hour: samples[hour]["metrics"][name]["error_pct"]),
        }
        for name in CHANNELS
    }
    return {
        "scope": "24 hourly steady-state setpoints; not a continuous 24-hour tank/transient validation",
        "plant_id": PLANT,
        "profile_id": profile["id"],
        "window_s": window_s,
        "elapsed_real_s": round(monotonic() - started, 2),
        "summary": summary,
        "safety_disagreements": safety_disagreements,
        "samples": samples,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--window-s", type=int, default=120)
    parser.add_argument("--output", type=Path, help="Guardar informe JSON fuera del registro (sin credenciales)")
    args = parser.parse_args()
    report = compare(args.window_s)
    result = json.dumps(report, ensure_ascii=False, indent=2)
    if args.output:
        args.output.write_text(result + "\n", encoding="utf-8")
    print(
        json.dumps(
            {"scope": report["scope"], "summary": report["summary"], "safety_disagreements": report["safety_disagreements"]},
            ensure_ascii=False,
            indent=2,
        )
    )
    if report["safety_disagreements"]:
        parser.exit(1, "Fractal y emulador discrepan sobre el umbral crítico de 15 mca\n")


if __name__ == "__main__":
    main()
