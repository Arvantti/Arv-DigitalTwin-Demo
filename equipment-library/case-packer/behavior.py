"""Comportamiento de la encajadora (B2): pulmón de unidades, ciclo de caja y paradas."""

from __future__ import annotations

from typing import Any

from twin_runtime import EquipmentBehavior, StepContext
from twin_runtime.primitives import PhaseSequencer

SPLIT = [("erect", 0.3), ("load", 0.4), ("close", 0.3)]


class CasePacker(EquipmentBehavior):
    type = "case-packer"
    DEFAULT_INPUTS = {"inflow_upm": None, "boxes_available": True, "downstream_free": True}

    def setup(self) -> None:
        self.buffer = 0
        self.arrivals = 0.0
        self.cases = 0
        self.packed = 0
        self.seq: PhaseSequencer | None = None
        self.holding_case = False
        self.accepting = True
        self.busy_s = 0.0
        self.starved_s = 0.0

    @property
    def capacity(self) -> int:
        return self.p["units_per_case"] * self.p["buffer_cases"]

    @property
    def phase(self) -> str | None:
        return self.seq.phase if self.seq and self.seq.running else None

    def on_fault(self, fault_id: str) -> None:
        pass  # el ciclo queda congelado y continúa al reparar

    def update(self, ctx: StepContext) -> None:
        dt = ctx.dt
        p = self.p
        upc = p["units_per_case"]
        inflow = self.inputs["inflow_upm"]
        inflow = p["nominal_inflow_upm"] if inflow is None else float(inflow)
        self.arrivals += inflow / 60.0 * dt
        while self.arrivals >= 1.0 and self.buffer < self.capacity:
            self.buffer += 1
            self.arrivals -= 1.0
        accepting = self.buffer < self.capacity
        if not accepting and self.accepting:
            self.emit("buffer_full")
        self.accepting = accepting
        if not accepting:
            self.arrivals = min(self.arrivals, 1.0)

        if self.failures.stopping is not None:
            return
        if self.holding_case:
            if not self.inputs["downstream_free"]:
                self.state.set("blocked")
                return
            self.holding_case = False
        if self.seq is None or not self.seq.running:
            if self.buffer < upc:
                self.state.set("idle")
                return
            if not self.inputs["boxes_available"]:
                self.state.set("starved")
                self.starved_s += dt
                return
            self.buffer -= upc
            self.seq = PhaseSequencer([(n, p["cycle_s"] * f) for n, f in SPLIT])
            self.seq.start()
        self.state.set("running")
        self.busy_s += dt
        if "close" in self.seq.step(dt):
            self.cases += 1
            self.packed += upc
            self.emit("case_completed", case=self.cases)
            self.holding_case = not self.inputs["downstream_free"]

    def true_values(self) -> dict[str, Any]:
        minutes = self.t / 60.0
        return {
            "buffer_units": self.buffer,
            "cases_count": self.cases,
            "units_packed": self.packed,
            "cases_per_min": self.cases / minutes if minutes > 0 else 0.0,
            "accepting": 1 if self.accepting else 0,
        }

    def kpis(self) -> dict[str, Any]:
        return {
            "utilization": self.busy_s / self.t if self.t > 0 else 0.0,
            "starved_pct": self.starved_s / self.t if self.t > 0 else 0.0,
        }

    def animation(self) -> dict[str, float]:
        phase = self.phase
        prog = 0.0
        flaps = 0.0
        if self.seq and self.seq.running:
            done = sum(d for _, d in self.seq.phases[: self.seq.index]) + self.seq.elapsed
            prog = done / self.seq.cycle_duration
            flaps = self.seq.phase_progress if phase == "close" else 0.0
        elif self.holding_case:
            prog, flaps = 1.0, 1.0
        s = self.state.current
        light = {"running": 1.0, "idle": 1.0, "fault": 3.0}.get(s, 2.0)
        return {"case_progress": prog, "flaps": flaps, "buffer_fill": self.buffer / self.capacity, "stack_light": light}
