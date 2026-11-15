/**
 * Estado compartido de la planta de salsas entre sus pantallas del mismo navegador: APS, emulador y centro de control
 * (y el gemelo 3D en la fase 7).
 *
 * El sitio publicado no tiene servidor: la programación vigente, los eventos del emulador y el reloj del gemelo se
 * guardan en localStorage y cada cambio se avisa por BroadcastChannel, así dos ventanas abiertas se enteran al instante.
 * Si el navegador no deja guardar (ventana privada, vista previa), cada pantalla sigue funcionando sola.
 */
import { parseLocal, type CustomerOrder, type PlantEvent, type ProductionPlan } from "@twin/cosim-core";
import { DEMO_NOW } from "./view.ts";

export const SAUCE = "sauce-plant-v1";
const key = (k: string) => `twin.aps.${SAUCE}.${k}`;
const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(`twin.${SAUCE}`);

export type Change = "plan" | "events" | "clock" | "config";

function read<T>(k: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key(k));
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(k: string, value: unknown, what: Change): void {
  try {
    if (value === null) localStorage.removeItem(key(k));
    else localStorage.setItem(key(k), JSON.stringify(value));
  } catch {
    // Sin almacenamiento: el cambio queda solo en esta pantalla.
  }
  channel?.postMessage({ type: what });
}

/** AHORA de la planta: ?now=AAAA-MM-DDTHH:MM o el de la demo (día 9, 10:00). */
export function demoNow(tz = "-05:00"): string {
  const q = typeof location === "undefined" ? null : new URLSearchParams(location.search).get("now");
  return q ? `${q.slice(0, 16)}${tz}` : DEMO_NOW;
}

/** Programación vigente adoptada en el APS, si es de esta cartera; si no, null (vale la manual). */
export function savedVigente(portfolioId: string): ProductionPlan | null {
  const p = read<ProductionPlan | null>("vigente", null);
  return p && p.contract === "production-plan.v1" && p.portfolio_id === portfolioId ? p : null;
}

/** Adopta una programación; null vuelve a la manual del planificador. */
export function setVigente(plan: ProductionPlan | null): void {
  write("vigente", plan ? { ...plan, status: "vigente" } : null, "plan");
}

/** Pedidos fijados en el Gantt: CALCULAR y Fractal los dejan donde están en la vigente. */
export function fixedOrders(): string[] {
  return read<string[]>("fixed", []);
}

export function setFixedOrders(list: string[]): void {
  write("fixed", list.length ? list : null, "plan");
}

/** Eventos del emulador (fallas y paros), del más reciente al más viejo. */
export function events(): PlantEvent[] {
  return read<PlantEvent[]>("events", []);
}

export function setEvents(list: PlantEvent[]): void {
  write("events", list.length ? list : null, "events");
}

/** Los que siguen fuera de servicio en t (minutos locales). */
export function activeEvents(t: number, list = events()): PlantEvent[] {
  return list.filter((e) => parseLocal(e.start) <= t && t < parseLocal(e.cleared ?? e.est_end));
}

/**
 * Reloj del gemelo 3D: el instante que muestran emulador y centro de control mientras el play corre o se arrastra la
 * barra de tiempo; null = AHORA.
 */
export function sharedClock(): string | null {
  return read<string | null>("clock", null);
}

export function setSharedClock(at: string | null): void {
  write("clock", at, "clock");
}

/** El instante que muestran emulador y centro de control. */
export const shownNow = (tz = "-05:00") => sharedClock() ?? demoNow(tz);

/** Vuelve a la planta inicial de la demo: plan manual, sin fallas, reloj en AHORA. */
export function resetDemo(): void {
  write("vigente", null, "plan");
  write("fixed", null, "plan");
  write("events", null, "events");
  write("clock", null, "clock");
  write("config", null, "config");
}

/** Avisa cuando otra pantalla cambia la programación, los eventos o el reloj. */
export function onChange(fn: (what: Change) => void): void {
  channel?.addEventListener("message", (e: MessageEvent<{ type: Change }>) => fn(e.data.type));
  addEventListener("storage", (e) => {
    if (e.key === key("vigente")) fn("plan");
    if (e.key === key("events")) fn("events");
    if (e.key === key("clock")) fn("clock");
    if (e.key === key("config")) fn("config");
  });
}

// ------------------------------------------------------------------ configuración de la planta (pantalla CONFIGURACIÓN)

/**
 * Configuración de los datos de la planta que usa el APS: la cartera de pedidos, los productos (SKU) con sus
 * llenadoras y la secuencia del planificador. La precargada (catálogo y cartera de la demo) no se guarda: es la que vale
 * cuando no hay otra activa. Cada versión guardada es una foto completa de la configuración, sin historial de cambios.
 */
export interface SauceConfig {
  contract: "sauce-config.v1";
  id: string;
  name: string;
  saved_at: string;
  orders: CustomerOrder[];
  /** SKU nuevos: copia de un SKU existente (receta, formato, lote) con otro nombre. */
  new_products: { id: string; name: string; base: string }[];
  /** SKU quitados del catálogo (sin pedidos). */
  removed_products: string[];
  /** Llenadoras asignadas a cada SKU, en orden de preferencia; reemplaza la ruta y las multipropósito. */
  fillers: Record<string, string[]>;
  /** Pedidos de cada llenadora en el orden del planificador. */
  sequence: Record<string, string[]>;
  /** El planificador ordenó a mano: se respeta el orden de cada llenadora (si no, va por llegada). */
  keep_order: boolean;
}

/** Versiones guardadas, de la más reciente a la más vieja. */
export function configVersions(): SauceConfig[] {
  return read<SauceConfig[]>("configs", []).filter((c) => c?.contract === "sauce-config.v1");
}

/** Guarda (o reemplaza, si ya existe el id) una versión. */
export function saveConfigVersion(cfg: SauceConfig): void {
  write("configs", [cfg, ...configVersions().filter((c) => c.id !== cfg.id)], "config");
}

export function deleteConfigVersion(id: string): void {
  const list = configVersions().filter((c) => c.id !== id);
  write("configs", list.length ? list : null, "config");
  if (read<string | null>("config", null) === id) write("config", null, "config");
}

/** Versión activa en la planta; null = la precargada. */
export function activeConfig(): SauceConfig | null {
  const id = read<string | null>("config", null);
  return id ? (configVersions().find((c) => c.id === id) ?? null) : null;
}

/** Activa una versión (null = la precargada) y vuelve al plan manual de esa configuración. */
export function setActiveConfig(id: string | null): void {
  write("vigente", null, "plan");
  write("fixed", null, "plan");
  write("config", id, "config");
}
