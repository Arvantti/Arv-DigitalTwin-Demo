/**
 * Modelo de la planta de salsas para el cosimulador: lo que dicen sus datos (catalog/, aps/aps.yaml) en la forma que
 * usan la cartera inventada, la secuencia manual y, en la fase 3, el programa lineal.
 *
 * Solo importa la plataforma (@twin/cosim-core). Los datos llegan ya leídos (SauceData) para que el mismo código corra
 * en Node (scripts y pruebas) y en el navegador (pantallas del APS).
 */
import { Calendar, type PairTable } from "@twin/cosim-core";

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
      customers: string[];
      products: { product: string; daily: number; order_qty: [number, number]; round?: number }[];
    };
  };
  changeovers: { changeovers: { allergen: PairTable; cip: { short_min: number; full_min: number; max_run_h: number; daily_min: number } } };
  aps: {
    aps: {
      window_days: number;
      lead_days: [number, number];
      rush_lead_days: [number, number];
      batches: Record<string, { batch_kg: number; yield_pct: number; out_kg: number }>;
      lots: Record<string, number>;
      /** Llenadora → productos que puede llenar además de los de su ruta. */
      multipurpose?: Record<string, string[]>;
      hold: Record<string, { max_h: number; condition: string }>;
      score: Record<string, number>;
    };
  };
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
    fillers: [...new Set(Object.values(products).flatMap((p) => p.fillers))].sort(),
    allergen: data.changeovers.changeovers.allergen,
    cip: data.changeovers.changeovers.cip,
    hold: a.hold,
    batches: a.batches,
    score: a.score,
  };
}
