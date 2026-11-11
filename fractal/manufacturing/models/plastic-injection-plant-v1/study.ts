/**
 * Fractal de la planta de plásticos: estudios de escenario sobre la programación vigente.
 *
 * El cosimulador coloca la producción con los moldes como están montados. Fractal es multivariable: además de la
 * secuencia, cambia la configuración de la planta (prioridad de un pedido, montar un molde de repuesto del almacén
 * de moldes en una inyectora libre del tamaño correcto, mudar el molde de una máquina parada) y le pide al
 * cosimulador que coloque cada combinación. Compara y recomienda la mejor; el APS decide si la adopta.
 *
 * Escenarios ("¿qué pasaría si?"):
 * - adelantar: un cliente pide su pedido antes; ¿cómo mover todo para cumplirle sin atrasar a los demás?
 * - balancear: repartir la ocupación sin sobrecargas ni cuellos de botella;
 * - falla: una máquina quedó fuera de servicio en el emulador; ¿esperar la reparación o desviar a otra máquina?
 * - cambios: menos cambios de referencia (montaje de molde, purgas de resina y color, con los tiempos de
 *   catalog/changeovers.yaml) sin atrasar pedidos: dedicar un color a cada máquina.
 * - energia: menos kWh (catalog/energy.yaml, solo kWh): dejar las inyectoras calientes de noche frente a apagarlas
 *   fuera de turno (calientan antes del primer lote), y apagar y agrupar la producción en menos días-máquina con las
 *   máquinas que gastan menos por pieza (objetivo "energia" del cosimulador), sin atrasar pedidos.
 * - fijadas: el planificador bloqueó a mano (🔒) algunas órdenes en el Gantt; ¿cómo organizar el resto sin moverlas?
 *   En todos los escenarios las órdenes fijadas se respetan: ninguna opción mueve sus lotes.
 */
import type { CustomerOrders, PlannedStop, PlantEvent, ProductionPlan } from "@twin/cosim/core/contracts.ts";
import { iso, parseLocal } from "@twin/cosim/core/time.ts";
import { buildModel, type CatalogData, type PlasticsModel } from "@twin/cosim/adapters/plastic-injection-plant-v1/model.ts";
import { solve, type HighsLike, type Objective } from "@twin/cosim/adapters/plastic-injection-plant-v1/solve.ts";
import { energyFrom, planEnergy } from "@twin/cosim/adapters/plastic-injection-plant-v1/energy.ts";
import type { FractalStudy, Lever, Scenario, StudyOption } from "../../contracts.ts";

const WINDOW_DAYS = 7;
/** Máquinas candidatas por molde: suficiente para la demo y mantiene el estudio en pocos segundos. */
export const MAX_TARGETS = 2;
/** Ocupación objetivo al balancear: por encima de esto una etapa se considera cargada (supuesto de la demo). */
const TARGET_LOAD = 70;

export interface StudyInput {
  scenario: Scenario;
  portfolio: CustomerOrders;
  /** AHORA (ISO de la planta). */
  now: string;
  /** Programación vigente. */
  previous: ProductionPlan;
  events?: PlantEvent[];
  /** Moldes ya cambiados en la vigente (máquina → molde, null = desmontado). */
  molds?: Record<string, string | null>;
  /** adelantar: el pedido y su nueva fecha de entrega. */
  order?: { id: string; due: string };
  /** Órdenes que el planificador fijó a mano: sus lotes de `previous` no se mueven en ninguna opción. */
  fixed?: string[];
  studyId?: string;
}

export interface Variant {
  label: string;
  levers: Lever[];
  molds?: Record<string, string | null>;
  stops?: PlannedStop[];
  portfolio?: CustomerOrders;
  orderChanges?: ProductionPlan["order_changes"];
  /** Opciones del cosimulador para esta combinación. */
  solver?: { colors?: boolean; dedicateColors?: boolean; objective?: Objective };
  /** Qué hacen las inyectoras fuera de turno en esta opción (energía). */
  overnight?: "apagar" | "caliente";
}

export type Setup = Record<string, { tooling: string; color?: string }>;

