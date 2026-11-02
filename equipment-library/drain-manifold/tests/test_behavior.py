from twin_runtime import Library, StepContext


def test_combines_four_floor_drains_and_conserves_mass_at_y_split() -> None:
    manifold = Library().get("drain-manifold").create("manifold", random_faults=False)
    manifold.inputs["inlet_flow_kg_h"] = 12_000.0
    manifold.update(StepContext(t=0.0, dt=1.0))
    values = manifold.true_values()
    assert values["inlet_flow_kg_h"] == 12_000.0
    assert values["tank_1_flow_kg_h"] == 6_000.0
    assert values["tank_2_flow_kg_h"] == 6_000.0
    assert values["balance_error_kg_h"] == 0.0
    assert manifold.state.current == "running"


def test_configured_split_is_bounded_and_keeps_all_flow() -> None:
    manifold = Library().get("drain-manifold").create(
        "manifold", params={"tank_1_share": 0.7}, random_faults=False
    )
    manifold.inputs["inlet_flow_kg_h"] = 1_000.0
    manifold.update(StepContext(t=0.0, dt=1.0))
    values = manifold.true_values()
    assert values["tank_1_flow_kg_h"] == 700.0
    assert values["tank_2_flow_kg_h"] == 300.0
    assert values["balance_error_kg_h"] == 0.0
