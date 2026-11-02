/**
 * Del pedido a la programación: trabajos, paradas, despacho en el tiempo y documento `production-plan.v1`.
 *
 * El despacho es común a las dos entradas del APS: la programación manual (una secuencia por máquina escrita por el
 * planificador) y la del solver (unidades por máquina y turno). Las dos se convierten en "tramos" que el despacho
 * pone en el calendario respetando turnos, paradas, cambios de color y que el ensamble espere sus componentes.
 */
import type { CustomerOrder, CustomerOrders, PlannedStop, PlantEvent, Importance, PlanOrderRow, PlanScheduleRow, PlanSource, ProductionPlan } from "../../core/contracts.ts";
import { DAY_MIN, dateOf, iso, parseLocal, rng } from "../../core/time.ts";
import type { PlasticsModel, Step } from "./model.ts";

export const WEIGHT: Record<Importance, number> = { alta: 3, normal: 1, baja: 0.5 };
const PRIORITY: Record<Importance, number> = { alta: 2, normal: 1, baja: 0 };
/** Días de trabajo que el horizonte se extiende después de la última entrega. */
export const TAIL_DAYS = 7;

/** Un trabajo: una etapa programable de un pedido (componente o etapa final). */
export interface Job {
  key: string;
  order: CustomerOrder;
  step: Step;
  qty: number;
  color?: string;
  final: boolean;
  /** Componentes del ensamble (claves de sus trabajos) y unidades por producto. */
  components: { key: string; qty: number }[];
  release: number;
  due: number;
  weight: number;
}

export interface Row {
  job: Job;
  machine: string;
  start: number;
  end: number;
  qty: number;
  changeoverMin: number;
  color?: string;
  /** Fila congelada de un plan anterior: se publica tal cual, con su lote. */
  frozenBatch?: [number, number];
}

export interface Chunk {
  job: Job;
  qty: number;
  notBefore: number;
}

export interface Context {
  model: PlasticsModel;
  orders: CustomerOrder[];
  jobs: Job[];
  start: number;
  /** Instante desde el que se replanea; lo anterior queda congelado. */
  now: number;
  horizonEnd: number;
  down: Record<string, [number, number, string][]>;
  frozen: Row[];
  /** Por máquina: cuándo queda libre después de lo congelado y con qué color. */
  free: Record<string, { at: number; color?: string }>;
  /** Unidades ya hechas (o en curso) de cada trabajo. */
  done: Record<string, number>;
  /** Pedidos fijados: sus lotes del plan anterior quedan donde estaban, aunque sean futuros. */
  fixed: string[];
  /** Por máquina: horas ocupadas por lotes fijados después de AHORA; el resto se programa alrededor. */
  reserved: Record<string, [number, number][]>;
}

/** Paradas y lotes fijados de una máquina: tiempo en que no se puede programar nada nuevo. */
export const blockedOf = (ctx: Context, m: string): [number, number][] =>
  [...(ctx.down[m] ?? []).map(([a, b]) => [a, b] as [number, number]), ...(ctx.reserved[m] ?? [])].sort((x, y) => x[0] - y[0]);

export function makeJobs(model: PlasticsModel, orders: CustomerOrder[], start: number): Job[] {
  const jobs: Job[] = [];
  for (const o of orders) {
    const p = model.products[o.product];
    if (!p) throw new Error(`El pedido ${o.id} pide un producto que no está en la demanda: ${o.product}`);
    const base = { order: o, release: Math.max(start, parseLocal(o.created)), due: parseLocal(o.due), weight: WEIGHT[o.importance] ?? 1 };
    const comps = p.components.map((c) => {
      const color = model.products[c.step.product]?.colors[0] ?? model.initialColor[c.step.machines[0]];
      const job: Job = { ...base, key: `${o.id}/${c.step.product}`, step: c.step, qty: o.quantity * c.qty, color, final: false, components: [] };
      jobs.push(job);
      return { key: job.key, qty: c.qty };
    });
    jobs.push({ ...base, key: `${o.id}/${p.id}`, step: p.final, qty: o.quantity, color: o.color ?? p.colors[0], final: true, components: comps });
  }
  return jobs;
}