export function setupWith(cat: CatalogData, molds: Record<string, string | null>): Setup {
  const out: Setup = { ...cat.setup.setup };
  for (const [m, tooling] of Object.entries(molds)) {
    if (tooling) out[m] = { tooling, color: cat.setup.setup[Object.keys(cat.setup.setup).find((x) => cat.setup.setup[x].tooling === tooling) ?? ""]?.color };
    else delete out[m];
  }
  return out;
}

export const modelFor = (cat: CatalogData, molds: Record<string, string | null>): PlasticsModel => buildModel({ ...cat, setup: { setup: setupWith(cat, molds) } });

/** Inyectoras que pueden llevar el molde (lista del producto en el catálogo), sin molde montado y en servicio. */
export function freeMachinesFor(cat: CatalogData, setup: Setup, tooling: string, out: Set<string>): string[] {
  const route = cat.products.products.flatMap((p) => p.routing).find((r) => r.tooling === tooling);
  return (route?.equipment ?? []).filter((m) => !setup[m] && !out.has(m));
}

/** Copias de repuesto que quedan en el almacén de moldes (copias del catálogo menos las montadas al inicio). */
export function sparesLeft(cat: CatalogData, setup: Setup, tooling: string): number {
  const original = Object.values(cat.setup.setup).filter((s) => s.tooling === tooling).length;
  const copies = cat.tooling.tooling.find((t) => t.id === tooling)?.copies;
  const stock = copies !== undefined ? copies - original : cat.aps?.aps.molds_in_storage?.[tooling] ?? 0;
  const now = Object.values(setup).filter((s) => s.tooling === tooling).length;
  return Math.max(0, stock - Math.max(0, now - original));
}

export const changeMin = (cat: CatalogData, tooling: string) => cat.tooling.tooling.find((t) => t.id === tooling)?.change_min ?? 90;

/**
 * Ocupación de cada máquina en la ventana [a, b]: el trabajo que falta de los pedidos que vencen en la ventana,
 * repartido entre las máquinas que tienen el mismo molde (o la misma celda), sobre las horas de turno de la ventana.
 * Pasa de 100 % cuando la etapa no alcanza: es una sobrecarga, un cuello de botella.
 */
export function loadsOf(model: PlasticsModel, plan: ProductionPlan, a: number, b: number): Record<string, number> {
  const cal = model.calendar;
  const work = Math.max(1, cal.workBetween(a, b));
  const stageOf: Record<string, string> = {};
  for (const p of Object.values(model.products))
    for (const st of [p.final, ...p.components.map((c) => c.step)]) for (const m of st.machines) stageOf[m] = st.tooling ?? m;
  const due = new Map(plan.orders.map((o) => [o.id, parseLocal(o.due)]));
  const need: Record<string, number> = {};
  for (const r of plan.schedule) {
    if ((due.get(r.order) ?? Infinity) > b) continue;
    const st = stageOf[r.equipment] ?? r.equipment;
    need[st] = (need[st] ?? 0) + cal.workBetween(Math.max(a, parseLocal(r.start)), parseLocal(r.end));
  }
  const out: Record<string, number> = {};
  for (const m of model.machines) {
    const st = stageOf[m] ?? m;
    const n = model.machines.filter((x) => (stageOf[x] ?? x) === st).length;
    out[m] = Math.round((1000 * (need[st] ?? 0)) / (n * work)) / 10;
  }
  return out;
}

export const maxOf = (loads: Record<string, number>) =>
  Object.entries(loads).reduce((best, [equipment, pct]) => (pct > best.pct ? { equipment, pct } : best), { equipment: "", pct: 0 });

/** "día N HH:MM", con el día 0 en el arranque de la cartera (sin fechas de calendario en los textos). */
let day0 = 0;
const hm = (iso: string) => `día ${Math.round((Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) - day0) / 864e5)} ${iso.slice(11, 16)}`;
export const label = (m: string) => m.replace("assembly-", "ensamble-").toUpperCase();
const fmtK = (x: number) => Math.round(x).toLocaleString("es-CO");

