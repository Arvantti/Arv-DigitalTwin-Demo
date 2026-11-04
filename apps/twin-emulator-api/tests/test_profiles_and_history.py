"""Administración de escenarios y viaje de lectura al pasado sin rebobinar PLC."""

import pytest
from fastapi.testclient import TestClient
from twin_emulator_api.main import _plant_model, app
from twin_emulator_api.profiles import ProfileStore, commands_for_hour, normalize_profile
from twin_emulator_api.sessions import PlantSession, manager

client = TestClient(app)
PLANT = "water-network-scale-v1"
BASE = f"/api/plants/{PLANT}"


def test_water_emulator_defaults_to_fixed_opening_without_a_profile(monkeypatch) -> None:
    from twin_emulator_api import sessions as session_module

    class NoopStore:
        def save(self, _session) -> None:
            pass

        def record(self, *_args, **_kwargs) -> None:
            pass

    monkeypatch.setattr(session_module, "checkpoints", NoopStore())
    monkeypatch.setattr(session_module, "audit", NoopStore())
    local_manager = session_module.SessionManager()
    session = local_manager.create(PLANT, _plant_model(PLANT))
    try:
        station = session.plant.equipment["prs-01"]
        assert station.auto_control_mode == "fixed_opening"
        assert station.auto_opening_pct == 38
        for _ in range(3):
            session.plant.step()
        assert station.auto_control_mode == "fixed_opening"
    finally:
        session.running = False
        local_manager.sessions.pop(session.id, None)


def test_restored_legacy_prs_session_migrates_to_opening_command() -> None:
    from twin_emulator_api.sessions import _activate_fixed_prs_opening

    plant = _plant_model(PLANT).create(seed=1, random_faults=False)
    station = plant.equipment["prs-01"]
    station.auto_control_mode = "critical_pressure"
    del station.auto_opening_pct  # estado persistido antes de este cambio
    profile = {"hours": {"0": {"prs": {"auto_opening_pct": 64}}}}
    _activate_fixed_prs_opening(plant, profile)
    assert station.auto_control_mode == "fixed_opening"
    assert station.auto_opening_pct == 64


def test_auto_profile_fixes_prs_opening_and_keeps_inlet_to_pump_mapping() -> None:
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
        item["equipment"] == "prs-01" and item["command"] == "set_auto_opening" and item["args"] == {"pct": 38.0}
        for item in commands
    )
    assert not any(item["equipment"] == "prs-01" and item["command"] == "set_auto_control" for item in commands)
    assert not any(
        item["equipment"] == "prs-01" and item["command"] == "select_branch" and item["args"]["branch"] == "manual" for item in commands
    )
    plant = _plant_model(PLANT).create(seed=1, random_faults=False, horizon_s=60)
    session = PlantSession("fixed-prs-test", PLANT, plant, "profile", profile)
    session.apply_profile_hour(0)
    station = plant.equipment["prs-01"]
    assert station.branch == "auto" and station.open_b.value == 0
    assert station.auto_control_mode == "fixed_opening" and station.auto_opening_pct == 38
    assert plant.equipment["pumpset-main-01"].setpoint == 70
    for _ in range(3):
        plant.step()
    assert station.true_values()["auto_outlet_setpoint_mca"] >= 15
    assert station.true_values()["flow_manual_m3h"] <= 1e-5
    with pytest.raises(ValueError, match="requiere la rama auto"):
        normalize_profile(
            {"name": "Invalid", "hours": {"0": {"prs": {"branch": "manual", "control_mode": "fixed_outlet", "auto_outlet_mca": 40}}}}
        )


def test_hourly_profile_preloads_auto_opening_while_manual_branch_is_active() -> None:
    profile = normalize_profile(
        {"name": "Manual con AUTO preparado", "hours": {"0": {"prs": {"branch": "manual", "auto_opening_pct": 62}}}}
    )
    commands = commands_for_hour(profile, 0)
    assert any(item["command"] == "set_auto_opening" and item["args"]["pct"] == 62 for item in commands)
    plant = _plant_model(PLANT).create(seed=1, random_faults=False, horizon_s=60)
    session = PlantSession("manual-prs-opening-test", PLANT, plant, "profile", profile)
    session.apply_profile_hour(0)
    station = plant.equipment["prs-01"]
    assert station.branch == "manual" and station.auto_control_mode == "fixed_opening"
    assert station.auto_opening_pct == 62


