"""Reproduce a ×240 un contraste hidráulico PRECALCULADO de 24 horas.

Cada hora simulada se MUESTRA tras 15 s reales; no se afirma que el solver
operativo calcule 3.600 pasos en ese tiempo. Requiere un informe poscorrección
creado con ``validate_fractal_day.py``; rechaza artefactos diagnósticos viejos.
"""

from __future__ import annotations

import argparse
import json
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any

METRICS = ("flow_m3h", "critical_pressure_mca", "supply_level_pct", "recirculated_m3")


def validate_report(report: dict[str, Any]) -> list[dict[str, Any]]:
    """Nunca presentar un artefacto incompleto o anterior al arreglo como día nuevo."""
    if report.get("scope") != "continuous 24-hour emulator run compared to 24 hourly Fractal forecasts":
        raise ValueError("se requiere una corrida continua, no 24 puntos estacionarios")
    if report.get("validation_status") != "post_session_snapshot_cache":
        raise ValueError("solo se admite informe poscorrección con muestras PLC estables por tick")
    samples = report.get("samples")
    if not isinstance(samples, list) or len(samples) != 24:
        raise ValueError("se requieren 24 horas completas del emulador")
    for hour, sample in enumerate(samples):
        if sample.get("profile_hour") != hour or any(name not in sample.get("metrics", {}) for name in METRICS):
            raise ValueError(f"hora {hour}: faltan canales o perfil horario")
    return samples


def replay(
    report: dict[str, Any],
    *,
    seconds_per_hour: float = 15.0,
    now: Callable[[], float] = time.monotonic,
    sleep: Callable[[float], None] = time.sleep,
    emit: Callable[[str], None] = print,
) -> list[dict[str, float | int]]:
    """Reloj de pared monotónico: hora 24 sale a los 360 s, sin deriva acumulada."""
    samples = validate_report(report)
    if seconds_per_hour <= 0:
        raise ValueError("seconds_per_hour debe ser positivo")
    started = now()
    emit(f"REPRODUCCIÓN PRECALCULADA · ×{3600 / seconds_per_hour:g} · 1 h simulada/{seconds_per_hour:g} s reales · NO EN VIVO")
    ticks: list[dict[str, float | int]] = []
    for hour, sample in enumerate(samples, 1):
        deadline = started + hour * seconds_per_hour
        sleep(max(0.0, deadline - now()))
        elapsed = now() - started
        m = sample["metrics"]
        emit(
            f"hora {hour:02}/24 · real {elapsed:.1f} s · "
            f"caudal F/E {m['flow_m3h']['fractal']:.2f}/{m['flow_m3h']['emulator']:.2f} m³/h · "
            f"presión F/E {m['critical_pressure_mca']['fractal']:.2f}/{m['critical_pressure_mca']['emulator']:.2f} mca · "
            f"tanque F/E {m['supply_level_pct']['fractal']:.1f}/{m['supply_level_pct']['emulator']:.1f} %"
        )
        ticks.append({"profile_hour": hour - 1, "real_elapsed_s": round(elapsed, 3), "scheduled_s": hour * seconds_per_hour})
    return ticks


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True, help="Informe continuo poscorrección del emulador")
    parser.add_argument("--events", type=Path, help="Guardar tiempos reales de la reproducción")
    parser.add_argument("--seconds-per-hour", type=float, default=15, help="15 por defecto: ×240")
    args = parser.parse_args()
    report = json.loads(args.input.read_text(encoding="utf-8"))
    ticks = replay(report, seconds_per_hour=args.seconds_per_hour)
    if args.events:
        args.events.write_text(
            json.dumps({"mode": "precomputed-replay", "source": str(args.input), "ticks": ticks}, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
    print(f"FIN · {len(ticks)} horas mostradas en {ticks[-1]['real_elapsed_s']:.1f} s reales; cálculo operativo hecho aparte.")


if __name__ == "__main__":
    main()
