"""Motor de planta: escenarios de las plantas, conservación de unidades y validación de enlaces."""

from __future__ import annotations

import shutil
from pathlib import Path

import pytest
import yaml
from twin_runtime import Library, SpecError, find_library_root
from twin_runtime.links import check_port_links
from twin_runtime.plant import SIM_FILE, PlantModel, check_plant_expectations, find_models_root, run_plant_scenario

LIB_ROOT = find_library_root(Path(__file__))
MODELS = find_models_root(LIB_ROOT)
PLANTS = sorted(p.parent.name for p in MODELS.glob(f"*/{SIM_FILE}"))
SAUCE = MODELS / "sauce-plant-v1"


@pytest.fixture(scope="module")
def lib() -> Library:
    return Library(LIB_ROOT)


@pytest.fixture(scope="module")
def sauce(lib: Library) -> PlantModel:
    return PlantModel(SAUCE, lib)


def _scenarios() -> list[tuple[str, str]]:
    out = []
    for name in PLANTS:
        raw = yaml.safe_load((MODELS / name / SIM_FILE).read_text(encoding="utf-8"))
        out += [(name, sc["id"]) for sc in raw.get("scenarios", [])]
    return out


@pytest.mark.parametrize(("plant", "scenario"), _scenarios())
def test_plant_scenarios_meet_expectations(lib: Library, plant: str, scenario: str) -> None:
    model = PlantModel(MODELS / plant, lib)
    sc = model.scenarios[scenario]
    sim, _ = run_plant_scenario(model, sc)
    assert check_plant_expectations(sim.snapshot(), sc.expect, sim.events) == []


def test_units_are_conserved_along_the_sachet_line(sauce: PlantModel) -> None:
    sim, _ = run_plant_scenario(sauce, sauce.scenarios["tunnel-stop"])
    v = {eid: e.true_values() for eid, e in sim.equipment.items()}
    filler, tunnel, cw, packer = v["filler-pouch-01"], v["cooling-tunnel-01"], v["checkweigher-01"], v["case-pack-02"]
    # Un paso de retraso puede dejar a lo sumo una unidad en tránsito por enlace.
    assert abs(filler["units_good"] - (tunnel["units_inside"] + tunnel["units_out"])) <= 1
    assert abs(tunnel["units_out"] - cw["units_in"]) <= 1
    assert abs(cw["units_accepted"] - (packer["units_packed"] + packer["buffer_units"])) <= 1


def test_material_reaches_the_buffer_except_what_is_diverted(sauce: PlantModel) -> None:
    sim, _ = run_plant_scenario(sauce, sauce.scenarios["boiler-trip"])
    v = {eid: e.true_values() for eid, e in sim.equipment.items()}
    discharged = v["kettle-01"]["discharged_kg"] + v["kettle-02"]["discharged_kg"]
    diverted = v["pasteurizer-01"]["diverted_l"] * 1.12
    assert v["buffer-hot-01"]["total_in_kg"] == pytest.approx(discharged - diverted, rel=0.01)


def test_weight_travels_through_the_tunnel_to_the_checkweigher(sauce: PlantModel) -> None:
    sim = sauce.create()
    sim.schedule(sauce.scenarios["nominal"].timeline[0], until_s=7200)
    sim.run(7200)
    filler_mean = sim.equipment["filler-pouch-01"].true_values()["fill_weight_avg_g"]
    assert sim.sim.inputs["checkweigher-01"]["upstream_mean_g"] == pytest.approx(filler_mean, rel=0.01)


def test_steam_pressure_is_limited_by_the_reducing_station(sauce: PlantModel) -> None:
    sim = sauce.create()
    sim.run(10)
    assert sim.equipment["boiler-01"].true_values()["pressure_bar"] > 7
    assert sim.sim.inputs["pasteurizer-01"]["steam_supply_bar"] == 3.0


# ---------------------------------------------------------------- validación
def _copy_plant(tmp_path: Path, edit) -> Path:
    folder = tmp_path / "sauce-plant-v1"
    shutil.copytree(SAUCE, folder)
    raw = yaml.safe_load((folder / SIM_FILE).read_text(encoding="utf-8"))
    edit(raw)
    (folder / SIM_FILE).write_text(yaml.safe_dump(raw, allow_unicode=True, sort_keys=False), encoding="utf-8")
    return folder


def _errors(lib: Library, folder: Path) -> str:
    with pytest.raises(SpecError) as exc:
        PlantModel(folder, lib)
    return str(exc.value)


def test_link_must_follow_a_flow_of_the_layout(lib: Library, tmp_path: Path) -> None:
    def edit(raw):
        raw["links"][3]["via"] = []  # kettle-01 → pasteurizer-01 pasa por pump-hot-01

    assert "no tiene el flujo kettle-01 → pasteurizer-01" in _errors(lib, _copy_plant(tmp_path, edit))


def test_link_needs_matching_port_directions(lib: Library, tmp_path: Path) -> None:
    def edit(raw):
        raw["links"].append({"from": "filler-pouch-01.product_in", "to": "cooling-tunnel-01.items_in"})

    msg = _errors(lib, _copy_plant(tmp_path, edit))
    assert "se espera un puerto de salida" in msg
    assert "distinto tipo" in msg


def test_units_cannot_fan_out_without_a_split_rule(lib: Library, tmp_path: Path) -> None:
    def edit(raw):
        raw["equipment"]["checkweigher-02"] = {"type": "checkweigher", "preset": "250ml-tomato"}
        raw["links"].append({"from": "cooling-tunnel-01.items_out", "to": "checkweigher-02.items_in"})

    assert "entrega unidades o caudal a 2 destinos" in _errors(lib, _copy_plant(tmp_path, edit))


def test_scenario_cannot_override_a_linked_input(lib: Library, tmp_path: Path) -> None:
    def edit(raw):
        raw["scenarios"][0]["inputs"] = {"pasteurizer-01": {"steam_supply_bar": 1.0}}

    assert "las calcula un enlace" in _errors(lib, _copy_plant(tmp_path, edit))


def test_port_link_names_must_exist_in_the_contract(lib: Library) -> None:
    eq = lib.get("belt-conveyor")
    raw = {**eq.spec.raw, "ports": [{"id": "items_in", "kind": "item", "direction": "in", "link": {"units": "nope", "ready": "nada"}}]}
    spec = type(eq.spec)(**{**eq.spec.__dict__, "raw": raw})
    errors = check_port_links(spec, eq.behavior_cls)
    assert any("'nope' no es una entrada" in e for e in errors)
    assert any("'nada' no es una variable" in e for e in errors)
