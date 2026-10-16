"""Comportamiento de la caldera pirotubular (B3): presión por balance, quemador modulante y cíclico."""

from __future__ import annotations

from typing import Any

from twin_runtime import EquipmentBehavior, StepContext
from twin_runtime.primitives import PID, FirstOrderLag


class SteamBoiler(EquipmentBehavior):
    type = "steam-boiler"
    DEFAULT_INPUTS = {"steam_demand_kg_h": None, "fuel_available": True}
    INITIAL_STATE = "running"

    def setup(self) -> None:
        p = self.p
        self.pressure = p["setpoint_bar"]
        # arranca en régimen: quemando lo que pide la demanda nominal
        steady = min(1.0, max(p["min_fire_pct"] / 100.0, p["nominal_demand_kg_h"] / p["rating_kg_h"]))
        self.pid = PID(kp=1.0, ki=0.004, out_min=0.0, out_max=1.0)
        self.pid.integral = steady
        self.gen = FirstOrderLag(tau_s=30.0, initial=steady * p["rating_kg_h"])
        self.burner = True
        self.purge_left = 0.0
        self.fire = steady
        self.delivered = 0.0
        self.demand = p["nominal_demand_kg_h"]
        self.demand_cmd: float | None = None
        self.gas_total = 0.0
        self.steam_total = 0.0
        self.starts = 0
        self.low_flag = False
        self.level = 55.0

    def on_command(self, name: str, args: dict[str, Any]) -> bool:
        if name == "start":
            if self.state.current == "off":
                self._ignite()
        elif name == "stop":
            self.burner = False
            self.state.set("off")
        elif name == "set_demand":
            self.demand_cmd = max(0.0, float(args["kg_h"]))
        else:
            return False
        return True

    def on_fault(self, fault_id: str) -> None:
        self.burner = False
        self.fire = 0.0

    def on_fault_cleared(self, fault_id: str) -> None:
        self.purge_left = 0.0

    def _ignite(self) -> None:
        self.purge_left = self.p["purge_s"]
        self.state.set("starting")

    def update(self, ctx: StepContext) -> None:
        dt = ctx.dt
        p = self.p
        s = self.state.current
        demand = self.inputs["steam_demand_kg_h"]
        demand = (self.demand_cmd if self.demand_cmd is not None else p["nominal_demand_kg_h"]) if demand is None else float(demand)
        self.demand = demand

        if s == "starting":
            self.purge_left -= dt
            self.fire = 0.0
            if self.purge_left <= 0 and self.inputs["fuel_available"]:
                self.burner = True
                self.starts += 1
                self.emit("burner_started")
                self.state.set("running")
        elif s == "running":
            if not self.inputs["fuel_available"]:
                self.burner = False
            if self.burner:
                out = self.pid.step(p["setpoint_bar"], self.pressure, dt)
                self.fire = max(p["min_fire_pct"] / 100.0, out)
                if self.pressure > p["setpoint_bar"] + p["band_bar"] and out <= p["min_fire_pct"] / 100.0:
                    self.burner = False
                    self.fire = 0.0
                    self.emit("burner_stopped")
            else:
                self.fire = 0.0
                self.pid.reset()
                if self.pressure < p["setpoint_bar"] - p["band_bar"] and self.inputs["fuel_available"]:
                    self._ignite()
        else:
            self.fire = 0.0
            if s == "fault" and self.failures.stopping is None:
                pass
        if s == "fault" or s == "off":
            self.burner = False

        gen = self.gen.step(self.fire * p["rating_kg_h"], dt)
        # balance de vapor: la presión sube o baja con la diferencia; sin presión, solo llega lo generado
        stored = self.pressure * p["storage_kg_per_bar"]
        net_kg = (gen - demand) * dt / 3600.0
        if stored + net_kg <= 0:
            self.delivered = gen + stored * 3600.0 / dt
            self.pressure = 0.0
        else:
            self.delivered = demand
            self.pressure = min(p["design_bar"], (stored + net_kg) / p["storage_kg_per_bar"])
        self.steam_total += self.delivered * dt / 3600.0
        kwh_per_kg = (2770.0 - 4.18 * p["feedwater_c"]) / 3600.0
        self.gas_m3_h = gen * kwh_per_kg / (p["efficiency"] * p["gas_kwh_m3"])
        self.gas_total += self.gas_m3_h * dt / 3600.0
        self.level = 55.0 + 4.0 * (self.fire - 0.5) - (40.0 if self.failures.is_active("low_water") else 0.0)

        low = self.pressure < 0.6 * p["setpoint_bar"]
        if low and not self.low_flag:
            self.emit("low_pressure", pressure_bar=round(self.pressure, 2))
        self.low_flag = low

    def true_values(self) -> dict[str, Any]:
        return {
            "pressure_bar": self.pressure,
            "setpoint_bar": self.p["setpoint_bar"],
            "firing_rate_pct": 100.0 * self.fire,
            "steam_out_kg_h": self.delivered,
            "demand_kg_h": self.demand,
            "gas_m3_h": getattr(self, "gas_m3_h", 0.0),
            "gas_total_m3": self.gas_total,
            "water_level_pct": self.level,
            "stack_temp_c": 60.0 + 160.0 * self.fire if self.fire > 0 else 80.0,
            "burner_on": 1 if self.fire > 0 else 0,
            "burner_starts": self.starts,
        }

    def kpis(self) -> dict[str, Any]:
        hours = self.t / 3600.0
        tons = self.steam_total / 1000.0
        return {
            "avg_load_pct": self.steam_total / (self.p["rating_kg_h"] * hours) if hours > 0 else None,
            "gas_m3_per_t": self.gas_total / tons if tons > 0 else None,
            "burner_cycles_per_h": self.starts / hours if hours > 0 else None,
        }

    def animation(self) -> dict[str, float]:
        s = self.state.current
        light = 3.0 if s == "fault" else 2.0 if (s == "starting" or self.low_flag) else 0.0 if s == "off" else 1.0
        return {
            "flame": self.fire,
            "pressure_norm": self.pressure / self.p["design_bar"],
            "stack": self.gen.value / self.p["rating_kg_h"],
            "alarm_light": light,
        }
