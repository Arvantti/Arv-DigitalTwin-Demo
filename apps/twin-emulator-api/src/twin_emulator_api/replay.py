"""Grabación de una corrida de planta para reproducirla sin la API (sitio publicado en Cloudflare Pages).

La escena de planta simula por WebSocket contra la API. En el sitio publicado no hay API, así que la galería
reproduce una grabación de la operación normal: los mismos cuadros que mandaría el WebSocket, cada `interval_s`
segundos de simulación, con lo que la escena necesita (estado, fase, fallas, variables, canales de animación,
unidades seguidas una por una, líneas y enlaces) y sin los KPI ni la repartición de estados.

Para que el archivo pese poco, cada cuadro guarda solo lo que cambió desde el anterior: por equipo, las claves
(state, variables, animation, items…) que cambiaron; por enlace, los que cambiaron. El primer cuadro va completo y
la galería arma cada cuadro encima del anterior. De los enlaces solo se guardan los que dibujan tuberías (`keep_links`).

Formato: {"plant", "interval_s", "warmup_s", "frames": [{"t", "snapshot": {"equipment", "lines", "links"}, "events"}]}
"""

from __future__ import annotations

import math
from typing import Any

from twin_runtime.plant import PlantModel

SCENE_KEYS = ("state", "phase", "active_faults", "variables", "animation")


def _round(value: Any) -> Any:
    """Redondea a 3 cifras decimales (la escena no necesita más) y cambia NaN/inf por null."""
    if isinstance(value, float):
        return round(value, 3) if math.isfinite(value) else None
    if isinstance(value, dict):
        return {k: _round(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_round(v) for v in value]
    return value


def record_plant(
    model: PlantModel,
    *,
    warmup_s: float = 900.0,
    duration_s: float = 900.0,
    max_frames: int = 900,
    seed: int = 1,
    keep_links: set[str] | None = None,
) -> dict[str, Any]:
    """Corre la operación normal y guarda un cuadro cada `interval_s`.

    El calentamiento deja la planta ya cargada (maletas en las bandas, tanques con nivel) cuando arranca la reproducción."""
    interval = max(model.dt, duration_s / max_frames)
    plant = model.create(seed=seed, random_faults=False, horizon_s=warmup_s + duration_s + interval)
    while plant.t < warmup_s - 1e-9:
        plant.step()
    sent = len(plant.events)
    frames: list[dict[str, Any]] = []
    prev_eq: dict[str, dict[str, Any]] = {}
    prev_links: dict[str, Any] = {}
    next_t = plant.t
    end = plant.t + duration_s
    while plant.t <= end + 1e-9:
        if plant.t >= next_t - 1e-9:
            snap = _round(plant.snapshot())
            equipment = {}
            for eid, e in snap["equipment"].items():
                full = {k: e[k] for k in SCENE_KEYS}
                if "items" in e:
                    full["items"] = e["items"]
                before = prev_eq.get(eid, {})
                delta = {k: v for k, v in full.items() if k not in before or before[k] != v}
                if delta:
                    equipment[eid] = delta
                prev_eq[eid] = full
            links = {k: v for k, v in (snap.get("links") or {}).items() if keep_links is None or k in keep_links}
            changed_links = {k: v for k, v in links.items() if prev_links.get(k) != v}
            prev_links = links
            events = [_round(ev.to_dict()) for ev in plant.events[sent:]][-50:]
            sent = len(plant.events)
            lines = {k: {f: v.get(f) for f in ("name", "unit", "output_units", "output_per_h")} for k, v in snap["lines"].items()}
            frames.append({"t": snap["t"], "snapshot": {"equipment": equipment, "lines": lines, "links": changed_links}, "events": events})
            next_t += interval
        plant.step()
    return {"plant": model.id, "interval_s": interval, "warmup_s": warmup_s, "frames": frames}
