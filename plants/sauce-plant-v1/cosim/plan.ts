/**
 * Del pedido a la programación de la planta de salsas: tandas en las líneas de proceso, pulmón con tiempo de espera,
 * llenado con CIP por alérgeno y cambio de formato, y el documento `production-plan.v1`.
 *
 * El cuello de botella es el proceso (aps.yaml, lines): cada granel sale de su línea en tandas completas. Una tanda
 * sirve a varios pedidos seguidos del mismo granel; lo que sobra queda en el pulmón hasta su tiempo de espera y, si
 * nadie lo usa antes, es merma. Las llenadoras toman el granel cuando la tanda está lista.
 *
 * El despacho es común a las dos entradas del APS: el plan manual (pedidos por orden de llegada en la llenadora que
 * escribió el planificador) y el del solver (kilos de cada pedido por línea y turno). Las dos se convierten en tramos
 * por línea, y el despacho avanza siempre por la línea que puede arrancar antes, para que las llenadoras compartidas
 * (mayonesa y mostaza en 250 ml) se repartan en orden de tiempo.
 */
import {
  DAY_MIN,
  dateOf,
  iso,
  parseLocal,
  rng,
  type ChangeoverKind,
  type CustomerOrder,
  type CustomerOrders,
  type Importance,
  type PlanOrderRow,
  type PlanScheduleRow,
  type PlanSource,
  type PlannedStop,
  type PlantEvent,
  type ProductionPlan,
} from "@twin/cosim-core";
import type { Line, SauceModel } from "./model.ts";

export const WEIGHT: Record<Importance, number> = { alta: 3, normal: 1, baja: 0.5 };
const PRIORITY: Record<Importance, number> = { alta: 2, normal: 1, baja: 0 };
/** Días de trabajo que el horizonte se extiende después de la última entrega. */
export const TAIL_DAYS = 7;
/** Cuántos tramos adelante mira el despacho para aprovechar el granel que quedó en el pulmón. */
const LOOKAHEAD = 8;
const r1 = (x: number) => Math.round(x * 10) / 10;

/** Lo que pide un pedido: unidades de un SKU, kilos de su granel. */
export interface Job {
  order: CustomerOrder;
  bulk: string;
  bulkKg: number;
  qty: number;
  release: number;
  due: number;
  weight: number;
}

/** Un tramo de la cola de una línea: unidades de un pedido, en qué llenadora (si ya está decidido) y desde cuándo. */
export interface Chunk {
  job: Job;
  qty: number;
  filler?: string;
  notBefore: number;
}

/** Una tanda hecha en una línea. */
export interface Batch {
  id: string;
  bulk: string;
  equipment: string;
  start: number;
  end: number;
  /** El pedido que la pidió (el primero que la usa). */
  order: string;
  frozen?: boolean;
}

/** Una fila de llenado. */
export interface Fill {
  job: Job;
  filler: string;
  start: number;
  end: number;
  qty: number;
  batch: string;
  changeoverMin: number;
  changeoverKind?: ChangeoverKind;
  /** CIP de rutina antes de esta fila (incluido en changeoverMin). */
  routine?: boolean;
  frozen?: boolean;
}

export interface Context {
  model: SauceModel;
  orders: CustomerOrder[];
  jobs: Map<string, Job>;
  start: number;
  /** Desde aquí se replanea; lo anterior queda congelado. */
  now: number;
  horizonEnd: number;
  /** Paradas por equipo (llenadora o línea, con la línea por el id de su granel). */
  down: Record<string, [number, number, string][]>;
  /** Lo congelado del plan anterior. */
  frozenBatches: Batch[];
  frozenFills: Fill[];
  /** Unidades ya llenadas (o en curso) de cada pedido. */
  done: Record<string, number>;
  /** Granel en el pulmón al replanear: lo que quedó de tandas congeladas, por granel. */
  stock: Record<string, Stock[]>;
  lineFree: Record<string, number>;
  fillerFree: Record<string, { at: number; bulk?: string; format?: string; runMin: number }>;
}

interface Stock {
  batch: string;
  ready: number;
  kg: number;
}

