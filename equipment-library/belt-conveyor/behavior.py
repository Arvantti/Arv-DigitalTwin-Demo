"""Comportamiento de una banda transportadora (B2): transporte, acumulación y bloqueo.

Cada unidad se sigue una por una sobre el recorrido real de la banda (con sus subidas y bajadas). Reglas físicas:
- separación mínima `pitch_m` entre unidades: una que alcanza a la de adelante con velocidad relativa cuenta como
  choque (`collisions`) y desde ahí sigue pegada a ella;
- fricción: una unidad sube o baja con la banda mientras la pendiente no supere el ángulo de fricción
  (tan θ ≤ friction_coef). En una subida más empinada resbala y se queda detenida al pie de la rampa (`slip`),
  frenando a las de atrás; en una bajada más empinada se desliza más rápido que la banda (hasta el doble).
- control por zonas con fotoceldas (`zone_control`): la banda va partida en zonas del largo de una unidad, cada una
  con su fotocelda. Una zona para cuando la de adelante está ocupada y arranca cuando se libera, así las unidades se
  acumulan sin tocarse (sin choques, ni contra la cola ni contra una maleta resbalada). La fotocelda de descarga
  para la zona de cabeza mientras la siguiente máquina no recibe.
"""

from __future__ import annotations

import math
from typing import Any

from twin_runtime import EquipmentBehavior, StepContext

IMPACT_M_S = 0.05  # velocidad relativa mínima para contar un choque


def belt_profile(p: dict[str, Any]) -> list[tuple[float, float]]:
    """Puntos (x en planta, altura) de la superficie, de la entrada a la descarga; igual que geometry.ts."""
    length = float(p["length_m"])
    h_in = float(p["height_m"])
    h_out = max(0.2, h_in + float(p.get("rise_m", 0.0)))
    crest = float(p.get("crest_height_m", 0.0))
    tan_r = math.tan(math.radians(min(35.0, max(5.0, float(p.get("ramp_deg", 15.0))))))
    pts = [(0.0, h_in)]
    if crest > max(h_in, h_out):
        up = (crest - h_in) / tan_r
        down = (crest - h_out) / tan_r
        k = min(1.0, length * 0.9 / (up + down))
        pts += [(up * k, crest), (length - down * k, crest)]
    pts.append((length, h_out))
    return pts


