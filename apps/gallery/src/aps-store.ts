/**
 * Estado compartido del APS de plásticos entre pantallas del mismo navegador (APS, gemelo 3D y, después, emulador y
 * centro de control).
 *
 * El sitio publicado no tiene servidor: la cartera agregada y la programación vigente se guardan en localStorage y
 * cada cambio se avisa por BroadcastChannel, así dos ventanas abiertas se enteran al instante. Cuando exista la API en
 * Cloudflare, este módulo es el único que cambia.
 */
import type { CustomerOrder, CustomerOrders, PlantEvent, ProductionPlan } from "@twin/cosim/core/contracts.ts";
import { basePortfolio, baseManual, catalogData } from "@twin/cosim/adapters/plastic-injection-plant-v1/catalog.ts";
import { buildModel, type CatalogData } from "@twin/cosim/adapters/plastic-injection-plant-v1/model.ts";
import { applyConfig, configManual, configPortfolio, PRELOADED, type PlasticsConfig } from "@twin/cosim/adapters/plastic-injection-plant-v1/config.ts";
import { modelFor } from "@twin/fractal-manufacturing/models/plastic-injection-plant-v1/study.ts";
import { manualPlan, type ManualEdit } from "@twin/cosim/adapters/plastic-injection-plant-v1/manual.ts";
import { plantNow, setDayZero, store } from "./schedule.ts";

export const PLASTICS = "plastic-injection-plant-v1";
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

// ------------------------------------------------------------------ configuración cargada a mano
/**
 * Versiones de la configuración (pestaña ⚙ CONFIGURACIÓN del APS): cada una es una foto completa de pedidos, montaje
 * de moldes y secuencia del planificador, sin historial. La activa ("USAR EN LA PLANTA") manda en todas las pantallas
 * de plásticos; sin activa, la planta usa la precargada de la demo. ?reset=1 vuelve a la precargada antes de leer nada.
 */
if (typeof location !== "undefined" && new URLSearchParams(location.search).get("reset") === "1") store.set(key("config-active"), null);

export function configVersions(): PlasticsConfig[] {
  return read<PlasticsConfig[]>("configs", []).filter((c) => c?.contract === "plastics-config.v1");
}

/** Guarda (o reemplaza, mismo id) una versión de la configuración. */
export function saveConfigVersion(cfg: PlasticsConfig): void {
  const list = configVersions();
  const i = list.findIndex((c) => c.id === cfg.id);
  if (i >= 0) list[i] = cfg;
  else list.push(cfg);
  store.set(key("configs"), JSON.stringify(list));
  channel?.postMessage({ type: "config" });
}

export function deleteConfigVersion(id: string): void {
  store.set(key("configs"), JSON.stringify(configVersions().filter((c) => c.id !== id)));
  if (read<string | null>("config-active", null) === id) setActiveConfig(null);
  else channel?.postMessage({ type: "config" });
}

/** La configuración que usa la planta, o null si es la precargada. */
export function activeConfig(): PlasticsConfig | null {
  const id = read<string | null>("config-active", null);
  return id ? configVersions().find((c) => c.id === id) ?? null : null;
}

/**
 * Pone una versión en la planta (null = la precargada). La programación vuelve a la secuencia manual de esa versión y
 * se olvidan los pedidos agregados, los moldes y fechas cambiados por Fractal y el escenario visto, que eran de la
 * configuración anterior. Las pantallas abiertas se recargan al enterarse.
 */
export function setActiveConfig(id: string | null): void {
  store.set(key("config-active"), id && id !== PRELOADED ? JSON.stringify(id) : null);
  for (const k of ["added", "vigente", "viewed", "view-mode", "viewed-version", "molds", "order_changes"]) store.set(key(k), null);
  channel?.postMessage({ type: "config" });
  channel?.postMessage({ type: "plan" });
}

/** El catálogo de la planta con la configuración activa aplicada (montaje de moldes). */
export function catalog(): CatalogData {
  return applyConfig(catalogData(), activeConfig());
}

function activeModel() {
  try {
    return buildModel(catalog());
  } catch {
    // Una versión que ya no cuadra con el catálogo no deja la planta sin modelo: vuelve a la precargada.
    store.set(key("config-active"), null);
    return buildModel(catalogData());
  }
}

/** Modelo de la planta con la configuración activa (se lee al cargar la pantalla; activar otra recarga). */
export const model = activeModel();

