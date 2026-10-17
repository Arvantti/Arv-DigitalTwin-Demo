"""Comportamiento de un enfriador de agua con compresores por etapas (B2): banda muerta, inercia del circuito y disparos."""

from __future__ import annotations

from typing import Any

from twin_runtime import EquipmentBehavior, StepContext

WATER_KJ_M3_K = 4186.0  # ρ·cp del agua
KW_PER_M3H_K = 1.163  # kW que mueve 1 m3/h de agua por cada K
BAND_C = 0.5
MIN_CHANGE_S = 180.0
ALARM_C = 3.0
NORMAL_C = 1.0
FOULED_LOSS = 0.15
FAN_FRACTION = 0.015


class Chiller(EquipmentBehavior):
    type = "chiller"
    INITIAL_STATE = "off"
    DEFAULT_INPUTS = {"load_kw": None, "ambient_c": 30.0}

    def setup(self) -> None:
        p = self.p
        self.supply = p["supply_c"]
        self.stages_on = 0
        self.lock_s = 0.0
        self.load = 0.0
        self.cooling = 0.0
        self.power_kw = 0.0
        self.cop_actual = p["cop"]
        self.energy_kwh = 0.0
        self.max_supply = self.supply
        self.alarm = False
        self.high_s = 0.0
        if p["start_on"]:
            self.state.set("running")

    @property
    def capacity_per_stage(self) -> float:
        return self.p["capacity_kw"] / self.p["stages"]

    def on_command(self, name: str, args: dict[str, Any]) -> bool:
        if name == "start":
            if self.state.current == "off":
                self.state.set("running")
        elif name == "stop":
            if self.state.current != "fault":
                self.state.set("off")
        else:
            return False
        return True

    def on_fault(self, fault_id: str) -> None:
        if fault_id == "high_pressure_trip":
            self._set_stages(0)
            self.lock_s = MIN_CHANGE_S  # al rearmar, los compresores esperan antes de arrancar

    def _set_stages(self, n: int) -> None:
        if n != self.stages_on:
            self.stages_on = n
            self.emit("stage_changed", stages=n)

    def update(self, ctx: StepContext) -> None:
        dt = ctx.dt
        p = self.p
        amb = float(self.inputs["ambient_c"])
        load = self.inputs["load_kw"]
        self.load = p["nominal_load_kw"] if load is None else max(0.0, float(load))
        running = self.state.current == "running"

        if running:
            self.lock_s = max(0.0, self.lock_s - dt)
            if self.lock_s <= 0.0:
                if self.supply > p["supply_c"] + BAND_C and self.stages_on < p["stages"]:
                    self._set_stages(self.stages_on + 1)
                    self.lock_s = MIN_CHANGE_S
                elif self.supply < p["supply_c"] - BAND_C and self.stages_on > 0:
                    self._set_stages(self.stages_on - 1)
                    self.lock_s = MIN_CHANGE_S
        else:
            self._set_stages(0)

        derate = max(0.0, 1.0 - 0.01 * max(0.0, amb - 35.0))
        if self.failures.is_active("fouled_condenser"):
            derate *= 1.0 - FOULED_LOSS
        self.cooling = self.stages_on * self.capacity_per_stage * derate
        self.cop_actual = p["cop"] * max(0.3, 1.0 - 0.015 * (amb - 30.0))
        if self.failures.is_active("fouled_condenser"):
            self.cop_actual *= 1.0 - FOULED_LOSS
        fans = FAN_FRACTION * p["capacity_kw"] * self.stages_on / p["stages"]
        self.power_kw = self.cooling / self.cop_actual + fans if self.stages_on else 0.0
        self.energy_kwh += self.power_kw * dt / 3600.0

        heat_capacity = WATER_KJ_M3_K * p["loop_volume_m3"]  # kJ/K = kW·s/K
        self.supply = max(2.0, min(45.0, self.supply + (self.load - self.cooling) * dt / heat_capacity))
        self.max_supply = max(self.max_supply, self.supply)

        high = self.supply > p["supply_c"] + ALARM_C
        if high:
            self.high_s += dt
        if high and not self.alarm:
            self.alarm = True
            self.emit("supply_temp_high", supply_c=round(self.supply, 2))
        elif self.alarm and self.supply < p["supply_c"] + NORMAL_C:
            self.alarm = False
            self.emit("supply_temp_normal")

    def true_values(self) -> dict[str, Any]:
        return_c = self.supply + self.load / (KW_PER_M3H_K * self.p["flow_m3_h"])
        return {
            "supply_temp_c": self.supply,
            "return_temp_c": return_c,
            "load_kw": self.load,
            "cooling_kw": self.cooling,
            "stages_on": self.stages_on,
            "power_kw": self.power_kw,
            "cop_actual": self.cop_actual,
            "energy_kwh": self.energy_kwh,
        }

    def kpis(self) -> dict[str, Any]:
        hours = self.t / 3600.0
        return {
            "avg_power_kw": self.energy_kwh / hours if hours > 0 else 0.0,
            "max_supply_c": self.max_supply,
            "time_above_limit_pct": self.high_s / self.t if self.t > 0 else 0.0,
        }

    def animation(self) -> dict[str, float]:
        s = self.state.current
        light = {"running": 3.0 if self.alarm else 1.0, "fault": 3.0}.get(s, 0.0)
        return {
            "fan_speed": self.stages_on / self.p["stages"],
            "stages_on": float(self.stages_on),
            "supply_temp_c": self.supply,
            "return_temp_c": self.supply + self.load / (KW_PER_M3H_K * self.p["flow_m3_h"]),
            "load_pct": self.load / self.p["capacity_kw"],
            "stack_light": light,
        }
