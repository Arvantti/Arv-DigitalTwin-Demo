"""Comportamiento de una inyectora horizontal (B3).

Modela el ciclo por fases, la térmica del cilindro, del molde y del aceite, la presión de
inyección, el colchón, la energía por fase y la calidad de cada inyección en función de
las condiciones del proceso.
"""

from __future__ import annotations

import math
from typing import Any

from twin_runtime import EquipmentBehavior, StepContext
from twin_runtime.primitives import FirstOrderLag, OEEAccumulator, PhaseSequencer

# Propiedades por resina: consigna del cilindro (°C), presión pico base (bar),
# sensibilidad a la humedad (0..1), humedad máxima admisible (%).
MATERIALS: dict[str, dict[str, float]] = {
    "PP": {"barrel_c": 220, "peak_bar": 900, "moisture_sens": 0.05, "moisture_max": 0.20},
    "HDPE": {"barrel_c": 230, "peak_bar": 1000, "moisture_sens": 0.05, "moisture_max": 0.20},
    "PS": {"barrel_c": 210, "peak_bar": 950, "moisture_sens": 0.40, "moisture_max": 0.10},
    "ABS": {"barrel_c": 235, "peak_bar": 1200, "moisture_sens": 1.00, "moisture_max": 0.10},
}

PHASE_FRACTIONS: list[tuple[str, float]] = [
    ("mold_close", 0.10),
    ("injection", 0.08),
    ("holding", 0.12),
    ("cooling", 0.50),
    ("mold_open", 0.10),
    ("ejection", 0.10),
]

# Fracción de la potencia del motor/bomba usada en cada fase.
PHASE_MOTOR_LOAD = {
    "mold_close": 0.5,
    "injection": 1.0,
    "holding": 0.6,
    "cooling": 0.35,
    "mold_open": 0.4,
    "ejection": 0.3,
}

DOSING_FRACTION_OF_COOLING = 0.7
AMBIENT_C = 25.0


