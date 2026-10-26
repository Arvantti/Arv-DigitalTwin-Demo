"""Estación reguladora de presión (B2): dos ramas con PRV sobre la red hidráulica, la automática con PID sobre la
presión del punto crítico y la manual con salida fija; cambio de rama sin cortar el suministro, pérdida de
telemetría, deriva del piloto y diafragma roto."""

from __future__ import annotations

from typing import Any

from twin_runtime import EquipmentBehavior, StepContext
from twin_runtime.primitives import PID, HydraulicNetwork, RateLimiter

RHO_G = 998.0 * 9.81  # N/m³
LOW_FRACTION = 0.10
HIGH_FRACTION = 0.15
BAND_FRACTION = 0.05
ALARM_S = 30.0
PILOT_DRIFT = 1.15
WIDE_OPEN_MCA = 1.0e4  # consigna imposible de alcanzar: la PRV queda abierta


def add_pressure_reducing_station(net: HydraulicNetwork, prefix: str, inlet: str, outlet: str,
                                  p: dict[str, Any]) -> dict[str, str]:
    """Agrega las dos ramas (corte, PRV, corte) entre dos nodos de una red. Devuelve los ids de los elementos.

    El motor de planta usará esta misma función para armar la estación dentro de la red completa."""
    z = net.nodes[inlet].elevation_m
    auto = p["branch"] == "auto"
    ids = {}
    branch_out = outlet
    if p["outlet_check_kv_m3h"] > 0:
        branch_out = prefix + "regulated"
        net.add_node(branch_out, z)
    for tag, is_open in (("a", auto), ("b", not auto)):
        n_in, n_prv = f"{prefix}{tag}_in", f"{prefix}{tag}_prv"
        net.add_node(n_in, z)
        net.add_node(n_prv, z)
        opening = 1.0 if is_open else 0.0
        net.add_valve(f"{prefix}iso_{tag}_in", inlet, n_in, kv_m3h=p["isolation_kv_m3h"], opening=opening)
        net.add_prv(f"{prefix}prv_{tag}", n_in, n_prv, setting_mca=p["manual_setting_mca"], kv_m3h=p["prv_kv_m3h"])
        net.add_valve(f"{prefix}iso_{tag}_out", n_prv, branch_out, kv_m3h=p["isolation_kv_m3h"], opening=opening)
        for name in (f"prv_{tag}", f"iso_{tag}_in", f"iso_{tag}_out"):
            ids[name] = prefix + name
    if p["outlet_check_kv_m3h"] > 0:
        net.add_check_valve(prefix + "outlet_check", branch_out, outlet, kv_m3h=p["outlet_check_kv_m3h"])
    return ids


