"""Comportamiento de un almacén de estibas (B2): inventario en estantería, recepción y entrega de una estiba a la vez."""

from __future__ import annotations

from typing import Any

from twin_runtime import EquipmentBehavior, StepContext


class PalletStore(EquipmentBehavior):
    type = "pallet-store"
    DEFAULT_INPUTS = {"inflow_upm": None, "downstream_free": True}
    INITIAL_STATE = "running"

    def setup(self) -> None:
        self.stock = self.p["initial_pallets"] * self.p["pallet_pieces"]
        self.arrivals = 0.0
        self.received = 0
        self.delivered_pallets = 0
        self.delivered_units = 0
        self.since_release = float(self.p["release_gap_s"])
        self.releasing = 0.0
        self.accepting = True
        self.starved = False
        self.starved_s = 0.0

    @property
    def used_positions(self) -> int:
        return -(-self.stock // self.p["pallet_pieces"])

    def update(self, ctx: StepContext) -> None:
        dt = ctx.dt
        p = self.p
        x = p["pallet_pieces"]
        stopped = self.failures.stopping is not None
        was_accepting, was_starved = self.accepting, self.starved
        self.since_release += dt
        self.releasing = max(0.0, self.releasing - dt)

        inflow = self.inputs["inflow_upm"]
        inflow = 0.0 if inflow is None else max(0.0, float(inflow))
        if not stopped:
            self.arrivals += inflow / 60.0 * dt
            take = int(self.arrivals)
            self.arrivals -= take
            if self.accepting:
                self.stock += take
                self.received += take
            # lo que llega con la estantería llena se descarta (a lo sumo una pieza queda por acumular)
            self.arrivals = min(self.arrivals, 1.0)

            if self.inputs["downstream_free"] and self.stock >= x and self.since_release >= p["release_gap_s"]:
                self.stock -= x
                self.delivered_pallets += 1
                self.delivered_units += x
                self.since_release = 0.0
                self.releasing = 3.0
                self.emit("pallet_released", pallets=self.delivered_pallets)

        # recibe mientras quede una posición libre para la próxima estiba (la que viene en camino cabe)
        self.accepting = not stopped and self.used_positions < p["positions"]
        self.starved = self.stock < x
        if was_accepting and not self.accepting and not stopped:
            self.emit("store_full")
        if self.starved and not was_starved:
            self.emit("store_empty")
        if stopped:
            self.state.set("fault")
        elif not self.accepting:
            self.state.set("blocked")
        elif self.starved:
            self.state.set("starved")
            self.starved_s += dt
        else:
            self.state.set("running")

    def true_values(self) -> dict[str, Any]:
        return {
            "stock_pieces": self.stock,
            "stored_pallets": self.used_positions,
            "occupancy_pct": 100.0 * min(1.0, self.used_positions / self.p["positions"]),
            "pallets_delivered": self.delivered_pallets,
            "units_delivered": self.delivered_units,
            "units_received": self.received,
            "accepting": 1 if self.accepting else 0,
        }

    def kpis(self) -> dict[str, Any]:
        hours = self.t / 3600.0
        return {
            "pallets_per_h": self.delivered_pallets / hours if hours > 0 else 0.0,
            "starved_pct": self.starved_s / self.t if self.t > 0 else 0.0,
        }

    def animation(self) -> dict[str, float]:
        return {
            "fill": min(1.0, self.used_positions / self.p["positions"]),
            "releasing": 1.0 if self.releasing > 0 else 0.0,
        }
