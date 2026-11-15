/**
 * Fractal en un hilo aparte: corre un estudio de escenario y devuelve el `fractal-study.v1` con la recomendación.
 * - Con el generador genético (por defecto): el generador cruza y muta las palancas, las reglas de despacho evalúan
 *   toda la población y el cosimulador (HiGHS) calcula las 5 mejores. La probabilidad de cumplir sale de las
 *   ejecuciones con imprevistos que entrega el emulador (imprevistos.ts): Fractal no genera fallas. Manda el avance.
 * - Sin él: solo las variantes escritas a mano, cada una colocada por el cosimulador.
 */
import highsLoader from "highs";
import wasmUrl from "highs/runtime?url";
import { catalogData } from "@twin/cosim/adapters/plastic-injection-plant-v1/catalog.ts";
import { applyConfig, type PlasticsConfig } from "@twin/cosim/adapters/plastic-injection-plant-v1/config.ts";
import { runStudy, type StudyInput } from "@twin/fractal-manufacturing/models/plastic-injection-plant-v1/study.ts";
import { generateStudy } from "@twin/fractal-manufacturing/models/plastic-injection-plant-v1/generate.ts";
import { buildModel } from "@twin/cosim/adapters/plastic-injection-plant-v1/model.ts";
import { parseLocal } from "@twin/cosim/core/time.ts";
import { imprevistos } from "./imprevistos.ts";

/** Ejecuciones con imprevistos del emulador por opción. */
const RUNS = 30;

self.onmessage = async (e: MessageEvent<{ id: number; input: StudyInput; config?: PlasticsConfig | null; generate?: boolean }>) => {
  const { id, input, config, generate } = e.data;
  try {
    const highs = () => highsLoader({ locateFile: () => wasmUrl });
    const cat = applyConfig(catalogData(), config);
    const study = generate
      ? await generateStudy(highs, cat, input, { imprevistos: imprevistos(buildModel(cat), parseLocal(input.now ?? input.portfolio.plan_start), RUNS), onProgress: (progress) => self.postMessage({ id, progress }) })
      : await runStudy(highs, cat, input);
    self.postMessage({ id, ok: true, study });
  } catch (err) {
    self.postMessage({ id, ok: false, error: (err as Error).message ?? String(err) });
  }
};
