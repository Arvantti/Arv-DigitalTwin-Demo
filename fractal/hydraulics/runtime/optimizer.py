"""Optimizador independiente de Fractal; recibe tags PLC, no objetos del emulador."""

from __future__ import annotations

from typing import Any

from .instant_search import optimize

MIN_PRESSURE_MCA = 15.0


def recommend_instant(tags: dict[str, Any], objective_id: str) -> dict[str, Any]:
    """Propone mandos solo si el cálculo nodal encuentra un punto factible."""
    critical = float(tags.get("PLC.PRS.CriticalPressureMca") or 0)
    manual = float(tags.get("PLC.PRS.ManualSettingMca") or 0)
    leakage = sum(float(tags.get(f"PLC.Grid.L{level}.LeakageM3h") or 0) for level in range(1, 5))
    if critical < MIN_PRESSURE_MCA + 0.45 or manual <= 0:
        return {
            "status": "no_change",
            "objective_id": objective_id,
            "reason": "El margen de presión crítica no permite reducir consigna con seguridad.",
            "base": {"critical_pressure_mca": critical, "leakage_m3h": leakage},
            "proposal": [],
        }
    search = optimize(tags, objective_id=objective_id)
    if not search["constraints_satisfied"]:
        return {
            "status": "no_change",
            "objective_id": objective_id,
            "reason": "El estudio no encontró un punto hidráulico factible; no se publica un mando.",
            "base": search["base"],
            "optimized": search["optimized"],
            "proposal": [],
        }
    proposed = float(search["optimized"]["prs_mca"])
    return {
        "status": "pending",
        "objective_id": objective_id,
        "reason": "Existe margen de presión crítica para reducir presión y fuga estimada.",
        "base": search["base"],
        "optimized": search["optimized"],
        "proposal": [
            {"equipment": "prs-01", "command": "set_manual_setting", "args": {"mca": proposed}},
            *[
                {"equipment": f"valve-between-{key}", "command": "set_opening", "args": {"pct": search["optimized"][name]}}
                for key, name in (("12", "valve_12_pct"), ("23", "valve_23_pct"), ("34", "valve_34_pct"))
            ],
        ],
    }
