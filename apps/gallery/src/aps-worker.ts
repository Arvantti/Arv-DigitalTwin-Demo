/**
 * Cosimulador en modo solver, en un hilo aparte para que la escena 3D no se congele mientras HiGHS resuelve.
 * Recibe la cartera, el plan vigente y el instante AHORA; devuelve la programación propuesta (`production-plan.v1`).
 */
import highsLoader from "highs";
import wasmUrl from "highs/runtime?url";
import { catalogData } from "@twin/cosim/adapters/plastic-injection-plant-v1/catalog.ts";
import { buildModel } from "@twin/cosim/adapters/plastic-injection-plant-v1/model.ts";
import { applyConfig, type PlasticsConfig } from "@twin/cosim/adapters/plastic-injection-plant-v1/config.ts";
import { modelFor } from "@twin/fractal-manufacturing/models/plastic-injection-plant-v1/study.ts";
import { solve, solveScenarios, type Objective } from "@twin/cosim/adapters/plastic-injection-plant-v1/solve.ts";
import type { CustomerOrders, PlantEvent, ProductionPlan } from "@twin/cosim/core/contracts.ts";

self.onmessage = async (e: MessageEvent<{ id: number; portfolio: CustomerOrders; now?: string; previous?: ProductionPlan | null; planId: string; events?: PlantEvent[]; molds?: Record<string, string | null>; fixed?: string[]; objective?: Objective; config?: PlasticsConfig | null }>) => {
  const { id, portfolio, now, previous, planId, events, molds, fixed, objective, config } = e.data;
  try {
    // Una instancia nueva por corrida: highs-js no garantiza poder resolver varias veces con la misma.
    const highs = await highsLoader({ locateFile: () => wasmUrl });
    // La configuración activa (montaje de moldes cargado a mano) va primero; encima, los moldes que cambió Fractal.
    const cat = applyConfig(catalogData(), config);
    const m = molds && Object.keys(molds).length ? modelFor(cat, molds) : buildModel(cat);
    // Entregas y menos cambios salen juntos: A = cumplir entregas; B = menos cambios sin empeorar entregas (si existe).
    // Con "cambios" se propone B cuando existe; si no, A con una nota.
    if (!objective || objective === "entregas" || objective === "cambios") {
      const scenarios = solveScenarios(highs, m, portfolio, { now, previous, planId, events, fixed });
      const alt = scenarios.find((s) => s.id === "menos-cambios");
      const chosen = objective === "cambios" && alt ? alt : scenarios[0];
      if (objective === "cambios" && !alt) chosen.plan.notes = [...(chosen.plan.notes ?? []), "Ningún cambio de referencia menos sin atrasar pedidos: se propone solo cumplir entregas."];
      self.postMessage({ id, ok: true, plan: chosen.plan, scenarios: scenarios.map((s) => ({ id: s.id, label: s.label, plan: s.plan })) });
      return;
    }
    const plan = solve(highs, m, portfolio, { now, previous, planId, events, fixed, objective });
    self.postMessage({ id, ok: true, plan });
  } catch (err) {
    self.postMessage({ id, ok: false, error: (err as Error).message ?? String(err) });
  }
};
