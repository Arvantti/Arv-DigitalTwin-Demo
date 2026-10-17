"""Comportamiento de una sachetadora vertical (B3).

Cada ciclo forma, llena, sella y corta tantos sachets como pistas tenga. El peso de cada
sachet sale de la exactitud del dosificador; los rechazos dependen de la temperatura de las
mordazas, de la codificadora y, en llenado en caliente, de la temperatura del producto.
"""

from __future__ import annotations

from collections import deque
from typing import Any

from twin_runtime import EquipmentBehavior, StepContext
from twin_runtime.primitives import FirstOrderLag, OEEAccumulator, PhaseSequencer, mean_sd

CYCLE_SPLIT = [("pull_film", 0.35), ("dose", 0.35), ("seal_cut", 0.30)]
BASE_SEAL_FAIL = 0.002
CODE_FAIL = 0.0005  # código borroso o incompleto
MIN_AIR_BAR = 6.0


class VffsSachetFiller(EquipmentBehavior):
    type = "vffs-sachet-filler"
    DEFAULT_INPUTS = {
        "product_available": True,
        "product_temp_c": None,  # None = típica del producto (caliente o ambiente)
        "downstream_free": True,
        "air_pressure_bar": 7.0,
    }

    def setup(self) -> None:
        p = self.p
        self.jaw = FirstOrderLag(tau_s=90.0, initial=p["seal_setpoint_c"])
        self.seq: PhaseSequencer | None = None
        self.stop_requested = False
        self.setup_remaining = 0.0
        self.pending_format: float | None = None
        self.units_good = 0
        self.units_rejected = 0
        self.rejects = {"seal": 0, "code": 0, "temperature": 0}
        self.roll_left = p["roll_units"]
        self.rolls_used = 1
        self.weights: deque[float] = deque(maxlen=50)
        self.last_weight = 0.0
        self.giveaway_sum = 0.0
        self.weight_count = 0
        self.product_kg = 0.0
        self.recent: deque[tuple[float, int]] = deque()  # (t, unidades) para la velocidad del último minuto
        self.alarms: set[str] = set()
        self.drop = 0.0
        self.oee = OEEAccumulator(ideal_cycle_s=60.0 / p["cycles_min"], units_per_cycle=p["lanes"])

    # ------------------------------------------------------------------ propiedades
    @property
    def nominal_g(self) -> float:
        return self.p["unit_ml"] * self.p["density_kg_l"]

    @property
    def product_temp(self) -> float:
        t = self.inputs.get("product_temp_c")
        if t is None:
            return self.p["hot_fill_min_c"] + 3.0 if self.p["hot_fill"] else 20.0
        return float(t)

    @property
    def phase(self) -> str | None:
        if self.state.current == "setup":
            return "format_change" if self.pending_format else "roll_change"
        return self.seq.phase if self.seq and self.seq.running else None

    # ------------------------------------------------------------------ comandos
    def on_command(self, name: str, args: dict[str, Any]) -> bool:
        if name == "start":
            self.stop_requested = False
            if self.state.current in ("idle", "blocked", "starved"):
                self.state.set("running")
        elif name == "stop":
            self.stop_requested = True
        elif name == "change_format":
            ml = float(args["unit_ml"])
            errors = self.spec.check_params({"unit_ml": ml}, partial=True)
            if errors:
                raise ValueError("; ".join(errors))
            self.seq = None
            self.pending_format = ml
            self.setup_remaining = self.p["format_change_min"] * 60.0
            self.state.set("setup")
        elif name == "change_roll":
            self._start_roll_change()
        elif name == "cip":
            self.seq = None
            self.setup_remaining = float(args.get("duration_min", 20)) * 60.0
            self.state.set("cleaning")
        else:
            return False
        return True

    def on_fault(self, fault_id: str) -> None:
        if self.failures.active[fault_id].stops_equipment:
            self.seq = None

    def _start_roll_change(self) -> None:
        self.seq = None
        self.pending_format = None
        self.setup_remaining = self.p["roll_change_min"] * 60.0
        self.state.set("setup")

    # ------------------------------------------------------------------ simulación
    def update(self, ctx: StepContext) -> None:
        dt = ctx.dt
        p = self.p
        jaw_target = p["seal_setpoint_c"] - (28.0 if self.failures.is_active("jaw_heater_failure") else 0.0)
        self.jaw.step(jaw_target, dt)
        self.drop = max(0.0, self.drop - dt * 2.0)
        s = self.state.current

        if s in ("setup", "cleaning"):
            self.setup_remaining -= dt
            if self.setup_remaining <= 0:
                if s == "setup" and self.pending_format is not None:
                    self.p["unit_ml"] = self.pending_format
                    self.emit("format_changed", unit_ml=self.pending_format)
                    self.pending_format = None
                elif s == "setup":
                    self.roll_left = p["roll_units"]
                    self.rolls_used += 1
                    self.emit("roll_changed", rolls=self.rolls_used)
                self.state.set("running" if not self.stop_requested else "idle")
        elif s in ("running", "blocked", "starved"):
            self._run(dt)

        while self.recent and self.recent[0][0] < self.t - 60.0:
            self.recent.popleft()
        self._check_alarms()
        self.oee.tick(self.state.current, dt)

    def _can_cycle(self) -> bool:
        if self.stop_requested:
            self.stop_requested = False
            self.state.set("idle")
            return False
        if not self.inputs["product_available"] or float(self.inputs["air_pressure_bar"]) < MIN_AIR_BAR:
            self.state.set("starved")
            return False
        if not self.inputs["downstream_free"]:
            self.state.set("blocked")
            return False
        if self.roll_left < self.p["lanes"]:
            self._start_roll_change()
            return False
        self.state.set("running")
        return True

    def _run(self, dt: float) -> None:
        remaining = dt
        while remaining > 1e-9 and self.state.current in ("running", "blocked", "starved"):
            if self.seq is None or not self.seq.running:
                if not self._can_cycle():
                    return
                cycle = 60.0 / self.p["cycles_min"]
                self.seq = PhaseSequencer([(name, cycle * f) for name, f in CYCLE_SPLIT])
                self.seq.start()
            if "seal_cut" in self.seq.step(remaining):
                self._complete_cycle()
            remaining = self.seq.leftover if not self.seq.running else 0.0

    def _complete_cycle(self) -> None:
        p = self.p
        lanes = p["lanes"]
        self.roll_left -= lanes
        drip = self.failures.is_active("dosing_drip")
        mean = self.nominal_g * (1 + p["overfill_target_pct"] / 100.0 + (0.02 if drip else 0.0))
        sd = self.nominal_g * p["fill_sd_pct"] / 100.0 * (1.6 if drip else 1.0)
        seal_dev = abs(self.jaw.value - p["seal_setpoint_c"])
        p_seal = BASE_SEAL_FAIL + (0.30 if seal_dev > p["seal_window_c"] else 0.0) + (0.01 if drip else 0.0)
        if p["hot_fill"] and self.jaw.value < p["seal_setpoint_c"] - 5:
            p_seal += 0.05  # el producto caliente exige más energía de sellado
        hot_reject = p["hot_fill"] and self.product_temp < p["hot_fill_min_c"]

        good = 0
        for _ in range(lanes):
            w = max(0.0, self.rng.gauss(mean, sd))
            self.weights.append(w)
            self.last_weight = w
            self.giveaway_sum += w - self.nominal_g
            self.weight_count += 1
            self.product_kg += w / 1000.0
            if hot_reject:
                self._reject("temperature")
            elif self.rng.random() < p_seal:
                self._reject("seal")
            elif self.rng.random() < CODE_FAIL:
                self._reject("code")
            else:
                good += 1
        self.units_good += good
        self.oee.count(good, lanes - good)
        self.recent.append((self.t, lanes))
        self.drop = 1.0

    def _reject(self, reason: str) -> None:
        self.units_rejected += 1
        self.rejects[reason] += 1
        self.emit("unit_rejected", reason=reason, count=1)

    def _check_alarms(self) -> None:
        p = self.p
        checks = {
            "jaw_temp_c": (abs(self.jaw.value - p["seal_setpoint_c"]) > p["seal_window_c"], self.jaw.value, f"±{p['seal_window_c']} °C"),
            "product_temp_c": (p["hot_fill"] and self.product_temp < p["hot_fill_min_c"], self.product_temp, f"{p['hot_fill_min_c']} °C"),
        }
        for var, (bad, value, limit) in checks.items():
            if bad and var not in self.alarms and self.state.current == "running":
                self.alarms.add(var)
                self.emit("quality_alarm", variable=var, value=round(value, 1), limit=limit)
            elif not bad:
                self.alarms.discard(var)

    # ------------------------------------------------------------------ lectura
    def true_values(self) -> dict[str, Any]:
        mean, sd = mean_sd(list(self.weights))
        return {
            "speed_upm": sum(n for _, n in self.recent) * 60.0 / min(60.0, max(self.t, 1.0)),
            "units_good": self.units_good,
            "units_rejected": self.units_rejected,
            "rejects_seal": self.rejects["seal"],
            "rejects_code": self.rejects["code"],
            "rejects_temperature": self.rejects["temperature"],
            "jaw_temp_c": self.jaw.value,
            "product_temp_c": self.product_temp,
            "fill_weight_avg_g": mean,
            "fill_weight_sd_g": sd,
            "last_weight_g": self.last_weight or None,
            "nominal_weight_g": self.nominal_g,
            "giveaway_g_per_unit": self.giveaway_sum / self.weight_count if self.weight_count else None,
            "film_remaining_pct": 100.0 * max(0, self.roll_left) / self.p["roll_units"],
            "product_used_kg": self.product_kg,
            "unit_ml": self.p["unit_ml"],
        }

    def kpis(self) -> dict[str, Any]:
        v = self.oee.values()
        total = self.units_good + self.units_rejected
        hours = self.t / 3600.0
        return {
            "oee": v["oee"],
            "availability": v["availability"],
            "reject_rate": self.units_rejected / total if total else None,
            "giveaway_pct": 100.0 * self.giveaway_sum / (self.weight_count * self.nominal_g) if self.weight_count else None,
            "units_per_hour": total / hours if hours > 0 else None,
        }

    def animation(self) -> dict[str, float]:
        phase = self.seq.phase if self.seq and self.seq.running else None
        prog = self.seq.phase_progress if phase else 0.0
        film = jaws = dosing = 0.0
        if phase == "pull_film":
            film = prog
        elif phase == "dose":
            film, dosing = 1.0, prog
        elif phase == "seal_cut":
            film, dosing = 1.0, 1.0
            jaws = min(1.0, prog * 3) if prog < 0.66 else max(0.0, (1 - prog) * 3)
        light = {"running": 1.0, "fault": 3.0, "idle": 0.0}.get(self.state.current, 2.0)
        return {
            "film_feed": film,
            "jaws": jaws,
            "dosing": dosing,
            "roll_remaining": max(0.0, self.roll_left / self.p["roll_units"]),
            "unit_drop": self.drop,
            "stack_light": light,
        }
