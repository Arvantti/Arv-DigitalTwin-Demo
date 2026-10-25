"""Cada conmutación del horizonte Fractal frente a la misma sesión PLC avanzando a 1 s.

Ejemplo: TWIN_DATA=/tmp/cycle-data uv run python -m tools.hydraulics.trace_recirculation_cycles \
  --output /tmp/return-cycles.json --hours 24
No cambia los mandos ni la física; Fractal lee tags/perfil desde el gateway de prueba.
"""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path
from time import monotonic
from typing import Any

from twin_emulator_api.main import _plant_model, session_manager

from fractal.hydraulics.runtime.mpc import project_24h
from tools.hydraulics.validate_fractal_hourly import PLANT, PROFILE

TANKS = ("tank-supply-01", "tank-recirc-01", "tank-recirc-02")


def capture(session: Any, base_volume: float, bypass_m3: float) -> dict[str, Any]:
    pump = session.plant.equipment["pumpset-recirc-01"]
    return {
        "t_s": session.plant.t,
        "levels_pct": {tank: round(session.plant.equipment[tank].level_pct, 5) for tank in TANKS},
        "recirculated_m3": round(pump.volume_m3 - base_volume, 6),
        "bypass_m3": round(bypass_m3, 6),
        "auto_active": pump.level_on,
    }


