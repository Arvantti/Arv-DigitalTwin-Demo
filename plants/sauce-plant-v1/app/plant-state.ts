/**
 * La planta de salsas en un instante, sin DOM: lo que mandan los PLC de cada equipo al centro de control y lo que pinta
 * el emulador. Sale de la programación vigente y de los eventos del emulador (fallas y paros); no hay señales reales.
 *
 * - Estado de cada equipo: produciendo, en cambio o limpieza (CIP, alérgeno, receta, formato, boquillas, pulmón),
 *   sin orden, parada programada, fuera de servicio, detenido por otro equipo (la caldera da vapor a toda la línea
 *   caliente) o fuera de turno.
 * - Avance de la tanda o del llenado, valores de proceso (temperatura, vacío, velocidad) y OEE del turno.
 * - Ocupación de la semana: horas programadas sobre horas disponibles (turno menos paradas y fallas).
 *
 * Los tiempos son minutos locales de la planta (parseLocal de @twin/cosim-core).
 */
import { DAY_MIN, parseLocal, rng, type PlanScheduleRow, type PlantEvent, type ProductionPlan } from "@twin/cosim-core";
import type { SauceModel } from "@plants/sauce-plant-v1-cosim/model.ts";

export type EqState = "run" | "change" | "idle" | "plan" | "fault" | "blocked" | "off";

export const STATE_NAMES: Record<EqState, string> = {
  run: "PRODUCIENDO",
  change: "CAMBIO · LIMPIEZA",
  idle: "SIN ORDEN",
  plan: "PARADA PROGRAMADA",
  fault: "FUERA DE SERVICIO",
  blocked: "DETENIDO",
  off: "FUERA DE TURNO",
};
export const STATE_COLORS: Record<EqState, string> = { run: "#22e06b", change: "#b48cff", idle: "#8a93ad", plan: "#ffb000", fault: "#ff3b3b", blocked: "#ff8a3b", off: "#4a5276" };

/** Qué se está haciendo en un cambio (changeover_kind de la fila). */
export const CHANGE_NAMES: Record<string, string> = {
  cip: "Limpieza CIP",
  alergeno: "CIP por alérgeno",
  receta: "Cambio de receta",
  formato: "Cambio de formato",
  boquillas: "Limpieza de boquillas",
  tanque: "Lavado del pulmón",
};

export type EqRole = "proceso" | "apoyo" | "llenadora";

/** Equipo con PLC: el emulador lo dibuja y deja ponerlo en falla; el centro de control recibe sus señales. */
export interface PlcEquipment {
  id: string;
  name: string;
  role: EqRole;
  /** Línea de proceso a la que pertenece o a la que detiene si falla (vacío para las llenadoras). */
  line?: string;
  type: string;
  params: Record<string, unknown>;
}

interface LayoutEq {
  id: string;
  type?: string;
  name?: string;
  params?: Record<string, unknown>;
}

const TYPE_NAMES: Record<string, string> = {
  jacketed_kettle: "Marmita enchaquetada",
  tubular_heat_exchanger: "Pasteurizador tubular",
  fire_tube_boiler: "Caldera pirotubular",
  mixing_tank: "Tanque de mezcla",
  vacuum_emulsifier: "Emulsificador al vacío",
  colloid_mill: "Molino coloidal",
  stone_mill: "Molino de piedra",
  vffs_sachet: "Llenadora de sachet",
};

/**
 * Equipos con PLC, en el orden de la planta: cada línea con sus equipos de proceso y los que la detienen si fallan
 * (aps.yaml, lines.down_with), y después las llenadoras.
 */
export function plcEquipment(model: SauceModel, layout: LayoutEq[]): PlcEquipment[] {
  const byId = Object.fromEntries(layout.map((e) => [e.id, e]));
  const make = (id: string, role: EqRole, line?: string): PlcEquipment => {
    const e = byId[id] ?? { id };
    return { id, name: e.name ?? TYPE_NAMES[e.type ?? ""] ?? id, role, ...(line ? { line } : {}), type: e.type ?? "", params: e.params ?? {} };
  };
  const out: PlcEquipment[] = [];
  for (const l of Object.values(model.lines)) {
    for (const id of l.equipment) out.push(make(id, "proceso", l.id));
    for (const id of l.downWith) out.push(make(id, "apoyo", l.id));
  }
  for (const id of model.fillers) out.push(make(id, "llenadora"));
  return out;
}

const evEnd = (e: PlantEvent) => parseLocal(e.cleared ?? e.est_end);

/** Fallas o paros vigentes en el instante t. */
export const eventsAt = (events: PlantEvent[], t: number) => events.filter((e) => parseLocal(e.start) <= t && t < evEnd(e));

