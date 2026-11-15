/**
 * Contrato de Fractal de manufactura (`fractal-study.v1`): un estudio de escenario sobre la programación vigente.
 * Fractal prueba combinaciones (prioridades, moldes de repuesto, mudanza de moldes), cada una la coloca el
 * cosimulador, y recomienda la mejor. Recomienda, no ejecuta: el APS decide si la adopta.
 */
import type { PlanKpis, PlantEvent, ProductionPlan } from "@twin/cosim/core/contracts.ts";

export type Scenario = "adelantar" | "balancear" | "falla" | "fijadas" | "cambios" | "energia";

export interface Lever {
  kind: "recalcular" | "prioridad" | "montar-molde" | "mover-molde" | "agrupar" | "dedicar-color" | "espera-caliente" | "apagar";
  text: string;
  machine?: string;
  from?: string;
  tooling?: string;
  /** prioridad: el pedido que sube a importancia alta. */
  order?: string;
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
  /** Generador genético: frente de Pareto de la opción (0 = nadie la supera en todo). */
  pareto_rank?: number;
  /** Generador genético: evaluadores que la puntuaron, en orden ("cosim", "reglas", "jev"). */
  evaluated_by?: string[];
  /** Probabilidad de cumplir: en cuántas de `runs` ejecuciones del plan tal cual (mismo orden y mismas máquinas) con los
   * imprevistos que entrega el emulador no aparece ningún pedido tarde de más frente a la misma ejecución sin ellos. */
  probability?: { p: number; hits: number; runs: number };
}

/**
 * Una ejecución con imprevistos, tal como la entrega el EMULADOR. El emulador genera las fallas al azar y la variación
 * del ciclo; el APS solo lleva los paros previstos; Fractal y el cosimulador no generan fallas, solo calculan con ellas.
 */
export interface Imprevistos {
  /** Fallas al azar (plant-event.v1). */
  events: PlantEvent[];
  /** Factor del tiempo de ciclo por etapa, "producto|etapa" → p. ej. 1,03 (sin clave = 1). */
  cycle?: Record<string, number>;
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
  /** Presente si las opciones salieron del generador genético (para repetir el estudio y para la auditoría). */
  generator?: {
    method: "genetico";
    seed: number;
    population: number;
    generations: number;
    /** Corridas del cosimulador. */
    evaluations: number;
    /** Planes armados con las reglas de despacho (primera etapa). */
    rule_evaluations?: number;
    seeds: number;
    objectives: string[];
    /** Ejecuciones con imprevistos del emulador por opción para la probabilidad. */
    runs?: number;
  };
}
