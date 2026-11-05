/**
 * Bucle genérico de Fractal: variantes → cosimulador → puntaje → mejor opción.
 *
 * La planta aporta lo que sabe de sí misma (StudyModel): qué variantes probar para el escenario, cómo colocar cada
 * una con su cosimulador, la ocupación de sus máquinas y los términos del puntaje. Este bucle no sabe de moldes ni de
 * marmitas: arma las opciones, suma los términos con sus pesos, elige la de menor puntaje (en empate, la primera,
 * que es siempre "solo recalcular") y escribe el estudio.
 */
import type { PlanKpis, ProductionPlan } from "@twin/cosim-core";
import type { FractalStudy, Lever, MaxLoad, StudyOption } from "./contracts.ts";

export interface Variant {
  label: string;
  levers: Lever[];
  /** Horas que cuesta la palanca misma, por clase. */
  costs?: Record<string, number>;
  /** Lo que la planta necesita para colocarla (cartera cambiada, herramental, paradas…). */
  data?: unknown;
}

export interface Framing {
  question: string;
  variants: Variant[];
}

export interface Evaluated {
  plan: ProductionPlan;
  loads: Record<string, number>;
}

export interface StudyModel {
  plant: string;
  /** "AHORA" en ISO con zona. */
  now: string;
  scenario: string;
  previous: ProductionPlan;
  /** Ocupación de la vigente en la ventana del estudio. */
  baselineLoads: Record<string, number>;
  /** Pregunta y variantes del escenario. La primera variante es la base. */
  frame(): Framing;
  /** Coloca una variante con el cosimulador de la planta. */
  evaluate(variant: Variant, id: string): Promise<Evaluated>;
  /** Términos del puntaje sin peso (horas de atraso, pedidos tarde, horas de CIP…). */
  terms(kpis: PlanKpis, option: { loads: Record<string, number>; max_load: MaxLoad; costs: Record<string, number> }): Record<string, number>;
  /** Peso de cada término; un término sin peso no cuenta. */
  weights: Record<string, number>;
  /** Por qué gana la mejor frente a la base, en palabras. */
  explain(best: StudyOption, base: StudyOption): string;
}

const r1 = (x: number) => Math.round(x * 10) / 10;

export const maxOf = (loads: Record<string, number>): MaxLoad =>
  Object.entries(loads).reduce<MaxLoad>((best, [equipment, pct]) => (pct > best.pct ? { equipment, pct } : best), { equipment: "", pct: 0 });

/** Suma ponderada: devuelve cada término ya multiplicado por su peso y el total. */
export function weighted(terms: Record<string, number>, weights: Record<string, number>): { terms: Record<string, number>; score: number } {
  const out: Record<string, number> = {};
  let score = 0;
  for (const [k, v] of Object.entries(terms)) {
    const w = weights[k];
    if (!w) continue;
    out[k] = r1(w * v);
    score += w * v;
  }
  return { terms: out, score: r1(score) };
}

/** "día N HH:MM", con el día 0 en `day0` ("AAAA-MM-DD"): los textos de la demo no llevan fechas de calendario. */
export const dayLabel = (day0: string, isoText: string): string =>
  `día ${Math.round((Date.parse(`${isoText.slice(0, 10)}T00:00:00Z`) - Date.parse(`${day0.slice(0, 10)}T00:00:00Z`)) / 864e5)} ${isoText.slice(11, 16)}`;

export async function runStudy(model: StudyModel, studyId = "FRA"): Promise<FractalStudy> {
  const t0 = Date.now();
  const { question, variants } = model.frame();
  if (!variants.length) throw new Error("El escenario no tiene variantes para probar.");
  const options: StudyOption[] = [];
  for (const [i, v] of variants.entries()) {
    const id = `${studyId}-${String.fromCharCode(65 + i)}`;
    const { plan, loads } = await model.evaluate(v, id);
    plan.source = "fractal";
    plan.status = "propuesta";
    plan.notes = [`Fractal · ${v.label}.`, ...v.levers.map((l) => l.text)];
    const max_load = maxOf(loads);
    const costs = Object.fromEntries(Object.entries(v.costs ?? {}).map(([k, h]) => [k, r1(h)]));
    const { terms, score } = weighted(model.terms(plan.kpis, { loads, max_load, costs }), model.weights);
    options.push({ id, label: v.label, levers: v.levers, kpis: plan.kpis, loads, max_load, costs, terms, score, plan });
  }
  const best = options.reduce((a, b) => (b.score < a.score ? b : a));
  const base = options[0];
  return {
    contract: "fractal-study.v1",
    study_id: studyId,
    plant: model.plant,
    scenario: model.scenario,
    question,
    now: model.now,
    baseline: { plan_id: model.previous.plan_id, kpis: model.previous.kpis, loads: model.baselineLoads, max_load: maxOf(model.baselineLoads) },
    options,
    best: best.id,
    recommendation: `Recomendación: ${best.label.charAt(0).toLowerCase()}${best.label.slice(1)}. ${model.explain(best, base)}`,
    seconds: r1((Date.now() - t0) / 1000),
  };
}
