"""Dominio hidráulico del motor de planta, con el acueducto a escala: una sola red de agua para todos los equipos."""

from __future__ import annotations

import importlib.util
import shutil
from pathlib import Path

import pytest
import yaml
from twin_runtime import Library, SpecError, find_library_root
from twin_runtime.plant import PlantModel, find_models_root

LIB_ROOT = find_library_root(Path(__file__))
WATER = find_models_root(LIB_ROOT) / "water-network-scale-v1"
TANKS = ("tank-supply-01", "tank-recirc-01", "tank-recirc-02")


@pytest.fixture(scope="module")
def lib() -> Library:
    return Library(LIB_ROOT)


@pytest.fixture(scope="module")
def water(lib: Library) -> PlantModel:
    return PlantModel(WATER, lib)


@pytest.fixture(scope="module")
def day(water: PlantModel):
    """La planta de día, ya estable, después de un ciclo completo de la recirculación (≈ 20 min)."""
    plant = water.create(horizon_s=1500)
    plant.run(1500)
    return plant


def _bench():
    spec = importlib.util.spec_from_file_location("water_network_bench", WATER / "network.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)  # type: ignore[union-attr]
    return mod


def test_engine_matches_the_steady_state_bench(day) -> None:
    ref = _bench().summary()
    values = {eid: eq.true_values() for eid, eq in day.equipment.items()}
    assert values["prs-01"]["outlet_pressure_mca"] == pytest.approx(ref["setting_mca"], rel=0.005)
    assert values["pumpset-main-01"]["flow_m3h"] == pytest.approx(ref["pump_flow"], rel=0.005)
    assert values["prs-01"]["inlet_pressure_mca"] == pytest.approx(ref["p_station_in"], rel=0.005)
    for k in range(1, 5):
        assert values[f"grid-0{k}"]["flow_in_m3h"] == pytest.approx(ref["grid_flows"][f"nivel{k}"], rel=0.01)


def test_water_is_conserved_through_the_recirculation(water: PlantModel) -> None:
    plant = water.create(horizon_s=1500)
    start = sum(plant.equipment[t].mass for t in TANKS)
    plant.run(1500)
    pumped = plant.equipment["pumpset-recirc-01"].volume_m3
    assert pumped > 1.0  # la recirculación arrancó y subió agua al tanque de bombeo
    # Lo único que falta en los tanques es lo que va cayendo por las bajantes (un paso del motor: ≈ 3,2 kg).
    assert sum(plant.equipment[t].mass for t in TANKS) == pytest.approx(start, abs=5.0)


def test_station_receives_the_lowest_house_pressure_of_the_four_levels(day) -> None:
    lowest = min(day.equipment[f"grid-0{k}"].true_values()["min_pressure_mca"] for k in range(1, 5))
    assert day.equipment["prs-01"].inputs["critical_pressure_mca"] == pytest.approx(lowest, abs=0.02)


def test_pipes_publish_their_flow_and_pressures(day) -> None:
    links = day.snapshot()["links"]
    riser = links["prs-01:outlet>grid-01:inlet"]
    assert riser["hydraulic"] is True
    assert riser["flowing"] is True
    assert riser["flow_m3h"] == pytest.approx(day.equipment["pumpset-main-01"].true_values()["flow_m3h"], rel=0.01)
    assert riser["flow_kg_h"] == pytest.approx(riser["flow_m3h"] * 998.0)
    # La tubería baja 1 m desde la estación hasta el nivel 1: llega con más presión de la que sale menos las pérdidas.
    assert riser["to_pressure_mca"] > riser["from_pressure_mca"]
    assert day.snapshot()["hydraulics"]["converged"] is True


def test_hydraulic_link_needs_a_piped_flow_with_diameter(lib: Library, tmp_path: Path) -> None:
    folder = tmp_path / "water-network-scale-v1"
    shutil.copytree(WATER, folder)
    layout = yaml.safe_load((folder / "plant.yaml").read_text(encoding="utf-8"))
    flow = next(f for f in layout["flows"] if (f["from"], f["to"]) == ("pumpset-main-01", "prs-01"))
    del flow["diameter_in"]
    (folder / "plant.yaml").write_text(yaml.safe_dump(layout, allow_unicode=True, sort_keys=False), encoding="utf-8")
    with pytest.raises(SpecError) as exc:
        PlantModel(folder, lib)
    assert "necesita diameter_in" in str(exc.value)
