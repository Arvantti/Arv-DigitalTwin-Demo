import { readFileSync } from "node:fs";
import highsLoader from "highs";
import { describe, expect, it } from "vitest";
import type { CustomerOrders, PlantEvent, ProductionPlan } from "../../../core/contracts.ts";
import { parseLocal } from "../../../core/time.ts";
import { editedPlan, manualPlan, moveChunk, queuesOf, type ManualEdit, type ManualPlan } from "../manual.ts";
import { buildModel, moldFitProblem } from "../model.ts";
import { solve, solveScenarios } from "../solve.ts";
import { fsCatalog, MODEL_DIR } from "../scripts/fs-catalog.ts";

const model = buildModel(fsCatalog());
const portfolio = JSON.parse(readFileSync(`${MODEL_DIR}orders/cartera-2026-11.json`, "utf8")) as CustomerOrders;
const manual = JSON.parse(readFileSync(`${MODEL_DIR}aps/plans/APS-MAN-01.json`, "utf8")) as ManualPlan;
const NOW = "2026-11-04T10:00";

/** Reglas que toda programación debe cumplir, venga de donde venga. */
function checkPlan(plan: ProductionPlan) {
  const byMachine = new Map<string, ProductionPlan["schedule"]>();
  for (const r of plan.schedule) (byMachine.get(r.equipment) ?? byMachine.set(r.equipment, []).get(r.equipment)!).push(r);
  for (const [m, rows] of byMachine) {
    rows.sort((a, b) => (a.start < b.start ? -1 : 1));
    for (let i = 1; i < rows.length; i++) expect(rows[i].start >= rows[i - 1].end, `${m}: ${rows[i - 1].op} y ${rows[i].op} se cruzan`).toBe(true);
  }
  for (const o of plan.orders) {
    const rows = plan.schedule.filter((r) => r.order === o.id);
    for (const r of rows) expect(parseLocal(r.start) >= parseLocal(o.created) - 1, `${r.op} empieza antes de que llegue el pedido`).toBe(true);
    const fin = rows.filter((r) => r.product === o.product).reduce((s, r) => s + r.quantity, 0);
    expect(fin + (o.unscheduled ?? 0)).toBe(o.quantity);
  }
}

