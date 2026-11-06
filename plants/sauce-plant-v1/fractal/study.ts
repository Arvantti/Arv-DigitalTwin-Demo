/**
 * Fractal de la planta de salsas: estudios de escenario sobre la programación vigente.
 *
 * El cosimulador coloca la producción turno por turno y recorre las recetas de cada línea en su orden una vez por turno.
 * Fractal cambia cómo se organiza la planta y le pide al cosimulador que coloque cada combinación:
 * - campañas por día: cada línea recorre su orden de recetas una sola vez al día (menos cambios y menos CIP);
 * - recetas pequeñas cada 2 o 3 días: BBQ, picante, light y rosada solo en algunos días, todas juntas (menos CIP y
 *   menos merma, pero un pedido urgente de esas recetas puede esperar);
 * - llenadoras dedicadas: las multipropósito de 250 ml no se cruzan (sachet-01 solo mayonesa, sachet-03 solo mostaza);
 * - prioridad alta para un pedido que un cliente pide antes.
 * Compara con el puntaje de la planta (aps/aps.yaml, score) y recomienda. Fractal recomienda; la persona decide.
 *
 * Escenarios:
 * - adelantar: un cliente pide su pedido antes; ¿cómo cumplirle sin atrasar a los demás?
 * - limpiezas: menos CIP y menos merma sin atrasar pedidos;
 * - falla: un equipo quedó fuera de servicio; ¿qué conviene mientras lo reparan?
 */
import { iso, parseLocal, type CustomerOrders, type PlanKpis, type PlantEvent, type ProductionPlan } from "@twin/cosim-core";
import { dayLabel, runStudy as run, type FractalStudy, type Lever, type StudyModel, type Variant } from "@twin/fractal-core";
import type { SauceModel } from "@plants/sauce-plant-v1-cosim/model.ts";
import { solve, type HighsLike, type SolveOptions } from "@plants/sauce-plant-v1-cosim/solve.ts";

export type SauceScenario = "adelantar" | "limpiezas" | "falla";

export const SCENARIO_NAMES: Record<SauceScenario, string> = {
  adelantar: "Adelantar un pedido",
  limpiezas: "Menos CIP y merma",
  falla: "Falla de un equipo",
};

/** Ventana del estudio para la ocupación: los próximos 7 días desde AHORA. */
const WINDOW_DAYS = 7;

export interface StudyInput {
  scenario: SauceScenario;
  portfolio: CustomerOrders;
  /** AHORA (ISO de la planta). */
  now: string;
  /** Programación vigente. */
  previous: ProductionPlan;
  /** Fallas del emulador (o simuladas en la pantalla). */
  events?: PlantEvent[];
  /** adelantar: el pedido y su nueva entrega. */
  order?: { id: string; due: string };
  studyId?: string;
}

/** Lo que una variante le cambia al cosimulador. */
interface Setup {
  portfolio?: CustomerOrders;
  dedicate?: boolean;
  solver?: Pick<SolveOptions, "campaign" | "minorEvery">;
  orderChanges?: ProductionPlan["order_changes"];
}

/** La planta con las multipropósito dedicadas: cada producto solo en su llenadora habitual (la primera de la lista). */
export const dedicated = (model: SauceModel): SauceModel => ({
  ...model,
  products: Object.fromEntries(Object.entries(model.products).map(([k, p]) => [k, { ...p, fillers: p.fillers.slice(0, 1) }])),
});

/**
 * Ocupación de cada línea de proceso y de cada llenadora en la ventana [a, b): minutos ocupados (con los cambios) sobre
 * los minutos de turno. Una línea con varias marmitas cuenta como una sola, porque las tandas salen de a una.
 */
