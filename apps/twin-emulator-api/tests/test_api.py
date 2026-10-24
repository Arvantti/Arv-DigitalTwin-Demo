import shutil

from fastapi.testclient import TestClient
from twin_emulator_api.main import app
from twin_runtime.plant import SIM_FILE, find_models_root

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


def _layout_only_models(tmp_path, monkeypatch) -> None:
    """Una planta sin simulation.yaml: solo su plano (con su catálogo y el esquema común)."""
    folder = tmp_path / "plastic-injection-plant-v1"
    shutil.copytree(find_models_root() / "_schema", tmp_path / "_schema")
    shutil.copytree(find_models_root() / "plastic-injection-plant-v1", folder)
    (folder / SIM_FILE).unlink()
    monkeypatch.setenv("TWIN_MODELS", str(tmp_path))


def test_plants_listed_with_and_without_simulation(tmp_path, monkeypatch) -> None:
    plants = {p["id"]: p for p in client.get("/api/plants").json()}
    assert plants["sauce-plant-v1"]["simulated"] is True
    assert plants["plastic-injection-plant-v1"]["simulated"] is True
    _layout_only_models(tmp_path, monkeypatch)
    assert {p["id"]: p["simulated"] for p in client.get("/api/plants").json()} == {"plastic-injection-plant-v1": False}


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
    by_pipe = {(p["from"], p["to"]): p for p in pipes}
    assert by_pipe[("kettle-01", "pump-hot-01")]["links"] == ["kettle-01:product_out>pasteurizer-01:product_in"]
    assert by_pipe[("cip-skid-01", "kettle-01")]["links"] == []  # sin simular: la escena usa el estado
    assert by_pipe[("pasteurizer-01", "holding-tube-01")]["unit"] == "L/h"
    assert not any(p["from"] == "scale-01" for p in pipes)  # piped: false no se dibuja como tubería
    assert client.get("/api/plants/no-existe").status_code == 404


def test_water_plant_pipes_carry_route_diameter_and_hydraulic_link() -> None:
    plant = client.get("/api/plants/water-network-scale-v1").json()
    assert {z["id"]: z["elevation"] for z in plant["zones"]}["piso-1"] == 2.5
    by_pipe = {(p["from"], p["to"]): p for p in plant["pipes"]}
    riser = by_pipe[("prs-01", "grid-01")]
    assert riser["diameter_in"] == 4
    assert riser["route"][0] == [7.4865, 4.6, 4.05]  # brida de salida de la estación reguladora
    assert riser["links"] == ["prs-01:outlet>grid-01:inlet"]
    drop = by_pipe[("grid-03", "tank-recirc-02")]  # bajante por gravedad: con ruta pero sin diámetro (no es red a presión)
    assert drop["route"][-1] == [10.75, 2.6, 2.245] and "diameter_in" not in drop and drop["links"]


def test_water_plc_schema_exposes_simulated_hmi_contract() -> None:
    plc = client.get("/api/plants/water-network-scale-v1/plc-schema").json()
    assert plc["simulated"] is True
    assert plc["sources"]["emulator"]["id"] == "simulated-hydraulics-emulator"
    assert plc["sources"]["engineering"]["id"] == "fractal-engineering-model"
    assert plc["service_constraint"]["critical_pressure_min_mca"] == 15.0
    assert plc["demand_profiles"]["reference_full_demand_m3h"] == 6.8
    assert {screen["id"] for screen in plc["screens"]} == {"master", "pumping", "grid", "profiles", "trends"}
    assert plc["sources"]["opcua"]["id"] == "simulated-plc-opcua"
    assert {asset["id"] for asset in plc["assets"]} >= {"pumpset-main-01", "pumpset-recirc-01", "prs-01", "grid-04"}
    commands = {(item["equipment"], item["command"]) for item in plc["write_commands"]}
    assert ("prs-01", "select_branch") in commands
    assert ("grid-01", "set_opening") in commands
    assert not any(item["command"] == "set_param" for item in plc["write_commands"])
    opcua = client.get("/api/plants/water-network-scale-v1/opcua-schema").json()
    assert opcua["simulated"] is True and opcua["access"] == "read-only"
    tag_ids = {node["id"] for node in opcua["nodes"]}
    assert "PLC.Grid.L4.Consumer.C44.FlowLMin" in tag_ids
    assert "PLC.Grid.L2.Leak.L1.OpeningPct" in tag_ids
    assert {node["id"] for node in opcua["nodes"]} >= {"PLC.PRS.OutletPressureMca", "PLC.Profile.CurrentHour"}
    assert client.get("/api/plants/sauce-plant-v1/plc-schema").status_code == 404


