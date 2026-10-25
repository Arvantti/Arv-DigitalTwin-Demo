"""Programación de producción de la demo: pedidos inventados y secuenciador de referencia (fase E, decisión D68).

Plan en docs/datos-reales.md y docs/programacion.md. Dos piezas:

- **Generador de pedidos.** Con la demanda del catálogo (`catalog/demand.yaml`) inventa los pedidos de cada fecha de
  entrega. La semilla es (planta, fecha), así que el pedido del 5 de noviembre es el mismo hoy y mañana: la ventana
  de hoy a +30 días siempre está llena y el pasado no cambia. Los pedidos llenan `load_pct` de la capacidad; unos
  son urgentes (poco plazo) y otros salen tarde a propósito (el insumo llega tarde), al azar con la misma semilla.
- **Secuenciador de referencia.** Despacho por lista, de etapa en etapa de la ruta: cada equipo libre toma la orden
  lista con mayor prioridad y fecha de entrega más próxima, y prefiere la que no exige cambio de herramental o de
  color. Respeta los turnos, las paradas aleatorias de cada equipo y el herramental montado (setup.yaml). Es la línea
  base contra la que se medirá Fractal (fase F); devuelve el mismo contrato `orders` → `schedule`.

El plan es una función pura de (planta, rango de fechas): no depende de la hora actual. Solo un pedido urgente usa
"ahora": lo ejecutado antes de ahora queda congelado y el resto se vuelve a planear.
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from typing import Any

from .catalog import Catalog

EPOCH = datetime(2026, 1, 5)  # lunes; origen del tiempo local y arranque de la operación de la demo
DAY = 86400.0
WARMUP_DAYS = 21  # días que el plan corre antes de un rango anterior a EPOCH, para que la planta no arranque vacía
FIRST_OUTPUT_S = 1800.0  # una etapa continua entrega su primer material a la siguiente después de 30 min
PRIORITY_URGENT, PRIORITY_RUSH, PRIORITY_NORMAL = 1, 2, 3


# ------------------------------------------------------------------ tiempo local
def to_s(dt: datetime) -> float:
    """Segundos desde EPOCH (hora local de la planta, sin zona)."""
    if dt.tzinfo is not None:
        raise ValueError("to_s espera una hora local sin zona")
    return (dt - EPOCH).total_seconds()


def day_s(d: date) -> float:
    return to_s(datetime(d.year, d.month, d.day))


def _hm(text: str) -> float:
    h, m = text.split(":")
    return int(h) * 3600.0 + int(m) * 60.0


def _tz(text: str) -> timezone:
    sign = -1 if text.startswith("-") else 1
    h, m = text[1:].split(":")
    return timezone(sign * timedelta(hours=int(h), minutes=int(m)))


class Calendar:
    """Turnos de trabajo: ventanas diarias (los turnos contiguos se unen) en los días laborables."""

    def __init__(self, workdays: list[int], shifts: list[dict[str, str]]):
        self.workdays = set(workdays)
        spans = sorted((_hm(s["start"]), _hm(s["end"])) for s in shifts)
        merged: list[list[float]] = []
        for a, b in spans:
            if merged and a <= merged[-1][1]:
                merged[-1][1] = max(merged[-1][1], b)
            else:
                merged.append([a, b])
        self.spans = [(a, b) for a, b in merged]
        self.day_work_s = sum(b - a for a, b in self.spans)

    def is_workday(self, day_index: int) -> bool:
        return day_index % 7 + 1 in self.workdays  # EPOCH es lunes (ISO 1)

    def window(self, t: float) -> tuple[float, float]:
        """Ventana de trabajo que contiene t, o la siguiente: (inicio efectivo ≥ t, fin)."""
        d = math.floor(t / DAY)
        for k in range(d, d + 15):
            if not self.is_workday(k):
                continue
            for a, b in self.spans:
                ws, we = k * DAY + a, k * DAY + b
                if t < we:
                    return max(t, ws), we
        raise ValueError("calendario sin días laborables")

    def work_between(self, a: float, b: float) -> float:
        """Segundos de trabajo entre a y b (sin descontar paradas)."""
        total, d = 0.0, math.floor(a / DAY)
        while d * DAY < b:
            if self.is_workday(d):
                for s, e in self.spans:
                    total += max(0.0, min(b, d * DAY + e) - max(a, d * DAY + s))
            d += 1
        return total


@dataclass
class Machine:
    id: str
    down: list[tuple[float, float, str]] = field(default_factory=list)  # paradas ordenadas (inicio, fin, motivo)
    free: float = 0.0
    tooling: str | None = None
    color: str | None = None

    def next_work(self, cal: Calendar, t: float) -> float:
        while True:
            t, _ = cal.window(t)
            hit = next((e for s, e, _ in self.down if s <= t < e), None)
            if hit is None:
                return t
            t = hit

    def advance(self, cal: Calendar, t: float, work_s: float) -> float:
        """Hora en que termina work_s segundos de trabajo que empiezan en t, saltando noches, domingos y paradas."""
        t = self.next_work(cal, t)
        while work_s > 1e-6:
            t = self.next_work(cal, t)
            _, we = cal.window(t)
            ds = next((s for s, e, _ in self.down if s > t and s < we), we)
            avail = ds - t
            if work_s <= avail:
                return t + work_s
            work_s -= avail
            t = ds
        return t


# ------------------------------------------------------------------ pedidos
@dataclass
class Order:
    id: str
    product: str
    quantity: float
    due: float
    created: float
    customer: str
    priority: int = PRIORITY_NORMAL
    color: str | None = None
    hold_until: float | None = None
    hold_reason: str | None = None
    urgent: bool = False

    @property
    def release(self) -> float:
        return max(self.created, self.hold_until or self.created)


def generate_orders(plant_id: str, catalog: Catalog, cal: Calendar, first_due: date, last_due: date) -> list[Order]:
    """Pedidos con entrega entre first_due y last_due (incluidas). Cada fecha usa su propia semilla."""
    demand = catalog.data["demand"]
    load = demand["load_pct"] / 100.0
    rush = demand.get("rush") or {}
    late = demand.get("late") or {}
    lead_lo, lead_hi = demand.get("lead_days") or [5, 15]
    due_at = max(b for _, b in cal.spans)  # entrega al cierre del último turno
    open_at = min(a for a, _ in cal.spans)
    orders: list[Order] = []
    d = first_due
    while d <= last_due:
        k = math.floor(day_s(d) / DAY)
        if cal.is_workday(k):
            rng = random.Random(f"{plant_id}:pedidos:{d.isoformat()}")
            n = 0
            for line in demand["products"]:
                product = catalog.products[line["product"]]
                lo, hi = line["order_qty"]
                step = line.get("round") or 1
                expected = line["daily"] * load / ((lo + hi) / 2)
                count = int(expected) + (1 if rng.random() < expected - int(expected) else 0)
                for _ in range(count):
                    n += 1
                    qty = max(step, round(rng.uniform(lo, hi) / step) * step)
                    is_rush = rng.random() * 100 < rush.get("share_pct", 0)
                    lead = rng.randint(*(rush.get("lead_days") or [1, 3])) if is_rush else rng.randint(lead_lo, lead_hi)
                    due = k * DAY + due_at
                    created = (k - lead) * DAY + open_at
                    order = Order(
                        id=f"PED-{d:%y%m%d}-{n:02d}",
                        product=product["id"],
                        quantity=qty,
                        due=due,
                        created=created,
                        customer=rng.choice(demand.get("customers") or ["Cliente"]),
                        priority=PRIORITY_RUSH if is_rush else PRIORITY_NORMAL,
                        color=rng.choice(product["colors"]) if product.get("colors") else None,
                    )
                    if rng.random() * 100 < late.get("share_pct", 0) and late.get("materials"):
                        mid = rng.choice(late["materials"])
                        order.hold_until = due + rng.uniform(*(late.get("hold_hours") or [-3, 16])) * 3600
                        order.hold_reason = f"insumo tarde: {catalog.materials[mid]['name']}"
                    orders.append(order)
        d += timedelta(days=1)
    return orders


# ------------------------------------------------------------------ rutas
@dataclass
class StageTemplate:
    index: int
    product: str
    stage: str
    equipment: list[str]
    tooling: str | None
    unit: str
    mult: float  # unidades de esta etapa por unidad del pedido
    unit_s: float
    batch_qty: float | None
    batch_min: float | None
    preds: list[tuple[int, float]]  # (etapa programada anterior, espera en s)
    level: int = 0


def route_templates(catalog: Catalog, layout: dict[str, Any], product_id: str) -> list[StageTemplate]:
    """Etapas que se programan en la ruta de un producto: las que montan herramental (molde, receta, formato) o
    declaran su ciclo en el catálogo (ensamble). Las demás (estiba, montacargas, bodega) solo suman espera."""
    graph = catalog.route_graph(product_id, layout)
    stages, edges = graph["stages"], graph["edges"]
    mult: dict[str, float] = {}

    def walk(pid: str, factor: float) -> None:
        mult[pid] = mult.get(pid, 0.0) + factor
        for line in catalog.products[pid].get("bom") or []:
            if line["item"] in catalog.products:
                walk(line["item"], factor * line["qty"])

    walk(product_id, 1.0)
    scheduled = {i for i, st in enumerate(stages) if st.get("tooling") or st.get("cycle_s") is not None}
    back: dict[int, list[int]] = {}
    for a, b in edges:
        back.setdefault(b, []).append(a)

    def preds_of(j: int) -> list[tuple[int, float]]:
        out: list[tuple[int, float]] = []
        stack = [(p, 0.0) for p in back.get(j, [])]
        while stack:
            i, lag = stack.pop()
            lag += (stages[i].get("transfer_min") or 0) * 60.0
            if i in scheduled:
                out.append((i, lag))
            else:
                stack.extend((p, lag) for p in back.get(i, []))
        return out

    out: dict[int, StageTemplate] = {}
    for i in sorted(scheduled):
        st, times = stages[i], stages[i]["times"]
        tool = catalog.tooling.get(st.get("tooling") or "")
        batched = bool(tool and tool["kind"] == "recipe" and times.get("batch_qty") and times.get("batch_min"))
        out[i] = StageTemplate(
            index=i,
            product=st["product"],
            stage=st["stage"],
            equipment=list(st["active"]),
            tooling=st.get("tooling"),
            unit=times.get("unit", "u"),
            mult=mult[st["product"]],
            unit_s=float(times.get("unit_s") or 0.0),
            batch_qty=times.get("batch_qty") if batched else None,
            batch_min=times.get("batch_min") if batched else None,
            preds=preds_of(i),
        )
    for i in sorted(out):  # los índices de la ruta ya están en orden topológico
        out[i].level = max((out[p].level + 1 for p, _ in out[i].preds), default=0)
    return [out[i] for i in sorted(out)]


# ------------------------------------------------------------------ secuenciador
@dataclass
class Task:
    key: str
    op: str
    order: Order
    tpl: StageTemplate
    qty: float
    work_s: float
    batch: tuple[int, int] | None = None
    ready: float = 0.0
    min_end: float = 0.0
    equipment: str | None = None
    start: float | None = None
    end: float | None = None
    changeover_s: float = 0.0


def _make_tasks(orders: list[Order], templates: dict[str, list[StageTemplate]], carry: dict[str, float]) -> list[Task]:
    """Tareas de cada pedido. Los lotes de receta se comparten: lo que sobra del último lote queda en el pulmón y lo
    usa el pedido siguiente del mismo granel, en orden de llegada (así un pedido que llega después no cambia los
    lotes de los anteriores)."""
    tasks: list[Task] = []
    for order in sorted(orders, key=lambda o: (o.created, o.due, o.id)):
        for tpl in templates[order.product]:
            qty = order.quantity * tpl.mult
            op = f"OP-{order.id.replace('PED-', '').replace('URG-', 'U')}-{tpl.index + 1:02d}"
            if tpl.batch_qty:
                need = max(0.0, qty - carry.get(tpl.product, 0.0))
                n = math.ceil(need / tpl.batch_qty - 1e-9)
                carry[tpl.product] = carry.get(tpl.product, 0.0) - qty + n * tpl.batch_qty
                for b in range(n):
                    key = f"{op}#{b + 1}"
                    tasks.append(Task(key, op, order, tpl, tpl.batch_qty, tpl.batch_min * 60.0, batch=(b + 1, n)))
            else:
                tasks.append(Task(op, op, order, tpl, qty, qty * tpl.unit_s))
    return tasks


def _dispatch(
    tasks: list[Task],
    machines: dict[str, Machine],
    cal: Calendar,
    catalog: Catalog,
    color_change_s: float,
    fixed: dict[str, Task] | None = None,
    now: float | None = None,
) -> None:
    """Despacho por lista, nivel por nivel de la ruta. `fixed` son tareas ya ejecutadas (antes de `now`)."""
    fixed = fixed or {}
    by_order: dict[str, dict[int, list[Task]]] = {}
    for t in tasks:
        by_order.setdefault(t.order.id, {}).setdefault(t.tpl.index, []).append(t)
    for t in tasks:
        if t.key in fixed:
            f = fixed[t.key]
            t.equipment, t.start, t.end, t.changeover_s = f.equipment, f.start, f.end, f.changeover_s
    for f in sorted(fixed.values(), key=lambda x: x.end or 0):
        m = machines[f.equipment]
        m.free = max(m.free, f.end)
        m.tooling, m.color = f.tpl.tooling, f.order.color
    if now is not None:
        for m in machines.values():
            m.free = max(m.free, now)

    for level in sorted({t.tpl.level for t in tasks}):
        pending: dict[tuple[str, ...], list[Task]] = {}
        for t in tasks:
            if t.tpl.level != level or t.start is not None:
                continue
            ready, min_end = t.order.release, 0.0
            for p, lag in t.tpl.preds:
                done = by_order[t.order.id].get(p) or []
                if not done:
                    continue  # el granel ya estaba en el pulmón
                firsts = [x.end if x.batch else x.start + min(FIRST_OUTPUT_S, x.end - x.start) for x in done]
                ready = max(ready, min(firsts) + lag)
                tail = t.work_s / len(done) if done[0].batch else 0.0
                min_end = max(min_end, max(x.end for x in done) + lag + tail)
            t.ready = max(ready, now) if now is not None else ready
            t.min_end = min_end
            pending.setdefault(tuple(t.tpl.equipment), []).append(t)
        for group, queue in pending.items():
            while queue:
                m = min((machines[e] for e in group), key=lambda x: (x.next_work(cal, x.free), x.id))
                at = m.next_work(cal, m.free)
                ready = [t for t in queue if t.ready <= at]
                if not ready:
                    at = m.next_work(cal, max(at, min(t.ready for t in queue)))
                    ready = [t for t in queue if t.ready <= at]

                def change_s(t: Task, m: Machine = m) -> float:
                    if t.tpl.tooling and m.tooling and t.tpl.tooling != m.tooling:
                        return catalog.tooling[t.tpl.tooling].get("change_min", 0) * 60.0
                    if t.order.color and m.color and t.order.color != m.color:
                        return color_change_s
                    return 0.0

                t = min(ready, key=lambda x: (x.order.priority, x.order.due, change_s(x) > 0, x.ready, x.key))
                t.changeover_s = change_s(t)
                begin = m.advance(cal, at, t.changeover_s) if t.changeover_s else at
                t.start = m.next_work(cal, begin)
                t.end = max(m.advance(cal, t.start, t.work_s), t.min_end)
                t.equipment = m.id
                m.free, m.tooling, m.color = t.end, t.tpl.tooling or m.tooling, t.order.color or m.color
                queue.remove(t)


def _downtime(plant_id: str, demand: dict[str, Any], cal: Calendar, machine: str, a: date, b: date) -> list[tuple[float, float, str]]:
    cfg = demand.get("downtime") or {}
    if not cfg.get("per_day_pct"):
        return []
    out = []
    d = a
    while d <= b:
        k = math.floor(day_s(d) / DAY)
        if cal.is_workday(k):
            rng = random.Random(f"{plant_id}:paradas:{machine}:{d.isoformat()}")
            if rng.random() * 100 < cfg["per_day_pct"]:
                hours = rng.uniform(*(cfg.get("hours") or [1, 4]))
                s, e = cal.spans[0][0], cal.spans[-1][1]
                start = k * DAY + s + rng.uniform(0, max(0.0, e - s - hours * 3600))
                out.append((start, start + hours * 3600, rng.choice(cfg.get("reasons") or ["parada"])))
        d += timedelta(days=1)
    return out


def plan_start(first: date) -> date:
    """Arranque del plan: siempre el mismo origen (EPOCH), así lo ya planeado nunca cambia al mover el rango.

    Correr desde el origen cuesta poco (menos de un segundo por año de pedidos). Un rango anterior al origen arranca
    WARMUP_DAYS antes, en lunes.
    """
    if first - timedelta(days=WARMUP_DAYS) >= EPOCH.date():
        return EPOCH.date()
    back = first - timedelta(days=WARMUP_DAYS)
    return back - timedelta(days=back.weekday())


@dataclass
class Plan:
    plant_id: str
    first: date
    last: date
    tz: timezone
    cal: Calendar
    orders: list[Order]
    tasks: list[Task]
    machines: dict[str, Machine]
    catalog: Catalog

    def completion(self, order_id: str) -> float:
        return max(t.end for t in self.tasks if t.order.id == order_id)


def build_plan(
    plant_id: str,
    catalog: Catalog,
    layout: dict[str, Any],
    first: date,
    last: date,
    urgent: list[Order] | None = None,
    now: float | None = None,
) -> Plan:
    """Plan de first a last (fechas locales, incluidas). Con `urgent` y `now`: replanea desde ahora con esos pedidos."""
    demand = catalog.data.get("demand")
    if not demand:
        raise ValueError(f"{plant_id}: el catálogo no tiene demanda (catalog/demand.yaml)")
    cal = Calendar(demand["workdays"], demand["shifts"])
    start = plan_start(first)
    max_lead = max((demand.get("lead_days") or [5, 15])[1], (demand.get("rush") or {}).get("lead_days", [0, 0])[1])
    orders = [
        o
        for o in generate_orders(plant_id, catalog, cal, start, last + timedelta(days=max_lead + 1))
        if day_s(start) <= o.created <= day_s(last) + DAY
    ]
    products = {o.product for o in orders} | {o.product for o in urgent or []}
    templates = {pid: route_templates(catalog, layout, pid) for pid in products}
    horizon = last + timedelta(days=max_lead + 30)

    def machines_for() -> dict[str, Machine]:
        ids = sorted({e for tpls in templates.values() for t in tpls for e in t.equipment})
        out = {}
        for eid in ids:
            mounted = catalog.setup.get(eid) or {}
            down = _downtime(plant_id, demand, cal, eid, start, horizon)
            out[eid] = Machine(eid, down, day_s(start), mounted.get("tooling"), mounted.get("color"))
        return out

    color_s = (demand.get("color_change_min") or 0) * 60.0
    machines = machines_for()
    tasks = _make_tasks(orders, templates, {})
    _dispatch(tasks, machines, cal, catalog, color_s)
    if urgent:
        if now is None:
            raise ValueError("un pedido urgente necesita la hora actual (now)")
        fixed = {t.key: t for t in tasks if t.start is not None and t.start < now}
        machines = machines_for()
        tasks = _make_tasks(orders, templates, {}) + _make_tasks(urgent, templates, {})
        _dispatch(tasks, machines, cal, catalog, color_s, fixed=fixed, now=now)
        orders = orders + urgent
    return Plan(plant_id, first, last, _tz(demand.get("timezone", "+00:00")), cal, orders, tasks, machines, catalog)


def urgent_order(catalog: Catalog, raw: dict[str, Any], now: float, n: int, parse: Any) -> Order:
    """Pedido urgente desde la tabla: producto, cantidad, fecha de entrega y, si aplica, color."""
    product = catalog.products.get(raw.get("product", ""))
    if product is None or product["kind"] != "finished":
        raise ValueError(f"producto desconocido o no terminado: {raw.get('product')!r}")
    qty = float(raw.get("quantity") or 0)
    if qty <= 0:
        raise ValueError("la cantidad debe ser mayor que cero")
    due = parse(raw["due"])
    color = raw.get("color") or (product.get("colors") or [None])[0]
    if color and product.get("colors") and color not in product["colors"]:
        raise ValueError(f"{product['id']} no se hace en el color {color!r}")
    return Order(
        id=raw.get("id") or f"URG-{n:02d}",
        product=product["id"],
        quantity=qty,
        due=due,
        created=now,
        customer=raw.get("customer") or "Pedido urgente",
        priority=PRIORITY_URGENT,
        color=color,
        urgent=True,
    )


# ------------------------------------------------------------------ salida
def to_json(plan: Plan, layout: dict[str, Any]) -> dict[str, Any]:
    """Respuesta de la API: pedidos, asignaciones (schedule), paradas y uso de cada equipo en el rango."""
    a, b = day_s(plan.first), day_s(plan.last) + DAY

    def iso(t: float) -> str:
        return (EPOCH + timedelta(seconds=t)).replace(tzinfo=plan.tz).isoformat(timespec="minutes")

    done = {o.id: plan.completion(o.id) for o in plan.orders}
    started = {o.id: min(t.start for t in plan.tasks if t.order.id == o.id) for o in plan.orders}
    shown = {o.id for o in plan.orders if done[o.id] >= a and started[o.id] < b or a <= o.due < b}
    cat = plan.catalog

    orders = []
    for o in sorted((o for o in plan.orders if o.id in shown), key=lambda o: (o.due, o.id)):
        p = cat.products[o.product]
        item = {
            "id": o.id,
            "product": o.product,
            "product_name": p["name"],
            "quantity": o.quantity,
            "unit": p.get("unit", "u"),
            "customer": o.customer,
            "priority": o.priority,
            "created": iso(o.created),
            "due": iso(o.due),
            "start": iso(started[o.id]),
            "completion": iso(done[o.id]),
            "late_h": round(max(0.0, done[o.id] - o.due) / 3600, 1),
        }
        if o.color:
            item["color"] = o.color
        if o.hold_until:
            item["hold"] = {"until": iso(o.hold_until), "reason": o.hold_reason}
        if o.urgent:
            item["urgent"] = True
        orders.append(item)

    schedule = []
    for t in sorted((t for t in plan.tasks if t.order.id in shown), key=lambda t: (t.start, t.equipment, t.key)):
        row = {
            "op": t.op,
            "order": t.order.id,
            "product": t.tpl.product,
            "stage": t.tpl.stage,
            "equipment": t.equipment,
            "start": iso(t.start),
            "end": iso(t.end),
            "quantity": round(t.qty, 2),
            "unit": t.tpl.unit,
            "changeover_min": round(t.changeover_s / 60, 1),
        }
        if t.tpl.tooling:
            row["tooling"] = t.tpl.tooling
        if t.order.color:
            row["color"] = t.order.color
        if t.batch:
            row["batch"] = list(t.batch)
        schedule.append(row)

    downtime, usage = [], {}
    window_work = plan.cal.work_between(a, b)
    for m in plan.machines.values():
        mine = [t for t in plan.tasks if t.equipment == m.id and t.end > a and t.start < b]
        busy = sum(plan.cal.work_between(max(a, t.start), min(b, t.end)) for t in mine)
        lost = 0.0
        for s, e, why in m.down:
            if e > a and s < b:
                downtime.append({"equipment": m.id, "start": iso(s), "end": iso(e), "reason": why})
                lost += plan.cal.work_between(max(a, s), min(b, e))
        usage[m.id] = {"busy_pct": round(100 * busy / window_work, 1) if window_work else 0.0, "down_h": round(lost / 3600, 1)}
    demand = cat.data["demand"]
    return {
        "plant": plan.plant_id,
        "from": plan.first.isoformat(),
        "to": plan.last.isoformat(),
        "timezone": demand.get("timezone", "+00:00"),
        "load_pct": demand["load_pct"],
        "calendar": {"workdays": demand["workdays"], "shifts": demand["shifts"]},
        "orders": orders,
        "schedule": schedule,
        "downtime": sorted(downtime, key=lambda d: (d["start"], d["equipment"])),
        "equipment": usage,
        "products": [
            {"id": line["product"], "name": cat.products[line["product"]]["name"], "unit": cat.products[line["product"]].get("unit", "u"),
             "colors": cat.products[line["product"]].get("colors") or []}
            for line in demand["products"]
        ],
    }


def parse_local(text: str, tz: timezone) -> float:
    """Fecha u hora ISO a segundos locales del plan. Una fecha sola es el final de ese día (22:00 si hay turnos)."""
    if len(text) == 10:
        d = date.fromisoformat(text)
        return day_s(d) + 22 * 3600
    dt = datetime.fromisoformat(text.replace("Z", "+00:00"))
    if dt.tzinfo is not None:
        dt = dt.astimezone(tz).replace(tzinfo=None)
    return to_s(dt)


def tz_of(catalog: Catalog) -> timezone:
    """Zona horaria de la planta (demand.timezone)."""
    return _tz((catalog.data.get("demand") or {}).get("timezone", "+00:00"))


def local_now(tz: timezone) -> datetime:
    return datetime.now(tz).replace(tzinfo=None)


def default_range(tz: timezone, back: str = "month", today: date | None = None) -> tuple[date, date]:
    """Rango por defecto: el mes en curso hacia atrás (o los últimos N días con back='7d') y 30 días hacia adelante."""
    today = today or local_now(tz).date()
    if back == "month":
        first = today.replace(day=1)
    elif back.endswith("d") and back[:-1].isdigit():
        first = today - timedelta(days=int(back[:-1]))
    else:
        raise ValueError(f"rango hacia atrás desconocido: {back!r} (use month o Nd)")
    return first, today + timedelta(days=30)


def impact(base: Plan, new: Plan) -> dict[str, Any]:
    """Qué cambia con los pedidos urgentes: órdenes que se mueven, pedidos que pasan a tarde y cómo sale cada urgente."""
    a = day_s(new.first)
    moved, newly_late, later = [], [], []
    for o in base.orders:
        before, after = base.completion(o.id), new.completion(o.id)
        if after < a and before < a:
            continue
        if abs(after - before) > 60:
            moved.append(o.id)
        if after > o.due and before <= o.due:
            newly_late.append(o.id)
        if after > before + 60:
            later.append({"order": o.id, "delay_h": round((after - before) / 3600, 1)})
    urgent = [
        {"order": o.id, "on_time": new.completion(o.id) <= o.due, "late_h": round(max(0.0, new.completion(o.id) - o.due) / 3600, 1)}
        for o in new.orders
        if o.urgent
    ]
    return {"moved": len(moved), "newly_late": newly_late, "delayed": sorted(later, key=lambda x: -x["delay_h"])[:20], "urgent": urgent}
