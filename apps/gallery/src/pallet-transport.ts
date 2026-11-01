/**
 * Transporte de estibas de la planta de plásticos en el gemelo 3D, sacado de la programación vigente (APS).
 *
 * Las rutas aéreas de producto (products.ts) siguen igual: esto agrega el movimiento físico por el piso.
 * - Cada fila de inyección llena estibas en el buffer de su máquina (piezas por estiba del buffer, pallet-sizing.yaml).
 *   El llenado de la tarima de armado del buffer sigue las unidades hechas hasta el instante del gemelo.
 * - Cuando una estiba se llena (o se cierra la corrida de un producto), un montacargas de la flota fleet-01 sale de su
 *   estacionamiento, la recoge y la lleva al siguiente punto de la ruta del producto (catalog/products.yaml): almacén de
 *   semielaborado o bodega de producto terminado.
 * - Las celdas de ensamble piden una estiba de cada componente cada vez que consumen la anterior, y el producto armado
 *   sale en estibas del empaque a la bodega.
 * Los montacargas van por los pasillos (red de carriles de abajo), retroceden al salir de un punto y regresan al
 * estacionamiento sin cola. Con el gemelo en vivo andan a velocidad real (≈ 2,5 m/s); con el play, a la escala de la
 * escena (motion.ts). Si el motor de planta está conectado, sus canales mandan y esto se apaga.
 */
import * as THREE from "three";
import yaml from "js-yaml";
import type { PlanScheduleRow, ProductionPlan } from "@twin/cosim/core/contracts.ts";
import productsYaml from "../../../industrial-models/plastic-injection-plant-v1/catalog/products.yaml?raw";
import { minOf, unitsUntil } from "./plant-state.ts";
import { parts } from "@twin/3d";

interface Eq {
  id: string;
  type: string;
  position: [number, number, number];
  footprint: [number, number, number];
  rotation_deg?: number;
  overhead?: boolean;
  params?: Record<string, unknown>;
  sim?: { type: string; params: Record<string, unknown> } | null;
}
interface CatProduct {
  id: string;
  name: string;
  display_name?: string;
  bulk_l?: number;
  bom?: { item: string; qty: number }[];
  routing: { stage: string; equipment: string[] }[];
}

/** Un traslado de una estiba: sale cuando se llena (t, en minutos de la planta). */
export interface Trip {
  t: number;
  from: string;
  to: string;
  product: string;
  order: string;
  /** Número de la estiba en la corrida (cuenta por máquina o celda). */
  n: number;
}

type P2 = [number, number];
type ToScene = (x: number, y: number, z?: number) => THREE.Vector3;

const FLEET = "fleet-01";
/** Volumen útil de la estiba estándar (1,2 × 1,0 × 1,6 m al 75 %), en litros; pallet-sizing.yaml. */
const PALLET_L = 1.2 * 1.0 * 1.6 * 0.75 * 1000;
/** Del centro del montacargas a la punta de las uñas (m). */
const REACH = 2.0;
const LIVE_SPEED = 2.5; // m/s, velocidad real en planta; con el play se multiplica por la escala (motion.ts)
const DWELL_S = 2.5; // recoger o dejar la estiba, a velocidad real
const MAX_QUEUE = 8;
const LANE_OFFSET = 1.0; // m: ida y regreso van por carriles distintos, a la derecha del eje del pasillo
const GAP = 3.5; // m: distancia mínima con el montacargas de adelante en el mismo sentido
const MAX_HOLD_S = 4; // s: si sigue detenido más que esto, avanza igual (evita bloqueos en los cruces)

/**
 * Carriles de los montacargas en el plano (x este, y norte, m): los mismos ejes de las rutas `forklift` del plant.yaml,
 * más el pasillo entre las hileras de inyectoras medianas (y = 63,4, el de los carros) y el pasillo entre las
 * estanterías 2 y 3 de producto terminado (x = 158).
 */
const LANES: P2[][] = [
  [[36, 49], [124, 49]],
  [[38, 63.4], [122, 63.4]],
  [[36, 74.25], [134, 74.25]],
  [[46, 89.1], [122, 89.1]],
  [[79, 49], [79, 89.1]],
  [[134, 74.25], [134, 54.25], [145.1, 54.25], [145.1, 28], [158, 28]],
  [[126, 66.5], [142, 66.5]],
  [[151, 28], [151, 90]],
  [[158, 28], [158, 90]],
];