def test_water_plant_sequence_is_continuous_and_lines_are_published() -> None:
    """Cada tubo de la secuencia termina donde empieza el siguiente: sin extremos al aire entre niveles."""
    plant = client.get("/api/plants/water-network-scale-v1").json()
    by_pipe = {(p["from"], p["to"]): p["route"] for p in plant["pipes"] if p.get("route")}
    # cada subida entre niveles es un tubo recto y vertical con su válvula, en un punto distinto de la cuadrícula
    points = []
    for level, valve in ((1, "valve-between-12"), (2, "valve-between-23"), (3, "valve-between-34")):
        into_valve = by_pipe[(f"grid-0{level}", valve)]
        out_of_valve = by_pipe[(valve, f"grid-0{level + 1}")]
        xy = into_valve[0][:2]
        assert all(p[:2] == xy for p in into_valve + out_of_valve)  # vertical, sin lazos laterales
        assert into_valve[0][2] < into_valve[-1][2] < out_of_valve[0][2] < out_of_valve[-1][2]  # sube y atraviesa la válvula
        assert abs(out_of_valve[-1][2] - (into_valve[0][2] + 1.2)) < 1e-9  # de un camino del nivel al del siguiente
        points.append(tuple(xy))
    assert len(set(points)) == 3  # en vista de planta no coinciden
    prs = {(p["from"], p["to"]): p for p in plant["pipes"]}[("prs-01", "grid-01")]
    assert prs["reduce_to_in"] == 2 and 0 < prs["reduce_at"] < len(prs["route"]) - 1  # reductor antes de la rejilla
    lines = {ln["id"]: ln for ln in plant["lines"]}
    assert set(lines) == {"red-distribucion", "recirculacion"}


def test_injection_plant_exposes_its_simulated_machines_and_conveyor() -> None:
    plant = client.get("/api/plants/plastic-injection-plant-v1").json()
    by_id = {e["id"]: e for e in plant["equipment"]}
    assert sum(1 for e in plant["equipment"] if e["type"] == "injection_molding_machine") == 29
    assert all(by_id[f"imm-{i:02d}"]["sim"]["type"] == "injection-molding-machine" for i in range(1, 30))
    assert by_id["imm-03"]["sim"]["params"]["cavities"] == 4
    assert by_id["conveyor-main-01"]["sim"]["params"]["length_m"] == 88
    assert by_id["pack-station-01"]["sim"]["type"] == "packing-station"
    assert by_id["dryer-01"]["sim"]["type"] == "desiccant-dryer"
    assert by_id["chiller-02"]["sim"]["params"]["start_on"] is False
    assert by_id["grinder-rec-01"]["sim"]["type"] == "granulator"
    assert {"nominal", "conveyor-trip"} <= set(plant["scenarios"])
    assert plant["lines"][0]["id"] == "lids-05l"


