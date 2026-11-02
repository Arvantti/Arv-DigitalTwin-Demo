/**
 * Programación manual: la secuencia que escribió el planificador para cada máquina (aps/plans/APS-MAN-*.json) y los
 * ajustes a mano que se hacen en el Gantt del APS arrastrando órdenes.
 *
 * El planificador solo decide el orden de los pedidos en cada máquina (y, si quiere, desde qué hora arranca uno); los
 * tiempos los calcula el mismo despacho del cosimulador (turnos, paradas, purgas de color y espera de componentes).
 * Los pedidos que no están en la secuencia (llegaron después o se agregaron en la pantalla de pedidos) van al final de
 * la máquina menos cargada, por entrega.
 */
import type { CustomerOrders, PlannedStop, PlantEvent, ProductionPlan } from "../../core/contracts.ts";
import { parseLocal } from "../../core/time.ts";
import { context, dispatch, toPlan, type Chunk, type Context, type Job } from "./plan.ts";
import type { PlasticsModel } from "./model.ts";

export interface ManualPlan {
  contract: "manual-sequence.v1";
  plan_id: string;
  plant: string;
  portfolio_id: string;
  author: string;
  note?: string;
  /** Por máquina, los pedidos en el orden en que se van a producir. */
  sequence: Record<string, string[]>;
}

/** Un tramo de la secuencia editada: un trabajo (`pedido/producto`), cuántas unidades y desde cuándo. */
export interface EditChunk {
  job: string;
  /** Unidades; sin valor, todo lo que falta del trabajo. */
  qty?: number;
  /** Fecha fijada a mano ("AAAA-MM-DDTHH:MM", hora de la planta): el tramo no arranca antes. */
  notBefore?: string;
  /** Solo informativo: cuándo arrancaba en el plan del que salió la cola. */
  start?: string;
}

/** Programación ajustada a mano en el Gantt: la cola de cada máquina desde AHORA y los movimientos hechos. */
export interface ManualEdit {
  contract: "manual-edit.v1";
  plan_id: string;
  author: string;
  queues: Record<string, EditChunk[]>;
  /** Lo que hizo el planificador, en palabras, del más viejo al más reciente. */
  moves: string[];
}

type Opt = { now?: string; previous?: ProductionPlan | null; events?: PlantEvent[]; stops?: PlannedStop[]; fixed?: string[] };

/** Colas por máquina para el despacho. Lo que no quedó en ninguna cola va al final de la máquina menos cargada. */
function build(ctx: Context, model: PlasticsModel, seq: Record<string, { key: string; qty?: number; notBefore?: number }[]>) {
  const queues: Record<string, Chunk[]> = Object.fromEntries(model.machines.map((m) => [m, []]));
  const load: Record<string, number> = Object.fromEntries(model.machines.map((m) => [m, 0]));
  const given: Record<string, number> = {};
  const left = (j: Job) => Math.max(0, j.qty - (ctx.done[j.key] ?? 0) - (given[j.key] ?? 0));
  const put = (m: string, j: Job, qty: number, notBefore = 0) => {
    const q = Math.min(qty, left(j));
    if (q <= 0) return;
    queues[m].push({ job: j, qty: q, notBefore });
    load[m] += q * j.step.unitMin;
    given[j.key] = (given[j.key] ?? 0) + q;
  };
  const byKey = new Map(ctx.jobs.map((j) => [j.key, j]));
  for (const [m, list] of Object.entries(seq)) {
    if (!queues[m]) continue;
    for (const c of list) {
      const j = byKey.get(c.key);
      if (j && j.step.machines.includes(m)) put(m, j, c.qty ?? Infinity, c.notBefore);
    }
  }
  const rest = ctx.jobs.filter((j) => left(j) > 0).sort((a, b) => a.due - b.due || a.order.id.localeCompare(b.order.id));
  for (const j of rest) put([...j.step.machines].sort((a, b) => load[a] - load[b])[0], j, Infinity);
  return { queues, extra: rest.filter((j) => j.final).length };
}

