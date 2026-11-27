"""Política común de histéresis de la bomba de retorno.

No integra tanques ni consulta PLC: ambos motores entregan los niveles de su
propio estado y mantienen por separado el latch de marcha.
"""

from __future__ import annotations


def return_pump_requested(
    was_on: bool,
    source_1_pct: float,
    source_2_pct: float,
    supply_pct: float,
    *,
    stop_pct: float,
    start_pct: float,
    full_pct: float,
    supply_start_pct: float,
    return_high_start_pct: float,
) -> bool:
    source_mean = (source_1_pct + source_2_pct) / 2
    if source_mean < stop_pct or supply_pct >= full_pct:
        return False
    if was_on:
        return True
    if supply_start_pct > 0 and supply_pct <= supply_start_pct + 1e-8:
        return True
    if return_high_start_pct < 100 and max(source_1_pct, source_2_pct) + 1e-8 >= return_high_start_pct:
        return True
    return supply_start_pct == 0 and source_mean >= start_pct
