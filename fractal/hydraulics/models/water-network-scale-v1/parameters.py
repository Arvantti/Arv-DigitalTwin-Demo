"""Carga contratos declarativos de planta y librería; nunca importa el runtime."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

ROOT = Path(__file__).resolve().parents[4]
PLANT_DIR = ROOT / "industrial-models" / "water-network-scale-v1"
MODEL_FILE = PLANT_DIR / "fractal" / "model.yaml"
LIBRARY_DIR = ROOT / "equipment-library"


def _read(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as stream:
        return yaml.safe_load(stream)


def load() -> dict[str, Any]:
    """Resuelve presets y overrides del paquete declarativo de planta."""
    model = _read(MODEL_FILE)
    model["plant"] = _read(PLANT_DIR / "plant.yaml")
    model["simulation"] = _read(PLANT_DIR / "simulation.yaml")
    plant_equipment = {item["id"]: item for item in model["plant"]["equipment"]}
    models: dict[str, Any] = {}
    for equipment_id, instance in model["simulation"]["equipment"].items():
        equipment_dir = LIBRARY_DIR / instance["type"]
        contract = _read(equipment_dir / "equipment.yaml")
        preset_id = instance.get("preset")
        preset = _read(equipment_dir / "presets" / f"{preset_id}.yaml") if preset_id else {"params": {}}
        models[equipment_id] = {
            "type": instance["type"],
            "params": {
                **{name: spec["default"] for name, spec in contract.get("params", {}).items() if "default" in spec},
                **preset.get("params", {}),
                **instance.get("params", {}),
            },
            "contract": contract,
            "preset": preset,
            "layout": plant_equipment.get(equipment_id, {}),
        }
    model["equipment_models"] = models
    return model


def node(model: dict[str, Any], node_id: str) -> dict[str, Any]:
    return next(item for item in model["nodes"] if item["id"] == node_id)


def equipment_parameters(model: dict[str, Any], equipment_id: str) -> dict[str, Any]:
    return model["equipment_models"][equipment_id]
