"""Antirretornos DN50 después de cada válvula inter-piso."""

from twin_emulator_api.main import _plant_model


def test_interfloor_checks_are_after_restricting_valves_and_pass_forward_flow() -> None:
    plant = _plant_model("water-network-scale-v1").create(seed=1, random_faults=False)
    for _ in range(120):
        plant.step()
    result = plant.hydraulics.result
    for equipment_id in ("valve-between-12", "valve-between-23", "valve-between-34"):
        valve = plant.hydraulics.net.links[f"{equipment_id}/valve"]
        check = plant.hydraulics.net.links[f"{equipment_id}/valve_check"]
        assert check.status == "open"
        assert check.params["kv_m3h"] == 39  # DN50 Spirax Sarco DCV6; referencia asumida
        assert result.flows_m3h[check.id] > 0
        assert abs(result.flows_m3h[check.id] - result.flows_m3h[valve.id]) < 1e-6