def test_injection_plant_exposes_aisles_and_routes() -> None:
    plant = client.get("/api/plants/plastic-injection-plant-v1").json()
    routes = {r["id"]: r for r in plant["routes"]}
    assert {r["kind"] for r in routes.values()} == {"forklift", "pedestrian", "cart"}
    assert routes["fk-sf-a1"]["to"] == "assembly-01"
    assert routes["fk-sf-a1"]["fleet"] == "fleet-01"
    equipment = {e["id"]: e for e in plant["equipment"]}
    assert equipment["rack-sf-01"]["sim"]["type"] == "pallet-store"
    assert equipment["fleet-01"]["sim"]["params"]["vehicles"] == 6
    assert sum(1 for e in plant["equipment"] if e.get("sim", {}).get("type") == "pallet-buffer") == 28
    assert routes["fk-ensamble-pt-1"]["from"] == "assembly-01"
    assert all(len(r["path"]) >= 2 for r in routes.values())
    assert {a["id"] for a in plant["aisles"]} >= {"aisle-semielaborado", "aisle-pt-1"}
    sauce = client.get("/api/plants/sauce-plant-v1").json()
    assert {r["id"] for r in sauce["routes"]} == {"fk-empaque-bodega", "fk-bodega-despacho"}
    trucks = {e["id"]: e["params"]["state"] for e in sauce["equipment"] if e["type"] == "delivery_truck"}
    assert trucks == {"truck-01": "loading", "truck-02": "waiting"}


def test_layout_only_plant_has_no_lines(tmp_path, monkeypatch) -> None:
    _layout_only_models(tmp_path, monkeypatch)
    layout_only = client.get("/api/plants/plastic-injection-plant-v1").json()
    assert layout_only["equipment"] and not layout_only["lines"]


def test_plant_websocket_streams_connected_plant_and_accepts_commands() -> None:
    with client.websocket_connect("/api/plants/sauce-plant-v1/simulate?scenario=nominal&speed=600") as ws:
        for _ in range(5):
            msg = ws.receive_json()
        snap = msg["snapshot"]
        assert msg["t"] > 0
        assert {"boiler-01", "kettle-01", "filler-pouch-01", "pack-sauce-1000"} <= set(snap["equipment"])
        assert "animation" in snap["equipment"]["kettle-01"]
        assert "hot-1000" in snap["lines"]
        ws.send_json({"equipment": "boiler-01", "command": "inject_fault", "args": {"fault": "flame_failure"}})
        for _ in range(3):
            msg = ws.receive_json()
        assert "flame_failure" in msg["snapshot"]["equipment"]["boiler-01"]["active_faults"]


