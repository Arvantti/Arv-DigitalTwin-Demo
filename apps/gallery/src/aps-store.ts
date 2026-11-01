/**
 * Estado compartido del APS de plásticos entre pantallas del mismo navegador (APS, gemelo 3D y, después, emulador y
 * centro de control).
 *
 * El sitio publicado no tiene servidor: la cartera agregada y la programación vigente se guardan en localStorage y
 * cada cambio se avisa por BroadcastChannel, así dos ventanas abiertas se enteran al instante. Cuando exista la API en
 * Cloudflare, este módulo es el único que cambia.
 */
import type { CustomerOrder, CustomerOrders, ProductionPlan } from "@twin/cosim/core/contracts.ts";
import { basePortfolio, baseManual, plasticsModel } from "@twin/cosim/adapters/plastic-injection-plant-v1/catalog.ts";
import { manualPlan } from "@twin/cosim/adapters/plastic-injection-plant-v1/manual.ts";
import { plantNow, store } from "./schedule.ts";

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

/** AHORA en hora de la planta (con ?now= para presentaciones); nunca antes del arranque de la cartera. */
export function now(): string {
  const t = plantNow(model.timezone);
  const start = basePortfolio.plan_start.slice(0, 16);
  return t < start ? start : t;
}

export function addedOrders(): CustomerOrder[] {
  return read<CustomerOrder[]>("added", []);
}

export function portfolio(): CustomerOrders {
  return { ...basePortfolio, orders: [...basePortfolio.orders, ...addedOrders()] };
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
  store.set(key("vigente"), JSON.stringify({ ...plan, status: "vigente" }));
  channel?.postMessage({ type: "plan" });
}

/** Vuelve a la cartera y la programación iniciales de la demo. */
export function resetDemo(): void {
  store.set(key("added"), null);
  store.set(key("vigente"), null);
  channel?.postMessage({ type: "plan" });
}

/** Avisa cuando otra ventana cambia pedidos o programación. */
export function onChange(fn: (what: "orders" | "plan") => void): void {
  channel?.addEventListener("message", (e: MessageEvent<{ type: "orders" | "plan" }>) => fn(e.data.type));
  addEventListener("storage", (e) => {
    if (e.key === key("added")) fn("orders");
    if (e.key === key("vigente")) fn("plan");
  });
}

export { baseManual, manualPlan };