/** ¿t cae dentro de un turno? Devuelve el turno [inicio, fin]. */
export function shiftAt(model: SauceModel, t: number): [number, number] | null {
  const d = Math.floor(t / DAY_MIN) * DAY_MIN;
  if (!model.calendar.isWorkday(d)) return null;
  const s = model.calendar.spans.find(([a, b]) => t >= d + a && t < d + b);
  return s ? [d + s[0], d + s[1]] : null;
}

/** Filas de la programación que corren en el equipo (las de la línea en sus marmitas; los equipos de apoyo, las de toda su línea). */
function rowsOf(model: SauceModel, plan: ProductionPlan, eq: PlcEquipment): PlanScheduleRow[] {
  if (eq.role === "apoyo") {
    const l = model.lines[eq.line!];
    return plan.schedule.filter((r) => l.equipment.includes(r.equipment));
  }
  return plan.schedule.filter((r) => r.equipment === eq.id);
}

/** Paradas de la programación del equipo: las de su línea se anotan en el primer equipo de la línea. */
function plannedDowns(model: SauceModel, plan: ProductionPlan, eq: PlcEquipment): [number, number, string][] {
  const key = eq.line ? model.lines[eq.line].equipment[0] : eq.id;
  return plan.downtime.filter((d) => d.equipment === key && !/^(Falla|Paro de emergencia)/.test(d.reason)).map((d) => [parseLocal(d.start), parseLocal(d.end), d.reason]);
}

/** Fallas que detienen al equipo: la suya y, si está en una línea, la de cualquier equipo de la línea o de los que la detienen. */
function stoppers(model: SauceModel, events: PlantEvent[], eq: PlcEquipment): PlantEvent[] {
  const l = eq.line ? model.lines[eq.line] : undefined;
  const ids = l ? [...l.equipment, ...l.downWith] : [eq.id];
  return events.filter((e) => ids.includes(e.equipment));
}

export interface EqNow {
  state: EqState;
  row?: PlanScheduleRow;
  /** La falla del equipo, o la del que lo detiene. */
  ev?: PlantEvent;
  why?: string;
  /** En un cambio: qué se hace y hasta cuándo. */
  change?: { kind: string; until: number };
}

export function equipmentAt(model: SauceModel, plan: ProductionPlan, events: PlantEvent[], eq: PlcEquipment, t: number): EqNow {
  const active = eventsAt(events, t);
  const own = active.find((e) => e.equipment === eq.id);
  if (own) return { state: "fault", ev: own };
  const other = eventsAt(stoppers(model, events, eq), t)[0];
  if (other && eq.role !== "llenadora") return { state: "blocked", ev: other, why: `${other.equipment} fuera de servicio` };
  if (!shiftAt(model, t)) return { state: "off" };
  const down = plannedDowns(model, plan, eq).find(([a, b]) => a <= t && t < b);
  if (down) return { state: "plan", why: down[2] };
  const row = rowsOf(model, plan, eq).find((r) => parseLocal(r.start) <= t && t < parseLocal(r.end));
  if (!row) return { state: "idle" };
  const until = model.calendar.advance(parseLocal(row.start), row.changeover_min);
  if (row.changeover_min > 0 && t < until && eq.role !== "apoyo") return { state: "change", row, change: { kind: row.changeover_kind ?? "cip", until } };
  return { state: "run", row };
}

/** Fracción hecha de la fila en t (sin el cambio del comienzo; el trabajo corre solo en turno). */
export function progressOf(model: SauceModel, r: PlanScheduleRow, t: number): number {
  const a = model.calendar.advance(parseLocal(r.start), r.changeover_min);
  const b = parseLocal(r.end);
  if (t <= a) return 0;
  if (t >= b) return 1;
  const total = model.calendar.workBetween(a, b);
  return total > 0 ? Math.min(1, model.calendar.workBetween(a, t) / total) : 1;
}

/** Cantidad hecha (kg de la tanda o unidades del llenado) en t. */
export const doneOf = (model: SauceModel, r: PlanScheduleRow, t: number) => Math.floor(r.quantity * progressOf(model, r, t));

export interface Signal {
  key: string;
  label: string;
  value: number;
  unit: string;
  digits?: number;
}

/**
 * Valores de proceso que manda el PLC: supuestos coherentes con la receta (plant.yaml), con un poco de ruido
 * reproducible por equipo, minuto y `tick` (las pantallas pasan un contador que sube cada pocos segundos) para que se
 * vean vivos.
 */
