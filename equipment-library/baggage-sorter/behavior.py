"""Comportamiento del clasificador de bandejas basculantes (B2): inducción, lectura, rampas, recirculación y manual."""

from __future__ import annotations

import math
from typing import Any

from twin_runtime import EquipmentBehavior, StepContext

N_CHUTES = 4
MANUAL = -1
ATR_FAULT_READ_PCT = 60.0
MANUAL_AFTER_M = 1.5


def loop_length_m(straight_m: float, loop_width_m: float) -> float:
    """Largo del eje del lazo: dos rectas y dos semicírculos (la misma relación que dibuja la geometría)."""
    return 2.0 * straight_m + math.pi * loop_width_m


class _Gate:
    """Salida con separación mínima: a lo sumo una maleta cada `gap_s`."""

    def __init__(self) -> None:
        self.credit = 1.0

    def take(self, dt: float, gap_s: float, waiting: int, free: bool) -> int:
        self.credit = min(max(1.0, dt / gap_s), self.credit + dt / gap_s)
        out = 0
        while free and waiting > out and self.credit >= 1.0 - 1e-9:
            self.credit -= 1.0
            out += 1
        return out


class Bag:
    __slots__ = ("dest", "target", "to_go", "recircs")

    def __init__(self, dest: int, to_go: float) -> None:
        self.dest = dest  # rampa del vuelo (0..3) o MANUAL si no se leyó
        self.target = dest  # a dónde va ahora (MANUAL después de agotar las vueltas)
        self.to_go = to_go  # metros hasta su punto de descarga
        self.recircs = 0


