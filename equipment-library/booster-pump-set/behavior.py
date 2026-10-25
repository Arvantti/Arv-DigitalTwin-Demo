"""Grupo de bombeo en paralelo (B2): curvas de bomba sobre la red hidráulica, variador a presión constante,
escalonamiento de bombas, rotación de la líder, disparos y modo por niveles de tanque."""

from __future__ import annotations

from typing import Any

from twin_runtime import EquipmentBehavior, StepContext
from twin_runtime.primitives import PID, HydraulicNetwork, RateLimiter

RHO_G = 998.0 * 9.81  # N/m³
STAGE_UP_S = 15.0
STAGE_DOWN_S = 30.0
MIN_CHANGE_S = 60.0
LOW_PRESSURE_FRACTION = 0.10
NORMAL_FRACTION = 0.03
LOW_PRESSURE_S = 10.0
WORN_FACTOR = 0.9
RAMP_PER_S = 0.05  # rampa del variador: 5 % de velocidad por segundo


def add_pump_set(net: HydraulicNetwork, prefix: str, suction: str, discharge: str, p: dict[str, Any]) -> list[str]:
    """Agrega las bombas y sus antirretornos entre dos nodos de una red. Devuelve los ids de las bombas.

    El motor de planta usará esta misma función para armar el grupo dentro de la red completa."""
    pumps = []
    for i in range(1, p["pumps"] + 1):
        out = f"{prefix}pump{i}_out"
        net.add_node(out, net.nodes[discharge].elevation_m)
        net.add_pump(f"{prefix}pump{i}", suction, out, shutoff_head_m=p["shutoff_head_m"],
                     design_flow_m3h=p["design_flow_m3h"], design_head_m=p["design_head_m"], speed=0.0)
        net.add_check_valve(f"{prefix}check{i}", out, discharge, kv_m3h=5 * p["design_flow_m3h"])
        pumps.append(f"{prefix}pump{i}")
    return pumps


