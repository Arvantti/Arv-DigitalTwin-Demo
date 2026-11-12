import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { CustomerOrders } from "@twin/cosim/core/contracts.ts";
import { parseLocal } from "@twin/cosim/core/time.ts";
import { buildModel } from "@twin/cosim/adapters/plastic-injection-plant-v1/model.ts";
import { fsCatalog, MODEL_DIR } from "@twin/cosim/adapters/plastic-injection-plant-v1/scripts/fs-catalog.ts";
import { seededRng } from "@twin/fractal-core";
import { CYCLE_SPREAD, noisyModel, randomFailures, replayWithNoise, rulesPlan } from "../rules.ts";

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

  it("imprevistos: el ciclo varía dentro de ±5 % y las fallas salen de los datos de la planta", () => {
    const calm = noisyModel(model, () => 0.5);
    const p = Object.values(model.products)[0];
    expect(calm.products[p.id].final.unitMin).toBeCloseTo(p.final.unitMin);
    const noisy = noisyModel(model, seededRng(3));
    for (const [id, q] of Object.entries(noisy.products)) {
      const ratio = q.final.unitMin / model.products[id].final.unitMin;
      expect(Math.abs(ratio - 1)).toBeLessThanOrEqual(CYCLE_SPREAD + 1e-9);
    }
    const now = parseLocal("2026-11-04T10:00");
    expect(randomFailures(model, () => 0.99, now)).toHaveLength(0);
    const all = randomFailures(model, () => 0, now);
    expect(all).toHaveLength(model.machines.length * 7);
    expect(all.every((e) => e.kind === "falla" && model.downtime!.reasons.includes(e.reason))).toBe(true);
  });

  it("sin imprevistos la ejecución tranquila es estable; con ellos las paradas previstas se cambian, no se suman", () => {
    const opt = { now: "2026-11-04T10:00", previous: plan };
    expect(replayWithNoise(model, portfolio, plan, opt)).toEqual(replayWithNoise(model, portfolio, plan, opt));
    // Con un azar que nunca dispara fallas y no cambia el ciclo, solo se quitan las paradas previstas: no queda peor.
    const none = replayWithNoise(model, portfolio, plan, opt, () => 0.5);
    expect(none.tardiness_h).toBeLessThanOrEqual(replayWithNoise(model, portfolio, plan, opt).tardiness_h + 1e-6);
  });

  it("la misma semilla repite la ejecución con imprevistos", () => {
    const opt = { now: "2026-11-04T10:00", previous: plan };
    const a = replayWithNoise(model, portfolio, plan, opt, seededRng(5));
    const b = replayWithNoise(model, portfolio, plan, opt, seededRng(5));
    expect(a).toEqual(b);
  });
});