export function makeJobs(model: SauceModel, orders: CustomerOrder[], start: number): Map<string, Job> {
  const jobs = new Map<string, Job>();
  for (const o of orders) {
    const p = model.products[o.product];
    if (!p) throw new Error(`El pedido ${o.id} pide un producto que no está en la demanda: ${o.product}`);
    jobs.set(o.id, { order: o, bulk: p.bulk, bulkKg: p.bulkKg, qty: o.quantity, release: Math.max(start, parseLocal(o.created)), due: parseLocal(o.due), weight: WEIGHT[o.importance] ?? 1 });
  }
  return jobs;
}

/** Paradas aleatorias (demand.yaml, downtime): una semilla por equipo y día. */
export function downtime(model: SauceModel, id: string, a: number, b: number): [number, number, string][] {
  const cfg = model.downtime;
  if (!cfg?.per_day_pct) return [];
  const out: [number, number, string][] = [];
  const s = Math.min(...model.calendar.spans.map(([x]) => x));
  const e = Math.max(...model.calendar.spans.map(([, y]) => y));
  for (let d = Math.floor(a / DAY_MIN) * DAY_MIN; d <= b; d += DAY_MIN) {
    if (!model.calendar.isWorkday(d)) continue;
    const r = rng(`${model.plant}:paradas:${id}:${dateOf(d)}`);
    if (r() * 100 >= cfg.per_day_pct) continue;
    const hours = cfg.hours[0] + r() * (cfg.hours[1] - cfg.hours[0]);
    const t0 = d + s + r() * Math.max(0, e - s - hours * 60);
    out.push([Math.round(t0), Math.round(t0 + hours * 60), cfg.reasons[Math.floor(r() * cfg.reasons.length)]]);
  }
  return out;
}

/** Último día de entrega + la cola del horizonte, al cierre del último turno. */
export function horizonOf(model: SauceModel, orders: CustomerOrder[], start: number): number {
  const last = Math.max(start, ...orders.map((o) => parseLocal(o.due)));
  let d = Math.floor(last / DAY_MIN) * DAY_MIN;
  for (let n = 0; n < TAIL_DAYS; ) {
    d += DAY_MIN;
    if (model.calendar.isWorkday(d)) n++;
  }
  return d + Math.max(...model.calendar.spans.map(([, b]) => b));
}

/** La línea que para cuando falla un equipo (el suyo o uno de `down_with`), o el equipo mismo si es una llenadora. */
const downKeys = (model: SauceModel, equipment: string): string[] => {
  const lines = Object.values(model.lines).filter((l) => l.equipment.includes(equipment) || l.downWith.includes(equipment));
  return lines.length ? lines.map((l) => l.bulk) : model.fillers.includes(equipment) ? [equipment] : [];
};

export interface ContextOptions {
  now?: string;
  previous?: ProductionPlan | null;
  events?: PlantEvent[];
  stops?: PlannedStop[];
  /** Paradas aleatorias de demand.yaml (sí por defecto; las pruebas a mano las apagan). */
  randomDowntime?: boolean;
}