/** La secuencia manual del planificador de la configuración activa (APS-MAN-01 en la precargada). */
export function currentManual() {
  return configManual(baseManual, activeConfig(), portfolio().portfolio_id);
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
  const base = configPortfolio(basePortfolio, activeConfig());
  const changes = new Map(orderChanges().map((c) => [c.order, c]));
  const orders = [...base.orders, ...addedOrders()].map((o) => {
    const c = changes.get(o.id);
    return c ? { ...o, ...(c.due ? { due: c.due } : {}), ...(c.importance ? { importance: c.importance } : {}) } : o;
  });
  return { ...base, orders };
}

/** Moldes cambiados por una recomendación de Fractal adoptada (máquina → molde, null = desmontado). */
export function molds(): Record<string, string | null> {
  return read<Record<string, string | null>>("molds", {});
}

/** Modelo de la planta con los moldes como están montados ahora (para CALCULAR y la secuencia manual). */
export function modelNow() {
  const m = molds();
  return Object.keys(m).length ? modelFor(catalog(), m) : model;
}

export function setAdded(list: CustomerOrder[]): void {
  store.set(key("added"), JSON.stringify(list));
  channel?.postMessage({ type: "orders" });
}

/** La programación vigente; al arrancar es la secuencia manual del planificador (APS-MAN-01). */
export function vigente(): ProductionPlan {
  const saved = read<ProductionPlan | null>("vigente", null);
  const pf = portfolio();
  if (saved && saved.portfolio_id === pf.portfolio_id && saved.contract === "production-plan.v1") return saved;
  return { ...manualPlan(model, pf, currentManual()), status: "vigente" };
}

/** Escenario que se ve en el gemelo y en el APS (la propuesta del cosimulador o una opción de Fractal). */
export function viewedPlan(): ProductionPlan | null {
  return read<ProductionPlan | null>("viewed", null);
}

export function setViewed(plan: ProductionPlan | null): void {
  store.set(key("viewed"), plan ? JSON.stringify(plan) : null);
  channel?.postMessage({ type: "view" });
}

/** "vigente": el gemelo muestra la programación adoptada; "escenario": muestra el escenario visto. */
export type ViewMode = "vigente" | "escenario";
export function viewMode(): ViewMode {
  return read<ViewMode>("view-mode", "vigente");
}

export function setViewMode(mode: ViewMode): void {
  store.set(key("view-mode"), JSON.stringify(mode));
  channel?.postMessage({ type: "view" });
}

/** La programación que muestra el gemelo ahora. */
export function activePlan(): ProductionPlan {
  return viewMode() === "escenario" ? viewedPlan() ?? vigente() : vigente();
}

