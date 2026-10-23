/**
 * Escena de planta: el layout de un plant.yaml en 3D con los equipos de la librería.
 *
 * Los equipos que el motor de planta simula (simulation.yaml) se dibujan con la geometría de su tipo y se animan con
 * lo que publica la simulación en vivo; los demás aparecen como volúmenes de su huella. El modelo 3D no calcula nada:
 * todo valor viene de la API (`/api/plants/{id}` y `/api/plants/{id}/simulate`).
 *
 * Parámetros de URL (útiles para capturas automáticas):
 *   ?plant=sauce-plant-v1&lighting=day
 *   &camera=general|<id de zona>   cámara inicial
 *   &select=<id de equipo>         equipo seleccionado
 *   &product=<id de producto>      muestra la ruta de ese producto del catálogo (docs/datos-reales.md)
 *   &focus=<id de equipo>          acerca la cámara a ese equipo
 *   &look=x,y,z,tx,ty,tz           cámara en el punto (x, y, z) del plano mirando a (tx, ty, tz), en metros
 *   &autosim=1&scenario=boiler-trip&speed=120   conecta la simulación al cargar
 *   &tour=1                        inicia el recorrido de cámara al cargar
 *   &shot=1                        oculta la interfaz y marca window.__ready (con autosim, tras recibir datos)
 */
import { createBeltPlc } from "./belt-plc.ts";
import "./mobile-dock.ts";
import yaml from "js-yaml";
import * as THREE from "three";
import { buildRoutes, type Aisle, type Route } from "./routes.ts";
import { type AnimationFrame, type EquipmentModel, type LightingPreset, Stage, humansPending, parts, textures } from "@twin/3d";
import { geometryBuilders, rawSpecs } from "@twin/equipment-library/registry.ts";
import { buildProcessPiece } from "./process-pieces.ts";
import { dockLeveler, deliveryTruck, palletRack, passThroughDoor } from "./warehouse.ts";
import { type ControlPiece, type PanelConfig, controlPanel, operatorDesk, plcCabinet } from "./control-room.ts";
import { bootDone, bootError, bootStage } from "./boot.ts";
import { type CatalogDoc, type ProductsApi, buildProducts } from "./products.ts";
import "./styles.css";

// Evita que el HTML sin estilos aparezca mientras Vite descarga el módulo CSS.
document.body.classList.remove("loading");

interface Zone {
  id: string;
  name: string;
  kind: string;
  hygiene_class: string;
  rect: [number, number, number, number];
  height: number;
  /** Cota del piso de la zona (edificios por pisos); 0 si no viene. */
  elevation?: number;
}
interface PlantEquipment {
  id: string;
  type: string;
  zone: string;
  position: [number, number, number];
  footprint: [number, number, number];
  rotation_deg?: number;
  overhead?: boolean;
  panel?: PanelConfig;
  params?: Record<string, unknown>;
  sim?: { type: string; preset: string | null; params: Record<string, unknown> };
}
interface Walkway {
  id: string;
  name: string;
  zone: string;
  path: [number, number][];
  width: number;
  elevation: number;
  access?: [number, number][];
}
interface Pipe {
  from: string;
  to: string;
  medium: string;
  rate?: number;
  unit?: string;
  /** Trazado del tubo en el plano ([x, y, z]); si no viene, la escena lo traza sola. */
  route?: [number, number, number][];
  /** Diámetro nominal del tubo (red de agua): da el grosor en la escena. */
  diameter_in?: number;
  /** Reductor: en el punto `reduce_at` de la ruta el tubo pasa a `reduce_to_in` pulgadas (cono de 0,2 m). */
  reduce_at?: number;
  reduce_to_in?: number;
  /** Ids de los enlaces del motor que pasan por este tramo; vacío si el tramo no se simula. */
  links: string[];
}
interface LinkState {
  flow_kg_h?: number;
  units_per_min?: number;
  /** Tubos de la red de agua (dominio hidráulico): velocidad real del agua. */
  velocity_m_s?: number;
  flowing: boolean;
}
interface PlantDoc {
  plant: { id: string; name: string; site?: { width_x: number; length_y: number } };
  zones: Zone[];
  equipment: PlantEquipment[];
  walkways: Walkway[];
  aisles?: Aisle[];
  routes?: Route[];
  pipes: Pipe[];
  lines: { id: string; name: string; equipment: string[] }[];
  scenarios: Record<string, { description: string; duration_s: number }>;
  /** Catálogo de datos de la planta (productos con su ruta y tamaño de cada equipo); null si no tiene. */
  catalog?: CatalogDoc | null;
}
interface EquipmentSnapshot {
  state: string;
  phase: string | null;
  animation: Record<string, number>;
  items?: number[];
  variables: Record<string, number | string | null>;
  active_faults: string[];
}
interface Spec {
  name: string;
  variables: { id: string; unit: string; description: string }[];
  commands?: { id: string; description: string; args?: Record<string, string> }[];
  faults?: { id: string; description: string }[];
}

const specs: Record<string, Spec> = Object.fromEntries(Object.entries(rawSpecs).map(([k, v]) => [k, yaml.load(v) as Spec]));
const url = new URLSearchParams(location.search);
// En una galería estática, el emulador puede vivir en un origen HTTPS/WSS aparte.
const apiOrigin = (url.get("api") ?? location.origin).replace(/\/$/, "");
const apiUrl = (path: string) => `${apiOrigin}${path}`;
const websocketUrl = (path: string) => `${apiOrigin.replace(/^http/, "ws")}${path}`;
const sessionId = url.get("session");
const shotMode = url.get("shot") === "1";
if (shotMode && url.get("ui") !== "1") document.body.classList.add("shot");
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const stage = new Stage({
  canvas: $("scene") as HTMLCanvasElement,
  lighting: (url.get("lighting") as LightingPreset) || "day",
  quality: url.get("quality") === "high" ? "high" : "low",
  preserveDrawingBuffer: shotMode,
});
window.addEventListener("resize", () => stage.resize());

/** La niebla del escenario está pensada para un equipo; una planta de más de 100 m se ve completa. */
function clearFog(): void {
  stage.scene.fog = new THREE.Fog((stage.scene.background as THREE.Color).clone(), 400, 1200);
}
clearFog();

const HYGIENE_COLORS: Record<string, string> = {
  exterior: "#4a5560",
  service: "#56606b",
  dirty: "#8a7a5a",
  clean: "#4f7d9c",
  high_care: "#3f9a8e",
  admin: "#7a6f93",
};

/** Plano (x este, y norte, z arriba) → escena three.js (x este, y arriba, z sur). */
const toScene = (x: number, y: number, z = 0): THREE.Vector3 => new THREE.Vector3(x, z, -y);

// ------------------------------------------------------------------ estado
let doc: PlantDoc;
const assets = new Map<string, { eq: PlantEquipment; root: THREE.Object3D; model: EquipmentModel | null; frame: AnimationFrame }>();
let selectedId: string | null = null;
let selection: THREE.LineSegments | null = null;
let latest: Record<string, EquipmentSnapshot> = {};
let socket: WebSocket | null = null;
let paused = false;
let messages = 0;
type EquipmentHistorySample = { t: number; values: Record<string, number> };
const equipmentHistory = new Map<string, EquipmentHistorySample[]>();

// ------------------------------------------------------------------ construcción
function buildZones(): void {
  for (const z of doc.zones) {
    const [x0, y0, w, l] = z.rect;
    const color = HYGIENE_COLORS[z.hygiene_class] ?? "#555";
    const center = toScene(x0 + w / 2, y0 + l / 2);
    const base = z.elevation ?? 0;
    // Los pisos elevados no llevan losa ni suelo de color (pedido del autor): solo el contorno de la zona, su rótulo
    // y las estructuras de cada equipo, para ver la instalación completa.
    if (base <= 0) {
      const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(w - 0.2, l - 0.2),
        new THREE.MeshStandardMaterial({
          color,
          roughness: 0.7,
          metalness: 0.05,
          transparent: true,
          opacity: z.kind === "exterior" ? 0.55 : 0.9,
        }),
      );
      floor.rotation.x = -Math.PI / 2;
      floor.position.copy(center).setY(base + 0.02);
      floor.receiveShadow = true;
      floor.name = `zone-floor-${z.id}`;
      stage.content.add(floor);
    }
    if (z.height > 0) {
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(w, z.height, l)),
        new THREE.LineBasicMaterial({ color: "#9fd4f5", transparent: true, opacity: 0.45 }),
      );
      edges.position.copy(center).setY(base + z.height / 2);
      edges.name = `zone-frame-${z.id}`;
      stage.content.add(edges);
    }
    const tex = textures.textTexture([z.name.toUpperCase()], { width: 1024, height: 96, fg: "#ffffff", font: "700 56px Rajdhani, Arial, sans-serif", align: "left" });
    if (tex) {
      const lw = Math.min(w - 0.6, 11);
      const label = new THREE.Mesh(new THREE.PlaneGeometry(lw, lw * (96 / 1024)), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.85 }));
      label.rotation.x = -Math.PI / 2;
      label.position.copy(toScene(x0 + 0.3 + lw / 2, y0 + l - 0.6)).setY(base + 0.03);
      stage.content.add(label);
    }
  }
}

