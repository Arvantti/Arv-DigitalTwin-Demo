from copy import deepcopy

import pytest
from fastapi.testclient import TestClient
from twin_emulator_api import main, sessions
from twin_emulator_api.profiles import ProfileStore

PLANT = "water-network-scale-v1"


@pytest.fixture
def live(tmp_path, monkeypatch):
    monkeypatch.setenv("TWIN_DATA", str(tmp_path))
    monkeypatch.setattr(sessions.checkpoints, "save", lambda *_: None)
    monkeypatch.setattr(sessions.historian, "command", lambda *_: None)
    monkeypatch.setattr(sessions.audit, "record", lambda *_, **__: None)
    store = ProfileStore(PLANT)
    profile = store.create({"name": "Editable", "hours": {
        str(h): {"global_consumers_pct": 50, "prs": {"branch": "auto", "auto_opening_pct": 30}}
        for h in range(24)
    }})
    plant = main._plant_model(PLANT).create(seed=1, random_faults=False, horizon_s=86400.0)
    session = sessions.PlantSession("live-edit-test", PLANT, plant, profile["id"], profile)
    session.plant.sim.t = 3700
    session.running = True
    session.applied_profile_hour = 1
    monkeypatch.setattr(main.session_manager, "sessions", {session.id: session})
    payload = {"profile_id": profile["id"], "expected_hour": 1,
               "expected_hours": deepcopy(profile["hours"]), "hours": deepcopy(profile["hours"])}
    return TestClient(main.app), session, store, payload


def test_save_current_and_future_does_not_change_past_or_time(live):
    client, session, store, payload = live
    payload["hours"]["1"]["prs"]["auto_opening_pct"] = 42.5
    payload["hours"]["3"]["levels"] = {"2": 65.5}
    response = client.post(f"/api/plants/{PLANT}/sessions/{session.id}/edit-active-profile", json=payload)
    assert response.status_code == 200, response.text
    assert response.json()["applied_at_t"] == 3700
    assert session.plant.t == 3700
    assert session.plant.equipment["prs-01"].true_values()["auto_opening_pct"] == 42.5
    saved = store.get(session.profile_id)
    assert saved["hours"]["0"] == payload["expected_hours"]["0"]
    assert saved["hours"]["3"]["levels"]["2"] == 65.5
    assert response.json()["applied_commands"] == 1


@pytest.mark.parametrize("failure", ["past", "hour", "revision", "owner", "pending", "stopped", "builtin"])
def test_live_edit_rejects_stale_or_unauthorized_change(live, failure):
    client, session, store, payload = live
    original = deepcopy(store.get(session.profile_id))
    headers = {}
    if failure == "past":
        payload["hours"]["0"]["global_consumers_pct"] = 99
    elif failure == "hour":
        payload["expected_hour"] = 0
    elif failure == "revision":
        payload["expected_hours"] = {}
    elif failure == "owner":
        session.demo_client_id = "owner-a"
        headers = {"x-twin-demo-id": "owner-b"}
    elif failure == "pending":
        session.pending_profile = (3, "other-profile", {})
    elif failure == "stopped":
        session.running = False
    elif failure == "builtin":
        session.profile_id = "builtin-template"
    response = client.post(f"/api/plants/{PLANT}/sessions/{session.id}/edit-active-profile", json=payload, headers=headers)
    assert response.status_code in {403, 409}
    assert store.get(original["id"])["hours"] == original["hours"]
    assert session.plant.t == 3700


def test_future_only_preserves_live_override_until_scheduled_hour(live):
    client, session, _, payload = live
    session.plant.equipment["prs-01"].command("set_auto_opening", {"pct": 47.5})
    payload["hours"]["3"]["prs"]["auto_opening_pct"] = 45.5
    response = client.post(f"/api/plants/{PLANT}/sessions/{session.id}/edit-active-profile", json=payload)
    assert response.status_code == 200, response.text
    assert response.json()["applied_commands"] == 0
    assert session.plant.equipment["prs-01"].true_values()["auto_opening_pct"] == 47.5
    session.plant.sim.t = 10800
    session.apply_profile_hour(3)
    assert session.plant.equipment["prs-01"].true_values()["auto_opening_pct"] == 45.5


@pytest.mark.parametrize("expected_hour", [1, 2])
def test_hour_crossed_while_editing_cannot_rewrite_previous_current(live, expected_hour):
    client, session, store, payload = live
    session.plant.sim.t = 7200
    payload["expected_hour"] = expected_hour
    payload["hours"]["1"]["prs"]["auto_opening_pct"] = 42.5
    response = client.post(f"/api/plants/{PLANT}/sessions/{session.id}/edit-active-profile", json=payload)
    assert response.status_code == 409, response.text
    assert store.get(session.profile_id)["hours"] == payload["expected_hours"]
    assert session.plant.t == 7200


def test_day_complete_rejects_live_edit(live):
    client, session, store, payload = live
    session.plant.sim.t = 86400
    payload["expected_hour"] = 24
    response = client.post(f"/api/plants/{PLANT}/sessions/{session.id}/edit-active-profile", json=payload)
    assert response.status_code == 409, response.text
    assert store.get(session.profile_id)["hours"] == payload["expected_hours"]
