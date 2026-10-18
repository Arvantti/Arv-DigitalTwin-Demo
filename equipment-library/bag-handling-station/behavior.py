"""Comportamiento de una estación manual de equipaje (B2): nivel 3 de seguridad o codificación de etiquetas."""

from __future__ import annotations

from collections import deque
from typing import Any

from twin_runtime import EquipmentBehavior, StepContext

SLOW_FACTOR = 1.5  # sin detector de trazas o lector de mano


class BagHandlingStation(EquipmentBehavior):
    type = "bag-handling-station"
    DEFAULT_INPUTS = {"inflow_upm": None, "downstream_free": True}

    def setup(self) -> None:
        self.arrivals = 0.0
        self.waiting: deque[float] = deque()  # hora de llegada de cada maleta en la mesa
        self.working: list[float] = []  # tiempo que le falta a cada maleta en atención
        self.done_q = 0
        self.reject_acc = 0.0
        self.handled = 0
        self.rejected = 0
        self.released = 0
        self.release_credit = 1.0
        self.accepting = True
        self.busy_s = 0.0
        self.wait_sum_s = 0.0
        self.started = 0
        self.travel = 0.0

    def on_command(self, name: str, args: dict[str, Any]) -> bool:
        if name == "set_operators":
            self.p["operators"] = max(0, int(args["n"]))
            return True
        return False

    def update(self, ctx: StepContext) -> None:
        dt = ctx.dt
        p = self.p
        stopped = self.failures.stopping is not None

        inflow = self.inputs["inflow_upm"]
        self.arrivals += (p["nominal_inflow_upm"] if inflow is None else float(inflow)) / 60.0 * dt
        while self.arrivals >= 1.0 - 1e-9:
            self.arrivals -= 1.0
            self.waiting.append(self.t)

        if not stopped:
            still: list[float] = []
            for r in self.working:
                r -= dt
                if r <= 1e-9:
                    self.handled += 1
                    self.reject_acc += p["reject_pct"] / 100.0
                    if self.reject_acc >= 1.0 - 1e-9:
                        self.reject_acc -= 1.0
                        self.rejected += 1
                        self.emit("bag_rejected")
                    else:
                        self.done_q += 1
                else:
                    still.append(r)
            self.working = still
            handle = p["handle_s"] * (SLOW_FACTOR if self.failures.is_active("trace_detector_fault") else 1.0)
            while self.waiting and len(self.working) < int(p["operators"]):
                arrived = self.waiting.popleft()
                self.wait_sum_s += max(0.0, self.t - arrived)
                self.started += 1
                self.working.append(handle)
            self.busy_s += len(self.working) * dt

        # banda de reingreso al clasificador
        gap = float(p["release_gap_s"])
        self.release_credit = min(max(1.0, dt / gap), self.release_credit + dt / gap)
        downstream = bool(self.inputs["downstream_free"])
        while downstream and self.done_q and self.release_credit >= 1.0 - 1e-9:
            self.release_credit -= 1.0
            self.done_q -= 1
            self.released += 1
            self.travel = (self.travel + 1.5) % 10.0

        cap = p["queue_capacity"]
        n = len(self.waiting)
        accepting = n < cap - 1 if not self.accepting else n < cap
        if accepting != self.accepting:
            self.emit("accepting_again" if accepting else "full")
            self.accepting = accepting

        if stopped:
            return
        if self.done_q and not downstream:
            self.state.set("blocked")
        elif self.waiting or self.working or self.done_q:
            self.state.set("running")
        else:
            self.state.set("idle")

    def true_values(self) -> dict[str, Any]:
        return {
            "queue": len(self.waiting),
            "in_process": len(self.working),
            "handled": self.handled,
            "rejected": self.rejected,
            "released": self.released,
            "accepting": 1 if self.accepting else 0,
            "oldest_wait_min": (self.t - self.waiting[0]) / 60.0 if self.waiting else 0.0,
        }

    def kpis(self) -> dict[str, Any]:
        hours = self.t / 3600.0
        ops = int(self.p["operators"])
        return {
            "bags_per_h": self.handled / hours if hours > 0 else None,
            "utilization": self.busy_s / (ops * self.t) if ops and self.t > 0 else 0.0,
            "reject_rate": self.rejected / self.handled if self.handled else 0.0,
            "avg_wait_min": self.wait_sum_s / self.started / 60.0 if self.started else 0.0,
        }

    def animation(self) -> dict[str, float]:
        s = self.state.current
        light = 3.0 if s == "fault" else 2.0 if not self.accepting or s == "blocked" else 1.0 if s == "running" else 0.0
        return {
            "queue": float(len(self.waiting)),
            "in_process": float(len(self.working)),
            "belt_travel": self.travel,
            "stack_light": light,
        }
