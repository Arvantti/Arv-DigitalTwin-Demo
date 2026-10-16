"""Fallas aleatorias por MTBF/MTTR e inyección manual de fallas."""

from __future__ import annotations

import math
import random
from dataclasses import dataclass


@dataclass
class ActiveFault:
    id: str
    stops_equipment: bool
    remaining_s: float
    severity: str


class FailureModel:
    """Cada falla con mtbf_h ocurre como proceso de Poisson sobre el tiempo de operación.
    La reparación dura una muestra lognormal centrada en mttr_min (dispersión moderada)."""

    def __init__(self, faults: list[dict], rng: random.Random, enabled: bool = True) -> None:
        self.defs = {f["id"]: f for f in faults}
        self.rng = rng
        self.enabled = enabled
        self.active: dict[str, ActiveFault] = {}

    def _repair_time_s(self, fault_id: str) -> float:
        mttr_s = self.defs[fault_id]["mttr_min"] * 60.0
        sigma = 0.4
        # media de la lognormal = mttr  ->  mu = ln(mttr) - sigma²/2
        return self.rng.lognormvariate(math.log(mttr_s) - sigma**2 / 2, sigma)

    def trigger(self, fault_id: str, duration_s: float | None = None) -> ActiveFault:
        if fault_id not in self.defs:
            raise KeyError(f"falla no declarada en el contrato: {fault_id}")
        d = self.defs[fault_id]
        fault = ActiveFault(
            id=fault_id,
            stops_equipment=d.get("stops_equipment", True),
            remaining_s=duration_s if duration_s is not None else self._repair_time_s(fault_id),
            severity=d.get("severity", "medium"),
        )
        self.active[fault_id] = fault
        return fault

    def step(self, dt: float, operating: bool) -> tuple[list[str], list[str]]:
        """Avanza el reloj de fallas. Devuelve (fallas nuevas, fallas reparadas)."""
        new: list[str] = []
        cleared: list[str] = []
        for fid, fault in list(self.active.items()):
            fault.remaining_s -= dt
            if fault.remaining_s <= 0:
                del self.active[fid]
                cleared.append(fid)
        if self.enabled and operating:
            for fid, d in self.defs.items():
                mtbf_h = d.get("mtbf_h")
                if not mtbf_h or fid in self.active:
                    continue
                if self.rng.random() < 1.0 - math.exp(-dt / (mtbf_h * 3600.0)):
                    self.trigger(fid)
                    new.append(fid)
        return new, cleared

    def clear(self, fault_id: str | None = None) -> list[str]:
        ids = [fault_id] if fault_id else list(self.active)
        return [fid for fid in ids if self.active.pop(fid, None) is not None]

    def is_active(self, fault_id: str) -> bool:
        return fault_id in self.active

    @property
    def stopping(self) -> ActiveFault | None:
        """La falla activa más grave que detiene el equipo, si hay alguna."""
        order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
        stops = [f for f in self.active.values() if f.stops_equipment]
        return min(stops, key=lambda f: order.get(f.severity, 9)) if stops else None