/** Paradas aleatorias de cada máquina (demand.yaml): una semilla por máquina y día. */
export function downtime(model: PlasticsModel, machine: string, a: number, b: number): [number, number, string][] {
  const cfg = model.downtime;
  if (!cfg?.per_day_pct) return [];
  const out: [number, number, string][] = [];
  const s = Math.min(...model.calendar.spans.map(([x]) => x));
  const e = Math.max(...model.calendar.spans.map(([, y]) => y));
  for (let d = Math.floor(a / DAY_MIN) * DAY_MIN; d <= b; d += DAY_MIN) {
    if (!model.calendar.isWorkday(d)) continue;
    const r = rng(`${model.plant}:paradas:${machine}:${dateOf(d)}`);
    if (r() * 100 >= cfg.per_day_pct) continue;
    const hours = cfg.hours[0] + r() * (cfg.hours[1] - cfg.hours[0]);
    const t0 = d + s + r() * Math.max(0, e - s - hours * 60);
    out.push([Math.round(t0), Math.round(t0 + hours * 60), cfg.reasons[Math.floor(r() * cfg.reasons.length)]]);
  }
  return out;
}

/** Último día de entrega + la cola del horizonte, al cierre del último turno. */
export function horizonOf(model: PlasticsModel, orders: CustomerOrder[], start: number): number {
  const last = Math.max(start, ...orders.map((o) => parseLocal(o.due)));
  let d = Math.floor(last / DAY_MIN) * DAY_MIN;
  for (let n = 0; n < TAIL_DAYS; ) {
    d += DAY_MIN;
    if (model.calendar.isWorkday(d)) n++;
  }
  return d + Math.max(...model.calendar.spans.map(([, b]) => b));
}

/**
 * Prepara el contexto de una corrida: pedidos conocidos, trabajos, paradas y lo congelado de un plan anterior
 * (filas que empezaron antes de `now` se mantienen tal cual, y también todas las de los pedidos fijados).
 */
export function context(model: PlasticsModel, portfolio: CustomerOrders, nowIso?: string, previous?: ProductionPlan | null, events: PlantEvent[] = [], stops: PlannedStop[] = [], fixedOrders: string[] = []): Context {
  const start = parseLocal(portfolio.plan_start);
  const now = Math.max(start, nowIso ? parseLocal(nowIso) : start);
  // La cartera es la del cliente: se programa completa; ningún pedido se produce antes de su llegada (`created`).
  const orders = portfolio.orders;
  const jobs = makeJobs(model, orders, start);
  const horizonEnd = horizonOf(model, orders, start);
  const down: Context["down"] = {};
  for (const m of model.machines) down[m] = downtime(model, m, start, horizonEnd);
  // Fallas y paros del emulador: la máquina queda fuera de servicio hasta la reparación estimada (o hasta que volvió).
  const outages = events
    .map((e) => ({ m: e.equipment, a: parseLocal(e.start), b: parseLocal(e.cleared ?? e.est_end), why: `${e.kind === "falla" ? "Falla" : "Paro de emergencia"}: ${e.reason}` }))
    .concat(stops.map((x) => ({ m: x.equipment, a: parseLocal(x.start), b: parseLocal(x.end), why: x.reason })))
    .filter((e) => e.b > e.a);
  for (const e of outages) if (down[e.m]) down[e.m] = [...down[e.m].filter(([a, b]) => b <= e.a || a >= e.b), [e.a, e.b, e.why] as [number, number, string]].sort((x, y) => x[0] - y[0]);
  const free: Context["free"] = {};
  for (const m of model.machines) free[m] = { at: start, color: model.initialColor[m] };
  const done: Record<string, number> = {};
  const frozen: Row[] = [];
  const known = new Set(orders.map((o) => o.id));
  const fixed = previous ? fixedOrders.filter((id) => known.has(id) && previous.schedule.some((r) => r.order === id)) : [];
  const isFixed = new Set(fixed);
  const reserved: Context["reserved"] = {};
  if (previous && (now > start || fixed.length)) {
    const byKey = new Map(jobs.map((j) => [`${j.order.id}|${j.step.product}`, j]));
    for (const r of previous.schedule) {
      const t0 = parseLocal(r.start);
      if (t0 >= now && !isFixed.has(r.order)) continue;
      const job = byKey.get(`${r.order}|${r.product}`);
      if (!job) continue;
      const row: Row = { job, machine: r.equipment, start: t0, end: parseLocal(r.end), qty: r.quantity, changeoverMin: r.changeover_min, color: r.color, frozenBatch: r.batch ?? [1, 1] };
      // Un lote que estaba corriendo cuando la máquina falló se corta ahí: lo que faltaba se vuelve a programar.
      const cut = outages.find((e) => e.m === r.equipment && e.a > row.start && e.a < row.end);
      if (cut) {
        const share = model.calendar.workBetween(row.start, cut.a) / Math.max(1, model.calendar.workBetween(row.start, row.end));
        row.qty = Math.floor(row.qty * share);
        row.end = cut.a;
        if (row.qty <= 0) continue;
      }
      if (outages.some((e) => e.m === r.equipment && e.a <= row.start && e.b > row.start)) continue;
      // Un lote fijado que cae dentro de una falla no se puede respetar: se vuelve a programar.
      if (t0 >= now && outages.some((e) => e.m === r.equipment && e.a < row.end && e.b > row.start)) continue;
      frozen.push(row);
      done[job.key] = (done[job.key] ?? 0) + row.qty;
      if (t0 >= now) {
        (reserved[r.equipment] ??= []).push([row.start, row.end]);
        continue;
      }
      const f = free[r.equipment];
      if (f && row.end >= f.at) {
        f.at = row.end;
        if (row.color) f.color = row.color;
      }
    }
    for (const m of model.machines) free[m].at = Math.max(free[m].at, now);
  }
  for (const list of Object.values(reserved)) list.sort((a, b) => a[0] - b[0]);
  return { model, orders, jobs, start, now, horizonEnd, down, frozen, free, done, fixed, reserved };
}

