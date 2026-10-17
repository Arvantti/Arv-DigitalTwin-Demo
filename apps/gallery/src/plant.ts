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
 *   &focus=<id de equipo>          acerca la cámara a ese equipo
 *   &autosim=1&scenario=boiler-trip&speed=120   conecta la simulación al cargar
 *   &tour=1                        inicia el recorrido de cámara al cargar
 *   &shot=1                        oculta la interfaz y marca window.__ready (con autosim, tras recibir datos)
 */
import yaml from "js-yaml";
import * as THREE from "three";
import { buildRoutes, type Aisle, type Route } from "./routes.ts";
import { type AnimationFrame, type EquipmentModel, type LightingPreset, Stage, parts, textures } from "@twin/3d";
import { geometryBuilders, rawSpecs } from "@twin/equipment-library/registry.ts";
import { dockLeveler, deliveryTruck, palletRack, passThroughDoor } from "./warehouse.ts";
import { type ControlPiece, type PanelConfig, controlPanel, operatorDesk, plcCabinet } from "./control-room.ts";
import "./styles.css";

interface Zone {
  id: string;
  name: string;
  kind: string;
  hygiene_class: string;
  rect: [number, number, number, number];
  height: number;
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
  /** Ids de los enlaces del motor que pasan por este tramo; vacío si el tramo no se simula. */
  links: string[];
}
interface LinkState {
  flow_kg_h?: number;
  units_per_min?: number;
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
}
interface EquipmentSnapshot {
  state: string;
  phase: string | null;
  animation: Record<string, number>;
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

// ------------------------------------------------------------------ construcción
function buildZones(): void {
  for (const z of doc.zones) {
    const [x0, y0, w, l] = z.rect;
    const color = HYGIENE_COLORS[z.hygiene_class] ?? "#555";
    const center = toScene(x0 + w / 2, y0 + l / 2);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(w - 0.2, l - 0.2),
      new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.05, transparent: true, opacity: z.kind === "exterior" ? 0.55 : 0.9 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.copy(center).setY(0.02);
    floor.receiveShadow = true;
    floor.name = `zone-floor-${z.id}`;
    stage.content.add(floor);
    if (z.height > 0) {
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(w, z.height, l)),
        new THREE.LineBasicMaterial({ color: "#9fd4f5", transparent: true, opacity: 0.45 }),
      );
      edges.position.copy(center).setY(z.height / 2);
      edges.name = `zone-frame-${z.id}`;
      stage.content.add(edges);
    }
    const tex = textures.textTexture([z.name.toUpperCase()], { width: 1024, height: 96, fg: "#ffffff", font: "700 56px Rajdhani, Arial, sans-serif", align: "left" });
    if (tex) {
      const lw = Math.min(w - 0.6, 11);
      const label = new THREE.Mesh(new THREE.PlaneGeometry(lw, lw * (96 / 1024)), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.85 }));
      label.rotation.x = -Math.PI / 2;
      label.position.copy(toScene(x0 + 0.3 + lw / 2, y0 + l - 0.6)).setY(0.03);
      stage.content.add(label);
    }
  }
}

const PLACEHOLDER = new THREE.MeshStandardMaterial({ color: "#7f8b97", roughness: 0.65, metalness: 0.25 });
const RAIL = new THREE.MeshStandardMaterial({ color: "#e0a82e", roughness: 0.5, metalness: 0.4 });

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
  pallet_rack: (eq) => palletRack(eq.footprint),
  pass_through_door: (eq) => passThroughDoor(eq.footprint),
  dock_leveler: (eq) => dockLeveler(eq.footprint),
  delivery_truck: (eq) => deliveryTruck(eq.footprint, eq.params?.state as string | undefined),
};

