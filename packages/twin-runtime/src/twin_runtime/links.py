"""Magnitudes que viajan por los puertos cuando el motor de planta conecta dos equipos.

Cada puerto del contrato puede declarar `link: { magnitud: nombre }`. Según la dirección del
puerto y el sentido de la magnitud, el nombre es una variable que el equipo publica o una
entrada (DEFAULT_INPUTS) que recibe. Ver docs/plant-engine.md.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from .behavior import EquipmentBehavior
    from .spec import EquipmentSpec

# Viajan de la salida del equipo de arriba a la entrada del de abajo.
FORWARD: dict[str, str] = {
    "units": "contador acumulado de unidades → ritmo en u/min",
    "flow_kg_h": "caudal de material en kg/h",
    "available": "1 si hay producto para entregar (si falta, se deduce de flow_kg_h > 0)",
    "temp_c": "temperatura del producto o de las unidades",
    "pressure_bar": "presión del servicio (vapor, aire)",
    "moisture_pct": "humedad de la resina que se entrega, en % (promedio de las fuentes)",
    "weight_mean_g": "peso medio de las unidades",
    "weight_sd_g": "desviación típica del peso de las unidades",
}
# Viajan de la entrada del equipo de abajo a la salida del de arriba.
BACKWARD: dict[str, str] = {
    "ready": "1 si el equipo de abajo recibe (llega como downstream_free)",
    "demand_kg_h": "caudal que pide el equipo de abajo (se suma si hay varios)",
}
QUANTITIES = {**FORWARD, **BACKWARD}

# Magnitudes que pasan sin cambio a través de un equipo de unidades que no las publica
# (el peso de un sachet no cambia dentro del túnel de enfriamiento).
ITEM_ATTRIBUTES = frozenset({"weight_mean_g", "weight_sd_g"})


def publishes(direction: str, quantity: str) -> bool:
    """True si el equipo publica la magnitud por un puerto con esa dirección (variable)."""
    return (quantity in FORWARD and direction == "out") or (quantity in BACKWARD and direction == "in")


def port_links(spec: EquipmentSpec) -> dict[str, dict[str, Any]]:
    """Puertos con `link`, por id: {'direction', 'kind', 'link'}."""
    return {
        p["id"]: {"direction": p["direction"], "kind": p["kind"], "link": dict(p["link"])}
        for p in spec.raw.get("ports", [])
        if p.get("link")
    }


def check_port_links(spec: EquipmentSpec, behavior_cls: type[EquipmentBehavior]) -> list[str]:
    """Cada nombre de `link` debe ser una variable declarada (si el equipo publica) o una entrada del comportamiento."""
    errors: list[str] = []
    variables = {v["id"] for v in spec.variables}
    inputs = set(behavior_cls.DEFAULT_INPUTS)
    for pid, port in port_links(spec).items():
        if port["direction"] == "inout":
            errors.append(f"puerto {pid}: un puerto inout no puede declarar link")
            continue
        for q, name in port["link"].items():
            if publishes(port["direction"], q):
                if name not in variables:
                    errors.append(f"puerto {pid}: link.{q} = {name!r} no es una variable del contrato")
            elif name not in inputs:
                errors.append(f"puerto {pid}: link.{q} = {name!r} no es una entrada (DEFAULT_INPUTS) del comportamiento")
    return errors