const PLACEHOLDER = new THREE.MeshStandardMaterial({ color: "#7f8b97", roughness: 0.65, metalness: 0.25 });
const RAIL = new THREE.MeshStandardMaterial({ color: "#e0a82e", roughness: 0.5, metalness: 0.4 });
const SUPPORT = new THREE.MeshStandardMaterial({ color: "#59626c", roughness: 0.6, metalness: 0.6 });

/** Volumen de la huella para un equipo que aún no tiene tipo en la librería (en el plano: x = dx, y = dy, altura = dz). */
function placeholder(eq: PlantEquipment): THREE.Object3D {
  const [dx, dy, dz] = eq.footprint;
  const g = new THREE.Group();
  if (eq.overhead) {
    // Puente grúa: dos vías a lo largo de x, la viga puente a lo ancho y el carro con el gancho.
    for (const s of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(dx, 0.5, 0.4), RAIL);
      rail.position.set(0, 0, s * (dy / 2));
      g.add(rail);
    }
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.8, dy), RAIL);
    g.add(bridge);
    const trolley = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.6, 1.4), PLACEHOLDER);
    trolley.position.y = -0.7;
    g.add(trolley);
    g.traverse((o) => (o.castShadow = true));
    return g;
  }
  const body = new THREE.Mesh(new THREE.BoxGeometry(dx, dz, dy), PLACEHOLDER);
  body.position.y = dz / 2;
  body.castShadow = body.receiveShadow = true;
  g.add(body);
  return g;
}

/** Piezas de la sala de control (PLC, puesto del operador, panel de gráficos): son de la escena, no de la librería. */
const controlBuilders: Record<string, (eq: PlantEquipment) => ControlPiece> = {
  plc_cabinet: (eq) => plcCabinet(eq.footprint),
  operator_desk: (eq) => operatorDesk(eq.footprint),
  control_panel: (eq) => controlPanel(eq.footprint, eq.panel ?? { slots: [] }),
};
const controlPieces: ControlPiece[] = [];

/** Bodega de producto terminado y despacho (estanterías, paso directo, muelle y camión): piezas de la escena, sin comportamiento. */
const warehouseBuilders: Record<string, (eq: PlantEquipment) => THREE.Object3D> = {
  pallet_rack: (eq) => palletRack(eq.footprint, eq.params?.stage as string | undefined),
  pass_through_door: (eq) => passThroughDoor(eq.footprint),
  dock_leveler: (eq) => dockLeveler(eq.footprint),
  delivery_truck: (eq) => deliveryTruck(eq.footprint, eq.params?.state as string | undefined),
};

/** Tipos del plano sin simulación que sí tienen forma en la librería. */
const LIBRARY_FALLBACK: Record<string, string> = {
  "lockstitch-sewing-machine": "lockstitch-sewing-machine",
  "overlock-sewing-machine": "overlock-sewing-machine",
  "coverstitch-sewing-machine": "coverstitch-sewing-machine",
  vffs_sachet: "vffs-sachet-filler",
  checkweigher: "checkweigher",
  cooling_tunnel: "cooling-tunnel",
  jacketed_kettle: "jacketed-kettle",
};

function buildEquipment(): void {
  for (const eq of doc.equipment) {
    let root: THREE.Object3D;
    let model: EquipmentModel | null = null;
    const builder = eq.sim ? geometryBuilders[eq.sim.type] : undefined;
    const control = controlBuilders[eq.type];
    // un rack simulado (almacén de estibas) usa la geometría de la librería, que muestra su inventario
    const warehouse = eq.sim ? undefined : warehouseBuilders[eq.type];
    if (control) {
      const piece = control(eq);
      controlPieces.push(piece);
      root = piece.root;
    } else if (warehouse) {
      root = warehouse(eq);
    } else if (builder && eq.sim) {
      model = builder(eq.sim.params);
      root = model.root;
    } else {
      // equipo sin simular: forma de la librería con parámetros por defecto, o pieza de escena; el cubo es el último recurso
      const fallbackType = LIBRARY_FALLBACK[eq.type];
      const fallback = fallbackType ? geometryBuilders[fallbackType] : undefined;
      const lanes = Number(eq.params?.lanes);
      const piece = fallback ? null : buildProcessPiece(eq.type, eq.footprint, eq.params ?? {});
      if (fallback) {
        model = fallback(lanes > 0 ? { lanes } : {});
        root = model.root;
      } else root = piece ?? placeholder(eq);
    }
    root.position.copy(toScene(eq.position[0], eq.position[1], eq.position[2]));
    root.rotation.y = THREE.MathUtils.degToRad(eq.rotation_deg ?? 0);
    root.userData.assetId = eq.id;
    stage.content.add(root);
    const support = supportFor(eq);
    if (support) stage.content.add(support);
    assets.set(eq.id, { eq, root, model, frame: { channels: {}, state: "idle", label: eq.id.toUpperCase() } });
  }
}

/**
 * Soporte de un equipo que va por encima del piso de su zona (la estación reguladora elevada, los niveles de la
 * rejilla): cuatro patas en las esquinas de la huella y un marco bajo el equipo. Los equipos chicos (una válvula
 * entre niveles) cuelgan de su tubería y no llevan soporte.
 */
function supportFor(eq: PlantEquipment): THREE.Object3D | null {
  const zone = doc.zones.find((z) => z.id === eq.zone);
  const floor = zone?.elevation ?? 0;
  const gap = eq.position[2] - floor;
  const [dx, dy] = eq.footprint;
  if (eq.overhead || gap < 0.15 || dx * dy < 0.5) return null;
  const group = new THREE.Group();
  group.name = `support-${eq.id}`;
  if (eq.type === "distribution_grid") {
    // el bastidor de la rejilla ya trae sus vigas: las patas bajan por las esquinas reales de ese bastidor (no por la
    // huella nominal, que no coincide), una sobre otra, como una sola columna hasta el piso
    const s = Number(eq.params?.spacing_m ?? 0.5);
    for (const lx of [-2.3 * s, 2.3 * s])
      for (const lz of [-3.3 * s, 2.3 * s]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, gap, 0.05), SUPPORT);
        leg.position.copy(toScene(eq.position[0] + lx, eq.position[1] - lz, floor + gap / 2));
        leg.castShadow = true;
        group.add(leg);
      }
    return group;
  }
  for (const sx of [-1, 1])
    for (const sy of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, gap, 0.06), SUPPORT);
      leg.position.copy(toScene(eq.position[0] + sx * (dx / 2 - 0.05), eq.position[1] + sy * (dy / 2 - 0.05), floor + gap / 2));
      leg.castShadow = true;
      group.add(leg);
    }
  for (const sy of [-1, 1]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(dx, 0.06, 0.06), SUPPORT);
    beam.position.copy(toScene(eq.position[0], eq.position[1] + sy * (dy / 2 - 0.05), eq.position[2] - 0.03));
    group.add(beam);
  }
  for (const sx of [-1, 1]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, dy), SUPPORT);
    beam.position.copy(toScene(eq.position[0] + sx * (dx / 2 - 0.05), eq.position[1], eq.position[2] - 0.03));
    group.add(beam);
  }
  return group;
}

/** Pasarelas elevadas: piso de rejilla, barandas a ambos lados, columnas y escalera en los puntos de acceso. */
function buildWalkways(): void {
  const deck = new THREE.MeshStandardMaterial({ color: "#6e7781", roughness: 0.7, metalness: 0.5 });
  const steel = new THREE.MeshStandardMaterial({ color: "#59626c", roughness: 0.6, metalness: 0.6 });
  for (const w of doc.walkways ?? []) {
    const group = new THREE.Group();
    group.name = `walkway-${w.id}`;
    for (let i = 0; i < w.path.length - 1; i++) {
      const a = toScene(w.path[i][0], w.path[i][1]);
      const b = toScene(w.path[i + 1][0], w.path[i + 1][1]);
      const len = a.distanceTo(b);
      const dir = b.clone().sub(a).normalize();
      const normal = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(w.width / 2);
      const slab = new THREE.Mesh(new THREE.BoxGeometry(len, 0.08, w.width), deck);
      slab.position.copy(a.clone().add(b).multiplyScalar(0.5)).setY(w.elevation);
      slab.rotation.y = Math.atan2(-dir.z, dir.x);
      slab.castShadow = slab.receiveShadow = true;
      group.add(slab);
      for (const side of [-1, 1]) {
        const rail = parts.handrail(
          [a.clone().addScaledVector(normal, side), b.clone().addScaledVector(normal, side)].map((p) => new THREE.Vector2(p.x, p.z)),
          1.1,
        );
        rail.position.y = w.elevation + 0.04;
        group.add(rail);
      }
      const columns = Math.max(2, Math.ceil(len / 4) + 1);
      for (let k = 0; k < columns; k++) {
        const p = a.clone().lerp(b, k / (columns - 1));
        const column = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, w.elevation, 12), steel);
        column.position.set(p.x, w.elevation / 2, p.z);
        column.castShadow = true;
        group.add(column);
      }
    }
    for (const [ax, ay] of w.access ?? []) {
      const ladder = parts.ladder(w.elevation + 1.0, 0.5, false);
      const p = toScene(ax, ay);
      ladder.position.set(p.x, 0, p.z + w.width / 2 + 0.25);
      group.add(ladder);
    }
    stage.content.add(group);
  }
}

