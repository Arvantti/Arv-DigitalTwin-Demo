"""Rejilla de distribución de un nivel (B2): cabezal y ramales de 2" (cada ramal con su válvula de bola) sobre
la red hidráulica, 16 válvulas de consumo y 2 de fuga que descargan a la canaleta, cada una con su caudal y su
presión; alarma de presión mínima de servicio, fuga que revienta y ramal obstruido."""

from __future__ import annotations

from typing import Any

from twin_runtime import EquipmentBehavior, StepContext
from twin_runtime.primitives import HydraulicNetwork

MCA_PER_BAR = 10.197
BRANCHES = 4
PER_BRANCH = 4
CONSUMERS = [f"c{j}{i}" for j in range(1, BRANCHES + 1) for i in range(1, PER_BRANCH + 1)]
LEAKS = {"l1": 2, "l2": 4}  # válvula de fuga → nodo del cabezal
VALVES = CONSUMERS + list(LEAKS)
HEADER_K = 0.3
BRANCH_K = 0.5
BRANCH_VALVE_KV = 20.0  # válvula de bola de 2" a la entrada de cada ramal
BURST_FACTOR = 5.0
BLOCKED_KV = 1.0  # válvula del ramal 4 obstruida por sedimento
LOW_S = 30.0


def add_distribution_grid(net: HydraulicNetwork, prefix: str, inlet: str, p: dict[str, Any]) -> dict[str, dict[str, str]]:
    """Agrega una rejilla colgada del nodo de entrada. Devuelve, por válvula, el id de su descarga y de su nodo.

    El motor de planta usará esta misma función para armar las cuatro rejillas dentro de la red completa."""
    z = net.nodes[inlet].elevation_m
    d = p["pipe_id_mm"] / 1000
    s = p["spacing_m"]
    out: dict[str, dict[str, str]] = {}
    for j in range(1, BRANCHES + 1):
        h = f"{prefix}h{j}"
        net.add_node(h, z)
        net.add_pipe(f"{prefix}hp{j}", inlet if j == 1 else f"{prefix}h{j - 1}", h, s, d, minor_k=HEADER_K)
        root = f"{prefix}r{j}"
        net.add_node(root, z)
        net.add_valve(f"{prefix}bv{j}", h, root, kv_m3h=BRANCH_VALVE_KV)
        for i in range(1, PER_BRANCH + 1):
            v = f"c{j}{i}"
            node = f"{prefix}n{j}{i}"
            net.add_node(node, z)
            net.add_pipe(f"{prefix}bp{j}{i}", root if i == 1 else f"{prefix}n{j}{i - 1}", node, s, d, minor_k=BRANCH_K)
            net.add_emitter(f"{prefix}{v}", node, kv_m3h=p["consumer_kv_m3h"], opening=p["consumer_opening_pct"] / 100)
            out[v] = {"link": f"{prefix}{v}", "node": node}
    for v, j in LEAKS.items():
        node = f"{prefix}h{j}"
        net.add_emitter(f"{prefix}{v}", node, kv_m3h=p["leak_kv_m3h"], opening=p["leak_opening_pct"] / 100,
                        exponent=p["leak_exponent"])
        out[v] = {"link": f"{prefix}{v}", "node": node}
    return out


