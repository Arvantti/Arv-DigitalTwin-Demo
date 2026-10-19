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
    filler, tunnel, cw, packer = v["filler-pouch-01"], v["cooling-tunnel-01"], v["checkweigher-01"], v["pack-sauce-1000"]
    # Un paso de retraso puede dejar a lo sumo una unidad en tránsito por enlace.
    assert abs(filler["units_good"] - (tunnel["units_inside"] + tunnel["units_out"])) <= 1
    assert abs(tunnel["units_out"] - cw["units_in"]) <= 1
    assert abs(cw["units_accepted"] - (packer["units_packed"] + packer["table_units"])) <= 1


def test_diverted_product_returns_to_the_kettles_and_the_rest_reaches_the_buffer(sauce: PlantModel) -> None:
    sim, _ = run_plant_scenario(sauce, sauce.scenarios["boiler-trip"])
    v = {eid: e.true_values() for eid, e in sim.equipment.items()}
    discharged = v["kettle-01"]["discharged_kg"] + v["kettle-02"]["discharged_kg"]
    returned = v["kettle-01"]["returned_kg"] + v["kettle-02"]["returned_kg"]
    diverted = v["pasteurizer-01"]["diverted_l"] * 1.12
    # Lo que el pasteurizador desvía regresa completo a las marmitas (un paso de retraso) y el resto llega al pulmón.
    assert returned == pytest.approx(diverted, rel=0.01)
    assert v["buffer-hot-01"]["total_in_kg"] == pytest.approx(discharged - returned, rel=0.01)


def test_divert_goes_only_to_the_kettle_that_is_discharging(sauce: PlantModel) -> None:
    sim = sauce.create()
    sim.step()
    all_gated = [lk for lk in sauce.links if lk.when is not None]
    assert {str(lk.dst) for lk in all_gated} == {"kettle-01.return_in", "kettle-02.return_in", "kettle-03.return_in"}
    gated = [lk for lk in all_gated if lk.src.equipment == "pasteurizer-01"]  # la marmita 3 tiene su propio pasteurizador

    def shares(discharge_1: float, discharge_2: float) -> dict[str, float]:
        values = {eid: e.true_values() for eid, e in sim.equipment.items()}
        values["kettle-01"]["discharge_kg_h"], values["kettle-02"]["discharge_kg_h"] = discharge_1, discharge_2
        by_link = sim._gate_shares(values)
        return {str(lk.dst): by_link[id(lk)] for lk in gated}

    assert shares(0.0, 3000.0) == {"kettle-01.return_in": 0.0, "kettle-02.return_in": 1.0}
    assert shares(1000.0, 3000.0) == {"kettle-01.return_in": 0.25, "kettle-02.return_in": 0.75}  # descargan las dos: en proporción
    assert shares(0.0, 0.0) == {"kettle-01.return_in": 0.0, "kettle-02.return_in": 0.0}


def test_kettles_share_the_pump_so_only_one_discharges_at_a_time(sauce: PlantModel) -> None:
    sc = sauce.scenarios["boiler-trip"]
    sim = sauce.create()
    for st in sc.timeline:
        sim.schedule(st, until_s=sc.duration_s)
    overlap = 0
    while sim.t < sc.duration_s:
        sim.step()
        overlap += all(sim.equipment[k].true_values()["discharge_kg_h"] > 0 for k in ("kettle-01", "kettle-02"))
    assert overlap <= 1  # solo el paso en que las dos arrancan a la vez, antes de que una tome el turno


def test_parts_of_the_injection_machine_reach_the_conveyor_without_loss(lib: Library) -> None:
    model = PlantModel(MODELS / "plastic-injection-plant-v1", lib)
    sim, _ = run_plant_scenario(model, model.scenarios["nominal"])
    imm, belt = sim.equipment["imm-03"].true_values(), sim.equipment["conveyor-main-01"].true_values()
    # Cada pieza buena está en la banda, entregada o esperando en la zona de entrada (8 como máximo).
    pending = imm["parts_good"] - belt["delivered"] - belt["items_on_belt"]
    assert 0 <= pending <= 8
    assert belt["delivered"] > 0 and belt["accepting"] == 1


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


def test_snapshot_publishes_the_flow_of_every_link(sauce: PlantModel) -> None:
    sim = sauce.create()
    sim.schedule(sauce.scenarios["nominal"].timeline[0], until_s=7200)
    sim.run(5400)  # la marmita 1 descarga a partir del min 85
    links = sim.snapshot()["links"]
    assert len(links) == len(sauce.links)
    kettle = sim.equipment["kettle-01"].true_values()
    pour = links["kettle-01:product_out>pasteurizer-01:product_in"]
    assert pour["flow_kg_h"] == pytest.approx(kettle["discharge_kg_h"]) and pour["flowing"]
    idle = links["kettle-02:product_out>pasteurizer-01:product_in"]
    assert idle["flow_kg_h"] == 0 and not idle["flowing"]
    # El vapor se entrega a pedido y a la presión que deja la estación reductora.
    steam = links["boiler-01:steam_out>pasteurizer-01:steam_in"]
    assert steam["pressure_bar"] == 3.0
    demand = sim.equipment["pasteurizer-01"].true_values()["steam_flow_kg_h"]
    assert steam["flow_kg_h"] == pytest.approx(demand, rel=0.01)  # un paso de retraso
    sachets = links["filler-pouch-01:sachets_out>cooling-tunnel-01:items_in"]
    assert sachets["units_per_min"] > 0 and "flow_kg_h" not in sachets


def test_flow_of_a_service_link_is_zero_without_pressure(sauce: PlantModel) -> None:
    sim = sauce.create()
    sim.run(5)
    sim.sim.inputs["pasteurizer-01"]["steam_supply_bar"] = 0.0
    lk = next(lk for lk in sauce.links if str(lk.dst) == "pasteurizer-01.steam_in")
    rec = sim._link_record(lk, {"pressure_bar": 0.0}, {"demand_kg_h": 40.0})
    assert rec["flow_kg_h"] == 0.0 and not rec["flowing"]


def test_pipes_map_to_the_links_that_cross_them(sauce: PlantModel) -> None:
    assert sauce.links_for_flow("kettle-01", "pump-hot-01") == ["kettle-01:product_out>pasteurizer-01:product_in"]
    assert len(sauce.links_for_flow("pump-hot-01", "pasteurizer-01")) == 2  # las dos marmitas comparten el tramo
    assert len(sauce.links_for_flow("boiler-01", "steam-station-01")) == 5  # tres marmitas y dos pasteurizadores
    assert sauce.links_for_flow("holding-tube-01", "kettle-02") == ["pasteurizer-01:divert_out>kettle-02:return_in"]  # el desvío
    assert sauce.links_for_flow("cip-skid-01", "kettle-01") == []  # sin simular


# ---------------------------------------------------------------- validación
def _copy_plant(tmp_path: Path, edit) -> Path:
    folder = tmp_path / "sauce-plant-v1"
    shutil.copytree(SAUCE, folder)
    shutil.copytree(SAUCE.parent / "_schema", tmp_path / "_schema")  # la planta tiene catálogo
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
        link = next(lk for lk in raw["links"] if lk["from"] == "kettle-01.product_out")
        link["via"] = []  # kettle-01 → pasteurizer-01 pasa por pump-hot-01

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


def test_gate_must_name_a_contract_variable(lib: Library, tmp_path: Path) -> None:
    def edit(raw):
        next(lk for lk in raw["links"] if lk.get("when"))["when"] = "kettle-01.nada"

    assert "no es una variable del contrato" in _errors(lib, _copy_plant(tmp_path, edit))


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