// ------------------------------------------------------------------ tuberías
interface PipeRun {
  from: string;
  to: string;
  points: THREE.Vector3[];
  cumulative: number[];
  beads: THREE.Mesh[];
  arrows: THREE.Mesh[];
  links: string[];
  /** Caudal de referencia en kg/h: el del plano si viene en kg/h o L/h; si no, el máximo visto en la simulación. */
  reference: number | null;
  peak: number;
  phase: number;
  /** Velocidad real del agua en m/s (tubos de la red de agua); null si el tramo no la publica. */
  velocity: number | null;
  /** Sentido físico del caudal respecto al trazado from → to. */
  direction: 1 | -1;
}
const pipeRuns: PipeRun[] = [];
let latestLinks: Record<string, LinkState> = {};
let lastPipeTime = 0;
const MEDIUM_COLORS: [RegExp, string][] = [
  [/vapor/, "#e8ecef"],
  [/aceite/, "#d9a521"],
  [/agua/, "#3b82c4"],
  [/vinagre|mayonesa|mostaza|salsa|pasta|emulsi|fase/, "#b6bec7"],
];
const FLOWING = new Set(["running"]);

function assetTop(id: string): THREE.Vector3 | null {
  const a = assets.get(id);
  if (!a) return null;
  const height = a.model?.size.height ?? a.eq.footprint[2];
  return toScene(a.eq.position[0], a.eq.position[1], a.eq.position[2] + height);
}

const downRay = new THREE.Raycaster();
/**
 * Punto de conexión de una tubería sin ruta: un rayo vertical contra la geometría real del equipo, probando el centro
 * y puntos de su caja desplazados hacia el otro extremo (para que el tubo llegue por el lado de donde viene). Así el
 * tubo toca el equipo en vez de terminar en el aire sobre el centro de su huella. Sin impacto, cae en la tapa nominal.
 */
function attachPoint(id: string, toward: THREE.Vector3): THREE.Vector3 | null {
  const a = assets.get(id);
  const nominal = assetTop(id);
  if (!a || !nominal) return nominal;
  a.root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(a.root);
  const c = box.getCenter(new THREE.Vector3());
  const half = box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
  const dir = new THREE.Vector3(toward.x - c.x, 0, toward.z - c.z);
  if (dir.lengthSq() > 1e-6) dir.normalize();
  const meshes: THREE.Object3D[] = [];
  a.root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o);
  });
  for (const k of [0, 0.45, 0.25, -0.25, 0.7]) {
    const x = c.x + dir.x * half.x * k;
    const z = c.z + dir.z * half.z * k;
    downRay.set(new THREE.Vector3(x, box.max.y + 1, z), new THREE.Vector3(0, -1, 0));
    const hit = downRay.intersectObjects(meshes, false)[0];
    if (hit) return new THREE.Vector3(x, hit.point.y, z);
  }
  return nominal;
}

/**
 * Bajante por gravedad: sale del costado del equipo de arriba, baja hasta poco más arriba del de abajo, cruza y
 * entra por su tapa. Varias bajantes del mismo equipo de destino se separan para no dibujarse encima.
 */
function dropPoints(from: string, top: THREE.Vector3, lane: number): THREE.Vector3[] | null {
  const a = assets.get(from);
  if (!a) return null;
  // sale de la pared lateral (oeste) del equipo de arriba, a un tercio de su altura, para que nazca pegada al casco
  a.root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(a.root);
  const start = new THREE.Vector3(box.min.x - 0.02 - 0.2 * lane, box.min.y + (box.max.y - box.min.y) / 3, (box.min.z + box.max.z) / 2);
  const level = top.y + 0.3 + 0.12 * lane;
  const over = new THREE.Vector3(top.x - 0.25 + 0.2 * lane, level, top.z);
  return [start, new THREE.Vector3(start.x, level, start.z), new THREE.Vector3(over.x, level, start.z), over, new THREE.Vector3(over.x, top.y, over.z)];
}

/** Distancia mínima entre dos segmentos 3D (Ericson, «Real-Time Collision Detection», 5.1.9). */
function segmentDistance(p1: THREE.Vector3, q1: THREE.Vector3, p2: THREE.Vector3, q2: THREE.Vector3): number {
  const d1 = q1.clone().sub(p1);
  const d2 = q2.clone().sub(p2);
  const r = p1.clone().sub(p2);
  const a = d1.dot(d1);
  const e = d2.dot(d2);
  const f = d2.dot(r);
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  let s: number;
  let t: number;
  if (a < 1e-9 && e < 1e-9) return r.length();
  if (a < 1e-9) {
    s = 0;
    t = clamp(f / e);
  } else {
    const c = d1.dot(r);
    if (e < 1e-9) {
      t = 0;
      s = clamp(-c / a);
    } else {
      const b = d1.dot(d2);
      const denom = a * e - b * b;
      s = denom > 1e-9 ? clamp((b * f - c * e) / denom) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp(-c / a);
      } else if (t > 1) {
        t = 1;
        s = clamp((b - c) / a);
      }
    }
  }
  return p1.clone().addScaledVector(d1, s).distanceTo(p2.clone().addScaledVector(d2, t));
}

/** ¿El segmento p→q atraviesa la caja (método de las losas)? */
function segmentHitsBox(p: THREE.Vector3, q: THREE.Vector3, box: THREE.Box3): boolean {
  let t0 = 0;
  let t1 = 1;
  for (const axis of ["x", "y", "z"] as const) {
    const d = q[axis] - p[axis];
    if (Math.abs(d) < 1e-9) {
      if (p[axis] < box.min[axis] || p[axis] > box.max[axis]) return false;
      continue;
    }
    let near = (box.min[axis] - p[axis]) / d;
    let far = (box.max[axis] - p[axis]) / d;
    if (near > far) [near, far] = [far, near];
    t0 = Math.max(t0, near);
    t1 = Math.min(t1, far);
    if (t0 > t1) return false;
  }
  return true;
}

const DEBUG_PIPES = false;

/** Tuberías ya colocadas, para que las siguientes no las crucen ni se les monten encima. */
interface PlacedPipe {
  from: string;
  to: string;
  points: THREE.Vector3[];
  radius: number;
}

/**
 * Un trazado es válido si no atraviesa ningún equipo ajeno (cajas de estantería, tanques, máquinas) y no toca otra
 * tubería ya colocada. Las dos tuberías que comparten un equipo convergen en sus tramos de conexión: esos no cuentan.
 */
function pathIsClear(points: THREE.Vector3[], radius: number, ends: [string, string], placed: PlacedPipe[], obstacles: Map<string, THREE.Box3>, pipesToo = true): boolean {
  const last = points.length - 2;
  for (let i = 0; i <= last; i++) {
    for (const [id, box] of obstacles) {
      if (id === ends[0] || id === ends[1]) continue;
      if (segmentHitsBox(points[i], points[i + 1], box.clone().expandByScalar(radius + 0.08))) {
        if (DEBUG_PIPES) console.warn(`  ${ends[0]}→${ends[1]} choca con ${id}`);
        return false;
      }
    }
    for (const other of pipesToo ? placed : []) {
      const shares = other.from === ends[0] || other.from === ends[1] || other.to === ends[0] || other.to === ends[1];
      const otherLast = other.points.length - 2;
      for (let k = 0; k <= otherLast; k++) {
        if (shares && (i === 0 || i === last || k === 0 || k === otherLast)) continue;
        if (segmentDistance(points[i], points[i + 1], other.points[k], other.points[k + 1]) < radius + other.radius + 0.12) {
          if (DEBUG_PIPES) console.warn(`  ${ends[0]}→${ends[1]} choca con tubo ${other.from}→${other.to} (tramo ${i}/${k})`);
          return false;
        }
      }
    }
  }
  return true;
}

/**
 * Tuberías de los flujos `piped: true` del plano. Con `route` (red de agua) siguen el trazado del plano con el grosor
 * de su diámetro. Sin ruta: una bajante si el origen está por encima de la tapa del destino; si no, suben a un nivel
 * de rack, cruzan en ortogonal y bajan. El nivel (y el orden de los tramos) se elige tubería por tubería para que
 * no atraviese equipos ni cajas de estantería ni se cruce con otro tubo: se sube hasta encontrar un nivel libre.
 * Los puntos son de recorrido, no de ingeniería de detalle.
 */
