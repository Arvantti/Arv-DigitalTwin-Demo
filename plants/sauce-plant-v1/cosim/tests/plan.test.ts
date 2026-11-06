import { readFileSync } from "node:fs";
import highsLoader from "highs";
import { describe, expect, it } from "vitest";
import { parseLocal, type CustomerOrder, type CustomerOrders, type ManualSequence, type PlantEvent, type ProductionPlan } from "@twin/cosim-core";
import { fsData, PLANT_DIR } from "../fs-data.ts";
import { manualPlan } from "../manual.ts";
import { buildModel } from "../model.ts";
import { solve } from "../solve.ts";

const model = buildModel(fsData());
const portfolio = JSON.parse(readFileSync(`${PLANT_DIR}orders/cartera-2026-11.json`, "utf8")) as CustomerOrders;
const manual = JSON.parse(readFileSync(`${PLANT_DIR}aps/plans/APS-MAN-01.json`, "utf8")) as ManualSequence;
const NOW = "2026-11-04T10:00";

const order = (id: string, product: string, quantity: number, created: string, due: string): CustomerOrder => ({
  id,
  customer: "Cliente de prueba",
  product,
  quantity,
  unit: "u",
  created: `${created}-05:00`,
  due: `${due}-05:00`,
  importance: "normal",
});
const small = (orders: CustomerOrder[]): CustomerOrders => ({ contract: "customer-orders.v1", plant: model.plant, portfolio_id: "PRUEBA", timezone: "-05:00", plan_start: "2026-10-26T06:00-05:00", orders });
const fills = (p: ProductionPlan) => p.schedule.filter((r) => r.stage === "llenado");
const batches = (p: ProductionPlan) => p.schedule.filter((r) => r.unit === "kg");
const hm = (iso: string) => iso.slice(5, 16);

/** Reglas que toda programación de salsas debe cumplir, venga de donde venga. */
function checkPlan(plan: ProductionPlan) {
  const byEquipment = new Map<string, ProductionPlan["schedule"]>();
  for (const r of plan.schedule) (byEquipment.get(r.equipment) ?? byEquipment.set(r.equipment, []).get(r.equipment)!).push(r);
  for (const [m, rows] of byEquipment) {
    rows.sort((a, b) => parseLocal(a.start) - parseLocal(b.start));
    for (let i = 1; i < rows.length; i++) expect(parseLocal(rows[i].start) >= parseLocal(rows[i - 1].end), `${m}: ${rows[i - 1].op} y ${rows[i].op} se cruzan`).toBe(true);
  }
  // Una tanda a la vez en cada línea, aunque se muestre en varias marmitas.
  for (const line of Object.values(model.lines)) {
    const rows = batches(plan).filter((r) => r.product === line.bulk).sort((a, b) => parseLocal(a.start) - parseLocal(b.start));
    for (let i = 1; i < rows.length; i++) expect(parseLocal(rows[i].start) >= parseLocal(rows[i - 1].end), `${line.bulk}: dos tandas a la vez`).toBe(true);
  }
  const batchById = new Map(batches(plan).map((b) => [b.batch_id, b]));
  for (const f of fills(plan)) {
    const b = batchById.get(f.batch_id)!;
    const line = model.lines[model.products[f.product].bulk];
    expect(b, `${f.op} sin tanda`).toBeDefined();
    expect(parseLocal(f.start) >= parseLocal(b.end), `${f.op} llena antes de que la tanda esté lista`).toBe(true);
    expect(parseLocal(f.start) <= parseLocal(b.end) + line.holdMin, `${f.op} llena granel vencido`).toBe(true);
    expect(model.products[f.product].fillers).toContain(f.equipment);
  }
  for (const o of plan.orders) {
    const mine = fills(plan).filter((r) => r.order === o.id);
    for (const r of mine) expect(parseLocal(r.start) >= parseLocal(o.created) - 1, `${r.op} empieza antes de que llegue el pedido`).toBe(true);
    expect(mine.reduce((s, r) => s + r.quantity, 0) + (o.unscheduled ?? 0)).toBe(o.quantity);
  }
}