export function context(model: SauceModel, portfolio: CustomerOrders, opt: ContextOptions = {}): Context {
  const start = parseLocal(portfolio.plan_start);
  const now = Math.max(start, opt.now ? parseLocal(opt.now) : start);
  const orders = portfolio.orders;
  const jobs = makeJobs(model, orders, start);
  const horizonEnd = horizonOf(model, orders, start);
  const keys = [...Object.keys(model.lines), ...model.fillers];
  const down: Context["down"] = Object.fromEntries(keys.map((k) => [k, opt.randomDowntime === false ? [] : downtime(model, k, start, horizonEnd)]));
  const outages = (opt.events ?? [])
    .map((e) => ({ eq: e.equipment, a: parseLocal(e.start), b: parseLocal(e.cleared ?? e.est_end), why: `${e.kind === "falla" ? "Falla" : "Paro de emergencia"}: ${e.reason}` }))
    .concat((opt.stops ?? []).map((x) => ({ eq: x.equipment, a: parseLocal(x.start), b: parseLocal(x.end), why: x.reason })))
    .filter((e) => e.b > e.a);
  for (const e of outages)
    for (const k of downKeys(model, e.eq)) down[k] = [...down[k].filter(([a, b]) => b <= e.a || a >= e.b), [e.a, e.b, e.why] as [number, number, string]].sort((x, y) => x[0] - y[0]);

  const lineFree = Object.fromEntries(Object.keys(model.lines).map((k) => [k, start]));
  const fillerFree: Context["fillerFree"] = Object.fromEntries(model.fillers.map((m) => [m, { at: start, format: model.initialFormat[m], runMin: 0 }]));
  const frozenBatches: Batch[] = [];
  const frozenFills: Fill[] = [];
  const done: Record<string, number> = {};
  const stock: Context["stock"] = {};
  const prev = opt.previous;
  if (prev && now > start) {
    const lineOf = (equipment: string) => Object.values(model.lines).find((l) => l.equipment.includes(equipment));
    const used: Record<string, number> = {};
    for (const r of prev.schedule) {
      const t0 = parseLocal(r.start);
      const t1 = parseLocal(r.end);
      if (t0 >= now) continue;
      const line = lineOf(r.equipment);
      if (line && r.batch_id) {
        // Una tanda que ya arrancó termina (el granel no se puede dejar a medias).
        frozenBatches.push({ id: r.batch_id, bulk: line.bulk, equipment: r.equipment, start: t0, end: t1, order: r.order, frozen: true });
        lineFree[line.bulk] = Math.max(lineFree[line.bulk], t1);
        continue;
      }
      const job = jobs.get(r.order);
      if (!job || !model.fillers.includes(r.equipment)) continue;
      // Un llenado que corría cuando su llenadora falló se corta ahí; lo que faltaba se vuelve a programar.
      const cut = outages.find((e) => downKeys(model, e.eq).includes(r.equipment) && e.a > t0 && e.a < t1);
      const end = cut ? cut.a : t1;
      const qty = cut ? Math.floor((r.quantity * (end - t0)) / Math.max(1, t1 - t0)) : r.quantity;
      if (qty <= 0) continue;
      const fill: Fill = { job, filler: r.equipment, start: t0, end, qty, batch: r.batch_id ?? "", changeoverMin: r.changeover_min, ...(r.changeover_kind ? { changeoverKind: r.changeover_kind } : {}), frozen: true };
      frozenFills.push(fill);
      done[r.order] = (done[r.order] ?? 0) + qty;
      if (fill.batch) used[fill.batch] = (used[fill.batch] ?? 0) + qty * job.bulkKg;
      const f = fillerFree[r.equipment];
      if (end >= f.at) {
        const cleaned = r.changeover_kind === "cip" || r.changeover_kind === "alergeno";
        Object.assign(f, { at: end, bulk: job.bulk, format: model.products[job.order.product].format, runMin: (cleaned ? 0 : f.runMin) + (end - t0 - r.changeover_min) });
      }
    }
    // Lo que quedó de cada tanda congelada sigue en el pulmón, si todavía no se vence.
    for (const b of frozenBatches) {
      const line = model.lines[b.bulk];
      const kg = line.outKg - (used[b.id] ?? 0);
      if (kg >= 1 && b.end + line.holdMin > now) (stock[b.bulk] ??= []).push({ batch: b.id, ready: b.end, kg });
    }
    for (const k of Object.keys(lineFree)) lineFree[k] = Math.max(lineFree[k], now);
    for (const f of Object.values(fillerFree)) f.at = Math.max(f.at, now);
  }
  return { model, orders, jobs, start, now, horizonEnd, down, frozenBatches, frozenFills, done, stock, lineFree, fillerFree };
}

export interface DispatchResult {
  batches: Batch[];
  fills: Fill[];
  unscheduled: Record<string, number>;
  /** Kilos de granel que se vencieron en el pulmón o sobraron al final. */
  waste: Record<string, number>;
}

/**
 * Pone los tramos en el tiempo. En cada paso avanza la línea que puede arrancar antes: toma el granel del pulmón (si
 * no se venció) o hace una tanda nueva, y llena en la llenadora del tramo (o en la que pueda empezar antes, con
 * preferencia por la habitual).
 */
