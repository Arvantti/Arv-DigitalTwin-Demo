/**
 * Fractal de plásticos con generador genético: en vez de probar solo las variantes escritas a mano, el generador
 * (platform/fractal-core, NSGA-II) cruza y muta las palancas de la planta y el cosimulador evalúa cada combinación.
 *
 * Genoma (un gen por palanca):
 * - rush: pedidos que suben a importancia alta;
 * - spares: copias de repuesto del almacén de moldes montadas en inyectoras libres compatibles (hasta 2);
 * - move: mudar el molde de la máquina en falla a otra inyectora;
 * - dedicateColors: cada color solo en las máquinas que ya lo tienen montado;
 * - overnight y objective: escenario de energía (calientes o apagadas fuera de turno, objetivo energía).
 *
 * Restricciones fuera del genoma: las entregas (ninguna opción atrasa más que solo recalcular), las órdenes fijadas
 * (el cosimulador no las mueve) y las reglas físicas (copias de molde, tamaño de inyectora).
 * Las variantes escritas a mano son las semillas: la mejor opción nunca es peor que la del estudio manual.
 */
import { diverse, evolve, paretoFronts, pick, type Evaluation, type Evaluator, type GenomeSpace, type Individual, type Objective as GaObjective, type Rng } from "@twin/fractal-core";
import type { CatalogData } from "@twin/cosim/adapters/plastic-injection-plant-v1/model.ts";
import type { HighsLike, Objective } from "@twin/cosim/adapters/plastic-injection-plant-v1/solve.ts";
import { iso, parseLocal } from "@twin/cosim/core/time.ts";
import type { FractalStudy, Lever, StudyOption } from "../../contracts.ts";
import { changeMin, explain, frameStudy, freeMachinesFor, label, MAX_TARGETS, maxOf, placeOption, sparesLeft, type Frame, type StudyInput, type Variant } from "./study.ts";
import { energyFrom } from "@twin/cosim/adapters/plastic-injection-plant-v1/energy.ts";

export interface PlasticsGenome {
  /** Pedidos con importancia alta (ordenados). */
  rush: string[];
  /** Repuestos montados, "molde@máquina" (ordenados, hasta 2). */
  spares: string[];
  /** Mudanza del molde de la máquina en falla, "molde@desde>hacia". */
  move: string | null;
  dedicateColors: boolean;
  overnight: "apagar" | "caliente" | null;
  objective: Objective | null;
}

/** Valores posibles de cada gen en este escenario. */
export interface Choices {
  rush: string[];
  spares: string[];
  moves: string[];
  colors: boolean;
  energy: boolean;
}

export interface GenerateOptions {
  population?: number;
  generations?: number;
  seed?: number;
  /** Tope de corridas del cosimulador (cada una tarda unos 0,2 s). */
  maxEvaluations?: number;
  /** Cuántas opciones devolver (3 a 5). */
  finalists?: number;
}

/** Holgura en horas: un pedido que termina a menos de esto de su fecha es candidato a prioridad alta. */
const TIGHT_H = 24;
/** Moldes con repuesto que entran al genoma: los de las máquinas más cargadas. */
const MAX_TOOLINGS = 4;
const MAX_RUSH = 6;

const SPARE = (tooling: string, machine: string) => `${tooling}@${machine}`;
const MOVE = (tooling: string, from: string, to: string) => `${tooling}@${from}>${to}`;
const parseSpare = (s: string) => {
  const [tooling, machine] = s.split("@");
  return { tooling, machine };
};
const parseMove = (s: string) => {
  const [tooling, rest] = s.split("@");
  const [from, to] = rest.split(">");
  return { tooling, from, to };
};

