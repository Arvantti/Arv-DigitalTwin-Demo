"""Balance de masa conservativo de un tanque durante un paso de tiempo.

Las entradas/salidas son masas del intervalo, no caudales. Para un ciclo con
varios tanques, el flujo por cada enlace debe calcularse una sola vez y
aplicarse con signo opuesto a origen y destino.
"""

from __future__ import annotations


def tank_mass_step(mass_kg: float, capacity_kg: float, incoming_kg: float, outgoing_kg: float) -> tuple[float, float, float]:
    """Devuelve (masa final, entrada aceptada, salida entregada)."""
    if capacity_kg <= 0 or not 0 <= mass_kg <= capacity_kg or incoming_kg < 0 or outgoing_kg < 0:
        raise ValueError("balance de tanque con masa o capacidad inválida")
    accepted = min(incoming_kg, capacity_kg - mass_kg + outgoing_kg)
    delivered = min(outgoing_kg, mass_kg + accepted)
    return max(0.0, min(capacity_kg, mass_kg + accepted - delivered)), accepted, delivered