/** Pone los tramos en el calendario. Primero las máquinas de componentes y productos directos, luego el ensamble. */
export function dispatch(ctx: Context, queues: Record<string, Chunk[]>): { rows: Row[]; unscheduled: Record<string, number> } {
  const { model } = ctx;
  const cal = model.calendar;
  const rows: Row[] = [...ctx.frozen];
  const unscheduled: Record<string, number> = {};
  const isAssembly = (m: string) => ctx.jobs.some((j) => j.components.length && j.step.machines.includes(m));
  const order = [...model.machines].sort((a, b) => Number(isAssembly(a)) - Number(isAssembly(b)) || a.localeCompare(b));
  const multiColor = (m: string) => new Set(ctx.jobs.filter((j) => j.step.machines.includes(m)).map((j) => j.color)).size > 1 || ctx.free[m].color !== undefined;

  /**
   * Cuándo hay `need` unidades acumuladas de un componente en el puesto de ensamble. Las piezas salen de la inyectora
   * a ritmo parejo durante cada fila y llegan al ensamble `transferMin` después (estiba, transporte, almacén).
   */
  const available = (key: string, need: number): number => {
    const mine = rows.filter((r) => r.job.key === key).sort((a, b) => a.end - b.end);
    let cum = 0;
    for (const r of mine) {
      if (cum + r.qty >= need - 1e-6) {
        const work = r.end - r.start - r.changeoverMin;
        const at = r.start + r.changeoverMin + (work * Math.max(0, need - cum)) / r.qty;
        return at + r.job.step.transferMin;
      }
      cum += r.qty;
    }
    return Infinity;
  };
  const assembled: Record<string, number> = { ...ctx.done };

  for (const m of order) {
    let cursor = ctx.free[m].at;
    let color = ctx.free[m].color;
    const blocked = blockedOf(ctx, m);
    const fixedSpans = ctx.reserved[m] ?? [];
    /** Minutos de trabajo libres (sin paradas ni lotes fijados) entre a y b. */
    const freeWork = (a: number, b: number) => cal.workBetween(a, b) - blocked.reduce((s, [x, y]) => s + (y > a && x < b ? cal.workBetween(Math.max(a, x), Math.min(b, y)) : 0), 0);
    for (const ch of queues[m] ?? []) {
      if (ch.qty <= 0) continue;
      let t = Math.max(cursor, ch.notBefore, ch.job.release);
      /** El ensamble puede ir a la par de los componentes, pero no termina antes de que llegue la última pieza. */
      let lastReady = -Infinity;
      if (ch.job.components.length) {
        const sofar = assembled[ch.job.key] ?? 0;
        const first = Math.max(...ch.job.components.map((c) => available(c.key, (sofar + 1) * c.qty)));
        lastReady = Math.max(...ch.job.components.map((c) => available(c.key, (sofar + ch.qty) * c.qty)));
        if (!Number.isFinite(lastReady)) {
          unscheduled[ch.job.key] = (unscheduled[ch.job.key] ?? 0) + ch.qty;
          continue;
        }
        t = Math.max(t, first);
      }
      t = cal.nextWork(t);
      // Si la máquina está parada en ese instante, el tramo arranca cuando vuelve.
      for (let stop = blocked.find(([a, b]) => t >= a && t < b); stop; stop = blocked.find(([a, b]) => t >= a && t < b)) t = cal.nextWork(stop[1]);
      let qty = ch.qty;
      // Antes de un lote fijado solo cabe lo que alcanza a terminar; lo demás sigue después de él.
      for (let guard = 0; qty > 0 && guard < 200; guard++) {
        for (let stop = blocked.find(([a, b]) => t >= a && t < b); stop; stop = blocked.find(([a, b]) => t >= a && t < b)) t = cal.nextWork(stop[1]);
        if (t >= ctx.horizonEnd) break;
        let co = 0;
        if (ch.job.color && color && ch.job.color !== color && multiColor(m) && model.colorChangeMin) co = model.colorChangeMin;
        const fence = fixedSpans.find(([a]) => a > t);
        let q = qty;
        let end = Math.max(cal.advance(t, co + q * ch.job.step.unitMin, blocked), Number.isFinite(lastReady) ? cal.advance(lastReady, ch.job.step.unitMin, blocked) : -Infinity);
        if (fence && end > fence[0]) {
          q = Math.min(qty, Math.floor((freeWork(t, fence[0]) - co) / ch.job.step.unitMin));
          while (q > 0 && cal.advance(t, co + q * ch.job.step.unitMin, blocked) > fence[0]) q--;
          if (ch.job.components.length) q = 0; // el ensamble espera sus piezas: no se parte alrededor de un fijado
          if (q <= 0) {
            t = cal.nextWork(fence[1]);
            continue;
          }
          end = cal.advance(t, co + q * ch.job.step.unitMin, blocked);
        }
        rows.push({ job: ch.job, machine: m, start: t, end, qty: q, changeoverMin: co, color: ch.job.color });
        assembled[ch.job.key] = (assembled[ch.job.key] ?? 0) + q;
        if (ch.job.color) color = ch.job.color;
        cursor = end;
        qty -= q;
        t = end;
      }
      if (qty > 0) unscheduled[ch.job.key] = (unscheduled[ch.job.key] ?? 0) + qty;
    }
  }
  return { rows, unscheduled };
}

