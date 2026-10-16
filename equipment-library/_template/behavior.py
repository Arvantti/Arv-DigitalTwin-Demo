"""PLANTILLA de comportamiento: máquina de ciclo con fases, calidad, fallas y OEE.

Patrón que siguen todos los equipos de la librería:
  - setup(): estado interno a partir de self.p (parámetros ya validados).
  - on_command(): comandos propios declarados en el contrato.
  - update(ctx): física y lógica de un paso; ctx.dt en segundos virtuales.
  - true_values(): EXACTAMENTE las variables del contrato (sin ruido; la base aplica el sensor).
  - animation(): EXACTAMENTE los animation_channels del contrato.
"""

from __future__ import annotations

from typing import Any

from twin_runtime import EquipmentBehavior, StepContext
from twin_runtime.primitives import OEEAccumulator, PhaseSequencer


class TemplateMachine(EquipmentBehavior):
    type = "template-machine"
    DEFAULT_INPUTS = {"material_available": True, "downstream_free": True}

    def setup(self) -> None:
        self.seq: PhaseSequencer | None = None
        self.stop_requested = False
        self.cycle_count = 0
        self.good = 0
        self.rejected = 0
        self.power_kw = 0.0
        self.oee = OEEAccumulator(ideal_cycle_s=self.p["cycle_s"])

    @property
    def phase(self) -> str | None:
        return self.seq.phase if self.seq and self.seq.running else None

    def on_command(self, name: str, args: dict[str, Any]) -> bool:
        if name == "start":
            self.stop_requested = False
            self.state.set("running")
        elif name == "stop":
            self.stop_requested = True
        else:
            return False
        return True

    def on_fault(self, fault_id: str) -> None:
        self.seq = None  # una falla que detiene aborta el ciclo en curso

    def update(self, ctx: StepContext) -> None:
        s = self.state.current
        remaining = ctx.dt
        while s in ("running", "blocked", "starved") and remaining > 1e-9:
            if self.seq is None or not self.seq.running:
                if self.stop_requested:
                    self.stop_requested = False
                    self.state.set("idle")
                    break
                if not self.inputs["material_available"]:
                    self.state.set("starved")
                    break
                if not self.inputs["downstream_free"]:
                    self.state.set("blocked")
                    break
                self.state.set("running")
                third = self.p["cycle_s"] / 3
                self.seq = PhaseSequencer([("load", third), ("process", third), ("unload", third)])
                self.seq.start()
            if "unload" in self.seq.step(remaining):
                self._complete_cycle()
            remaining = self.seq.leftover if not self.seq.running else 0.0
            s = self.state.current
        self.power_kw = 4.0 if self.phase == "process" else 1.0 if self.state.current != "idle" else 0.2
        self.oee.tick(self.state.current, ctx.dt)

    def _complete_cycle(self) -> None:
        self.cycle_count += 1
        good = self.rng.random() >= self.p["scrap_rate"]
        self.good += int(good)
        self.rejected += int(not good)
        self.oee.count(int(good), int(not good))
        self.emit("cycle_completed", cycle=self.cycle_count, good=good)

    def true_values(self) -> dict[str, Any]:
        return {
            "cycle_count": self.cycle_count,
            "units_good": self.good,
            "units_rejected": self.rejected,
            "power_kw": self.power_kw,
        }

    def kpis(self) -> dict[str, Any]:
        v = self.oee.values()
        return {"oee": v["oee"], "quality": v["quality"]}

    def animation(self) -> dict[str, float]:
        progress = 0.0
        if self.seq and self.seq.running:
            done = sum(d for _, d in self.seq.phases[: self.seq.index]) + self.seq.elapsed
            progress = done / self.seq.cycle_duration
        light = {"running": 1.0, "fault": 3.0, "idle": 0.0}.get(self.state.current, 2.0)
        return {"progress": progress, "stack_light": light}
