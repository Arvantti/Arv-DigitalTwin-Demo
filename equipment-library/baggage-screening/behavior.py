"""Comportamiento de la inspección de equipaje por niveles (B2): CT de nivel 1, revisión de imagen de nivel 2 y salida a nivel 3."""

from __future__ import annotations

from typing import Any

from twin_runtime import EquipmentBehavior, StepContext

XRAY_KV = 160.0


class _Gate:
    """Salida con separación mínima: a lo sumo una maleta cada `gap_s` (y una por paso si gap_s ≥ dt)."""

    def __init__(self) -> None:
        self.credit = 1.0

    def take(self, dt: float, gap_s: float, waiting: int, free: bool) -> int:
        self.credit = min(max(1.0, dt / gap_s), self.credit + dt / gap_s)
        out = 0
        while free and waiting > out and self.credit >= 1.0 - 1e-9:
            self.credit -= 1.0
            out += 1
        return out


class BaggageScreening(EquipmentBehavior):
    type = "baggage-screening"
    DEFAULT_INPUTS = {"inflow_upm": None, "downstream_free": True, "l3_free": True}

    def setup(self) -> None:
        self.arrivals = 0.0  # maletas en la banda de entrada (fracción incluida)
        self.admit_credit = 1.0
        self.tunnel: list[float] = []  # tiempo que le falta a cada maleta para la decisión de nivel 1
        self.pending: list[float] = []  # alarmas esperando revisión: tiempo hasta el punto de decisión
        self.reviews: list[list[float]] = []  # [revisión restante, tiempo hasta el punto de decisión]
        self.exit_q = 0
        self.l3_q = 0
        self.alarm_acc = 0.0
        self.clear_acc = 0.0
        self.scanned = 0
        self.l1_alarms = 0
        self.l2_cleared = 0
        self.l2_timeouts = 0
        self.cleared_out = 0
        self.to_l3 = 0
        self.accepting = True
        self.travel = 0.0
        self.blocked_s = 0.0
        self.cleared_gate = _Gate()
        self.l3_gate = _Gate()

    def on_command(self, name: str, args: dict[str, Any]) -> bool:
        if name == "set_operators":
            self.p["l2_operators"] = max(0, int(args["n"]))
            return True
        return False

    # ------------------------------------------------------------------ simulación
    def _decide_l2(self) -> None:
        self.clear_acc += self.p["l2_clear_pct"] / 100.0
        if self.clear_acc >= 1.0 - 1e-9:
            self.clear_acc -= 1.0
            self.l2_cleared += 1
            self.exit_q += 1
        else:
            self.l3_q += 1

    def _downstream_load(self) -> int:
        """Maletas que todavía pueden terminar en la salida de despejadas (túnel, nivel 2 y la salida misma)."""
        return self.exit_q + len(self.tunnel) + len(self.pending) + len(self.reviews)

    def update(self, ctx: StepContext) -> None:
        dt = ctx.dt
        p = self.p
        stopped = self.failures.stopping is not None
        link_down = self.failures.is_active("image_link_down")

        # llegadas a la banda de entrada (lo que llega se conserva aunque la entrada esté llena)
        inflow = self.inputs["inflow_upm"]
        self.arrivals += (p["nominal_inflow_upm"] if inflow is None else float(inflow)) / 60.0 * dt

        # admisión: una maleta cada 3.600 / max_bph s, si la salida tiene espacio
        interval = 3600.0 / p["max_bph"]
        self.admit_credit = min(max(1.0, dt / interval), self.admit_credit + dt / interval)
        if not stopped:
            while self.arrivals >= 1.0 - 1e-9 and self.admit_credit >= 1.0 - 1e-9 and self._downstream_load() < p["exit_buffer_units"]:
                self.arrivals -= 1.0
                self.admit_credit -= 1.0
                self.tunnel.append(float(p["scan_s"]))

        # túnel y decisión de nivel 1
        if not stopped:
            self.travel = (self.travel + 0.5 * dt) % 10.0
            self.tunnel = [r - dt for r in self.tunnel]
            while self.tunnel and self.tunnel[0] <= 1e-9:
                self.tunnel.pop(0)
                self.scanned += 1
                self.alarm_acc += p["l1_alarm_pct"] / 100.0
                if self.alarm_acc >= 1.0 - 1e-9:
                    self.alarm_acc -= 1.0
                    self.l1_alarms += 1
                    if link_down:
                        self.l3_q += 1
                    else:
                        self.pending.append(float(p["l2_timeout_s"]))
                else:
                    self.exit_q += 1

        # nivel 2: revisión de imagen con tiempo límite
        still: list[list[float]] = []
        for rev in self.reviews:
            rev[0] -= dt
            rev[1] -= dt
            if rev[0] <= 1e-9:
                self._decide_l2()
            elif rev[1] <= 1e-9 or link_down:
                self.l2_timeouts += 1
                self.l3_q += 1
            else:
                still.append(rev)
        self.reviews = still
        self.pending = [d - dt for d in self.pending]
        while self.pending and (self.pending[0] <= 1e-9 or link_down):
            self.pending.pop(0)
            self.l2_timeouts += 1
            self.l3_q += 1
        while self.pending and len(self.reviews) < int(p["l2_operators"]):
            self.reviews.append([float(p["l2_review_s"]), self.pending.pop(0)])

        # salidas
        downstream = bool(self.inputs["downstream_free"])
        n = self.cleared_gate.take(dt, p["release_gap_s"], self.exit_q, downstream)
        self.exit_q -= n
        self.cleared_out += n
        n = self.l3_gate.take(dt, p["release_gap_s"], self.l3_q, bool(self.inputs["l3_free"]))
        self.l3_q -= n
        self.to_l3 += n
        for _ in range(n):
            self.emit("bag_to_l3")

        # fotocelda de entrada con histéresis de una maleta
        buffer = p["entry_buffer_units"]
        accepting = self.arrivals < buffer - 1 if not self.accepting else self.arrivals < buffer
        if accepting != self.accepting:
            self.emit("accepting_again" if accepting else "full")
            self.accepting = accepting

        if stopped:
            return
        if self.exit_q >= p["exit_buffer_units"] and not downstream:
            self.state.set("blocked")
            self.blocked_s += dt
        elif self.tunnel or self.exit_q or self.l3_q or self.pending or self.reviews or self.arrivals >= 1.0:
            self.state.set("running")
        else:
            self.state.set("idle")

    # ------------------------------------------------------------------ lectura
    def true_values(self) -> dict[str, Any]:
        return {
            "bags_scanned": self.scanned,
            "l1_alarms": self.l1_alarms,
            "l2_cleared": self.l2_cleared,
            "l2_timeouts": self.l2_timeouts,
            "cleared_out": self.cleared_out,
            "to_l3": self.to_l3,
            "entry_queue": int(self.arrivals + 1e-9),
            "in_tunnel": len(self.tunnel),
            "l2_queue": len(self.pending) + len(self.reviews),
            "exit_queue": self.exit_q,
            "accepting": 1 if self.accepting else 0,
            "xray_kv": 0.0 if self.failures.is_active("xray_fault") else XRAY_KV,
        }

    def kpis(self) -> dict[str, Any]:
        hours = self.t / 3600.0
        return {
            "bags_per_h": self.scanned / hours if hours > 0 else None,
            "l1_alarm_rate": self.l1_alarms / self.scanned if self.scanned else 0.0,
            "l3_rate": self.to_l3 / self.scanned if self.scanned else 0.0,
            "blocked_pct": self.blocked_s / self.t if self.t > 0 else 0.0,
        }

    def animation(self) -> dict[str, float]:
        s = self.state.current
        light = 3.0 if s == "fault" else 2.0 if s == "blocked" else 1.0 if s == "running" else 0.0
        return {
            "belt_travel": self.travel,
            "in_tunnel": float(len(self.tunnel)),
            "entry_queue": float(min(32, int(self.arrivals + 1e-9))),
            "xray_on": 1.0 if self.tunnel and s != "fault" else 0.0,
            "stack_light": light,
        }
