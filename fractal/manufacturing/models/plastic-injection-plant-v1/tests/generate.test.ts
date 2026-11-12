import { readFileSync } from "node:fs";
import highsLoader from "highs";
import { describe, expect, it } from "vitest";
import type { CustomerOrders, PlantEvent, ProductionPlan } from "@twin/cosim/core/contracts.ts";
import { buildModel } from "@twin/cosim/adapters/plastic-injection-plant-v1/model.ts";
import { solve } from "@twin/cosim/adapters/plastic-injection-plant-v1/solve.ts";
import { fsCatalog, MODEL_DIR } from "@twin/cosim/adapters/plastic-injection-plant-v1/scripts/fs-catalog.ts";
import { runStudy, type StudyInput } from "../study.ts";
import { generateStudy } from "../generate.ts";
// Los imprevistos los entrega el emulador; Fractal solo calcula con ellos.
import { imprevistos } from "../../../../../apps/gallery/src/imprevistos.ts";
import { parseLocal } from "@twin/cosim/core/time.ts";

const cat = fsCatalog();
const model = buildModel(cat);
const portfolio = JSON.parse(readFileSync(`${MODEL_DIR}orders/cartera-2026-11.json`, "utf8")) as CustomerOrders;
const NOW = "2026-11-04T10:00";
const highs = () => highsLoader();
const RUNS = 20;
const OPTS = { seed: 1, imprevistos: imprevistos(model, parseLocal(NOW), RUNS, 1) };

describe("Fractal de plásticos con generador genético", async () => {
  const vigente: ProductionPlan = solve(await highsLoader(), model, portfolio);
  const later = vigente.orders.filter((o) => o.start.slice(0, 16) > NOW).slice(0, 3).map((o) => o.id);
  const balde = portfolio.orders.find((x) => x.product === "balde-12l" && x.due.slice(0, 10) === "2026-11-10")!;
  const falla: PlantEvent = { contract: "plant-event.v1", id: "EV-1", plant: model.plant, equipment: "imm-21", kind: "falla", reason: "fuga de aceite", start: `${NOW}-05:00`, est_end: "2026-11-05T22:00-05:00" };
  const cases: [string, Partial<StudyInput>][] = [
    ["falla", { scenario: "falla", events: [falla] }],
    ["adelantar", { scenario: "adelantar", order: { id: balde.id, due: "2026-11-06T22:00" } }],
    ["balancear", { scenario: "balancear" }],
    ["cambios", { scenario: "cambios" }],
    ["energia", { scenario: "energia" }],
    ["fijadas", { scenario: "fijadas", fixed: later }],
  ];

  for (const [name, extra] of cases)
    it(`${name}: la mejor generada nunca es peor que la del estudio manual y entrega opciones distintas`, async () => {
      const input = { portfolio, now: NOW, previous: vigente, studyId: "FRA-G", ...extra } as StudyInput;
      const manual = await runStudy(highs, cat, input);
      const gen = await generateStudy(highs, cat, input, OPTS);
      const mBest = manual.options.find((o) => o.id === manual.best)!;
      const gBest = gen.options.find((o) => o.id === gen.best)!;
      console.log(
        name,
        `manual ${mBest.label} score ${mBest.score}`,
        "| generado",
        gen.options.map((o) => `${o.label}: score ${o.score}, ${o.kpis.late_orders} tarde, rango ${o.pareto_rank}, p ${o.probability?.p}`).join(" · "),
        `| ${gen.generator!.rule_evaluations} por reglas, ${gen.generator!.evaluations} con cosimulador, ${gen.seconds} s`,
      );
      expect(gBest.score).toBeLessThanOrEqual(mBest.score);
      expect(gBest.kpis.late_orders).toBeLessThanOrEqual(manual.options[0].kpis.late_orders);
      expect(gen.options.length).toBeGreaterThanOrEqual(1);
      expect(gen.options.length).toBeLessThanOrEqual(5);
      expect(new Set(gen.options.map((o) => o.id)).size).toBe(gen.options.length);
      for (const o of gen.options) {
        expect(o.plan.plan_id).toBe(o.id);
        expect(o.plan.source).toBe("fractal");
        expect(o.evaluated_by).toEqual(["reglas", "cosim"]);
        expect(o.probability!.runs).toBe(RUNS);
        expect(o.probability!.p).toBeGreaterThanOrEqual(0);
        expect(o.probability!.p).toBeLessThanOrEqual(1);
      }
      // Fractal genera; el cosimulador calcula solo las 5 mejores (más "recalcular", la referencia de entregas).
      expect(gen.generator!.evaluations).toBeLessThanOrEqual(6);
      expect(gen.generator!.rule_evaluations!).toBeGreaterThan(gen.generator!.evaluations);
      expect(gen.question).toBe(manual.question);
      if (name === "fijadas") {
        const rowsOf = (p: ProductionPlan) => p.schedule.filter((r) => later.includes(r.order)).map((r) => `${r.order}|${r.equipment}|${r.start}|${r.end}`).sort();
        for (const o of gen.options) expect(rowsOf(o.plan)).toEqual(rowsOf(vigente));
      }
      if (name === "falla") for (const o of gen.options) expect(o.plan.schedule.some((r) => r.equipment === "imm-21" && r.start.slice(0, 16) >= NOW && r.start.slice(0, 16) < "2026-11-05T22:00")).toBe(false);
    }, 120_000);

  it("misma semilla, mismo resultado", async () => {
    const input = { portfolio, now: NOW, previous: vigente, studyId: "FRA-G", scenario: "cambios" } as StudyInput;
    const a = await generateStudy(highs, cat, input, OPTS);
    const b = await generateStudy(highs, cat, input, OPTS);
    expect(a.options.map((o) => `${o.label}|${o.score}`)).toEqual(b.options.map((o) => `${o.label}|${o.score}`));
  }, 120_000);
});
