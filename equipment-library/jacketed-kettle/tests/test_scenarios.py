"""Ejecuta los escenarios con expectativas de scenarios.yaml (prueba genérica, igual para todos los equipos)."""

from pathlib import Path

import pytest
from twin_runtime import Library, check_expectations, run_scenario

TYPE = Path(__file__).resolve().parents[1].name
EQ = Library().get(TYPE)


@pytest.mark.parametrize("scenario_id", [s.id for s in EQ.scenarios.values() if s.expect])
def test_scenario(scenario_id: str) -> None:
    sc = EQ.scenarios[scenario_id]
    inst, sim, _ = run_scenario(EQ, sc)
    failures = check_expectations(inst.snapshot(), sc.expect, sim.events)
    assert not failures, "\n".join(failures)
