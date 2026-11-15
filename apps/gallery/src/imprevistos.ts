/**
 * Imprevistos del emulador de plásticos: fallas al azar y variación del tiempo de ciclo.
 *
 * Cada módulo hace lo suyo: el EMULADOR genera las fallas (con la tasa de la planta, demand.yaml `downtime`); el APS
 * solo lleva los paros previstos que alguien programa; el cosimulador y Fractal no generan fallas, solo calculan con
 * las que reciben. Este archivo es la parte del emulador que entrega esas ejecuciones con imprevistos (p. ej. a
 * Fractal, para estimar la probabilidad de cumplir de cada opción).
 */
import type { PlantEvent } from "@twin/cosim/core/contracts.ts";
import { iso } from "@twin/cosim/core/time.ts";
import type { PlasticsModel } from "@twin/cosim/adapters/plastic-injection-plant-v1/model.ts";

/** Número al azar en [0, 1). */
export type Rng = () => number;

/** Variación del tiempo de ciclo: ±5 % por etapa (supuesto de la demo). */
export const CYCLE_SPREAD = 0.05;
/** Días hacia adelante en los que pueden caer fallas. */
export const FAILURE_DAYS = 7;

/** Azar repetible con semilla (mulberry32). */
export function seeded(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fallas al azar con los datos de la planta: cada inyectora, cada día, tiene `per_day_pct` % de probabilidad de una
 * falla de `hours` horas, en algún momento del turno.
 */
export function randomFailures(model: PlasticsModel, rng: Rng, now: number, days = FAILURE_DAYS): PlantEvent[] {
  const d = model.downtime;
  if (!d) return [];
  const out: PlantEvent[] = [];
  const [h0, h1] = d.hours;
  for (const m of model.machines)
    for (let day = 0; day < days; day++) {
      if (rng() >= d.per_day_pct / 100) continue;
      const start = model.calendar.nextWork(now + day * 1440 + Math.floor(rng() * 1440));
      const hours = h0 + (h1 - h0) * rng();
      out.push({ contract: "plant-event.v1", id: `EMU-${m}-${day}`, plant: model.plant, equipment: m, kind: "falla", reason: d.reasons[Math.floor(rng() * d.reasons.length)] ?? "falla", start: iso(start, model.timezone), est_end: iso(start + hours * 60, model.timezone) });
    }
  return out;
}

/** Factor del tiempo de ciclo de cada etapa ("producto|etapa"), dentro de ±CYCLE_SPREAD. */
export function cycleFactors(model: PlasticsModel, rng: Rng): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of Object.values(model.products))
    for (const s of [p.final, ...p.components.map((c) => c.step)]) {
      const k = `${s.product}|${s.stage}`;
      if (!(k in out)) out[k] = 1 + CYCLE_SPREAD * (2 * rng() - 1);
    }
  return out;
}

/** `runs` ejecuciones con imprevistos desde `now`, repetibles con la misma semilla. */
export function imprevistos(model: PlasticsModel, now: number, runs: number, seed = 1): { events: PlantEvent[]; cycle: Record<string, number> }[] {
  const rng = seeded(seed);
  return Array.from({ length: runs }, () => {
    const cycle = cycleFactors(model, rng);
    return { events: randomFailures(model, rng, now), cycle };
  });
}