export function dispatch(ctx: Context, queues: Record<string, Chunk[]>): DispatchResult {
  const { model } = ctx;
  const cal = model.calendar;
  const blocked = (k: string): [number, number][] => (ctx.down[k] ?? []).map(([a, b]) => [a, b] as [number, number]);
  /** Primer instante de trabajo en o después de t en que el equipo no está parado. */
  const ready = (k: string, t: number) => {
    let x = cal.nextWork(t);
    for (let stop = (ctx.down[k] ?? []).find(([a, b]) => x >= a && x < b); stop; stop = (ctx.down[k] ?? []).find(([a, b]) => x >= a && x < b)) x = cal.nextWork(stop[1]);
    return x;
  };
  const batches: Batch[] = [...ctx.frozenBatches];
  const fills: Fill[] = [...ctx.frozenFills];
  const unscheduled: Record<string, number> = {};
  const waste: Record<string, number> = {};
  const stock: Record<string, Stock[]> = Object.fromEntries(Object.keys(model.lines).map((k) => [k, [...(ctx.stock[k] ?? [])]]));
  const lineFree = { ...ctx.lineFree };
  const filler = Object.fromEntries(Object.entries(ctx.fillerFree).map(([m, f]) => [m, { ...f }]));
  const count: Record<string, number> = {};
  for (const b of ctx.frozenBatches) count[b.bulk] = Math.max(count[b.bulk] ?? 0, Number(b.id.split("-").pop()) || 0);
  const rot: Record<string, number> = {};
  const pos: Record<string, number> = Object.fromEntries(Object.keys(queues).map((k) => [k, 0]));
  const lost = (bulk: string, kg: number) => (waste[bulk] = (waste[bulk] ?? 0) + kg);

  /** Dónde y cuándo arrancaría el llenado de un tramo que tiene granel desde `at`. */
  const plan = (m: string, job: Job, at: number) => {
    const f = filler[m];
    const to = { bulk: job.bulk, format: model.products[job.order.product].format };
    const ch = model.changeover(f, to);
    const runMin = ch.min && (ch.kind === "cip" || ch.kind === "alergeno") ? 0 : f.runMin;
    return { t: ready(m, Math.max(f.at, at)), ch, runMin };
  };

  /** Fin del tramo de trabajo seguido que contiene t (los turnos pegados cuentan como uno). */
  const runEnd = (t: number) => {
    const d = Math.floor(t / DAY_MIN) * DAY_MIN;
    let end = t;
    for (const [a, b] of [...cal.spans].sort((x, y) => x[0] - y[0])) if (d + a <= end && end < d + b) end = d + b;
    return end;
  };

  /** Cuándo correría una tanda que arranca desde `notBefore`. */
  const slot = (line: Line, notBefore: number): { t: number; end: number } | null => {
    let t = ready(line.bulk, Math.max(lineFree[line.bulk], notBefore));
    // Una tanda no se deja a medias de un día para otro: si no alcanza a terminar antes del cierre, arranca al otro día.
    for (let g = 0; g < 10 && t < ctx.horizonEnd && cal.advance(t, line.batchMin) !== t + line.batchMin; g++) t = ready(line.bulk, runEnd(t));
    if (t >= ctx.horizonEnd) return null;
    return { t, end: cal.advance(t, line.batchMin, blocked(line.bulk)) };
  };

  /**
   * Tanda nueva para el tramo. No se cocina para botar: si ninguna llenadora alcanza a tomar el granel antes de que se
   * venza en el pulmón, la tanda se corre para que termine cuando la llenadora quede libre (al otro día, si toca).
   */
  const makeBatch = (line: Line, job: Job, notBefore: number, choices: string[]): Stock | null => {
    let s = slot(line, notBefore);
    for (let g = 0; s && g < 4; g++) {
      const fillAt = Math.min(...choices.map((x) => plan(x, job, s!.end).t));
      if (fillAt <= s.end + line.holdMin) break;
      const later = slot(line, fillAt - line.batchMin);
      if (!later || later.t <= s.t) break;
      s = later;
    }
    if (!s) return null;
    const { t, end } = s;
    const n = (count[line.bulk] = (count[line.bulk] ?? 0) + 1);
    const equipment = line.equipment[(rot[line.bulk] = ((rot[line.bulk] ?? -1) + 1) % line.equipment.length)];
    const id = `TND-${line.bulk.replace(/-granel$/, "").toUpperCase()}-${String(n).padStart(3, "0")}`;
    batches.push({ id, bulk: line.bulk, equipment, start: t, end, order: job.order.id });
    lineFree[line.bulk] = end;
    return { batch: id, ready: end, kg: line.outKg };
  };

  for (;;) {
    // La línea que puede arrancar antes con su próximo tramo.
    let pick: string | null = null;
    let best = Infinity;
    for (const [bulk, q] of Object.entries(queues)) {
      const ch = q[pos[bulk]];
      if (!ch) continue;
      const at = Math.max(ch.notBefore, ch.job.release, stock[bulk]?.length ? stock[bulk][0].ready : lineFree[bulk]);
      if (at < best || (at === best && pick !== null && bulk < pick)) {
        best = at;
        pick = bulk;
      }
    }
    if (pick === null) break;
    // Lo que quedó en el pulmón se aprovecha antes de que se venza: si el tramo que sigue no alcanza a llenarlo a
    // tiempo, pasa adelante el próximo tramo de la cola que sí (como haría el supervisor de llenado).
    const q = queues[pick];
    const left0 = stock[pick][0];
    if (left0) {
      const fits = (c: Chunk) => {
        const at = Math.max(left0.ready, c.notBefore, c.job.release);
        const opts = c.filler ? [c.filler] : model.products[c.job.order.product].fillers;
        return Math.min(...opts.map((x) => plan(x, c.job, at).t)) <= left0.ready + model.lines[pick!].holdMin;
      };
      if (!fits(q[pos[pick]])) {
        const k = q.slice(pos[pick] + 1, pos[pick] + 1 + LOOKAHEAD).findIndex(fits);
        if (k >= 0) {
          const [c] = q.splice(pos[pick] + 1 + k, 1);
          q.splice(pos[pick], 0, c);
        }
      }
    }
    const ch = q[pos[pick]++];
    const line = model.lines[pick];
    const job = ch.job;
    const p = model.products[job.order.product];
    const choices = ch.filler ? [ch.filler] : p.fillers;
    let left = ch.qty;
    let m = choices[0];
    for (let guard = 0; left > 0 && guard < 500; guard++) {
      // Granel disponible: el del pulmón si no se venció; si no, una tanda nueva.
      let head = stock[pick][0];
      const notBefore = Math.max(ch.notBefore, job.release);
      if (!head) {
        const made = makeBatch(line, job, notBefore, choices);
        if (!made) break;
        stock[pick].push(made);
        head = made;
      }
      // La llenadora: la del tramo, o la que arranque antes (empate: la habitual, que va primero en la lista).
      const at = Math.max(head.ready, notBefore);
      const options = choices.map((x) => ({ m: x, ...plan(x, job, at) }));
      const o = options.reduce((a, b) => (b.t + b.ch.min < a.t + a.ch.min ? b : a));
      m = o.m;
      let t = o.t;
      if (t > head.ready + line.holdMin) {
        // Se venció en el pulmón antes de poder llenarlo: es merma.
        lost(pick, head.kg);
        stock[pick].shift();
        continue;
      }
      const rate = model.fillerRate[m];
      const units = Math.min(left, Math.floor(head.kg / job.bulkKg + 1e-9));
      if (units <= 0) {
        lost(pick, head.kg);
        stock[pick].shift();
        continue;
      }
      // CIP de rutina: al acumular max_run_h de producción sin limpiar (dentro del turno).
      let co = o.ch.min;
      let kind = o.ch.kind;
      let routine = false;
      if (o.runMin + units / rate > model.cip.max_run_h * 60 && co < model.cip.routine_min) {
        co = model.cip.routine_min;
        kind = "cip";
        routine = true;
      }
      if (t >= ctx.horizonEnd) break;
      const end = cal.advance(t, co + units / rate, blocked(m));
      fills.push({ job, filler: m, start: t, end, qty: units, batch: head.batch, changeoverMin: Math.round(co), ...(co > 0 && kind ? { changeoverKind: kind } : {}), ...(routine ? { routine } : {}) });
      const f = filler[m];
      Object.assign(f, { at: end, bulk: job.bulk, format: p.format, runMin: (co > 0 && (kind === "cip" || kind === "alergeno") ? 0 : o.runMin) + units / rate });
      t = end;
      head.kg -= units * job.bulkKg;
      left -= units;
      if (head.kg < job.bulkKg - 1e-9 && left > 0) {
        // Lo que queda no alcanza para un sachet de este pedido: se junta con la tanda siguiente si es del mismo turno;
        // para no complicar, el resto menor a un sachet se cuenta como merma.
        lost(pick, head.kg);
        stock[pick].shift();
      }
    }
    if (left > 0) unscheduled[job.order.id] = (unscheduled[job.order.id] ?? 0) + left;
  }
  // Lo que queda en el pulmón al final del horizonte no tiene pedido: es merma.
  for (const [bulk, list] of Object.entries(stock)) for (const s of list) if (s.kg > 0) lost(bulk, s.kg);
  return { batches, fills, unscheduled, waste };
}

