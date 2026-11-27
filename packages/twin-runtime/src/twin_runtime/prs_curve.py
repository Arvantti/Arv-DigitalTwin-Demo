"""Curva asumida de apertura VRP → consigna de presión, compartida por modelos."""

from __future__ import annotations

import math


def outlet_target_from_opening(opening_pct: float, inlet_pressure_mca: float) -> float:
    """No es un Kv físico: reproduce la curva S declarada por el escenario."""
    opening = min(100.0, max(20.0, float(opening_pct)))
    fraction = (opening - 20.0) / 80.0
    return 15.0 + max(0.0, float(inlet_pressure_mca) - 15.0) * (0.5 - 0.5 * math.cos(math.pi * fraction))
