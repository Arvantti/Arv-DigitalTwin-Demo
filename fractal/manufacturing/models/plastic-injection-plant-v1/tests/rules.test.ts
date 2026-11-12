import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { CustomerOrders } from "@twin/cosim/core/contracts.ts";
import { parseLocal } from "@twin/cosim/core/time.ts";
import { buildModel } from "@twin/cosim/adapters/plastic-injection-plant-v1/model.ts";
import { fsCatalog, MODEL_DIR } from "@twin/cosim/adapters/plastic-injection-plant-v1/scripts/fs-catalog.ts";
// Los imprevistos los genera el emulador (galería); Fractal solo calcula con ellos.
import { CYCLE_SPREAD, imprevistos, randomFailures } from "../../../../../apps/gallery/src/imprevistos.ts";
import { replayWithNoise, rulesPlan, withCycle } from "../rules.ts";

const model = buildModel(fsCatalog());
const portfolio = JSON.parse(readFileSync(`${MODEL_DIR}orders/cartera-2026-11.json`, "utf8")) as CustomerOrders;

describe("evaluador rápido de plásticos (reglas, sin cosimulador)", () => {
  const plan = rulesPlan(model, portfolio, { planId: "R-1" });

  it("programa toda la cartera con el mismo contrato que el cosimulador, en milisegundos", () => {
    const t0 = Date.now();
    rulesPlan(model, portfolio);
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(plan.contract).toBe("production-plan.v1");
    expect(plan.plan_id).toBe("R-1");
    expect(plan.orders.map((o) => o.id).sort()).toEqual(portfolio.orders.map((o) => o.id).sort());
    expect(plan.schedule.length).toBeGreaterThan(0);
    expect(plan.kpis.on_time_pct).toBeGreaterThan(50);
  });

  it("un pedido con importancia alta no termina después que sin ella", () => {
    const target = [...plan.orders].sort((a, b) => b.late_h - a.late_h || parseLocal(b.completion) - parseLocal(a.completion))[0];
    const rush = { ...portfolio, orders: portfolio.orders.map((o) => (o.id === target.id ? { ...o, importance: "alta" as const } : o)) };
    const after = rulesPlan(model, rush).orders.find((o) => o.id === target.id)!;
    expect(parseLocal(after.completion)).toBeLessThanOrEqual(parseLocal(target.completion));
  });

  it("imprevistos del emulador: ciclo dentro de ±5 % y fallas con los datos de la planta", () => {
    const p = Object.values(model.products)[0];
    expect(withCycle(model, {}).products[p.id].final.unitMin).toBeCloseTo(p.final.unitMin);
    const now = parseLocal("2026-11-04T10:00");
    const [run] = imprevistos(model, now, 1, 3);
    const noisy = withCycle(model, run.cycle);
    for (const [id, q] of Object.entries(noisy.products)) {
      const ratio = q.final.unitMin / model.products[id].final.unitMin;
      expect(Math.abs(ratio - 1)).toBeLessThanOrEqual(CYCLE_SPREAD + 1e-9);
    }
    expect(randomFailures(model, () => 0.99, now)).toHaveLength(0);
    const all = randomFailures(model, () => 0, now);
    expect(all).toHaveLength(model.machines.length * 7);
    expect(all.every((e) => e.kind === "falla" && model.downtime!.reasons.includes(e.reason))).toBe(true);
  });

  it("el plan no trae paradas inventadas: sin eventos ni paros previstos no hay tiempo perdido", () => {
    expect(plan.downtime).toEqual([]);
  });

  it("Fractal calcula con los imprevistos que recibe: la ejecución tranquila es estable y las fallas no la mejoran", () => {
    const opt = { now: "2026-11-04T10:00", previous: plan };
    const calm = replayWithNoise(model, portfolio, plan, opt);
    expect(replayWithNoise(model, portfolio, plan, opt)).toEqual(calm);
    expect(replayWithNoise(model, portfolio, plan, opt, { events: [] })).toEqual(calm);
    const all = randomFailures(model, () => 0, parseLocal(opt.now));
    expect(replayWithNoise(model, portfolio, plan, opt, { events: all }).tardiness_h).toBeGreaterThanOrEqual(calm.tardiness_h);
  });

  it("los mismos imprevistos dan la misma ejecución", () => {
    const opt = { now: "2026-11-04T10:00", previous: plan };
    const [a] = imprevistos(model, parseLocal(opt.now), 1, 5);
    const [b] = imprevistos(model, parseLocal(opt.now), 1, 5);
    expect(replayWithNoise(model, portfolio, plan, opt, a)).toEqual(replayWithNoise(model, portfolio, plan, opt, b));
  });
});
