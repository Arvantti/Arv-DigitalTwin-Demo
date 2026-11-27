"""Prototipo de cosimulación por réplica independiente del runtime de planta.

Solo para comparar física: exige una instancia congelada del runtime, no acepta
ni deserializa pickle remoto. No registra un modelo de producción ni sustituye
el adaptador versionado actual.
"""

from __future__ import annotations

from copy import deepcopy
from typing import Any

from twin_emulator_api.profiles import commands_for_hour, current_prs_inlet_offset_mca


def clone_at_snapshot(plant: Any) -> Any:
    """Copia íntegra de equipos, controladores, sensores y red hidráulica."""
    replica = deepcopy(plant)
    if replica is plant or replica.equipment["tank-supply-01"] is plant.equipment["tank-supply-01"]:
        raise RuntimeError("la réplica comparte equipos con el emulador")
    if replica.t != plant.t:
        raise RuntimeError("la réplica perdió el tiempo congelado")
    return replica


def apply_hour(plant: Any, profile: dict[str, Any], hour: int) -> None:
    """Aplica exclusivamente mandos declarados por el perfil futuro congelado."""
    offset = current_prs_inlet_offset_mca(plant)
    for command in commands_for_hour(profile, hour, inlet_pressure_offset_mca=offset):
        plant.equipment[command["equipment"]].command(command["command"], command["args"])


def run_until(plant: Any, profile: dict[str, Any], end_t_s: float, applied_hour: int | None) -> int | None:
    """Ejecuta sin consultar la planta de origen; retorna la última hora aplicada."""
    while plant.t < end_t_s - 1e-9:
        hour = int(plant.t // 3600)
        if hour != applied_hour:
            apply_hour(plant, profile, hour)
            applied_hour = hour
        plant.step()
    return applied_hour
