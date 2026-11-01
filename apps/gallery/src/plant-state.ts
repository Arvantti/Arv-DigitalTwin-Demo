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

/** Paradas programadas y fallas de una máquina, unidas: una falla que la programación ya trae como parada cuenta una vez. */
function downsOf(plan: ProductionPlan, events: PlantEvent[], id: string): [number, number][] {
  const list: [number, number][] = [
    ...plan.downtime.filter((d) => d.equipment === id).map((d) => [minOf(d.start), minOf(d.end)] as [number, number]),
    ...events.filter((e) => e.equipment === id).map((e) => [minOf(e.start), evEnd(e)] as [number, number]),
  ].sort((x, y) => x[0] - y[0]);
  const out: [number, number][] = [];
  for (const [a, b] of list) {
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

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
  const downs = downsOf(plan, events, id);
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

// ------------------------------------------------------------------ ocupación vs disponibilidad

export interface Load {
  /** Ventana medida. */
  from: number;
  to: number;
  /** Horas de turno en la ventana. */
  shiftH: number;
  /** Horas de turno menos paradas programadas y fallas. */
  availH: number;
  /** Horas con orden programada (incluye cambios de color), sin las paradas. Con filtro, solo las de esa orden. */
  busyH: number;
  /** Disponibilidad = disponibles / turno. */
  availability: number;
  /** Ocupación = programadas / disponibles. */
  occupancy: number;
}

/** Ocupación de la máquina contra su disponibilidad en la ventana de entrega (una semana desde el día del instante). */
export function loadAt(plan: ProductionPlan, events: PlantEvent[], id: string, t: number, days = 7, order?: string): Load {
  const from = Math.floor(t / 1440) * 1440;
  return loadIn(plan, events, id, from, from + days * 1440, order);
}

/** Ocupación por día en la semana que empieza el día del instante (solo días laborables). */
export function dayLoads(plan: ProductionPlan, events: PlantEvent[], id: string, t: number, days = 7, order?: string): Load[] {
  const start = Math.floor(t / 1440) * 1440;
  const out: Load[] = [];
  for (let d = start; d < start + days * 1440; d += 1440) if (model.calendar.isWorkday(d)) out.push(loadIn(plan, events, id, d, d + 1440, order));
  return out;
}

/** Día de t (o el siguiente laborable si t cae en un día sin turnos). */
export function dayLoadAt(plan: ProductionPlan, events: PlantEvent[], id: string, t: number, order?: string): Load | undefined {
  return dayLoads(plan, events, id, t, 3, order)[0];
}

/** Ocupación contra disponibilidad entre dos instantes; con `order`, solo cuentan las horas de esa orden. */
export function loadIn(plan: ProductionPlan, events: PlantEvent[], id: string, from: number, to: number, order?: string): Load {
  const shift = model.calendar.workBetween(from, to);
  const downs = downsOf(plan, events, id);
  const down = Math.min(shift, downs.reduce((s, [a, b]) => s + overlap(a, b, from, to), 0));
  const rows = plan.schedule.filter((r) => r.equipment === id && (!order || r.order === order) && minOf(r.end) > from && minOf(r.start) < to);
  let busy = 0;
  for (const r of rows) {
    const a = minOf(r.start);
    const b = minOf(r.end);
    busy += overlap(a, b, from, to);
    busy -= downs.reduce((x, [c, d]) => x + overlap(Math.max(a, c), Math.min(b, d), from, to), 0);
  }
  const avail = Math.max(0, shift - down);
  busy = Math.max(0, Math.min(busy, avail));
  return {
    from,
    to,
    shiftH: shift / 60,
    availH: avail / 60,
    busyH: busy / 60,
    availability: shift ? avail / shift : 0,
    occupancy: avail ? busy / avail : 0,
  };
}

/** Color de la ocupación: baja (gris), sana (verde), alta (ámbar), saturada (rojo). */
export const loadColor = (x: number) => (x >= 0.95 ? "#ff3b3b" : x >= 0.85 ? "#ffb000" : x >= 0.3 ? "#22e06b" : "#8a93ad");

const WD = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

/**
 * Tira de la semana por día: una barra por día con la disponibilidad (fondo gris) y la ocupación encima (color).
 * El día que contiene t queda marcado.
 */
export function dayStrip(list: Load[], t: number): string {
  const cells = list.map((x) => {
    const occ = Math.round(x.occupancy * 100);
    const av = Math.round(x.availability * 100);
    const date = new Date(x.from * 60000);
    const now = t >= x.from && t < x.to ? " now" : "";
    return `<div class="ss-day${now}" title="${WD[date.getUTCDay()]} ${date.getUTCDate()}: ocupación ${occ} % (${x.busyH.toFixed(1)} de ${x.availH.toFixed(1)} h) · disponibilidad ${av} %"><span class="ss-cell"><i class="av" style="height:${av}%"></i><i class="oc" style="height:${(av * Math.min(1, x.occupancy)).toFixed(0)}%;background:${loadColor(x.occupancy)}"></i></span><b>${occ}</b><small>${WD[date.getUTCDay()]} ${date.getUTCDate()}</small></div>`;
  });
  return `<div class="shift-strip">${cells.join("")}</div>`;
}
