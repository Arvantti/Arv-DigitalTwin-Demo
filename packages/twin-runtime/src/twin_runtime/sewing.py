"""Lógica común de un puesto de costura industrial discreto, atendido por una persona."""

from __future__ import annotations

import math
from typing import Any

from twin_runtime import EquipmentBehavior, StepContext


class SewingMachineBehavior(EquipmentBehavior):
    """Ciclo unitario con cola limitada, salida bloqueable y puntada animable."""

    DEFAULT_INPUTS = {"inflow_upm": None, "operator_present": True, "downstream_free": True}

    def setup(self) -> None:
        self.queue = 0
        self.arrivals = 0.0
        self.units = 0
        self.cycle_left = 0.0
        self.in_cycle = False
        self.waiting_output = False
        self.started = False
        self.stop_requested = False
        self.busy_s = 0.0
        self.starved_s = 0.0
        self._starved_announced = False

    @property
    def phase(self) -> str | None:
        return "sewing" if self.in_cycle else None

    def on_command(self, name: str, args: dict[str, Any]) -> bool:
        if name == "start":
            self.started = True
            self.stop_requested = False
        elif name == "stop":
            self.stop_requested = True
        else:
            return False
        return True

    def on_fault(self, fault_id: str) -> None:
        # Conserva el avance: al reparar la máquina continúa la misma pieza.
        return None

    def update(self, ctx: StepContext) -> None:
        dt = max(0.0, ctx.dt)
        p = self.p
        cap = int(p["queue_capacity"])
        raw_inflow = self.inputs["inflow_upm"]
        rate = p["nominal_inflow_upm"] if raw_inflow is None else max(0.0, float(raw_inflow))
        self.arrivals += rate * dt / 60.0
        arrived = min(int(self.arrivals), cap - self.queue)
        if arrived > 0:
            self.queue += arrived
            self.arrivals -= arrived
        accepting = self.queue < cap
        if not accepting and arrived:
            self.emit("queue_full")
        if self.failures.stopping is not None:
            return

        remaining = dt
        if self.waiting_output:
            if self.inputs["downstream_free"]:
                self.waiting_output = False
                self.units += 1
                self.emit("garment_completed", unit=self.units)
            else:
                self.state.set("blocked")
                return

        if self.started and self.inputs["operator_present"] and self.inputs["downstream_free"]:
            while remaining > 1e-9:
                if not self.in_cycle:
                    if self.stop_requested:
                        self.started = False
                        self.stop_requested = False
                        self.state.set("idle")
                        break
                    if self.queue <= 0:
                        self.state.set("starved")
                        self.starved_s += remaining
                        if not self._starved_announced:
                            self.emit("starved")
                            self._starved_announced = True
                        break
                    self.queue -= 1
                    self.in_cycle = True
                    self.cycle_left = float(p["cycle_s"])
                    self._starved_announced = False
                self.state.set("running")
                step = min(remaining, self.cycle_left)
                self.cycle_left -= step
                remaining -= step
                self.busy_s += step
                if self.cycle_left <= 1e-9:
                    self.in_cycle = False
                    self.cycle_left = 0.0
                    if self.inputs["downstream_free"]:
                        self.units += 1
                        self.emit("garment_completed", unit=self.units)
                    else:
                        self.waiting_output = True
                        self.state.set("blocked")
                        break
        elif not self.started:
            self.state.set("idle")
        elif not self.inputs["operator_present"]:
            self.state.set("idle")
        elif not self.inputs["downstream_free"]:
            self.state.set("blocked")

    def true_values(self) -> dict[str, Any]:
        cycle_pct = 100.0 * (1.0 - self.cycle_left / self.p["cycle_s"]) if self.in_cycle else 0.0
        running = self.state.current == "running"
        output_rate = 60.0 / self.p["cycle_s"] if running else 0.0
        return {
            "units_processed": self.units,
            "feed_queue": self.queue,
            "output_upm": output_rate,
            "cycle_pct": cycle_pct,
            "needle_speed_spm": float(self.p["max_speed_spm"]) if running else 0.0,
            "power_kw": float(self.p["power_kw"]) if running else 0.08,
            "accepting_infeed": 1 if self.queue < self.p["queue_capacity"] else 0,
        }

    def kpis(self) -> dict[str, Any]:
        hours = self.t / 3600.0
        return {
            "utilization": self.busy_s / self.t if self.t > 0 else 0.0,
            "units_per_h": self.units / hours if hours > 0 else 0.0,
            "starved_pct": self.starved_s / self.t if self.t > 0 else 0.0,
        }

    def animation(self) -> dict[str, float]:
        running = self.state.current == "running"
        phase = (self.t * self.p["max_speed_spm"] / 60.0) % 1.0
        light = {"running": 1.0, "fault": 3.0, "idle": 0.0}.get(self.state.current, 2.0)
        return {
            "needle": 0.5 + 0.5 * math.sin(phase * math.tau) if running else 0.0,
            "handwheel": phase if running else 0.0,
            "operator_working": 1.0 if running else 0.0,
            "progress": max(0.0, min(1.0, 1.0 - self.cycle_left / self.p["cycle_s"])) if self.in_cycle else 0.0,
            "stack_light": light,
        }
