"""Propiedades termodinámicas aproximadas (suficientes para un gemelo de demostración)."""

from __future__ import annotations

# Presión atmosférica del Valle de Aburrá (~1.500 m s. n. m.)
DEFAULT_ATM_BAR = 0.85


def saturation_temp_c(gauge_bar: float, atm_bar: float = DEFAULT_ATM_BAR) -> float:
    """Temperatura de saturación del vapor. Ajuste T ≈ 100·p^0,25 (p absoluta en bar),
    error < 3 °C entre 0,5 y 10 bar abs."""
    p_abs = max(0.05, gauge_bar + atm_bar)
    return 100.0 * p_abs**0.25


def steam_latent_kj_kg(temp_c: float) -> float:
    """Calor latente de condensación (aprox. lineal entre 100 y 180 °C)."""
    return 2257.0 - 2.4 * (temp_c - 100.0)