export function signals(model: SauceModel, eq: PlcEquipment, now: EqNow, t: number, tick = 0): Signal[] {
  const r = rng(`${model.plant}:plc:${eq.id}:${Math.floor(t)}:${tick}`);
  const n = (base: number, spread: number) => base + (r() - 0.5) * 2 * spread;
  const on = now.state === "run";
  const k = now.row ? progressOf(model, now.row, t) : 0;
  const p = eq.params;
  switch (eq.type) {
    case "jacketed_kettle": {
      // Calienta en el primer 40 % de la tanda y sostiene la cocción a 88 °C; en cambio, agua caliente del CIP.
      const temp = on ? 25 + (88 - 25) * Math.min(1, k / 0.4) : now.state === "change" ? 75 : 30;
      return [
        { key: "temperature", label: "Temperatura", value: n(temp, on ? 0.6 : 0.3), unit: "°C", digits: 1 },
        { key: "level", label: "Nivel", value: on ? n(92, 1) : now.state === "change" ? 35 : 0, unit: "%" },
        { key: "agitator", label: "Agitador", value: on ? n(42, 1.5) : 0, unit: "rpm" },
      ];
    }
    case "tubular_heat_exchanger":
      return [
        { key: "out", label: "Salida de producto", value: on ? n(92, 0.4) : 28, unit: "°C", digits: 1 },
        { key: "hold", label: "Tubo de sostenimiento", value: on ? n(90, 0.4) : 27, unit: "°C", digits: 1 },
      ];
    case "fire_tube_boiler":
      return [
        { key: "steam", label: "Presión de vapor", value: on ? n(Number(p.pressure_bar ?? 8), 0.15) : now.state === "fault" ? 0 : n(6, 0.1), unit: "bar", digits: 1 },
        { key: "firing", label: "Llama", value: on ? n(68, 4) : now.state === "fault" ? 0 : 20, unit: "%" },
      ];
    case "vacuum_emulsifier":
      return [
        { key: "vacuum", label: "Vacío", value: on ? n(Number(p.vacuum_bar ?? -0.8), 0.02) : 0, unit: "bar", digits: 2 },
        { key: "rotor", label: "Rotor", value: on ? n(2800, 40) : 0, unit: "rpm" },
        { key: "temperature", label: "Temperatura", value: n(on ? 12 : 16, 0.3), unit: "°C", digits: 1 },
      ];
    case "mixing_tank":
      return [
        { key: "level", label: "Nivel", value: on ? n(80, 2) : 0, unit: "%" },
        { key: "agitator", label: "Agitador", value: on ? n(eq.id.includes("mustard") ? 1450 : 180, 10) : 0, unit: "rpm" },
      ];
    case "colloid_mill":
    case "stone_mill":
      return [{ key: "current", label: "Corriente del motor", value: on ? n(eq.type === "colloid_mill" ? 24 : 16, 0.8) : 0, unit: "A", digits: 1 }];
    case "vffs_sachet": {
      const rate = model.fillerRate[eq.id] ?? Number(p.units_min ?? 0);
      const hot = p.hot_fill_min_c !== undefined;
      return [
        { key: "speed", label: "Velocidad", value: on ? n(rate * 0.95, rate * 0.02) : 0, unit: "u/min" },
        { key: "seal", label: "Mordaza de sellado", value: on ? n(150, 1.2) : 40, unit: "°C" },
        ...(hot ? [{ key: "product", label: "Producto (llenado en caliente)", value: on ? n(87, 0.5) : 30, unit: "°C", digits: 1 }] : []),
      ];
    }
    default:
      return [];
  }
}

export interface Oee {
  from: number;
  availability: number;
  performance: number;
  quality: number;
  oee: number;
  /** Lo hecho en el turno (kg o unidades) y lo bueno. */
  made: number;
  good: number;
  unit: string;
  runH: number;
  changeH: number;
  downH: number;
  loadedH: number;
}

/** Calidad supuesta: 1 % de rechazo (igual que en plásticos). */
export const QUALITY = 0.99;

const overlap = (a: number, b: number, x: number, y: number) => Math.max(0, Math.min(b, y) - Math.max(a, x));

/** Minutos fuera de servicio del equipo: fallas (suyas o de su línea) y paradas de la programación. */
function downsOf(model: SauceModel, plan: ProductionPlan, events: PlantEvent[], eq: PlcEquipment): [number, number][] {
  const ev = (eq.role === "llenadora" ? events.filter((e) => e.equipment === eq.id) : stoppers(model, events, eq)).map((e) => [parseLocal(e.start), evEnd(e)] as [number, number]);
  return [...ev, ...plannedDowns(model, plan, eq).map(([a, b]) => [a, b] as [number, number])];
}

