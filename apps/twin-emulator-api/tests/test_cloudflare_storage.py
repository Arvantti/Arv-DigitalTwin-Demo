"""Persistencia local compatible con el bridge D1 usado por Cloudflare."""

import json
import os
import subprocess
import sys
from pathlib import Path

from fastapi.testclient import TestClient
from twin_emulator_api import d1_storage, sessions
from twin_emulator_api.audit import AuditStore, audit
from twin_emulator_api.main import _plant_folders, _plant_model, app
from twin_emulator_api.session_checkpoints import SessionCheckpointStore


def test_cloudflare_allowlist_limits_models_exposed_by_the_api(monkeypatch) -> None:
    monkeypatch.setenv("TWIN_ALLOWED_PLANTS", "water-network-scale-v1")
    assert set(_plant_folders()) == {"water-network-scale-v1"}


def test_audit_events_api_returns_persisted_actions() -> None:
    audit.record("water-network-scale-v1", "test.audit", details={"source": "unit-test"})
    response = TestClient(app).get("/api/plants/water-network-scale-v1/audit-events", params={"limit": 10})
    assert response.status_code == 200
    assert any(event["action"] == "test.audit" and event["actor_id"] == "operator" for event in response.json())
    assert TestClient(app).get("/api/plants/water-network-scale-v1/audit-events", params={"limit": 0}).status_code == 422


def test_audit_records_profile_and_operator_actions_in_durable_storage(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("TWIN_SERVICE_ID", "acueducto")
    store = AuditStore(tmp_path / "audit.sqlite3")
    event_id = store.record(
        "water-network-scale-v1",
        "operator.command",
        session_id="session-1",
        details={"equipment": "prs-01", "command": "set_auto"},
    )
    events = store.list("water-network-scale-v1", limit=10)
    assert events == [
        {
            "event_id": event_id,
            "service_id": "acueducto",
            "plant_id": "water-network-scale-v1",
            "session_id": "session-1",
            "actor_id": "operator",
            "action": "operator.command",
            "details": {"command": "set_auto", "equipment": "prs-01"},
            "created_at": events[0]["created_at"],
        }
    ]


def test_d1_connection_encodes_binary_parameters_and_decodes_binary_rows(monkeypatch) -> None:
    captured: dict[str, object] = {}

    class Response:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def read(self):
            return json.dumps({"success": True, "rows": [[{"__twin_d1_bytes__": "AAEC"}]], "changes": 1}).encode()

    def fake_urlopen(request, timeout):
        captured["body"] = json.loads(request.data)
        captured["authorization"] = request.get_header("Authorization")
        captured["timeout"] = timeout
        return Response()

    monkeypatch.setattr(d1_storage, "urlopen", fake_urlopen)
    cursor = d1_storage.D1Connection("https://worker.example/_internal/d1", "test-token").execute(
        "INSERT INTO session_checkpoints(payload) VALUES (?)", (b"\x00\x01\x02",)
    )
    assert captured["body"] == {
        "sql": "INSERT INTO session_checkpoints(payload) VALUES (?)",
        "params": [{"__twin_d1_bytes__": "AAEC"}],
    }
    assert captured["authorization"] == "Bearer test-token"
    assert cursor.rowcount == 1
    assert cursor.fetchone() == (b"\x00\x01\x02",)


def test_session_checkpoint_restores_a_complete_hydraulic_runtime(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("TWIN_DATA", str(tmp_path))
    store = SessionCheckpointStore()
    monkeypatch.setattr(sessions, "checkpoints", store)
    monkeypatch.setattr(sessions, "audit", AuditStore(tmp_path / "audit.sqlite3"))
    manager = sessions.SessionManager()
    session = manager.create("water-network-scale-v1", _plant_model("water-network-scale-v1"), "profile-1", {"name": "Test"})
    session.plant.step()
    session.speed = 120.0
    session.paused = True
    session.applied_profile_hour = 0
    session.recommendations.append({"id": "r1", "status": "pending"})
    store.save(session)

    manager.sessions.clear()
    restored = manager.get(session.plant_id, session.id)

    assert restored is not None
    assert restored.plant.t == session.plant.t
    assert restored.plant.equipment["prs-01"].true_values() == session.plant.equipment["prs-01"].true_values()
    assert restored.profile_id == "profile-1"
    assert restored.speed == 120.0 and restored.paused is True
    assert restored.applied_profile_hour == 0
    assert restored.recommendations == [{"id": "r1", "status": "pending"}]


def test_checkpoint_restores_in_a_fresh_python_process(tmp_path) -> None:
    env = {**os.environ, "TWIN_DATA": str(tmp_path), "TWIN_SERVICE_ID": "acueducto"}
    create = subprocess.run(
        [
            sys.executable,
            "-c",
            "from twin_emulator_api.main import _plant_model; "
            "from twin_emulator_api.sessions import manager; "
            "s = manager.create('water-network-scale-v1', _plant_model('water-network-scale-v1')); "
            "s.plant.step(); manager.stop(s); print(s.id)",
        ],
        cwd=Path.cwd(),
        env=env,
        check=True,
        capture_output=True,
        text=True,
    )
    session_id = create.stdout.strip().splitlines()[-1]
    restore = subprocess.run(
        [
            sys.executable,
            "-c",
            "from twin_emulator_api.main import app; "
            "from twin_emulator_api.sessions import manager; "
            f"s = manager.get('water-network-scale-v1', '{session_id}'); "
            "assert s is not None and s.plant.t > 0 and not s.running; print(s.plant.t)",
        ],
        cwd=Path.cwd(),
        env=env,
        check=True,
        capture_output=True,
        text=True,
    )
    assert float(restore.stdout.strip().splitlines()[-1]) > 0


def test_checkpoint_store_rejects_incompatible_version(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("TWIN_DATA", str(tmp_path))
    store = SessionCheckpointStore()
    with d1_storage.connect(store.path) as connection:
        connection.execute(
            "INSERT INTO session_checkpoints VALUES (?, ?, ?, ?, ?, ?)",
            ("s1", "water-network-scale-v1", 0.0, 99, b"invalid", "now"),
        )
    try:
        store.load("water-network-scale-v1", "s1")
    except ValueError as exc:
        assert "incompatible" in str(exc)
    else:
        raise AssertionError("checkpoint incompatible debería rechazarse")
