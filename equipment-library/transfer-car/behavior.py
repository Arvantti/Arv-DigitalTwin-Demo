"""Comportamiento del carro de transferencia de pilas (B2): recibe, viaja, reparte por peso entre los carriles libres y regresa."""

from __future__ import annotations

from typing import Any

from twin_runtime import EquipmentBehavior, StepContext

LANES = (1, 2, 3, 4)


class TransferCar(EquipmentBehavior):
    type = "transfer-car"
    DEFAULT_INPUTS = {"inflow_upm": None, "free_1": True, "free_2": True, "free_3": True, "free_4": True}

    def setup(self) -> None:
        self.arrivals = 0.0
        self.stage = "home"  # home, load, out, unload, back
        self.left = 0.0
        self.pos = 0.0
        self.loaded = False
        self.target = 0
        self.delivered = dict.fromkeys(LANES, 0)
        self.busy_s = 0.0
        self.blocked_s = 0.0
        self.accepting = True

    def dist(self, lane: int) -> float:
        return float(self.p[f"dist_{lane}_m"])

    def _choose(self) -> int:
        """El carril que recibe con menos pilas entregadas respecto de su peso (el plan de reparto); 0 si ninguno recibe."""
        free = [n for n in LANES if self.dist(n) > 0 and self.inputs[f"free_{n}"]]
        if not free:
            return 0
        return min(free, key=lambda n: (self.delivered[n] / self.p[f"weight_{n}"], n))

    def update(self, ctx: StepContext) -> None:
        dt = ctx.dt
        p = self.p
        inflow = self.inputs["inflow_upm"]
        inflow = p["nominal_inflow_upm"] if inflow is None else float(inflow)
        self.arrivals = min(self.arrivals + inflow / 60.0 * dt, 2.0)
        self.accepting = self.stage == "home" and not self.loaded and self.failures.stopping is None
        if self.failures.stopping is not None:
            return
        remaining = dt
        while remaining > 1e-9:
            if self.stage == "home":
                if not self.loaded:
                    if self.arrivals < 1.0:
                        self.state.set("idle")
                        return
                    self.arrivals -= 1.0
                    self.stage, self.left = "load", p["load_s"]
                    continue
                lane = self._choose()
                if lane == 0:
                    if self.state.current != "blocked":
                        self.emit("no_free_lane")
                    self.state.set("blocked")
                    self.blocked_s += remaining
                    return
                self.target = lane
                self.stage, self.left = "out", self.dist(lane) / p["speed_m_s"]
                continue
            if self.stage == "unload" and self.left <= 1e-9:
                if not self.inputs[f"free_{self.target}"]:
                    self.state.set("blocked")
                    self.blocked_s += remaining
                    return
                self.loaded = False
                self.delivered[self.target] += 1
                self.emit("stack_delivered", lane=self.target)
                self.stage, self.left = "back", self.dist(self.target) / p["speed_m_s"]
                continue
            self.state.set("running")
            step = min(remaining, self.left)
            self.left -= step
            remaining -= step
            self.busy_s += step
            speed = p["speed_m_s"]
            if self.stage == "out":
                self.pos = min(self.dist(self.target), self.pos + speed * step)
            elif self.stage == "back":
                self.pos = max(0.0, self.pos - speed * step)
            if self.left <= 1e-9:
                if self.stage == "load":
                    self.loaded = True
                    self.stage = "home"
                elif self.stage == "out":
                    self.stage, self.left = "unload", p["unload_s"]
                elif self.stage == "unload":
                    self.left = 0.0  # entrega en la vuelta siguiente del lazo, si el carril recibe
                elif self.stage == "back":
                    self.pos, self.target, self.stage = 0.0, 0, "home"

    def true_values(self) -> dict[str, Any]:
        values: dict[str, Any] = {
            "position_m": self.pos,
            "loaded": 1 if self.loaded else 0,
            "target": self.target,
            "accepting": 1 if self.accepting else 0,
            "trips": sum(self.delivered.values()),
        }
        values.update({f"delivered_{n}": self.delivered[n] for n in LANES})
        return values

    def kpis(self) -> dict[str, Any]:
        hours = self.t / 3600.0
        return {
            "trips_per_h": sum(self.delivered.values()) / hours if hours > 0 else 0.0,
            "busy_pct": self.busy_s / self.t if self.t > 0 else 0.0,
            "blocked_pct": self.blocked_s / self.t if self.t > 0 else 0.0,
        }

    def animation(self) -> dict[str, float]:
        return {"car_pos_m": self.pos, "loaded": 1.0 if self.loaded else 0.0}
