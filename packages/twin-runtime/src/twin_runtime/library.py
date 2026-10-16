"""Descubrimiento de la librería de equipos: contratos, comportamientos y escenarios."""

from __future__ import annotations

import importlib.util
import inspect
import os
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .behavior import EquipmentBehavior
from .spec import EquipmentSpec, SpecError, load_spec, load_yaml

LIBRARY_DIR_NAME = "equipment-library"


def find_library_root(start: Path | None = None) -> Path:
    """Raíz de la librería: $TWIN_LIBRARY, o la carpeta equipment-library más cercana hacia arriba."""
    env = os.environ.get("TWIN_LIBRARY")
    if env:
        return Path(env).resolve()
    candidates = [start or Path.cwd(), Path(__file__).resolve()]
    for base in candidates:
        for parent in [base, *base.parents]:
            lib = parent / LIBRARY_DIR_NAME
            if (lib / "_schema").is_dir():
                return lib
    raise FileNotFoundError("no se encontró equipment-library/ (defina TWIN_LIBRARY)")


@dataclass
class ScenarioStep:
    at_s: float
    command: str | None = None
    args: dict[str, Any] = field(default_factory=dict)
    inputs: dict[str, Any] = field(default_factory=dict)


@dataclass
class Expectation:
    path: str
    min: float | None = None
    max: float | None = None
    equals: Any = None
    description: str = ""


@dataclass
class Scenario:
    id: str
    description: str
    duration_s: float
    dt: float = 0.5
    seed: int = 1
    preset: str | None = None
    params: dict[str, Any] = field(default_factory=dict)
    inputs: dict[str, Any] = field(default_factory=dict)
    random_faults: bool = False
    timeline: list[ScenarioStep] = field(default_factory=list)
    expect: list[Expectation] = field(default_factory=list)


@dataclass
class EquipmentType:
    spec: EquipmentSpec
    behavior_cls: type[EquipmentBehavior]
    scenarios: dict[str, Scenario]

    def create(
        self,
        equipment_id: str,
        preset: str | None = None,
        params: dict[str, Any] | None = None,
        seed: int = 0,
        random_faults: bool = True,
    ) -> EquipmentBehavior:
        resolved = self.spec.resolve_params(preset, params)
        return self.behavior_cls(equipment_id, self.spec, resolved, seed=seed, random_faults=random_faults)


def _load_behavior_class(folder: Path, spec: EquipmentSpec) -> type[EquipmentBehavior]:
    path = folder / "behavior.py"
    if not path.exists():
        raise SpecError(f"{folder}: falta behavior.py")
    module_name = "twin_equipment_" + folder.name.replace("-", "_")
    module_spec = importlib.util.spec_from_file_location(module_name, path)
    assert module_spec and module_spec.loader
    module = importlib.util.module_from_spec(module_spec)
    sys.modules[module_name] = module
    module_spec.loader.exec_module(module)
    classes = [
        obj
        for _, obj in inspect.getmembers(module, inspect.isclass)
        if issubclass(obj, EquipmentBehavior) and obj is not EquipmentBehavior and obj.type == spec.type
    ]
    if len(classes) != 1:
        raise SpecError(f"{path}: se esperaba exactamente una clase EquipmentBehavior con type={spec.type!r}")
    return classes[0]


def _load_scenarios(folder: Path, spec: EquipmentSpec) -> dict[str, Scenario]:
    path = folder / "scenarios.yaml"
    if not path.exists():
        return {}
    doc = load_yaml(path) or {}
    out: dict[str, Scenario] = {}
    for raw in doc.get("scenarios", []):
        sc = Scenario(
            id=raw["id"],
            description=raw.get("description", ""),
            duration_s=float(raw["duration_s"]),
            dt=float(raw.get("dt", 0.5)),
            seed=int(raw.get("seed", 1)),
            preset=raw.get("preset"),
            params=raw.get("params", {}),
            inputs=raw.get("inputs", {}),
            random_faults=bool(raw.get("random_faults", False)),
            timeline=[ScenarioStep(**s) for s in raw.get("timeline", [])],
            expect=[Expectation(**e) for e in raw.get("expect", [])],
        )
        for step in sc.timeline:
            if step.command and step.command not in spec.command_ids:
                raise SpecError(f"{path}: escenario {sc.id}: comando no declarado {step.command!r}")
        if sc.preset and sc.preset not in spec.presets:
            raise SpecError(f"{path}: escenario {sc.id}: preset desconocido {sc.preset!r}")
        out[sc.id] = sc
    return out


class Library:
    def __init__(self, root: Path | None = None) -> None:
        self.root = (root or find_library_root()).resolve()
        self._types: dict[str, EquipmentType] = {}

    def folders(self) -> list[Path]:
        return sorted(
            p for p in self.root.iterdir() if p.is_dir() and not p.name.startswith(("_", ".")) and (p / "equipment.yaml").exists()
        )

    def get(self, type_id: str) -> EquipmentType:
        if type_id not in self._types:
            folder = self.root / type_id
            if not (folder / "equipment.yaml").exists():
                raise KeyError(f"tipo de equipo desconocido: {type_id}")
            spec = load_spec(folder, self.root)
            self._types[type_id] = EquipmentType(
                spec=spec,
                behavior_cls=_load_behavior_class(folder, spec),
                scenarios=_load_scenarios(folder, spec),
            )
        return self._types[type_id]

    def all(self) -> list[EquipmentType]:
        return [self.get(f.name) for f in self.folders()]

    def validate_all(self) -> dict[str, list[str]]:
        """Valida cada tipo por separado y devuelve los errores por tipo (vacío = todo bien)."""
        report: dict[str, list[str]] = {}
        for folder in self.folders():
            try:
                eq = self.get(folder.name)
                errors = check_behavior_contract(eq)
            except (SpecError, Exception) as exc:  # noqa: BLE001 - se reporta cualquier fallo de carga
                errors = [f"{type(exc).__name__}: {exc}"]
            report[folder.name] = errors
        return report


def check_behavior_contract(eq: EquipmentType) -> list[str]:
    """Comprueba que el comportamiento publique exactamente lo que declara el contrato."""
    errors: list[str] = []
    default_preset = next(iter(eq.spec.presets), None)
    inst = eq.create("contract-check", preset=default_preset, seed=0, random_faults=False)
    declared_vars = {v["id"] for v in eq.spec.variables}
    produced = set(inst.true_values())
    if missing := declared_vars - produced:
        errors.append(f"true_values() no produce variables declaradas: {sorted(missing)}")
    if extra := produced - declared_vars:
        errors.append(f"true_values() produce variables no declaradas: {sorted(extra)}")
    channels = set(eq.spec.animation_channel_ids)
    anim = set(inst.animation())
    if missing := channels - anim:
        errors.append(f"animation() no produce canales declarados: {sorted(missing)}")
    if extra := anim - channels:
        errors.append(f"animation() produce canales no declarados: {sorted(extra)}")
    return errors
