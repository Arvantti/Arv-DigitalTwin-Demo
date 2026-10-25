"""Programación de producción de la demo (fase E): generador de pedidos y secuenciador de referencia."""

from datetime import date, datetime, timedelta
from pathlib import Path

import pytest
import yaml
from twin_runtime import planning as P
from twin_runtime.catalog import Catalog

MODELS = Path(__file__).resolve().parents[3] / "industrial-models"
PLANTS = ["sauce-plant-v1", "plastic-injection-plant-v1"]
FIRST, LAST = date(2026, 10, 1), date(2026, 11, 19)


def _inputs(plant: str):
    folder = MODELS / plant
    return Catalog.load(folder), yaml.safe_load((folder / "plant.yaml").read_text(encoding="utf-8"))


@pytest.fixture(scope="module", params=PLANTS)
def plan(request):
    cat, layout = _inputs(request.param)
    return P.build_plan(request.param, cat, layout, FIRST, LAST)


def test_orders_of_a_date_do_not_depend_on_the_range() -> None:
    cat, _ = _inputs("sauce-plant-v1")
    cal = P.Calendar(cat.data["demand"]["workdays"], cat.data["demand"]["shifts"])
    day = date(2026, 11, 5)
    wide = P.generate_orders("sauce-plant-v1", cat, cal, date(2026, 10, 1), date(2026, 11, 30))
    wide = [o for o in wide if o.id.startswith("PED-261105")]
    one = P.generate_orders("sauce-plant-v1", cat, cal, day, day)
    assert wide and [(o.id, o.product, o.quantity, o.due) for o in wide] == [(o.id, o.product, o.quantity, o.due) for o in one]


