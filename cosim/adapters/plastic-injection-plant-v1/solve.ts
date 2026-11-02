/**
 * Cosimulador en modo solver: de los pedidos a la secuencia de producción con restricciones lineales (MILP).
 *
 * Cada turno es una cubeta de tiempo. Variables: unidades de cada trabajo en cada máquina y turno (continuas) y, en
 * las máquinas que cambian de referencia (molde + color), si el turno corre esa referencia (binarias). Restricciones:
 *   1. cada trabajo se hace completo (o queda como faltante, muy penalizado);
 *   2. capacidad de cada máquina en cada turno: minutos de turno menos paradas, menos los cambios de referencia
 *      (montaje de molde y purgas de resina y color, con los tiempos de catalog/changeovers.yaml);
 *   3. una máquina solo produce una referencia en un turno si esa referencia está "encendida" en el turno;
 *   4. el ensamble acumulado hasta un turno no supera los componentes hechos hasta el turno anterior;
 *   5. nada se produce antes de que llegue el pedido.
 * Objetivo: atraso ponderado por importancia (alta 3, normal 1, baja 0,5) + 0,5 por cada referencia encendida en un
 * turno (cambios) + un empujón mínimo a producir temprano. HiGHS (compilado a WebAssembly) lo resuelve en el navegador.
 */
import type { CustomerOrders, PlannedStop, PlantEvent, ProductionPlan } from "../../core/contracts.ts";
import { blockedOf, context, dispatch, toPlan, type Chunk, type Context, type Job } from "./plan.ts";
import type { PlasticsModel } from "./model.ts";

export const COLOR_WEIGHT = 0.5;
const MISSING_PENALTY = 1000;
const EARLY_NUDGE = 1e-3;

/** Lo mínimo que usamos de highs-js. */
export interface HighsLike {
  solve(problem: string, options?: Record<string, unknown>): {
    Status: string;
    ObjectiveValue: number;
    Columns: Record<string, object>;
  };
}

interface Bucket {
  start: number;
  end: number;
}

export interface SolveOptions {
  /** Instante desde el que se replanea (ISO); lo anterior queda congelado. */
  now?: string;
  previous?: ProductionPlan | null;
  planId?: string;
  timeLimitS?: number;
  /** Purgas de color como variables binarias (MILP). Más fino pero lento en el navegador; sin esto es un LP puro
   * y el despacho agrupa los colores dentro de cada turno. */
  colors?: boolean;
  /** Fallas y paros del emulador (plant-event.v1). */
  events?: PlantEvent[];
  /** Paradas decididas desde AHORA (montaje de un molde). */
  stops?: PlannedStop[];
  /** Pedidos fijados por el planificador: sus lotes de `previous` no se mueven y el resto se organiza alrededor. */
  fixed?: string[];
  /** Cada color va solo a las máquinas que lo tienen montado en setup.yaml (si alguna lo tiene): menos purgas. */
  dedicateColors?: boolean;
}

