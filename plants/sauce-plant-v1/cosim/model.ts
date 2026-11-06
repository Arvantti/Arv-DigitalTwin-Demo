/**
 * Modelo de la planta de salsas para el cosimulador: lo que dicen sus datos (catalog/, aps/aps.yaml) en la forma que
 * usan la cartera inventada, la secuencia manual y, en la fase 3, el programa lineal.
 *
 * Solo importa la plataforma (@twin/cosim-core). Los datos llegan ya leídos (SauceData) para que el mismo código corra
 * en Node (scripts y pruebas) y en el navegador (pantallas del APS).
 */
import { Calendar, combine, pairMin, type Changeover, type ChangeoverKind, type PairTable } from "@twin/cosim-core";

interface Stage {
  stage: string;
  equipment: string[];
  tooling?: string;
}

interface ProductYaml {
  id: string;
  name: string;
  family?: string;
  kind: "finished" | "semi";
  unit: "u" | "kg" | "l";
  allergen_group?: string;
  bom?: { item: string; qty: number }[];
  routing: Stage[];
}

export interface SauceData {
  plant: string;
  products: { products: ProductYaml[] };
  tooling: { tooling: { id: string; kind: string; product?: string; batch_kg?: number; yield_pct?: number; change_min?: number }[] };
  demand: {
    demand: {
      load_pct: number;
      timezone: string;
      workdays: number[];
      shifts: { name: string; start: string; end: string }[];
      rush: { share_pct: number };
      downtime?: { per_day_pct: number; hours: [number, number]; reasons: string[] };
      customers: string[];
      products: { product: string; daily: number; order_qty: [number, number]; round?: number }[];
    };
  };
  changeovers: {
    changeovers: {
      allergen: PairTable;
      cip: { short_min: number; full_min: number; max_run_h: number; routine_min: number };
      /** Orden de recetas por línea de proceso. */
      sequence?: Record<string, string[]>;
      tank?: { dump_cip_min: number };
      nozzle?: { every_h: number; min: number };
    };
  };
  aps: {
    aps: {
      window_days: number;
      lead_days: [number, number];
      rush_lead_days: [number, number];
      batches: Record<string, { batch_kg: number; yield_pct: number; out_kg: number }>;
      /** Tanda parcial: mínimo y paso, en % de la tanda completa. */
      partial_batch?: { min_pct: number; step_pct: number };
      lines: Record<string, { recipes: string[]; rate_kg_h: number; stage: string; equipment: string[]; down_with?: string[] }>;
      lots: Record<string, number>;
      /** Llenadora → productos que puede llenar además de los de su ruta. */
      multipurpose?: Record<string, string[]>;
      hold: Record<string, { max_h: number; condition: string }>;
      score: Record<string, number>;
    };
  };
  setup: { setup: Record<string, { tooling: string }> };
  /** Equipos del plano (plant.yaml): de ahí sale el ritmo de cada llenadora (units_min). */
  layout: { equipment: { id: string; params?: Record<string, unknown> }[] };
}

/** Línea de proceso: hace tandas de sus recetas una tras otra (aps.yaml, lines). */
export interface Line {
  id: string;
  /** Recetas (graneles) de la línea, en el orden de catalog/changeovers.yaml (sequence). */
  bulks: string[];
  stage: string;
  equipment: string[];
  /** Equipos que, si fallan, paran la línea (además de los suyos). */
  downWith: string[];
  rateKgMin: number;
  /** Kilos que entran a la tanda y kilos que salen (rendimiento); iguales para todas las recetas de la línea. */
  batchKg: number;
  outKg: number;
  /** Minutos de línea por tanda: outKg ÷ ritmo. */
  batchMin: number;
}

/** Un granel (receta): de qué línea sale y cuánto aguanta en el pulmón. */
export interface Bulk {
  id: string;
  line: string;
  /** Posición en el orden de la línea (0 = el primero). */
  order: number;
  /** Minutos para montar esta receta en la línea (catalog/tooling.yaml, change_min). */
  changeMin: number;
  /** Minutos que el granel aguanta en el pulmón. */
  holdMin: number;
}

/** Estado de una llenadora para calcular el cambio: qué granel y qué formato tiene. */
export interface FillerState {
  bulk?: string;
  format?: string;
}

/** Estado de una línea para calcular su cambio: la última receta y si el pulmón quedó sucio (granel botado). */
export interface LineState {
  bulk?: string;
  dirty?: boolean;
}