class PressureReducingStation(EquipmentBehavior):
    type = "pressure-reducing-station"
    INITIAL_STATE = "running"
    DEFAULT_INPUTS = {
        "inlet_pressure_mca": None,
        "critical_pressure_mca": None,
        "control_point_pressure_mca": None,
        "load_factor": None,
    }

    def setup(self) -> None:
        p = self.p
        self.net = HydraulicNetwork()
        self.net.add_fixed_head("supply", p["bench_inlet_mca"], elevation_m=0.0)
        self.net.add_node("inlet", 0.0)
        self.net.add_node("outlet", 0.0)
        self.net.add_node("critical", 0.0)
        self.net.add_valve("supply-line", "supply", "inlet", kv_m3h=1e5)
        self.ids = add_pressure_reducing_station(self.net, "", "inlet", "outlet", p)
        self.net.add_valve("network", "outlet", "critical", kv_m3h=p["bench_network_kv_m3h"])
        self.net.add_emitter("load", "critical", kv_m3h=p["bench_load_kv_m3h"])
        auto = p["branch"] == "auto"
        self.branch = p["branch"]  # rama en servicio (o la que entra durante un cambio)
        self.open_a = RateLimiter(1.0 / p["switch_time_s"], 1.0 if auto else 0.0)
        self.open_b = RateLimiter(1.0 / p["switch_time_s"], 0.0 if auto else 1.0)
        self.switching = False
        self.critical_sp = p["critical_setpoint_mca"]
        self.manual_setting = p["manual_setting_mca"]
        self.pid = PID(kp=p["pid_kp"], ki=p["pid_ki"], out_min=p["auto_min_outlet_mca"], out_max=p["auto_max_outlet_mca"])
        self.pid.integral = self.pid.output = self.manual_setting  # arranca desde la salida de diseño
        self.auto_setting = self.manual_setting
        self.auto_control_mode = "critical_pressure"
        self.auto_fixed_outlet_mca = self.auto_setting
        self.p_in = p["bench_inlet_mca"]
        self.p_out = 0.0
        self.critical = self.critical_sp
        self.control_point_pressure: float | None = None
        self.flow = self.flow_a = self.flow_b = 0.0
        self.power_kw = 0.0
        self.energy_kwh = 0.0
        self.volume_m3 = 0.0
        self.low_s = self.high_s = 0.0
        self.alarm: str | None = None
        self.critical_integral = 0.0
        self.in_band_s = 0.0
        self.power_integral = 0.0

    def hydraulic_build(self, net: HydraulicNetwork, prefix: str, elevation_m: float) -> None:
        """En la planta: las dos ramas entre los nodos de llegada y salida, a la cota del equipo. La presión crítica
        llega por la telemetría (puerto critical_pressure)."""
        net.add_node(prefix + "inlet", elevation_m)
        net.add_node(prefix + "outlet", elevation_m)
        add_pressure_reducing_station(net, prefix, prefix + "inlet", prefix + "outlet", self.p)

    # ---- comandos y fallas ----
    def on_command(self, name: str, args: dict[str, Any]) -> bool:
        if name == "select_branch":
            branch = str(args["branch"])
            if branch not in ("auto", "manual"):
                raise ValueError("branch debe ser auto o manual")
            if branch != self.branch:
                self.branch = branch
                self.switching = True
                if branch == "auto":  # sin salto: la PRV automática entra con la presión que hay
                    self.pid.integral = self.pid.output = self.auto_setting = self._clamp_auto(self.p_out)
        elif name == "set_critical_setpoint":
            self.critical_sp = float(args["mca"])
        elif name == "set_manual_setting":
            self.manual_setting = float(args["mca"])
        elif name == "set_auto_control":
            mode = str(args["mode"])
            if mode not in {"critical_pressure", "critical_point", "fixed_outlet"}:
                raise ValueError("mode debe ser critical_pressure, critical_point o fixed_outlet")
            if mode == "fixed_outlet":
                outlet = float(args["mca"])
                if not self.p["auto_min_outlet_mca"] <= outlet <= self.p["auto_max_outlet_mca"]:
                    raise ValueError("mca debe estar dentro de los límites de salida automática")
                self.auto_fixed_outlet_mca = outlet
                self.auto_setting = outlet
                self.pid.integral = self.pid.output = outlet
            elif mode == "critical_point":
                self.critical_sp = float(args["mca"])
                if self.auto_control_mode == "fixed_outlet":
                    self.pid.integral = self.pid.output = self.auto_setting
            elif self.auto_control_mode == "fixed_outlet" and mode != "fixed_outlet":
                self.pid.integral = self.pid.output = self.auto_setting
            self.auto_control_mode = mode
        else:
            return False
        return True

    def on_fault(self, fault_id: str) -> None:
        if fault_id == "telemetry_loss":
            self.emit("telemetry_lost")

    def _clamp_auto(self, v: float) -> float:
        return min(self.p["auto_max_outlet_mca"], max(self.p["auto_min_outlet_mca"], v))

    # ---- paso ----
    def update(self, ctx: StepContext) -> None:
        p = self.p
        dt = ctx.dt
        # cambio de rama: abre la que entra y, ya abierta, cierra la que sale
        incoming, outgoing = (self.open_a, self.open_b) if self.branch == "auto" else (self.open_b, self.open_a)
        if self.switching:
            incoming.step(1.0, dt)
            if incoming.value >= 1.0:
                outgoing.step(0.0, dt)
                if outgoing.value <= 0.0:
                    self.switching = False
                    self.emit("branch_changed", branch=self.branch)
        # PRV automática: el PID mueve su consigna de salida con la presión crítica del paso anterior
        auto_in_service = self.open_a.value > 0
        if auto_in_service and self.auto_control_mode == "fixed_outlet":
            self.auto_setting = self.auto_fixed_outlet_mca
        elif auto_in_service and not self.failures.is_active("telemetry_loss"):
            if self.auto_control_mode == "critical_point":
                point_pressure = self.inputs["control_point_pressure_mca"]
                if point_pressure is not None:
                    self.auto_setting = self.pid.step(self.critical_sp, float(point_pressure), dt)
            else:
                self.auto_setting = self.pid.step(self.critical_sp, self.critical, dt)
        a_setting = WIDE_OPEN_MCA if self.failures.is_active("diaphragm_failure") else self.auto_setting
        b_setting = self.manual_setting * (PILOT_DRIFT if self.failures.is_active("pilot_drift") else 1.0)
        net = self.net
        net.set(self.ids["prv_a"], setting_mca=a_setting)
        net.set(self.ids["prv_b"], setting_mca=b_setting)
        for tag, lim in (("a", self.open_a), ("b", self.open_b)):
            net.set(self.ids[f"iso_{tag}_in"], opening=lim.value)
            net.set(self.ids[f"iso_{tag}_out"], opening=lim.value)
        inlet = self.inputs["inlet_pressure_mca"]
        net.set_head("supply", p["bench_inlet_mca"] if inlet is None else float(inlet))
        factor = self.inputs["load_factor"]
        net.set("load", kv_m3h=p["bench_load_kv_m3h"] * (1.0 if factor is None else max(0.0, float(factor))))
        res = net.solve()
        self.flow_a = max(0.0, res.flows_m3h[self.ids["prv_a"]])
        self.flow_b = max(0.0, res.flows_m3h[self.ids["prv_b"]])
        self.flow = self.flow_a + self.flow_b
        self.p_in = res.pressures_mca["inlet"]
        self.p_out = res.pressures_mca["outlet"]
        measured = self.inputs["critical_pressure_mca"]
        self.critical = res.pressures_mca["critical"] if measured is None else float(measured)
        point_pressure = self.inputs["control_point_pressure_mca"]
        self.control_point_pressure = None if point_pressure is None else float(point_pressure)
        self.power_kw = RHO_G * (self.flow / 3600) * max(0.0, self.p_in - self.p_out) / 1000
        self.energy_kwh += self.power_kw * dt / 3600
        self.volume_m3 += self.flow * dt / 3600
        self.critical_integral += self.critical * dt
        self.power_integral += self.power_kw * dt
        if abs(self.critical - self.critical_sp) <= self.critical_sp * BAND_FRACTION:
            self.in_band_s += dt
        self._alarms(dt)
        if self.state.current != "fault":
            self.state.set("running" if self.flow > 1e-6 else "idle")

    def _alarms(self, dt: float) -> None:
        sp = self.critical_sp
        self.low_s = self.low_s + dt if self.critical < sp * (1 - LOW_FRACTION) else 0.0
        self.high_s = self.high_s + dt if self.critical > sp * (1 + HIGH_FRACTION) else 0.0
        if self.alarm is None and self.low_s >= ALARM_S:
            self.alarm = "low"
            self.emit("critical_low", mca=round(self.critical, 2))
        elif self.alarm is None and self.high_s >= ALARM_S:
            self.alarm = "high"
            self.emit("critical_high", mca=round(self.critical, 2))
        elif self.alarm is not None and abs(self.critical - sp) <= sp * BAND_FRACTION:
            self.alarm = None
            self.emit("critical_normal")

    # ---- lectura ----
    def true_values(self) -> dict[str, Any]:
        return {
            "inlet_pressure_mca": self.p_in,
            "outlet_pressure_mca": self.p_out,
            "critical_pressure_mca": self.critical,
            "control_point_pressure_mca": self.control_point_pressure,
            "flow_m3h": self.flow,
            "flow_auto_m3h": self.flow_a,
            "flow_manual_m3h": self.flow_b,
            "auto_outlet_setpoint_mca": self.auto_setting,
            "auto_fixed_outlet_mca": self.auto_fixed_outlet_mca,
            "auto_fixed_mode": 1 if self.auto_control_mode == "fixed_outlet" else 0,
            "auto_control_mode": self.auto_control_mode,
            "critical_setpoint_mca": self.critical_sp,
            "manual_setting_mca": self.manual_setting,
            "branch_auto": 1 if self.branch == "auto" else 0,
            "dissipated_power_kw": self.power_kw,
            "dissipated_energy_kwh": self.energy_kwh,
            "volume_m3": self.volume_m3,
        }

    def kpis(self) -> dict[str, Any]:
        t = self.t
        return {
            "avg_critical_mca": self.critical_integral / t if t > 0 else 0.0,
            "time_in_band_pct": min(100.0, 100 * self.in_band_s / t) if t > 0 else 0.0,
            "avg_dissipated_kw": self.power_integral / t if t > 0 else 0.0,
        }

    def animation(self) -> dict[str, float]:
        kv = self.p["prv_kv_m3h"]
        controller_pressure = (
            self.control_point_pressure
            if self.auto_control_mode == "critical_point" and self.control_point_pressure is not None
            else self.critical
        )
        if self.failures.active:
            light = 3.0 if self.failures.is_active("diaphragm_failure") else 2.0
        else:
            light = 2.0 if self.alarm else 1.0
        return {
            "valve_a_open": self.open_a.value,
            "valve_b_open": self.open_b.value,
            "flow_a_norm": min(2.0, self.flow_a / kv),
            "flow_b_norm": min(2.0, self.flow_b / kv),
            "inlet_pressure_mca": max(0.0, self.p_in),
            "outlet_pressure_mca": max(0.0, self.p_out),
            "critical_pressure_mca": max(0.0, controller_pressure),
            "auto_setpoint_mca": self.auto_setting,
            "stack_light": light,
        }
