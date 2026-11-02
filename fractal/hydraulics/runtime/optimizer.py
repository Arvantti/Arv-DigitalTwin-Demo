"""Optimizador independiente de Fractal; recibe tags PLC, no objetos del emulador."""

from __future__ import annotations

from typing import Any

from .instant_search import optimize

HARD_MIN_PRESSURE_MCA = 15.0


def recommend_instant(tags: dict[str, Any], objective_id: str) -> dict[str, Any]:
    """Propone mandos solo si el cálculo nodal encuentra un punto factible."""
    critical = float(tags.get("PLC.PRS.CriticalPressureMca") or 0)
    manual = float(tags.get("PLC.PRS.ManualSettingMca") or tags.get("PLC.PRS.OutletPressureMca") or 0)
    leakage = sum(float(tags.get(f"PLC.Grid.L{level}.LeakageM3h") or 0) for level in range(1, 5))
    if manual <= 0:
        return {
            "status": "no_change",
            "objective_id": objective_id,
            "reason": "No hay una consigna PRS actual válida para iniciar la búsqueda.",
            "base": {"critical_pressure_mca": critical, "leakage_m3h": leakage},
            "proposal": [],
        }
    search = optimize(tags, objective_id=objective_id)
    if not search["constraints_satisfied"]:
        return {
            "status": "no_change",
            "objective_id": objective_id,
            "reason": f"Ni la consigna máxima conserva {HARD_MIN_PRESSURE_MCA:g} mca; no se publica un mando.",
            "base": search["base"],
            "optimized": search["optimized"],
            "proposal": [],
        }
    optimized = search["optimized"]
    proposed = float(optimized["prs_mca"])
    reason = (
        "La búsqueda sostiene al menos 18 mca en el punto crítico."
        if optimized["target_met"]
        else "18 mca no es alcanzable; se conserva el límite duro de 15 mca."
    )
    return {
        "status": "pending",
        "objective_id": objective_id,
        "reason": reason,
        "estimated_vrp_opening_pct": optimized["vrp_opening_pct"],
        "target_pressure_mca": optimized["target_pressure_mca"],
        "applied_pressure_target_mca": optimized["applied_pressure_target_mca"],
        "base": search["base"],
        "optimized": optimized,
        "proposal": [{"equipment": "prs-01", "command": "set_manual_setting", "args": {"mca": proposed}}],
    }