export function loadsOf(model: SauceModel, plan: ProductionPlan, a: number, b: number): Record<string, number> {
  const cal = model.calendar;
  const work = Math.max(1, cal.workBetween(a, b));
  const lineOf: Record<string, string> = {};
  for (const l of Object.values(model.lines)) for (const eq of l.equipment) lineOf[eq] = l.id;
  const busy: Record<string, number> = Object.fromEntries([...Object.keys(model.lines), ...model.fillers].map((k) => [k, 0]));
  for (const r of plan.schedule) {
    const k = lineOf[r.equipment] ?? r.equipment;
    if (!(k in busy)) continue;
    const s = Math.max(a, parseLocal(r.start));
    const e = Math.min(b, parseLocal(r.end));
    if (e > s) busy[k] += cal.workBetween(s, e);
  }
  return Object.fromEntries(Object.entries(busy).map(([k, v]) => [k, Math.round((1000 * v) / work) / 10]));
}

/** Términos del puntaje sin peso (los pesos están en aps/aps.yaml, score). */
export const termsOf = (k: PlanKpis): Record<string, number> => ({
  tardiness_h: k.tardiness_h,
  late_orders: k.late_orders,
  cip_h: k.cip_h ?? 0,
  format_change_h: Math.max(0, k.changeover_h - (k.cip_h ?? 0)),
  waste_kg: k.waste_kg ?? 0,
});

const n1 = (x: number) => x.toLocaleString("es-CO", { maximumFractionDigits: 1 });
const n0 = (x: number) => Math.round(x).toLocaleString("es-CO");

const RECALC: Lever = { kind: "recalcular", text: "Recolocar con el cosimulador, turno por turno" };
const DAY_CAMPAIGN: Lever = { kind: "campana-dia", text: "Cada línea recorre su orden de recetas una sola vez al día (tomate → BBQ → picante; light → mayonesa → rosada)" };
const minorLever = (every: number): Lever => ({ kind: "campana-recetas", text: `BBQ, picante, light y rosada solo uno de cada ${every} días, todas juntas` });
const DEDICATE: Lever = { kind: "dedicar-llenadora", text: "Las multipropósito de 250 ml no se cruzan: filler-sachet-01 solo mayonesa, filler-sachet-03 solo mostaza (sin CIP por alérgeno entre ellas)" };

