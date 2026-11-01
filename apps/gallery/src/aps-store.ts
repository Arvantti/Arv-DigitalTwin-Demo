/**
 * Estado compartido del APS de plásticos entre pantallas del mismo navegador (APS, gemelo 3D y, después, emulador y
 * centro de control).
 *
 * El sitio publicado no tiene servidor: la cartera agregada y la programación vigente se guardan en localStorage y
 * cada cambio se avisa por BroadcastChannel, así dos ventanas abiertas se enteran al instante. Cuando exista la API en
 * Cloudflare, este módulo es el único que cambia.
 */
import type { CustomerOrder, CustomerOrders, PlantEvent, ProductionPlan } from "@twin/cosim/core/contracts.ts";
import { basePortfolio, baseManual, catalogData, plasticsModel } from "@twin/cosim/adapters/plastic-injection-plant-v1/catalog.ts";
import { modelFor } from "@twin/fractal-manufacturing/models/plastic-injection-plant-v1/study.ts";
import { manualPlan } from "@twin/cosim/adapters/plastic-injection-plant-v1/manual.ts";
import { plantNow, setDayZero, store } from "./schedule.ts";

export const PLASTICS = "plastic-injection-plant-v1";
export const model = plasticsModel();
export const SOURCE_NAMES: Record<string, string> = { manual: "MANUAL", solver: "COSIMULADOR", reference: "REFERENCIA", fractal: "FRACTAL" };

const key = (k: string) => `twin.aps.${PLASTICS}.${k}`;
const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(`twin.${PLASTICS}`);

function read<T>(k: string, fallback: T): T {
  try {
    const raw = store.get(key(k));
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Reloj de la demo: la cartera es fija, así que AHORA es siempre el mismo día de la cartera (DEMO_DAY, contado desde el
 * arranque = día 0) con la hora real del reloj. Así la presentación no depende de la fecha en que se haga.
 * ?now=AAAA-MM-DDTHH:MM fija el instante; ?live=1 usa el calendario real.
 */
export const DEMO_DAY = 9;
const DAY0 = basePortfolio.plan_start.slice(0, 10);
const DEMO_DATE = new Date(Date.parse(`${DAY0}T00:00:00Z`) + DEMO_DAY * 864e5).toISOString().slice(0, 10);

/** Las pantallas de plásticos muestran "día N" en vez de fechas de calendario. */
export function useDemoDays(): void {
  setDayZero(DAY0);
}

/** AHORA en hora de la planta; nunca antes del arranque de la cartera. */
export function now(): string {
  const params = typeof location === "undefined" ? new URLSearchParams() : new URLSearchParams(location.search);
  const real = plantNow(model.timezone);
  const t = params.has("now") || params.get("live") === "1" ? real : `${DEMO_DATE}T${real.slice(11, 16)}`;
  const start = basePortfolio.plan_start.slice(0, 16);
  return t < start ? start : t;
}

export function addedOrders(): CustomerOrder[] {
  return read<CustomerOrder[]>("added", []);
}

/** Cambios de la cartera que vienen de un estudio de Fractal adoptado (p. ej. un pedido adelantado). */
export function orderChanges(): NonNullable<ProductionPlan["order_changes"]> {
  return read<NonNullable<ProductionPlan["order_changes"]>>("order_changes", []);
}

export function portfolio(): CustomerOrders {
  const changes = new Map(orderChanges().map((c) => [c.order, c]));
  const orders = [...basePortfolio.orders, ...addedOrders()].map((o) => {
    const c = changes.get(o.id);
    return c ? { ...o, ...(c.due ? { due: c.due } : {}), ...(c.importance ? { importance: c.importance } : {}) } : o;
  });
  return { ...basePortfolio, orders };
}

/** Moldes cambiados por una recomendación de Fractal adoptada (máquina → molde, null = desmontado). */
export function molds(): Record<string, string | null> {
  return read<Record<string, string | null>>("molds", {});
}

/** Modelo de la planta con los moldes como están montados ahora (para CALCULAR y la secuencia manual). */
export function modelNow() {
  const m = molds();
  return Object.keys(m).length ? modelFor(catalogData(), m) : model;
}

export function setAdded(list: CustomerOrder[]): void {
  store.set(key("added"), JSON.stringify(list));
  channel?.postMessage({ type: "orders" });
}

/** La programación vigente; al arrancar es la secuencia manual del planificador (APS-MAN-01). */
export function vigente(): ProductionPlan {
  const saved = read<ProductionPlan | null>("vigente", null);
  if (saved && saved.portfolio_id === basePortfolio.portfolio_id && saved.contract === "production-plan.v1") return saved;
  return { ...manualPlan(model, portfolio(), baseManual), status: "vigente" };
}

export function setVigente(plan: ProductionPlan): void {
  if (plan.molds) store.set(key("molds"), JSON.stringify(plan.molds));
  if (plan.order_changes?.length) {
    const ids = new Set(plan.order_changes.map((c) => c.order));
    store.set(key("order_changes"), JSON.stringify([...orderChanges().filter((c) => !ids.has(c.order)), ...plan.order_changes]));
  }
  store.set(key("vigente"), JSON.stringify({ ...plan, status: "vigente" }));
  channel?.postMessage({ type: "plan" });
}

/** Eventos del emulador (fallas y paros), del más reciente al más viejo. */
export function events(): PlantEvent[] {
  return read<PlantEvent[]>("events", []);
}

/** Los que siguen fuera de servicio AHORA. */
export function activeEvents(): PlantEvent[] {
  const t = now();
  return events().filter((e) => !e.cleared && e.start.slice(0, 16) <= t);
}

export function setEvents(list: PlantEvent[]): void {
  store.set(key("events"), JSON.stringify(list));
  channel?.postMessage({ type: "events" });
}

/** Vuelve a la cartera, la programación y la planta iniciales de la demo. */
export function resetDemo(): void {
  store.set(key("added"), null);
  store.set(key("vigente"), null);
  store.set(key("events"), null);
  store.set(key("molds"), null);
  store.set(key("order_changes"), null);
  channel?.postMessage({ type: "plan" });
  channel?.postMessage({ type: "events" });
}

export type Change = "orders" | "plan" | "events";

/** Avisa cuando otra ventana cambia pedidos o programación. */
export function onChange(fn: (what: Change) => void): void {
  channel?.addEventListener("message", (e: MessageEvent<{ type: Change }>) => fn(e.data.type));
  addEventListener("storage", (e) => {
    if (e.key === key("added")) fn("orders");
    if (e.key === key("vigente")) fn("plan");
    if (e.key === key("events")) fn("events");
  });
}

export { baseManual, manualPlan };