export interface SauceProduct {
  id: string;
  name: string;
  family: string;
  unit: string;
  /** Granel que llena (semielaborado) y kilos por unidad. */
  bulk: string;
  bulkKg: number;
  allergenGroup: string;
  /** Llenadoras que pueden llenarlo: las de su ruta y luego las multipropósito de aps.yaml. */
  fillers: string[];
  format?: string;
  lot: number;
}

export interface SauceModel {
  plant: string;
  timezone: string;
  calendar: Calendar;
  loadPct: number;
  rushSharePct: number;
  leadDays: [number, number];
  rushLeadDays: [number, number];
  customers: string[];
  demand: SauceData["demand"]["demand"]["products"];
  products: Record<string, SauceProduct>;
  /** Llenadoras de la planta (las máquinas de la secuencia manual). */
  fillers: string[];
  allergen: PairTable;
  cip: SauceData["changeovers"]["changeovers"]["cip"];
  hold: SauceData["aps"]["aps"]["hold"];
  batches: SauceData["aps"]["aps"]["batches"];
  /** Tanda parcial permitida (fracción de la tanda completa): mínimo y paso. */
  partialBatch: { min: number; step: number };
  score: Record<string, number>;
  lines: Record<string, Line>;
  bulks: Record<string, Bulk>;
  /** Limpieza intermedia de boquillas de las llenadoras. */
  nozzle: { every_h: number; min: number };
  /** Unidades por minuto de cada llenadora (plant.yaml). */
  fillerRate: Record<string, number>;
  /** Formato montado al arrancar (setup.yaml). */
  initialFormat: Record<string, string | undefined>;
  downtime?: SauceData["demand"]["demand"]["downtime"];
  /**
   * Cambio en una llenadora: limpieza si cambia el granel (CIP por alérgeno, o completo si se devuelve en el orden de
   * su línea) y cambio de formato; se hacen a la vez.
   */
  changeover(from: FillerState, to: FillerState): Changeover;
  /** Cambio en una línea antes de una tanda: receta nueva (o CIP completo si se devuelve) y lavado del pulmón. */
  lineChangeover(from: LineState, to: string): Changeover;
}