def diagnose(output: Path, hours: int = 24) -> dict[str, Any]:
    if not 1 <= hours <= 24:
        raise ValueError("hours debe estar entre 1 y 24")
    profile = json.loads(PROFILE.read_text(encoding="utf-8"))
    session = session_manager.create(PLANT, _plant_model(PLANT), profile_id=profile["id"], profile=profile)
    session.apply_profile_hour(0)
    for _ in range(30):
        session.plant.step()
    base_t = session.plant.t
    pump = session.plant.equipment["pumpset-recirc-01"]
    base_volume = pump.volume_m3
    tags = session.message()["plc_tags"]
    transitions: list[dict[str, Any]] = []
    started = monotonic()
    frames = project_24h(tags, profile, "baseline", horizon_hours=hours, on_recirculation_transition=transitions.append)
    totals = [0.0]
    for frame in frames:
        totals.append(totals[-1] + float(frame["snapshot"]["lines"]["recirculacion"]["output_units"]))
    fractal_events = []
    for event in transitions:
        hour = min(hours - 1, int((event["t_s"] - base_t) // 3600))
        fractal_events.append({
            "action": event["action"], "reason": event["reason"], "t_s": round(event["t_s"], 5),
            "levels_pct": {tank: round(event["levels_pct"][tank], 5) for tank in TANKS},
            "recirculated_m3": round(totals[hour] + event["recirculated_m3"], 6),
        })
    targets = {round(event["t_s"]) for event in fractal_events}
    hourly_targets = {round(base_t + h * 3600): h for h in range(1, hours + 1)}
    targets.update(hourly_targets)
    samples: dict[int, dict[str, Any]] = {}
    emulator_events: list[dict[str, Any]] = []
    hourly: list[dict[str, Any]] = []
    tank_capacities = {tank: session.plant.equipment[tank].p["volume_l"] / 1000 for tank in TANKS}
    previous = pump.level_on
    bypass_m3 = 0.0
    for _ in range(int(hours * 3600 / session.plant.model.dt)):
        session.apply_profile_hour(int(session.plant.t // 3600) % 24)
        session.plant.step()
        now = pump.level_on
        suction_a = session.plant.link_state["tank-recirc-01:outlet>pumpset-recirc-01:suction"]["flow_m3h"]
        suction_b = session.plant.link_state["tank-recirc-02:outlet>pumpset-recirc-01:suction"]["flow_m3h"]
        if not previous and suction_a > 0 and suction_b < 0:
            bypass_m3 += min(suction_a, -suction_b) * session.plant.model.dt / 3600
        if int(session.plant.t) in targets or now != previous:
            sample = capture(session, base_volume, bypass_m3)
            if int(session.plant.t) in targets:
                samples[int(session.plant.t)] = sample
            if now != previous:
                levels = sample["levels_pct"]
                reason = (
                    "suministro_bajo" if levels[TANKS[0]] <= 30.1 else "retorno_alto"
                ) if now else "suministro_lleno" if levels[TANKS[0]] >= 89.9 else "retornos_bajos"
                emulator_events.append({**sample, "action": "start" if now else "stop", "reason": reason})
            if int(session.plant.t) in hourly_targets:
                hour = hourly_targets[int(session.plant.t)]
                projected = frames[hour - 1]["tank_levels_pct"]
                state = frames[hour - 1]["scenarios"][1]["state"]
                actual = sample["levels_pct"]
                operational_pump = session.plant.equipment["pumpset-main-01"].true_values()
                operational_prs = session.plant.equipment["prs-01"].true_values()
                hourly.append({
                    "hour": hour, "t_s": sample["t_s"],
                    "fractal_profile_hour": (int(base_t // 3600) + hour - 1) % 24,
                    "emulator_profile_hour": int(session.plant.t // 3600) % 24,
                    "emulator_levels_pct": actual,
                    "fractal_levels_pct": {tank: round(projected[tank], 5) for tank in TANKS},
                    "emulator_volumes_m3": {tank: round(tank_capacities[tank] * actual[tank] / 100, 6) for tank in TANKS},
                    "fractal_volumes_m3": {tank: round(tank_capacities[tank] * projected[tank] / 100, 6) for tank in TANKS},
                    "level_difference_pp": {tank: round(projected[tank] - actual[tank], 5) for tank in TANKS},
                    "supply_difference_pp": round(projected[TANKS[0]] - actual[TANKS[0]], 5),
                    "transfer_difference_m3": round(totals[hour] - sample["recirculated_m3"], 6),
                    "emulator_main_flow_m3h": round(operational_pump["flow_m3h"], 5),
                    "fractal_main_flow_m3h": state["flow_m3h"],
                    "emulator_main_discharge_mca": round(operational_pump["discharge_pressure_mca"], 5),
                    "fractal_main_discharge_mca": state["pump_discharge_mca"],
                    "emulator_prs_outlet_mca": round(operational_prs["outlet_pressure_mca"], 5),
                    "fractal_prs_outlet_mca": state["prs_outlet_mca"],
                    "emulator_critical_pressure_mca": round(operational_prs["critical_pressure_mca"], 5),
                    "fractal_critical_pressure_mca": state["critical_pressure_mca"],
                    "pressure_safety_agreement": (operational_prs["critical_pressure_mca"] >= 15)
                    == (state["critical_pressure_mca"] >= 15),
                })
                print(f"hora {hour:02}/{hours:02} · suministro Δ {hourly[-1]['supply_difference_pp']:+.2f} pp · "
                      f"retorno Δ {hourly[-1]['transfer_difference_m3']:+.3f} m³", flush=True)
        previous = now

    compared: list[dict[str, Any]] = []
    for action in ("start", "stop"):
        e = [event for event in emulator_events if event["action"] == action]
        f = [event for event in fractal_events if event["action"] == action]
        for ordinal, (a, b) in enumerate(zip(f, e, strict=False), 1):
            at_f = samples[round(a["t_s"])]
            compared.append({
                "action": action, "cycle": ordinal, "fractal_t_s": a["t_s"], "emulator_t_s": b["t_s"],
                "time_difference_s": round(a["t_s"] - b["t_s"], 3),
                "fractal_levels_pct": a["levels_pct"], "emulator_levels_pct_at_own_event": b["levels_pct"],
                "same_time_supply_difference_pp": round(a["levels_pct"][TANKS[0]] - at_f["levels_pct"][TANKS[0]], 5),
                "fractal_recirculated_m3": a["recirculated_m3"],
                "emulator_recirculated_m3_at_own_event": b["recirculated_m3"],
                "same_time_transfer_difference_m3": round(a["recirculated_m3"] - at_f["recirculated_m3"], 6),
                "emulator_bypass_m3_at_fractal_event": at_f["bypass_m3"],
                "fractal_reason": a["reason"], "emulator_reason": b["reason"],
            })
    compared.sort(key=lambda event: (event["cycle"], event["action"] != "start"))
    result = {
        "scope": "independent Fractal forecast vs PLC emulator; same 30 s PLC snapshot, full physical second per emulator step",
        "base_t_s": base_t, "hours": hours, "profile_id": profile["id"],
        "note": "Ordinal pairing is diagnostic, not proof of event identity if cycle counts differ. "
        "Same-time emulator readings are taken at nearest 1 s; hourly levels, main flow and pressures are TRUE values "
        "(not noisy PLC sensor snapshots). Starting at t=30 s, Fractal holds each profile entry for a full 3600 s "
        "while operational PLC switches at t=3600,7200,...: at the recorded hour ends the emulator has applied "
        "the NEXT entry for 30 s. This is an input-boundary mismatch, not time alignment validation. "
        "Fractal holds hourly distribution fixed. "
        "Fractal recirculation totals are accumulated across hours, no commands applied.",
        "initial_tags": {key: tags[key] for key in (
            "PLC.Tank.Supply.LevelPct", "PLC.Tank.Recirc01.LevelPct", "PLC.Tank.Recirc02.LevelPct",
            "PLC.Pump.RecirculationAutoActive",
        )},
        "fractal_events": fractal_events, "emulator_events": emulator_events, "paired_events": compared,
        "hourly": hourly, "emulator_bypass_total_m3": round(bypass_m3, 6),
        "elapsed_real_s": round(monotonic() - started, 2),
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    hourly_path = output.with_name(output.stem + "-hourly.csv")
    with hourly_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle, lineterminator="\n")
        writer.writerow(("hora", "t_s", "fractal_perfil_h", "emulador_perfil_h", *(
            f"{motor}_{tank}_{unit}" for tank in ("supply", "recirc01", "recirc02")
            for unit in ("pct", "m3") for motor in ("emulador", "fractal")
        ), "diferencia_suministro_pp", "diferencia_retorno_acumulado_m3", "presion_critica_emulador_mca",
            "presion_critica_fractal_mca", "acuerdo_presion_15mca"))
        for row in hourly:
            cells = []
            for tank in TANKS:
                for _unit, field in (("pct", "levels_pct"), ("m3", "volumes_m3")):
                    for motor in ("emulator", "fractal"):
                        cells.append(row[f"{motor}_{field}"][tank])
            writer.writerow((row["hour"], row["t_s"], row["fractal_profile_hour"], row["emulator_profile_hour"],
                             *cells, row["supply_difference_pp"], row["transfer_difference_m3"],
                             row["emulator_critical_pressure_mca"], row["fractal_critical_pressure_mca"],
                             row["pressure_safety_agreement"]))
    with output.with_suffix(".csv").open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle, lineterminator="\n")
        writer.writerow((
            "ciclo", "arranque_fractal_s", "arranque_emulador_s", "desfase_arranque_s",
            "parada_fractal_s", "parada_emulador_s", "desfase_parada_s",
            "recirculado_fractal_m3", "recirculado_emulador_m3", "diferencia_recirc_m3",
        ))
        for start, stop in zip(compared[::2], compared[1::2], strict=True):
            fractal_volume = round(stop["fractal_recirculated_m3"] - start["fractal_recirculated_m3"], 6)
            emulator_volume = round(
                stop["emulator_recirculated_m3_at_own_event"] - start["emulator_recirculated_m3_at_own_event"], 6
            )
            writer.writerow((
                start["cycle"], start["fractal_t_s"], start["emulator_t_s"], start["time_difference_s"],
                stop["fractal_t_s"], stop["emulator_t_s"], stop["time_difference_s"],
                fractal_volume, emulator_volume, round(fractal_volume - emulator_volume, 6),
            ))
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--hours", type=int, default=24)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    result = diagnose(args.output, args.hours)
    for event in result["paired_events"]:
        print(f"ciclo {event['cycle']:02} {event['action']:5} · t F/E {event['fractal_t_s']:.1f}/{event['emulator_t_s']:.0f} "
              f"(Δ {event['time_difference_s']:+.1f} s), suministro Δ {event['same_time_supply_difference_pp']:+.2f} pp, "
              f"transferencia Δ {event['same_time_transfer_difference_m3']:+.3f} m³")
    print(f"eventos F/E {len(result['fractal_events'])}/{len(result['emulator_events'])}; "
          f"duración real {result['elapsed_real_s']} s")


if __name__ == "__main__":
    main()
