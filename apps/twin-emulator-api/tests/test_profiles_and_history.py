"""Administración de escenarios y viaje de lectura al pasado sin rebobinar PLC."""

import pytest
from fastapi.testclient import TestClient
from twin_emulator_api.main import _plant_model, app
from twin_emulator_api.profiles import ProfileStore, commands_for_hour, normalize_profile
from twin_emulator_api.sessions import PlantSession, manager

client = TestClient(app)
PLANT = "water-network-scale-v1"
BASE = f"/api/plants/{PLANT}"


def test_fixed_outlet_profile_keeps_auto_branch_and_maps_inlet_to_pump_setpoint() -> None:
    profile = normalize_profile(
        {
            "name": "Entrada 70 salida 40",
            "hours": {"0": {"prs": {"control_mode": "fixed_outlet", "inlet_pressure_mca": 70, "auto_outlet_mca": 40}}},
        }
    )
    prs = profile["hours"]["0"]["prs"]
    assert prs["branch"] == "auto"
    commands = commands_for_hour(profile, 0, inlet_pressure_offset_mca=1.25)
    assert {item["equipment"] for item in commands if item["command"] == "set_setpoint"} == {"pumpset-main-01"}
    assert next(item["args"]["mca"] for item in commands if item["command"] == "set_setpoint") == 71.25
    assert any(
        item["equipment"] == "prs-01" and item["command"] == "set_auto_control" and item["args"] == {"mode": "fixed_outlet", "mca": 40.0}
        for item in commands
    )
    assert not any(
        item["equipment"] == "prs-01" and item["command"] == "select_branch" and item["args"]["branch"] == "manual" for item in commands
    )
    plant = _plant_model(PLANT).create(seed=1, random_faults=False, horizon_s=60)
    session = PlantSession("fixed-prs-test", PLANT, plant, "profile", profile)
    session.apply_profile_hour(0)
    station = plant.equipment["prs-01"]
    assert station.branch == "auto" and station.open_b.value == 0
    assert station.auto_control_mode == "fixed_outlet" and station.auto_fixed_outlet_mca == 40
    assert plant.equipment["pumpset-main-01"].setpoint == 70
    for _ in range(3):
        plant.step()
    assert station.true_values()["auto_outlet_setpoint_mca"] == 40
    assert station.true_values()["flow_manual_m3h"] <= 1e-5
    with pytest.raises(ValueError, match="requiere la rama auto"):
        normalize_profile(
            {"name": "Invalid", "hours": {"0": {"prs": {"branch": "manual", "control_mode": "fixed_outlet", "auto_outlet_mca": 40}}}}
        )


def test_critical_point_profile_drives_l4_c44_with_a_separate_global_minimum_signal() -> None:
    profile = normalize_profile(
        {
            "name": "C44 provisional",
            "hours": {
                "0": {
                    "prs": {
                        "branch": "auto",
                        "control_mode": "critical_point",
                        "critical_control_point": "L4.C44",
                        "critical_setpoint_mca": 18,
                    }
                }
            },
        }
    )
    commands = commands_for_hour(profile, 0)
    assert any(item["command"] == "set_critical_setpoint" and item["args"]["mca"] == 18 for item in commands)
    assert any(item["command"] == "set_auto_control" and item["args"]["mode"] == "critical_point" for item in commands)
    assert not any(item["command"] == "select_branch" and item["args"]["branch"] == "manual" for item in commands)
    plant = _plant_model(PLANT).create(seed=1, random_faults=False, horizon_s=60)
    session = PlantSession("fixed-point-test", PLANT, plant, "profile", profile)
    session.apply_profile_hour(0)
    for _ in range(3):
        plant.step()
    station = plant.equipment["prs-01"]
    values = station.true_values()
    assert station.branch == "auto" and station.auto_control_mode == "critical_point"
    assert values["control_point_pressure_mca"] == pytest.approx(station.inputs["control_point_pressure_mca"])
    assert values["critical_pressure_mca"] == pytest.approx(station.inputs["critical_pressure_mca"])
    assert station.animation()["critical_pressure_mca"] == pytest.approx(max(0, values["control_point_pressure_mca"]))
    assert values["auto_outlet_setpoint_mca"] != pytest.approx(18)
    with pytest.raises(ValueError, match="requiere control_mode critical_point"):
        normalize_profile({"name": "Invalid", "hours": {"0": {"prs": {"critical_control_point": "L4.C44"}}}})
    with pytest.raises(ValueError, match="solo admite L4.C44"):
        normalize_profile(
            {
                "name": "Invalid",
                "hours": {
                    "0": {
                        "prs": {
                            "control_mode": "critical_point",
                            "critical_control_point": "L4.C43",
                            "critical_setpoint_mca": 18,
                        }
                    }
                },
            }
        )
    with pytest.raises(ValueError, match="requiere la rama auto"):
        normalize_profile(
            {
                "name": "Invalid",
                "hours": {
                    "0": {
                        "prs": {
                            "branch": "manual",
                            "control_mode": "critical_point",
                            "critical_control_point": "L4.C44",
                            "critical_setpoint_mca": 18,
                        }
                    }
                },
            }
        )


