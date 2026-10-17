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


def test_plants_list_and_detail() -> None:
    plants = {p["plant"]: p for p in client.get("/api/plants").json()}
    assert plants["sauce-plant-v1"]["equipment"] >= 10
    detail = client.get("/api/plants/sauce-plant-v1").json()
    assert {lk["mode"] for lk in detail["links"] if lk["kind"] == "flow"} == {"push", "pull", "fixed"}
    assert "turno-8h" in detail["scenarios"]
    assert client.get("/api/plants/no-existe").status_code == 404


def test_plant_websocket_runs_and_accepts_commands() -> None:
    with client.websocket_connect("/api/plants/sauce-plant-v1/simulate?scenario=turno-8h&speed=2000") as ws:
        ws.send_json({"equipment": "case-pack-02", "command": "inject_fault", "args": {"fault": "box_jam", "duration_s": 60}})
        events = []
        for _ in range(5):
            msg = ws.receive_json()
            events += msg["events"]
        snap = msg["snapshot"]
        assert msg["t"] > 0
        assert snap["equipment"]["kettle-01"]["state"] == "running"
        assert "bottleneck" in snap["plant"] and "sachets_ok" in snap["plant"]["kpis"]
        assert any(e["type"] == "fault_raised" and e["equipment_id"] == "case-pack-02" for e in events)
        ws.send_json({"equipment": "no-existe", "command": "start"})
        assert any("error" in ws.receive_json() for _ in range(3))
