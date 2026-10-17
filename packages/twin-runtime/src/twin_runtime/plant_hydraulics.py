"""Dominio hidráulico del motor de planta: una sola red a presión para todos los equipos de agua.

Un enlace entre dos puertos que declaran `hydraulic` en su contrato no pasa magnitudes con un paso de retraso:
es un tramo de tubería de la red. En cada paso el motor arma una sola red con los elementos que aporta cada
equipo (`hydraulic_build`) y los tubos de los flujos `piped` del plano, la resuelve y cada equipo lee su parte.

Para que el comportamiento de cada tipo no cambie, después de armar la red el motor reemplaza `equipo.net`
(su banco de prueba) por una vista con su prefijo: `set`, `set_head` y `solve` usan los nombres del banco.
Los elementos que solo existen en el banco (la carga, la cabeza fija de prueba) se ignoran.

La red responde al instante (régimen cuasiestacionario), igual que en el banco de cada equipo: el motor la resuelve
al empezar el paso y `solve()` devuelve esa solución, salvo que algún equipo haya cambiado algo de la red en el paso
(velocidad, apertura, consigna); entonces la vuelve a resolver, con arranque en caliente. Así el lazo de presión de
las bombas no ve la red con un paso de atraso, que lo hacía oscilar (de 60 a 81 mca al dispararse una bomba). El
resultado depende del orden de los equipos en simulation.yaml, que es fijo, así que es reproducible.

Tubos: diámetro interior por diámetro nominal (PVC presión) o `inner_diameter_mm`; longitud de la ruta 3D
(`route`, puntos [x, y, z]), o `length_m`, o la distancia entre los equipos; accesorios `minor_k`.
"""

from __future__ import annotations

import math
from collections.abc import Mapping
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from .links import hydraulic_ports, port_links
from .primitives import HydraulicNetwork
from .spec import SpecError

if TYPE_CHECKING:
    from .behavior import EquipmentBehavior
    from .plant import Link, PlantModel

WATER_KG_M3 = 998.0
# Diámetro interior de tubería PVC a presión por diámetro nominal (pulgadas → m), igual que el banco de la planta.
INNER_DIAMETER_M = {1.0: 0.0266, 1.5: 0.0409, 2.0: 0.0525, 3.0: 0.0779, 4.0: 0.1022, 6.0: 0.1541}
DEFAULT_MINOR_K = 0.5
# Las rejillas cerradas tienen ciclos de caudal casi nulo que la tolerancia por defecto (1e-6) no cierra;
# 5e-4 relativa los da por convergidos sin cambiar ningún caudal útil (igual que el banco network.py).
TOLERANCE = 5e-4
FLOW_EPS_M3H = 1e-4


def pipe_geometry(flow: dict[str, Any], a: list[float], b: list[float]) -> tuple[float, float]:
    """(longitud m, diámetro interior m) de un flujo del plano entre dos equipos en las posiciones a y b."""
    if flow.get("inner_diameter_mm"):
        d = float(flow["inner_diameter_mm"]) / 1000
    else:
        nominal = float(flow.get("diameter_in", 0))
        if nominal not in INNER_DIAMETER_M:
            raise SpecError(
                f"flujo {flow['from']} → {flow['to']}: diameter_in {nominal} sin diámetro interior conocido; use inner_diameter_mm"
            )
        d = INNER_DIAMETER_M[nominal]
    route = flow.get("route")
    if route:
        pts = [[float(c) for c in p] for p in route]
        length = sum(math.dist(p, q) for p, q in zip(pts, pts[1:], strict=False))
    elif flow.get("length_m"):
        length = float(flow["length_m"])
    else:
        length = math.dist(_xyz(a), _xyz(b))
    return max(0.1, length), d


def _xyz(pos: list[float]) -> list[float]:
    return [float(pos[0]), float(pos[1]), float(pos[2]) if len(pos) > 2 else 0.0]


