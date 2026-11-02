"""Colector de los cuatro drenajes y bifurcación balanceada hacia dos tanques."""

from __future__ import annotations

from typing import Any

from twin_runtime import EquipmentBehavior, StepContext


class DrainManifold(EquipmentBehavior):
    type = "drain-manifold"
    DEFAULT_INPUTS = {"inlet_flow_kg_h": 0.0}

    def setup(self) -> None:
        self.inlet_flow_kg_h = 0.0
        self.tank_1_flow_kg_h = 0.0
        self.tank_2_flow_kg_h = 0.0

    def update(self, ctx: StepContext) -> None:
        self.inlet_flow_kg_h = max(0.0, float(self.inputs["inlet_flow_kg_h"] or 0.0))
        share = min(1.0, max(0.0, float(self.p["tank_1_share"])))
        self.tank_1_flow_kg_h = self.inlet_flow_kg_h * share
        # Restar en vez de multiplicar la segunda fracción evita una deriva de redondeo en el balance.
        self.tank_2_flow_kg_h = self.inlet_flow_kg_h - self.tank_1_flow_kg_h
        self.state.set("running" if self.inlet_flow_kg_h > 1e-9 else "idle")

    def true_values(self) -> dict[str, Any]:
        return {
            "inlet_flow_kg_h": self.inlet_flow_kg_h,
            "tank_1_flow_kg_h": self.tank_1_flow_kg_h,
            "tank_2_flow_kg_h": self.tank_2_flow_kg_h,
            "balance_error_kg_h": self.inlet_flow_kg_h - self.tank_1_flow_kg_h - self.tank_2_flow_kg_h,
        }

    def animation(self) -> dict[str, float]:
        return {
            "flow_norm": min(1.0, self.inlet_flow_kg_h / self.p["design_flow_kg_h"]),
            "tank_1_share": self.p["tank_1_share"],
        }
