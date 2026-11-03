/**
 * Cosimulador en modo solver, en un hilo aparte para que la escena 3D no se congele mientras HiGHS resuelve.
 * Recibe la cartera, el plan vigente y el instante AHORA; devuelve la programación propuesta (`production-plan.v1`).
 */
import highsLoader from "highs";
import wasmUrl from "highs/runtime?url";
import { catalogData, plasticsModel } from "@twin/cosim/adapters/plastic-injection-plant-v1/catalog.ts";
import { modelFor } from "@twin/fractal-manufacturing/models/plastic-injection-plant-v1/study.ts";
import { solve, solveScenarios, type Objective } from "@twin/cosim/adapters/plastic-injection-plant-v1/solve.ts";
import type { CustomerOrders, PlantEvent, ProductionPlan } from "@twin/cosim/core/contracts.ts";

const model = plasticsModel();

self.onmessage = async (e: MessageEvent<{ id: number; portfolio: CustomerOrders; now?: string; previous?: ProductionPlan | null; planId: string; events?: PlantEvent[]; molds?: Record<string, string | null>; fixed?: string[]; objective?: Objective }>) => {
  const { id, portfolio, now, previous, planId, events, molds, fixed, objective } = e.data;
  try {
    // Una instancia nueva por corrida: highs-js no garantiza poder resolver varias veces con la misma.
    const highs = await highsLoader({ locateFile: () => wasmUrl });
    const m = molds && Object.keys(molds).length ? modelFor(catalogData(), molds) : model;
    if (objective === "cambios") {
      // Menos cambios nunca se entrega sin atrasar pedidos: entregas primero y, si hay un escenario que deje menos
      // cambios sin empeorar entregas, se propone ese; si no, se propone el de entregas con la razón.
      const scenarios = solveScenarios(highs, m, portfolio, { now, previous, planId, events, fixed });
      const alt = scenarios.find((s) => s.id === "menos-cambios");
      const plan = alt ? alt.plan : scenarios[0].plan;
      if (!alt) plan.notes = [...(plan.notes ?? []), "Ningún cambio de referencia menos sin atrasar pedidos: se propone solo cumplir entregas."];
      self.postMessage({ id, ok: true, plan });
      return;
    }
    const plan = solve(highs, m, portfolio, { now, previous, planId, events, fixed, objective });
    self.postMessage({ id, ok: true, plan });
  } catch (err) {
    self.postMessage({ id, ok: false, error: (err as Error).message ?? String(err) });
  }
};
