"""Pruebas específicas del recipiente."""

from twin_runtime import Library, Simulator

EQ = Library().get("vessel")


def test_mass_is_conserved() -> None:
    v = EQ.create("t", preset="cold-buffer-3000l", random_faults=False)
    m0 = v.mass
    sim = Simulator([v], dt=1.0)
    sim.schedule(0, v.id, "set_inflow", {"kg_h": 2000})
    sim.schedule(0, v.id, "set_outflow", {"kg_h": 1200})
    sim.run(3600)
    assert abs(v.mass - (m0 + v.total_in - v.total_out)) < 1e-6


def test_never_overflows_or_goes_negative() -> None:
    v = EQ.create("t", preset="cold-buffer-3000l", random_faults=False)
    sim = Simulator([v], dt=5.0)
    sim.schedule(0, v.id, "set_inflow", {"kg_h": 4500})
    sim.run(7200)
    assert v.mass <= v.capacity_kg + 1e-6
    sim.schedule(sim.t, v.id, "set_inflow", {"kg_h": 0})
    sim.schedule(sim.t, v.id, "set_outflow", {"kg_h": 2500})
    sim.run(7200)
    assert v.mass >= 0.0


def test_no_agitation_when_empty() -> None:
    v = EQ.create("t", preset="hot-buffer-3000l", params={"initial_level_pct": 0}, random_faults=False)
    sim = Simulator([v], dt=1.0)
    sim.run(60)
    assert v.agitator.value < 1.0


def test_dimensions_match_volume() -> None:
    import math

    from twin_equipment_vessel import vessel_dimensions

    d, h = vessel_dimensions(30000, "vertical_tank", 3.0)
    assert abs(math.pi * d * d / 4 * h - 30.0) < 1e-9
