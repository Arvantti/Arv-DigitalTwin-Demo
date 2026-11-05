"""Dos raíces de plantas: industrial-models/ (demostración) y plants/ (plantas empaquetadas como proyecto propio)."""

from __future__ import annotations

import shutil
from pathlib import Path

import pytest
from twin_runtime.catalog import Catalog
from twin_runtime.roots import find_models_root, find_plants_root, plant_folder, plant_folders

MODELS = find_models_root()


def _plant(root: Path, name: str, *files: str) -> Path:
    folder = root / name
    folder.mkdir(parents=True)
    for f in ("plant.yaml", *files):
        (folder / f).write_text("{}\n", encoding="utf-8")
    return folder


@pytest.fixture
def roots(tmp_path, monkeypatch):
    models, plants = tmp_path / "industrial-models", tmp_path / "plants"
    models.mkdir()
    monkeypatch.setenv("TWIN_MODELS", str(models))
    monkeypatch.delenv("TWIN_PLANTS", raising=False)
    return models, plants


def test_plants_root_sits_next_to_models_root(roots) -> None:
    models, plants = roots
    assert find_plants_root() == plants
    assert find_models_root() == models


def test_folders_from_both_roots_by_id(roots) -> None:
    models, plants = roots
    a = _plant(models, "a-plant-v1", "simulation.yaml")
    b = _plant(plants, "b-plant-v1")
    _plant(models, "_schema")
    assert plant_folders() == {"a-plant-v1": a, "b-plant-v1": b}
    assert plant_folders(marker="simulation.yaml") == {"a-plant-v1": a}
    assert plant_folder("b-plant-v1") == b
    with pytest.raises(FileNotFoundError):
        plant_folder("no-existe")


def test_same_plant_in_both_roots_is_an_error(roots) -> None:
    models, plants = roots
    _plant(models, "a-plant-v1")
    _plant(plants, "a-plant-v1")
    with pytest.raises(FileNotFoundError, match="repetida"):
        plant_folders()


def test_catalog_of_a_packaged_plant_uses_the_common_schema(tmp_path, monkeypatch) -> None:
    """Una planta en plants/ no trae _schema: el catálogo se valida con industrial-models/_schema."""
    monkeypatch.setenv("TWIN_PLANTS", str(tmp_path))
    folder = tmp_path / "plastic-injection-plant-v1"
    shutil.copytree(MODELS / "plastic-injection-plant-v1" / "catalog", folder / "catalog")
    assert not (tmp_path / "_schema").exists()
    cat = Catalog.load(folder)
    assert cat is not None and "papelera-20l" in cat.products