export function choicesFor(cat: CatalogData, f: Frame): Choices {
  const { input, baseSetup, baseLoads, failed, fixed } = f;
  let rush: string[];
  if (input.scenario === "adelantar" && input.order) rush = [input.order.id];
  else {
    const slack = (o: { due: string; completion: string }) => (parseLocal(o.due) - parseLocal(o.completion)) / 60;
    rush = input.previous.orders
      .filter((o) => !fixed.includes(o.id) && parseLocal(o.completion) > f.now && slack(o) < TIGHT_H)
      .sort((a, b) => slack(a) - slack(b))
      .slice(0, MAX_RUSH)
      .map((o) => o.id);
  }
  const hotOf = (t: string) => Math.max(0, ...Object.entries(baseSetup).filter(([, s]) => s.tooling === t).map(([m]) => baseLoads[m] ?? 0));
  const toolings = [...new Set(Object.values(baseSetup).map((s) => s.tooling))]
    .filter((t) => sparesLeft(cat, baseSetup, t) > 0)
    .sort((a, b) => hotOf(b) - hotOf(a))
    .slice(0, MAX_TOOLINGS);
  const spares = toolings.flatMap((t) => freeMachinesFor(cat, baseSetup, t, failed).slice(0, MAX_TARGETS).map((m) => SPARE(t, m)));
  const moves: string[] = [];
  if (input.scenario === "falla")
    for (const m of failed) {
      const t = baseSetup[m]?.tooling;
      if (t) for (const to of freeMachinesFor(cat, baseSetup, t, failed).slice(0, MAX_TARGETS)) moves.push(MOVE(t, m, to));
    }
  return { rush, spares, moves, colors: true, energy: input.scenario === "energia" };
}

/** El genoma de una variante escrita a mano (para usarla como semilla). */
export function genomeOf(v: Variant, energy: boolean): PlasticsGenome {
  const rush = v.levers.filter((l) => l.kind === "prioridad" && l.order).map((l) => l.order!);
  const spares = v.levers.filter((l) => l.kind === "montar-molde" && l.machine && l.tooling).map((l) => SPARE(l.tooling!, l.machine!));
  const mv = v.levers.find((l) => l.kind === "mover-molde" && l.from && l.machine && l.tooling);
  return normalize({
    rush,
    spares,
    move: mv ? MOVE(mv.tooling!, mv.from!, mv.machine!) : null,
    dedicateColors: !!v.solver?.dedicateColors,
    overnight: energy ? (v.overnight ?? "apagar") : null,
    objective: v.solver?.objective ?? null,
  });
}

const normalize = (g: PlasticsGenome): PlasticsGenome => ({ ...g, rush: [...new Set(g.rush)].sort(), spares: [...new Set(g.spares)].sort() });
export const genomeKey = (g: PlasticsGenome) => JSON.stringify(normalize(g));