describe("cosimulador de salsas: datos", () => {
  it("cada tanda ocupa la línea out_kg ÷ ritmo (aps.yaml)", () => {
    // 1.960 ÷ 550 × 60 = 213,82 min; 1.477,5 ÷ 618,75 × 60 = 143,27; 985 ÷ 206,25 × 60 = 286,55.
    expect(model.lines["salsa-tomate"].batchMin).toBeCloseTo(213.818, 2);
    expect(model.lines.mayonesa.batchMin).toBeCloseTo(143.273, 2);
    expect(model.lines["mostaza-granel"].batchMin).toBeCloseTo(286.545, 2);
    expect(model.lines["salsa-tomate"].holdMin).toBe(240);
    expect(model.fillerRate).toMatchObject({ "filler-pouch-01": 30, "filler-sachet-03": 60, "filler-sachet-01": 100 });
  });

  it("cambios en la llenadora: CIP por alérgeno al cambiar de granel, formato al cambiar de presentación", () => {
    const ch = model.changeover;
    // Mismo granel y formato: nada. Llenadora limpia (sin granel anterior): solo el formato si cambia.
    expect(ch({ bulk: "mayonesa", format: "fmt-sachet-250" }, { bulk: "mayonesa", format: "fmt-sachet-250" })).toEqual({ min: 0 });
    expect(ch({ format: "fmt-sachet-250" }, { bulk: "mostaza-granel", format: "fmt-sachet-250" })).toEqual({ min: 0 });
    // Mayonesa (huevo) → mostaza: CIP completo con hisopo. Mostaza → mayonesa: CIP corto.
    expect(ch({ bulk: "mayonesa", format: "fmt-sachet-250" }, { bulk: "mostaza-granel", format: "fmt-sachet-250" })).toEqual({ min: 90, kind: "alergeno" });
    expect(ch({ bulk: "mostaza-granel", format: "fmt-sachet-250" }, { bulk: "mayonesa", format: "fmt-sachet-250" })).toEqual({ min: 35, kind: "cip" });
    // Mayonesa de 1.000 a 500 ml: mismo granel, solo el formato (30 min).
    expect(ch({ bulk: "mayonesa", format: "fmt-sachet-1000" }, { bulk: "mayonesa", format: "fmt-sachet-500" })).toEqual({ min: 30, kind: "formato" });
  });
});

describe("cosimulador de salsas: casos calculados a mano", () => {
  const highs = highsLoader();

  it("un pedido: una tanda, el llenado y la merma de lo que sobra", async () => {
    const plan = solve(await highs, model, small([order("PED-A", "tomate-1000", 1748, "2026-10-26T06:00", "2026-10-27T22:00")]), { randomDowntime: false });
    // Tanda 06:00 + 213,8 min = 09:33,8 (se publica al minuto: 09:34); llenado 1.748 ÷ 30 u/min = 58,3 min → 10:32,1.
    expect(batches(plan).map((r) => [r.equipment, hm(r.start), hm(r.end), r.quantity, r.batch_kg])).toEqual([["kettle-01", "10-26T06:00", "10-26T09:34", 1960, 2000]]);
    expect(fills(plan).map((r) => [r.equipment, hm(r.start), hm(r.end), r.quantity, r.changeover_min])).toEqual([["filler-pouch-01", "10-26T09:34", "10-26T10:32", 1748, 0]]);
    // 1.960 − 1.748 × 1,12 = 2,24 kg sobran: nadie más los pide.
    expect(plan.kpis.waste_kg).toBe(2.2);
    expect(plan.kpis.late_orders).toBe(0);
  });

  it("la salsa caliente se vence en el pulmón a las 4 h: el pedido del día siguiente pide tanda nueva", async () => {
    const plan = solve(await highs, model, small([order("PED-A", "tomate-1000", 1748, "2026-10-26T06:00", "2026-10-27T22:00"), order("PED-B", "tomate-1000", 4, "2026-10-27T06:00", "2026-10-28T22:00")]), { randomDowntime: false });
    // Los 2,24 kg del lunes se vencen; el martes otra tanda de 1.960 kg para 4 sachets: sobran 1.960 − 4,48 = 1.955,52.
    expect(batches(plan).map((r) => hm(r.start))).toEqual(["10-26T06:00", "10-27T06:00"]);
    expect(plan.kpis.waste_kg).toBe(1957.8);
  });

  it("una tanda no pasa de un día a otro: si no alcanza a terminar antes de las 22:00, arranca al otro día", async () => {
    const plan = solve(await highs, model, small([order("PED-A", "tomate-1000", 1748, "2026-10-26T20:00", "2026-10-28T22:00")]), { randomDowntime: false });
    // De 20:00 a 22:00 hay 120 min y la tanda necesita 213,8: arranca el martes a las 06:00.
    expect(batches(plan).map((r) => [hm(r.start), hm(r.end)])).toEqual([["10-27T06:00", "10-27T09:34"]]);
  });
});

