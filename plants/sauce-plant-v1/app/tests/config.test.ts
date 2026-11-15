import { describe, expect, it } from "vitest";
import { buildModel } from "@plants/sauce-plant-v1-cosim/model.ts";
import { manualPlan } from "@plants/sauce-plant-v1-cosim/manual.ts";
import { applyConfig, baseManual, basePortfolio, baseSauceData, configManual, configPortfolio } from "../data.ts";
import { preloadedConfig } from "../config.ts";
import { DEMO_NOW } from "../view.ts";

const opt = { now: DEMO_NOW };
const base = buildModel(baseSauceData());
const kpis = (cfg = preloadedConfig()) => manualPlan(buildModel(applyConfig(baseSauceData(), cfg)), configPortfolio(cfg), configManual(cfg), opt).kpis;

describe("CONFIGURACIÓN de salsas", () => {
  it("la precargada da el mismo plan manual que la cartera y la secuencia de la demo", () => {
    const k = manualPlan(base, basePortfolio(), baseManual(), opt).kpis;
    expect(kpis()).toEqual(k);
  });

  it("respetar el orden del planificador sin haber reordenado no cambia el plan", () => {
    expect(kpis({ ...preloadedConfig(), keep_order: true })).toEqual(kpis());
  });

  it("reordenar una llenadora cambia el orden en que su línea hace los pedidos", () => {
    const cfg = preloadedConfig();
    const list = cfg.sequence["filler-pouch-01"];
    const last = list.pop()!;
    list.splice(list.length - 6, 0, last);
    cfg.keep_order = true;
    const plan = manualPlan(buildModel(applyConfig(baseSauceData(), cfg)), configPortfolio(cfg), configManual(cfg), opt);
    const before = manualPlan(base, basePortfolio(), baseManual(), opt);
    const start = (p: typeof plan, id: string) => p.orders.find((o) => o.id === id)!.start;
    expect(start(plan, last) < start(before, last)).toBe(true);
  });

  it("las llenadoras asignadas reemplazan la ruta y las multipropósito; duplicar crea un SKU con la misma receta", () => {
    const cfg = { ...preloadedConfig(), fillers: { "bbq-1000": ["filler-pouch-02", "filler-pouch-01"], "mayonesa-250": ["filler-sachet-01"] }, new_products: [{ id: "tomate-1000-v2", name: "Salsa de tomate 1.000 ml institucional", base: "tomate-1000" }] };
    const m = buildModel(applyConfig(baseSauceData(), cfg));
    expect(m.products["bbq-1000"].fillers).toEqual(["filler-pouch-02", "filler-pouch-01"]);
    expect(base.products["mayonesa-250"].fillers).toContain("filler-sachet-03");
    expect(m.products["mayonesa-250"].fillers).toEqual(["filler-sachet-01"]);
    expect(m.products["tomate-1000-v2"]).toMatchObject({ name: "Salsa de tomate 1.000 ml institucional", bulk: "salsa-tomate", fillers: ["filler-pouch-01"], lot: base.products["tomate-1000"].lot });
  });

  it("un pedido nuevo sin asignar entra al plan al final de su línea", () => {
    const cfg = preloadedConfig();
    cfg.orders.push({ id: "PED-D12-99", customer: "Cliente nuevo", product: "bbq-1000", quantity: 1500, unit: "u", due: "2026-11-07T22:00-05:00", created: DEMO_NOW, importance: "normal", added: true });
    const plan = manualPlan(buildModel(applyConfig(baseSauceData(), cfg)), configPortfolio(cfg), configManual(cfg), opt);
    expect(plan.orders.find((o) => o.id === "PED-D12-99")?.completion).toBeTruthy();
    expect(plan.portfolio_id).toBe("CART-2026-11·PRECARGADA");
  });
});
