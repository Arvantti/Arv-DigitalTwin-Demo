"""Comportamiento de una estación de empaque manual (B2): mesa de espera, ritmo del operario, cambio de caja y tarima."""

from __future__ import annotations

from typing import Any

from twin_runtime import EquipmentBehavior, StepContext


class PackingStation(EquipmentBehavior):
    type = "packing-station"
    DEFAULT_INPUTS = {"inflow_upm": None, "operator_present": True, "boxes_available": True, "downstream_free": True}

    def setup(self) -> None:
        self.table = 0
        self.arrivals = 0.0
        self.credit = 0.0
        self.in_box = 0
        self.box_open = False
        self.change_left = 0.0
        self.boxes = 0
        self.packed = 0
        self.pallet_boxes = 0
        self.pallet_full = False
        self.pallets = 0
        self.accepting = True
        self.packing = False
        self.busy_s = 0.0
        self.blocked_s = 0.0

    def update(self, ctx: StepContext) -> None:
        dt = ctx.dt
        p = self.p
        self.packing = False

        # llegadas a la mesa: el exceso queda esperando en la banda (la banda ve accepting = 0)
        inflow = self.inputs["inflow_upm"]
        inflow = p["nominal_inflow_upm"] if inflow is None else float(inflow)
        cap = p["table_capacity_units"]
        self.arrivals += inflow / 60.0 * dt
        take = min(int(self.arrivals), cap - self.table)
        self.table += take
        self.arrivals -= take
        accepting = self.table < cap
        if not accepting and self.accepting:
            self.emit("buffer_full")
        self.accepting = accepting
        if not accepting:
            self.arrivals = min(self.arrivals, 1.0)

        if self.failures.stopping is not None:
            return

        # el cierre y rotulado de la caja avanza aunque la tarima esté esperando recogida
        change_active = self.change_left > 0.0
        self.change_left = max(0.0, self.change_left - dt)

        # tarima llena: se recoge cuando la salida está libre
        if self.pallet_full:
            if self.inputs["downstream_free"]:
                self.pallet_full = False
                self.pallet_boxes = 0
                self.pallets += 1
                self.emit("pallet_picked_up", pallet=self.pallets)
            else:
                self.state.set("blocked")
                self.blocked_s += dt
                return

        if not self.inputs["operator_present"]:
            self.state.set("idle")
            return

        # cierre, rotulado y estiba de la caja anterior
        if change_active:
            self.state.set("setup")
            return

        if self.table == 0:
            self.credit = 0.0
            self.state.set("idle")
            return
        if not self.box_open:
            if not self.inputs["boxes_available"]:
                self.state.set("starved")
                return
            self.box_open = True

        self.state.set("running")
        self.packing = True
        self.busy_s += dt
        self.credit += p["pack_rate_upm"] / 60.0 * dt
        n = min(int(self.credit), self.table, p["parts_per_box"] - self.in_box)
        self.credit -= n
        self.table -= n
        self.in_box += n
        self.packed += n
        if self.in_box >= p["parts_per_box"]:
            self.boxes += 1
            self.pallet_boxes += 1
            self.emit("box_completed", box=self.boxes)
            self.in_box = 0
            self.box_open = False
            self.change_left = p["box_change_s"]
            if self.pallet_boxes >= p["boxes_per_pallet"]:
                self.pallet_full = True
                self.emit("pallet_ready")

    def true_values(self) -> dict[str, Any]:
        return {
            "table_units": self.table,
            "box_fill_pct": 100.0 * self.in_box / self.p["parts_per_box"],
            "units_packed": self.packed,
            "boxes_count": self.boxes,
            "pallet_boxes": self.pallet_boxes,
            "pallets_count": self.pallets,
            "accepting": 1 if self.accepting else 0,
        }

    def kpis(self) -> dict[str, Any]:
        hours = self.t / 3600.0
        return {
            "utilization": self.busy_s / self.t if self.t > 0 else 0.0,
            "boxes_per_h": self.boxes / hours if hours > 0 else 0.0,
            "blocked_pct": self.blocked_s / self.t if self.t > 0 else 0.0,
        }

    def animation(self) -> dict[str, float]:
        s = self.state.current
        light = {"running": 1.0, "idle": 1.0, "setup": 1.0, "fault": 3.0}.get(s, 2.0)
        return {
            "box_fill": self.in_box / self.p["parts_per_box"],
            "table_fill": self.table / self.p["table_capacity_units"],
            "pallet_fill": self.pallet_boxes / self.p["boxes_per_pallet"],
            "packing": 1.0 if self.packing else 0.0,
            "stack_light": light,
        }
