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


def test_plants_listed_with_and_without_simulation() -> None:
    plants = {p["id"]: p for p in client.get("/api/plants").json()}
    assert plants["sauce-plant-v1"]["simulated"] is True
    assert plants["plastic-injection-plant-v1"]["simulated"] is False


def test_plant_layout_links_simulated_equipment_to_library_types() -> None:
    plant = client.get("/api/plants/sauce-plant-v1").json()
    by_id = {e["id"]: e for e in plant["equipment"]}
    assert by_id["kettle-01"]["sim"]["type"] == "jacketed-kettle"
    assert by_id["kettle-01"]["sim"]["params"]["volume_l"] == 2500
    assert "sim" not in by_id["rack-dry-01"]
    assert {z["id"] for z in plant["zones"]} >= {"llenado", "proceso-caliente"}
    assert "boiler-trip" in plant["scenarios"]
    assert {w["id"] for w in plant["walkways"]} == {"walk-marmitas", "walk-emulsion"}
    ids = set(by_id)
    pipes = plant["pipes"]
    assert any(p["from"] == "kettle-01" and p["to"] == "pump-hot-01" for p in pipes)
    assert all(p["from"] in ids and p["to"] in ids for p in pipes)
    assert not any(p["from"] == "scale-01" for p in pipes)  # piped: false no se dibuja como tubería
    assert client.get("/api/plants/no-existe").status_code == 404
    layout_only = client.get("/api/plants/plastic-injection-plant-v1").json()
    assert layout_only["equipment"] and not layout_only["lines"]


def test_plant_websocket_streams_connected_plant_and_accepts_commands() -> None:
    with client.websocket_connect("/api/plants/sauce-plant-v1/simulate?scenario=nominal&speed=600") as ws:
        for _ in range(5):
            msg = ws.receive_json()
        snap = msg["snapshot"]
        assert msg["t"] > 0
        assert {"boiler-01", "kettle-01", "filler-pouch-01", "case-pack-02"} <= set(snap["equipment"])
        assert "animation" in snap["equipment"]["kettle-01"]
        assert "hot-1000" in snap["lines"]
        ws.send_json({"equipment": "boiler-01", "command": "inject_fault", "args": {"fault": "flame_failure"}})
        for _ in range(3):
            msg = ws.receive_json()
        assert "flame_failure" in msg["snapshot"]["equipment"]["boiler-01"]["active_faults"]


def test_plant_websocket_rejects_unknown_plant_and_scenario() -> None:
    with client.websocket_connect("/api/plants/plastic-injection-plant-v1/simulate") as ws:
        assert "error" in ws.receive_json()
    with client.websocket_connect("/api/plants/sauce-plant-v1/simulate?scenario=nope") as ws:
        assert "error" in ws.receive_json()
