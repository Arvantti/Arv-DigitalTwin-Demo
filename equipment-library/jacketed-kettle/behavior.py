"""Comportamiento de una marmita con chaqueta de vapor (B3).

Ejecuta fases de batch tipo ISA-88 y resuelve el balance de masa, de energía (vapor por la
chaqueta, enfriamiento con agua, pérdidas y evaporación) y la composición de la mezcla.
"""

from __future__ import annotations

import math
from typing import Any

from twin_runtime import EquipmentBehavior, StepContext
from twin_runtime.primitives import PID, FirstOrderLag, saturation_temp_c, steam_latent_kj_kg

AMBIENT_C = 25.0
COOLING_WATER_C = 15.0
LOSS_W_M2K = 10.0
DENSITY_KG_L = 1.1
EVAP_COEF = 0.003  # kg/(s·m²) a 100 °C con tapa entreabierta

# Propiedades por kg de ingrediente: sólidos solubles, acidez (como ácido) e índice de espesante.
INGREDIENTS: dict[str, dict[str, float]] = {
    "agua": {"ss": 0.0, "acid": 0.0, "thick": 0.0},
    "pasta_tomate": {"ss": 0.30, "acid": 0.018, "thick": 0.30},
    "azucar": {"ss": 1.0, "acid": 0.0, "thick": 0.0},
    "sal": {"ss": 1.0, "acid": 0.0, "thick": 0.0},
    "vinagre": {"ss": 0.01, "acid": 0.05, "thick": 0.0},
    "almidon_modificado": {"ss": 0.0, "acid": 0.0, "thick": 4.0},
    "especias": {"ss": 0.5, "acid": 0.0, "thick": 0.5},
    "conservante": {"ss": 0.0, "acid": 0.0, "thick": 0.0},
}


def ingredient_props(name: str) -> dict[str, float]:
    """Propiedades de un ingrediente. 'pasta_tomate_28brix' toma 28 °Bx; desconocidos = agua."""
    base = name.split("_")[0] if name not in INGREDIENTS else name
    for key, props in INGREDIENTS.items():
        if name == key or name.startswith(key + "_") or base == key:
            props = dict(props)
            if key == "pasta_tomate" and "brix" in name:
                digits = "".join(ch for ch in name.split("_")[-1] if ch.isdigit())
                if digits:
                    props["ss"] = int(digits) / 100.0
            return props
    return dict(INGREDIENTS["agua"])


def kettle_dimensions(volume_l: float) -> tuple[float, float]:
    """(diámetro, altura cilíndrica) en m con H/D = 1,2. Compartido con la geometría."""
    v = volume_l / 1000.0
    d = (4.0 * v / (math.pi * 1.2)) ** (1.0 / 3.0)
    return d, 1.2 * d