const products: CatProduct[] = (yaml.load(productsYaml) as { products: CatProduct[] }).products;
const productOf = (id: string) => products.find((p) => p.id === id);
export const productLabel = (id: string) => {
  const p = productOf(id);
  return p?.display_name ?? p?.name ?? id;
};
const roundDown10 = (x: number) => Math.max(10, Math.floor(x / 10) * 10);
const bulkOf = (p: CatProduct | undefined): number =>
  p?.bulk_l ?? (p?.bom ?? []).reduce((s, b) => s + (productOf(b.item)?.bulk_l ?? 0) * b.qty, 0);

// ------------------------------------------------------------------ traslados a partir de la programación

/** Primer instante de la fila en que van `u` unidades hechas. */
function timeOfUnits(r: PlanScheduleRow, u: number): number {
  let a = minOf(r.start);
  let b = minOf(r.end);
  if (unitsUntil(r, b) < u) return b;
  while (b - a > 0.25) {
    const m = (a + b) / 2;
    if (unitsUntil(r, m) >= u) b = m;
    else a = m;
  }
  return b;
}

/** Siguiente almacén de la ruta del producto y el punto donde se arma la estiba (la etapa anterior, sin el transporte). */
function storageStep(p: CatProduct | undefined): { pickup?: string; storage?: string } {
  if (!p) return {};
  const i = p.routing.findIndex((s) => s.stage.startsWith("almacen"));
  if (i < 0) return {};
  const before = p.routing.slice(0, i).filter((s) => s.stage !== "transporte" && s.stage !== "inyeccion").at(-1);
  return { pickup: before?.equipment[0], storage: p.routing[i].equipment[0] };
}

interface Run {
  equipment: string;
  pickup: string;
  storage: string;
  product: string;
  pallet: number;
  rows: PlanScheduleRow[];
}

export interface TripPlan {
  trips: Trip[];
  /** Llenado (0–1) de la estiba en armado de cada buffer en el instante t. */
  fillAt: (buffer: string, t: number) => number | undefined;
}

