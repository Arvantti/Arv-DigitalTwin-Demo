"""Circuito de retorno Fractal: dos tanques, dos válvulas de fondo y bomba 1+1.

Resuelve la rama hidráulica con las cabezas de agua instantáneas; integra las
masas por pasos cortos con la misma histéresis de niveles del emulador.
"""

from __future__ import annotations

import importlib.util
from collections.abc import Callable
from pathlib import Path
from typing import Any

from scipy.optimize import brentq

_spec = importlib.util.spec_from_file_location("fractal_water_recirc_supply", Path(__file__).with_name("supply.py"))
_supply = importlib.util.module_from_spec(_spec)
assert _spec and _spec.loader
_spec.loader.exec_module(_supply)


def pump_flow(model: dict[str, Any], levels: dict[str, float], speed: float = 1.0) -> tuple[float, float, float]:
    MCA_PER_BAR, pipe_loss, tank_head = _supply.MCA_PER_BAR, _supply.pipe_loss, _supply.tank_head
    pump = model["equipment_models"]["pumpset-recirc-01"]["params"]
    a, b, dst = "tank-recirc-01", "tank-recirc-02", "tank-supply-01"
    heads = (tank_head(model, a, levels[a]), tank_head(model, b, levels[b]))
    # El puerto inlet del tanque es cabeza fija a la boca superior, no al nivel del agua.
    receiver_head = tank_head(model, dst, 100)

    def branch(source: str, head: float, suction: float) -> float:
        if head <= suction or levels[source] <= 0:
            return 0.0

        def loss(q: float) -> float:
            valve_loss = MCA_PER_BAR * (q / 400) ** 2
            if model["equipment_models"][source]["params"]["outlet_check_valve"]:
                valve_loss += MCA_PER_BAR * (q / 400) ** 2  # antirretorno aguas abajo de válvula de fondo
            return valve_loss + pipe_loss(model, source, "pumpset-recirc-01", q)

        if loss(40) < head - suction:
            return 40.0
        return brentq(lambda q: loss(q) - (head - suction), 0, 40, xtol=1e-6)

    def suction_for(flow: float) -> tuple[float, float, float]:
        lo = min(heads) - 200
        hi = max(heads)

        def branches(h: float) -> tuple[float, float]:
            return branch(a, heads[0], h), branch(b, heads[1], h)

        if sum(branches(lo)) < flow:
            return lo, *branches(lo)
        suction = brentq(lambda h: sum(branches(h)) - flow, lo, hi, xtol=1e-6)
        return suction, *branches(suction)

    def residual(q: float) -> float:
        suction, _, _ = suction_for(q)
        gain = (
            speed**2 * float(pump["shutoff_head_m"])
            - (float(pump["shutoff_head_m"]) - float(pump["design_head_m"])) * (q / float(pump["design_flow_m3h"])) ** 2
        )
        check = MCA_PER_BAR * (q / (5 * float(pump["design_flow_m3h"]))) ** 2
        return suction + gain - check - pipe_loss(model, "pumpset-recirc-01", dst, q) - receiver_head

    # Si ni a caudal nulo la bomba vence la cota, el antirretorno cierra.
    if residual(0) <= 0:
        return 0.0, 0.0, 0.0
    flow = brentq(residual, 0, 35, xtol=1e-5)
    _, qa, qb = suction_for(flow)
    return flow, qa, qb


