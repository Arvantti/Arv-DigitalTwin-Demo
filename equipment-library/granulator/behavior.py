"""Comportamiento de un molino granulador (B2): capacidad, desgaste de cuchillas, finos y corriente del motor."""

from __future__ import annotations

from typing import Any

from twin_runtime import EquipmentBehavior, StepContext

AMPS_PER_KW = 1.8
IDLE_LOAD = 0.3
FULL_LOAD = 0.9
SHARPEN_ALERT = 0.4
FINES_SHARP_PCT = 3.0
FINES_DULL_PCT = 12.0
DULL_FAULT_FACTOR = 0.5


class Granulator(EquipmentBehavior):
    type = "granulator"
    INITIAL_STATE = "off"
    DEFAULT_INPUTS = {"feed_kg_h": None, "downstream_free": True}

    def setup(self) -> None:
        self.level_kg = 0.0
        self.sharpness = self.p["start_sharpness_pct"] / 100.0
        self.flow = 0.0
        self.processed = 0.0
        self.load = 0.0
        self.power_kw = 0.0
        self.energy_kwh = 0.0
        self.accepting = True
        self.rotor = 0.0
        self.run_s = 0.0
        self.alert = False
        if self.p["start_on"]:
            self.state.set("starved")

    @property
    def effective_sharpness(self) -> float:
        return self.sharpness * (DULL_FAULT_FACTOR if self.failures.is_active("dull_knives") else 1.0)

    @property
    def capacity_kg_h(self) -> float:
        p = self.p
        return p["throughput_kg_h"] * (0.6 + 0.4 * self.effective_sharpness) * (p["screen_mm"] / 10.0) ** 0.5

    def on_command(self, name: str, args: dict[str, Any]) -> bool:
        if name == "start":
            if self.state.current == "off":
                self.state.set("starved")
        elif name == "stop":
            if self.state.current != "fault":
                self.state.set("off")
        elif name == "sharpen":
            self.sharpness = 1.0
            self.alert = False
            self.emit("knives_sharpened")
        else:
            return False
        return True

    def update(self, ctx: StepContext) -> None:
        dt = ctx.dt
        p = self.p
        s = self.state.current

        # alimentación a la tolva
        feed = self.inputs["feed_kg_h"]
        feed = p["nominal_feed_kg_h"] if feed is None else max(0.0, float(feed))
        if s in ("starved", "running", "blocked", "fault"):
            self.level_kg = min(p["hopper_kg"], self.level_kg + feed * dt / 3600.0)
        accepting = self.level_kg < p["hopper_kg"] - 1e-9
        if not accepting and self.accepting:
            self.emit("hopper_full")
        self.accepting = accepting

        # trituración
        self.flow = 0.0
        self.load = 0.0
        if s in ("starved", "running", "blocked"):
            if not self.inputs["downstream_free"]:
                self.state.set("blocked")
            else:
                proc = min(self.level_kg, self.capacity_kg_h * dt / 3600.0)
                self.level_kg -= proc
                self.processed += proc
                self.flow = proc * 3600.0 / dt
                self.load = self.flow / self.capacity_kg_h if self.capacity_kg_h > 0 else 0.0
                self.sharpness = max(0.0, self.sharpness - proc / (p["knife_life_t"] * 1000.0))
                if proc > 1e-9:
                    self.state.set("running")
                    self.run_s += dt
                else:
                    self.state.set("starved")
        spinning = self.state.current in ("starved", "running", "blocked")
        self.rotor = 1.0 if spinning else 0.0
        self.power_kw = p["motor_kw"] * (IDLE_LOAD + (FULL_LOAD - IDLE_LOAD) * self.load) if spinning else 0.0
        self.power_kw *= 1.0 + 0.25 * (1.0 - self.effective_sharpness) if spinning else 1.0
        self.energy_kwh += self.power_kw * dt / 3600.0

        if self.sharpness < SHARPEN_ALERT and not self.alert:
            self.alert = True
            self.emit("sharpen_needed", sharpness_pct=round(100 * self.sharpness, 1))

    def true_values(self) -> dict[str, Any]:
        sharp = self.effective_sharpness
        return {
            "hopper_level_pct": 100.0 * self.level_kg / self.p["hopper_kg"],
            "flow_kg_h": self.flow,
            "processed_kg": self.processed,
            "accepting": 1 if self.accepting else 0,
            "knife_sharpness_pct": 100.0 * self.sharpness,
            "fines_pct": FINES_SHARP_PCT + (FINES_DULL_PCT - FINES_SHARP_PCT) * (1.0 - sharp),
            "motor_current_a": self.power_kw * AMPS_PER_KW,
            "power_kw": self.power_kw,
        }

    def kpis(self) -> dict[str, Any]:
        return {
            "specific_energy_kwh_t": self.energy_kwh / (self.processed / 1000.0) if self.processed > 0 else None,
            "utilization": self.run_s / self.t if self.t > 0 else 0.0,
        }

    def animation(self) -> dict[str, float]:
        s = self.state.current
        light = {"running": 1.0, "starved": 2.0, "blocked": 2.0, "fault": 3.0}.get(s, 0.0)
        if s == "running" and self.alert:
            light = 2.0
        return {
            "rotor_speed": self.rotor,
            "hopper_fill": self.level_kg / self.p["hopper_kg"],
            "motor_load": self.load,
            "out_flow": min(1.0, self.flow / self.p["throughput_kg_h"]),
            "stack_light": light,
        }
