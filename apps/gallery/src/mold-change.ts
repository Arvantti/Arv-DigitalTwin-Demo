/**
 * Cambios de molde de la planta de plásticos en el gemelo 3D, sacados del escenario que se ve (vigente o propuesta).
 *
 * De dónde salen:
 * - Una fila de inyección que monta un molde distinto al de la fila anterior de la misma máquina (su tiempo de montaje,
 *   `changeover_min`, va de corrido y sin partir).
 * - Las paradas de montaje que trae una opción de Fractal: "Montaje de <molde>" (copia de repuesto del almacén) y
 *   "Mudanza de <molde> desde <máquina>" (el molde de una máquina parada pasa a otra libre).
 * Cómo se ve, al ritmo del play:
 * 1. Desmontaje: en las inyectoras bajo el puente grúa (hilera mediana) la grúa saca el molde y lo baja al carro de
 *    moldes; en las pequeñas, el molde se desliza de la máquina al carro.
 * 2. Traslado: un operario empuja el carro al almacén de moldes (deja el que sale y toma el que entra) o, en una
 *    mudanza, directo a la otra máquina.
 * 3. Montaje: la grúa (o el operario, en las pequeñas) sube el molde a la máquina.
 * Todo sale del instante del gemelo, no de una simulación: adelantar, retroceder o pausar el play da la misma escena.
 * Un cambio solo de color o de resina no mueve el molde; el letrero muestra la purga.
 */
import * as THREE from "three";
import yaml from "js-yaml";
import type { PlanScheduleRow, ProductionPlan } from "@twin/cosim/core/contracts.ts";
import toolingYaml from "../../../industrial-models/plastic-injection-plant-v1/catalog/tooling.yaml?raw";
import { materials as M, parts as P } from "@twin/3d";
import { model } from "./aps-store.ts";
import { minOf, moldSetup } from "./plant-state.ts";

interface Eq {
  id: string;
  type: string;
  position: [number, number, number];
  footprint: [number, number, number];
  sim?: { type: string } | null;
}
type P2 = [number, number];
type ToScene = (x: number, y: number, z?: number) => THREE.Vector3;

/** Un cambio de referencia de una máquina, entre a y b (minutos de la planta). */
export interface MoldChange {
  machine: string;
  a: number;
  b: number;
  /** Minutos de trabajo del cambio (filas de la programación) o null si corre de reloj (paradas de Fractal). */
  work: number | null;
  /** Molde que sale y molde que entra (ids de tooling.yaml). */
  from?: string;
  to?: string;
  /** Mudanza: máquina de donde viene el molde (en vez del almacén). */
  source?: string;
  /** true si se mueve un molde; false si es solo purga de color o resina. */
  mold: boolean;
  kind: string;
}

const tooling = (yaml.load(toolingYaml) as { tooling: { id: string; name: string }[] }).tooling;
/** "Molde de balde de 12 L" → "balde de 12 L". */
export const moldName = (id?: string) => (tooling.find((t) => t.id === id)?.name ?? id ?? "—").replace(/^Molde de /i, "").split(",")[0];

/** Almacén de moldes: el carro entra por el oeste al pasillo entre las estanterías 2 y 3 (y = 18). */
const STORE_TO_HUB: P2[] = [[80, 18], [73.5, 18], [73.5, 24], [79, 24], [79, 36]];
/** Cruce entre las inyectoras 05 y 06 (x = 79): pasillo sur de la hilera pequeña (y = 36) y pasillo central (y = 49). */
const HUB: P2 = [79, 36];
const SOUTH_Y = 36;
const AISLE_Y = 49;
/** Punta del gancho del puente grúa sin bajar (sobre el piso, m) y largo del cable sin bajar. */
const HOOK_TIP = 4.7;
const CABLE_LEN = 2.2;
const CART_SCALE = 1.3;
const CART_TOP = 0.225 * CART_SCALE;
const HANDLE_Z = -1.08 * CART_SCALE;