/** Lo que un estudio necesita saber de la planta y del escenario antes de colocar opciones (sin cosimulador). */
export interface Frame {
  input: StudyInput;
  question: string;
  /** Variantes escritas a mano para el escenario; la primera es la base ("solo recalcular"). */
  variants: Variant[];
  molds: Record<string, string | null>;
  baseModel: PlasticsModel;
  baseSetup: Setup;
  now: number;
  nowIso: string;
  tz: string;
  winEnd: number;
  events: PlantEvent[];
  failed: Set<string>;
  baseLoads: Record<string, number>;
  fixed: string[];
  /** Cartera del escenario (adelantar: con la nueva fecha). */
  portfolio: CustomerOrders;
  orderChanges: ProductionPlan["order_changes"];
}

/** Arma la pregunta y las variantes del escenario. */
export function frameStudy(cat: CatalogData, input: StudyInput): Frame {
  day0 = Date.parse(`${input.portfolio.plan_start.slice(0, 10)}T00:00:00Z`);
  const molds = input.molds ?? {};
  const baseModel = modelFor(cat, molds);
  const baseSetup = setupWith(cat, molds);
  const now = parseLocal(input.now);
  const tz = baseModel.timezone;
  const nowIso = iso(now, tz);
  const winEnd = now + WINDOW_DAYS * 1440;
  const events = input.events ?? [];
  const failed = new Set(events.filter((e) => parseLocal(e.start) <= now && now < parseLocal(e.cleared ?? e.est_end)).map((e) => e.equipment));
  const baseLoads = loadsOf(baseModel, input.previous, now, winEnd);
  const fixed = (input.fixed ?? []).filter((id) => input.previous.schedule.some((r) => r.order === id));
  const variants: Variant[] = [];
  let question = "";
  let portfolio = input.portfolio;
  let orderChanges: ProductionPlan["order_changes"];

  const mountSpare = (tooling: string, extraLevers: Lever[] = []): Variant[] =>
    sparesLeft(cat, baseSetup, tooling) > 0
      ? freeMachinesFor(cat, baseSetup, tooling, failed)
          .slice(0, MAX_TARGETS)
          .map((m) => ({
            label: `Montar el molde de repuesto en ${label(m)}`,
            levers: [...extraLevers, { kind: "montar-molde" as const, text: `Montar la copia de repuesto de ${tooling} (almacén de moldes) en ${label(m)}: ${changeMin(cat, tooling)} min de montaje desde AHORA`, machine: m, tooling }],
            molds: { [m]: tooling },
            stops: [{ equipment: m, start: nowIso, end: iso(now + changeMin(cat, tooling), tz), reason: `Montaje de ${tooling}` }],
          }))
      : [];

  if (input.scenario === "adelantar") {
    const o = input.order && input.portfolio.orders.find((x) => x.id === input.order!.id);
    if (!o || !input.order) throw new Error("Falta el pedido a adelantar.");
    const due = input.order.due.length <= 16 ? `${input.order.due}${tz}` : input.order.due;
    const was = input.previous.orders.find((x) => x.id === o.id);
    question = `¿Cómo mover la programación para entregar ${o.id} (${o.customer}) el ${hm(due)} en vez del ${hm(o.due)}, sin atrasar a los demás?`;
    orderChanges = [{ order: o.id, due }];
    portfolio = { ...input.portfolio, orders: input.portfolio.orders.map((x) => (x.id === o.id ? { ...x, due } : x)) };
    const rush = { ...portfolio, orders: portfolio.orders.map((x) => (x.id === o.id ? { ...x, importance: "alta" as const } : x)) };
    const prio: Lever = { kind: "prioridad", text: `Subir ${o.id} a importancia alta`, order: o.id };
    variants.push({ label: "Recalcular con la nueva fecha", levers: [{ kind: "recalcular", text: "Recolocar con el cosimulador con la nueva fecha" }], portfolio, orderChanges });
    variants.push({ label: "Nueva fecha + prioridad alta", levers: [prio], portfolio: rush, orderChanges: [{ order: o.id, due, importance: "alta" }] });
    const product = baseModel.products[o.product];
    const toolings = [product.final.tooling, ...product.components.map((c) => c.step.tooling)].filter((x): x is string => !!x);
    for (const tooling of toolings) for (const v of mountSpare(tooling, [prio])) variants.push({ ...v, label: `Prioridad alta + ${v.label.charAt(0).toLowerCase()}${v.label.slice(1)}`, portfolio: rush, orderChanges: [{ order: o.id, due, importance: "alta" }] });
    if (was) question += ` Con la vigente terminaría el ${hm(was.completion)}.`;
  } else if (input.scenario === "balancear" || input.scenario === "fijadas") {
    const top = Object.entries(baseLoads)
      .filter(([m]) => baseSetup[m])
      .sort((a, b) => b[1] - a[1]);
    const hot = `Hoy la máquina más cargada es ${label(top[0]?.[0] ?? "")} al ${top[0]?.[1] ?? 0} %.`;
    if (input.scenario === "fijadas") {
      if (!fixed.length) throw new Error("No hay órdenes fijadas: bloquea alguna con el candado del Gantt.");
      question = `Fijaste ${fixed.length === 1 ? "la orden" : `${fixed.length} órdenes`} ${fixed.join(", ")} donde ${fixed.length === 1 ? "está" : "están"}. ¿Cómo organizar el resto de la producción sin moverla${fixed.length === 1 ? "" : "s"}? ${hot}`;
    } else question = `¿Cómo repartir la ocupación de la próxima semana sin sobrecargas (objetivo ${TARGET_LOAD} %)? ${hot}`;
    variants.push({
      label: input.scenario === "fijadas" ? "Organizar el resto sin mover lo fijado" : "Solo recolocar la secuencia",
      levers: [{ kind: "recalcular", text: input.scenario === "fijadas" ? `Recolocar con el cosimulador todo lo demás; ${fixed.join(", ")} no se ${fixed.length === 1 ? "mueve" : "mueven"}` : "Recolocar con el cosimulador sin cambiar moldes" }],
    });
    // Los moldes de los dos cuellos de botella con repuesto en el almacén (un molde montado en dos máquinas cuenta una vez).
    const toolings = [...new Set(top.map(([m]) => baseSetup[m].tooling))].filter((t) => sparesLeft(cat, baseSetup, t) > 0);
    for (const t of toolings.slice(0, 2)) variants.push(...mountSpare(t));
  } else if (input.scenario === "cambios") {
    const k = input.previous.kpis;
    // Máquinas que hoy cambian de referencia en la vigente y el color que tiene montado cada una.
    const busy = [...new Set(input.previous.schedule.filter((r) => r.changeover_min > 0 && parseLocal(r.start) >= now).map((r) => r.equipment))].sort();
    question = `¿Cómo hacer menos cambios de referencia (montaje de molde y purgas de resina y color) sin atrasar pedidos? La vigente tiene ${k.changeovers} cambios y ${k.changeover_h} h de cambio${busy.length ? `, sobre todo en ${busy.map(label).join(", ")}` : ""}.`;
    const dedicate = busy.filter((m) => baseModel.initialColor[m]).map((m) => `${label(m)} queda en ${baseModel.initialColor[m]!.replace(/^mb-/, "")}`);
    variants.push({ label: "Solo recolocar la secuencia", levers: [{ kind: "recalcular", text: "Recolocar con el cosimulador como hoy" }] });
    variants.push({ label: "Dedicar un color por máquina", levers: [{ kind: "dedicar-color", text: `Cada color solo en las máquinas que ya lo tienen montado${dedicate.length ? `: ${dedicate.join(", ")}` : ""}` }], solver: { dedicateColors: true } });
  } else if (input.scenario === "energia") {
    if (!baseModel.energy) throw new Error("La planta no tiene datos de energía (catalog/energy.yaml).");
    const e = energyFrom(baseModel, input.previous, now)!;
    question = `¿Cómo gastar menos energía sin atrasar pedidos? Desde ahora la vigente gasta ${fmtK(e.kwh)} kWh con ${e.heatups} calentamientos en frío (las inyectoras se apagan fuera de turno y calientan antes del primer lote del día).`;
    variants.push({ label: "Dejarlas calientes de noche", levers: [{ kind: "espera-caliente", text: "Recolocar como hoy, pero sin apagar las inyectoras entre turnos: espera caliente de 22:00 a 06:00 y el domingo, sin calentamientos" }], overnight: "caliente" });
    variants.push({ label: "Apagarlas fuera de turno", levers: [{ kind: "apagar", text: "Recolocar como hoy: apagadas de 22:00 a 06:00 y el domingo, con calentamiento antes del primer lote del día" }] });
    variants.push({ label: "Apagar y agrupar la producción", levers: [{ kind: "apagar", text: "Apagadas fuera de turno" }, { kind: "agrupar", text: "El cosimulador con objetivo energía: menos días-máquina encendidos y cada pieza en la máquina que gasta menos" }], solver: { objective: "energia" } });
  } else {
    const ev = events.find((e) => failed.has(e.equipment));
    if (!ev) throw new Error("No hay ninguna máquina fuera de servicio en el emulador.");
    const m = ev.equipment;
    const tooling = baseSetup[m]?.tooling;
    question = `${label(m)} está fuera de servicio desde ${hm(ev.start)} (${ev.reason}) hasta ${hm(ev.est_end)} estimado. ¿Esperar la reparación o desviar su trabajo a otra máquina?`;
    variants.push({ label: "Esperar la reparación y repartir", levers: [{ kind: "recalcular", text: `Recolocar con el cosimulador sin ${label(m)} hasta la reparación` }] });
    if (tooling) {
      for (const target of freeMachinesFor(cat, baseSetup, tooling, failed).slice(0, MAX_TARGETS)) {
        // Montaje del molde (change_min) + traslado y desmontaje (changeovers.yaml).
        const min = changeMin(cat, tooling) + baseModel.moldMoveExtraMin;
        variants.push({
          label: `Mudar el molde a ${label(target)}`,
          levers: [{ kind: "mover-molde", text: `Desmontar ${tooling} de ${label(m)} y montarlo en ${label(target)}: ${min} min desde AHORA`, machine: target, from: m, tooling }],
          molds: { [m]: null, [target]: tooling },
          stops: [{ equipment: target, start: nowIso, end: iso(now + min, tz), reason: `Mudanza de ${tooling} desde ${label(m)}` }],
        });
      }
      variants.push(...mountSpare(tooling));
    }
  }

  return { input, question, variants, molds, baseModel, baseSetup, now, nowIso, tz, winEnd, events, failed, baseLoads, fixed, portfolio, orderChanges };
}

