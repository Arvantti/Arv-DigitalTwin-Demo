"""Comportamiento de una isla de check-in (B2): fila, atención por mostrador, pesaje e inyección a la colectora."""

from __future__ import annotations

from collections import deque
from typing import Any

from twin_runtime import EquipmentBehavior, StepContext

SLOW_SCALE_S = 30.0  # pesaje manual con la báscula descalibrada


class Counter:
    """Un mostrador: el pasajero que atiende (tiempo restante) y las maletas que tiene en la báscula."""

    def __init__(self) -> None:
        self.remaining: float | None = None
        self.held = 0


class CheckinIsland(EquipmentBehavior):
    type = "checkin-island"
    DEFAULT_INPUTS = {"downstream_free": True}

    def setup(self) -> None:
        self.counters = [Counter() for _ in range(int(self.p["counters"]))]
        self.queue: deque[float] = deque()  # hora de llegada de cada pasajero en la fila
        self.pax_acc = 0.0
        self.bag_acc = 0.0
        self.served = 0
        self.started = 0
        self.wait_sum_s = 0.0
        self.bags_checked = 0
        self.bags_out = 0
        self.oog = 0
        self.excess = 0
        self.last_weight = 0.0
        self.release_credit = 1.0
        self.next_counter = 0
        self.travel = 0.0
        self.blocked_s = 0.0
        self.max_queue = 0
        self.long_queue = False

    # ------------------------------------------------------------------ comandos
    def on_command(self, name: str, args: dict[str, Any]) -> bool:
        if name == "set_arrivals":
            self.p["pax_per_h"] = max(0.0, float(args["pax_per_h"]))
        elif name == "open_counters":
            self.p["open_counters"] = max(0, min(int(args["n"]), int(self.p["counters"])))
        else:
            return False
        return True

    # ------------------------------------------------------------------ simulación
    @property
    def open_counters(self) -> int:
        n = min(int(self.p["open_counters"]), len(self.counters))
        if self.failures.is_active("label_printer_jam"):
            n -= 1
        return max(0, n)

    def _service_s(self, index: int) -> float:
        slow = index == 0 and self.failures.is_active("scale_fault")
        return float(self.p["process_s"]) + (SLOW_SCALE_S if slow else 0.0)

    def _check_bags(self, counter: Counter) -> None:
        p = self.p
        self.bag_acc += p["bags_per_pax"]
        n = int(self.bag_acc + 1e-9)
        self.bag_acc -= n
        for _ in range(n):
            w = max(3.0, self.rng.gauss(p["bag_mean_kg"], p["bag_sd_kg"]))
            self.last_weight = w
            if w > p["max_kg"]:
                self.oog += 1
                self.emit("oog_bag", weight_kg=round(w, 1))
                continue
            if w > p["excess_kg"]:
                self.excess += 1
            counter.held += 1
            self.bags_checked += 1

    def update(self, ctx: StepContext) -> None:
        dt = ctx.dt
        p = self.p
        stopped = self.failures.stopping is not None

        # llegadas a la fila (ritmo uniforme)
        self.pax_acc += p["pax_per_h"] / 3600.0 * dt
        while self.pax_acc >= 1.0 - 1e-9:
            self.pax_acc -= 1.0
            self.queue.append(self.t)
        self.max_queue = max(self.max_queue, len(self.queue))

        # atención en cada mostrador
        n_open = self.open_counters
        if not stopped:
            for i, c in enumerate(self.counters):
                budget = dt
                while budget > 1e-9:
                    if c.remaining is None:
                        if i >= n_open or c.held > 0 or not self.queue:
                            break
                        arrived = self.queue.popleft()
                        self.wait_sum_s += max(0.0, self.t - arrived)
                        self.started += 1
                        c.remaining = self._service_s(i)
                    used = min(budget, c.remaining)
                    c.remaining -= used
                    budget -= used
                    if c.remaining <= 1e-9:
                        c.remaining = None
                        self.served += 1
                        self._check_bags(c)

        # inyección a la colectora: una maleta cada release_gap_s para toda la isla
        downstream = bool(self.inputs["downstream_free"])
        waiting = sum(c.held for c in self.counters)
        released = False
        gap = float(p["release_gap_s"])
        self.release_credit = min(max(1.0, dt / gap), self.release_credit + dt / gap)
        if downstream:
            while self.release_credit >= 1.0 - 1e-9 and waiting:
                for _ in range(len(self.counters)):
                    c = self.counters[self.next_counter]
                    self.next_counter = (self.next_counter + 1) % len(self.counters)
                    if c.held:
                        c.held -= 1
                        break
                self.bags_out += 1
                self.release_credit -= 1.0
                waiting -= 1
                released = True
        if released:
            self.travel = (self.travel + 0.5 * dt) % 10.0

        # espera estimada y eventos
        wait = self.wait_min
        if wait > 20 and not self.long_queue:
            self.long_queue = True
            self.emit("long_queue", wait_min=round(wait, 1))
        elif wait < 10 and self.long_queue:
            self.long_queue = False
            self.emit("queue_normal", wait_min=round(wait, 1))

        if stopped:
            return
        busy = self.counters_busy
        if waiting and not downstream:
            self.state.set("blocked")
            self.blocked_s += dt
        elif busy or waiting or self.queue:
            self.state.set("running")
        else:
            self.state.set("idle")

    # ------------------------------------------------------------------ lectura
    @property
    def counters_busy(self) -> int:
        return sum(1 for c in self.counters if c.remaining is not None)

    @property
    def wait_min(self) -> float:
        n = self.open_counters
        if n == 0:
            return 0.0 if not self.queue else 999.0
        return len(self.queue) * self.p["process_s"] / n / 60.0

    def true_values(self) -> dict[str, Any]:
        return {
            "pax_queue": len(self.queue),
            "pax_served": self.served,
            "bags_checked": self.bags_checked,
            "bags_out": self.bags_out,
            "bags_waiting": sum(c.held for c in self.counters),
            "oog_bags": self.oog,
            "excess_bags": self.excess,
            "last_weight_kg": self.last_weight,
            "counters_busy": self.counters_busy,
            "wait_min": self.wait_min,
        }

    def kpis(self) -> dict[str, Any]:
        hours = self.t / 3600.0
        return {
            "avg_wait_min": self.wait_sum_s / self.started / 60.0 if self.started else 0.0,
            "max_queue": self.max_queue,
            "bags_per_h": self.bags_out / hours if hours > 0 else None,
            "blocked_pct": self.blocked_s / self.t if self.t > 0 else 0.0,
        }

    def animation(self) -> dict[str, float]:
        s = self.state.current
        light = 3.0 if s == "fault" else 2.0 if s == "blocked" or self.long_queue else 1.0 if s == "running" else 0.0
        return {
            "counters_busy": float(self.counters_busy),
            "queue_len": float(len(self.queue)),
            "bags_waiting": float(sum(c.held for c in self.counters)),
            "belt_travel": self.travel,
            "stack_light": light,
        }
