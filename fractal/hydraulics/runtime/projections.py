"""Proyección horaria Fractal basada en tags PLC y perfil futuro declarado."""

from __future__ import annotations

from typing import Any


def project_horizon(tags: dict[str, Any], profile: dict[str, Any]) -> list[dict[str, Any]]:
    """Genera una base trazable por hora; no escribe ni activa perfiles.

    La demanda se escala contra la apertura global declarada y toda proyección se
    marca asumida hasta completar el solucionador Fractal independiente.
    """
    base_flow = sum(float(tags.get(f"PLC.Grid.L{level}.ConsumptionM3h") or 0) for level in range(1, 5))
    base_leak = sum(float(tags.get(f"PLC.Grid.L{level}.LeakageM3h") or 0) for level in range(1, 5))
    hours: list[dict[str, Any]] = []
    for hour in range(24):
        entry = profile.get("hours", {}).get(str(hour), {})
        pct = float(entry.get("global_consumers_pct", 100)) / 100
        hours.append(
            {
                "hour": hour,
                "assumed": True,
                "base": {"consumption_m3h": round(base_flow * pct, 4), "leakage_m3h": round(base_leak * pct**0.5, 4)},
                "profile_commands": entry,
            }
        )
    return hours