export function setVigente(plan: ProductionPlan): void {
  store.set(key("view-mode"), JSON.stringify("vigente"));
  store.set(key("viewed"), null);
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

/** Los que siguen fuera de servicio en el instante `at` (AHORA por defecto). */
export function activeEvents(at: string = now()): PlantEvent[] {
  const t = at;
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
  store.set(key("clock"), null);
  store.set(key("config-active"), null);
  channel?.postMessage({ type: "config" });
  channel?.postMessage({ type: "clock" });
  channel?.postMessage({ type: "plan" });
  channel?.postMessage({ type: "events" });
}

/**
 * Reloj compartido con el gemelo 3D: el instante que muestran el emulador y el centro de control. Es el del play
 * (o el que se arrastra en la barra de tiempo) y `null` cuando el gemelo está EN VIVO, en cuyo caso se usa AHORA.
 */
export function sharedClock(): string | null {
  return read<string | null>("clock", null);
}

export function setSharedClock(at: string | null): void {
  store.set(key("clock"), JSON.stringify(at));
  channel?.postMessage({ type: "clock" });
}

/** Instante que muestran emulador y centro de control: el del gemelo si lo hay, si no AHORA. */
export function shownNow(): string {
  return sharedClock() ?? now();
}

/** "HH:MM:SS" del instante mostrado; los segundos solo corren cuando el reloj está EN VIVO. */
export function shownClockText(): string {
  const at = sharedClock();
  const forced = typeof location !== "undefined" && new URLSearchParams(location.search).has("now");
  if (at || forced) return `${shownNow().slice(11, 16)}:00`;
  const sign = model.timezone.startsWith("-") ? -1 : 1;
  const [h, m] = model.timezone.slice(1).split(":").map(Number);
  const local = new Date(Date.now() + sign * (h * 60 + m) * 60000);
  return `${shownNow().slice(11, 16)}:${String(local.getUTCSeconds()).padStart(2, "0")}`;
}

// ------------------------------------------------------------------ versiones guardadas de la programación
/**
 * Versión guardada de la programación: una foto con nombre de lo que se calculó o se ajustó a mano, para volver a
 * verla en el APS y en el gemelo, compararla con otras y adoptarla después. Mientras no haya servidor viven en este
 * navegador (localStorage) y se pasan a otro equipo exportándolas en JSON.
 *
 * Una programación pesa unos 350 kB en JSON, así que se guarda un índice liviano (nombre e indicadores) y cada
 * programación aparte, comprimida con gzip (unas 15 veces menos): caben decenas sin llenar el navegador.
 */
export interface VersionMeta {
  contract: "plan-version.v1";
  id: string;
  name: string;
  /** Instante de la planta en que se guardó. */
  saved_at: string;
  plan_id: string;
  source: ProductionPlan["source"];
  kpis: ProductionPlan["kpis"];
  fixed: number;
  /** Ajustes a mano con que se hizo. */
  moves: number;
}

export interface VersionData {
  plan: ProductionPlan;
  /** Ajuste manual con el que se hizo (colas y movimientos), si lo hubo: permite seguir ajustándola. */
  edit?: ManualEdit | null;
}

export type SavedVersion = VersionMeta & VersionData;

const VERSION_FILE = "plan-versions.v1";
const cache = new Map<string, VersionData>();

export function versions(): VersionMeta[] {
  return read<VersionMeta[]>("versions", []);
}

function writeIndex(list: VersionMeta[]): void {
  localStorage.setItem(key("versions"), JSON.stringify(list));
  channel?.postMessage({ type: "versions" });
}

async function pipe(text: string | Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const body = typeof text === "string" ? new TextEncoder().encode(text) : text;
  return new Uint8Array(await new Response(new Blob([body as BlobPart]).stream().pipeThrough(stream)).arrayBuffer());
}

/** JSON → "gz:" + base64 de gzip (o "j:" + JSON si el navegador no comprime). */
async function pack(data: VersionData): Promise<string> {
  const json = JSON.stringify(data);
  if (typeof CompressionStream === "undefined") return `j:${json}`;
  const bytes = await pipe(json, new CompressionStream("gzip"));
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `gz:${btoa(bin)}`;
}

async function unpack(raw: string): Promise<VersionData> {
  if (raw.startsWith("j:")) return JSON.parse(raw.slice(2)) as VersionData;
  const bin = atob(raw.slice(3));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(await pipe(bytes, new DecompressionStream("gzip")))) as VersionData;
}

/** La programación de una versión (se descomprime una vez y queda en memoria). */
export async function loadVersion(id: string): Promise<SavedVersion | null> {
  const meta = versions().find((v) => v.id === id);
  if (!meta) return null;
  let data = cache.get(id);
  if (!data) {
    const raw = store.get(key(`version.${id}`));
    if (!raw) return null;
    data = await unpack(raw);
    cache.set(id, data);
  }
  return { ...meta, ...data };
}

/** La versión si ya está en memoria (para dibujar sin esperar). */
export function cachedVersion(id: string): SavedVersion | null {
  const meta = versions().find((v) => v.id === id);
  const data = cache.get(id);
  return meta && data ? { ...meta, ...data } : null;
}

const metaOf = (id: string, name: string, saved_at: string, d: VersionData): VersionMeta => ({
  contract: "plan-version.v1",
  id,
  name,
  saved_at,
  plan_id: d.plan.plan_id,
  source: d.plan.source,
  kpis: d.plan.kpis,
  fixed: d.plan.fixed_orders?.length ?? 0,
  moves: d.edit?.moves.length ?? 0,
});

async function store1(meta: VersionMeta, data: VersionData): Promise<void> {
  localStorage.setItem(key(`version.${meta.id}`), await pack(data));
  cache.set(meta.id, data);
}

/** Guarda una versión. Falla si el navegador no tiene espacio. */
export async function saveVersion(name: string, plan: ProductionPlan, edit: ManualEdit | null = null): Promise<VersionMeta> {
  const data: VersionData = { plan, edit };
  const meta = metaOf(`v${Date.now().toString(36)}`, name.trim() || plan.plan_id, now(), data);
  try {
    await store1(meta, data);
    writeIndex([meta, ...versions()]);
  } catch {
    store.set(key(`version.${meta.id}`), null);
    throw new Error("El navegador no tiene espacio para más versiones: exporta y borra algunas en VERSIONES.");
  }
  return meta;
}

export function renameVersion(id: string, name: string): void {
  writeIndex(versions().map((v) => (v.id === id ? { ...v, name: name.trim() || v.name } : v)));
}

export function deleteVersion(id: string): void {
  store.set(key(`version.${id}`), null);
  cache.delete(id);
  writeIndex(versions().filter((v) => v.id !== id));
}

