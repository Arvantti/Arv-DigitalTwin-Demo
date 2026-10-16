"""Pruebas específicas de la marmita."""

from twin_runtime import Library, Simulator

EQ = Library().get("jacketed-kettle")


def _kettle():
    return EQ.create("k", preset="2500l-sauce", random_faults=False)


def test_ingredient_brix_from_name() -> None:
    from twin_equipment_jacketed_kettle import ingredient_props

    assert ingredient_props("pasta_tomate_28brix")["ss"] == 0.28
    assert ingredient_props("pasta_tomate")["ss"] == 0.30
    assert ingredient_props("ingrediente_raro") == ingredient_props("agua")


def test_water_heats_and_holds_without_big_overshoot() -> None:
    k = _kettle()
    sim = Simulator([k], dt=1.0)
    sim.schedule(0, k.id, "run_phases", {"phases": [
        {"kind": "agitate", "rpm": 50},
        {"kind": "charge", "material": "agua", "kg": 1800, "rate_kg_min": 200},
        {"kind": "heat", "target_c": 85},
        {"kind": "hold", "target_c": 85, "minutes": 30},
    ]})
    peak = 0.0
    for _ in range(int(4800 / sim.dt)):
        sim.step()
        if k.phase == "hold":
            peak = max(peak, k.temp)
    assert 84.0 < k.temp < 86.5
    assert peak < 88.0


def test_mass_balance_through_batch() -> None:
    k = _kettle()
    sim = Simulator([k], dt=1.0)
    sim.schedule(0, k.id, "run_phases", {"phases": [
        {"kind": "charge", "material": "agua", "kg": 1000, "rate_kg_min": 200},
        {"kind": "charge", "material": "azucar", "kg": 500, "rate_kg_min": 100},
        {"kind": "discharge", "rate_kg_min": 100},
    ]})
    sim.run(3600)
    assert abs(k.discharged + k.mass - 1500.0) < 1e-6
    assert k.batch_count == 1


def test_brix_of_sugar_solution() -> None:
    k = _kettle()
    k.components = {"agua": 800.0, "azucar": 200.0}
    assert abs(k.brix - 20.0) < 1e-9


def test_discharge_blocked_downstream() -> None:
    k = _kettle()
    sim = Simulator([k], dt=1.0)
    sim.schedule(0, k.id, "run_phases", {"phases": [
        {"kind": "charge", "material": "agua", "kg": 500, "rate_kg_min": 250},
        {"kind": "discharge", "rate_kg_min": 50},
    ]})
    sim.schedule(0, k.id, inputs={"downstream_free": False})
    sim.run(600)
    assert k.state.current == "blocked"
    assert k.mass > 499


def test_open_kettle_does_not_exceed_boiling_point() -> None:
    k = _kettle()
    sim = Simulator([k], dt=1.0)
    sim.schedule(0, k.id, "run_phases", {"phases": [
        {"kind": "charge", "material": "agua", "kg": 1500, "rate_kg_min": 300},
        {"kind": "charge", "material": "azucar", "kg": 300, "rate_kg_min": 100},
        {"kind": "heat", "target_c": 85},
    ]})
    sim.schedule(1200, k.id, "inject_fault", {"fault": "steam_valve_stuck", "duration_s": 3600})
    brix_before = None
    for _ in range(4800):
        sim.step()
        if sim.t == 1200:
            brix_before = k.brix
    assert k.temp <= k.boiling_point_c + 1e-9
    assert 96.0 < k.boiling_point_c < 98.0  # ~1.500 m s. n. m.
    assert k.boiled_off > 50 and k.brix > brix_before  # hirvió y concentró
