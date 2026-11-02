/**
 * Cosimulador en modo solver, en un hilo aparte para que la escena 3D no se congele mientras HiGHS resuelve.
 * Recibe la cartera, el plan vigente y el instante AHORA; devuelve la programación propuesta (`production-plan.v1`).
 */
import highsLoader from "highs";
import wasmUrl from "highs/runtime?url";
import { catalogData, plasticsModel } from "@twin/cosim/adapters/plastic-injection-plant-v1/catalog.ts";
import { modelFor } from "@twin/fractal-manufacturing/models/plastic-injection-plant-v1/study.ts";
import { solve } from "@twin/cosim/adapters/plastic-injection-plant-v1/solve.ts";
import type { CustomerOrders, PlantEvent, ProductionPlan } from "@twin/cosim/core/contracts.ts";

const model = plasticsModel();

self.onmessage = async (e: MessageEvent<{ id: number; portfolio: CustomerOrders; now?: string; previous?: ProductionPlan | null; planId: string; events?: PlantEvent[]; molds?: Record<string, string | null>; fixed?: string[] }>) => {
  const { id, portfolio, now, previous, planId, events, molds, fixed } = e.data;
  try {
    // Una instancia nueva por corrida: highs-js no garantiza poder resolver varias veces con la misma.
    const highs = await highsLoader({ locateFile: () => wasmUrl });
    const plan = solve(highs, molds && Object.keys(molds).length ? modelFor(catalogData(), molds) : model, portfolio, { now, previous, planId, events, fixed });
    self.postMessage({ id, ok: true, plan });
  } catch (err) {
    self.postMessage({ id, ok: false, error: (err as Error).message ?? String(err) });
  }
};
