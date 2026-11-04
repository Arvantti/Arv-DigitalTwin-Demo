"""Optimizador independiente de Fractal; propone sin mandar PLC."""

from __future__ import annotations

from typing import Any

from .instant_search import optimize


def recommend_instant(tags: dict[str, Any], objective_id: str, target_pressure_mca: float) -> dict[str, Any]:
    """Propone una consigna solo si el objetivo de presión elegido es factible."""
    critical = float(tags.get("PLC.PRS.CriticalPressureMca") or 0)
    manual = float(tags.get("PLC.PRS.ManualSettingMca") or tags.get("PLC.PRS.OutletPressureMca") or 0)
    leakage = sum(float(tags.get(f"PLC.Grid.L{level}.LeakageM3h") or 0) for level in range(1, 5))
    if manual <= 0:
        return {
            "status": "no_change",
            "objective_id": objective_id,
            "target_pressure_mca": target_pressure_mca,
            "reason": "No hay una consigna PRS actual válida para iniciar la búsqueda.",
            "base": {"critical_pressure_mca": critical, "leakage_m3h": leakage},
            "proposal": [],
        }
    search = optimize(tags, target_pressure_mca)
    if not search["constraints_satisfied"]:
        return {
            "status": "no_change",
            "objective_id": objective_id,
            "target_pressure_mca": target_pressure_mca,
            "reason": f"El modelo no alcanza la presión mínima seleccionada de {target_pressure_mca:g} mca.",
            "base": search["base"],
            "optimized": search["optimized"],
            "proposal": [],
        }
    optimized = search["optimized"]
    proposed = float(optimized["prs_mca"])
    return {
        "status": "pending",
        "objective_id": objective_id,
        "target_pressure_mca": target_pressure_mca,
        "reason": f"Propuesta para mantener al menos {target_pressure_mca:g} mca en el punto crítico.",
        "estimated_vrp_opening_pct": optimized["vrp_opening_pct"],
        "base": search["base"],
        "optimized": optimized,
        "proposal": [{"equipment": "prs-01", "command": "set_manual_setting", "args": {"mca": proposed}}],
    }