/** La variante que el cosimulador coloca para un genoma: palancas, moldes, paradas por montaje y cartera. */
export function variantOf(cat: CatalogData, f: Frame, g: PlasticsGenome): Variant {
  const { nowIso, now, tz } = f;
  const levers: Lever[] = [];
  const parts: string[] = [];
  const molds: Record<string, string | null> = {};
  const stops: NonNullable<Variant["stops"]> = [];
  let portfolio = f.portfolio;
  let orderChanges = f.orderChanges ? [...f.orderChanges] : undefined;
  if (g.rush.length) {
    const set = new Set(g.rush);
    portfolio = { ...portfolio, orders: portfolio.orders.map((o) => (set.has(o.id) ? { ...o, importance: "alta" as const } : o)) };
    for (const id of g.rush) {
      levers.push({ kind: "prioridad", text: `Subir ${id} a importancia alta`, order: id });
      const ch = orderChanges?.find((c) => c.order === id);
      if (ch) ch.importance = "alta";
      else (orderChanges ??= []).push({ order: id, importance: "alta" });
    }
    parts.push(g.rush.length === 1 ? `prioridad alta a ${g.rush[0]}` : `prioridad alta a ${g.rush.length} pedidos`);
  }
  if (g.move) {
    const { tooling, from, to } = parseMove(g.move);
    const min = changeMin(cat, tooling) + f.baseModel.moldMoveExtraMin;
    molds[from] = null;
    molds[to] = tooling;
    stops.push({ equipment: to, start: nowIso, end: iso(now + min, tz), reason: `Mudanza de ${tooling} desde ${label(from)}` });
    levers.push({ kind: "mover-molde", text: `Desmontar ${tooling} de ${label(from)} y montarlo en ${label(to)}: ${min} min desde AHORA`, machine: to, from, tooling });
    parts.push(`mudar el molde a ${label(to)}`);
  }
  for (const s of g.spares) {
    const { tooling, machine } = parseSpare(s);
    molds[machine] = tooling;
    stops.push({ equipment: machine, start: nowIso, end: iso(now + changeMin(cat, tooling), tz), reason: `Montaje de ${tooling}` });
    levers.push({ kind: "montar-molde", text: `Montar la copia de repuesto de ${tooling} (almacén de moldes) en ${label(machine)}: ${changeMin(cat, tooling)} min de montaje desde AHORA`, machine, tooling });
    parts.push(`repuesto de ${tooling} en ${label(machine)}`);
  }
  if (g.dedicateColors) {
    levers.push({ kind: "dedicar-color", text: "Cada color solo en las máquinas que ya lo tienen montado" });
    parts.push("un color por máquina");
  }
  if (g.overnight === "caliente") {
    levers.push({ kind: "espera-caliente", text: "Sin apagar las inyectoras entre turnos: espera caliente de 22:00 a 06:00 y el domingo" });
    parts.push("calientes de noche");
  } else if (g.overnight === "apagar") {
    levers.push({ kind: "apagar", text: "Apagadas de 22:00 a 06:00 y el domingo, con calentamiento antes del primer lote del día" });
    parts.push("apagadas fuera de turno");
  }
  if (g.objective === "energia") {
    levers.push({ kind: "agrupar", text: "El cosimulador con objetivo energía: menos días-máquina encendidos y cada pieza en la máquina que gasta menos" });
    parts.push("agrupar la producción");
  }
  if (!levers.length) levers.push({ kind: "recalcular", text: "Recolocar con el cosimulador sin cambiar la planta" });
  const text = parts.length ? parts.join(" + ") : "solo recolocar la secuencia";
  return {
    label: text.charAt(0).toUpperCase() + text.slice(1),
    levers,
    ...(Object.keys(molds).length ? { molds, stops } : {}),
    portfolio,
    orderChanges,
    solver: { ...(g.dedicateColors ? { dedicateColors: true } : {}), ...(g.objective ? { objective: g.objective } : {}) },
    ...(g.overnight === "caliente" ? { overnight: "caliente" as const } : {}),
  };
}

const flip = (rng: Rng, p: number) => rng() < p;

