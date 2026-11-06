/**
 * Estado compartido de la planta de salsas entre sus pantallas del mismo navegador: APS, emulador y centro de control
 * (y el gemelo 3D en la fase 7).
 *
 * El sitio publicado no tiene servidor: la programación vigente, los eventos del emulador y el reloj del gemelo se
 * guardan en localStorage y cada cambio se avisa por BroadcastChannel, así dos ventanas abiertas se enteran al instante.
 * Si el navegador no deja guardar (ventana privada, vista previa), cada pantalla sigue funcionando sola.
 */
import { parseLocal, type PlantEvent, type ProductionPlan } from "@twin/cosim-core";
import { DEMO_NOW } from "./view.ts";

export const SAUCE = "sauce-plant-v1";
const key = (k: string) => `twin.aps.${SAUCE}.${k}`;
const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(`twin.${SAUCE}`);

export type Change = "plan" | "events" | "clock";

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
  write("events", null, "events");
  write("clock", null, "clock");
}

/** Avisa cuando otra pantalla cambia la programación, los eventos o el reloj. */
export function onChange(fn: (what: Change) => void): void {
  channel?.addEventListener("message", (e: MessageEvent<{ type: Change }>) => fn(e.data.type));
  addEventListener("storage", (e) => {
    if (e.key === key("vigente")) fn("plan");
    if (e.key === key("events")) fn("events");
    if (e.key === key("clock")) fn("clock");
  });
}
