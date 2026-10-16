"""Motor de planta: instancia equipos de un plant.yaml con la librería y los conecta por puertos.

La configuración vive junto al layout, en industrial-models/<planta>/simulation.yaml:

  equipment  qué equipos del plant.yaml se simulan, con su tipo de librería, preset y parámetros.
  links      conexiones puerto a puerto. Cada enlace debe existir en los flows del plant.yaml,
             directo o pasando por equipos que no se simulan (`via`).
  startup    comandos que se aplican al inicio de todos los escenarios.
  lines      líneas con su puerto de salida, para los KPIs de planta.
  scenarios  escenarios con línea de tiempo y expectativas, igual que los de un equipo.

En cada paso el motor lee los valores verdaderos de todos los equipos y calcula las entradas de
cada uno a partir de sus enlaces (ver links.py), con un paso de retraso: así el orden en que se
simulan los equipos no cambia el resultado.
"""

from __future__ import annotations

import os
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .behavior import EquipmentBehavior, Event
from .library import Expectation, Library, find_library_root
from .links import BACKWARD, FORWARD, ITEM_ATTRIBUTES, port_links
from .sim import Simulator, resolve_path
from .spec import SpecError, load_yaml

MODELS_DIR_NAME = "industrial-models"
SIM_FILE = "simulation.yaml"
# Una salida que entrega unidades o caudal no se puede repartir sin una regla de reparto.
SPLIT_QUANTITIES = ("units", "flow_kg_h")


def find_models_root(library_root: Path | None = None) -> Path:
    """Carpeta de plantas: $TWIN_MODELS, o industrial-models junto a la librería."""
    env = os.environ.get("TWIN_MODELS")
    if env:
        return Path(env).resolve()
    return (library_root or find_library_root()).parent / MODELS_DIR_NAME


@dataclass(frozen=True)
class PortRef:
    equipment: str
    port: str

    @classmethod
    def parse(cls, text: str) -> PortRef:
        eq, sep, port = text.partition(".")
        if not sep or not eq or not port:
            raise SpecError(f"puerto {text!r}: se esperaba <equipo>.<puerto>")
        return cls(eq, port)

    def __str__(self) -> str:
        return f"{self.equipment}.{self.port}"


@dataclass
class Link:
    src: PortRef
    dst: PortRef
    via: list[str] = field(default_factory=list)
    max: dict[str, float] = field(default_factory=dict)
    note: str = ""


@dataclass
class PlantStep:
    at_s: float
    equipment: str
    command: str | None = None
    args: dict[str, Any] = field(default_factory=dict)
    inputs: dict[str, Any] = field(default_factory=dict)
    every_s: float | None = None


@dataclass
class PlantScenario:
    id: str
    description: str
    duration_s: float
    seed: int = 1
    random_faults: bool = False
    inputs: dict[str, dict[str, Any]] = field(default_factory=dict)
    timeline: list[PlantStep] = field(default_factory=list)
    expect: list[Expectation] = field(default_factory=list)


@dataclass
class LineDef:
    id: str
    name: str
    output: PortRef
    equipment: list[str]