def advance_hour(
    model: dict[str, Any], levels: dict[str, float], distribution_by_level: dict[str, float], initially_on: bool,
    *, on_transition: Callable[[dict[str, Any]], None] | None = None,
) -> tuple[dict[str, float], float, bool, bool]:
    """Integra con eventos de histéresis y limitación de masa de los vasos."""
    pump = model["equipment_models"]["pumpset-recirc-01"]["params"]
    capacities = {tank: float(model["equipment_models"][tank]["params"]["volume_l"]) / 1000 for tank in levels}
    volumes = {tank: capacities[tank] * pct / 100 for tank, pct in levels.items()}
    returned = {
        "tank-recirc-01": distribution_by_level["1"] + distribution_by_level["2"],
        "tank-recirc-02": distribution_by_level["3"] + distribution_by_level["4"],
    }
    drawn = sum(returned.values())
    on = initially_on
    speed = 1.0 if initially_on else 0.0
    moved = 0.0
    overflow = False
    elapsed = 0.0
    while elapsed < 3600 - 1e-9:
        current = {tank: 100 * max(0.0, volume) / capacities[tank] for tank, volume in volumes.items()}
        source = (current["tank-recirc-01"] + current["tank-recirc-02"]) / 2
        full = current["tank-supply-01"] >= float(pump["target_full_pct"])
        high_return = float(pump["return_high_start_pct"]) < 100 and max(
            current["tank-recirc-01"], current["tank-recirc-02"]
        ) + 1e-8 >= float(pump["return_high_start_pct"])
        needs_supply = float(pump["supply_start_pct"]) > 0 and current["tank-supply-01"] <= float(pump["supply_start_pct"]) + 1e-8
        source_safe = source >= float(pump["stop_level_pct"])
        was_on = on
        if on:
            on = source_safe and not full
        else:
            on = source_safe and not full and (
                needs_supply or high_return or (float(pump["supply_start_pct"]) == 0 and source >= float(pump["start_level_pct"]))
            )
        if on != was_on and on_transition is not None:
            reason = (
                "suministro_bajo" if needs_supply else "retorno_alto" if high_return else "origen_alto"
            ) if on else "suministro_lleno" if full else "retornos_bajos"
            on_transition({
                "t_s": elapsed, "action": "start" if on else "stop", "reason": reason,
                "levels_pct": dict(current), "recirculated_m3": moved,
            })
        if not on or not was_on:
            speed = 0.0
        # El variador operativo sube a 100 % en 20 s tras cada arranque.
        # Integramos la curva a velocidad media durante pasos cortos de rampa.
        dt = min(5.0 if on and speed < 1.0 else 60.0, 3600 - elapsed)
        ramp_speed = min(1.0, speed + 0.025 * dt)
        _flow, qa, qb = pump_flow(model, current, ramp_speed) if on else (0.0, 0.0, 0.0)
        supply = "tank-supply-01"
        supply_slope = qa + qb - drawn
        source_slope = (returned["tank-recirc-01"] - qa) / capacities["tank-recirc-01"] * 50
        source_slope += (returned["tank-recirc-02"] - qb) / capacities["tank-recirc-02"] * 50
        if on and supply_slope > 0 and current[supply] < float(pump["target_full_pct"]):
            dt = min(dt, 3600 * (float(pump["target_full_pct"]) - current[supply]) * capacities[supply] / (100 * supply_slope))
        if on and source_slope < 0 and source > float(pump["stop_level_pct"]):
            dt = min(dt, 3600 * (source - float(pump["stop_level_pct"])) / -source_slope)
        if not on:
            if float(pump["supply_start_pct"]) > 0 and supply_slope < 0 and current[supply] > float(pump["supply_start_pct"]):
                dt = min(dt, 3600 * (current[supply] - float(pump["supply_start_pct"])) * capacities[supply] / (100 * -supply_slope))
            if float(pump["return_high_start_pct"]) < 100:
                for tank in ("tank-recirc-01", "tank-recirc-02"):
                    slope = returned[tank] / capacities[tank] * 100
                    if slope > 0 and current[tank] < float(pump["return_high_start_pct"]):
                        dt = min(dt, 3600 * (float(pump["return_high_start_pct"]) - current[tank]) / slope)
            if float(pump["supply_start_pct"]) == 0 and source_slope > 0 and source < float(pump["start_level_pct"]):
                dt = min(dt, 3600 * (float(pump["start_level_pct"]) - source) / source_slope)
        dt = max(0.01, dt)
        delivered = min(drawn * dt / 3600, volumes[supply] + (qa + qb) * dt / 3600)
        qa_m3 = min(qa * dt / 3600, volumes["tank-recirc-01"] + returned["tank-recirc-01"] * dt / 3600)
        qb_m3 = min(qb * dt / 3600, volumes["tank-recirc-02"] + returned["tank-recirc-02"] * dt / 3600)
        next_volumes = {
            supply: volumes[supply] + qa_m3 + qb_m3 - delivered,
            "tank-recirc-01": volumes["tank-recirc-01"] + returned["tank-recirc-01"] * dt / 3600 - qa_m3,
            "tank-recirc-02": volumes["tank-recirc-02"] + returned["tank-recirc-02"] * dt / 3600 - qb_m3,
        }
        overflow |= delivered + 1e-9 < drawn * dt / 3600 or any(v > capacities[t] + 1e-9 for t, v in next_volumes.items())
        volumes = {t: min(capacities[t], max(0.0, v)) for t, v in next_volumes.items()}
        moved += qa_m3 + qb_m3
        speed = min(1.0, speed + 0.05 * dt) if on else 0.0
        elapsed += dt
    return {t: 100 * volumes[t] / capacities[t] for t in levels}, moved, on, overflow
