/**
 * Galería de la librería de equipos.
 *
 * Muestra cada tipo en 3D con sus parámetros editables y, si la API está corriendo,
 * lo simula en vivo: el comportamiento (Python) publica canales de animación y variables,
 * y la geometría solo los refleja.
 *
 * Parámetros de URL (útiles para capturas automáticas):
 *   ?type=vessel&preset=resin-silo-40t&params={"volume_l":5000}&lighting=night
 *   &frame={"level":0.6}   canales fijos sin simulación
 *   &shot=1                oculta la interfaz y marca window.__ready al terminar de cargar
 *   &autosim=1&scenario=demo&speed=60   conecta la simulación al cargar (requiere la API)
 *   &ui=1                  con shot=1, conserva la interfaz en la captura
 */
import "./mobile-dock.ts";
import GUI from "lil-gui";
import yaml from "js-yaml";
import * as THREE from "three";
import { type AnimationFrame, type EquipmentModel, type LightingPreset, Stage, humansPending } from "@twin/3d";
import { geometryBuilders, rawPresets, rawScenarios, rawSpecs } from "@twin/equipment-library/registry.ts";
import "./styles.css";

interface ParamDef {
  type: "number" | "integer" | "boolean" | "string" | "enum";
  default?: unknown;
  min?: number;
  max?: number;
  values?: unknown[];
  unit?: string;
  description: string;
  affects?: string[];
}
interface Spec {
  type: string;
  name: string;
  manufacturing: string;
  category: string;
  fidelity: { visual: string; behavior: string };
  params: Record<string, ParamDef>;
  variables: { id: string; unit: string; kind: string; description: string }[];
  commands?: { id: string; description: string; args?: Record<string, string> }[];
  faults?: { id: string; description: string }[];
  kpis?: { id: string; unit: string; description: string }[];
}
interface Preset {
  preset: string;
  description: string;
  params: Record<string, unknown>;
}

const specs: Record<string, Spec> = Object.fromEntries(Object.entries(rawSpecs).map(([k, v]) => [k, yaml.load(v) as Spec]));
const presets: Record<string, Record<string, Preset>> = Object.fromEntries(
  Object.entries(rawPresets).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).map(([id, txt]) => [id, yaml.load(txt) as Preset]))]),
);
const scenarios: Record<string, { id: string; description: string; preset?: string }[]> = Object.fromEntries(
  Object.entries(rawScenarios).map(([k, v]) => [k, ((yaml.load(v) as { scenarios?: { id: string; description: string; preset?: string }[] }).scenarios ?? [])]),
);

const url = new URLSearchParams(location.search);
const shotMode = url.get("shot") === "1";
if (shotMode && url.get("ui") !== "1") document.body.classList.add("shot");

const canvas = document.getElementById("scene") as HTMLCanvasElement;
const stage = new Stage({
  canvas,
  lighting: (url.get("lighting") as LightingPreset) || "night",
  quality: url.get("quality") === "low" ? "low" : "high",
  preserveDrawingBuffer: shotMode,
});
window.addEventListener("resize", () => stage.resize());

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// ------------------------------------------------------------------ estado
let currentType = url.get("type") ?? Object.keys(geometryBuilders)[0];
let currentPreset: string | null = url.get("preset");
let params: Record<string, unknown> = {};
let model: EquipmentModel | null = null;
let frame: AnimationFrame = { channels: {}, state: "idle" };
const fixedFrame = url.get("frame") ? (JSON.parse(url.get("frame")!) as Record<string, number>) : null;
if (fixedFrame) frame = { channels: fixedFrame, state: url.get("state") ?? "running" };
let gui: GUI | null = null;
let socket: WebSocket | null = null;
let paused = false;

function resolveParams(type: string, preset: string | null, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const spec = specs[type];
  const values: Record<string, unknown> = {};
  for (const [k, p] of Object.entries(spec.params)) if (p.default !== undefined) values[k] = p.default;
  if (preset && presets[type]?.[preset]) Object.assign(values, presets[type][preset].params);
  return Object.assign(values, overrides);
}

// ------------------------------------------------------------------ construcción del modelo
function rebuild(): void {
  if (model) {
    stage.content.remove(model.root);
    model.dispose();
  }
  model = geometryBuilders[currentType](params);
  stage.content.add(model.root);
  stage.clearCells();
  const spec = specs[currentType];
  stage.addCellMarker(model.size.dx + 2.4, model.size.dy + 2.4, "CELL-01", `${spec.name} · ${currentPreset ?? "personalizado"}`);
  model.update(frame, 0);
}

function selectType(type: string, preset: string | null = null, overrides: Record<string, unknown> = {}): void {
  disconnect();
  currentType = type;
  const available = Object.keys(presets[type] ?? {});
  currentPreset = preset && available.includes(preset) ? preset : (available[0] ?? null);
  params = resolveParams(type, currentPreset, overrides);
  const spec = specs[type];
  $("eq-name").textContent = spec.name.toUpperCase();
  $("eq-meta").textContent = `${type} · ${spec.manufacturing} · ${spec.fidelity.visual}/${spec.fidelity.behavior}`;
  document.querySelectorAll("#types li").forEach((li) => li.classList.toggle("active", (li as HTMLElement).dataset.type === type));
  rebuild();
  if (model) stage.frame(model.root);
  buildGui();
  buildScenarioSelect();
  buildCommands();
  renderHud(null);
}

