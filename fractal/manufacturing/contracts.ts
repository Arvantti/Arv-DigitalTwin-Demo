/**
 * Contrato de Fractal de manufactura (`fractal-study.v1`): un estudio de escenario sobre la programación vigente.
 * Fractal prueba combinaciones (prioridades, moldes de repuesto, mudanza de moldes), cada una la coloca el
 * cosimulador, y recomienda la mejor. Recomienda, no ejecuta: el APS decide si la adopta.
 */
import type { PlanKpis, ProductionPlan } from "@twin/cosim/core/contracts.ts";

export type Scenario = "adelantar" | "balancear" | "falla" | "fijadas" | "cambios" | "energia";

export interface Lever {
  kind: "recalcular" | "prioridad" | "montar-molde" | "mover-molde" | "agrupar" | "dedicar-color" | "espera-caliente" | "apagar";
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
  /** Energía desde AHORA hasta el fin del plan (kWh) y calentamientos en frío en ese tramo (escenario de energía). */
  energy?: { kwh: number; heatups: number; peak_kw: number; overnight: "apagar" | "caliente" };
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
  baseline: { plan_id: string; kpis: PlanKpis; loads: Record<string, number>; max_load: { equipment: string; pct: number }; energy?: StudyOption["energy"] };
  options: StudyOption[];
  best: string;
  recommendation: string;
  seconds: number;
}
