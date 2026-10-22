"""Comportamientos de flujo para tela, corte, módulos de costura y producto terminado.

Los resultados son una simulación de referencia: yields, SAM de las operaciones y capacidades se toman del
catálogo de confecciones o se identifican como supuestos en el plant model/README.
"""

from __future__ import annotations

from typing import Any

from twin_runtime import EquipmentBehavior, StepContext


class FabricStore(EquipmentBehavior):
    type = "garment-fabric-store"
    DEFAULT_INPUTS = {"roll_receipts_upm": None, "downstream_free": True}

    def setup(self) -> None:
        self.stock = int(self.p["initial_rolls"])
        self.receipt_credit = 0.0
        self.dispatch_left = 0.0
        self.rolls_received = 0
        self.rolls_issued = 0

    def update(self, ctx: StepContext) -> None:
        dt = ctx.dt
        rate = self.p["receipt_upm"] if self.inputs["roll_receipts_upm"] is None else max(0.0, float(self.inputs["roll_receipts_upm"]))
        self.receipt_credit += rate * dt / 60.0
        received = min(int(self.receipt_credit), int(self.p["max_rolls"]) - self.stock)
        if received:
            self.stock += received
            self.rolls_received += received
            self.receipt_credit -= received
        self.dispatch_left = max(0.0, self.dispatch_left - dt)
        if self.stock and self.inputs["downstream_free"] and self.dispatch_left <= 1e-9:
            self.stock -= 1
            self.rolls_issued += 1
            self.dispatch_left = float(self.p["dispatch_interval_s"])
            self.emit("roll_issued", roll=self.rolls_issued)
        self.state.set("running" if self.inputs["downstream_free"] and self.stock else "starved" if not self.stock else "blocked")

    def true_values(self) -> dict[str, Any]:
        return {"rolls_on_hand": self.stock, "rolls_received": self.rolls_received, "rolls_issued": self.rolls_issued, "accepting": 1}

    def kpis(self) -> dict[str, Any]:
        return {"rolls_per_h": self.rolls_issued / (self.t / 3600) if self.t > 0 else 0.0}

    def animation(self) -> dict[str, float]:
        return {"fill": min(1.0, self.stock / self.p["max_rolls"]), "stack_light": 1.0 if self.stock else 2.0}


class CuttingLine(EquipmentBehavior):
    type = "garment-cutting-line"
    DEFAULT_INPUTS = {
        "rolls_inflow_upm": None,
        "module_1_polo_ready": True,
        "module_1_oversize_ready": True,
        "module_2_polo_ready": True,
        "module_2_oversize_ready": True,
        "module_3_polo_ready": True,
        "module_3_oversize_ready": True,
    }

    def setup(self) -> None:
        self.roll_queue = 0
        self.roll_credit = 0.0
        self.cut_left = 0.0
        self.in_process = False
        self.rolls_cut = 0
        self.polo_cut = 0
        self.oversize_cut = 0
        self.polo_share_credit = 0.0
        self.output = {(m, sku): 0 for m in range(1, 4) for sku in ("polo", "oversize")}
        self.busy_s = 0.0

    def update(self, ctx: StepContext) -> None:
        dt = ctx.dt
        rate = 0.0 if self.inputs["rolls_inflow_upm"] is None else max(0.0, float(self.inputs["rolls_inflow_upm"]))
        self.roll_credit += rate * dt / 60.0
        new_rolls = min(int(self.roll_credit), int(self.p["roll_queue_capacity"]) - self.roll_queue - int(self.in_process))
        if new_rolls > 0:
            self.roll_queue += new_rolls
            self.roll_credit -= new_rolls
        if self.failures.stopping is not None:
            return
        remaining = dt
        while remaining > 1e-9:
            if not self.in_process:
                if self.roll_queue <= 0 or not all(
                    bool(self.inputs[f"module_{m}_{sku}_ready"]) for m in range(1, 4) for sku in ("polo", "oversize")
                ):
                    break
                self.roll_queue -= 1
                self.in_process = True
                self.cut_left = float(self.p["cut_cycle_s"])
            step = min(remaining, self.cut_left)
            self.cut_left -= step
            remaining -= step
            self.busy_s += step
            if self.cut_left <= 1e-9:
                self.in_process = False
                self.cut_left = 0.0
                self.rolls_cut += 1
                self.polo_share_credit += float(self.p["polo_share"])
                sku = "polo" if self.polo_share_credit >= 1.0 else "oversize"
                if sku == "polo":
                    self.polo_share_credit -= 1.0
                qty = int(self.p[f"{sku}_per_roll"])
                for module in range(1, 4):
                    part = qty // 3 + int(module <= qty % 3)
                    self.output[(module, sku)] += part
                if sku == "polo":
                    self.polo_cut += qty
                else:
                    self.oversize_cut += qty
                self.emit("roll_cut", roll=self.rolls_cut, product=sku, units=qty)
        self.state.set("running" if self.in_process else "starved" if self.roll_queue == 0 else "blocked")

    def true_values(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "rolls_queue": self.roll_queue + int(self.in_process),
            "rolls_cut": self.rolls_cut,
            "polo_cut": self.polo_cut,
            "oversize_cut": self.oversize_cut,
            "cut_progress": 1 - self.cut_left / self.p["cut_cycle_s"] if self.in_process else 0.0,
            "accepting_rolls": int(self.roll_queue + int(self.in_process) < self.p["roll_queue_capacity"]),
        }
        out.update({f"{sku}_module_{m}_out": self.output[(m, sku)] for m in range(1, 4) for sku in ("polo", "oversize")})
        out.update(
            {
                f"module_{m}_{sku}_ready": int(bool(self.inputs[f"module_{m}_{sku}_ready"]))
                for m in range(1, 4)
                for sku in ("polo", "oversize")
            }
        )
        return out

    def kpis(self) -> dict[str, Any]:
        return {"rolls_per_h": self.rolls_cut / (self.t / 3600) if self.t > 0 else 0.0, "garments_cut": self.polo_cut + self.oversize_cut}

    def animation(self) -> dict[str, float]:
        return {
            "table_fill": min(1.0, self.roll_queue / self.p["roll_queue_capacity"]),
            "cutting": 1.0 if self.in_process else 0.0,
            "progress": 1 - self.cut_left / self.p["cut_cycle_s"] if self.in_process else 0.0,
            "stack_light": 1.0 if self.in_process else 2.0,
        }


