"""Comportamiento del molino granulador (B2): tolva con rebose, rotor con desgaste de cuchillas,
finos según el filo y la criba, recipiente de molido."""

from __future__ import annotations

import math
from typing import Any

from twin_runtime import EquipmentBehavior, StepContext

DULL_WEAR = 0.8


class Granulator(EquipmentBehavior):
    type = "granulator"
    DEFAULT_INPUTS = {"feed_kg_h": None, "downstream_free": True}

    def setup(self) -> None:
        self.throat = 0.0
        self.bin = 0.0
        self.regrind = 0.0
        self.fines = 0.0
        self.overflow = 0.0
        self.fed = 0.0
        self.cut_kg = 0.0
        self.wear = 0.0
        self.rate = 0.0
        self.fines_now = 0.0
        self.power = 0.0
        self.energy = 0.0
        self.feeding = 0.0
        self.flags: set[str] = set()

    @property
    def capacity(self) -> float:
        return self.p["capacity_kg_h"] * (1.0 - 0.4 * self.wear)

    def fines_fraction(self) -> float:
        return (1.0 + 6.0 * self.wear) / 100.0 * math.sqrt(8.0 / self.p["screen_mm"])

    def on_command(self, name: str, args: dict[str, Any]) -> bool:
        if name == "change_knives":
            self._new_knives()
        elif name == "empty_bin":
            self.bin = 0.0
        elif name == "maintenance":
            self.state.set("maintenance" if args.get("active", True) else "idle")
        else:
            return False
        return True

    def _new_knives(self) -> None:
        self.wear = 0.0
        self.cut_kg = 0.0
        self.emit("knives_changed")

    def on_fault(self, fault_id: str) -> None:
        if fault_id == "knives_dull":
            self.wear = max(self.wear, DULL_WEAR)

    def on_fault_cleared(self, fault_id: str) -> None:
        if fault_id == "knives_dull":
            self._new_knives()

    def update(self, ctx: StepContext) -> None:
        dt = ctx.dt
        p = self.p
        s = self.state.current
        feed = self.inputs["feed_kg_h"]
        feed = p["nominal_feed_kg_h"] if feed is None else max(0.0, float(feed))
        add = feed * dt / 3600.0
        self.fed += add
        self.feeding = 1.0 if feed > 0 else 0.0
        self.throat += add
        if self.throat > p["throat_kg"]:
            spill = self.throat - p["throat_kg"]
            self.overflow += spill
            self.throat = p["throat_kg"]
            if "overflow" not in self.flags:
                self.flags.add("overflow")
                self.emit("overflow")
        elif self.throat < 0.9 * p["throat_kg"]:
            self.flags.discard("overflow")

        # el molido sale por transporte si hay salida libre; si no, se acumula en el recipiente
        if self.inputs["downstream_free"]:
            self.bin = 0.0
        turning = s not in ("fault", "maintenance")
        blocked = not self.inputs["downstream_free"] and self.bin >= p["bin_kg"] - 1e-9
        cut = 0.0
        if turning and not blocked:
            cut = min(self.throat, self.capacity * dt / 3600.0)
            self.throat -= cut
            self.cut_kg += cut
            self.wear = max(self.wear, min(1.0, self.cut_kg / 1000.0 / p["knife_life_t"]))
            fines = cut * self.fines_fraction()
            self.fines += fines
            self.regrind += cut - fines
            if not self.inputs["downstream_free"]:
                self.bin = min(p["bin_kg"], self.bin + cut - fines)
        self.rate = cut / dt * 3600.0
        self.fines_now = 100.0 * self.fines_fraction()
        if blocked and "bin_full" not in self.flags:
            self.flags.add("bin_full")
            self.emit("bin_full")
        elif not blocked:
            self.flags.discard("bin_full")
        if turning:
            self.state.set("blocked" if blocked else "running" if cut > 0 else "idle")

        load = min(1.0, self.rate / max(1e-9, p["capacity_kg_h"]))
        self.power = p["rotor_kw"] * (0.25 + 0.75 * load) * (1.0 + 0.5 * self.wear) if turning else 0.0
        self.energy += self.power * dt / 3600.0

    def true_values(self) -> dict[str, Any]:
        return {
            "throat_kg": self.throat,
            "throat_capacity_kg": self.p["throat_kg"],
            "rate_kg_h": self.rate,
            "regrind_kg": self.regrind,
            "fines_kg": self.fines,
            "fines_pct": self.fines_now,
            "overflow_kg": self.overflow,
            "bin_kg": self.bin,
            "knife_wear_pct": 100.0 * self.wear,
            "motor_current_a": self.power * 1000.0 / (math.sqrt(3) * 440.0 * 0.85),
            "power_kw": self.power,
            "energy_kwh": self.energy,
        }

    def kpis(self) -> dict[str, Any]:
        done = self.regrind + self.fines
        return {
            "avg_fines_pct": 100.0 * self.fines / done if done > 0 else None,
            "kwh_per_kg": self.energy / done if done > 0 else None,
            "overflow_pct": self.overflow / self.fed if self.fed > 0 else 0.0,
        }

    def animation(self) -> dict[str, float]:
        s = self.state.current
        light = 3.0 if s == "fault" else 2.0 if (s == "blocked" or "overflow" in self.flags or self.failures.active) else 1.0
        return {
            "rotor": 0.0 if s in ("fault", "maintenance") else 1.0,
            "feed": self.feeding,
            "throat_fill": self.throat / self.p["throat_kg"],
            "bin_level": self.bin / self.p["bin_kg"],
            "alarm_light": light,
        }
