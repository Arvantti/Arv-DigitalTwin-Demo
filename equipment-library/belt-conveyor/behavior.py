"""Comportamiento de una banda transportadora (B2): transporte, acumulación y bloqueo."""

from __future__ import annotations

from typing import Any

from twin_runtime import EquipmentBehavior, StepContext


class BeltConveyor(EquipmentBehavior):
    type = "belt-conveyor"
    DEFAULT_INPUTS = {"inflow_upm": None, "downstream_free": True}

    def setup(self) -> None:
        self.items: list[float] = []  # posición de cada unidad desde el inicio (m), la primera es la más adelantada
        self.arrivals = 0.0
        self.delivered = 0
        self.travel = 0.0
        self.speed = self.p["speed_m_s"]
        self.accepting = True
        self.blocked_s = 0.0

    @property
    def capacity(self) -> int:
        return int(self.p["length_m"] // self.p["pitch_m"]) + 1

    def on_command(self, name: str, args: dict[str, Any]) -> bool:
        if name == "set_speed":
            self.p["speed_m_s"] = max(0.0, float(args["m_s"]))
            return True
        return False

    def update(self, ctx: StepContext) -> None:
        dt = ctx.dt
        p = self.p
        stopped = self.failures.stopping is not None
        v = 0.0 if stopped else p["speed_m_s"] * (0.7 if self.failures.is_active("belt_misalignment") else 1.0)
        self.speed = v
        self.travel = (self.travel + v * dt) % 10.0
        length, pitch = p["length_m"], p["pitch_m"]
        downstream = bool(self.inputs["downstream_free"])

        # avance: la primera unidad hasta la descarga; las demás respetan la separación mínima
        moved: list[float] = []
        for i, pos in enumerate(self.items):
            limit = length if i == 0 else moved[-1] - pitch
            moved.append(min(pos + v * dt, max(pos, limit)))
        self.items = moved
        while self.items and self.items[0] >= length - 1e-9 and downstream and not stopped:
            self.items.pop(0)
            self.delivered += 1

        # llegadas
        inflow = self.inputs["inflow_upm"]
        inflow = p["nominal_inflow_upm"] if inflow is None else float(inflow)
        self.arrivals = min(self.arrivals + inflow / 60.0 * dt, 1.0 + inflow / 60.0 * dt)
        while self.arrivals >= 1.0 and (not self.items or self.items[-1] >= pitch - 1e-9):
            self.items.append(0.0)
            self.arrivals -= 1.0
        accepting = self.arrivals < 1.0
        if accepting != self.accepting:
            self.emit("accepting_again" if accepting else "full")
            self.accepting = accepting
        if not accepting:
            self.arrivals = 1.0  # la máquina anterior queda esperando

        if stopped:
            return
        at_head = bool(self.items) and self.items[0] >= length - 1e-9
        if at_head and not downstream:
            self.state.set("blocked")
            self.blocked_s += dt
        elif self.items or inflow > 0:
            self.state.set("running")
        else:
            self.state.set("idle")

    def _accumulated(self) -> int:
        n = 0
        expected = self.p["length_m"]
        for pos in self.items:
            if abs(pos - expected) > 1e-6:
                break
            n += 1
            expected -= self.p["pitch_m"]
        return n

    def true_values(self) -> dict[str, Any]:
        load = len(self.items) / self.capacity
        rated_a = self.p["motor_kw"] * 1.9  # ≈ corriente nominal a 440 V
        return {
            "items_on_belt": len(self.items),
            "accumulated": self._accumulated(),
            "delivered": self.delivered,
            "occupancy_pct": 100.0 * load,
            "accepting": 1 if self.accepting else 0,
            "speed_actual_m_s": self.speed,
            "motor_current_a": (0.35 + 0.45 * load) * rated_a if self.speed > 0 else 0.0,
        }

    def kpis(self) -> dict[str, Any]:
        minutes = self.t / 60.0
        return {
            "throughput_upm": self.delivered / minutes if minutes > 0 else None,
            "blocked_pct": self.blocked_s / self.t if self.t > 0 else 0.0,
        }

    def animation(self) -> dict[str, float]:
        return {"belt_travel": self.travel, "items_count": float(len(self.items)), "accumulated": float(self._accumulated())}
