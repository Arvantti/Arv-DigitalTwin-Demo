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
 */
import type { CustomerOrders, PlannedStop, PlantEvent, ProductionPlan } from "@twin/cosim/core/contracts.ts";
import { iso, parseLocal } from "@twin/cosim/core/time.ts";
import { buildModel, type CatalogData, type PlasticsModel } from "@twin/cosim/adapters/plastic-injection-plant-v1/model.ts";
import { solve, type HighsLike } from "@twin/cosim/adapters/plastic-injection-plant-v1/solve.ts";
import type { FractalStudy, Lever, Scenario, StudyOption } from "../../contracts.ts";

const WINDOW_DAYS = 7;
/** Máquinas candidatas por molde: suficiente para la demo y mantiene el estudio en pocos segundos. */
const MAX_TARGETS = 2;
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
  studyId?: string;
}

interface Variant {
  label: string;
  levers: Lever[];
  molds?: Record<string, string | null>;
  stops?: PlannedStop[];
  portfolio?: CustomerOrders;
  orderChanges?: ProductionPlan["order_changes"];
}

type Setup = Record<string, { tooling: string; color?: string }>;

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
function freeMachinesFor(cat: CatalogData, setup: Setup, tooling: string, out: Set<string>): string[] {
  const route = cat.products.products.flatMap((p) => p.routing).find((r) => r.tooling === tooling);
  return (route?.equipment ?? []).filter((m) => !setup[m] && !out.has(m));
}

/** Copias de repuesto que quedan en el almacén de moldes. */
function sparesLeft(cat: CatalogData, setup: Setup, tooling: string): number {
  const stock = cat.aps?.aps.molds_in_storage?.[tooling] ?? 0;
  const original = Object.values(cat.setup.setup).filter((s) => s.tooling === tooling).length;
  const now = Object.values(setup).filter((s) => s.tooling === tooling).length;
  return Math.max(0, stock - Math.max(0, now - original));
}

const changeMin = (cat: CatalogData, tooling: string) => cat.tooling.tooling.find((t) => t.id === tooling)?.change_min ?? 90;

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

const maxOf = (loads: Record<string, number>) =>
  Object.entries(loads).reduce((best, [equipment, pct]) => (pct > best.pct ? { equipment, pct } : best), { equipment: "", pct: 0 });

/** "día N HH:MM", con el día 0 en el arranque de la cartera (sin fechas de calendario en los textos). */
let day0 = 0;
const hm = (iso: string) => `día ${Math.round((Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) - day0) / 864e5)} ${iso.slice(11, 16)}`;
const label = (m: string) => m.replace("assembly-", "ensamble-").toUpperCase();

