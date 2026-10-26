"""Contrasta un día PLC/Fractal con entrada PRS objetivo y salida AUTO fija.

El perfil configura entrada PRS 70 mca (traducida a setpoint de descarga mediante el diferencial actual)
y salida fija AUTO 40 mca. Las presiones de entrada reales se miden; no se afirma que el PLC Grundfos use
esta lógica ni que la entrada se mantenga exactamente en 70 mca.
"""

from __future__ import annotations

import argparse
import csv
import json
import statistics
import sys
from pathlib import Path
from typing import Any

from twin_emulator_api.main import _plant_model
from twin_emulator_api.profiles import normalize_profile
from twin_emulator_api.sessions import PlantSession

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
PLANT_ID = "water-network-scale-v1"
PROFILE_PATH = ROOT / "industrial-models" / PLANT_ID / "operation-profiles" / "pdd-prs-fijo-01.json"
FLOW_KEYS = ("pump_supply_outlet", "prs_outlet", *(f"floor_{level}_local" for level in range(1, 5)), "supply_tank_inlet")


def _error_statistics(pairs: list[tuple[float, float]]) -> dict[str, Any]:
    """Errores emparejados F−PLC; porcentaje indefinido con referencia cero."""
    def describe(values: list[float]) -> dict[str, Any]:
        return {
            "n": len(values), "mean": statistics.mean(values) if values else None,
            "population_std": statistics.pstdev(values) if values else None,
            "population_variance": statistics.pvariance(values) if values else None,
            "max_absolute": max(map(abs, values)) if values else None,
        }

    return {
        "absolute_m3h": describe([f - e for e, f in pairs]),
        "relative_pct_nonzero_reference": describe([100 * (f - e) / e for e, f in pairs if e != 0]),
        "zero_reference_count": sum(e == 0 for e, _ in pairs),
        "both_zero_count": sum(e == f == 0 for e, f in pairs),
        "zero_reference_nonzero_forecast_count": sum(e == 0 and f != 0 for e, f in pairs),
    }


def _flow_statistics(comparison: list[dict[str, Any]]) -> dict[str, Any]:
    pairs = {
        key: [(row[f"emulator_{key}_m3h"], row[f"fractal_{key}_m3h"]) for row in comparison
              if row.get(f"emulator_{key}_m3h") is not None and row.get(f"fractal_{key}_m3h") is not None]
        for key in FLOW_KEYS
    }
    return {
        "method": "100*(Fractal-PLC)/PLC; population statistics; nominal hourly endpoints, equal weight per signal; "
                  "not physical confidence or independent samples; zero references excluded only from relative statistics",
        "by_signal": {key: _error_statistics(values) for key, values in pairs.items()},
        "distribution_only_pooled": _error_statistics([pair for key in FLOW_KEYS[:-1] for pair in pairs[key]]),
    }


def _house_pressures(plant: Any) -> dict[str, float]:
    pressures = {}
    for level in range(1, 5):
        grid = plant.equipment[f"grid-0{level}"].true_values()
        pressures.update(
            {f"L{level}.C{branch}{house}": float(grid[f"p_c{branch}{house}"]) for branch in range(1, 5) for house in range(1, 5)}
        )
    return pressures