/** Espacio del genoma: cómo crear, cruzar, mutar y reparar sin romper reglas físicas. */
export function plasticsSpace(cat: CatalogData, f: Frame, c: Choices): GenomeSpace<PlasticsGenome> {
  const objectives: (Objective | null)[] = c.energy ? [null, "energia"] : [null];
  const overnights: PlasticsGenome["overnight"][] = c.energy ? ["apagar", "caliente"] : [null];
  const genes = ["rush", "spares", "move", "colors", "overnight", "objective"].filter(
    (k) => (k === "rush" && c.rush.length) || (k === "spares" && c.spares.length) || (k === "move" && c.moves.length) || (k === "colors" && c.colors) || ((k === "overnight" || k === "objective") && c.energy),
  );
  const randomSpares = (rng: Rng) => {
    const n = c.spares.length ? pick(rng, 3) : 0;
    return Array.from({ length: n }, () => c.spares[pick(rng, c.spares.length)]);
  };
  return {
    random: (rng) => ({
      rush: c.rush.filter(() => flip(rng, c.rush.length === 1 ? 0.5 : 0.3)),
      spares: randomSpares(rng),
      move: c.moves.length && flip(rng, 0.5) ? c.moves[pick(rng, c.moves.length)] : null,
      dedicateColors: c.colors && flip(rng, 0.3),
      overnight: overnights[pick(rng, overnights.length)],
      objective: objectives[pick(rng, objectives.length)],
    }),
    crossover: (a, b, rng) => ({
      rush: c.rush.filter((id) => (flip(rng, 0.5) ? a : b).rush.includes(id)),
      spares: [...new Set([...a.spares, ...b.spares])].filter(() => flip(rng, 0.5)),
      move: flip(rng, 0.5) ? a.move : b.move,
      dedicateColors: flip(rng, 0.5) ? a.dedicateColors : b.dedicateColors,
      overnight: flip(rng, 0.5) ? a.overnight : b.overnight,
      objective: flip(rng, 0.5) ? a.objective : b.objective,
    }),
    mutate: (g, rng) => {
      const m = { ...g, rush: [...g.rush], spares: [...g.spares] };
      if (!genes.length) return m;
      const gene = genes[pick(rng, genes.length)];
      if (gene === "rush") {
        const id = c.rush[pick(rng, c.rush.length)];
        m.rush = m.rush.includes(id) ? m.rush.filter((x) => x !== id) : [...m.rush, id];
      } else if (gene === "spares") {
        const s = c.spares[pick(rng, c.spares.length)];
        m.spares = m.spares.includes(s) ? m.spares.filter((x) => x !== s) : [...m.spares, s];
      } else if (gene === "move") m.move = m.move && flip(rng, 0.5) ? null : c.moves[pick(rng, c.moves.length)];
      else if (gene === "colors") m.dedicateColors = !m.dedicateColors;
      else if (gene === "overnight") m.overnight = m.overnight === "caliente" ? "apagar" : "caliente";
      else m.objective = m.objective ? null : "energia";
      return m;
    },
    repair: (g) => {
      const n = normalize(g);
      // Una máquina recibe un solo molde, no se monta repuesto donde llega la mudanza y no se usan más copias de las que hay.
      const used = new Set<string>(n.move ? [parseMove(n.move).to] : []);
      const perTooling: Record<string, number> = {};
      n.spares = n.spares.filter((s) => {
        const { tooling, machine } = parseSpare(s);
        if (used.has(machine) || (perTooling[tooling] ?? 0) >= sparesLeft(cat, f.baseSetup, tooling)) return false;
        used.add(machine);
        perTooling[tooling] = (perTooling[tooling] ?? 0) + 1;
        return true;
      });
      n.spares = n.spares.slice(0, 2);
      return n;
    },
    key: genomeKey,
  };
}

/** Objetivos del escenario: el puntaje de la empresa primero (desempata y elige la mejor), luego lo que se compara. */
export function objectivesFor(scenario: StudyInput["scenario"]): GaObjective[] {
  const extra: Record<StudyInput["scenario"], string[]> = {
    adelantar: ["atraso_h", "montaje_h"],
    falla: ["atraso_h", "montaje_h"],
    fijadas: ["atraso_h", "carga_max", "montaje_h"],
    balancear: ["carga_max", "montaje_h"],
    cambios: ["cambios_h", "montaje_h"],
    energia: ["kwh", "montaje_h"],
  };
  return ["score", ...extra[scenario]].map((metric) => ({ metric }));
}

const metricsOf = (o: StudyOption): Record<string, number> => ({
  score: o.score,
  atraso_h: o.kpis.tardiness_h,
  tarde: o.kpis.late_orders,
  carga_max: o.max_load.pct,
  cambios_h: o.kpis.changeover_h,
  montaje_h: o.mold_change_h,
  kwh: o.energy?.kwh ?? o.kpis.energy_kwh ?? 0,
});

/**
 * Estudio con el generador genético. Devuelve el mismo `fractal-study.v1` que el estudio manual (el APS y el 3D lo
 * leen igual), con 3 a 5 opciones distintas entre sí, su frente de Pareto y los datos del generador.
 */