class InjectionMoldingMachine(EquipmentBehavior):
    type = "injection-molding-machine"
    DEFAULT_INPUTS = {
        "material_available": True,
        "downstream_free": True,
        "cooling_water_ok": True,
        "resin_moisture_pct": 0.02,
    }

    # ------------------------------------------------------------------ inicialización
    def setup(self) -> None:
        p = self.p
        base_material = p["material"].split()[0]
        self.mat = MATERIALS[base_material]
        self.recycled = "reciclado" in p["material"]

        clamp = p["clamp_t"]
        self.motor_kw = 0.12 * clamp + 10.0
        self.heater_kw = 0.05 * clamp + 5.0
        runner = 1.10 if p["part_g"] < 200 else 1.03  # colada fría en piezas pequeñas
        self.shot_kg = p["cavities"] * p["part_g"] / 1000.0 * runner
        self.shot_ratio = min(1.2, self.shot_kg / p["max_shot_kg"])
        self.nominal_cushion = 3.0 if clamp < 200 else 5.0 + min(10.0, clamp / 300.0)

        start_hot = p["start_hot"]
        sp = self.barrel_setpoint
        self.barrel = FirstOrderLag(tau_s=600.0 + 0.5 * clamp, initial=sp if start_hot else AMBIENT_C)
        self.mold = FirstOrderLag(tau_s=300.0, initial=p["mold_temp_c"] if start_hot else AMBIENT_C)
        self.oil = FirstOrderLag(tau_s=1200.0, initial=42.0 if start_hot else AMBIENT_C)

        self.seq: PhaseSequencer | None = None
        self.cycle_started_at = 0.0
        self.stop_requested = False
        self.setup_remaining_s = 0.0

        self.cycle_count = 0
        self.parts_good = 0
        self.parts_rejected = 0
        self.scrap_kg = 0.0
        self.resin_kg = 0.0
        self.energy_kwh = 0.0
        self.power_kw = 0.0
        self.pressure_bar = 0.0
        self.peak_bar = 0.0
        self.cushion_mm = self.nominal_cushion
        self.last_cycle_s: float | None = None
        self.last_defect = ""
        self.screw_wear = 0.0
        self.alarms: set[str] = set()
        self.oee = OEEAccumulator(ideal_cycle_s=p["cycle_s"], units_per_cycle=p["cavities"])

        if not start_hot:
            self.state.set("off")

    @property
    def barrel_setpoint(self) -> float:
        return self.mat["barrel_c"] + (5.0 if self.recycled else 0.0)

    @property
    def phase(self) -> str | None:
        return self.seq.phase if self.seq and self.seq.running else None

    # ------------------------------------------------------------------ comandos
    def on_command(self, name: str, args: dict[str, Any]) -> bool:
        s = self.state.current
        if name == "power_on":
            if s == "off":
                ready = abs(self.barrel.value - self.barrel_setpoint) < 3.0
                self.state.set("idle" if ready else "starting")
        elif name == "power_off":
            self._abort_cycle()
            self.state.set("off")
        elif name == "start":
            self.stop_requested = False
            if s == "off":
                self.on_command("power_on", {})
                s = self.state.current
            if s in ("idle", "blocked", "starved"):
                self.state.set("running")
            elif s == "starting":
                self._auto_start = True
        elif name == "stop":
            self.stop_requested = True
            self._auto_start = False
            if s in ("blocked", "starved"):
                self._abort_cycle()
                self.state.set("idle")
        elif name == "mold_change":
            minutes = float(args.get("duration_min", 45))
            self._abort_cycle()
            self.setup_remaining_s = minutes * 60.0
            self.state.set("setup")
            self.emit("mold_change_started", duration_min=minutes)
        elif name == "maintenance":
            self._abort_cycle()
            self.state.set("maintenance" if args.get("active", True) else "idle")
        else:
            return False
        return True

    _auto_start = False

    def on_fault(self, fault_id: str) -> None:
        if self.failures.active[fault_id].stops_equipment:
            self._abort_cycle()

    def on_fault_cleared(self, fault_id: str) -> None:
        if fault_id == "check_ring_wear":
            self.screw_wear = max(0.0, self.screw_wear - 30.0)  # se cambió la válvula

    def _abort_cycle(self) -> None:
        if self.seq and self.seq.running:
            self.seq.stop()
        self.seq = None

    # ------------------------------------------------------------------ simulación
    def update(self, ctx: StepContext) -> None:
        dt = ctx.dt
        s = self.state.current
        heaters_on = s not in ("off", "maintenance")
        cooling_ok = bool(self.inputs["cooling_water_ok"]) and not self.failures.is_active("thermolator_fault")

        # Térmica del cilindro: una resistencia dañada baja la temperatura alcanzable.
        sp = self.barrel_setpoint
        barrel_target = sp if heaters_on else AMBIENT_C
        if heaters_on and self.failures.is_active("heater_band_failure"):
            barrel_target -= 18.0
        self.barrel.step(barrel_target, dt)

        # Molde: sin agua de enfriamiento o con el termorregulador en falla, se calienta.
        mold_target = self.p["mold_temp_c"] if heaters_on else AMBIENT_C
        if heaters_on and not cooling_ok:
            mold_target += 25.0 if s == "running" else 10.0
        self.mold.step(mold_target, dt)

        oil_target = AMBIENT_C if s == "off" else (45.0 if s == "running" else 38.0)
        if self.failures.is_active("hydraulic_overtemp"):
            oil_target = 62.0
        if not self.inputs["cooling_water_ok"]:
            oil_target += 8.0
        self.oil.step(oil_target, dt)

        motor_load = 0.0
        if s == "starting":
            if abs(self.barrel.value - sp) < 3.0:
                self.emit("heat_up_completed")
                self.state.set("running" if self._auto_start else "idle")
                self._auto_start = False
        elif s == "setup":
            self.setup_remaining_s -= dt
            if self.setup_remaining_s <= 0:
                self.emit("mold_change_completed")
                self.state.set("idle")
        elif s in ("running", "blocked", "starved"):
            motor_load = self._run_cycle(dt)

        if s in ("running", "idle", "blocked", "starved"):
            motor_load = max(motor_load, 0.08)  # bomba en recirculación
        heater_duty = 0.0
        if heaters_on:
            heater_duty = max(0.2, min(1.0, 0.25 + (sp - self.barrel.value) / 30.0))
        self.power_kw = (0.3 if s != "off" else 0.05) + self.motor_kw * motor_load + self.heater_kw * heater_duty
        self.energy_kwh += self.power_kw * dt / 3600.0
        if s == "running":
            self.screw_wear = min(100.0, self.screw_wear + 100.0 * dt / (3600.0 * 20000.0))

        self._check_alarms()
        self.oee.tick(self.state.current, dt)

    def _cycle_phases(self) -> list[tuple[str, float]]:
        cycle = self.p["cycle_s"]
        phases = [(name, cycle * frac) for name, frac in PHASE_FRACTIONS]
        # Molde caliente => más enfriamiento; cilindro frío => inyección más lenta.
        mold_excess = max(0.0, self.mold.value - self.p["mold_temp_c"] - 3.0)
        cold = max(0.0, self.barrel_setpoint - self.barrel.value - 5.0)
        out = []
        for name, d in phases:
            if name == "cooling":
                d *= 1.0 + 0.012 * mold_excess
            if name == "injection":
                d *= 1.0 + 0.01 * cold
            out.append((name, d * self.rng.uniform(0.985, 1.015)))
        return out

    def _run_cycle(self, dt: float) -> float:
        """Avanza el ciclo dt segundos. Si un ciclo termina dentro del paso, el siguiente
        arranca en el mismo paso con el tiempo sobrante (el ritmo no depende de dt)."""
        remaining = dt
        load = 0.0
        while remaining > 1e-9:
            if self.seq is None or not self.seq.running:
                if not self._can_start_cycle():
                    return load
                self.seq = PhaseSequencer(self._cycle_phases())
                self.seq.start()
                self.cycle_started_at = self.t + (dt - remaining)
            phase_before = self.seq.phase
            consumed_from = remaining
            for finished in self.seq.step(remaining):
                self._on_phase_end(finished, at=self.t + dt - self.seq.leftover)
            remaining = self.seq.leftover if not self.seq.running else 0.0
            phase = self.seq.phase or phase_before or "ejection"
            self.pressure_bar = self._instant_pressure(phase)
            if consumed_from > remaining:
                load = PHASE_MOTOR_LOAD.get(phase, 0.3)
        return load

    def _can_start_cycle(self) -> bool:
        """Decide entre ciclos si puede arrancar el siguiente y ajusta el estado."""
        if self.stop_requested:
            self.stop_requested = False
            self.state.set("idle")
            return False
        if not self.inputs["material_available"]:
            self.state.set("starved")
            return False
        if not self.inputs["downstream_free"]:
            self.state.set("blocked")
            return False
        if self.state.current != "running":
            self.state.set("running")
        return True

    def _instant_pressure(self, phase: str) -> float:
        if not self.seq or not self.seq.running:
            return 0.0
        prog = self.seq.phase_progress
        if phase == "injection":
            return self._nominal_peak() * (0.35 + 0.65 * math.sin(prog * math.pi / 2))
        if phase == "holding":
            return self._nominal_peak() * 0.55
        if phase == "cooling":
            return 120.0 if prog < DOSING_FRACTION_OF_COOLING else 0.0  # contrapresión de dosificación
        return 0.0

    def _nominal_peak(self) -> float:
        cold = max(0.0, self.barrel_setpoint - self.barrel.value)
        return self.mat["peak_bar"] * (0.8 + 0.4 * min(1.0, self.shot_ratio)) + 8.0 * cold

    def _on_phase_end(self, phase: str, at: float) -> None:
        if phase == "injection":
            self.peak_bar = self._nominal_peak() * self.rng.gauss(1.0, 0.01)
        elif phase == "holding":
            wear_loss = 0.03 * self.screw_wear
            sd = 0.15
            if self.failures.is_active("check_ring_wear"):
                wear_loss += 2.5
                sd = 1.0
            self.cushion_mm = max(0.0, self.rng.gauss(self.nominal_cushion - wear_loss, sd))
        elif phase == "ejection":
            self._complete_cycle(at)

    def _defect_probability(self) -> tuple[float, str]:
        contributions: dict[str, float] = {}
        dev = self.barrel.value - self.barrel_setpoint
        if dev < -5:
            contributions["short_shot"] = 0.012 * (-dev - 5)
        elif dev > 8:
            contributions["flash"] = 0.008 * (dev - 8)
        mold_dev = self.mold.value - self.p["mold_temp_c"]
        if mold_dev > 5:
            contributions["sink_marks"] = 0.006 * (mold_dev - 5)
            contributions["warp"] = 0.004 * (mold_dev - 5)
        if self.cushion_mm < 2.0:
            contributions["short_shot"] = contributions.get("short_shot", 0.0) + 0.06 * (2.0 - self.cushion_mm)
        moisture = float(self.inputs["resin_moisture_pct"])
        if moisture > self.mat["moisture_max"]:
            excess = moisture / self.mat["moisture_max"] - 1.0
            contributions["splay"] = 0.15 * self.mat["moisture_sens"] * excess
        p = self.p["scrap_base"] + (0.004 if self.recycled else 0.0) + sum(contributions.values())
        defect = max(contributions, key=contributions.get) if contributions else self.rng.choice(
            ["short_shot", "flash", "sink_marks", "warp"]
        )
        return min(0.9, max(0.0, p)), defect

    def _complete_cycle(self, at: float) -> None:
        self.cycle_count += 1
        duration = at - self.cycle_started_at
        self.last_cycle_s = duration
        p_defect, defect = self._defect_probability()
        cavities = self.p["cavities"]
        rejected = sum(1 for _ in range(cavities) if self.rng.random() < p_defect)
        good = cavities - rejected
        self.parts_good += good
        self.parts_rejected += rejected
        part_kg = self.p["part_g"] / 1000.0
        runner_kg = self.shot_kg - cavities * part_kg
        self.scrap_kg += rejected * part_kg + runner_kg
        self.resin_kg += self.shot_kg
        self.oee.count(good, rejected)
        if rejected:
            self.last_defect = defect
            self.emit("part_rejected", count=rejected, defect=defect)
        self.emit(
            "cycle_completed",
            cycle=self.cycle_count,
            duration_s=round(duration, 2),
            good=good,
            rejected=rejected,
            peak_pressure=round(self.peak_bar),
            cushion_mm=round(self.cushion_mm, 2),
        )

    def _check_alarms(self) -> None:
        checks = {
            "barrel_temp_avg": (abs(self.barrel.value - self.barrel_setpoint) > 8.0, self.barrel.value, "±8 °C"),
            "mold_temp": (self.mold.value - self.p["mold_temp_c"] > 8.0, self.mold.value, "+8 °C"),
            "cushion_mm": (self.cycle_count > 0 and self.cushion_mm < 1.5, self.cushion_mm, "1,5 mm"),
            "hydraulic_oil_temp": (self.oil.value > 55.0, self.oil.value, "55 °C"),
        }
        if self.state.current not in ("running", "blocked", "starved"):
            return
        for var, (bad, value, limit) in checks.items():
            if bad and var not in self.alarms:
                self.alarms.add(var)
                self.emit("quality_alarm", variable=var, value=round(value, 2), limit=limit)
            elif not bad:
                self.alarms.discard(var)

    # ------------------------------------------------------------------ lectura
    def true_values(self) -> dict[str, Any]:
        running = self.state.current == "running" and self.seq is not None and self.seq.running
        melt = self.barrel.value + (6.0 if running else 0.0)
        return {
            "barrel_temp_avg": self.barrel.value,
            "barrel_temp_setpoint": self.barrel_setpoint,
            "melt_temp": melt,
            "mold_temp": self.mold.value,
            "injection_pressure": self.pressure_bar if running else 0.0,
            "peak_pressure": self.peak_bar,
            "cushion_mm": self.cushion_mm,
            "hydraulic_oil_temp": self.oil.value,
            "power_kw": self.power_kw,
            "energy_kwh": self.energy_kwh,
            "last_cycle_s": self.last_cycle_s,
            "cycle_count": self.cycle_count,
            "parts_good": self.parts_good,
            "parts_rejected": self.parts_rejected,
            "scrap_kg": self.scrap_kg,
            "resin_consumed_kg": self.resin_kg,
            "screw_wear_pct": self.screw_wear,
            "last_defect": self.last_defect,
        }

    def kpis(self) -> dict[str, Any]:
        oee = self.oee.values()
        total = self.parts_good + self.parts_rejected
        good_kg = self.parts_good * self.p["part_g"] / 1000.0
        hours = self.t / 3600.0
        return {
            **oee,
            "scrap_rate": self.parts_rejected / total if total else None,
            "kwh_per_kg": self.energy_kwh / good_kg if good_kg else None,
            "parts_per_hour": total / hours if hours > 0 else None,
        }

    def animation(self) -> dict[str, float]:
        s = self.state.current
        phase = self.phase
        prog = self.seq.phase_progress if phase else 0.0
        mold_open, ejector, screw_pos, rpm, robot, part = 1.0, 0.0, 1.0, 0.0, 0.0, 0.0
        if phase == "mold_close":
            mold_open, robot = 1.0 - prog, 1.0 - prog
        elif phase == "injection":
            mold_open, screw_pos = 0.0, 1.0 - 0.92 * prog
            part = prog
        elif phase == "holding":
            mold_open, screw_pos, part = 0.0, 0.08, 1.0
        elif phase == "cooling":
            mold_open, part = 0.0, 1.0
            dosing = min(1.0, prog / DOSING_FRACTION_OF_COOLING)
            screw_pos = 0.08 + 0.92 * dosing
            rpm = (140.0 if self.p["clamp_t"] < 500 else 80.0) if dosing < 1.0 else 0.0
        elif phase == "mold_open":
            mold_open, part, robot = prog, 1.0, 0.45 * prog
        elif phase == "ejection":
            ejector = math.sin(prog * math.pi)
            robot = 0.45 + 0.55 * prog
            part = 1.0 if prog < 0.4 else 0.0
        if self.p["robot"] == "none":
            robot = 0.0
        light = {"off": 0.0, "running": 1.0, "fault": 3.0}.get(s, 2.0)
        span = max(1.0, self.barrel_setpoint - AMBIENT_C)
        return {
            "mold_open": mold_open,
            "ejector": ejector,
            "screw_position": screw_pos,
            "screw_rpm": rpm,
            "robot_progress": robot,
            "part_in_mold": part,
            "stack_light": light,
            "heat_glow": max(0.0, min(1.0, (self.barrel.value - AMBIENT_C) / span)),
        }