/** Arma el modelo LP (formato CPLEX LP que lee HiGHS). Exportado para las pruebas. */
export function buildLp(ctx: Context, colors = false): { lp: string; vars: Map<string, { job: Job; machine: string; b: number }>; buckets: Bucket[]; nVars: number; nRows: number } {
  const { model } = ctx;
  const cal = model.calendar;
  const buckets: Bucket[] = cal.shiftsBetween(ctx.start, ctx.horizonEnd).filter((s) => s.end > ctx.now);
  const remaining = (j: Job) => Math.max(0, j.qty - (ctx.done[j.key] ?? 0));
  const jobs = ctx.jobs.filter((j) => remaining(j) > 0.5);

  /** Minutos disponibles de una máquina en un turno. */
  const cap = (m: string, bk: Bucket) => {
    const a = Math.max(bk.start, ctx.free[m].at);
    if (a >= bk.end) return 0;
    let free = bk.end - a;
    for (const [s, e] of blockedOf(ctx, m)) free -= Math.max(0, Math.min(e, bk.end) - Math.max(s, a));
    return Math.max(0, free);
  };
  // Una referencia es molde + color. Las máquinas que corren más de una tienen cambios (montaje y purgas).
  const refOf = (j: Job) => `${j.step.tooling ?? "-"}|${j.color ?? "-"}`;
  const refsOf = (m: string) => [...new Set(jobs.filter((j) => j.step.machines.includes(m)).map(refOf))];
  /** El cambio más largo entre dos referencias de la máquina, según los datos (changeovers.yaml y change_min). */
  const maxChange = (m: string) => {
    const refs = refsOf(m).map((r) => r.split("|").map((x) => (x === "-" ? undefined : x)));
    let worst = 0;
    for (const [ta, ca] of refs) for (const [tb, cb] of refs) worst = Math.max(worst, model.changeover({ tooling: ta, color: ca }, { tooling: tb, color: cb }).min);
    return worst;
  };
  const change = new Map(model.machines.map((m) => [m, maxChange(m)]));
  const multi = new Set(colors ? model.machines.filter((m) => refsOf(m).length > 1 && change.get(m)! > 0) : []);
  // Sin binarias, cada turno de una máquina con varias referencias reserva su cambio más largo (así el despacho nunca
  // se pasa del turno).
  const reserve = (m: string) => (!colors && refsOf(m).length > 1 ? change.get(m)! : 0);
  // Holgura de 1 % por turno para que el redondeo a unidades enteras no desborde el turno.
  const capacity = model.machines.map((m) => buckets.map((bk) => Math.max(0, 0.99 * cap(m, bk) - reserve(m))));
  const mi = new Map(model.machines.map((m, i) => [m, i]));

  const vars = new Map<string, { job: Job; machine: string; b: number }>();
  const jobVars: string[][] = [];
  const obj: string[] = [];
  const rows: string[] = [];
  const bounds: string[] = [];
  const binaries: string[] = [];
  const machineTerms: Map<string, string[]> = new Map();
  const colorTerms: Map<string, string[]> = new Map();
  /** Parte una expresión larga en renglones cortos (el lector LP de HiGHS en WebAssembly falla con renglones enormes). */
  const wrap = (terms: string[]) => terms.reduce((out, t, i) => out + (i && i % 12 === 0 ? "\n   " : " ") + t, "").trim();
  const term = (c: number, v: string) => `${c >= 0 ? "+" : "-"} ${Math.abs(c).toFixed(9)} ${v}`;
  const B = buckets.length;

  jobs.forEach((j, ji) => {
    const q = remaining(j);
    const names: string[] = [];
    for (const m of j.step.machines) {
      const k = mi.get(m)!;
      buckets.forEach((bk, b) => {
        if (bk.end <= j.release || capacity[k][b] <= 0) return;
        const v = `x${ji}_${k}_${b}`;
        names.push(v);
        vars.set(v, { job: j, machine: m, b });
        const lateH = j.final ? Math.max(0, bk.end - j.due) / 60 : 0;
        const c = (j.weight * lateH) / j.order.quantity + (EARLY_NUDGE * b) / (B * q);
        if (c > 1e-9) obj.push(term(c, v));
        bounds.push(`0 <= ${v} <= ${(capacity[k][b] / j.step.unitMin).toFixed(3)}`);
        const key = `${k}_${b}`;
        (machineTerms.get(key) ?? machineTerms.set(key, []).get(key)!).push(term(j.step.unitMin, v));
        if (multi.has(m)) {
          const ck = `${k}_${b}_${refsOf(m).indexOf(refOf(j))}`;
          (colorTerms.get(ck) ?? colorTerms.set(ck, []).get(ck)!).push(v);
        }
      });
    }
    jobVars.push(names);
    const miss = `s${ji}`;
    obj.push(term((MISSING_PENALTY * j.weight) / q, miss));
    bounds.push(`0 <= ${miss} <= ${q}`);
    rows.push(` d${ji}: ${wrap([...names.map((v) => `+ ${v}`), `+ ${miss}`])} = ${q}`);
  });

  // Capacidad por máquina y turno, con los cambios de referencia en las máquinas que corren varias.
  for (const [key, ts] of machineTerms) {
    const [k, b] = key.split("_").map(Number);
    const m = model.machines[k];
    if (multi.has(m)) {
      const ys = refsOf(m).map((_, c) => `y${k}_${b}_${c}`);
      const cm = change.get(m)!;
      rows.push(` c${key}: ${wrap([...ts, ...ys.map((y) => `+ ${cm} ${y}`)])} <= ${(capacity[k][b] + cm).toFixed(3)}`);
    } else rows.push(` c${key}: ${wrap(ts)} <= ${capacity[k][b].toFixed(3)}`);
  }
  // Una referencia solo corre en el turno si está encendida.
  for (const [ck, vs] of colorTerms) {
    const [k, b] = ck.split("_").map(Number);
    const y = `y${ck}`;
    if (!binaries.includes(y)) {
      binaries.push(y);
      obj.push(term(COLOR_WEIGHT, y));
    }
    const big = (capacity[k][b] / Math.min(...vs.map((v) => vars.get(v)!.job.step.unitMin))).toFixed(3);
    rows.push(` k${ck}: ${wrap([...vs.map((v) => `+ ${v}`), `- ${big} ${y}`])} <= 0`);
  }
  // El ensamble acumulado no pasa a los componentes hechos hasta el turno anterior.
  jobs.forEach((j, ji) => {
    if (!j.components.length) return;
    j.components.forEach((c, cn) => {
      const ci = jobs.findIndex((x) => x.key === c.key);
      const head = (ctx.done[c.key] ?? 0) - (ctx.done[j.key] ?? 0) * c.qty;
      for (let b = 0; b < B; b++) {
        const asm = jobVars[ji].filter((v) => vars.get(v)!.b <= b);
        if (!asm.length) continue;
        const comp = ci >= 0 ? jobVars[ci].filter((v) => vars.get(v)!.b <= b - 1) : [];
        rows.push(` p${ji}_${cn}_${b}: ${wrap([...asm.map((v) => `+ ${c.qty} ${v}`), ...comp.map((v) => `- ${v}`)])} <= ${head.toFixed(3)}`);
      }
    });
  });

  const lp = [
    "Minimize",
    ` obj: ${wrap(obj) || "0 s0"}`,
    "Subject To",
    ...rows,
    "Bounds",
    ...bounds,
    ...(binaries.length ? ["Binary", ...binaries.map((y) => ` ${y}`)] : []),
    "End",
  ].join("\n");
  return { lp, vars, buckets, nVars: vars.size + jobs.length + binaries.length, nRows: rows.length };
}

