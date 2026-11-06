from types import SimpleNamespace
from uuid import uuid4

from fastapi.testclient import TestClient
from twin_emulator_api import main
from twin_emulator_api import saved_studies as saved_studies_module
from twin_emulator_api.historian import historian
from twin_emulator_api.saved_studies import SavedStudyStore

client = TestClient(main.app)


def test_saved_study_versions_are_append_only_and_owner_scoped(monkeypatch) -> None:
    store = SavedStudyStore()
    owner, stranger = f"owner-{uuid4()}", f"owner-{uuid4()}"
    plant = "water-network-scale-v1"
    result_v1 = {"study_id": "FRACTAL-1", "temporal_context": "forecast", "applied": False, "hours": [{"hour": 0}]}
    result_v2 = {**result_v1, "study_id": "FRACTAL-2", "hours": [{"hour": 1}]}

    created = store.create(owner, plant, "Escenario de prueba", "session-1", "FRACTAL-1", result_v1)
    study_id = created["id"]
    assert created["version_count"] == 1
    assert store.get_version(owner, plant, study_id, 1)["result"] == result_v1
    assert store.list(stranger, plant) == []
    assert store.get(stranger, plant, study_id) is None

    updated = store.add_version(owner, plant, study_id, "session-2", "FRACTAL-2", result_v2)
    assert updated is not None and updated["latest_version"] == 2
    assert [version["version"] for version in store.get(owner, plant, study_id)["versions"]] == [1, 2]
    assert store.get_version(owner, plant, study_id, 1)["result"] == result_v1
    assert store.get_version(owner, plant, study_id, 2)["result"] == result_v2
    monkeypatch.setattr(saved_studies_module, "MAX_VERSIONS_PER_STUDY", 2)
    try:
        store.add_version(owner, plant, study_id, "session-3", "FRACTAL-3", result_v2)
    except ValueError as error:
        assert "límite de versiones" in str(error)
    else:
        raise AssertionError("el límite de versiones debe aplicarse")

    assert store.delete(stranger, plant, study_id) is False
    assert store.delete(owner, plant, study_id) is True
    assert store.get(owner, plant, study_id) is None
    with historian._connect() as conn:
        assert conn.execute("SELECT COUNT(*) FROM saved_study_versions WHERE study_id = ?", (study_id,)).fetchone()[0] == 0


def test_saved_study_api_is_independent_of_session_and_owner_scoped(monkeypatch) -> None:
    owner, stranger = f"owner-{uuid4()}", f"owner-{uuid4()}"
    plant, session_id, source_id = "water-network-scale-v1", "session-to-expire", "FRACTAL-ARCHIVE-1"
    result = {
        "study_id": source_id, "study_type": "baseline", "temporal_context": "forecast", "applied": False,
        "profile_id": "profile-1", "profile_hash": "hash", "base_time": 3600,
        "study_input": {"session_id": session_id, "plc_tags": {}, "profile": {"id": "profile-1"}},
        "hours": [],
    }
    monkeypatch.setattr(main.session_manager, "get", lambda _plant, _session: SimpleNamespace(demo_client_id=owner))
    monkeypatch.setattr(main.studies, "get", lambda _session, study_id: result if study_id == source_id else None)

    saved = client.post(
        f"/api/plants/{plant}/saved-studies",
        headers={"x-twin-demo-id": owner},
        json={"name": "Archivo independiente", "source_session_id": session_id, "source_study_id": source_id},
    )
    assert saved.status_code == 201
    saved_id = saved.json()["id"]
    reopened = client.get(f"/api/plants/{plant}/saved-studies/{saved_id}", headers={"x-twin-demo-id": owner})
    assert reopened.json()["versions"][0]["version"] == 1
    version = client.get(f"/api/plants/{plant}/saved-studies/{saved_id}/versions/1", headers={"x-twin-demo-id": owner})
    assert version.json()["result"] == result

    assert client.get(f"/api/plants/{plant}/saved-studies", headers={"x-twin-demo-id": stranger}).json() == []
    assert client.get(f"/api/plants/{plant}/saved-studies/{saved_id}", headers={"x-twin-demo-id": stranger}).status_code == 404
    reopened = client.get(f"/api/plants/{plant}/saved-studies/{saved_id}", headers={"x-twin-demo-id": owner})
    assert reopened.status_code == 200
    assert version.json()["result"]["study_input"]["session_id"] == session_id

    rerun_result = {
        **result, "study_id": "FRACTAL-RERUN-2", "source_saved_study_id": saved_id,
        "source_version": 1,
    }
    appended = client.post(
        f"/api/plants/{plant}/saved-studies/{saved_id}/versions/from-result",
        headers={"x-twin-demo-id": owner}, json={"result": rerun_result},
    )
    assert appended.status_code == 201
    assert appended.json()["latest_version"] == 2
    versions = client.get(
        f"/api/plants/{plant}/saved-studies/{saved_id}", headers={"x-twin-demo-id": owner}
    ).json()["versions"]
    assert [version["version"] for version in versions] == [1, 2]
    first_result = client.get(
        f"/api/plants/{plant}/saved-studies/{saved_id}/versions/1", headers={"x-twin-demo-id": owner}
    ).json()["result"]
    second_result = client.get(
        f"/api/plants/{plant}/saved-studies/{saved_id}/versions/2", headers={"x-twin-demo-id": owner}
    ).json()["result"]
    assert first_result["study_id"] == source_id
    assert second_result["study_id"] == "FRACTAL-RERUN-2"

    assert client.delete(f"/api/plants/{plant}/saved-studies/{saved_id}", headers={"x-twin-demo-id": stranger}).status_code == 404
    assert client.delete(f"/api/plants/{plant}/saved-studies/{saved_id}", headers={"x-twin-demo-id": owner}).status_code == 204
