"""Búsqueda por presión de salida de PRS, con las demandas PLC fijas."""

from __future__ import annotations

import importlib.util
from math import acos, cos, pi
from pathlib import Path
from typing import Any

MODEL = Path(__file__).resolve().parents[1] / "models" / "water-network-scale-v1" / "model.py"
spec = importlib.util.spec_from_file_location("fractal_water_model", MODEL)
module = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(module)

TARGET_PRESSURE_MCA = 18.0
HARD_MIN_PRESSURE_MCA = 15.0
SETTING_TOLERANCE_MCA = 0.005
NUMERICAL_PRESSURE_MARGIN_MCA = 0.05
MAX_INTERPOLATIONS = 16

# Curva cosenoidal S: presión y derivada suaves en apertura/cierre.
OPENING_MIN_PCT = 20.0
OPENING_HIGH_PCT = 100.0
OUTLET_AT_MIN_OPENING_MCA = 15.0


def _critical_value(state: dict[str, Any]) -> float:
    point = state.get("control_point_pressure_mca")
    return float(state["critical_pressure_mca"] if point is None else point)


def _outlet_for_opening(opening_pct: float, inlet_mca: float) -> float:
    span = inlet_mca - OUTLET_AT_MIN_OPENING_MCA
    if span <= 0:
        return OUTLET_AT_MIN_OPENING_MCA
    t = min(1.0, max(0.0, (opening_pct - OPENING_MIN_PCT) / (OPENING_HIGH_PCT - OPENING_MIN_PCT)))
    eased = (1.0 - cos(pi * t)) / 2.0
    return OUTLET_AT_MIN_OPENING_MCA + eased * span


def _opening_for_outlet(outlet_mca: float, inlet_mca: float) -> float | None:
    pressure_span = inlet_mca - OUTLET_AT_MIN_OPENING_MCA
    if pressure_span <= 0 or not OUTLET_AT_MIN_OPENING_MCA <= outlet_mca <= inlet_mca:
        return None
    eased = (outlet_mca - OUTLET_AT_MIN_OPENING_MCA) / pressure_span
    t = acos(1.0 - 2.0 * eased) / pi
    opening = OPENING_MIN_PCT + t * (OPENING_HIGH_PCT - OPENING_MIN_PCT)
    return round(opening, 2)


