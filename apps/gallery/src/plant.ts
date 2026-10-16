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
 *   &autosim=1&scenario=boiler-trip&speed=120   conecta la simulación al cargar
 *   &shot=1                        oculta la interfaz y marca window.__ready (con autosim, tras recibir datos)
 */
import yaml from "js-yaml";
import * as THREE from "three";
import { type AnimationFrame, type EquipmentModel, type LightingPreset, Stage, textures } from "@twin/3d";
import { geometryBuilders, rawSpecs } from "@twin/equipment-library/registry.ts";
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
  sim?: { type: string; preset: string | null; params: Record<string, unknown> };
}
interface PlantDoc {
  plant: { id: string; name: string; site?: { width_x: number; length_y: number } };
  zones: Zone[];
  equipment: PlantEquipment[];
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

function buildEquipment(): void {
  for (const eq of doc.equipment) {
    let root: THREE.Object3D;
    let model: EquipmentModel | null = null;
    const builder = eq.sim ? geometryBuilders[eq.sim.type] : undefined;
    if (builder && eq.sim) {
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
  const featured = doc.zones.filter((z) => ["production", "utility"].includes(z.kind) && z.rect[2] * z.rect[3] >= 80);
  for (const z of featured) entries.push([z.name.toUpperCase(), z.id, () => focusRect(z.rect, Math.max(3, z.height))]);
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
    for (const [id, snap] of Object.entries(latest) as [string, EquipmentSnapshot][]) {
      const asset = assets.get(id);
      if (asset) asset.frame = { channels: snap.animation, state: snap.state, phase: snap.phase, variables: snap.variables, label: id.toUpperCase() };
    }
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
  $("plant-meta").textContent = `${doc.equipment.length} activos · ${simulated} simulados · ${doc.zones.length} zonas`;
  buildZones();
  buildEquipment();
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
function loop(): void {
  const dt = stage.render();
  for (const a of assets.values()) a.model?.update(a.frame, dt);
  frames++;
  const wantsData = url.get("autosim") === "1";
  if (shotMode && frames >= 40 && (!wantsData || messages >= Number(url.get("messages") ?? 3))) (window as unknown as { __ready: boolean }).__ready = true;
  requestAnimationFrame(loop);
}

void start();
Object.assign(window, { stage, THREE });
