"""Búsqueda de la consigna PRS para una presión mínima definida por el usuario."""

from __future__ import annotations

import importlib.util
from math import acos, cos, pi
from pathlib import Path
from typing import Any

MODEL = Path(__file__).resolve().parents[1] / "hydraulics" / "models" / "water-network-scale-v1" / "model.py"
spec = importlib.util.spec_from_file_location("fractal_water_model", MODEL)
module = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(module)

SETTING_TOLERANCE_MCA = 0.005
NUMERICAL_PRESSURE_MARGIN_MCA = 0.05
MAX_INTERPOLATIONS = 16
TARGET_PRESSURE_MIN_MCA = 10.0
TARGET_PRESSURE_MAX_MCA = 45.0

# Hipótesis de conversión presión-apertura; no representa una curva física Kv-apertura validada.
OPENING_MIN_PCT = 20.0
OPENING_HIGH_PCT = 100.0
OUTLET_AT_MIN_OPENING_MCA = 15.0


def _critical_value(state: dict[str, Any]) -> float:
    """Presión mínima global de las viviendas; un punto de control no sustituye a las demás."""
    pressures = state.get("consumer_pressures_mca")
    if pressures is not None:
        if len(pressures) != 64:
            raise ValueError("se requieren presiones de las 64 viviendas para validar el objetivo")
        return min(float(pressure) for pressure in pressures.values())
    # Compatibilidad con resultados de solvers antiguos que publican el mínimo global.
    return float(state["critical_pressure_mca"])


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
    return round(OPENING_MIN_PCT + t * (OPENING_HIGH_PCT - OPENING_MIN_PCT), 2)


def evaluate_fixed_opening(
    tags: dict[str, Any], opening_pct: float, *,
    vertical_openings_pct: tuple[float, float, float] = (100.0, 100.0, 100.0),
    required_min_pressure_mca: float = 18.0,
) -> dict[str, Any]:
    """Ensayo de apertura fija con la curva asumida; no es un mando PLC.

    En apertura total el suministro queda limitado por pérdidas aguas arriba;
    `prs_available` deja de describir un regulador activo, no el caudal pasante.
    """
    if not 20 <= opening_pct <= 100:
        raise ValueError("apertura fuera de la curva asumida (20–100 %)")
    setting = float(tags.get("PLC.PRS.OutletPressureMca") or 20)
    state: dict[str, Any] = {}
    for _ in range(12):
        state = module.evaluate(
            tags, prs_mca=setting, vertical_openings_pct=vertical_openings_pct,
            required_min_pressure_mca=required_min_pressure_mca,
        )
        desired = _outlet_for_opening(opening_pct, float(state["prs_inlet_mca"]))
        if abs(setting - desired) < 1e-5:
            break
        setting = desired
    state = module.evaluate(
        tags, prs_mca=setting, vertical_openings_pct=vertical_openings_pct,
        required_min_pressure_mca=required_min_pressure_mca,
    )
    conditions = state["constraint_results"]
    return {
        "opening_pct": opening_pct,
        "curve_quality": "assumed_user_defined_curve_not_physically_validated",
        "inlet_mca": state["prs_inlet_mca"],
        "outlet_mca": state["prs_outlet_mca"],
        "minimum_home_pressure_mca": _critical_value(state),
        "all_homes_above_target": _critical_value(state) >= required_min_pressure_mca,
        "leakage_m3h": state["leakage_m3h"],
        "prs_regulating": conditions["prs_available"],
        "other_model_constraints_satisfied": all(value for name, value in conditions.items() if name != "prs_available"),
        "model_state": state,
        "applied": False,
    }


def optimize_opening(
    tags: dict[str, Any], target_pressure_mca: float, *,
    vertical_openings_pct: tuple[float, float, float] = (100.0, 100.0, 100.0),
    **_unused: Any,
) -> dict[str, Any]:
    """Busca determinísticamente la menor apertura factible de la curva asumida."""
    if isinstance(target_pressure_mca, bool) or not TARGET_PRESSURE_MIN_MCA <= target_pressure_mca <= TARGET_PRESSURE_MAX_MCA:
        raise ValueError("target_pressure_mca debe estar entre 10 y 45 mca")

    def evaluate(opening: float) -> dict[str, Any]:
        return evaluate_fixed_opening(
            tags, opening, vertical_openings_pct=vertical_openings_pct,
            required_min_pressure_mca=target_pressure_mca,
        )

    def acceptable(result: dict[str, Any]) -> bool:
        # Margen numérico: el frame se vuelve a resolver tras actualizar tanques.
        return bool(result["minimum_home_pressure_mca"] >= target_pressure_mca + NUMERICAL_PRESSURE_MARGIN_MCA
                    and result["other_model_constraints_satisfied"]
                    and (result["prs_regulating"] or result["opening_pct"] == OPENING_HIGH_PCT))

    low, high = OPENING_MIN_PCT, OPENING_HIGH_PCT
    lower, upper = evaluate(low), evaluate(high)
    if acceptable(lower):
        chosen = lower
    elif not acceptable(upper):
        chosen = upper
    else:
        for _ in range(16):
            mid = (low + high) / 2
            candidate = evaluate(mid)
            if acceptable(candidate):
                high, upper = mid, candidate
            else:
                low = mid
        chosen = upper
    state = dict(chosen["model_state"])
    possible = acceptable(chosen)
    state.update({
        "prs_mca": state["prs_mca"],
        "vrp_opening_pct": chosen["opening_pct"] if possible else None,
        "vrp_opening_required_pct": chosen["opening_pct"],
        "opening_curve_status": "assumed_fixed_opening_not_physically_validated",
        "target_pressure_mca": target_pressure_mca,
        "target_met": chosen["all_homes_above_target"],
        "optimization_status": "minimum_feasible_opening" if possible else "target_unreachable",
        "optimization_objective": "minimum_hourly_vrp_opening_for_all_64_homes",
    })
    return {"optimized": state, "constraints_satisfied": possible, "target_met": state["target_met"]}


