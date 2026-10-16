"""Simulación de paso fijo sobre un reloj virtual, independiente del reloj de pared."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from .behavior import EquipmentBehavior, Event, StepContext
from .library import EquipmentType, Expectation, Scenario


@dataclass(order=True)
class _Scheduled:
    at_s: float
    seq: int
    equipment_id: str = field(compare=False)
    command: str | None = field(compare=False, default=None)
    args: dict[str, Any] = field(compare=False, default_factory=dict)
    inputs: dict[str, Any] = field(compare=False, default_factory=dict)


class Simulator:
    def __init__(self, equipment: list[EquipmentBehavior], dt: float = 0.5) -> None:
        if dt <= 0:
            raise ValueError("dt debe ser > 0")
        self.equipment = {e.id: e for e in equipment}
        self.dt = dt
        self.t = 0.0
        self.inputs: dict[str, dict[str, Any]] = {e.id: {} for e in equipment}
        self.events: list[Event] = []
        self._queue: list[_Scheduled] = []
        self._seq = 0

    def schedule(
        self,
        at_s: float,
        equipment_id: str,
        command: str | None = None,
        args: dict[str, Any] | None = None,
        inputs: dict[str, Any] | None = None,
    ) -> None:
        self._seq += 1
        self._queue.append(_Scheduled(at_s, self._seq, equipment_id, command, args or {}, inputs or {}))
        self._queue.sort()

    def _apply_due(self) -> None:
        while self._queue and self._queue[0].at_s <= self.t + 1e-9:
            item = self._queue.pop(0)
            if item.inputs:
                self.inputs[item.equipment_id].update(item.inputs)
            if item.command:
                self.equipment[item.equipment_id].command(item.command, item.args)

    def step(self) -> list[Event]:
        self._apply_due()
        new_events: list[Event] = []
        for eq in self.equipment.values():
            eq.step(StepContext(t=self.t, dt=self.dt, inputs=self.inputs[eq.id]))
        self.t += self.dt
        for eq in self.equipment.values():
            new_events.extend(eq.drain_events())
        self.events.extend(new_events)
        return new_events

    def run(
        self,
        duration_s: float,
        sample_every_s: float | None = None,
        on_sample: Callable[[float, dict[str, dict[str, Any]]], None] | None = None,
    ) -> None:
        end = self.t + duration_s
        next_sample = self.t
        while self.t < end - 1e-9:
            self.step()
            if on_sample and sample_every_s and self.t >= next_sample - 1e-9:
                on_sample(self.t, {eid: e.snapshot() for eid, e in self.equipment.items()})
                next_sample += sample_every_s


def run_scenario(
    eq_type: EquipmentType,
    scenario: Scenario,
    sample_every_s: float | None = None,
    equipment_id: str = "eq-01",
) -> tuple[EquipmentBehavior, Simulator, list[tuple[float, dict[str, Any]]]]:
    """Ejecuta un escenario de scenarios.yaml sobre un solo equipo."""
    eq = eq_type.create(
        equipment_id,
        preset=scenario.preset,
        params=scenario.params,
        seed=scenario.seed,
        random_faults=scenario.random_faults,
    )
    sim = Simulator([eq], dt=scenario.dt)
    sim.inputs[equipment_id].update(scenario.inputs)
    for step in scenario.timeline:
        sim.schedule(step.at_s, equipment_id, step.command, step.args, step.inputs)
    samples: list[tuple[float, dict[str, Any]]] = []
    sim.run(
        scenario.duration_s,
        sample_every_s=sample_every_s,
        on_sample=(lambda t, snap: samples.append((t, snap[equipment_id]))) if sample_every_s else None,
    )
    return eq, sim, samples


def resolve_path(snapshot: dict[str, Any], path: str) -> Any:
    """Lee 'kpis.oee' o 'variables.cycle_count' de un snapshot."""
    node: Any = snapshot
    for part in path.split("."):
        if not isinstance(node, dict) or part not in node:
            raise KeyError(f"ruta inexistente en el snapshot: {path}")
        node = node[part]
    return node


def check_expectations(snapshot: dict[str, Any], expectations: list[Expectation], events: list[Event]) -> list[str]:
    """Evalúa las expectativas de un escenario. 'events.<tipo>' cuenta eventos de ese tipo."""
    failures: list[str] = []
    for exp in expectations:
        if exp.path.startswith("events."):
            value: Any = sum(1 for e in events if e.type == exp.path.split(".", 1)[1])
        else:
            value = resolve_path(snapshot, exp.path)
        label = f"{exp.path} = {value!r}"
        if exp.equals is not None and value != exp.equals:
            failures.append(f"{label}, se esperaba {exp.equals!r} {exp.description}".rstrip())
        if exp.min is not None and (value is None or value < exp.min):
            failures.append(f"{label}, se esperaba ≥ {exp.min} {exp.description}".rstrip())
        if exp.max is not None and (value is None or value > exp.max):
            failures.append(f"{label}, se esperaba ≤ {exp.max} {exp.description}".rstrip())
    return failures
