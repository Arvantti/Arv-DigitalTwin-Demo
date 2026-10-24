"""Administración de escenarios y viaje de lectura al pasado sin rebobinar PLC."""

from fastapi.testclient import TestClient
from twin_emulator_api.main import app
from twin_emulator_api.profiles import ProfileStore
from twin_emulator_api.sessions import manager

client = TestClient(app)
PLANT = "water-network-scale-v1"
BASE = f"/api/plants/{PLANT}"


def test_retired_nocturnal_templates_are_removed_from_existing_local_store(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("TWIN_DATA", str(tmp_path))
    store = ProfileStore(PLANT)
    with store._connect() as conn:
        conn.execute(
            "INSERT INTO operation_profiles VALUES (?, ?, ?, ?, ?, ?, ?)",
            (f"builtin-{PLANT}-pfl-noc-01", PLANT, "Retirado", "", "{}", "old", "old"),
        )
    assert len([p for p in ProfileStore(PLANT).list() if p["id"].startswith("builtin-")]) == 3
    assert ProfileStore(PLANT).get(f"builtin-{PLANT}-pfl-noc-01") is None


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
