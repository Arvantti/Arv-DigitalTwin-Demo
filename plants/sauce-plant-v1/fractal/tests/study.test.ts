import { readFileSync } from "node:fs";
import highsLoader from "highs";
import { describe, expect, it } from "vitest";
import { parseLocal, type PlantEvent } from "@twin/cosim-core";
import { buildModel } from "@plants/sauce-plant-v1-cosim/model.ts";
import { manualPlan } from "@plants/sauce-plant-v1-cosim/manual.ts";
import { fsData, PLANT_DIR } from "@plants/sauce-plant-v1-cosim/fs-data.ts";
import { solve, type HighsLike } from "@plants/sauce-plant-v1-cosim/solve.ts";
import type { CustomerOrders, ManualSequence } from "@twin/cosim-core";
import { dedicated, loadsOf, runStudy } from "../study.ts";

const newHighs = async () => (await highsLoader()) as unknown as HighsLike;
const read = <T>(path: string) => JSON.parse(readFileSync(PLANT_DIR + path, "utf8")) as T;
const model = buildModel(fsData());
const portfolio = read<CustomerOrders>("orders/cartera-2026-11.json");
const previous = manualPlan(model, portfolio, read<ManualSequence>("aps/plans/APS-MAN-01.json"));
const NOW = "2026-11-04T10:00-05:00";
const failure = (equipment: string, end: string): PlantEvent[] => [
  { contract: "plant-event.v1", id: "EV-1", plant: model.plant, equipment, kind: "falla", reason: "Mordaza de sellado", start: NOW, est_end: end },
];

describe("Fractal de salsas", () => {
  it("limpiezas: la opción A es el cosimulador solo; la recomendada tiene el menor puntaje y no atrasa más", async () => {
    const s = await runStudy(newHighs, model, { scenario: "limpiezas", portfolio, now: NOW, previous });
    expect(s.contract).toBe("fractal-study.v1");
    expect(s.options.map((o) => o.levers[0].kind)).toEqual(["recalcular", "campana-dia", "campana-dia", "campana-dia", "campana-dia"]);
    const alone = solve(await newHighs(), model, portfolio, { now: NOW, previous });
    expect(s.options[0].kpis).toEqual(alone.kpis);
    const best = s.options.find((o) => o.id === s.best)!;
    for (const o of s.options) expect(best.score).toBeLessThanOrEqual(o.score);
    expect(best.kpis.late_orders).toBeLessThanOrEqual(s.options[0].kpis.late_orders);
    expect(best.kpis.cip_h!).toBeLessThan(s.options[0].kpis.cip_h!);
    // Cada término del puntaje es su valor por el peso de aps.yaml.
    expect(best.terms.late_orders).toBe(model.score.late_orders * best.kpis.late_orders);
    expect(s.recommendation).toMatch(/^Recomendación: /);
  });

  it("adelantar: todas las opciones llevan la nueva fecha; la de prioridad sube el pedido a alta", async () => {
    const s = await runStudy(newHighs, model, { scenario: "adelantar", portfolio, now: NOW, previous, order: { id: "PED-D11-04", due: "2026-11-05T22:00" } });
    for (const o of s.options) {
      const row = o.plan.orders.find((x) => x.id === "PED-D11-04")!;
      expect(row.due).toBe("2026-11-05T22:00-05:00");
      expect(o.plan.order_changes?.[0]).toMatchObject({ order: "PED-D11-04", due: "2026-11-05T22:00-05:00" });
    }
    expect(s.options[1].plan.orders.find((x) => x.id === "PED-D11-04")!.importance).toBe("alta");
    expect(s.question).toContain("día 10 22:00");
  });

  it("falla: sin un equipo fuera de servicio no hay estudio; con la llenadora de mostaza caída, esperar sin cruzar atrasa más", async () => {
    await expect(runStudy(newHighs, model, { scenario: "falla", portfolio, now: NOW, previous })).rejects.toThrow(/fuera de servicio/);
    const s = await runStudy(newHighs, model, { scenario: "falla", portfolio, now: NOW, previous, events: failure("filler-sachet-03", "2026-11-06T22:00-05:00") });
    expect(s.options).toHaveLength(3);
    const [wait, , noCross] = s.options;
    expect(noCross.kpis.late_orders).toBeGreaterThan(wait.kpis.late_orders);
    expect(s.best).not.toBe(noCross.id);
    // Nada se llena en la llenadora caída mientras está en reparación.
    for (const o of s.options) expect(o.plan.schedule.some((r) => r.equipment === "filler-sachet-03" && r.start > NOW && r.start < "2026-11-06T22:00")).toBe(false);
  });

  it("llenadoras dedicadas: cada producto queda en su llenadora habitual", () => {
    const d = dedicated(model);
    expect(model.products["mostaza-250"].fillers.length).toBeGreaterThan(1);
    for (const p of Object.values(d.products)) expect(p.fillers).toHaveLength(1);
    expect(d.products["mostaza-250"].fillers).toEqual(model.products["mostaza-250"].fillers.slice(0, 1));
  });

  it("ocupación: minutos ocupados sobre minutos de turno; las marmitas cuentan como una línea", () => {
    const a = parseLocal("2026-11-04T06:00-05:00");
    const b = a + 1440; // un día: 16 h de turno
    const row = (equipment: string, start: string, end: string) => ({ op: "x", order: "x", product: "salsa-tomate", stage: "s", equipment, start, end, quantity: 1, unit: "kg", changeover_min: 0 });
    const plan = { ...previous, schedule: [row("kettle-01", "2026-11-04T06:00-05:00", "2026-11-04T10:00-05:00"), row("kettle-02", "2026-11-04T10:00-05:00", "2026-11-04T14:00-05:00"), row("filler-pouch-01", "2026-11-04T06:00-05:00", "2026-11-04T07:36-05:00")] };
    const loads = loadsOf(model, plan, a, b);
    expect(loads["linea-caliente"]).toBe(50); // 8 h de 16
    expect(loads["filler-pouch-01"]).toBe(10); // 1,6 h de 16
    expect(loads["kettle-01"]).toBeUndefined();
  });
});