def optimize(
    tags: dict[str, Any],
    target_pressure_mca: float,
    *,
    vertical_openings_pct: tuple[float, float, float] | None = None,
    critical_consumer_id: str | None = None,
    reference_prs_mca: float | None = None,
) -> dict[str, Any]:
    """Minimiza la consigna de salida que satisface la presión mínima solicitada.

    Las aperturas horarias del perfil (viviendas, fugas y válvulas entre pisos)
    permanecen fijas. El solver calcula los caudales resultantes para cada candidato;
    no se congelan caudales históricos como si fueran mandos.
    """
    if isinstance(target_pressure_mca, bool) or not isinstance(target_pressure_mca, (int, float)):
        raise ValueError("target_pressure_mca debe estar entre 10 y 45 mca")
    target = float(target_pressure_mca)
    if not TARGET_PRESSURE_MIN_MCA <= target <= TARGET_PRESSURE_MAX_MCA:
        raise ValueError("target_pressure_mca debe estar entre 10 y 45 mca")
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
        critical_consumer_id=critical_consumer_id,
    )

    def evaluate(setting: float) -> dict[str, Any]:
        return module.evaluate(
            tags,
            prs_mca=setting,
            vertical_openings_pct=openings,
            critical_consumer_id=critical_consumer_id,
            required_min_pressure_mca=target,
        )

    low_state, high_state = evaluate(low), evaluate(high)
    candidates: list[tuple[float, dict[str, Any]]] = [(low, low_state), (high, high_state)]
    high_pressure = _critical_value(high_state)
    target_met = high_pressure >= target
    search_target = target + NUMERICAL_PRESSURE_MARGIN_MCA
    if not target_met:
        setting, state = high, high_state
        status = "target_unreachable"
    elif _critical_value(low_state) >= search_target:
        setting, state = low, low_state
        status = "target_met_at_minimum_setting"
    elif high_pressure < search_target:
        setting, state = high, high_state
        status = "target_met_at_upper_setting"
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
                candidate = min(right - width * 0.1, max(left + width * 0.1, candidate))
            else:
                candidate = (left + right) / 2
            candidate_state = evaluate(candidate)
            candidates.append((candidate, candidate_state))
            if _critical_value(candidate_state) >= search_target:
                right, right_state = candidate, candidate_state
            else:
                left, left_state = candidate, candidate_state
        setting, state = right, right_state
        status = "target_met"

    # La presión mínima es una restricción; la fuga modelada es el criterio
    # para escoger entre candidatos factibles. Se muestrea también por encima
    # del umbral para no suponer que menor consigna siempre significa menos fuga.
    if target_met:
        for index in range(1, 9):
            sample = low + (high - low) * index / 9
            candidates.append((sample, evaluate(sample)))
        feasible_candidates = []
        for candidate_setting, candidate_state in candidates:
            outlet = float(candidate_state["prs_outlet_mca"])
            inlet = float(candidate_state["prs_inlet_mca"])
            opening = _opening_for_outlet(outlet, inlet)
            if (
                _critical_value(candidate_state) >= search_target
                and candidate_state["feasible"]
                and opening is not None
                and OPENING_MIN_PCT <= opening <= OPENING_HIGH_PCT
            ):
                feasible_candidates.append((candidate_setting, candidate_state))
        if feasible_candidates:
            setting, state = min(
                feasible_candidates,
                key=lambda item: (float(item[1]["leakage_m3h"]), item[0]),
            )

    inlet = float(state["prs_inlet_mca"])
    outlet = float(state["prs_outlet_mca"])
    required_opening = _opening_for_outlet(outlet, inlet)
    opening_in_range = required_opening is not None and OPENING_MIN_PCT <= required_opening <= OPENING_HIGH_PCT
    state = state | {
        "prs_mca": round(setting, 3),
        "valve_12_pct": openings[0],
        "valve_23_pct": openings[1],
        "valve_34_pct": openings[2],
        "vrp_opening_pct": required_opening if opening_in_range else None,
        "vrp_opening_required_pct": required_opening,
        "opening_curve_status": "within_assumed_range" if opening_in_range else "outside_assumed_range",
        "target_pressure_mca": target,
        "target_met": target_met,
        "optimization_status": status,
        "optimization_objective": "minimize_modeled_leakage_m3h_among_feasible_candidates",
        "search_quality": "bounded_sampled_candidates_not_global_optimum",
        "opening_curve_assumption": {
            "kind": "cosine_ease_in_out",
            "endpoint_slope": "zero",
            "source": "assumed_user_defined_curve_not_physically_validated",
            "opening_min_pct": OPENING_MIN_PCT,
            "outlet_at_min_opening_mca": OUTLET_AT_MIN_OPENING_MCA,
            "opening_high_pct": OPENING_HIGH_PCT,
            "outlet_at_high_opening_mca": round(inlet, 3),
        },
    }
    # La factibilidad se verifica de nuevo sobre el candidato final, no solo en
    # el extremo superior de la búsqueda (y nunca sobre un único punto de control).
    target_met = _critical_value(state) >= target
    state["target_met"] = target_met
    feasible = bool(state["feasible"]) and target_met and opening_in_range
    return {
        "base": base,
        "optimized": state,
        "constraints_satisfied": feasible,
        "target_met": target_met,
        "target_pressure_mca": target,
        "flow_result_m3h": state["flow_m3h"],
        "leakage_result_m3h": state["leakage_m3h"],
    }
