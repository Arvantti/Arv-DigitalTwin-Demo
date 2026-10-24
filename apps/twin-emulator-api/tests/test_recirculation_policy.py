"""Política PLC de retorno: suministro primero, alto individual y protección de succión."""

from twin_emulator_api.main import _plant_model


def test_supply_demand_and_either_return_start_recirculation() -> None:
    plant = _plant_model("water-network-scale-v1").create(seed=1, random_faults=False)
    pump = plant.equipment["pumpset-recirc-01"]
    assert pump.p["supply_start_pct"] == 30
    assert pump.p["return_high_start_pct"] == 90
    pump.inputs.update(source_level_pct=50, source_level_1_pct=45, source_level_2_pct=55, target_level_pct=70)
    pump._level_control()
    assert not pump.level_on

    pump.inputs["target_level_pct"] = 30
    pump._level_control()
    assert pump.level_on
    pump.inputs["target_level_pct"] = 90
    pump._level_control()
    assert not pump.level_on  # lleno tiene precedencia sobre solicitud por retorno alto

    pump.inputs.update(source_level_pct=60, source_level_1_pct=40, source_level_2_pct=90, target_level_pct=65)
    pump._level_control()
    assert pump.level_on  # el promedio no oculta el alto del segundo retorno
    pump.inputs.update(source_level_pct=19, source_level_1_pct=18, source_level_2_pct=20)
    pump._level_control()
    assert not pump.level_on  # no se bombea si falta agua en los retornos


def test_initial_tank_inventory_and_capacity_at_supply_30_percent() -> None:
    plant = _plant_model("water-network-scale-v1").create(seed=1, random_faults=False)
    tanks = plant.equipment
    supply_m3 = tanks["tank-supply-01"].p["volume_l"] / 1000
    returns_m3 = sum(tanks[name].p["volume_l"] / 1000 for name in ("tank-recirc-01", "tank-recirc-02"))
    initial_m3 = sum(tanks[name].mass / tanks[name].p["density_kg_m3"] for name in ("tank-supply-01", "tank-recirc-01", "tank-recirc-02"))
    # Balance manual: 3,888×0,70 + 4,512×0,40 = 4,5264 m³.
    assert abs(initial_m3 - 4.5264) < 1e-9
    assert abs(returns_m3 - 4.512) < 1e-9
    assert abs((initial_m3 - 0.30 * supply_m3) / returns_m3 - 0.7446808510638298) < 1e-9
    # Arrancar con suministro 100 % y ambos retornos 40 % eleva el inventario:
    # los retornos no pueden recibir todo el suministro antes de que éste llegue a 30 %.
    full_start_m3 = supply_m3 + 0.40 * returns_m3
    assert full_start_m3 - 0.30 * supply_m3 > returns_m3
    # Si el retorno es simétrico, el disparo preventivo al 90 % llega con suministro aún ≈42 %.
    assert (full_start_m3 - 0.90 * returns_m3) / supply_m3 > 0.30
