/**
 * Cosimulador de salsas en modo solver: programa lineal por turnos (HiGHS) sobre las líneas de proceso.
 *
 * El cuello de botella es el proceso, así que el modelo reparte los kilos de granel de cada pedido entre los turnos de
 * su línea. Variables: kilos de cada pedido en cada turno (continuas) y lo que queda sin programar (muy penalizado).
 * Restricciones:
 *   1. cada pedido se hace completo (o queda como faltante);
 *   2. capacidad de cada línea en cada turno: las tandas enteras que caben en el día (no pasan de un día a otro),
 *      repartidas por minutos de turno sin paradas, con 3 % de holgura para lo que se vence en el pulmón;
 *   3. nada se produce antes de que llegue el pedido.
 * Objetivo: atraso ponderado por importancia (alta 3, normal 1, baja 0,5) + un empujón mínimo a producir temprano.
 *
 * Después, cada línea toma sus pedidos en el orden de los turnos (sin esperar el inicio del turno: si la línea queda
 * libre antes, sigue); dentro del turno, agrupados por SKU (menos cambios de formato y
 * de granel en las llenadoras compartidas) y por entrega. El despacho elige la llenadora que pueda empezar antes, con
 * preferencia por la habitual: así la multipropósito solo se usa cuando ayuda (por ejemplo, si la otra falla).
 */
import type { CustomerOrders, ProductionPlan } from "@twin/cosim-core";
import type { SauceModel } from "./model.ts";
import { context, dispatch, toPlan, type Chunk, type ContextOptions, type Job } from "./plan.ts";

const MISSING_PENALTY = 1000;
const EARLY_NUDGE = 1e-3;
const SLACK = 0.97;
/** Holgura de una línea con varias recetas: además del pulmón, los cambios de receta (unos 45 min por turno). */
const MULTI_SLACK = 0.9;

/** Lo mínimo que usamos de highs-js. */
export interface HighsLike {
  solve(problem: string, options?: Record<string, unknown>): { Status: string; ObjectiveValue: number; Columns: Record<string, object> };
}

export interface SolveOptions extends ContextOptions {
  planId?: string;
  timeLimitS?: number;
}

interface Bucket {
  start: number;
  end: number;
}

