"""Red hidráulica del acueducto a escala (entrega 4, primer paso): grupo de bombas, estación reguladora, cuatro
rejillas por nivel y las columnas que las suben, en una sola red que resuelve el solucionador hidráulico.

Las funciones de cada tipo de equipo (add_pump_set, add_pressure_reducing_station, add_distribution_grid) se cargan
desde equipment-library/<tipo>/behavior.py. El motor de planta usará este mismo armado cuando tenga dominio
hidráulico; por ahora es un banco de pruebas en estado estacionario."""

from __future__ import annotations

import importlib.util
from pathlib import Path
from typing import Any

from twin_runtime import Library
from twin_runtime.primitives import HydraulicNetwork

LIB = Path(__file__).resolve().parents[2] / "equipment-library"
LEVEL_RISE_M = 1.2  # cada nivel 1,20 m más arriba (docs/water-network-plant.md, sección 2)
RISER_LEN_M = 3.0  # tramo horizontal de la columna hasta la rejilla
RISER_D_M = 0.0525  # 2"
HEADER_D_M = 0.1022  # 4"
SUCTION_LEN_M = 2.0


def _load(tipo: str):
    spec = importlib.util.spec_from_file_location(f"behavior_{tipo.replace('-', '_')}", LIB / tipo / "behavior.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)  # type: ignore[union-attr]
    return mod


def resolved(tipo: str, preset: str, **overrides: Any) -> dict[str, Any]:
    """Parámetros resueltos de un preset, con cambios opcionales."""
    inst = Library().get(tipo).create("banco", preset=preset, seed=1, random_faults=False)
    p = dict(inst.p)
    p.update(overrides)
    return p


def build(
    pump_preset: str = "multistage-2x13m3h-80m",
    station_preset: str = "station-4in-manual",
    grid_presets: tuple[str, str, str, str] = ("level-1", "level-1", "level-1", "level-4-critical"),
    station_setting_mca: float | None = None,
    pump_speed: float = 1.0,
) -> tuple[HydraulicNetwork, dict[str, Any]]:
    """Arma la red. Devuelve la red y los mapas de nodos y de válvulas de cada rejilla."""
    pump_mod = _load("booster-pump-set")
    station_mod = _load("pressure-reducing-station")
    grid_mod = _load("distribution-grid")

    net = HydraulicNetwork()
    # Las ramas de nivel 4 cierran en un ciclo límite de ~1e-5 m³/h (0,01 L/h) que la tolerancia por defecto (1e-6)
    # no alcanza; 5e-4 relativa lo da por convergido sin cambiar el resultado de ningún caudal útil.
    net.tolerance = 5e-4
    net.add_fixed_head("tanque", 1.0, elevation_m=0.0)  # nivel de agua 1 m sobre las bombas
    net.add_node("succion", 0.0)
    net.add_valve("linea-succion", "tanque", "succion", kv_m3h=1e5)
    pumps_p = resolved("booster-pump-set", pump_preset)
    net.add_node("descarga", 0.0)
    for pid in pump_mod.add_pump_set(net, "bombas_", "succion", "descarga", pumps_p):
        net.set(pid, speed=pump_speed)

    st_p = resolved("pressure-reducing-station", station_preset)
    if station_setting_mca is not None:
        st_p["manual_setting_mca"] = station_setting_mca
    net.add_node("entrada_est", 0.0)
    net.add_pipe("colector", "descarga", "entrada_est", 5.0, HEADER_D_M, minor_k=0.3)
    net.add_node("salida_est", 0.0)
    station_mod.add_pressure_reducing_station(net, "est_", "entrada_est", "salida_est", st_p)

    grids: dict[str, Any] = {}
    for k, preset in enumerate(grid_presets, start=1):
        z = LEVEL_RISE_M * (k - 1)
        gp = resolved("distribution-grid", preset)
        inlet = f"nivel{k}_in"
        net.add_node(inlet, z)
        net.add_pipe(f"columna{k}", "salida_est", inlet, RISER_LEN_M + z, RISER_D_M, minor_k=0.5)
        grids[f"nivel{k}"] = grid_mod.add_distribution_grid(net, f"n{k}_", inlet, gp)
    return net, {"grids": grids, "pumps": pumps_p}


def solve_day() -> dict[str, Any]:
    """Resuelve la red con el consumo de día y devuelve lo que interesa del banco."""
    net, info = build()
    res = net.solve()
    grid_flows = {}
    for nivel, mp in info["grids"].items():
        grid_flows[nivel] = sum(max(0.0, res.flows_m3h[v["link"]]) for c, v in mp.items() if c.startswith("c"))
    return {"converged": res.converged, "iterations": res.iterations, "grid_flows": grid_flows,
            "pump_flow": sum(res.flows_m3h.get(f"bombas_pump{i}", 0.0) for i in (1, 2)),
            "p_station_out": res.pressures_mca["salida_est"], "p_c44_nivel4": res.pressures_mca[info["grids"]["nivel4"]["c44"]["node"]]}