class PlantModel:
    """plant.yaml + simulation.yaml validados contra la librería."""

    def __init__(self, folder: Path, library: Library | None = None) -> None:
        self.folder = folder.resolve()
        self.library = library or Library()
        self.layout = load_yaml(self.folder / "plant.yaml")
        self.sim_path = self.folder / SIM_FILE
        if not self.sim_path.exists():
            raise SpecError(f"{self.folder}: falta {SIM_FILE}")
        raw = load_yaml(self.sim_path) or {}
        self.raw = raw
        self.id = self.layout["plant"]["id"]
        self.description = raw.get("description", "")
        self.dt = float(raw.get("dt", 1.0))
        self.equipment: dict[str, dict[str, Any]] = dict(raw.get("equipment") or {})
        self.links = [
            Link(
                src=PortRef.parse(lk["from"]),
                dst=PortRef.parse(lk["to"]),
                via=list(lk.get("via", [])),
                max={k: float(v) for k, v in (lk.get("max") or {}).items()},
                note=lk.get("note", ""),
            )
            for lk in raw.get("links") or []
        ]
        self.startup = [self._step(s) for s in raw.get("startup") or []]
        self.lines = [
            LineDef(ln["id"], ln.get("name", ln["id"]), PortRef.parse(ln["output"]), list(ln.get("equipment", [])))
            for ln in raw.get("lines") or []
        ]
        self.scenarios: dict[str, PlantScenario] = {}
        for sc in raw.get("scenarios") or []:
            self.scenarios[sc["id"]] = PlantScenario(
                id=sc["id"],
                description=sc.get("description", ""),
                duration_s=float(sc["duration_s"]),
                seed=int(sc.get("seed", 1)),
                random_faults=bool(sc.get("random_faults", False)),
                inputs=sc.get("inputs") or {},
                timeline=[self._step(s) for s in sc.get("timeline") or []],
                expect=[Expectation(**e) for e in sc.get("expect") or []],
            )
        errors = self.validate()
        if errors:
            raise SpecError("\n".join(f"{self.sim_path}: {e}" for e in errors))

    @staticmethod
    def _step(raw: dict[str, Any]) -> PlantStep:
        return PlantStep(
            at_s=float(raw.get("at_s", 0.0)),
            equipment=raw["equipment"],
            command=raw.get("command"),
            args=raw.get("args") or {},
            inputs=raw.get("inputs") or {},
            every_s=float(raw["every_s"]) if raw.get("every_s") else None,
        )

    # ------------------------------------------------------------------ validación
    def validate(self) -> list[str]:
        errors: list[str] = []
        layout_ids = {e["id"] for e in self.layout.get("equipment", [])}
        edges = {(f["from"], f["to"]) for f in self.layout.get("flows") or []}
        ports: dict[str, dict[str, dict[str, Any]]] = {}

        for eid, cfg in self.equipment.items():
            if eid not in layout_ids:
                errors.append(f"equipo {eid}: no existe en plant.yaml")
            try:
                eq_type = self.library.get(cfg["type"])
            except KeyError:
                errors.append(f"equipo {eid}: tipo de librería desconocido {cfg.get('type')!r}")
                continue
            preset = cfg.get("preset")
            if preset and preset not in eq_type.spec.presets:
                errors.append(f"equipo {eid}: preset desconocido {preset!r}")
                continue
            try:
                eq_type.spec.resolve_params(preset, cfg.get("params"))
            except SpecError as exc:
                errors.append(f"equipo {eid}: {exc}")
            ports[eid] = {p["id"]: p for p in eq_type.spec.raw.get("ports", [])}

        fan_out: dict[PortRef, int] = defaultdict(int)
        linked_inputs: dict[str, set[str]] = defaultdict(set)
        for lk in self.links:
            label = f"enlace {lk.src} → {lk.dst}"
            src = ports.get(lk.src.equipment, {}).get(lk.src.port)
            dst = ports.get(lk.dst.equipment, {}).get(lk.dst.port)
            for ref, port in ((lk.src, src), (lk.dst, dst)):
                if ref.equipment not in self.equipment:
                    errors.append(f"{label}: {ref.equipment} no se simula (agréguelo a equipment o páselo a via)")
                elif port is None:
                    errors.append(f"{label}: el tipo de {ref.equipment} no tiene el puerto {ref.port}")
            if src is None or dst is None:
                continue
            if src["direction"] != "out" or dst["direction"] != "in":
                errors.append(f"{label}: se espera un puerto de salida hacia uno de entrada")
            if src["kind"] != dst["kind"]:
                errors.append(f"{label}: puertos de distinto tipo ({src['kind']} → {dst['kind']})")
            shared = set(src.get("link", {})) & set(dst.get("link", {}))
            if not shared:
                errors.append(f"{label}: los puertos no comparten ninguna magnitud de link")
            for q, name in dst.get("link", {}).items():
                if q in FORWARD:
                    linked_inputs[lk.dst.equipment].add(name)
            for q in shared & set(BACKWARD):
                linked_inputs[lk.src.equipment].add(src["link"][q])
            if any(q in shared for q in SPLIT_QUANTITIES):
                fan_out[lk.src] += 1
            for q in lk.max:
                if q not in FORWARD:
                    errors.append(f"{label}: max.{q} no es una magnitud que viaje hacia adelante")
            hops = [lk.src.equipment, *lk.via, lk.dst.equipment]
            for v in lk.via:
                if v not in layout_ids:
                    errors.append(f"{label}: via {v} no existe en plant.yaml")
                elif v in self.equipment:
                    errors.append(f"{label}: via {v} se simula; conéctelo con su propio enlace")
            for a, b in zip(hops, hops[1:], strict=False):
                if (a, b) not in edges:
                    errors.append(f"{label}: plant.yaml no tiene el flujo {a} → {b}")
        for ref, n in fan_out.items():
            if n > 1:
                errors.append(f"{ref}: entrega unidades o caudal a {n} destinos; el reparto no está modelado")

        steps = list(self.startup)
        for sc in self.scenarios.values():
            steps += sc.timeline
            for eid, values in sc.inputs.items():
                steps.append(PlantStep(0.0, eid, inputs=values))
        for st in steps:
            if st.equipment not in self.equipment:
                errors.append(f"línea de tiempo: {st.equipment} no se simula")
                continue
            spec = self.library.get(self.equipment[st.equipment]["type"]).spec
            if st.command and st.command not in spec.command_ids:
                errors.append(f"línea de tiempo: {st.equipment} no tiene el comando {st.command!r}")
            if clash := set(st.inputs) & linked_inputs[st.equipment]:
                errors.append(f"línea de tiempo: {st.equipment}: las entradas {sorted(clash)} las calcula un enlace")
        for ln in self.lines:
            if ln.output.equipment not in self.equipment:
                errors.append(f"línea {ln.id}: la salida {ln.output} no se simula")
            elif "units" not in ports[ln.output.equipment].get(ln.output.port, {}).get("link", {}):
                errors.append(f"línea {ln.id}: la salida {ln.output} no publica units")
            for eid in ln.equipment:
                if eid not in self.equipment:
                    errors.append(f"línea {ln.id}: {eid} no se simula")
        return errors

    def create(self, seed: int = 1, random_faults: bool = False, horizon_s: float = 86400.0) -> PlantSimulation:
        """Instancia la planta. Los comandos de arranque que se repiten se programan hasta horizon_s."""
        instances: list[EquipmentBehavior] = []
        for i, (eid, cfg) in enumerate(self.equipment.items()):
            eq_type = self.library.get(cfg["type"])
            instances.append(
                eq_type.create(eid, preset=cfg.get("preset"), params=cfg.get("params"), seed=seed * 1000 + i, random_faults=random_faults)
            )
        return PlantSimulation(self, instances, horizon_s)


