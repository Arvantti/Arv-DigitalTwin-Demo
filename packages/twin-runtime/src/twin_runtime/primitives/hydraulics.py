"""Red hidráulica a presión: solucionador cuasiestacionario por el método del gradiente global.

Es el método de Todini y Pilati (1988) que usa EPANET. Incógnitas: la cabeza piezométrica de cada nodo
(m) y el caudal de cada elemento. En cada iteración se linealiza la pérdida de cada elemento alrededor de su
caudal actual, se resuelve el sistema de los nodos (simétrico y disperso) y se corrigen los caudales.

Elementos (todos son «enlaces» entre dos nodos):

| Elemento | Pérdida de cabeza h = H_desde − H_hasta |
|---|---|
| Tubo | Darcy-Weisbach con Swamee-Jain (Hagen-Poiseuille si es laminar) más accesorios K·v²/2g |
| Válvula | Por Kv y apertura: Q[m³/h] = Kv·c(apertura)·√Δp[bar]; c lineal o de igual porcentaje |
| Antirretorno | Válvula que se cierra si el caudal se invierte |
| Bomba | Ganancia s²·H0 − r·Q² (s = velocidad relativa), con antirretorno propio |
| Descarga | Salida a la atmósfera: Q[m³/h] = Kv·apertura·p[bar]^β (consumos y fugas; β = 0,5 es un orificio) |
| PRV | Reductora de presión: fija la presión aguas abajo en su consigna mientras pueda (estados de EPANET) |

Unidades públicas: caudal en m³/h, presión en mca (metros de columna de agua), longitudes en m.
Los tanques y la atmósfera son nodos de cabeza fija; el comportamiento del tanque integra su nivel y
actualiza la cabeza entre pasos (`set_head`).

La red guarda los caudales de la última solución y arranca desde ellos (arranque en caliente): en una
simulación por pasos, si nada cambia, converge en una o dos iteraciones.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

G = 9.81
MCA_PER_BAR = 10.197  # 1 bar en metros de columna de agua a 20 °C
CLOSED_P = 1e-8  # conductancia de un elemento cerrado (m³/s por m): mantiene la matriz invertible
Q_MIN = 1e-7  # m³/s, caudal mínimo para linealizar sin dividir por cero


@dataclass
class Fluid:
    density_kg_m3: float = 998.0
    viscosity_m2_s: float = 1.0e-6  # agua a 20 °C


@dataclass
class Node:
    id: str
    elevation_m: float = 0.0
    demand_m3h: float = 0.0
    fixed_head_m: float | None = None  # tanque o atmósfera


@dataclass
class Link:
    id: str
    kind: str
    start: str
    end: str
    params: dict = field(default_factory=dict)
    status: str = "open"  # open, closed, active (PRV)
    flow: float = 0.0  # m³/s, positivo de start a end


@dataclass
class HydraulicResult:
    converged: bool
    iterations: int
    heads_m: dict[str, float]
    pressures_mca: dict[str, float]
    flows_m3h: dict[str, float]
    status: dict[str, str]
    velocity_m_s: dict[str, float]  # tubos: velocidad media (condición de borde para CFD)

    def headloss_m(self, net: HydraulicNetwork, link_id: str) -> float:
        link = net.links[link_id]
        return self.heads_m[link.start] - self.heads_m[link.end]


def darcy_friction(re: float, rel_roughness: float) -> float:
    """Factor de fricción: 64/Re en laminar (Re < 2000), Swamee-Jain en turbulento."""
    if re < 2000:
        return 64.0 / max(re, 1e-9)
    return 0.25 / math.log10(rel_roughness / 3.7 + 5.74 / re**0.9) ** 2


def kv_resistance(kv_m3h: float) -> float:
    """r tal que h[m] = r·Q[m³/s]² para una válvula con ese Kv."""
    return MCA_PER_BAR * (3600.0 / kv_m3h) ** 2


class HydraulicNetwork:
    def __init__(self, fluid: Fluid | None = None, max_iterations: int = 60, tolerance: float = 1e-6) -> None:
        self.fluid = fluid or Fluid()
        self.nodes: dict[str, Node] = {}
        self.links: dict[str, Link] = {}
        self.max_iterations = max_iterations
        self.tolerance = tolerance
        self._heads: dict[str, float] = {}
        self._solved = False

    # ---- construcción ----
    def add_node(self, id: str, elevation_m: float = 0.0, demand_m3h: float = 0.0) -> Node:
        self._new_node_id(id)
        self.nodes[id] = Node(id, elevation_m, demand_m3h)
        return self.nodes[id]

    def add_fixed_head(self, id: str, head_m: float, elevation_m: float | None = None) -> Node:
        """Tanque (cabeza = fondo + nivel) o atmósfera. La presión del nodo es cabeza − elevación."""
        self._new_node_id(id)
        self.nodes[id] = Node(id, head_m if elevation_m is None else elevation_m, 0.0, head_m)
        return self.nodes[id]

    def add_pipe(self, id: str, start: str, end: str, length_m: float, diameter_m: float,
                 roughness_m: float = 1.5e-6, minor_k: float = 0.0) -> Link:
        if length_m <= 0 or diameter_m <= 0:
            raise ValueError(f"{id}: longitud y diámetro deben ser positivos")
        return self._add_link(id, "pipe", start, end, length_m=length_m, diameter_m=diameter_m,
                              roughness_m=roughness_m, minor_k=minor_k)

    def add_valve(self, id: str, start: str, end: str, kv_m3h: float, opening: float = 1.0,
                  characteristic: str = "linear", rangeability: float = 50.0) -> Link:
        if characteristic not in ("linear", "equal_percentage"):
            raise ValueError(f"{id}: característica desconocida {characteristic}")
        return self._add_link(id, "valve", start, end, kv_m3h=kv_m3h, opening=opening,
                              characteristic=characteristic, rangeability=rangeability)

    def add_check_valve(self, id: str, start: str, end: str, kv_m3h: float) -> Link:
        return self._add_link(id, "check", start, end, kv_m3h=kv_m3h)

    def add_pump(self, id: str, start: str, end: str, shutoff_head_m: float, design_flow_m3h: float,
                 design_head_m: float, speed: float = 1.0) -> Link:
        """Curva H = s²·H0 − r·Q², con r tal que pase por el punto de diseño a velocidad nominal."""
        if not 0 < design_head_m < shutoff_head_m or design_flow_m3h <= 0:
            raise ValueError(f"{id}: la curva necesita 0 < H de diseño < H a caudal cero y caudal de diseño > 0")
        r = (shutoff_head_m - design_head_m) / (design_flow_m3h / 3600.0) ** 2
        return self._add_link(id, "pump", start, end, shutoff_head_m=shutoff_head_m, r=r, speed=speed)

    def add_emitter(self, id: str, node: str, kv_m3h: float, opening: float = 1.0, exponent: float = 0.5) -> Link:
        """Descarga a la atmósfera a la elevación del nodo (válvula de consumo o de fuga)."""
        if node not in self.nodes:
            raise KeyError(f"{id}: nodo desconocido {node}")
        if not 0.1 <= exponent <= 2.5:
            raise ValueError(f"{id}: exponente fuera de rango")
        outlet = f"{id}@atm"
        self.add_fixed_head(outlet, self.nodes[node].elevation_m)
        return self._add_link(id, "emitter", node, outlet, kv_m3h=kv_m3h, opening=opening, exponent=exponent)

    def add_prv(self, id: str, start: str, end: str, setting_mca: float, kv_m3h: float) -> Link:
        """Reductora: presión aguas abajo = consigna (mca) si la de arriba alcanza; si no, queda abierta."""
        link = self._add_link(id, "prv", start, end, setting_mca=setting_mca, kv_m3h=kv_m3h)
        link.status = "active"
        return link

    # ---- cambios entre pasos ----
    def set(self, link_id: str, **params) -> None:
        link = self.links[link_id]
        unknown = set(params) - set(link.params)
        if unknown:
            raise KeyError(f"{link_id}: parámetros desconocidos {sorted(unknown)}")
        link.params.update(params)

    def set_head(self, node_id: str, head_m: float) -> None:
        node = self.nodes[node_id]
        if node.fixed_head_m is None:
            raise ValueError(f"{node_id} no es un nodo de cabeza fija")
        node.fixed_head_m = head_m

    def set_demand(self, node_id: str, demand_m3h: float) -> None:
        self.nodes[node_id].demand_m3h = demand_m3h

    # ---- solución ----
    def solve(self) -> HydraulicResult:
        free = [n for n in self.nodes.values() if n.fixed_head_m is None]
        index = {n.id: i for i, n in enumerate(free)}
        heads = {n.id: (n.fixed_head_m if n.fixed_head_m is not None else self._heads.get(n.id, n.elevation_m))
                 for n in self.nodes.values()}
        for link in self.links.values():
            if not self._solved and link.status != "closed":
                link.flow = self._initial_flow(link)
        self._solved = True
        for link in self.links.values():
            end = self.nodes[link.end]
            if link.kind == "prv" and end.fixed_head_m is not None:
                # Aguas abajo hay un tanque: la PRV no puede fijar esa presión; cierra si ya la supera.
                above = end.fixed_head_m - end.elevation_m >= link.params["setting_mca"]
                link.status = "closed" if above else "open"
        prv_extra: dict[str, float] = {}
        converged = False
        it = 0
        for it in range(1, self.max_iterations + 1):
            # Nodos que fija una PRV activa: su cabeza es la consigna.
            fixed = {n.id: n.fixed_head_m for n in self.nodes.values() if n.fixed_head_m is not None}
            for link in self.links.values():
                if link.kind == "prv" and link.status == "active":
                    fixed[link.end] = self.nodes[link.end].elevation_m + link.params["setting_mca"]
            matrix: list[dict[int, float]] = [{} for _ in free]
            rhs = [0.0] * len(free)
            coeffs: dict[str, tuple[float, float]] = {}
            for n in free:
                if n.id not in fixed:
                    rhs[index[n.id]] -= n.demand_m3h / 3600.0 + prv_extra.get(n.id, 0.0)
            for link in self.links.values():
                if link.kind == "prv" and link.status == "active":
                    continue
                p, c = self._linearize(link)
                coeffs[link.id] = (p, c)
                a, b = link.start, link.end
                ia = index[a] if a not in fixed else None
                ib = index[b] if b not in fixed else None
                # Continuidad: entra c + p·(H_a − H_b) a b y sale de a.
                if ia is not None:
                    matrix[ia][ia] = matrix[ia].get(ia, 0.0) + p
                    rhs[ia] -= c
                    if ib is not None:
                        matrix[ia][ib] = matrix[ia].get(ib, 0.0) - p
                    else:
                        rhs[ia] += p * fixed[b]
                if ib is not None:
                    matrix[ib][ib] = matrix[ib].get(ib, 0.0) + p
                    rhs[ib] += c
                    if ia is not None:
                        matrix[ib][ia] = matrix[ib].get(ia, 0.0) - p
                    else:
                        rhs[ib] += p * fixed[a]
            # Los nodos fijados por una PRV no tienen ecuación propia: fila identidad.
            for node_id, h in fixed.items():
                if node_id in index:
                    matrix[index[node_id]] = {index[node_id]: 1.0}
                    rhs[index[node_id]] = h
            for i, row in enumerate(matrix):
                if row.get(i, 0.0) == 0.0:  # nodo sin elementos
                    row[i] = 1.0
                    rhs[i] = free[i].elevation_m
            solution = _solve_sparse_symmetric(matrix, rhs)
            for n in free:
                heads[n.id] = solution[index[n.id]]
            for node_id, h in fixed.items():
                heads[node_id] = h
            # Corrección de caudales.
            change = 0.0
            total = 0.0
            for link in self.links.values():
                if link.id in coeffs:
                    p, c = coeffs[link.id]
                    new = c + p * (heads[link.start] - heads[link.end])
                else:  # PRV activa: lo que sale de su nodo de aguas abajo
                    new = self._outflow(link.end, heads, coeffs, skip=link.id)
                change += abs(new - link.flow)
                total += abs(new)
                link.flow = new
            prv_extra = {}
            for link in self.links.values():
                if link.kind == "prv" and link.status == "active":
                    prv_extra[link.start] = prv_extra.get(link.start, 0.0) + link.flow
            status_changed = self._update_status(heads)
            if not status_changed and change <= self.tolerance * max(total, 1e-6) and it > 1:
                converged = True
                break
        self._heads = {k: v for k, v in heads.items() if self.nodes[k].fixed_head_m is None}
        return self._result(heads, converged, it)

    # ---- internos ----
    def _new_node_id(self, id: str) -> None:
        if id in self.nodes:
            raise ValueError(f"nodo repetido {id}")

    def _add_link(self, id: str, kind: str, start: str, end: str, **params) -> Link:
        if id in self.links:
            raise ValueError(f"elemento repetido {id}")
        for n in (start, end):
            if n not in self.nodes:
                raise KeyError(f"{id}: nodo desconocido {n}")
        self.links[id] = Link(id, kind, start, end, params)
        return self.links[id]

    def _initial_flow(self, link: Link) -> float:
        """Arranque en frío: 0,3 m/s en tubos, el caudal de diseño en bombas y 1 bar en válvulas."""
        pr = link.params
        if link.kind == "pipe":
            return 0.3 * math.pi * pr["diameter_m"] ** 2 / 4
        if link.kind == "pump":
            return math.sqrt((pr["shutoff_head_m"] * 0.8) / pr["r"]) if pr["speed"] > 0 else 0.0
        kv = pr.get("kv_m3h", 0.0) * pr.get("opening", 1.0)
        return kv / 3600.0

    def _resistance(self, link: Link, q: float) -> float:
        """r tal que la pérdida es r·Q|Q| (tubos, válvulas, antirretornos y PRV abiertas)."""
        pr = link.params
        if link.kind == "pipe":
            d = pr["diameter_m"]
            area = math.pi * d * d / 4
            re = max(abs(q), Q_MIN) / area * d / self.fluid.viscosity_m2_s
            f = darcy_friction(re, pr["roughness_m"] / d)
            return (f * pr["length_m"] / d + pr["minor_k"]) / (2 * G * area * area)
        if link.kind == "valve":
            kv = pr["kv_m3h"] * _valve_char(pr["opening"], pr["characteristic"], pr["rangeability"])
            return kv_resistance(kv) if kv > 0 else math.inf
        return kv_resistance(pr["kv_m3h"])

    @staticmethod
    def _shut(link: Link) -> bool:
        """Cerrado por su ajuste (apertura 0, bomba detenida), no por el estado hidráulico."""
        pr = link.params
        if link.kind == "pump":
            return pr["speed"] <= 0
        if link.kind in ("valve", "emitter"):
            return pr["opening"] <= 0 or pr["kv_m3h"] <= 0
        return False

    def _linearize(self, link: Link) -> tuple[float, float]:
        """Devuelve (p, c) tal que el caudal nuevo es c + p·(H_inicio − H_fin)."""
        q = link.flow
        if link.status == "closed" or self._shut(link):
            return CLOSED_P, 0.0
        if link.kind == "pump":
            s = link.params["speed"]
            if s <= 0:
                return CLOSED_P, 0.0
            r = link.params["r"]
            qa = max(abs(q), Q_MIN * 100)
            h = -(s * s * link.params["shutoff_head_m"] - r * qa * qa)  # pérdida (negativa: ganancia)
            g = 2 * r * qa
            return 1 / g, qa - h / g
        if link.kind == "emitter":
            kv = link.params["kv_m3h"] * link.params["opening"]
            if kv <= 0:
                return CLOSED_P, 0.0
            n = 1.0 / link.params["exponent"]
            k = MCA_PER_BAR * (3600.0 / kv) ** n
            qa = max(abs(q), Q_MIN)
            h = k * qa**n
            g = n * k * qa ** (n - 1)
            return 1 / g, qa - h / g
        if link.kind == "pipe" and link.params["minor_k"] == 0:
            laminar = self._laminar(link, q)
            if laminar is not None:
                return laminar, 0.0
        r = self._resistance(link, q)
        if math.isinf(r):
            return CLOSED_P, 0.0
        qa = max(abs(q), Q_MIN)
        g = 2 * r * qa
        h = r * q * abs(q)
        return 1 / g, q - h / g

    def _laminar(self, link: Link, q: float) -> float | None:
        """Conductancia exacta de Hagen-Poiseuille si el flujo es laminar (h lineal en Q)."""
        d = link.params["diameter_m"]
        area = math.pi * d * d / 4
        if abs(q) / area * d / self.fluid.viscosity_m2_s >= 2000:
            return None
        return math.pi * G * d**4 / (128 * self.fluid.viscosity_m2_s * link.params["length_m"])

    def _outflow(self, node_id: str, heads: dict[str, float], coeffs: dict, skip: str) -> float:
        """Caudal neto que sale del nodo por los demás elementos más su demanda."""
        out = self.nodes[node_id].demand_m3h / 3600.0
        for link in self.links.values():
            if link.id == skip or link.id not in coeffs:
                continue
            p, c = coeffs[link.id]
            q = c + p * (heads[link.start] - heads[link.end])
            if link.start == node_id:
                out += q
            elif link.end == node_id:
                out -= q
        return out

    def _update_status(self, heads: dict[str, float]) -> bool:
        changed = False
        h_tol = 0.0005
        q_tol = 1e-7
        for link in self.links.values():
            old = link.status
            h1, h2 = heads[link.start], heads[link.end]
            if link.kind in ("check", "pump", "emitter"):
                gain = 0.0
                if link.kind == "pump":
                    gain = link.params["speed"] ** 2 * link.params["shutoff_head_m"]
                if link.status == "open" and link.flow < -q_tol:
                    link.status = "closed"
                elif link.status == "closed" and h1 + gain > h2 + h_tol:
                    link.status = "open"
            elif link.kind == "prv" and self.nodes[link.end].fixed_head_m is None:
                hset = self.nodes[link.end].elevation_m + link.params["setting_mca"]
                if link.status == "active":
                    if link.flow < -q_tol:
                        link.status = "closed"
                    elif h1 < hset - h_tol:
                        link.status = "open"
                elif link.status == "open":
                    if link.flow < -q_tol:
                        link.status = "closed"
                    elif h2 >= hset + h_tol:
                        link.status = "active"
                else:
                    if h1 >= hset + h_tol and h2 < hset - h_tol:
                        link.status = "active"
                    elif h1 < hset - h_tol and h1 > h2 + h_tol:
                        link.status = "open"
            if link.status == "closed" and old != "closed":
                link.flow = 0.0
            changed = changed or link.status != old
        return changed

    def _result(self, heads: dict[str, float], converged: bool, iterations: int) -> HydraulicResult:
        pressures = {k: heads[k] - n.elevation_m for k, n in self.nodes.items() if not k.endswith("@atm")}
        flows = {k: (0.0 if link.status == "closed" or self._shut(link) else link.flow * 3600.0)
                 for k, link in self.links.items()}
        velocity = {}
        for k, link in self.links.items():
            if link.kind == "pipe":
                d = link.params["diameter_m"]
                velocity[k] = flows[k] / 3600.0 / (math.pi * d * d / 4)
        return HydraulicResult(converged, iterations, {k: v for k, v in heads.items() if not k.endswith("@atm")},
                               pressures, flows, {k: link.status for k, link in self.links.items()}, velocity)


def _valve_char(opening: float, characteristic: str, rangeability: float) -> float:
    x = min(max(opening, 0.0), 1.0)
    if x == 0:
        return 0.0
    if characteristic == "equal_percentage":
        return rangeability ** (x - 1)
    return x


def _solve_sparse_symmetric(matrix: list[dict[int, float]], rhs: list[float]) -> list[float]:
    """Eliminación de Gauss sobre una matriz dispersa simétrica definida positiva, eligiendo en cada paso el
    nodo con menos vecinos (mínimo grado) para limitar el relleno. Redes de unos cientos de nodos."""
    n = len(rhs)
    a = [dict(row) for row in matrix]
    b = list(rhs)
    remaining = set(range(n))
    order: list[int] = []
    pivots: list[tuple[int, float, dict[int, float]]] = []
    while remaining:
        k = min(remaining, key=lambda i: (len(a[i]), i))
        remaining.discard(k)
        order.append(k)
        row = a[k]
        diag = row.pop(k)
        neighbors = {j: v for j, v in row.items() if j in remaining}
        for i, aik in neighbors.items():
            factor = aik / diag
            ri = a[i]
            ri.pop(k, None)
            for j, akj in neighbors.items():
                ri[j] = ri.get(j, 0.0) - factor * akj
            b[i] -= factor * b[k]
        pivots.append((k, diag, neighbors))
    x = [0.0] * n
    for k, diag, neighbors in reversed(pivots):
        x[k] = (b[k] - sum(v * x[j] for j, v in neighbors.items())) / diag
    return x