function buildPipes(): void {
  const lanes = new Map<string, number>();
  const drops = new Map<string, number>();
  const site = doc.plant.site?.width_x ?? 112;
  const spacing = Math.min(4, Math.max(0.6, site / 30));
  const placed: PlacedPipe[] = [];
  const obstacles = new Map<string, THREE.Box3>();
  for (const [id, a] of assets) {
    a.root.updateMatrixWorld(true);
    obstacles.set(id, new THREE.Box3().setFromObject(a.root));
  }
  const radiusOf = (pipe: Pipe, src: number, bY: number): number =>
    pipe.diameter_in
      ? Math.max(0.025, (pipe.diameter_in * 0.0254 * 1.15) / 2)
      : pipe.route || src > bY + 0.3
        ? 0.035
        : /vapor/.test(pipe.medium.toLowerCase())
          ? 0.09
          : 0.06;
  // primero los trazados fijos (con ruta y bajantes); los de nivel de rack buscan sitio después
  const entries = (doc.pipes ?? []).flatMap((pipe, i) => {
    const nominalA = assetTop(pipe.from);
    const nominalB = assetTop(pipe.to);
    if (!nominalA || !nominalB || nominalA.distanceTo(nominalB) < 0.5) return [];
    // con `route` el plano ya trae los extremos; sin ella el tubo se ancla a la superficie real de cada equipo
    const a = pipe.route?.length ? nominalA : (attachPoint(pipe.from, nominalB) ?? nominalA);
    const b = pipe.route?.length ? nominalB : (attachPoint(pipe.to, nominalA) ?? nominalB);
    const src = assets.get(pipe.from)!.eq.position[2];
    let raw: THREE.Vector3[] | null = null;
    if (pipe.route?.length) raw = pipe.route.map(([x, y, z]) => toScene(x, y, z));
    else if (src > b.y + 0.3) {
      const lane = drops.get(pipe.to) ?? 0;
      drops.set(pipe.to, lane + 1);
      raw = dropPoints(pipe.from, b, lane);
    }
    return [{ pipe, i, a, b, raw, radius: radiusOf(pipe, src, b.y) }];
  });
  for (const e of entries) {
    if (e.raw && e.raw.length > 1) placed.push({ from: e.pipe.from, to: e.pipe.to, points: e.raw, radius: e.radius });
  }
  const fixed = [...placed];
  const free = entries.filter((e) => !e.raw);
  const laneOf = new Map(free.map((e) => {
    const key = `${Math.round(e.a.x)},${Math.round(e.a.z)}`;
    const lane = lanes.get(key) ?? 0;
    lanes.set(key, lane + 1);
    return [e, lane];
  }));
  /** Coloca los tubos de nivel de rack en el orden dado; devuelve los que no hallaron un trazado libre. */
  const placeAll = (order: typeof free): typeof free => {
    placed.length = 0;
    placed.push(...fixed);
    const blocked: typeof free = [];
    for (const e of order) {
      const { pipe, i, a, b, radius } = e;
      const lane = laneOf.get(e) ?? 0;
      // niveles candidatos: primero los de siempre (4,4 m y arriba), luego los de abajo hasta justo por encima de las tapas
      const floor = Math.max(a.y, b.y) + 0.45;
      const levels = Array.from({ length: 5 }, (_, n) => 4.4 + 0.35 * ((i + lane + n) % 5));
      for (let l = 4.4 - 0.35; l >= floor; l -= 0.35) levels.push(l);
      for (let l = 4.4 + 0.35 * 5; l < 14; l += 0.35) levels.push(l);
      const variants = (level: number): THREE.Vector3[][] => {
        const out = [
          [a, new THREE.Vector3(a.x, level, a.z), new THREE.Vector3(b.x, level, a.z), new THREE.Vector3(b.x, level, b.z), b],
          [a, new THREE.Vector3(a.x, level, a.z), new THREE.Vector3(a.x, level, b.z), new THREE.Vector3(b.x, level, b.z), b],
        ];
        // si la columna de subida cae justo bajo otro tubo, se corre en horizontal poco más arriba de la tapa
        for (const [dx, dz] of [[1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5], [3, 0], [-3, 0], [0, 3], [0, -3]]) {
          const lift = new THREE.Vector3(a.x, floor, a.z);
          const jog = new THREE.Vector3(a.x + dx, floor, a.z + dz);
          const up = new THREE.Vector3(a.x + dx, level, a.z + dz);
          out.push([a, lift, jog, up, new THREE.Vector3(b.x, level, up.z), new THREE.Vector3(b.x, level, b.z), b]);
          out.push([a, lift, jog, up, new THREE.Vector3(up.x, level, b.z), new THREE.Vector3(b.x, level, b.z), b]);
        }
        return out;
      };
      const find = (pipesToo: boolean) => {
        for (const level of levels) {
          const v = variants(level).find((c) => pathIsClear(c, radius, [pipe.from, pipe.to], placed, obstacles, pipesToo));
          if (v) return v;
        }
        return null;
      };
      let chosen = find(true);
      // sin un trazado del todo libre, el que al menos no atraviesa equipos (se cruza con un tubo, pasando uno por encima)
      if (!chosen) {
        blocked.push(e);
        chosen = find(false);
      }
      e.raw = chosen ?? variants(levels[0])[0];
      placed.push({ from: pipe.from, to: pipe.to, points: e.raw, radius });
    }
    return blocked;
  };
  // los que quedan bloqueados pasan al frente de la cola y los demás se acomodan a ellos
  let order = free;
  let blocked = placeAll(order);
  let best = { order, blocked };
  for (let pass = 0; pass < 12 && blocked.length; pass++) {
    order = [...blocked, ...order.filter((e) => !blocked.includes(e))];
    blocked = placeAll(order);
    if (blocked.length < best.blocked.length) best = { order, blocked };
  }
  if (best.order !== order) blocked = placeAll(best.order);
  for (const e of blocked) console.warn(`tubería ${e.pipe.from} → ${e.pipe.to}: sin trazado libre`);
  for (const { pipe, raw, radius } of entries) {
    if (!raw || raw.length < 2) continue;
    const points = raw.filter((p, k) => k === 0 || p.distanceTo(raw[k - 1]) > 1e-3);
    const color = MEDIUM_COLORS.find(([re]) => re.test(pipe.medium.toLowerCase()))?.[1] ?? "#aab3bd";
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.7 });
    const at = pipe.reduce_at;
    if (pipe.reduce_to_in && at !== undefined && at > 0 && at < points.length - 1) {
      // reductor: tramo grueso hasta el punto, cono de 0,2 m y tramo delgado hasta el final
      const small = Math.max(0.025, (pipe.reduce_to_in * 0.0254 * 1.15) / 2);
      const p0 = points[at];
      const dir = points[at + 1].clone().sub(p0);
      const cone = Math.min(0.2, dir.length() / 2);
      const q = p0.clone().addScaledVector(dir.normalize(), cone);
      const big = parts.pipe(points.slice(0, at + 1), radius, material, Math.min(0.4, radius * 3));
      big.name = `pipe-${pipe.from}-${pipe.to}`;
      const thin = parts.pipe([q, ...points.slice(at + 1)], small, material, Math.min(0.4, small * 3));
      const taper = new THREE.Mesh(new THREE.CylinderGeometry(small, radius, cone, 20), material);
      taper.position.copy(p0).addScaledVector(dir, cone / 2);
      taper.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      taper.castShadow = true;
      stage.content.add(big, thin, taper);
    } else {
      const mesh = parts.pipe(points, radius, material, Math.min(0.4, radius * 3));
      mesh.name = `pipe-${pipe.from}-${pipe.to}`;
      stage.content.add(mesh);
    }
    if (!pipe.route?.length) {
      // brida en cada extremo: se lee como una conexión al equipo y no como un tubo cortado
      for (const [end, next] of [[points[0], points[1]], [points[points.length - 1], points[points.length - 2]]] as const) {
        const flange = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.7, radius * 1.7, radius * 1.1, 16), material);
        flange.position.copy(end);
        flange.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), next.clone().sub(end).normalize());
        flange.castShadow = true;
        stage.content.add(flange);
      }
    }
    const cumulative = [0];
    for (let k = 1; k < points.length; k++) cumulative.push(cumulative[k - 1] + points[k].distanceTo(points[k - 1]));
    const beadMat = new THREE.MeshStandardMaterial({ color: "#000000", emissive: "#4de0ff", emissiveIntensity: 2.5 });
    const count = Math.max(2, Math.round(cumulative[cumulative.length - 1] / spacing));
    const beads = Array.from({ length: count }, () => {
      const bead = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.35, 10, 8), beadMat);
      bead.visible = false;
      stage.content.add(bead);
      return bead;
    });
    // Flechas visibles: se orientan con el signo de la velocidad hidráulica, no con una dirección decorativa fija.
    const arrowMat = new THREE.MeshStandardMaterial({ color: "#8ff3ff", emissive: "#4de0ff", emissiveIntensity: 1.2 });
    const arrows = Array.from({ length: Math.max(1, Math.ceil(count / 5)) }, () => {
      // Indicador deliberadamente más pequeño que la tubería: informa sentido sin ocultar válvulas ni equipos.
      const arrow = new THREE.Mesh(new THREE.ConeGeometry(Math.max(0.018, radius * 1.15), Math.max(0.08, radius * 3.2), 4), arrowMat);
      arrow.visible = false;
      stage.content.add(arrow);
      return arrow;
    });
    const perUnit: Record<string, number> = { "kg/h": 1, "L/h": 1, "m3/h": 1000 };
    const reference = pipe.rate && pipe.unit && perUnit[pipe.unit] ? pipe.rate * perUnit[pipe.unit] : null;
    pipeRuns.push({ from: pipe.from, to: pipe.to, points, cumulative, beads, arrows, links: pipe.links ?? [], reference, peak: 0, phase: 0, velocity: null, direction: 1 });
  }
}

