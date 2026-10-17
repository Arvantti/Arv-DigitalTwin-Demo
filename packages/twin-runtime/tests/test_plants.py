"""Motor de planta: condiciones, carga de twin.yaml, conservación de masa y escenarios de planta."""

from __future__ import annotations

from pathlib import Path

import pytest
from twin_runtime.expr import Condition, ExprError
from twin_runtime.library import Library
from twin_runtime.plant import (
    PlantSimulator,
    check_plant_expectations,
    find_plants,
    load_plant_scenarios,
    load_twin,
    run_plant_scenario,
)
from twin_runtime.spec import SpecError

LIB = Library()
PLANTS = find_plants(LIB)
SAUCE = PLANTS["sauce-plant-v1"]


# ---------------------------------------------------------------------------- condiciones
def test_condition_evaluates_comparisons_and_membership() -> None:
    cond = Condition("phase == 'discharge' and state != 'fault'")
    assert cond({"phase": "discharge", "state": "running"})
    assert not cond({"phase": "discharge", "state": "fault"})
    assert Condition("state in ['running', 'idle']")({"state": "idle"})
    assert Condition("0 < level_pct < 98")({"level_pct": 50})
    assert not Condition("level_pct > 1")({"level_pct": None})  # sin valor todavía: falso, no error


@pytest.mark.parametrize("text", ["__import__('os')", "a.b == 1", "f(x) > 1", "x + 1 > 2", "[i for i in x]"])
def test_condition_rejects_code(text: str) -> None:
    with pytest.raises(ExprError):
        Condition(text)


# ---------------------------------------------------------------------------- carga
def test_sauce_twin_loads_with_expected_link_modes() -> None:
    twin = load_twin(SAUCE, LIB)
    modes = {(lk.src, lk.dst): lk.mode for lk in twin.links if lk.kind == "flow"}
    assert modes[("kettle-01.product_out", "pasteurizer-01.product_in")] == "fixed"
    assert modes[("pasteurizer-01.product_out", "buffer-hot-01.inlet")] == "push"
    assert modes[("buffer-hot-01.outlet", "filler-pouch-01.product_in")] == "pull"
    assert {lk.kind for lk in twin.links} == {"flow", "utility", "signal"}


def _write(tmp_path: Path, body: str) -> Path:
    path = tmp_path / "twin.yaml"
    path.write_text(body, encoding="utf-8")
    return path


def test_twin_rejects_unknown_port_and_wrong_direction(tmp_path: Path) -> None:
    path = _write(
        tmp_path,
        """
twin: t
name: prueba
equipment:
  - { id: a, type: belt-conveyor, preset: sachet-1000 }
  - { id: b, type: belt-conveyor, preset: sachet-1000 }
links:
  - { from: a.no_existe, to: b.items_in }
  - { from: a.items_in, to: b.items_out }
""",
    )
    with pytest.raises(SpecError) as err:
        load_twin(path, LIB)
    text = str(err.value)
    assert "puerto inexistente" in text and "de un puerto de salida a uno de entrada" in text


def test_twin_rejects_push_fan_out(tmp_path: Path) -> None:
    path = _write(
        tmp_path,
        """
twin: t
name: prueba
equipment:
  - { id: a, type: belt-conveyor }
  - { id: b, type: belt-conveyor }
  - { id: c, type: belt-conveyor }
links:
  - { from: a.items_out, to: b.items_in }
  - { from: a.items_out, to: c.items_in }
""",
    )
    with pytest.raises(SpecError, match="reparto"):
        load_twin(path, LIB)


def test_twin_rejects_ids_missing_from_layout(tmp_path: Path) -> None:
    (tmp_path / "plant.yaml").write_text("equipment:\n  - { id: real-01 }\n", encoding="utf-8")
    path = _write(
        tmp_path,
        """
twin: t
name: prueba
layout: plant.yaml
equipment:
  - { id: real-01, type: belt-conveyor }
  - { id: fantasma-01, type: belt-conveyor }
  - { id: banda-virtual, type: belt-conveyor, virtual: true }
""",
    )
    with pytest.raises(SpecError, match="fantasma-01: no existe en el layout"):
        load_twin(path, LIB)


def test_twin_rejects_unknown_input_and_command(tmp_path: Path) -> None:
    path = _write(
        tmp_path,
        """
twin: t
name: prueba
equipment:
  - { id: a, type: belt-conveyor, inputs: { caudal_magico: 3 } }
timeline:
  - { at_s: 0, equipment: a, command: despegar }
""",
    )
    with pytest.raises(SpecError) as err:
        load_twin(path, LIB)
    assert "caudal_magico" in str(err.value) and "despegar" in str(err.value)


# ---------------------------------------------------------------------------- física del acople
def test_mass_balance_closes_across_the_hot_line() -> None:
    """Lo cocinado = pasteurizado + desviado; lo llenado = pulmón inicial + pasteurizado − pulmón final."""
    twin = load_twin(SAUCE, LIB)
    sim = PlantSimulator(twin, LIB)
    buffer = sim.equipment["buffer-hot-01"]
    initial = buffer.true_values()["mass_kg"]
    sim.run(4 * 3600)
    k = sim.plant_kpis()
    rho = 1.12
    in_kettles = sum(sim.equipment[e].true_values()["discharged_kg"] for e in ("kettle-01", "kettle-02"))
    assert k["sauce_cooked_kg"] == pytest.approx(in_kettles)
    assert (k["pasteurized_l"] + k["diverted_l"]) * rho == pytest.approx(k["sauce_cooked_kg"], abs=60)  # ≤ 1 paso en curso
    final = buffer.true_values()["mass_kg"]
    assert k["product_filled_kg"] == pytest.approx(initial + k["pasteurized_l"] * rho - final, abs=5)


