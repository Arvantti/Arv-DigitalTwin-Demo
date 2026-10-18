"""Comportamiento de un buffer de máquina con estiba (B2): acumula piezas, arma estibas de X piezas y las entrega."""

from __future__ import annotations

from typing import Any

from twin_runtime import EquipmentBehavior, StepContext


class PalletBuffer(EquipmentBehavior):
    type = "pallet-buffer"
    DEFAULT_INPUTS = {"inflow_upm": None, "downstream_free": True}
    INITIAL_STATE = "running"

    def setup(self) -> None:
        self.loose = 0
        self.arrivals = 0.0
        self.waiting: list[float] = []  # tiempo que lleva cerrada cada estiba llena, la primera es la más antigua
        self.delivered_pallets = 0
        self.delivered_units = 0
        self.accepting = True
        self.blocked_s = 0.0

    def update(self, ctx: StepContext) -> None:
        dt = ctx.dt
        p = self.p
        x = p["pallet_pieces"]
        was_accepting = self.accepting

        inflow = self.inputs["inflow_upm"]
        inflow = p["nominal_inflow_upm"] if inflow is None else max(0.0, float(inflow))
        self.arrivals += inflow / 60.0 * dt
        take = int(self.arrivals)
        self.arrivals -= take
        if self.accepting:
            self.loose += take
        # lo que llega con el buffer lleno se descarta (a lo sumo una pieza queda por acumular)
        self.arrivals = min(self.arrivals, 1.0)

        self.waiting = [age + dt for age in self.waiting]
        while self.loose >= x and len(self.waiting) < p["max_waiting_pallets"]:
            self.loose -= x
            self.waiting.append(0.0)
            self.emit("pallet_full", waiting=len(self.waiting))

        # entrega de la estiba más antigua cuando ya está lista y el montacargas la recibe
        stopped = self.failures.stopping is not None
        if self.waiting and self.waiting[0] >= p["pickup_wait_s"] and self.inputs["downstream_free"] and not stopped:
            self.waiting.pop(0)
            self.delivered_pallets += 1
            self.delivered_units += x
            self.emit("pallet_released", pallets=self.delivered_pallets)

        self.accepting = not (self.loose >= x and len(self.waiting) >= p["max_waiting_pallets"])
        if was_accepting and not self.accepting:
            self.emit("buffer_blocked")
        if stopped:
            self.state.set("fault")
        elif not self.accepting:
            self.state.set("blocked")
            self.blocked_s += dt
        else:
            self.state.set("running")

    def true_values(self) -> dict[str, Any]:
        return {
            "loose_pieces": self.loose,
            "pallets_waiting": len(self.waiting),
            "pallets_delivered": self.delivered_pallets,
            "units_delivered": self.delivered_units,
            "accepting": 1 if self.accepting else 0,
        }

    def kpis(self) -> dict[str, Any]:
        hours = self.t / 3600.0
        return {
            "pallets_per_h": self.delivered_pallets / hours if hours > 0 else 0.0,
            "blocked_pct": self.blocked_s / self.t if self.t > 0 else 0.0,
        }

    def animation(self) -> dict[str, float]:
        return {
            "fill": min(1.0, self.loose / self.p["pallet_pieces"]),
            "waiting": float(len(self.waiting)),
            "blocked": 0.0 if self.accepting else 1.0,
        }