class BaggageSorter(EquipmentBehavior):
    type = "baggage-sorter"
    DEFAULT_INPUTS = {
        "inflow_upm": None,
        "downstream_free_1": True,
        "downstream_free_2": True,
        "downstream_free_3": True,
        "downstream_free_4": True,
        "manual_free": True,
    }

    def setup(self) -> None:
        self.arrivals = 0.0
        self.induct_credit = 1.0
        self.bags: list[Bag] = []
        self.chutes = [0] * N_CHUTES
        self.manual_q = 0
        self.gates = [_Gate() for _ in range(N_CHUTES)]
        self.manual_gate = _Gate()
        self.assigned = [0] * N_CHUTES
        self.read_acc = 0.0
        self.inducted = 0
        self.no_reads = 0
        self.recirculated = 0
        self.dumped = 0
        self.delivered = [0] * N_CHUTES
        self.delivered_manual = 0
        self.travel = 0.0
        self.speed = 0.0
        self.accepting = True
        self.chute_was_full = [False] * N_CHUTES

    # ------------------------------------------------------------------ geometría del lazo
    @property
    def loop_m(self) -> float:
        return loop_length_m(self.p["straight_m"], self.p["loop_width_m"])

    @property
    def trays(self) -> int:
        return max(1, int(self.loop_m // self.p["tray_pitch_m"]))

    def _chute_pos(self, k: int) -> float:
        """Distancia desde las inducciones hasta la rampa k (0..destinations-1)."""
        n = int(self.p["destinations"])
        return self.p["straight_m"] * (k + 0.5) / n

    def _manual_pos(self) -> float:
        """La rampa de manual está 1,5 m después del final del tramo de descarga (al entrar a la curva)."""
        return self.p["straight_m"] + MANUAL_AFTER_M

    # ------------------------------------------------------------------ comandos
    def on_command(self, name: str, args: dict[str, Any]) -> bool:
        if name == "set_speed":
            self.p["speed_m_s"] = max(0.0, float(args["m_s"]))
        elif name == "set_split":
            k = int(args["chute"])
            if not 1 <= k <= N_CHUTES:
                raise ValueError(f"rampa {k} fuera de 1..{N_CHUTES}")
            self.p[f"split_{k}_pct"] = max(0.0, float(args["pct"]))
        else:
            return False
        return True

    # ------------------------------------------------------------------ simulación
    def _choose_dest(self) -> int:
        n = int(self.p["destinations"])
        splits = [max(0.0, float(self.p[f"split_{k + 1}_pct"])) for k in range(n)]
        total = sum(splits)
        if total <= 0:
            return MANUAL
        count = sum(self.assigned[:n]) + 1
        k = max(range(n), key=lambda i: splits[i] / total * count - self.assigned[i])
        self.assigned[k] += 1
        return k

    def _induct(self) -> None:
        read_pct = ATR_FAULT_READ_PCT if self.failures.is_active("atr_fault") else self.p["read_rate_pct"]
        self.read_acc += (100.0 - read_pct) / 100.0
        self.inducted += 1
        if self.read_acc >= 1.0 - 1e-9:
            self.read_acc -= 1.0
            self.no_reads += 1
            self.bags.append(Bag(MANUAL, self._manual_pos()))
        else:
            k = self._choose_dest()
            self.bags.append(Bag(k, self._manual_pos() if k == MANUAL else self._chute_pos(k)))

    def _arrive(self, bag: Bag) -> bool:
        """La maleta llega a su punto de descarga. True si sale del lazo."""
        p = self.p
        if bag.target == MANUAL:
            if self.manual_q < p["chute_capacity"]:
                self.manual_q += 1
                return True
            bag.to_go += self.loop_m
            return False
        k = bag.target
        if self.chutes[k] < p["chute_capacity"]:
            self.chutes[k] += 1
            return True
        bag.recircs += 1
        self.recirculated += 1
        if bag.recircs > p["max_recirc"]:
            bag.target = MANUAL
            bag.to_go += self._manual_pos() - self._chute_pos(k)
            self.dumped += 1
            self.emit("bag_dumped", chute=k + 1)
        else:
            bag.to_go += self.loop_m
        return False

    def update(self, ctx: StepContext) -> None:
        dt = ctx.dt
        p = self.p
        stopped = self.failures.stopping is not None
        v = 0.0 if stopped else float(p["speed_m_s"])
        self.speed = v
        self.travel = (self.travel + v * dt) % self.loop_m

        inflow = self.inputs["inflow_upm"]
        self.arrivals += (p["nominal_inflow_upm"] if inflow is None else float(inflow)) / 60.0 * dt

        # avance del lazo y descargas
        if v > 0:
            still: list[Bag] = []
            for bag in self.bags:
                bag.to_go -= v * dt
                if bag.to_go <= 1e-9 and self._arrive(bag):
                    continue
                still.append(bag)
            self.bags = still

        # inducción a bandejas libres
        interval = 60.0 / p["induct_max_upm"]
        self.induct_credit = min(max(1.0, dt / interval), self.induct_credit + dt / interval)
        if v > 0:
            while self.arrivals >= 1.0 - 1e-9 and self.induct_credit >= 1.0 - 1e-9 and len(self.bags) < self.trays:
                self.arrivals -= 1.0
                self.induct_credit -= 1.0
                self._induct()

        # rampas hacia los carruseles y hacia manual
        n = int(p["destinations"])
        for k in range(N_CHUTES):
            free = k < n and bool(self.inputs[f"downstream_free_{k + 1}"])
            out = self.gates[k].take(dt, p["release_gap_s"], self.chutes[k], free)
            self.chutes[k] -= out
            self.delivered[k] += out
            full = self.chutes[k] >= p["chute_capacity"]
            if full and not self.chute_was_full[k]:
                self.emit("chute_full", chute=k + 1)
            self.chute_was_full[k] = full
        out = self.manual_gate.take(dt, p["release_gap_s"], self.manual_q, bool(self.inputs["manual_free"]))
        self.manual_q -= out
        self.delivered_manual += out

        buffer = p["entry_buffer_units"]
        accepting = self.arrivals < buffer - 1 if not self.accepting else self.arrivals < buffer
        if accepting != self.accepting:
            self.emit("accepting_again" if accepting else "full")
            self.accepting = accepting

        if stopped:
            return
        if len(self.bags) >= self.trays and self.arrivals >= 1.0:
            self.state.set("blocked")
        elif self.bags or self.arrivals >= 1.0 or sum(self.chutes) or self.manual_q:
            self.state.set("running")
        else:
            self.state.set("idle")

    # ------------------------------------------------------------------ lectura
    def true_values(self) -> dict[str, Any]:
        rated_a = self.p["motor_kw"] * 1.9
        load = len(self.bags) / self.trays
        return {
            "inducted": self.inducted,
            "no_reads": self.no_reads,
            "recirculated": self.recirculated,
            "dumped": self.dumped,
            "on_loop": len(self.bags),
            "occupancy_pct": 100.0 * load,
            "delivered_1": self.delivered[0],
            "delivered_2": self.delivered[1],
            "delivered_3": self.delivered[2],
            "delivered_4": self.delivered[3],
            "delivered_manual": self.delivered_manual,
            "chute_bags": sum(self.chutes) + self.manual_q,
            "accepting": 1 if self.accepting else 0,
            "speed_actual_m_s": self.speed,
            "motor_current_a": (0.4 + 0.4 * load) * rated_a if self.speed > 0 else 0.0,
        }

    def kpis(self) -> dict[str, Any]:
        hours = self.t / 3600.0
        manual = self.no_reads + self.dumped
        return {
            "bags_per_h": self.inducted / hours if hours > 0 else None,
            "read_rate": 1.0 - self.no_reads / self.inducted if self.inducted else 1.0,
            "recirc_per_bag": self.recirculated / self.inducted if self.inducted else 0.0,
            "manual_rate": manual / self.inducted if self.inducted else 0.0,
        }

    def animation(self) -> dict[str, float]:
        s = self.state.current
        light = 3.0 if s == "fault" else 2.0 if s == "blocked" or not self.accepting else 1.0 if s == "running" else 0.0
        return {
            "loop_travel": self.travel,
            "on_loop": float(len(self.bags)),
            "chute_1": float(self.chutes[0]),
            "chute_2": float(self.chutes[1]),
            "chute_3": float(self.chutes[2]),
            "chute_4": float(self.chutes[3]),
            "chute_manual": float(self.manual_q),
            "stack_light": light,
        }
