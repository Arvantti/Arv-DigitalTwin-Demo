"""Bloques de control y dinámica continua."""

from __future__ import annotations

import math


class FirstOrderLag:
    """Respuesta de primer orden: dy/dt = (u - y) / tau. Exacta para entrada constante en cada paso."""

    def __init__(self, tau_s: float, initial: float = 0.0) -> None:
        if tau_s <= 0:
            raise ValueError("tau_s debe ser > 0")
        self.tau_s = tau_s
        self.value = initial

    def step(self, target: float, dt: float) -> float:
        self.value = target + (self.value - target) * math.exp(-dt / self.tau_s)
        return self.value


class RateLimiter:
    """Limita la velocidad de cambio de una señal (p. ej. apertura de válvula, rampa de motor)."""

    def __init__(self, max_rate_per_s: float, initial: float = 0.0) -> None:
        self.max_rate = max_rate_per_s
        self.value = initial

    def step(self, target: float, dt: float) -> float:
        delta = max(-self.max_rate * dt, min(self.max_rate * dt, target - self.value))
        self.value += delta
        return self.value


class PID:
    """PID en forma paralela con anti-windup por saturación de salida."""

    def __init__(
        self,
        kp: float,
        ki: float = 0.0,
        kd: float = 0.0,
        out_min: float = 0.0,
        out_max: float = 1.0,
        reverse: bool = False,
    ) -> None:
        self.kp, self.ki, self.kd = kp, ki, kd
        self.out_min, self.out_max = out_min, out_max
        self.reverse = reverse
        self.integral = 0.0
        self._last_pv: float | None = None
        self.output = out_min

    def reset(self) -> None:
        self.integral = 0.0
        self._last_pv = None
        self.output = self.out_min

    def step(self, setpoint: float, pv: float, dt: float) -> float:
        error = (pv - setpoint) if self.reverse else (setpoint - pv)
        derivative = 0.0
        if self._last_pv is not None and dt > 0:
            dpv = (pv - self._last_pv) / dt
            derivative = dpv if self.reverse else -dpv
        self._last_pv = pv
        candidate = self.integral + self.ki * error * dt
        out = self.kp * error + candidate + self.kd * derivative
        if self.out_min < out < self.out_max:
            self.integral = candidate  # solo integra si no está saturado
        self.output = max(self.out_min, min(self.out_max, out))
        return self.output
