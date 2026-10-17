"""Válvula de regulación (B2): Kv con característica de apertura sobre la red hidráulica, volante o actuador
con tiempo de recorrido, PID opcional sobre la presión de salida, actuador trabado y fuga por el asiento."""

from __future__ import annotations

from typing import Any

from twin_runtime import EquipmentBehavior, StepContext
from twin_runtime.primitives import PID, HydraulicNetwork, RateLimiter

SEAT_LEAK = 0.02


def add_regulating_valve(net: HydraulicNetwork, link_id: str, inlet: str, outlet: str, p: dict[str, Any]) -> None:
    """Agrega la válvula a una red (la misma función la usará el motor de planta)."""
    net.add_valve(link_id, inlet, outlet, kv_m3h=p["kv_m3h"], opening=p["opening_pct"] / 100,
                  characteristic=p["characteristic"])


class RegulatingValve(EquipmentBehavior):
    type = "regulating-valve"
    INITIAL_STATE = "running"
    DEFAULT_INPUTS = {"inlet_pressure_mca": None, "load_kv_m3h": None}

    def setup(self) -> None:
        p = self.p
        if p["control"] == "downstream_pressure" and not p["actuated"]:
            raise ValueError("el control de presión necesita actuador (actuated: true)")
        self.net = HydraulicNetwork()
        self.net.add_fixed_head("supply", p["bench_inlet_mca"], elevation_m=0.0)
        self.net.add_node("inlet", 0.0)
        self.net.add_node("outlet", 0.0)
        self.net.add_valve("supply-line", "supply", "inlet", kv_m3h=1e5)  # sin pérdida: el banco fija la entrada
        add_regulating_valve(self.net, "valve", "inlet", "outlet", p)
        self.net.add_emitter("load", "outlet", kv_m3h=p["bench_load_kv_m3h"])
        self.target = p["opening_pct"]
        self.position = RateLimiter(100.0 / p["stroke_s"], p["opening_pct"])
        self.setpoint = p["setpoint_mca"]
        self.pid = PID(kp=0.5, ki=0.5, out_min=0.0, out_max=100.0)
        self.pid.integral = p["opening_pct"]
        self.pid.output = p["opening_pct"]
        self.flow = 0.0
        self.p_in = p["bench_inlet_mca"]
        self.p_out = 0.0
        self.kv_eff = 0.0
        self.volume_m3 = 0.0
        self.dp_integral = 0.0
        self._update_state()

    def on_command(self, name: str, args: dict[str, Any]) -> bool:
        if name == "set_opening":
            self.target = min(100.0, max(0.0, float(args["pct"])))
            self.emit("opening_changed", pct=self.target)
            if self.p["control"] == "downstream_pressure":
                self.pid.integral = self.pid.output = self.target  # arranca el lazo desde la apertura ordenada
            if self.failures.is_active("actuator_stuck"):
                self.emit("valve_stuck", pct=round(self.position.value, 1))
        elif name == "set_setpoint":
            self.setpoint = float(args["mca"])
        else:
            return False
        return True

    def on_fault(self, fault_id: str) -> None:
        if fault_id == "actuator_stuck":
            self.emit("valve_stuck", pct=round(self.position.value, 1))

    def update(self, ctx: StepContext) -> None:
        p = self.p
        dt = ctx.dt
        if p["control"] == "downstream_pressure":
            self.target = self.pid.step(self.setpoint, self.p_out, dt)
        if not self.failures.is_active("actuator_stuck"):
            if p["actuated"]:
                self.position.step(self.target, dt)
            else:
                self.position.value = self.target
        opening = self.position.value / 100
        leaking = self.failures.is_active("seat_leak")
        if leaking and opening < SEAT_LEAK:
            opening = SEAT_LEAK
        if p["characteristic"] == "linear" or opening in (0.0, 1.0):
            char = opening
        else:
            char = 50.0 ** (opening - 1)
        self.kv_eff = p["kv_m3h"] * char
        inlet = self.inputs["inlet_pressure_mca"]
        self.net.set_head("supply", p["bench_inlet_mca"] if inlet is None else float(inlet))
        load = self.inputs["load_kv_m3h"]
        self.net.set("load", kv_m3h=p["bench_load_kv_m3h"] if load is None else max(0.0, float(load)))
        self.net.set("valve", opening=opening)
        res = self.net.solve()
        self.flow = res.flows_m3h["valve"]
        self.p_in = res.pressures_mca["inlet"]
        self.p_out = res.pressures_mca["outlet"]
        self.volume_m3 += self.flow * dt / 3600
        self.dp_integral += (self.p_in - self.p_out) * dt
        self._update_state()

    def _update_state(self) -> None:
        if self.state.current != "fault":
            self.state.set("running" if self.position.value > 0 else "idle")

    def true_values(self) -> dict[str, Any]:
        return {
            "opening_pct": self.position.value,
            "opening_target_pct": self.target,
            "flow_m3h": self.flow,
            "inlet_pressure_mca": self.p_in,
            "outlet_pressure_mca": self.p_out,
            "dp_mca": self.p_in - self.p_out,
            "setpoint_mca": self.setpoint,
            "kv_effective_m3h": self.kv_eff,
            "volume_m3": self.volume_m3,
        }

    def kpis(self) -> dict[str, Any]:
        hours = self.t / 3600
        return {
            "avg_flow_m3h": self.volume_m3 / hours if hours > 0 else 0.0,
            "avg_dp_mca": self.dp_integral / self.t if self.t > 0 else 0.0,
        }

    def animation(self) -> dict[str, float]:
        return {
            "opening": self.position.value / 100,
            "flow_norm": min(2.0, self.flow / self.p["kv_m3h"]),
            "inlet_pressure_mca": max(0.0, self.p_in),
            "outlet_pressure_mca": max(0.0, self.p_out),
        }
