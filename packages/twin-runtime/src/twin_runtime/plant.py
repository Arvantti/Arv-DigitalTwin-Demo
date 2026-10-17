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
from .plant_hydraulics import HydraulicDomain
from .sim import Simulator, resolve_path
from .spec import SpecError, load_yaml

MODELS_DIR_NAME = "industrial-models"
SIM_FILE = "simulation.yaml"
# Una salida que entrega unidades o caudal no se puede repartir sin una regla de reparto.
SPLIT_QUANTITIES = ("units", "flow_kg_h")
# Un enlace "circula" sobre este caudal (kg/h o u/min); un servicio sin presión útil no entrega.
FLOW_EPS = 1e-6
MIN_SERVICE_BAR = 0.05


def link_id(lk: Link) -> str:
    """Id estable de un enlace en el snapshot; usa ':' para que las rutas de expectativa ('links.<id>.flow_kg_h') no se corten."""
    return f"{lk.src.equipment}:{lk.src.port}>{lk.dst.equipment}:{lk.dst.port}"


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
    # `<equipo>.<variable>`: el enlace solo lleva caudal mientras esa variable sea > 0 (por ejemplo, la marmita que descarga).
    when: PortRef | None = None


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
                when=PortRef.parse(lk["when"]) if lk.get("when") else None,
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
        self.hydraulic_links = [lk for lk in self.links if self.is_hydraulic(lk)]
        self.flow_links = [lk for lk in self.links if not self.is_hydraulic(lk)]
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

    def _port(self, ref: PortRef) -> dict[str, Any] | None:
        cfg = self.equipment.get(ref.equipment)
        if cfg is None:
            return None
        try:
            spec = self.library.get(cfg["type"]).spec
        except KeyError:
            return None
        return next((p for p in spec.raw.get("ports", []) if p["id"] == ref.port), None)

    def is_hydraulic(self, lk: Link) -> bool:
        """Un enlace entre dos puertos `hydraulic` es un tubo de la red de la planta, no un paso de magnitudes."""
        src, dst = self._port(lk.src), self._port(lk.dst)
        return bool(src and dst and src.get("hydraulic") and dst.get("hydraulic"))

    def links_for_flow(self, src: str, dst: str) -> list[str]:
        """Ids de los enlaces cuyo recorrido (origen, `via`…, destino) pasa por el tramo src → dst del plano."""
        return [
            link_id(lk)
            for lk in self.links
            if (src, dst) in zip([lk.src.equipment, *lk.via], [*lk.via, lk.dst.equipment], strict=True)
        ]

    # ------------------------------------------------------------------ validación
    def validate(self) -> list[str]:
        errors: list[str] = []
        layout_ids = {e["id"] for e in self.layout.get("equipment", [])}
        edges = {(f["from"], f["to"]) for f in self.layout.get("flows") or []}
        flows = {(f["from"], f["to"]): f for f in self.layout.get("flows") or []}
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
        gated: set[PortRef] = set()
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
            if src.get("hydraulic") and dst.get("hydraulic"):
                # Tubo de la red de agua: no pasa magnitudes; a un tanque le fija lo que entra o sale por ese puerto.
                errors += self._check_hydraulic(lk, label, flows)
                for port, eid, q in ((src, lk.src.equipment, "demand_kg_h"), (dst, lk.dst.equipment, "flow_kg_h")):
                    if q in port.get("link", {}):
                        linked_inputs[eid].add(port["link"][q])
                if (lk.src.equipment, lk.dst.equipment) not in edges:
                    errors.append(f"{label}: plant.yaml no tiene el flujo {lk.src.equipment} → {lk.dst.equipment}")
                continue
            shared = set(src.get("link", {})) & set(dst.get("link", {}))
            if not shared:
                errors.append(f"{label}: los puertos no comparten ninguna magnitud de link")
            for q, name in dst.get("link", {}).items():
                if q in FORWARD:
                    linked_inputs[lk.dst.equipment].add(name)
            for q in shared & set(BACKWARD):
                linked_inputs[lk.src.equipment].add(src["link"][q])
            if any(q in shared for q in SPLIT_QUANTITIES):
                # Los enlaces con `when` se reparten entre los que están abiertos: cuentan como un solo destino.
                if lk.when is None:
                    fan_out[lk.src] += 1
                elif lk.src not in gated:
                    gated.add(lk.src)
                    fan_out[lk.src] += 1
            if lk.when is not None:
                gate = self.library.get(self.equipment[lk.when.equipment]["type"]) if lk.when.equipment in self.equipment else None
                if gate is None:
                    errors.append(f"{label}: when {lk.when.equipment} no se simula")
                elif lk.when.port not in {v["id"] for v in gate.spec.variables}:
                    errors.append(f"{label}: when {lk.when}: no es una variable del contrato")
                if not any(q in shared for q in SPLIT_QUANTITIES):
                    errors.append(f"{label}: when solo aplica a enlaces que reparten caudal o unidades")
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

    @staticmethod
    def _check_hydraulic(lk: Link, label: str, flows: dict) -> list[str]:
        errors: list[str] = []
        if lk.via or lk.max or lk.when:
            errors.append(f"{label}: un enlace hidráulico no admite via, max ni when (es un tubo)")
        flow = flows.get((lk.src.equipment, lk.dst.equipment))
        if flow is not None and not flow.get("piped"):
            errors.append(f"{label}: el flujo del plano debe ser piped: true (da el diámetro y la ruta del tubo)")
        elif flow is not None and not (flow.get("diameter_in") or flow.get("inner_diameter_mm")):
            errors.append(f"{label}: el flujo del plano necesita diameter_in o inner_diameter_mm")
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
        self.link_state: dict[str, dict[str, Any]] = {}
        self.hydraulics = HydraulicDomain(model, self.equipment, model.hydraulic_links) if model.hydraulic_links else None
        values = self._values()
        for lk in model.flow_links:
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
            for lk in self.model.flow_links:
                if lk.dst.equipment == ref.equipment and self._links[lk.dst.equipment][lk.dst.port]["kind"] == "item":
                    v = self._forward(values, lk.src, q, seen | {ref})
                    if v is not None:
                        return v
        return None

    def _exchange(self) -> None:
        values = self._values()
        dt = self.sim.dt
        received: dict[tuple[str, str], list[tuple[str, Any, PortRef]]] = defaultdict(list)
        link_state: dict[str, dict[str, Any]] = {}
        shares = self._gate_shares(values)
        waiting = self._waiting_sources()
        for lk in self.model.flow_links:
            src_link = self._links[lk.src.equipment][lk.src.port]["link"]
            dst_link = self._links[lk.dst.equipment][lk.dst.port]["link"]
            # Lo que sale por el enlace; el contador de unidades se convierte en u/min una sola vez por paso.
            sent: dict[str, Any] = {}
            for q in FORWARD:
                if q not in src_link and q not in dst_link:
                    continue
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
                if value is not None:
                    sent[q] = value
            if lk.when is not None:
                # Enlace con compuerta: lleva su parte del caudal (proporcional a la variable de cada compuerta abierta).
                share = shares.get(id(lk), 0.0)
                if share <= 0.0:
                    sent = {q: 0.0 for q in sent if q == "flow_kg_h"}
                elif "flow_kg_h" in sent:
                    sent["flow_kg_h"] *= share
            for q, name in dst_link.items():
                if q in FORWARD and q in sent:
                    received[(lk.dst.equipment, name)].append((q, sent[q], lk.src))
            back: dict[str, Any] = {}
            for q, name in src_link.items():
                if q in BACKWARD and q in dst_link:
                    back[q] = values[lk.dst.equipment].get(dst_link[q])
                    if q == "ready" and id(lk) in waiting:
                        back[q] = False
                    received[(lk.src.equipment, name)].append((q, back[q], lk.dst))
            link_state[link_id(lk)] = self._link_record(lk, sent, back)
        self.link_state = link_state

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
            elif q == "pressure_mca":
                value = min(float(v) for v in vals)  # telemetría: el punto más crítico
            else:
                # temperatura, presión o peso de varias fuentes: solo cuentan las que entregan
                active = [float(v) for _, v, src in items if v is not None and self._delivering(values, src)]
                pool = active or [float(v) for v in vals]
                value = sum(pool) / len(pool)
            self.sim.inputs[eid][name] = value

    def _waiting_sources(self) -> set[int]:
        """Enlaces que esperan: varias salidas con caudal comparten una entrada (la bomba de las marmitas) y solo una descarga a
        la vez. Conserva el turno quien ya circulaba en el paso anterior (el primero declarado si hay varios); si nadie
        circula, todos están listos y el primero que empiece se queda con el turno."""
        by_dst: dict[PortRef, list[Link]] = defaultdict(list)
        for lk in self.model.flow_links:
            src_link = self._links[lk.src.equipment][lk.src.port]["link"]
            dst_link = self._links[lk.dst.equipment][lk.dst.port]["link"]
            if lk.when is None and "flow_kg_h" in src_link and "ready" in src_link and "ready" in dst_link:
                by_dst[lk.dst].append(lk)
        waiting: set[int] = set()
        for links in by_dst.values():
            if len(links) < 2:
                continue
            holder = next((lk for lk in links if self.link_state.get(link_id(lk), {}).get("flow_kg_h", 0.0) > FLOW_EPS), None)
            if holder is not None:
                waiting |= {id(lk) for lk in links if lk is not holder}
        return waiting

    def _gate_shares(self, values: dict[str, dict[str, Any]]) -> dict[int, float]:
        """Parte de la salida que lleva cada enlace con `when`: la variable de la compuerta ÷ la suma de las compuertas de su origen."""
        gates: dict[int, float] = {}
        totals: dict[PortRef, float] = defaultdict(float)
        for lk in self.model.flow_links:
            if lk.when is not None:
                g = max(0.0, float(values[lk.when.equipment].get(lk.when.port) or 0.0))
                gates[id(lk)] = g
                totals[lk.src] += g
        return {
            id(lk): gates[id(lk)] / totals[lk.src] if totals[lk.src] > FLOW_EPS else 0.0
            for lk in self.model.flow_links
            if lk.when is not None
        }

    def _link_record(self, lk: Link, sent: dict[str, Any], back: dict[str, Any]) -> dict[str, Any]:
        """Estado de un enlace en este paso: lo que entrega la salida (con `max` aplicado) y lo que pide el destino."""
        rec: dict[str, Any] = {"from": str(lk.src), "to": str(lk.dst), "via": list(lk.via)}
        for q, v in sent.items():
            rec["units_per_min" if q == "units" else q] = v
        for q, v in back.items():
            if v is not None:
                rec[q] = v
        if "flow_kg_h" not in rec and "demand_kg_h" in rec and self._links[lk.src.equipment][lk.src.port]["kind"] == "utility":
            # Un servicio (vapor) se entrega a pedido: circula lo que pide el destino mientras haya presión.
            pressure = rec.get("pressure_bar")
            rec["flow_kg_h"] = float(rec["demand_kg_h"]) if pressure is None or pressure > MIN_SERVICE_BAR else 0.0
        rec["flowing"] = rec.get("flow_kg_h", 0.0) > FLOW_EPS or rec.get("units_per_min", 0.0) > FLOW_EPS
        return rec

    def _delivering(self, values: dict[str, dict[str, Any]], ref: PortRef) -> bool:
        flow = self._forward(values, ref, "available")
        return True if flow is None else bool(flow)

    # ------------------------------------------------------------------ ciclo
    def step(self) -> list[Event]:
        self._exchange()
        if self.hydraulics is not None:
            # Red de agua del paso: con las aperturas, velocidades y consignas que dejaron los equipos en el paso anterior.
            self.link_state.update(self.hydraulics.solve(self.sim.inputs))
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
        snap = {"t": self.t, "plant": self.model.id, "equipment": equipment, "lines": self.line_kpis(), "links": self.link_state}
        if self.hydraulics is not None:
            snap["hydraulics"] = self.hydraulics.summary()
        return snap


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
