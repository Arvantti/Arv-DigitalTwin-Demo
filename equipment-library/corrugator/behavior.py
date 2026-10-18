"""Comportamiento de la corrugadora vista desde el transporte (B1): ritmo de láminas, pilas y salida del apilador."""

from __future__ import annotations

from typing import Any

from twin_runtime import EquipmentBehavior, StepContext


class Corrugator(EquipmentBehavior):
    type = "corrugator"
    DEFAULT_INPUTS = {"downstream_free": True}
    INITIAL_STATE = "running"

    def setup(self) -> None:
        self.enabled = True
        self.sheets = 0.0
        self.sheets_total = 0
        self.stacks = 0
        self.delivered = 0
        self.outfeed = 0
        self.speed = 0.0
        self.change_left = 0.0
        self.pending: dict[str, Any] = {}
        self.running_s = 0.0
        self.blocked_s = 0.0

    def sheets_per_min(self, speed: float) -> float:
        return speed / self.p["sheet_length_m"] * self.p["outs"]

    def on_command(self, name: str, args: dict[str, Any]) -> bool:
        if name == "start":
            self.enabled = True
        elif name == "stop":
            self.enabled = False
        elif name == "order_change":
            self.pending = {k: args[k] for k in ("sheet_length_m", "outs") if k in args}
            self.change_left = self.p["order_change_s"]
            self.emit("order_change_started")
        elif name == "set_speed":
            self.p["speed_m_min"] = max(0.0, float(args["m_min"]))
        else:
            return False
        return True

    def update(self, ctx: StepContext) -> None:
        dt = ctx.dt
        p = self.p
        self.speed = 0.0
        # la salida entrega una pila por paso al transportador cuando recibe
        if self.outfeed > 0 and self.inputs["downstream_free"]:
            self.outfeed -= 1
            self.delivered += 1
        if self.failures.stopping is not None:
            return
        if self.change_left > 0.0:
            self.change_left = max(0.0, self.change_left - dt)
            self.state.set("setup")
            if self.change_left == 0.0:
                p.update(self.pending)
                self.pending = {}
                self.emit("order_change_done")
            return
        if not self.enabled:
            self.state.set("idle")
            return
        if self.outfeed >= p["outfeed_stacks"]:
            if self.state.current != "blocked":
                self.emit("outfeed_full")
            self.state.set("blocked")
            self.blocked_s += dt
            return
        self.state.set("running")
        self.running_s += dt
        self.speed = p["speed_m_min"] * (0.7 if self.failures.is_active("warp") else 1.0)
        before = int(self.sheets)
        self.sheets += self.sheets_per_min(self.speed) / 60.0 * dt
        self.sheets_total += int(self.sheets) - before
        if self.sheets >= p["sheets_per_stack"]:
            self.sheets -= p["sheets_per_stack"]
            self.stacks += 1
            self.outfeed += 1
            self.emit("stack_completed", stack=self.stacks)

    def true_values(self) -> dict[str, Any]:
        return {
            "speed_m_min": self.speed,
            "sheets_per_min": self.sheets_per_min(self.speed),
            "sheets_count": self.sheets_total,
            "stacks_count": self.stacks,
            "stacks_delivered": self.delivered,
            "stack_fill_pct": 100.0 * self.sheets / self.p["sheets_per_stack"],
            "outfeed_count": self.outfeed,
        }

    def kpis(self) -> dict[str, Any]:
        hours = self.t / 3600.0
        return {
            "stacks_per_h": self.delivered / hours if hours > 0 else 0.0,
            "running_pct": self.running_s / self.t if self.t > 0 else 0.0,
            "blocked_pct": self.blocked_s / self.t if self.t > 0 else 0.0,
        }

    def animation(self) -> dict[str, float]:
        light = {"running": 1.0, "idle": 0.0, "fault": 3.0}.get(self.state.current, 2.0)
        return {
            "stack_fill": self.sheets / self.p["sheets_per_stack"],
            "outfeed_count": float(self.outfeed),
            "line_speed": self.speed,
            "stack_light": light,
        }
