/**
 * Estado de cada máquina de plásticos en un instante, sacado de la programación vigente y de los eventos del emulador.
 * Lo usan el emulador 2D, el centro de control, el PLC de cada máquina en el gemelo 3D y el play por día y hora.
 *
 * OEE del turno = disponibilidad × rendimiento × calidad, desde que empezó el turno hasta el instante pedido:
 * - disponibilidad: tiempo produciendo / tiempo cargado (produciendo + cambios de color + paradas). El tiempo sin orden
 *   no cuenta como pérdida (no estaba programado);
 * - rendimiento y calidad: supuestos por máquina y día con semilla (88–97 % y 97,5–99,6 %), hasta tener señales reales.
 */
import type { PlanScheduleRow, PlantEvent, ProductionPlan } from "@twin/cosim/core/contracts.ts";
import { rng } from "@twin/cosim/core/time.ts";
import yaml from "js-yaml";
import plantYaml from "../../../industrial-models/plastic-injection-plant-v1/plant.yaml?raw";
import setupYaml from "../../../industrial-models/plastic-injection-plant-v1/catalog/setup.yaml?raw";
import { model, molds } from "./aps-store.ts";

export type MachineState = "run" | "change" | "idle" | "plan" | "fault" | "off";
export const STATE_NAMES: Record<MachineState, string> = {
  run: "PRODUCIENDO",
  change: "CAMBIO DE COLOR",
  idle: "SIN ORDEN",
  plan: "PARADA PROGRAMADA",
  fault: "FUERA DE SERVICIO",
  off: "FUERA DE TURNO",
};
export const STATE_COLORS: Record<MachineState, string> = { run: "#22e06b", change: "#b48cff", idle: "#8a93ad", plan: "#ffb000", fault: "#ff3b3b", off: "#4a5276" };

/** Minutos desde la época en hora de la planta ("2026-11-04T10:00" o con zona). */
export const minOf = (iso: string) => Date.parse(`${iso.slice(0, 16)}:00Z`) / 60000;
export const isoOf = (min: number) => new Date(min * 60000).toISOString().slice(0, 16);

const evEnd = (e: PlantEvent) => minOf(e.cleared ?? e.est_end);
/** Fallas o paros vigentes en el instante t. */
export const eventsAt = (events: PlantEvent[], t: number) => events.filter((e) => minOf(e.start) <= t && t < evEnd(e));

export interface MachineNow {
  state: MachineState;
  row?: PlanScheduleRow;
  ev?: PlantEvent;
  why?: string;
}

function inShift(t: number): [number, number] | null {
  const d = Math.floor(t / 1440) * 1440;
  if (!model.calendar.isWorkday(d)) return null;
  const span = model.calendar.spans.find(([a, b]) => t >= d + a && t < d + b);
  return span ? [d + span[0], d + span[1]] : null;
}

export function machineAt(plan: ProductionPlan, events: PlantEvent[], id: string, t: number): MachineNow {
  const ev = eventsAt(events, t).find((e) => e.equipment === id);
  if (ev) return { state: "fault", ev };
  if (!inShift(t)) return { state: "off" };
  const down = plan.downtime.find((d) => d.equipment === id && minOf(d.start) <= t && minOf(d.end) > t);
  if (down) return { state: "plan", why: down.reason };
  const row = plan.schedule.find((r) => r.equipment === id && minOf(r.start) <= t && minOf(r.end) > t);
  if (!row) return { state: "idle" };
  const changing = row.changeover_min > 0 && model.calendar.workBetween(minOf(row.start), t) < row.changeover_min;
  return { state: changing ? "change" : "run", row };
}

const overlap = (a: number, b: number, c: number, d: number) => model.calendar.workBetween(Math.max(a, c), Math.min(b, d));

/** Unidades de una fila hechas hasta t (avance por tiempo de trabajo, después del cambio de color). */
export function unitsUntil(r: PlanScheduleRow, t: number): number {
  const a = minOf(r.start);
  const b = minOf(r.end);
  if (t <= a) return 0;
  if (t >= b) return r.quantity;
  const total = Math.max(1, model.calendar.workBetween(a, b) - r.changeover_min);
  const done = Math.max(0, model.calendar.workBetween(a, t) - r.changeover_min);
  return Math.floor((r.quantity * done) / total);
}

export interface Oee {
  /** Inicio del turno medido. */
  from: number;
  availability: number;
  performance: number;
  quality: number;
  oee: number;
  units: number;
  good: number;
  runH: number;
  changeH: number;
  downH: number;
  loadedH: number;
}

