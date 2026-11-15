/**
 * Generador de Fractal: algoritmo genético multiobjetivo (estilo NSGA-II) sobre un genoma de palancas.
 *
 * El generador no sabe de moldes ni de marmitas. La planta aporta el espacio del genoma (cómo crear, cruzar, mutar y
 * reparar un genoma) y un evaluador enchufable (evaluator.ts) que le pone métricas a cada uno: el cosimulador en
 * Digital Twin, las reglas de la empresa en Harness. El generador ordena por frentes de Pareto (ninguna opción es
 * mejor en todo que otra del mismo frente), conserva las mejores, cruza y muta, y al final devuelve de 3 a 5
 * finalistas distintas entre sí.
 *
 * Restricciones (entregas, órdenes fijadas): el evaluador marca `feasible: false` y cuánto se pasa (`violation`).
 * Una opción factible siempre gana a una que no lo es; entre dos que no lo son gana la que se pasa menos.
 *
 * Reproducible: con la misma semilla y la misma entrada da el mismo resultado (auditoría en Harness).
 */
import type { Evaluation, Evaluator } from "./evaluator.ts";

/** Generador de números al azar con semilla (mulberry32): devuelve valores en [0, 1). */
export type Rng = () => number;

export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Entero al azar en [0, n). */
export const pick = (rng: Rng, n: number): number => Math.floor(rng() * n);

/** Lo que la planta sabe de su genoma. */
export interface GenomeSpace<G> {
  /** Un genoma válido al azar. */
  random(rng: Rng): G;
  /** Un hijo a partir de dos padres. */
  crossover(a: G, b: G, rng: Rng): G;
  /** Una variación pequeña (uno o dos genes). */
  mutate(g: G, rng: Rng): G;
  /** Arregla lo que rompe reglas físicas (copias de molde, tamaño de máquina); null si no tiene arreglo. */
  repair?(g: G): G | null;
  /** Huella única del genoma: dos genomas con la misma huella son el mismo plan (caché). */
  key(g: G): string;
}

/** Métrica a optimizar. Por defecto se minimiza. */
export interface Objective {
  metric: string;
  sense?: "min" | "max";
}

export interface Individual<G> {
  genome: G;
  key: string;
  evaluation: Evaluation;
  /** Frente de Pareto: 0 es el mejor. */
  rank: number;
  /** Distancia de amontonamiento: más alta = más distinta de sus vecinas del frente. */
  crowding: number;
}

export interface GenerationInfo {
  generation: number;
  evaluations: number;
  /** Tamaño del primer frente. */
  front: number;
  /** Mejor valor de cada objetivo entre las factibles. */
  best: Record<string, number>;
}

export interface GeneticConfig<G> {
  space: GenomeSpace<G>;
  /** Evaluador de toda la población (normalmente el rápido). */
  evaluator: Evaluator<G>;
  objectives: Objective[];
  /** Genomas de partida (las variantes que hoy se escriben a mano): el resultado nunca es peor que ellas. */
  seeds?: G[];
  population?: number;
  generations?: number;
  /** Semilla del azar. */
  seed?: number;
  /** Tope de evaluaciones (sin contar las que salen de la caché). */
  maxEvaluations?: number;
  crossoverRate?: number;
  /** Cuántas finalistas devolver (3 a 5). */
  finalists?: number;
  onGeneration?(info: GenerationInfo): void;
}

export interface GeneticResult<G> {
  /** De 3 a 5 opciones del mejor frente, distintas entre sí; la primera es la mejor en el primer objetivo. */
  finalists: Individual<G>[];
  /** Primer frente de la última población. */
  front: Individual<G>[];
  /** Última población completa, ordenada (mejor frente primero), para que la planta elija con sus propias reglas. */
  population: Individual<G>[];
  generations: number;
  evaluations: number;
  seed: number;
  history: GenerationInfo[];
}

/** Valor de un objetivo para minimizar. */
const val = (e: Evaluation, o: Objective): number => {
  const v = e.metrics[o.metric] ?? Number.POSITIVE_INFINITY;
  return o.sense === "max" ? -v : v;
};

/** ¿a domina a b? Factible antes que no factible; entre no factibles, menos violación; luego Pareto. */
export function dominates(a: Evaluation, b: Evaluation, objectives: Objective[]): boolean {
  if (a.feasible !== b.feasible) return a.feasible;
  if (!a.feasible) return (a.violation ?? 0) < (b.violation ?? 0);
  let better = false;
  for (const o of objectives) {
    const x = val(a, o);
    const y = val(b, o);
    if (x > y) return false;
    if (x < y) better = true;
  }
  return better;
}

