"""Comportamiento de un secador desecante de tolva (B2): aire de proceso, residencia y humedad de la resina."""

from __future__ import annotations

import math
from typing import Any

from twin_runtime import EquipmentBehavior, StepContext
from twin_runtime.primitives import FirstOrderLag

AMBIENT_C = 25.0
BULK_KG_M3 = 550.0
FAULT_DEW_C = -10.0
LOAD_BELOW = 0.9  # el cargador repone cuando la tolva baja de este nivel
LOAD_RATE = 4.0  # veces la capacidad nominal
TAU_DRY_80_H = 1.2  # constante de secado a 80 °C
TAU_DRY_DOUBLES_C = 15.0  # cada 15 °C menos, el secado tarda el doble
M_EQ_40 = 0.0035  # humedad de equilibrio (%) con rocío de −40 °C
EMPTY_PCT = 0.05


def equilibrium_moisture(dew_c: float) -> float:
    return M_EQ_40 * 10 ** ((dew_c + 40.0) / 30.0)


def drying_tau_h(temp_c: float) -> float:
    return TAU_DRY_80_H * 2 ** ((80.0 - temp_c) / TAU_DRY_DOUBLES_C)


class DesiccantDryer(EquipmentBehavior):
    type = "desiccant-dryer"
    INITIAL_STATE = "off"
    DEFAULT_INPUTS = {"resin_available": True, "demand_kg_h": None}

    def setup(self) -> None:
        p = self.p
        self.cap_kg = p["throughput_kg_h"] * p["residence_h"]
        hot = p["start_hot"]
        self.temp = FirstOrderLag(tau_s=900.0, initial=p["temp_c"] if hot else AMBIENT_C)
        self.dew = FirstOrderLag(tau_s=1800.0, initial=p["dew_point_c"] if hot else FAULT_DEW_C)
        self.level_kg = self.cap_kg
        self.flow = 0.0
        self.processed = 0.0
        self.loading = False
        self.duty = 0.0
        self.power_kw = 0.0
        self.energy_kwh = 0.0
        self.dry_s = 0.0
        self.dry = True
        start_moisture = self._target_moisture(self.cap_kg, p["throughput_kg_h"]) if hot else p["inlet_moisture_pct"]
        self.moisture = FirstOrderLag(tau_s=3600.0, initial=start_moisture)
        self.dry = self.moisture.value <= p["moisture_limit_pct"]
        if hot:
            self.state.set("running")

    # ------------------------------------------------------------------ modelo
    def _target_moisture(self, level_kg: float, flow_kg_h: float) -> float:
        p = self.p
        t_res_h = level_kg / max(flow_kg_h, 0.1 * p["throughput_kg_h"])
        m_eq = equilibrium_moisture(self.dew.value)
        return m_eq + (p["inlet_moisture_pct"] - m_eq) * math.exp(-t_res_h / drying_tau_h(self.temp.value))

    def on_command(self, name: str, args: dict[str, Any]) -> bool:
        if name == "start":
            if self.state.current == "off":
                self.state.set("starting")
        elif name == "stop":
            if self.state.current != "fault":
                self.state.set("off")
        else:
            return False
        return True

    def update(self, ctx: StepContext) -> None:
        dt = ctx.dt
        p = self.p
        s = self.state.current
        air_on = s in ("starting", "running", "starved")
        heater_ok = not self.failures.is_active("heater_fault")

        # aire de proceso
        if air_on:
            target_t = p["temp_c"] if heater_ok else AMBIENT_C + 10.0
            target_dew = FAULT_DEW_C if self.failures.is_active("regeneration_failure") else p["dew_point_c"]
            self.temp.step(target_t, dt)
            self.dew.step(target_dew, dt)
            span = max(1.0, p["temp_c"] - AMBIENT_C)
            self.duty = max(0.0, min(1.0, 0.3 + 2.0 * (p["temp_c"] - self.temp.value) / span)) if heater_ok else 0.0
        else:
            self.temp.step(AMBIENT_C, dt)
            self.duty = 0.0
        self.power_kw = (self.duty * 0.08 + 0.01) * p["throughput_kg_h"] if air_on else 0.0
        self.energy_kwh += self.power_kw * dt / 3600.0

        if s == "starting" and abs(self.temp.value - p["temp_c"]) < 3.0:
            self.state.set("running")
            s = "running"

        # entrega y carga de resina
        demand = self.inputs["demand_kg_h"]
        demand = p["throughput_kg_h"] if demand is None else float(demand)
        self.flow = 0.0
        if s == "running":
            self.flow = min(max(demand, 0.0), p["throughput_kg_h"], self.level_kg * 3600.0 / dt)
            self.level_kg -= self.flow * dt / 3600.0
            self.processed += self.flow * dt / 3600.0
        if s in ("running", "starved", "starting") and self.inputs["resin_available"]:
            if self.level_kg < LOAD_BELOW * self.cap_kg:
                self.loading = True
            if self.loading:
                self.level_kg = min(self.cap_kg, self.level_kg + LOAD_RATE * p["throughput_kg_h"] * dt / 3600.0)
                if self.level_kg >= self.cap_kg - 1e-9:
                    self.loading = False
        else:
            self.loading = False
        pct = 100.0 * self.level_kg / self.cap_kg
        if s == "running" and pct <= EMPTY_PCT:
            self.state.set("starved")
            self.emit("empty")
        elif s == "starved" and pct > 5.0:
            self.state.set("running")

        # humedad de la resina
        if air_on:
            self.moisture.tau_s = max(600.0, 3600.0 * self.level_kg / max(self.flow or demand, 0.1 * p["throughput_kg_h"]))
            self.moisture.step(self._target_moisture(self.level_kg, self.flow or demand), dt)
        dry = self.moisture.value <= p["moisture_limit_pct"]
        if dry != self.dry:
            self.emit("moisture_ok" if dry else "moisture_alarm", moisture_pct=round(self.moisture.value, 4))
            self.dry = dry
        if dry:
            self.dry_s += dt

    # ------------------------------------------------------------------ lectura
    def true_values(self) -> dict[str, Any]:
        return {
            "hopper_level_pct": 100.0 * self.level_kg / self.cap_kg,
            "air_temp_c": self.temp.value,
            "dew_point_actual_c": self.dew.value,
            "resin_moisture_pct": self.moisture.value,
            "resin_dry": 1 if self.dry else 0,
            "flow_kg_h": self.flow,
            "processed_kg": self.processed,
            "heater_duty": self.duty,
            "power_kw": self.power_kw,
        }

    def kpis(self) -> dict[str, Any]:
        return {
            "dry_share": self.dry_s / self.t if self.t > 0 else 1.0,
            "specific_energy_kwh_t": self.energy_kwh / (self.processed / 1000.0) if self.processed > 0 else None,
        }

    def animation(self) -> dict[str, float]:
        s = self.state.current
        light = {"running": 1.0 if self.dry else 2.0, "starting": 2.0, "starved": 2.0, "fault": 3.0}.get(s, 0.0)
        return {
            "hopper_level": self.level_kg / self.cap_kg,
            "air_temp_c": self.temp.value,
            "dew_point_c": self.dew.value,
            "dry_ok": 1.0 if self.dry else 0.0,
            "heater_duty": self.duty,
            "loading": 1.0 if self.loading else 0.0,
            "stack_light": light,
        }