export async function runStudy(newHighs: () => Promise<HighsLike>, model: SauceModel, input: StudyInput): Promise<FractalStudy> {
  const now = parseLocal(input.now);
  const tz = model.timezone;
  const day0 = input.portfolio.plan_start;
  const hm = (t: string) => dayLabel(day0, t);
  const winEnd = now + WINDOW_DAYS * 1440;
  const events = input.events ?? [];
  const failed = events.filter((e) => parseLocal(e.start) <= now && now < parseLocal(e.cleared ?? e.est_end));
  const k0 = input.previous.kpis;
  const v = (label: string, levers: Lever[], data: Setup = {}): Variant => ({ label, levers, data });

  const frame = () => {
    if (input.scenario === "adelantar") {
      const o = input.order && input.portfolio.orders.find((x) => x.id === input.order!.id);
      if (!o || !input.order) throw new Error("Falta el pedido a adelantar.");
      const due = input.order.due.length <= 16 ? `${input.order.due}${tz}` : input.order.due;
      const was = input.previous.orders.find((x) => x.id === o.id);
      const moved = { ...input.portfolio, orders: input.portfolio.orders.map((x) => (x.id === o.id ? { ...x, due } : x)) };
      const rush = { ...moved, orders: moved.orders.map((x) => (x.id === o.id ? { ...x, importance: "alta" as const } : x)) };
      const prio: Lever = { kind: "prioridad", text: `Subir ${o.id} a importancia alta` };
      const changes = [{ order: o.id, due }];
      const rushChanges = [{ order: o.id, due, importance: "alta" as const }];
      return {
        question: `¿Cómo entregar ${o.id} (${o.customer}, ${o.quantity.toLocaleString("es-CO")} u) el ${hm(due)} en vez del ${hm(o.due)}, sin atrasar a los demás?${was ? ` Con la vigente terminaría el ${hm(was.completion)}.` : ""}`,
        variants: [
          v("Recalcular con la nueva fecha", [{ ...RECALC, text: "Recolocar con el cosimulador con la nueva fecha" }], { portfolio: moved, orderChanges: changes }),
          v("Nueva fecha + prioridad alta", [prio], { portfolio: rush, orderChanges: rushChanges }),
          v("Prioridad alta + campañas por día", [prio, DAY_CAMPAIGN], { portfolio: rush, orderChanges: rushChanges, solver: { campaign: "dia" } }),
        ],
      };
    }
    if (input.scenario === "limpiezas")
      return {
        question: `¿Cómo lavar menos y botar menos salsa sin atrasar pedidos? La vigente tiene ${n1(k0.cip_h ?? 0)} h de CIP, ${n1(Math.max(0, k0.changeover_h - (k0.cip_h ?? 0)))} h de otros cambios y ${n0(k0.waste_kg ?? 0)} kg de merma.`,
        variants: [
          v("Solo recolocar la secuencia", [RECALC]),
          v("Campañas por día", [DAY_CAMPAIGN], { solver: { campaign: "dia" } }),
          v("Campañas por día + recetas pequeñas cada 2 días", [DAY_CAMPAIGN, minorLever(2)], { solver: { campaign: "dia", minorEvery: 2 } }),
          v("Campañas por día + recetas pequeñas cada 3 días", [DAY_CAMPAIGN, minorLever(3)], { solver: { campaign: "dia", minorEvery: 3 } }),
          v("Campañas por día + llenadoras dedicadas", [DAY_CAMPAIGN, DEDICATE], { dedicate: true, solver: { campaign: "dia" } }),
        ],
      };
    const ev = failed[0];
    if (!ev) throw new Error("No hay ningún equipo fuera de servicio.");
    const isFiller = model.fillers.includes(ev.equipment);
    return {
      question: `${ev.equipment} está fuera de servicio desde el ${hm(ev.start)} (${ev.reason}) hasta el ${hm(ev.est_end)} estimado. ¿Qué conviene mientras lo reparan?`,
      variants: [
        v("Esperar la reparación y repartir", [{ ...RECALC, text: `Recolocar con el cosimulador sin ${ev.equipment} hasta la reparación${isFiller ? "; la multipropósito toma lo que pueda" : ""}` }]),
        v("Campañas por día", [DAY_CAMPAIGN], { solver: { campaign: "dia" } }),
        isFiller
          ? v("Campañas por día + llenadoras dedicadas (esperar sin cruzar)", [DAY_CAMPAIGN, DEDICATE], { dedicate: true, solver: { campaign: "dia" } })
          : v("Campañas por día + recetas pequeñas cada 3 días", [DAY_CAMPAIGN, minorLever(3)], { solver: { campaign: "dia", minorEvery: 3 } }),
      ],
    };
  };

  const study: StudyModel = {
    plant: model.plant,
    now: iso(now, tz),
    scenario: input.scenario,
    previous: input.previous,
    baselineLoads: loadsOf(model, input.previous, now, winEnd),
    frame,
    async evaluate(variant, id) {
      const s = (variant.data ?? {}) as Setup;
      const m = s.dedicate ? dedicated(model) : model;
      const plan = solve(await newHighs(), m, s.portfolio ?? input.portfolio, { now: input.now, previous: input.previous, events, planId: id, ...(s.solver ?? {}) });
      if (s.orderChanges) plan.order_changes = s.orderChanges;
      return { plan, loads: loadsOf(m, plan, now, winEnd) };
    },
    terms: (k) => termsOf(k),
    weights: model.score,
    explain(best, base) {
      const a = base.kpis;
      const b = best.kpis;
      if (best === base) return "Las otras palancas no mejoran el puntaje: basta con recolocar.";
      return `Frente a ${base.label.charAt(0).toLowerCase()}${base.label.slice(1)} (${a.late_orders} tarde, ${n1(a.tardiness_h)} h de atraso, ${n1(a.cip_h ?? 0)} h de CIP, ${n0(a.waste_kg ?? 0)} kg de merma), queda con ${b.late_orders} tarde, ${n1(b.tardiness_h)} h de atraso, ${n1(b.cip_h ?? 0)} h de CIP y ${n0(b.waste_kg ?? 0)} kg de merma.`;
    },
  };
  return run(study, input.studyId ?? "FRA");
}
