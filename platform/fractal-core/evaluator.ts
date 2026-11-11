/**
 * Evaluador de Fractal: le pone métricas a un genoma. Es enchufable, así Fractal no depende del cosimulador:
 * - "rapida": reglas de la empresa con los datos de los conectores (Harness y Digital Twin); toda la población.
 * - "precisa": el cosimulador de la planta (Digital Twin), que además devuelve el plan para el 3D y el APS;
 *   solo para las finalistas.
 * - "juez": un modelo de decisión (tipo JEV) para lo que no se mide con números; solo para las finalistas.
 */
import type { ProductionPlan } from "@twin/cosim-core";
import { paretoFronts, seededRng, type Individual, type Objective, type Rng } from "./genetic.ts";

export interface Evaluation {
  /** ¿Respeta las restricciones (entregas, órdenes fijadas)? */
  feasible: boolean;
  /** Cuánto se pasa de las restricciones (horas de atraso, por ejemplo); solo cuenta si no es factible. */
  violation?: number;
  /** Métricas de la opción: atraso_h, tarde, carga_max, cambios_h, kwh, montaje_h… */
  metrics: Record<string, number>;
  /** Plan colocado, si el evaluador sabe colocar (cosimulador). */
  plan?: ProductionPlan;
  notes?: string[];
}

export type EvaluatorStage = "rapida" | "precisa" | "juez";

export interface Evaluator<G> {
  /** "reglas", "cosim", "jev"… queda en el estudio para la auditoría. */
  id: string;
  stage: EvaluatorStage;
  evaluate(genome: G): Promise<Evaluation>;
}

export interface Refined<G> extends Individual<G> {
  /** Evaluadores que puntuaron esta opción, en orden. */
  evaluatedBy: string[];
}

/**
 * Segunda etapa: vuelve a evaluar las finalistas con el evaluador preciso (cosimulador) y las reordena por frentes
 * con sus métricas nuevas. La primera queda como la mejor en el primer objetivo.
 */
export async function refine<G>(finalists: Individual<G>[], precise: Evaluator<G>, objectives: Objective[], firstStage = "rapida"): Promise<Refined<G>[]> {
  const again: Refined<G>[] = [];
  for (const f of finalists) again.push({ ...f, evaluation: await precise.evaluate(f.genome), evaluatedBy: [firstStage, precise.id] });
  const fronts = paretoFronts(again.map((a) => a.evaluation), objectives);
  fronts.forEach((idx, r) => idx.forEach((i) => (again[i].rank = r)));
  // Ninguna se descarta: si el cosimulador dice que una ya no cumple, va al final para que el analista lo vea.
  const o = objectives[0];
  const v = (x: Refined<G>) => (o.sense === "max" ? -1 : 1) * (x.evaluation.metrics[o.metric] ?? Number.POSITIVE_INFINITY);
  return again.sort((a, b) => a.rank - b.rank || v(a) - v(b));
}

export interface Probability {
  /** Escenarios simulados en los que la opción cumple las restricciones. */
  hits: number;
  runs: number;
  /** hits / runs, entre 0 y 1. */
  p: number;
}

/**
 * Probabilidad de cumplir con Monte Carlo: evalúa la opción `runs` veces bajo incertidumbre (fallas, variación de
 * ciclo, desperdicio) y cuenta cuántas veces sigue siendo factible. `underUncertainty` recibe un generador al azar con
 * su propia semilla por corrida, así el resultado se repite.
 */
export async function probability<G>(genome: G, underUncertainty: (genome: G, rng: Rng) => Promise<Evaluation>, runs = 50, seed = 1): Promise<Probability> {
  let hits = 0;
  for (let i = 0; i < runs; i++) if ((await underUncertainty(genome, seededRng(seed * 7919 + i))).feasible) hits++;
  return { hits, runs, p: runs ? hits / runs : 0 };
}