class BoosterPumpSet(EquipmentBehavior):
    type = "booster-pump-set"
    INITIAL_STATE = "off"
    OPERATING_STATES = frozenset({"running"})
    DEFAULT_INPUTS = {
        "suction_head_m": None, "system_kv_m3h": None, "source_level_pct": None, "target_level_pct": None,
        "source_level_1_pct": None, "source_level_2_pct": None,
    }

    def setup(self) -> None:
        p = self.p
        if p["duty_max"] > p["pumps"]:
            raise ValueError("duty_max no puede superar el número de bombas")
        self.net = HydraulicNetwork()
        self.net.add_fixed_head("suction", p["suction_head_m"], elevation_m=0.0)
        self.net.add_node("discharge", 0.0)
        self.net.add_fixed_head("outlet", p["bench_static_head_m"], elevation_m=0.0)
        self.pump_ids = add_pump_set(self.net, "", "suction", "discharge", p)
        self.net.add_valve("system", "discharge", "outlet", kv_m3h=p["bench_system_kv_m3h"])
        n = p["pumps"]
        self.running: list[int] = []  # índices 0..n-1 en orden de arranque
        self.tripped = [False] * n
        self.lead = n - 1  # el primer arranque rota a la bomba 1
        self.setpoint = p["setpoint_mca"]
        self.pid = PID(kp=0.002, ki=0.004, out_min=p["min_speed_pct"] / 100, out_max=1.0)
        self.ramp = RateLimiter(RAMP_PER_S, 0.0)
        self.speed = 0.0
        self.up_s = 0.0
        self.down_s = 0.0
        self.since_change = MIN_CHANGE_S
        self.discharge = 0.0
        self.suction = p["suction_head_m"]
        self.flow = 0.0
        self.pump_flows = [0.0] * n
        self.pump_heads = [0.0] * n
        self.power_kw = 0.0
        self.energy_kwh = 0.0
        self.volume_m3 = 0.0
        self.starts = 0
        self.low_s = 0.0
        self.low_alarm = False
        self.min_discharge: float | None = None
        self.level_on = False
        if p["start_on"]:
            self.state.set("idle")

    def hydraulic_build(self, net: HydraulicNetwork, prefix: str, elevation_m: float) -> None:
        """En la planta: las bombas entre los nodos de succión y descarga (los de los puertos), a la cota del equipo."""
        net.add_node(prefix + "suction", elevation_m)
        net.add_node(prefix + "discharge", elevation_m)
        add_pump_set(net, prefix, prefix + "suction", prefix + "discharge", self.p)

    # ---- comandos y fallas ----
    def on_command(self, name: str, args: dict[str, Any]) -> bool:
        if name == "start":
            if self.state.current == "off":
                self.state.set("idle")
        elif name == "stop":
            if self.state.current != "fault":
                self._stop_all("stop")
                self.state.set("off")
        elif name == "set_setpoint":
            self.setpoint = float(args["mca"])
        else:
            return False
        return True

    def on_fault(self, fault_id: str) -> None:
        if fault_id == "pump_trip":
            victim = self.running[0] if self.running else self.lead
            self.tripped[victim] = True
            if victim in self.running:
                self.running.remove(victim)
                self.emit("pump_stopped", pump=victim + 1, running=len(self.running), reason="trip")
            self.emit("pump_tripped", pump=victim + 1)
            if self.state.current == "running" and len(self.running) < self.p["duty_max"]:
                self._start_next()  # la reserva entra de inmediato
            if self.running and self.p["control"] == "pressure":
                self._feed_forward()
        elif fault_id == "vfd_fault":
            self._stop_all("vfd_fault")
        elif fault_id == "worn_impeller":
            self._set_curve(WORN_FACTOR)

    def on_fault_cleared(self, fault_id: str) -> None:
        if fault_id == "pump_trip":
            self.tripped = [False] * self.p["pumps"]
        elif fault_id == "worn_impeller":
            self._set_curve(1.0)

    def _feed_forward(self) -> None:
        """Al perder una bomba, las que siguen saltan (con la rampa del variador) a la velocidad que da la misma
        altura con todo el caudal, sin esperar a que el PID vea caer la presión: s² = (H + r·q²) / H0 por bomba.
        Es un supuesto del control (el PLC de las bombas reales es cerrado, D29)."""
        p = self.p
        head = max(self.pump_heads) if any(self.pump_heads) else p["design_head_m"]
        q = self.flow / len(self.running)
        shutoff = p["shutoff_head_m"] * (WORN_FACTOR if self.failures.is_active("worn_impeller") else 1.0)
        r = (p["shutoff_head_m"] - p["design_head_m"]) / p["design_flow_m3h"] ** 2
        s = min(1.0, max(p["min_speed_pct"] / 100, ((head + r * q * q) / shutoff) ** 0.5))
        if s > self.pid.output:
            self.pid.integral = self.pid.output = s

    def _set_curve(self, factor: float) -> None:
        for pid in self.pump_ids:
            self.net.set(pid, shutoff_head_m=self.p["shutoff_head_m"] * factor)

    # ---- bombas ----
    def _available(self) -> list[int]:
        return [i for i in range(self.p["pumps"]) if not self.tripped[i] and i not in self.running]

    def _start_next(self) -> bool:
        free = self._available()
        if not free:
            return False
        n = self.p["pumps"]
        if not self.running:  # arranque desde cero: rota la líder
            order = [(self.lead + k) % n for k in range(1, n + 1)]
        else:
            order = [(self.running[-1] + k) % n for k in range(1, n + 1)]
        pick = next(i for i in order if i in free)
        if not self.running:
            self.lead = pick
            self.ramp.value = 0.0
            self.pid.reset()
        self.running.append(pick)
        self.starts += 1
        self.since_change = 0.0
        self.emit("pump_started", pump=pick + 1, running=len(self.running))
        return True

    def _stop_last(self, reason: str) -> None:
        i = self.running.pop()
        self.since_change = 0.0
        self.emit("pump_stopped", pump=i + 1, running=len(self.running), reason=reason)

    def _stop_all(self, reason: str) -> None:
        while self.running:
            self._stop_last(reason)

    # ---- paso ----
    def update(self, ctx: StepContext) -> None:
        p = self.p
        dt = ctx.dt
        self.since_change += dt
        s = self.state.current
        auto = s in ("idle", "running")
        if not auto:
            self.running = []
        elif p["control"] == "pressure":
            self._pressure_control(dt)
        else:
            self._level_control()
        if self.running:
            target = 1.0 if p["control"] == "level" else self.pid.output
            self.speed = self.ramp.step(target, dt)
        else:
            self.ramp.value = self.speed = 0.0
        if auto:
            self.state.set("running" if self.running else "idle")
        self._solve()
        if p["control"] == "pressure" and self.running:
            self.pid.step(self.setpoint, self.discharge, dt)
        self._account(dt)

    def _pressure_control(self, dt: float) -> None:
        p = self.p
        if not self.running:
            self._start_next()
            return
        if len(self.running) < min(p["min_running"], p["duty_max"]) and self._start_next():
            return  # las bombas que trabajan siempre arrancan de una vez
        # entra otra bomba si el variador queda sin margen, aunque la presión todavía se sostenga
        if len(self.running) < p["duty_max"] and self._available() and self.speed * 100 >= p["stage_up_speed_pct"]:
            self.up_s += dt
        else:
            self.up_s = 0.0
        if len(self.running) < p["duty_max"] and self.since_change >= MIN_CHANGE_S and self.up_s >= STAGE_UP_S:
            self._start_next()
            self.up_s = 0.0
        n = len(self.running)
        limit = (n - 1) * p["design_flow_m3h"] * p["stage_down_flow_pct"] / 100
        self.down_s = self.down_s + dt if n > max(1, p["min_running"]) and self.flow < limit else 0.0
        if self.since_change >= MIN_CHANGE_S and self.down_s >= STAGE_DOWN_S:
            self._stop_last("low_demand")
            self.down_s = 0.0

    def _level_control(self) -> None:
        p = self.p
        src = self.inputs["source_level_pct"]
        dst = self.inputs["target_level_pct"]
        full = dst is not None and dst >= p["target_full_pct"]
        individual = (self.inputs["source_level_1_pct"], self.inputs["source_level_2_pct"])
        high_return = p["return_high_start_pct"] < 100 and any(
            level is not None and level + 1e-8 >= p["return_high_start_pct"] for level in individual
        )
        needs_supply = p["supply_start_pct"] > 0 and dst is not None and dst <= p["supply_start_pct"] + 1e-8
        source_safe = src is None or src >= p["stop_level_pct"]
        if self.level_on:
            if not source_safe or full:
                self.level_on = False
        elif source_safe and not full:
            legacy_start = p["supply_start_pct"] == 0 and (src is None or src >= p["start_level_pct"])
            if needs_supply or high_return or legacy_start:
                self.level_on = True
        want = min(p["duty_max"], p["pumps"]) if self.level_on else 0
        while len(self.running) > want:
            self._stop_last("level")
        while len(self.running) < want and self._start_next():
            pass

    def _solve(self) -> None:
        p = self.p
        suction = self.inputs["suction_head_m"]
        self.net.set_head("suction", p["suction_head_m"] if suction is None else float(suction))
        kv = self.inputs["system_kv_m3h"]
        self.net.set("system", kv_m3h=p["bench_system_kv_m3h"] if kv is None else max(0.0, float(kv)))
        for i, pid in enumerate(self.pump_ids):
            self.net.set(pid, speed=self.speed if i in self.running else 0.0)
        res = self.net.solve()
        self.discharge = res.pressures_mca["discharge"]
        self.suction = res.pressures_mca["suction"]
        hs = res.heads_m["suction"]
        for i, pid in enumerate(self.pump_ids):
            q = res.flows_m3h[pid]
            self.pump_flows[i] = q
            self.pump_heads[i] = res.heads_m[f"pump{i + 1}_out"] - hs if q > 0 else 0.0
        self.flow = sum(self.pump_flows)

    def _account(self, dt: float) -> None:
        p = self.p
        hydraulic_w = sum(RHO_G * q / 3600 * h for q, h in zip(self.pump_flows, self.pump_heads, strict=True))
        self.power_kw = hydraulic_w / 1000 / p["efficiency"]
        self.energy_kwh += self.power_kw * dt / 3600
        self.volume_m3 += self.flow * dt / 3600
        if p["control"] != "pressure" or self.state.current not in ("running", "idle"):
            return
        if self.t >= 60:
            self.min_discharge = self.discharge if self.min_discharge is None else min(self.min_discharge, self.discharge)
        low = self.discharge < self.setpoint * (1 - LOW_PRESSURE_FRACTION)
        self.low_s = self.low_s + dt if low else 0.0
        if not self.low_alarm and self.low_s >= LOW_PRESSURE_S and self.t >= 60:
            self.low_alarm = True
            self.emit("low_pressure", mca=round(self.discharge, 2))
        elif self.low_alarm and abs(self.discharge - self.setpoint) <= self.setpoint * NORMAL_FRACTION:
            self.low_alarm = False
            self.emit("pressure_normal")

    # ---- lectura ----
    def true_values(self) -> dict[str, Any]:
        running_heads = [self.pump_heads[i] for i in self.running if self.pump_flows[i] > 0]
        return {
            "discharge_pressure_mca": self.discharge,
            "suction_pressure_mca": self.suction,
            "flow_m3h": self.flow,
            "setpoint_mca": self.setpoint,
            "speed_pct": self.speed * 100 if self.running else 0.0,
            "pumps_running": len(self.running),
            "pumps_available": self.p["pumps"] - sum(self.tripped),
            "lead_pump": self.running[0] + 1 if self.running else 0,
            "pump_head_m": max(running_heads) if running_heads else 0.0,
            "power_kw": self.power_kw,
            "energy_kwh": self.energy_kwh,
            "volume_m3": self.volume_m3,
            "specific_energy_kwh_m3": self.power_kw / self.flow if self.flow > 1e-6 else 0.0,
            "automatic_enabled": 1.0 if self.state.current in ("idle", "running") else 0.0,
            "level_auto_active": 1.0 if self.level_on else 0.0,
            "source_level_pct": self.inputs["source_level_pct"],
            "target_level_pct": self.inputs["target_level_pct"],
            "start_level_pct": self.p["start_level_pct"],
            "stop_level_pct": self.p["stop_level_pct"],
            "target_full_pct": self.p["target_full_pct"],
        }

    def kpis(self) -> dict[str, Any]:
        hours = self.t / 3600
        return {
            "avg_power_kw": self.energy_kwh / hours if hours > 0 else 0.0,
            "specific_energy_kwh_m3": self.energy_kwh / self.volume_m3 if self.volume_m3 > 0 else 0.0,
            "min_discharge_mca": self.min_discharge if self.min_discharge is not None else self.discharge,
            "pump_starts": self.starts,
        }

    def animation(self) -> dict[str, float]:
        p = self.p
        out = {}
        for i in range(6):
            if i >= p["pumps"]:
                v = 0.0
            elif self.tripped[i]:
                v = -1.0
            else:
                v = self.speed if i in self.running else 0.0
            out[f"pump_{i + 1}"] = v
        duty = max(1, len(self.running)) * p["design_flow_m3h"]
        s = self.state.current
        light = {"running": 2.0 if (self.low_alarm or any(self.tripped)) else 1.0, "idle": 1.0, "fault": 3.0}.get(s, 0.0)
        out.update({"flow_norm": min(2.0, self.flow / duty), "discharge_pressure_mca": max(0.0, self.discharge),
                    "stack_light": light})
        return out
