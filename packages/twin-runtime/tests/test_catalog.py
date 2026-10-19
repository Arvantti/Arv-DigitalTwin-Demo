"""Catálogo de datos de la planta de plásticos (docs/datos-reales.md, fases A y B)."""

import shutil
from collections import Counter
from pathlib import Path

import pytest
import yaml
from twin_runtime.catalog import Catalog
from twin_runtime.library import Library
from twin_runtime.plant import PlantModel
from twin_runtime.spec import SpecError

ROOT = Path(__file__).resolve().parents[3]
MODELS = ROOT / "industrial-models"
PLANT = MODELS / "plastic-injection-plant-v1"


@pytest.fixture(scope="module")
def lib():
    return Library()


@pytest.fixture(scope="module")
def catalog():
    return Catalog.load(PLANT)


def _layout():
    return yaml.safe_load((PLANT / "plant.yaml").read_text(encoding="utf-8"))


def _copy(tmp_path: Path) -> Path:
    """Copia la planta y el esquema a una carpeta temporal para editar el catálogo sin tocar el repo."""
    shutil.copytree(MODELS / "_schema", tmp_path / "_schema")
    shutil.copytree(PLANT, tmp_path / PLANT.name)
    return tmp_path / PLANT.name


def _edit(folder: Path, name: str, fn) -> None:
    path = folder / "catalog" / name
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    fn(data)
    path.write_text(yaml.safe_dump(data, allow_unicode=True), encoding="utf-8")


def test_catalog_is_valid(catalog, lib):
    assert catalog.validate(_layout(), lib) == []
    assert set(catalog.products) == {"cubiertos", "balde-12l", "cuerpo-papelera-20l", "pedal-palanca-papelera", "papelera-20l"}


def test_three_machine_sizes_cover_the_29_machines(catalog):
    sizes = Counter(catalog.size_of(e) for e in _layout()["equipment"] if e["type"] == "injection_molding_machine")
    # 80 a 150 t: 10 pequeñas; 300 a 650 t: 14 medianas; 1.100 y 1.500 t: 5 grandes (conteo del plant.yaml)
    assert sizes == {"pequena": 10, "mediana": 14, "grande": 5}


def test_mounted_mold_feeds_the_machine(catalog, lib):
    model = PlantModel(PLANT, lib)
    # mold-balde-12l: 1 cavidad de 520 g cada 30 s en HDPE, los valores que tenía la imm-21
    assert model.equipment["imm-21"]["params"] == {
        "clamp_t": 650, "max_shot_kg": 2.5, "robot": "cartesiano",
        "product": "balde 12 L", "material": "HDPE", "cavities": 1, "part_g": 520, "cycle_s": 30,
    }
    assert catalog.machine_params("imm-01")["cavities"] == 16
    assert catalog.machine_params("imm-03") == {}


def test_route_of_the_assembled_product(catalog):
    route = catalog.route("papelera-20l")
    assert [(s["product"], s["stage"]) for s in route][::4] == [
        ("cuerpo-papelera-20l", "inyeccion"), ("pedal-palanca-papelera", "inyeccion"), ("papelera-20l", "ensamble"),
    ]
    active = [eid for s in route for eid in s["active"]]
    assert active == ["imm-19", "buf-19", "fleet-01", "rack-sf-02", "imm-06", "buf-06", "fleet-01", "rack-sf-01",
                      "assembly-01", "pack-station-03", "rack-pt-01"]
    # En la etapa con molde, la ruta conoce todas las inyectoras donde cabe (alternativas para secuenciar).
    assert route[0]["equipment"] == ["imm-18", "imm-19"]


def test_mold_that_does_not_fit_is_rejected(tmp_path, lib):
    folder = _copy(tmp_path)
    # Si el molde del balde pidiera 1.200 t, no cabría en la imm-21 (650 t) ni en la imm-01 (100 t) agregada a su ruta.
    _edit(folder, "products.yaml", lambda d: d["products"][1]["routing"][0]["equipment"].append("imm-01"))
    _edit(folder, "tooling.yaml", lambda d: d["tooling"][1].update(min_clamp_t=1200))
    errors = Catalog.load(folder).validate(yaml.safe_load((folder / "plant.yaml").read_text(encoding="utf-8")), lib)
    assert any("no cabe en imm-01" in e for e in errors)
    assert any("montaje imm-21: el molde mold-balde-12l no cabe" in e for e in errors)


def test_simulation_must_not_repeat_mold_params(tmp_path, lib):
    folder = _copy(tmp_path)
    sim = folder / "simulation.yaml"
    text = sim.read_text(encoding="utf-8")
    sim.write_text(text.replace('params: {"clamp_t": 650, "max_shot_kg": 2.5, "robot": "cartesiano"} }  # molde',
                                'params: {"clamp_t": 650, "max_shot_kg": 2.5, "robot": "cartesiano", "cycle_s": 28} }  # molde', 1),
                   encoding="utf-8")
    with pytest.raises(SpecError, match=r"imm-21: \['cycle_s'\] vienen del molde"):
        PlantModel(folder, lib)


def test_layout_must_match_the_mounted_mold(tmp_path, lib):
    folder = _copy(tmp_path)
    _edit(folder, "tooling.yaml", lambda d: d["tooling"][1].update(cycle_s=28))
    errors = Catalog.load(folder).validate(yaml.safe_load((folder / "plant.yaml").read_text(encoding="utf-8")), lib)
    assert errors == ["montaje imm-21: plant.yaml dice cycle_s=30 y el molde 28"]


def test_schema_requires_the_mold_fields(tmp_path):
    folder = _copy(tmp_path)
    _edit(folder, "tooling.yaml", lambda d: d["tooling"][0].pop("min_clamp_t"))
    with pytest.raises(SpecError, match="min_clamp_t"):
        Catalog.load(folder)