describe("APS de plásticos", () => {
  it("los tiempos de cambio salen de los datos: molde, resina y color", () => {
    // Valores de catalog/changeovers.yaml y tooling.yaml, calculados a mano.
    const ch = model.changeover;
    // Mismo molde y color: nada.
    expect(ch({ tooling: "mold-balde-12l", color: "mb-azul" }, { tooling: "mold-balde-12l", color: "mb-azul" }).min).toBe(0);
    // Solo color: de claro a oscuro es corto, de oscuro a claro es largo.
    expect(ch({ tooling: "mold-balde-12l", color: "mb-blanco" }, { tooling: "mold-balde-12l", color: "mb-azul" })).toMatchObject({ min: 30, kind: "color" });
    expect(ch({ tooling: "mold-balde-12l", color: "mb-azul" }, { tooling: "mold-balde-12l", color: "mb-blanco" })).toMatchObject({ min: 60, kind: "color" });
    // Cubiertos (PS, blanco) → pedal (PP reciclado, azul): montaje 60 + max(purga de resina 45, purga de color 30) = 105.
    expect(ch({ tooling: "mold-cubiertos-16c", color: "mb-blanco" }, { tooling: "mold-pedal-palanca-2c", color: "mb-azul" })).toMatchObject({ min: 105, kind: "molde", moldMin: 60, resinMin: 45, colorMin: 30 });
    // Pedal (PP reciclado, azul) → cubiertos (PS, blanco): montaje 45 + max(75, 60) = 120.
    expect(ch({ tooling: "mold-pedal-palanca-2c", color: "mb-azul" }, { tooling: "mold-cubiertos-16c", color: "mb-blanco" })).toMatchObject({ min: 120, kind: "molde" });
    // El ensamble (sin molde) no tiene cambios.
    expect(ch({ color: "mb-gris" }, { color: "mb-azul" }).min).toBe(0);
  });

  it("cada cambio del plan dice qué lo causa", async () => {
    const plan = solve(await highsLoader(), model, portfolio, { planId: "T-CO" });
    const cos = plan.schedule.filter((r) => r.changeover_min > 0);
    expect(cos.length).toBe(plan.kpis.changeovers);
    for (const r of cos) expect(["molde", "resina", "color"]).toContain(r.changeover_kind);
  });

  it("la cartera inventada tiene una semana de ventana como máximo", () => {
    for (const o of portfolio.orders) expect((parseLocal(o.due) - parseLocal(o.created)) / 1440).toBeLessThanOrEqual(8);
  });

  it("la programación manual respeta máquinas, llegadas y cantidades", () => {
    checkPlan(manualPlan(model, portfolio, manual));
  });

  it("el solver programa todo, cumple las reglas y no es peor que la manual", async () => {
    const highs = await highsLoader();
    const man = manualPlan(model, portfolio, manual);
    const sol = solve(highs, model, portfolio);
    checkPlan(sol);
    console.log("manual", JSON.stringify(man.kpis), "solver", JSON.stringify(sol.kpis), JSON.stringify(sol.solver));
    expect(sol.orders.filter((o) => o.unscheduled).length).toBe(0);
    expect(sol.kpis.tardiness_h).toBeLessThanOrEqual(man.kpis.tardiness_h);
  });

  it("al replanear desde AHORA no cambia lo que ya empezó", async () => {
    const highs = await highsLoader();
    const base = solve(highs, model, portfolio);
    const extra: CustomerOrders = { ...portfolio, orders: [...portfolio.orders, { id: "PED-NUEVO-01", customer: "Hogar Express", product: "balde-12l", quantity: 800, color: "mb-blanco", due: "2026-11-06T22:00-05:00", created: "2026-11-04T09:00-05:00", importance: "alta", added: true }] };
    const again = solve(await highsLoader(), model, extra, { now: NOW, previous: base });
    checkPlan(again);
    const before = (p: ProductionPlan) => p.schedule.filter((r) => r.start.slice(0, 16) < NOW).map((r) => `${r.order}|${r.equipment}|${r.start}|${r.quantity}`).sort();
    const a = before(again), b0 = before(base);
    expect(a).toEqual(b0);
    const nuevo = again.orders.find((o) => o.id === "PED-NUEVO-01")!;
    expect(nuevo.late_h).toBe(0);
  });

  it("una falla del emulador corta el lote en curso y el cosimulador desvía el trabajo", async () => {
    const highs = await highsLoader();
    const base = solve(highs, model, portfolio);
    const falla: PlantEvent = { contract: "plant-event.v1", id: "EV-1", plant: model.plant, equipment: "imm-01", kind: "falla", reason: "resistencia del cañón", start: `${NOW}-05:00`, est_end: "2026-11-05T14:00-05:00" };
    const sol = solve(await highsLoader(), model, portfolio, { now: NOW, previous: base, events: [falla] });
    const man = manualPlan(model, portfolio, manual, { now: NOW, previous: base, events: [falla] });
    for (const plan of [sol, man]) {
      checkPlan(plan);
      const clash = plan.schedule.filter((r) => r.equipment === "imm-01" && r.end.slice(0, 16) > NOW && r.start.slice(0, 16) < "2026-11-05T14:00");
      expect(clash.map((r) => `${r.op} ${r.start} ${r.end} ${r.quantity}`), "nada corre en la máquina parada").toEqual([]);
      expect(plan.downtime.some((d) => d.equipment === "imm-01" && d.reason.startsWith("Falla"))).toBe(true);
    }
    const moved = sol.schedule.filter((r) => r.equipment === "imm-02" && r.start.slice(0, 16) >= NOW && r.start.slice(0, 16) < "2026-11-05T14:00");
    expect(moved.length).toBeGreaterThan(0);
    console.log("falla imm-01 · manual", JSON.stringify(man.kpis), "· cosimulador", JSON.stringify(sol.kpis));
    expect(sol.kpis.tardiness_h).toBeLessThanOrEqual(man.kpis.tardiness_h);
  });

  it("arrastrar una orden a otra máquina y fijarle la hora recalcula desde AHORA", () => {
    const base = manualPlan(model, portfolio, manual, { now: NOW });
    const queues = queuesOf(base, NOW);
    // Un tramo de imm-01 que todavía no empieza pasa a imm-02, de primero, sin arrancar antes de mañana 08:00.
    const chunk = queues["imm-01"][0];
    const from = { machine: "imm-01", index: queues["imm-01"].indexOf(chunk) };
    const moved = moveChunk(queues, from, { machine: "imm-02", index: 0, notBefore: "2026-11-05T08:00" });
    expect(moved["imm-02"][0]).toMatchObject({ job: chunk.job, qty: chunk.qty, notBefore: "2026-11-05T08:00" });
    expect(moved["imm-01"].some((c) => c.job === chunk.job)).toBe(false);
    const edit: ManualEdit = { contract: "manual-edit.v1", plan_id: "APS-MAN-02", author: "planificador", queues: moved, moves: [`${chunk.job} a IMM-02`] };
    const plan = editedPlan(model, portfolio, edit, { now: NOW, previous: base });
    checkPlan(plan);
    const [order, product] = chunk.job.split("/");
    const rows = plan.schedule.filter((r) => r.order === order && r.product === product && r.start.slice(0, 16) >= NOW);
    expect(rows.every((r) => r.equipment === "imm-02")).toBe(true);
    expect(rows.every((r) => r.start.slice(0, 16) >= "2026-11-05T08:00")).toBe(true);
    // Lo que ya empezó no cambia.
    const before = (p: ProductionPlan) => p.schedule.filter((r) => r.start.slice(0, 16) < NOW).map((r) => `${r.order}|${r.equipment}|${r.start}|${r.quantity}`).sort();
    expect(before(plan)).toEqual(before(base));
  });

  it("el cosimulador organiza el resto sin mover los pedidos fijados", async () => {
    const base = manualPlan(model, portfolio, manual, { now: NOW });
    // Fija los dos primeros pedidos que todavía no empiezan.
    const later = base.orders.filter((o) => o.start.slice(0, 16) > NOW).slice(0, 2).map((o) => o.id);
    expect(later.length).toBe(2);
    const sol = solve(await highsLoader(), model, portfolio, { now: NOW, previous: base, fixed: later });
    checkPlan(sol);
    expect(sol.fixed_orders).toEqual(later);
    const rowsOf = (p: ProductionPlan) => p.schedule.filter((r) => later.includes(r.order)).map((r) => `${r.order}|${r.product}|${r.equipment}|${r.start}|${r.end}|${r.quantity}`).sort();
    expect(rowsOf(sol)).toEqual(rowsOf(base));
    // El ajuste manual también los respeta.
    const edit: ManualEdit = { contract: "manual-edit.v1", plan_id: "APS-MAN-02", author: "planificador", queues: queuesOf(sol, NOW), moves: [] };
    const man = editedPlan(model, portfolio, edit, { now: NOW, previous: sol, fixed: later });
    checkPlan(man);
    expect(rowsOf(man)).toEqual(rowsOf(base));
  });
});