/** Ordenamiento no dominado: devuelve los frentes (índices), del mejor al peor. */
export function paretoFronts(evals: Evaluation[], objectives: Objective[]): number[][] {
  const n = evals.length;
  const beats: number[][] = evals.map(() => []);
  const beatenBy = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      if (dominates(evals[i], evals[j], objectives)) {
        beats[i].push(j);
        beatenBy[j]++;
      } else if (dominates(evals[j], evals[i], objectives)) {
        beats[j].push(i);
        beatenBy[i]++;
      }
    }
  const fronts: number[][] = [];
  let current = [...Array(n).keys()].filter((i) => beatenBy[i] === 0);
  while (current.length) {
    fronts.push(current);
    const next: number[] = [];
    for (const i of current)
      for (const j of beats[i]) if (--beatenBy[j] === 0) next.push(j);
    current = next;
  }
  return fronts;
}

/** Distancia de amontonamiento de cada miembro de un frente (los extremos valen infinito). */
function crowdingOf(front: Individual<unknown>[], objectives: Objective[]): void {
  for (const ind of front) ind.crowding = 0;
  if (front.length <= 2) {
    for (const ind of front) ind.crowding = Number.POSITIVE_INFINITY;
    return;
  }
  for (const o of objectives) {
    const sorted = [...front].sort((a, b) => val(a.evaluation, o) - val(b.evaluation, o));
    const lo = val(sorted[0].evaluation, o);
    const hi = val(sorted[sorted.length - 1].evaluation, o);
    sorted[0].crowding = sorted[sorted.length - 1].crowding = Number.POSITIVE_INFINITY;
    if (!(hi > lo) || !Number.isFinite(hi - lo)) continue;
    for (let i = 1; i < sorted.length - 1; i++) sorted[i].crowding += (val(sorted[i + 1].evaluation, o) - val(sorted[i - 1].evaluation, o)) / (hi - lo);
  }
}

/** Asigna frente y amontonamiento, y ordena: mejor frente primero, más distinta primero dentro del frente. */
function rankAll<G>(pool: Individual<G>[], objectives: Objective[]): Individual<G>[] {
  const fronts = paretoFronts(pool.map((p) => p.evaluation), objectives);
  const out: Individual<G>[] = [];
  fronts.forEach((idx, r) => {
    const front = idx.map((i) => pool[i]);
    for (const ind of front) ind.rank = r;
    crowdingOf(front, objectives);
    // Empate exacto: se conserva el orden de llegada (las semillas primero), así el resultado es estable.
    out.push(...front.map((ind, i) => ({ ind, i })).sort((a, b) => b.ind.crowding - a.ind.crowding || a.i - b.i).map((x) => x.ind));
  });
  return out;
}

const better = <G>(a: Individual<G>, b: Individual<G>): Individual<G> => (a.rank !== b.rank ? (a.rank < b.rank ? a : b) : a.crowding >= b.crowding ? a : b);

/** Elige `k` opciones distintas: la mejor en el primer objetivo y luego, una a una, la más lejana a las ya elegidas. */
export function diverse<G>(ranked: Individual<G>[], objectives: Objective[], k: number): Individual<G>[] {
  const pool = ranked.filter((p) => p.evaluation.feasible);
  const candidates = pool.length ? pool : ranked;
  if (!candidates.length) return [];
  const span = objectives.map((o) => {
    const vs = candidates.map((c) => val(c.evaluation, o)).filter(Number.isFinite);
    const lo = Math.min(...vs);
    const hi = Math.max(...vs);
    return { lo, w: hi > lo ? hi - lo : 1 };
  });
  const point = (c: Individual<G>) => objectives.map((o, i) => (val(c.evaluation, o) - span[i].lo) / span[i].w);
  const dist = (a: number[], b: number[]) => Math.sqrt(a.reduce((s, x, i) => s + (x - b[i]) ** 2, 0));
  const primary = objectives[0];
  const first = candidates.reduce((a, b) => (a.rank !== b.rank ? (a.rank < b.rank ? a : b) : val(b.evaluation, primary) < val(a.evaluation, primary) ? b : a));
  const chosen = [first];
  // Primero se llena con el mejor frente; si no alcanza, con los siguientes.
  for (let r = first.rank; chosen.length < k; r++) {
    const tier = candidates.filter((c) => c.rank === r && !chosen.includes(c));
    if (!tier.length && !candidates.some((c) => c.rank > r)) break;
    while (tier.length && chosen.length < k) {
      const pts = chosen.map(point);
      let bestI = 0;
      let bestD = -1;
      tier.forEach((c, i) => {
        const d = Math.min(...pts.map((p) => dist(p, point(c))));
        if (d > bestD) {
          bestD = d;
          bestI = i;
        }
      });
      chosen.push(tier.splice(bestI, 1)[0]);
    }
  }
  return chosen;
}

