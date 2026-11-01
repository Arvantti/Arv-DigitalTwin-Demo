/**
 * Modelo propio del cosimulador para la planta de inyección de plásticos.
 *
 * Se arma solo con el catálogo de la planta (productos, moldes, molde montado y demanda): qué máquina hace cada
 * producto, cuánto tarda una unidad, qué colores admite y qué componentes lleva el ensamble. No importa el motor de
 * planta ni el secuenciador de referencia (twin_runtime.planning): es una calculadora aparte.
 */
import { Calendar, type Shift } from "../../core/time.ts";

export const PLANT_ID = "plastic-injection-plant-v1";

export interface CatalogData {
  products: { products: CatalogProductYaml[] };
  tooling: { tooling: ToolingYaml[] };
  setup: { setup: Record<string, { tooling: string; color?: string }> };
  demand: { demand: DemandYaml };
  /** Configuración del APS (aps/aps.yaml): ventana de entrega y tamaño de lote. */
  aps?: { aps: ApsYaml };
}
export interface ApsYaml {
  window_days: number;
  lead_days: [number, number];
  rush_lead_days: [number, number];
  lots: Record<string, number>;
}
interface CatalogProductYaml {
  id: string;
  name: string;
  kind: "finished" | "semi";
  unit?: string;
  colors?: string[];
  bom?: { item: string; qty: number }[];
  routing: { stage: string; equipment: string[]; tooling?: string; cycle_s?: number; transfer_min?: number }[];
}
interface ToolingYaml {
  id: string;
  product: string;
  cavities: number;
  cycle_s: number;
  change_min?: number;
}
export interface DemandYaml {
  load_pct: number;
  timezone: string;
  workdays: number[];
  shifts: Shift[];
  lead_days: [number, number];
  rush?: { share_pct: number; lead_days: [number, number] };
  downtime?: { per_day_pct: number; hours: [number, number]; reasons: string[] };
  color_change_min?: number;
  customers: string[];
  products: { product: string; daily: number; order_qty: [number, number]; round?: number }[];
}

/** Una etapa programable: en qué máquinas, con qué molde y cuántos minutos por unidad. */
export interface Step {
  product: string;
  stage: string;
  machines: string[];
  unitMin: number;
  tooling?: string;
  /** Minutos desde que termina esta etapa hasta que la pieza llega a la siguiente (estiba, transporte, almacén). */
  transferMin: number;
}

export interface ProductInfo {
  id: string;
  name: string;
  unit: string;
  kind: "finished" | "semi";
  colors: string[];
  /** Componentes que se fabrican antes (ensamble). */
  components: { step: Step; qty: number }[];
  /** Etapa final que entrega el producto. */
  final: Step;
}

export interface PlasticsModel {
  plant: string;
  timezone: string;
  calendar: Calendar;
  loadPct: number;
  colorChangeMin: number;
  downtime: DemandYaml["downtime"];
  customers: string[];
  demand: DemandYaml["products"];
  /** Días entre la llegada y la entrega de un pedido (ventana del APS). */
  windowDays: number;
  leadDays: [number, number];
  rushLeadDays: [number, number];
  rushSharePct: number;
  /** Unidades por lote de cada producto (también componentes). */
  lots: Record<string, number>;
  products: Record<string, ProductInfo>;
  /** Máquinas programables (las que tienen un molde del catálogo montado y la celda de ensamble). */
  machines: string[];
  /** Color montado al inicio en cada máquina. */
  initialColor: Record<string, string | undefined>;
}

export function buildModel(cat: CatalogData): PlasticsModel {
  const demand = cat.demand.demand;
  const tooling = new Map(cat.tooling.tooling.map((t) => [t.id, t]));
  const setup = cat.setup.setup;
  const byId = new Map(cat.products.products.map((p) => [p.id, p]));
  const machines = new Set<string>();

  /** Primera etapa programable de un producto: inyección con su molde montado, o una etapa con ciclo propio. */
  const stepOf = (id: string): Step => {
    const p = byId.get(id);
    if (!p) throw new Error(`Producto desconocido en el catálogo: ${id}`);
    const i = p.routing.findIndex((r) => r.tooling || r.cycle_s);
    if (i < 0) throw new Error(`El producto ${id} no tiene etapa programable`);
    const r = p.routing[i];
    const transferMin = p.routing.slice(i).reduce((s, x) => s + (x.transfer_min ?? 0), 0);
    if (r.tooling) {
      const mold = tooling.get(r.tooling)!;
      const mounted = r.equipment.filter((m) => setup[m]?.tooling === r.tooling);
      if (!mounted.length) throw new Error(`El molde ${r.tooling} no está montado en ninguna máquina`);
      mounted.forEach((m) => machines.add(m));
      return { product: id, stage: r.stage, machines: mounted, unitMin: mold.cycle_s / mold.cavities / 60, tooling: r.tooling, transferMin };
    }
    r.equipment.forEach((m) => machines.add(m));
    return { product: id, stage: r.stage, machines: [...r.equipment], unitMin: r.cycle_s! / 60, transferMin };
  };

  const products: Record<string, ProductInfo> = {};
  for (const line of demand.products) {
    const p = byId.get(line.product)!;
    products[p.id] = {
      id: p.id,
      name: p.name,
      unit: p.unit ?? "u",
      kind: p.kind,
      colors: p.colors ?? [],
      components: (p.bom ?? []).map((b) => ({ step: stepOf(b.item), qty: b.qty })),
      final: stepOf(p.id),
    };
  }
  const initialColor: Record<string, string | undefined> = {};
  for (const m of machines) initialColor[m] = setup[m]?.color;
  return {
    plant: PLANT_ID,
    timezone: demand.timezone,
    calendar: new Calendar(demand.workdays, demand.shifts),
    loadPct: demand.load_pct,
    colorChangeMin: demand.color_change_min ?? 0,
    downtime: demand.downtime,
    customers: demand.customers,
    demand: demand.products,
    windowDays: cat.aps?.aps.window_days ?? 14,
    leadDays: cat.aps?.aps.lead_days ?? demand.lead_days,
    rushLeadDays: cat.aps?.aps.rush_lead_days ?? demand.rush?.lead_days ?? [2, 4],
    rushSharePct: demand.rush?.share_pct ?? 15,
    lots: cat.aps?.aps.lots ?? {},
    products,
    machines: [...machines].sort(),
    initialColor,
  };
}

/** Horas de turno por día laborable. */
export const shiftHours = (m: PlasticsModel) => m.calendar.spans.reduce((s, [a, b]) => s + (b - a), 0) / 60;

