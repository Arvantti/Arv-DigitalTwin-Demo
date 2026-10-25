"""Red nodal Fractal independiente aguas abajo de la PRS.

La PRS fija la cabeza de frontera; las ecuaciones de continuidad se resuelven
simultáneamente para cada ramal, cruce, vivienda y fuga. No se importa el
solucionador ni las funciones de construcción del emulador.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.linalg import spsolve

G = 9.81
MCA_PER_BAR = 10.197
Q_MIN = 1e-7
CLOSED_P = 1e-8
INNER_DIAMETER_M = {1.0: 0.0266, 1.5: 0.0409, 2.0: 0.0525, 3.0: 0.0779, 4.0: 0.1022, 6.0: 0.1541}


@dataclass
class Edge:
    start: str
    end: str
    kind: str
    diameter: float = 0.0
    length: float = 0.0
    minor_k: float = 0.0
    kv: float = 0.0
    exponent: float = 0.5
    flow: float = 0.0001  # m³/s


class Network:
    def __init__(self, model: dict[str, Any], tags: dict[str, Any], prs_mca: float, openings: tuple[float, float, float], demand: float):
        self.model = model
        self.tags = tags
        self.elevation: dict[str, float] = {}
        self.fixed: dict[str, float] = {}
        self.edges: dict[str, Edge] = {}
        self.emitters: dict[str, str] = {}
        layout = {item["id"]: item for item in model["plant"]["equipment"]}
        self.positions = {key: item["position"] for key, item in layout.items()}
        self.z = {key: float(pos[2]) for key, pos in self.positions.items()}
        self.add_node("prs", self.z["prs-01"], self.z["prs-01"] + prs_mca)
        for level in range(1, 5):
            grid = f"grid-0{level}"
            inlet = f"L{level}.inlet"
            self.add_node(inlet, self.z[grid])
            if level == 1:
                self.plant_pipe("prs-01", grid, "prs", inlet)
            else:
                connection = f"valve-between-{level - 1}{level}"
                self.plant_pipe(connection, grid, f"V{level - 1}.out", inlet)
            self.grid(level, grid, inlet, max(0, demand))
            if level < 4:
                connection = f"valve-between-{level}{level + 1}"
                self.add_node(f"V{level}.in", self.z[connection])
                self.add_node(f"V{level}.out", self.z[connection])
                self.plant_pipe(grid, connection, inlet, f"V{level}.in")
                params = model["equipment_models"][connection]["params"]
                opening = openings[level - 1] / 100
                characteristic = params.get("characteristic", "linear")
                if characteristic == "equal_percentage" and opening > 0:
                    opening = 50 ** (opening - 1)
                check_kv = float(params["outlet_check_kv_m3h"])
                regulated = f"V{level}.regulated" if check_kv > 0 else f"V{level}.out"
                if check_kv > 0:
                    self.add_node(regulated, self.z[connection])
                self.valve(connection, f"V{level}.in", regulated, float(params["kv_m3h"]) * opening)
                if check_kv > 0:
                    self.edges[connection + ".check"] = Edge(regulated, f"V{level}.out", "check", kv=check_kv)

    def add_node(self, name: str, z: float, head: float | None = None) -> None:
        self.elevation[name] = z
        if head is not None:
            self.fixed[name] = head

    def pipe(self, name: str, a: str, b: str, length: float, diameter: float, minor_k: float) -> None:
        self.edges[name] = Edge(a, b, "pipe", diameter=diameter, length=max(0.1, length), minor_k=minor_k)

    def valve(self, name: str, a: str, b: str, kv: float) -> None:
        self.edges[name] = Edge(a, b, "valve", kv=kv)

    def plant_pipe(self, source: str, target: str, a: str, b: str) -> None:
        pipe = next(f for f in self.model["plant"]["flows"] if f["from"] == source and f["to"] == target)
        route = pipe.get("route")
        points = route if route else [self.positions[source], self.positions[target]]
        length = sum(math.dist(p, q) for p, q in zip(points, points[1:], strict=False))
        diameter = (
            float(pipe["inner_diameter_mm"]) / 1000 if pipe.get("inner_diameter_mm") else INNER_DIAMETER_M[float(pipe["diameter_in"])]
        )
        self.pipe(f"{source}>{target}", a, b, length, diameter, float(pipe.get("minor_k", 0.5)))

    def grid(self, level: int, grid: str, inlet: str, demand: float) -> None:
        p = self.model["equipment_models"][grid]["params"]
        z, spacing, diameter = self.z[grid], float(p["spacing_m"]), float(p["pipe_id_mm"]) / 1000
        prefix = f"L{level}"
        for branch in range(1, 5):
            header, root = f"{prefix}.h{branch}", f"{prefix}.r{branch}"
            self.add_node(header, z)
            self.pipe(f"{prefix}.hp{branch}", inlet if branch == 1 else f"{prefix}.h{branch - 1}", header, spacing, diameter, 0.3)
            self.add_node(root, z)
            self.valve(f"{prefix}.bv{branch}", header, root, 20.0)
            previous = root
            for slot in range(1, 6):
                node = f"{prefix}.n{branch}{slot}"
                self.add_node(node, z)
                self.pipe(f"{prefix}.bp{branch}{slot}", previous, node, spacing, diameter, 0.5)
                previous = node
            leak_slot = int(p[f"leak_slot_branch{branch}"]) if branch in (2, 4) else None
            house_slots = [slot for slot in range(1, 6) if slot != leak_slot and (leak_slot is not None or slot != 5)]
            for position, slot in enumerate(house_slots, 1):
                key = f"{prefix}.C{branch}{position}"
                valve = f"PLC.Grid.L{level}.Consumer.C{branch}{position}.OpeningPct"
                opening = self.tags.get(valve)
                pct = float(p["consumer_opening_pct"] if opening is None else opening)
                self.emitter(key, f"{prefix}.n{branch}{slot}", float(p["consumer_kv_m3h"]) * pct / 100 * demand)
            if leak_slot is not None:
                leak = "L1" if branch == 2 else "L2"
                key = f"{prefix}.{leak}"
                valve = f"PLC.Grid.L{level}.Leak.{leak}.OpeningPct"
                opening = self.tags.get(valve)
                pct = float(p["leak_opening_pct"] if opening is None else opening)
                scale = float(self.tags.get(f"PLC.Grid.L{level}.Leak.{leak}.Scale", self.tags.get(f"PLC.Grid.L{level}.LeakageScale", 1)))
                self.emitter(key, f"{prefix}.n{branch}{leak_slot}", float(p["leak_kv_m3h"]) * pct / 100 * scale, float(p["leak_exponent"]))
        for branch in range(1, 4):
            self.pipe(f"{prefix}.xe{branch}", f"{prefix}.n{branch}5", f"{prefix}.n{branch + 1}5", spacing, diameter, 0.5)
        for branch in (1, 3):
            self.pipe(f"{prefix}.xm{branch}", f"{prefix}.n{branch}3", f"{prefix}.n{branch + 1}3", spacing, diameter, 0.5)

    def emitter(self, name: str, node: str, kv: float, exponent: float = 0.5) -> None:
        atmosphere = f"{name}@atm"
        self.add_node(atmosphere, self.elevation[node], self.elevation[node])
        self.emitters[name] = node
        self.edges[name] = Edge(node, atmosphere, "emitter", kv=kv, exponent=exponent)

    @staticmethod
    def _linear(edge: Edge) -> tuple[float, float]:
        q = edge.flow
        if edge.kind != "pipe" and (edge.kv <= 0 or (edge.kind == "check" and q <= 0)):
            return CLOSED_P, 0.0
        if edge.kind == "pipe":
            d = edge.diameter
            area = math.pi * d * d / 4
            re = max(abs(q), Q_MIN) / area * d / 1e-6
            if re < 2000 and edge.minor_k == 0:
                return math.pi * G * d**4 / (128 * 1e-6 * edge.length), 0.0
            friction = 64 / re if re < 2000 else 0.25 / math.log10(1.5e-6 / d / 3.7 + 5.74 / re**0.9) ** 2
            resistance = (friction * edge.length / d + edge.minor_k) / (2 * G * area * area)
            qa = max(abs(q), Q_MIN)
            g = 2 * resistance * qa
            h = resistance * q * abs(q)
        else:
            n = 1 / edge.exponent if edge.kind == "emitter" else 2
            k = MCA_PER_BAR * (3600 / edge.kv) ** n
            qa = max(abs(q), Q_MIN)
            h = k * qa**n
            g = n * k * qa ** (n - 1)
        return 1 / g, qa - h / g

    def solve(self, max_iterations: int = 80) -> tuple[dict[str, float], dict[str, float], bool]:
        free = [name for name in self.elevation if name not in self.fixed]
        index = {name: i for i, name in enumerate(free)}
        heads = {name: self.fixed.get(name, z + 20) for name, z in self.elevation.items()}
        converged = False
        for _ in range(max_iterations):
            rows: list[int] = []
            cols: list[int] = []
            values: list[float] = []
            rhs = np.zeros(len(free))
            coeffs: dict[str, tuple[float, float]] = {}
            for name, edge in self.edges.items():
                p, c = self._linear(edge)
                coeffs[name] = (p, c)
                a, b = edge.start, edge.end
                ia, ib = index.get(a), index.get(b)
                if ia is not None:
                    rows.append(ia)
                    cols.append(ia)
                    values.append(p)
                    rhs[ia] -= c
                    if ib is not None:
                        rows.append(ia)
                        cols.append(ib)
                        values.append(-p)
                    else:
                        rhs[ia] += p * self.fixed[b]
                if ib is not None:
                    rows.append(ib)
                    cols.append(ib)
                    values.append(p)
                    rhs[ib] += c
                    if ia is not None:
                        rows.append(ib)
                        cols.append(ia)
                        values.append(-p)
                    else:
                        rhs[ib] += p * self.fixed[a]
            matrix = coo_matrix((values, (rows, cols)), shape=(len(free), len(free))).tocsr()
            solution = spsolve(matrix, rhs)
            if not np.all(np.isfinite(solution)):
                raise ValueError("La red hidráulica Fractal no tiene solución finita")
            heads.update(zip(free, solution, strict=True))
            change = total = 0.0
            for name, edge in self.edges.items():
                p, c = coeffs[name]
                new = c + p * (heads[edge.start] - heads[edge.end])
                change += abs(new - edge.flow)
                total += abs(new)
                edge.flow = max(0.0, new) if edge.kind == "check" else new
            if change <= 5e-4 * max(total, 1e-6) and _ > 0:
                converged = True
                break
        pressures = {name: float(heads[name] - z) for name, z in self.elevation.items() if not name.endswith("@atm")}
        flows = {name: (0.0 if edge.kind != "pipe" and edge.kv <= 0 else max(0.0, edge.flow * 3600)) for name, edge in self.edges.items()}
        return pressures, flows, converged
