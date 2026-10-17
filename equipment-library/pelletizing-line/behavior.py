"""Comportamiento de una línea de peletizado de reciclaje (B2): tolva, capacidad, suciedad de la malla, temperatura y potencia."""

from __future__ import annotations

from typing import Any

from twin_runtime import EquipmentBehavior, StepContext
from twin_runtime.primitives import FirstOrderLag

AMBIENT_C = 25.0
MELT_TAU_S = 600.0
READY_BAND_C = 3.0
CLOG_CAPACITY_LOSS = 0.6
COLD_LOSS_PER_C = 0.02
COLD_MARGIN_C = 5.0
MIN_COLD_FACTOR = 0.2
BASE_PRESSURE_BAR = 60.0
CLOG_PRESSURE_BAR = 120.0
CHANGE_ALERT_BAR = 140.0
BLOCKED_SCREEN_CLOG = 0.5
HEATER_FAULT_DROP_C = 35.0
IDLE_LOAD = 0.25
LOAD_SLOPE = 0.6
HEATER_FRACTION = 0.2
STEADY_HEATER_DUTY = 0.4


class PelletizingLine(EquipmentBehavior):
    type = "pelletizing-line"
    INITIAL_STATE = "off"
    DEFAULT_INPUTS = {"feed_kg_h": None, "downstream_free": True}

    def setup(self) -> None:
        p = self.p
        hot = p["start_on"]
        self.melt = FirstOrderLag(tau_s=MELT_TAU_S, initial=p["melt_temp_c"] if hot else AMBIENT_C)
        self.level_kg = 0.0
        self.since_screen_kg = p["start_clog_pct"] / 100.0 * p["screen_life_t"] * 1000.0
        self.flow = 0.0
        self.processed = 0.0
        self.load = 0.0
        self.power_kw = 0.0
        self.energy_kwh = 0.0
        self.duty = 0.0
        self.accepting = True
        self.full = False
        self.screw = 0.0
        self.run_s = 0.0
        self.alert = False
        if hot:
            self.state.set("starved")

    @property
    def screen_clog(self) -> float:
        clog = self.since_screen_kg / (self.p["screen_life_t"] * 1000.0)
        if self.failures.is_active("screen_blocked"):
            clog += BLOCKED_SCREEN_CLOG
        return min(1.0, clog)

    @property
    def capacity_kg_h(self) -> float:
        deficit = self.p["melt_temp_c"] - self.melt.value - COLD_MARGIN_C
        cold = max(MIN_COLD_FACTOR, 1.0 - COLD_LOSS_PER_C * max(0.0, deficit))
        return self.p["throughput_kg_h"] * (1.0 - CLOG_CAPACITY_LOSS * self.screen_clog) * cold

    def on_command(self, name: str, args: dict[str, Any]) -> bool:
        if name == "start":
            if self.state.current == "off":
                ready = abs(self.melt.value - self.p["melt_temp_c"]) < READY_BAND_C
                self.state.set("starved" if ready else "starting")
        elif name == "stop":
            if self.state.current != "fault":
                self.state.set("off")
        elif name == "change_screen":
            self.since_screen_kg = 0.0
            self.alert = False
            self.emit("screen_changed")
        else:
            return False
        return True

    def update(self, ctx: StepContext) -> None:
        dt = ctx.dt
        p = self.p
        s = self.state.current

        # temperatura del fundido
        heating = s != "off"
        target = p["melt_temp_c"] if heating else AMBIENT_C
        if heating and self.failures.is_active("heater_fault"):
            target -= HEATER_FAULT_DROP_C
        self.melt.step(target, dt)
        self.duty = max(STEADY_HEATER_DUTY, min(1.0, STEADY_HEATER_DUTY + (target - self.melt.value) / 30.0)) if heating else 0.0
        if s == "starting" and abs(self.melt.value - p["melt_temp_c"]) < READY_BAND_C:
            self.state.set("starved")
            s = "starved"

        # alimentación a la tolva
        feed = self.inputs["feed_kg_h"]
        feed = p["nominal_feed_kg_h"] if feed is None else max(0.0, float(feed))
        if s != "off":
            self.level_kg = min(p["hopper_kg"], self.level_kg + feed * dt / 3600.0)
        full = self.level_kg >= p["hopper_kg"] - 1e-9
        if full and not self.full:
            self.emit("hopper_full")
        self.full = full
        self.accepting = not full and s != "off"

        # extrusión y corte
        self.flow = 0.0
        self.load = 0.0
        if s in ("starved", "running", "blocked"):
            if not self.inputs["downstream_free"]:
                self.state.set("blocked")
            else:
                cap = self.capacity_kg_h
                proc = min(self.level_kg, cap * dt / 3600.0)
                self.level_kg -= proc
                self.processed += proc
                self.since_screen_kg += proc
                self.flow = proc * 3600.0 / dt
                self.load = self.flow / cap if cap > 0 else 0.0
                if proc > 1e-9:
                    self.state.set("running")
                    self.run_s += dt
                else:
                    self.state.set("starved")
        spinning = self.state.current in ("starved", "running", "blocked")
        self.screw = 1.0 if spinning else 0.0
        motor = p["motor_kw"] * (IDLE_LOAD + LOAD_SLOPE * self.load) if spinning else 0.0
        self.power_kw = motor + HEATER_FRACTION * p["motor_kw"] * self.duty
        self.energy_kwh += self.power_kw * dt / 3600.0

        if self.pressure_bar >= CHANGE_ALERT_BAR and not self.alert:
            self.alert = True
            self.emit("screen_change_needed", pressure_bar=round(self.pressure_bar, 1))

    @property
    def pressure_bar(self) -> float:
        if self.state.current not in ("starved", "running", "blocked"):
            return 0.0
        return BASE_PRESSURE_BAR + CLOG_PRESSURE_BAR * self.screen_clog

    def true_values(self) -> dict[str, Any]:
        return {
            "hopper_level_pct": 100.0 * self.level_kg / self.p["hopper_kg"],
            "flow_kg_h": self.flow,
            "processed_kg": self.processed,
            "accepting": 1 if self.accepting else 0,
            "melt_temp_c": self.melt.value,
            "filter_pressure_bar": self.pressure_bar,
            "screen_clog_pct": 100.0 * self.screen_clog,
            "power_kw": self.power_kw,
        }

    def kpis(self) -> dict[str, Any]:
        return {
            "specific_energy_kwh_t": self.energy_kwh / (self.processed / 1000.0) if self.processed > 0 else None,
            "utilization": self.run_s / self.t if self.t > 0 else 0.0,
        }

    def animation(self) -> dict[str, float]:
        s = self.state.current
        light = {"running": 1.0, "starved": 2.0, "blocked": 2.0, "starting": 2.0, "fault": 3.0}.get(s, 0.0)
        if s == "running" and self.alert:
            light = 2.0
        return {
            "screw_speed": self.screw,
            "heater_glow": self.duty,
            "strand_flow": min(1.0, self.flow / self.p["throughput_kg_h"]),
            "hopper_fill": self.level_kg / self.p["hopper_kg"],
            "motor_load": self.load,
            "stack_light": light,
        }
