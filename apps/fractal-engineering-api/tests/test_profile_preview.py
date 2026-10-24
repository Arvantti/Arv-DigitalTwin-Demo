"""La gráfica de escenarios usa perfil persistido y tags PLC, jamás mandos del navegador."""

from fastapi.testclient import TestClient
from fractal_engineering_api import main as api

client = TestClient(api.app)


def test_pressure_preview_reads_gateway_only_and_requires_play(monkeypatch) -> None:
    monkeypatch.setattr(api, "plc_gateway", lambda _payload: "http://gateway.local")
    session = {"id": "s1", "plant_id": "water-network-scale-v1", "running": True, "paused": False}
    profile = {"id": "p1", "hours": {"0": {"global_consumers_pct": 50}}}
    tags = {"PLC.Pump.RunningCount": 1, "PLC.PRS.OutletPressureMca": 21, "PLC.Session.SimulatedTime": 40}

    def gateway(url: str):
        if url.endswith("/sessions/s1"):
            return session
        if url.endswith("/operation-profiles/p1"):
            return profile
        if url.endswith("/sessions/s1/plc-tags"):
            return {"plc_tags": tags}
        raise AssertionError(url)

    monkeypatch.setattr(api, "gateway_json", gateway)

    def project(actual_tags, actual_profile, *, horizon_hours):
        assert actual_tags is tags and actual_profile is profile and horizon_hours == 24
        return [{"profile_hour": hour, "plc_tags": {"PLC.PRS.OutletPressureMca": 21.0 + hour / 10}} for hour in range(24)]

    monkeypatch.setattr(api, "project_24h", project)
    payload = {"plant_id": session["plant_id"], "session_id": "s1", "profile_id": "p1", "plc_tags": {"PLC.PRS.OutletPressureMca": 999}}
    response = client.post("/studies/profile-preview/from-plc", json=payload)
    assert response.status_code == 200
    result = response.json()
    assert result["applied"] is False and result["pressure_outlet_mca"][0] == {"profile_hour": 0, "pressure_mca": 21}
    assert len(result["pressure_outlet_mca"]) == 24
    session["running"] = False
    assert client.post("/studies/profile-preview/from-plc", json=payload).status_code == 409
