"""Modelo de sensor: ruido, resolución, deriva y fallas típicas de instrumentación."""

from __future__ import annotations

import random


class Sensor:
    def __init__(
        self,
        rng: random.Random,
        noise_sd: float = 0.0,
        resolution: float | None = None,
        drift_per_h: float = 0.0,
    ) -> None:
        self.rng = rng
        self.noise_sd = noise_sd
        self.resolution = resolution
        self.drift_per_h = drift_per_h
        self.offset = 0.0
        self.stuck_value: float | None = None

    def step(self, dt: float) -> None:
        self.offset += self.drift_per_h * dt / 3600.0

    def read(self, true_value: float | None) -> float | None:
        if true_value is None:
            return None
        if self.stuck_value is not None:
            return self.stuck_value
        value = true_value + self.offset
        if self.noise_sd:
            value += self.rng.gauss(0.0, self.noise_sd)
        if self.resolution:
            value = round(value / self.resolution) * self.resolution
        return value

    def stick(self, value: float | None) -> None:
        """Simula un transmisor congelado (None lo libera)."""
        self.stuck_value = value