function buildEquipment(): void {
  for (const eq of doc.equipment) {
    let root: THREE.Object3D;
    let model: EquipmentModel | null = null;
    const builder = eq.sim ? geometryBuilders[eq.sim.type] : undefined;
    const control = controlBuilders[eq.type];
    const warehouse = warehouseBuilders[eq.type];
    if (control) {
      const piece = control(eq);
      controlPieces.push(piece);
      root = piece.root;
    } else if (warehouse) {
      root = warehouse(eq);
    } else if (builder && eq.sim) {
      model = builder(eq.sim.params);
      root = model.root;
    } else root = placeholder(eq);
    root.position.copy(toScene(eq.position[0], eq.position[1], eq.position[2]));
    root.rotation.y = THREE.MathUtils.degToRad(eq.rotation_deg ?? 0);
    root.userData.assetId = eq.id;
    stage.content.add(root);
    assets.set(eq.id, { eq, root, model, frame: { channels: {}, state: "idle", label: eq.id.toUpperCase() } });
  }
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
  links: string[];
  /** Caudal de referencia en kg/h: el del plano si viene en kg/h o L/h; si no, el máximo visto en la simulación. */
  reference: number | null;
  peak: number;
  phase: number;
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

/** Tuberías de los flujos `piped: true` del plano: suben a un nivel de rack, cruzan en ortogonal y bajan. Los puntos son de recorrido, no de ingeniería de detalle. */
function buildPipes(): void {
  const lanes = new Map<string, number>();
  for (const [i, pipe] of (doc.pipes ?? []).entries()) {
    const a = assetTop(pipe.from);
    const b = assetTop(pipe.to);
    if (!a || !b || a.distanceTo(b) < 0.5) continue;
    const key = `${Math.round(a.x)},${Math.round(a.z)}`;
    const lane = lanes.get(key) ?? 0;
    lanes.set(key, lane + 1);
    const level = 4.4 + 0.35 * ((i + lane) % 5);
    const raw = [a, new THREE.Vector3(a.x, level, a.z), new THREE.Vector3(b.x, level, a.z), new THREE.Vector3(b.x, level, b.z), b];
    const points = raw.filter((p, k) => k === 0 || p.distanceTo(raw[k - 1]) > 1e-3);
    const color = MEDIUM_COLORS.find(([re]) => re.test(pipe.medium.toLowerCase()))?.[1] ?? "#aab3bd";
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.7 });
    const radius = /vapor/.test(pipe.medium.toLowerCase()) ? 0.09 : 0.06;
    const mesh = parts.pipe(points, radius, material, 0.4);
    mesh.name = `pipe-${pipe.from}-${pipe.to}`;
    stage.content.add(mesh);
    const cumulative = [0];
    for (let k = 1; k < points.length; k++) cumulative.push(cumulative[k - 1] + points[k].distanceTo(points[k - 1]));
    const beadMat = new THREE.MeshStandardMaterial({ color: "#000000", emissive: "#4de0ff", emissiveIntensity: 2.5 });
    const count = Math.max(2, Math.round(cumulative[cumulative.length - 1] / 4));
    const beads = Array.from({ length: count }, () => {
      const bead = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.35, 10, 8), beadMat);
      bead.visible = false;
      stage.content.add(bead);
      return bead;
    });
    const reference = pipe.rate && (pipe.unit === "kg/h" || pipe.unit === "L/h") ? pipe.rate : null;
    pipeRuns.push({ from: pipe.from, to: pipe.to, points, cumulative, beads, links: pipe.links ?? [], reference, peak: 0, phase: 0 });
  }
}

function pointAt(run: PipeRun, distance: number): THREE.Vector3 {
  let k = 1;
  while (k < run.cumulative.length - 1 && run.cumulative[k] < distance) k++;
  const span = run.cumulative[k] - run.cumulative[k - 1] || 1;
  return run.points[k - 1].clone().lerp(run.points[k], Math.min(1, Math.max(0, (distance - run.cumulative[k - 1]) / span)));
}

/**
 * Carga de una tubería: caudal medido ÷ caudal de referencia (1 = el del plano), con los enlaces del motor
 * que pasan por el tramo sumados (las dos marmitas comparten la bomba). Si el tramo no se simula, indicio por
 * estado: lleva producto si su origen simulado está en servicio (y, con fases, descargando), o, si el origen
 * no se simula, si lo está el destino (carga 1 o 0, no es un caudal medido).
 */
