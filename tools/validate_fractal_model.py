"""Valida que el modelo declarativo Fractal refiera equipos del layout de planta."""

from __future__ import annotations

from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
PLANT = ROOT / "industrial-models/water-network-scale-v1/plant.yaml"
MODEL = ROOT / "industrial-models/water-network-scale-v1/fractal/model.yaml"


def main() -> None:
    plant = yaml.safe_load(PLANT.read_text(encoding="utf-8"))
    model = yaml.safe_load(MODEL.read_text(encoding="utf-8"))
    simulation_path = ROOT / "industrial-models/water-network-scale-v1/simulation.yaml"
    simulation = yaml.safe_load(simulation_path.read_text(encoding="utf-8"))
    equipment = {item["id"]: item["type"] for item in plant["equipment"]}
    simulated_equipment = simulation["equipment"]
    nodes = {item["id"]: item for item in model["nodes"]}
    errors: list[str] = []
    if len(nodes) != len(model["nodes"]):
        errors.append("hay IDs de nodo Fractal duplicados")
    layout_ids = set(equipment)
    for hydraulic_link in simulation.get("links", []):
        for endpoint in (hydraulic_link.get("from", ""), hydraulic_link.get("to", "")):
            equipment_id = endpoint.split(".", 1)[0]
            if equipment_id not in layout_ids:
                errors.append(f"enlace hidráulico apunta a equipo inexistente: {endpoint}")
    for flow in plant.get("flows", []):
        if flow.get("piped") and (flow.get("from") not in layout_ids or flow.get("to") not in layout_ids):
            errors.append(f"tubería declarada apunta a equipo inexistente: {flow.get('from')} → {flow.get('to')}")
    expected_types = {
        "tank": "water_tank",
        "pump_set": "pump_set",
        "pressure_reducing_station": "pressure_reducing_station",
        "demand_grid": "distribution_grid",
    }
    layout_by_id = {item["id"]: item for item in plant["equipment"]}
    for node in nodes.values():
        equipment_id = node["equipment_id"]
        if equipment_id not in equipment:
            errors.append(f"{node['id']}: equipo inexistente {equipment_id}")
            continue
        expected = expected_types.get(node["kind"])
        actual = equipment[equipment_id]
        if expected and actual != expected:
            errors.append(f"{node['id']}: tipo {actual}, se esperaba {expected}")
        if equipment_id not in simulated_equipment:
            errors.append(f"{node['id']}: equipo {equipment_id} no está simulado en simulation.yaml")
        if node["kind"] == "tank" and "capacity_m3" in node:
            layout_m3 = float(layout_by_id[equipment_id]["params"]["volume_l"]) / 1000
            if float(node["capacity_m3"]) != layout_m3:
                errors.append(f"{node['id']}: capacidad {node['capacity_m3']} m³ difiere de layout {layout_m3} m³")
    for source, target in model["links"]:
        if source not in nodes or target not in nodes:
            errors.append(f"enlace inválido: {source} → {target}")
    if errors:
        raise SystemExit("Modelo Fractal inválido:\n- " + "\n- ".join(errors))
    print(f"Modelo Fractal válido: {len(nodes)} nodos, {len(model['links'])} enlaces.")


if __name__ == "__main__":
    main()
