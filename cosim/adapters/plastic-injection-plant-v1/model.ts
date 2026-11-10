/**
 * Modelo propio del cosimulador para la planta de inyección de plásticos.
 *
 * Se arma solo con el catálogo de la planta (productos, moldes, molde montado y demanda): qué máquina hace cada
 * producto, cuánto tarda una unidad, qué colores admite y qué componentes lleva el ensamble. No importa el motor de
 * planta ni el secuenciador de referencia (twin_runtime.planning): es una calculadora aparte.
 */
import { Calendar, type Shift } from "../../core/time.ts";
import type { EnergyData, EnergyYaml } from "./energy.ts";

export const PLANT_ID = "plastic-injection-plant-v1";

export interface CatalogData {
  products: { products: CatalogProductYaml[] };
  tooling: { tooling: ToolingYaml[] };
  setup: { setup: Record<string, { tooling: string; color?: string }> };
  /** Inyectoras (plant.yaml): fuerza de cierre y tiro máximo, para validar el montaje de cada molde. */
  machines?: Record<string, { clamp_t?: number; max_shot_kg?: number }>;
  demand: { demand: DemandYaml };
  /** Configuración del APS (aps/aps.yaml): ventana de entrega y tamaño de lote. */
  aps?: { aps: ApsYaml };
  /** Materias primas (catalog/materials.yaml): de aquí sale la resina de cada molde. */
  materials?: { materials: { id: string; kind: string }[] };
  /** Tiempos de cambio entre referencias (catalog/changeovers.yaml). */
  changeovers?: { changeovers: ChangeoversYaml };
  /** Energía por inyectora y molde, y servicios (catalog/energy.yaml, generado con los modelos de la librería). */
  energy?: { energy: EnergyYaml };
}
interface ChangeoverTable {
  default_min?: number;
  /** de → a → minutos */
  pairs?: Record<string, Record<string, number>>;
}
export interface ChangeoversYaml {
  color?: ChangeoverTable;
  resin?: ChangeoverTable;
  mold_move_extra_min?: number;
}

/** Lo que tiene montado una inyectora: molde y color. */
export interface Mount {
  tooling?: string;
  color?: string;
}
export type ChangeKind = "molde" | "resina" | "color";
/** Un cambio de referencia: minutos totales, la parte que manda y el detalle (montaje, purga de resina, purga de color). */
export interface Change {
  min: number;
  kind?: ChangeKind;
  moldMin: number;
  resinMin: number;
  colorMin: number;
}
export interface ApsYaml {
  window_days: number;
  lead_days: [number, number];
  rush_lead_days: [number, number];
  lots: Record<string, number>;
  /** Antiguo: copias de repuesto por molde. Ahora salen de `copies` en catalog/tooling.yaml (copias − montadas). */
  molds_in_storage?: Record<string, number>;
}
export interface CatalogProductYaml {
  id: string;
  name: string;
  family?: string;
  kind: "finished" | "semi";
  unit?: string;
  colors?: string[];
  bom?: { item: string; qty: number }[];
  routing: { stage: string; equipment: string[]; tooling?: string; cycle_s?: number; transfer_min?: number }[];
}
interface ToolingYaml {
  id: string;
  name?: string;
  product: string;
  /** Copias físicas del molde; cada una se monta en una sola inyectora a la vez. */
  copies?: number;
  /** Resina (id de catalog/materials.yaml). */
  material?: string;
  cavities: number;
  part_g?: number;
  cycle_s: number;
  change_min?: number;
  /** Fuerza de cierre mínima que exige el molde (toneladas) y tiro del molde (kg, con colada). */
  min_clamp_t?: number;
  shot_kg?: number;
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
  /** Grupo de producto del catálogo (familia). */
  family?: string;
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
  /** Minutos de cambio entre dos montajes según los datos (molde, resina, color); 0 si no cambia nada. */
  changeover: (from: Mount, to: Mount) => Change;
  /** Traslado y desmontaje cuando un molde se muda de máquina (además del montaje). */
  moldMoveExtraMin: number;
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
  /** Moldes del catálogo como recursos: cada copia está montada en una inyectora o en el almacén de moldes. */
  molds: MoldInfo[];
  /** Molde montado en cada inyectora (setup.yaml). */
  mounted: Record<string, string>;
  /** Molde montado al inicio en cada máquina. */
  initialTooling: Record<string, string | undefined>;
  /** Datos de energía (catalog/energy.yaml); sin ellos el plan no lleva energía. */
  energy?: EnergyData;
}

export interface MoldInfo {
  id: string;
  name: string;
  product: string;
  /** Copias físicas (si el catálogo no lo dice, las que están montadas). */
  copies: number;
  changeMin: number;
}

const NO_CHANGE: Change = { min: 0, moldMin: 0, resinMin: 0, colorMin: 0 };

/**
 * Calculadora de cambios a partir de los datos: montaje = change_min del molde que entra; purga de resina y de color
 * por par (de → a) en changeovers.yaml. La purga de resina arrastra el color, así que se toma la mayor de las dos.
 */
