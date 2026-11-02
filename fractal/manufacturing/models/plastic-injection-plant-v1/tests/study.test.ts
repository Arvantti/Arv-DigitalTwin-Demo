import { readFileSync } from "node:fs";
import highsLoader from "highs";
import { describe, expect, it } from "vitest";
import type { CustomerOrders, PlantEvent, ProductionPlan } from "@twin/cosim/core/contracts.ts";
import { buildModel } from "@twin/cosim/adapters/plastic-injection-plant-v1/model.ts";
import { solve } from "@twin/cosim/adapters/plastic-injection-plant-v1/solve.ts";
import { fsCatalog, MODEL_DIR } from "@twin/cosim/adapters/plastic-injection-plant-v1/scripts/fs-catalog.ts";
import { runStudy } from "../study.ts";

const cat = fsCatalog();
const model = buildModel(cat);
const portfolio = JSON.parse(readFileSync(`${MODEL_DIR}orders/cartera-2026-11.json`, "utf8")) as CustomerOrders;
const NOW = "2026-11-04T10:00";
const highs = () => highsLoader();

describe("Fractal de plásticos", async () => {
  const vigente = solve(await highsLoader(), model, portfolio);

  it("falla: compara esperar la reparación con mudar el molde y recomienda la mejor", async () => {
    const ev: PlantEvent = { contract: "plant-event.v1", id: "EV-1", plant: model.plant, equipment: "imm-21", kind: "falla", reason: "fuga de aceite", start: `${NOW}-05:00`, est_end: "2026-11-05T22:00-05:00" };
    const s = await runStudy(highs, cat, { scenario: "falla", portfolio, now: NOW, previous: vigente, events: [ev], studyId: "FRA-T1" });
    console.log("falla", s.options.map((o) => `${o.label}: ${o.kpis.late_orders} tarde ${o.kpis.tardiness_h} h score ${o.score}`).join(" | "), "→", s.recommendation, `${s.seconds} s`);
    expect(s.options.length).toBeGreaterThan(1);
    expect(s.options.some((o) => o.levers.some((l) => l.kind === "mover-molde"))).toBe(true);
    const best = s.options.find((o) => o.id === s.best)!;
    expect(best.score).toBeLessThanOrEqual(s.options[0].score);
    for (const o of s.options) expect(o.plan.schedule.some((r) => r.equipment === "imm-21" && r.start.slice(0, 16) >= NOW && r.start.slice(0, 16) < "2026-11-05T22:00")).toBe(false);
  });

  it("adelantar: el pedido adelantado queda a tiempo con la mejor opción", async () => {
    const o = portfolio.orders.find((x) => x.product === "balde-12l" && x.due.slice(0, 10) === "2026-11-10")!;
    const s = await runStudy(highs, cat, { scenario: "adelantar", portfolio, now: NOW, previous: vigente, order: { id: o.id, due: "2026-11-06T22:00" }, studyId: "FRA-T2" });
    console.log("adelantar", o.id, s.options.map((x) => `${x.label}: ${x.kpis.late_orders} tarde ${x.kpis.tardiness_h} h`).join(" | "), "→", s.recommendation);
    const best = s.options.find((x) => x.id === s.best)!;
    expect(best.plan.orders.find((x) => x.id === o.id)!.due.slice(0, 10)).toBe("2026-11-06");
    expect(best.plan.order_changes?.[0].order).toBe(o.id);
  });

  it("balancear: baja la carga de la máquina más ocupada", async () => {
    const s = await runStudy(highs, cat, { scenario: "balancear", portfolio, now: NOW, previous: vigente, studyId: "FRA-T3" });
    console.log("balancear", s.baseline.max_load, s.options.map((x) => `${x.label}: máx ${x.max_load.equipment} ${x.max_load.pct} %, ${x.kpis.late_orders} tarde`).join(" | "), "→", s.recommendation);
    const best = s.options.find((x) => x.id === s.best)!;
    expect(best.max_load.pct).toBeLessThanOrEqual(s.options[0].max_load.pct);
  });
  it("fijadas: ninguna opción mueve las órdenes bloqueadas a mano y el resto se reorganiza", async () => {
    const later = vigente.orders.filter((o) => o.start.slice(0, 16) > NOW).slice(0, 3).map((o) => o.id);
    expect(later.length).toBe(3);
    const s = await runStudy(highs, cat, { scenario: "fijadas", portfolio, now: NOW, previous: vigente, fixed: later, studyId: "FRA-T4" });
    console.log("fijadas", later, s.options.map((x) => `${x.label}: ${x.kpis.late_orders} tarde ${x.kpis.tardiness_h} h, máx ${x.max_load.pct} %`).join(" | "), "→", s.recommendation);
    const rowsOf = (p: ProductionPlan) => p.schedule.filter((r) => later.includes(r.order)).map((r) => `${r.order}|${r.product}|${r.equipment}|${r.start}|${r.end}|${r.quantity}`).sort();
    for (const o of s.options) {
      expect(o.plan.fixed_orders).toEqual(later);
      expect(rowsOf(o.plan)).toEqual(rowsOf(vigente));
    }
    expect(s.question).toContain(later[0]);
    // Sin órdenes fijadas el escenario no tiene sentido.
    await expect(runStudy(highs, cat, { scenario: "fijadas", portfolio, now: NOW, previous: vigente, fixed: [] })).rejects.toThrow(/fijadas/);
  });
});
