/**
 * Contrato de Fractal (`fractal-study.v1`), versión de plataforma: un estudio de escenario sobre la programación
 * vigente. Fractal prueba combinaciones de palancas, el cosimulador de la planta coloca cada una, y recomienda la de
 * menor puntaje. Recomienda, no ejecuta: el APS decide si la adopta.
 *
 * No nombra plantas ni palancas concretas: cada planta (plants/<planta>/fractal/) define sus escenarios
 * ("adelantar", "falla", "cip"…) y sus palancas ("montar-molde", "agrupar-receta", "llenadora-alterna"…).
 */
import type { PlanKpis, ProductionPlan } from "@twin/cosim-core";

export interface Lever {
  /** Clase de palanca, propia de la planta. "recalcular" es la base: solo recolocar con el cosimulador. */
  kind: string;
  text: string;
  machine?: string;
  from?: string;
  tooling?: string;
}

export interface MaxLoad {
  equipment: string;
  pct: number;
}

export interface StudyOption {
  id: string;
  label: string;
  levers: Lever[];
  kpis: PlanKpis;
  /** Ocupación de cada máquina en la ventana del estudio, en %. */
  loads: Record<string, number>;
  max_load: MaxLoad;
  /** Horas que cuesta la palanca misma (montajes, mudanzas, limpiezas extra), por clase: { "montaje": 1.5 }. */
  costs: Record<string, number>;
  /** Cada término del puntaje, ya multiplicado por su peso; score es la suma. */
  terms: Record<string, number>;
  score: number;
  plan: ProductionPlan;
}

export interface FractalStudy {
  contract: "fractal-study.v1";
  study_id: string;
  plant: string;
  scenario: string;
  question: string;
  now: string;
  baseline: { plan_id: string; kpis: PlanKpis; loads: Record<string, number>; max_load: MaxLoad };
  options: StudyOption[];
  best: string;
  recommendation: string;
  seconds: number;
}
