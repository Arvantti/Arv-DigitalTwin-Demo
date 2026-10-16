"""Contrato de un tipo de equipo: carga, validación y resolución de parámetros."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml
from jsonschema import Draft202012Validator

SCHEMA_DIR_NAME = "_schema"


class SpecError(ValueError):
    """Error de contrato: equipment.yaml, preset o parámetros inválidos."""


def comma_split_errors(node: Any, source: Path, path: str = "") -> list[str]:
    """Detecta textos cortados por una coma sin comillas dentro de un mapa { ... } de YAML:
    `{ description: a, b }` produce la clave 'b' con valor nulo."""
    errors: list[str] = []
    if isinstance(node, dict):
        for k, v in node.items():
            if v is None and isinstance(k, str) and " " in k:
                errors.append(f"{source}: {path or '(raíz)'}: texto con coma sin comillas cerca de {k!r}; use comillas")
            errors.extend(comma_split_errors(v, source, f"{path}/{k}" if path else str(k)))
    elif isinstance(node, list):
        for i, v in enumerate(node):
            errors.extend(comma_split_errors(v, source, f"{path}/{i}"))
    return errors


def load_yaml(path: Path) -> Any:
    """Carga YAML y rechaza los errores de comas sin comillas antes de validar."""
    doc = yaml.safe_load(path.read_text(encoding="utf-8"))
    errors = comma_split_errors(doc, path)
    if errors:
        raise SpecError("\n".join(errors))
    return doc


def _load_schema(library_root: Path, name: str) -> Draft202012Validator:
    schema = json.loads((library_root / SCHEMA_DIR_NAME / name).read_text(encoding="utf-8"))
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema)


def _format_errors(validator: Draft202012Validator, doc: Any, source: Path) -> list[str]:
    out = []
    for err in sorted(validator.iter_errors(doc), key=lambda e: list(e.absolute_path)):
        where = "/".join(str(p) for p in err.absolute_path) or "(raíz)"
        out.append(f"{source}: {where}: {err.message}")
    return out


@dataclass(frozen=True)
class ParamDef:
    name: str
    type: str
    description: str
    unit: str | None = None
    default: Any = None
    min: float | None = None
    max: float | None = None
    values: tuple[Any, ...] | None = None
    required: bool = False

    def check(self, value: Any) -> str | None:
        """Devuelve un mensaje de error si el valor no cumple la definición."""
        t = self.type
        if t == "boolean" and not isinstance(value, bool):
            return f"{self.name}: se esperaba booleano, llegó {value!r}"
        if t in ("number", "integer"):
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                return f"{self.name}: se esperaba número, llegó {value!r}"
            if t == "integer" and int(value) != value:
                return f"{self.name}: se esperaba entero, llegó {value!r}"
            if self.min is not None and value < self.min:
                return f"{self.name}: {value} < mínimo {self.min} {self.unit or ''}".rstrip()
            if self.max is not None and value > self.max:
                return f"{self.name}: {value} > máximo {self.max} {self.unit or ''}".rstrip()
        if t == "string" and not isinstance(value, str):
            return f"{self.name}: se esperaba texto, llegó {value!r}"
        if t == "enum" and value not in (self.values or ()):
            return f"{self.name}: {value!r} no está en {list(self.values or ())}"
        return None


@dataclass(frozen=True)
class Preset:
    id: str
    description: str
    params: dict[str, Any]
    provenance: dict[str, str] = field(default_factory=dict)


@dataclass
class EquipmentSpec:
    """equipment.yaml ya validado, más sus presets."""

    type: str
    folder: Path
    raw: dict[str, Any]
    params: dict[str, ParamDef]
    presets: dict[str, Preset]

    @property
    def name(self) -> str:
        return self.raw["name"]

    @property
    def state_ids(self) -> list[str]:
        return [s["id"] for s in self.raw["states"]]

    @property
    def variables(self) -> list[dict[str, Any]]:
        return self.raw["variables"]

    @property
    def faults(self) -> list[dict[str, Any]]:
        return self.raw.get("faults", [])

    @property
    def event_ids(self) -> list[str]:
        return [e["id"] for e in self.raw.get("events", [])]

    @property
    def command_ids(self) -> list[str]:
        return [c["id"] for c in self.raw.get("commands", [])]

    @property
    def animation_channel_ids(self) -> list[str]:
        return [c["id"] for c in self.raw["animation_channels"]]

    def resolve_params(self, preset: str | None = None, overrides: dict[str, Any] | None = None) -> dict[str, Any]:
        """Parámetros finales: valores por defecto ← preset ← overrides, validados contra el contrato."""
        values = {name: p.default for name, p in self.params.items() if p.default is not None}
        if preset:
            if preset not in self.presets:
                raise SpecError(f"{self.type}: preset desconocido {preset!r}; disponibles: {sorted(self.presets)}")
            values.update(self.presets[preset].params)
        values.update(overrides or {})
        errors = self.check_params(values)
        if errors:
            raise SpecError(f"{self.type}: " + "; ".join(errors))
        return values

    def check_params(self, values: dict[str, Any], *, partial: bool = False) -> list[str]:
        errors = []
        for name, value in values.items():
            pdef = self.params.get(name)
            if pdef is None:
                errors.append(f"parámetro no declarado: {name}")
                continue
            msg = pdef.check(value)
            if msg:
                errors.append(msg)
        if not partial:
            for name, pdef in self.params.items():
                if pdef.required and name not in values:
                    errors.append(f"falta parámetro requerido: {name}")
        return errors

    def to_dict(self) -> dict[str, Any]:
        """Representación para la API y la galería."""
        return {
            **self.raw,
            "presets": {
                pid: {"description": p.description, "params": p.params, "provenance": p.provenance}
                for pid, p in self.presets.items()
            },
        }


def load_spec(folder: Path, library_root: Path) -> EquipmentSpec:
    """Carga y valida equipment.yaml y presets/*.yaml de una carpeta de equipo."""
    eq_validator = _load_schema(library_root, "equipment.schema.json")
    preset_validator = _load_schema(library_root, "preset.schema.json")

    path = folder / "equipment.yaml"
    raw = load_yaml(path)
    errors = _format_errors(eq_validator, raw, path)
    if errors:
        raise SpecError("\n".join(errors))
    if raw["type"] != folder.name:
        raise SpecError(f"{path}: type {raw['type']!r} no coincide con la carpeta {folder.name!r}")

    params = {
        name: ParamDef(
            name=name,
            type=d["type"],
            description=d["description"],
            unit=d.get("unit"),
            default=d.get("default"),
            min=d.get("min"),
            max=d.get("max"),
            values=tuple(d["values"]) if "values" in d else None,
            required=d.get("required", False),
        )
        for name, d in raw["params"].items()
    }
    spec = EquipmentSpec(type=raw["type"], folder=folder, raw=raw, params=params, presets={})

    problems: list[str] = []
    for name, pdef in params.items():
        if pdef.default is not None:
            msg = pdef.check(pdef.default)
            if msg:
                problems.append(f"{path}: default inválido: {msg}")
    for kind in ("variables", "events", "faults", "commands", "animation_channels", "phases"):
        ids = [item["id"] for item in raw.get(kind, [])]
        dup = {i for i in ids if ids.count(i) > 1}
        if dup:
            problems.append(f"{path}: ids duplicados en {kind}: {sorted(dup)}")

    for preset_path in sorted((folder / "presets").glob("*.yaml")):
        doc = load_yaml(preset_path)
        perr = _format_errors(preset_validator, doc, preset_path)
        if perr:
            problems.extend(perr)
            continue
        if doc["preset"] != preset_path.stem:
            problems.append(f"{preset_path}: preset {doc['preset']!r} no coincide con el nombre del archivo")
        for msg in spec.check_params(doc["params"], partial=True):
            problems.append(f"{preset_path}: {msg}")
        for pname in doc.get("provenance", {}):
            if pname not in params:
                problems.append(f"{preset_path}: provenance de parámetro no declarado {pname}")
        spec.presets[doc["preset"]] = Preset(
            id=doc["preset"],
            description=doc["description"],
            params=doc["params"],
            provenance=doc.get("provenance", {}),
        )
    if problems:
        raise SpecError("\n".join(problems))
    return spec
