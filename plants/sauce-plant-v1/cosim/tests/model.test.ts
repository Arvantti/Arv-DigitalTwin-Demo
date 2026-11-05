import { readFileSync } from "node:fs";
import { pairMin } from "@twin/cosim-core";
import { describe, expect, it } from "vitest";
import { DEMO } from "../demo.ts";
import { fsData, json, PLANT_DIR } from "../fs-data.ts";
import { manualSequence } from "../manual.ts";
import { buildModel } from "../model.ts";
import { inventPortfolio } from "../portfolio.ts";

const model = buildModel(fsData());
const saved = (path: string) => readFileSync(`${PLANT_DIR}${path}`, "utf8");

describe("modelo de salsas", () => {
  it("seis SKU con su granel, su grupo de alérgenos y sus llenadoras", () => {
    expect(Object.keys(model.products).sort()).toEqual(["mayonesa-1000", "mayonesa-250", "mayonesa-500", "mostaza-250", "tomate-1000", "tomate-250"]);
    expect(model.products["mostaza-250"]).toMatchObject({ bulk: "mostaza-granel", bulkKg: 0.2625, allergenGroup: "mostaza", fillers: ["filler-sachet-03", "filler-sachet-01"] });
    expect(model.products["mayonesa-250"].fillers).toEqual(["filler-sachet-01", "filler-sachet-03"]);
    expect(model.products["tomate-1000"]).toMatchObject({ allergenGroup: "sin-alergenos", fillers: ["filler-pouch-01"], lot: 1748 });
  });

  it("CIP por alérgeno: corto si lo que entra ya declara lo que sale; completo si no", () => {
    expect(pairMin(model.allergen, "mostaza", "huevo-mostaza")).toBe(35);
    expect(pairMin(model.allergen, "huevo-mostaza", "mostaza")).toBe(90);
    expect(pairMin(model.allergen, "huevo-mostaza", "sin-alergenos")).toBe(90);
    expect(pairMin(model.allergen, "sin-alergenos", "huevo-mostaza")).toBe(35);
  });

  it("cada lote de llenado sale de una tanda: cabe en ella y no deja una caja completa sin llenar", () => {
    const round = Object.fromEntries(model.demand.map((d) => [d.product, d.round ?? 1]));
    for (const p of Object.values(model.products)) {
      const out = model.batches[p.bulk].out_kg;
      expect(p.lot % round[p.id]).toBe(0);
      expect(p.lot * p.bulkKg).toBeLessThanOrEqual(out);
      expect((p.lot + round[p.id]) * p.bulkKg).toBeGreaterThan(out);
    }
  });
});

describe("cartera y plan manual de la demo", () => {
  const portfolio = inventPortfolio(model, DEMO);

  it("los archivos guardados son los que genera el script", () => {
    expect(saved("orders/cartera-2026-11.json")).toBe(json(portfolio));
    expect(saved("aps/plans/APS-MAN-01.json")).toBe(json(manualSequence(model, portfolio)));
  });

  it("carga cerca del 85 % de la capacidad diaria en los 17 días hábiles", () => {
    const days = new Set(portfolio.orders.map((o) => o.due.slice(0, 10))).size;
    expect(days).toBe(17);
    const cap = model.demand.reduce((s, d) => s + d.daily * days, 0);
    const qty = portfolio.orders.reduce((s, o) => s + o.quantity, 0);
    expect(qty / cap).toBeGreaterThan(0.78);
    expect(qty / cap).toBeLessThan(0.9);
  });

  it("cada pedido llega antes de su entrega, dentro de la ventana de aps.yaml", () => {
    for (const o of portfolio.orders) {
      const lead = (Date.parse(o.due.slice(0, 10)) - Date.parse(o.created.slice(0, 10))) / 864e5;
      const [lo, hi] = o.importance === "alta" ? model.rushLeadDays : model.leadDays;
      expect(lead).toBeGreaterThanOrEqual(lo);
      expect(lead).toBeLessThanOrEqual(hi);
    }
  });

  it("la secuencia manual pone cada pedido una vez, en una llenadora que puede llenarlo", () => {
    const seq = manualSequence(model, portfolio).sequence;
    const placed = Object.entries(seq).flatMap(([m, ids]) => ids.map((id) => ({ m, id })));
    expect(placed.map((x) => x.id).sort()).toEqual(portfolio.orders.map((o) => o.id).sort());
    const byId = new Map(portfolio.orders.map((o) => [o.id, o]));
    for (const { m, id } of placed) expect(model.products[byId.get(id)!.product].fillers).toContain(m);
  });
});
