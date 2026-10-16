"""Pruebas específicas de la inyectora."""

from twin_runtime import Library, Simulator

EQ = Library().get("injection-molding-machine")


def _run(preset: str, seconds: float, **params):
    m = EQ.create("imm-test", preset=preset, params=params, seed=3, random_faults=False)
    sim = Simulator([m], dt=0.25)
    sim.schedule(0, m.id, "start")
    sim.run(seconds)
    return m, sim


def test_cycle_time_independent_of_dt() -> None:
    for dt in (0.1, 0.5, 2.0):
        m = EQ.create("imm", preset="300t-container", seed=1, random_faults=False)
        sim = Simulator([m], dt=dt)
        sim.schedule(0, m.id, "start")
        sim.run(1800)
        assert 98 <= m.cycle_count <= 101, (dt, m.cycle_count)


def test_parts_per_cycle_equal_cavities() -> None:
    m, _ = _run("100t-cutlery", 600)
    assert m.parts_good + m.parts_rejected == 16 * m.cycle_count


def test_mass_balance() -> None:
    m, _ = _run("650t-bucket", 1800)
    good_kg = m.parts_good * 0.85
    assert abs(m.resin_kg - (good_kg + m.scrap_kg)) < 1e-6


def test_hot_mold_extends_cycle() -> None:
    m, sim = _run("300t-container", 600)
    normal = m.last_cycle_s
    sim.inputs[m.id]["cooling_water_ok"] = False
    sim.run(1800)
    assert m.last_cycle_s > normal * 1.1


def test_energy_scales_with_tonnage() -> None:
    small, _ = _run("100t-cutlery", 1800)
    big, _ = _run("1500t-bin", 1800)
    assert big.energy_kwh > 4 * small.energy_kwh


def test_animation_channels_in_range() -> None:
    m = EQ.create("imm", preset="300t-container", seed=1, random_faults=False)
    sim = Simulator([m], dt=0.2)
    sim.schedule(0, m.id, "start")
    for _ in range(500):
        sim.step()
        for ch in EQ.spec.raw["animation_channels"]:
            lo, hi = ch["range"]
            assert lo <= m.animation()[ch["id"]] <= hi, ch["id"]