def test_downstream_blockage_propagates_upstream() -> None:
    twin = load_twin(SAUCE, LIB)
    sim = PlantSimulator(twin, LIB)
    sim.run(3 * 3600)
    sim.equipment["case-pack-02"].command("inject_fault", {"fault": "box_jam", "duration_s": 900})
    sim.run(600)
    states = {eid: sim.equipment[eid].state.current for eid in ("checkweigher-01", "conveyor-pouch-01", "filler-pouch-01")}
    assert states == {"checkweigher-01": "blocked", "conveyor-pouch-01": "blocked", "filler-pouch-01": "blocked"}


def test_selector_serves_one_kettle_at_a_time() -> None:
    """Dos marmitas listas para descargar no descargan a la vez al mismo pasteurizador: con 10 min
    de desfase (en vez de 60) la segunda espera bloqueada a que termine la primera."""
    twin = load_twin(SAUCE, LIB)
    for c in twin.controllers:
        if c.equipment == "kettle-02":
            c.start_at_s = 600
    sim = PlantSimulator(twin, LIB)
    kettles = [sim.equipment["kettle-01"], sim.equipment["kettle-02"]]
    last = [0.0, 0.0]
    both = waiting = 0
    for _ in range(3 * 3600):
        sim.step()
        now = [k.true_values()["discharged_kg"] for k in kettles]
        if all(n > p for n, p in zip(now, last, strict=True)):  # las dos entregaron masa en el mismo paso
            both += 1
        last = now
        waiting += kettles[1].phase == "discharge" and kettles[1].state.current == "blocked"
    assert both == 0
    assert waiting > 300  # la segunda marmita esperó al menos 5 min


# ---------------------------------------------------------------------------- escenarios
def _plant_scenarios() -> list[tuple[str, str]]:
    out = []
    for name, path in PLANTS.items():
        scen = path.parent / "scenarios.yaml"
        if scen.exists():
            twin = load_twin(path, LIB)
            out += [(name, sid) for sid in load_plant_scenarios(scen, twin, LIB)]
    return out


@pytest.mark.parametrize(("plant", "scenario_id"), _plant_scenarios())
def test_plant_scenario(plant: str, scenario_id: str) -> None:
    twin = load_twin(PLANTS[plant], LIB)
    scenario = load_plant_scenarios(PLANTS[plant].parent / "scenarios.yaml", twin, LIB)[scenario_id]
    sim, _ = run_plant_scenario(twin, LIB, scenario)
    failures = check_plant_expectations(sim, scenario.expect)
    assert not failures, "\n".join(failures)


# ---------------------------------------------------------------------------- cascada de inyección
INJECTION = PLANTS["plastic-injection-plant-v1"]


def test_repair_clock_waits_for_the_technician() -> None:
    import random

    from twin_runtime.primitives import FailureModel

    fm = FailureModel([{"id": "jam", "mtbf_h": None, "mttr_min": 10}], random.Random(1))
    fm.trigger("jam", duration_s=60)
    fm.hold("jam", True)
    for _ in range(100):
        fm.step(1.0, operating=True)
    assert fm.is_active("jam")  # 100 s esperando: el reloj no corrió
    fm.hold("jam", False)
    cleared = [fid for _ in range(60) for fid in fm.step(1.0, operating=True)[1]]
    assert cleared == ["jam"]


def test_resin_moisture_travels_from_dryer_to_press() -> None:
    twin = load_twin(INJECTION, LIB)
    sim = PlantSimulator(twin, LIB)
    sim.run(600)
    dryer = sim.equipment["dryer-03"].true_values()["outlet_moisture_pct"]
    assert sim.inputs["imm-01"]["resin_moisture_pct"] == pytest.approx(dryer, rel=0.05)
    assert sim.inputs["imm-01"]["cooling_water_c"] == pytest.approx(sim.equipment["chiller-01"].true_values()["supply_temp_c"], abs=0.05)


def test_pull_offset_keeps_mass_balance() -> None:
    """Lo que entrega el secador = consumidores no modelados (150 kg/h) + lo que consumen las inyectoras."""
    twin = load_twin(INJECTION, LIB)
    sim = PlantSimulator(twin, LIB)
    sim.run(2 * 3600)
    out = sim.equipment["dryer-03"].true_values()["resin_out_kg"]
    consumed = sum(sim.equipment[e].true_values()["resin_consumed_kg"] for e in ("imm-01", "imm-02"))
    assert out == pytest.approx(150.0 * 2 + consumed, abs=0.2)  # ≤ una inyección en curso


def test_maintenance_crew_requires_positions(tmp_path: Path) -> None:
    path = _write(
        tmp_path,
        """
twin: t
name: prueba
equipment:
  - { id: a, type: belt-conveyor }
  - { id: tech, type: operator, position: [0, 0] }
controllers:
  - { kind: maintenance_crew, technicians: [tech], covers: [a] }
""",
    )
    with pytest.raises(SpecError, match="a no tiene posición"):
        load_twin(path, LIB)
