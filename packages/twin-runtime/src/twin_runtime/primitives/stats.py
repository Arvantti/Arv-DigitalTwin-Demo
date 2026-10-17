"""Estadística rápida en float (statistics.pstdev usa fracciones exactas y es lenta en un bucle)."""

from __future__ import annotations

import math
from collections.abc import Sequence


def mean_sd(values: Sequence[float]) -> tuple[float | None, float | None]:
    """Media y desviación típica poblacional; (None, None) sin datos, sd None con un solo dato."""
    n = len(values)
    if n == 0:
        return None, None
    m = math.fsum(values) / n
    if n == 1:
        return m, None
    return m, math.sqrt(max(0.0, math.fsum((v - m) ** 2 for v in values) / n))
