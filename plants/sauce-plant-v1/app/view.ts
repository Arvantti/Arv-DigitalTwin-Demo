/**
 * Lo que muestra el APS de salsas, sin DOM: estado de cada pedido frente a AHORA, filas del Gantt (líneas de proceso y
 * llenadoras) y la comparación de indicadores entre dos programaciones. Las pruebas lo cubren; aps.ts solo lo pinta.
 */
import { DAY_MIN, parseLocal, type PlanOrderRow, type ProductionPlan } from "@twin/cosim-core";
import type { SauceModel } from "@plants/sauce-plant-v1-cosim/model.ts";

/** AHORA de la demo: día 9, miércoles 4 de noviembre de 2026 a las 10:00 (día 0 = lunes 26 de octubre). */
export const DEMO_NOW = "2026-11-04T10:00-05:00";

/** Color de cada granel (la barra de la tanda y la de sus llenados). */
export const BULK_COLOR: Record<string, string> = { "salsa-tomate": "#ff6b57", mayonesa: "#f2dc8c", "mostaza-granel": "#e0a526" };

const WEEKDAY = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MONTH = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** Día N de la demo contado desde el inicio del plan. */
export const dayNumber = (t: number, start: number) => Math.floor(t / DAY_MIN) - Math.floor(start / DAY_MIN);

/** "día 9 · mié 4 nov". */
export function dayLabel(t: number, start: number): string {
  const d = new Date(Math.floor(t / DAY_MIN) * DAY_MIN * 60000);
  return `día ${dayNumber(t, start)} · ${WEEKDAY[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH[d.getUTCMonth()]}`;
}

/** "mié 4 nov 10:00". */
export function when(text: string): string {
  const t = parseLocal(text);
  const d = new Date(t * 60000);
  return `${WEEKDAY[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH[d.getUTCMonth()]} ${text.slice(11, 16)}`;
}

export type OrderState = "hecho" | "en curso" | "por hacer";

/** Dónde va un pedido en AHORA: terminado, llenándose o por hacer. */
export function orderState(o: PlanOrderRow, now: number): OrderState {
  if (parseLocal(o.completion) <= now) return "hecho";
  if (parseLocal(o.start) <= now) return "en curso";
  return "por hacer";
}

export interface Bar {
  start: number;
  end: number;
  /** Minutos del comienzo que son cambio (CIP, alérgeno o formato). */
  changeoverMin: number;
  changeoverKind?: string;
  color: string;
  text: string;
  title: string;
  order: string;
  late: boolean;
}

export interface Lane {
  id: string;
  label: string;
  sub: string;
  bars: Bar[];
  down: { start: number; end: number; reason: string }[];
}

export interface Section {
  title: string;
  lanes: Lane[];
}

/** "TND-SALSA-TOMATE-061" → "T061" (cabe en la barra de una tanda). */
export const shortBatch = (id?: string) => {
  const m = id?.match(/^TND-(.+)-(\d+)$/);
  return m ? `${{ "SALSA-TOMATE": "T", MAYONESA: "MY", MOSTAZA: "MS" }[m[1]] ?? m[1]}${m[2]}` : id;
};

const kindLabel: Record<string, string> = { cip: "CIP", alergeno: "CIP por alérgeno", formato: "cambio de formato" };

