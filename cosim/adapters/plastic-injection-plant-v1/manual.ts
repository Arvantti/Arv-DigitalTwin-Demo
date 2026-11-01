/**
 * Programación manual: la secuencia que escribió el planificador para cada máquina (aps/plans/APS-MAN-*.json).
 *
 * El planificador solo decide el orden de los pedidos en cada máquina; los tiempos los calcula el mismo despacho del
 * cosimulador (turnos, paradas, purgas de color y espera de componentes). Los pedidos que no están en la secuencia
 * (llegaron después o se agregaron en la pantalla de pedidos) van al final de la máquina menos cargada, por entrega.
 */
import type { CustomerOrders, ProductionPlan } from "../../core/contracts.ts";
import { context, dispatch, toPlan, type Chunk, type Job } from "./plan.ts";
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

export function manualPlan(model: PlasticsModel, portfolio: CustomerOrders, manual: ManualPlan, opt: { now?: string; previous?: ProductionPlan | null } = {}): ProductionPlan {
  const ctx = context(model, portfolio, opt.now, opt.previous);
  const queues: Record<string, Chunk[]> = Object.fromEntries(model.machines.map((m) => [m, []]));
  const load: Record<string, number> = Object.fromEntries(model.machines.map((m) => [m, 0]));
  const placed = new Set<string>();
  const left = (j: Job) => Math.max(0, j.qty - (ctx.done[j.key] ?? 0));
  const put = (m: string, j: Job) => {
    if (placed.has(j.key) || left(j) <= 0) return;
    queues[m].push({ job: j, qty: left(j), notBefore: 0 });
    load[m] += left(j) * j.step.unitMin;
    placed.add(j.key);
  };
  for (const [m, ids] of Object.entries(manual.sequence)) {
    if (!queues[m]) continue;
    for (const id of ids) for (const j of ctx.jobs.filter((x) => x.order.id === id && x.step.machines.includes(m))) put(m, j);
  }
  const rest = ctx.jobs.filter((j) => !placed.has(j.key)).sort((a, b) => a.due - b.due || a.order.id.localeCompare(b.order.id));
  for (const j of rest) put([...j.step.machines].sort((a, b) => load[a] - load[b])[0], j);
  const extra = rest.filter((j) => j.final).length;
  return toPlan(ctx, portfolio, dispatch(ctx, queues), {
    planId: manual.plan_id,
    source: "manual",
    notes: [`Secuencia escrita por ${manual.author}.`, ...(extra ? [`${extra} pedido${extra > 1 ? "s" : ""} fuera de la secuencia, al final por fecha de entrega.`] : [])],
  });
}
