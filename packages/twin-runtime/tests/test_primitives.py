import random

import pytest
from twin_runtime.primitives import PID, FailureModel, FirstOrderLag, PhaseSequencer, saturation_temp_c


def test_first_order_lag_reaches_63_percent_at_tau() -> None:
    lag = FirstOrderLag(tau_s=100.0, initial=0.0)
    for _ in range(100):
        lag.step(1.0, 1.0)
    assert lag.value == pytest.approx(1 - 2.718281828 ** -1, rel=1e-6)


def test_sequencer_carries_leftover() -> None:
    seq = PhaseSequencer([("a", 1.0), ("b", 2.0)])
    seq.start()
    assert seq.step(3.5) == ["a", "b"]
    assert not seq.running and seq.leftover == pytest.approx(0.5)


def test_pid_tracks_first_order_plant() -> None:
    pid = PID(kp=2.0, ki=0.5, out_min=0, out_max=10)
    plant = FirstOrderLag(tau_s=5.0)
    for _ in range(600):
        plant.step(pid.step(3.0, plant.value, 0.1), 0.1)
    assert plant.value == pytest.approx(3.0, abs=0.05)


def test_failure_rate_matches_mtbf() -> None:
    model = FailureModel([{"id": "f", "mtbf_h": 1.0, "mttr_min": 0.001}], random.Random(4))
    count = 0
    for _ in range(int(500 * 3600 / 10)):
        new, _ = model.step(10.0, operating=True)
        count += len(new)
    assert 440 < count < 560  # ~500 fallas en 500 h con MTBF de 1 h


def test_saturation_temperature() -> None:
    assert saturation_temp_c(0.0, atm_bar=1.0) == pytest.approx(100.0)
    assert 140 < saturation_temp_c(3.0, atm_bar=0.85) < 145
