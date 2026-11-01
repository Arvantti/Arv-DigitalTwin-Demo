import { readFileSync } from "node:fs";
import highsLoader from "highs";
import { describe, expect, it } from "vitest";
import type { CustomerOrders, ProductionPlan } from "../../../core/contracts.ts";
import { parseLocal } from "../../../core/time.ts";
import { manualPlan, type ManualPlan } from "../manual.ts";
import { buildModel } from "../model.ts";
import { solve } from "../solve.ts";
import { fsCatalog, MODEL_DIR } from "../scripts/fs-catalog.ts";

const model = buildModel(fsCatalog());
const portfolio = JSON.parse(readFileSync(`${MODEL_DIR}orders/cartera-2026-11.json`, "utf8")) as CustomerOrders;
const manual = JSON.parse(readFileSync(`${MODEL_DIR}aps/plans/APS-MAN-01.json`, "utf8")) as ManualPlan;
const NOW = "2026-11-04T10:00";

/** Reglas que toda programación debe cumplir, venga de donde venga. */
function checkPlan(plan: ProductionPlan) {
  const byMachine = new Map<string, ProductionPlan["schedule"]>();
  for (const r of plan.schedule) (byMachine.get(r.equipment) ?? byMachine.set(r.equipment, []).get(r.equipment)!).push(r);
  for (const [m, rows] of byMachine) {
    rows.sort((a, b) => (a.start < b.start ? -1 : 1));
    for (let i = 1; i < rows.length; i++) expect(rows[i].start >= rows[i - 1].end, `${m}: ${rows[i - 1].op} y ${rows[i].op} se cruzan`).toBe(true);
  }
  for (const o of plan.orders) {
    const rows = plan.schedule.filter((r) => r.order === o.id);
    for (const r of rows) expect(parseLocal(r.start) >= parseLocal(o.created) - 1, `${r.op} empieza antes de que llegue el pedido`).toBe(true);
    const fin = rows.filter((r) => r.product === o.product).reduce((s, r) => s + r.quantity, 0);
    expect(fin + (o.unscheduled ?? 0)).toBe(o.quantity);
  }
}

describe("APS de plásticos", () => {
  it("la cartera inventada tiene una semana de ventana como máximo", () => {
    for (const o of portfolio.orders) expect((parseLocal(o.due) - parseLocal(o.created)) / 1440).toBeLessThanOrEqual(8);
  });

  it("la programación manual respeta máquinas, llegadas y cantidades", () => {
    checkPlan(manualPlan(model, portfolio, manual));
  });

  it("el solver programa todo, cumple las reglas y no es peor que la manual", async () => {
    const highs = await highsLoader();
    const man = manualPlan(model, portfolio, manual);
    const sol = solve(highs, model, portfolio);
    checkPlan(sol);
    console.log("manual", JSON.stringify(man.kpis), "solver", JSON.stringify(sol.kpis), JSON.stringify(sol.solver));
    expect(sol.orders.filter((o) => o.unscheduled).length).toBe(0);
    expect(sol.kpis.tardiness_h).toBeLessThanOrEqual(man.kpis.tardiness_h);
  });

  it("al replanear desde AHORA no cambia lo que ya empezó", async () => {
    const highs = await highsLoader();
    const base = solve(highs, model, portfolio);
    const extra: CustomerOrders = { ...portfolio, orders: [...portfolio.orders, { id: "PED-NUEVO-01", customer: "Hogar Express", product: "balde-12l", quantity: 800, color: "mb-blanco", due: "2026-11-06T22:00-05:00", created: "2026-11-04T09:00-05:00", importance: "alta", added: true }] };
    const again = solve(await highsLoader(), model, extra, { now: NOW, previous: base });
    checkPlan(again);
    const before = (p: ProductionPlan) => p.schedule.filter((r) => r.start.slice(0, 16) < NOW).map((r) => `${r.order}|${r.equipment}|${r.start}|${r.quantity}`).sort();
    const a = before(again), b0 = before(base);
    expect(a).toEqual(b0);
    const nuevo = again.orders.find((o) => o.id === "PED-NUEVO-01")!;
    expect(nuevo.late_h).toBe(0);
  });
});
