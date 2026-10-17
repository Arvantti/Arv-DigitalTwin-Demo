"""Motor de planta: instancia equipos de la librería y los acopla según twin.yaml.

El acople usa los `bind` de los puertos de cada contrato (docs/plant-engine.md):

- Enlace de flujo (material o item) entre un puerto de salida y uno de entrada:
  * push  (la salida tiene contador y la entrada tiene rate_input): el caudal que sale en un paso
    entra como caudal al siguiente; si la entrada no está lista, la salida recibe ready_input=False.
  * pull  (la entrada tiene contador y la salida tiene rate_input): lo que consume el destino se
    descuenta del origen; si el origen no está listo, el destino recibe ready_input=False.
  * fixed (ninguno de los dos fija el caudal del otro): solo se acoplan las señales de listo. Si
    varios orígenes llegan a una entrada así, se atiende uno a la vez (selector de válvulas).
  La temperatura del producto viaja con el flujo cuando los dos puertos la declaran.
- Enlace de servicio (utility): el destino recibe lo que ofrece el origen (presión de vapor, con
  tope opcional) y el origen recibe la suma de los consumos.
- Enlace de señal (kind: signal): una variable de un equipo pasa a una entrada de otro.

Todos los acoples usan los valores al final del paso anterior: el retardo es de un paso (dt) y el
resultado no depende del orden en que se recorren los equipos.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .behavior import EquipmentBehavior, Event, StepContext
from .expr import Condition, ExprError
from .library import Expectation, Library
from .sim import resolve_path
from .spec import SpecError, load_yaml

FLOW_KINDS = ("material", "item")
# Estados de espera para el análisis de cuello de botella: sin entrada (idle cuenta como falta de
# trabajo en una planta en marcha) o bloqueado por el equipo siguiente.
STARVED_STATES = frozenset({"starved", "idle"})
BLOCKED_STATES = frozenset({"blocked"})


# ---------------------------------------------------------------------------- modelo del gemelo
@dataclass
class TwinEquipment:
    id: str
    type: str
    preset: str | None = None
    params: dict[str, Any] = field(default_factory=dict)
    inputs: dict[str, Any] = field(default_factory=dict)
    input_offsets: dict[str, float] = field(default_factory=dict)
    virtual: bool = False
    represents: list[str] = field(default_factory=list)
    description: str = ""
    position: list[float] | None = None  # [x, y] en el plano; por defecto la del layout


@dataclass
class PortRef:
    equipment: str
    port: str
    bind: dict[str, Any]
    kind: str
    direction: str

    @property
    def key(self) -> str:
        return f"{self.equipment}.{self.port}"


@dataclass
class Link:
    kind: str  # flow | utility | signal
    src: str  # "eq.port" o "eq.variable" (signal)
    dst: str  # "eq.port" o "eq.input" (signal)
    mode: str = ""  # push | pull | fixed (flujo)
    density_kg_l: float | None = None
    scale: float = 1.0
    offset: float = 0.0
    min: float | None = None
    max: float | None = None

    def transform(self, value: Any) -> Any:
        if value is None or isinstance(value, bool):
            return value
        v = float(value) * self.scale + self.offset
        if self.min is not None:
            v = max(self.min, v)
        if self.max is not None:
            v = min(self.max, v)
        return v


@dataclass
class Controller:
    kind: str  # batch_loop | maintenance_crew
    equipment: str = ""
    technicians: list[str] = field(default_factory=list)  # maintenance_crew
    covers: list[str] | None = None  # maintenance_crew: equipos atendidos (None = todos)
    phases: list[dict[str, Any]] = field(default_factory=list)
    start_at_s: float = 0.0
    cip_every: int = 0
    cip_min: float = 35.0
    max_batches: int | None = None


@dataclass
class TimelineStep:
    at_s: float
    equipment: str
    command: str | None = None
    args: dict[str, Any] = field(default_factory=dict)
    inputs: dict[str, Any] = field(default_factory=dict)  # se imponen sobre los enlaces
    release: list[str] = field(default_factory=list)  # entradas que vuelven a manejar los enlaces


@dataclass
class PlantKpi:
    id: str
    refs: list[str]
    per_hour: bool = False
    unit: str = ""
    description: str = ""


@dataclass
class Twin:
    id: str
    name: str
    folder: Path
    dt: float
    equipment: dict[str, TwinEquipment]
    links: list[Link]
    controllers: list[Controller]
    timeline: list[TimelineStep]
    kpis: list[PlantKpi]
    layout: Path | None
    raw: dict[str, Any]
    positions: dict[str, tuple[float, float]] = field(default_factory=dict)


@dataclass
class PlantScenario:
    id: str
    description: str
    duration_s: float
    dt: float | None = None
    seed: int = 1
    random_faults: bool = False
    params: dict[str, dict[str, Any]] = field(default_factory=dict)
    inputs: dict[str, dict[str, Any]] = field(default_factory=dict)
    disable: list[str] = field(default_factory=list)
    timeline: list[TimelineStep] = field(default_factory=list)
    expect: list[Expectation] = field(default_factory=list)


# ---------------------------------------------------------------------------- carga y validación
def _split(ref: str, what: str) -> tuple[str, str]:
    if "." not in ref:
        raise SpecError(f"{what}: se esperaba 'equipo.nombre', llegó {ref!r}")
    eq, name = ref.rsplit(".", 1)
    return eq, name


def _timeline(raw: list[dict[str, Any]]) -> list[TimelineStep]:
    return [TimelineStep(**s) for s in raw or []]


def load_twin(path: Path, library: Library) -> Twin:
    """Carga twin.yaml y comprueba tipos, presets, parámetros, puertos y enlaces."""
    path = path.resolve()
    doc = load_yaml(path) or {}
    errors: list[str] = []
    for key in ("twin", "name", "equipment"):
        if key not in doc:
            errors.append(f"{path}: falta '{key}'")
    if errors:
        raise SpecError("\n".join(errors))

    layout_path = (path.parent / doc["layout"]).resolve() if doc.get("layout") else None
    layout_ids: set[str] = set()
    positions: dict[str, tuple[float, float]] = {}
    if layout_path:
        layout = load_yaml(layout_path)
        layout_ids = {e["id"] for e in layout.get("equipment", [])}
        for e in layout.get("equipment", []):
            if "position" in e:
                positions[e["id"]] = (float(e["position"][0]), float(e["position"][1]))

    equipment: dict[str, TwinEquipment] = {}
    for raw in doc["equipment"]:
        te = TwinEquipment(**raw)
        if te.id in equipment:
            errors.append(f"equipo duplicado: {te.id}")
        equipment[te.id] = te
        if te.position is not None:
            positions[te.id] = (float(te.position[0]), float(te.position[1]))
        try:
            eq_type = library.get(te.type)
            eq_type.spec.resolve_params(te.preset, te.params)
        except (KeyError, SpecError) as exc:
            errors.append(f"{te.id}: {exc}")
            continue
        known_inputs = set(eq_type.behavior_cls.DEFAULT_INPUTS)
        for name in [*te.inputs, *te.input_offsets]:
            if name not in known_inputs:
                errors.append(f"{te.id}: entrada desconocida {name!r} (válidas: {sorted(known_inputs)})")
        if layout_ids:
            if not te.virtual and te.id not in layout_ids:
                errors.append(f"{te.id}: no existe en el layout {layout_path.name} (márquelo virtual: true si no aparece)")
            for rid in te.represents:
                if rid not in layout_ids:
                    errors.append(f"{te.id}: represents {rid!r} no existe en el layout")

    links: list[Link] = []
    for i, raw in enumerate(doc.get("links", [])):
        raw = dict(raw)
        where = f"links[{i}] {raw.get('from')} → {raw.get('to')}"
        try:
            src_eq, src_name = _split(raw.pop("from"), where)
            dst_eq, dst_name = _split(raw.pop("to"), where)
        except (SpecError, KeyError) as exc:
            errors.append(str(exc))
            continue
        kind = raw.pop("kind", None)
        link = Link(kind=kind or "", src=f"{src_eq}.{src_name}", dst=f"{dst_eq}.{dst_name}", **raw)
        missing = [e for e in (src_eq, dst_eq) if e not in equipment]
        if missing:
            errors.append(f"{where}: equipos desconocidos {missing}")
            continue
        try:
            src_type = library.get(equipment[src_eq].type)
            dst_type = library.get(equipment[dst_eq].type)
        except KeyError:
            continue
        if kind == "signal":
            if src_name not in {v["id"] for v in src_type.spec.variables}:
                errors.append(f"{where}: {src_name!r} no es una variable de {src_type.spec.type}")
            if dst_name not in dst_type.behavior_cls.DEFAULT_INPUTS:
                errors.append(f"{where}: {dst_name!r} no es una entrada de {dst_type.spec.type}")
            links.append(link)
            continue
        sp = _port(src_type.spec.raw, src_eq, src_name)
        dp = _port(dst_type.spec.raw, dst_eq, dst_name)
        if sp is None or dp is None:
            errors.append(f"{where}: puerto inexistente ({src_name if sp is None else dst_name})")
            continue
        if sp.direction == "in" or dp.direction == "out":
            errors.append(f"{where}: el enlace va de un puerto de salida a uno de entrada")
        if sp.kind != dp.kind:
            errors.append(f"{where}: tipos de puerto distintos ({sp.kind} → {dp.kind})")
        if sp.kind == "utility":
            link.kind = "utility"
            if not ({"supply", "demand_input"} & set(sp.bind)) or not ({"supply_input", "demand"} & set(dp.bind)):
                errors.append(f"{where}: los puertos de servicio no declaran bind (supply/demand)")
        elif sp.kind in FLOW_KINDS:
            link.kind = "flow"
            if "counter" in sp.bind and "rate_input" in dp.bind:
                link.mode = "push"
            elif "counter" in dp.bind and "rate_input" in sp.bind:
                link.mode = "pull"
            else:
                link.mode = "fixed"
        else:
            errors.append(f"{where}: enlaces de puertos {sp.kind} no soportados; use kind: signal")
        links.append(link)

    push_out: dict[str, int] = defaultdict(int)
    for lk in links:
        if lk.kind == "flow" and lk.mode == "push":
            push_out[lk.src] += 1
    for src, n in push_out.items():
        if n > 1:
            errors.append(f"{src}: una salida con contador empuja a {n} destinos; el reparto (desviador) aún no está soportado")

    controllers: list[Controller] = []
    for raw in doc.get("controllers", []):
        c = Controller(**raw)
        if c.kind == "batch_loop":
            if c.equipment not in equipment:
                errors.append(f"controlador batch_loop: equipo desconocido {c.equipment!r}")
        elif c.kind == "maintenance_crew":
            if not c.technicians:
                errors.append("controlador maintenance_crew: falta technicians")
            for tid in c.technicians:
                if tid not in equipment:
                    errors.append(f"maintenance_crew: técnico desconocido {tid}")
                elif equipment[tid].type != "operator":
                    errors.append(f"maintenance_crew: {tid} no es de tipo operator")
            for eid in [*c.technicians, *(c.covers or [])]:
                if eid in equipment and eid not in positions:
                    errors.append(f"maintenance_crew: {eid} no tiene posición (layout o position: [x, y])")
            if c.covers is None:
                missing = [eid for eid in equipment if eid not in positions and eid not in c.technicians]
                if missing:
                    errors.append(f"maintenance_crew: equipos sin posición {missing}; use covers o position")
        else:
            errors.append(f"controlador desconocido {c.kind!r} (disponibles: batch_loop, maintenance_crew)")
        controllers.append(c)

    timeline = _timeline(doc.get("timeline", []))
    errors += _check_timeline(timeline, equipment, library, "timeline")
    kpis = []
    for raw in doc.get("kpis", []):
        refs = raw.get("refs") or [raw["ref"]]
        kpis.append(
            PlantKpi(
                id=raw["id"],
                refs=refs,
                per_hour=raw.get("per_hour", False),
                unit=raw.get("unit", ""),
                description=raw.get("description", ""),
            )
        )
        for ref in refs:
            if ref.split(".", 1)[0] not in equipment:
                errors.append(f"kpi {raw['id']}: equipo desconocido en {ref!r}")
    if errors:
        raise SpecError(f"{path}:\n  " + "\n  ".join(errors))
    return Twin(
        id=doc["twin"],
        name=doc["name"],
        folder=path.parent,
        dt=float(doc.get("dt", 1.0)),
        equipment=equipment,
        links=links,
        controllers=controllers,
        timeline=timeline,
        kpis=kpis,
        layout=layout_path,
        raw=doc,
        positions=positions,
    )


def _check_timeline(steps: list[TimelineStep], equipment: dict[str, TwinEquipment], library: Library, where: str) -> list[str]:
    errors = []
    for s in steps:
        if s.equipment not in equipment:
            errors.append(f"{where}: equipo desconocido {s.equipment}")
            continue
        spec = library.get(equipment[s.equipment].type).spec
        if s.command and s.command not in spec.command_ids:
            errors.append(f"{where}: {s.equipment}: comando no declarado {s.command!r}")
    return errors


def _port(raw_spec: dict[str, Any], eq_id: str, port_id: str) -> PortRef | None:
    for p in raw_spec.get("ports", []):
        if p["id"] == port_id:
            return PortRef(eq_id, port_id, p.get("bind") or {}, p["kind"], p["direction"])
    return None


def load_plant_scenarios(path: Path, twin: Twin, library: Library) -> dict[str, PlantScenario]:
    doc = load_yaml(path) or {}
    out: dict[str, PlantScenario] = {}
    errors: list[str] = []
    for raw in doc.get("scenarios", []):
        raw = dict(raw)
        sc = PlantScenario(
            id=raw["id"],
            description=raw.get("description", ""),
            duration_s=float(raw["duration_s"]),
            dt=raw.get("dt"),
            seed=int(raw.get("seed", 1)),
            random_faults=bool(raw.get("random_faults", False)),
            params=raw.get("params", {}),
            inputs=raw.get("inputs", {}),
            disable=raw.get("disable", []),
            timeline=_timeline(raw.get("timeline", [])),
            expect=[Expectation(**e) for e in raw.get("expect", [])],
        )
        for eid in [*sc.params, *sc.inputs, *sc.disable]:
            if eid not in twin.equipment:
                errors.append(f"escenario {sc.id}: equipo desconocido {eid}")
        errors += _check_timeline(sc.timeline, twin.equipment, library, f"escenario {sc.id}")
        out[sc.id] = sc
    if errors:
        raise SpecError(f"{path}:\n  " + "\n  ".join(errors))
    return out


def find_plants(library: Library) -> dict[str, Path]:
    """Gemelos de planta del repositorio: industrial-models/<planta>/twin.yaml."""
    models = library.root.parent / "industrial-models"
    return {p.parent.name: p for p in sorted(models.glob("*/twin.yaml"))}


# ---------------------------------------------------------------------------- simulación
@dataclass
class _FlowPort:
    eq: str
    bind: dict[str, Any]
    ready: Condition | None
    density: float


class PlantSimulator:
    """Simulación de paso fijo de una planta completa sobre un reloj virtual."""

    def __init__(
        self,
        twin: Twin,
        library: Library,
        seed: int = 1,
        random_faults: bool = False,
        params: dict[str, dict[str, Any]] | None = None,
        inputs: dict[str, dict[str, Any]] | None = None,
        disable: list[str] | None = None,
        dt: float | None = None,
    ) -> None:
        self.twin = twin
        self.dt = float(dt or twin.dt)
        self.t = 0.0
        disabled = set(disable or [])
        self.equipment: dict[str, EquipmentBehavior] = {}
        self.static_inputs: dict[str, dict[str, Any]] = {}
        for i, (eid, te) in enumerate(twin.equipment.items()):
            if eid in disabled:
                continue
            eq_type = library.get(te.type)
            merged = {**te.params, **(params or {}).get(eid, {})}
            self.equipment[eid] = eq_type.create(eid, preset=te.preset, params=merged, seed=seed * 1000 + i, random_faults=random_faults)
            self.static_inputs[eid] = {**te.inputs, **(inputs or {}).get(eid, {})}
        self.forced: dict[str, dict[str, Any]] = defaultdict(dict)
        self.links = [lk for lk in twin.links if lk.src.split(".")[0] in self.equipment and lk.dst.split(".")[0] in self.equipment]
        self.controllers = [c for c in twin.controllers if c.kind != "batch_loop" or c.equipment in self.equipment]
        self._crews = [c for c in self.controllers if c.kind == "maintenance_crew"]
        self._pending: list[tuple[str, str, float]] = []  # (equipo, falla, t de la falla) esperando técnico
        self._jobs: dict[str, tuple[str, str, float]] = {}  # técnico → (equipo, falla, t de la falla)
        self.repairs: list[dict[str, Any]] = []
        self._batches: dict[str, int] = defaultdict(int)
        self._queue: list[tuple[float, int, TimelineStep]] = []
        self._seq = 0
        for step in twin.timeline:
            self.schedule(step)
        self.events: list[Event] = []
        self._ports: dict[str, _FlowPort] = {}
        self._build_ports(library)
        self._prev_counter: dict[str, float] = {}
        self._cum: dict[str, float] = defaultdict(float)  # acumulado por puerto en u o kg desde t=0
        self._offset_cum: dict[str, float] = defaultdict(float)  # entregado a consumidores no modelados
        self.rates: dict[str, float] = defaultdict(float)  # caudal por puerto: u/min o kg/h
        self.link_rates: dict[str, float] = {}
        self._selected: dict[str, str | None] = {}
        self._last_temp: dict[str, float] = {}
        self._last_prop: dict[tuple[str, str], Any] = {}
        self._state_time: dict[str, dict[str, float]] = {eid: defaultdict(float) for eid in self.equipment}
        self.inputs: dict[str, dict[str, Any]] = {eid: dict(v) for eid, v in self.static_inputs.items()}

    # ------------------------------------------------------------------ puertos
    def _build_ports(self, library: Library) -> None:
        for lk in self.links:
            if lk.kind != "flow":
                continue
            for ref in (lk.src, lk.dst):
                if ref in self._ports:
                    continue
                eid, pid = ref.split(".")
                eq = self.equipment[eid]
                port = _port(eq.spec.raw, eid, pid)
                assert port is not None
                cond = None
                if "ready" in port.bind:
                    try:
                        cond = Condition(port.bind["ready"])
                    except ExprError as exc:  # pragma: no cover - lo detecta twin-lib validate
                        raise SpecError(f"{ref}: {exc}") from exc
                density = float(lk.density_kg_l or eq.p.get("density_kg_l") or 1.0)
                self._ports[ref] = _FlowPort(eid, port.bind, cond, density)

    def schedule(self, step: TimelineStep) -> None:
        self._seq += 1
        self._queue.append((step.at_s, self._seq, step))
        self._queue.sort(key=lambda x: (x[0], x[1]))

    def _apply_due(self) -> None:
        while self._queue and self._queue[0][0] <= self.t + 1e-9:
            _, _, step = self._queue.pop(0)
            if step.equipment not in self.equipment:
                continue
            self.forced[step.equipment].update(step.inputs)
            for name in step.release:
                self.forced[step.equipment].pop(name, None)
            if step.command:
                self.equipment[step.equipment].command(step.command, step.args)

    def _run_controllers(self) -> None:
        for crew in self._crews:
            self._dispatch(crew)
        for c in self.controllers:
            if c.kind != "batch_loop":
                continue
            eq = self.equipment[c.equipment]
            if self.t + 1e-9 < c.start_at_s or eq.state.current != "idle" or eq.phase is not None:
                continue
            if c.max_batches is not None and self._batches[c.equipment] >= c.max_batches:
                continue
            done = self._batches[c.equipment]
            if c.cip_every and done and done % c.cip_every == 0 and not getattr(eq, "_cip_done_for", None) == done:
                eq._cip_done_for = done  # type: ignore[attr-defined]
                eq.command("cip", {"duration_min": c.cip_min})
                continue
            eq.command("run_phases", {"phases": c.phases})

    # ------------------------------------------------------------------ mantenimiento
    def _crew_for(self, eid: str) -> Controller | None:
        for crew in self._crews:
            if eid in crew.technicians:
                return None
            if crew.covers is None or eid in crew.covers:
                return crew
        return None

    def _on_crew_event(self, ev: Event) -> None:
        if ev.type == "fault_raised" and self._crew_for(ev.equipment_id):
            self.equipment[ev.equipment_id].failures.hold(ev.payload["fault"], True)
            self._pending.append((ev.equipment_id, ev.payload["fault"], ev.t))
        elif ev.type == "fault_cleared":
            key = (ev.equipment_id, ev.payload["fault"])
            self._pending = [p for p in self._pending if (p[0], p[1]) != key]
            for tech, job in list(self._jobs.items()):
                if (job[0], job[1]) == key:
                    self.repairs[self._repair_index(tech, job)]["cleared_t"] = ev.t
                    del self._jobs[tech]
                    self.equipment[tech].command("go_home", {})
        elif ev.type == "arrived" and ev.equipment_id in self._jobs:
            eid, fid, _ = self._jobs[ev.equipment_id]
            self.equipment[eid].failures.hold(fid, False)
            self.repairs[self._repair_index(ev.equipment_id, self._jobs[ev.equipment_id])]["arrived_t"] = ev.t

    def _repair_index(self, tech: str, job: tuple[str, str, float]) -> int:
        for i in range(len(self.repairs) - 1, -1, -1):
            r = self.repairs[i]
            if r["technician"] == tech and r["equipment"] == job[0] and r["fault"] == job[1] and r["fault_t"] == job[2]:
                return i
        raise KeyError(job)  # pragma: no cover

    def _dispatch(self, crew: Controller) -> None:
        for tech in crew.technicians:
            if not self._pending or tech not in self.equipment or tech in self._jobs:
                continue
            eid, fid, t0 = self._pending.pop(0)
            x, y = self.twin.positions[eid]
            self._jobs[tech] = (eid, fid, t0)
            self.repairs.append({"technician": tech, "equipment": eid, "fault": fid, "fault_t": t0, "dispatched_t": self.t})
            self.equipment[tech].command("go_to", {"x": x, "y": y, "task": f"reparar {eid}: {fid}"})

    def maintenance_summary(self) -> dict[str, Any]:
        done = [r for r in self.repairs if "arrived_t" in r]
        response = [(r["arrived_t"] - r["fault_t"]) / 60.0 for r in done]
        return {
            "pending": [f"{e}:{f}" for e, f, _ in self._pending],
            "jobs": {t: f"{e}:{f}" for t, (e, f, _) in self._jobs.items()},
            "repairs": len(done),
            "avg_response_min": sum(response) / len(response) if response else None,
            "max_response_min": max(response) if response else None,
        }

    # ------------------------------------------------------------------ acople
    def _to_rate(self, ref: str, amount: float) -> float:
        """u por paso → u/min; kg por paso → kg/h."""
        unit = self._ports[ref].bind.get("counter_unit", "u")
        return amount / self.dt * (60.0 if unit == "u" else 3600.0)

    def _env(self, eid: str, values: dict[str, Any]) -> dict[str, Any]:
        eq = self.equipment[eid]
        return {**values, "state": eq.state.current, "phase": eq.phase}

    def _couple(self) -> None:
        values = {eid: eq.true_values() for eid, eq in self.equipment.items()}
        envs = {eid: self._env(eid, v) for eid, v in values.items()}
        new: dict[str, dict[str, Any]] = {eid: dict(self.static_inputs[eid]) for eid in self.equipment}

        # caudales por puerto a partir de los contadores
        ready: dict[str, bool] = {}
        for ref, fp in self._ports.items():
            ready[ref] = fp.ready(envs[fp.eq]) if fp.ready else True
            counter = fp.bind.get("counter")
            if counter is None:
                continue
            value = float(values[fp.eq].get(counter) or 0.0)
            prev = self._prev_counter.get(ref, value)
            self._prev_counter[ref] = value
            delta = max(0.0, value - prev)
            unit = fp.bind.get("counter_unit", "u")
            amount = delta * (fp.density if unit == "L" else 1.0)
            self._cum[ref] += amount
            self.rates[ref] = self._to_rate(ref, amount)

        flow = [lk for lk in self.links if lk.kind == "flow"]
        by_dst: dict[str, list[Link]] = defaultdict(list)
        by_src: dict[str, list[Link]] = defaultdict(list)
        for lk in flow:
            by_dst[lk.dst].append(lk)
            by_src[lk.src].append(lk)

        # selector: una entrada sin rate_input atiende a un origen a la vez
        active: dict[tuple[str, str], bool] = {}
        for dst, lks in by_dst.items():
            dbind = self._ports[dst].bind
            if len(lks) > 1 and "rate_input" not in dbind:
                current = self._selected.get(dst)
                if current is None or not ready[current]:
                    current = next((lk.src for lk in lks if ready[lk.src]), None)
                self._selected[dst] = current
                for lk in lks:
                    active[(lk.src, dst)] = lk.src == current
            else:
                for lk in lks:
                    active[(lk.src, dst)] = True

        for dst, lks in by_dst.items():
            dfp = self._ports[dst]
            deq = dfp.eq
            b = dfp.bind
            on = [lk for lk in lks if active[(lk.src, dst)]]
            if "rate_input" in b and any(lk.mode == "push" for lk in lks):
                if "counter" in b:
                    # el destino lleva su propio contador: se le pide lo pendiente (conserva la masa
                    # aunque un paso llegue más de lo que su entrada admite)
                    pending = sum(self._cum[lk.src] for lk in lks if lk.mode == "push") - self._cum[dst]
                    new[deq][b["rate_input"]] = self._to_rate(dst, max(0.0, pending))
                else:
                    new[deq][b["rate_input"]] = sum(self.rates[lk.src] for lk in on if lk.mode == "push")
            if "ready_input" in b:
                new[deq][b["ready_input"]] = any(ready[lk.src] for lk in on)
            if "temperature_input" in b:
                flowing = [lk for lk in on if "temperature" in self._ports[lk.src].bind and ready[lk.src]]
                if flowing:
                    src = max(flowing, key=lambda lk: self.rates.get(lk.src, 0.0))
                    temp = values[self._ports[src.src].eq].get(self._ports[src.src].bind["temperature"])
                    if temp is not None:
                        self._last_temp[dst] = float(temp)
                if dst in self._last_temp:
                    new[deq][b["temperature_input"]] = self._last_temp[dst]
            for prop, name in (b.get("property_inputs") or {}).items():
                sources = [lk for lk in on if prop in (self._ports[lk.src].bind.get("properties") or {})]
                if sources:
                    src = max(sources, key=lambda lk: self.rates.get(lk.src, 0.0))
                    sfp = self._ports[src.src]
                    value = values[sfp.eq].get(sfp.bind["properties"][prop])
                    if value is not None:
                        self._last_prop[(dst, prop)] = value
                if (dst, prop) in self._last_prop:
                    new[deq][name] = self._last_prop[(dst, prop)]
            for lk in lks:
                if lk.mode == "push":
                    self.link_rates[f"{lk.src}>{lk.dst}"] = self.rates[lk.src] if active[(lk.src, dst)] else 0.0

        handled: set[tuple[str, str]] = set()  # offsets ya aplicados por un enlace pull
        for src, lks in by_src.items():
            sfp = self._ports[src]
            seq = sfp.eq
            b = sfp.bind
            if "ready_input" in b:
                new[seq][b["ready_input"]] = any(ready[lk.dst] and active[(src, lk.dst)] for lk in lks)
            pulls = [lk for lk in lks if lk.mode == "pull"]
            if pulls and "rate_input" in b:
                total = 0.0
                for lk in pulls:
                    r = self.rates[lk.dst] if active[(src, lk.dst)] else 0.0
                    self.link_rates[f"{lk.src}>{lk.dst}"] = r
                    total += r
                if "counter" in b:  # el origen entrega lo pendiente: lo consumido menos lo ya entregado
                    # input_offsets sobre esta entrada = consumidores no modelados: se entregan aparte y
                    # se descuentan del contador del origen para que el balance de los modelados cuadre
                    off = float(self.twin.equipment[seq].input_offsets.get(b["rate_input"], 0.0))
                    self._offset_cum[src] += off * self.dt / 3600.0
                    handled.add((seq, b["rate_input"]))
                    pending = sum(self._cum[lk.dst] for lk in pulls) - (self._cum[src] - self._offset_cum[src])
                    total = self._to_rate(src, max(0.0, pending)) + off
                new[seq][b["rate_input"]] = total
            for lk in lks:
                if lk.mode == "fixed":
                    self.link_rates[f"{lk.src}>{lk.dst}"] = self.rates.get(src, 0.0) if active[(src, lk.dst)] and ready[lk.dst] else 0.0

        # servicios
        demand: dict[tuple[str, str], float] = defaultdict(float)
        for lk in self.links:
            if lk.kind != "utility":
                continue
            seid, spid = lk.src.split(".")
            deid, dpid = lk.dst.split(".")
            sb = _port(self.equipment[seid].spec.raw, seid, spid).bind  # type: ignore[union-attr]
            db = _port(self.equipment[deid].spec.raw, deid, dpid).bind  # type: ignore[union-attr]
            if "supply" in sb and "supply_input" in db:
                new[deid][db["supply_input"]] = lk.transform(values[seid].get(sb["supply"]))
            if "demand_input" in sb and "demand" in db:
                d = float(values[deid].get(db["demand"]) or 0.0)
                demand[(seid, sb["demand_input"])] += d
                self.link_rates[f"{lk.src}>{lk.dst}"] = d
        for (seid, name), total in demand.items():
            new[seid][name] = total

        # señales
        for lk in self.links:
            if lk.kind != "signal":
                continue
            seid, var = lk.src.split(".")
            deid, name = lk.dst.split(".")
            value = lk.transform(values[seid].get(var))
            if value is not None:
                new[deid][name] = value

        for eid in self.equipment:
            offsets = self.twin.equipment[eid].input_offsets
            for name, off in offsets.items():
                if (eid, name) in handled:
                    continue
                base = new[eid].get(name)
                new[eid][name] = (float(base) if base is not None else 0.0) + off
            new[eid].update(self.forced.get(eid, {}))
        self.inputs = new

    # ------------------------------------------------------------------ ciclo
    def step(self) -> list[Event]:
        self._apply_due()
        self._run_controllers()
        self._couple()
        for eid, eq in self.equipment.items():
            eq.step(StepContext(t=self.t, dt=self.dt, inputs=self.inputs[eid]))
        self.t += self.dt
        new_events: list[Event] = []
        for eid, eq in self.equipment.items():
            self._state_time[eid][eq.state.current] += self.dt
            for ev in eq.drain_events():
                if ev.type == "batch_completed":
                    self._batches[eid] += 1
                new_events.append(ev)
        if self._crews:
            for ev in new_events:
                self._on_crew_event(ev)
        self.events.extend(new_events)
        return new_events

    def run(
        self,
        duration_s: float,
        sample_every_s: float | None = None,
        on_sample: Callable[[float, dict[str, Any]], None] | None = None,
    ) -> None:
        end = self.t + duration_s
        next_sample = self.t
        while self.t < end - 1e-9:
            self.step()
            if on_sample and sample_every_s and self.t >= next_sample - 1e-9:
                on_sample(self.t, self.snapshot())
                next_sample += sample_every_s

    # ------------------------------------------------------------------ lectura
    def state_fractions(self, eid: str) -> dict[str, float]:
        total = sum(self._state_time[eid].values())
        return {s: v / total for s, v in sorted(self._state_time[eid].items())} if total else {}

    def role(self, eid: str) -> str:
        return self.equipment[eid].spec.raw.get("plant_role", "station")

    def active_fractions(self) -> dict[str, float]:
        """Fracción del tiempo en que cada estación trabaja o está detenida por sí misma (no por
        falta de entrada ni por bloqueo aguas abajo). Solo equipos con plant_role station."""
        out = {}
        for eid in self.equipment:
            if self.role(eid) != "station":
                continue
            fr = self.state_fractions(eid)
            out[eid] = 1.0 - sum(v for s, v in fr.items() if s in STARVED_STATES or s in BLOCKED_STATES) if fr else 0.0
        return out

    def bottleneck(self, tolerance: float = 0.02) -> list[str]:
        """Método del periodo activo (Roser): el cuello de botella es la estación que pasa más tiempo
        activa. Se devuelven todas las que quedan a menos de `tolerance` de la máxima (p. ej. dos
        marmitas en paralelo)."""
        active = self.active_fractions()
        if not active:
            return []
        top = max(active.values())
        return [eid for eid, v in active.items() if v >= top - tolerance]

    def plant_kpis(self) -> dict[str, Any]:
        hours = self.t / 3600.0
        out: dict[str, Any] = {}
        for k in self.twin.kpis:
            total = 0.0
            for ref in k.refs:
                eid, path = ref.split(".", 1)
                if eid not in self.equipment:
                    continue
                snap = {"variables": self.equipment[eid].true_values(), "kpis": self.equipment[eid].kpis()}
                value = resolve_path(snap, path if "." in path else f"variables.{path}")
                total += float(value or 0.0)
            out[k.id] = total / hours if k.per_hour and hours > 0 else total
        return out

    def snapshot(self) -> dict[str, Any]:
        equipment = {}
        for eid, eq in self.equipment.items():
            snap = eq.snapshot()
            snap["states"] = self.state_fractions(eid)
            equipment[eid] = snap
        return {
            "t": self.t,
            "twin": self.twin.id,
            "plant": {
                "kpis": self.plant_kpis(),
                "bottleneck": self.bottleneck(),
                "active": {k: round(v, 4) for k, v in self.active_fractions().items()},
                **({"maintenance": self.maintenance_summary()} if self._crews else {}),
            },
            "links": dict(self.link_rates),
            "equipment": equipment,
        }


def run_plant_scenario(
    twin: Twin,
    library: Library,
    scenario: PlantScenario,
    sample_every_s: float | None = None,
) -> tuple[PlantSimulator, list[tuple[float, dict[str, Any]]]]:
    sim = PlantSimulator(
        twin,
        library,
        seed=scenario.seed,
        random_faults=scenario.random_faults,
        params=scenario.params,
        inputs=scenario.inputs,
        disable=scenario.disable,
        dt=scenario.dt,
    )
    for step in scenario.timeline:
        sim.schedule(step)
    samples: list[tuple[float, dict[str, Any]]] = []
    sim.run(scenario.duration_s, sample_every_s, (lambda t, s: samples.append((t, s))) if sample_every_s else None)
    return sim, samples


def check_plant_expectations(sim: PlantSimulator, expectations: list[Expectation]) -> list[str]:
    """Rutas: plant.kpis.x, plant.bottleneck, equipment.<id>.(variables|kpis|states).x,
    equipment.<id>.state, events.<tipo> o events.<id>.<tipo> (conteos)."""
    snap = sim.snapshot()
    failures: list[str] = []
    for exp in expectations:
        if exp.path.startswith("events."):
            parts = exp.path.split(".")
            if len(parts) == 3:
                value: Any = sum(1 for e in sim.events if e.equipment_id == parts[1] and e.type == parts[2])
            else:
                value = sum(1 for e in sim.events if e.type == parts[1])
        elif exp.path.startswith("equipment."):
            _, eid, rest = exp.path.split(".", 2)
            node = snap["equipment"].get(eid)
            if node is None:
                failures.append(f"{exp.path}: equipo inexistente")
                continue
            if rest.startswith("states."):
                value = node["states"].get(rest.split(".", 1)[1], 0.0)
            else:
                value = resolve_path(node, rest)
        else:
            value = resolve_path(snap, exp.path)
        label = f"{exp.path} = {value!r}"
        if exp.equals is not None and value != exp.equals:
            failures.append(f"{label}, se esperaba {exp.equals!r} {exp.description}".rstrip())
        if exp.min is not None and (value is None or value < exp.min):
            failures.append(f"{label}, se esperaba ≥ {exp.min} {exp.description}".rstrip())
        if exp.max is not None and (value is None or value > exp.max):
            failures.append(f"{label}, se esperaba ≤ {exp.max} {exp.description}".rstrip())
    return failures
