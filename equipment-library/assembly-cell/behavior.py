"""Comportamiento de una celda de ensamble manual (B2): cubetas de componentes, ciclo fijo del operario y salida."""

from __future__ import annotations

from typing import Any

from twin_runtime import EquipmentBehavior, StepContext


class AssemblyCell(EquipmentBehavior):
    type = "assembly-cell"
    DEFAULT_INPUTS = {"inflow_a_upm": None, "inflow_b_upm": None, "operator_present": True, "downstream_free": True}

    def setup(self) -> None:
        self.bin_a = 0
        self.bin_b = 0
        self.arrivals_a = 0.0
        self.arrivals_b = 0.0
        self.accepting_a = True
        self.accepting_b = True
        self.work_left = 0.0
        self.in_progress = False
        self.done_waiting = False
        self.assembled = 0
        self.busy_s = 0.0
        self.starved_s = 0.0
        self.starved = False

    def _arrive(self, key: str, nominal: float, bin_: int, arrivals: float, dt: float) -> tuple[int, float, bool]:
        inflow = self.inputs[key]
        inflow = nominal if inflow is None else max(0.0, float(inflow))
        cap = self.p["bin_capacity_units"]
        arrivals += inflow / 60.0 * dt
        take = min(int(arrivals), cap - bin_)
        bin_ += take
        arrivals -= take
        accepting = bin_ < cap
        if not accepting:
            arrivals = min(arrivals, 1.0)
        return bin_, arrivals, accepting

    def update(self, ctx: StepContext) -> None:
        dt = ctx.dt
        p = self.p
        was_a, was_b = self.accepting_a, self.accepting_b
        nominal_a, nominal_b = p["nominal_inflow_a_upm"], p["nominal_inflow_b_upm"]
        self.bin_a, self.arrivals_a, self.accepting_a = self._arrive("inflow_a_upm", nominal_a, self.bin_a, self.arrivals_a, dt)
        self.bin_b, self.arrivals_b, self.accepting_b = self._arrive("inflow_b_upm", nominal_b, self.bin_b, self.arrivals_b, dt)
        if was_a and not self.accepting_a:
            self.emit("bin_a_full")
        if was_b and not self.accepting_b:
            self.emit("bin_b_full")

        if self.failures.stopping is not None:
            return

        # unidad terminada que espera salida
        if self.done_waiting:
            if self.inputs["downstream_free"]:
                self.done_waiting = False
                self.assembled += 1
                self.emit("unit_completed", unit=self.assembled)
            else:
                self.state.set("blocked")
                return

        if not self.inputs["operator_present"]:
            self.state.set("idle")
            return

        if not self.in_progress:
            if self.bin_a >= p["parts_a_per_unit"] and self.bin_b >= p["parts_b_per_unit"]:
                self.bin_a -= p["parts_a_per_unit"]
                self.bin_b -= p["parts_b_per_unit"]
                self.work_left = float(p["cycle_s"])
                self.in_progress = True
                self.starved = False
            else:
                self.state.set("starved")
                self.starved_s += dt
                if not self.starved:
                    self.starved = True
                    self.emit("starved")
                return

        self.state.set("running")
        self.busy_s += dt
        self.work_left -= p["operators"] * dt
        if self.work_left <= 1e-9:
            self.in_progress = False
            self.work_left = 0.0
            if self.inputs["downstream_free"]:
                self.assembled += 1
                self.emit("unit_completed", unit=self.assembled)
            else:
                self.done_waiting = True
                self.state.set("blocked")

    def true_values(self) -> dict[str, Any]:
        cycle = 100.0 * (1.0 - self.work_left / self.p["cycle_s"]) if self.in_progress else 0.0
        return {
            "bin_a_units": self.bin_a,
            "bin_b_units": self.bin_b,
            "units_assembled": self.assembled,
            "cycle_pct": cycle,
            "accepting_a": 1 if self.accepting_a else 0,
            "accepting_b": 1 if self.accepting_b else 0,
        }

    def kpis(self) -> dict[str, Any]:
        hours = self.t / 3600.0
        return {
            "utilization": self.busy_s / self.t if self.t > 0 else 0.0,
            "units_per_h": self.assembled / hours if hours > 0 else 0.0,
            "starved_pct": self.starved_s / self.t if self.t > 0 else 0.0,
        }

    def animation(self) -> dict[str, float]:
        s = self.state.current
        light = {"running": 1.0, "idle": 2.0, "starved": 2.0, "blocked": 2.0, "fault": 3.0}.get(s, 0.0)
        cap = self.p["bin_capacity_units"]
        return {
            "bin_a_fill": self.bin_a / cap,
            "bin_b_fill": self.bin_b / cap,
            "cycle": 1.0 - self.work_left / self.p["cycle_s"] if self.in_progress else 0.0,
            "working": 1.0 if s == "running" else 0.0,
            "output_fill": 1.0 if self.done_waiting else 0.0,
            "stack_light": light,
        }
