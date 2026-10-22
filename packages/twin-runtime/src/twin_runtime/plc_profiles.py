"""Perfiles horarios interpolados para un PLC virtual.

No resuelven hidráulica ni optimizan: solamente convierten 24 consignas horarias en una consigna continua que el
emulador hidráulico puede recibir. La calculadora de Fractal permanece separada de este módulo.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence

HOURS_PER_DAY = 24


@dataclass(frozen=True)
class HourlyProfile:
    """Veinticuatro puntos horarios con interpolación lineal y periódica entre el último y el primero."""

    values: tuple[float, ...]

    @classmethod
    def from_values(cls, values: Sequence[float], minimum: float = 0.0, maximum: float = 100.0) -> HourlyProfile:
        if len(values) != HOURS_PER_DAY:
            raise ValueError(f"el perfil debe tener {HOURS_PER_DAY} valores horarios; recibió {len(values)}")
        normalized = tuple(float(value) for value in values)
        if any(value < minimum or value > maximum for value in normalized):
            raise ValueError(f"cada valor debe estar entre {minimum:g} y {maximum:g}")
        return cls(normalized)

    def at_hour(self, hour: float) -> float:
        """Valor interpolado para una hora decimal; el día se repite cada 24 h."""
        wrapped = float(hour) % HOURS_PER_DAY
        left = int(wrapped)
        fraction = wrapped - left
        right = (left + 1) % HOURS_PER_DAY
        return self.values[left] + (self.values[right] - self.values[left]) * fraction

    def samples(self, interval_min: int = 15) -> list[dict[str, float]]:
        """Muestras para graficar o previsualizar un día. Incluye el cierre en 24:00."""
        if interval_min <= 0 or 60 % interval_min:
            raise ValueError("interval_min debe ser un divisor positivo de 60")
        total = HOURS_PER_DAY * 60 // interval_min
        return [{"hour": i * interval_min / 60, "value": self.at_hour(i * interval_min / 60)} for i in range(total + 1)]


def progressive_profile(minimum_pct: float = 30.0, maximum_pct: float = 100.0, peak_hour: float = 12.0) -> HourlyProfile:
    """Perfil diario mínimo → máximo → mínimo, con máximo en ``peak_hour``.

    La pendiente es lineal y el mínimo ocurre tanto a las 00:00 como a las 24:00. Es un generador de escenario,
    no una predicción de demanda residencial.
    """
    if not 0 < peak_hour < HOURS_PER_DAY:
        raise ValueError("peak_hour debe estar entre 0 y 24")
    if not 0 <= minimum_pct <= maximum_pct <= 100:
        raise ValueError("se requiere 0 <= minimum_pct <= maximum_pct <= 100")
    values = []
    for hour in range(HOURS_PER_DAY):
        if hour <= peak_hour:
            fraction = hour / peak_hour
        else:
            fraction = (HOURS_PER_DAY - hour) / (HOURS_PER_DAY - peak_hour)
        values.append(minimum_pct + (maximum_pct - minimum_pct) * fraction)
    return HourlyProfile.from_values(values)