def test_changing_fixed_prs_opening_changes_hydraulic_outlet_pressure() -> None:
    outlets = []
    for opening in (20, 100):
        profile = normalize_profile({"name": f"Apertura {opening}", "hours": {"0": {"prs": {"auto_opening_pct": opening}}}})
        plant = _plant_model(PLANT).create(seed=1, random_faults=False, horizon_s=60)
        session = PlantSession(f"opening-{opening}", PLANT, plant, "profile", profile)
        session.apply_profile_hour(0)
        for _ in range(10):
            plant.step()
        station = plant.equipment["prs-01"]
        assert station.auto_control_mode == "fixed_opening"
        assert station.auto_opening_pct == opening
        outlets.append(station.p_out)
    assert outlets[1] > outlets[0] + 1
    with pytest.raises(ValueError, match="auto_opening_pct debe ser un número entre 20 y 100"):
        normalize_profile({"name": "Fuera de rango", "hours": {"0": {"prs": {"auto_opening_pct": 101}}}})


def test_critical_point_profile_metadata_does_not_drive_the_emulator_prs() -> None:
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
    assert any(item["command"] == "set_auto_opening" and item["args"]["pct"] == 38 for item in commands)
    assert not any(item["command"] == "set_auto_control" for item in commands)
    assert not any(item["command"] == "select_branch" and item["args"]["branch"] == "manual" for item in commands)
    plant = _plant_model(PLANT).create(seed=1, random_faults=False, horizon_s=60)
    session = PlantSession("fixed-point-test", PLANT, plant, "profile", profile)
    session.apply_profile_hour(0)
    for _ in range(3):
        plant.step()
    station = plant.equipment["prs-01"]
    values = station.true_values()
    assert station.branch == "auto" and station.auto_control_mode == "fixed_opening"
    assert values["control_point_pressure_mca"] == pytest.approx(station.inputs["control_point_pressure_mca"])
    assert values["critical_pressure_mca"] == pytest.approx(station.inputs["critical_pressure_mca"])
    assert station.animation()["critical_pressure_mca"] == pytest.approx(max(0, values["control_point_pressure_mca"]))
    assert values["auto_opening_pct"] == 38
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


def test_historian_keeps_emulator_history_append_only_and_materializes_exact_triad_refs(tmp_path, monkeypatch) -> None:
    from twin_emulator_api.historian import SessionHistorian

    monkeypatch.setenv("TWIN_DATA", str(tmp_path))
    historian = SessionHistorian()
    historian.frame("session-x", 10, {"origin": "emulator", "value": 1})
    historian.frame("session-x", 10, {"origin": "emulator", "value": 999})
    assert historian.nearest_frame("session-x", 10)["snapshot"]["value"] == 1

    shared = {"profile_id": "profile-x", "profile_hash": "a" * 64, "applied_to_plc": False}
    historian.store_model_run("session-x", "comparison-x", {
        **shared,
        "run_id": "COSIM-x",
        "source": "cosimulation",
        "model_id": "hydraulic-model-v1",
        "frames": [
            {"simulation_time_s": 10, "temporal_context": "present", "state": {"origin": "cosimulation", "value": 2}},
            {"simulation_time_s": 20, "temporal_context": "forecast", "state": {"origin": "cosimulation", "value": 3}},
        ],
    })
    historian.store_model_run("session-x", "comparison-x", {
        **shared,
        "run_id": "OPT-x",
        "source": "optimization",
        "model_id": "optimizer-v1",
        "frames": [
            {"simulation_time_s": 10, "temporal_context": "present", "state": {"origin": "optimization", "value": 4}},
            {"simulation_time_s": 20, "temporal_context": "forecast", "state": {"origin": "optimization", "value": 5}},
        ],
    })
    triads = historian.comparison_triads("session-x", "comparison-x")
    at_present = next(item for item in triads if item["simulation_time_s"] == 10)
    assert at_present["sources"]["emulator"]["state"]["value"] == 1
    assert at_present["sources"]["cosimulation"]["state"]["value"] == 2
    assert at_present["sources"]["optimization"]["state"]["value"] == 4
    assert at_present["aligned"] is True
    future = next(item for item in triads if item["simulation_time_s"] == 20)
    assert future["aligned"] is False
    assert future["missing_sources"] == ["emulator"]
    assert historian.nearest_frame("session-x", 10)["snapshot"]["value"] == 1