export async function generateStudy(newHighs: () => Promise<HighsLike>, cat: CatalogData, input: StudyInput, opts: GenerateOptions = {}): Promise<FractalStudy> {
  const t0 = Date.now();
  const f = frameStudy(cat, input);
  const studyId = input.studyId ?? "FRA";
  const choices = choicesFor(cat, f);
  const space = plasticsSpace(cat, f, choices);
  const seeds = f.variants.map((v) => space.repair!(genomeOf(v, choices.energy))!);
  const seedLabel = new Map(seeds.map((g, i) => [genomeKey(g), f.variants[i].label]));
  const placed = new Map<string, StudyOption>();
  let n = 0;
  const place = async (g: PlasticsGenome): Promise<StudyOption> => {
    const key = genomeKey(g);
    let o = placed.get(key);
    if (!o) {
      const v = variantOf(cat, f, g);
      v.label = seedLabel.get(key) ?? v.label;
      o = await placeOption(newHighs, cat, f, v, `${studyId}-E${++n}`);
      placed.set(key, o);
    }
    return o;
  };
  // Referencia de entregas: solo recalcular (la primera variante). Ninguna opción puede atrasar más que eso.
  const base = await place(seeds[0]);
  const ref = { late: base.kpis.late_orders, tard: base.kpis.tardiness_h };
  /** Todo lo evaluado: las finalistas salen de aquí, no solo de la última población. */
  const archive = new Map<string, Individual<PlasticsGenome>>();
  const cosim: Evaluator<PlasticsGenome> = {
    id: "cosim",
    stage: "precisa",
    evaluate: async (g): Promise<Evaluation> => {
      const o = await place(g);
      const over = Math.max(0, o.kpis.tardiness_h - ref.tard - 0.5) + 20 * Math.max(0, o.kpis.late_orders - ref.late);
      const evaluation = { feasible: over === 0, violation: over, metrics: metricsOf(o) };
      archive.set(genomeKey(g), { genome: g, key: genomeKey(g), evaluation, rank: 0, crowding: 0 });
      return evaluation;
    },
  };
  const objectives = objectivesFor(input.scenario);
  const population = opts.population ?? 12;
  const r = await evolve({ space, evaluator: cosim, objectives, seeds, population, generations: opts.generations ?? 4, seed: opts.seed ?? 1, maxEvaluations: opts.maxEvaluations ?? 48, finalists: opts.finalists ?? 5 });

  // Dos genomas con los mismos resultados son la misma opción para quien decide: queda el de menos palancas
  // (una prioridad alta que no cambia nada sobra). Luego se eligen de 3 a 5 distintas del mejor frente.
  const simplest = new Map<string, Individual<PlasticsGenome>>();
  const leversOf = (g: PlasticsGenome) => g.rush.length + g.spares.length + (g.move ? 1 : 0) + (g.dedicateColors ? 1 : 0) + (g.objective ? 1 : 0);
  for (const ind of archive.values()) {
    const sig = [...objectives.map((o) => ind.evaluation.metrics[o.metric]), ind.evaluation.metrics.tarde].join("|");
    const had = simplest.get(sig);
    if (!had || leversOf(ind.genome) < leversOf(had.genome)) simplest.set(sig, ind);
  }
  const pool = [...simplest.values()];
  paretoFronts(pool.map((p) => p.evaluation), objectives).forEach((idx, rank) => idx.forEach((i) => (pool[i].rank = rank)));
  const finalists = diverse(pool, objectives, Math.min(5, opts.finalists ?? 5));

  const options = finalists.map((ind, i) => {
    const o = placed.get(ind.key)!;
    const id = `${studyId}-${String.fromCharCode(65 + i)}`;
    o.plan.plan_id = id;
    return { ...o, id, pareto_rank: ind.rank, evaluated_by: ["cosim"] };
  });
  const best = options[0];
  const why = explain(f, best, best.label === base.label ? best : base, [base, ...options]);
  const { question, baseModel, baseLoads, nowIso, now } = f;
  return {
    contract: "fractal-study.v1",
    study_id: studyId,
    plant: baseModel.plant,
    scenario: input.scenario,
    question,
    now: nowIso,
    baseline: { plan_id: input.previous.plan_id, kpis: input.previous.kpis, loads: baseLoads, max_load: maxOf(baseLoads), ...(input.scenario === "energia" && baseModel.energy ? { energy: energyFrom(baseModel, input.previous, now) } : {}) },
    options,
    best: best.id,
    recommendation: `Recomendación: ${best.label.charAt(0).toLowerCase()}${best.label.slice(1)}. ${why}`,
    seconds: Math.round((Date.now() - t0) / 100) / 10,
    generator: { method: "genetico", seed: r.seed, population, generations: r.generations, evaluations: placed.size, seeds: seeds.length, objectives: objectives.map((o) => o.metric) },
  };
}