/** Coloca una variante con el cosimulador y le pone el puntaje del escenario (menor es mejor). */
export async function placeOption(newHighs: () => Promise<HighsLike>, cat: CatalogData, f: Frame, v: Variant, id: string): Promise<StudyOption> {
  const { input, molds, events, fixed, portfolio, orderChanges, now, winEnd } = f;
  {
    const merged = { ...molds, ...(v.molds ?? {}) };
    const model = modelFor(cat, merged);
    const plan = solve(await newHighs(), model, v.portfolio ?? portfolio, { now: input.now, previous: input.previous, events, stops: v.stops, planId: id, fixed, ...(v.solver ?? {}) });
    if (v.overnight && plan.energy && v.overnight !== plan.energy.overnight) {
      const e = planEnergy(model, plan, v.overnight)!;
      plan.energy = e;
      Object.assign(plan.kpis, { energy_kwh: e.kwh, kwh_per_kg: e.kwh_per_kg, peak_kw: e.peak_kw });
    }
    plan.source = "fractal";
    plan.status = "propuesta";
    plan.notes = [`Fractal · ${v.label}.`, ...v.levers.map((l) => l.text)];
    if (Object.keys(merged).length) plan.molds = merged;
    if (v.orderChanges ?? orderChanges) plan.order_changes = v.orderChanges ?? orderChanges;
    const loads = loadsOf(model, plan, now, winEnd);
    const max = maxOf(loads);
    const moldH = (v.stops ?? []).reduce((s, x) => s + (parseLocal(x.end) - parseLocal(x.start)) / 60, 0);
    const k = plan.kpis;
    // Atraso ante todo; luego pedidos tarde, horas de montaje y cambios de referencia; al balancear pesa la carga
    // máxima (más aún por encima del objetivo) y en "cambios" pesan las horas de cambio.
    const en = input.scenario === "energia" ? energyFrom(model, plan, now) : undefined;
    const score =
      (en ? en.kwh / 100 : 0) +
      k.tardiness_h +
      20 * k.late_orders +
      2 * moldH +
      0.5 * k.changeovers +
      (input.scenario === "balancear" || input.scenario === "fijadas" ? 1.5 * max.pct + 3 * Math.max(0, max.pct - TARGET_LOAD) : 0) +
      (input.scenario === "cambios" ? 2 * k.changeover_h : 0);
    return { id, label: v.label, levers: v.levers, kpis: k, loads, max_load: max, mold_change_h: Math.round(moldH * 10) / 10, ...(en ? { energy: en } : {}), score: Math.round(score * 10) / 10, plan };
  }
}

