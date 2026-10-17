"""Comportamiento de un recipiente (silo o tanque): balance de masa, nivel, temperatura y alarmas."""

from __future__ import annotations

import math
from typing import Any

from twin_runtime import EquipmentBehavior, StepContext
from twin_runtime.primitives import PID, FirstOrderLag

AMBIENT_C = 22.0
LOSS_W_M2K = 8.0
CP_KJ_KGK = 3.8
HEATING_KW_PER_M3 = 6.0  # potencia de chaqueta típica por m³ de volumen


def vessel_dimensions(volume_l: float, form: str, diameter_m: float = 0.0) -> tuple[float, float]:
    """(diámetro, altura cilíndrica) en m. Compartido con la geometría: misma regla en ambos lados."""
    v = volume_l / 1000.0
    ratio = 2.5 if form == "silo" else 1.5
    d = diameter_m if diameter_m > 0 else (4.0 * v / (math.pi * ratio)) ** (1.0 / 3.0)
    h = 4.0 * v / (math.pi * d * d)
    return d, h


class Vessel(EquipmentBehavior):
    type = "vessel"
    # inflow_kg_h / outflow_kg_h: caudales impuestos por el motor de planta; None = usar las consignas
    # de los comandos set_inflow / set_outflow.
    DEFAULT_INPUTS = {"inflow_temp_c": 20.0, "heating_available": True, "inflow_kg_h": None, "outflow_kg_h": None}

    def setup(self) -> None:
        p = self.p
        self.capacity_kg = p["volume_l"] / 1000.0 * p["density_kg_m3"]
        self.mass = self.capacity_kg * p["initial_level_pct"] / 100.0
        self.diameter, self.height = vessel_dimensions(p["volume_l"], p["form"], p["diameter_m"])
        self.outer_area = math.pi * self.diameter * self.height + math.pi * self.diameter**2 / 2.0
        start_temp = p["hold_temp_c"] if p["jacketed"] else AMBIENT_C
        self.temp = start_temp
        self.heat_pid = PID(kp=0.25, ki=0.004, out_min=0.0, out_max=1.0)
        self.heating = 0.0
        self.inflow_sp = 0.0
        self.outflow_sp = 0.0
        self.inflow = 0.0
        self.outflow = 0.0
        self.agitator_sp = p["agitator_rpm"] if p["agitator"] else 0.0
        self.agitator = FirstOrderLag(tau_s=3.0, initial=self.agitator_sp)
        self.total_in = 0.0
        self.total_out = 0.0
        self.cip_remaining = 0.0
        self.low_s = 0.0
        self.flags: set[str] = set()

    # ------------------------------------------------------------------ comandos
    def on_command(self, name: str, args: dict[str, Any]) -> bool:
        if name == "set_inflow":
            self.inflow_sp = max(0.0, float(args["kg_h"]))
        elif name == "set_outflow":
            self.outflow_sp = max(0.0, float(args["kg_h"]))
        elif name == "set_agitator":
            self.agitator_sp = max(0.0, float(args["rpm"])) if self.p["agitator"] else 0.0
        elif name == "fill":
            self.mass = min(self.capacity_kg, self.mass + float(args["kg"]))
        elif name == "cip":
            minutes = float(args.get("duration_min", 40))
            self.cip_remaining = minutes * 60.0
            self.inflow_sp = self.outflow_sp = 0.0
            self.total_out += self.mass
            self.mass = 0.0
            self.state.set("cleaning")
            self.emit("cip_started", duration_min=minutes)
        elif name == "maintenance":
            self.state.set("maintenance" if args.get("active", True) else "idle")
        else:
            return False
        return True

    def on_fault(self, fault_id: str) -> None:
        if fault_id == "level_transmitter_stuck":
            self.sensors["level_pct"].stick(self.level_pct)

    def on_fault_cleared(self, fault_id: str) -> None:
        if fault_id == "level_transmitter_stuck":
            self.sensors["level_pct"].stick(None)

    @property
    def level_pct(self) -> float:
        return 100.0 * self.mass / self.capacity_kg if self.capacity_kg else 0.0

    # ------------------------------------------------------------------ simulación
    def update(self, ctx: StepContext) -> None:
        dt = ctx.dt
        s = self.state.current
        p = self.p
        if s == "cleaning":
            self.cip_remaining -= dt
            self.inflow = self.outflow = 0.0
            if self.cip_remaining <= 0:
                self.emit("cip_completed")
                self.state.set("idle")
            self._thermal(dt, active=False)
            return
        active = s not in ("maintenance", "fault")
        in_sp = self.inflow_sp if self.inputs["inflow_kg_h"] is None else max(0.0, float(self.inputs["inflow_kg_h"]))
        out_sp = self.outflow_sp if self.inputs["outflow_kg_h"] is None else max(0.0, float(self.inputs["outflow_kg_h"]))

        inflow = min(in_sp, p["inlet_max_kg_h"]) if active else 0.0
        outflow = min(out_sp, p["outlet_max_kg_h"]) if active else 0.0
        if self.failures.is_active("outlet_valve_fault"):
            outflow = 0.0
        room = self.capacity_kg - self.mass
        available = self.mass
        in_kg = min(inflow * dt / 3600.0, room + outflow * dt / 3600.0)
        out_kg = min(outflow * dt / 3600.0, available + in_kg)
        self.inflow, self.outflow = in_kg * 3600.0 / dt, out_kg * 3600.0 / dt

        if in_kg > 0:  # mezcla térmica con lo que entra
            t_in = float(self.inputs["inflow_temp_c"])
            self.temp = (self.temp * self.mass + t_in * in_kg) / max(1e-9, self.mass + in_kg)
        self.mass = max(0.0, min(self.capacity_kg, self.mass + in_kg - out_kg))
        self.total_in += in_kg
        self.total_out += out_kg

        if active:
            starved = out_sp > 0 and self.mass <= 1e-6 and self.inflow < out_sp
            full = in_sp > 0 and self.mass >= self.capacity_kg - 1e-6 and self.outflow < in_sp
            moving = self.inflow > 1e-6 or self.outflow > 1e-6
            new_state = "starved" if starved else "blocked" if full else "running" if moving else "idle"
            self.state.set(new_state)
            self._edge("empty", starved)
            self._edge("full", full)

        lvl = self.level_pct
        self._edge("low_level", lvl < p["low_level_pct"])
        self._edge("high_level", lvl > p["high_level_pct"])
        if lvl < p["low_level_pct"]:
            self.low_s += dt

        rpm_target = self.agitator_sp if active and not self.failures.is_active("agitator_trip") else 0.0
        if lvl < 5.0:
            rpm_target = 0.0  # interlock: no agitar en vacío
        self.agitator.step(rpm_target, dt)
        self._thermal(dt, active)

    def _edge(self, event: str, condition: bool) -> None:
        """Emite el evento solo al entrar en la condición."""
        if condition and event not in self.flags:
            self.flags.add(event)
            self.emit(event)
        elif not condition:
            self.flags.discard(event)

    def _thermal(self, dt: float, active: bool) -> None:
        p = self.p
        loss_kw = LOSS_W_M2K * self.outer_area * (self.temp - AMBIENT_C) / 1000.0
        heat_kw = 0.0
        self.heating = 0.0
        if p["jacketed"] and active and self.inputs["heating_available"] and self.mass > 1.0:
            self.heating = self.heat_pid.step(p["hold_temp_c"], self.temp, dt)
            heat_kw = self.heating * HEATING_KW_PER_M3 * p["volume_l"] / 1000.0
        if self.mass > 1.0:
            self.temp += (heat_kw - loss_kw) * dt / (self.mass * CP_KJ_KGK)
        else:
            self.temp += (AMBIENT_C - self.temp) * min(1.0, dt / 600.0)

    # ------------------------------------------------------------------ lectura
    def true_values(self) -> dict[str, Any]:
        return {
            "level_pct": self.level_pct,
            "mass_kg": self.mass,
            "volume_l": self.mass / self.p["density_kg_m3"] * 1000.0,
            "temperature_c": self.temp,
            "inflow_kg_h": self.inflow,
            "outflow_kg_h": self.outflow,
            "agitator_rpm": self.agitator.value,
            "heating_pct": 100.0 * self.heating,
            "total_in_kg": self.total_in,
            "total_out_kg": self.total_out,
        }

    def kpis(self) -> dict[str, Any]:
        avg_out = self.total_out / (self.t / 3600.0) if self.t > 0 else 0.0
        return {
            "residence_time_h": self.mass / avg_out if avg_out > 0 else None,
            "time_below_low_pct": self.low_s / self.t if self.t > 0 else 0.0,
        }

    def animation(self) -> dict[str, float]:
        s = self.state.current
        light = {"running": 1.0, "idle": 1.0, "fault": 3.0}.get(s, 2.0)
        if "low_level" in self.flags or "high_level" in self.flags:
            light = max(light, 2.0)
        return {
            "level": self.level_pct / 100.0,
            "agitator_rpm": self.agitator.value,
            "inflow_active": min(1.0, self.inflow / max(1.0, self.p["inlet_max_kg_h"])),
            "outflow_active": min(1.0, self.outflow / max(1.0, self.p["outlet_max_kg_h"])),
            "heating": self.heating,
            "alarm_light": light,
        }
