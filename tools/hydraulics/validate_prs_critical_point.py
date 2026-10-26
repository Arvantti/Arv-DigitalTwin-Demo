"""Reproduce un perfil PLC virtual con PRS AUTO que controla el punto fijo L4.C44 a 18 mca.

El replay mide las 64 viviendas a 1 s y lo compara con escenarios Fractal de demanda ×0,9/×1,0/×1,1.
No aplica mandos a una instalación física ni certifica presión continua entre pasos.
"""

from __future__ import annotations

import argparse
import csv
import html
import json
import sys
from pathlib import Path
from typing import Any

from twin_emulator_api.main import _plant_model
from twin_emulator_api.profiles import normalize_profile
from twin_emulator_api.sessions import PlantSession

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
PLANT_ID = "water-network-scale-v1"
PROFILE_PATH = ROOT / "industrial-models" / PLANT_ID / "operation-profiles" / "pdd-prs-punto-critico-18-01.json"


def _house_pressures(plant: Any) -> dict[str, float]:
    return {
        f"L{level}.C{branch}{position}": float(plant.equipment[f"grid-0{level}"].true_values()[f"p_c{branch}{position}"])
        for level in range(1, 5)
        for branch in range(1, 5)
        for position in range(1, 5)
    }


def _fractal_report(frames: list[dict[str, Any]]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    hourly: list[dict[str, Any]] = []
    worst = {"pressure_mca": float("inf")}
    c44_minus_min = {"minimum_mca": float("inf"), "maximum_mca": float("-inf")}
    c44_is_minimum_scenarios = 0
    tied_minimum_house_counts: dict[str, int] = {}
    for frame in frames:
        end_state = frame["end_state"]
        end_pressures = end_state["consumer_pressures_mca"]
        end_minimum = min(end_pressures.values())
        end_c44 = end_pressures["L4.C44"]
        scenario_rows = []
        for scenario in frame["scenarios"]:
            pressures = scenario["state"]["consumer_pressures_mca"]
            minimum_house, minimum = min(pressures.items(), key=lambda item: item[1])
            delta = pressures["L4.C44"] - minimum
            c44_minus_min["minimum_mca"] = min(c44_minus_min["minimum_mca"], delta)
            c44_minus_min["maximum_mca"] = max(c44_minus_min["maximum_mca"], delta)
            if abs(delta) < 1e-5:
                c44_is_minimum_scenarios += 1
            for house, pressure in pressures.items():
                if abs(pressure - minimum) < 1e-5:
                    tied_minimum_house_counts[house] = tied_minimum_house_counts.get(house, 0) + 1
            scenario_rows.append(
                {
                    "demand_factor": scenario["demand_factor"],
                    "minimum_pressure_mca": round(float(minimum), 5),
                    "minimum_dwelling": minimum_house,
                    "c44_pressure_mca": round(float(pressures["L4.C44"]), 5),
                    "c44_minus_global_minimum_mca": round(float(delta), 5),
                    "global_minimum_ties": sorted(house for house, pressure in pressures.items() if abs(pressure - minimum) < 1e-5),
                    "all_houses_at_least_15_mca": minimum >= 15,
                    "consumer_pressures_mca": {house: round(float(pressure), 5) for house, pressure in pressures.items()},
                    "feasible": scenario["feasible"],
                }
            )
            if minimum < worst["pressure_mca"]:
                worst = {
                    "pressure_mca": float(minimum),
                    "profile_hour": frame["profile_hour"],
                    "demand_factor": scenario["demand_factor"],
                    "dwelling": minimum_house,
                }
        worst_scenario = min(scenario_rows, key=lambda row: row["minimum_pressure_mca"])
        prs = frame["profile_commands"].get("prs", {})
        hourly.append(
            {
                "profile_hour": frame["profile_hour"],
                "start_t_s": frame["start_t_s"],
                "end_t_s": frame["end_t_s"],
                "target_mca": prs.get("critical_setpoint_mca"),
                "control_point": prs.get("critical_control_point"),
                "c44_pressure_mca": round(float(end_c44), 5),
                "minimum_pressure_mca": round(float(end_minimum), 5),
                "minimum_dwelling": min(end_pressures, key=end_pressures.get),
                "prs_inlet_mca": round(float(end_state["prs_inlet_mca"]), 5),
                "prs_outlet_mca": round(float(end_state["prs_outlet_mca"]), 5),
                "flows_m3h": {
                    "pump_supply_outlet": round(float(end_state["flow_m3h"]), 5),
                    "prs_outlet": round(float(end_state["flow_m3h"]), 5),
                    **{f"floor_{level}_local": round(float(end_state["level_flows_m3h"][str(level)]), 5) for level in range(1, 5)},
                    "supply_tank_inlet": round(float(frame["plc_tags"].get("PLC.Pump.RecirculationFlowM3h") or 0), 5),
                },
                "tank_levels_pct": {key: round(float(value), 5) for key, value in frame["tank_levels_pct"].items()},
                "worst_scenario_minimum_mca": worst_scenario["minimum_pressure_mca"],
                "worst_scenario_dwelling": worst_scenario["minimum_dwelling"],
                "worst_demand_factor": worst_scenario["demand_factor"],
                "all_scenarios_at_least_15_mca": all(row["minimum_pressure_mca"] >= 15 for row in scenario_rows),
                "scenario_results": scenario_rows,
            }
        )
    report = {
        "coverage_t_s": [frames[0]["start_t_s"], frames[-1]["end_t_s"]],
        "hourly_frames": len(frames),
        "worst_minimum_across_64_homes_and_demand_scenarios": worst,
        "c44_is_a_global_minimum_tie_count": c44_is_minimum_scenarios,
        "scenario_count": sum(len(frame["scenarios"]) for frame in frames),
        "c44_minus_global_minimum_mca_range": {key: round(value, 5) for key, value in c44_minus_min.items()},
        "most_frequently_tied_minimum_homes": sorted(tied_minimum_house_counts.items(), key=lambda item: (-item[1], item[0]))[:12],
        "hourly": hourly,
    }
    return report, hourly


def _write_csv(rows: list[dict[str, Any]], emulator_hourly: list[dict[str, Any]], output: Path) -> None:
    flow_keys = (
        "pump_supply_outlet", "prs_outlet", "floor_1_local", "floor_2_local", "floor_3_local",
        "floor_4_local", "supply_tank_inlet",
    )
    tank_keys = ("tank-supply-01", "tank-recirc-01", "tank-recirc-02")
    base_fields = [
        "profile_hour", "start_t_s", "end_t_s", "target_mca", "control_point", "c44_pressure_mca",
        "minimum_pressure_mca", "minimum_dwelling", "prs_inlet_mca", "prs_outlet_mca",
        "worst_scenario_minimum_mca", "worst_scenario_dwelling", "worst_demand_factor",
        "all_scenarios_at_least_15_mca", "plc_minimum_pressure_mca", "plc_minimum_dwelling",
        "plc_c44_pressure_mca", "plc_prs_outlet_mca", "plc_manual_flow_m3h",
    ]
    fields = base_fields + [f"{source}_{key}_m3h" for key in flow_keys for source in ("plc", "fractal")]
    fields += [f"{source}_{key}_level_pct" for key in tank_keys for source in ("plc", "fractal")]
    plc_by_hour = {int(row["hour_boundary"]): row for row in emulator_hourly}
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        for row in rows:
            plc = plc_by_hour.get(row["profile_hour"] + 1, {})
            writer.writerow({
                **{key: row.get(key) for key in base_fields if not key.startswith("plc_")},
                "plc_minimum_pressure_mca": plc.get("minimum_pressure_mca"),
                "plc_minimum_dwelling": plc.get("minimum_dwelling"),
                "plc_c44_pressure_mca": plc.get("c44_pressure_mca"),
                "plc_prs_outlet_mca": plc.get("prs_outlet_mca"),
                "plc_manual_flow_m3h": plc.get("manual_flow_m3h"),
                **{f"plc_{key}_m3h": plc.get("flows_m3h", {}).get(key) for key in flow_keys},
                **{f"fractal_{key}_m3h": row.get("flows_m3h", {}).get(key) for key in flow_keys},
                **{f"plc_{key}_level_pct": plc.get("tank_levels_pct", {}).get(key) for key in tank_keys},
                **{f"fractal_{key}_level_pct": row.get("tank_levels_pct", {}).get(key) for key in tank_keys},
            })


def _write_flow_chart(result: dict[str, Any], output: Path) -> Path:
    plc_rows = result["emulator"]["hourly"]
    fractal_rows = result["fractal"]["hourly"]
    flow_labels = {
        "pump_supply_outlet": "Salida de bomba de alimentación",
        "prs_outlet": "Salida de estación reguladora (PRS)",
        "floor_1_local": "Caudal local del piso 1",
        "floor_2_local": "Caudal local del piso 2",
        "floor_3_local": "Caudal local del piso 3",
        "floor_4_local": "Caudal local del piso 4",
        "supply_tank_inlet": "Entrada al tanque de alimentación",
    }
    tank_labels = {
        "tank-supply-01": "Tanque de alimentación",
        "tank-recirc-01": "Tanque de recirculación 1",
        "tank-recirc-02": "Tanque de recirculación 2",
    }
    hours = [int(row["hour_boundary"]) for row in plc_rows]
    fractal_by_hour = {int(row["profile_hour"]) + 1: row for row in fractal_rows}
    cards: list[str] = []

    def svg(
        title: str,
        unit: str,
        plc_values: list[float],
        fractal_values: list[float],
        fixed_domain: tuple[float, float] | None = None,
    ) -> str:
        width, height, left, right, top, bottom = 800, 245, 58, 18, 18, 32
        low = fixed_domain[0] if fixed_domain else min(plc_values + fractal_values)
        high = fixed_domain[1] if fixed_domain else max(plc_values + fractal_values)
        if high - low < 1e-8:
            low -= 0.5
            high += 0.5
        elif fixed_domain is None:
            padding = (high - low) * 0.12
            low -= padding
            high += padding
        def x(index: int) -> float:
            return left + index * (width - left - right) / max(1, len(hours) - 1)

        def y(value: float) -> float:
            return top + (high - value) * (height - top - bottom) / (high - low)

        def path(values: list[float]) -> str:
            return " ".join(
                f"{'M' if index == 0 else 'L'}{x(index):.1f},{y(value):.1f}"
                for index, value in enumerate(values)
            )
        grid = []
        for tick in range(5):
            value = low + (high - low) * tick / 4
            yy = y(value)
            grid.append(
                f'<line class="grid" x1="{left}" y1="{yy:.1f}" x2="{width-right}" y2="{yy:.1f}"/>'
                f'<text class="axis" x="{left-7}" y="{yy+4:.1f}" text-anchor="end">{value:.3f}</text>'
            )
        labels = []
        for index, hour in enumerate(hours):
            if index in {0, 3, 7, 11, 15, 19, 23}:
                labels.append(
                    f'<text class="axis" x="{x(index):.1f}" y="{height-8}" text-anchor="middle">{hour:02d}</text>'
                )
        plc_points = "".join(
            f'<circle class="plc-dot" cx="{x(index):.1f}" cy="{y(value):.1f}" r="3.5">'
            f'<title>PLC hora {hours[index]:02d}: {value:.5f} {unit}</title></circle>'
            for index, value in enumerate(plc_values)
        )
        fractal_points = "".join(
            f'<circle class="fractal-dot" cx="{x(index):.1f}" cy="{y(value):.1f}" r="2.1">'
            f'<title>Fractal hora {hours[index]:02d}: {value:.5f} {unit}</title></circle>'
            for index, value in enumerate(fractal_values)
        )
        differences = [p - f for p, f in zip(plc_values, fractal_values, strict=True)]
        delta = max(map(abs, differences), default=0.0)
        delta_scale = max(delta * 1.2, 0.0005)
        def dy(value: float) -> float:
            return 8 + (delta_scale - value) * 42 / (2 * delta_scale)

        delta_path = " ".join(
            f"{'M' if index == 0 else 'L'}{x(index):.1f},{dy(value):.1f}"
            for index, value in enumerate(differences)
        )
        difference_chart = (
            f'<div class="delta-title">PLC − Fractal · escala ampliada ±{delta_scale:.5f} {unit} (Δmáx {delta:.5f})</div>'
            f'<svg viewBox="0 0 {width} 60" role="img" aria-label="Diferencia horaria de {html.escape(title)}">'
            f'<line class="zero" x1="{left}" y1="{dy(0):.1f}" x2="{width-right}" y2="{dy(0):.1f}"/>'
            f'<path class="delta" d="{delta_path}"/></svg>'
        )
        return (
            f'<article class="card"><h2>{html.escape(title)}</h2>'
            f'<svg viewBox="0 0 {width} {height}" role="img" '
            f'aria-label="{html.escape(title)}, PLC y Fractal, por hora">'
            f'{"".join(grid)}<path class="plc" d="{path(plc_values)}"/>'
            f'<path class="fractal" d="{path(fractal_values)}"/>'
            f'{plc_points}{fractal_points}{"".join(labels)}'
            f'<text class="axis" x="{left}" y="12">{unit}</text></svg>'
            f'{difference_chart}</article>'
        )

    for key, label in flow_labels.items():
        cards.append(svg(
            label,
            "m³/h",
            [float(row["flows_m3h"][key]) for row in plc_rows],
            [float(fractal_by_hour[hour]["flows_m3h"][key]) for hour in hours],
        ))
    for key, label in tank_labels.items():
        cards.append(svg(
            f"Nivel · {label}",
            "%",
            [float(row["tank_levels_pct"][key]) for row in plc_rows],
            [float(fractal_by_hour[hour]["tank_levels_pct"][key]) for hour in hours],
            (0.0, 100.0),
        ))
    styles = """
:root { color-scheme:dark; --bg:#0b1320; --panel:#111e2d; --line:#26394c; --muted:#9cb0c2; }
:root { --text:#e7f0f7; --blue:#56b4ff; --orange:#ff9b62; --purple:#c4b8ff; }
* { box-sizing: border-box; }
body { margin:0; padding:clamp(16px,3vw,36px); background:var(--bg); color:var(--text); font:15px/1.5 system-ui,sans-serif; }
main { max-width:1150px; margin:auto; }
h1 { margin:.2rem 0; }
.muted,.axis { color:var(--muted); fill:var(--muted); }
.notice { padding:12px 16px; border-left:4px solid #ffd166; background:#292417; color:#f5e4b5; border-radius:8px; }
.legend { display:flex; gap:20px; flex-wrap:wrap; margin:16px 0; color:var(--muted); }
.legend i { display:inline-block; width:22px; border-top:3px solid var(--blue); margin-right:7px; }
.legend .plc i { border-color:var(--orange); border-top-style:dashed; }
.charts { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
.card { min-width:0; background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:14px; }
.card h2 { font-size:1rem; margin:0; }
.card svg { display:block; width:100%; height:auto; }
.grid { stroke:#2b4054; }
.axis { font-size:11px; }
.plc { fill:none; stroke:var(--orange); stroke-width:3; stroke-dasharray:8 4; }
.fractal { fill:none; stroke:var(--blue); stroke-width:3; }
.plc-dot { fill:var(--orange); stroke:#fff; stroke-width:1; }
.fractal-dot { fill:var(--blue); stroke:#fff; stroke-width:1; }
.delta-title { font-size:.78rem; color:var(--purple); }
.delta { fill:none; stroke:var(--purple); stroke-width:2; }
.zero { stroke:#66758a; stroke-dasharray:4 4; }
.note { color:var(--muted); font-size:.88rem; }
@media(max-width:760px) { .charts { grid-template-columns:1fr; } }
"""
    content = (
        '<!doctype html><html lang="es"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        '<title>Caudales y niveles · PLC y Fractal</title>'
        f'<style>{styles}</style></head><body><main>'
        '<p class="muted">PDD · PRS AUTO · punto de control C44 a 18 mca</p>'
        '<h1>Caudales y niveles por hora</h1>'
        '<p class="notice"><b>Comparación:</b> PLC virtual con paso interno de 1 s y Fractal nominal ×1,0; '
        'ambos en las mismas 24 fronteras horarias. Cada panel incluye debajo Δ PLC−Fractal ampliada.</p>'
        '<p class="note">Los caudales de piso 1–4 son los caudales locales demandados por cada rejilla '
        '(consumos + fugas), no el caudal remanente del montante hacia los pisos superiores. '
        'La entrada al tanque se mide en el vaso del tanque de alimentación. Los niveles se comparan en %. '
        'Son estados modelados, no mediciones físicas.</p>'
        '<div class="legend"><span><i></i>Fractal ×1,0 · línea azul</span>'
        '<span class="plc"><i></i>Emulador PLC · línea naranja discontinua y puntos</span></div>'
        '<section class="charts">' + "".join(cards) + "</section>"
        '<p class="note">Muestreo horario en t=3600…86400 s. No se interpola entre fronteras; '
        'las muestras pueden no capturar ciclos de recirculación menores a una hora.</p>'
        '</main></body></html>'
    )
    path = output.with_name(f"{output.stem}-flows-and-tanks.html")
    path.write_text(content, encoding="utf-8")
    return path


def run(output: Path, emulator_hours: float = 24.0) -> dict[str, Any]:
    raw = json.loads(PROFILE_PATH.read_text(encoding="utf-8"))
    profile = normalize_profile(raw)
    profile_id = f"builtin-{PLANT_ID}-{raw['id']}"
    plant = _plant_model(PLANT_ID).create(seed=1, random_faults=False, horizon_s=86400)
    session = PlantSession("prs-critical-point-validation", PLANT_ID, plant, profile_id, profile)
    session.apply_profile_hour(0)
    emulator_duration_s = emulator_hours * 3600

    from fractal.hydraulics.runtime.mpc import project_24h

    frames: list[dict[str, Any]] | None = None
    minimum = {"pressure_mca": float("inf"), "t_s": None, "dwelling": None}
    c44_minus_minimum = {"minimum_mca": float("inf"), "maximum_mca": float("-inf")}
    below_15 = 0
    manual_flow_max = 0.0
    outlet_min, outlet_max = float("inf"), float("-inf")
    hourly: list[dict[str, Any]] = []
    samples = 0

    while plant.t < emulator_duration_s - 1e-9:
        session.apply_profile_hour(int(plant.t // 3600))
        plant.step()
        if plant.t < 30 - 1e-9:
            continue
        if frames is None:
            frames = project_24h(session.message()["plc_tags"], profile, horizon_hours=24)
        samples += 1
        pressures = _house_pressures(plant)
        dwelling, value = min(pressures.items(), key=lambda item: item[1])
        c44_delta = pressures["L4.C44"] - value
        c44_minus_minimum["minimum_mca"] = min(c44_minus_minimum["minimum_mca"], c44_delta)
        c44_minus_minimum["maximum_mca"] = max(c44_minus_minimum["maximum_mca"], c44_delta)
        if value < minimum["pressure_mca"]:
            minimum = {"pressure_mca": value, "t_s": plant.t, "dwelling": dwelling}
        if value < 15:
            below_15 += 1
        station = plant.equipment["prs-01"].true_values()
        outlet = float(station["outlet_pressure_mca"])
        outlet_min, outlet_max = min(outlet_min, outlet), max(outlet_max, outlet)
        manual_flow_max = max(manual_flow_max, float(station["flow_manual_m3h"]))
        if abs(plant.t / 3600 - round(plant.t / 3600)) < 1e-9:
            hour = int(plant.t // 3600)
            hourly.append(
                {
                    "hour_boundary": hour,
                    "t_s": plant.t,
                    "minimum_pressure_mca": round(value, 5),
                    "minimum_dwelling": dwelling,
                    "c44_pressure_mca": round(pressures["L4.C44"], 5),
                    "floor_minimum_pressure_mca": {
                        f"L{level}": round(min(value for house, value in pressures.items() if house.startswith(f"L{level}.")), 5)
                        for level in range(1, 5)
                    },
                    "prs_inlet_mca": round(float(station["inlet_pressure_mca"]), 5),
                    "prs_outlet_mca": round(outlet, 5),
                    "manual_flow_m3h": round(float(station["flow_manual_m3h"]), 8),
                    "flows_m3h": {
                        "pump_supply_outlet": round(float(plant.equipment["pumpset-main-01"].true_values()["flow_m3h"]), 5),
                        "prs_outlet": round(float(station["flow_m3h"]), 5),
                        **{
                            f"floor_{level}_local": round(float(plant.equipment[f"grid-0{level}"].true_values()["flow_in_m3h"]), 5)
                            for level in range(1, 5)
                        },
                        "supply_tank_inlet": round(float(plant.equipment["tank-supply-01"].true_values()["inflow_kg_h"]) / 1000, 5),
                    },
                    "tank_levels_pct": {
                        tank: round(float(plant.equipment[tank].true_values()["level_pct"]), 5)
                        for tank in ("tank-supply-01", "tank-recirc-01", "tank-recirc-02")
                    },
                }
            )
        if plant.t % 14400 == 0:
            print(f"PLC replay t={plant.t:.0f}s · mínimo={value:.2f} mca en {dwelling}", flush=True)

    assert frames is not None
    fractal, fractal_hourly = _fractal_report(frames)
    result = {
        "scenario": raw["name"],
        "assumptions_and_limits": [
            "C44 es una hipótesis de punto de control del modelo, no un sensor ni un punto crítico físico confirmado.",
            "La señal C44 del piso 4 es independiente de la telemetría de presión mínima global; "
            "el control AUTO usa C44 y las alarmas siguen usando el mínimo global.",
            "Fractal resuelve una instantánea hidráulica independiente y contrasta ×0,9/×1,0/×1,1 "
            "sobre las 64 viviendas; no aplica órdenes al PLC.",
            "El replay PLC es del emulador virtual a paso de 1 s. No certifica presión entre pasos ni en una instalación física.",
            "La lógica observada del PLC Grundfos y la apertura física porcentual de la PRV no se infieren de este escenario.",
            "El objetivo de 18 mca es una consigna de modelo; valores muestreados pueden diferir por convergencia del PID.",
        ],
        "emulator": {
            "coverage_t_s": [30, emulator_duration_s],
            "one_second_samples": samples,
            "minimum_pressure_across_64_homes": minimum,
            "c44_minus_global_minimum_mca_range": {key: round(value, 5) for key, value in c44_minus_minimum.items()},
            "pressure_below_15_one_second_sample_count": below_15,
            "prs_outlet_range_mca": [round(outlet_min, 5), round(outlet_max, 5)],
            "manual_branch_flow_max_m3h": round(manual_flow_max, 8),
            "hourly": hourly,
        },
        "fractal": fractal,
        "fractal_hourly": fractal_hourly,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    _write_csv(fractal_hourly, hourly, output.with_name(f"{output.stem}-hourly.csv"))
    chart_path = _write_flow_chart(result, output)
    print(f"Informe escrito: {output}", flush=True)
    print(f"Gráfica horaria escrita: {chart_path}", flush=True)
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        type=Path,
        default=ROOT / "docs" / "architecture" / "validation" / "pdd-prs-critical-point-18-01-validation.json",
    )
    parser.add_argument("--emulator-hours", type=float, default=24.0, help="duración de replay PLC virtual (1–24 h; Fractal proyecta 24 h)")
    args = parser.parse_args()
    if not 1 <= args.emulator_hours <= 24:
        parser.error("--emulator-hours debe estar entre 1 y 24")
    run(args.output, args.emulator_hours)


if __name__ == "__main__":
    main()
