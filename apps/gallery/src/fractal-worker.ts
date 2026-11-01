/**
 * Fractal en un hilo aparte: corre un estudio de escenario (varias combinaciones, cada una colocada por el cosimulador
 * con HiGHS) y devuelve el `fractal-study.v1` con la recomendación.
 */
import highsLoader from "highs";
import wasmUrl from "highs/runtime?url";
import { catalogData } from "@twin/cosim/adapters/plastic-injection-plant-v1/catalog.ts";
import { runStudy, type StudyInput } from "@twin/fractal-manufacturing/models/plastic-injection-plant-v1/study.ts";

self.onmessage = async (e: MessageEvent<{ id: number; input: StudyInput }>) => {
  const { id, input } = e.data;
  try {
    const study = await runStudy(() => highsLoader({ locateFile: () => wasmUrl }), catalogData(), input);
    self.postMessage({ id, ok: true, study });
  } catch (err) {
    self.postMessage({ id, ok: false, error: (err as Error).message ?? String(err) });
  }
};