/** Texto de por qué gana la mejor frente a la base ("solo recalcular"). */
export function explain(f: Frame, best: StudyOption, first: StudyOption, options: StudyOption[]): string {
  const { input } = f;
  const hot = options.find((o) => o.energy?.overnight === "caliente");
  return (
    input.scenario === "energia" && best.energy
      ? `Desde ahora gasta ${fmtK(best.energy.kwh)} kWh con ${best.energy.heatups} calentamientos${hot?.energy && hot !== best ? `, ${fmtK(hot.energy.kwh - best.energy.kwh)} kWh menos que dejarlas calientes de noche (${Math.round((100 * (hot.energy.kwh - best.energy.kwh)) / hot.energy.kwh)} %)` : ""}. Pedidos tarde: ${best.kpis.late_orders}${best.kpis.late_orders <= input.previous.kpis.late_orders ? ", ninguno más que la vigente" : ""}.`
      : input.scenario === "cambios"
      ? best === first
        ? "Recolocar ya da los menos cambios sin atrasar pedidos."
        : `Frente a solo recolocar (${first.kpis.changeovers} cambios, ${first.kpis.changeover_h} h de cambio, ${first.kpis.late_orders} tarde), queda con ${best.kpis.changeovers} cambios, ${best.kpis.changeover_h} h de cambio y ${best.kpis.late_orders} tarde.`
      : best === first
      ? "No hace falta cambiar moldes: basta con recolocar la secuencia."
      : `Frente a solo recolocar (${first.kpis.late_orders} tarde, ${first.kpis.tardiness_h} h de atraso, máxima carga ${first.max_load.pct} % en ${label(first.max_load.equipment)}), queda con ${best.kpis.late_orders} tarde, ${best.kpis.tardiness_h} h de atraso y máxima carga ${best.max_load.pct} % en ${label(best.max_load.equipment)}.`
  );
}

