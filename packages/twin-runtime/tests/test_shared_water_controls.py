from twin_runtime.prs_curve import outlet_target_from_opening
from twin_runtime.recirculation_control import return_pump_requested


def test_fixed_opening_uses_inlet_pressure_and_clamps() -> None:
    assert outlet_target_from_opening(20, 71) == 15
    assert outlet_target_from_opening(100, 71) == 71
    assert 17 < outlet_target_from_opening(30, 71) < 18
    assert outlet_target_from_opening(0, 71) == 15


def test_recirculation_latch_and_individual_high_tank() -> None:
    params = dict(stop_pct=20, start_pct=60, full_pct=90, supply_start_pct=30, return_high_start_pct=90)
    assert not return_pump_requested(False, 40, 40, 70, **params)
    assert return_pump_requested(False, 90, 40, 70, **params)
    assert return_pump_requested(False, 40, 40, 30, **params)
    assert return_pump_requested(True, 40, 40, 70, **params)
    assert not return_pump_requested(True, 40, 40, 90, **params)
    assert not return_pump_requested(True, 19, 19, 30, **params)
