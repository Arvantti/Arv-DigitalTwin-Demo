"""Búsqueda global y refinamiento local Fractal, independiente del emulador."""

from __future__ import annotations

import importlib.util
from pathlib import Path
from typing import Any

from scipy.optimize import differential_evolution, minimize

MODEL = Path(__file__).resolve().parents[1] / "models" / "water-network-scale-v1" / "model.py"
spec = importlib.util.spec_from_file_location("fractal_water_model", MODEL)
module = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(module)


def optimize(tags: dict[str, Any], demand_factor: float = 1.0, objective_id: str = "OBJ-LEAK-01") -> dict[str, Any]:
    """DE encuentra regiones factibles; SLSQP refina fuga con presión ≥15 mca."""
    manual = float(tags.get("PLC.PRS.OutletPressureMca") or tags.get("PLC.PRS.ManualSettingMca") or 20.0)
    base = module.evaluate(tags, prs_mca=manual, demand_factor=demand_factor)

    def evaluate(x: list[float]) -> dict[str, Any]:
        return module.evaluate(tags, prs_mca=x[0], vertical_openings_pct=(x[1], x[2], x[3]), demand_factor=demand_factor)

    def objective(x: list[float]) -> float:
        result = evaluate(x)
        pressure_penalty = max(0.0, 15.0 - float(result["critical_pressure_mca"])) * 10_000
        hard_penalty = 1_000_000 if not result["feasible"] else 0
        movement = sum(abs(value - baseline) for value, baseline in zip(x, (manual, 100, 100, 100), strict=True)) * 0.001
        if objective_id == "OBJ-ENERGY-01":
            score = float(result["pump_power_kw"])
        elif objective_id == "OBJ-MARGIN-01":
            score = -float(result["critical_pressure_mca"])
        else:
            score = float(result["leakage_m3h"])
        return score + pressure_penalty + hard_penalty + movement

    bounds = [(15.0, 35.0), (0.0, 100.0), (0.0, 100.0), (0.0, 100.0)]
    global_result = differential_evolution(objective, bounds, seed=1, polish=False, workers=1, maxiter=8, popsize=5, tol=0.02, atol=0.005)
    constraints = [
        {"type": "ineq", "fun": lambda x: float(evaluate(x)["critical_pressure_mca"]) - 15.0},
        {"type": "ineq", "fun": lambda x: float(evaluate(x)["pump_discharge_mca"]) - 70.0},
        {"type": "ineq", "fun": lambda x: 26.0 - float(evaluate(x)["flow_m3h"])},
    ]
    refined = minimize(
        objective,
        global_result.x,
        method="SLSQP",
        bounds=bounds,
        constraints=constraints,
        options={"maxiter": 12, "ftol": 1e-4},
    )
    x = refined.x if refined.success else global_result.x
    optimized = evaluate(x) | {
        "prs_mca": round(float(x[0]), 2),
        "valve_12_pct": round(float(x[1]), 1),
        "valve_23_pct": round(float(x[2]), 1),
        "valve_34_pct": round(float(x[3]), 1),
    }
    return {"base": base, "optimized": optimized, "constraints_satisfied": bool(optimized["feasible"])}