/** OEE del turno en curso (o del último turno trabajado si t cae fuera de turno). */
export function oeeAt(plan: ProductionPlan, events: PlantEvent[], id: string, t: number): Oee | null {
  let shift = inShift(t);
  let until = t;
  if (!shift) {
    // Fuera de turno: el último turno completo.
    for (let x = t - 1; x > t - 3 * 1440; x -= 30) {
      shift = inShift(x);
      if (shift) break;
    }
    if (!shift) return null;
    until = shift[1];
  }
  const from = shift[0];
  const rows = plan.schedule.filter((r) => r.equipment === id && minOf(r.end) > from && minOf(r.start) < until);
  const downs: [number, number][] = [
    ...plan.downtime.filter((d) => d.equipment === id).map((d) => [minOf(d.start), minOf(d.end)] as [number, number]),
    ...events.filter((e) => e.equipment === id).map((e) => [minOf(e.start), evEnd(e)] as [number, number]),
  ];
  const downMin = downs.reduce((s, [a, b]) => s + overlap(a, b, from, until), 0);
  let busy = 0;
  let change = 0;
  let units = 0;
  for (const r of rows) {
    const a = minOf(r.start);
    const b = minOf(r.end);
    busy += overlap(a, b, from, until);
    change += overlap(a, model.calendar.advance(a, r.changeover_min), from, until);
    units += unitsUntil(r, until) - unitsUntil(r, from);
  }
  // Las paradas dentro de una fila no son producción.
  const downInRows = rows.reduce((s, r) => s + downs.reduce((x, [a, b]) => x + overlap(Math.max(a, minOf(r.start)), Math.min(b, minOf(r.end)), from, until), 0), 0);
  const run = Math.max(0, busy - change - downInRows);
  const loaded = run + change + downMin;
  if (loaded <= 0) return null;
  const r = rng(`${model.plant}:oee:${id}:${isoOf(from).slice(0, 10)}`);
  const performance = 0.88 + r() * 0.09;
  const quality = 0.975 + r() * 0.021;
  const availability = run / loaded;
  const made = Math.round(units * performance);
  return {
    from,
    availability,
    performance,
    quality,
    oee: availability * performance * quality,
    units: made,
    good: Math.round(made * quality),
    runH: run / 60,
    changeH: change / 60,
    downH: downMin / 60,
    loadedH: loaded / 60,
  };
}

/** OEE de la planta: promedio ponderado por el tiempo cargado de cada máquina. */
export function plantOee(list: (Oee | null)[]): { oee: number; availability: number; performance: number; quality: number } | null {
  const ok = list.filter((x): x is Oee => !!x);
  const w = ok.reduce((s, x) => s + x.loadedH, 0);
  if (!w) return null;
  const avg = (k: "oee" | "availability" | "performance" | "quality") => ok.reduce((s, x) => s + x[k] * x.loadedH, 0) / w;
  return { oee: avg("oee"), availability: avg("availability"), performance: avg("performance"), quality: avg("quality") };
}

// ------------------------------------------------------------------ máquinas del plano

export interface PlantEq {
  id: string;
  name?: string;
  type: string;
  zone?: string;
  position: [number, number, number];
  footprint: [number, number, number];
  rotation?: number;
  params?: Record<string, unknown>;
}
export interface PlantZone {
  id: string;
  name: string;
  kind: string;
  rect: [number, number, number, number];
}
export const plantDoc = yaml.load(plantYaml) as { equipment: PlantEq[]; zones: PlantZone[] };
export const moldSetup = ((yaml.load(setupYaml) as { setup?: Record<string, { tooling: string; color?: string }> }).setup ?? {}) as Record<string, { tooling: string; color?: string }>;
/** Inyectoras y celdas de ensamble: las máquinas con PLC. */
export const PLC_MACHINES = plantDoc.equipment.filter((e) => e.type === "injection_molding_machine" || e.type === "assembly_cell");
export const machineLabel = (id: string) => id.replace("assembly-", "ENSAMBLE-").toUpperCase();

/** Molde montado ahora en la máquina: el del catálogo, salvo que una recomendación de Fractal adoptada lo cambió. */
export function moldOf(id: string): string | undefined {
  const m = molds();
  if (id in m) return m[id] ?? undefined;
  return moldSetup[id]?.tooling;
}