/** Estudio con las variantes escritas a mano: cada una la coloca el cosimulador y gana la de menor puntaje. */
export async function runStudy(newHighs: () => Promise<HighsLike>, cat: CatalogData, input: StudyInput): Promise<FractalStudy> {
  const t0 = Date.now();
  const f = frameStudy(cat, input);
  const options: StudyOption[] = [];
  for (const [i, v] of f.variants.entries()) options.push(await placeOption(newHighs, cat, f, v, `${input.studyId ?? "FRA"}-${String.fromCharCode(65 + i)}`));
  const best = options.reduce((a, b) => (b.score < a.score ? b : a));
  const why = explain(f, best, options[0], options);
  const { question, baseModel, baseLoads, nowIso, now } = f;
  return {
    contract: "fractal-study.v1",
    study_id: input.studyId ?? "FRA",
    plant: baseModel.plant,
    scenario: input.scenario,
    question,
    now: nowIso,
    baseline: { plan_id: input.previous.plan_id, kpis: input.previous.kpis, loads: baseLoads, max_load: maxOf(baseLoads), ...(input.scenario === "energia" && baseModel.energy ? { energy: energyFrom(baseModel, input.previous, now) } : {}) },
    options,
    best: best.id,
    recommendation: `Recomendación: ${best.label.charAt(0).toLowerCase()}${best.label.slice(1)}. ${why}`,
    seconds: Math.round((Date.now() - t0) / 100) / 10,
  };
}
