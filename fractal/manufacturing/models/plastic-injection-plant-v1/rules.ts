/**
 * Evaluador rápido de Fractal para plásticos: reglas de despacho de la empresa, sin cosimulador (sin HiGHS).
 *
 * Reglas (las que usaría un programador a mano):
 * - los pedidos van por fecha de entrega; uno con importancia alta se adelanta como si venciera 2 días antes;
 * - cada trabajo va a la máquina compatible menos cargada; con "un color por máquina", primero a las que ya tienen
 *   ese color montado;
 * - los tiempos (turnos, paradas, montajes, purgas, espera de componentes) los pone el mismo despacho del
 *   cosimulador (plan.ts), así el plan se ve en el Gantt y en el 3D igual que cualquier otro.
 *
 * También simula la ejecución de un plan con imprevistos (Monte Carlo) para estimar la probabilidad de cumplir.
 */
import type { CustomerOrders, PlannedStop, PlantEvent, ProductionPlan } from "@twin/cosim/core/contracts.ts";
import { iso, parseLocal } from "@twin/cosim/core/time.ts";
import type { PlasticsModel, ProductInfo, Step } from "@twin/cosim/adapters/plastic-injection-plant-v1/model.ts";
import { context, dispatch, toPlan, WEIGHT, type Chunk, type Job } from "@twin/cosim/adapters/plastic-injection-plant-v1/plan.ts";
import { editedPlan, queuesOf } from "@twin/cosim/adapters/plastic-injection-plant-v1/manual.ts";
import type { Rng } from "@twin/fractal-core";

/** Cuánto se adelanta en la cola un pedido de importancia alta (minutos). */
const RUSH_AHEAD_MIN = 2 * 1440;
/** Variación del tiempo de ciclo en la simulación de imprevistos: ±5 % por etapa (supuesto de la demo). */
export const CYCLE_SPREAD = 0.05;
/** Días hacia adelante en los que pueden caer fallas imprevistas. */
const FAILURE_DAYS = 7;

export interface RulesOptions {
  now?: string;
  previous?: ProductionPlan | null;
  events?: PlantEvent[];
  stops?: PlannedStop[];
  fixed?: string[];
  dedicateColors?: boolean;
  planId?: string;
}

/** Programación por reglas: misma forma que la del cosimulador (production-plan.v1). */
export function rulesPlan(model: PlasticsModel, portfolio: CustomerOrders, opt: RulesOptions = {}): ProductionPlan {
  const ctx = context(model, portfolio, opt.now, opt.previous, opt.events, opt.stops, opt.fixed);
  const queues: Record<string, Chunk[]> = Object.fromEntries(model.machines.map((m) => [m, []]));
  const load: Record<string, number> = Object.fromEntries(model.machines.map((m) => [m, Math.max(0, ctx.free[m].at - ctx.now)]));
  const urgency = (j: Job) => j.due - (j.weight > WEIGHT.normal ? RUSH_AHEAD_MIN : 0);
  const jobs = ctx.jobs.filter((j) => j.qty - (ctx.done[j.key] ?? 0) > 0.5).sort((a, b) => urgency(a) - urgency(b) || a.order.id.localeCompare(b.order.id) || Number(a.final) - Number(b.final));
  for (const j of jobs) {
    let machines = j.step.machines.filter((m) => queues[m]);
    if (!machines.length) continue;
    if (opt.dedicateColors && j.color) {
      const same = machines.filter((m) => model.initialColor[m] === j.color);
      if (same.length) machines = same;
    }
    const m = [...machines].sort((a, b) => load[a] - load[b] || a.localeCompare(b))[0];
    const qty = j.qty - (ctx.done[j.key] ?? 0);
    queues[m].push({ job: j, qty, notBefore: 0 });
    load[m] += qty * j.step.unitMin;
  }
  return toPlan(ctx, portfolio, dispatch(ctx, queues), { planId: opt.planId ?? "REGLAS", source: "fractal", notes: ["Programación por reglas de despacho (entrega, importancia, máquina menos cargada)."] });
}

/** El mismo modelo con el tiempo de ciclo de cada etapa variado al azar (±CYCLE_SPREAD). */
export function noisyModel(model: PlasticsModel, rng: Rng): PlasticsModel {
  const factor = new Map<string, number>();
  const step = (s: Step): Step => {
    const k = `${s.product}|${s.stage}`;
    if (!factor.has(k)) factor.set(k, 1 + CYCLE_SPREAD * (2 * rng() - 1));
    return { ...s, unitMin: s.unitMin * factor.get(k)! };
  };
  const products: Record<string, ProductInfo> = {};
  for (const [id, p] of Object.entries(model.products)) products[id] = { ...p, final: step(p.final), components: p.components.map((c) => ({ ...c, step: step(c.step) })) };
  return { ...model, products };
}

/**
 * Fallas imprevistas al azar con los datos de la planta (demand.yaml, downtime): cada inyectora, cada día, tiene
 * `per_day_pct` % de probabilidad de una parada de `hours` horas, en algún momento del turno.
 */
export function randomFailures(model: PlasticsModel, rng: Rng, now: number): PlantEvent[] {
  const d = model.downtime;
  if (!d) return [];
  const out: PlantEvent[] = [];
  const [h0, h1] = d.hours;
  for (const m of model.machines)
    for (let day = 0; day < FAILURE_DAYS; day++) {
      if (rng() >= d.per_day_pct / 100) continue;
      const start = model.calendar.nextWork(now + day * 1440 + Math.floor(rng() * 1440));
      const hours = h0 + (h1 - h0) * rng();
      out.push({ contract: "plant-event.v1", id: `MC-${m}-${day}`, plant: model.plant, equipment: m, kind: "falla", reason: d.reasons[Math.floor(rng() * d.reasons.length)] ?? "falla", start: iso(start, model.timezone), est_end: iso(start + hours * 60, model.timezone) });
    }
  return out;
}

/**
 * Ejecuta las colas de un plan (el orden y la máquina de cada lote desde AHORA) con imprevistos y devuelve los
 * pedidos tarde que quedarían. El plan no se recalcula: se ve qué le pasa si la planta lo sigue tal cual.
 */
export function replayWithNoise(model: PlasticsModel, portfolio: CustomerOrders, plan: ProductionPlan, opt: RulesOptions, rng: Rng): { late: number; tardiness_h: number } {
  const now = opt.now ?? portfolio.plan_start;
  const noisy = noisyModel(model, rng);
  const events = [...(opt.events ?? []), ...randomFailures(model, rng, parseLocal(now))];
  const p = editedPlan(noisy, portfolio, { contract: "manual-edit.v1", plan_id: plan.plan_id, author: "Fractal (Monte Carlo)", queues: queuesOf(plan, now), moves: [] }, { ...opt, events });
  return { late: p.kpis.late_orders, tardiness_h: p.kpis.tardiness_h };
}