class GarmentSewingModule(EquipmentBehavior):
    """Cinco puestos contiguos en fila: una pieza pasa por una operación agrupada en cada puesto."""

    type = "garment-sewing-module"
    DEFAULT_INPUTS = {
        "polo_inflow_upm": None,
        "oversize_inflow_upm": None,
        "polo_downstream_free": True,
        "oversize_downstream_free": True,
    }
    STATION_PARAMS = {
        "polo": ["polo_lock_1_s", "polo_lock_2_s", "polo_over_1_s", "polo_over_2_s", "polo_cover_s"],
        "oversize": ["oversize_lock_1_s", "oversize_lock_2_s", "oversize_over_1_s", "oversize_over_2_s", "oversize_cover_s"],
    }
    STATION_NAMES = ["Plana 1", "Plana 2", "Fileteadora 1", "Fileteadora 2", "Recubridora"]

    def setup(self) -> None:
        self.queues = [{"polo": 0, "oversize": 0} for _ in range(5)]
        self.credit = {"polo": 0.0, "oversize": 0.0}
        self.active: list[str | None] = [None] * 5
        self.work_left = [0.0] * 5
        self.done = {"polo": 0, "oversize": 0}
        self.station_done = [0] * 5
        self.waiting_output: str | None = None
        self.last_sku = ["oversize"] * 5
        self.busy_s = [0.0] * 5
        self.starved_s = 0.0
        self.needle_phase = [0.0] * 5

    def _sam(self, station: int, sku: str) -> float:
        return float(self.p[self.STATION_PARAMS[sku][station]])

    def update(self, ctx: StepContext) -> None:
        dt = max(0.0, ctx.dt)
        for sku in ("polo", "oversize"):
            flow = self.inputs[f"{sku}_inflow_upm"]
            self.credit[sku] += (0.0 if flow is None else max(0.0, float(flow))) * dt / 60.0
            n = min(int(self.credit[sku]), int(self.p["queue_capacity"]) - sum(self.queues[0].values()))
            if n > 0:
                self.queues[0][sku] += n
                self.credit[sku] -= n
        if self.failures.stopping is not None:
            return
        # Terminado pendiente de entrega a calidad: se conserva el artículo si la cola de salida está llena.
        if self.waiting_output:
            sku = self.waiting_output
            if not self.inputs[f"{sku}_downstream_free"]:
                self.state.set("blocked")
                return
            self.done[sku] += 1
            self.emit("garment_completed", product=sku, units=self.done[sku])
            self.waiting_output = None
        # Avanzar del último puesto al primero conserva unidades entre estaciones y evita saltarse una operación.
        for i in range(4, -1, -1):
            remaining = dt
            while remaining > 1e-9:
                if self.active[i] is None:
                    ready = [sku for sku in ("polo", "oversize") if self.queues[i][sku] > 0]
                    if not ready:
                        break
                    sku = ("polo" if self.last_sku[i] == "oversize" else "oversize") if len(ready) == 2 else ready[0]
                    self.queues[i][sku] -= 1
                    self.active[i] = sku
                    self.work_left[i] = self._sam(i, sku)
                sku = self.active[i]
                if i == 4 and self.work_left[i] <= 1e-9 and not self.inputs[f"{sku}_downstream_free"]:
                    self.waiting_output = sku
                    self.state.set("blocked")
                    break
                step = min(remaining, self.work_left[i])
                self.work_left[i] -= step
                remaining -= step
                self.busy_s[i] += step
                if self.work_left[i] <= 1e-9:
                    self.active[i] = None
                    self.work_left[i] = 0.0
                    self.station_done[i] += 1
                    self.last_sku[i] = sku
                    self.emit("station_completed", station=i + 1, product=sku, units=self.station_done[i])
                    if i == 4:
                        if self.inputs[f"{sku}_downstream_free"]:
                            self.done[sku] += 1
                            self.emit("garment_completed", product=sku, units=self.done[sku])
                        else:
                            self.waiting_output = sku
                            self.state.set("blocked")
                            break
                    else:
                        self.queues[i + 1][sku] += 1
        self.state.set(
            "running" if any(self.active) else "blocked" if self.waiting_output or any(sum(q.values()) for q in self.queues) else "starved"
        )
        if self.state.current == "starved":
            self.starved_s += dt

    def true_values(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "polo_queue": self.queues[0]["polo"],
            "oversize_queue": self.queues[0]["oversize"],
            "polo_units": self.done["polo"],
            "oversize_units": self.done["oversize"],
            # Cut sends one full package at once; retain headroom so an accepted batch cannot overflow the finite input supermarket.
            "polo_accepting": int(sum(self.queues[0].values()) + self.credit["polo"] < self.p["queue_capacity"] - 20),
            "oversize_accepting": int(sum(self.queues[0].values()) + self.credit["oversize"] < self.p["queue_capacity"] - 20),
            "polo_downstream_free": int(bool(self.inputs["polo_downstream_free"])),
            "oversize_downstream_free": int(bool(self.inputs["oversize_downstream_free"])),
            "units_completed": sum(self.done.values()),
            "cycle_pct": 100.0 * (1 - self.work_left[4] / self._sam(4, self.active[4])) if self.active[4] else 0.0,
        }
        for i in range(5):
            out[f"station_{i + 1}_units"] = self.station_done[i]
            out[f"station_{i + 1}_queue"] = sum(self.queues[i].values())
            out[f"station_{i + 1}_product"] = {None: 0, "polo": 1, "oversize": 2}[self.active[i]]
        return out

    def kpis(self) -> dict[str, Any]:
        hours = self.t / 3600.0
        busy = sum(self.busy_s)
        return {
            "utilization": busy / (self.t * 5) if self.t > 0 else 0.0,
            "units_per_h": sum(self.done.values()) / hours if hours else 0.0,
            "starved_pct": self.starved_s / self.t if self.t else 0.0,
        }

    def animation(self) -> dict[str, float]:
        import math

        out: dict[str, float] = {
            "line_queue": min(1.0, sum(sum(q.values()) for q in self.queues) / (self.p["queue_capacity"] * 5)),
            "stack_light": 1.0 if any(self.active) else 2.0,
        }
        for i in range(5):
            active = self.active[i]
            self.needle_phase[i] = (self.needle_phase[i] + self.t * 0.7) % 1 if active else 0.0
            out[f"station_{i + 1}_working"] = 1.0 if active else 0.0
            out[f"station_{i + 1}_needle"] = 0.5 + 0.5 * math.sin(self.needle_phase[i] * math.tau) if active else 0.0
            out[f"station_{i + 1}_progress"] = 1 - self.work_left[i] / self._sam(i, active) if active else 0.0
        return out


