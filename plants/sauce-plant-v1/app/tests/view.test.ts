import { describe, expect, it } from "vitest";
import { parseLocal, type CustomerOrder, type ManualSequence, type PlantEvent } from "@twin/cosim-core";
import { buildModel } from "@plants/sauce-plant-v1-cosim/model.ts";
import { manualPlan } from "@plants/sauce-plant-v1-cosim/manual.ts";
import { demoManual, demoPortfolio, sauceData } from "../data.ts";
import { compareKpis, DEMO_NOW, dayLabel, ganttSections, orderState, score, when } from "../view.ts";

const model = buildModel(sauceData());
const order = (id: string, product: string, quantity: number, created: string): CustomerOrder => ({ id, customer: "Cliente de prueba", product, quantity, unit: "u", created: `${created}-05:00`, due: "2026-10-28T22:00-05:00", importance: "normal" });

describe("APS de salsas: lo que se muestra", () => {
  it("los datos del navegador son los mismos del cosimulador: 128 pedidos y la secuencia de seis llenadoras", () => {
    expect(demoPortfolio().orders).toHaveLength(128);
    expect(Object.keys(demoManual().sequence)).toEqual(model.fillers.slice().sort());
  });

  it("AHORA de la demo es el día 9: miércoles 4 de noviembre a las 10:00 (día 0 = lunes 26 de octubre)", () => {
    const start = parseLocal("2026-10-26T06:00");
    expect(dayLabel(parseLocal(DEMO_NOW), start)).toBe("día 9 · mié 4 nov");
    expect(when(DEMO_NOW)).toBe("mié 4 nov 10:00");
  });

  it("Gantt de un caso a mano: tandas por equipo, llenados con su cambio y la parada de la llenadora", () => {
    const pf = { contract: "customer-orders.v1" as const, plant: model.plant, portfolio_id: "PRUEBA", timezone: "-05:00", plan_start: "2026-10-26T06:00-05:00", orders: [order("PED-A", "tomate-1000", 800, "2026-10-26T06:00"), order("PED-B", "mostaza-250", 1000, "2026-10-26T06:10")] };
    const seq: ManualSequence = { contract: "manual-sequence.v1", plan_id: "PRUEBA", plant: model.plant, portfolio_id: "PRUEBA", author: "prueba", sequence: { "filler-pouch-01": ["PED-A"], "filler-sachet-03": ["PED-B"] } };
    const stop: PlantEvent = { contract: "plant-event.v1", id: "EV-T", plant: model.plant, equipment: "filler-sachet-02", kind: "falla", reason: "prueba", start: "2026-10-26T08:00-05:00", est_end: "2026-10-26T18:00-05:00" };
    const plan = manualPlan(model, pf, seq, { randomDowntime: false, events: [stop] });
    const [proc, fill] = ganttSections(model, plan);
    const lane = (id: string, s = proc) => s.lanes.find((l) => l.id === id)!;
    // Tomate: marmita 01 de 06:00 a 09:33,8; mostaza: tanque 06:00 a 10:46,5 (286,5 min).
    expect(lane("kettle-01").bars.map((b) => [b.text, b.start - parseLocal("2026-10-26T06:00"), b.end - parseLocal("2026-10-26T06:00")])).toEqual([["T001", 0, 214]]);
    expect(lane("tank-mustard-01").bars.map((b) => b.text)).toEqual(["MS001"]);
    expect(lane("kettle-02").bars).toEqual([]);
    // Mostaza 250 en sachet-03, que arranca con formato de 250 ml y sin granel: sin cambio.
    expect(lane("filler-sachet-03", fill).bars.map((b) => [b.text, b.changeoverMin])).toEqual([["B · mostaza-250", 0]]);
    expect(lane("filler-sachet-02", fill).down.map((d) => [d.start - parseLocal("2026-10-26T00:00"), d.end - parseLocal("2026-10-26T00:00")])).toEqual([[480, 1080]]);
  });

  it("estado de cada pedido frente a AHORA y comparación de indicadores (menor es mejor)", () => {
    const man = manualPlan(model, demoPortfolio(), demoManual());
    const now = parseLocal(DEMO_NOW);
    const st = man.orders.map((o) => orderState(o, now));
    expect(st).toContain("hecho");
    expect(st).toContain("por hacer");
    const same = compareKpis(man, man);
    expect(same.map((d) => d.key)).toEqual(["late_orders", "tardiness_h", "changeovers", "cip_h", "waste_kg"]);
    expect(same.some((d) => d.better || d.worse)).toBe(false);
    // Puntaje: atraso + 20 × tarde + 2 × CIP + 1 × formato + 0,05 × merma, con los mismos indicadores del plan.
    const k = man.kpis;
    expect(score(model, man)).toBeCloseTo(k.tardiness_h + 20 * k.late_orders + 2 * k.cip_h! + (k.changeover_h - k.cip_h!) + 0.05 * k.waste_kg!, 0);
  });
});