// ------------------------------------------------------------------ interfaz
function buildTypeList(allowed: Set<string> | null = null): void {
  const ul = $("types");
  ul.innerHTML = "";
  for (const type of Object.keys(geometryBuilders).sort()) {
    if (allowed && !allowed.has(type)) continue;
    const spec = specs[type];
    const li = document.createElement("li");
    li.dataset.type = type;
    li.innerHTML = `${spec.name}<small>${type} · ${spec.manufacturing}</small>`;
    li.onclick = () => selectType(type);
    ul.appendChild(li);
  }
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
      el.querySelectorAll("button").forEach((x) => x.classList.toggle("active", x === b));
    };
    el.appendChild(b);
  }
}

function buildGui(): void {
  gui?.destroy();
  gui = new GUI({ title: "Parámetros", container: $("gui-host") });
  const spec = specs[currentType];
  const presetIds = Object.keys(presets[currentType] ?? {});
  if (presetIds.length) {
    const holder = { preset: currentPreset ?? presetIds[0] };
    gui.add(holder, "preset", presetIds).name("preset").onChange((p: string) => selectType(currentType, p));
  }
  let timer: number | undefined;
  const changed = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      currentPreset = null;
      rebuild();
    }, 120);
  };
  for (const [key, def] of Object.entries(spec.params)) {
    const label = def.unit ? `${key} (${def.unit})` : key;
    let ctrl;
    if (def.type === "enum") ctrl = gui.add(params, key, def.values as string[]);
    else if (def.type === "boolean") ctrl = gui.add(params, key);
    else if (def.type === "number" || def.type === "integer") {
      const min = def.min ?? 0;
      const max = def.max ?? Math.max(1, Number(params[key] ?? 1) * 4);
      ctrl = gui.add(params, key, min, max, def.type === "integer" ? 1 : (max - min) / 1000);
    } else if (typeof params[key] === "string" && /^#[0-9a-f]{6}$/i.test(params[key] as string)) ctrl = gui.addColor(params, key);
    else ctrl = gui.add(params, key);
    ctrl.name(label);
    ctrl.domElement.title = def.description;
    if (def.affects?.includes("geometry")) ctrl.onChange(changed);
  }
  if (shotMode) gui.hide();
}

function buildScenarioSelect(): void {
  const sel = $<HTMLSelectElement>("scenario");
  sel.innerHTML = '<option value="">(manual)</option>';
  for (const s of scenarios[currentType] ?? []) {
    const o = document.createElement("option");
    o.value = s.id;
    o.textContent = s.id;
    o.title = s.description;
    sel.appendChild(o);
  }
  const demo = (scenarios[currentType] ?? []).find((s) => s.id === "demo");
  if (demo) sel.value = "demo";
}

function buildCommands(): void {
  const box = $("commands");
  box.innerHTML = "";
  const spec = specs[currentType];
  const simple = (spec.commands ?? []).filter((c) => !c.args || ["maintenance"].includes(c.id));
  for (const c of simple) {
    const b = document.createElement("button");
    b.textContent = c.id.replace(/_/g, " ").toUpperCase();
    b.title = c.description;
    b.onclick = () => send({ command: c.id, args: c.id === "maintenance" ? { active: true } : {} });
    box.appendChild(b);
  }
  for (const f of spec.faults ?? []) {
    const b = document.createElement("button");
    b.textContent = `⚠ ${f.id.replace(/_/g, " ")}`;
    b.title = f.description;
    b.onclick = () => send({ command: "inject_fault", args: { fault: f.id } });
    box.appendChild(b);
  }
}

// ------------------------------------------------------------------ simulación (WebSocket a la API)
function send(msg: unknown): void {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
}

function disconnect(): void {
  socket?.close();
  socket = null;
  $("btn-connect").textContent = "▶ SIMULAR";
  $("clock").textContent = "SIM · DESCONECTADA";
}

function speedFromSlider(): number {
  return Math.round(Math.pow(10, Number($<HTMLInputElement>("speed").value)));
}

function connect(): void {
  if (socket) return disconnect();
  const scenario = $<HTMLSelectElement>("scenario").value;
  const q = new URLSearchParams({ speed: String(speedFromSlider()) });
  if (scenario) q.set("scenario", scenario);
  else if (currentPreset) q.set("preset", currentPreset);
  const overrides = currentPreset ? {} : params;
  const geometryOnly = Object.fromEntries(Object.entries(overrides).filter(([k]) => k in specs[currentType].params));
  if (Object.keys(geometryOnly).length) q.set("params", JSON.stringify(geometryOnly));
  const proto = location.protocol === "https:" ? "wss" : "ws";
  socket = new WebSocket(`${proto}://${location.host}/api/equipment/${currentType}/simulate?${q}`);
  $("btn-connect").textContent = "■ DETENER";
  socket.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.error) {
      $("clock").textContent = `ERROR · ${msg.error}`.slice(0, 60);
      return;
    }
    const snap = msg.snapshot;
    frame = { channels: snap.animation, state: snap.state, phase: snap.phase, variables: snap.variables, items: snap.items, label: "CELL-01" };
    renderHud(snap);
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
const UNIT_LABELS: Record<string, string> = { degC: "°C", "%": "%" };