export async function evolve<G>(cfg: GeneticConfig<G>): Promise<GeneticResult<G>> {
  const { space, evaluator, objectives } = cfg;
  if (!objectives.length) throw new Error("Fractal necesita al menos un objetivo.");
  const size = Math.max(4, cfg.population ?? 24);
  const generations = Math.max(0, cfg.generations ?? 12);
  const seed = cfg.seed ?? 1;
  const budget = cfg.maxEvaluations ?? Number.POSITIVE_INFINITY;
  const crossoverRate = cfg.crossoverRate ?? 0.9;
  const rng = seededRng(seed);
  const cache = new Map<string, Evaluation>();
  let evaluations = 0;
  const history: GenerationInfo[] = [];

  const fix = (g: G): G | null => (space.repair ? space.repair(g) : g);
  /** Evalúa con caché; null si se acabó el presupuesto. */
  const make = async (g: G): Promise<Individual<G> | null> => {
    const key = space.key(g);
    let evaluation = cache.get(key);
    if (!evaluation) {
      if (evaluations >= budget) return null;
      evaluations++;
      evaluation = await evaluator.evaluate(g);
      cache.set(key, evaluation);
    }
    return { genome: g, key, evaluation, rank: 0, crowding: 0 };
  };

  // Población inicial: semillas primero, luego genomas al azar válidos y distintos.
  let pop: Individual<G>[] = [];
  const seen = new Set<string>();
  const add = async (g: G | null) => {
    if (!g) return;
    const key = space.key(g);
    if (seen.has(key)) return;
    const ind = await make(g);
    if (!ind) return;
    seen.add(key);
    pop.push(ind);
  };
  for (const s of cfg.seeds ?? []) await add(fix(s));
  for (let tries = 0; pop.length < size && tries < size * 20 && evaluations < budget; tries++) await add(fix(space.random(rng)));
  if (!pop.length) throw new Error("No se pudo armar ni un genoma válido.");
  pop = rankAll(pop, objectives).slice(0, size);

  const report = (generation: number) => {
    const feasible = pop.filter((p) => p.evaluation.feasible);
    const best = Object.fromEntries(
      objectives.map((o) => {
        const vs = feasible.map((p) => p.evaluation.metrics[o.metric]).filter((v) => v !== undefined);
        return [o.metric, vs.length ? (o.sense === "max" ? Math.max(...vs) : Math.min(...vs)) : Number.NaN];
      }),
    );
    const info = { generation, evaluations, front: pop.filter((p) => p.rank === 0).length, best };
    history.push(info);
    cfg.onGeneration?.(info);
  };
  report(0);

  let done = 0;
  for (let gen = 1; gen <= generations && evaluations < budget; gen++) {
    const tournament = () => better(pop[pick(rng, pop.length)], pop[pick(rng, pop.length)]);
    const children: Individual<G>[] = [];
    const keys = new Set(pop.map((p) => p.key));
    for (let tries = 0; children.length < size && tries < size * 10; tries++) {
      const a = tournament();
      const b = tournament();
      let g = rng() < crossoverRate ? space.crossover(a.genome, b.genome, rng) : a.genome;
      g = space.mutate(g, rng);
      const fixed = fix(g);
      if (!fixed) continue;
      const key = space.key(fixed);
      if (keys.has(key)) continue;
      const ind = await make(fixed);
      if (!ind) break;
      keys.add(key);
      children.push(ind);
    }
    pop = rankAll([...pop, ...children], objectives).slice(0, size);
    done = gen;
    report(gen);
  }

  const ranked = rankAll(pop, objectives);
  return {
    finalists: diverse(ranked, objectives, Math.min(5, Math.max(1, cfg.finalists ?? 5))),
    front: ranked.filter((p) => p.rank === 0),
    population: ranked,
    generations: done,
    evaluations,
    seed,
    history,
  };
}
