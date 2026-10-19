"""Grabación de la operación normal que la galería reproduce sin la API."""

from twin_api.main import _plant_model
from twin_api.replay import record_plant


def test_replay_frames_are_deltas_that_rebuild_the_snapshot():
    model = _plant_model("airport-baggage-v1")
    rec = record_plant(model, warmup_s=120, duration_s=60, max_frames=60)
    frames = rec["frames"]
    assert rec["interval_s"] == 1.0 and len(frames) == 61
    first = frames[0]["snapshot"]["equipment"]
    assert set(first["collector-a"]) >= {"state", "variables", "animation", "items"}
    assert first["collector-a"]["items"], "con calentamiento ya hay maletas en la colectora"
    # los cuadros siguientes solo traen lo que cambió
    assert all(len(f["snapshot"]["equipment"]) <= len(first) for f in frames[1:])
    state = {}
    for f in frames:
        for eid, delta in f["snapshot"]["equipment"].items():
            state[eid] = {**state.get(eid, {}), **delta}
    assert set(state) == set(first)
    assert state["checkin-a"]["variables"]["bags_out"] > first["checkin-a"]["variables"]["bags_out"]