class PlantSimulation:
    """Equipos conectados que avanzan juntos sobre el reloj virtual."""

    def __init__(self, model: PlantModel, instances: list[EquipmentBehavior], horizon_s: float = 86400.0) -> None:
        self.model = model
        self.sim = Simulator(instances, dt=model.dt)
        self.equipment = self.sim.equipment
        self._links = {eid: port_links(e.spec) for eid, e in self.equipment.items()}
        self._last_count: dict[PortRef, float] = {}
        values = self._values()
        for lk in model.links:
            name = self._links[lk.src.equipment][lk.src.port]["link"].get("units")
            if name is not None:
                self._last_count[lk.src] = float(values[lk.src.equipment].get(name) or 0.0)
        for st in model.startup:
            self.schedule(st, until_s=horizon_s)

    @property
    def t(self) -> float:
        return self.sim.t

    @property
    def events(self) -> list[Event]:
        return self.sim.events

    def schedule(self, st: PlantStep, until_s: float) -> None:
        at = st.at_s
        while True:
            self.sim.schedule(at, st.equipment, st.command, st.args, st.inputs)
            if not st.every_s:
                return
            at += st.every_s
            if at >= until_s:
                return

    # ------------------------------------------------------------------ intercambio por enlaces
    def _values(self) -> dict[str, dict[str, Any]]:
        return {eid: e.true_values() for eid, e in self.equipment.items()}

    def _forward(self, values: dict[str, dict[str, Any]], ref: PortRef, q: str, seen: frozenset[PortRef] = frozenset()) -> Any:
        """Valor de una magnitud hacia adelante en un puerto de salida; los atributos de las unidades
        atraviesan los equipos que no los publican."""
        link = self._links[ref.equipment].get(ref.port, {}).get("link", {})
        if q in link:
            return values[ref.equipment].get(link[q])
        if q == "available" and "flow_kg_h" in link:
            flow = values[ref.equipment].get(link["flow_kg_h"])
            return None if flow is None else flow > 1e-9
        if q in ITEM_ATTRIBUTES and ref not in seen:
            for lk in self.model.links:
                if lk.dst.equipment == ref.equipment and self._links[lk.dst.equipment][lk.dst.port]["kind"] == "item":
                    v = self._forward(values, lk.src, q, seen | {ref})
                    if v is not None:
                        return v
        return None

    def _exchange(self) -> None:
        values = self._values()
        dt = self.sim.dt
        received: dict[tuple[str, str], list[tuple[str, Any, PortRef]]] = defaultdict(list)
        for lk in self.model.links:
            src_link = self._links[lk.src.equipment][lk.src.port]["link"]
            dst_link = self._links[lk.dst.equipment][lk.dst.port]["link"]
            for q, name in dst_link.items():
                if q in FORWARD:
                    if q == "units":
                        if "units" not in src_link:
                            continue
                        count = float(values[lk.src.equipment].get(src_link["units"]) or 0.0)
                        value: Any = (count - self._last_count[lk.src]) / dt * 60.0
                        self._last_count[lk.src] = count
                    else:
                        value = self._forward(values, lk.src, q)
                        if value is not None and q in lk.max:
                            value = min(float(value), lk.max[q])
                    received[(lk.dst.equipment, name)].append((q, value, lk.src))
            for q, name in src_link.items():
                if q in BACKWARD and q in dst_link:
                    received[(lk.src.equipment, name)].append((q, values[lk.dst.equipment].get(dst_link[q]), lk.dst))

        for (eid, name), items in received.items():
            q = items[0][0]
            vals = [v for _, v, _ in items if v is not None]
            if not vals:
                continue
            if q in ("units", "flow_kg_h", "demand_kg_h"):
                value = sum(float(v) for v in vals)
            elif q == "ready":
                value = all(bool(v) for v in vals)
            elif q == "available":
                value = any(bool(v) for v in vals)
            else:
                # temperatura, presión o peso de varias fuentes: solo cuentan las que entregan
                active = [float(v) for _, v, src in items if v is not None and self._delivering(values, src)]
                pool = active or [float(v) for v in vals]
                value = sum(pool) / len(pool)
            self.sim.inputs[eid][name] = value

    def _delivering(self, values: dict[str, dict[str, Any]], ref: PortRef) -> bool:
        flow = self._forward(values, ref, "available")
        return True if flow is None else bool(flow)

    # ------------------------------------------------------------------ ciclo
    def step(self) -> list[Event]:
        self._exchange()
        return self.sim.step()

    def run(self, duration_s: float, sample_every_s: float | None = None, on_sample: Any = None) -> None:
        end = self.t + duration_s
        next_sample = self.t
        while self.t < end - 1e-9:
            self.step()
            if on_sample and sample_every_s and self.t >= next_sample - 1e-9:
                on_sample(self.t, self.snapshot())
                next_sample += sample_every_s

    # ------------------------------------------------------------------ lectura
    def line_kpis(self) -> dict[str, dict[str, Any]]:
        values = self._values()
        hours = self.t / 3600.0
        out: dict[str, dict[str, Any]] = {}
        for ln in self.model.lines:
            name = self._links[ln.output.equipment][ln.output.port]["link"]["units"]
            units = float(values[ln.output.equipment].get(name) or 0.0)
            shares = {eid: self._state_shares(eid) for eid in ln.equipment}
            out[ln.id] = {
                "name": ln.name,
                "output_units": units,
                "output_per_h": units / hours if hours > 0 else None,
                "running_pct": {eid: s.get("running", 0.0) for eid, s in shares.items()},
            }
        return out

    def _state_shares(self, eid: str) -> dict[str, float]:
        eq = self.equipment[eid]
        times = eq.state.time_in_state
        total = sum(times.values())
        return {k: times.get(k, 0.0) / total if total > 0 else 0.0 for k in eq.spec.state_ids}

    def snapshot(self) -> dict[str, Any]:
        equipment = {}
        for eid, e in self.equipment.items():
            snap = e.snapshot()
            snap["state_share"] = self._state_shares(eid)
            equipment[eid] = snap
        return {"t": self.t, "plant": self.model.id, "equipment": equipment, "lines": self.line_kpis()}


def run_plant_scenario(
    model: PlantModel, scenario: PlantScenario, sample_every_s: float | None = None
) -> tuple[PlantSimulation, list[tuple[float, dict[str, Any]]]]:
    plant = model.create(seed=scenario.seed, random_faults=scenario.random_faults, horizon_s=scenario.duration_s)
    for eid, values in scenario.inputs.items():
        plant.sim.inputs[eid].update(values)
    for st in scenario.timeline:
        plant.schedule(st, until_s=scenario.duration_s)
    samples: list[tuple[float, dict[str, Any]]] = []
    plant.run(
        scenario.duration_s,
        sample_every_s=sample_every_s,
        on_sample=(lambda t, snap: samples.append((t, snap))) if sample_every_s else None,
    )
    return plant, samples


def check_plant_expectations(snapshot: dict[str, Any], expectations: list[Expectation], events: list[Event]) -> list[str]:
    """Como check_expectations, con rutas de planta: equipment.<id>.…, lines.<id>.…, events.<id>.<tipo>."""
    failures: list[str] = []
    for exp in expectations:
        if exp.path.startswith("events."):
            _, eid, etype = exp.path.split(".", 2)
            value: Any = sum(1 for e in events if e.equipment_id == eid and e.type == etype)
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
