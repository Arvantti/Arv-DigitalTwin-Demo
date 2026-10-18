"""Comportamiento del secador desecante (B3): tolva FIFO por porciones y cinética de secado.

Cada porción de pellet tiende a la humedad de equilibrio con una constante de tiempo que crece
si el aire está más frío que la consigna o si el punto de rocío sube. La salida entrega primero
la porción más antigua (la del fondo del cono).
"""

from __future__ import annotations

import math
from collections import deque
from dataclasses import dataclass
from typing import Any

from twin_runtime import EquipmentBehavior, StepContext
from twin_runtime.primitives import FirstOrderLag

EQUILIBRIUM_PCT = 0.01
AMBIENT_C = 25.0
PARCELS = 40  # porciones en una tolva llena
LOADER_ON_PCT = 85.0
LOADER_OFF_PCT = 98.0
REGEN_SHARE = 0.4


@dataclass
class Parcel:
    kg: float
    moisture: float


class DesiccantDryer(EquipmentBehavior):
    type = "desiccant-dryer"
    DEFAULT_INPUTS = {
        "outflow_kg_h": None,  # None = capacidad nominal
        "resin_available": True,
        "inlet_moisture_pct": None,  # None = parámetro inlet_moisture_pct
    }

    def setup(self) -> None:
        p = self.p
        self.capacity_kg = p["throughput_kg_h"] * p["residence_h"]
        self.parcel_kg = self.capacity_kg / PARCELS
        self.air = FirstOrderLag(tau_s=600.0, initial=p["dry_temp_c"])
        self.dew = FirstOrderLag(tau_s=3600.0, initial=p["dew_point_c"])
        # Arranca en régimen: 90 % de nivel, cada porción con la humedad que tendría tras su edad
        # a caudal nominal (la del fondo es la más antigua).
        self.hopper: deque[Parcel] = deque()
        n = int(PARCELS * 0.9)
        tau = p["drying_tau_h"]
        for i in range(n):
            age_h = p["residence_h"] * (n - i) / PARCELS
            self.hopper.append(Parcel(self.parcel_kg, self._dried(p["inlet_moisture_pct"], age_h, tau)))
        self.loading = False
        self.out_kg = 0.0
        self.last_out_moisture = self.hopper[0].moisture
        self.recent: deque[tuple[float, float]] = deque()  # (t, kg) del último cuarto de hora
        self.power = 0.0
        self.energy = 0.0
        self.tower = 1
        self.tower_t = 0.0
        self.over_kg = 0.0
        self.max_moisture = 0.0
        self.flags: set[str] = set()

    @staticmethod
    def _dried(m0: float, hours: float, tau_h: float) -> float:
        return EQUILIBRIUM_PCT + (m0 - EQUILIBRIUM_PCT) * math.exp(-hours / tau_h)

    # ------------------------------------------------------------------ propiedades
    @property
    def mass(self) -> float:
        return sum(pc.kg for pc in self.hopper)

    @property
    def level_pct(self) -> float:
        return 100.0 * self.mass / self.capacity_kg

    def tau_h(self) -> float:
        p = self.p
        temp_factor = 2.0 ** ((p["dry_temp_c"] - self.air.value) / 12.0)
        dew_factor = 1.0 + max(0.0, self.dew.value - p["dew_point_c"]) / 10.0
        return p["drying_tau_h"] * max(1.0, temp_factor) * dew_factor

    # ------------------------------------------------------------------ comandos
    def on_command(self, name: str, args: dict[str, Any]) -> bool:
        if name == "refill":
            self._load(float(args["kg"]))
        elif name == "maintenance":
            self.state.set("maintenance" if args.get("active", True) else "idle")
        else:
            return False
        return True

    def _load(self, kg: float) -> None:
        inlet = self.inputs.get("inlet_moisture_pct")
        m0 = self.p["inlet_moisture_pct"] if inlet is None else float(inlet)
        room = self.capacity_kg - self.mass
        kg = min(kg, room)
        while kg > 1e-9:
            last = self.hopper[-1] if self.hopper else None
            if last is not None and last.kg < self.parcel_kg - 1e-9:
                # la porción de arriba aún no está llena: se mezcla (humedad ponderada por masa)
                add = min(kg, self.parcel_kg - last.kg)
                last.moisture = (last.moisture * last.kg + m0 * add) / (last.kg + add)
                last.kg += add
            else:
                add = min(kg, self.parcel_kg)
                self.hopper.append(Parcel(add, m0))
            kg -= add

    # ------------------------------------------------------------------ simulación
    def update(self, ctx: StepContext) -> None:
        dt = ctx.dt
        p = self.p
        s = self.state.current
        active = s not in ("maintenance", "fault")
        heater_ok = active and not self.failures.is_active("process_heater_failure")
        self.air.step(p["dry_temp_c"] if heater_ok else AMBIENT_C + 5.0, dt)
        regen_ok = active and not self.failures.is_active("regeneration_failure")
        self.dew.step(p["dew_point_c"] if regen_ok else p["ambient_dew_c"], dt)

        # secado de cada porción
        decay = math.exp(-dt / 3600.0 / self.tau_h())
        for pc in self.hopper:
            pc.moisture = EQUILIBRIUM_PCT + (pc.moisture - EQUILIBRIUM_PCT) * decay

        # cargador al vacío con histéresis
        level = self.level_pct
        loader_ok = active and bool(self.inputs["resin_available"]) and not self.failures.is_active("loader_failure")
        if level < LOADER_ON_PCT:
            self.loading = True
        elif level >= LOADER_OFF_PCT:
            self.loading = False
        if self.loading and loader_ok:
            self._load(p["loader_kg_h"] * dt / 3600.0)

        # salida por el fondo
        want = self.inputs["outflow_kg_h"]
        want = p["throughput_kg_h"] if want is None else max(0.0, float(want))
        need = want * dt / 3600.0 if active else 0.0
        taken = 0.0
        water = 0.0
        while need > 1e-9 and self.hopper:
            pc = self.hopper[0]
            take = min(need, pc.kg)
            pc.kg -= take
            need -= take
            taken += take
            water += take * pc.moisture
            if pc.kg <= 1e-9:
                self.hopper.popleft()
        if taken > 0:
            m = water / taken
            self.last_out_moisture = m
            self.out_kg += taken
            self.max_moisture = max(self.max_moisture, m)
            if m > p["moisture_limit_pct"]:
                self.over_kg += taken
        elif self.hopper:
            self.last_out_moisture = self.hopper[0].moisture
        self.recent.append((self.t, taken))
        while self.recent and self.recent[0][0] < self.t - 900.0:
            self.recent.popleft()

        # estado
        if active:
            if want > 0 and not self.hopper:
                self.state.set("starved")
            else:
                self.state.set("running" if taken > 0 else "idle")

        # torres y energía
        self.tower_t += dt
        if self.tower_t >= p["tower_cycle_h"] * 3600.0:
            self.tower_t = 0.0
            self.tower = 2 if self.tower == 1 else 1
            self.emit("tower_switched", tower=self.tower)
        load = min(1.0, self.throughput / p["throughput_kg_h"]) if p["throughput_kg_h"] else 0.0
        regen = REGEN_SHARE * p["heater_kw"] if self.tower_t < p["tower_cycle_h"] * 1800.0 else 0.0
        self.power = (p["heater_kw"] * (0.35 + 0.65 * load) if heater_ok else 0.0) + (regen if regen_ok else 0.0) + 1.5 * active
        self.energy += self.power * dt / 3600.0

        self._edge("hopper_low", self.level_pct < 10.0)
        wet = taken > 0 and self.last_out_moisture > p["moisture_limit_pct"]
        if wet and "wet" not in self.flags:
            value = round(self.last_out_moisture, 3)
            self.emit("quality_alarm", variable="outlet_moisture_pct", value=value, limit=p["moisture_limit_pct"])
        (self.flags.add if wet else self.flags.discard)("wet")

    def _edge(self, event: str, condition: bool) -> None:
        if condition and event not in self.flags:
            self.flags.add(event)
            self.emit(event)
        elif not condition:
            self.flags.discard(event)

    @property
    def throughput(self) -> float:
        if not self.recent:
            return 0.0
        span = max(self.recent[-1][0] - self.recent[0][0] + 1e-9, 1.0)
        return sum(kg for _, kg in self.recent) / span * 3600.0 if len(self.recent) > 1 else 0.0

    # ------------------------------------------------------------------ lectura
    def true_values(self) -> dict[str, Any]:
        thr = self.throughput
        inlet = self.inputs.get("inlet_moisture_pct")
        return {
            "hopper_kg": self.mass,
            "hopper_level_pct": self.level_pct,
            "outlet_moisture_pct": self.last_out_moisture,
            "inlet_moisture_pct": self.p["inlet_moisture_pct"] if inlet is None else float(inlet),
            "dew_point_c": self.dew.value,
            "process_air_c": self.air.value,
            "throughput_kg_h": thr,
            "residence_h": self.mass / thr if thr > 1e-6 else None,
            "resin_out_kg": self.out_kg,
            "power_kw": self.power,
            "energy_kwh": self.energy,
            "active_tower": self.tower,
            "loader_on": 1 if self.loading else 0,
        }

    def kpis(self) -> dict[str, Any]:
        return {
            "kwh_per_kg": self.energy / self.out_kg if self.out_kg > 0 else None,
            "over_limit_pct": self.over_kg / self.out_kg if self.out_kg > 0 else 0.0,
            "max_outlet_moisture_pct": self.max_moisture if self.out_kg > 0 else None,
        }

    def animation(self) -> dict[str, float]:
        s = self.state.current
        warn = s == "starved" or "wet" in self.flags or bool(self.failures.active)
        light = 3.0 if s == "fault" else 2.0 if warn else 1.0
        return {
            "level": self.level_pct / 100.0,
            "loader": 1.0 if self.loading and not self.failures.is_active("loader_failure") else 0.0,
            "heater_glow": max(0.0, min(1.0, (self.air.value - AMBIENT_C) / max(1.0, self.p["dry_temp_c"] - AMBIENT_C))),
            "dew_indicator": max(0.0, min(1.0, (self.dew.value + 60.0) / 80.0)),
            "tower": 0.0 if self.tower == 1 else 1.0,
            "alarm_light": light,
        }