function pointAt(run: PipeRun, distance: number): THREE.Vector3 {
  let k = 1;
  while (k < run.cumulative.length - 1 && run.cumulative[k] < distance) k++;
  const span = run.cumulative[k] - run.cumulative[k - 1] || 1;
  return run.points[k - 1].clone().lerp(run.points[k], Math.min(1, Math.max(0, (distance - run.cumulative[k - 1]) / span)));
}

function tangentAt(run: PipeRun, distance: number): THREE.Vector3 {
  let k = 1;
  while (k < run.cumulative.length - 1 && run.cumulative[k] < distance) k++;
  return run.points[k].clone().sub(run.points[k - 1]).normalize();
}

/**
 * Carga de una tubería: caudal medido ÷ caudal de referencia (1 = el del plano), con los enlaces del motor
 * que pasan por el tramo sumados (las dos marmitas comparten la bomba). Si el tramo no se simula, indicio por
 * estado: lleva producto si su origen simulado está en servicio (y, con fases, descargando), o, si el origen
 * no se simula, si lo está el destino (carga 1 o 0, no es un caudal medido).
 */
function pipeLoad(run: PipeRun): number {
  const states = run.links.map((id) => latestLinks[id]).filter((l): l is LinkState => !!l);
  const velocities = states.map((l) => l.velocity_m_s).filter((v): v is number => v !== undefined);
  const signedVelocity = velocities.reduce((sum, velocity) => sum + velocity, 0);
  run.direction = signedVelocity < 0 ? -1 : 1;
  run.velocity = velocities.length ? Math.max(...velocities.map((velocity) => Math.abs(velocity))) : null;
  if (states.length) {
    const flow = states.reduce((sum, l) => sum + (l.flow_kg_h ?? 0), 0);
    run.peak = Math.max(run.peak, flow);
    const reference = run.reference ?? run.peak;
    return reference > 0 ? flow / reference : 0;
  }
  const src = latest[run.from];
  if (src) return FLOWING.has(src.state) && (!src.phase || src.phase === "discharge") ? 1 : 0;
  const dst = latest[run.to];
  return dst && FLOWING.has(dst.state) ? 1 : 0;
}

/**
 * Las esferas avanzan más rápido y son más numerosas cuanto mayor es la carga; sin caudal desaparecen. En los tubos
 * de la red de agua avanzan a la velocidad real del agua (m/s del motor).
 */
function animatePipes(time: number): void {
  const dt = Math.min(0.25, Math.max(0, time - lastPipeTime));
  lastPipeTime = time;
  for (const run of pipeRuns) {
    const total = run.cumulative[run.cumulative.length - 1];
    const load = pipeLoad(run);
    run.phase += dt * (run.velocity !== null ? Math.max(0.05, run.velocity) : 2.5 * Math.min(2, Math.max(0.15, load)));
    const shown = load > 0.005 ? Math.max(1, Math.ceil(run.beads.length * Math.min(1, load))) : 0;
    run.beads.forEach((bead, i) => {
      bead.visible = i < shown;
      if (i < shown) {
        const phase = ((run.phase + (i * total) / run.beads.length) % total + total) % total;
        bead.position.copy(pointAt(run, run.direction > 0 ? phase : total - phase));
      }
    });
    run.arrows.forEach((arrow, i) => {
      arrow.visible = shown > 0;
      if (shown > 0) {
        const phase = ((run.phase + ((i + 0.5) * total) / run.arrows.length) % total + total) % total;
        const distance = run.direction > 0 ? phase : total - phase;
        arrow.position.copy(pointAt(run, distance));
        const tangent = tangentAt(run, distance).multiplyScalar(run.direction);
        arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
      }
    });
  }
}

// ------------------------------------------------------------------ selección
function select(id: string | null): void {
  selectedId = id;
  if (selection) {
    selection.parent?.remove(selection);
    selection.geometry.dispose();
    selection = null;
  }
  const asset = id ? assets.get(id) : undefined;
  if (asset) {
    const box = new THREE.Box3().setFromObject(asset.root);
    const size = box.getSize(new THREE.Vector3());
    selection = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(size.x + 0.3, size.y + 0.3, size.z + 0.3)), new THREE.LineBasicMaterial({ color: "#4EA7FF" }));
    selection.position.copy(box.getCenter(new THREE.Vector3()));
    stage.scene.add(selection);
  }
  renderAsset();
}

let downAt: [number, number] | null = null;
const raycaster = new THREE.Raycaster();
stage.renderer.domElement.addEventListener("pointerdown", (e) => (downAt = [e.clientX, e.clientY]));
stage.renderer.domElement.addEventListener("pointerup", (e) => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 4) return;
  const ndc = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, stage.camera);
  const roots = [...assets.values()].map((a) => a.root);
  const hit = raycaster.intersectObjects(roots, true)[0];
  let o: THREE.Object3D | null = hit?.object ?? null;
  while (o && !o.userData.assetId) o = o.parent;
  // El editor de rutas toma el clic cuando está agregando equipos a una etapa.
  if (o && productsApi?.pick(o.userData.assetId as string)) return;
  select(o ? (o.userData.assetId as string) : null);
});

// ------------------------------------------------------------------ cámaras
function focusRect(rect: [number, number, number, number], height = 4, distanceFactor = 0.85, base = 0, direction?: THREE.Vector3): void {
  const [x0, y0, w, l] = rect;
  const probe = new THREE.Mesh(new THREE.BoxGeometry(w, height, l));
  probe.position.copy(toScene(x0 + w / 2, y0 + l / 2)).setY(base + height / 2);
  probe.updateMatrixWorld(true);
  stage.frame(probe, distanceFactor, direction);
}

function buildCameras(): void {
  const box = $("cameras");
  const building = doc.zones.some((z) => (z.elevation ?? 0) > 0);
  const top = Math.max(6, ...doc.zones.map((z) => (z.elevation ?? 0) + z.height));
  const entries: [string, string, () => void][] = [
    ["VISTA GENERAL", "general", () => focusRect([0, 0, doc.plant.site?.width_x ?? 112, doc.plant.site?.length_y ?? 72], top, building ? 0.9 : 0.62, 0, new THREE.Vector3(1.2, 0.85, 1.35))],
  ];
  // Edificio por pisos: una cámara por zona (cada piso) y una por nivel de los equipos que lo declaran (la rejilla).
  const featured = building
    ? doc.zones
    : doc.zones.filter(
        (z) =>
          (["production", "utility"].includes(z.kind) && z.rect[2] * z.rect[3] >= 80) ||
          z.id.startsWith("sala-control") ||
          z.id === "almacen-semielaborado" ||
          // halls de pasajeros (aeropuerto): zonas administrativas con equipos simulados
          (z.kind === "admin" && doc.equipment.some((e) => e.zone === z.id && e.sim)),
      );
  const zoneDirections = [
    new THREE.Vector3(-1.25, 0.5, 1.1),
    new THREE.Vector3(1.15, 0.65, -1.25),
    new THREE.Vector3(0.8, 0.38, 1.7),
    new THREE.Vector3(-1.0, 0.8, -1.35),
  ];
  for (const [index, z] of featured.entries())
    entries.push([z.name.toUpperCase(), z.id, () => focusRect(z.rect, Math.max(3, z.height), 0.78, z.elevation ?? 0, zoneDirections[index % zoneDirections.length])]);
  if (building)
    for (const a of assets.values()) {
      const level = a.eq.params?.level;
      if (typeof level === "number") {
        const direction = level % 2 ? new THREE.Vector3(1.2, 0.42, -1.4) : new THREE.Vector3(-1.3, 0.48, 1.2);
        entries.push([`NIVEL ${level}`, `nivel-${level}`, () => stage.frame(a.root, 1.05, direction)]);
      }
    }
  // bodega de producto terminado junto con el patio de despacho (la planta de salsas): una sola vista
  const bodega = doc.zones.find((z) => z.id === "bodega-pt");
  const patio = doc.zones.find((z) => z.id === "patio-despacho");
  if (bodega && patio) {
    const x0 = Math.min(bodega.rect[0], patio.rect[0]);
    const y0 = Math.min(bodega.rect[1], patio.rect[1]);
    const x1 = Math.max(bodega.rect[0] + bodega.rect[2], patio.rect[0] + patio.rect[2]);
    const y1 = Math.max(bodega.rect[1] + bodega.rect[3], patio.rect[1] + patio.rect[3]);
    entries.push(["BODEGA Y DESPACHO", bodega.id, () => focusRect([x0, y0, x1 - x0, y1 - y0], bodega.height)]);
  }
  // línea de ensamble: las celdas de ensamble con su operario, en primer plano
  const cells = [...assets.values()].filter((a) => a.eq.type === "assembly_cell");
  if (cells.length) {
    const xs = cells.map((a) => a.eq.position[0]);
    const ys = cells.map((a) => a.eq.position[1]);
    const rect: [number, number, number, number] = [Math.min(...xs) - 6, Math.min(...ys) - 4, Math.max(...xs) - Math.min(...xs) + 12, Math.max(...ys) - Math.min(...ys) + 8];
    entries.push([
      "LÍNEA DE ENSAMBLE",
      "ensamble",
      () => {
        focusRect(rect, 3, 0.8);
        // las estanterías de producto terminado quedan al este: se mira desde el oeste para que no tapen la línea
        const target = stage.controls.target;
        const offset = stage.camera.position.clone().sub(target);
        stage.camera.position.set(target.x - Math.abs(offset.x) * 0.7, target.y + offset.y * 0.9, target.z + Math.abs(offset.z));
        stage.controls.update();
      },
    ]);
  }
  for (const [label, key, go] of entries) {
    const b = document.createElement("button");
    b.textContent = label;
    b.onclick = () => {
      go();
      box.querySelectorAll("button").forEach((item) => item.classList.toggle("active", item === b));
    };
    b.dataset.camera = key;
    box.appendChild(b);
  }
  const initial = url.get("camera") ?? "general";
  const initialEntry = entries.find((entry) => entry[1] === initial) ?? entries[0];
  initialEntry[2]();
  box.querySelector<HTMLButtonElement>(`[data-camera="${initialEntry[1]}"]`)?.classList.add("active");
}

