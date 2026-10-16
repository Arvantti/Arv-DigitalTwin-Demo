"""Seguimiento de estado operativo y tiempo acumulado por estado."""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Callable


class StateTracker:
    def __init__(self, allowed: list[str], initial: str, on_change: Callable[[str, str], None] | None = None):
        if initial not in allowed:
            raise ValueError(f"estado inicial {initial!r} no permitido: {allowed}")
        self.allowed = set(allowed)
        self.current = initial
        self.time_in_state: dict[str, float] = defaultdict(float)
        self._on_change = on_change

    def set(self, new_state: str) -> None:
        if new_state not in self.allowed:
            raise ValueError(f"estado {new_state!r} no declarado en el contrato: {sorted(self.allowed)}")
        if new_state != self.current:
            old, self.current = self.current, new_state
            if self._on_change:
                self._on_change(old, new_state)

    def tick(self, dt: float) -> None:
        self.time_in_state[self.current] += dt

    def __eq__(self, other: object) -> bool:
        return self.current == other if isinstance(other, str) else NotImplemented

    def __hash__(self) -> int:
        return hash(self.current)