describe("despacho: no se bota granel que se puede aprovechar", () => {
  it("lo que quedó en el pulmón pasa al pedido que alcanza a llenarlo; la tanda de una llenadora parada se corre", () => {
    // sachet-02 (la única de tomate 250) está parada de 08:00 a 18:00. Secuencia por llegada: A (pouch-01), B (sachet-02),
    // C (pouch-01).
    const pf = small([
      order("PED-A", "tomate-1000", 800, "2026-10-26T06:00", "2026-10-28T22:00"),
      order("PED-B", "tomate-250", 1000, "2026-10-26T06:10", "2026-10-28T22:00"),
      order("PED-C", "tomate-1000", 800, "2026-10-26T06:20", "2026-10-28T22:00"),
    ]);
    const seq: ManualSequence = { contract: "manual-sequence.v1", plan_id: "PRUEBA", plant: model.plant, portfolio_id: "PRUEBA", author: "prueba", sequence: { "filler-pouch-01": ["PED-A", "PED-C"], "filler-sachet-02": ["PED-B"] } };
    const stop: PlantEvent = { contract: "plant-event.v1", id: "EV-T", plant: model.plant, equipment: "filler-sachet-02", kind: "falla", reason: "prueba", start: "2026-10-26T08:00-05:00", est_end: "2026-10-26T18:00-05:00" };
    const plan = manualPlan(model, pf, seq, { randomDowntime: false, events: [stop] });
    // Tanda 1: 06:00 a 09:33,8. A llena 800 ÷ 30 = 26,7 min (09:34 a 10:00) y sobran 1.960 − 896 = 1.064 kg hasta las
    // 13:33,8. B no alcanza (sachet-02 vuelve a las 18:00): C pasa adelante y los usa (10:00 a 10:27); quedan 168 kg.
    expect(fills(plan).map((r) => [r.order, r.equipment, hm(r.start), hm(r.end)])).toEqual([
      ["PED-A", "filler-pouch-01", "10-26T09:34", "10-26T10:00"],
      ["PED-C", "filler-pouch-01", "10-26T10:00", "10-26T10:27"],
      ["PED-B", "filler-sachet-02", "10-26T18:00", "10-26T18:13"],
    ]);
    // La tanda de B no se cocina a las 09:34 para botarla a las 13:34: se corre para terminar a las 18:00
    // (18:00 − 213,8 min = 14:26,2). B llena 1.000 ÷ 80 = 12,5 min.
    expect(batches(plan).map((r) => [hm(r.start), hm(r.end)])).toEqual([["10-26T06:00", "10-26T09:34"], ["10-26T14:26", "10-26T18:00"]]);
    // Merma: los 168 kg que se vencen + lo que sobra de la tanda 2 (1.960 − 280 = 1.680).
    expect(plan.kpis.waste_kg).toBe(1848);
    checkPlan(plan);
  });
});

describe("cosimulador de salsas: cartera de la demo", () => {
  const highs = highsLoader();

  it("el plan manual y el del solver cumplen las reglas; el solver atrasa menos y limpia menos", async () => {
    const man = manualPlan(model, portfolio, manual);
    const sol = solve(await highs, model, portfolio);
    checkPlan(man);
    checkPlan(sol);
    expect(sol.kpis.tardiness_h).toBeLessThan(man.kpis.tardiness_h);
    expect(sol.kpis.late_orders).toBeLessThanOrEqual(man.kpis.late_orders);
    expect(sol.kpis.cip_h!).toBeLessThan(man.kpis.cip_h!);
    expect(sol.kpis.changeovers).toBeLessThan(man.kpis.changeovers);
    // El plan manual alterna las llenadoras de 250 ml en frío: mayonesa y mostaza se cruzan y hay CIP por alérgeno.
    expect(fills(man).some((r) => r.changeover_kind === "alergeno")).toBe(true);
  });

  it("replanea desde AHORA: lo de antes queda igual y una falla de la caldera para la línea caliente", async () => {
    const h = await highs;
    const base = solve(h, model, portfolio);
    const boiler: PlantEvent = { contract: "plant-event.v1", id: "EV-1", plant: model.plant, equipment: "boiler-01", kind: "falla", reason: "Llama apagada", start: `${NOW}-05:00`, est_end: "2026-11-04T16:00-05:00" };
    const re = solve(h, model, portfolio, { now: NOW, previous: base, events: [boiler] });
    checkPlan(re);
    const before = (p: ProductionPlan) => p.schedule.filter((r) => parseLocal(r.start) < parseLocal(NOW)).map((r) => `${r.equipment}|${r.order}|${r.start}|${r.quantity}`).sort();
    expect(before(re)).toEqual(before(base));
    // Ninguna tanda de tomate corre durante la falla (10:00 a 16:00), salvo la que ya venía cocinando.
    const a = parseLocal(NOW);
    const b = parseLocal("2026-11-04T16:00");
    const during = batches(re).filter((r) => r.product === "salsa-tomate" && parseLocal(r.start) >= a && parseLocal(r.start) < b);
    expect(during).toEqual([]);
    expect(re.frozen_until).toBe(`${NOW}-05:00`);
  });

  it("si la llenadora de mostaza falla, la mostaza pasa a la multipropósito de mayonesa", async () => {
    const h = await highs;
    const base = solve(h, model, portfolio);
    const ev: PlantEvent = { contract: "plant-event.v1", id: "EV-2", plant: model.plant, equipment: "filler-sachet-03", kind: "falla", reason: "Mordaza de sellado", start: `${NOW}-05:00`, est_end: "2026-11-06T22:00-05:00" };
    const re = solve(h, model, portfolio, { now: NOW, previous: base, events: [ev] });
    checkPlan(re);
    const out = fills(re).filter((r) => r.equipment === "filler-sachet-03" && parseLocal(r.start) >= parseLocal(NOW) && parseLocal(r.start) < parseLocal("2026-11-06T22:00"));
    expect(out).toEqual([]);
    expect(fills(re).some((r) => r.product === "mostaza-250" && r.equipment === "filler-sachet-01")).toBe(true);
  });
});