export function buildModel(data: SauceData): SauceModel {
  const d = data.demand.demand;
  const a = data.aps.aps;
  const all = Object.fromEntries(data.products.products.map((p) => [p.id, p]));
  const products: Record<string, SauceProduct> = {};
  for (const p of data.products.products) {
    if (p.kind !== "finished") continue;
    const bulkLine = (p.bom ?? []).find((l) => all[l.item]?.kind === "semi");
    if (!bulkLine) throw new Error(`${p.id}: sin granel en la lista de materiales`);
    const fill = p.routing.find((st) => st.stage === "llenado");
    if (!fill) throw new Error(`${p.id}: sin etapa de llenado`);
    const lot = a.lots[p.id];
    if (!lot) throw new Error(`${p.id}: sin lote en aps.yaml`);
    products[p.id] = {
      id: p.id,
      name: p.name,
      family: p.family ?? "",
      unit: p.unit,
      bulk: bulkLine.item,
      bulkKg: bulkLine.qty,
      allergenGroup: all[bulkLine.item].allergen_group ?? "",
      fillers: [
        ...fill.equipment,
        ...Object.entries(a.multipurpose ?? {})
          .filter(([m, ids]) => ids.includes(p.id) && !fill.equipment.includes(m))
          .map(([m]) => m),
      ],
      format: fill.tooling,
      lot,
    };
  }
  const allergen = data.changeovers.changeovers.allergen;
  const cip = data.changeovers.changeovers.cip;
  const formatMin = Object.fromEntries(data.tooling.tooling.filter((t) => t.kind === "format").map((t) => [t.id, t.change_min ?? 0]));
  const groupOf = Object.fromEntries(data.products.products.filter((p) => p.kind === "semi").map((p) => [p.id, p.allergen_group ?? ""]));
  const sequence = data.changeovers.changeovers.sequence ?? {};
  const recipeOf = Object.fromEntries(data.tooling.tooling.filter((t) => t.kind === "recipe" && t.product).map((t) => [t.product!, t]));
  const lines: Record<string, Line> = {};
  const bulks: Record<string, Bulk> = {};
  for (const [id, l] of Object.entries(a.lines)) {
    const order = sequence[id] ?? l.recipes;
    if ([...order].sort().join() !== [...l.recipes].sort().join()) throw new Error(`${id}: las recetas de aps.yaml no son las del orden de changeovers.yaml`);
    const sizes = order.map((b) => a.batches[b]);
    if (sizes.some((b) => !b)) throw new Error(`${id}: falta la tanda de alguna receta en aps.yaml`);
    if (sizes.some((b) => b.out_kg !== sizes[0].out_kg || b.batch_kg !== sizes[0].batch_kg)) throw new Error(`${id}: las recetas de una línea deben tener la misma tanda`);
    const rateKgMin = l.rate_kg_h / 60;
    lines[id] = { id, bulks: order, stage: l.stage, equipment: l.equipment, downWith: l.down_with ?? [], rateKgMin, batchKg: sizes[0].batch_kg, outKg: sizes[0].out_kg, batchMin: sizes[0].out_kg / rateKgMin };
    order.forEach((b, i) => {
      const hold = a.hold[b];
      if (!hold) throw new Error(`${b}: falta su tiempo de espera en aps.yaml`);
      bulks[b] = { id: b, line: id, order: i, changeMin: recipeOf[b]?.change_min ?? 0, holdMin: hold.max_h * 60 };
    });
  }
  const tank = data.changeovers.changeovers.tank ?? { dump_cip_min: 0 };
  const nozzle = data.changeovers.changeovers.nozzle ?? { every_h: Infinity, min: 0 };
  /** Limpieza al pasar de un granel a otro de la misma línea: corto si avanza en el orden, completo si se devuelve. */
  const seqClean = (from: string, to: string) => {
    const f = bulks[from];
    const t = bulks[to];
    if (!f || !t || f.line !== t.line || from === to) return 0;
    return t.order > f.order ? cip.short_min : cip.full_min;
  };
  const fillerIds = [...new Set(Object.values(products).flatMap((p) => p.fillers))].sort();
  const params = Object.fromEntries(data.layout.equipment.map((e) => [e.id, e.params ?? {}]));
  const fillerRate = Object.fromEntries(fillerIds.map((m) => [m, Number(params[m]?.units_min ?? 0)]));
  for (const [m, r] of Object.entries(fillerRate)) if (!(r > 0)) throw new Error(`${m}: sin units_min en plant.yaml`);
  const changeover = (from: FillerState, to: FillerState): Changeover => {
    const swap = from.bulk && to.bulk && from.bulk !== to.bulk;
    const byAllergen = swap ? pairMin(allergen, groupOf[from.bulk!], groupOf[to.bulk!]) : 0;
    const bySequence = swap ? seqClean(from.bulk!, to.bulk!) : 0;
    const clean = Math.max(byAllergen, bySequence);
    const kind: ChangeoverKind = byAllergen >= cip.full_min ? "alergeno" : "cip";
    const fmt = from.format && to.format && from.format !== to.format ? formatMin[to.format] ?? 0 : 0;
    return combine([], [{ kind, min: clean }, { kind: "formato", min: fmt }]);
  };
  const lineChangeover = (from: LineState, to: string): Changeover => {
    const b = bulks[to];
    let recipe: { kind: ChangeoverKind; min: number } = { kind: "receta", min: 0 };
    if (from.bulk && from.bulk !== to) recipe = bulks[from.bulk] && b.order < bulks[from.bulk].order ? { kind: "cip", min: Math.max(cip.full_min, b.changeMin) } : { kind: "receta", min: b.changeMin };
    return combine([], [recipe, { kind: "tanque", min: from.dirty ? tank.dump_cip_min : 0 }]);
  };
  return {
    plant: data.plant,
    timezone: d.timezone,
    calendar: new Calendar(d.workdays, d.shifts),
    loadPct: d.load_pct,
    rushSharePct: d.rush.share_pct,
    leadDays: a.lead_days,
    rushLeadDays: a.rush_lead_days,
    customers: d.customers,
    demand: d.products,
    products,
    fillers: fillerIds,
    allergen,
    cip,
    hold: a.hold,
    batches: a.batches,
    partialBatch: { min: (a.partial_batch?.min_pct ?? 100) / 100, step: (a.partial_batch?.step_pct ?? 100) / 100 },
    score: a.score,
    lines,
    bulks,
    nozzle,
    fillerRate,
    initialFormat: Object.fromEntries(fillerIds.map((m) => [m, data.setup.setup[m]?.tooling])),
    downtime: d.downtime,
    changeover,
    lineChangeover,
  };
}