def _hydraulic_link_name(eq: EquipmentBehavior, direction: str, quantity: str) -> str | None:
    """Entrada que recibe la magnitud `quantity` por un puerto hidráulico de esa dirección, si lo hay."""
    hyd = hydraulic_ports(eq.spec)
    for pid, pl in port_links(eq.spec).items():
        if pid in hyd and pl["direction"] == direction and quantity in pl["link"]:
            return pl["link"][quantity]
    return None


class _Prefixed(Mapping[str, Any]):
    """Diccionario de la solución de la planta visto con los nombres del banco de un equipo."""

    def __init__(self, data: dict[str, Any], prefix: str) -> None:
        self._data = data
        self._prefix = prefix

    def __getitem__(self, key: str) -> Any:
        return self._data[self._prefix + key]

    def __iter__(self):  # type: ignore[override]
        n = len(self._prefix)
        return (k[n:] for k in self._data if k.startswith(self._prefix))

    def __len__(self) -> int:
        return sum(1 for _ in self)


@dataclass
class _PrefixedResult:
    converged: bool
    iterations: int
    heads_m: _Prefixed
    pressures_mca: _Prefixed
    flows_m3h: _Prefixed
    status: _Prefixed
    velocity_m_s: _Prefixed


class HydraulicView:
    """Lo que ve un equipo en lugar de su banco: la red de la planta con su prefijo."""

    def __init__(self, domain: HydraulicDomain, prefix: str) -> None:
        self.domain = domain
        self.prefix = prefix

    def set(self, link_id: str, **params: Any) -> None:
        link = self.domain.net.links.get(self.prefix + link_id)
        if link is not None and any(link.params.get(k) != v for k, v in params.items()):
            self.domain.net.set(link.id, **params)
            self.domain.dirty = True

    def set_head(self, node_id: str, head_m: float) -> None:
        node = self.domain.net.nodes.get(self.prefix + node_id)
        if node is not None and node.fixed_head_m is not None and node.fixed_head_m != head_m:
            self.domain.net.set_head(node.id, head_m)
            self.domain.dirty = True

    def solve(self) -> _PrefixedResult:
        if self.domain.result is None or self.domain.dirty:
            self.domain.resolve()
        res = self.domain.result
        p = self.prefix
        return _PrefixedResult(
            res.converged,
            res.iterations,
            _Prefixed(res.heads_m, p),
            _Prefixed(res.pressures_mca, p),
            _Prefixed(res.flows_m3h, p),
            _Prefixed(res.status, p),
            _Prefixed(res.velocity_m_s, p),
        )


