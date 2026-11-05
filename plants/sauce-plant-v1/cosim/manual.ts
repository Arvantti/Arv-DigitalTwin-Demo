/**
 * Programación manual de la demo (`manual-sequence.v1`): la que escribiría el planificador de turno sin ayuda.
 * Ordena los pedidos por llegada (primero en llegar, primero en hacerse) y, cuando un producto tiene dos llenadoras,
 * las alterna. No agrupa recetas, no mira alérgenos ni importancia: por eso hace CIP de más, que es lo que el
 * cosimulador y Fractal mejoran.
 */
import { parseLocal, type CustomerOrders, type ManualSequence } from "@twin/cosim-core";
import type { SauceModel } from "./model.ts";

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
