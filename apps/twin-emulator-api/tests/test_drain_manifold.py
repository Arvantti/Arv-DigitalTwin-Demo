from twin_emulator_api.main import _plant_model


def test_all_floor_drains_join_before_the_y_split() -> None:
    model = _plant_model("water-network-scale-v1")
    sources = [f"grid-0{level}" for level in range(1, 5)]
    assert all(
        any(link.src.equipment == source and link.dst.equipment == "drain-manifold-01" for link in model.flow_links)
        for source in sources
    )
    assert not any(link.src.equipment in sources and link.dst.equipment.startswith("tank-recirc-") for link in model.flow_links)
    assert {link.dst.equipment for link in model.flow_links if link.src.equipment == "drain-manifold-01"} == {
        "tank-recirc-01", "tank-recirc-02"
    }


def test_manifold_receives_sum_of_four_drain_streams_and_splits_evenly() -> None:
    plant = _plant_model("water-network-scale-v1").create(seed=1, random_faults=False)
    plant.run(120.0)
    manifold = plant.equipment["drain-manifold-01"]
    incoming = sum(
        record["flow_kg_h"]
        for edge, record in plant.link_state.items()
        if record["to"].startswith("drain-manifold-01.floor_")
    )
    assert abs(manifold.inputs["inlet_flow_kg_h"] - incoming) < 1e-6
    values = manifold.true_values()
    assert abs(values["tank_1_flow_kg_h"] - values["tank_2_flow_kg_h"]) < 1e-9
    assert abs(values["inlet_flow_kg_h"] - values["tank_1_flow_kg_h"] - values["tank_2_flow_kg_h"]) < 1e-9
    outgoing = [link for link in plant.model.flow_links if link.src.equipment == "drain-manifold-01"]
    assert len(outgoing) == 2
