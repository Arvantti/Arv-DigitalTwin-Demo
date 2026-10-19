"""Comportamiento de una estación en línea con fotoceldas (B2): cola, puesto de trabajo, salida, atascos y paro manual."""

from __future__ import annotations

from collections import deque
from typing import Any

from twin_runtime import EquipmentBehavior, StepContext


class InlineStation(EquipmentBehavior):
    type = "inline-station"
    DEFAULT_INPUTS = {"inflow_upm": None, "downstream_free": True}

    def setup(self) -> None:
        self.arrivals = 0.0
        self.queue: deque[float] = deque()  # hora de llegada de cada unidad en la cola
        # cada puesto: etapa (in = va a la fotocelda de posición, work = operación, out = va a la salida, done = espera salida)
        self.slots: list[dict[str, Any]] = []
        self.exit = 0
        self.release_wait = 0.0
        self.arrived = 0
        self.processed = 0
        self.released = 0
        self.jams = 0
        self.manual_stops = 0
        self.jam_acc = 0.0
        self.stop_active = False
        self.stop_left: float | None = None
        self.accepting = True
        self.busy_s = 0.0
        self.capacity_s = 0.0
        self.wait_sum_s = 0.0
        self.started = 0

    # ------------------------------------------------------------------ comandos
    def on_command(self, name: str, args: dict[str, Any]) -> bool:
        if name == "manual_stop":
            if not self.stop_active:
                self.stop_active = True
                self.manual_stops += 1
                self.emit("manual_stop")
            d = args.get("duration_s")
            self.stop_left = float(d) if d is not None else None
            return True
        if name == "resume":
            self._resume()
            return True
        if name == "reset":
            for fid in self.failures.clear("jam"):
                self._clear_fault(fid)
            return True
        if name == "set_operators":
            self.p["operators"] = max(0, int(args["n"]))
            return True
        return False

    def on_fault_cleared(self, fault_id: str) -> None:
        if fault_id == "jam":
            self.emit("jam_cleared")

    def _jam_left(self) -> float:
        f = self.failures.active.get("jam")
        return max(0.0, f.remaining_s) if f is not None else 0.0

    def _resume(self) -> None:
        if self.stop_active:
            self.stop_active = False
            self.stop_left = None
            self.emit("manual_resume")

    # ------------------------------------------------------------------ ciclo
    def _positions(self) -> int:
        return 1 if self.p["mode"] == "automatic" else int(self.p["operators"])

    def _work_s(self) -> float:
        return float(self.p["cycle_s"] if self.p["mode"] == "automatic" else self.p["handle_s"])

    def _jams_next(self) -> bool:
        pct = float(self.p["jam_pct"]) / 100.0
        if pct <= 0.0:
            return False
        if self.p["jam_random"]:
            return self.rng.random() < pct
        self.jam_acc += pct
        if self.jam_acc >= 1.0 - 1e-9:
            self.jam_acc -= 1.0
            return True
        return False

    def update(self, ctx: StepContext) -> None:
        dt = ctx.dt
        p = self.p
        stopping = self.failures.stopping
        jammed = self.failures.is_active("jam")
        # el atasco solo para el puesto; una falla de la estación (motor, fotocelda) la para entera
        faulted = stopping is not None and stopping.id != "jam"

        if self.stop_active and self.stop_left is not None:
            self.stop_left -= dt
            if self.stop_left <= 1e-9:
                self._resume()
        halted = faulted or self.stop_active

        # llegadas: lo que la banda anterior ya soltó entra a la cola si hay sitio
        inflow = self.inputs["inflow_upm"]
        self.arrivals += (p["nominal_inflow_upm"] if inflow is None else float(inflow)) / 60.0 * dt
        cap = int(p["queue_capacity"])
        while self.arrivals >= 1.0 - 1e-9 and len(self.queue) < cap:
            self.arrivals -= 1.0
            self.queue.append(self.t)
            self.arrived += 1
        if len(self.queue) >= cap:
            self.arrivals = min(self.arrivals, 1.0)

        downstream = bool(self.inputs["downstream_free"])
        # la salida es una zona propia: despacha aunque el puesto esté atascado, pero no con la estación parada.
        # Entre una unidad y la siguiente deja release_gap_s: la banda siguiente alcanza a avisar si ya no recibe.
        self.release_wait = max(0.0, self.release_wait - dt)
        if not halted and self.exit and downstream and self.release_wait <= 1e-9:
            self.exit = 0
            self.released += 1
            self.release_wait = float(p["release_gap_s"])

        positions = self._positions()
        if not halted:
            self.capacity_s += positions * dt
            self.busy_s += len(self.slots) * dt
        if not halted and not jammed:
            self._advance(dt)
            while self.queue and len(self.slots) < positions:
                arrived = self.queue.popleft()
                self.wait_sum_s += max(0.0, self.t - arrived)
                self.started += 1
                jam = self._jams_next()
                left = float(p["index_s"]) + (float(p["jam_detect_s"]) if jam else 0.0)
                self.slots.append({"stage": "in", "left": left, "jam": jam})

        accepting = len(self.queue) < cap and not halted
        if accepting != self.accepting:
            self.emit("accepting_again" if accepting else "full")
            self.accepting = accepting

        if stopping is not None:
            return
        if self.stop_active:
            self.state.set("off")
        elif any(s["stage"] == "done" for s in self.slots) and self.exit:
            self.state.set("blocked")
        elif self.queue or self.slots or self.exit:
            self.state.set("running")
        else:
            self.state.set("idle")

    def _advance(self, dt: float) -> None:
        p = self.p
        for s in self.slots:
            if s["stage"] == "done":
                continue
            s["left"] -= dt
            if s["left"] > 1e-9:
                continue
            if s["stage"] == "in":
                if s["jam"]:
                    # el vigilante no vio llegar la unidad a la fotocelda de posición: parada automática
                    s["jam"] = False
                    self.jams += 1
                    self.emit("jam_detected")
                    self.failures.trigger("jam", float(p["jam_clear_s"]))
                    self._raise_fault("jam")
                    s["stage"], s["left"] = "work", self._work_s()
                    return
                s["stage"], s["left"] = "work", self._work_s()
            elif s["stage"] == "work":
                self.processed += 1
                s["stage"], s["left"] = "out", float(p["index_s"])
            elif s["stage"] == "out":
                s["stage"], s["left"] = "done", 0.0
        # la unidad terminada más antigua pasa a la fotocelda de salida si está libre
        for s in self.slots:
            if s["stage"] == "done" and not self.exit:
                self.exit = 1
                s["stage"] = "gone"
        self.slots = [s for s in self.slots if s["stage"] != "gone"]

    # ------------------------------------------------------------------ lectura
    def true_values(self) -> dict[str, Any]:
        return {
            "queue": len(self.queue),
            "in_process": len(self.slots),
            "arrived": self.arrived,
            "processed": self.processed,
            "released": self.released,
            "jams": self.jams,
            "manual_stops": self.manual_stops,
            "accepting": 1 if self.accepting else 0,
            "pe_queue_full": 1 if len(self.queue) >= int(self.p["queue_capacity"]) else 0,
            "pe_position": 1 if any(s["stage"] in ("work", "done") for s in self.slots) else 0,
            "pe_exit": self.exit,
            "jam_alarm": 1 if self.failures.is_active("jam") else 0,
            "jam_time_left_s": self._jam_left(),
        }

    def kpis(self) -> dict[str, Any]:
        hours = self.t / 3600.0
        return {
            "units_per_h": self.processed / hours if hours > 0 else None,
            "utilization": self.busy_s / self.capacity_s if self.capacity_s > 0 else 0.0,
            "jams_per_h": self.jams / hours if hours > 0 else 0.0,
            "avg_wait_s": self.wait_sum_s / self.started if self.started else 0.0,
        }

    def animation(self) -> dict[str, float]:
        s = self.state.current
        progress = 0.0
        for slot in self.slots:
            if slot["stage"] == "work":
                progress = max(0.0, min(1.0, 1.0 - slot["left"] / max(self._work_s(), 1e-6)))
                break
            if slot["stage"] in ("out", "done"):
                progress = 1.0
                break
        tv = self.true_values()
        if s in ("fault", "off"):
            light = 3.0
        elif s == "blocked" or not self.accepting:
            light = 2.0
        elif s == "running":
            light = 1.0
        else:
            light = 0.0
        return {
            "queue": float(len(self.queue)),
            "in_process": float(len(self.slots)),
            "progress": progress,
            "at_exit": float(self.exit),
            "eye_queue": float(tv["pe_queue_full"]),
            "eye_position": float(tv["pe_position"]),
            "eye_exit": float(tv["pe_exit"]),
            "stack_light": light,
        }
