"""Comportamiento del chiller (B3): lazo de agua con inercia, compresores por etapas y banco de hielo.

Balance del lazo: C · dT/dt = carga − frío de compresores − frío del hielo, con
C = loop_m3 × 4.186 kJ/K. Las etapas suben o bajan de a una, con banda muerta y un tiempo
mínimo entre cambios. El banco de hielo entrega el déficit mientras tenga carga y se recarga con
lo que sobra cuando el agua ya está en consigna.
"""

from __future__ import annotations

import math
from typing import Any

from twin_runtime import EquipmentBehavior, StepContext

WATER_KJ_M3K = 4186.0
LEAK_FACTOR = 0.6
ALARM_K = 3.0


class Chiller(EquipmentBehavior):
    type = "chiller"
    DEFAULT_INPUTS = {"load_kw": None, "power_available": True}
    INITIAL_STATE = "running"

    def setup(self) -> None:
        p = self.p
        self.sp = p["supply_setpoint_c"]
        self.temp = self.sp
        self.stage_kw = p["capacity_kw"] / p["stages"]
        # arranca en régimen: las etapas que cubren la carga nominal (sin hielo)
        self.stages_on = min(p["stages"], max(0, round(p["nominal_load_kw"] / self.stage_kw)))
        self.since_change = p["min_stage_s"]
        self.ice = p["storage_kwh"]
        self.load = p["nominal_load_kw"]
        self.cool = 0.0
        self.ice_kw = 0.0
        self.power = 0.0
        self.energy = 0.0
        self.comp_energy = 0.0
        self.cool_energy = 0.0
        self.starts = 0
        self.max_temp = self.temp
        self.over_s = 0.0
        self.flags: set[str] = set()
        self.enabled = True

    @property
    def c_loop(self) -> float:
        return self.p["loop_m3"] * WATER_KJ_M3K

    @property
    def cop(self) -> float:
        return max(1.0, self.p["cop_at_7c"] * (1.0 + 0.03 * (self.temp - 7.0)))

    def on_command(self, name: str, args: dict[str, Any]) -> bool:
        if name == "start":
            self.enabled = True
            if self.state.current == "off":
                self.state.set("idle")
        elif name == "stop":
            self.enabled = False
            self.stages_on = 0
            self.state.set("off")
        elif name == "set_setpoint":
            self.sp = float(args["c"])
        elif name == "maintenance":
            self.state.set("maintenance" if args.get("active", True) else "idle")
        else:
            return False
        return True

    def on_fault(self, fault_id: str) -> None:
        if fault_id == "high_pressure_trip":
            self.stages_on = 0
            self.since_change = 0.0

    def update(self, ctx: StepContext) -> None:
        dt = ctx.dt
        p = self.p
        s = self.state.current
        load = self.inputs["load_kw"]
        self.load = p["nominal_load_kw"] if load is None else max(0.0, float(load))
        can_run = s not in ("off", "fault", "maintenance") and bool(self.inputs["power_available"]) and self.enabled
        self.since_change += dt

        # etapas con banda muerta y antiarranque
        if not can_run:
            self.stages_on = 0
        elif self.since_change >= p["min_stage_s"]:
            if self.temp > self.sp + p["band_c"] and self.stages_on < p["stages"]:
                self.stages_on += 1
                self.starts += 1
                self.since_change = 0.0
            elif self.temp < self.sp - p["band_c"] and self.stages_on > 0:
                self.stages_on -= 1
                self.since_change = 0.0

        derate = LEAK_FACTOR if self.failures.is_active("refrigerant_leak") else 1.0
        self.cool = self.stages_on * self.stage_kw * derate

        # banco de hielo: cubre el déficit si el agua pasa la consigna; se carga con el sobrante
        self.ice_kw = 0.0
        net = self.load - self.cool
        if p["storage_kwh"] > 0:
            if net > 0 and self.temp >= self.sp and self.ice > 0:
                self.ice_kw = min(net, p["storage_kwh"] / 2.0, self.ice * 3600.0 / dt)  # descarga máx.: la mitad por hora
                self.ice -= self.ice_kw * dt / 3600.0
                if self.ice <= 1e-6 and "ice" not in self.flags:
                    self.flags.add("ice")
                    self.emit("ice_depleted")
            elif net < 0 and self.temp <= self.sp and self.ice < p["storage_kwh"]:
                charge = min(-net, (p["storage_kwh"] - self.ice) * 3600.0 / dt)
                self.ice += charge * dt / 3600.0
                self.ice_kw = -charge  # el frío va al hielo, no al agua
                if self.ice > 0.05 * p["storage_kwh"]:
                    self.flags.discard("ice")

        self.temp += (self.load - self.cool - self.ice_kw) * dt / self.c_loop

        comp_kw = self.cool / self.cop if self.cool > 0 else 0.0
        pump_kw = 0.1 * p["flow_m3_h"] if s != "off" else 0.0
        self.power = comp_kw + pump_kw
        self.energy += self.power * dt / 3600.0
        self.comp_energy += comp_kw * dt / 3600.0
        self.cool_energy += self.cool * dt / 3600.0
        self.max_temp = max(self.max_temp, self.temp)

        hot = self.temp > self.sp + ALARM_K
        if hot:
            self.over_s += dt
        if hot and "hot" not in self.flags:
            self.flags.add("hot")
            self.emit("quality_alarm", variable="supply_temp_c", value=round(self.temp, 1), limit=f"consigna + {ALARM_K:g} K")
        elif not hot:
            self.flags.discard("hot")

        if can_run:
            self.state.set("running" if self.stages_on > 0 or self.load > 0 else "idle")

    def true_values(self) -> dict[str, Any]:
        flow_kw_k = self.p["flow_m3_h"] * WATER_KJ_M3K / 3600.0
        return {
            "supply_temp_c": self.temp,
            "return_temp_c": self.temp + self.load / flow_kw_k,
            "setpoint_c": self.sp,
            "load_kw": self.load,
            "cooling_kw": self.cool,
            "stages_on": self.stages_on,
            "capacity_pct": 100.0 * self.cool / self.p["capacity_kw"],
            "cop": self.cop,
            "power_kw": self.power,
            "energy_kwh": self.energy,
            "ice_kwh": self.ice,
            "ice_pct": 100.0 * self.ice / self.p["storage_kwh"] if self.p["storage_kwh"] > 0 else 0.0,
            "compressor_starts": self.starts,
        }

    def kpis(self) -> dict[str, Any]:
        hours = self.t / 3600.0
        return {
            "avg_cop": self.cool_energy / self.comp_energy if self.comp_energy > 0 else None,
            "max_supply_c": self.max_temp,
            "over_temp_pct": self.over_s / self.t if self.t > 0 else 0.0,
            "starts_per_h": self.starts / hours if hours > 0 else None,
        }

    def animation(self) -> dict[str, float]:
        s = self.state.current
        frac = self.stages_on / self.p["stages"]
        light = 3.0 if s == "fault" else 2.0 if ("hot" in self.flags or self.failures.active) else 0.0 if s == "off" else 1.0
        return {
            "fans": math.sqrt(frac) if frac > 0 else 0.0,
            "compressors": frac,
            "pump": 0.0 if s == "off" else 1.0,
            "supply_heat": max(0.0, min(1.0, (self.temp - self.sp) / 20.0)),
            "ice": self.ice / self.p["storage_kwh"] if self.p["storage_kwh"] > 0 else 0.0,
            "alarm_light": light,
        }