export function changeoverFn(cat: CatalogData, colorDefault: number): (from: Mount, to: Mount) => Change {
  const co = cat.changeovers?.changeovers ?? {};
  const tools = new Map(cat.tooling.tooling.map((t) => [t.id, t]));
  const lookup = (tab: ChangeoverTable | undefined, a: string, b: string, fallback: number) => tab?.pairs?.[a]?.[b] ?? tab?.default_min ?? fallback;
  return (from, to) => {
    // Solo las etapas con molde (inyección) cambian de referencia; el ensamble no purga.
    if (!to.tooling) return NO_CHANGE;
    const moldMin = from.tooling && from.tooling !== to.tooling ? (tools.get(to.tooling)?.change_min ?? 0) : 0;
    const ra = from.tooling ? tools.get(from.tooling)?.material : undefined;
    const rb = tools.get(to.tooling)?.material;
    const resinMin = ra && rb && ra !== rb ? lookup(co.resin, ra, rb, colorDefault) : 0;
    const colorMin = from.color && to.color && from.color !== to.color ? lookup(co.color, from.color, to.color, colorDefault) : 0;
    const purge = Math.max(resinMin, colorMin);
    const min = moldMin + purge;
    if (!min) return NO_CHANGE;
    const kind: ChangeKind = moldMin ? "molde" : resinMin >= colorMin ? "resina" : "color";
    return { min, kind, moldMin, resinMin, colorMin };
  };
}

export interface PlantYaml { equipment?: { id: string; type?: string; params?: { clamp_t?: number; max_shot_kg?: number } }[] }
/** Parámetros de cierre y tiro de cada inyectora, de plant.yaml. */
export const machinesOf = (p: PlantYaml) =>
  Object.fromEntries((p.equipment ?? []).filter((e) => e.type === "injection_molding_machine").map((e) => [e.id, { clamp_t: e.params?.clamp_t, max_shot_kg: e.params?.max_shot_kg }]));

/** Motivo por el que un molde no cabe en una inyectora, o undefined si cabe (o si faltan datos). */
export function moldFitProblem(cat: CatalogData, machine: string, toolingId: string): string | undefined {
  const mach = cat.machines?.[machine];
  const mold = cat.tooling.tooling.find((t) => t.id === toolingId);
  if (!mach || !mold) return undefined;
  if (mold.min_clamp_t !== undefined && mach.clamp_t !== undefined && mach.clamp_t < mold.min_clamp_t)
    return `el molde ${mold.id} necesita ${mold.min_clamp_t} t de cierre y ${machine} tiene ${mach.clamp_t} t`;
  if (mold.shot_kg !== undefined && mach.max_shot_kg !== undefined && mach.max_shot_kg < mold.shot_kg)
    return `el molde ${mold.id} tiene un tiro de ${mold.shot_kg} kg y ${machine} inyecta hasta ${mach.max_shot_kg} kg`;
  return undefined;
}

export function buildModel(cat: CatalogData): PlasticsModel {
  const demand = cat.demand.demand;
  const tooling = new Map(cat.tooling.tooling.map((t) => [t.id, t]));
  const setup = cat.setup.setup;
  // Un molde grande no va a una máquina pequeña ni al revés: el montaje se rechaza si no cabe.
  for (const [m, s] of Object.entries(setup)) {
    const problem = s.tooling ? moldFitProblem(cat, m, s.tooling) : undefined;
    if (problem) throw new Error(`Montaje no válido en ${m}: ${problem}`);
  }
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
      family: p.family,
      unit: p.unit ?? "u",
      kind: p.kind,
      colors: p.colors ?? [],
      components: (p.bom ?? []).map((b) => ({ step: stepOf(b.item), qty: b.qty })),
      final: stepOf(p.id),
    };
  }
  const mounted = Object.fromEntries(Object.entries(setup).map(([m, s]) => [m, s.tooling]));
  const molds: MoldInfo[] = cat.tooling.tooling.map((t) => {
    const inUse = Object.values(mounted).filter((x) => x === t.id).length;
    if (t.copies !== undefined && inUse > t.copies) throw new Error(`El molde ${t.id} está montado en ${inUse} inyectoras pero solo tiene ${t.copies} copias`);
    return { id: t.id, name: t.name ?? t.id, product: t.product, copies: t.copies ?? inUse, changeMin: t.change_min ?? 0 };
  });
  const initialColor: Record<string, string | undefined> = {};
  const initialTooling: Record<string, string | undefined> = {};
  for (const m of machines) {
    initialColor[m] = setup[m]?.color;
    initialTooling[m] = setup[m]?.tooling;
  }
  const colorDefault = cat.changeovers?.changeovers.color?.default_min ?? demand.color_change_min ?? 0;
  return {
    plant: PLANT_ID,
    timezone: demand.timezone,
    calendar: new Calendar(demand.workdays, demand.shifts),
    loadPct: demand.load_pct,
    colorChangeMin: colorDefault,
    changeover: changeoverFn(cat, colorDefault),
    moldMoveExtraMin: cat.changeovers?.changeovers.mold_move_extra_min ?? 30,
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
    molds,
    mounted,
    initialTooling,
    energy: energyOf(cat),
  };
}

function energyOf(cat: CatalogData): EnergyData | undefined {
  const e = cat.energy?.energy;
  if (!e) return undefined;
  return {
    injection: e.injection,
    services: e.services ?? {},
    overnight: e.policy?.off_outside_shifts === false ? "caliente" : "apagar",
    partKg: Object.fromEntries(cat.tooling.tooling.map((t) => [t.id, (t.part_g ?? 0) / 1000])),
    resin: Object.fromEntries(cat.tooling.tooling.map((t) => [t.id, t.material])),
  };
}

/** Horas de turno por día laborable. */
export const shiftHours = (m: PlasticsModel) => m.calendar.spans.reduce((s, [a, b]) => s + (b - a), 0) / 60;

