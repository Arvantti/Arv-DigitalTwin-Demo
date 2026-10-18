"""Comportamiento de una convertidora de cajas (B2): alimentador de pilas, velocidad en láminas, fajos y cambio de pedido."""

from __future__ import annotations

from typing import Any

from twin_runtime import EquipmentBehavior, StepContext


class BoxConverter(EquipmentBehavior):
    type = "box-converter"
    DEFAULT_INPUTS = {"inflow_upm": None, "downstream_free": True}

    def setup(self) -> None:
        self.enabled = True
        self.arrivals = 0.0
        self.infeed = 0.0
        self.fed = 0.0
        self.boxes = 0
        self.in_bundle = 0
        self.delivery = 0
        self.bundles = 0
        self.speed = 0.0
        self.change_left = 0.0
        self.pending: dict[str, Any] = {}
        self.accepting = True
        self.time = dict.fromkeys(("running", "starved", "blocked"), 0.0)

    def on_command(self, name: str, args: dict[str, Any]) -> bool:
        if name == "start":
            self.enabled = True
        elif name == "stop":
            self.enabled = False
        elif name == "order_change":
            self.pending = {k: args[k] for k in ("boxes_per_sheet", "boxes_per_bundle") if k in args}
            self.change_left = self.p["order_change_s"]
            self.emit("order_change_started")
        elif name == "set_speed":
            self.p["speed_sheets_min"] = max(0.0, float(args["sheets_min"]))
        else:
            return False
        return True

    def _set(self, state: str, dt: float) -> None:
        self.state.set(state)
        if state in self.time:
            self.time[state] += dt

    def update(self, ctx: StepContext) -> None:
        dt = ctx.dt
        p = self.p
        self.speed = 0.0
        # pilas que llegan: entran al alimentador cuando cabe una completa
        inflow = self.inputs["inflow_upm"]
        inflow = p["nominal_inflow_upm"] if inflow is None else float(inflow)
        self.arrivals = min(self.arrivals + inflow / 60.0 * dt, 2.0)
        room = p["infeed_stacks"] * p["sheets_per_stack"] - self.infeed
        while self.arrivals >= 1.0 and room >= p["sheets_per_stack"]:
            self.arrivals -= 1.0
            self.infeed += p["sheets_per_stack"]
            room -= p["sheets_per_stack"]
        self.accepting = room >= p["sheets_per_stack"] and self.arrivals < 1.0
        # fajos que salen: uno por paso cuando la banda recibe
        if self.delivery > 0 and self.inputs["downstream_free"]:
            self.delivery -= 1
            self.bundles += 1
        if self.failures.stopping is not None:
            return
        if self.change_left > 0.0:
            self.change_left = max(0.0, self.change_left - dt)
            self._set("setup", dt)
            if self.change_left == 0.0:
                p.update(self.pending)
                self.pending = {}
                self.emit("order_change_done")
            return
        if not self.enabled:
            self._set("idle", dt)
            return
        if self.delivery >= p["delivery_bundles"]:
            self._set("blocked", dt)
            return
        if self.infeed < 1.0:
            if self.state.current == "running":
                self.emit("infeed_empty")
            self._set("starved", dt)
            return
        self._set("running", dt)
        self.speed = p["speed_sheets_min"] * (0.85 if self.failures.is_active("worn_die") else 1.0)
        sheets = min(self.infeed, self.speed / 60.0 * dt)
        before = int(self.fed)
        self.fed += sheets
        self.infeed -= sheets
        for _ in range(int(self.fed) - before):
            self.boxes += p["boxes_per_sheet"]
            self.in_bundle += p["boxes_per_sheet"]
            while self.in_bundle >= p["boxes_per_bundle"]:
                self.in_bundle -= p["boxes_per_bundle"]
                self.delivery += 1
                self.emit("bundle_completed", bundle=self.bundles + self.delivery)

    def true_values(self) -> dict[str, Any]:
        per = self.p["sheets_per_stack"]
        return {
            "speed_actual": self.speed,
            "sheets_fed": int(self.fed),
            "boxes_count": self.boxes,
            "bundles_count": self.bundles,
            "infeed_sheets": int(self.infeed),
            "infeed_stacks": -int(-self.infeed // per) if self.infeed >= 1.0 else 0,
            "bundle_fill_pct": 100.0 * self.in_bundle / self.p["boxes_per_bundle"],
            "delivery_bundles": self.delivery,
            "accepting": 1 if self.accepting else 0,
        }

    def kpis(self) -> dict[str, Any]:
        hours = self.t / 3600.0
        share = {f"{k}_pct": v / self.t if self.t > 0 else 0.0 for k, v in self.time.items()}
        return {"boxes_per_h": self.boxes / hours if hours > 0 else 0.0, **share}

    def animation(self) -> dict[str, float]:
        light = {"running": 1.0, "idle": 0.0, "fault": 3.0}.get(self.state.current, 2.0)
        cap = self.p["infeed_stacks"] * self.p["sheets_per_stack"]
        return {"running": 1.0 if self.speed > 0 else 0.0, "infeed_fill": self.infeed / cap, "stack_light": light}