export function manualPlan(model: PlasticsModel, portfolio: CustomerOrders, manual: ManualPlan, opt: Opt = {}): ProductionPlan {
  const ctx = context(model, portfolio, opt.now, opt.previous, opt.events, opt.stops, opt.fixed);
  const seq: Record<string, { key: string }[]> = {};
  for (const [m, ids] of Object.entries(manual.sequence)) seq[m] = ids.flatMap((id) => ctx.jobs.filter((x) => x.order.id === id && x.step.machines.includes(m)).map((j) => ({ key: j.key })));
  const { queues, extra } = build(ctx, model, seq);
  return toPlan(ctx, portfolio, dispatch(ctx, queues), {
    planId: manual.plan_id,
    source: "manual",
    notes: [`Secuencia escrita por ${manual.author}.`, ...(extra ? [`${extra} pedido${extra > 1 ? "s" : ""} fuera de la secuencia, al final por fecha de entrega.`] : [])],
  });
}

/**
 * Colas por máquina de lo que un plan todavía no ha empezado a las `now`: lotes seguidos del mismo trabajo en la misma
 * máquina se juntan en un tramo. Es el punto de partida para ajustar a mano cualquier programación (manual, del
 * cosimulador o de Fractal).
 */
export function queuesOf(plan: ProductionPlan, nowIso: string): Record<string, EditChunk[]> {
  const t = nowIso.slice(0, 16);
  const out: Record<string, EditChunk[]> = {};
  const rows = plan.schedule.filter((r) => r.start.slice(0, 16) >= t).sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  for (const r of rows) {
    const q = (out[r.equipment] ??= []);
    const job = `${r.order}/${r.product}`;
    const last = q.at(-1);
    if (last?.job === job) last.qty = (last.qty ?? 0) + r.quantity;
    else q.push({ job, qty: r.quantity, start: r.start.slice(0, 16) });
  }
  return out;
}

/**
 * Mueve un tramo de una cola a otra (o dentro de la misma) y lo deja en la posición `to.index`. Con `notBefore` el
 * tramo queda fijado para no arrancar antes de esa hora; sin ella se quita cualquier fecha fijada.
 */
export function moveChunk(queues: Record<string, EditChunk[]>, from: { machine: string; index: number }, to: { machine: string; index: number; notBefore?: string }): Record<string, EditChunk[]> {
  const out: Record<string, EditChunk[]> = Object.fromEntries(Object.entries(queues).map(([m, q]) => [m, q.map((c) => ({ ...c }))]));
  const src = out[from.machine];
  if (!src?.[from.index]) return out;
  const [chunk] = src.splice(from.index, 1);
  const dst = (out[to.machine] ??= []);
  let i = to.index;
  if (from.machine === to.machine && from.index < to.index) i -= 1;
  i = Math.max(0, Math.min(dst.length, i));
  const moved: EditChunk = { job: chunk.job, ...(chunk.qty !== undefined ? { qty: chunk.qty } : {}), ...(to.notBefore ? { notBefore: to.notBefore } : {}), ...(to.notBefore ? { start: to.notBefore } : {}) };
  dst.splice(i, 0, moved);
  return out;
}

/** Recalcula la programación con las colas ajustadas a mano, desde AHORA y con lo ya empezado congelado. */
export function editedPlan(model: PlasticsModel, portfolio: CustomerOrders, edit: ManualEdit, opt: Opt = {}): ProductionPlan {
  const ctx = context(model, portfolio, opt.now, opt.previous, opt.events, opt.stops, opt.fixed);
  const seq: Record<string, { key: string; qty?: number; notBefore?: number }[]> = {};
  for (const [m, list] of Object.entries(edit.queues)) seq[m] = list.map((c) => ({ key: c.job, qty: c.qty, notBefore: c.notBefore ? parseLocal(c.notBefore) : 0 }));
  const { queues } = build(ctx, model, seq);
  const pinned = Object.values(edit.queues).flat().filter((c) => c.notBefore).length;
  return toPlan(ctx, portfolio, dispatch(ctx, queues), {
    planId: edit.plan_id,
    source: "manual",
    notes: [
      `Ajuste manual en el Gantt (${edit.author}): ${edit.moves.length} movimiento${edit.moves.length === 1 ? "" : "s"}${pinned ? `, ${pinned} con hora fijada` : ""}.`,
      ...edit.moves.slice(-3).map((m) => `${m}.`),
    ],
  });
}
