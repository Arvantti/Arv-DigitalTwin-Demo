"""Secuenciador de fases con duración fija: ciclos de máquina, secuencias de robot, CIP."""

from __future__ import annotations


class PhaseSequencer:
    """Recorre una lista de (fase, duración_s). Conserva el tiempo sobrante entre pasos,
    de modo que el ciclo total no depende del tamaño del paso de simulación."""

    def __init__(self, phases: list[tuple[str, float]]) -> None:
        if not phases:
            raise ValueError("se necesita al menos una fase")
        self.phases = phases
        self.index = 0
        self.elapsed = 0.0
        self.running = False
        self.leftover = 0.0  # tiempo del último paso que sobró al terminar la secuencia

    @property
    def phase(self) -> str | None:
        return self.phases[self.index][0] if self.running else None

    @property
    def phase_progress(self) -> float:
        """Avance de la fase actual en [0, 1]."""
        duration = self.phases[self.index][1]
        return min(1.0, self.elapsed / duration) if duration > 0 else 1.0

    @property
    def cycle_duration(self) -> float:
        return sum(d for _, d in self.phases)

    def start(self) -> None:
        self.index, self.elapsed, self.running = 0, 0.0, True

    def stop(self) -> None:
        self.running = False

    def step(self, dt: float) -> list[str]:
        """Avanza dt segundos y devuelve las fases que terminaron en este paso, en orden.
        Al terminar la última fase el secuenciador se detiene (running = False)."""
        finished: list[str] = []
        remaining = dt
        self.leftover = 0.0
        while self.running and remaining > 0:
            name, duration = self.phases[self.index]
            left = duration - self.elapsed
            if remaining < left:
                self.elapsed += remaining
                break
            remaining -= left
            finished.append(name)
            self.index += 1
            self.elapsed = 0.0
            if self.index >= len(self.phases):
                self.index = len(self.phases) - 1
                self.elapsed = self.phases[-1][1]
                self.running = False
                self.leftover = remaining
        return finished