export function planTrips(plan: ProductionPlan, equipment: Eq[]): TripPlan {
  const byId = new Map(equipment.map((e) => [e.id, e]));
  const palletOfBuffer = (id: string, p: CatProduct | undefined): number => {
    const e = byId.get(id);
    const n = Number(e?.sim?.params?.pallet_pieces ?? e?.params?.pallet_pieces ?? 0);
    if (n > 0) return n;
    const bulk = bulkOf(p);
    return bulk > 0 ? roundDown10(PALLET_L / bulk) : 100;
  };
  const trips: Trip[] = [];
  const runs: Run[] = [];
  const rows = [...plan.schedule].sort((a, b) => minOf(a.start) - minOf(b.start));

  // Inyección: corridas por máquina y producto; cada estiba llena (o el cierre de la corrida) es un traslado.
  const injection = new Map<string, PlanScheduleRow[]>();
  for (const r of rows) if (r.stage === "inyeccion") injection.set(r.equipment, [...(injection.get(r.equipment) ?? []), r]);
  for (const [machine, list] of injection) {
    let run: Run | null = null;
    for (const r of list) {
      if (!run || run.product !== r.product) {
        const p = productOf(r.product);
        const step = storageStep(p);
        const buffer = `buf-${machine.slice(4)}`;
        const pickup = byId.has(buffer) ? buffer : step.pickup;
        if (!pickup || !step.storage) {
          run = null;
          continue;
        }
        run = { equipment: machine, pickup, storage: step.storage, product: r.product, pallet: palletOfBuffer(pickup, p), rows: [] };
        runs.push(run);
      }
      run.rows.push(r);
    }
  }
  for (const run of runs) {
    let carry = 0;
    let n = 0;
    for (const r of run.rows) {
      for (let k = Math.floor(carry / run.pallet) + 1; k * run.pallet <= carry + r.quantity; k++) {
        trips.push({ t: timeOfUnits(r, k * run.pallet - carry), from: run.pickup, to: run.storage, product: run.product, order: r.order, n: ++n });
      }
      carry += r.quantity;
    }
    const last = run.rows.at(-1)!;
    if (carry % run.pallet > 0) trips.push({ t: minOf(last.end), from: run.pickup, to: run.storage, product: run.product, order: last.order, n: ++n });
  }

  // Ensamble: una estiba de cada componente al arrancar y cada vez que se consume; el producto armado sale en estibas
  // del punto anterior a la bodega (en la papelera, el empaque).
  const cells = new Map<string, PlanScheduleRow[]>();
  for (const r of rows) if (r.stage === "ensamble") cells.set(r.equipment, [...(cells.get(r.equipment) ?? []), r]);
  for (const [cell, list] of cells) {
    const counters = new Map<string, { used: number; n: number }>();
    let made = 0;
    let out = 0;
    for (const r of list) {
      const p = productOf(r.product);
      for (const b of p?.bom ?? []) {
        const c = productOf(b.item);
        const step = storageStep(c);
        if (!step.storage) continue;
        const pallet = palletOfBuffer(step.pickup ?? "", c);
        const st = counters.get(b.item) ?? { used: 0, n: 0 };
        counters.set(b.item, st);
        const need = r.quantity * b.qty;
        // la estiba k se pide cuando el consumo llega a (k - 1) · estiba: la primera al arrancar
        for (let k = Math.floor(st.used / pallet) + (st.used === 0 ? 0 : 1); k * pallet < st.used + need; k++) {
          trips.push({ t: timeOfUnits(r, Math.max(0, (k * pallet - st.used) / b.qty)), from: step.storage, to: cell, product: b.item, order: r.order, n: ++st.n });
        }
        st.used += need;
      }
      const step = storageStep(p);
      if (!step.storage) continue;
      const pickup = p?.routing.find((s) => s.stage === "empaque")?.equipment[0] ?? cell;
      const pallet = roundDown10(PALLET_L / Math.max(0.1, bulkOf(p)));
      for (let k = Math.floor(made / pallet) + 1; k * pallet <= made + r.quantity; k++) {
        trips.push({ t: timeOfUnits(r, k * pallet - made), from: pickup, to: step.storage, product: r.product, order: r.order, n: ++out });
      }
      made += r.quantity;
    }
  }
  trips.sort((a, b) => a.t - b.t);

  const byBuffer = new Map<string, Run[]>();
  for (const run of runs) byBuffer.set(run.pickup, [...(byBuffer.get(run.pickup) ?? []), run]);
  const fillAt = (buffer: string, t: number): number | undefined => {
    const list = byBuffer.get(buffer);
    if (!list) return undefined;
    for (const run of list) {
      const first = minOf(run.rows[0].start);
      const last = minOf(run.rows.at(-1)!.end);
      if (t < first || t >= last) continue;
      let done = 0;
      for (const r of run.rows) done += unitsUntil(r, t);
      return (done % run.pallet) / run.pallet;
    }
    return 0;
  };
  return { trips, fillAt };
}

// ------------------------------------------------------------------ red de carriles

