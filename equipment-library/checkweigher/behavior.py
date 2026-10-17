"""Comportamiento del control de peso con detector de metales (B2)."""

from __future__ import annotations

from collections import deque
from typing import Any

from twin_runtime import EquipmentBehavior, StepContext
from twin_runtime.primitives import mean_sd

SCALE_SD_G = 0.3
DRIFT_G = 5.0
DETECTION_P = 0.995


class Checkweigher(EquipmentBehavior):
    type = "checkweigher"
    DEFAULT_INPUTS = {"inflow_upm": None, "upstream_mean_g": None, "upstream_sd_g": None, "downstream_free": True}

    def setup(self) -> None:
        self.arrivals = 0.0
        self.counts = {k: 0 for k in ("in", "ok", "weight", "metal", "false_rej", "false_acc", "escapes")}
        self.weights: deque[float] = deque(maxlen=100)
        self.last = None
        self.accepted_g = 0.0
        self.last_test_t = 0.0
        self.pusher = 0.0
        self.travel = 0.0
        self.hold_alarm = False

    def on_command(self, name: str, args: dict[str, Any]) -> bool:
        if name == "metal_test":
            self.last_test_t = self.t
            self.emit("metal_test_done")
            return True
        return False

    @property
    def lot_on_hold(self) -> bool:
        return self.p["metal_detector"] and (self.t - self.last_test_t) > self.p["metal_test_interval_min"] * 60.0

    def update(self, ctx: StepContext) -> None:
        dt = ctx.dt
        p = self.p
        self.pusher = max(0.0, self.pusher - dt * 4.0)
        if self.lot_on_hold and not self.hold_alarm:
            minutes = round((self.t - self.last_test_t) / 60, 1)
            self.emit("quality_alarm", variable="minutes_since_metal_test", value=minutes, limit=p["metal_test_interval_min"])
        self.hold_alarm = self.lot_on_hold
        if self.failures.stopping is not None:
            return
        if not self.inputs["downstream_free"]:
            self.state.set("blocked")
            return
        inflow = self.inputs["inflow_upm"]
        inflow = p["nominal_inflow_upm"] if inflow is None else float(inflow)
        self.state.set("running" if inflow > 0 else "idle")
        self.travel = (self.travel + 0.6 * dt) % 10.0
        self.arrivals += inflow / 60.0 * dt
        while self.arrivals >= 1.0:
            self.arrivals -= 1.0
            self._inspect()

    def _inspect(self) -> None:
        p = self.p
        nominal = p["nominal_g"]
        mean = self.inputs["upstream_mean_g"]
        sd = self.inputs["upstream_sd_g"]
        mean = nominal * 1.01 if mean is None else float(mean)
        sd = nominal * 0.015 if sd is None else float(sd)
        true_w = self.rng.gauss(mean, sd)
        offset = DRIFT_G if self.failures.is_active("load_cell_drift") else 0.0
        measured = true_w + offset + self.rng.gauss(0, SCALE_SD_G)
        lo, hi = nominal - p["tolerance_minus_g"], nominal + p["tolerance_plus_g"]
        truly_ok = lo <= true_w <= hi
        measured_ok = lo <= measured <= hi
        self.counts["in"] += 1
        self.weights.append(measured)
        self.last = measured
        has_metal = self.rng.random() < p["metal_rate"]
        if has_metal and p["metal_detector"] and self.rng.random() < DETECTION_P:
            self.counts["metal"] += 1
            self.pusher = 1.0
            self.emit("unit_rejected", reason="metal", weight_g=round(measured, 1))
            return
        if has_metal:
            self.counts["escapes"] += 1
        if not measured_ok:
            self.counts["weight"] += 1
            self.counts["false_rej"] += int(truly_ok)
            self.pusher = 1.0
            self.emit("unit_rejected", reason="underweight" if measured < lo else "overweight", weight_g=round(measured, 1))
            return
        self.counts["false_acc"] += int(not truly_ok)
        self.counts["ok"] += 1
        self.accepted_g += true_w

    def true_values(self) -> dict[str, Any]:
        mean, sd = mean_sd(list(self.weights))
        c = self.counts
        return {
            "last_weight_g": self.last,
            "mean_g": mean,
            "sd_g": sd,
            "units_in": c["in"],
            "units_accepted": c["ok"],
            "rejects_weight": c["weight"],
            "rejects_metal": c["metal"],
            "false_rejects": c["false_rej"],
            "false_accepts": c["false_acc"],
            "metal_escapes": c["escapes"],
            "minutes_since_metal_test": (self.t - self.last_test_t) / 60.0,
            "lot_on_hold": 1 if self.lot_on_hold else 0,
        }

    def kpis(self) -> dict[str, Any]:
        c = self.counts
        n = c["in"]
        return {
            "reject_rate": (c["weight"] + c["metal"]) / n if n else None,
            "false_reject_rate": c["false_rej"] / n if n else None,
            "giveaway_pct": 100.0 * (self.accepted_g / c["ok"] / self.p["nominal_g"] - 1) if c["ok"] else None,
        }

    def animation(self) -> dict[str, float]:
        s = self.state.current
        light = 3.0 if s == "fault" else 2.0 if (self.lot_on_hold or s == "blocked") else 1.0 if s == "running" else 0.0
        return {"belt_travel": self.travel, "pusher": self.pusher, "stack_light": light}
