"""Comportamiento de una flota finita de montacargas (B2): colas por ruta, viaje, descarga, regreso y salida escalonada."""

from __future__ import annotations

from typing import Any

from twin_runtime import EquipmentBehavior, StepContext

ROUTES = 10
MAX_VEHICLES = 12
EPS = 1e-6
BUSY_PHASES = ("loading", "hold", "out", "unloading", "back")
LOADED_PHASES = ("hold", "out", "unloading")


class ForkliftFleet(EquipmentBehavior):
    type = "forklift-fleet"
    DEFAULT_INPUTS = {
        **{f"inflow_{i}_upm": None for i in range(1, ROUTES + 1)},
        **{f"downstream_free_{i}": True for i in range(1, ROUTES + 1)},
    }

    def setup(self) -> None:
        self.rx = [0.0] * ROUTES  # piezas recibidas que aún no completan una estiba
        self.queue: list[list[float]] = [[] for _ in range(ROUTES)]  # instante en que cada estiba pidió montacargas, la primera es la más antigua
        self.pending = [0.0] * ROUTES  # piezas descargadas que el destino aún no recibe
        self.out = [0.0] * ROUTES  # piezas entregadas (contador)
        self.accepting = [True] * ROUTES
        self.vehicles = [self._new_vehicle() for _ in range(self.p["vehicles"])]
        self.down = 0
        self.trips = 0
        self.last_departure = -1e9
        self.saturated = False
        self.max_queue = 0
        self.busy_s = 0.0

    @staticmethod
    def _new_vehicle() -> dict[str, Any]:
        return {"phase": "idle", "route": -1, "t": 0.0, "dur": 0.0}

    def on_fault(self, fault_id: str) -> None:
        self.down += 1

    def on_fault_cleared(self, fault_id: str) -> None:
        self.down = max(0, self.down - 1)

    def _travel_s(self, route: int) -> float:
        return self.p[f"route_{route + 1}_m"] / self.p["speed_m_s"]

    def _set_phase(self, v: dict[str, Any], phase: str, dur: float) -> None:
        v["phase"], v["t"], v["dur"] = phase, dur, dur

    def _advance(self, v: dict[str, Any], dt: float, now: float) -> None:
        rem = dt
        while v["phase"] != "idle":
            if v["phase"] == "hold":
                if now - self.last_departure < self.p["headway_s"] - EPS:
                    return  # espera en la línea de parada: otro montacargas salió hace poco
                self.last_departure = now
                self._set_phase(v, "out", self._travel_s(v["route"]))
            take = min(rem, v["t"])
            v["t"] -= take
            rem -= take
            if v["t"] > EPS:
                return
            r = v["route"]
            if v["phase"] == "loading":
                self._set_phase(v, "hold", 0.0)
            elif v["phase"] == "out":
                self._set_phase(v, "unloading", self.p["unload_s"])
            elif v["phase"] == "unloading":
                self.pending[r] += self.p["pallet_pieces"]
                self.trips += 1
                self.emit("trip_completed", route=r + 1, trips=self.trips)
                self._set_phase(v, "back", self._travel_s(r))
            else:  # back
                v.update(self._new_vehicle())
            if rem <= EPS and v["phase"] not in ("hold", "idle"):
                return

    def update(self, ctx: StepContext) -> None:
        dt, now, p = ctx.dt, ctx.t, self.p
        x = p["pallet_pieces"]
        while len(self.vehicles) < p["vehicles"]:
            self.vehicles.append(self._new_vehicle())
        while len(self.vehicles) > p["vehicles"] and self.vehicles[-1]["phase"] == "idle":
            self.vehicles.pop()

        for r in range(ROUTES):
            inflow = self.inputs[f"inflow_{r + 1}_upm"]
            if inflow:
                self.rx[r] += max(0.0, float(inflow)) / 60.0 * dt
            while self.rx[r] >= x - EPS:
                self.rx[r] -= x
                self.queue[r].append(now)

        for v in self.vehicles:
            self._advance(v, dt, now)

        capacity = max(0, len(self.vehicles) - self.down)
        busy = sum(v["phase"] in BUSY_PHASES for v in self.vehicles)
        for v in self.vehicles:
            if v["phase"] != "idle" or busy >= capacity or not any(self.queue):
                continue
            r = min((i for i in range(ROUTES) if self.queue[i]), key=lambda i: (self.queue[i][0], i))
            self.queue[r].pop(0)
            v["route"] = r
            self._set_phase(v, "loading", p["load_s"])
            busy += 1
            self._advance(v, 0.0, now)
        queued = sum(len(q) for q in self.queue)
        self.max_queue = max(self.max_queue, queued)
        saturated = busy >= capacity and queued > 0
        if saturated and not self.saturated:
            self.emit("fleet_saturated", queued=queued)
        self.saturated = saturated
        waiting_now = sum(v["phase"] == "hold" for v in self.vehicles)
        if waiting_now and not getattr(self, "_was_waiting", 0):
            self.emit("vehicle_waiting", vehicles=waiting_now)
        self._was_waiting = waiting_now
        self.busy_s += busy * dt

        # entrega de las piezas descargadas al siguiente equipo, al ritmo máximo feed_upm y solo si lo recibe
        blocked = False
        for r in range(ROUTES):
            if self.pending[r] <= 0.0:
                continue
            if self.inputs[f"downstream_free_{r + 1}"]:
                amount = min(self.pending[r], p[f"route_{r + 1}_feed_upm"] / 60.0 * dt)
                self.pending[r] -= amount
                self.out[r] += amount
            else:
                blocked = True

        for r in range(ROUTES):
            in_system = len(self.queue[r]) + sum(1 for v in self.vehicles if v["route"] == r and v["phase"] in LOADED_PHASES + ("loading",))
            in_system += -int(-self.pending[r] // x) if self.pending[r] > EPS else 0
            self.accepting[r] = in_system < p["max_pallets_per_route"]

        if blocked:
            self.state.set("blocked")
        elif busy or queued:
            self.state.set("running")
        else:
            self.state.set("idle")

    def true_values(self) -> dict[str, Any]:
        busy = sum(v["phase"] in BUSY_PHASES for v in self.vehicles)
        n = len(self.vehicles)
        values: dict[str, Any] = {
            "vehicles_busy": busy,
            "vehicles_available": max(0, n - self.down - busy),
            "pallets_queued": sum(len(q) for q in self.queue),
            "pallets_in_transit": sum(v["phase"] in ("out", "unloading") for v in self.vehicles),
            "pieces_pending": round(sum(self.pending), 3),
            "trips_completed": self.trips,
            "utilization_pct": 100.0 * busy / n if n else 0.0,
        }
        for r in range(ROUTES):
            values[f"units_out_{r + 1}"] = round(self.out[r], 4)
            values[f"accepting_{r + 1}"] = 1 if self.accepting[r] else 0
        return values

    def kpis(self) -> dict[str, Any]:
        hours = self.t / 3600.0
        n = len(self.vehicles)
        return {
            "trips_per_h": self.trips / hours if hours > 0 else 0.0,
            "utilization": self.busy_s / (self.t * n) if self.t > 0 and n else 0.0,
            "max_queue": self.max_queue,
        }

    def animation(self) -> dict[str, float]:
        ch: dict[str, float] = {}
        for k in range(1, MAX_VEHICLES + 1):
            route, pos, loaded, wait = 0.0, 0.0, 0.0, 0.0
            if k <= len(self.vehicles):
                v = self.vehicles[k - 1]
                if v["phase"] != "idle":
                    route = v["route"] + 1.0
                    prog = 1.0 - v["t"] / v["dur"] if v["dur"] > 0 else 1.0
                    pos = {"loading": 0.0, "hold": 0.0, "out": 0.5 * prog, "unloading": 0.5, "back": 0.5 + 0.5 * prog}[v["phase"]]
                    loaded = 1.0 if v["phase"] in LOADED_PHASES else 0.0
                    wait = 1.0 if v["phase"] == "hold" else 0.0
            ch[f"v{k}_route"] = route
            ch[f"v{k}_pos"] = pos
            ch[f"v{k}_loaded"] = loaded
            ch[f"v{k}_wait"] = wait
        return ch
