from fastapi.testclient import TestClient
from twin_api.main import app

client = TestClient(app)


def test_list_and_get() -> None:
    types = {e["type"] for e in client.get("/api/equipment").json()}
    assert {"injection-molding-machine", "jacketed-kettle", "vessel"} <= types
    spec = client.get("/api/equipment/vessel").json()
    assert "resin-silo-40t" in spec["presets"]
    assert client.get("/api/equipment/no-existe").status_code == 404


def test_simulation_websocket_runs_and_accepts_commands() -> None:
    with client.websocket_connect("/api/equipment/injection-molding-machine/simulate?preset=300t-container&speed=200") as ws:
        ws.send_json({"command": "start"})
        cycles = 0
        for _ in range(10):
            msg = ws.receive_json()
            cycles = msg["snapshot"]["variables"]["cycle_count"]
        assert msg["snapshot"]["state"] == "running"
        assert cycles > 0
        assert set(msg["snapshot"]["animation"]) >= {"mold_open", "robot_progress"}


def test_simulation_rejects_bad_params() -> None:
    with client.websocket_connect('/api/equipment/vessel/simulate?params={"volume_l":-5}') as ws:
        assert "error" in ws.receive_json()