describe("escenarios: entregas primero, menos cambios si no empeora", () => {
  it("el escenario de menos cambios solo aparece si cumple entregas y baja cambios", async () => {
    const highs = await highsLoader();
    const sc = solveScenarios(highs, model, portfolio, { timeLimitS: 20 });
    expect(sc[0].id).toBe("entregas");
    for (const s of sc) checkPlan(s.plan);
    // Con la cartera de la demo el escenario de menos cambios tiene que aparecer: mismas entregas, menos cambios.
    const alt = sc.find((s) => s.id === "menos-cambios");
    expect(alt, "la cartera de la demo debe ofrecer menos cambios").toBeDefined();
    expect(alt!.plan.kpis.changeovers).toBeLessThan(sc[0].plan.kpis.changeovers);
    expect(alt!.plan.kpis.tardiness_h).toBeLessThanOrEqual(sc[0].plan.kpis.tardiness_h);
    expect(alt!.plan.kpis.on_time_pct).toBeGreaterThanOrEqual(sc[0].plan.kpis.on_time_pct);
    console.log("escenarios", sc.map((s) => `${s.id}:${s.plan.kpis.changeovers}/${s.plan.kpis.tardiness_h}`).join(" "));
  }, 180_000);
});

describe("el cambio de molde no se parte entre turnos", () => {
  it("cada cambio de referencia cabe entero dentro de un turno", async () => {
    const highs = await highsLoader();
    const sol = solve(highs, model, portfolio, { timeLimitS: 30 });
    const cal = model.calendar;
    const changes = sol.schedule.filter((r) => r.changeover_min > 0);
    expect(changes.length).toBeGreaterThan(0);
    for (const r of changes) {
      const a = parseLocal(r.start);
      const co = r.changeover_min;
      expect(cal.workBetween(a, a + co), `${r.equipment} ${r.op}`).toBe(co);
    }
  }, 120_000);
});