function fmt(v: unknown, unit = ""): string {
  if (v === null || v === undefined || v === "") return "—";
  const u = UNIT_LABELS[unit] ?? unit;
  if (typeof v === "number") {
    const a = Math.abs(v);
    const s = Number.isInteger(v) ? v.toLocaleString("es-CO") : a >= 1000 ? v.toFixed(0) : a >= 100 ? v.toFixed(1) : a >= 1 ? v.toFixed(2) : v.toFixed(3);
    return u ? `${s} ${u}` : s;
  }
  return String(v);
}

function renderHud(snap: { state: string; phase: string | null; variables: Record<string, unknown>; kpis: Record<string, unknown>; active_faults: string[] } | null): void {
  const spec = specs[currentType];
  const state = snap?.state ?? "—";
  const st = $("state");
  st.textContent = state.toUpperCase();
  st.className = `state ${state}`;
  $("phase").textContent = (snap?.phase ?? "—").toUpperCase();
  $("faults").innerHTML = (snap?.active_faults ?? []).map((f) => `<span>${f}</span>`).join("");
  $("kpis").innerHTML = (spec.kpis ?? [])
    .map((k) => {
      const v = snap?.kpis?.[k.id];
      const pct = typeof v === "number" && k.unit === "" ? `${(v * 100).toFixed(1)} %` : fmt(v, k.unit);
      return `<div class="kpi" title="${k.description}"><div class="v">${pct}</div><div class="k">${k.id.replace(/_/g, " ")}</div></div>`;
    })
    .join("");
  $("vars").innerHTML = spec.variables
    .map((v) => `<div title="${v.description}"><span>${v.id}</span><span>${fmt(snap?.variables?.[v.id], v.unit)}</span></div>`)
    .join("");
}

function appendEvents(events: { t: number; type: string; [k: string]: unknown }[]): void {
  const ol = $("events");
  for (const e of events.slice(-30)) {
    const li = document.createElement("li");
    li.className = e.type;
    const { t, type, equipment_id: _id, ...rest } = e;
    const detail = Object.entries(rest)
      .slice(0, 4)
      .map(([k, v]) => `${k}=${typeof v === "number" ? Math.round(v * 100) / 100 : v}`)
      .join(" ");
    li.innerHTML = `${new Date(t * 1000).toISOString().slice(11, 19)} <b>${type}</b> ${detail}`;
    ol.prepend(li);
  }
  while (ol.children.length > 120) ol.lastChild?.remove();
}

// ------------------------------------------------------------------ arranque
/** Con `?plant=<id>` la librería muestra solo los equipos que usa esa planta (el plano trae el tipo de librería de cada activo). */
async function plantTypes(plantId: string): Promise<Set<string> | null> {
  try {
    const res = await fetch(`/api/plants/${plantId}`);
    if (!res.ok) return null;
    const doc = (await res.json()) as { plant: { name: string }; equipment: { sim?: { type: string } }[] };
    $("lib-title").textContent = `LIBRERÍA · ${doc.plant.name.toUpperCase()}`;
    const link = $<HTMLAnchorElement>("link-plant");
    link.href = `/plant.html?plant=${plantId}`;
    link.hidden = false;
    const types = new Set(doc.equipment.flatMap((e) => (e.sim ? [e.sim.type] : [])));
    return types.size ? types : null;
  } catch {
    return null;
  }
}
const plantFilter = url.get("plant") ? await plantTypes(url.get("plant")!) : null;
if (plantFilter && !url.get("type") && !plantFilter.has(currentType)) currentType = [...plantFilter].sort()[0];
buildTypeList(plantFilter);
buildLighting();
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
selectType(currentType, currentPreset, url.get("params") ? JSON.parse(url.get("params")!) : {});
if (url.get("autosim") === "1") {
  if (url.get("scenario") !== null) $<HTMLSelectElement>("scenario").value = url.get("scenario")!;
  if (url.get("speed")) {
    $<HTMLInputElement>("speed").value = String(Math.log10(Number(url.get("speed"))));
    $("speed-val").textContent = `×${speedFromSlider()}`;
  }
  connect();
}

let frames = 0;
function loop(): void {
  const dt = stage.render();
  model?.update(frame, dt);
  frames++;
  if (shotMode && frames >= 40 && humansPending() === 0 && !(window as unknown as { __ready?: boolean }).__ready) (window as unknown as { __ready: boolean }).__ready = true;
  if (shotMode && gui && url.get("ui") === "1" && frames === 1) gui.close();
  requestAnimationFrame(loop);
}
loop();

// Exponer para depuración y para las capturas de la skill de autoría.
Object.assign(window, { stage, THREE });
