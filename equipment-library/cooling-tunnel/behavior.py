"""Comportamiento del túnel de enfriamiento por aspersión (B3)."""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

from twin_runtime import EquipmentBehavior, StepContext

AIR_C = 25.0
WATER_KJ_M3K = 4180.0  # kJ/(m³·K)
INFEED_WAIT_UNITS = 3.0  # unidades que alcanzan a quedar en la entrada mientras la banda está detenida


@dataclass
class Unit:
    pos: float
    temp: float


class CoolingTunnel(EquipmentBehavior):
    type = "cooling-tunnel"
    DEFAULT_INPUTS = {"inflow_upm": None, "inlet_temp_c": None, "water_available": True, "downstream_free": True}

    def setup(self) -> None:
        self.units: list[Unit] = []
        self.arrivals = 0.0
        self.units_out = 0
        self.hot = 0
        self.last_outlet: float | None = None
        self.return_c = self.p["water_setpoint_c"]
        self.heat_kw = 0.0
        self.heat_sum = 0.0
        self.travel = 0.0
        self.moving = True
        self.alarm = False

    @property
    def tau_s(self) -> float:
        return 343.0 * math.sqrt(self.p["unit_ml"] / 250.0)

    @property
    def unit_kg(self) -> float:
        return self.p["unit_ml"] / 1000.0 * self.p["density_kg_l"]

    def update(self, ctx: StepContext) -> None:
        dt = ctx.dt
        p = self.p
        stopped = self.failures.stopping is not None
        spraying = bool(self.inputs["water_available"]) and not self.failures.is_active("spray_pump_failure")
        supply = p["water_setpoint_c"]
        medium = (supply + self.return_c) / 2 if spraying else AIR_C
        tau = self.tau_s * (1.0 if spraying else 5.0)
        speed = p["length_m"] / (p["dwell_min"] * 60.0)
        downstream = bool(self.inputs["downstream_free"])
        at_exit = bool(self.units) and self.units[0].pos >= p["length_m"]
        moving = not stopped and not (at_exit and not downstream)
        v = speed if moving else 0.0
        self.moving = moving
        self.travel = (self.travel + v * dt) % 10.0

        removed_kj = 0.0
        decay = math.exp(-dt / tau)
        for u in self.units:
            new_t = medium + (u.temp - medium) * decay
            removed_kj += (u.temp - new_t) * self.unit_kg * p["product_cp"]
            u.temp = new_t
            u.pos += v * dt
        self.heat_kw = removed_kj / dt if spraying else 0.0
        self.heat_sum += self.heat_kw * dt
        flow_kw_per_k = p["water_flow_m3_h"] * WATER_KJ_M3K / 3600.0
        self.return_c = supply + self.heat_kw / flow_kw_per_k

        while self.units and self.units[0].pos >= p["length_m"] and downstream and not stopped:
            u = self.units.pop(0)
            self.units_out += 1
            self.last_outlet = u.temp
            if u.temp > p["outlet_max_c"]:
                self.hot += 1

        inflow = self.inputs["inflow_upm"]
        inflow = p["nominal_inflow_upm"] if inflow is None else float(inflow)
        inlet = self.inputs["inlet_temp_c"]
        inlet = p["inlet_c"] if inlet is None else float(inlet)
        self.arrivals += inflow / 60.0 * dt
        if moving:
            while self.arrivals >= 1.0:
                self.units.append(Unit(pos=0.0, temp=inlet))
                self.arrivals -= 1.0
        else:
            # detenida: las que alcanzan a llegar esperan en la entrada; la máquina anterior ya ve accepting = 0
            self.arrivals = min(self.arrivals, INFEED_WAIT_UNITS)

        hot_now = self.last_outlet is not None and self.last_outlet > p["outlet_max_c"]
        if hot_now and not self.alarm:
            self.emit("quality_alarm", variable="product_outlet_c", value=round(self.last_outlet, 1), limit=p["outlet_max_c"])
        self.alarm = hot_now

        if stopped:
            return
        if at_exit and not downstream:
            self.state.set("blocked")
        elif self.units or inflow > 0:
            self.state.set("running")
        else:
            self.state.set("idle")

    def true_values(self) -> dict[str, Any]:
        speed = self.p["length_m"] / self.p["dwell_min"]
        return {
            "units_inside": len(self.units),
            "units_out": self.units_out,
            "product_outlet_c": self.last_outlet,
            "water_supply_c": self.p["water_setpoint_c"],
            "water_return_c": self.return_c,
            "heat_load_kw": self.heat_kw,
            "belt_speed_m_min": speed if self.state.current == "running" else 0.0,
            "hot_outlets": self.hot,
            "accepting": 1 if self.moving else 0,
        }

    def kpis(self) -> dict[str, Any]:
        return {
            "hot_outlet_rate": self.hot / self.units_out if self.units_out else None,
            "avg_heat_load_kw": self.heat_sum / self.t if self.t > 0 else None,
        }

    def animation(self) -> dict[str, float]:
        spraying = bool(self.inputs.get("water_available", True)) and not self.failures.is_active("spray_pump_failure")
        inlet = self.inputs.get("inlet_temp_c")
        inlet = self.p["inlet_c"] if inlet is None else float(inlet)
        return {
            "belt_travel": self.travel,
            "spray": 1.0 if spraying and self.state.current != "fault" else 0.0,
            "units_count": float(len(self.units)),
            "inlet_heat": max(0.0, min(1.0, (inlet - 30.0) / 60.0)) if self.units else 0.0,
        }