describe("un objetivo por corrida", () => {
  it("cada objetivo real programa todo y cumple las reglas", async () => {
    const highs = await highsLoader();
    for (const objective of ["entregas", "cambios", "cuellos", "capacidad"] as const) {
      const sol = solve(highs, model, portfolio, { objective, timeLimitS: 30 });
      checkPlan(sol);
      console.log("objetivo", objective, JSON.stringify(sol.kpis), JSON.stringify(sol.solver));
      // La cartera se programa completa con todos los objetivos.
      expect(sol.orders.filter((o) => o.unscheduled).length, objective).toBe(0);
    }
  }, 180_000);
});

describe("tamaño de molde y de inyectora", () => {
  it("un molde que exige más cierre que la inyectora no se monta ahí", () => {
    const cat = fsCatalog();
    const heavy = cat.tooling.tooling.find((t) => (t.min_clamp_t ?? 0) > 150)!;
    const small = "imm-01"; // 100 t de cierre
    expect(moldFitProblem(cat, small, heavy.id)).toMatch(/necesita/);
    cat.setup.setup[small] = { tooling: heavy.id };
    expect(() => buildModel(cat)).toThrow(/Montaje no válido en imm-01/);
  });
  it("un molde chico sí cabe en una inyectora grande", () => {
    const cat = fsCatalog();
    const light = cat.tooling.tooling.find((t) => (t.min_clamp_t ?? 0) > 0 && (t.min_clamp_t ?? 0) <= 100)!;
    expect(moldFitProblem(cat, "imm-21", light.id)).toBeUndefined();
  });
});

describe("moldes como recursos", () => {
  it("cada molde declara sus copias y ninguna está montada en dos inyectoras", () => {
    const balde = model.molds.find((t) => t.id === "mold-balde-12l")!;
    expect(balde.copies).toBe(3);
    expect(Object.values(model.mounted).filter((t) => t === balde.id).length).toBe(2);
    for (const t of model.molds) expect(Object.values(model.mounted).filter((x) => x === t.id).length).toBeLessThanOrEqual(t.copies);
  });

  it("rechaza un montaje con más inyectoras que copias del molde", () => {
    const cat = fsCatalog();
    const tooling = cat.tooling.tooling.map((t) => (t.id === "mold-pedal-palanca-2c" ? { ...t, copies: 1 } : t));
    expect(() => buildModel({ ...cat, tooling: { tooling } })).toThrow(/solo tiene 1 copias/);
  });
});

describe("Energía del plan (catalog/energy.yaml, solo kWh)", () => {
  // Plan de juguete: imm-21 con dos lotes el mismo día y uno al día siguiente.
  const row = (start: string, end: string, quantity: number, changeover_min = 0) =>
    ({ op: start, order: "P", product: "balde-12l", stage: "inyeccion", equipment: "imm-21", start, end, quantity, unit: "u", changeover_min, tooling: "mold-balde-12l" }) as ProductionPlan["schedule"][number];
  const toy = {
    from: "2026-11-02",
    to: "2026-11-03",
    timezone: "-05:00",
    schedule: [row("2026-11-02T06:00", "2026-11-02T10:00", 480), row("2026-11-02T12:00", "2026-11-02T14:00", 200, 60), row("2026-11-03T06:00", "2026-11-03T07:00", 120)],
  };
  const p = model.energy!.injection["imm-21"]["mold-balde-12l"];

  it("cuenta producción, espera caliente y un calentamiento por día, con los kW del modelo físico", async () => {
    const { planEnergy } = await import("../energy.ts");
    const e = planEnergy(model, toy)!;
    expect(e.overnight).toBe("apagar");
    expect(e.heatups).toBe(2);
    expect(e.heatup_kwh).toBeCloseTo(2 * p.heatup_kwh, 0);
    // Produciendo: 4 h + 1 h (después de la purga de 60 min) + 1 h.
    expect(e.run_kwh).toBeCloseTo(6 * p.run_kw, 0);
    // Espera caliente: el hueco de 10:00 a 12:00 y la purga de 12:00 a 13:00.
    expect(e.standby_kwh).toBeCloseTo(3 * p.standby_kw, 0);
    expect(e.kg).toBe(Math.round(800 * 0.52));
    expect(e.services_kwh).toBeGreaterThan(0);
    expect(Math.abs(e.kwh - (e.run_kwh + e.standby_kwh + e.heatup_kwh + e.off_kwh + e.services_kwh))).toBeLessThanOrEqual(2);
  });

  it("dejarlas calientes de noche ahorra calentamientos pero gasta más", async () => {
    const { planEnergy } = await import("../energy.ts");
    const off = planEnergy(model, toy)!;
    const hot = planEnergy(model, toy, "caliente")!;
    expect(hot.heatups).toBe(1);
    // 16 h de espera caliente (14:00 a 06:00) gastan más que un calentamiento.
    expect(hot.kwh).toBeGreaterThan(off.kwh);
  });

  it("todo plan del APS trae su energía en los indicadores", async () => {
    const plan = solve(await highsLoader(), model, portfolio, { planId: "T-EN" });
    expect(plan.energy).toBeDefined();
    expect(plan.kpis.energy_kwh).toBe(plan.energy!.kwh);
    expect(plan.kpis.kwh_per_kg).toBeGreaterThan(0.3);
    expect(plan.kpis.kwh_per_kg).toBeLessThan(3);
    // La demanda pico no pasa del transformador de 3.000 kVA.
    expect(plan.kpis.peak_kw).toBeLessThan(3000);
    // Las inyectoras se apagan fuera de turno: un calentamiento por máquina y día con trabajo.
    expect(plan.energy!.heatups).toBeGreaterThan(model.machines.length);
  });
});