/** Arma el documento `production-plan.v1` que publica el APS. */
export function toPlan(
  ctx: Context,
  portfolio: CustomerOrders,
  result: { rows: Row[]; unscheduled: Record<string, number> },
  head: { planId: string; source: PlanSource; solver?: ProductionPlan["solver"]; notes?: string[] },
): ProductionPlan {
  const { model } = ctx;
  const tz = model.timezone;
  const cal = model.calendar;
  const rows = [...result.rows].sort((a, b) => a.start - b.start || a.machine.localeCompare(b.machine));
  // Cada fila se parte en lotes (aps.yaml): el lote k de un trabajo termina cuando la máquina completa sus unidades.
  const counter: Record<string, number> = {};
  const made: Record<string, number> = {};
  const schedule: PlanScheduleRow[] = [];
  for (const r of rows) {
    const lot = model.lots[r.job.step.product] ?? Math.max(1, r.job.qty);
    const lots = Math.max(1, Math.ceil(r.job.qty / lot));
    const blocked = blockedOf(ctx, r.machine);
    let t = r.start;
    let left = Math.round(r.qty);
    let first = true;
    if (r.frozenBatch) {
      made[r.job.key] = (made[r.job.key] ?? 0) + left;
      left = 0;
      const n = (counter[r.job.order.id] = (counter[r.job.order.id] ?? 0) + 1);
      const row: PlanScheduleRow = {
        op: `OP-${r.job.order.id.replace(/^PED-/, "")}-${String(n).padStart(2, "0")}`,
        order: r.job.order.id,
        product: r.job.step.product,
        stage: r.job.step.stage,
        equipment: r.machine,
        start: iso(r.start, tz),
        end: iso(r.end, tz),
        quantity: Math.round(r.qty),
        unit: model.products[r.job.order.product]?.unit ?? "u",
        changeover_min: r.changeoverMin,
        batch: r.frozenBatch,
      };
      if (r.job.step.tooling) row.tooling = r.job.step.tooling;
      if (r.color) row.color = r.color;
      schedule.push(row);
    }
    while (left > 0) {
      const sofar = made[r.job.key] ?? 0;
      const k = Math.floor(sofar / lot) + 1;
      const q = Math.min(left, k * lot - sofar);
      const co = first ? r.changeoverMin : 0;
      const end = left - q <= 0 ? r.end : Math.min(r.end, cal.advance(t, co + q * r.job.step.unitMin, blocked));
      const n = (counter[r.job.order.id] = (counter[r.job.order.id] ?? 0) + 1);
      made[r.job.key] = sofar + q;
      const row: PlanScheduleRow = {
        op: `OP-${r.job.order.id.replace(/^PED-/, "")}-${String(n).padStart(2, "0")}`,
        order: r.job.order.id,
        product: r.job.step.product,
        stage: r.job.step.stage,
        equipment: r.machine,
        start: iso(t, tz),
        end: iso(end, tz),
        quantity: q,
        unit: model.products[r.job.order.product]?.unit ?? "u",
        changeover_min: co,
        batch: [Math.min(k, lots), lots],
      };
      if (r.job.step.tooling) row.tooling = r.job.step.tooling;
      if (r.color) row.color = r.color;
      schedule.push(row);
      left -= q;
      t = end;
      first = false;
    }
  }
  const orders: PlanOrderRow[] = ctx.orders.map((o) => {
    const mine = rows.filter((r) => r.job.order.id === o.id);
    const finals = mine.filter((r) => r.job.final);
    const missing = Object.entries(result.unscheduled)
      .filter(([k]) => k === `${o.id}/${o.product}`)
      .reduce((s, [, v]) => s + v, 0);
    const startT = mine.length ? Math.min(...mine.map((r) => r.start)) : ctx.horizonEnd;
    const doneT = missing > 0 || !finals.length ? ctx.horizonEnd : Math.max(...finals.map((r) => r.end));
    const due = parseLocal(o.due);
    const p = model.products[o.product];
    const row: PlanOrderRow = {
      id: o.id,
      product: o.product,
      product_name: p?.name ?? o.product,
      quantity: o.quantity,
      unit: p?.unit ?? "u",
      customer: o.customer,
      priority: PRIORITY[o.importance] ?? 1,
      importance: o.importance,
      created: o.created,
      due: o.due,
      start: iso(startT, tz),
      completion: iso(doneT, tz),
      late_h: Math.round((Math.max(0, doneT - due) / 60) * 10) / 10,
    };
    if (o.color) row.color = o.color;
    if (o.importance === "alta") row.urgent = true;
    if (o.added) row.added = true;
    if (missing > 0) row.unscheduled = Math.round(missing);
    return row;
  });

  const downtime: ProductionPlan["downtime"] = [];
  const equipment: ProductionPlan["equipment"] = {};
  const work = cal.workBetween(ctx.start, ctx.horizonEnd);
  for (const m of model.machines) {
    const busy = rows.filter((r) => r.machine === m).reduce((s, r) => s + cal.workBetween(r.start, r.end), 0);
    let lost = 0;
    for (const [a, b, why] of ctx.down[m]) {
      downtime.push({ equipment: m, start: iso(a, tz), end: iso(b, tz), reason: why });
      lost += cal.workBetween(a, b);
    }
    equipment[m] = { busy_pct: work ? Math.round((1000 * busy) / work) / 10 : 0, down_h: Math.round(lost / 6) / 10 };
  }
  downtime.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.equipment.localeCompare(b.equipment)));

  const late = orders.filter((o) => o.late_h > 0);
  const co = rows.filter((r) => r.changeoverMin > 0);
  const [busiestId, busiestUse] = Object.entries(equipment).sort((a, b) => b[1].busy_pct - a[1].busy_pct)[0] ?? ["", { busy_pct: 0 }];
  const demand = model;
  return {
    contract: "production-plan.v1",
    plan_id: head.planId,
    source: head.source,
    status: "borrador",
    plant: model.plant,
    portfolio_id: portfolio.portfolio_id,
    from: dateOf(ctx.start),
    to: dateOf(ctx.horizonEnd),
    timezone: tz,
    load_pct: demand.loadPct,
    calendar: { workdays: cal.workdays, shifts: cal.shifts },
    orders: orders.sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : a.id.localeCompare(b.id))),
    schedule,
    downtime,
    equipment,
    products: Object.values(model.products).map((p) => ({ id: p.id, name: p.name, unit: p.unit, colors: p.colors })),
    kpis: {
      orders: orders.length,
      on_time_pct: orders.length ? Math.round((1000 * (orders.length - late.length)) / orders.length) / 10 : 100,
      late_orders: late.length,
      tardiness_h: Math.round(late.reduce((s, o) => s + o.late_h, 0) * 10) / 10,
      changeovers: co.length,
      changeover_h: Math.round(co.reduce((s, r) => s + r.changeoverMin, 0) / 6) / 10,
      busiest: { equipment: busiestId, busy_pct: busiestUse.busy_pct },
    },
    ...(head.solver ? { solver: head.solver } : {}),
    ...(ctx.now > ctx.start ? { frozen_until: iso(ctx.now, tz) } : {}),
    ...(head.notes ? { notes: head.notes } : {}),
    ...(ctx.fixed.length ? { fixed_orders: [...ctx.fixed] } : {}),
  };
}
