"""Comportamiento del pasteurizador tubular con tubo de retención y válvula de desvío (B3)."""

from __future__ import annotations

import math
from typing import Any

from twin_runtime import EquipmentBehavior, StepContext
from twin_runtime.primitives import PID, FirstOrderLag, saturation_temp_c, steam_latent_kj_kg

HOLD_LOSS_C = 0.6
PROBE_DRIFT_C = 3.0


class TubularPasteurizer(EquipmentBehavior):
    type = "tubular-pasteurizer"
    DEFAULT_INPUTS = {"product_available": True, "product_in_c": 85.0, "steam_supply_bar": None, "downstream_free": True}

    def setup(self) -> None:
        t_in = float(self.DEFAULT_INPUTS["product_in_c"])
        self.out = FirstOrderLag(tau_s=25.0, initial=t_in)
        self.hold = FirstOrderLag(tau_s=self.p["hold_s"] / 2, initial=t_in - HOLD_LOSS_C)
        self.pid = PID(kp=0.06, ki=0.004, out_min=0.0, out_max=1.0)
        self.valve = 0.0
        self.jacket_bar = 0.0
        self.steam_kg_h = 0.0
        self.fouling = 0.0
        self.diverting = False
        self.pasteurized = 0.0
        self.diverted = 0.0
        self.under_target = 0.0
        self.min_p: float | None = None
        self.p_now = 0.0
        self.steam_total = 0.0
        self.run_s = 0.0
        self.divert_s = 0.0
        self.lot_hold = False
        self.flowing = False
        self.cip_left = 0.0
        self.running_cmd = False

    def on_command(self, name: str, args: dict[str, Any]) -> bool:
        if name == "start":
            self.running_cmd = True
            if self.state.current == "idle":
                self.state.set("running")
        elif name == "stop":
            self.running_cmd = False
            if self.state.current in ("running", "starved", "blocked"):
                self.state.set("idle")
        elif name == "cip":
            minutes = float(args.get("duration_min", 40))
            self.cip_left = minutes * 60.0
            self.state.set("cleaning")
            self.emit("cip_started", duration_min=minutes)
        else:
            return False
        return True

    def on_fault(self, fault_id: str) -> None:
        if fault_id == "divert_valve_stuck":
            self.lot_hold = True
            self.emit("quality_alarm", variable="lot_hold", value=1, limit="válvula de desvío sin respuesta")

    def update(self, ctx: StepContext) -> None:
        dt = ctx.dt
        p = self.p
        s = self.state.current
        t_in = float(self.inputs["product_in_c"])
        if s == "cleaning":
            self.cip_left -= dt
            self.flowing = False
            if self.cip_left <= 0:
                self.fouling = 0.0
                self.emit("cip_completed")
                self.state.set("running" if self.running_cmd else "idle")
            self.valve = 0.0
            self.out.step(t_in, dt)
            return
        if s == "fault" or not self.running_cmd:
            self.flowing = False
            self.valve = 0.0
            self.out.step(max(25.0, self.out.value - 0.5 * dt), dt)
            self.hold.step(self.out.value - HOLD_LOSS_C, dt)
            return
        if not self.inputs["product_available"]:
            self.state.set("starved")
            self.flowing = False
        elif not self.inputs["downstream_free"] and not self.diverting:
            self.state.set("blocked")
            self.flowing = False
        else:
            self.state.set("running")
            self.flowing = True

        # intercambiador: efectividad con el UA actual y la temperatura de vapor de la chaqueta
        m_kg_s = p["flow_l_h"] * p["density_kg_l"] / 3600.0
        c_kw_k = m_kg_s * p["product_cp"]
        supply = self.inputs["steam_supply_bar"]
        supply = p["steam_bar_max"] if supply is None else float(supply)
        ua = p["ua_clean_kw_k"] * (1.0 - self.fouling)
        if self.flowing:
            self.valve = self.pid.step(p["outlet_setpoint_c"], self.out.value, dt)
            self.jacket_bar = max(0.0, supply * self.valve)
            t_steam = saturation_temp_c(self.jacket_bar) if self.valve > 0.01 else t_in
            eff = 1.0 - math.exp(-ua / c_kw_k)
            target = t_in + max(0.0, t_steam - t_in) * eff
            self.out.step(target, dt)
            q_kw = c_kw_k * max(0.0, self.out.value - t_in)
            self.steam_kg_h = q_kw / steam_latent_kj_kg(max(100.0, t_steam)) * 3600.0
            self.fouling = min(0.8, self.fouling + p["fouling_pct_per_h"] / 100.0 * dt / 3600.0)
            self.run_s += dt
        else:
            self.valve = 0.0
            self.steam_kg_h = 0.0
            self.out.step(self.out.value, dt)
        self.steam_total += self.steam_kg_h * dt / 3600.0
        self.hold.step(self.out.value - HOLD_LOSS_C, dt)

        # desvío según la sonda (puede tener deriva); letalidad con la temperatura real
        measured_hold = self.hold.value + (PROBE_DRIFT_C if self.failures.is_active("hold_probe_drift") else 0.0)
        divert = measured_hold < p["hold_min_c"]
        if divert and not self.diverting:
            self.emit("divert_started", hold_temp_c=round(measured_hold, 1))
        elif not divert and self.diverting:
            self.emit("divert_ended")
        self.diverting = divert
        self.p_now = p["hold_s"] / 60.0 * 10 ** ((self.hold.value - p["p_ref_c"]) / p["z_c"])
        if self.flowing:
            liters = p["flow_l_h"] * dt / 3600.0
            if self.diverting:
                self.diverted += liters
                self.divert_s += dt
            else:
                self.pasteurized += liters
                self.min_p = self.p_now if self.min_p is None else min(self.min_p, self.p_now)
                if self.p_now < p["p_target_min"]:
                    self.under_target += liters

    def true_values(self) -> dict[str, Any]:
        drift = PROBE_DRIFT_C if self.failures.is_active("hold_probe_drift") else 0.0
        return {
            "product_in_c": float(self.inputs.get("product_in_c", 85.0)),
            "product_out_c": self.out.value,
            "hold_temp_c": self.hold.value + drift,
            "flow_l_h": self.p["flow_l_h"] if self.flowing else 0.0,
            "steam_valve_pct": 100.0 * self.valve,
            "steam_flow_kg_h": self.steam_kg_h,
            "divert": 1 if self.diverting and self.flowing else 0,
            "pasteurized_l": self.pasteurized,
            "diverted_l": self.diverted,
            "p_value_min": self.p_now,
            "fouling_pct": 100.0 * self.fouling,
            "lot_hold": 1 if self.lot_hold else 0,
            "accepting": 1 if self.accepting else 0,
            "forward_kg_h": self.p["flow_l_h"] * self.p["density_kg_l"] if self.flowing and not self.diverting else 0.0,
        }

    @property
    def accepting(self) -> bool:
        """Recibe producto si está en marcha, sin falla ni CIP y con salida (adelante o al desvío)."""
        if not self.running_cmd or self.state.current in ("fault", "cleaning"):
            return False
        return bool(self.inputs.get("downstream_free", True)) or self.diverting

    def kpis(self) -> dict[str, Any]:
        tons = self.pasteurized * self.p["density_kg_l"] / 1000.0
        return {
            "divert_time_pct": self.divert_s / self.run_s if self.run_s > 0 else None,
            "steam_kg_per_t": self.steam_total / tons if tons > 0 else None,
            "min_p_value_min": self.min_p,
            "under_target_l": self.under_target,
        }

    def animation(self) -> dict[str, float]:
        s = self.state.current
        warning = (self.diverting and self.flowing) or s in ("starved", "blocked", "cleaning")
        light = 3.0 if s == "fault" else 2.0 if warning else 1.0 if self.flowing else 0.0
        return {
            "flow": 1.0 if self.flowing else 0.0,
            "heat": max(0.0, min(1.0, (self.out.value - 20.0) / 80.0)),
            "divert": 1.0 if self.diverting and self.flowing else 0.0,
            "steam": self.valve,
            "alarm_light": light,
        }