describe("Potencia en vivo con variación (energy.yaml)", () => {
  const row = (start: string, end: string, quantity: number) =>
    ({ op: start, order: "P", product: "balde-12l", stage: "inyeccion", equipment: "imm-21", start, end, quantity, unit: "u", changeover_min: 0, tooling: "mold-balde-12l" }) as ProductionPlan["schedule"][number];
  const toy = { from: "2026-11-02", to: "2026-11-02", timezone: "-05:00", schedule: [row("2026-11-02T06:00", "2026-11-02T10:00", 480)] };
  const p = model.energy!.injection["imm-21"]["mold-balde-12l"];
  const T = (hhmm: string) => parseLocal(`2026-11-02T${hhmm}`);

  it("produciendo varía minuto a minuto alrededor de run_kw, con la variación del modelo físico", async () => {
    const { powerAt } = await import("../energy.ts");
    const kws = Array.from({ length: 120 }, (_, i) => powerAt(model, toy, "imm-21", T("07:00") + i).kw);
    const mean = kws.reduce((s, x) => s + x, 0) / kws.length;
    const sd = Math.sqrt(kws.reduce((s, x) => s + (x - mean) ** 2, 0) / kws.length);
    expect(new Set(kws.map((x) => x.toFixed(2))).size).toBeGreaterThan(50);
    expect(mean).toBeCloseTo(p.run_kw, 0);
    expect(sd / p.run_kw).toBeLessThan((3 * (p.run_sd_pct ?? 1)) / 100);
    // Reproducible: el mismo minuto da siempre lo mismo.
    expect(powerAt(model, toy, "imm-21", T("07:30")).kw).toBe(kws[30]);
  });

  it("el calentamiento arranca con las resistencias a tope y suma la energía del modelo", async () => {
    const { powerAt } = await import("../energy.ts");
    const start = T("06:00") - p.heatup_min;
    expect(powerAt(model, toy, "imm-21", start).state).toBe("heatup");
    expect(powerAt(model, toy, "imm-21", start).kw).toBeCloseTo(p.heatup_peak_kw!, 1);
    let kwh = 0;
    for (let t = start; t < T("06:00"); t++) kwh += powerAt(model, toy, "imm-21", t + 0.5).kw / 60;
    expect(kwh).toBeCloseTo(p.heatup_kwh, 0);
    expect(powerAt(model, toy, "imm-21", T("23:00")).state).toBe("off");
  });

  it("la planta no pasa del transformador y una máquina en falla se cuenta apagada", async () => {
    const { plantPowerAt } = await import("../energy.ts");
    const plan = solve(await highsLoader(), model, portfolio, { planId: "T-PW" });
    const t = parseLocal("2026-11-04T10:00");
    const now = plantPowerAt(model, plan, t);
    expect(now.limitKw).toBe(2700);
    expect(now.kw).toBeGreaterThan(0);
    expect(now.kw).toBeLessThan(now.limitKw!);
    expect(now.servicesKw).toBeGreaterThan(0);
    const down = plantPowerAt(model, plan, t, new Set(["imm-21"]));
    expect(down.byEq["imm-21"].state).toBe("off");
    expect(down.kw).toBeLessThan(now.kw);
  });
});
