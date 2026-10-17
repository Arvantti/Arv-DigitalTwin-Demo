"""Banco en régimen permanente del acueducto a escala: la misma red que arma el motor de planta, resuelta una vez.

Sirve de cálculo de referencia para las expectativas de los escenarios y para las consignas: grupo de bombas,
estación reguladora, las cuatro rejillas en serie por la columna con una válvula entre niveles (como lo describió
el autor) y los tubos con la longitud, el diámetro y los accesorios de los flujos del plant.yaml. Las cotas son las
del plano: piso 1 a 2,5 m, estación 1 m más arriba, niveles de la rejilla cada 1,20 m.

Las funciones de cada tipo de equipo (add_pump_set, add_pressure_reducing_station, add_distribution_grid,
add_regulating_valve) se cargan desde equipment-library/<tipo>/behavior.py: es el mismo armado del motor."""

from __future__ import annotations

import functools
import importlib.util
from pathlib import Path
from typing import Any

from twin_runtime import Library
from twin_runtime.plant_hydraulics import pipe_geometry
from twin_runtime.primitives import HydraulicNetwork
from twin_runtime.spec import load_yaml

HERE = Path(__file__).resolve().parent
LIB = HERE.parents[1] / "equipment-library"
CRITICAL_TARGET_MCA = 15.45  # casa más crítica: 15 mca + 3 % (D29)
PUMP_SETPOINT_MCA = 72.1  # sensor de descarga de las bombas: 70 mca + 3 % (supuesto, D29)
SUPPLY_LEVEL_PCT = 70.0  # nivel del tanque de bombeo para el banco (en la planta varía con la recirculación)
LEVELS = 4