const smooth = (x: number) => {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
};
/** Avance suavizado (0–1) de x dentro de [a, b]. */
const seg = (x: number, a: number, b: number) => smooth((x - a) / (b - a));
const mix = (a: number, b: number, f: number) => a + (b - a) * f;

/** Cambios de la programación (filas con montaje) y de las paradas de montaje de Fractal, en orden. */
export function moldChanges(plan: ProductionPlan, machines: Set<string>): MoldChange[] {
  const out: MoldChange[] = [];
  const byMachine = new Map<string, PlanScheduleRow[]>();
  for (const r of plan.schedule) {
    if (!machines.has(r.equipment)) continue;
    (byMachine.get(r.equipment) ?? byMachine.set(r.equipment, []).get(r.equipment)!).push(r);
  }
  const mounted: Record<string, string | undefined> = Object.fromEntries([...machines].map((m) => [m, moldSetup[m]?.tooling]));
  for (const [m, t] of Object.entries(plan.molds ?? {})) mounted[m] = t ?? undefined;
  for (const [machine, rows] of byMachine) {
    rows.sort((x, y) => minOf(x.start) - minOf(y.start));
    let current = mounted[machine];
    for (const r of rows) {
      const next = r.tooling ?? current;
      if (r.changeover_min > 0) {
        const a = minOf(r.start);
        const mold = !!next && !!current && next !== current;
        out.push({ machine, a, b: model.calendar.advance(a, r.changeover_min), work: r.changeover_min, from: current, to: next, mold, kind: mold ? "molde" : (r.changeover_kind ?? "color") });
      }
      current = next;
    }
  }
  for (const d of plan.downtime) {
    if (!machines.has(d.equipment)) continue;
    const spare = /^Montaje de (\S+)/.exec(d.reason);
    const move = /^Mudanza de (\S+) desde (\S+)/.exec(d.reason);
    if (!spare && !move) continue;
    const to = (spare ?? move)![1];
    const source = move ? move[2].toLowerCase() : undefined;
    out.push({ machine: d.equipment, a: minOf(d.start), b: minOf(d.end), work: null, from: moldSetup[d.equipment]?.tooling, to, source: source && machines.has(source) ? source : undefined, mold: true, kind: "molde" });
  }
  return out.sort((x, y) => x.a - y.a);
}

interface Opts {
  equipment: Eq[];
  plan: () => ProductionPlan;
  time: () => number;
  parent: THREE.Object3D;
  toScene: ToScene;
  /** Raíz del puente grúa (sus piezas se llaman crane-bridge, crane-trolley, crane-cable y crane-hook). */
  crane?: THREE.Object3D;
  active: () => boolean;
}

export interface MoldChangeView {
  update: () => void;
  stats: () => { changes: number; next: { machine: string; a: number; from?: string; to?: string; source?: string }[]; active: { machine: string; f: number; phase: string }[] };
}

interface Rig {
  group: THREE.Group;
  op: P.OperatorHandle;
  mold: THREE.Group;
  band: THREE.MeshStandardMaterial;
  label: { sprite: THREE.Sprite; canvas: HTMLCanvasElement; key: string };
}

/** Un tramo del cambio, de f0 a f1 (fracción del cambio). */
type Step =
  | { kind: "unmount" | "mount"; f0: number; f1: number; e: Eq; crane: boolean }
  | { kind: "travel"; f0: number; f1: number; path: P2[]; back: boolean }
  | { kind: "store"; f0: number; f1: number; at: P2 };

const BAND_COLORS = ["#e2552b", "#2f7fd0", "#2fb36b", "#d9a400", "#9b59d0", "#e03c8a"];
function bandColor(id?: string): string {
  let h = 0;
  for (const c of id ?? "") h = (h * 31 + c.charCodeAt(0)) % 997;
  return BAND_COLORS[h % BAND_COLORS.length];
}