export function solve(highs: HighsLike, model: SauceModel, portfolio: CustomerOrders, opt: SolveOptions = {}): ProductionPlan {
  const t0 = performance.now();
  const ctx = context(model, portfolio, opt);
  const cal = model.calendar;
  const buckets: Bucket[] = cal.shiftsBetween(ctx.start, ctx.horizonEnd).filter((s) => s.end > ctx.now);
  const B = buckets.length;
  const remaining = (j: Job) => Math.max(0, j.qty - (ctx.done[j.order.id] ?? 0));
  const jobs = [...ctx.jobs.values()].filter((j) => remaining(j) > 0);

  /** Kilos que puede hacer una línea en un turno (de cualquiera de sus recetas: todas tienen la misma tanda). */
  const capKg = (lid: string, bk: Bucket) => {
    const a = Math.max(bk.start, ctx.lineFree[lid]);
    if (a >= bk.end) return 0;
    let free = bk.end - a;
    for (const [s, e] of ctx.down[lid] ?? []) free -= Math.max(0, Math.min(e, bk.end) - Math.max(s, a));
    // Las tandas son enteras y no pasan de un día a otro: en el día caben floor(minutos del día ÷ minutos de tanda)
    // tandas, y cada turno se lleva su parte. Una línea con varias recetas guarda tiempo para los cambios.
    const line = model.lines[lid];
    const dayMin = cal.workBetween(Math.floor(bk.start / 1440) * 1440, Math.floor(bk.start / 1440) * 1440 + 1440);
    const perMin = dayMin > 0 ? (Math.floor(dayMin / line.batchMin) * line.outKg) / dayMin : 0;
    return Math.max(0, (line.bulks.length > 1 ? MULTI_SLACK : SLACK) * free * perMin);
  };
  const cap = Object.fromEntries(Object.keys(model.lines).map((k) => [k, buckets.map((bk) => capKg(k, bk))]));
  const wrap = (terms: string[]) => terms.reduce((out, t, i) => out + (i && i % 12 === 0 ? "\n   " : " ") + t, "").trim();
  const term = (c: number, v: string) => `${c >= 0 ? "+" : "-"} ${Math.abs(c).toFixed(9)} ${v}`;
  const vars = new Map<string, { job: Job; b: number }>();
  const obj: string[] = [];
  const rows: string[] = [];
  const bounds: string[] = [];
  const lineTerms = new Map<string, string[]>();
  jobs.forEach((j, ji) => {
    const kg = remaining(j) * j.bulkKg;
    const names: string[] = [];
    buckets.forEach((bk, b) => {
      if (bk.end <= j.release || cap[j.line][b] <= 0) return;
      const v = `x${ji}_${b}`;
      names.push(v);
      vars.set(v, { job: j, b });
      const lateH = Math.max(0, bk.end - j.due) / 60;
      const c = (j.weight * lateH) / kg + (EARLY_NUDGE * b) / (B * kg);
      if (c > 1e-12) obj.push(term(c, v));
      bounds.push(`0 <= ${v} <= ${cap[j.line][b].toFixed(3)}`);
      const key = `${j.line}|${b}`;
      (lineTerms.get(key) ?? lineTerms.set(key, []).get(key)!).push(`+ ${v}`);
    });
    const miss = `s${ji}`;
    obj.push(term((MISSING_PENALTY * j.weight) / kg, miss));
    bounds.push(`0 <= ${miss} <= ${kg.toFixed(3)}`);
    rows.push(` d${ji}: ${wrap([...names.map((v) => `+ ${v}`), `+ ${miss}`])} = ${kg.toFixed(3)}`);
  });
  let n = 0;
  for (const [key, ts] of lineTerms) {
    const [lid, b] = key.split("|");
    rows.push(` c${n++}: ${wrap(ts)} <= ${cap[lid][Number(b)].toFixed(3)}`);
  }
  const lp = ["Minimize", ` obj: ${wrap(obj) || "0 s0"}`, "Subject To", ...rows, "Bounds", ...bounds, "End"].join("\n");
  const res = highs.solve(lp, { time_limit: opt.timeLimitS ?? 20, presolve: "on" });
  if (!["Optimal", "Time limit reached"].includes(res.Status)) throw new Error(`El solver no encontró programación: ${res.Status}`);

  // Kilos por pedido y turno → unidades enteras sin perder el total del pedido.
  const amounts: { job: Job; b: number; qty: number }[] = [];
  for (const [name, col] of Object.entries(res.Columns)) {
    const v = vars.get(name);
    const primal = (col as { Primal?: number }).Primal ?? 0;
    if (v && primal > 1e-6) amounts.push({ ...v, qty: primal / v.job.bulkKg });
  }
  const byJob = new Map<string, typeof amounts>();
  for (const a of amounts) (byJob.get(a.job.order.id) ?? byJob.set(a.job.order.id, []).get(a.job.order.id)!).push(a);
  for (const list of byJob.values()) {
    const exact = list.reduce((s, a) => s + a.qty, 0);
    list.forEach((a) => (a.qty = Math.floor(a.qty)));
    const diff = Math.round(exact) - list.reduce((s, a) => s + a.qty, 0);
    list.sort((a, b) => a.b - b.b)[list.length - 1].qty += diff;
  }

  const queues: Record<string, Chunk[]> = Object.fromEntries(Object.keys(model.lines).map((k) => [k, []]));
  // Dentro de cada turno, las recetas de la línea en su orden (de claro a oscuro, de suave a picante) siguiendo desde
  // la última que corrió: así la línea avanza y solo se devuelve (CIP completo) cuando da la vuelta.
  const cur: Record<string, string | undefined> = Object.fromEntries(Object.entries(ctx.lineState).map(([k, v]) => [k, v.bulk]));
  const byBucket = new Map<string, typeof amounts>();
  for (const a of amounts.filter((x) => x.qty > 0)) (byBucket.get(`${a.job.line}|${a.b}`) ?? byBucket.set(`${a.job.line}|${a.b}`, []).get(`${a.job.line}|${a.b}`)!).push(a);
  for (const lid of Object.keys(model.lines))
    for (let b = 0; b < B; b++) {
      const list = byBucket.get(`${lid}|${b}`);
      if (!list) continue;
      const from = cur[lid] ? model.bulks[cur[lid]!].order : 0;
      const rank = (bulk: string) => (model.bulks[bulk].order - from + model.lines[lid].bulks.length) % model.lines[lid].bulks.length;
      list.sort((x, y) => rank(x.job.bulk) - rank(y.job.bulk) || x.job.order.product.localeCompare(y.job.order.product) || x.job.due - y.job.due || x.job.order.id.localeCompare(y.job.order.id));
      for (const a of list) queues[lid].push({ job: a.job, qty: a.qty, notBefore: ctx.now });
      cur[lid] = list[list.length - 1].job.bulk;
    }
  const result = dispatch(ctx, queues);
  for (const j of jobs) {
    const planned = (byJob.get(j.order.id) ?? []).reduce((s, a) => s + Math.max(0, a.qty), 0);
    const missing = remaining(j) - planned;
    if (missing > 0) result.unscheduled[j.order.id] = (result.unscheduled[j.order.id] ?? 0) + missing;
  }
  const seconds = (performance.now() - t0) / 1000;
  return toPlan(ctx, portfolio, result, {
    planId: opt.planId ?? "APS-SOL-01",
    source: "solver",
    solver: { status: res.Status, seconds: Math.round(seconds * 100) / 100, variables: vars.size + jobs.length, constraints: rows.length, objective: Math.round(res.ObjectiveValue * 100) / 100 },
  });
}