class BeltConveyor(EquipmentBehavior):
    type = "belt-conveyor"
    DEFAULT_INPUTS = {"inflow_upm": None, "downstream_free": True}

    def setup(self) -> None:
        self.items: list[float] = []  # posición de cada unidad sobre el recorrido (m), la primera es la más adelantada
        self.touching: list[bool] = []  # pegada a la de adelante
        self.slipping: list[bool] = []  # resbalada al pie de una subida
        self.arrivals = 0.0
        self.delivered = 0
        self.collisions = 0
        self.travel = 0.0
        self.speed = self.p["speed_m_s"]
        self.accepting = True
        self.blocked_s = 0.0
        self.zone_stopped = False
        self._build_path()

    def _path_key(self) -> tuple[Any, ...]:
        return tuple(self.p.get(k) for k in ("length_m", "height_m", "rise_m", "crest_height_m", "ramp_deg"))

    def _build_path(self) -> None:
        """Tramos del recorrido: (inicio sobre el recorrido, largo, tan θ) con θ positivo de subida."""
        self._key = self._path_key()
        pts = belt_profile(self.p)
        self.segments: list[tuple[float, float, float]] = []
        s = 0.0
        for (x0, y0), (x1, y1) in zip(pts, pts[1:], strict=False):
            dx = x1 - x0
            if dx <= 1e-9:
                continue
            ds = math.hypot(dx, y1 - y0)
            self.segments.append((s, ds, (y1 - y0) / dx))
            s += ds
        self.path_length = s
        self.max_slope_deg = max((math.degrees(math.atan(abs(t))) for _, _, t in self.segments), default=0.0)

    @property
    def capacity(self) -> int:
        return int(self.path_length // self.p["pitch_m"]) + 1

    def on_command(self, name: str, args: dict[str, Any]) -> bool:
        if name == "set_speed":
            self.p["speed_m_s"] = max(0.0, float(args["m_s"]))
            return True
        return False

    def _segment(self, pos: float) -> tuple[float, float, float]:
        for seg in self.segments:
            if pos < seg[0] + seg[1] - 1e-9:
                return seg
        return self.segments[-1]

    def _speed_at(self, pos: float, v: float) -> tuple[float, bool]:
        """Velocidad propia de una unidad en esa posición y si resbala (no puede subir)."""
        mu = float(self.p.get("friction_coef", 0.45))
        _, _, tan_t = self._segment(pos)
        if tan_t > mu:
            return 0.0, True
        if -tan_t > mu:
            return min(2.0 * max(v, 0.1), max(v, 0.1) * (1.0 + 4.0 * (-tan_t - mu))), False
        return v, False

    def update(self, ctx: StepContext) -> None:
        dt = ctx.dt
        p = self.p
        if self._path_key() != self._key:  # set_param cambió el recorrido
            self._build_path()
        stopped = self.failures.stopping is not None
        end, pitch = self.path_length, p["pitch_m"]
        downstream = bool(self.inputs["downstream_free"])
        zones = bool(p.get("zone_control", False))
        # fotocelda de descarga: con la cabeza tapada y la salida ocupada, la zona de cabeza queda detenida
        self.zone_stopped = zones and not downstream and bool(self.items) and self.items[0] >= end - 1e-9
        v = 0.0 if stopped else p["speed_m_s"] * (0.7 if self.failures.is_active("belt_misalignment") else 1.0)
        self.speed = v
        self.travel = (self.travel + v * dt) % 10.0

        # avance: la primera hasta la descarga; las demás respetan la separación mínima
        moved: list[float] = []
        speeds: list[float] = []
        for i, pos in enumerate(self.items):
            own, slips = self._speed_at(pos, v)
            if slips:
                if not self.slipping[i]:
                    self.emit("slip", position_m=round(pos, 2))
                self.slipping[i] = True  # se queda detenida al pie de la rampa
            else:
                self.slipping[i] = False
            limit = end if i == 0 else moved[-1] - pitch
            target = pos + own * dt
            new = min(target, max(pos, limit))
            limited = target > new + 1e-9
            # con zonas, la fotocelda de la zona de adelante la detiene antes del contacto
            if limited and not zones and not self.touching[i] and i > 0 and own - speeds[-1] > IMPACT_M_S:
                self.collisions += 1
            self.touching[i] = limited and i > 0
            moved.append(new)
            speeds.append((new - pos) / dt if dt > 0 else 0.0)
        self.items = moved
        while self.items and self.items[0] >= end - 1e-9 and downstream and not stopped:
            self.items.pop(0)
            self.touching.pop(0)
            self.slipping.pop(0)
            if self.touching:
                self.touching[0] = False
            self.delivered += 1

        # llegadas
        inflow = self.inputs["inflow_upm"]
        inflow = p["nominal_inflow_upm"] if inflow is None else float(inflow)
        buffer = float(p["entry_buffer_units"])
        self.arrivals += inflow / 60.0 * dt
        while self.arrivals >= 1.0 and (not self.items or self.items[-1] >= pitch - 1e-9):
            self.items.append(0.0)
            self.touching.append(False)
            self.slipping.append(False)
            self.arrivals -= 1.0
        accepting = self.arrivals < buffer
        if accepting != self.accepting:
            self.emit("accepting_again" if accepting else "full")
            self.accepting = accepting
        if not accepting:
            # la máquina anterior queda esperando. Las que ya soltó antes de ver el aviso (las señales llegan con un paso
            # de retraso, y en una banda de unión pueden ser dos máquinas) esperan en la entrada: no se pierden.
            self.arrivals = min(self.arrivals, buffer + 2.0)

        if stopped:
            return
        at_head = bool(self.items) and self.items[0] >= end - 1e-9
        if at_head and not downstream:
            self.state.set("blocked")
            self.blocked_s += dt
        elif self.items or inflow > 0:
            self.state.set("running")
        else:
            self.state.set("idle")

    def _accumulated(self) -> int:
        n = 0
        expected = self.path_length
        for pos in self.items:
            if abs(pos - expected) > 1e-6:
                break
            n += 1
            expected -= self.p["pitch_m"]
        return n

    def true_values(self) -> dict[str, Any]:
        load = len(self.items) / self.capacity
        rated_a = self.p["motor_kw"] * 1.9  # ≈ corriente nominal a 440 V
        # en las subidas el motor también levanta la carga
        lift = sum(max(0.0, self._segment(pos)[2]) for pos in self.items) / self.capacity
        return {
            "items_on_belt": len(self.items),
            "accumulated": self._accumulated(),
            "delivered": self.delivered,
            "occupancy_pct": 100.0 * load,
            "accepting": 1 if self.accepting else 0,
            "collisions": self.collisions,
            "slipping": sum(self.slipping),
            "photo_eye": 1 if self.items and self.items[0] >= self.path_length - self.p["pitch_m"] / 2 else 0,
            "zone_stopped": 1 if self.zone_stopped else 0,
            "path_length_m": self.path_length,
            "max_slope_deg": self.max_slope_deg,
            "speed_actual_m_s": self.speed,
            "motor_current_a": (0.35 + 0.45 * load + 0.3 * lift) * rated_a if self.speed > 0 else 0.0,
        }

    def kpis(self) -> dict[str, Any]:
        minutes = self.t / 60.0
        return {
            "throughput_upm": self.delivered / minutes if minutes > 0 else None,
            "blocked_pct": self.blocked_s / self.t if self.t > 0 else 0.0,
            "collisions_per_h": self.collisions / (minutes / 60.0) if minutes > 0 else 0.0,
        }

    def animation(self) -> dict[str, float]:
        return {
            "belt_travel": self.travel,
            "items_count": float(len(self.items)),
            "accumulated": float(self._accumulated()),
            "eye_blocked": 1.0 if self.zone_stopped else 0.0,
        }

    def tracked_items(self) -> list[float]:
        return [round(pos, 2) for pos in self.items[:400]]  # lo que la escena alcanza a dibujar
