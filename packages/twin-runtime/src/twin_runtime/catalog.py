"""Catálogo de datos de una planta: materiales, productos con su ruta, herramental, tamaños de equipo y montaje.

Vive en industrial-models/<planta>/catalog/*.yaml y se valida con industrial-models/_schema/catalog.schema.json
más las reglas cruzadas de este módulo (referencias, compatibilidad herramental–equipo, coherencia con el plano).
El motor de planta lo lee: un equipo con herramental montado (setup.yaml) toma de él sus parámetros. Una inyectora
con molde recibe producto, resina, cavidades, peso de pieza y ciclo; una llenadora con formato, su unit_ml; una
troqueladora con troquel, sus cajas por lámina. Plan completo en docs/datos-reales.md.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import jsonschema

from .spec import SpecError, load_yaml

CATALOG_DIR = "catalog"
SCHEMA_PATH = Path("_schema") / "catalog.schema.json"
# Parámetros de la inyectora que vienen del molde montado; simulation.yaml no debe repetirlos.
MOLD_PARAMS = ("product", "material", "cavities", "part_g", "cycle_s")
# Cómo se nombra cada clase de herramental en los mensajes y en la escena.
KIND_NAMES = {"mold": "molde", "recipe": "receta", "format": "formato", "die": "troquel"}
PARAM_NAMES = {"boxes_per_sheet": "cajas por lámina", "unit_ml": "ml"}


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
        return cls.from_data(folder, data)

    @classmethod
    def from_data(cls, folder: Path, data: dict[str, Any]) -> Catalog:
        """Catálogo a partir de datos ya unidos (folder es <planta>/catalog). Valida el esquema y los ids repetidos."""
        schema = json.loads((folder.parent.parent / SCHEMA_PATH).read_text(encoding="utf-8"))
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
        """Parámetros que da el herramental montado en ese equipo ({} si no tiene nada montado en el catálogo).

        Un molde da los de la inyectora (MOLD_PARAMS); los demás, su campo params.
        """
        mounted = self.setup.get(equipment_id)
        if not mounted:
            return {}
        mold = self.tooling[mounted["tooling"]]
        if mold["kind"] != "mold":
            return dict(mold.get("params") or {})
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
        return self.products.get(self.tooling[mounted["tooling"]].get("product", "")) if mounted else None

    def route(self, product_id: str) -> list[dict[str, Any]]:
        """Ruta completa de un producto: primero la de sus componentes (en el orden de la lista de materiales) y luego la suya.

        Cada etapa trae `equipment` (donde puede hacerse) y `active` (donde se hace hoy: en una etapa con molde,
        las inyectoras que lo tienen montado; si ninguna, todas las candidatas). Es lo que la escena 3D resalta.
        """
        return self.route_graph(product_id)["stages"]

    def route_graph(self, product_id: str, layout: dict[str, Any] | None = None) -> dict[str, Any]:
        """Ruta como grafo: etapas (las de route()) y enlaces [de, a] entre índices de etapa.

        Dentro de un producto, cada etapa va a la siguiente; la última etapa de cada componente va a la primera del
        producto que lo usa (el cuerpo y el pedal de la papelera llegan al ensamble). Con el plano, cada etapa trae
        además `times` (tiempo unitario y de lote, ver stage_times).
        """
        stages: list[dict[str, Any]] = []
        edges: list[list[int]] = []

        def add(pid: str) -> tuple[int, int]:
            product = self.products[pid]
            ends = [add(line["item"])[1] for line in product.get("bom") or [] if line["item"] in self.products]
            first = len(stages)
            for st in product["routing"]:
                active = list(st["equipment"])
                if st.get("tooling"):
                    active = [e for e in st["equipment"] if self.setup.get(e, {}).get("tooling") == st["tooling"]] or active
                stages.append({"product": pid, **st, "active": active})
            edges.extend([end, first] for end in ends)
            edges.extend([i, i + 1] for i in range(first, len(stages) - 1))
            return first, len(stages) - 1

        add(product_id)
        if layout is not None:
            items = {e["id"]: e for e in layout.get("equipment", [])}
            recipes = {r["id"].replace("_", "-"): r for r in layout.get("recipes") or []}
            last: float | None = None
            for st in stages:
                st["times"] = self.stage_times(st, items, recipes, last)
                last = st["times"].get("unit_s", last)
        return {"stages": stages, "edges": edges}

    def stage_times(
        self, st: dict[str, Any], items: dict[str, Any], recipes: dict[str, Any], last_unit_s: float | None = None
    ) -> dict[str, Any]:
        """Tiempo unitario (s por unidad del producto) y lote de una etapa, y de dónde sale cada dato.

        Orden: lo que la etapa declara en el catálogo (cycle_s, batch_qty, batch_min); el herramental (molde: ciclo ÷
        cavidades; receta: suma de las fases de recipes del plano y su lote en kg); el primer equipo activo del plano
        (units_min, flow_kg_h, flow_l_h, sheets_min × cajas por lámina). Un lote sin duración propia (estiba de un
        buffer, caja de una mesa de empaque) dura su cantidad por el último tiempo unitario conocido de la ruta.
        """
        unit = self.products.get(st["product"], {}).get("unit", "u")
        out: dict[str, Any] = {"unit": unit}
        tool = self.tooling.get(st.get("tooling") or "")
        params = (items.get(next(iter(st.get("active") or st["equipment"]), ""), {}).get("params") or {})
        if st.get("cycle_s") is not None:
            out.update(unit_s=st["cycle_s"], unit_source="catálogo")
        elif tool and tool["kind"] == "mold":
            why = f"molde: {tool['cycle_s']:g} s ÷ {tool['cavities']} cav"
            out.update(unit_s=round(tool["cycle_s"] / tool["cavities"], 3), unit_source=why)
        elif params.get("units_min"):
            out.update(unit_s=round(60 / params["units_min"], 3), unit_source=f"plano: {params['units_min']:g} u/min")
        elif params.get("sheets_min"):
            per = (tool or {}).get("params", {}).get("boxes_per_sheet") or params.get("boxes_per_sheet") or 1
            why = f"plano: {params['sheets_min']:g} láminas/min × {per}"
            out.update(unit_s=round(60 / (params["sheets_min"] * per), 3), unit_source=why)
        elif params.get("flow_kg_h"):
            out.update(unit_s=round(3600 / params["flow_kg_h"], 4), unit_source=f"plano: {params['flow_kg_h']:g} kg/h")
        elif params.get("flow_l_h"):
            out.update(unit_s=round(3600 / params["flow_l_h"], 4), unit_source=f"plano: {params['flow_l_h']:g} L/h")

        if st.get("batch_qty") is not None or st.get("batch_min") is not None:
            out.update(batch_qty=st.get("batch_qty"), batch_min=st.get("batch_min"), batch_source="catálogo")
        elif tool and tool["kind"] == "recipe":
            rec = recipes.get(tool["id"])
            minutes = sum(ph.get("duration_min", 0) for ph in (rec or {}).get("phases") or [] if not ph.get("optional"))
            out.update(batch_qty=tool["batch_kg"], batch_min=minutes or None, batch_source="receta del plano" if minutes else "receta")
            if minutes and "unit_s" not in out:
                out.update(unit_s=round(minutes * 60 / tool["batch_kg"], 4), unit_source="receta: duración del lote ÷ kg")
        elif params.get("pallet_pieces"):
            out.update(batch_qty=params["pallet_pieces"], batch_source="plano: piezas por estiba")
        elif params.get("box_units"):
            out.update(batch_qty=params["box_units"], batch_source="plano: unidades por caja")
        if out.get("batch_qty") and out.get("batch_min") is None:
            base = out.get("unit_s") or last_unit_s
            if base:
                out["batch_min"] = round(out["batch_qty"] * base / 60, 1)
        if st.get("transfer_min") is not None:
            out["transfer_min"] = st["transfer_min"]
        return out

    def summary(self, layout: dict[str, Any]) -> dict[str, Any]:
        """Lo que la escena necesita del catálogo: productos con su ruta y el tamaño de cada equipo."""

        def color(mid: str) -> dict[str, Any]:
            mat = self.materials.get(mid, {})
            return {"id": mid, "name": mat.get("name", mid), "hex": mat.get("color")}

        products = []
        for pid, product in self.products.items():
            molds = [self.tooling[st["tooling"]] for st in product["routing"] if st.get("tooling") in self.tooling]
            colors = [color(c) for c in product.get("colors") or []]
            if not colors and product.get("color"):
                colors = [{"id": pid, "name": product["name"], "hex": product["color"]}]
            products.append(
                {
                    "id": pid,
                    "name": product["name"],
                    "family": product.get("family"),
                    "kind": product["kind"],
                    "unit": product["unit"],
                    "size": product.get("size"),
                    "colors": colors,
                    "bom": [
                        {**line, "name": self.products.get(line["item"], self.materials.get(line["item"], {})).get("name", line["item"])}
                        for line in product.get("bom") or []
                    ],
                    "tooling": [
                        {k: m[k] for k in ("id", "kind", "name", "cavities", "part_g", "cycle_s", "min_clamp_t", "change_min") if k in m}
                        | {"material": self.materials.get(m.get("material", ""), {}).get("name"), "detail": self.tooling_detail(m)}
                        for m in molds
                    ],
                    "assumed": product.get("assumed", False),
                    "source": product,
                    **self.route_graph(pid, layout),
                }
            )
        sizes: dict[str, str] = {}
        names = {s["id"]: s["name"] for g in self.data.get("equipment_sizes") or [] for s in g["sizes"]}
        for item in layout.get("equipment", []):
            if (sid := self.size_of(item)) is not None:
                sizes[item["id"]] = names[sid]
        tooling = [{k: t[k] for k in ("id", "kind", "name", "product", "size") if k in t} for t in self.tooling.values()]
        return {"products": products, "sizes": sizes, "tooling": tooling, "schedule": bool(self.data.get("demand"))}

    def tooling_detail(self, tool: dict[str, Any]) -> str:
        """Resumen de una línea del herramental para la escena."""
        if tool["kind"] == "mold":
            resin = self.materials.get(tool["material"], {}).get("name", tool["material"])
            return f"{tool['cavities']} cav · {tool['part_g']:g} g · {tool['cycle_s']:g} s · {resin}"
        parts = [tool["size"]] if tool.get("size") and tool["size"] not in tool["name"] else []
        if tool["kind"] == "recipe":
            parts.append(f"lote {tool['batch_kg']:g} kg")
            if tool.get("yield_pct"):
                parts.append(f"rendimiento {tool['yield_pct']:g} %")
        parts += [f"{v:g} {PARAM_NAMES.get(k, k)}" for k, v in (tool.get("params") or {}).items() if k != "unit_ml" or not tool.get("size")]
        if tool.get("change_min") is not None:
            parts.append(f"cambio {tool['change_min']:g} min")
        return " · ".join(parts)

    def with_product(self, product: dict[str, Any], layout: dict[str, Any], library: Any | None = None) -> tuple[Catalog | None, list[str]]:
        """Catálogo con un producto más (o reemplazado), y los errores que ese producto agrega. No escribe nada."""
        data = {**self.data, "products": [p for p in self.data.get("products") or [] if p["id"] != product.get("id")] + [product]}
        try:
            cat = Catalog.from_data(self.folder, data)
        except SpecError as exc:
            return None, [_friendly(line.split(": ", 1)[-1]) for line in str(exc).split("\n")]
        before = set(self.validate(layout, library))
        return cat, [e for e in cat.validate(layout, library) if e not in before]

    def size_of(self, layout_item: dict[str, Any]) -> str | None:
        """Tamaño (id) de un equipo del plano, o None si no cae en ninguno.

        El tamaño se decide por la lista explícita de equipos del tamaño o por el rango del parámetro `by` del grupo
        (por defecto la fuerza de cierre, clamp_t).
        """
        group = self._size_group(layout_item)
        if group is None:
            return None
        by = group.get("by", "clamp_t")
        value = (layout_item.get("params") or {}).get(by)
        for size in group["sizes"]:
            if layout_item["id"] in (size.get("equipment") or []):
                return size["id"]
            rng = size.get("range") or size.get(by)
            if rng is not None and isinstance(value, int | float) and rng[0] <= value <= rng[1]:
                return size["id"]
        return None

    def _size_group(self, layout_item: dict[str, Any]) -> dict[str, Any] | None:
        for group in self.data.get("equipment_sizes") or []:
            types = group.get("layout_type")
            if layout_item.get("type") in ([types] if isinstance(types, str) else types or []):
                return group
        return None

    # ------------------------------------------------------------------ validación cruzada
    def validate(self, layout: dict[str, Any], library: Any | None = None) -> list[str]:
        errors: list[str] = []
        items = {e["id"]: e for e in layout.get("equipment", [])}

        for tool in self.tooling.values():
            label = f"herramental {tool['id']}"
            if tool.get("product") and tool["product"] not in self.products:
                errors.append(f"{label}: producto desconocido {tool['product']!r}")
            if tool["kind"] == "mold":
                mat = self.materials.get(tool["material"])
                if mat is None:
                    errors.append(f"{label}: material desconocido {tool['material']!r}")
                elif not mat.get("resin"):
                    errors.append(f"{label}: el material {mat['id']} no es una resina (falta resin)")
                if tool["shot_kg"] < tool["cavities"] * tool["part_g"] / 1000.0:
                    errors.append(f"{label}: shot_kg {tool['shot_kg']} es menor que cavidades × peso de pieza")
            if formula := tool.get("formula_pct"):
                for mid in formula:
                    if mid not in self.materials:
                        errors.append(f"{label}: material desconocido {mid!r} en la fórmula")
                if abs(sum(formula.values()) - 100.0) > 0.05:
                    errors.append(f"{label}: la fórmula suma {sum(formula.values()):g} %, no 100 %")
        errors += self._check_layout_recipes(layout)

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
                    tool = self.tooling.get(tid)
                    if tool is None:
                        errors.append(f"{where}: herramental desconocido {tid!r}")
                        continue
                    name = KIND_NAMES[tool["kind"]]
                    if tool.get("product") and tool["product"] != product["id"]:
                        errors.append(f"{where}: el {name} {tid} es de {tool['product']}, no de {product['id']}")
                    for eid in st["equipment"]:
                        if eid in items and (why := self.fits(tool, items[eid])):
                            errors.append(f"{where}: el {name} {tid} no cabe en {eid} ({why})")
        errors += self._check_cycles()

        for eid, mounted in self.setup.items():
            label = f"montaje {eid}"
            tool = self.tooling.get(mounted["tooling"])
            if eid not in items:
                errors.append(f"{label}: no existe en plant.yaml")
                continue
            if tool is None:
                errors.append(f"{label}: herramental desconocido {mounted['tooling']!r}")
                continue
            name = KIND_NAMES[tool["kind"]]
            before = len(errors)
            if why := self.fits(tool, items[eid]):
                errors.append(f"{label}: el {name} {tool['id']} no cabe ({why})")
            routed = [p for p in self.products.values() if any(st.get("tooling") == tool["id"] for st in p["routing"])]
            colors = {c for p in routed for c in p.get("colors") or []}
            if (color := mounted.get("color")) and color not in colors:
                errors.append(f"{label}: color {color!r} no está entre los de {', '.join(p['id'] for p in routed) or 'ningún producto'}")
            if not any(eid in st["equipment"] for p in routed for st in p["routing"] if st.get("tooling") == tool["id"]):
                errors.append(f"{label}: no está entre los equipos de la ruta de ningún producto con el {name} {tool['id']}")
            # El plano muestra los mismos datos que el herramental (lo leen la escena y pallet_sizing).
            if len(errors) == before and (tool["kind"] != "mold" or tool["material"] in self.materials):
                layout_params = items[eid].get("params") or {}
                for key, value in self.machine_params(eid).items():
                    if (tool["kind"] == "mold" or key in layout_params) and layout_params.get(key) != value:
                        errors.append(f"{label}: plant.yaml dice {key}={layout_params.get(key)!r} y el {name} {value!r}")

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
            by = group.get("by", "clamp_t")
            for size in group["sizes"]:
                for eid in size.get("equipment") or []:
                    if eid not in items:
                        errors.append(f"tamaño {size['id']}: {eid} no existe en plant.yaml")
            for eid, item in items.items():
                if self._size_group(item) is group and self.size_of(item) is None:
                    errors.append(f"tamaños: {eid} ({by}={(item.get('params') or {}).get(by)}) no cae en ningún tamaño")

        for order in self.data.get("orders") or []:
            if order["product"] not in self.products:
                errors.append(f"pedido {order['id']}: producto desconocido {order['product']!r}")
        demand = self.data.get("demand")
        if demand:
            for line in demand["products"]:
                product = self.products.get(line["product"])
                if product is None:
                    errors.append(f"demanda: producto desconocido {line['product']!r}")
                elif product["kind"] != "finished":
                    errors.append(f"demanda: {line['product']} es un semielaborado; solo se piden productos terminados")
                lo, hi = line["order_qty"]
                if lo > hi:
                    errors.append(f"demanda: {line['product']}: order_qty [{lo}, {hi}] al revés")
            for mid in (demand.get("late") or {}).get("materials") or []:
                if mid not in self.materials:
                    errors.append(f"demanda: material desconocido {mid!r} en late.materials")
            for sh in demand["shifts"]:
                if sh["start"] >= sh["end"]:
                    errors.append(f"demanda: turno {sh.get('name', sh['start'])}: termina antes de empezar")
        return errors

    def _check_layout_recipes(self, layout: dict[str, Any]) -> list[str]:
        """Las recetas que el plano también describe (recipes del plant.yaml) dicen lo mismo: lote y fórmula."""
        errors: list[str] = []
        for rec in layout.get("recipes") or []:
            tool = self.tooling.get(rec["id"].replace("_", "-"))
            if tool is None or tool["kind"] != "recipe":
                continue
            label = f"receta {tool['id']}"
            if rec.get("batch_kg") != tool["batch_kg"]:
                errors.append(f"{label}: plant.yaml dice batch_kg={rec.get('batch_kg')!r} y el catálogo {tool['batch_kg']!r}")
            formula = {k.replace("_", "-"): v for k, v in (rec.get("formula_pct") or {}).items()}
            if formula != tool["formula_pct"]:
                errors.append(f"{label}: la fórmula del plant.yaml no coincide con la del catálogo")
        return errors

    @staticmethod
    def fits(tool: dict[str, Any], item: dict[str, Any]) -> str:
        """Motivo por el que un herramental no cabe en un equipo del plano ('' si cabe)."""
        params = item.get("params") or {}
        if (types := tool.get("layout_types")) and item.get("type") not in types:
            return f"es {item.get('type')}, el {KIND_NAMES[tool['kind']]} va en {', '.join(types)}"
        if tool["kind"] == "mold":
            clamp, shot = params.get("clamp_t"), params.get("max_shot_kg")
            if clamp is None or shot is None:
                return "el equipo no declara clamp_t y max_shot_kg"
            if clamp < tool["min_clamp_t"]:
                return f"{clamp} t de cierre, el molde pide {tool['min_clamp_t']} t"
            if shot < tool["shot_kg"]:
                return f"{shot} kg de inyección, el molde pide {tool['shot_kg']} kg"
        if tool["kind"] == "recipe" and (cap := params.get("batch_kg")) is not None and cap < tool["batch_kg"]:
            return f"lote de {cap} kg, la receta pide {tool['batch_kg']} kg"
        if (ml := (tool.get("params") or {}).get("unit_ml")) is not None:
            formats = params.get("formats_ml") or ([params["unit_ml"]] if "unit_ml" in params else None)
            if formats is not None and ml not in formats:
                return f"llena {', '.join(f'{f} ml' for f in formats)}, el formato es de {ml} ml"
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


def _friendly(error: str) -> str:
    """Error del esquema en palabras del editor: «products/4/routing/3/equipment: [] should be non-empty» → etapa 4."""
    error = re.sub(r"^products/\d+/", "", error)
    error = re.sub(r"routing/(\d+)/?", lambda m: f"etapa {int(m.group(1)) + 1}: ", error)
    error = error.replace(": : ", ": ").replace(": equipment: [] should be non-empty", ": falta al menos un equipo")
    return error.replace("[] should be non-empty", "no puede quedar vacío")
