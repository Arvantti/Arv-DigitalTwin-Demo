"""Comportamiento de un carrusel de equipaje (B2): armado de vuelos o reclamo en llegadas."""

from __future__ import annotations

from typing import Any

from twin_runtime import EquipmentBehavior, StepContext

STOPPED_REMOVAL = 0.5  # con las placas detenidas solo se alcanza la mitad de las maletas


class BaggageCarousel(EquipmentBehavior):
    type = "baggage-carousel"
    DEFAULT_INPUTS = {"inflow_upm": None, "downstream_free": True}

    def setup(self) -> None:
        self.arrivals = 0.0
        self.bags = 0
        self.received = 0
        self.removed = 0
        self.admit_credit = 1.0
        self.remove_credit = 0.0
        self.travel = 0.0
        self.speed = 0.0
        self.accepting = True
        self.wave_start: float | None = None
        self.last_wave_min: float | None = None
        self.max_occupancy = 0.0
        self.full_s = 0.0
        self.handlers_active = 0

    @property
    def capacity(self) -> int:
        return max(1, int(self.p["length_m"] // self.p["pitch_m"]))

    @property
    def limit(self) -> int:
        return max(1, int(self.capacity * self.p["fill_limit_pct"] / 100.0))

    def on_command(self, name: str, args: dict[str, Any]) -> bool:
        if name == "set_handlers":
            self.p["handlers"] = max(0, int(args["n"]))
            return True
        return False

    def _removal_upm(self) -> float:
        p = self.p
        if p["mode"] == "makeup":
            if not self.inputs["downstream_free"]:
                return 0.0
            return p["handlers"] * p["handler_upm"]
        if self.wave_start is None or self.t - self.wave_start < p["pick_delay_s"]:
            return 0.0
        return float(p["pick_upm"])

    def update(self, ctx: StepContext) -> None:
        dt = ctx.dt
        p = self.p
        stopped = self.failures.stopping is not None
        v = 0.0 if stopped else float(p["speed_m_s"])
        self.speed = v
        self.travel = (self.travel + v * dt) % p["length_m"]

        inflow = self.inputs["inflow_upm"]
        self.arrivals += (p["nominal_inflow_upm"] if inflow is None else float(inflow)) / 60.0 * dt

        # entrada: una maleta por cada espacio que pasa frente a la rampa
        if v > 0:
            interval = p["pitch_m"] / v
            self.admit_credit = min(max(1.0, dt / interval), self.admit_credit + dt / interval)
            while self.arrivals >= 1.0 - 1e-9 and self.admit_credit >= 1.0 - 1e-9 and self.bags < self.limit:
                self.arrivals -= 1.0
                self.admit_credit -= 1.0
                if self.bags == 0 and self.wave_start is None and p["mode"] == "reclaim":
                    self.wave_start = self.t
                    self.emit("first_bag")
                self.bags += 1
                self.received += 1

        # retiro por operarios o pasajeros
        rate = self._removal_upm() * (STOPPED_REMOVAL if stopped else 1.0)
        self.handlers_active = int(p["handlers"]) if p["mode"] == "makeup" and rate > 0 and self.bags else 0
        if self.bags:
            self.remove_credit += rate / 60.0 * dt
            n = min(self.bags, int(self.remove_credit + 1e-9))
            self.remove_credit -= n
            self.bags -= n
            self.removed += n
        else:
            self.remove_credit = min(self.remove_credit, 1.0)
        if self.bags == 0 and self.arrivals < 1.0 - 1e-9 and self.wave_start is not None:
            self.last_wave_min = (self.t - self.wave_start) / 60.0
            self.wave_start = None
            self.emit("last_bag", wave_min=round(self.last_wave_min, 1))

        occupancy = 100.0 * self.bags / self.capacity
        self.max_occupancy = max(self.max_occupancy, occupancy)
        buffer = p["entry_buffer_units"]
        accepting = self.arrivals < buffer - 1 if not self.accepting else self.arrivals < buffer
        if accepting != self.accepting:
            self.emit("accepting_again" if accepting else "full")
            self.accepting = accepting

        if stopped:
            return
        if self.bags >= self.limit and self.arrivals >= 1.0 - 1e-9:
            self.state.set("blocked")
            self.full_s += dt
        elif self.bags or self.arrivals >= 1.0 - 1e-9:
            self.state.set("running")
        else:
            self.state.set("idle")

    def true_values(self) -> dict[str, Any]:
        rated_a = self.p["motor_kw"] * 1.9
        load = self.bags / self.capacity
        return {
            "bags_on": self.bags,
            "occupancy_pct": 100.0 * load,
            "received": self.received,
            "removed": self.removed,
            "entry_queue": int(self.arrivals + 1e-9),
            "accepting": 1 if self.accepting else 0,
            "speed_actual_m_s": self.speed,
            "motor_current_a": (0.4 + 0.5 * load) * rated_a if self.speed > 0 else 0.0,
        }

    def kpis(self) -> dict[str, Any]:
        hours = self.t / 3600.0
        return {
            "bags_per_h": self.removed / hours if hours > 0 else None,
            "max_occupancy_pct": self.max_occupancy,
            "wave_min": self.last_wave_min,
            "full_pct": self.full_s / self.t if self.t > 0 else 0.0,
        }

    def animation(self) -> dict[str, float]:
        s = self.state.current
        light = 3.0 if s == "fault" else 2.0 if s == "blocked" else 1.0 if s == "running" else 0.0
        return {
            "travel": self.travel,
            "bags_count": float(self.bags),
            "handlers_active": float(self.handlers_active),
            "stack_light": light,
        }