def test_operation_profiles_persist_and_drive_the_plc_virtual(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("TWIN_DATA", str(tmp_path))
    url = "/api/plants/water-network-scale-v1/operation-profiles"
    payload = {
        "name": "Mañana de baja demanda",
        "description": "Perfil de prueba persistente.",
        "hours": {
            "0": {
                "global_consumers_pct": 60,
                "levels": {"1": 55},
                "dwellings": {"grid-01": {"c11": 37}},
                "leaks": {"grid-01": {"l1": 10}},
                "between_levels": {"12": 82},
                "prs": {"branch": "manual", "manual_setting_mca": 22},
            }
        },
    }
    created = client.post(url, json=payload)
    assert created.status_code == 201
    profile = created.json()
    listed = client.get(url).json()
    assert any(item["id"] == profile["id"] for item in listed)
    template = next(item for item in listed if item["id"].startswith("builtin-water-network-scale-v1-pdd-rca-01"))
    assert template["hours"]["0"]["global_consumers_pct"] == 30
    official = next(item for item in listed if item["id"].endswith("pfl-noc-01"))
    assert official["name"] == "PFL-NOC-01 · Operación nocturna automática · demanda residencial 30 %"
    assert official["hours"]["0"]["prs"]["branch"] == "auto"
    assert template["hours"]["11"]["global_consumers_pct"] == 100
    assert template["hours"]["23"]["global_consumers_pct"] == 30
    assert client.put(f"{url}/{profile['id']}", json=payload).status_code == 200
    with client.websocket_connect(f"/api/plants/water-network-scale-v1/simulate?speed=60&profile_id={profile['id']}") as ws:
        message = ws.receive_json()
    equipment = message["snapshot"]["equipment"]
    assert message["profile"] == {"id": profile["id"], "hour": 0}
    assert message["plc_tags"]["PLC.Profile.ActiveId"] == profile["id"]
    assert message["plc_tags"]["PLC.PRS.OutletPressureMca"] is not None
    assert equipment["grid-01"]["animation"]["open_c11"] == 0.37  # individual prevalece sobre global/nivel
    assert equipment["grid-01"]["animation"]["open_l1"] == 0.1
    assert equipment["valve-between-12"]["variables"]["opening_target_pct"] == 82
    assert equipment["prs-01"]["variables"]["branch_auto"] == 0
    assert client.delete(f"{url}/{profile['id']}").status_code == 204
    assert client.get(f"{url}/{profile['id']}").status_code == 404
    assert client.post(url, json={"name": "incorrecto", "hours": {"24": {}}}).status_code == 422


def test_shared_session_can_be_created_and_inspected() -> None:
    created = client.post("/api/plants/water-network-scale-v1/sessions", json={})
    assert created.status_code == 201
    session_id = created.json()["id"]
    state = client.get(f"/api/plants/water-network-scale-v1/sessions/{session_id}")
    assert state.status_code == 200
    assert state.json()["running"] is False
    historian = client.get(f"/api/plants/water-network-scale-v1/sessions/{session_id}/historian")
    assert historian.status_code == 200
    assert historian.json()["commands"] == []
    tags = client.get(f"/api/plants/water-network-scale-v1/sessions/{session_id}/opcua-schema")
    assert tags.status_code == 200
    assert tags.json()["read_only"] is True
    objectives = client.get("/api/plants/water-network-scale-v1/fractal/objectives")
    assert objectives.status_code == 200
    assert objectives.json()["objectives"][0]["id"] == "OBJ-LEAK-01"
    recommendation_url = f"/api/plants/water-network-scale-v1/sessions/{session_id}/fractal/recommendations"
    published = client.post(recommendation_url, json={"proposal": []})
    assert published.status_code == 201
    assert published.json()["status"] == "pending"
    decision = client.post(f"{recommendation_url}/{published.json()['id']}/decision", json={"accept": False})
    assert decision.json()["status"] == "rejected"
    study = {
        "study_id": "EST-TEST-01",
        "study_type": "baseline",
        "temporal_context": "forecast",
        "applied": False,
        "hours": [{"hour": 0, "temporal_context": "forecast", "applied": False}],
    }
    study_url = f"/api/plants/water-network-scale-v1/sessions/{session_id}/fractal/studies"
    assert client.post(study_url, json=study).status_code == 201
    assert client.get(study_url).json()[0]["study_id"] == "EST-TEST-01"
    frames = client.get(f"{study_url}/EST-TEST-01/frames?hour=0")
    assert frames.status_code == 200
    assert frames.json()["applied"] is False
    assert frames.json()["frames"][0]["temporal_context"] == "forecast"
    assert client.get(f"{study_url}/EST-TEST-01/frames?hour=1").status_code == 422
    optimized = {
        "study_id": "EST-TEST-OPT",
        "study_type": "optimized",
        "temporal_context": "forecast",
        "applied": False,
        "draft_profile": {"name": "PFL-FRA-TEST", "description": "aprobación manual", "hours": {}},
        "hours": [],
    }
    assert client.post(study_url, json=optimized).status_code == 201
    decision = client.post(f"{study_url}/EST-TEST-OPT/decision", json={"accept": True})
    assert decision.status_code == 200
    assert decision.json()["profile_status"] == "approved_pending_activation"
    assert decision.json()["applied"] is False
    assert client.post(f"{study_url}/EST-TEST-OPT/decision", json={"accept": True}).status_code == 409
    activation = client.post(f"{study_url}/EST-TEST-OPT/activate")
    assert activation.status_code == 200
    assert activation.json()["starts_at_hour"] == 1
    assert activation.json()["applied"] is False
    assert client.get(f"/api/plants/water-network-scale-v1/sessions/{session_id}").json()["profile_id"] == decision.json()["profile_id"]
    unsafe = optimized | {"study_id": "EST-UNSAFE", "hours": [{"hour": 0, "robust": False}]}
    assert client.post(study_url, json=unsafe).status_code == 201
    assert client.post(f"{study_url}/EST-UNSAFE/decision", json={"accept": True}).status_code == 409


def test_water_plant_websocket_applies_hmi_valve_and_regulation_commands() -> None:
    with client.websocket_connect("/api/plants/water-network-scale-v1/simulate?speed=60") as ws:
        ws.receive_json()  # estado inicial
        ws.send_json({"equipment": "grid-01", "command": "set_opening", "args": {"valve": "c11", "pct": 37}})
        ws.send_json({"equipment": "prs-01", "command": "select_branch", "args": {"branch": "manual"}})
        for _ in range(3):
            msg = ws.receive_json()
        grid = msg["snapshot"]["equipment"]["grid-01"]
        prs = msg["snapshot"]["equipment"]["prs-01"]
        assert grid["animation"]["open_c11"] == 0.37
        assert prs["variables"]["branch_auto"] == 0


def test_plant_websocket_rejects_unknown_plant_and_scenario() -> None:
    with client.websocket_connect("/api/plants/no-existe/simulate") as ws:
        assert "error" in ws.receive_json()
    with client.websocket_connect("/api/plants/sauce-plant-v1/simulate?scenario=nope") as ws:
        assert "error" in ws.receive_json()


def test_plant_catalog_gives_products_routes_and_sizes() -> None:
    catalog = client.get("/api/plants/plastic-injection-plant-v1").json()["catalog"]
    products = {p["id"]: p for p in catalog["products"]}
    papelera = products["papelera-20l"]
    # cuerpo (4 etapas) y pedal (4 etapas) llegan al ensamble (etapa 8), que sigue a empaque y bodega
    assert [s["stage"] for s in papelera["stages"]][-3:] == ["ensamble", "empaque", "almacen-terminado"]
    assert [3, 8] in papelera["edges"] and [7, 8] in papelera["edges"]
    assert papelera["stages"][0]["active"] == ["imm-19"]
    assert products["balde-12l"]["colors"][0] == {"id": "mb-azul", "name": "Masterbatch azul", "hex": "#1e6fd9"}
    assert catalog["sizes"]["imm-28"] == "Grande"
    assert client.get("/api/plants/sauce-plant-v1").json()["catalog"]["sizes"]["filler-pouch-03"] == "500 ml"
    assert client.get("/api/plants/airport-baggage-v1").json()["catalog"] is None


def test_new_product_is_checked_against_the_plant() -> None:
    url = "/api/plants/plastic-injection-plant-v1/products/check"
    product = {
        "id": "balde-12l-gris",
        "name": "Balde de 12 L gris",
        "kind": "finished",
        "unit": "u",
        "colors": ["mb-gris"],
        "routing": [
            {"stage": "inyeccion", "tooling": "mold-balde-12l", "equipment": ["imm-21"]},
            {"stage": "estiba", "equipment": ["buf-21"]},
        ],
    }
    # el molde del balde es de otro producto: la ruta no puede usarlo
    bad = client.post(url, json=product).json()
    assert not bad["ok"] and any("es de balde-12l" in e for e in bad["errors"])
    product["routing"][0] = {"stage": "inyeccion", "equipment": ["imm-21", "imm-01"], "cycle_s": 30}
    product["routing"].append({"stage": "transporte", "equipment": ["no-existe"]})
    bad = client.post(url, json=product).json()
    assert bad["errors"] == ["producto balde-12l-gris, etapa transporte: no-existe no existe en plant.yaml"]
    product["routing"].pop()
    ok = client.post(url, json=product).json()
    assert ok["ok"] and [s["active"] for s in ok["product"]["stages"]] == [["imm-21", "imm-01"], ["buf-21"]]
    assert not client.post(url, json={"id": "x"}).json()["ok"]
