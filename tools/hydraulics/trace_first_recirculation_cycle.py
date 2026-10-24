"""Contrasta los primeros arranques/paradas de retorno desde el mismo snapshot PLC.

Solo el diagnóstico importa ambos motores: Fractal recibe tags y perfil, no objetos del PLC.
Ejemplo: TWIN_DATA=/tmp/fractal-cycle uv run python -m tools.hydraulics.trace_first_recirculation_cycle \
  --output /tmp/first-cycle.json
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from twin_emulator_api.main import _plant_model, session_manager

from fractal.hydraulics.runtime.mpc import _MODEL, _recirc, project_24h
from tools.hydraulics.validate_fractal_hourly import PLANT, PROFILE

TANK_TAGS = {
    "tank-supply-01": "PLC.Tank.Supply.LevelPct",
    "tank-recirc-01": "PLC.Tank.Recirc01.LevelPct",
    "tank-recirc-02": "PLC.Tank.Recirc02.LevelPct",
}


def _levels(plant: Any) -> dict[str, float]:
    return {tank: plant.equipment[tank].level_pct for tank in TANK_TAGS}


def _record(t: float, levels: dict[str, float], volume: float, on: bool) -> dict[str, Any]:
    return {
        "t_s": round(t, 5), "levels_pct": {name: round(value, 5) for name, value in levels.items()},
        "recirculated_since_start_m3": round(volume, 6), "auto_active": on,
    }


def trace(output: Path) -> dict[str, Any]:
    profile = json.loads(PROFILE.read_text(encoding="utf-8"))
    session = session_manager.create(PLANT, _plant_model(PLANT), profile_id=profile["id"], profile=profile)
    session.apply_profile_hour(0)
    for _ in range(30):
        session.plant.step()
    base_t = session.plant.t
    tags = session.message()["plc_tags"]  # Única lectura PLC; proyección no avanza la sesión.
    pump = session.plant.equipment["pumpset-recirc-01"]
    initial = _record(base_t, _levels(session.plant), 0, pump.level_on)
    initial_volume = pump.volume_m3
    forecast = project_24h(tags, profile, "baseline", horizon_hours=1)[0]
    demand = forecast["scenarios"][1]["state"]["level_flows_m3h"]
    starting_levels = {tank: float(tags[tag]) for tank, tag in TANK_TAGS.items()}
    fractal_events: list[dict[str, Any]] = []

    def transition(event: dict[str, Any]) -> None:
        fractal_events.append({
            **_record(base_t + event["t_s"], event["levels_pct"], event["recirculated_m3"], event["action"] == "start"),
            "action": event["action"], "reason": event["reason"],
        })

    projected_levels, projected_volume, _, _ = _recirc.advance_hour(
        _MODEL, starting_levels, demand, bool(tags["PLC.Pump.RecirculationAutoActive"]), on_transition=transition
    )
    operative_events: list[dict[str, Any]] = []
    samples: dict[int, dict[str, Any]] = {int(base_t): initial}
    previous = pump.level_on
    bypass_volume_m3 = 0.0
    bypass_at_first_start_m3: float | None = None
    bypass_flow_at_600_m3h: float | None = None
    # Fractal avanza 3600 s desde t=30; el emulador conserva sus comandos por hora.
    while session.plant.t < base_t + 3600:
        session.apply_profile_hour(int(session.plant.t // 3600) % 24)
        session.plant.step()
        now = pump.level_on
        # Ambas salidas comparten succión: sin bombas pueden circular entre los retornos.
        suction_a = session.plant.link_state["tank-recirc-01:outlet>pumpset-recirc-01:suction"]["flow_m3h"]
        suction_b = session.plant.link_state["tank-recirc-02:outlet>pumpset-recirc-01:suction"]["flow_m3h"]
        if not previous and suction_a > 0 and suction_b < 0:
            bypass_volume_m3 += min(suction_a, -suction_b) * session.plant.model.dt / 3600
        if session.plant.t == 600:
            bypass_flow_at_600_m3h = round(min(suction_a, -suction_b), 6)
        sample = _record(session.plant.t, _levels(session.plant), pump.volume_m3 - initial_volume, now)
        samples[int(session.plant.t)] = sample
        if now != previous:
            if now and bypass_at_first_start_m3 is None:
                bypass_at_first_start_m3 = round(bypass_volume_m3, 6)
            reason = "suministro_bajo" if sample["levels_pct"]["tank-supply-01"] <= 30.1 else "retorno_alto"
            if not now:
                reason = "suministro_lleno" if sample["levels_pct"]["tank-supply-01"] >= 89.9 else "retornos_bajos"
            operative_events.append({**sample, "action": "start" if now else "stop", "reason": reason})
        previous = now

    comparisons = []
    for action in ("start", "stop"):
        f = next((event for event in fractal_events if event["action"] == action), None)
        e = next((event for event in operative_events if event["action"] == action), None)
        if not f or not e:
            continue
        closest = samples[round(f["t_s"])]
        comparisons.append({
            "action": action, "event_time_difference_s": round(f["t_s"] - e["t_s"], 3),
            "fractal_at_event": f, "emulator_at_event": e,
            "emulator_at_fractal_time_nearest_1s": closest,
            "same_time_level_difference_pp": {
                tank: round(f["levels_pct"][tank] - closest["levels_pct"][tank], 5) for tank in TANK_TAGS
            },
            "same_time_transfer_difference_m3": round(
                f["recirculated_since_start_m3"] - closest["recirculated_since_start_m3"], 6
            ),
        })
    result = {
        "profile_id": profile["id"], "base_t_s": base_t, "emulator_dt_s": session.plant.model.dt,
        "starting_plc_tags": {tag: tags[tag] for tag in (*TANK_TAGS.values(), "PLC.Pump.RecirculationAutoActive")},
        "initial_operational_true_values": initial,
        "fractal_hourly_demand_m3h": demand,
        "fractal_events": fractal_events, "emulator_events": operative_events,
        "bypass_from_recirc01_to_recirc02_before_first_start_m3": bypass_at_first_start_m3,
        "emulator_bypass_flow_at_t600_m3h": bypass_flow_at_600_m3h,
        "comparisons": comparisons,
        "final_projected_levels_pct": projected_levels, "projected_return_m3": projected_volume,
        "note": "Proyección independiente: caudal de distribución Fractal fijo por hora; emulador resuelve cada segundo. "
        "t=30 inicio, se comparan 3600 s iguales (no muestreo t=3600 del validador horario). "
        "Eventos Fractal entre subpasos; muestras emulador al segundo más próximo. Niveles del PLC pueden incluir ruido de sensor.",
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    result = trace(args.output)
    summary = {name: result[name] for name in ("base_t_s", "comparisons", "final_projected_levels_pct")}
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