class JacketedKettle(EquipmentBehavior):
    type = "jacketed-kettle"
    DEFAULT_INPUTS = {
        "steam_supply_bar": None,  # None = la presión de diseño del parámetro steam_bar
        "material_available": True,
        "downstream_free": True,
        "ingredient_temp_c": 20.0,
    }

    def setup(self) -> None:
        p = self.p
        self.diameter, self.height = kettle_dimensions(p["volume_l"])
        d, h = self.diameter, self.height
        self.bottom_area = math.pi * d * d / 4.0 * 1.1
        self.wall_jacket_h = h * p["jacket_coverage"]
        self.outer_area = math.pi * d * h + 2 * math.pi * d * d / 4.0
        self.surface_area = math.pi * d * d / 4.0
        self.capacity_kg = p["volume_l"] * DENSITY_KG_L

        self.components: dict[str, float] = {}  # kg por ingrediente
        self.temp = AMBIENT_C
        self.pid = PID(kp=0.08, ki=0.0008, out_min=0.0, out_max=1.0)
        self.steam_valve = 0.0
        self.cool_valve = 0.0
        self.jacket_bar = 0.0
        self.heat_kw = 0.0
        self.steam_kg_h = 0.0
        self.agitator_sp = 0.0
        self.agitator = FirstOrderLag(tau_s=4.0)
        self.agitator_kw_now = 0.0

        self.queue: list[dict[str, Any]] = []
        self.current: dict[str, Any] | None = None
        self.phase_elapsed = 0.0
        self.phase_progress_kg = 0.0
        self.setpoint: float | None = None

        self.batch_seq = 0
        self.batch_id = ""
        self.batch_started_t = 0.0
        self.batch_steam_kg = 0.0
        self.batch_count = 0
        self.batch_durations: list[float] = []
        self.steam_total = 0.0
        self.discharged = 0.0
        self.samples = 0
        self.samples_ok = 0
        self.deviation_flag = False
        self.cip_remaining = 0.0
        self.probe_offset = 0.0
        self.boiled_off = 0.0

    # ------------------------------------------------------------------ composición
    @property
    def mass(self) -> float:
        return sum(self.components.values())

    def _fraction(self, prop: str) -> float:
        m = self.mass
        if m <= 1e-9:
            return 0.0
        return sum(ingredient_props(k)[prop] * kg for k, kg in self.components.items()) / m

    @property
    def brix(self) -> float:
        return 100.0 * self._fraction("ss")

    @property
    def ph(self) -> float:
        a = 100.0 * self._fraction("acid")  # acidez en %
        if self.mass <= 1e-9:
            return 7.0
        acid_ph = max(2.8, 4.45 - 0.75 * a)
        return 7.0 - (7.0 - acid_ph) * (1.0 - math.exp(-a / 0.05))

    @property
    def bostwick(self) -> float:
        thick = 100.0 * self._fraction("thick")
        return max(2.0, min(24.0, 24.0 * math.exp(-thick / 9.0)))

    @property
    def cp(self) -> float:
        return 4.18 - 2.2 * self._fraction("ss")

    @property
    def boiling_point_c(self) -> float:
        """Ebullición a la presión local más la elevación por sólidos disueltos (≈ 0,04 °C por °Bx)."""
        return saturation_temp_c(0.0) + 0.04 * self.brix

    @property
    def level_pct(self) -> float:
        return min(100.0, 100.0 * self.mass / self.capacity_kg)

    # ------------------------------------------------------------------ comandos
    def on_command(self, name: str, args: dict[str, Any]) -> bool:
        if name == "run_phases":
            for ph in args["phases"]:
                if ph.get("kind") not in {"charge", "heat", "hold", "cool", "agitate", "sample", "discharge", "wait"}:
                    raise ValueError(f"fase desconocida: {ph!r}")
                self.queue.append(dict(ph))
        elif name == "abort":
            self.queue.clear()
            self.current = None
            self.setpoint = None
            if self.state.current in ("running", "starved", "blocked"):
                self.state.set("idle")
        elif name == "cip":
            if self.mass > self.p["heel_kg"] + 1:
                raise ValueError("CIP requiere la marmita vacía")
            minutes = float(args.get("duration_min", 35))
            self.components.clear()
            self.cip_remaining = minutes * 60.0
            self.state.set("cleaning")
            self.emit("cip_started", duration_min=minutes)
        elif name == "maintenance":
            self.state.set("maintenance" if args.get("active", True) else "idle")
        else:
            return False
        return True

    def on_fault(self, fault_id: str) -> None:
        if fault_id == "steam_valve_stuck":
            self._stuck_valve = self.steam_valve

    _stuck_valve: float | None = None

    def on_fault_cleared(self, fault_id: str) -> None:
        if fault_id == "steam_valve_stuck":
            self._stuck_valve = None
        if fault_id == "temperature_probe_drift":
            self.probe_offset = 0.0

    # ------------------------------------------------------------------ simulación
    def update(self, ctx: StepContext) -> None:
        dt = ctx.dt
        s = self.state.current
        if self.failures.is_active("temperature_probe_drift"):
            self.probe_offset += 3.0 * dt / 3600.0

        if s == "cleaning":
            self.cip_remaining -= dt
            self.steam_valve = self.cool_valve = 0.0
            self.agitator.step(0.0, dt)
            if self.cip_remaining <= 0:
                self.emit("cip_completed")
                self.state.set("idle")
            self._thermal(dt)
            return
        if s in ("fault", "maintenance"):
            self.steam_valve = self.cool_valve = 0.0
            self.agitator.step(0.0, dt)
            self.agitator_kw_now = 0.0
            self._thermal(dt)
            return

        if self.current is None and self.queue:
            self._start_phase(self.queue.pop(0))
        if self.current is None and s in ("running", "starved", "blocked"):
            self.state.set("idle")

        self.steam_valve = self.cool_valve = 0.0
        if self.current is not None:
            self._run_phase(dt)
        elif self.setpoint is not None:
            self._control_temperature(self.setpoint, dt)  # mantiene la última consigna entre fases

        if self._stuck_valve is not None:
            self.steam_valve = self._stuck_valve

        # Agitador: interlock por nivel bajo; la potencia sube con la consistencia.
        rpm_target = self.agitator_sp if self.level_pct > 8.0 else 0.0
        if self.failures.is_active("agitator_trip"):
            rpm_target = 0.0
        self.agitator.step(rpm_target, dt)
        ratio = self.agitator.value / self.p["agitator_max_rpm"]
        consistency = 0.25 + 0.75 * min(1.0, 100.0 * self._fraction("thick") / 15.0)
        self.agitator_kw_now = self.p["agitator_kw"] * ratio**2.2 * consistency * min(1.0, 0.2 + self.level_pct / 60.0)

        self._thermal(dt)
        self._check_deviation()

    def _start_phase(self, ph: dict[str, Any]) -> None:
        self.current = ph
        self.phase_elapsed = 0.0
        self.phase_progress_kg = 0.0
        kind = ph["kind"]
        if kind == "charge" and self.mass <= self.p["heel_kg"] + 1.0 and not self.batch_id_active:
            self.batch_seq += 1
            self.batch_id = f"{self.id.upper()}-B{self.batch_seq:04d}"
            self.batch_started_t = self.t
            self.batch_steam_kg = 0.0
            self.batch_id_active = True
            self.emit("batch_started", batch_id=self.batch_id)
        if kind in ("heat", "hold", "cool"):
            self.setpoint = float(ph["target_c"])
            self.deviation_flag = False
        self.state.set("running")
        self.emit("phase_started", phase=kind, batch_id=self.batch_id)

    batch_id_active = False

    def _finish_phase(self) -> None:
        assert self.current is not None
        kind = self.current["kind"]
        self.emit("phase_completed", phase=kind, batch_id=self.batch_id, duration_s=round(self.phase_elapsed, 1))
        if kind == "cool":
            self.setpoint = None
        self.current = None
        if self.queue:
            self._start_phase(self.queue.pop(0))
        else:
            self.state.set("idle")

    def _run_phase(self, dt: float) -> None:
        ph = self.current
        assert ph is not None
        kind = ph["kind"]
        self.phase_elapsed += dt
        if kind == "charge":
            if not self.inputs["material_available"]:
                self.state.set("starved")
                return
            self.state.set("running")
            rate = float(ph.get("rate_kg_min", 100.0)) / 60.0
            add = min(rate * dt, float(ph["kg"]) - self.phase_progress_kg, self.capacity_kg - self.mass)
            if add > 0:
                t_in = float(ph.get("temp_c", self.inputs["ingredient_temp_c"]))
                self.temp = (self.temp * self.mass * self.cp + t_in * add * 3.8) / (self.mass * self.cp + add * 3.8)
                name = ph["material"]
                self.components[name] = self.components.get(name, 0.0) + add
                self.phase_progress_kg += add
            if self.phase_progress_kg >= float(ph["kg"]) - 1e-6 or self.mass >= self.capacity_kg - 1e-6:
                self._finish_phase()
            elif self.setpoint is not None:
                self._control_temperature(self.setpoint, dt)
        elif kind == "agitate":
            self.agitator_sp = min(float(ph["rpm"]), self.p["agitator_max_rpm"])
            self._finish_phase()
        elif kind == "heat":
            target = float(ph["target_c"])
            self._control_temperature(target, dt)
            if self.temp >= target - 0.5:
                self._finish_phase()
        elif kind == "hold":
            self._control_temperature(float(ph["target_c"]), dt)
            if self.phase_elapsed >= float(ph["minutes"]) * 60.0:
                self._finish_phase()
        elif kind == "cool":
            target = float(ph["target_c"])
            self.cool_valve = 1.0 if self.temp > target else 0.0
            if self.temp <= target + 0.5:
                self._finish_phase()
        elif kind == "sample":
            if self.setpoint is not None:
                self._control_temperature(self.setpoint, dt)
            if self.phase_elapsed >= float(ph.get("minutes", 10)) * 60.0:
                self._report_sample(ph.get("spec", {}))
                self._finish_phase()
        elif kind == "wait":
            if self.setpoint is not None:
                self._control_temperature(self.setpoint, dt)
            if self.phase_elapsed >= float(ph["minutes"]) * 60.0:
                self._finish_phase()
        elif kind == "discharge":
            self.setpoint = None
            if not self.inputs["downstream_free"]:
                self.state.set("blocked")
                return
            self.state.set("running")
            rate = float(ph.get("rate_kg_min", 50.0)) / 60.0
            removable = max(0.0, self.mass - self.p["heel_kg"])
            out = min(rate * dt, removable)
            if out > 0:
                scale = (self.mass - out) / self.mass
                self.components = {k: v * scale for k, v in self.components.items()}
                self.discharged += out
                self.phase_progress_kg += out
            if self.mass <= self.p["heel_kg"] + 1e-6:
                self._complete_batch()
                self._finish_phase()

    def _control_temperature(self, target: float, dt: float) -> None:
        if self.temp > target + 2.0:
            self.steam_valve = 0.0
            self.pid.reset()
            return
        self.steam_valve = self.pid.step(target, self.temp, dt)

    def _report_sample(self, spec: dict[str, Any]) -> None:
        brix = self.brix + self.rng.gauss(0, 0.1)
        ph = self.ph + self.rng.gauss(0, 0.02)
        bost = self.bostwick + self.rng.gauss(0, 0.15)
        ok = True
        if "brix" in spec:
            ok &= spec["brix"][0] <= brix <= spec["brix"][1]
        if "ph_max" in spec:
            ok &= ph <= spec["ph_max"]
        if "bostwick_cm_30s" in spec:
            ok &= spec["bostwick_cm_30s"][0] <= bost <= spec["bostwick_cm_30s"][1]
        self.samples += 1
        self.samples_ok += int(ok)
        self.emit("sample_taken", batch_id=self.batch_id, brix=round(brix, 1), ph=round(ph, 2), bostwick_cm=round(bost, 1), in_spec=ok)

    def _complete_batch(self) -> None:
        duration_min = (self.t - self.batch_started_t) / 60.0
        self.batch_count += 1
        self.batch_durations.append(duration_min)
        self.emit(
            "batch_completed",
            batch_id=self.batch_id,
            kg=round(self.phase_progress_kg, 1),
            duration_min=round(duration_min, 1),
            steam_kg=round(self.batch_steam_kg, 1),
        )
        self.batch_id_active = False

    def _check_deviation(self) -> None:
        if not self.current or self.current["kind"] != "hold":
            return
        sp = float(self.current["target_c"])
        bad = abs(self.temp - sp) > 3.0
        if bad and not self.deviation_flag:
            self.emit("temperature_deviation", value=round(self.temp, 1), setpoint=sp)
        self.deviation_flag = bad

    def _thermal(self, dt: float) -> None:
        m = self.mass
        supply = self.inputs["steam_supply_bar"]
        supply_bar = float(self.p["steam_bar"] if supply is None else supply)
        level_h = (m / DENSITY_KG_L / 1000.0) / (math.pi * self.diameter**2 / 4.0)
        wetted = (self.bottom_area if m > 1.0 else 0.0) + math.pi * self.diameter * min(level_h, self.wall_jacket_h)
        u = self.p["u_w_m2k"] * (1.0 if self.p["scrapers"] else 0.6)

        q_kw = 0.0
        self.jacket_bar = 0.0
        self.steam_kg_h = 0.0
        if self.steam_valve > 0.01:
            self.jacket_bar = supply_bar * self.steam_valve
            t_steam = saturation_temp_c(self.jacket_bar)
            q_kw = max(0.0, u * wetted * (t_steam - self.temp) / 1000.0)
            self.steam_kg_h = q_kw / steam_latent_kj_kg(t_steam) * 3600.0
        elif self.cool_valve > 0.01:
            q_kw = u * 0.6 * wetted * (COOLING_WATER_C - self.temp) / 1000.0 * self.cool_valve
        self.heat_kw = q_kw
        steam_kg = self.steam_kg_h * dt / 3600.0
        self.steam_total += steam_kg
        self.batch_steam_kg += steam_kg

        loss_kw = LOSS_W_M2K * self.outer_area * (self.temp - AMBIENT_C) / 1000.0
        if m > 1.0:
            evap_kg_s = EVAP_COEF * self.surface_area * math.exp((self.temp - 100.0) / 15.0) if self.temp > 60 else 0.0
            evap_kg = min(evap_kg_s * dt, self.components.get("agua", 0.0) * 0.5)
            if evap_kg > 0:
                self.components["agua"] -= evap_kg
            evap_kw = evap_kg / dt * 2260.0
            self.temp += (q_kw - loss_kw - evap_kw + self.agitator_kw_now) * dt / (m * self.cp)
            # Recipiente abierto: no supera el punto de ebullición; el exceso de calor evapora agua.
            boiling = self.boiling_point_c
            if self.temp > boiling:
                boil_kg = min((self.temp - boiling) * self.mass * self.cp / 2260.0, self.components.get("agua", 0.0))
                if boil_kg > 0:
                    self.components["agua"] -= boil_kg
                    self.boiled_off += boil_kg
                self.temp = boiling
        else:
            self.temp += (AMBIENT_C - self.temp) * min(1.0, dt / 900.0)

    # ------------------------------------------------------------------ lectura
    def _phase_remaining_min(self) -> float | None:
        ph = self.current
        if not ph:
            return None
        kind = ph["kind"]
        if kind == "charge":
            return (float(ph["kg"]) - self.phase_progress_kg) / float(ph.get("rate_kg_min", 100.0))
        if kind in ("hold", "wait", "sample"):
            return max(0.0, float(ph.get("minutes", 10)) - self.phase_elapsed / 60.0)
        if kind == "heat" and self.heat_kw > 1.0:
            return max(0.0, (float(ph["target_c"]) - self.temp) * self.mass * self.cp / self.heat_kw / 60.0)
        if kind == "discharge":
            return max(0.0, self.mass - self.p["heel_kg"]) / float(ph.get("rate_kg_min", 50.0))
        return None

    @property
    def phase(self) -> str | None:
        return self.current["kind"] if self.current else None

    def true_values(self) -> dict[str, Any]:
        has_product = self.mass > 1.0
        return {
            "temperature_c": self.temp + self.probe_offset,
            "temperature_setpoint_c": self.setpoint,
            "level_pct": self.level_pct,
            "mass_kg": self.mass,
            "jacket_pressure_bar": self.jacket_bar,
            "steam_valve_pct": 100.0 * self.steam_valve,
            "steam_flow_kg_h": self.steam_kg_h,
            "heat_duty_kw": self.heat_kw,
            "agitator_rpm": self.agitator.value,
            "agitator_power_kw": self.agitator_kw_now,
            "brix": self.brix if has_product else None,
            "ph": self.ph if has_product else None,
            "bostwick_cm": self.bostwick if has_product else None,
            "batch_id": self.batch_id if self.batch_id_active else "",
            "phase_remaining_min": self._phase_remaining_min(),
            "batch_count": self.batch_count,
            "steam_total_kg": self.steam_total,
            "discharged_kg": self.discharged,
        }

    def kpis(self) -> dict[str, Any]:
        t_product = self.discharged / 1000.0
        return {
            "batches": self.batch_count,
            "avg_batch_min": sum(self.batch_durations) / len(self.batch_durations) if self.batch_durations else None,
            "steam_kg_per_t": self.steam_total / t_product if t_product > 0 else None,
            "first_pass_in_spec": self.samples_ok / self.samples if self.samples else None,
        }

    def animation(self) -> dict[str, float]:
        kind = self.phase
        light = {"running": 1.0, "idle": 1.0, "fault": 3.0}.get(self.state.current, 2.0)
        return {
            "level": self.level_pct / 100.0,
            "agitator_rpm": self.agitator.value,
            "steam": self.steam_valve,
            "cooling": self.cool_valve,
            "product_heat": max(0.0, min(1.0, (self.temp - 20.0) / 80.0)) if self.mass > 1.0 else 0.0,
            "charging": 1.0 if kind == "charge" and self.state.current == "running" else 0.0,
            "discharging": 1.0 if kind == "discharge" and self.state.current == "running" else 0.0,
            "alarm_light": light,
        }