// ------------------------------------------------------------------ recorrido
interface Pose {
  position: THREE.Vector3;
  target: THREE.Vector3;
  label: string;
}
const TRAVEL_S = 4;
const HOLD_S = 3;
let tourPoses: Pose[] = [];
let tour: { stop: number; startedAt: number } | null = null;

function poseOf(label: string): Pose {
  return { position: stage.camera.position.clone(), target: stage.controls.target.clone(), label };
}

/** Paradas: vista general y luego las zonas de producción y servicios grandes, de oeste a este (el sentido del flujo). */
function computeTourPoses(): void {
  const keep = poseOf("");
  const zones = doc.zones.filter((z) => ["production", "utility"].includes(z.kind) && z.rect[2] * z.rect[3] >= 80).sort((a, b) => a.rect[0] - b.rect[0]);
  tourPoses = [];
  focusRect([0, 0, doc.plant.site?.width_x ?? 112, doc.plant.site?.length_y ?? 72], 6, 0.62);
  tourPoses.push(poseOf("VISTA GENERAL"));
  for (const z of zones) {
    focusRect(z.rect, Math.max(3, z.height));
    tourPoses.push(poseOf(z.name.toUpperCase()));
  }
  stage.camera.position.copy(keep.position);
  stage.controls.target.copy(keep.target);
  stage.controls.update();
}

function startTour(): void {
  if (tour) return stopTour();
  if (!tourPoses.length) computeTourPoses();
  tour = { stop: 0, startedAt: stage.time };
  stage.controls.autoRotate = false;
  $("btn-tour").textContent = "■ DETENER RECORRIDO";
}

function stopTour(): void {
  tour = null;
  $("btn-tour").textContent = "▶ RECORRIDO";
  $("tour-stop").textContent = "";
}

function updateTour(): void {
  if (!tour) return;
  const elapsed = stage.time - tour.startedAt;
  const next = (tour.stop + 1) % tourPoses.length;
  const from = tourPoses[tour.stop];
  const to = tourPoses[next];
  const u = Math.min(1, elapsed / TRAVEL_S);
  const e = u * u * (3 - 2 * u);
  stage.camera.position.lerpVectors(from.position, to.position, e);
  stage.controls.target.lerpVectors(from.target, to.target, e);
  stage.controls.update();
  $("tour-stop").textContent = `${tour.stop + 1}/${tourPoses.length} → ${to.label}`;
  if (elapsed >= TRAVEL_S + HOLD_S) tour = { stop: next, startedAt: stage.time };
}

stage.renderer.domElement.addEventListener("pointerdown", () => tour && stopTour());
stage.renderer.domElement.addEventListener("wheel", () => tour && stopTour(), { passive: true });

// ------------------------------------------------------------------ simulación
function speedFromSlider(): number {
  return Math.round(Math.pow(10, Number($<HTMLInputElement>("speed").value)));
}

function send(msg: unknown): void {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
}

function disconnect(): void {
  const s = socket;
  socket = null;
  s?.close();
  stopReplay();
  $("btn-connect").textContent = "▶ SIMULAR";
  $("clock").textContent = "SIM · DESCONECTADA";
}

type SimMessage = {
  t: number;
  speed?: number;
  snapshot: { equipment: Record<string, EquipmentSnapshot>; lines: Parameters<typeof renderLines>[0]; links?: Record<string, LinkState> };
  events: Parameters<typeof appendEvents>[0];
};

function applyMessage(msg: SimMessage, label: string): void {
  messages++;
  latest = msg.snapshot.equipment;
  latestLinks = msg.snapshot.links ?? {};
  for (const [id, snap] of Object.entries(latest)) {
    const asset = assets.get(id);
    if (asset) asset.frame = { channels: snap.animation, state: snap.state, phase: snap.phase, variables: snap.variables, items: snap.items, label: id.toUpperCase() };
    const values = Object.fromEntries(Object.entries(snap.variables).filter(([, value]) => typeof value === "number" && Number.isFinite(value))) as Record<string, number>;
    const samples = equipmentHistory.get(id) ?? [];
    if (!samples.length || samples.at(-1)!.t !== msg.t) samples.push({ t: msg.t, values });
    if (samples.length > 720) samples.shift();
    equipmentHistory.set(id, samples);
  }
  for (const piece of controlPieces) piece.feed?.(latest, msg.t);
  beltPlc?.update(latest);
  renderAsset();
  renderLines(msg.snapshot.lines);
  appendEvents(msg.events);
  const t = msg.t;
  const hh = String(Math.floor(t / 3600)).padStart(2, "0");
  const mm = String(Math.floor((t % 3600) / 60)).padStart(2, "0");
  const ss = String(Math.floor(t % 60)).padStart(2, "0");
  $("clock").textContent = `${label} ${hh}:${mm}:${ss} · ×${msg.speed ?? speedFromSlider()}`;
}

function connect(): void {
  // La escena no crea runtimes propios: el PLC es quien inicia la operación y entrega su session_id.
  if (!sessionId) {
    const apiQuery = url.get("api") ? `&api=${encodeURIComponent(apiOrigin)}` : "";
    location.href = `/plc.html?plant=${doc.plant.id}${apiQuery}`;
    return;
  }
  if (socket || replay) return disconnect();
  const q = new URLSearchParams({ speed: String(speedFromSlider()) });
  const scenario = $<HTMLSelectElement>("scenario").value;
  if (scenario) q.set("scenario", scenario);
  const endpoint = sessionId ? `/api/plants/${doc.plant.id}/sessions/${sessionId}?role=viewer` : `/api/plants/${doc.plant.id}/simulate?${q}`;
  const ws = new WebSocket(websocketUrl(endpoint));
  socket = ws;
  equipmentHistory.clear();
  let received = 0;
  $("btn-connect").textContent = sessionId ? "● SIGUIENDO OPERACIÓN PLC" : "■ DETENER";
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.error) {
      $("clock").textContent = `ERROR · ${msg.error}`.slice(0, 60);
      return;
    }
    received++;
    applyMessage(msg, "SIM");
  };
  // sin API (sitio publicado): se reproduce la grabación de la operación normal
  ws.onclose = () => {
    if (socket !== ws) return;
    socket = null;
    if (sessionId) disconnect();
    else if (received === 0) void startReplay();
    else disconnect();
  };
  ws.onerror = () => {
    if (received === 0) $("clock").textContent = "SIM · SIN API, CARGANDO GRABACIÓN…";
  };
}

// ------------------------------------------------------------------ reproducción grabada (sin API)
// La genera tools/deploy/export_static_plants.py con twin_emulator_api.replay: cada cuadro trae solo lo que cambió.
type Replay = { interval_s: number; frames: SimMessage[] };
let replayData: Replay | null = null;
let replay: { timer: number; t: number; next: number; state: Record<string, EquipmentSnapshot>; links: Record<string, LinkState> } | null = null;

