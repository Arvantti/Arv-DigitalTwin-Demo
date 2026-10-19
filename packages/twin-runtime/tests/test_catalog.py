"""Catálogos de datos de las plantas (docs/datos-reales.md): plásticos (fases A y B), salsas y cajas (fase C)."""

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
SAUCE = MODELS / "sauce-plant-v1"
BOX = MODELS / "corrugated-box-plant-v1"


@pytest.fixture(scope="module")
def lib():
    return Library()


@pytest.fixture(scope="module")
def catalog():
    return Catalog.load(PLANT)


def _layout(plant: Path = PLANT):
    return yaml.safe_load((plant / "plant.yaml").read_text(encoding="utf-8"))


def _copy(tmp_path: Path, plant: Path = PLANT) -> Path:
    """Copia la planta y el esquema a una carpeta temporal para editar el catálogo sin tocar el repo."""
    shutil.copytree(MODELS / "_schema", tmp_path / "_schema")
    shutil.copytree(plant, tmp_path / plant.name)
    return tmp_path / plant.name


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


# ---------------------------------------------------------------- fase C: salsas y cajas


def test_sauce_and_box_catalogs_are_valid(lib):
    sauce, box = Catalog.load(SAUCE), Catalog.load(BOX)
    assert sauce.validate(_layout(SAUCE), lib) == []
    assert box.validate(_layout(BOX), lib) == []
    assert {p for p, d in sauce.products.items() if d["kind"] == "finished"} == {
        "tomate-1000", "tomate-250", "mayonesa-1000", "mayonesa-500", "mayonesa-250", "mostaza-250",
    }
    assert set(box.products) == {"caja-grande", "caja-mediana", "caja-pequena"}


def test_mounted_format_and_die_feed_the_machines(lib):
    sauce = PlantModel(SAUCE, lib)
    assert sauce.equipment["filler-pouch-03"]["params"] == {"unit_ml": 500}
    box = PlantModel(BOX, lib)
    assert box.equipment["rdc-01"]["params"] == {"boxes_per_sheet": 2}


def test_route_of_a_sku_uses_the_filler_with_the_format():
    route = Catalog.load(SAUCE).route("mayonesa-1000")
    assert [s["stage"] for s in route] == ["fase acuosa", "emulsión", "molienda", "pulmón frío", "llenado", "control de peso", "empaque",
                                           "estibado", "bodega"]
    filling = route[4]
    # La llenadora 3 admite 1.000 ml pero tiene montado el formato de 500: queda como alternativa.
    assert filling["equipment"] == ["filler-pouch-02", "filler-pouch-03"] and filling["active"] == ["filler-pouch-02"]


def test_sizes_by_format_and_by_equipment_list():
    sauce, box = Catalog.load(SAUCE), Catalog.load(BOX)
    fillers = {e["id"]: sauce.size_of(e) for e in _layout(SAUCE)["equipment"] if e["type"] == "vffs_sachet"}
    assert Counter(fillers.values()) == {"s250": 3, "s500": 1, "s1000": 2}
    assert {e["id"]: box.size_of(e) for e in _layout(BOX)["equipment"] if box.size_of(e)} == {
        "ffg-01": "grande", "ffg-02": "mediana", "rdc-01": "pequena",
    }


def test_format_that_does_not_fit_the_filler_is_rejected(tmp_path, lib):
    folder = _copy(tmp_path, SAUCE)
    _edit(folder, "setup.yaml", lambda d: d["setup"].update({"filler-sachet-01": {"tooling": "fmt-sachet-1000"}}))
    errors = Catalog.load(folder).validate(_layout(folder), lib)
    assert "montaje filler-sachet-01: el formato fmt-sachet-1000 no cabe (llena 250 ml, el formato es de 1000 ml)" in errors


def test_batch_must_load_what_the_recipe_says(tmp_path, lib):
    folder = _copy(tmp_path, SAUCE)
    _edit(folder, "tooling.yaml", lambda d: d["tooling"][0].update(batch_kg=1800))
    with pytest.raises(SpecError) as exc:
        PlantModel(folder, lib)
    assert "receta rcp-tomato-sauce: plant.yaml dice batch_kg=2000 y el catálogo 1800" in str(exc.value)
    assert "kettle-01: carga 2000 kg y la receta rcp-tomato-sauce es de 1800 kg" in str(exc.value)


def test_recipe_formula_must_use_catalog_materials(tmp_path, lib):
    folder = _copy(tmp_path, SAUCE)
    _edit(folder, "tooling.yaml", lambda d: d["tooling"][2]["formula_pct"].update(pimienta=1.0))
    errors = Catalog.load(folder).validate(_layout(folder), lib)
    assert "herramental rcp-mustard: material desconocido 'pimienta' en la fórmula" in errors
    assert "herramental rcp-mustard: la fórmula suma 101 %, no 100 %" in errors


# ---------------------------------------------------------------- tiempos de la hoja de ruta (editor de rutas)


def _times(plant: Path, product: str) -> dict[str, dict]:
    stages = Catalog.load(plant).route_graph(product, _layout(plant))["stages"]
    return {f"{s['product']}/{s['stage']}": s["times"] for s in stages}


def test_unit_and_batch_times_come_from_mold_recipe_and_layout():
    plastics = _times(PLANT, "papelera-20l")
    assert plastics["cuerpo-papelera-20l/inyeccion"]["unit_s"] == 35  # 35 s ÷ 1 cavidad
    assert plastics["pedal-palanca-papelera/inyeccion"]["unit_s"] == 12.5  # 25 s ÷ 2 cavidades
    # La estiba del buffer es un lote: 240 cuerpos a 35 s = 140 min.
    assert plastics["cuerpo-papelera-20l/estiba"].items() >= {"batch_qty": 240, "batch_min": 140.0}.items()
    assert plastics["papelera-20l/ensamble"]["unit_source"] == "catálogo"
    sauce = _times(SAUCE, "tomate-1000")
    # Receta: 2.000 kg en 118 min (fases del plano sin la opcional de ajuste).
    assert sauce["salsa-tomate/cocción"].items() >= {"batch_qty": 2000, "batch_min": 118, "batch_source": "receta del plano"}.items()
    assert sauce["tomate-1000/llenado"]["unit_s"] == 2.0  # 30 u/min
    assert sauce["tomate-1000/empaque"]["batch_qty"] == 4 and sauce["tomate-1000/empaque"]["batch_min"] == 0.1
    box = _times(BOX, "caja-pequena")
    assert box["caja-pequena/conversión"]["unit_s"] == 0.25  # 120 láminas/min × 2 cajas


def test_new_product_errors_are_readable(lib):
    catalog = Catalog.load(PLANT)
    product = {"id": "x", "name": "X", "kind": "finished", "unit": "u", "routing": [{"stage": "a", "equipment": []}]}
    assert catalog.with_product(product, _layout(), lib) == (None, ["etapa 1: falta al menos un equipo"])