class FinalInspection(EquipmentBehavior):
    type = "garment-final-inspection"
    DEFAULT_INPUTS = {"polo_inflow_upm": None, "oversize_inflow_upm": None, "polo_downstream_free": True, "oversize_downstream_free": True}

    def setup(self) -> None:
        self.queues = {"polo": 0, "oversize": 0}
        self.credit = {"polo": 0.0, "oversize": 0.0}
        self.done = {"polo": 0, "oversize": 0}
        self.busy_left = 0.0
        self.active: str | None = None
        self.waiting: str | None = None
        self.inspected = 0
        self.busy_s = 0.0
        self.last_sku = "oversize"

    def update(self, ctx: StepContext) -> None:
        dt = ctx.dt
        for sku in self.queues:
            value = self.inputs[f"{sku}_inflow_upm"]
            self.credit[sku] += (0.0 if value is None else max(0.0, float(value))) * dt / 60
            n = min(int(self.credit[sku]), int(self.p["queue_capacity"]) - self.queues[sku])
            if n:
                self.queues[sku] += n
                self.credit[sku] -= n
        if self.failures.stopping is not None:
            return
        if self.waiting:
            sku = self.waiting
            if not self.inputs[f"{sku}_downstream_free"]:
                self.state.set("blocked")
                return
            self.done[sku] += 1
            self.waiting = None
        remaining = dt
        while remaining > 1e-9:
            if self.active is None:
                ready = [sku for sku in ("polo", "oversize") if self.queues[sku] and self.inputs[f"{sku}_downstream_free"]]
                if not ready:
                    break
                sku = ("polo" if self.last_sku == "oversize" else "oversize") if len(ready) == 2 else ready[0]
                self.queues[sku] -= 1
                self.active = sku
                self.busy_left = float(self.p["inspection_s"])
            sku = self.active
            step = min(remaining, self.busy_left)
            self.busy_left -= step
            remaining -= step
            self.busy_s += step
            if self.busy_left <= 1e-9:
                self.active = None
                self.busy_left = 0.0
                self.inspected += 1
                self.last_sku = sku
                if self.inputs[f"{sku}_downstream_free"]:
                    self.done[sku] += 1
                    self.emit("garment_inspected", product=sku, accepted=True)
                else:
                    self.waiting = sku
                    self.state.set("blocked")
                    break
        self.state.set(
            "running" if self.active else "blocked" if self.waiting else "starved" if not sum(self.queues.values()) else "blocked"
        )

    def true_values(self) -> dict[str, Any]:
        return {
            "polo_queue": self.queues["polo"],
            "oversize_queue": self.queues["oversize"],
            "polo_good": self.done["polo"],
            "oversize_good": self.done["oversize"],
            "units_inspected": self.inspected,
            "polo_accepting": int(self.queues["polo"] < self.p["queue_capacity"]),
            "oversize_accepting": int(self.queues["oversize"] < self.p["queue_capacity"]),
            "polo_downstream_free": int(bool(self.inputs["polo_downstream_free"])),
            "oversize_downstream_free": int(bool(self.inputs["oversize_downstream_free"])),
            "progress": 1 - self.busy_left / self.p["inspection_s"] if self.active else 0.0,
        }

    def kpis(self) -> dict[str, Any]:
        return {
            "inspected_per_h": self.inspected / (self.t / 3600) if self.t else 0.0,
            "utilization": self.busy_s / self.t if self.t else 0.0,
        }

    def animation(self) -> dict[str, float]:
        return {
            "working": 1.0 if self.active else 0.0,
            "progress": 1 - self.busy_left / self.p["inspection_s"] if self.active else 0.0,
            "queue": min(1.0, sum(self.queues.values()) / self.p["queue_capacity"]),
            "stack_light": 1.0 if self.active else 2.0,
        }