def test_retired_nocturnal_templates_are_removed_from_existing_local_store(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("TWIN_DATA", str(tmp_path))
    store = ProfileStore(PLANT)
    with store._connect() as conn:
        conn.execute(
            "INSERT INTO operation_profiles (id, plant_id, name, description, data, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (f"builtin-{PLANT}-pfl-noc-01", PLANT, "Retirado", "", "{}", "old", "old"),
        )
    assert len([p for p in ProfileStore(PLANT).list() if p["id"].startswith("builtin-")]) == 5
    assert ProfileStore(PLANT).get(f"builtin-{PLANT}-pfl-noc-01") is None


def test_demo_custom_profiles_are_isolated_per_anonymous_visitor(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("TWIN_DATA", str(tmp_path))
    owner = ProfileStore(PLANT, owner_id="visitor-a")
    other = ProfileStore(PLANT, owner_id="visitor-b")
    profile = owner.create({"name": "Solo visitante A", "description": "Privado", "hours": {}})
    assert owner.get(profile["id"]) is not None
    assert other.get(profile["id"]) is None
    assert all(item["id"] != profile["id"] for item in other.list())
    assert other.update(profile["id"], {"name": "Cambio no autorizado", "hours": {}}) is None
    assert not other.delete(profile["id"])
    assert any(item["id"].startswith("builtin-") for item in other.list())


def test_custom_profiles_can_be_named_edited_deleted_but_builtins_are_protected() -> None:
    catalog = client.get(f"{BASE}/operation-profiles").json()
    builtin = next(item for item in catalog if item["id"].endswith("pdd-rca-01"))
    assert client.delete(f"{BASE}/operation-profiles/{builtin['id']}").status_code == 409
    assert client.put(f"{BASE}/operation-profiles/{builtin['id']}", json=builtin).status_code == 409
    profile = {
        "name": "Mis aperturas",
        "description": "Fugas antes de iniciar",
        "hours": {"0": {"global_consumers_pct": 47, "dwellings": {"grid-01": {"c11": 17}}, "leaks": {"grid-01": {"l1": 83}}}},
    }
    created = client.post(f"{BASE}/operation-profiles", json=profile)
    assert created.status_code == 201
    profile_id = created.json()["id"]
    try:
        profile["name"] = "Mis aperturas editadas"
        updated = client.put(f"{BASE}/operation-profiles/{profile_id}", json=profile)
        assert updated.status_code == 200 and updated.json()["name"] == profile["name"]
        session = client.post(f"{BASE}/sessions", json={"profile_id": profile_id}).json()
        live = manager.get(PLANT, session["id"])
        assert live is not None
        live.running = True
        assert client.delete(f"{BASE}/operation-profiles/{profile_id}").status_code == 409
        assert client.put(f"{BASE}/operation-profiles/{profile_id}", json=profile).status_code == 409
        live.running = False
        assert client.delete(f"{BASE}/operation-profiles/{profile_id}").status_code == 204
        assert client.get(f"{BASE}/operation-profiles/{profile_id}").status_code == 404
    finally:
        live = locals().get("live")
        if live is not None:
            live.running = False
        client.delete(f"{BASE}/operation-profiles/{profile_id}")


def test_scheduling_a_saved_profile_waits_until_the_next_hour() -> None:
    payload = {"name": "Siguiente", "description": "Sin mandar aún", "hours": {"1": {"global_consumers_pct": 32}}}
    first = client.post(f"{BASE}/operation-profiles", json=payload).json()["id"]
    second = client.post(f"{BASE}/operation-profiles", json={**payload, "name": "Reemplazo"}).json()["id"]
    try:
        sid = client.post(f"{BASE}/sessions", json={"profile_id": first}).json()["id"]
        session = manager.get(PLANT, sid)
        assert session is not None
        session.running = True
        response = client.post(f"{BASE}/sessions/{sid}/schedule-profile", json={"profile_id": second})
        assert response.status_code == 200 and response.json()["applied_now"] is False
        assert session.profile_id == first
        session.apply_profile_hour(0)
        assert session.profile_id == first
        session.apply_profile_hour(1)
        assert session.profile_id == second
    finally:
        session = locals().get("session")
        if session is not None:
            session.running = False
        client.delete(f"{BASE}/operation-profiles/{first}")
        client.delete(f"{BASE}/operation-profiles/{second}")


def test_historical_frame_is_read_only_while_live_session_remains_unchanged() -> None:
    sid = client.post(f"{BASE}/sessions", json={}).json()["id"]
    session = manager.get(PLANT, sid)
    assert session is not None
    session.publish()
    before = session.plant.t
    response = client.get(f"{BASE}/sessions/{sid}/historian/frame", params={"at_t": 0})
    assert response.status_code == 200
    assert response.json()["t"] == 0 and response.json()["temporal_context"] == "history"
    assert "prs-01" in response.json()["snapshot"]["equipment"]
    assert session.plant.t == before
    assert client.get(f"{BASE}/sessions/{sid}/historian/frame", params={"at_t": 10}).status_code == 422