function pipeLoad(run: PipeRun): number {
  const states = run.links.map((id) => latestLinks[id]).filter((l): l is LinkState => !!l);
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

/** Las esferas avanzan más rápido y son más numerosas cuanto mayor es la carga; sin caudal desaparecen. */
function animatePipes(time: number): void {
  const dt = Math.min(0.25, Math.max(0, time - lastPipeTime));
  lastPipeTime = time;
  for (const run of pipeRuns) {
    const total = run.cumulative[run.cumulative.length - 1];
    const load = pipeLoad(run);
    run.phase += dt * 2.5 * Math.min(2, Math.max(0.15, load));
    const shown = load > 0.005 ? Math.max(1, Math.ceil(run.beads.length * Math.min(1, load))) : 0;
    run.beads.forEach((bead, i) => {
      bead.visible = i < shown;
      if (i < shown) bead.position.copy(pointAt(run, ((run.phase + (i * total) / run.beads.length) % total + total) % total));
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
    selection = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(size.x + 0.3, size.y + 0.3, size.z + 0.3)), new THREE.LineBasicMaterial({ color: "#ffb21e" }));
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
  select(o ? (o.userData.assetId as string) : null);
});

// ------------------------------------------------------------------ cámaras
function focusRect(rect: [number, number, number, number], height = 4, distanceFactor = 0.85): void {
  const [x0, y0, w, l] = rect;
  const probe = new THREE.Mesh(new THREE.BoxGeometry(w, height, l));
  probe.position.copy(toScene(x0 + w / 2, y0 + l / 2)).setY(height / 2);
  probe.updateMatrixWorld(true);
  stage.frame(probe, distanceFactor);
}

function buildCameras(): void {
  const box = $("cameras");
  const entries: [string, string, () => void][] = [["VISTA GENERAL", "general", () => focusRect([0, 0, doc.plant.site?.width_x ?? 112, doc.plant.site?.length_y ?? 72], 6, 0.62)]];
  const featured = doc.zones.filter((z) => (["production", "utility"].includes(z.kind) && z.rect[2] * z.rect[3] >= 80) || z.id.startsWith("sala-control"));
  for (const z of featured) entries.push([z.name.toUpperCase(), z.id, () => focusRect(z.rect, Math.max(3, z.height))]);
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
  for (const [label, key, go] of entries) {
    const b = document.createElement("button");
    b.textContent = label;
    b.onclick = go;
    b.dataset.camera = key;
    box.appendChild(b);
  }
  const initial = url.get("camera") ?? "general";
  (entries.find((e) => e[1] === initial) ?? entries[0])[2]();
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
  socket?.close();
  socket = null;
  $("btn-connect").textContent = "▶ SIMULAR";
  $("clock").textContent = "SIM · DESCONECTADA";
}

function connect(): void {
  if (socket) return disconnect();
  const q = new URLSearchParams({ speed: String(speedFromSlider()) });
  const scenario = $<HTMLSelectElement>("scenario").value;
  if (scenario) q.set("scenario", scenario);
  const proto = location.protocol === "https:" ? "wss" : "ws";
  socket = new WebSocket(`${proto}://${location.host}/api/plants/${doc.plant.id}/simulate?${q}`);
  $("btn-connect").textContent = "■ DETENER";
  socket.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.error) {
      $("clock").textContent = `ERROR · ${msg.error}`.slice(0, 60);
      return;
    }
    messages++;
    latest = msg.snapshot.equipment;
    latestLinks = msg.snapshot.links ?? {};
    for (const [id, snap] of Object.entries(latest) as [string, EquipmentSnapshot][]) {
      const asset = assets.get(id);
      if (asset) asset.frame = { channels: snap.animation, state: snap.state, phase: snap.phase, variables: snap.variables, label: id.toUpperCase() };
    }
    for (const piece of controlPieces) piece.feed?.(latest, msg.t as number);
    renderAsset();
    renderLines(msg.snapshot.lines);
    appendEvents(msg.events);
    const t = msg.t as number;
    const hh = String(Math.floor(t / 3600)).padStart(2, "0");
    const mm = String(Math.floor((t % 3600) / 60)).padStart(2, "0");
    const ss = String(Math.floor(t % 60)).padStart(2, "0");
    $("clock").textContent = `SIM ${hh}:${mm}:${ss} · ×${msg.speed}`;
  };
  socket.onclose = () => {
    if (socket) disconnect();
  };
  socket.onerror = () => {
    $("clock").textContent = "SIM · API NO DISPONIBLE (uv run uvicorn …)";
  };
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

