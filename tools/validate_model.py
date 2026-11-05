"""Valida que cada modelo industrial portable declare exactamente sus dependencias.

Uso: uv run python tools/validate_model.py [modelo-id]
"""
from __future__ import annotations

import sys
from pathlib import Path

from twin_runtime.roots import plant_folder
from twin_runtime.spec import load_yaml

ROOT = Path(__file__).resolve().parents[1]
# Paquetes portables: plantas de demostración y plantas empaquetadas como proyecto propio (docs/architecture/plataforma-y-plantas.md).
ROOTS = (ROOT / "industrial-models", ROOT / "plants")
EQUIPMENT = ROOT / "equipment-library"


def validate(folder: Path) -> list[str]:
    errors: list[str] = []
    manifest_path = folder / "manifest.yaml"
    if not manifest_path.exists():
        return [f"{folder.name}: falta manifest.yaml"]
    manifest = load_yaml(manifest_path)
    model = manifest.get("model", {})
    if model.get("id") != folder.name:
        errors.append(f"{folder.name}: model.id debe coincidir con la carpeta")
    entries = manifest.get("entrypoints", {})
    for key in ("layout", "simulation", "domain_model"):
        if key in entries and not (folder / entries[key]).is_file():
            errors.append(f"{folder.name}: falta entrypoint {key}: {entries[key]}")
    declared = {item["type"] for item in manifest.get("equipment_dependencies", [])}
    simulation = load_yaml(folder / entries.get("simulation", "simulation.yaml"))
    used = {item["type"] for item in simulation.get("equipment", {}).values()}
    if declared != used:
        errors.append(f"{folder.name}: dependencias declaradas != tipos usados (declaradas={sorted(declared)}, usadas={sorted(used)})")
    for equipment_type in declared:
        if not (EQUIPMENT / equipment_type / "equipment.yaml").is_file():
            errors.append(f"{folder.name}: equipo inexistente: {equipment_type}")
    return errors


def main() -> int:
    selected = sys.argv[1:]
    found = sorted((f for root in ROOTS for f in root.glob("*-v1")), key=lambda f: f.name)
    folders = [plant_folder(item) for item in selected] if selected else found
    errors = [error for folder in folders for error in validate(folder)]
    if errors:
        print("\n".join(f"ERROR: {error}" for error in errors))
        return 1
    print(f"OK: {len(folders)} paquetes industriales portables validados")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
