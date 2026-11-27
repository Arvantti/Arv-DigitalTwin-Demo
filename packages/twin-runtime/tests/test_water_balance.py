import pytest
from twin_runtime.water_balance import tank_mass_step


def test_tank_balance_preserves_mass_and_bounds() -> None:
    assert tank_mass_step(50, 100, 20, 10) == (60, 20, 10)
    assert tank_mass_step(95, 100, 20, 10) == (100, 15, 10)
    assert tank_mass_step(5, 100, 0, 10) == (0, 0, 5)
    for initial, incoming, outgoing in ((50, 20, 10), (95, 20, 10), (5, 0, 10)):
        end, accepted, delivered = tank_mass_step(initial, 100, incoming, outgoing)
        assert end == pytest.approx(initial + accepted - delivered)
    with pytest.raises(ValueError):
        tank_mass_step(-1, 100, 0, 0)