function renderAsset(): void {
  const asset = selectedId ? assets.get(selectedId) : undefined;
  const snap = selectedId ? latest[selectedId] : undefined;
  const spec = asset?.eq.sim ? specs[asset.eq.sim.type] : undefined;
  $("asset-name").textContent = asset ? asset.eq.id.toUpperCase() : "Haz clic en un equipo";
  $("asset-meta").textContent = asset
    ? `${spec?.name ?? asset.eq.type} · ${asset.eq.zone}${asset.eq.sim ? "" : " · no simulado"}`
    : "";
  const st = $("state");
  st.textContent = (snap?.state ?? "—").toUpperCase();
  st.className = `state ${snap?.state ?? ""}`;
  $("phase").textContent = (snap?.phase ?? "—").toUpperCase();
  $("faults").innerHTML = (snap?.active_faults ?? []).map((f) => `<span>${f}</span>`).join("");
  $("vars").innerHTML = (spec?.variables ?? [])
    .map((v) => `<div title="${v.description}"><span>${v.id}</span><span>${fmt(snap?.variables?.[v.id], v.unit)}</span></div>`)
    .join("");
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

function commandButton(label: string, title: string, command: string, args: Record<string, unknown>): HTMLButtonElement {
  const b = document.createElement("button");
  b.textContent = label;
  b.title = title;
  b.onclick = () => send({ equipment: selectedId, command, args });
  return b;
}

function renderLines(lines: Record<string, { name: string; output_units: number; output_per_h: number | null }>): void {
  $("lines").innerHTML = Object.entries(lines)
    .map(([id, ln]) => `<div class="line" data-line="${id}"><b>${ln.name}</b><span>${fmt(ln.output_units)} u · ${ln.output_per_h === null ? "—" : fmt(ln.output_per_h)} u/h</span></div>`)
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
  const res = await fetch(`/api/plants/${plantId}`);
  if (!res.ok) {
    $("plant-name").textContent = `No se pudo cargar ${plantId} (${res.status}). ¿Está corriendo la API?`;
    return;
  }
  doc = await res.json();
  $("plant-name").textContent = doc.plant.name.toUpperCase();
  const simulated = doc.equipment.filter((e) => e.sim).length;
  buildZones();
  buildEquipment();
  buildWalkways();
  if (url.get("routes") !== "0") updateRoutes = buildRoutes(doc.aisles ?? [], doc.routes ?? [], stage.content, toScene);
  buildPipes();
  $("plant-meta").textContent = `${doc.equipment.length} activos · ${simulated} simulados · ${doc.zones.length} zonas · ${pipeRuns.length} tuberías · ${doc.walkways.length} pasarelas`;
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
  if (url.get("select")) select(url.get("select"));
  const focusAsset = url.get("focus") ? assets.get(url.get("focus")!) : undefined;
  if (focusAsset) stage.frame(focusAsset.root, 1.1);
  if (url.get("tour") === "1") startTour();
  if (url.get("autosim") === "1" && simulated) {
    if (url.get("scenario")) sel.value = url.get("scenario")!;
    if (url.get("speed")) {
      $<HTMLInputElement>("speed").value = String(Math.log10(Number(url.get("speed"))));
      $("speed-val").textContent = `×${speedFromSlider()}`;
    }
    connect();
  }
  renderAsset();
  loop();
}

let frames = 0;
let updateRoutes: ((time: number, dt: number) => void) | null = null;
function loop(): void {
  const dt = stage.render();
  updateRoutes?.(stage.time, dt);
  for (const a of assets.values()) a.model?.update(a.frame, dt);
  animatePipes(stage.time);
  for (const piece of controlPieces) piece.redraw?.();
  updateTour();
  frames++;
  const wantsData = url.get("autosim") === "1";
  if (shotMode && frames >= 40 && (!wantsData || messages >= Number(url.get("messages") ?? 3))) (window as unknown as { __ready: boolean }).__ready = true;
  requestAnimationFrame(loop);
}

void start();
Object.assign(window, { stage, THREE });
