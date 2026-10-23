"""Optimizador independiente de Fractal; recibe tags PLC, no objetos del emulador."""

from __future__ import annotations

from typing import Any

MIN_PRESSURE_MCA = 15.0


def recommend_instant(tags: dict[str, Any], objective_id: str) -> dict[str, Any]:
    """Propone una consigna conservadora sin escribir en la sesión.

    Primera versión: reduce presión manual solo cuando el margen crítico publicado
    permite mantener 0,45 mca sobre el mínimo. La hidráulica detallada se añadirá
    al modelo independiente de cada planta.
    """
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
    proposed = round(max(15.0, manual - min(1.0, critical - (MIN_PRESSURE_MCA + 0.45))), 2)
    return {
        "status": "pending",
        "objective_id": objective_id,
        "reason": "Existe margen de presión crítica para reducir presión y fuga estimada.",
        "base": {"critical_pressure_mca": critical, "leakage_m3h": leakage},
        "optimized": {
            "critical_pressure_mca": max(MIN_PRESSURE_MCA + 0.45, critical - (manual - proposed)),
            "leakage_m3h": round(leakage * (proposed / manual) ** 0.5, 4),
        },
        "proposal": [{"equipment": "prs-01", "command": "set_manual_setting", "args": {"mca": proposed}}],
    }