/** OEE del turno en curso hasta t (fuera de turno, el último turno completo). Null si el equipo no tuvo carga. */
export function oeeAt(model: SauceModel, plan: ProductionPlan, events: PlantEvent[], eq: PlcEquipment, t: number): Oee | null {
  let shift = shiftAt(model, t);
  let until = t;
  if (!shift) {
    for (let x = t - 1; x > t - 3 * DAY_MIN && !shift; x -= 30) shift = shiftAt(model, x);
    if (!shift) return null;
    until = shift[1];
  }
  const from = shift[0];
  const rows = rowsOf(model, plan, eq).filter((r) => parseLocal(r.end) > from && parseLocal(r.start) < until);
  const downs = downsOf(model, plan, events, eq);
  const downMin = downs.reduce((s, [a, b]) => s + overlap(a, b, from, until), 0);
  let busy = 0;
  let change = 0;
  let made = 0;
  for (const r of rows) {
    const a = parseLocal(r.start);
    const b = parseLocal(r.end);
    busy += overlap(a, b, from, until);
    change += overlap(a, model.calendar.advance(a, r.changeover_min), from, until);
    made += r.quantity * (progressOf(model, r, until) - progressOf(model, r, from));
  }
  const downInRows = rows.reduce((s, r) => s + downs.reduce((x, [a, b]) => x + overlap(Math.max(a, parseLocal(r.start)), Math.min(b, parseLocal(r.end)), from, until), 0), 0);
  const run = Math.max(0, busy - change - downInRows);
  const loaded = run + change + downMin;
  if (loaded <= 0) return null;
  const g = rng(`${model.plant}:oee:${eq.id}:${from}`);
  const performance = 0.88 + g() * 0.09;
  const out = Math.round(made * performance);
  return {
    from,
    availability: run / loaded,
    performance,
    quality: QUALITY,
    oee: (run / loaded) * performance * QUALITY,
    made: out,
    good: Math.round(out * QUALITY),
    unit: rows[0]?.unit ?? (eq.role === "llenadora" ? "u" : "kg"),
    runH: run / 60,
    changeH: change / 60,
    downH: downMin / 60,
    loadedH: loaded / 60,
  };
}

/** OEE de la planta: promedio ponderado por el tiempo cargado de cada equipo. */
export function plantOee(list: (Oee | null)[]): { oee: number; availability: number; performance: number; quality: number } | null {
  const ok = list.filter((x): x is Oee => !!x);
  const w = ok.reduce((s, x) => s + x.loadedH, 0);
  if (!w) return null;
  const avg = (k: "oee" | "availability" | "performance" | "quality") => ok.reduce((s, x) => s + x[k] * x.loadedH, 0) / w;
  return { oee: avg("oee"), availability: avg("availability"), performance: avg("performance"), quality: avg("quality") };
}

export interface Load {
  from: number;
  to: number;
  busyH: number;
  availH: number;
  shiftH: number;
  /** Horas programadas sobre horas disponibles. */
  occupancy: number;
  /** Horas disponibles sobre horas de turno. */
  availability: number;
}

/** Ocupación del equipo entre a y b; con `order`, solo cuentan las horas de ese pedido. */
export function loadIn(model: SauceModel, plan: ProductionPlan, events: PlantEvent[], eq: PlcEquipment, a: number, b: number, order?: string): Load {
  const cal = model.calendar;
  const shift = cal.workBetween(a, b);
  const downs = downsOf(model, plan, events, eq);
  const down = downs.reduce((s, [x, y]) => s + cal.workBetween(Math.max(a, x), Math.min(b, y)), 0);
  const avail = Math.max(0, shift - down);
  const rows = (eq.role === "apoyo" ? [] : rowsOf(model, plan, eq)).filter((r) => !order || r.order === order);
  const busy = rows.reduce((s, r) => s + cal.workBetween(Math.max(a, parseLocal(r.start)), Math.min(b, parseLocal(r.end))), 0);
  return { from: a, to: b, busyH: busy / 60, availH: avail / 60, shiftH: shift / 60, occupancy: avail ? busy / avail : 0, availability: shift ? avail / shift : 0 };
}

/** Ocupación de la semana que empieza el día de t. */
export const weekLoad = (model: SauceModel, plan: ProductionPlan, events: PlantEvent[], eq: PlcEquipment, t: number, order?: string) => {
  const d = Math.floor(t / DAY_MIN) * DAY_MIN;
  return loadIn(model, plan, events, eq, d, d + 7 * DAY_MIN, order);
};

/** Ocupación por día laborable de la semana que empieza el día de t. */
export function dayLoads(model: SauceModel, plan: ProductionPlan, events: PlantEvent[], eq: PlcEquipment, t: number, order?: string): Load[] {
  const d0 = Math.floor(t / DAY_MIN) * DAY_MIN;
  const out: Load[] = [];
  for (let d = d0; d < d0 + 7 * DAY_MIN; d += DAY_MIN) if (model.calendar.isWorkday(d)) out.push(loadIn(model, plan, events, eq, d, d + DAY_MIN, order));
  return out;
}

/** Color de la ocupación: verde con holgura, amarillo cargado, rojo saturado. */
export const loadColor = (x: number) => (x >= 0.9 ? "#ff3b3b" : x >= 0.75 ? "#ffb000" : "#22e06b");