/** Resuelve la cartera y devuelve la programación propuesta por el cosimulador. */
export function solve(highs: HighsLike, model: PlasticsModel, portfolio: CustomerOrders, opt: SolveOptions = {}): ProductionPlan {
  const ctx = context(model, portfolio, opt.now, opt.previous, opt.events, opt.stops, opt.fixed);
  if (opt.dedicateColors)
    for (const j of ctx.jobs) {
      const own = j.step.machines.filter((m) => model.initialColor[m] === j.color);
      if (own.length && own.length < j.step.machines.length) j.step = { ...j.step, machines: own };
    }
  const t0 = performance.now();
  const { lp, vars, buckets, nVars, nRows } = buildLp(ctx, opt.colors);
  const res = highs.solve(lp, { time_limit: opt.timeLimitS ?? 20, mip_rel_gap: 0.01, presolve: "on" });
  const seconds = (performance.now() - t0) / 1000;
  if (!["Optimal", "Time limit reached"].includes(res.Status)) throw new Error(`El solver no encontró programación: ${res.Status}`);

  // Unidades por trabajo, máquina y turno, redondeadas sin perder el total de cada trabajo.
  const amounts = new Map<string, { job: Job; machine: string; b: number; qty: number }>();
  for (const [name, col] of Object.entries(res.Columns)) {
    const v = vars.get(name);
    const primal = (col as { Primal?: number }).Primal ?? 0;
    if (!v || primal < 0.5) continue;
    amounts.set(name, { ...v, qty: primal });
  }
  const byJob = new Map<string, { job: Job; machine: string; b: number; qty: number }[]>();
  for (const a of amounts.values()) (byJob.get(a.job.key) ?? byJob.set(a.job.key, []).get(a.job.key)!).push(a);
  // Unidades enteras sin perder el total de cada trabajo. Los lotes (aps.yaml) se marcan al publicar el plan.
  for (const list of byJob.values()) {
    const exact = list.reduce((s, a) => s + a.qty, 0);
    list.forEach((a) => (a.qty = Math.round(a.qty)));
    const diff = Math.round(exact) - list.reduce((s, a) => s + a.qty, 0);
    list.sort((a, b) => b.qty - a.qty)[0].qty += diff;
  }

  // Tramos por máquina: turno a turno; dentro del turno, primero la referencia montada, luego las demás agrupadas
  // (molde y color) y por entrega.
  const queues: Record<string, Chunk[]> = {};
  const color: Record<string, string | undefined> = Object.fromEntries(model.machines.map((m) => [m, ctx.free[m].color]));
  const tooling: Record<string, string | undefined> = Object.fromEntries(model.machines.map((m) => [m, ctx.free[m].tooling]));
  const ref = (t?: string, c?: string) => `${t ?? ""}|${c ?? ""}`;
  for (const m of model.machines) {
    queues[m] = [];
    for (let b = 0; b < buckets.length; b++) {
      const here = [...amounts.values()].filter((a) => a.machine === m && a.b === b && a.qty > 0);
      const mounted = ref(tooling[m], color[m]);
      const refA = (a: { job: Job }) => ref(a.job.step.tooling ?? tooling[m], a.job.color ?? color[m]);
      here.sort((x, y) => Number(refA(x) !== mounted) - Number(refA(y) !== mounted) || refA(x).localeCompare(refA(y)) || x.job.due - y.job.due);
      for (const a of here) {
        queues[m].push({ job: a.job, qty: a.qty, notBefore: buckets[b].start });
        color[m] = a.job.color ?? color[m];
        tooling[m] = a.job.step.tooling ?? tooling[m];
      }
    }
  }
  const result = dispatch(ctx, queues);
  return toPlan(ctx, portfolio, result, {
    planId: opt.planId ?? "APS-SOL-01",
    source: "solver",
    ...(ctx.fixed.length ? { notes: [`${ctx.fixed.length} pedido${ctx.fixed.length === 1 ? "" : "s"} fijado${ctx.fixed.length === 1 ? "" : "s"} por el planificador no se movi${ctx.fixed.length === 1 ? "ó" : "eron"}: ${ctx.fixed.join(", ")}. El resto se organizó alrededor.`] } : {}),
    solver: { status: res.Status, seconds: Math.round(seconds * 100) / 100, variables: nVars, constraints: nRows, objective: Math.round(res.ObjectiveValue * 100) / 100 },
  });
}