@functools.cache
def _load(tipo: str):
    spec = importlib.util.spec_from_file_location(f"behavior_{tipo.replace('-', '_')}", LIB / tipo / "behavior.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)  # type: ignore[union-attr]
    return mod


@functools.cache
def _preset(tipo: str, preset: str) -> dict[str, Any]:
    return dict(Library().get(tipo).spec.resolve_params(preset, None))


def resolved(tipo: str, preset: str, **overrides: Any) -> dict[str, Any]:
    """Parámetros resueltos de un preset, con cambios opcionales."""
    p = dict(_preset(tipo, preset))
    p.update(overrides)
    return p


@functools.cache
def _plant() -> tuple[dict[str, Any], dict[tuple[str, str], dict[str, Any]], dict[str, Any]]:
    layout = load_yaml(HERE / "plant.yaml")
    sim = load_yaml(HERE / "simulation.yaml")
    eq = {e["id"]: e for e in layout["equipment"]}
    flows = {(f["from"], f["to"]): f for f in layout["flows"]}
    return eq, flows, sim["equipment"]


def build(
    station_setting_mca: float | None = None,
    pump_speed: float | None = None,
    consumer_opening_pct: float | None = None,
    between_opening_pct: tuple[float, float, float] = (100.0, 100.0, 100.0),
    burst_level: int | None = None,
) -> tuple[HydraulicNetwork, dict[str, Any]]:
    """Arma la red. Con station_setting_mca la estación queda en la rama manual con esa salida fija; sin él, se
    busca la salida que deja la casa más crítica en CRITICAL_TARGET_MCA (lo que hace la rama automática).

    Sin velocidad de bomba fija, las bombas van a la que mantiene PUMP_SETPOINT_MCA en su sensor de descarga."""
    if station_setting_mca is None:
        station_setting_mca = setting_for(CRITICAL_TARGET_MCA, consumer_opening_pct, between_opening_pct, burst_level)
    if pump_speed is None:
        pump_speed = speed_for(station_setting_mca, consumer_opening_pct, between_opening_pct, burst_level)
    eq, flows, sim = _plant()
    z = {k: float(v["position"][2]) for k, v in eq.items()}

    def pipe(a: str, b: str, n1: str, n2: str) -> None:
        f = flows[(a, b)]
        length, d = pipe_geometry(f, eq[a]["position"], eq[b]["position"])
        net.add_pipe(f"{a}>{b}", n1, n2, length, d, minor_k=float(f.get("minor_k", 0.5)))

    pump_mod = _load("booster-pump-set")
    station_mod = _load("pressure-reducing-station")
    grid_mod = _load("distribution-grid")
    valve_mod = _load("regulating-valve")

    net = HydraulicNetwork()
    net.tolerance = 5e-4  # igual que el motor: los ciclos casi sin caudal de la rejilla cerrada
    tank = sim["tank-supply-01"]["params"]
    height = tank["volume_l"] / 1000 / (3.14159265 * tank["diameter_m"] ** 2 / 4)
    net.add_fixed_head("tanque", z["tank-supply-01"] + height * SUPPLY_LEVEL_PCT / 100, elevation_m=z["tank-supply-01"])
    net.add_node("succion", z["pumpset-main-01"])
    pipe("tank-supply-01", "pumpset-main-01", "tanque", "succion")
    pumps_p = resolved("booster-pump-set", sim["pumpset-main-01"]["preset"])
    net.add_node("descarga", z["pumpset-main-01"])
    for pid in pump_mod.add_pump_set(net, "bombas_", "succion", "descarga", pumps_p):
        net.set(pid, speed=pump_speed)

    st_p = resolved("pressure-reducing-station", "station-4in-manual", manual_setting_mca=station_setting_mca)
    net.add_node("entrada_est", z["prs-01"])
    net.add_node("salida_est", z["prs-01"])
    pipe("pumpset-main-01", "prs-01", "descarga", "entrada_est")
    station_mod.add_pressure_reducing_station(net, "est_", "entrada_est", "salida_est", st_p)

    grids: dict[str, Any] = {}
    prev = "salida_est"
    prev_eq = "prs-01"
    for k in range(1, LEVELS + 1):
        gid = f"grid-0{k}"
        gp = resolved("distribution-grid", sim[gid]["preset"])
        if consumer_opening_pct is not None:
            gp["consumer_opening_pct"] = consumer_opening_pct
        inlet = f"nivel{k}_in"
        net.add_node(inlet, z[gid])
        pipe(prev_eq, gid, prev, inlet)
        grids[f"nivel{k}"] = grid_mod.add_distribution_grid(net, f"n{k}_", inlet, gp)
        if burst_level == k:  # falla leak_burst de la rejilla: la fuga l1 se abre a BURST_FACTOR veces su Kv
            net.set(grids[f"nivel{k}"]["l1"]["link"], kv_m3h=gp["leak_kv_m3h"] * grid_mod.BURST_FACTOR)
        if k < LEVELS:
            vid = f"valve-between-{k}{k + 1}"
            vp = resolved("regulating-valve", sim[vid]["preset"], opening_pct=between_opening_pct[k - 1])
            net.add_node(f"{vid}_in", z[vid])
            net.add_node(f"{vid}_out", z[vid])
            pipe(gid, vid, inlet, f"{vid}_in")
            valve_mod.add_regulating_valve(net, vid, f"{vid}_in", f"{vid}_out", vp)
            prev, prev_eq = f"{vid}_out", vid
    return net, {"grids": grids, "pumps": pumps_p, "setting_mca": station_setting_mca, "pump_speed": pump_speed}


def _houses(res: Any, grids: dict[str, Any]) -> dict[str, float]:
    return {f"{g}:{k}": res.pressures_mca[v["node"]] for g, mp in grids.items() for k, v in mp.items() if k.startswith("c")}


def summary(**kwargs: Any) -> dict[str, Any]:
    """Resuelve la red y devuelve lo que interesa: caudales, presiones, fugas y la casa más crítica."""
    net, info = build(**kwargs)
    res = net.solve()
    grid_flows, leaks = {}, {}
    for nivel, mp in info["grids"].items():
        grid_flows[nivel] = sum(max(0.0, res.flows_m3h[v["link"]]) for v in mp.values())
        leaks[nivel] = sum(max(0.0, res.flows_m3h[v["link"]]) for c, v in mp.items() if c.startswith("l"))
    houses = _houses(res, info["grids"])
    worst = min(houses, key=houses.get)
    return {
        "converged": res.converged,
        "setting_mca": info["setting_mca"],
        "pump_speed": info["pump_speed"],
        "pump_flow": sum(res.flows_m3h.get(f"bombas_pump{i}", 0.0) for i in (1, 2)),
        "p_pump_discharge": res.pressures_mca["descarga"],
        "p_station_in": res.pressures_mca["entrada_est"],
        "p_station_out": res.pressures_mca["salida_est"],
        "grid_flows": grid_flows,
        "leaks": leaks,
        "leak_total": sum(leaks.values()),
        "worst_house": worst,
        "p_worst": houses[worst],
    }


# Semáforo de la casa más crítica (criterio de la norma: 15 mca mínimo; alertas en 20 y 18), decisión del autor.
HOUSE_STATES = ((20.0, "verde"), (18.0, "amarillo"), (15.0, "naranja"))


def house_state(p_mca: float) -> str:
    for umbral, estado in HOUSE_STATES:
        if p_mca >= umbral:
            return estado
    return "rojo"


def speed_for(
    setting_mca: float,
    consumer_opening_pct: float | None = None,
    between_opening_pct: tuple[float, float, float] = (100.0, 100.0, 100.0),
    burst_level: int | None = None,
) -> float:
    """Velocidad de las bombas que deja PUMP_SETPOINT_MCA en su sensor de descarga (bisección)."""
    lo, hi = 0.3, 1.0
    for _ in range(30):
        mid = (lo + hi) / 2
        net, _ = build(setting_mca, mid, consumer_opening_pct, between_opening_pct, burst_level)
        if net.solve().pressures_mca["descarga"] >= PUMP_SETPOINT_MCA:
            hi = mid
        else:
            lo = mid
    return round(hi, 5)


def setting_for(
    target_mca: float = CRITICAL_TARGET_MCA,
    consumer_opening_pct: float | None = None,
    between_opening_pct: tuple[float, float, float] = (100.0, 100.0, 100.0),
    burst_level: int | None = None,
) -> float:
    """Salida mínima de la estación para que la casa más crítica quede en target_mca (bisección).

    La presión de las casas no depende de la velocidad de las bombas mientras la PRV regule, así que basta una
    velocidad fija alta."""
    lo, hi = 0.0, 60.0
    for _ in range(40):
        mid = (lo + hi) / 2
        net, info = build(mid, 1.0, consumer_opening_pct, between_opening_pct, burst_level)
        if min(_houses(net.solve(), info["grids"]).values()) >= target_mca:
            hi = mid
        else:
            lo = mid
    return round(hi, 2)


if __name__ == "__main__":
    for label, kw in (("día (100 %)", {}), ("noche (30 %)", {"consumer_opening_pct": 30.0})):
        s = summary(**kw)
        print(
            f"{label}: salida de la estación {s['setting_mca']} mca, casa crítica {s['worst_house']} {s['p_worst']:.2f} mca "
            f"({house_state(s['p_worst'])}), bombas {s['pump_flow']:.2f} m³/h a {s['p_pump_discharge']:.1f} mca "
            f"(velocidad {s['pump_speed']:.3f}), llegada a la estación {s['p_station_in']:.1f} mca, fugas {s['leak_total']:.3f} m³/h"
        )
