import { describe, expect, it } from "vitest";
import { dominates, evolve, paretoFronts, pick, probability, refine, seededRng, type Evaluation, type Evaluator, type GenomeSpace } from "../index.ts";

/**
 * Problema de juguete: 8 trabajos en 3 máquinas. Genoma = máquina de cada trabajo.
 * Objetivos: terminar lo antes posible (makespan) y mover pocos trabajos de su máquina de hoy (cambios).
 * Restricción: todo termina en 12 h o menos (la "entrega").
 */
const DUR = [7, 5, 4, 4, 3, 3, 2, 2];
const HOY = [0, 0, 0, 1, 1, 1, 2, 2];
const ENTREGA = 12;
type G = number[];

const space: GenomeSpace<G> = {
  random: (rng) => DUR.map(() => pick(rng, 3)),
  crossover: (a, b, rng) => a.map((x, i) => (rng() < 0.5 ? x : b[i])),
  mutate: (g, rng) => {
    const c = [...g];
    c[pick(rng, c.length)] = pick(rng, 3);
    return c;
  },
  key: (g) => g.join(""),
};

const makespan = (g: G) => Math.max(...[0, 1, 2].map((m) => g.reduce((s, x, i) => s + (x === m ? DUR[i] : 0), 0)));
const cambios = (g: G) => g.filter((x, i) => x !== HOY[i]).length;
const evalOf = (g: G): Evaluation => {
  const ms = makespan(g);
  return { feasible: ms <= ENTREGA, violation: Math.max(0, ms - ENTREGA), metrics: { makespan: ms, cambios: cambios(g) } };
};

const counting = () => {
  const calls: string[] = [];
  const ev: Evaluator<G> = { id: "reglas", stage: "rapida", evaluate: async (g) => (calls.push(g.join("")), evalOf(g)) };
  return { ev, calls };
};

const OBJ = [{ metric: "makespan" }, { metric: "cambios" }];

/** Óptimo por fuerza bruta (3^8 = 6.561 combinaciones). */
const bruteBest = () => {
  let best = Infinity;
  for (let n = 0; n < 3 ** DUR.length; n++) {
    const g = DUR.map((_, i) => Math.floor(n / 3 ** i) % 3);
    best = Math.min(best, makespan(g));
  }
  return best;
};