class FinishedGoodsStore(EquipmentBehavior):
    type = "garment-finished-goods-store"
    DEFAULT_INPUTS = {"polo_inflow_upm": None, "oversize_inflow_upm": None}
    INITIAL_STATE = "running"

    def setup(self) -> None:
        self.stock = {"polo": 0, "oversize": 0}
        self.credit = {"polo": 0.0, "oversize": 0.0}
        self.received = {"polo": 0, "oversize": 0}
        self.accepting = {"polo": True, "oversize": True}

    def update(self, ctx: StepContext) -> None:
        dt = ctx.dt
        for sku in self.stock:
            rate = self.inputs[f"{sku}_inflow_upm"]
            self.credit[sku] += (0.0 if rate is None else max(0.0, float(rate))) * dt / 60.0
            room = max(0, int(self.p["capacity_units"]) - sum(self.stock.values()))
            count = min(int(self.credit[sku]), room)
            if count:
                self.stock[sku] += count
                self.received[sku] += count
                self.credit[sku] -= count
            self.accepting[sku] = sum(self.stock.values()) < self.p["capacity_units"]
        self.state.set("running" if sum(self.stock.values()) else "idle")

    def true_values(self) -> dict[str, Any]:
        total = sum(self.stock.values())
        return {
            "polo_stock": self.stock["polo"],
            "oversize_stock": self.stock["oversize"],
            "units_stored": total,
            "polo_received": self.received["polo"],
            "oversize_received": self.received["oversize"],
            "capacity_pct": 100.0 * total / self.p["capacity_units"],
            "polo_accepting": int(total < self.p["capacity_units"]),
            "oversize_accepting": int(total < self.p["capacity_units"]),
        }

    def kpis(self) -> dict[str, Any]:
        return {
            "units_per_h": sum(self.received.values()) / (self.t / 3600) if self.t else 0.0,
            "occupancy_pct": 100.0 * sum(self.stock.values()) / self.p["capacity_units"],
        }

    def animation(self) -> dict[str, float]:
        return {
            "fill": min(1.0, sum(self.stock.values()) / self.p["capacity_units"]),
            "polo_fill": min(1.0, self.stock["polo"] / self.p["capacity_units"]),
            "oversize_fill": min(1.0, self.stock["oversize"] / self.p["capacity_units"]),
        }