@pytest.mark.parametrize("plant", PLANTS)
def test_orders_fill_the_target_load(plant: str) -> None:
    """En promedio, los pedidos de cada día laborable piden load_pct de la capacidad diaria de cada producto."""
    cat, _ = _inputs(plant)
    demand = cat.data["demand"]
    cal = P.Calendar(demand["workdays"], demand["shifts"])
    a, b = date(2026, 6, 1), date(2026, 11, 30)
    orders = P.generate_orders(plant, cat, cal, a, b)
    workdays = sum(1 for k in range(int(P.day_s(a) // P.DAY), int(P.day_s(b) // P.DAY) + 1) if cal.is_workday(k))
    for line in demand["products"]:
        asked = sum(o.quantity for o in orders if o.product == line["product"]) / workdays
        assert asked == pytest.approx(line["daily"] * demand["load_pct"] / 100, rel=0.12), line["product"]
    assert not any(cal.is_workday(int(o.due // P.DAY)) is False for o in orders)


def test_machines_never_overlap_and_work_only_in_shifts(plan) -> None:
    by_machine: dict[str, list] = {}
    for t in plan.tasks:
        assert t.start is not None and t.end >= t.start
        by_machine.setdefault(t.equipment, []).append(t)
        ws, we = plan.cal.window(t.start)
        assert ws == t.start and t.start < we, f"{t.key} empieza fuera de turno"
        if t.equipment not in t.tpl.equipment:
            pytest.fail(f"{t.key} en {t.equipment}, que no está activo para {t.tpl.stage}")
    for tasks in by_machine.values():
        tasks.sort(key=lambda t: t.start)
        for x, y in zip(tasks, tasks[1:], strict=False):
            assert y.start >= x.end, f"{x.key} y {y.key} se cruzan en {x.equipment}"


def test_work_is_never_scheduled_during_downtime(plan) -> None:
    for t in plan.tasks:
        if t.work_s <= 0:
            continue
        for s, e, _ in plan.machines[t.equipment].down:
            assert not (s <= t.start < e), f"{t.key} empieza en una parada de {t.equipment}"


def test_stages_follow_the_route(plan) -> None:
    """El llenado empieza después del primer lote de cocción; el ensamble, después de empezar a moldear sus piezas."""
    by_order: dict[tuple[str, int], list] = {}
    for t in plan.tasks:
        by_order.setdefault((t.order.id, t.tpl.index), []).append(t)
    checked = 0
    for t in plan.tasks:
        assert t.start >= t.order.release - 1e-6
        for p, lag in t.tpl.preds:
            prev = by_order.get((t.order.id, p))
            if not prev:
                continue
            first = min(x.end if x.batch else x.start for x in prev)
            assert t.start >= first + lag - 1e-6
            assert t.end >= max(x.end for x in prev) + lag - 1e-6
            checked += 1
    assert checked > 10


def test_some_orders_are_late_and_most_are_on_time(plan) -> None:
    shown = [o for o in plan.orders if P.day_s(FIRST) <= o.due < P.day_s(LAST)]
    late = [o for o in shown if plan.completion(o.id) > o.due]
    assert 0.02 <= len(late) / len(shown) <= 0.2
    assert any(o.hold_until for o in late), "los atrasos vienen sobre todo de insumos que llegan tarde"


@pytest.mark.parametrize("plant", PLANTS)
def test_the_past_does_not_change_when_the_window_moves(plant: str) -> None:
    """Mañana la ventana empieza y termina un día después: lo planeado hasta hoy debe quedar igual."""
    cat, layout = _inputs(plant)
    a = P.build_plan(plant, cat, layout, FIRST, LAST)
    b = P.build_plan(plant, cat, layout, FIRST + timedelta(days=9), LAST + timedelta(days=9))
    cut = P.day_s(LAST)
    sa = {t.key: (t.equipment, t.start, t.end) for t in a.tasks if t.end < cut}
    sb = {t.key: (t.equipment, t.start, t.end) for t in b.tasks if t.end < cut}
    assert sa and sa == sb


def test_urgent_order_keeps_the_past_and_goes_first() -> None:
    plant = "plastic-injection-plant-v1"
    cat, layout = _inputs(plant)
    tz = P.tz_of(cat)
    now = P.to_s(datetime(2026, 10, 20, 10, 0))
    urgent = [P.urgent_order(cat, {"product": "balde-12l", "quantity": 2000, "due": "2026-10-22"}, now, 1, lambda s: P.parse_local(s, tz))]
    base = P.build_plan(plant, cat, layout, FIRST, LAST)
    new = P.build_plan(plant, cat, layout, FIRST, LAST, urgent=urgent, now=now)
    before = {t.key: (t.equipment, t.start, t.end) for t in base.tasks if t.start < now}
    after = {t.key: (t.equipment, t.start, t.end) for t in new.tasks if t.key in before}
    assert before == after, "lo que empezó antes de ahora no se mueve"
    urg = next(t for t in new.tasks if t.order.urgent)
    assert urg.start >= now
    queued = [t for t in new.tasks if t.equipment == urg.equipment and t.key not in before and not t.order.urgent]
    assert all(t.start >= urg.end for t in queued if t.ready <= urg.start), "el urgente pasa adelante de lo que estaba en cola"
    out = P.impact(base, new)
    assert out["urgent"][0]["order"] == "URG-01" and out["moved"] >= 1


def test_urgent_order_rejects_bad_input() -> None:
    cat, _ = _inputs("plastic-injection-plant-v1")
    tz = P.tz_of(cat)
    parse = lambda s: P.parse_local(s, tz)  # noqa: E731
    with pytest.raises(ValueError):
        P.urgent_order(cat, {"product": "cuerpo-papelera-20l", "quantity": 5, "due": "2026-10-22"}, 0, 1, parse)
    with pytest.raises(ValueError):
        P.urgent_order(cat, {"product": "balde-12l", "quantity": 0, "due": "2026-10-22"}, 0, 1, parse)
    with pytest.raises(ValueError):
        P.urgent_order(cat, {"product": "balde-12l", "quantity": 10, "due": "2026-10-22", "color": "mb-gris"}, 0, 1, parse)


def test_json_has_the_contract_fields(plan) -> None:
    out = P.to_json(plan, {"equipment": []})
    assert out["orders"] and out["schedule"]
    row = out["schedule"][0]
    assert {"op", "order", "stage", "equipment", "start", "end", "quantity", "unit", "changeover_min"} <= set(row)
    order = out["orders"][0]
    assert {"id", "product", "quantity", "due", "completion", "late_h", "customer"} <= set(order)
    assert order["due"].endswith("-05:00")
