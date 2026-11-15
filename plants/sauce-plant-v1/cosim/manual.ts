/**
 * Programación manual de la demo (`manual-sequence.v1`): la que escribiría el planificador de turno sin ayuda.
 * Ordena los pedidos por llegada (primero en llegar, primero en hacerse) y, cuando un producto tiene dos llenadoras,
 * las alterna. No agrupa recetas, no mira alérgenos ni importancia: por eso hace CIP de más, que es lo que el
 * cosimulador y Fractal mejoran.
 */
import { parseLocal, type CustomerOrders, type ManualSequence, type ProductionPlan } from "@twin/cosim-core";
import type { SauceModel } from "./model.ts";
import { context, dispatch, toPlan, type Chunk, type ContextOptions } from "./plan.ts";

export function manualSequence(model: SauceModel, portfolio: CustomerOrders, planId = "APS-MAN-01"): ManualSequence {
  const sequence: Record<string, string[]> = {};
  const turn: Record<string, number> = {};
  const byArrival = [...portfolio.orders].sort((a, b) => parseLocal(a.created) - parseLocal(b.created) || a.id.localeCompare(b.id));
  for (const o of byArrival) {
    const fillers = model.products[o.product].fillers;
    const key = fillers.join(",");
    const m = fillers[(turn[key] = (turn[key] ?? -1) + 1) % fillers.length];
    (sequence[m] ??= []).push(o.id);
  }
  return {
    contract: "manual-sequence.v1",
    plan_id: planId,
    plant: model.plant,
    portfolio_id: portfolio.portfolio_id,
    author: "planificador de turno (inventado)",
    note: "Por orden de llegada; llenadoras alternas por turnos; sin agrupar recetas ni mirar alérgenos ni importancia.",
    sequence: Object.fromEntries(Object.entries(sequence).sort(([a], [b]) => a.localeCompare(b))),
  };
}

/**
 * El plan manual en el tiempo: cada línea hace los pedidos de su granel en el orden en que el planificador los puso
 * (por llegada) y los llena en la llenadora que eligió. Los pedidos que no están en la secuencia (llegaron después o se
 * agregaron a mano) van al final de su línea, por entrega, en la llenadora que pueda empezar antes. Con keep_order se
 * respeta el orden que el planificador puso en cada llenadora.
 */
export function manualPlan(model: SauceModel, portfolio: CustomerOrders, manual: ManualSequence, opt: ContextOptions = {}): ProductionPlan {
  const ctx = context(model, portfolio, opt);
  const fillerOf = new Map<string, string>();
  for (const [m, ids] of Object.entries(manual.sequence)) for (const id of ids) fillerOf.set(id, m);
  const arrival = (id: string) => {
    const o = ctx.jobs.get(id)!.order;
    return [parseLocal(o.created), o.id] as const;
  };
  const queues: Record<string, Chunk[]> = Object.fromEntries(Object.keys(model.lines).map((k) => [k, []]));
  const jobs = [...ctx.jobs.values()].filter((j) => j.qty - (ctx.done[j.order.id] ?? 0) > 0);
  const listed = jobs.filter((j) => fillerOf.has(j.order.id) && model.products[j.order.product].fillers.includes(fillerOf.get(j.order.id)!));
  const rest = jobs.filter((j) => !listed.includes(j)).sort((a, b) => a.due - b.due || a.order.id.localeCompare(b.order.id));
  // keep_order (pantalla CONFIGURACIÓN): el planificador ordenó cada llenadora a mano. Cada llenadora conserva sus
  // turnos de llegada, pero en el orden que él puso: el pedido en la posición i toma la i-ésima llegada de su llenadora.
  // Una secuencia sin reordenar da lo mismo que por llegada.
  const keep = (manual as ManualSequence & { keep_order?: boolean }).keep_order === true;
  const slot = new Map<string, number>();
  if (keep) {
    const live = new Set(listed.map((j) => j.order.id));
    for (const ids of Object.values(manual.sequence)) {
      const mine = ids.filter((id) => live.has(id));
      const times = mine.map((id) => arrival(id)[0]).sort((a, b) => a - b);
      mine.forEach((id, i) => slot.set(id, times[i]));
    }
  }
  listed.sort((a, b) => {
    const [ta, ia] = arrival(a.order.id);
    const [tb, ib] = arrival(b.order.id);
    return (keep ? slot.get(a.order.id)! - slot.get(b.order.id)! : 0) || ta - tb || ia.localeCompare(ib);
  });
  for (const j of [...listed, ...rest]) queues[j.line].push({ job: j, qty: j.qty - (ctx.done[j.order.id] ?? 0), filler: fillerOf.get(j.order.id), notBefore: ctx.now });
  return toPlan(ctx, portfolio, dispatch(ctx, queues), { planId: manual.plan_id, source: "manual", notes: [manual.note ?? "Secuencia del planificador."] });
}