/** Filas del Gantt: una por equipo de proceso (tandas) y una por llenadora (llenados con su cambio al comienzo). */
export function ganttSections(model: SauceModel, plan: ProductionPlan, params: Record<string, Record<string, unknown> | undefined> = {}): Section[] {
  const late = new Set(plan.orders.filter((o) => o.late_h > 0).map((o) => o.id));
  const downOf = (id: string) => plan.downtime.filter((d) => d.equipment === id).map((d) => ({ start: parseLocal(d.start), end: parseLocal(d.end), reason: d.reason }));
  const rows = (id: string) => plan.schedule.filter((r) => r.equipment === id);
  const process: Lane[] = Object.values(model.lines).flatMap((line) =>
    line.equipment.map((eq, i) => ({
      id: eq,
      label: eq,
      sub: `${line.bulk.replace(/-granel$/, "")} · ${line.stage} · tanda ${Math.round(line.batchMin)} min`,
      bars: rows(eq).map((r) => ({
        start: parseLocal(r.start),
        end: parseLocal(r.end),
        changeoverMin: 0,
        color: BULK_COLOR[line.bulk] ?? "#9ab",
        text: shortBatch(r.batch_id) ?? r.order,
        title: `${r.batch_id} · ${r.quantity} kg de ${line.bulk} · ${when(r.start)} a ${when(r.end)} · abre con ${r.order}`,
        order: r.order,
        late: false,
      })),
      // Las paradas de la línea se publican en su primer equipo; se muestran en todos porque la línea entera se detiene.
      down: i === 0 ? downOf(eq) : downOf(line.equipment[0]),
    })),
  );
  const fillers: Lane[] = model.fillers.map((m) => {
    const p = params[m] ?? {};
    return {
      id: m,
      label: m,
      sub: [p.format, p.units_min ? `${p.units_min} u/min` : "", typeof p.note === "string" ? p.note : p.product].filter(Boolean).join(" · "),
      bars: rows(m).map((r) => {
        const sku = model.products[r.product];
        const co = r.changeover_min ? ` · ${r.changeover_min} min de ${kindLabel[r.changeover_kind ?? ""] ?? "cambio"} al comienzo` : "";
        return {
          start: parseLocal(r.start),
          end: parseLocal(r.end),
          changeoverMin: r.changeover_min,
          ...(r.changeover_kind ? { changeoverKind: r.changeover_kind } : {}),
          color: BULK_COLOR[sku?.bulk ?? ""] ?? "#9ab",
          text: `${r.order.replace(/^PED-/, "")} · ${r.product}`,
          title: `${r.op} · ${r.order} · ${r.quantity.toLocaleString("es-CO")} u de ${sku?.name ?? r.product} · ${when(r.start)} a ${when(r.end)}${co} · granel ${r.batch_id}`,
          order: r.order,
          late: late.has(r.order),
        };
      }),
      down: downOf(m),
    };
  });
  return [
    { title: "LÍNEAS DE PROCESO · TANDAS", lanes: process },
    { title: "LLENADORAS · LLENADO Y CAMBIOS", lanes: fillers },
  ];
}

export interface KpiDelta {
  key: string;
  label: string;
  unit: string;
  before: number;
  after: number;
  /** Menor es mejor en todos: true si `after` mejora a `before`. */
  better: boolean;
  worse: boolean;
}

/** Los indicadores que se comparan entre la programación vigente y la propuesta (menor es mejor). */
export function compareKpis(before: ProductionPlan, after: ProductionPlan): KpiDelta[] {
  const pick: [keyof ProductionPlan["kpis"], string, string][] = [
    ["late_orders", "Pedidos tarde", ""],
    ["tardiness_h", "Atraso total", "h"],
    ["changeovers", "Cambios en llenadoras", ""],
    ["cip_h", "Horas de CIP", "h"],
    ["waste_kg", "Merma de granel", "kg"],
  ];
  return pick.map(([key, label, unit]) => {
    const b = Number(before.kpis[key] ?? 0);
    const a = Number(after.kpis[key] ?? 0);
    return { key, label, unit, before: b, after: a, better: a < b, worse: a > b };
  });
}

/** Puntaje de la planta (aps.yaml, score): menor es mejor. Es el mismo con el que Fractal compara escenarios. */
export function score(model: SauceModel, plan: ProductionPlan): number {
  const k = plan.kpis;
  const w = model.score;
  const formatH = Math.max(0, k.changeover_h - (k.cip_h ?? 0));
  const s = (w.tardiness_h ?? 0) * k.tardiness_h + (w.late_orders ?? 0) * k.late_orders + (w.cip_h ?? 0) * (k.cip_h ?? 0) + (w.format_change_h ?? 0) * formatH + (w.waste_kg ?? 0) * (k.waste_kg ?? 0);
  return Math.round(s * 10) / 10;
}