/** Arma el documento `production-plan.v1`. */
export function toPlan(
  ctx: Context,
  portfolio: CustomerOrders,
  result: DispatchResult,
  head: { planId: string; source: PlanSource; solver?: ProductionPlan["solver"]; notes?: string[] },
): ProductionPlan {
  const { model } = ctx;
  const tz = model.timezone;
  const cal = model.calendar;
  const schedule: PlanScheduleRow[] = [];
  const counter: Record<string, number> = {};
  const op = (order: string) => `OP-${order.replace(/^PED-/, "")}-${String((counter[order] = (counter[order] ?? 0) + 1)).padStart(2, "0")}`;
  type Item = { t: number; m: string; row: () => PlanScheduleRow };
  const items: Item[] = [];
  for (const b of result.batches) {
    const line = model.lines[b.bulk];
    items.push({
      t: b.start,
      m: b.equipment,
      row: () => ({ op: op(b.order), order: b.order, product: b.bulk, stage: line.stage, equipment: b.equipment, start: iso(b.start, tz), end: iso(b.end, tz), quantity: line.outKg, unit: "kg", changeover_min: 0, batch_kg: line.batchKg, batch_id: b.id }),
    });
  }
  // Las filas de llenado de un pedido se numeran como lotes [k, de n].
  const perOrder: Record<string, number> = {};
  for (const f of result.fills) perOrder[f.job.order.id] = (perOrder[f.job.order.id] ?? 0) + 1;
  const kth: Record<string, number> = {};
  for (const f of [...result.fills].sort((a, b) => a.start - b.start || a.filler.localeCompare(b.filler))) {
    const k = (kth[f.job.order.id] = (kth[f.job.order.id] ?? 0) + 1);
    const p = model.products[f.job.order.product];
    items.push({
      t: f.start,
      m: f.filler,
      row: () => {
        const row: PlanScheduleRow = { op: op(f.job.order.id), order: f.job.order.id, product: p.id, stage: "llenado", equipment: f.filler, start: iso(f.start, tz), end: iso(f.end, tz), quantity: f.qty, unit: p.unit, changeover_min: f.changeoverMin, batch: [k, perOrder[f.job.order.id]], batch_id: f.batch };
        if (f.changeoverMin && f.changeoverKind) row.changeover_kind = f.changeoverKind;
        if (p.format) row.tooling = p.format;
        return row;
      },
    });
  }
  for (const it of items.sort((a, b) => a.t - b.t || a.m.localeCompare(b.m))) schedule.push(it.row());

  const orders: PlanOrderRow[] = ctx.orders.map((o) => {
    const mine = result.fills.filter((f) => f.job.order.id === o.id);
    const missing = result.unscheduled[o.id] ?? 0;
    const firstBatch = result.batches.filter((b) => b.order === o.id).reduce((m, b) => Math.min(m, b.start), Infinity);
    const startT = Math.min(firstBatch, ...mine.map((f) => f.start), ctx.horizonEnd);
    const doneT = missing > 0 || !mine.length ? ctx.horizonEnd : Math.max(...mine.map((f) => f.end));
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
      late_h: r1(Math.max(0, doneT - parseLocal(o.due)) / 60),
    };
    if (o.importance === "alta") row.urgent = true;
    if (o.added) row.added = true;
    if (missing > 0) row.unscheduled = Math.round(missing);
    return row;
  });

  const downtime: ProductionPlan["downtime"] = [];
  const equipment: ProductionPlan["equipment"] = {};
  const work = cal.workBetween(ctx.start, ctx.horizonEnd);
  const busyOf = (rows: { start: number; end: number }[]) => rows.reduce((s, r) => s + cal.workBetween(r.start, r.end), 0);
  for (const [k, list] of Object.entries(ctx.down)) {
    const shown = model.lines[k]?.equipment[0] ?? k;
    for (const [a, b, why] of list) downtime.push({ equipment: shown, start: iso(a, tz), end: iso(b, tz), reason: why });
  }
  for (const line of Object.values(model.lines))
    for (const eq of line.equipment) {
      const busy = busyOf(result.batches.filter((b) => b.equipment === eq));
      const lost = eq === line.equipment[0] ? (ctx.down[line.bulk] ?? []).reduce((s, [a, b]) => s + cal.workBetween(a, b), 0) : 0;
      equipment[eq] = { busy_pct: work ? r1((100 * busy) / work) : 0, down_h: r1(lost / 60) };
    }
  for (const m of model.fillers) {
    const busy = busyOf(result.fills.filter((f) => f.filler === m));
    equipment[m] = { busy_pct: work ? r1((100 * busy) / work) : 0, down_h: r1((ctx.down[m] ?? []).reduce((s, [a, b]) => s + cal.workBetween(a, b), 0) / 60) };
  }
  downtime.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.equipment.localeCompare(b.equipment)));

  // La ocupación de una línea es la de todos sus equipos juntos (una tanda a la vez).
  const lineBusy = Object.values(model.lines).map((l) => ({ equipment: l.equipment[0], busy_pct: work ? r1((100 * busyOf(result.batches.filter((b) => b.bulk === l.bulk))) / work) : 0 }));
  const late = orders.filter((o) => o.late_h > 0);
  const co = result.fills.filter((f) => f.changeoverMin > 0);
  const cip = co.filter((f) => f.changeoverKind === "cip" || f.changeoverKind === "alergeno");
  const busiest = [...lineBusy, ...model.fillers.map((m) => ({ equipment: m, busy_pct: equipment[m].busy_pct }))].sort((a, b) => b.busy_pct - a.busy_pct)[0];
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
    load_pct: model.loadPct,
    calendar: { workdays: cal.workdays, shifts: cal.shifts },
    orders: orders.sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : a.id.localeCompare(b.id))),
    schedule,
    downtime,
    equipment,
    products: Object.values(model.products).map((p) => ({ id: p.id, name: p.name, unit: p.unit, colors: [] })),
    kpis: {
      orders: orders.length,
      on_time_pct: orders.length ? r1((100 * (orders.length - late.length)) / orders.length) : 100,
      late_orders: late.length,
      tardiness_h: r1(late.reduce((s, o) => s + o.late_h, 0)),
      changeovers: co.length,
      changeover_h: r1(co.reduce((s, f) => s + f.changeoverMin, 0) / 60),
      cip_h: r1(cip.reduce((s, f) => s + f.changeoverMin, 0) / 60),
      waste_kg: r1(Object.values(result.waste).reduce((s, x) => s + x, 0)),
      busiest,
    },
    ...(head.solver ? { solver: head.solver } : {}),
    ...(ctx.now > ctx.start ? { frozen_until: iso(ctx.now, tz) } : {}),
    ...(head.notes ? { notes: head.notes } : {}),
  };
}