describe("generador genético de Fractal", () => {
  it("el azar con semilla se repite", () => {
    const a = seededRng(42);
    const b = seededRng(42);
    const xs = Array.from({ length: 5 }, () => a());
    expect(Array.from({ length: 5 }, () => b())).toEqual(xs);
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
  });

  it("factible domina a no factible; entre no factibles gana la que se pasa menos", () => {
    const ok: Evaluation = { feasible: true, metrics: { makespan: 20, cambios: 9 } };
    const bad: Evaluation = { feasible: false, violation: 1, metrics: { makespan: 1, cambios: 0 } };
    const worse: Evaluation = { feasible: false, violation: 3, metrics: { makespan: 1, cambios: 0 } };
    expect(dominates(ok, bad, OBJ)).toBe(true);
    expect(dominates(bad, worse, OBJ)).toBe(true);
    expect(dominates(worse, bad, OBJ)).toBe(false);
  });

  it("los frentes de Pareto separan bien", () => {
    const e = (m: number, c: number): Evaluation => ({ feasible: true, metrics: { makespan: m, cambios: c } });
    const fronts = paretoFronts([e(10, 5), e(12, 1), e(11, 6), e(13, 2), e(10, 5)], OBJ);
    expect(fronts[0].sort()).toEqual([0, 1, 4]);
    expect(fronts[1].sort()).toEqual([2, 3]);
  });

  it("encuentra el óptimo del juguete y la misma semilla da el mismo resultado", async () => {
    const run = () => evolve({ space, evaluator: counting().ev, objectives: OBJ, seeds: [HOY], population: 24, generations: 15, seed: 7 });
    const a = await run();
    const b = await run();
    expect(a.finalists.map((f) => f.key)).toEqual(b.finalists.map((f) => f.key));
    expect(a.finalists[0].evaluation.metrics.makespan).toBe(bruteBest());
    expect(a.history).toHaveLength(16);
  });

  it("nunca es peor que la semilla y entrega de 3 a 5 opciones factibles distintas", async () => {
    const r = await evolve({ space, evaluator: counting().ev, objectives: OBJ, seeds: [HOY], population: 24, generations: 10, seed: 3 });
    const seedMs = makespan(HOY);
    expect(r.finalists[0].evaluation.metrics.makespan).toBeLessThanOrEqual(seedMs);
    expect(r.finalists.length).toBeGreaterThanOrEqual(3);
    expect(r.finalists.length).toBeLessThanOrEqual(5);
    expect(new Set(r.finalists.map((f) => f.key)).size).toBe(r.finalists.length);
    expect(r.finalists.every((f) => f.evaluation.feasible)).toBe(true);
    // Ninguna finalista del mejor frente está dominada por otra opción de la población final.
    for (const f of r.finalists.filter((x) => x.rank === 0)) expect(r.front.some((o) => dominates(o.evaluation, f.evaluation, OBJ))).toBe(false);
  });

  it("no evalúa dos veces el mismo plan y respeta el presupuesto", async () => {
    const { ev, calls } = counting();
    const r = await evolve({ space, evaluator: ev, objectives: OBJ, seeds: [HOY], population: 16, generations: 30, seed: 5, maxEvaluations: 60 });
    expect(calls.length).toBe(r.evaluations);
    expect(calls.length).toBeLessThanOrEqual(60);
    expect(new Set(calls).size).toBe(calls.length);
  });

  it("repara o descarta genomas inválidos", async () => {
    // Regla física: el trabajo 0 solo cabe en la máquina 0.
    const repaired: GenomeSpace<G> = { ...space, repair: (g) => (g[0] === 0 ? g : [0, ...g.slice(1)]) };
    const r = await evolve({ space: repaired, evaluator: counting().ev, objectives: OBJ, population: 12, generations: 5, seed: 9 });
    expect([...r.front, ...r.finalists].every((f) => f.genome[0] === 0)).toBe(true);
  });

  it("segunda etapa: el evaluador preciso reordena las finalistas", async () => {
    const r = await evolve({ space, evaluator: counting().ev, objectives: OBJ, seeds: [HOY], population: 24, generations: 10, seed: 3 });
    // El "cosimulador" de juguete suma 1 h de montaje por cada cambio: puede cambiar el orden.
    const precise: Evaluator<G> = {
      id: "cosim",
      stage: "precisa",
      evaluate: async (g) => {
        const e = evalOf(g);
        const ms = e.metrics.makespan + 0.5 * e.metrics.cambios;
        return { ...e, feasible: ms <= ENTREGA, violation: Math.max(0, ms - ENTREGA), metrics: { ...e.metrics, makespan: ms } };
      },
    };
    const refined = await refine(r.finalists, precise, OBJ);
    expect(refined).toHaveLength(r.finalists.length);
    expect(refined.every((x) => x.evaluatedBy.join(",") === "rapida,cosim")).toBe(true);
    const bestMs = Math.min(...refined.filter((x) => x.evaluation.feasible).map((x) => x.evaluation.metrics.makespan));
    expect(refined[0].evaluation.metrics.makespan).toBe(bestMs);
  });

  it("probabilidad de cumplir con Monte Carlo, repetible", async () => {
    // Incertidumbre: cada trabajo dura hasta 20 % más.
    const noisy = async (g: G, rng: () => number): Promise<Evaluation> => {
      const ms = Math.max(...[0, 1, 2].map((m) => g.reduce((s, x, i) => s + (x === m ? DUR[i] * (1 + 0.2 * rng()) : 0), 0)));
      return { feasible: ms <= ENTREGA, metrics: { makespan: ms } };
    };
    const ajustado = [0, 1, 1, 2, 2, 0, 2, 2]; // makespan 10: holgura de 2 h
    const a = await probability(ajustado, noisy, 50, 11);
    const b = await probability(ajustado, noisy, 50, 11);
    expect(a).toEqual(b);
    expect(a.p).toBeGreaterThan(0);
    expect(a.p).toBeLessThanOrEqual(1);
    const holgado = await probability(HOY, noisy, 50, 11); // makespan 16: nunca cumple
    expect(holgado.p).toBe(0);
  });
});
