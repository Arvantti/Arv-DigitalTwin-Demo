import { describe, expect, it } from "vitest";
import { iso, parseLocal, type PlantEvent } from "@twin/cosim-core";
import { buildModel } from "@plants/sauce-plant-v1-cosim/model.ts";
import { manualPlan } from "@plants/sauce-plant-v1-cosim/manual.ts";
import { demoManual, demoPortfolio, layoutEquipment, sauceData } from "../data.ts";
import { doneOf, equipmentAt, loadIn, oeeAt, plcEquipment, progressOf, signals } from "../plant-state.ts";
import { DEMO_NOW } from "../view.ts";

const model = buildModel(sauceData());
const plan = manualPlan(model, demoPortfolio(), demoManual());
const EQ = plcEquipment(model, layoutEquipment());
const eq = (id: string) => EQ.find((q) => q.id === id)!;
const NOW = parseLocal(DEMO_NOW);
const fail = (equipment: string, hours = 24): PlantEvent => ({ contract: "plant-event.v1", id: "EV-T", plant: model.plant, equipment, kind: "falla", reason: "prueba", start: DEMO_NOW, est_end: iso(NOW + hours * 60, model.timezone) });

describe("Planta de salsas en un instante (emulador y centro de control)", () => {
  it("equipos con PLC: cada línea con sus equipos y los que la detienen, y las seis llenadoras", () => {
    expect(EQ.map((q) => q.id)).toEqual([
      "kettle-01", "kettle-02", "kettle-03", "boiler-01", "pasteurizer-01", "pasteurizer-02",
      "emulsifier-01", "tank-aqueous-01", "colloid-mill-01",
      "tank-mustard-01", "mustard-mill-01",
      ...model.fillers,
    ]);
    expect(eq("boiler-01")).toMatchObject({ role: "apoyo", line: "linea-caliente", name: "Caldera pirotubular" });
    expect(eq("filler-sachet-03").role).toBe("llenadora");
  });

  it("en AHORA cada equipo muestra la fila de la programación que corre en él", () => {
    for (const q of EQ.filter((x) => x.role !== "apoyo")) {
      const s = equipmentAt(model, plan, [], q, NOW);
      const row = plan.schedule.find((r) => r.equipment === q.id && parseLocal(r.start) <= NOW && NOW < parseLocal(r.end));
      expect(s.row).toEqual(row);
      expect(["run", "change", "idle", "plan"]).toContain(s.state);
    }
    // La caldera trabaja mientras la línea caliente tiene una tanda.
    const hot = plan.schedule.some((r) => model.lines["linea-caliente"].equipment.includes(r.equipment) && parseLocal(r.start) <= NOW && NOW < parseLocal(r.end));
    expect(equipmentAt(model, plan, [], eq("boiler-01"), NOW).state).toBe(hot ? "run" : "idle");
    // A las 23:00 no hay turno.
    expect(equipmentAt(model, plan, [], eq("kettle-01"), NOW + 13 * 60).state).toBe("off");
  });

  it("la caldera caída detiene toda la línea caliente; una llenadora caída solo se detiene ella", () => {
    const boiler = [fail("boiler-01")];
    expect(equipmentAt(model, plan, boiler, eq("boiler-01"), NOW).state).toBe("fault");
    for (const id of ["kettle-01", "kettle-02", "kettle-03", "pasteurizer-01", "pasteurizer-02"]) {
      const s = equipmentAt(model, plan, boiler, eq(id), NOW);
      expect(s.state).toBe("blocked");
      expect(s.ev?.equipment).toBe("boiler-01");
    }
    expect(equipmentAt(model, plan, boiler, eq("emulsifier-01"), NOW).state).not.toBe("blocked");
    const filler = [fail("filler-sachet-03")];
    expect(equipmentAt(model, plan, filler, eq("filler-sachet-03"), NOW).state).toBe("fault");
    expect(equipmentAt(model, plan, filler, eq("filler-sachet-01"), NOW).state).not.toBe("fault");
    // Restablecida, vuelve a servicio.
    const cleared = [{ ...fail("boiler-01"), cleared: iso(NOW + 30, model.timezone) }];
    expect(equipmentAt(model, plan, cleared, eq("kettle-02"), NOW + 60).state).not.toBe("blocked");
  });

  it("durante el CIP por alérgeno la llenadora está en cambio, y después llena", () => {
    const r = plan.schedule.find((x) => x.changeover_kind === "alergeno" && x.changeover_min >= 60 && parseLocal(x.start) > NOW)!;
    const a = parseLocal(r.start);
    const s = equipmentAt(model, plan, [], eq(r.equipment), a + 10);
    expect(s.state).toBe("change");
    expect(s.change?.kind).toBe("alergeno");
    expect(s.change?.until).toBe(model.calendar.advance(a, r.changeover_min));
    expect(equipmentAt(model, plan, [], eq(r.equipment), s.change!.until + 1).state).toBe(parseLocal(r.end) > s.change!.until + 1 ? "run" : "idle");
    expect(progressOf(model, r, a + 10)).toBe(0);
    expect(doneOf(model, r, parseLocal(r.end))).toBe(r.quantity);
  });

  it("OEE del turno entre 0 y 1 con calidad de 99 %; la caldera caída baja la disponibilidad de la marmita", () => {
    const k = eq("kettle-02");
    const o = oeeAt(model, plan, [], k, NOW)!;
    expect(o.quality).toBe(0.99);
    expect(o.oee).toBeCloseTo(o.availability * o.performance * o.quality, 10);
    for (const x of [o.availability, o.performance, o.oee]) expect(x).toBeGreaterThan(0), expect(x).toBeLessThanOrEqual(1);
    const later = NOW + 3 * 60;
    const down = oeeAt(model, plan, [fail("boiler-01")], k, later)!;
    expect(down.availability).toBeLessThan(oeeAt(model, plan, [], k, later)!.availability);
  });

  it("ocupación: horas programadas sobre horas disponibles; una falla de un día quita esas horas de turno", () => {
    const d = Math.floor(NOW / 1440) * 1440;
    const q = eq("filler-pouch-01");
    const base = loadIn(model, plan, [], q, d, d + 1440);
    expect(base.shiftH).toBe(16);
    expect(base.availH).toBeCloseTo(16 - plan.downtime.filter((x) => x.equipment === q.id).reduce((s, x) => s + model.calendar.workBetween(Math.max(d, parseLocal(x.start)), Math.min(d + 1440, parseLocal(x.end))), 0) / 60, 6);
    const ev = { ...fail(q.id), start: iso(d + 6 * 60, model.timezone), est_end: iso(d + 14 * 60, model.timezone) };
    const hit = loadIn(model, plan, [ev], q, d, d + 1440);
    expect(base.availH - hit.availH).toBeGreaterThan(0);
    expect(base.availH - hit.availH).toBeLessThanOrEqual(8);
  });

  it("señales: la marmita sostiene la cocción a 88 °C y la llenadora caída marca velocidad cero", () => {
    const r = plan.schedule.find((x) => x.equipment === "kettle-02" && parseLocal(x.start) <= NOW && NOW < parseLocal(x.end));
    if (r) {
      const late = model.calendar.advance(parseLocal(r.start), r.changeover_min) + 0.8 * model.calendar.workBetween(model.calendar.advance(parseLocal(r.start), r.changeover_min), parseLocal(r.end));
      const s = equipmentAt(model, plan, [], eq("kettle-02"), late);
      if (s.state === "run") expect(Math.abs(signals(model, eq("kettle-02"), s, late).find((x) => x.key === "temperature")!.value - 88)).toBeLessThanOrEqual(0.6);
    }
    const f = eq("filler-sachet-03");
    const st = equipmentAt(model, plan, [fail(f.id)], f, NOW);
    expect(signals(model, f, st, NOW).find((x) => x.key === "speed")!.value).toBe(0);
  });
});
