"""Catálogo de datos de una planta: materiales, productos con su ruta, herramental, tamaños de equipo y montaje.

Vive en industrial-models/<planta>/catalog/*.yaml y se valida con industrial-models/_schema/catalog.schema.json
más las reglas cruzadas de este módulo (referencias, compatibilidad molde–máquina, coherencia con el plano).
El motor de planta lo lee: una inyectora con molde montado (setup.yaml) toma de él producto, resina, cavidades,
peso de pieza y ciclo. Plan completo en docs/datos-reales.md.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import jsonschema

from .spec import SpecError, load_yaml

CATALOG_DIR = "catalog"
SCHEMA_PATH = Path("_schema") / "catalog.schema.json"
# Parámetros de la inyectora que vienen del molde montado; simulation.yaml no debe repetirlos.
MOLD_PARAMS = ("product", "material", "cavities", "part_g", "cycle_s")


@dataclass
class Catalog:
    folder: Path
    data: dict[str, Any]
    materials: dict[str, dict[str, Any]] = field(default_factory=dict)
    tooling: dict[str, dict[str, Any]] = field(default_factory=dict)
    products: dict[str, dict[str, Any]] = field(default_factory=dict)
    setup: dict[str, dict[str, Any]] = field(default_factory=dict)

    @classmethod
    def load(cls, plant_folder: Path) -> Catalog | None:
        """Une los YAML de <planta>/catalog/ y los valida contra el esquema. None si la planta no tiene catálogo."""
        folder = plant_folder / CATALOG_DIR
        if not folder.is_dir():
            return None
        data: dict[str, Any] = {}
        for path in sorted(folder.glob("*.yaml")):
            raw = load_yaml(path) or {}
            for key, value in raw.items():
                if key in data:
                    raise SpecError(f"{path}: la sección {key!r} ya está definida en otro archivo del catálogo")
                data[key] = value
        schema = json.loads((plant_folder.parent / SCHEMA_PATH).read_text(encoding="utf-8"))
        errors = sorted(jsonschema.Draft202012Validator(schema).iter_errors(data), key=lambda e: list(e.path))
        if errors:
            raise SpecError("\n".join(f"{folder}: {'/'.join(map(str, e.path)) or '(raíz)'}: {e.message}" for e in errors))
        cat = cls(folder, data)
        for key in ("materials", "tooling", "products"):
            index: dict[str, dict[str, Any]] = {}
            for item in data.get(key) or []:
                if item["id"] in index:
                    raise SpecError(f"{folder}: {key}: id repetido {item['id']!r}")
                index[item["id"]] = item
            setattr(cat, key, index)
        cat.setup = dict(data.get("setup") or {})
        return cat

    # ------------------------------------------------------------------ consultas
    def machine_params(self, equipment_id: str) -> dict[str, Any]:
        """Parámetros de inyectora que da el molde montado en ese equipo ({} si no tiene molde en el catálogo)."""
        mounted = self.setup.get(equipment_id)
        if not mounted:
            return {}
        mold = self.tooling[mounted["tooling"]]
        product = self.products[mold["product"]]
        return {
            "product": product.get("display_name", product["name"]),
            "material": self.materials[mold["material"]]["resin"],
            "cavities": mold["cavities"],
            "part_g": mold["part_g"],
            "cycle_s": mold["cycle_s"],
        }

    def product_of(self, equipment_id: str) -> dict[str, Any] | None:
        mounted = self.setup.get(equipment_id)
        return self.products[self.tooling[mounted["tooling"]]["product"]] if mounted else None

    def route(self, product_id: str) -> list[dict[str, Any]]:
        """Ruta completa de un producto: primero la de sus componentes (en el orden de la lista de materiales) y luego la suya.

        Cada etapa trae `equipment` (donde puede hacerse) y `active` (donde se hace hoy: en una etapa con molde,
        las inyectoras que lo tienen montado; si ninguna, todas las candidatas). Es lo que la escena 3D resalta.
        """
        product = self.products[product_id]
        stages: list[dict[str, Any]] = []
        for line in product.get("bom") or []:
            stages += self.route(line["item"])
        for st in product["routing"]:
            active = list(st["equipment"])
            if st.get("tooling"):
                active = [e for e in st["equipment"] if self.setup.get(e, {}).get("tooling") == st["tooling"]] or active
            stages.append({"product": product_id, **st, "active": active})
        return stages

    def size_of(self, layout_item: dict[str, Any]) -> str | None:
        """Tamaño (id) de un equipo del plano según su fuerza de cierre, o None si no cae en ninguno."""
        for group in self.data.get("equipment_sizes") or []:
            if group.get("layout_type") != layout_item.get("type"):
                continue
            clamp = (layout_item.get("params") or {}).get("clamp_t")
            for size in group["sizes"]:
                lo, hi = size.get("clamp_t", [0, float("inf")])
                if clamp is not None and lo <= clamp <= hi:
                    return size["id"]
        return None

    # ------------------------------------------------------------------ validación cruzada
    def validate(self, layout: dict[str, Any], library: Any | None = None) -> list[str]:
        errors: list[str] = []
        items = {e["id"]: e for e in layout.get("equipment", [])}

        for mold in self.tooling.values():
            label = f"herramental {mold['id']}"
            if mold["product"] not in self.products:
                errors.append(f"{label}: producto desconocido {mold['product']!r}")
            if mold["kind"] == "mold":
                mat = self.materials.get(mold["material"])
                if mat is None:
                    errors.append(f"{label}: material desconocido {mold['material']!r}")
                elif not mat.get("resin"):
                    errors.append(f"{label}: el material {mat['id']} no es una resina (falta resin)")
                if mold["shot_kg"] < mold["cavities"] * mold["part_g"] / 1000.0:
                    errors.append(f"{label}: shot_kg {mold['shot_kg']} es menor que cavidades × peso de pieza")

        for product in self.products.values():
            label = f"producto {product['id']}"
            for color in product.get("colors") or []:
                if self.materials.get(color, {}).get("kind") != "masterbatch":
                    errors.append(f"{label}: color {color!r} no es un masterbatch del catálogo")
            for line in product.get("bom") or []:
                if line["item"] not in self.products and line["item"] not in self.materials:
                    errors.append(f"{label}: componente desconocido {line['item']!r}")
            for st in product["routing"]:
                where = f"{label}, etapa {st['stage']}"
                for eid in st["equipment"]:
                    if eid not in items:
                        errors.append(f"{where}: {eid} no existe en plant.yaml")
                if tid := st.get("tooling"):
                    mold = self.tooling.get(tid)
                    if mold is None:
                        errors.append(f"{where}: herramental desconocido {tid!r}")
                        continue
                    if mold["product"] != product["id"]:
                        errors.append(f"{where}: el molde {tid} es de {mold['product']}, no de {product['id']}")
                    for eid in st["equipment"]:
                        if eid in items and (why := self.fits(mold, items[eid])):
                            errors.append(f"{where}: el molde {tid} no cabe en {eid} ({why})")
        errors += self._check_cycles()

        for eid, mounted in self.setup.items():
            label = f"montaje {eid}"
            mold = self.tooling.get(mounted["tooling"])
            if eid not in items:
                errors.append(f"{label}: no existe en plant.yaml")
                continue
            if mold is None:
                errors.append(f"{label}: herramental desconocido {mounted['tooling']!r}")
                continue
            before = len(errors)
            if why := self.fits(mold, items[eid]):
                errors.append(f"{label}: el molde {mold['id']} no cabe ({why})")
            product = self.products.get(mold["product"], {})
            if (color := mounted.get("color")) and color not in (product.get("colors") or []):
                errors.append(f"{label}: color {color!r} no está entre los del producto {mold['product']}")
            if not any(eid in st["equipment"] for st in product.get("routing", []) if st.get("tooling") == mold["id"]):
                errors.append(f"{label}: no está entre las inyectoras de la ruta de {mold['product']}")
            # El plano muestra los mismos datos que el molde (lo leen la escena y pallet_sizing).
            if len(errors) == before and product and mold.get("material") in self.materials:
                layout_params = items[eid].get("params") or {}
                for key, value in self.machine_params(eid).items():
                    if layout_params.get(key) != value:
                        errors.append(f"{label}: plant.yaml dice {key}={layout_params.get(key)!r} y el molde {value!r}")

        for group in self.data.get("equipment_sizes") or []:
            if library is not None:
                try:
                    presets = library.get(group["type"]).spec.presets
                except KeyError:
                    errors.append(f"tamaños: tipo de librería desconocido {group['type']!r}")
                    presets = {}
                for size in group["sizes"]:
                    for preset in size.get("presets") or []:
                        if presets and preset not in presets:
                            errors.append(f"tamaño {size['id']}: preset desconocido {preset!r}")
            for eid, item in items.items():
                if item.get("type") == group.get("layout_type") and self.size_of(item) is None:
                    errors.append(f"tamaños: {eid} ({(item.get('params') or {}).get('clamp_t')} t) no cae en ningún tamaño")

        for order in self.data.get("orders") or []:
            if order["product"] not in self.products:
                errors.append(f"pedido {order['id']}: producto desconocido {order['product']!r}")
        return errors

    @staticmethod
    def fits(mold: dict[str, Any], item: dict[str, Any]) -> str:
        """Motivo por el que un molde no cabe en una inyectora del plano ('' si cabe)."""
        params = item.get("params") or {}
        clamp, shot = params.get("clamp_t"), params.get("max_shot_kg")
        if clamp is None or shot is None:
            return "el equipo no declara clamp_t y max_shot_kg"
        if clamp < mold["min_clamp_t"]:
            return f"{clamp} t de cierre, el molde pide {mold['min_clamp_t']} t"
        if shot < mold["shot_kg"]:
            return f"{shot} kg de inyección, el molde pide {mold['shot_kg']} kg"
        return ""

    def _check_cycles(self) -> list[str]:
        errors: list[str] = []

        def visit(pid: str, path: list[str]) -> None:
            if pid in path:
                errors.append(f"producto {pid}: la lista de materiales es circular ({' → '.join([*path, pid])})")
                return
            for line in self.products.get(pid, {}).get("bom") or []:
                if line["item"] in self.products:
                    visit(line["item"], [*path, pid])

        for pid in self.products:
            visit(pid, [])
        return errors
