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
  changeovers: { changeovers: { allergen: PairTable; cip: { short_min: number; full_min: number; max_run_h: number; routine_min: number } } };
  aps: {
    aps: {
      window_days: number;
      lead_days: [number, number];
      rush_lead_days: [number, number];
      batches: Record<string, { batch_kg: number; yield_pct: number; out_kg: number }>;
      lines: Record<string, { rate_kg_h: number; stage: string; equipment: string[]; down_with?: string[] }>;
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

/** Línea de proceso de un granel: hace tandas una tras otra (aps.yaml, lines). */
export interface Line {
  bulk: string;
  stage: string;
  equipment: string[];
  /** Equipos que, si fallan, paran la línea (además de los suyos). */
  downWith: string[];
  rateKgMin: number;
  /** Kilos que entran a la tanda y kilos que salen (rendimiento). */
  batchKg: number;
  outKg: number;
  /** Minutos de línea por tanda: outKg ÷ ritmo. */
  batchMin: number;
  /** Minutos que el granel aguanta en el pulmón. */
  holdMin: number;
}

/** Estado de una llenadora para calcular el cambio: qué granel y qué formato tiene. */
export interface FillerState {
  bulk?: string;
  format?: string;
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
  score: Record<string, number>;
  lines: Record<string, Line>;
  /** Unidades por minuto de cada llenadora (plant.yaml). */
  fillerRate: Record<string, number>;
  /** Formato montado al arrancar (setup.yaml). */
  initialFormat: Record<string, string | undefined>;
  downtime?: SauceData["demand"]["demand"]["downtime"];
  /** Cambio en una llenadora: CIP por alérgeno si cambia el granel y cambio de formato; se hacen a la vez. */
  changeover(from: FillerState, to: FillerState): Changeover;
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
  const lines: Record<string, Line> = {};
  for (const [bulk, l] of Object.entries(a.lines)) {
    const b = a.batches[bulk];
    const hold = a.hold[bulk];
    if (!b || !hold) throw new Error(`${bulk}: falta su tanda o su tiempo de espera en aps.yaml`);
    const rateKgMin = l.rate_kg_h / 60;
    lines[bulk] = { bulk, stage: l.stage, equipment: l.equipment, downWith: l.down_with ?? [], rateKgMin, batchKg: b.batch_kg, outKg: b.out_kg, batchMin: b.out_kg / rateKgMin, holdMin: hold.max_h * 60 };
  }
  const fillerIds = [...new Set(Object.values(products).flatMap((p) => p.fillers))].sort();
  const params = Object.fromEntries(data.layout.equipment.map((e) => [e.id, e.params ?? {}]));
  const fillerRate = Object.fromEntries(fillerIds.map((m) => [m, Number(params[m]?.units_min ?? 0)]));
  for (const [m, r] of Object.entries(fillerRate)) if (!(r > 0)) throw new Error(`${m}: sin units_min en plant.yaml`);
  const changeover = (from: FillerState, to: FillerState): Changeover => {
    const clean = from.bulk && to.bulk && from.bulk !== to.bulk ? pairMin(allergen, groupOf[from.bulk], groupOf[to.bulk]) : 0;
    const kind: ChangeoverKind = clean >= cip.full_min ? "alergeno" : "cip";
    const fmt = from.format && to.format && from.format !== to.format ? formatMin[to.format] ?? 0 : 0;
    return combine([], [{ kind, min: clean }, { kind: "formato", min: fmt }]);
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
    score: a.score,
    lines,
    fillerRate,
    initialFormat: Object.fromEntries(fillerIds.map((m) => [m, data.setup.setup[m]?.tooling])),
    downtime: d.downtime,
    changeover,
  };
}