/** Archivo JSON con las versiones elegidas (todas si no se dice cuáles), con su programación completa. */
export async function exportVersions(ids?: string[]): Promise<string> {
  const list = (await Promise.all(versions().filter((v) => !ids || ids.includes(v.id)).map((v) => loadVersion(v.id)))).filter((v): v is SavedVersion => !!v);
  return JSON.stringify({ contract: VERSION_FILE, plant: PLASTICS, portfolio_id: portfolio().portfolio_id, versions: list });
}

/** Agrega las versiones de un archivo exportado; las que ya están (mismo id) no se duplican. Devuelve cuántas entraron. */
export async function importVersions(text: string): Promise<number> {
  const data = JSON.parse(text) as { contract?: string; plant?: string; versions?: SavedVersion[] };
  if (data.contract !== VERSION_FILE || data.plant !== PLASTICS || !Array.isArray(data.versions)) throw new Error("El archivo no es una exportación de versiones del APS de plásticos.");
  const have = new Set(versions().map((v) => v.id));
  const fresh = data.versions.filter((v) => v?.contract === "plan-version.v1" && v.plan?.contract === "production-plan.v1" && v.plan.portfolio_id === portfolio().portfolio_id && !have.has(v.id));
  const added: VersionMeta[] = [];
  try {
    for (const v of fresh) {
      const d: VersionData = { plan: v.plan, edit: v.edit ?? null };
      const meta = metaOf(String(v.id), String(v.name ?? v.plan.plan_id), String(v.saved_at ?? now()), d);
      await store1(meta, d);
      added.push(meta);
    }
  } finally {
    if (added.length) writeIndex([...added, ...versions()]);
  }
  if (added.length < fresh.length) throw new Error(`El navegador se llenó: entraron ${added.length} de ${fresh.length}. Borra algunas versiones y vuelve a importar.`);
  return added.length;
}

/** Muestra una versión guardada como escenario en el gemelo y en el APS. */
export async function viewVersion(id: string): Promise<boolean> {
  const v = await loadVersion(id);
  if (!v) return false;
  // Primero la versión y luego el plan: otra ventana lee las dos al recibir el aviso del plan.
  store.set(key("viewed-version"), JSON.stringify(v.id));
  store.set(key("viewed"), JSON.stringify(v.plan));
  store.set(key("view-mode"), JSON.stringify("escenario"));
  channel?.postMessage({ type: "view" });
  return true;
}

/** Versión guardada que se está viendo como escenario (si el escenario visto salió de una). */
export function viewedVersionId(): string | null {
  const id = read<string | null>("viewed-version", null);
  const seen = viewedPlan();
  const v = id ? versions().find((x) => x.id === id) : null;
  return v && seen && v.plan_id === seen.plan_id ? v.id : null;
}

export function setViewedVersionId(id: string | null): void {
  store.set(key("viewed-version"), id ? JSON.stringify(id) : null);
}

export type Change = "orders" | "plan" | "events" | "clock" | "view" | "versions" | "config";

/** Avisa cuando otra ventana cambia pedidos o programación. */
export function onChange(fn: (what: Change) => void): void {
  channel?.addEventListener("message", (e: MessageEvent<{ type: Change }>) => fn(e.data.type));
  addEventListener("storage", (e) => {
    if (e.key === key("added")) fn("orders");
    if (e.key === key("vigente")) fn("plan");
    if (e.key === key("events")) fn("events");
    if (e.key === key("clock")) fn("clock");
    if (e.key === key("viewed") || e.key === key("view-mode") || e.key === key("viewed-version")) fn("view");
    if (e.key === key("versions")) fn("versions");
    if (e.key === key("configs") || e.key === key("config-active")) fn("config");
  });
}

export { baseManual, manualPlan };

/**
 * Cuando otra ventana cambia la configuración activa, la pantalla se recarga: el modelo de la planta se arma una vez al
 * cargar. Corre al importar este módulo, así toda pantalla de plásticos lo tiene.
 */
function reloadOnConfig(): void {
  const at = read<string | null>("config-active", null);
  const check = () => read<string | null>("config-active", null) !== at && location.reload();
  channel?.addEventListener("message", (e: MessageEvent<{ type: Change }>) => e.data.type === "config" && check());
  addEventListener("storage", (e) => e.key === key("config-active") && check());
}
if (typeof window !== "undefined" && typeof location !== "undefined") reloadOnConfig();

/** Avisa cuando el gemelo cambia el instante (play, barra de tiempo o EN VIVO). */
export function onClock(fn: () => void): void {
  channel?.addEventListener("message", (e: MessageEvent<{ type: Change }>) => e.data.type === "clock" && fn());
  addEventListener("storage", (e) => e.key === key("clock") && fn());
}