export function buildMoldChangeView(opts: Opts): MoldChangeView {
  const byId = new Map(opts.equipment.map((e) => [e.id, e]));
  const machines = new Set(opts.equipment.filter((e) => e.sim?.type === "injection-molding-machine").map((e) => e.id));
  const crane = opts.crane ? byId.get(String(opts.crane.userData.assetId)) : undefined;
  const cp = {
    bridge: opts.crane?.getObjectByName("crane-bridge"),
    trolley: opts.crane?.getObjectByName("crane-trolley"),
    cable: opts.crane?.getObjectByName("crane-cable"),
    hook: opts.crane?.getObjectByName("crane-hook"),
  };
  const underCrane = (e: Eq) => {
    if (!crane) return false;
    return Math.abs(e.position[0] - crane.position[0]) < crane.footprint[0] / 2 && Math.abs(e.position[1] - crane.position[1]) < crane.footprint[1] / 2;
  };

  // ---------------------------------------------------------------- recorridos del carro
  /** Puesto del carro junto a la máquina: al sur, en el pasillo (más lejos en las medianas, bajo la grúa). */
  const station = (e: Eq): P2 => [e.position[0], e.position[1] - e.footprint[1] / 2 - (underCrane(e) ? 2.2 : 1.4)];
  const corridor = (e: Eq) => (underCrane(e) ? AISLE_Y : SOUTH_Y);
  const toHub = (e: Eq): P2[] => {
    const st = station(e);
    return underCrane(e) ? [st, [st[0], AISLE_Y], [HUB[0], AISLE_Y], HUB] : [st, [st[0], SOUTH_Y], HUB];
  };
  /** Recorrido de una máquina al almacén (sin b) o a otra máquina. */
  function route(a: Eq, b?: Eq): P2[] {
    if (b && corridor(a) === corridor(b)) {
      const [sa, sb] = [station(a), station(b)];
      const y = corridor(a);
      return [sa, [sa[0], y], [sb[0], y], sb];
    }
    const tail = b ? toHub(b) : STORE_TO_HUB;
    return [...toHub(a), ...[...tail].reverse().slice(1)];
  }
  const lengthOf = (path: P2[]) => path.slice(1).reduce((s, q, i) => s + Math.hypot(q[0] - path[i][0], q[1] - path[i][1]), 0);
  function along(path: P2[], s: number): { p: P2; dir: P2 } {
    let left = Math.max(0, s);
    for (let i = 1; i < path.length; i++) {
      const [a, b] = [path[i - 1], path[i]];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1e-6;
      const dir: P2 = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
      if (left <= len || i === path.length - 1) {
        const f = Math.min(1, left / len);
        return { p: [mix(a[0], b[0], f), mix(a[1], b[1], f)], dir };
      }
      left -= len;
    }
    return { p: path[0], dir: [0, 1] };
  }
  /** Rumbo en la escena para avanzar en dir (plano: x este, y norte; el carro avanza hacia su +Z). */
  const yawOf = (dir: P2) => Math.atan2(dir[0], -dir[1]);

  /** Tramos del cambio. Con el puente grúa, el desmontaje y el montaje toman más tiempo que con el carro solo. */
  function stepsOf(c: MoldChange, craneJob: boolean): Step[] {
    const e = byId.get(c.machine)!;
    const src = c.source ? byId.get(c.source) : undefined;
    const useCrane = (m: Eq) => craneJob && underCrane(m);
    const dur = (m: Eq) => (useCrane(m) ? 0.3 : 0.14);
    if (src) {
      const U = dur(src);
      const Mo = dur(e);
      return [
        { kind: "unmount", f0: 0, f1: U, e: src, crane: useCrane(src) },
        { kind: "travel", f0: U, f1: 1 - Mo, path: route(src, e), back: false },
        { kind: "mount", f0: 1 - Mo, f1: 1, e, crane: useCrane(e) },
      ];
    }
    const U = c.from ? dur(e) : 0;
    const Mo = dur(e);
    const r = 1 - U - Mo;
    const path = route(e);
    const steps: Step[] = [];
    if (U > 0) steps.push({ kind: "unmount", f0: 0, f1: U, e, crane: useCrane(e) });
    steps.push(
      { kind: "travel", f0: U, f1: U + 0.42 * r, path, back: false },
      { kind: "store", f0: U + 0.42 * r, f1: U + 0.58 * r, at: path[path.length - 1] },
      { kind: "travel", f0: U + 0.58 * r, f1: 1 - Mo, path, back: true },
      { kind: "mount", f0: 1 - Mo, f1: 1, e, crane: useCrane(e) },
    );
    return steps;
  }

  // ---------------------------------------------------------------- piezas
  const rigs: Rig[] = [];
  function makeRig(): Rig {
    const group = new THREE.Group();
    group.name = "mold-change";
    const cart = P.cart("#d9a400");
    cart.setLoaded(false);
    cart.object.scale.setScalar(CART_SCALE);
    group.add(cart.object);
    const op = P.operator("#f2b705", "#2f5f8f", { skin: "#a8745a", hair: "#1c1410" });
    op.object.position.set(0, 0, HANDLE_Z);
    group.add(op.object);
    group.userData.trail = "#b48cff";
    group.visible = false;
    opts.parent.add(group);
    // molde: dos placas de acero con la franja de color del molde y la argolla de izaje (1 × 1,14 × 0,9 sin escalar)
    const mold = new THREE.Group();
    mold.name = "mold";
    const steel = M.paint("#7d868f", 0.35);
    const band = new THREE.MeshStandardMaterial({ color: "#2f7fd0", roughness: 0.5 });
    for (const sy of [-0.27, 0.27]) {
      const plate = P.box(1, 0.52, 0.9, steel, 0.02);
      plate.position.y = sy;
      mold.add(plate);
    }
    mold.add(new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.07, 0.92), band));
    const eye = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.025, 8, 16), M.chrome());
    eye.position.y = 0.62;
    mold.add(eye);
    mold.traverse((o) => (o.castShadow = true));
    mold.visible = false;
    opts.parent.add(mold);
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 112;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    sprite.scale.set(6.4, 1.12, 1);
    sprite.renderOrder = 11;
    sprite.visible = false;
    opts.parent.add(sprite);
    return { group, op, mold, band, label: { sprite, canvas, key: "" } };
  }

  function paintLabel(r: Rig, title: string, line: string): void {
    const k = `${title}|${line}`;
    if (k === r.label.key) return;
    r.label.key = k;
    const g = r.label.canvas.getContext("2d")!;
    g.clearRect(0, 0, 640, 112);
    g.fillStyle = "rgba(6, 8, 40, 0.88)";
    g.strokeStyle = "#b48cff";
    g.lineWidth = 5;
    g.beginPath();
    g.roundRect(3, 3, 634, 106, 12);
    g.fill();
    g.stroke();
    g.fillStyle = "#cdb4ff";
    g.font = "700 30px Inter, sans-serif";
    g.fillText(title.slice(0, 40), 18, 44);
    g.fillStyle = "#F8FAFC";
    g.font = "500 25px Inter, sans-serif";
    g.fillText(line.slice(0, 48), 18, 88);
    (r.label.sprite.material.map as THREE.CanvasTexture).needsUpdate = true;
  }

  // ---------------------------------------------------------------- puente grúa
  function setHook(d: number): void {
    if (!cp.hook || !cp.cable) return;
    cp.hook.position.y = -d;
    cp.cable.scale.y = (CABLE_LEN + d) / CABLE_LEN;
    cp.cable.position.y = -1.4 - (CABLE_LEN + d) / 2;
  }
  /** Carro de la grúa sobre (x, y) de la planta con la punta del gancho a la altura z. */
  function craneAt(x: number, y: number, z = HOOK_TIP): void {
    if (!cp.bridge || !cp.trolley || !crane) return;
    cp.bridge.position.x = x - crane.position[0];
    cp.trolley.position.z = -(y - crane.position[1]);
    setHook(Math.max(0, HOOK_TIP - z));
  }
  const park = () => crane && craneAt(crane.position[0], crane.position[1]);

  // ---------------------------------------------------------------- un instante de un cambio
  const progress = (c: MoldChange, t: number) =>
    Math.min(1, Math.max(0, c.work === null ? (t - c.a) / Math.max(1, c.b - c.a) : model.calendar.workBetween(c.a, t) / Math.max(1, c.work)));

  function place(r: Rig, c: MoldChange, t: number, craneJob: boolean): string {
    const f = progress(c, t);
    const target = byId.get(c.machine)!;
    if (!c.mold) {
      r.group.visible = r.mold.visible = false;
      r.label.sprite.visible = true;
      r.label.sprite.position.copy(opts.toScene(target.position[0], target.position[1], target.footprint[2] + 3.2));
      paintLabel(r, `PURGA DE ${c.kind.toUpperCase()} · ${c.machine.toUpperCase()}`, `molde ${moldName(c.to)}`);
      return "purga";
    }
    const steps = stepsOf(c, craneJob);
    const step = steps.find((s) => f < s.f1) ?? steps[steps.length - 1];
    const k = seg(f, step.f0, step.f1);
    // el molde que va en el carro: el que sale hasta el almacén, el que entra después; en una mudanza, siempre el mismo
    const storeStep = steps.find((s) => s.kind === "store");
    const swapped = !storeStep || f >= (storeStep.f0 + storeStep.f1) / 2;
    const carried = c.source ? c.to : swapped ? c.to : c.from;
    r.band.color.set(bandColor(carried));
    const sz = Math.max(0.5, Math.min(1.0, (step.kind === "unmount" || step.kind === "mount" ? step.e : target).footprint[1] * 0.36));
    r.mold.scale.setScalar(sz);
    const half = (sz * 1.14) / 2;

    // carro y operario
    let p: P2;
    let yaw: number;
    let walking = false;
    let phase: string;
    if (step.kind === "travel") {
      const L = lengthOf(step.path);
      const s = step.back ? L * (1 - k) : L * k;
      const a = along(step.path, s);
      p = a.p;
      yaw = yawOf(step.back ? [-a.dir[0], -a.dir[1]] : a.dir);
      walking = k > 0 && k < 1;
      if (walking) r.op.setWalk((step.back ? 2 * L - s : s) * 5 + 0.001);
      phase = c.source ? `HACIA ${c.machine.toUpperCase()}` : step.back ? "DEL ALMACÉN" : "AL ALMACÉN";
    } else if (step.kind === "store") {
      p = step.at;
      yaw = yawOf([1, 0]);
      phase = "EN EL ALMACÉN";
    } else {
      p = station(step.e);
      yaw = yawOf([0, 1]); // mirando a la máquina (al norte)
      phase = step.kind === "unmount" ? "DESMONTAJE" : "MONTAJE";
    }
    if (!walking) {
      r.op.setWalk(0);
      r.op.setPose(step.kind === "travel" ? 0 : 0.55);
    }
    r.group.visible = true;
    r.group.position.copy(opts.toScene(p[0], p[1], 0));
    r.group.rotation.y = yaw;
    r.mold.rotation.y = yaw;
    const onCart = opts.toScene(p[0], p[1], CART_TOP + half);

    // molde (y grúa)
    if (step.kind === "travel") {
      r.mold.visible = !!carried && (step.back || !!c.source || !!c.from);
      r.mold.position.copy(onCart);
    } else if (step.kind === "store") {
      r.mold.visible = swapped || !!c.from;
      r.mold.position.copy(onCart);
    } else {
      const [mx, my] = step.e.position;
      const inZ = step.e.footprint[2] * 0.55;
      const clear = step.e.footprint[2] + 0.5 + half;
      const cartZ = CART_TOP + half;
      const [sx, sy] = p;
      // desmontaje y montaje son el mismo recorrido, uno al derecho y el otro al revés
      const u = step.kind === "unmount" ? k : 1 - k;
      if (step.crane && crane) {
        const [px, py] = crane.position;
        let hx: number, hy: number, z: number;
        let held = true;
        // u: 0–0,25 grúa a la máquina, 0,25–0,45 baja el gancho, 0,45–0,62 sube con el molde, 0,62–0,82 va al carro, 0,82–1 baja al carro
        if (u < 0.25) { const q = seg(u, 0, 0.25); hx = mix(px, mx, q); hy = mix(py, my, q); z = clear; held = false; }
        else if (u < 0.45) { hx = mx; hy = my; z = mix(clear, inZ, seg(u, 0.25, 0.45)); held = false; }
        else if (u < 0.62) { hx = mx; hy = my; z = mix(inZ, clear, seg(u, 0.45, 0.62)); }
        else if (u < 0.82) { const q = seg(u, 0.62, 0.82); hx = mix(mx, sx, q); hy = mix(my, sy, q); z = clear; }
        else { hx = sx; hy = sy; z = mix(clear, cartZ, seg(u, 0.82, 1)); }
        // punta del gancho: sobre la argolla del molde
        craneAt(hx, hy, z + half + 0.15);
        // sin sostenerlo, el molde está dentro de la máquina (lo muestra la inyectora)
        r.mold.visible = held;
        r.mold.position.copy(opts.toScene(hx, hy, z));
      } else {
        // carro solo: el molde se desliza entre la máquina y el carro con un leve arco
        r.mold.position.lerpVectors(opts.toScene(mx, my, inZ), opts.toScene(sx, sy, cartZ), u);
        r.mold.position.y += Math.sin(u * Math.PI) * 0.5;
        r.mold.visible = u > 0.03;
      }
    }
    const title = c.source ? `MUDANZA DE MOLDE · ${c.source.toUpperCase()} → ${c.machine.toUpperCase()}` : `CAMBIO DE MOLDE · ${c.machine.toUpperCase()}`;
    const line = c.source
      ? `${moldName(c.to)} · ${phase.toLowerCase()}`
      : c.from
        ? `sale ${moldName(c.from)} → entra ${moldName(c.to)}`
        : `repuesto: ${moldName(c.to)} · ${phase.toLowerCase()}`;
    paintLabel(r, title, line);
    r.label.sprite.visible = true;
    r.label.sprite.position.copy(opts.toScene(p[0], p[1], 5.6));
    return phase;
  }

  // ---------------------------------------------------------------- cada cuadro
  let planRef: ProductionPlan | null = null;
  let changes: MoldChange[] = [];
  let last: { machine: string; f: number; phase: string }[] = [];
  function update(): void {
    const plan = opts.plan();
    if (plan !== planRef) {
      planRef = plan;
      changes = moldChanges(plan, machines);
    }
    const t = opts.time();
    const live = opts.active() ? changes.filter((c) => c.a <= t && t < c.b) : [];
    while (rigs.length < live.length) rigs.push(makeRig());
    // el puente grúa atiende el primer cambio de molde activo que lo necesita; los demás usan solo el carro
    const craneJob = live.find((c) => c.mold && [c.machine, c.source].some((m) => m && underCrane(byId.get(m)!)));
    park();
    last = [];
    rigs.forEach((r, i) => {
      const c = live[i];
      if (!c) {
        r.group.visible = r.mold.visible = r.label.sprite.visible = false;
        return;
      }
      last.push({ machine: c.machine, f: Math.round(progress(c, t) * 100) / 100, phase: place(r, c, t, c === craneJob) });
    });
  }

  return {
    update,
    stats: () => {
      const t = opts.time();
      return {
        changes: changes.filter((c) => c.mold).length,
        next: changes.filter((c) => c.mold && c.b > t).slice(0, 5).map((c) => ({ machine: c.machine, a: c.a, from: c.from, to: c.to, source: c.source })),
        active: last,
      };
    },
  };
}
