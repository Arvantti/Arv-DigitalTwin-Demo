/**
 * Inventa la cartera de la demo y la secuencia manual del planificador, y las guarda en industrial-models.
 * Uso: node cosim/adapters/plastic-injection-plant-v1/scripts/make-portfolio.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { buildModel } from "../model.ts";
import { inventPortfolio } from "../portfolio.ts";
import { makeJobs } from "../plan.ts";
import { parseLocal } from "../../../core/time.ts";
import { fsCatalog, MODEL_DIR } from "./fs-catalog.ts";

const model = buildModel(fsCatalog());
const portfolio = inventPortfolio(model, { portfolioId: "CART-2026-11", planStart: "2026-10-26", firstDue: "2026-10-27", lastDue: "2026-11-14" });
mkdirSync(`${MODEL_DIR}orders`, { recursive: true });
writeFileSync(`${MODEL_DIR}orders/cartera-2026-11.json`, `${JSON.stringify(portfolio, null, 1)}\n`);

// Programación manual: el planificador ordena por llegada del pedido (primero en llegar, primero en hacerse) y
// reparte los cubiertos alternando entre las dos inyectoras. No mira importancia ni agrupa colores.
const jobs = makeJobs(model, portfolio.orders, parseLocal(portfolio.plan_start));
const sequence: Record<string, string[]> = {};
const turn: Record<string, number> = {};
for (const j of [...jobs].sort((a, b) => a.release - b.release || a.order.id.localeCompare(b.order.id))) {
  const ms = j.step.machines;
  const key = ms.join(",");
  const m = ms[(turn[key] = (turn[key] ?? -1) + 1) % ms.length];
  (sequence[m] ??= []).includes(j.order.id) || sequence[m].push(j.order.id);
}
mkdirSync(`${MODEL_DIR}aps/plans`, { recursive: true });
writeFileSync(
  `${MODEL_DIR}aps/plans/APS-MAN-01.json`,
  `${JSON.stringify({ contract: "manual-sequence.v1", plan_id: "APS-MAN-01", plant: model.plant, portfolio_id: portfolio.portfolio_id, author: "planificador de turno (inventado)", note: "Por orden de llegada; cubiertos alternando IMM-01 e IMM-02; sin agrupar colores ni mirar importancia.", sequence }, null, 1)}\n`,
);
console.log(`${portfolio.orders.length} pedidos; secuencia en ${Object.keys(sequence).length} máquinas`);
