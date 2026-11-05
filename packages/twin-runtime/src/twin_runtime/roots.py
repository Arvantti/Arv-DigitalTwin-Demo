"""Dónde viven las plantas.

Hay dos raíces de plantas, una al lado de la otra en la raíz del repositorio:

  industrial-models/<planta>/  plantas de demostración que comparten la plataforma (y el esquema común `_schema/`).
  plants/<planta>/             plantas empaquetadas como proyecto propio: modelo (plant.yaml, simulation.yaml,
                               catalog/…) en la raíz de la carpeta, más sus piezas de app (cosim/, fractal/, app/,
                               docs/). Cada una se despliega por separado y solo importa la plataforma.

El nombre de la carpeta es el id de la planta en las dos raíces; una planta no puede estar en ambas.
"""

from __future__ import annotations

import os
from pathlib import Path

from .library import find_library_root

MODELS_DIR_NAME = "industrial-models"
PLANTS_DIR_NAME = "plants"
LAYOUT_FILE = "plant.yaml"


def find_models_root(library_root: Path | None = None) -> Path:
    """Carpeta de plantas de demostración: $TWIN_MODELS, o industrial-models junto a la librería."""
    env = os.environ.get("TWIN_MODELS")
    if env:
        return Path(env).resolve()
    return (library_root or find_library_root()).parent / MODELS_DIR_NAME


def find_plants_root(library_root: Path | None = None) -> Path:
    """Carpeta de plantas empaquetadas: $TWIN_PLANTS, o plants/ al lado de la carpeta de modelos."""
    env = os.environ.get("TWIN_PLANTS")
    if env:
        return Path(env).resolve()
    return find_models_root(library_root).parent / PLANTS_DIR_NAME


def plant_roots(library_root: Path | None = None) -> list[Path]:
    return [find_models_root(library_root), find_plants_root(library_root)]


def plant_folders(library_root: Path | None = None, marker: str = LAYOUT_FILE) -> dict[str, Path]:
    """Plantas de las dos raíces que tienen `marker` (plant.yaml por defecto), por id y en orden alfabético."""
    found: dict[str, Path] = {}
    for root in plant_roots(library_root):
        if not root.is_dir():
            continue
        for folder in sorted(root.iterdir()):
            if folder.name.startswith(("_", ".")) or not (folder / marker).exists():
                continue
            if folder.name in found:
                raise FileNotFoundError(f"planta repetida {folder.name!r}: está en {found[folder.name]} y en {folder}")
            found[folder.name] = folder
    return dict(sorted(found.items()))


def plant_folder(name: str, library_root: Path | None = None) -> Path:
    """Carpeta de una planta por id, en cualquiera de las dos raíces."""
    for root in plant_roots(library_root):
        if (root / name).is_dir():
            return root / name
    raise FileNotFoundError(f"no existe la planta {name!r} en {' ni en '.join(map(str, plant_roots(library_root)))}")


def catalog_schema(plant_folder: Path, relative: Path) -> Path:
    """Esquema común de catálogo: el de la raíz de la planta, o el de industrial-models/_schema para plants/."""
    local = plant_folder.parent / relative
    return local if local.exists() else find_models_root() / relative
