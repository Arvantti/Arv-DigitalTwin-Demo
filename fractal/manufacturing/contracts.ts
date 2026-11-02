/**
 * Contrato de Fractal de manufactura (`fractal-study.v1`): un estudio de escenario sobre la programación vigente.
 * Fractal prueba combinaciones (prioridades, moldes de repuesto, mudanza de moldes), cada una la coloca el
 * cosimulador, y recomienda la mejor. Recomienda, no ejecuta: el APS decide si la adopta.
 */
import type { PlanKpis, ProductionPlan } from "@twin/cosim/core/contracts.ts";

export type Scenario = "adelantar" | "balancear" | "falla" | "fijadas" | "cambios";

export interface Lever {
  kind: "recalcular" | "prioridad" | "montar-molde" | "mover-molde" | "agrupar" | "dedicar-color";
  text: string;
  machine?: string;
  from?: string;
  tooling?: string;
}

export interface StudyOption {
  id: string;
  label: string;
  levers: Lever[];
  kpis: PlanKpis;
  /** Ocupación de cada máquina en la ventana del estudio (AHORA + 7 días), en %. */
  loads: Record<string, number>;
  max_load: { equipment: string; pct: number };
  /** Horas de máquina paradas por montajes de molde. */
  mold_change_h: number;
  score: number;
  plan: ProductionPlan;
}

export interface FractalStudy {
  contract: "fractal-study.v1";
  study_id: string;
  plant: string;
  scenario: Scenario;
  question: string;
  now: string;
  baseline: { plan_id: string; kpis: PlanKpis; loads: Record<string, number>; max_load: { equipment: string; pct: number } };
  options: StudyOption[];
  best: string;
  recommendation: string;
  seconds: number;
}
