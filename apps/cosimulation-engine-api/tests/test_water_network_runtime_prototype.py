"""El prototipo no debe leer ni mutar el futuro del PLC."""

import json
import sys
from pathlib import Path

from twin_emulator_api.main import _plant_model, session_manager

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))

from cosimulation.adapters.water_network_runtime_prototype import clone_at_snapshot, run_until  # noqa: E402
from tools.hydraulics.validate_fractal_hourly import PLANT, PROFILE  # noqa: E402


def test_runtime_replica_preserves_independent_state_and_runs_from_snapshot() -> None:
    profile = json.loads(PROFILE.read_text(encoding="utf-8"))
    session = session_manager.create(PLANT, _plant_model(PLANT), profile_id=profile["id"], profile=profile)
    session.apply_profile_hour(0)
    for _ in range(30):
        session.plant.step()
    replica = clone_at_snapshot(session.plant)
    initial = session.plant.equipment["tank-supply-01"].mass
    run_until(replica, profile, replica.t + 2, applied_hour=0)
    assert session.plant.t == 30
    assert session.plant.equipment["tank-supply-01"].mass == initial
    assert replica.t == 32
    for _ in range(2):
        session.plant.step()
    assert replica.equipment["tank-supply-01"].mass == session.plant.equipment["tank-supply-01"].mass
    session.plant.equipment["tank-supply-01"].command("fill", {"kg": 10})
    assert replica.equipment["tank-supply-01"].mass != session.plant.equipment["tank-supply-01"].mass