class HydraulicDomain:
    """Red de la planta armada con los equipos y los tubos de los enlaces hidráulicos."""

    def __init__(self, model: PlantModel, equipment: dict[str, EquipmentBehavior], links: list[Link]) -> None:
        self.model = model
        self.links = links
        self.net = HydraulicNetwork()
        self.net.tolerance = TOLERANCE
        self.result = None
        self.dirty = False
        self.solves = 0
        layout = {e["id"]: e for e in model.layout.get("equipment", [])}
        flows = {(f["from"], f["to"]): f for f in model.layout.get("flows") or []}
        members: list[str] = []
        for lk in links:
            for eid in (lk.src.equipment, lk.dst.equipment):
                if eid not in members:
                    members.append(eid)
        self.members = [equipment[eid] for eid in members]
        for eq in self.members:
            z = _xyz(layout[eq.id]["position"])[2]
            eq.hydraulic_build(self.net, self.prefix(eq.id), z)
            eq.net = HydraulicView(self, self.prefix(eq.id))  # type: ignore[attr-defined]
        # Tanques: equipos con un puerto hidráulico de entrada que recibe caudal (link.flow_kg_h) y uno de salida al que
        # se le pide (link.demand_kg_h). El motor les fija esas dos entradas con el agua que mueve la red.
        self.tanks: dict[str, tuple[str, str]] = {}
        for eq in self.members:
            supply = _hydraulic_link_name(eq, "in", "flow_kg_h")
            demand = _hydraulic_link_name(eq, "out", "demand_kg_h")
            if supply and demand:
                self.tanks[eq.id] = (supply, demand)
        self.also_fed = {
            lk.dst.equipment
            for lk in model.flow_links
            if lk.dst.equipment in self.tanks
            and port_links(equipment[lk.dst.equipment].spec).get(lk.dst.port, {}).get("link", {}).get("flow_kg_h")
            == self.tanks[lk.dst.equipment][0]
        }
        self.pipes: dict[str, dict[str, Any]] = {}
        from .plant import link_id

        for lk in links:
            a, b = self.node(lk.src.equipment, lk.src.port), self.node(lk.dst.equipment, lk.dst.port)
            for n in (a, b):
                if n not in self.net.nodes:
                    raise SpecError(f"{lk.src} → {lk.dst}: el equipo no creó el nodo hidráulico {n}")
            flow = flows[(lk.src.equipment, lk.dst.equipment)]
            length, d = pipe_geometry(flow, layout[lk.src.equipment]["position"], layout[lk.dst.equipment]["position"])
            pid = link_id(lk)
            self.net.add_pipe(pid, a, b, length, d, minor_k=float(flow.get("minor_k", DEFAULT_MINOR_K)))
            self.pipes[pid] = {"link": lk, "from_node": a, "to_node": b, "length_m": length, "diameter_m": d}

    @staticmethod
    def prefix(eid: str) -> str:
        return f"{eid}/"

    def node(self, eid: str, port: str) -> str:
        return self.prefix(eid) + hydraulic_ports(self._eq(eid).spec)[port]

    def solve(self, inputs: dict[str, dict[str, Any]]) -> dict[str, dict[str, Any]]:
        """Resuelve la red del paso. Entrega a los tanques el caudal que entra o sale por sus puertos (kg/h) y
        devuelve el estado de cada tramo para el snapshot."""
        for eq in self.members:
            eq.hydraulic_sync()
        self.resolve()
        res = self.result
        # Agua que entra (+) o sale (−) de cada tanque por cada tubo. Un tanque también puede recibir por su salida
        # (dos tanques unidos por la succión de las bombas se pasan agua): cuenta como entrada, no como salida negativa.
        moved: dict[str, list[float]] = {}
        records: dict[str, dict[str, Any]] = {}
        for pid, pipe in self.pipes.items():
            lk = pipe["link"]
            q = res.flows_m3h[pid]
            for ref, sign in ((lk.src, -1.0), (lk.dst, 1.0)):
                if ref.equipment in self.tanks:
                    moved.setdefault(ref.equipment, [0.0, 0.0])
                    k = sign * q * WATER_KG_M3
                    moved[ref.equipment][0 if k > 0 else 1] += abs(k)
            records[pid] = {
                "from": str(lk.src),
                "to": str(lk.dst),
                "via": [],
                "hydraulic": True,
                "flow_m3h": q,
                "flow_kg_h": abs(q) * WATER_KG_M3,
                "velocity_m_s": res.velocity_m_s.get(pid, 0.0),
                "from_pressure_mca": res.pressures_mca[pipe["from_node"]],
                "to_pressure_mca": res.pressures_mca[pipe["to_node"]],
                "flowing": abs(q) > FLOW_EPS_M3H,
            }
        for eid, (supply_name, demand_name) in self.tanks.items():
            inflow, outflow = moved.get(eid, (0.0, 0.0))
            if eid in self.also_fed:
                # Ese tanque también recibe por un enlace normal (las bajantes): el motor ya dejó ese caudal en el paso.
                inflow += float(inputs[eid].get(supply_name) or 0.0)
            inputs[eid][supply_name] = inflow
            inputs[eid][demand_name] = outflow
        return records

    def resolve(self) -> None:
        self.result = self.net.solve()
        self.dirty = False
        self.solves += 1

    def _eq(self, eid: str) -> EquipmentBehavior:
        return next(e for e in self.members if e.id == eid)

    def summary(self) -> dict[str, Any]:
        res = self.result
        return {"converged": bool(res.converged), "iterations": res.iterations} if res else {}