interface Seg {
  a: P2;
  b: P2;
}
const d2 = (p: P2, q: P2) => Math.hypot(p[0] - q[0], p[1] - q[1]);
const key = (p: P2) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`;

function closestOn(s: Seg, p: P2): { q: P2; f: number } {
  const dx = s.b[0] - s.a[0];
  const dy = s.b[1] - s.a[1];
  const f = Math.max(0, Math.min(1, ((p[0] - s.a[0]) * dx + (p[1] - s.a[1]) * dy) / Math.max(1e-9, dx * dx + dy * dy)));
  return { q: [s.a[0] + f * dx, s.a[1] + f * dy], f };
}

/** Rectángulo de la huella en el plano (con giros de 90°). */
function rectOf(e: Eq): [number, number, number, number] {
  const turned = Math.round(((e.rotation_deg ?? 0) % 180) / 90) !== 0;
  const w = turned ? e.footprint[1] : e.footprint[0];
  const l = turned ? e.footprint[0] : e.footprint[1];
  return [e.position[0] - w / 2, e.position[1] - l / 2, e.position[0] + w / 2, e.position[1] + l / 2];
}

/** ¿El tramo p→q corta el rectángulo? (método de las franjas) */
function hitsRect(p: P2, q: P2, r: [number, number, number, number]): boolean {
  let t0 = 0;
  let t1 = 1;
  for (let ax = 0; ax < 2; ax++) {
    const d = q[ax] - p[ax];
    const lo = r[ax];
    const hi = r[ax + 2];
    if (Math.abs(d) < 1e-9) {
      if (p[ax] <= lo || p[ax] >= hi) return false;
      continue;
    }
    let a = (lo - p[ax]) / d;
    let b = (hi - p[ax]) / d;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b);
    if (t0 >= t1) return false;
  }
  return true;
}

class LaneGraph {
  readonly segs: Seg[] = [];
  private readonly adj = new Map<string, { to: string; p: P2; w: number }[]>();
  private readonly pts = new Map<string, P2>();

  constructor(lanes: P2[][]) {
    const raw: Seg[] = [];
    for (const l of lanes) for (let i = 1; i < l.length; i++) raw.push({ a: l[i - 1], b: l[i] });
    // cada tramo se parte en los cruces y en las puntas de los demás tramos que caen sobre él
    for (const s of raw) {
      const cuts: number[] = [0, 1];
      for (const o of raw) {
        if (o === s) continue;
        for (const p of [o.a, o.b]) {
          const c = closestOn(s, p);
          if (d2(c.q, p) < 0.05) cuts.push(c.f);
        }
        const x = intersect(s, o);
        if (x !== null) cuts.push(x);
      }
      const fs = [...new Set(cuts.map((f) => Math.round(f * 1e6) / 1e6))].sort((a, b) => a - b);
      for (let i = 1; i < fs.length; i++) {
        const a = lerp(s, fs[i - 1]);
        const b = lerp(s, fs[i]);
        if (d2(a, b) < 0.01) continue;
        this.segs.push({ a, b });
        this.link(a, b);
      }
    }
  }

  private link(a: P2, b: P2): void {
    const ka = key(a);
    const kb = key(b);
    this.pts.set(ka, a);
    this.pts.set(kb, b);
    const w = d2(a, b);
    this.adj.set(ka, [...(this.adj.get(ka) ?? []), { to: kb, p: b, w }]);
    this.adj.set(kb, [...(this.adj.get(kb) ?? []), { to: ka, p: a, w }]);
  }

  /** Punto del carril más cercano a p al que se llega en línea recta sin atravesar equipos. */
  attach(p: P2, blocked: (q: P2) => boolean): { q: P2; seg: Seg } | null {
    let best: { q: P2; seg: Seg; d: number } | null = null;
    for (const seg of this.segs) {
      const { q } = closestOn(seg, p);
      const d = d2(p, q);
      if (best && d >= best.d) continue;
      if (blocked(q)) continue;
      best = { q, seg, d };
    }
    return best;
  }

  /** Camino más corto entre dos puntos sobre los carriles (Dijkstra; la red tiene pocas decenas de nodos). */
  route(from: { q: P2; seg: Seg }, to: { q: P2; seg: Seg }): P2[] {
    if (from.seg === to.seg) return [from.q, to.q];
    const START = "start";
    const extra = new Map<string, { to: string; p: P2; w: number }[]>();
    const add = (k: string, e: { to: string; p: P2; w: number }) => extra.set(k, [...(extra.get(k) ?? []), e]);
    for (const end of [from.seg.a, from.seg.b]) add(START, { to: key(end), p: end, w: d2(from.q, end) });
    const goal = new Map<string, number>([[key(to.seg.a), d2(to.seg.a, to.q)], [key(to.seg.b), d2(to.seg.b, to.q)]]);
    const dist = new Map<string, number>([[START, 0]]);
    const prev = new Map<string, string>();
    const done = new Set<string>();
    let bestEnd: string | null = null;
    let bestCost = Infinity;
    for (;;) {
      let u: string | null = null;
      for (const [k, v] of dist) if (!done.has(k) && (u === null || v < dist.get(u)!)) u = k;
      if (u === null || dist.get(u)! >= bestCost) break;
      done.add(u);
      const du = dist.get(u)!;
      const g = goal.get(u);
      if (g !== undefined && du + g < bestCost) {
        bestCost = du + g;
        bestEnd = u;
      }
      for (const e of [...(this.adj.get(u) ?? []), ...(extra.get(u) ?? [])]) {
        if (du + e.w < (dist.get(e.to) ?? Infinity)) {
          dist.set(e.to, du + e.w);
          prev.set(e.to, u);
        }
      }
    }
    const path: P2[] = [to.q];
    for (let k = bestEnd; k && k !== START; k = prev.get(k)!) path.unshift(this.pts.get(k)!);
    path.unshift(from.q);
    return path;
  }
}

function lerp(s: Seg, f: number): P2 {
  return [s.a[0] + (s.b[0] - s.a[0]) * f, s.a[1] + (s.b[1] - s.a[1]) * f];
}
/** Fracción sobre s del cruce propio de s y o, o null. */
function intersect(s: Seg, o: Seg): number | null {
  const r = [s.b[0] - s.a[0], s.b[1] - s.a[1]];
  const q = [o.b[0] - o.a[0], o.b[1] - o.a[1]];
  const den = r[0] * q[1] - r[1] * q[0];
  if (Math.abs(den) < 1e-9) return null;
  const t = ((o.a[0] - s.a[0]) * q[1] - (o.a[1] - s.a[1]) * q[0]) / den;
  const u = ((o.a[0] - s.a[0]) * r[1] - (o.a[1] - s.a[1]) * r[0]) / den;
  return t > 1e-6 && t < 1 - 1e-6 && u >= -1e-6 && u <= 1 + 1e-6 ? t : null;
}

// ------------------------------------------------------------------ montacargas

/** Punto donde se detiene el montacargas frente a un equipo: E (con las uñas en el equipo) y su enganche Q al carril. */
interface Stop {
  e: P2;
  q: P2;
  seg: Seg;
}

interface Vehicle {
  object: THREE.Object3D;
  load: THREE.Object3D | undefined;
  label: { sprite: THREE.Sprite; canvas: HTMLCanvasElement; key: string };
  slot: Stop;
  at: Stop;
  path: P2[];
  cum: number[];
  s: number;
  /** El primer tramo (salir del punto) se hace en reversa. */
  reverseFirst: boolean;
  phase: "idle" | "toPickup" | "loading" | "toDrop" | "unloading" | "toBay";
  wait: number;
  /** Segundos que lleva detenido detrás de otro montacargas. */
  hold: number;
  trip: Trip | null;
  heading: number;
}

/**
 * Corre la polilínea del pasillo a su derecha (mano derecha): así los que van y los que vienen por el mismo pasillo
 * no se cruzan. En las esquinas el punto corrido es el de la unión a inglete de los dos tramos.
 */
function keepRight(line: P2[], d: number): P2[] {
  if (line.length < 2) return line;
  const normal = (a: P2, b: P2): P2 => {
    const l = Math.max(1e-9, d2(a, b));
    return [(b[1] - a[1]) / l, -(b[0] - a[0]) / l];
  };
  return line.map((p, i) => {
    const n0 = i > 0 ? normal(line[i - 1], p) : null;
    const n1 = i < line.length - 1 ? normal(p, line[i + 1]) : null;
    if (!n0 || !n1) {
      const n = (n0 ?? n1)!;
      return [p[0] + n[0] * d, p[1] + n[1] * d];
    }
    const m: P2 = [n0[0] + n1[0], n0[1] + n1[1]];
    const ml = Math.hypot(m[0], m[1]);
    if (ml < 0.2) return [p[0] + n1[0] * d, p[1] + n1[1] * d]; // media vuelta: se queda del lado del tramo que sigue
    const k = d / Math.max(0.5, (m[0] * n0[0] + m[1] * n0[1]) / ml);
    return [p[0] + (m[0] / ml) * k, p[1] + (m[1] / ml) * k];
  });
}

interface Opts {
  equipment: Eq[];
  plan: () => ProductionPlan;
  /** Instante del gemelo (play por día y hora), en minutos de la planta. */
  time: () => number;
  parent: THREE.Object3D;
  toScene: ToScene;
  /** Canales del buffer (llenado y estibas esperando) para su geometría. */
  setChannels: (id: string, channels: Record<string, number>) => void;
  /** false mientras el motor de planta manda (simulación conectada). */
  active: () => boolean;
  /** Nombre que muestra la etiqueta para un equipo. */
  nameOf?: (id: string) => string;
}

export interface PalletTransport {
  /** `scale`: multiplicador de velocidad del play (motion.ts), 1 en vivo. */
  update: (dt: number, scale?: number) => void;
  stats: () => { trips: number; moving: number; queued: number; skipped: number; lastTrip: Trip | null; nextTrip: Trip | null; vehicles: { phase: string; x: number; y: number; to?: string }[] };
}

export function buildPalletTransport(opts: Opts): PalletTransport {
  const graph = new LaneGraph(LANES);
  const byId = new Map(opts.equipment.map((e) => [e.id, e]));
  const obstacles = opts.equipment.filter((e) => !e.overhead && e.type !== "forklift_fleet" && (e.position[2] ?? 0) < 1).map((e) => ({ id: e.id, r: rectOf(e) }));
  const blockedFor = (p: P2, own?: string) => (q: P2) => obstacles.some((o) => o.id !== own && hitsRect(p, q, o.r));

  /** Puntos de parada de un equipo, repartidos a lo largo de su lado largo (estanterías, buffers, celdas). */
  const stopCache = new Map<string, Stop[]>();
  function stopsOf(id: string): Stop[] {
    const cached = stopCache.get(id);
    if (cached) return cached;
    const e = byId.get(id);
    if (!e) return [];
    const [x0, y0, x1, y1] = rectOf(e);
    const alongX = x1 - x0 >= y1 - y0;
    const len = alongX ? x1 - x0 : y1 - y0;
    const half = (alongX ? y1 - y0 : x1 - x0) / 2;
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const samples: P2[] = [];
    const n = Math.max(1, Math.floor((len - 1) / 2.6));
    for (let i = 0; i < n; i++) {
      const off = n === 1 ? 0 : -len / 2 + 0.5 + ((i + 0.5) * (len - 1)) / n;
      samples.push(alongX ? [cx + off, cy] : [cx, cy + off]);
    }
    const found: (Stop & { d: number })[] = [];
    for (const s of samples) {
      const at = graph.attach(s, (q) => blockedFor(s, id)(q));
      if (!at) continue;
      const d = d2(s, at.q);
      const u: P2 = [(at.q[0] - s[0]) / Math.max(1e-6, d), (at.q[1] - s[1]) / Math.max(1e-6, d)];
      const reach = Math.min(d, half + REACH);
      found.push({ e: [s[0] + u[0] * reach, s[1] + u[1] * reach], q: at.q, seg: at.seg, d });
    }
    // solo las paradas del lado más cercano al carril
    const min = Math.min(...found.map((f) => f.d));
    const stops = found.filter((f) => f.d < min + 0.75);
    stopCache.set(id, stops);
    return stops;
  }

  // Vehículos: los de la flota que ya dibujó la escena (routes.ts), o propios si no hay pasillos.
  const fleet = byId.get(FLEET);
  const count = Math.min(12, Number(fleet?.sim?.params?.vehicles ?? fleet?.params?.vehicles ?? 6));
  const bay = fleet ? new THREE.Vector3(fleet.position[0], fleet.position[1]) : new THREE.Vector3(85, 92.5);
  const vehicles: Vehicle[] = [];
  for (let k = 1; k <= count; k++) {
    let object = opts.parent.getObjectByName(`fleet-${FLEET}-${k}`);
    if (!object) {
      const fk = parts.forklift(k % 2 ? "#e8731a" : "#f2b705");
      object = fk.object;
      object.name = `transport-${k}`;
      object.userData.trail = "#ff7a1a";
      opts.parent.add(object);
    }
    // mismo estacionamiento que routes.ts
    const cols = Math.min(count, 6);
    const rows = Math.ceil(count / cols);
    const i = k - 1;
    const p: P2 = [bay.x + ((i % cols) - (cols - 1) / 2) * 1.4, bay.y - (Math.floor(i / cols) - (rows - 1) / 2) * 2.6];
    const at = graph.attach(p, () => false)!;
    const slot: Stop = { e: p, q: at.q, seg: at.seg };
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 112;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    sprite.scale.set(6.4, 1.4, 1);
    sprite.renderOrder = 11;
    sprite.visible = false;
    opts.parent.add(sprite);
    vehicles.push({ object, load: object.getObjectByName("load"), label: { sprite, canvas, key: "" }, slot, at: slot, path: [], cum: [0], s: 0, reverseFirst: false, phase: "idle", wait: 0, hold: 0, trip: null, heading: Math.PI });
  }

  const nameOf = opts.nameOf ?? ((id: string) => id.toUpperCase());
  function paintLabel(v: Vehicle): void {
    const t = v.trip;
    const show = !!t && (v.phase === "toDrop" || v.phase === "unloading");
    v.label.sprite.visible = show;
    if (!show) return;
    const k = `${t.order}|${t.n}|${t.to}`;
    if (k === v.label.key) return;
    v.label.key = k;
    const g = v.label.canvas.getContext("2d")!;
    g.clearRect(0, 0, 512, 112);
    g.fillStyle = "rgba(6, 8, 40, 0.86)";
    g.strokeStyle = "#ff8a00";
    g.lineWidth = 5;
    g.beginPath();
    g.roundRect(3, 3, 506, 106, 12);
    g.fill();
    g.stroke();
    g.fillStyle = "#ffb54d";
    g.font = "700 30px Inter, sans-serif";
    g.fillText(`ESTIBA ${t.n} · ${productLabel(t.product)}`.slice(0, 32), 18, 44);
    g.fillStyle = "#F8FAFC";
    g.font = "500 26px Inter, sans-serif";
    g.fillText(`${t.order} → ${nameOf(t.to)}`.slice(0, 36), 18, 88);
    (v.label.sprite.material.map as THREE.CanvasTexture).needsUpdate = true;
  }

  function setPath(v: Vehicle, to: Stop, reverseFirst: boolean): void {
    const lane = graph.route({ q: v.at.q, seg: v.at.seg }, { q: to.q, seg: to.seg }).filter((p, i, a) => i === 0 || d2(p, a[i - 1]) > 0.05);
    const mid = lane.length > 1 ? keepRight(lane, LANE_OFFSET) : lane;
    const path: P2[] = [v.at.e, ...mid, to.e].filter((p, i, a) => i === 0 || d2(p, a[i - 1]) > 0.05);
    v.path = path;
    v.cum = [0];
    for (let i = 1; i < path.length; i++) v.cum.push(v.cum[i - 1] + d2(path[i], path[i - 1]));
    v.s = 0;
    v.reverseFirst = reverseFirst && path.length > 2;
    v.at = to;
  }

  const pick = (id: string, n: number): Stop | null => {
    const s = stopsOf(id);
    return s.length ? s[n % s.length] : null;
  };

  let tripPlan: TripPlan | null = null;
  let planRef: ProductionPlan | null = null;
  let cursor = 0;
  let lastT: number | null = null;
  let skipped = 0;
  let lastTrip: Trip | null = null;
  const queue: Trip[] = [];

  function reset(t: number): void {
    queue.length = 0;
    cursor = tripPlan ? tripPlan.trips.findIndex((x) => x.t > t) : 0;
    if (cursor < 0) cursor = tripPlan?.trips.length ?? 0;
    for (const v of vehicles) {
      v.phase = "idle";
      v.trip = null;
      v.at = v.slot;
      v.path = [];
      v.heading = Math.PI;
      v.object.userData.trailCut = true; // vuelve al estacionamiento de un salto: sin estela
    }
  }

  function start(v: Vehicle, trip: Trip): boolean {
    const from = pick(trip.from, trip.n);
    if (!from || !pick(trip.to, trip.n)) return false;
    v.trip = trip;
    v.phase = "toPickup";
    setPath(v, from, v.at !== v.slot);
    return true;
  }

  function place(v: Vehicle, dt: number): void {
    let pos: P2;
    let dir: P2 = [0, 1];
    let reverse = false;
    if (v.phase === "idle" || v.path.length < 2) {
      pos = v.at.e;
      dir = v.at === v.slot ? [0, -1] : [v.at.e[0] - v.at.q[0], v.at.e[1] - v.at.q[1]];
    } else {
      const s = Math.min(v.s, v.cum.at(-1)!);
      let i = 1;
      while (i < v.cum.length - 1 && v.cum[i] < s) i++;
      const a = v.path[i - 1];
      const b = v.path[i];
      const f = (s - v.cum[i - 1]) / Math.max(1e-6, v.cum[i] - v.cum[i - 1]);
      pos = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
      dir = [b[0] - a[0], b[1] - a[1]];
      reverse = v.reverseFirst && i === 1;
    }
    if (reverse) dir = [-dir[0], -dir[1]];
    v.object.position.copy(opts.toScene(pos[0], pos[1]));
    // en la escena z apunta al sur: rumbo = atan2(x, z) con z = -y
    const target = Math.atan2(dir[0], -dir[1]);
    const diff = Math.atan2(Math.sin(target - v.heading), Math.cos(target - v.heading));
    v.heading += v.phase === "idle" ? diff : diff * Math.min(1, dt * 6);
    v.object.rotation.y = v.heading;
    if (v.load) v.load.visible = v.phase === "toDrop" || v.phase === "unloading";
    v.label.sprite.position.copy(v.object.position).setY(3.6);
    paintLabel(v);
  }

  const buffersInPlay = new Set<string>();

  function update(dt: number, scale = 1): void {
    if (!opts.active()) return;
    const plan = opts.plan();
    const t = opts.time();
    if (plan !== planRef) {
      planRef = plan;
      tripPlan = planTrips(plan, opts.equipment);
      buffersInPlay.clear();
      for (const x of tripPlan.trips) if (x.from.startsWith("buf-")) buffersInPlay.add(x.from);
      lastT = null;
    }
    if (!tripPlan) return;
    const step = lastT === null ? 0 : t - lastT;
    if (lastT === null || step < 0 || step > 240) reset(t);
    else {
      while (cursor < tripPlan.trips.length && tripPlan.trips[cursor].t <= t) {
        queue.push(tripPlan.trips[cursor++]);
        while (queue.length > MAX_QUEUE) {
          queue.shift();
          skipped++;
        }
      }
    }
    lastT = t;
    // con el play, todo al ritmo de la escala: más rápido en la vía y menos tiempo cargando o descargando
    const speed = LIVE_SPEED * scale;
    const dwell = DWELL_S / scale;

    for (const v of vehicles) {
      if ((v.phase === "idle" || v.phase === "toBay") && queue.length) {
        if (v.phase === "toBay") {
          // da la vuelta desde donde va: el punto de partida es el que dejó atrás
          v.at = v.path.length ? nearestStop(v) : v.at;
        }
        const trip = queue.shift()!;
        if (!start(v, trip)) skipped++;
        else lastTrip = trip;
      }
      if (v.phase === "loading" || v.phase === "unloading") {
        v.wait -= dt;
        if (v.wait <= 0) {
          if (v.phase === "loading") {
            v.phase = "toDrop";
            setPath(v, pick(v.trip!.to, v.trip!.n)!, true);
          } else {
            v.phase = "toBay";
            v.trip = null;
            setPath(v, v.slot, true);
          }
        }
      } else if (v.phase !== "idle") {
        if (behindAnother(v) && v.hold < MAX_HOLD_S) v.hold += dt;
        else {
          v.hold = 0;
          v.s += speed * dt;
        }
        if (v.s >= v.cum.at(-1)!) {
          if (v.phase === "toPickup") {
            v.phase = "loading";
            v.wait = dwell;
          } else if (v.phase === "toDrop") {
            v.phase = "unloading";
            v.wait = dwell;
          } else {
            v.phase = "idle";
            v.path = [];
          }
        }
      }
      place(v, dt);
    }

    // buffers: llenado de la estiba en armado y estibas llenas esperando montacargas
    for (const id of buffersInPlay) {
      const waiting = queue.filter((x) => x.from === id).length + vehicles.filter((v) => v.trip?.from === id && v.phase === "toPickup").length;
      opts.setChannels(id, { fill: tripPlan.fillAt(id, t) ?? 0, waiting: Math.min(2, waiting), blocked: 0 });
    }
  }

  /** ¿Hay otro montacargas delante, a menos de GAP y andando en el mismo sentido? Entonces este espera. */
  function behindAnother(v: Vehicle): boolean {
    const fx = Math.sin(v.heading);
    const fz = Math.cos(v.heading);
    const p = v.object.position;
    return vehicles.some((w) => {
      if (w === v || w.phase === "idle") return false;
      const dx = w.object.position.x - p.x;
      const dz = w.object.position.z - p.z;
      const ahead = dx * fx + dz * fz;
      const side = Math.abs(dx * fz - dz * fx);
      const same = Math.sin(w.heading) * fx + Math.cos(w.heading) * fz > 0.7 || w.phase === "loading" || w.phase === "unloading";
      return ahead > 0.1 && ahead < GAP && side < 1.2 && same;
    });
  }

  /** Mientras regresa al estacionamiento, la parada que acaba de dejar (para rehacer la ruta desde el carril). */
  function nearestStop(v: Vehicle): Stop {
    const s = Math.min(v.s, v.cum.at(-1)!);
    let i = 1;
    while (i < v.cum.length - 1 && v.cum[i] < s) i++;
    const a = v.path[i - 1];
    const b = v.path[i];
    const f = (s - v.cum[i - 1]) / Math.max(1e-6, v.cum[i] - v.cum[i - 1]);
    const p: P2 = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    const at = graph.attach(p, () => false)!;
    return { e: p, q: at.q, seg: at.seg };
  }

  return {
    update,
    stats: () => ({
      trips: tripPlan?.trips.length ?? 0,
      moving: vehicles.filter((v) => v.phase !== "idle").length,
      queued: queue.length,
      skipped,
      lastTrip,
      nextTrip: tripPlan?.trips[cursor] ?? null,
      vehicles: vehicles.map((v) => ({ phase: v.phase, x: v.object.position.x, y: -v.object.position.z, to: v.trip?.to })),
    }),
  };
}
