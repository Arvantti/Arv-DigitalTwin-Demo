"""Comportamiento del operario (B2): camina por pasillos, trabaja en un equipo y vuelve a su base."""

from __future__ import annotations

import math
from typing import Any

from twin_runtime import EquipmentBehavior, StepContext

STRIDE_M = 1.4  # una zancada completa (dos pasos)


class Operator(EquipmentBehavior):
    type = "operator"
    DEFAULT_INPUTS: dict[str, Any] = {}

    def setup(self) -> None:
        p = self.p
        self.home = (float(p["home_x"]), float(p["home_y"]))
        self.x, self.y = self.home
        self.heading = 0.0
        self.target: tuple[float, float] | None = None
        self.task = ""
        self.work_left: float | None = None
        self._phase: str | None = None
        self.distance = 0.0
        self.done = 0
        self.work_s = 0.0
        self.walk_s = 0.0
        self.cycle = 0.0

    @property
    def phase(self) -> str | None:
        return self._phase

    def on_command(self, name: str, args: dict[str, Any]) -> bool:
        if name == "go_to":
            self.target = (float(args["x"]), float(args["y"]))
            self.task = str(args.get("task", ""))
            wm = args.get("work_min")
            self.work_left = float(wm) * 60.0 if wm is not None else None
            self._phase = "walking"
            self.state.set("running")
        elif name == "go_home":
            if self._phase in ("walking", "working") and self.task:
                self.done += 1
                self.emit("task_done", task=self.task)
            self._go_home()
        elif name == "set_home":
            self.home = (float(args["x"]), float(args["y"]))
        else:
            return False
        return True

    def _go_home(self) -> None:
        self.task = ""
        self.work_left = None
        self.target = self.home
        self._phase = "returning"
        self.state.set("running")

    def _walk(self, dt: float) -> bool:
        """Avanza hacia el destino por pasillos (x primero, luego y). Devuelve True al llegar."""
        assert self.target is not None
        tx, ty = self.target
        step = self.p["speed_m_s"] * dt
        while step > 1e-9:
            if abs(tx - self.x) > 1e-9:
                d = min(step, abs(tx - self.x))
                sgn = 1.0 if tx > self.x else -1.0
                self.x += sgn * d
                self.heading = 0.0 if sgn > 0 else math.pi
            elif abs(ty - self.y) > 1e-9:
                d = min(step, abs(ty - self.y))
                sgn = 1.0 if ty > self.y else -1.0
                self.y += sgn * d
                self.heading = math.pi / 2 if sgn > 0 else -math.pi / 2
            else:
                break
            step -= d
            self.distance += d
            self.cycle = (self.cycle + d / STRIDE_M) % 1.0
        return abs(tx - self.x) < 1e-9 and abs(ty - self.y) < 1e-9

    def update(self, ctx: StepContext) -> None:
        dt = ctx.dt
        ph = self._phase
        if ph in ("walking", "returning"):
            self.walk_s += dt
            if self._walk(dt):
                if ph == "walking":
                    self._phase = "working"
                    self.emit("arrived", task=self.task)
                else:
                    self._phase = None
                    self.target = None
                    self.state.set("idle")
                    self.emit("returned_home")
        elif ph == "working":
            self.work_s += dt
            if self.work_left is not None:
                self.work_left -= dt
                if self.work_left <= 0:
                    self.done += 1
                    self.emit("task_done", task=self.task)
                    self._go_home()

    def true_values(self) -> dict[str, Any]:
        return {
            "x_m": self.x,
            "y_m": self.y,
            "heading_deg": math.degrees(self.heading),
            "task": self.task,
            "busy": 1 if self._phase in ("walking", "working") else 0,
            "distance_m": self.distance,
            "tasks_done": self.done,
            "work_time_s": self.work_s,
            "walk_time_s": self.walk_s,
        }

    def kpis(self) -> dict[str, Any]:
        busy = self.work_s + self.walk_s
        return {
            "utilization": busy / self.t if self.t > 0 else 0.0,
            "distance_km": self.distance / 1000.0,
            "walk_share": self.walk_s / busy if busy > 0 else None,
        }

    def animation(self) -> dict[str, float]:
        pose = 1.0 if self._phase in ("walking", "returning") else 2.0 if self._phase == "working" else 0.0
        return {"walk_cycle": self.cycle, "pose": pose, "heading": self.heading}