class DistributionGrid(EquipmentBehavior):
    type = "distribution-grid"
    INITIAL_STATE = "running"
    DEFAULT_INPUTS = {"inlet_pressure_mca": None, "demand_factor": None}

    def setup(self) -> None:
        p = self.p
        z = p["elevation_m"]
        self.net = HydraulicNetwork()
        self.net.add_fixed_head("supply", z + p["bench_inlet_mca"], elevation_m=z)
        self.net.add_node("inlet", z)
        self.net.add_valve("supply-line", "supply", "inlet", kv_m3h=1e5)
        self.map = add_distribution_grid(self.net, "", "inlet", p)
        self.opening = {v: (p["consumer_opening_pct"] if v.startswith("c") else p["leak_opening_pct"]) for v in VALVES}
        self.flow_lpm = dict.fromkeys(VALVES, 0.0)
        self.pressure = dict.fromkeys(VALVES, 0.0)
        self.p_in = p["bench_inlet_mca"]
        self.flow_in = 0.0
        self.consumption = 0.0
        self.leakage = 0.0
        self.volume_m3 = self.consumed_m3 = self.leaked_m3 = 0.0
        self.min_p = 0.0
        self.min_valve = CONSUMERS[-1]
        self.min_seen: float | None = None
        self.low_s = 0.0
        self.low_alarm = False
        # caudal de diseño del nivel: todas las válvulas abiertas a 20 mca
        self.design_m3h = (len(CONSUMERS) * p["consumer_kv_m3h"] + len(LEAKS) * p["leak_kv_m3h"]) * (20 / MCA_PER_BAR) ** 0.5

    # ---- comandos y fallas ----
    def on_command(self, name: str, args: dict[str, Any]) -> bool:
        if name != "set_opening":
            return False
        target = str(args["valve"])
        pct = min(100.0, max(0.0, float(args["pct"])))
        groups = {"all": VALVES, "consumers": CONSUMERS, "leaks": list(LEAKS)}
        chosen = groups.get(target, [target])
        if any(v not in self.opening for v in chosen):
            raise ValueError(f"válvula desconocida {target!r}: use c11..c44, l1, l2, consumers, leaks o all")
        for v in chosen:
            self.opening[v] = pct
        self.emit("opening_changed", valve=target, pct=pct)
        return True

    def on_fault(self, fault_id: str) -> None:
        self._apply_faults()

    def on_fault_cleared(self, fault_id: str) -> None:
        self._apply_faults()

    def _apply_faults(self) -> None:
        p = self.p
        burst = BURST_FACTOR if self.failures.is_active("leak_burst") else 1.0
        self.net.set(self.map["l1"]["link"], kv_m3h=p["leak_kv_m3h"] * burst)
        blocked = self.failures.is_active("branch_blockage")
        self.net.set("bv4", kv_m3h=BLOCKED_KV if blocked else BRANCH_VALVE_KV)

    # ---- paso ----
    def update(self, ctx: StepContext) -> None:
        p = self.p
        dt = ctx.dt
        net = self.net
        inlet = self.inputs["inlet_pressure_mca"]
        net.set_head("supply", p["elevation_m"] + (p["bench_inlet_mca"] if inlet is None else float(inlet)))
        factor = self.inputs["demand_factor"]
        factor = 1.0 if factor is None else min(1.0, max(0.0, float(factor)))
        for v in VALVES:
            scale = factor if v.startswith("c") else 1.0
            net.set(self.map[v]["link"], opening=self.opening[v] / 100 * scale)
        res = net.solve()
        for v in VALVES:
            self.flow_lpm[v] = max(0.0, res.flows_m3h[self.map[v]["link"]]) * 1000 / 60
            self.pressure[v] = res.pressures_mca[self.map[v]["node"]]
        self.p_in = res.pressures_mca["inlet"]
        self.consumption = sum(self.flow_lpm[v] for v in CONSUMERS) * 60 / 1000
        self.leakage = sum(self.flow_lpm[v] for v in LEAKS) * 60 / 1000
        self.flow_in = self.consumption + self.leakage
        self.volume_m3 += self.flow_in * dt / 3600
        self.consumed_m3 += self.consumption * dt / 3600
        self.leaked_m3 += self.leakage * dt / 3600
        self.min_valve = min(CONSUMERS, key=lambda v: self.pressure[v])
        self.min_p = self.pressure[self.min_valve]
        if self.t >= 60:
            self.min_seen = self.min_p if self.min_seen is None else min(self.min_seen, self.min_p)
        low = self.min_p < p["min_service_mca"] and any(self.opening[v] > 0 for v in CONSUMERS)
        self.low_s = self.low_s + dt if low else 0.0
        if not self.low_alarm and self.low_s >= LOW_S:
            self.low_alarm = True
            self.emit("low_pressure", valve=self.min_valve, mca=round(self.min_p, 2))
        elif self.low_alarm and self.min_p >= p["min_service_mca"]:
            self.low_alarm = False
            self.emit("pressure_normal")
        if self.state.current != "fault":
            self.state.set("running" if self.flow_in > 1e-9 else "idle")

    # ---- lectura ----
    def true_values(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "inlet_pressure_mca": self.p_in,
            "flow_in_m3h": self.flow_in,
            "consumption_m3h": self.consumption,
            "leakage_m3h": self.leakage,
            "leakage_pct": 100 * self.leakage / self.flow_in if self.flow_in > 0 else 0.0,
            "min_pressure_mca": self.min_p,
            "min_pressure_valve": self.min_valve,
            "consumer_opening_pct": sum(self.opening[v] for v in CONSUMERS) / len(CONSUMERS),
            "volume_m3": self.volume_m3,
        }
        for v in VALVES:
            out[f"q_{v}"] = self.flow_lpm[v]
            out[f"p_{v}"] = self.pressure[v]
        return out

    def kpis(self) -> dict[str, Any]:
        return {
            "consumption_m3": self.consumed_m3,
            "leakage_m3": self.leaked_m3,
            "nrw_pct": 100 * self.leaked_m3 / self.volume_m3 if self.volume_m3 > 0 else 0.0,
            "min_pressure_mca": self.min_seen if self.min_seen is not None else self.min_p,
        }

    def animation(self) -> dict[str, float]:
        out = {
            "inlet_pressure_mca": max(0.0, self.p_in),
            "min_pressure_mca": max(0.0, self.min_p),
            "flow_in_norm": min(2.0, self.flow_in / self.design_m3h) if self.design_m3h > 0 else 0.0,
        }
        for v in VALVES:
            out[f"open_{v}"] = self.opening[v] / 100
            out[f"q_{v}"] = self.flow_lpm[v]
        return out