def test_session_api_stores_and_replays_model_results_as_separate_triad_sources(tmp_path, monkeypatch) -> None:
    from twin_emulator_api import main as main_module
    from twin_emulator_api.historian import SessionHistorian

    monkeypatch.setenv("TWIN_DATA", str(tmp_path))
    local_historian = SessionHistorian()
    monkeypatch.setattr(main_module, "historian", local_historian)
    profile = ProfileStore(PLANT).create({"name": "Tríada", "hours": {"0": {"global_consumers_pct": 80, "leaks": {"grid-01": {"l1": 35}}}}})
    session = client.post(f"{BASE}/sessions", json={"profile_id": profile["id"]}).json()
    session_id = session["id"]
    local_historian.frame(session_id, 0, {"source": "emulator", "unchanged": True})
    body = {
        "run_id": "COSIM-API-test",
        "source": "cosimulation",
        "profile_id": profile["id"],
        "profile_hash": main_module._profile_fingerprint(ProfileStore(PLANT).get(profile["id"])),
        "model_id": "hydraulic-model-v1",
        "applied_to_plc": False,
        "frames": [
            {"simulation_time_s": 0, "temporal_context": "present", "state": {"source": "cosimulation"}},
            {"simulation_time_s": 10, "temporal_context": "forecast", "state": {"source": "cosimulation"}},
        ],
    }
    path = f"{BASE}/sessions/{session_id}/comparisons/comparison-api/runs"
    try:
        saved = client.post(path, json=body)
        assert saved.status_code == 201, saved.text
        assert saved.json()["frame_count"] == 2
        triads = client.get(f"{BASE}/sessions/{session_id}/comparisons/comparison-api/triads").json()["triads"]
        at_present = next(item for item in triads if item["simulation_time_s"] == 0)
        assert at_present["sources"]["emulator"]["state"]["unchanged"] is True
        assert at_present["sources"]["cosimulation"]["state"]["source"] == "cosimulation"
        assert at_present["sources"]["optimization"] is None
        assert local_historian.nearest_frame(session_id, 0)["snapshot"]["unchanged"] is True
        changed = {**body, "frames": [*body["frames"][:-1], {**body["frames"][-1], "state": {"tampered": True}}]}
        assert client.post(path, json=changed).status_code == 409
    finally:
        manager.sessions.pop(session_id, None)


def test_historian_rejects_overwriting_a_calculated_run(tmp_path, monkeypatch) -> None:
    from twin_emulator_api.historian import SessionHistorian

    monkeypatch.setenv("TWIN_DATA", str(tmp_path))
    historian = SessionHistorian()
    payload = {
        "run_id": "COSIM-x", "source": "cosimulation", "profile_id": "profile-x", "profile_hash": "a" * 64,
        "model_id": "model-v1", "frames": [{"simulation_time_s": 1, "temporal_context": "forecast", "state": {"value": 1}}],
    }
    historian.store_model_run("session-x", "comparison-x", payload)
    payload["frames"][0]["state"]["value"] = 2
    with pytest.raises(ValueError, match="frame distinto"):
        historian.store_model_run("session-x", "comparison-x", payload)


def test_retired_scenario_templates_are_removed_from_existing_local_store(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("TWIN_DATA", str(tmp_path))
    store = ProfileStore(PLANT)
    retired = ("pfl-noc-01", "pdd-prs-fijo-01", "pdd-prs-punto-critico-18-01")
    with store._connect() as conn:
        conn.executemany(
            "INSERT INTO operation_profiles (id, plant_id, name, description, data, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            [(f"builtin-{PLANT}-{item}", PLANT, "Retirado", "", "{}", "old", "old") for item in retired],
        )
    refreshed = ProfileStore(PLANT)
    assert len([p for p in refreshed.list() if p["id"].startswith("builtin-")]) == 3
    assert all(refreshed.get(f"builtin-{PLANT}-{item}") is None for item in retired)


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