def optimize(
    tags: dict[str, Any],
    demand_factor: float = 1.0,
    objective_id: str = "OBJ-LEAK-01",
    *,
    vertical_openings_pct: tuple[float, float, float] | None = None,
    critical_consumer_id: str | None = None,
    reference_prs_mca: float | None = None,
) -> dict[str, Any]:
    """Encuentra la menor consigna PRS que mantiene 18 mca; 15 mca es el piso duro.

    Las aperturas de viviendas, fugas y válvulas entre pisos vienen del escenario
    PLC y se mantienen fijas. Una interpolación lineal acotada va estimando la
    consigna requerida y cada estimación se vuelve a resolver hidráulicamente.
    """
    del objective_id  # El objetivo aquí es mantener presión, no mover otras válvulas.
    if vertical_openings_pct is None:
        vertical_openings_pct = tuple(
            float(tags.get(f"PLC.Valve.Vertical{connection}OpeningPct", 100.0))
            for connection in (12, 23, 34)
        )
    openings = tuple(float(value) for value in vertical_openings_pct)
    station = module.MODEL["equipment_models"]["prs-01"]["params"]
    low = float(station.get("auto_min_outlet_mca", 15.0))
    high = float(station.get("auto_max_outlet_mca", 40.0))
    current = float(reference_prs_mca or tags.get("PLC.PRS.ManualSettingMca") or tags.get("PLC.PRS.OutletPressureMca") or low)
    base = module.evaluate(
        tags,
        prs_mca=current,
        vertical_openings_pct=openings,
        demand_factor=demand_factor,
        critical_consumer_id=critical_consumer_id,
    )
    fixed_flows_m3h = {
        **{
            f"L{level}.C{branch}{position}": float(base["consumer_flows_l_min"][f"L{level}.C{branch}{position}"]) * 0.06
            for level in range(1, 5)
            for branch in range(1, 5)
            for position in range(1, 5)
        },
        **{
            f"L{level}.{leak}": float(base["leak_flows_l_min"][f"L{level}.{leak}"]) * 0.06
            for level in range(1, 5)
            for leak in ("L1", "L2")
        },
    }

    def evaluate(setting: float) -> dict[str, Any]:
        return module.evaluate(
            tags,
            prs_mca=setting,
            vertical_openings_pct=openings,
            demand_factor=1.0,
            critical_consumer_id=critical_consumer_id,
            fixed_flows_m3h=fixed_flows_m3h,
        )

    low_state, high_state = evaluate(low), evaluate(high)
    high_pressure = _critical_value(high_state)
    target = TARGET_PRESSURE_MCA if high_pressure >= TARGET_PRESSURE_MCA else HARD_MIN_PRESSURE_MCA
    # Pequeño margen numérico para que el estado re-evaluado de fin de hora
    # conserve el mínimo operativo aunque cambien las condiciones hidráulicas.
    search_target = target + NUMERICAL_PRESSURE_MARGIN_MCA
    target_met = high_pressure >= TARGET_PRESSURE_MCA

    # Si ni a máxima salida se conserva 15 mca, devolver el mejor caso posible,
    # marcado inviable para que no se publique como una recomendación factible.
    if high_pressure < HARD_MIN_PRESSURE_MCA:
        setting, state = high, high_state
        status = "below_hard_minimum"
    elif _critical_value(low_state) >= search_target:
        setting, state = low, low_state
        status = "target_18_met" if target_met else "fallback_15_used"
    else:
        left, right = low, high
        left_state, right_state = low_state, high_state
        for _ in range(MAX_INTERPOLATIONS):
            left_pressure = _critical_value(left_state)
            right_pressure = _critical_value(right_state)
            width = right - left
            if width <= SETTING_TOLERANCE_MCA:
                break
            if right_pressure > left_pressure + 1e-9:
                candidate = left + (search_target - left_pressure) * width / (right_pressure - left_pressure)
                # Evita estancarse si la curva local no es perfectamente lineal.
                candidate = min(right - width * 0.1, max(left + width * 0.1, candidate))
            else:
                candidate = (left + right) / 2
            candidate_state = evaluate(candidate)
            if _critical_value(candidate_state) >= search_target:
                right, right_state = candidate, candidate_state
            else:
                left, left_state = candidate, candidate_state
        setting, state = right, right_state
        status = "target_18_met" if target_met else "fallback_15_used"

    inlet = float(state["prs_inlet_mca"])
    outlet = float(state["prs_outlet_mca"])
    required_opening = _opening_for_outlet(outlet, inlet)
    opening_in_range = required_opening is not None and OPENING_MIN_PCT <= required_opening <= OPENING_HIGH_PCT
    opening_status = "within_calibrated_range" if opening_in_range else "outside_calibrated_range"
    state = state | {
        "prs_mca": round(setting, 3),
        "valve_12_pct": openings[0],
        "valve_23_pct": openings[1],
        "valve_34_pct": openings[2],
        "vrp_opening_pct": required_opening if opening_in_range else None,
        "vrp_opening_required_pct": required_opening,
        "opening_curve_status": opening_status,
        "target_pressure_mca": TARGET_PRESSURE_MCA,
        "applied_pressure_target_mca": target,
        "numerical_pressure_margin_mca": NUMERICAL_PRESSURE_MARGIN_MCA,
        "target_met": target_met,
        "optimization_status": status,
        "opening_curve_assumption": {
            "kind": "cosine_ease_in_out",
            "endpoint_slope": "zero",
            "source": "user_defined_calibration_scenario",
            "opening_min_pct": OPENING_MIN_PCT,
            "outlet_at_min_opening_mca": OUTLET_AT_MIN_OPENING_MCA,
            "opening_high_pct": OPENING_HIGH_PCT,
            "outlet_at_high_opening_mca": round(inlet, 3),
        },
    }
    hard_feasible = bool(state["feasible"]) and _critical_value(state) >= HARD_MIN_PRESSURE_MCA and opening_in_range
    return {
        "base": base,
        "optimized": state,
        "fixed_flows_m3h": fixed_flows_m3h,
        "constraints_satisfied": hard_feasible,
        "target_met": target_met,
    }