async function startReplay(): Promise<void> {
  if (!replayData) {
    const res = await fetch(`/api/replays/${doc.plant.id}.json`).catch(() => null);
    if (!res?.ok) {
      $("btn-connect").textContent = "▶ SIMULAR";
      $("clock").textContent = "SIM · API NO DISPONIBLE (uv run uvicorn …)";
      return;
    }
    replayData = (await res.json()) as Replay;
  }
  if (!replayData.frames.length) return;
  if ($<HTMLSelectElement>("scenario").value) appendEvents([{ t: replayData.frames[0].t, type: "grabación: solo operación normal (los escenarios necesitan la API)" }]);
  const TICK_MS = 100;
  replay = { timer: 0, t: replayData.frames[0].t, next: 0, state: {}, links: {} };
  $("btn-connect").textContent = "■ DETENER";
  const tick = () => {
    if (!replay || !replayData) return;
    const frames = replayData.frames;
    if (!paused) replay.t += (speedFromSlider() * TICK_MS) / 1000;
    if (replay.next >= frames.length) {
      // vuelve a empezar: el primer cuadro va completo
      replay.next = 0;
      replay.state = {};
      replay.links = {};
      replay.t = frames[0].t;
    }
    const events: SimMessage["events"] = [];
    let last: SimMessage | null = null;
    while (replay.next < frames.length && (frames[replay.next].t <= replay.t || last === null && replay.next === 0)) {
      const f = frames[replay.next++];
      for (const [id, delta] of Object.entries(f.snapshot.equipment)) replay.state[id] = { ...replay.state[id], ...delta };
      Object.assign(replay.links, f.snapshot.links ?? {});
      events.push(...f.events);
      last = f;
    }
    if (last) applyMessage({ t: last.t, snapshot: { equipment: { ...replay.state }, lines: last.snapshot.lines, links: { ...replay.links } }, events }, "GRABACIÓN");
  };
  tick();
  replay.timer = window.setInterval(tick, TICK_MS);
}

function stopReplay(): void {
  if (replay) window.clearInterval(replay.timer);
  replay = null;
}

// ------------------------------------------------------------------ HUD
function fmt(v: unknown, unit = ""): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "number") {
    const a = Math.abs(v);
    const s = Number.isInteger(v) ? v.toLocaleString("es-CO") : a >= 1000 ? v.toFixed(0) : a >= 100 ? v.toFixed(1) : a >= 1 ? v.toFixed(2) : v.toFixed(3);
    return unit && unit !== "degC" && unit !== "%" ? `${s} ${unit}` : unit ? `${s} ${unit === "degC" ? "°C" : unit}` : s;
  }
  return String(v);
}

function renderAssetChart(): void {
  const asset = selectedId ? assets.get(selectedId) : undefined;
  const spec = asset?.eq.sim ? specs[asset.eq.sim.type] : undefined;
  const samples = selectedId ? equipmentHistory.get(selectedId) ?? [] : [];
  const available = (spec?.variables ?? []).filter((variable) => samples.some((sample) => Number.isFinite(sample.values[variable.id])));
  const select = $<HTMLSelectElement>("asset-chart-variable");
  const previouslySelected = select.value;
  select.innerHTML = available.map((variable) => `<option value="${variable.id}">${variable.id} · ${variable.unit || "sin unidad"}</option>`).join("");
  select.value = previouslySelected;
  if (!available.length) {
    $("asset-chart-content").innerHTML = `<p class="dim">Aún no hay muestras numéricas del equipo. Inicie la simulación para registrar su tendencia.</p>`;
    return;
  }
  const variable = available.some((item) => item.id === select.value) ? select.value : available[0].id;
  select.value = variable;
  const unit = available.find((item) => item.id === variable)?.unit ?? "";
  const points = samples.filter((sample) => Number.isFinite(sample.values[variable]));
  const values = points.map((sample) => sample.values[variable]);
  const width = 920, height = 400, left = 58, right = 20, top = 18, bottom = 36;
  const low = Math.min(...values), high = Math.max(...values), range = Math.max(0.01, high - low);
  const x = (index: number) => left + (index * (width - left - right)) / Math.max(1, points.length - 1);
  const y = (reading: number) => top + height - top - bottom - ((reading - low) / range) * (height - top - bottom);
  const grid = [0, .25, .5, .75, 1].map((fraction) => { const reading = low + range * fraction; return `<line class="axis" x1="${left}" x2="${width - right}" y1="${y(reading)}" y2="${y(reading)}"/><text x="${left - 7}" y="${y(reading) + 4}" text-anchor="end">${fmt(reading, unit)}</text>`; }).join("");
  const times = [0, .25, .5, .75, 1].map((fraction) => { const sample = points[Math.round((points.length - 1) * fraction)]; const seconds = Math.floor(sample.t); return `<text x="${left + fraction * (width - left - right)}" y="${height - 10}" text-anchor="middle">${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}</text>`; }).join("");
  const line = points.map((sample, index) => `${x(index)},${y(sample.values[variable])}`).join(" ");
  $("asset-chart-title").textContent = `${asset!.eq.id.toUpperCase()} · ${variable.toUpperCase()}`;
  $("asset-chart-content").innerHTML = `<svg class="asset-chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Tendencia de ${variable}"><g class="day-axis">${grid}${times}</g><polyline points="${line}" fill="none" stroke="#4EA7FF" stroke-width="3"/></svg><p class="asset-chart-legend"><i></i> Señal simulada publicada por el equipo · mín. ${fmt(low, unit)} · máx. ${fmt(high, unit)} · ${points.length} muestras</p>`;
}

function renderAsset(): void {
  const asset = selectedId ? assets.get(selectedId) : undefined;
  const snap = selectedId ? latest[selectedId] : undefined;
  const spec = asset?.eq.sim ? specs[asset.eq.sim.type] : undefined;
  $("asset-name").textContent = asset ? asset.eq.id.toUpperCase() : "Haz clic en un equipo";
  $("asset-meta").textContent = asset
    ? `${spec?.name ?? asset.eq.type}${doc.catalog?.sizes[asset.eq.id] ? ` ${doc.catalog.sizes[asset.eq.id].toLowerCase()}` : ""} · ${asset.eq.zone}${asset.eq.sim ? "" : " · no simulado"}`
    : "";
  const st = $("state");
  st.textContent = (snap?.state ?? "—").toUpperCase();
  st.className = `state ${snap?.state ?? ""}`;
  $("phase").textContent = (snap?.phase ?? "—").toUpperCase();
  $("faults").innerHTML = (snap?.active_faults ?? []).map((f) => `<span>${f}</span>`).join("");
  $("vars").innerHTML = (spec?.variables ?? [])
    .map((v) => `<div title="${v.description}"><span>${v.id}</span><span>${fmt(snap?.variables?.[v.id], v.unit)}</span></div>`)
    .join("");
  $("asset-chart").hidden = !asset?.eq.sim;
  const cmds = $("commands");
  if (cmds.dataset.for !== (selectedId ?? "")) {
    cmds.dataset.for = selectedId ?? "";
    cmds.innerHTML = "";
    if (spec) {
      for (const c of (spec.commands ?? []).filter((c) => !c.args)) cmds.appendChild(commandButton(c.id.replace(/_/g, " ").toUpperCase(), c.description, c.id, {}));
      for (const f of spec.faults ?? []) cmds.appendChild(commandButton(`⚠ ${f.id.replace(/_/g, " ")}`, f.description, "inject_fault", { fault: f.id }));
    }
  }
}

// ------------------------------------------------------------------ PLC de bandas
let beltPlc: ReturnType<typeof createBeltPlc> | null = null;
function buildBeltPlc(): void {
  const belts = doc.equipment
    .filter((e) => e.sim?.type === "belt-conveyor" && e.sim.params.item === "bag")
    .map((e) => ({ id: e.id, zone: e.zone, speed: Number(e.sim!.params.speed_m_s ?? 0.5) }));
  if (!belts.length) return;
  $("plc-toggle-wrap").classList.remove("hidden");
  beltPlc = createBeltPlc($("belt-plc"), belts, {
    send: (equipment, command, args) => {
      if (replay || socket?.readyState !== WebSocket.OPEN) return false;
      send({ equipment, command, args });
      return true;
    },
    select: (id) => select(id),
  });
  $("btn-plc").onclick = () => beltPlc?.toggle();
  if (url.get("plc") === "1") beltPlc.show();
}

function commandButton(label: string, title: string, command: string, args: Record<string, unknown>): HTMLButtonElement {
  const b = document.createElement("button");
  b.textContent = label;
  b.title = title;
  b.onclick = () =>
    replay
      ? appendEvents([{ t: replay.t, type: "grabación: los comandos y fallas necesitan la API" }])
      : send({ equipment: selectedId, command, args });
  return b;
}

function renderLines(lines: Record<string, { name: string; unit?: string; output_units: number; output_per_h: number | null }>): void {
  $("lines").innerHTML = Object.entries(lines)
    .map(([id, ln]) => `<div class="line" data-line="${id}"><b>${ln.name}</b><span>${fmt(ln.output_units)} ${ln.unit ?? "u"} · ${ln.output_per_h === null ? "—" : fmt(ln.output_per_h)} ${ln.unit ?? "u"}/h</span></div>`)
    .join("");
}

function appendEvents(events: { t: number; type: string; equipment_id?: string; [k: string]: unknown }[]): void {
  const ol = $("events");
  for (const e of events.slice(-30)) {
    const li = document.createElement("li");
    li.className = e.type;
    li.innerHTML = `${new Date(e.t * 1000).toISOString().slice(11, 19)} <b>${e.type}</b> ${e.equipment_id ?? ""}`;
    ol.prepend(li);
  }
  while (ol.children.length > 120) ol.lastChild?.remove();
}

function buildLighting(): void {
  const el = $("lighting");
  const labels: Record<LightingPreset, string> = { night: "NOCHE", day: "DÍA", golden: "ATARDECER" };
  for (const preset of ["night", "day", "golden"] as LightingPreset[]) {
    const b = document.createElement("button");
    b.textContent = labels[preset];
    b.classList.toggle("active", stage.lighting === preset);
    b.onclick = () => {
      stage.setLighting(preset);
      clearFog();
      el.querySelectorAll("button").forEach((x) => x.classList.toggle("active", x === b));
    };
    el.appendChild(b);
  }
}

