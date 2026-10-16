"""Clase base de comportamiento de un equipo.

Cada tipo de la librería implementa una subclase en su behavior.py. La base se encarga de
lo que es igual para todos: estados declarados en el contrato, fallas por MTBF/MTTR,
comandos comunes, sensores con ruido y eventos normalizados.
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field
from typing import Any, ClassVar

from .primitives import FailureModel, Sensor, StateTracker
from .spec import EquipmentSpec


@dataclass
class StepContext:
    """Lo que el entorno le entrega a un equipo en cada paso de simulación."""

    t: float
    dt: float
    inputs: dict[str, Any] = field(default_factory=dict)


@dataclass
class Event:
    t: float
    equipment_id: str
    type: str
    payload: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        return {"t": self.t, "equipment_id": self.equipment_id, "type": self.type, **self.payload}


COMMON_EVENTS = ("state_changed", "fault_raised", "fault_cleared")


class EquipmentBehavior:
    """Base de todos los comportamientos.

    Las subclases definen:
      - type: igual al campo `type` del contrato.
      - DEFAULT_INPUTS: entradas del entorno con su valor por defecto (material disponible, vapor…).
      - setup(): estado interno inicial a partir de self.p (parámetros resueltos).
      - update(ctx): la física y la lógica del equipo en cada paso.
      - true_values(): valores verdaderos de las variables del contrato (sin ruido).
      - animation(): canales de animación declarados en el contrato.
    Opcionales: on_command(), kpis(), phase.
    """

    type: ClassVar[str] = ""
    DEFAULT_INPUTS: ClassVar[dict[str, Any]] = {}
    INITIAL_STATE: ClassVar[str] = "idle"
    # Estados en los que el equipo acumula horas de operación (para el MTBF).
    OPERATING_STATES: ClassVar[frozenset[str]] = frozenset({"running"})

    def __init__(
        self,
        equipment_id: str,
        spec: EquipmentSpec,
        params: dict[str, Any],
        seed: int = 0,
        random_faults: bool = True,
    ) -> None:
        if self.type != spec.type:
            raise TypeError(f"{type(self).__name__}.type={self.type!r} no coincide con el contrato {spec.type!r}")
        self.id = equipment_id
        self.spec = spec
        self.p = params
        self.rng = random.Random(seed)
        self.t = 0.0
        self.inputs: dict[str, Any] = dict(self.DEFAULT_INPUTS)
        self._events: list[Event] = []
        self.state = StateTracker(spec.state_ids, self.INITIAL_STATE, self._on_state_change)
        self.failures = FailureModel(spec.faults, random.Random(self.rng.random()), enabled=random_faults)
        self._resume_state = self.INITIAL_STATE
        self.sensors = {
            v["id"]: Sensor(
                random.Random(self.rng.random()),
                noise_sd=v.get("noise_sd", 0.0),
                resolution=v.get("resolution"),
            )
            for v in spec.variables
            if v["kind"] == "measured"
        }
        self.setup()

    # ------------------------------------------------------------------ API para subclases
    def setup(self) -> None:  # pragma: no cover - las subclases lo sobrescriben
        pass

    def update(self, ctx: StepContext) -> None:  # pragma: no cover
        raise NotImplementedError

    def true_values(self) -> dict[str, Any]:  # pragma: no cover
        raise NotImplementedError

    def animation(self) -> dict[str, float]:
        return {}

    def kpis(self) -> dict[str, Any]:
        return {}

    @property
    def phase(self) -> str | None:
        return None

    def on_command(self, name: str, args: dict[str, Any]) -> bool:
        """Comandos propios del tipo. Devuelve True si lo manejó."""
        return False

    def on_fault(self, fault_id: str) -> None:
        """Gancho al aparecer una falla (p. ej. congelar un sensor)."""

    def on_fault_cleared(self, fault_id: str) -> None:
        """Gancho al repararse una falla."""

    # ------------------------------------------------------------------ eventos
    def emit(self, event_type: str, **payload: Any) -> None:
        if event_type not in COMMON_EVENTS and event_type not in self.spec.event_ids:
            raise ValueError(f"{self.type}: evento {event_type!r} no declarado en el contrato")
        self._events.append(Event(self.t, self.id, event_type, payload))

    def drain_events(self) -> list[Event]:
        events, self._events = self._events, []
        return events

    def _on_state_change(self, old: str, new: str) -> None:
        self._events.append(Event(self.t, self.id, "state_changed", {"from": old, "to": new}))

    # ------------------------------------------------------------------ ciclo de simulación
    def step(self, ctx: StepContext) -> None:
        self.t = ctx.t
        self.inputs = {**self.DEFAULT_INPUTS, **ctx.inputs}
        operating = self.state.current in self.OPERATING_STATES
        new, cleared = self.failures.step(ctx.dt, operating)
        for fid in new:
            self._raise_fault(fid)
        for fid in cleared:
            self._clear_fault(fid)
        for sensor in self.sensors.values():
            sensor.step(ctx.dt)
        self.update(ctx)
        self.state.tick(ctx.dt)

    def _raise_fault(self, fault_id: str) -> None:
        fault = self.failures.active[fault_id]
        self.emit_fault_raised(fault_id, fault.severity, fault.stops_equipment)
        if fault.stops_equipment and self.state.current != "fault":
            self._resume_state = self.state.current if self.state.current != "off" else "idle"
            self.state.set("fault")
        self.on_fault(fault_id)

    def emit_fault_raised(self, fault_id: str, severity: str, stops: bool) -> None:
        self._events.append(
            Event(self.t, self.id, "fault_raised", {"fault": fault_id, "severity": severity, "stops": stops})
        )

    def _clear_fault(self, fault_id: str) -> None:
        self._events.append(Event(self.t, self.id, "fault_cleared", {"fault": fault_id}))
        self.on_fault_cleared(fault_id)
        if self.state.current == "fault" and self.failures.stopping is None:
            self.state.set(self._resume_state)

    # ------------------------------------------------------------------ comandos
    def command(self, name: str, args: dict[str, Any] | None = None) -> None:
        args = args or {}
        if name == "inject_fault":
            fid = args["fault"]
            self.failures.trigger(fid, args.get("duration_s"))
            self._raise_fault(fid)
        elif name == "clear_fault":
            for fid in self.failures.clear(args.get("fault")):
                self._clear_fault(fid)
        elif name == "set_param":
            key, value = args["name"], args["value"]
            errors = self.spec.check_params({key: value}, partial=True)
            if errors:
                raise ValueError("; ".join(errors))
            self.p[key] = value
        elif not self.on_command(name, args):
            raise ValueError(f"{self.type}: comando desconocido {name!r}")

    # ------------------------------------------------------------------ lectura
    def variables(self) -> dict[str, Any]:
        """Variables del contrato tal como las leería el sistema de control (con ruido de sensor)."""
        true = self.true_values()
        out: dict[str, Any] = {}
        for v in self.spec.variables:
            vid = v["id"]
            value = true.get(vid)
            sensor = self.sensors.get(vid)
            if sensor is not None and value is not None:
                value = sensor.read(value)
                if "range" in v:  # un transmisor no reporta fuera de su rango calibrado
                    lo, hi = v["range"]
                    value = min(hi, max(lo, value))
            out[vid] = value
        return out

    def snapshot(self) -> dict[str, Any]:
        stopping = self.failures.stopping
        return {
            "t": self.t,
            "id": self.id,
            "type": self.type,
            "state": self.state.current,
            "phase": self.phase,
            "active_faults": sorted(self.failures.active),
            "stopping_fault": stopping.id if stopping else None,
            "variables": self.variables(),
            "animation": self.animation(),
            "kpis": self.kpis(),
            "quality": "simulated",
        }