export async function runStudy(newHighs: () => Promise<HighsLike>, cat: CatalogData, input: StudyInput): Promise<FractalStudy> {
  const t0 = Date.now();
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
    const prio: Lever = { kind: "prioridad", text: `Subir ${o.id} a importancia alta` };
    variants.push({ label: "Recalcular con la nueva fecha", levers: [{ kind: "recalcular", text: "Recolocar con el cosimulador con la nueva fecha" }], portfolio, orderChanges });
    variants.push({ label: "Nueva fecha + prioridad alta", levers: [prio], portfolio: rush, orderChanges: [{ order: o.id, due, importance: "alta" }] });
    const product = baseModel.products[o.product];
    const toolings = [product.final.tooling, ...product.components.map((c) => c.step.tooling)].filter((x): x is string => !!x);
    for (const tooling of toolings) for (const v of mountSpare(tooling, [prio])) variants.push({ ...v, label: `Prioridad alta + ${v.label.charAt(0).toLowerCase()}${v.label.slice(1)}`, portfolio: rush, orderChanges: [{ order: o.id, due, importance: "alta" }] });
    if (was) question += ` Con la vigente terminaría el ${hm(was.completion)}.`;
  } else if (input.scenario === "balancear") {
    const top = Object.entries(baseLoads)
      .filter(([m]) => baseSetup[m])
      .sort((a, b) => b[1] - a[1]);
    question = `¿Cómo repartir la ocupación de la próxima semana sin sobrecargas (objetivo ${TARGET_LOAD} %)? Hoy la máquina más cargada es ${label(top[0]?.[0] ?? "")} al ${top[0]?.[1] ?? 0} %.`;
    variants.push({ label: "Solo recolocar la secuencia", levers: [{ kind: "recalcular", text: "Recolocar con el cosimulador sin cambiar moldes" }] });
    // Los moldes de los dos cuellos de botella con repuesto en el almacén (un molde montado en dos máquinas cuenta una vez).
    const toolings = [...new Set(top.map(([m]) => baseSetup[m].tooling))].filter((t) => sparesLeft(cat, baseSetup, t) > 0);
    for (const t of toolings.slice(0, 2)) variants.push(...mountSpare(t));
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

  const options: StudyOption[] = [];
  for (const [i, v] of variants.entries()) {
    const id = `${input.studyId ?? "FRA"}-${String.fromCharCode(65 + i)}`;
    const merged = { ...molds, ...(v.molds ?? {}) };
    const model = modelFor(cat, merged);
    const plan = solve(await newHighs(), model, v.portfolio ?? portfolio, { now: input.now, previous: input.previous, events, stops: v.stops, planId: id });
    plan.source = "fractal";
    plan.status = "propuesta";
    plan.notes = [`Fractal · ${v.label}.`, ...v.levers.map((l) => l.text)];
    if (Object.keys(merged).length) plan.molds = merged;
    if (v.orderChanges ?? orderChanges) plan.order_changes = v.orderChanges ?? orderChanges;
    const loads = loadsOf(model, plan, now, winEnd);
    const max = maxOf(loads);
    const moldH = (v.stops ?? []).reduce((s, x) => s + (parseLocal(x.end) - parseLocal(x.start)) / 60, 0);
    const k = plan.kpis;
    // Atraso ante todo; luego pedidos tarde, horas de montaje y cambios de color; al balancear pesa la carga máxima
    // (más aún por encima del objetivo).
    const score =
      k.tardiness_h + 20 * k.late_orders + 2 * moldH + 0.5 * k.changeovers + (input.scenario === "balancear" ? 1.5 * max.pct + 3 * Math.max(0, max.pct - TARGET_LOAD) : 0);
    options.push({ id, label: v.label, levers: v.levers, kpis: k, loads, max_load: max, mold_change_h: Math.round(moldH * 10) / 10, score: Math.round(score * 10) / 10, plan });
  }
  const best = options.reduce((a, b) => (b.score < a.score ? b : a));
  const first = options[0];
  const why =
    best === first
      ? "No hace falta cambiar moldes: basta con recolocar la secuencia."
      : `Frente a solo recolocar (${first.kpis.late_orders} tarde, ${first.kpis.tardiness_h} h de atraso, máxima carga ${first.max_load.pct} % en ${label(first.max_load.equipment)}), queda con ${best.kpis.late_orders} tarde, ${best.kpis.tardiness_h} h de atraso y máxima carga ${best.max_load.pct} % en ${label(best.max_load.equipment)}.`;
  return {
    contract: "fractal-study.v1",
    study_id: input.studyId ?? "FRA",
    plant: baseModel.plant,
    scenario: input.scenario,
    question,
    now: nowIso,
    baseline: { plan_id: input.previous.plan_id, kpis: input.previous.kpis, loads: baseLoads, max_load: maxOf(baseLoads) },
    options,
    best: best.id,
    recommendation: `Recomendación: ${best.label.charAt(0).toLowerCase()}${best.label.slice(1)}. ${why}`,
    seconds: Math.round((Date.now() - t0) / 100) / 10,
  };
}