def _fractal_results(frames: list[dict[str, Any]], emulator_hourly: list[dict[str, Any]]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    fractal_hourly = []
    fractal_min = {"pressure_mca": float("inf"), "profile_hour": None, "demand_factor": None, "dwelling": None}
    nominal_min = {"pressure_mca": float("inf"), "profile_hour": None, "dwelling": None}
    for frame in frames:
        state = frame["end_state"]
        pressure_map = state["consumer_pressures_mca"]
        dwelling, pressure = min(pressure_map.items(), key=lambda item: item[1])
        if pressure < nominal_min["pressure_mca"]:
            nominal_min = {"pressure_mca": pressure, "profile_hour": frame["profile_hour"], "dwelling": dwelling}
        demand_scenarios = []
        for scenario in frame["scenarios"]:
            scenario_houses = scenario["state"]["consumer_pressures_mca"]
            scenario_dwelling, scenario_pressure = min(scenario_houses.items(), key=lambda item: item[1])
            demand_scenarios.append(
                {
                    "demand_factor": scenario["demand_factor"],
                    "minimum_dwelling_pressure_mca": round(float(scenario_pressure), 5),
                    "minimum_dwelling": scenario_dwelling,
                    "feasible": scenario["feasible"],
                }
            )
            if scenario_pressure < fractal_min["pressure_mca"]:
                fractal_min = {
                    "pressure_mca": scenario_pressure,
                    "profile_hour": frame["profile_hour"],
                    "demand_factor": scenario["demand_factor"],
                    "dwelling": scenario_dwelling,
                }
        worst_scenario = min(demand_scenarios, key=lambda item: item["minimum_dwelling_pressure_mca"])
        fractal_hourly.append(
            {
                "profile_hour": frame["profile_hour"],
                "start_t_s": frame["start_t_s"],
                "end_t_s": frame["end_t_s"],
                "prs_inlet_mca": round(float(state["prs_inlet_mca"]), 5),
                "prs_outlet_mca": round(float(state["prs_outlet_mca"]), 5),
                "minimum_dwelling_pressure_mca": round(float(pressure), 5),
                "minimum_dwelling": dwelling,
                "flows_m3h": {
                    "pump_supply_outlet": float(state["flow_m3h"]),
                    "prs_outlet": float(state["flow_m3h"]),
                    **{f"floor_{level}_local": float(state["level_flows_m3h"][str(level)]) for level in range(1, 5)},
                    "supply_tank_inlet": float(frame["plc_tags"]["PLC.Pump.RecirculationFlowM3h"]),
                },
                "minimum_across_demand_scenarios": worst_scenario["minimum_dwelling_pressure_mca"],
                "worst_demand_factor": worst_scenario["demand_factor"],
                "worst_demand_dwelling": worst_scenario["minimum_dwelling"],
                "demand_scenarios": demand_scenarios,
                "manual_branch_open": frame["snapshot"]["equipment"]["prs-01"]["animation"]["valve_b_open"] > 0,
            }
        )
    if len(emulator_hourly) != len(fractal_hourly):
        raise RuntimeError(f"cantidad horaria distinta PLC/Fractal: {len(emulator_hourly)} vs {len(fractal_hourly)}")
    comparison = [
        {
            "t_s": emulator["t_s"],
            "profile_hour": fractal["profile_hour"],
            "emulator_prs_inlet_mca": emulator["prs_inlet_mca"],
            "fractal_prs_inlet_mca": fractal["prs_inlet_mca"],
            "emulator_prs_outlet_mca": emulator["prs_outlet_mca"],
            "fractal_prs_outlet_mca": fractal["prs_outlet_mca"],
            "emulator_min_dwelling_pressure_mca": emulator["minimum_dwelling_pressure_mca"],
            "fractal_min_dwelling_pressure_mca": fractal["minimum_dwelling_pressure_mca"],
            "fractal_worst_demand_minimum_mca": fractal["minimum_across_demand_scenarios"],
            "fractal_worst_demand_factor": fractal["worst_demand_factor"],
            **{f"{source}_{key}_m3h": row.get("flows_m3h", {}).get(key)
               for source, row in (("emulator", emulator), ("fractal", fractal)) for key in FLOW_KEYS},
        }
        for emulator, fractal in zip(emulator_hourly, fractal_hourly, strict=True)
    ]
    return {
        "coverage_t_s": [frames[0]["start_t_s"], frames[-1]["end_t_s"]],
        "hourly_frames": len(frames),
        "minimum_dwelling_pressure": fractal_min,
        "nominal_minimum_dwelling_pressure": nominal_min,
        "hourly": fractal_hourly,
    }, comparison


def refresh_fractal(output: Path) -> dict[str, Any]:
    """Reproyecta el bloque Fractal desde el mismo estado inicial reproducible, sin repetir el día del PLC."""
    result = json.loads(output.read_text(encoding="utf-8"))
    raw = json.loads(PROFILE_PATH.read_text(encoding="utf-8"))
    profile = normalize_profile(raw)
    plant = _plant_model(PLANT_ID).create(seed=1, random_faults=False, horizon_s=86400)
    session = PlantSession("prs-fixed-outlet-validation", PLANT_ID, plant, f"builtin-{PLANT_ID}-{raw['id']}", profile)
    for _ in range(30):
        session.apply_profile_hour(int(plant.t // 3600))
        plant.step()
    tags = session.message()["plc_tags"]
    from fractal.hydraulics.runtime.mpc import project_24h

    frames = project_24h(tags, profile, horizon_hours=24)
    result["fractal"], result["comparison_at_same_hour_boundaries"] = _fractal_results(frames, result["emulator"]["hourly"])
    result["flow_error_statistics"] = _flow_statistics(result["comparison_at_same_hour_boundaries"])
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    _write_hourly_csv(result, output.with_name(f"{output.stem}-hourly.csv"))
    return result


def _write_hourly_csv(result: dict[str, Any], output: Path) -> None:
    fields = [
        "profile_hour", "t_s", "emulator_prs_inlet_mca", "fractal_prs_inlet_mca",
        "emulator_prs_outlet_mca", "fractal_prs_outlet_mca",
        "emulator_min_dwelling_pressure_mca", "fractal_min_dwelling_pressure_mca",
        "fractal_worst_demand_minimum_mca", "fractal_worst_demand_factor",
    ]
    fields += [f"{source}_{key}_m3h" for key in FLOW_KEYS for source in ("emulator", "fractal")]
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        writer.writerows(result["comparison_at_same_hour_boundaries"])


def run(output: Path) -> dict[str, Any]:
    raw = json.loads(PROFILE_PATH.read_text(encoding="utf-8"))
    profile = normalize_profile(raw)
    profile_id = f"builtin-{PLANT_ID}-{raw['id']}"
    plant = _plant_model(PLANT_ID).create(seed=1, random_faults=False, horizon_s=86400)
    session = PlantSession("prs-fixed-outlet-validation", PLANT_ID, plant, profile_id, profile)
    session.apply_profile_hour(0)

    from fractal.hydraulics.runtime.mpc import project_24h

    frames: list[dict[str, Any]] | None = None
    min_house = {"pressure_mca": float("inf"), "t_s": None, "dwelling": None}
    inlet_range = [float("inf"), -float("inf")]
    outlet_range = [float("inf"), -float("inf")]
    manual_flow_max = 0.0
    below_15_samples = 0
    hourly: list[dict[str, Any]] = []
    samples = 0

    while plant.t < 86400 - 1e-9:
        session.apply_profile_hour(int(plant.t // 3600))
        plant.step()
        if plant.t < 30 - 1e-9:
            continue
        if frames is None:
            tags = session.message()["plc_tags"]
            frames = project_24h(tags, profile, horizon_hours=24)
        samples += 1
        pressures = _house_pressures(plant)
        dwelling, pressure = min(pressures.items(), key=lambda item: item[1])
        if pressure < min_house["pressure_mca"]:
            min_house = {"pressure_mca": pressure, "t_s": plant.t, "dwelling": dwelling}
        if pressure < 15:
            below_15_samples += 1
        prs = plant.equipment["prs-01"].true_values()
        inlet = float(prs["inlet_pressure_mca"])
        outlet = float(prs["outlet_pressure_mca"])
        inlet_range = [min(inlet_range[0], inlet), max(inlet_range[1], inlet)]
        outlet_range = [min(outlet_range[0], outlet), max(outlet_range[1], outlet)]
        manual_flow_max = max(manual_flow_max, float(prs["flow_manual_m3h"]))
        if abs(plant.t / 3600 - round(plant.t / 3600)) < 1e-9:
            hour = int(plant.t // 3600)
            hourly.append(
                {
                    "hour_boundary": hour,
                    "t_s": plant.t,
                    "prs_inlet_mca": round(inlet, 5),
                    "prs_outlet_mca": round(outlet, 5),
                    "minimum_dwelling_pressure_mca": round(pressure, 5),
                    "minimum_dwelling": dwelling,
                    "manual_branch_flow_m3h": round(float(prs["flow_manual_m3h"]), 8),
                    "flows_m3h": {
                        "pump_supply_outlet": float(plant.equipment["pumpset-main-01"].true_values()["flow_m3h"]),
                        "prs_outlet": float(prs["flow_m3h"]),
                        **{f"floor_{level}_local": float(plant.equipment[f"grid-0{level}"].true_values()["flow_in_m3h"])
                           for level in range(1, 5)},
                        "supply_tank_inlet": float(plant.equipment["tank-supply-01"].true_values()["inflow_kg_h"])
                        / float(plant.equipment["tank-supply-01"].p["density_kg_m3"]),
                    },
                }
            )
            if hour % 4 == 0:
                print(f"PLC replay t={plant.t:.0f}s · min hogar={pressure:.2f} mca", flush=True)

    assert frames is not None
    fractal_report, comparison = _fractal_results(frames, hourly)
    result = {
        "scenario": raw["name"],
        "assumptions": [
            "70 mca es objetivo de entrada PRS; el emulador lo aproxima ajustando el setpoint de descarga "
            "según el diferencial medido bomba→PRS al aplicar cada hora.",
            "La presión de entrada resultante es medida y puede apartarse del objetivo por dinámica del caudal y el control de la bomba.",
            "La salida AUTO se fija en 40 mca; la rama manual permanece cerrada. El control hidráulico simulado "
            "no identifica la lógica del PLC Grundfos real.",
            "No se aplicaron mandos a infraestructura física; proyección y reproducción son de solo lectura sobre el PLC virtual.",
        ],
        "emulator": {
            "coverage_t_s": [30, 86400],
            "one_second_samples": samples,
            "minimum_dwelling_pressure": min_house,
            "prs_inlet_range_mca": [round(value, 5) for value in inlet_range],
            "prs_outlet_range_mca": [round(value, 5) for value in outlet_range],
            "manual_branch_flow_max_m3h": round(manual_flow_max, 8),
            "pressure_below_15_one_second_sample_count": below_15_samples,
            "pressure_below_15_hour_boundary_count": sum(row["minimum_dwelling_pressure_mca"] < 15 for row in hourly),
            "hourly": hourly,
        },
        "fractal": fractal_report,
        "comparison_at_same_hour_boundaries": comparison,
        "flow_error_statistics": _flow_statistics(comparison),
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    _write_hourly_csv(result, output.with_name(f"{output.stem}-hourly.csv"))
    print(f"Informe escrito: {output}", flush=True)
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path("/tmp/prs-fixed-outlet-validation.json"))
    parser.add_argument(
        "--refresh-fractal", action="store_true", help="reproyecta Fractal en el informe existente sin repetir el replay PLC"
    )
    args = parser.parse_args()
    if args.refresh_fractal:
        report = refresh_fractal(args.output)
        print(f"Fractal actualizado: mínimo en escenarios = {report['fractal']['minimum_dwelling_pressure']}", flush=True)
    else:
        run(args.output)


if __name__ == "__main__":
    main()
