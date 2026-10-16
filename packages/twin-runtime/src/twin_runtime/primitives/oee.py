"""OEE = disponibilidad × rendimiento × calidad, calculado a partir de tiempos y conteos reales."""

from __future__ import annotations


class OEEAccumulator:
    # Estados que no cuentan como tiempo planificado de producción.
    UNPLANNED = frozenset({"off", "maintenance", "cleaning"})

    def __init__(self, ideal_cycle_s: float, units_per_cycle: int = 1) -> None:
        self.ideal_cycle_s = ideal_cycle_s
        self.units_per_cycle = units_per_cycle
        self.planned_s = 0.0
        self.run_s = 0.0
        self.total_units = 0
        self.good_units = 0

    def tick(self, state: str, dt: float) -> None:
        if state in self.UNPLANNED:
            return
        self.planned_s += dt
        if state == "running":
            self.run_s += dt

    def count(self, good: int, bad: int) -> None:
        self.good_units += good
        self.total_units += good + bad

    def values(self) -> dict[str, float | None]:
        if self.planned_s <= 0:
            return {"availability": None, "performance": None, "quality": None, "oee": None}
        availability = self.run_s / self.planned_s
        ideal_rate = self.units_per_cycle / self.ideal_cycle_s
        performance = min(1.0, self.total_units / (ideal_rate * self.run_s)) if self.run_s > 0 else 0.0
        quality = self.good_units / self.total_units if self.total_units else None
        oee = availability * performance * quality if quality is not None else None
        return {"availability": availability, "performance": performance, "quality": quality, "oee": oee}
