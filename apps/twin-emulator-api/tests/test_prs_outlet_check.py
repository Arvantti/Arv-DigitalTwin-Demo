"""Antirretorno de la estación antes del primer piso, orientado hacia la red."""

from twin_emulator_api.main import _plant_model


def test_prs_outlet_check_is_open_and_has_declared_loss_under_forward_flow() -> None:
    plant = _plant_model("water-network-scale-v1").create(seed=1, random_faults=False)
    for _ in range(120):
        plant.step()
    result = plant.hydraulics.result
    check = plant.hydraulics.net.links["prs-01/outlet_check"]
    flow = result.flows_m3h[check.id]
    assert check.status == "open" and flow > 0
    assert check.params["kv_m3h"] == 158  # referencia publicada DN100; no identifica la válvula instalada
    loss = result.pressures_mca["prs-01/regulated"] - result.pressures_mca["prs-01/outlet"]
    assert abs(loss - 10.197 * (flow / 158) ** 2) < 0.0001
    assert abs(plant.equipment["prs-01"].p_out - result.pressures_mca["prs-01/outlet"]) < 0.01
