"""Comportamiento del paletizador de fajos (B2): mesa de entrada, ritmo de colocación, cambio de estiba y salida."""

from __future__ import annotations

from typing import Any

from twin_runtime import EquipmentBehavior, StepContext


class Palletizer(EquipmentBehavior):
    type = "palletizer"
    DEFAULT_INPUTS = {"inflow_upm": None, "pallets_available": True, "downstream_free": True}

    def setup(self) -> None:
        self.arrivals = 0.0
        self.infeed = 0
        self.credit = 0.0
        self.on_pallet = 0
        self.placed = 0
        self.outfeed = 0
        self.pallets = 0
        self.completed = 0
        self.change_left = 0.0
        self.accepting = True
        self.working = False
        self.busy_s = 0.0
        self.blocked_s = 0.0

    def update(self, ctx: StepContext) -> None:
        dt = ctx.dt
        p = self.p
        self.working = False
        inflow = self.inputs["inflow_upm"]
        inflow = p["nominal_inflow_upm"] if inflow is None else float(inflow)
        cap = p["infeed_capacity"]
        self.arrivals += inflow / 60.0 * dt
        take = min(int(self.arrivals), cap - self.infeed)
        self.infeed += take
        self.arrivals -= take
        accepting = self.infeed < cap
        if not accepting and self.accepting:
            self.emit("infeed_full")
        self.accepting = accepting
        if not accepting:
            self.arrivals = min(self.arrivals, 1.0)
        # la estiba llena sale cuando la envolvedora o el montacargas la reciben
        if self.outfeed > 0 and self.inputs["downstream_free"]:
            self.outfeed -= 1
            self.pallets += 1
        if self.failures.stopping is not None:
            return
        if self.change_left > 0.0:
            self.change_left = max(0.0, self.change_left - dt)
            self.state.set("setup")
            return
        if self.on_pallet == 0 and not self.inputs["pallets_available"]:
            self.state.set("starved")
            return
        if self.infeed == 0:
            self.credit = 0.0
            self.state.set("idle")
            return
        self.state.set("running")
        self.working = True
        self.busy_s += dt
        self.credit += p["rate_bundles_min"] / 60.0 * dt
        n = min(int(self.credit), self.infeed, p["bundles_per_pallet"] - self.on_pallet)
        self.credit -= n
        self.infeed -= n
        self.on_pallet += n
        self.placed += n
        if self.on_pallet >= p["bundles_per_pallet"]:
            if self.outfeed >= 1:
                self.state.set("blocked")
                self.blocked_s += dt
                self.credit = 0.0
                return
            self.completed += 1
            self.emit("pallet_completed", pallet=self.completed)
            self.on_pallet = 0
            self.outfeed += 1
            self.change_left = p["pallet_change_s"]

    def true_values(self) -> dict[str, Any]:
        return {
            "infeed_bundles": self.infeed,
            "pallet_bundles": self.on_pallet,
            "bundles_placed": self.placed,
            "pallets_count": self.pallets,
            "outfeed_pallets": self.outfeed,
            "accepting": 1 if self.accepting else 0,
        }

    def kpis(self) -> dict[str, Any]:
        hours = self.t / 3600.0
        return {
            "pallets_per_h": self.pallets / hours if hours > 0 else 0.0,
            "utilization": self.busy_s / self.t if self.t > 0 else 0.0,
            "blocked_pct": self.blocked_s / self.t if self.t > 0 else 0.0,
        }

    def animation(self) -> dict[str, float]:
        light = {"running": 1.0, "idle": 1.0, "setup": 1.0, "fault": 3.0}.get(self.state.current, 2.0)
        return {
            "pallet_fill": self.on_pallet / self.p["bundles_per_pallet"],
            "infeed_fill": self.infeed / self.p["infeed_capacity"],
            "working": 1.0 if self.working else 0.0,
            "stack_light": light,
        }