// ------------------------------------------------------------------ arranque
async function start(): Promise<void> {
  const plantId = url.get("plant") ?? "sauce-plant-v1";
  await bootStage(6, "Conectando con el gemelo digital…");
  const res = await fetch(apiUrl(`/api/plants/${plantId}`)).catch(() => null);
  if (!res?.ok) {
    const message = `No se pudo cargar ${plantId}. Configure ?api=https://host-del-emulador.`;
    $("plant-name").textContent = message;
    bootError(message);
    return;
  }
  await bootStage(22, "Descargando el plano de la planta…");
  doc = await res.json();
  // La cuadrícula de referencia sigue el piso más bajo declarado. Así un sótano/foso del plano no parece equipo enterrado
  // y se conservan intactas todas las cotas hidráulicas, equipos y rutas.
  stage.setGroundElevation(Math.min(...doc.zones.map((zone) => zone.elevation ?? 0)));
  $<HTMLAnchorElement>("link-equipos").href = `/equipos.html?plant=${plantId}`;
  const plcLink = $<HTMLAnchorElement>("link-plc");
  const plcSchema = await fetch(apiUrl(`/api/plants/${plantId}/plc-schema`)).catch(() => null);
  if (plcSchema?.ok) {
    const apiQuery = url.get("api") ? `&api=${encodeURIComponent(apiOrigin)}` : "";
    plcLink.href = `/plc.html?plant=${plantId}${apiQuery}`;
    plcLink.hidden = false;
  }
  $("plant-name").textContent = doc.plant.name.toUpperCase();
  const simulated = doc.equipment.filter((e) => e.sim).length;
  await bootStage(34, "Construyendo zonas y pisos…");
  buildZones();
  await bootStage(48, `Montando ${doc.equipment.length} equipos…`);
  buildEquipment();
  await bootStage(66, "Tendiendo pasarelas y rutas…");
  buildWalkways();
  if (url.get("routes") !== "0") updateRoutes = buildRoutes(doc.aisles ?? [], doc.routes ?? [], stage.content, toScene, {
      channels: (id) => assets.get(id)?.frame.channels,
      bay: (id) => {
        const a = assets.get(id);
        if (!a || a.eq.sim?.type !== "forklift-fleet") return undefined;
        const n = Number(a.eq.sim.params.vehicles ?? a.eq.params?.vehicles ?? 0);
        return n > 0 ? { center: a.root.position.clone(), vehicles: Math.min(12, n) } : undefined;
      },
    });
  await bootStage(78, "Procesando conexiones y tuberías…");
  buildPipes();
  $("plant-meta").textContent = `${doc.equipment.length} activos · ${simulated} simulados · ${doc.zones.length} zonas · ${pipeRuns.length} tuberías · ${doc.walkways.length} pasarelas`;
  await bootStage(88, "Configurando iluminación y cámaras…");
  buildLighting();
  buildCameras();

  const sel = $<HTMLSelectElement>("scenario");
  sel.innerHTML = '<option value="">(operación normal)</option>';
  for (const [id, sc] of Object.entries(doc.scenarios)) {
    const o = document.createElement("option");
    o.value = id;
    o.textContent = id;
    o.title = sc.description;
    sel.appendChild(o);
  }
  $("btn-connect").onclick = connect;
  $("btn-tour").onclick = startTour;
  $("btn-pause").onclick = () => {
    paused = !paused;
    send({ pause: paused });
    $("btn-pause").classList.toggle("active", paused);
  };
  $<HTMLInputElement>("speed").oninput = () => {
    $("speed-val").textContent = `×${speedFromSlider()}`;
    send({ speed: speedFromSlider() });
  };
  if (!simulated) $("btn-connect").setAttribute("disabled", "");
  buildBeltPlc();
  if (doc.catalog?.products.length) {
    productsApi = buildProducts({ plantId, catalog: doc.catalog, stage, rootOf: (id) => assets.get(id)?.root, select });
    updateProducts = productsApi.update;
  }
  if (url.get("select")) select(url.get("select"));
  const focusAsset = url.get("focus") ? assets.get(url.get("focus")!) : undefined;
  if (focusAsset) stage.frame(focusAsset.root, 1.1);
  const look = url.get("look")?.split(",").map(Number);
  if (look?.length === 6 && look.every(Number.isFinite)) {
    stage.camera.position.copy(toScene(look[0], look[1], look[2]));
    stage.controls.target.copy(toScene(look[3], look[4], look[5]));
    stage.controls.update();
  }
  if (url.get("tour") === "1") startTour();
  if (url.get("autosim") === "1" && simulated) {
    if (url.get("scenario")) sel.value = url.get("scenario")!;
    if (url.get("speed")) {
      $<HTMLInputElement>("speed").value = String(Math.log10(Number(url.get("speed"))));
      $("speed-val").textContent = `×${speedFromSlider()}`;
    }
    connect();
  }
  $("asset-chart").onclick = () => {
    if (!selectedId) return;
    renderAssetChart();
    $<HTMLDialogElement>("asset-chart-modal").showModal();
  };
  $("asset-chart-close").onclick = () => $<HTMLDialogElement>("asset-chart-modal").close();
  $<HTMLSelectElement>("asset-chart-variable").onchange = renderAssetChart;
  if (sessionId) {
    $("btn-connect").textContent = "● SIGUIENDO OPERACIÓN PLC";
    $<HTMLButtonElement>("btn-connect").disabled = true;
    $<HTMLSelectElement>("scenario").disabled = true;
    connect();
  } else {
    $("btn-connect").textContent = "▣ ABRIR PLC MASTER";
    $<HTMLSelectElement>("scenario").disabled = true;
  }
  renderAsset();
  await bootStage(94, "Renderizando la escena 3D…");
  loop();
}

/**
 * Ciclo ilustrativo de una inyectora cuando no hay simulación conectada (p. ej. en la versión publicada sin la API):
 * cierra el molde, inyecta, enfría, abre, expulsa y el robot lleva la pieza a la canastilla. Mismas fases y canales que el simulador.
 */
function ambientInjectionFrame(id: string, params: Record<string, unknown>, time: number): AnimationFrame {
  const cycle = Math.max(8, Number(params.cycle_s ?? 14));
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 997;
  const x = ((time + (h % 17)) % cycle) / cycle;
  const seg = (a: number, b: number) => Math.min(1, Math.max(0, (x - a) / (b - a)));
  let moldOpen = 1, ejector = 0, screw = 1, rpm = 0, robot = 0, part = 0;
  let phase = "mold_close";
  if (x < 0.12) { const p = seg(0, 0.12); moldOpen = 1 - p; robot = 1 - p; phase = "mold_close"; }
  else if (x < 0.22) { const p = seg(0.12, 0.22); moldOpen = 0; screw = 1 - 0.92 * p; part = p; phase = "injection"; }
  else if (x < 0.3) { moldOpen = 0; screw = 0.08; part = 1; phase = "holding"; }
  else if (x < 0.65) { const p = seg(0.3, 0.65); moldOpen = 0; part = 1; screw = 0.08 + 0.92 * Math.min(1, p / 0.6); rpm = p < 0.6 ? 140 : 0; phase = "cooling"; }
  else if (x < 0.75) { const p = seg(0.65, 0.75); moldOpen = p; part = 1; robot = 0.45 * p; phase = "mold_open"; }
  else { const p = seg(0.75, 1); ejector = Math.sin(p * Math.PI); robot = 0.45 + 0.55 * p; part = p < 0.4 ? 1 : 0; phase = "ejection"; }
  return {
    channels: { mold_open: moldOpen, ejector, screw_position: screw, screw_rpm: rpm, robot_progress: robot, part_in_mold: part, heat_glow: 0.7, stack_light: 1 },
    state: "running",
    phase,
    label: id.toUpperCase(),
  };
}

let frames = 0;
let updateRoutes: ((time: number, dt: number) => void) | null = null;
let updateProducts: ((time: number) => void) | null = null;
let productsApi: ProductsApi | null = null;
function loop(): void {
  const dt = stage.render();
  updateRoutes?.(stage.time, dt);
  for (const a of assets.values()) {
    if (a.model && messages === 0 && a.eq.sim?.type === "injection-molding-machine") a.frame = ambientInjectionFrame(a.eq.id, a.eq.sim.params, stage.time);
    a.model?.update(a.frame, dt);
  }
  animatePipes(stage.time);
  updateProducts?.(stage.time);
  for (const piece of controlPieces) piece.redraw?.();
  updateTour();
  frames++;
  if (frames === 12) bootDone();
  const wantsData = url.get("autosim") === "1";
  if (shotMode && frames >= 40 && humansPending() === 0 && (!wantsData || messages >= Number(url.get("messages") ?? 3))) (window as unknown as { __ready: boolean }).__ready = true;
  requestAnimationFrame(loop);
}

void start();
Object.assign(window, { stage, THREE });
