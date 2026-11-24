import "./plc.css";
import { demoFetch, demoWebSocket } from "./demo-client";

type Value = number | string | null;
type Snapshot = { state: string; variables: Record<string, Value>; animation: Record<string, number>; active_faults: string[] };
type Message = { t: number; speed: number; effective_speed?: number; simulation_lag_s?: number; paused: boolean; running?: boolean; plc_tags?: Record<string, Value>; snapshot: { equipment: Record<string, Snapshot> }; events: { type: string; equipment_id?: string }[] };
type Asset = { id: string; name: string; group: string; level?: number };
type Schema = { name: string; assets: Asset[]; service_constraint: { critical_pressure_min_mca: number; automatic_target_mca: number } };
type Sample = { t: number; main: number; recirculation: number; consumption: number; leakage: number; critical: number; supplyLevel: number; pumpDischarge: number; stationIn: number; stationOut: number; grid1In: number; grid1Out: number; grid2Out: number; grid3Out: number; criticalFlow: number };
type SavedRun = { id: string; startedAt: string; durationS: number; samples: Sample[] };
type TrajectoryPoint = { t: number; flow: number; pressure: number };
type Comparison = {
  profile_outdated?: boolean;
  comparison_id: string;
  profile_id: string;
  profile_hash: string;
  manifest?: { input_hash: string; snapshot_id: string; base_time_s: number; time_step_s: number; horizon_s: number };
  runs: Record<string, { run_id: string; model_id: string } | undefined>;
  source_status?: Record<string, { status: "not_requested" | "in_progress" | "ready" | "blocked" | "failed"; detail: string | null }>;
};
type TriadFrame = { simulation_time_s: number; profile_id: string; profile_hash: string; aligned: boolean; sources: Record<string, { simulation_time_s: number; temporal_context?: string; model_quality?: string; state: Record<string, unknown> } | null> };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const query = new URLSearchParams(location.search);
const plantId = query.get("plant") ?? "water-network-scale-v1";
const embedded = query.get("embedded") === "1";
if (embedded) document.body.classList.add("embedded-plc");
function notify3d(type: "plc-session-created" | "plc-show-3d", data: { sessionId?: string; studyId?: string; comparisonId?: string; triadFrame?: { simulation_time_s: number; timeline_s?: number[]; source: string; snapshot?: Record<string, unknown>; sources: Record<string, { simulation_time_s: number; temporal_context?: string; model_quality?: string; state: Record<string, unknown> } | null> } } = {}): void {
  if (embedded && window.parent !== window) window.parent.postMessage({ type, plantId, ...data }, location.origin);
}
// En desarrollo usa el proxy local. Una HMI publicada puede apuntar a un host FastAPI explícito:
// plc.html?plant=water-network-scale-v1&api=https://planta-real.ejemplo.com
const apiOrigin = (query.get("api") ?? import.meta.env.VITE_EMULATOR_API_URL ?? location.origin).replace(/\/$/, "");
const apiFetch = (path: string, init: RequestInit = {}) => demoFetch(apiOrigin, path, init);
const localHost = ["localhost", "127.0.0.1"].includes(location.hostname);
const fractalOrigin = (query.get("fractal") ?? (localHost ? `${location.origin}/fractal-api` : `${apiOrigin}/fractal`)).replace(/\/$/, "");
const fractalFetch = (path: string, init: RequestInit = {}) => fractalOrigin === `${apiOrigin}/fractal`
  ? demoFetch(apiOrigin, `/fractal${path}`, init)
  : fetch(`${fractalOrigin}${path}`, init);

async function getJson<T>(path: string): Promise<T> {
  const response = await apiFetch(path);
  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok || !contentType.includes("application/json")) {
    throw Error("La API de Planta Real no está disponible en esta dirección. La galería publicada es estática; abra la HMI local con el servicio o proporcione ?api=https://host-de-planta-real.");
  }
  return response.json() as Promise<T>;
}
let schema: Schema;
let socket: WebSocket | null = null;
let paused = false;
let latest: Record<string, Snapshot> = {};
let simTime = 0;
let latestTags: Record<string, Value> = {};
let randomTimer: number | null = null;
const DAY_SECONDS = 24 * 3600;
const SAMPLE_INTERVAL_S = 60;
const RUNS_KEY = "arvantti.water-plc.runs.v1";
let history: Sample[] = [];
let optimizedTrajectory: TrajectoryPoint[] = [];
let cosimulationTrajectory: TrajectoryPoint[] = [];
let comparisons: Comparison[] = [];
let triadFrames: TriadFrame[] = [];
let selectedTriadSource: "emulator" | "cosimulation" | "optimization" = "emulator";
let triadPlaybackTimer: number | null = null;
let cosimulationRunning = false;
let fractalRunning = false;
let runStartedAt = "";
let runSaved = false;
let latestFractalStudy: Record<string, unknown> | null = null;
let selectedSavedStudyId: string | null = null;

type ProfileHour = {
  global_consumers_pct?: number;
  levels?: Record<string, number>;
  dwellings?: Record<string, Record<string, number>>;
  leaks?: Record<string, Record<string, number>>;
  between_levels?: Record<string, number>;
  prs?: { branch?: "auto" | "manual"; control_mode?: "critical_pressure" | "critical_point" | "fixed_outlet"; critical_control_point?: "L4.C44"; inlet_pressure_mca?: number; auto_outlet_mca?: number; auto_opening_pct?: number; critical_setpoint_mca?: number; manual_setting_mca?: number };
};
type OperationProfile = { id?: string; name: string; description: string; hours: Record<string, ProfileHour> };
let profiles: OperationProfile[] = [];
let activeProfile: OperationProfile = { name: "Nuevo escenario", description: "", hours: {} };
let activeProfileId: string | null = null;
let profileHour = 0;
let lastProfileLockHour = -1;
type ProfileParameter = "global" | `level-${number}` | `between-${string}` | "prs";
let profileParameter: ProfileParameter = "global";
let profilePrsControlsTouched = false;
let sessionId = query.get("session");
let activeSessionProfileId: string | null = null;
let pendingSessionProfileId: string | null = null;
let pendingSessionProfileHour: number | null = null;
let profileEditInFlight = false;
let selectedStudyContext: { studyId: string; studyType?: string; profileName?: string } | null = query.get("study") ? { studyId: query.get("study")! } : null;
let stopRequested = false;
let plcRunning = false;

const n = (value: Value | undefined): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;
const fmt = (value: Value | undefined, digits = 1) => {
  const number = n(value);
  return number === null ? "—" : number.toLocaleString("es-CO", { maximumFractionDigits: digits, minimumFractionDigits: digits });
};
const fmtSeconds = (seconds: number) => seconds >= 60 ? `${(seconds / 60).toLocaleString("es-CO", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} min` : `${seconds.toLocaleString("es-CO", { maximumFractionDigits: 2, minimumFractionDigits: 2 })} s`;
function updateCalculationTime(kind: "cosim" | "fractal", seconds: number, horizonHours: number): void {
  const label = kind === "cosim" ? "Cosimulador" : "Fractal";
  $("calculation-times-note").textContent = `Última ejecución ${label}: ${fmtSeconds(seconds)} para ${horizonHours.toLocaleString("es-CO")} h · referencia local, sin conexión física.`;
}
const eq = (id: string) => latest[id];
const value = (id: string, key: string) => eq(id)?.variables[key];
const send = (equipment: string, command: string, args: Record<string, unknown> = {}) => socket?.readyState === WebSocket.OPEN && socket.send(JSON.stringify({ equipment, command, args }));

function renderWorkspaceContext(): void {
  const profileNode = $("plc-profile-context");
  const studyNode = $("fractal-study-context");
  const activeProfile = profiles.find((profile) => profile.id === activeSessionProfileId);
  profileNode.textContent = activeSessionProfileId
    ? `ESCENARIO ACTIVO EN PLC · ${activeProfile?.name ?? activeSessionProfileId}${pendingSessionProfileId ? ` · PRÓXIMO: ${profiles.find((profile) => profile.id === pendingSessionProfileId)?.name ?? pendingSessionProfileId}` : ""}`
    : sessionId ? "SESIÓN PLC · SIN ESCENARIO ACTIVO IDENTIFICADO" : "";
  studyNode.hidden = !selectedStudyContext;
  studyNode.textContent = selectedStudyContext
    ? `ESTUDIO FUTURO EN REVISIÓN EN 3D · ${selectedStudyContext.studyType ?? "ESTUDIO"} · ${selectedStudyContext.profileName ?? "perfil"} · ${selectedStudyContext.studyId} · NO APLICADO AL PLC`
    : "";
  $("workspace-context").hidden = !profileNode.textContent && studyNode.hidden;
}

type CalculationProgress = { phase?: string; percent?: number | null; completed_hours?: number; total_hours?: number; simulation_time_s?: number; status?: string };
function showCalculationProgress(source: "cosim" | "fractal", progress: CalculationProgress): void {
  const bar = $<HTMLProgressElement>(`${source}-progress-bar`);
  if (typeof progress.percent === "number") bar.value = Math.max(0, Math.min(100, progress.percent));
  else bar.removeAttribute("value");
  $(`${source}-progress-label`).textContent = `${progress.phase ?? "Calculando"}${typeof progress.percent === "number" ? ` · ${fmt(progress.percent, 0)} %` : ""}`;
  $(`${source}-progress-detail`).textContent = progress.total_hours
    ? `Hora calculada ${progress.completed_hours ?? 0} de ${progress.total_hours}${progress.simulation_time_s !== undefined ? ` · planta ${comparisonTime(progress.simulation_time_s)}` : ""}`
    : "Esperando confirmación de avance del motor; no es el reloj del PLC.";
}
function watchCalculation(source: "cosim" | "fractal"): { id: string; finish: (success: boolean) => void } {
  const id = crypto.randomUUID(), ownerSession = sessionId;
  let stopped = false, timer: number | undefined;
  let observed: CalculationProgress = {};
  showCalculationProgress(source, { phase: "Preparando cálculo", percent: null });
  const poll = async () => {
    try {
      const response = await fractalFetch("/studies/progress", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ progress_id: id, plant_id: plantId, session_id: ownerSession }) });
      if (response.ok && !stopped) { observed = await response.json() as CalculationProgress; showCalculationProgress(source, observed); }
    } catch { /* Keep confirmed progress, never estimate work from elapsed wall time. */ }
    if (!stopped) timer = window.setTimeout(() => { void poll(); }, 1000);
  };
  timer = window.setTimeout(() => { void poll(); }, 200);
  return { id, finish: (success) => {
    stopped = true; window.clearTimeout(timer);
    showCalculationProgress(source, { ...observed, phase: success ? "Cálculo terminado" : "Cálculo interrumpido",
      percent: success ? 100 : observed.percent ?? null,
      completed_hours: success ? observed.total_hours ?? observed.completed_hours : observed.completed_hours });
  } };
}
function renderSessionControls(): void {
  const at = Math.max(0, Math.min(86400, simTime));
  $("plant-hour-progress").textContent = sessionId ? `Hora ${Math.min(24, Math.floor(at / 3600) + 1)} de 24 · ${comparisonTime(at)}` : "Hora de planta · sin sesión";
  $<HTMLProgressElement>("plant-day-progress").value = at;
  const liveClock = document.getElementById("live-chart-clock");
  if (liveClock) {
    const current = Math.min(23, Math.floor(simTime / 3600));
    liveClock.textContent = simTime >= DAY_SECONDS ? "DÍA COMPLETADO · Todas las franjas están bloqueadas." : `RELOJ PLC ${comparisonTime(simTime)} · H${String(current + 1).padStart(2, "0")} actual editable · ${current ? `H01–H${String(current).padStart(2, "0")} pasadas: bloqueadas` : "sin franjas pasadas"} · futuras editables`;
  }
  $("plant-hour-detail").textContent = !sessionId ? "Inicie una sesión para ver su reloj." : at >= 86400 ? "Día completado" : plcRunning ? (paused ? "Planta en pausa" : "Planta en ejecución") : "Último instante registrado · planta detenida";
  $<HTMLButtonElement>("live-profile-apply").disabled = !liveProfileEditing || !plcRunning || !liveProfileOriginal || Boolean(activeProfileId?.startsWith("builtin-"));
  const start = $<HTMLButtonElement>("connect");
  const pause = $<HTMLButtonElement>("pause");
  const connected = socket?.readyState === WebSocket.OPEN;
  const active = connected && plcRunning;
  const connecting = socket?.readyState === WebSocket.CONNECTING || (plcRunning && !connected);
  const newScenario = Boolean(activeProfileId && activeSessionProfileId && activeProfileId !== activeSessionProfileId);
  const schedule = $<HTMLButtonElement>("schedule-profile");
  if (schedule) schedule.hidden = !connected || !activeProfileId || !newScenario || pendingSessionProfileId === activeProfileId;
  const project = $<HTMLButtonElement>("fractal-horizon");
  const cosimulation = $<HTMLButtonElement>("cosimulation-run");
  const selectedFractalProfileId = $<HTMLSelectElement>("fractal-profile-select")?.value;
  const profileMatchesSession = Boolean(selectedFractalProfileId && selectedFractalProfileId === activeSessionProfileId);
  const canProject = Boolean(active && !paused && sessionId && profileMatchesSession);
  if (project) project.disabled = !canProject || fractalRunning;
  if (cosimulation) cosimulation.disabled = !active || paused || !sessionId || !activeSessionProfileId || cosimulationRunning;
  $("cosim-profile-context").textContent = activeSessionProfileId
    ? `Perfil activo: ${profiles.find((profile) => profile.id === activeSessionProfileId)?.name ?? activeSessionProfileId}${!active ? " · Reanude la sesión para proyectar." : paused ? " · Reanude para proyectar." : ""}`
    : "Primero inicie una sesión con un escenario guardado.";
  const fractalNote = $("fractal-source-note");
  if (fractalNote) fractalNote.textContent = !sessionId
    ? "Primero inicie la emulación PLC con un escenario guardado."
    : !profileMatchesSession
      ? `Para alinear el estudio con el historial, seleccione el perfil activo del PLC (${profiles.find((profile) => profile.id === activeSessionProfileId)?.name ?? "sin perfil"}) o inicie una sesión nueva con el perfil deseado.`
      : !active
        ? "La sesión PLC está detenida. Reanúdela para habilitar el cálculo Fractal; una sesión detenida no entrega tags en play."
        : paused
          ? "La sesión PLC está en pausa. Reanúdela para calcular el estudio Fractal."
          : `El estudio usará ${profiles.find((profile) => profile.id === $<HTMLSelectElement>("fractal-profile-select").value)?.name ?? "el perfil horario seleccionado"} para demanda por vivienda y fugas, sin modificar el perfil activo del PLC. El resultado no se aplica.`;
  const stop = $<HTMLButtonElement>("stop-session");
  if (stop) stop.disabled = !active || stopRequested;
  start.disabled = connected || connecting || stopRequested || (!sessionId && !activeProfileId);
  start.textContent = stopRequested ? "… DETENIENDO EMULACIÓN" : active ? "● EMULACIÓN EN MARCHA" : connecting ? "… INICIANDO EMULACIÓN" : !sessionId && !activeProfileId ? "SELECCIONE ESCENARIO" : sessionId && newScenario ? "▶ NUEVA SESIÓN CON ESTE ESCENARIO" : sessionId ? "▶ REANUDAR EMULACIÓN" : "▶ INICIAR EMULACIÓN";
  pause.disabled = !active || stopRequested;
  pause.textContent = paused ? "▶ REANUDAR" : "❚❚ PAUSAR";
  const guidance = $("session-guidance");
  if (guidance) guidance.textContent = active ? paused ? "En pausa · sesión abierta · el tiempo hidráulico no avanza." : "En marcha · el PLC actualiza señales y la escena 3D." : stopRequested ? "Deteniendo la sesión…" : sessionId ? "Detenida · la vista 3D conserva el último estado; reanude para continuar." : "Sin sesión · elija un escenario e inicie la emulación.";
}

function renderFractalProfileSelector(): void {
  const select = $<HTMLSelectElement>("fractal-profile-select");
  if (!select) return;
  select.replaceChildren(new Option("Seleccione un perfil guardado…", ""));
  for (const [label, items] of [["PLANTILLAS", profiles.filter((profile) => profile.id?.startsWith("builtin-"))], ["ARCHIVO", profiles.filter((profile) => !profile.id?.startsWith("builtin-"))]] as const) {
    if (!items.length) continue;
    const group = document.createElement("optgroup"); group.label = label;
    for (const profile of items) group.append(new Option(profile.name, profile.id ?? ""));
    select.add(group);
  }
  select.value = pendingSessionProfileId ?? activeSessionProfileId ?? activeProfileId ?? "";
  select.disabled = true;
}

function renderRunProfileSelector(): void {
  const select = $<HTMLSelectElement>("run-profile-select");
  if (!select) return;
  renderFractalProfileSelector();
  select.replaceChildren(new Option("Seleccione un escenario guardado…", ""));
  const templates = profiles.filter((profile) => profile.id?.startsWith("builtin-"));
  const customs = profiles.filter((profile) => !profile.id?.startsWith("builtin-"));
  for (const [label, items] of [["PLANTILLAS", templates], ["ARCHIVO", customs]] as const) {
    if (!items.length) continue;
    const group = document.createElement("optgroup"); group.label = label;
    for (const profile of items) group.append(new Option(profile.name, profile.id ?? ""));
    select.add(group);
  }
  select.value = activeProfileId ?? "";
  const editButton = $<HTMLButtonElement>("edit-selected-scenario");
  if (editButton) editButton.textContent = activeProfileId?.startsWith("builtin-") ? "COPIAR PLANTILLA" : "EDITAR ESCENARIO";
  const runningProfile = profiles.find((profile) => profile.id === activeSessionProfileId)?.name ?? activeSessionProfileId;
  $("scenario-selection-note").textContent = !activeProfileId
    ? "Seleccione un escenario guardado. Los borradores sin guardar no se pueden ejecutar."
    : plcRunning && activeProfileId === activeSessionProfileId && activeProfileId?.startsWith("builtin-")
      ? `En marcha con la plantilla ${runningProfile}. Para modificarla, guarde primero una copia en Archivo, selecciónela y prográmela para la próxima hora.`
      : plcRunning && activeProfileId === activeSessionProfileId
        ? `En marcha con ${runningProfile}. Para cambiarlo, seleccione otro escenario y prográmelo para la próxima hora.`
      : plcRunning
        ? `PLC sigue con ${runningProfile}. El escenario elegido no se aplica hasta programarlo para la próxima hora.`
        : sessionId && activeProfileId !== activeSessionProfileId
          ? `La sesión detenida conserva ${runningProfile}. Iniciar creará una nueva sesión con ${activeProfile.name}.`
          : `Listo para iniciar · ${activeProfile.name}. La selección no modifica ninguna sesión hasta iniciarla.`;
}

let liveProfileEditing = false;
let liveProfileOriginal: OperationProfile | null = null;
let profileChartHome: HTMLElement | null = null;
function selectScreen(id: string): void {
  closePointPopover();
  const liveOperation = ["operation", "pumping", "grid"].includes(id);
  const enteringLive = liveOperation && !liveProfileEditing;
  liveProfileEditing = liveOperation;
  const graph = document.querySelector<HTMLElement>(".profile-preview");
  if (graph) {
    profileChartHome ??= graph.parentElement;
    if (liveOperation) $("live-profile-chart-host").append(graph);
    else profileChartHome?.insertBefore(graph, profileChartHome.querySelector(".profile-advanced"));
  }
  if (enteringLive) {
    const profile = profiles.find((p) => p.id === activeSessionProfileId);
    liveProfileOriginal = profile ? structuredClone(profile) : null;
    if (profile) { activeProfile = structuredClone(profile); activeProfileId = profile.id ?? null; profileHour = Math.min(23, Math.floor(simTime / 3600)); }
    $("live-profile-context").textContent = profile ? `Escenario activo: ${profile.name} · Pasado bloqueado. Cambios actuales desde ahora, futuros al llegar su hora.` : "Inicie una sesión con una copia editable de una plantilla.";
    renderProfileEditor();
  }
  if (!liveOperation && liveProfileOriginal) { liveProfileOriginal = null; }
  const primary = id === "fractal" ? "master" : liveOperation ? "operation" : id;
  document.querySelectorAll<HTMLElement>(".screen").forEach((node) => node.classList.toggle("active", liveOperation ? node.id === "pumping" || node.id === "grid" : node.id === id || node.id === primary));
  document.querySelectorAll<HTMLButtonElement>(".tabs button").forEach((node) => node.classList.toggle("active", node.dataset.screen === primary));
  const tab = document.querySelector<HTMLButtonElement>(`.tabs button[data-screen="${primary}"]`);
  document.querySelectorAll(".tabs button").forEach((button) => { if (button === tab) button.setAttribute("aria-current", "page"); else button.removeAttribute("aria-current"); });
  if (tab) { const nav = tab.parentElement!; nav.scrollLeft = Math.max(0, tab.offsetLeft - nav.offsetLeft - 12); }
  if (primary === "profiles") renderProfileEditor();
  document.body.classList.toggle("screen-fractal", false);
  document.body.classList.toggle("screen-history", primary === "history");
  document.body.classList.toggle("screen-grid", liveOperation);
  document.body.classList.toggle("screen-day", id === "day");
  document.body.classList.toggle("screen-pumping", liveOperation);
  if (Object.keys(latest).length) renderVisibleScreen();
  else if (liveOperation) renderSupplyComparison();
  if (id === "fractal") {
    document.getElementById("fractal")?.scrollIntoView({ behavior: "smooth", block: "start" });
    void renderFractal();
  }
}

function buildAssets(): void {
  $("assets").innerHTML = schema.assets.map((asset) => `<div class="asset"><span>${asset.name.toUpperCase()}</span><span class="state" data-asset="${asset.id}">—</span></div>`).join("");
}

function renderMaster(): void {
  const main = eq("pumpset-main-01");
  const prs = eq("prs-01");
  const critical = n(prs?.variables.critical_pressure_mca);
  const mainFlow = value("pumpset-main-01", "flow_m3h");
  const recircFlow = value("pumpset-recirc-01", "flow_m3h");
  const consumption = ["grid-01", "grid-02", "grid-03", "grid-04"].reduce((sum, id) => sum + (n(value(id, "consumption_m3h")) ?? 0), 0);
  $("live-demand-total").textContent = `${fmt(consumption)} m³/h`;
  $("kpis").innerHTML = [
    ["PRESIÓN CRÍTICA", `${fmt(critical)} mca`, `mínimo ${schema.service_constraint.critical_pressure_min_mca} mca`],
    ["CAUDAL PRINCIPAL", `${fmt(mainFlow)} m³/h`, "bombeo a la red"],
    ["CONSUMO", `${fmt(consumption)} m³/h`, "64 consumos residenciales"],
    ["RECIRCULACIÓN", `${fmt(recircFlow)} m³/h`, "retorno al tanque de bombeo"],
    ["BOMBAS ACTIVAS", `${fmt(main?.variables.pumps_running, 0)}`, "grupo principal"],
  ].map(([label, reading, detail]) => `<div class="kpi panel"><small>${label}</small><b>${reading}</b><small>${detail}</small></div>`).join("");
}

function emptyState(title: string, description: string): string {
  return `<div class="empty-state panel" role="status"><h2>${title}</h2><p>${description}</p><button type="button" data-open-screen="master">IR A SIMULACIÓN</button></div>`;
}
function tankCard(id: string, label: string): string {
  const measuredLevel = n(value(id, "level_pct"));
  const level = Math.max(0, Math.min(100, measuredLevel ?? 0));
  return `<article class="card panel"><p class="eyebrow">${label}</p><div class="tank-level"><i style="height:${level}%"></i><span>${measuredLevel === null ? "Sin lectura" : `${fmt(level)} %`}</span></div><div class="readings"><span>Entrada <b>${fmt(value(id, "inflow_kg_h"))} kg/h</b></span><span>Salida <b>${fmt(value(id, "outflow_kg_h"))} kg/h</b></span><span>Masa <b>${fmt(value(id, "mass_kg"), 0)} kg</b></span><span>Estado <b>${eq(id)?.state ?? "—"}</b></span></div></article>`;
}

function pumpCard(id: string, label: string): string {
  const isLevelControlled = id === "pumpset-recirc-01";
  const disabled = socket?.readyState === WebSocket.OPEN && plcRunning ? "" : "disabled";
  const automatic = n(value(id, "automatic_enabled")) === 1;
  const levelActive = n(value(id, "level_auto_active")) === 1;
  const state = eq(id)?.state?.toUpperCase() ?? "—";
  const mode = !eq(id) ? "SIN LECTURAS"
    : isLevelControlled
    ? automatic
      ? levelActive ? "AUTO · RECIRCULANDO POR NIVEL" : "AUTO · EN ESPERA DE NIVEL"
      : "PARO MANUAL · AUTO BLOQUEADO"
    : state;
  const levelReadings = isLevelControlled ? `<span>Retorno <b>${fmt(value(id, "source_level_pct"))} %</b></span><span>Tanque destino <b>${fmt(value(id, "target_level_pct"))} %</b></span><span>Arranque auto <b>≥ ${fmt(value(id, "start_level_pct"), 0)} %</b></span><span>Paro auto <b>&lt; ${fmt(value(id, "stop_level_pct"), 0)} % / destino ${fmt(value(id, "target_full_pct"), 0)} %</b></span>` : "";
  return `<article class="card panel pump-card"><p class="eyebrow">${label}</p><h2>${state}</h2><p class="pump-mode ${automatic ? "automatic" : "manual-stop"}">${mode}</p><div class="readings"><span>Caudal <b>${fmt(value(id, "flow_m3h"))} m³/h</b></span><span>VFD <b>${fmt(value(id, "speed_pct"))} %</b></span><span>Succión <b>${fmt(value(id, "suction_pressure_mca"))} mca</b></span><span>Descarga <b>${fmt(value(id, "discharge_pressure_mca"))} mca</b></span><span>Potencia <b>${fmt(value(id, "power_kw"))} kW</b></span><span>Bombas <b>${fmt(value(id, "pumps_running"), 0)}/${fmt(value(id, "pumps_available"), 0)}</b></span>${levelReadings}</div><div class="controls"><button ${disabled} data-pump="${id}" data-pump-command="start">${isLevelControlled ? "REARMAR AUTO" : "ARRANCAR"}</button><button ${disabled} data-pump="${id}" data-pump-command="stop">PARO MANUAL</button></div></article>`;
}

function renderPumping(): void {
  $("operation-data-note").textContent = !Object.keys(latest).length ? "Sin lecturas cargadas. Inicie la sesión para recibir mediciones; los mandos están desactivados." : plcRunning ? (paused ? "Sesión en pausa · los mandos se reflejan al reanudar." : "Lecturas en vivo · los mandos actúan en la sesión actual.") : `Sesión detenida · última lectura ${comparisonTime(simTime)}. Reanude desde Simulación para habilitar mandos.`;
  $("tanks").innerHTML = tankCard("tank-recirc-01", "TANQUE DE RETORNO 1") + tankCard("tank-recirc-02", "TANQUE DE RETORNO 2") + tankCard("tank-supply-01", "TANQUE DE BOMBEO");
  $("pumps").innerHTML = pumpCard("pumpset-recirc-01", "GRUPO DE RECIRCULACIÓN") + pumpCard("pumpset-main-01", "GRUPO PRINCIPAL");
  const prs = eq("prs-01");
  const branchValue = prs?.variables.branch_auto;
  const branchKnown = branchValue !== undefined && branchValue !== null;
  const isAuto = String(branchValue ?? "") === "1";
  const branch = branchKnown ? isAuto ? "AUTO" : "MANUAL" : "—";
  $("branch-state").textContent = `${branchKnown ? "RAMA SELECCIONADA" : "RAMA SIN LECTURA"} · ${branch}`;
  const liveControlsAvailable = socket?.readyState === WebSocket.OPEN && plcRunning;
  const autoValveOpen = prs?.animation.valve_a_open ?? 0;
  const manualValveOpen = prs?.animation.valve_b_open ?? 0;
  const branchTransitioning = isAuto ? autoValveOpen < 0.999 || manualValveOpen > 0.001 : manualValveOpen < 0.999 || autoValveOpen > 0.001;
  document.querySelectorAll<HTMLButtonElement>("[data-command]").forEach((button) => {
    const selected = branchKnown && button.dataset.command === branch.toLowerCase();
    button.classList.toggle("active", selected);
    button.setAttribute("aria-pressed", String(selected));
    button.disabled = !liveControlsAvailable;
  });
  const openingInput = $<HTMLInputElement>("auto-opening");
  const manualInput = $<HTMLInputElement>("manual-setpoint");
  const currentOpening = n(value("prs-01", "auto_opening_pct"));
  if (document.activeElement !== openingInput && currentOpening !== null) openingInput.value = String(currentOpening);
  openingInput.disabled = !liveControlsAvailable || currentOpening === null;
  if (document.activeElement !== manualInput) manualInput.value = String(n(value("prs-01", "manual_setting_mca")) ?? 20.94);
  manualInput.disabled = !liveControlsAvailable;
  $("prs-mode-explanation").textContent = !liveControlsAvailable
    ? "SIN SESIÓN EN MARCHA · Inicie o reanude la emulación para enviar mandos."
    : !branchKnown
      ? "SIN LECTURA DE LA RAMA · Espere el primer frame de la sesión PLC."
      : isAuto
        ? `RAMA SELECCIONADA · AUTO: rama A con apertura fija (${currentOpening === null ? "—" : `${currentOpening.toFixed(0)} %`}). En este modelo esa apertura se convierte mediante una curva asumida en consigna de salida; no regula automáticamente la presión crítica. La consigna MANUAL queda preparada, pero no gobierna el caudal hasta seleccionar MANUAL.${branchTransitioning ? " Cambio de rama en curso: primero abre la entrante y luego cierra la saliente." : ""}${paused ? " Sesión pausada: el efecto se verá al reanudar." : ""}`
        : `RAMA SELECCIONADA · MANUAL: rama B con consigna fija de salida (${fmt(value("prs-01", "manual_setting_mca"))} mca). La apertura AUTO queda preparada, pero no gobierna el caudal hasta seleccionar AUTO.${branchTransitioning ? " Cambio de rama en curso: primero abre la entrante y luego cierra la saliente." : ""}${paused ? " Sesión pausada: el efecto se verá al reanudar." : ""}`;
  $("auto-opening-output").textContent = currentOpening === null ? "—" : `${currentOpening.toFixed(0)} %`;
  $("manual-output").textContent = `${Number(manualInput.value).toFixed(2)} mca`;
  const autoOpening = 100 * (prs?.animation.valve_a_open ?? 0);
  const manualOpening = 100 * (prs?.animation.valve_b_open ?? 0);
  $("prs-values").innerHTML = [
    ["Presión antes (entrada)", `${fmt(value("prs-01", "inlet_pressure_mca"))} mca`], ["Presión después (salida)", `${fmt(value("prs-01", "outlet_pressure_mca"))} mca`],
    ["Caudal total", `${fmt(value("prs-01", "flow_m3h"))} m³/h`], ["Caudal AUTO", `${fmt(value("prs-01", "flow_auto_m3h"))} m³/h`], ["Caudal MANUAL", `${fmt(value("prs-01", "flow_manual_m3h"))} m³/h`],
    ["Apertura de la rama AUTO", `${fmt(autoOpening)} %`], ["Mando de apertura PRV AUTO", `${fmt(value("prs-01", "auto_opening_pct"))} %`], ["Apertura de la rama MANUAL", `${fmt(manualOpening)} %`], ["Casa crítica (medición)", `${fmt(value("prs-01", "critical_pressure_mca"))} mca`],
    ["Referencia de alarma crítica", `${fmt(value("prs-01", "critical_setpoint_mca"))} mca`], ["Consigna hidráulica AUTO", `${fmt(value("prs-01", "auto_outlet_setpoint_mca"))} mca`], ["Ajuste manual", `${fmt(value("prs-01", "manual_setting_mca"))} mca`],
  ].map(([label, reading]) => `<span>${label} <b>${reading}</b></span>`).join("");
  document.querySelectorAll<HTMLButtonElement>("[data-pump-command]").forEach((button) => button.onclick = () => send(button.dataset.pump!, button.dataset.pumpCommand!));
  renderSupplyComparison();
}

function renderSupplyComparison(): void {
  const real = history.map((sample) => ({ t: sample.t, flow: sample.main, pressure: sample.pumpDischarge }));
  const series = [
    { name: "Emulador · Planta Real", color: "#4EA7FF", points: real },
    { name: "Cosimulador · trayectoria no disponible", color: "#55d58c", points: cosimulationTrajectory },
    { name: "Optimizador · proyección guardada", color: "#f4b56c", points: optimizedTrajectory },
  ];
  const width = 900, height = 250, left = 54, right = 18, top = 20, bottom = 34;
  const x = (seconds: number) => left + Math.max(0, Math.min(24, seconds / 3600)) * (width - left - right) / 24;
  const makeChart = (metric: "pressure" | "flow", title: string, unit: string) => {
    const readings = series.flatMap((item) => item.points.map((point) => point[metric])).filter(Number.isFinite);
    const minimum = readings.length ? Math.min(...readings) : 0;
    const maximum = readings.length ? Math.max(...readings) : 1;
    const padding = Math.max((maximum - minimum) * .1, .1);
    const low = Math.max(0, minimum - padding), high = maximum + padding;
    const y = (value: number) => top + (height - top - bottom) * (1 - (value - low) / Math.max(.01, high - low));
    const ticks = [0, .25, .5, .75, 1].map((fraction) => {
      const value = high - fraction * (high - low);
      return `<line class="scenario-grid" x1="${left}" x2="${width - right}" y1="${y(value)}" y2="${y(value)}"/><text class="scenario-axis" x="${left - 7}" y="${y(value) + 4}" text-anchor="end">${fmt(value, 1)}</text>`;
    }).join("");
    const timeLabels = [0, 6, 12, 18, 24].map((hour) => `<text class="scenario-axis" x="${x(hour * 3600)}" y="${height - 8}" text-anchor="middle">${String(hour).padStart(2, "0")}:00</text>`).join("");
    const lines = series.map((item) => {
      const points = item.points.map((point) => `${x(point.t)},${y(point[metric])}`).join(" ");
      return points ? `<polyline fill="none" stroke="${item.color}" stroke-width="1.2" points="${points}"/>` : "";
    }).join("");
    const legend = series.map((item) => `<span><i style="background:${item.color}"></i>${item.name}</span>`).join("");
    return `<article class="trend panel"><h3>${title} <span>${unit}</span></h3><div class="scenario-chart-scroll"><svg class="day-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${title} en salida de bombeo">${ticks}${timeLabels}${lines}</svg></div><div class="legend">${legend}</div></article>`;
  };
  $("supply-comparison-chart").innerHTML = `${makeChart("pressure", "Presión a la salida del bombeo", "mca")}${makeChart("flow", "Caudal a la salida del bombeo", "m³/h")}<p class="muted comparison-status">La línea real usa señales registradas. La proyección del optimizador aparece al cargar un estudio guardado y no se aplica al PLC. La del cosimulador se habilitará cuando estén conectados y validados sus adaptadores; no se dibujan datos supuestos. Ninguna trayectoria futura manda equipos.</p>`;
}

function renderGrid(): void {
  const liveControlsAvailable = socket?.readyState === WebSocket.OPEN && plcRunning;
  const liveStatus = $("live-controls-status");
  if (liveStatus) liveStatus.textContent = !liveControlsAvailable
    ? "SIN SESIÓN EN MARCHA · Los mandos están desactivados. Inicie o reanude la emulación para actuar."
    : paused
      ? "SESIÓN EN PAUSA · Puede ajustar mandos; los cambios se reflejarán al reanudar."
      : "EN VIVO · Los cambios afectan la sesión actual, no el perfil horario.";
  const liveButtons = [$<HTMLInputElement>("all-consumers"), ...document.querySelectorAll<HTMLInputElement>("[data-level-consumers]"), $<HTMLButtonElement>("random"), $<HTMLButtonElement>("live-save-as-profile")];
  liveButtons.forEach((control) => { control.disabled = !liveControlsAvailable || (control.id === "random" && paused); });
  const liveDemand = ["grid-01", "grid-02", "grid-03", "grid-04"].reduce((sum, id) => sum + (n(value(id, "consumption_m3h")) ?? 0), 0);
  $("live-demand-total").textContent = `${fmt(liveDemand)} m³/h`;
  type LowPoint = { grid: string; valve: string; pressure: number };
  const cards: string[] = [];
  let networkLowest: LowPoint | null = null;
  const levelLowest = new Map<string, LowPoint>();
  for (let level = 1; level <= 4; level++) {
    const id = `grid-0${level}`;
    for (let branch = 1; branch <= 4; branch++) for (let house = 1; house <= 4; house++) {
      const valve = `c${branch}${house}`;
      const point = { grid: id, valve, pressure: n(value(id, `p_${valve}`)) ?? Infinity };
      if (!networkLowest || point.pressure < networkLowest.pressure) networkLowest = point;
      const currentLevelLowest = levelLowest.get(id);
      if (!currentLevelLowest || point.pressure < currentLevelLowest.pressure) levelLowest.set(id, point);
    }
  }
  for (let level = 1; level <= 4; level++) {
    const id = `grid-0${level}`;
    const minimum = levelLowest.get(id)!;
    const houses: string[] = [];
    for (let branch = 1; branch <= 4; branch++) for (let house = 1; house <= 4; house++) {
      const valve = `c${branch}${house}`;
      const open = Math.round((eq(id)?.animation[`open_${valve}`] ?? 0) * 100);
      const levelCritical = minimum.valve === valve;
      const networkCritical = networkLowest?.grid === id && networkLowest.valve === valve;
      const flag = networkCritical ? `<span class="flag global">MÍN. RED</span>` : levelCritical ? `<span class="flag">MÍN. NIVEL</span>` : "";
      houses.push(`<article class="house ${levelCritical ? "critical" : ""} ${networkCritical ? "global-critical" : ""}"><span class="id">L${level}.${valve.toUpperCase()} ${flag}</span><span class="values">${fmt(value(id, `p_${valve}`))} mca<br>${fmt(value(id, `q_${valve}`))} L/min</span><input data-grid="${id}" data-valve="${valve}" type="range" min="0" max="100" value="${open}" title="Apertura ${valve}" /><span class="muted">${open} %</span></article>`);
    }
    const leaks = ["l1", "l2"].map((valve) => {
      const open = Math.round((eq(id)?.animation[`open_${valve}`] ?? 0) * 100);
      return `<label>FUGA ${valve.toUpperCase()} <input data-grid="${id}" data-valve="${valve}" type="range" min="0" max="100" value="${open}" title="Apertura fuga ${valve}" /><output>${open} %</output></label>`;
    }).join("");
    cards.push(`<section class="level panel"><h2>NIVEL ${level}<span>${fmt(value(id, "consumption_m3h"))} m³/h</span></h2><p class="level-min">Mín. nivel: <b>L${level}.${minimum.valve.toUpperCase()} · ${fmt(minimum.pressure)} mca</b>${networkLowest?.grid === id ? " · MÍNIMO DE RED" : ""}</p><div class="leak-controls"><span>VÁLVULAS DE FUGA</span>${leaks}</div><details class="live-level-detail"><summary>DETALLE INDIVIDUAL · 16 VIVIENDAS</summary><div class="houses">${houses.join("")}</div></details></section>`);
  }
  $("grid-levels").innerHTML = cards.join("");
  document.querySelectorAll<HTMLInputElement>("[data-grid]").forEach((input) => {
    input.oninput = () => { const output = input.parentElement?.querySelector("output"); if (output) output.textContent = `${input.value} %`; };
    input.onchange = () => send(input.dataset.grid!, "set_opening", { valve: input.dataset.valve, pct: Number(input.value) });
  });
}

function savedRuns(): SavedRun[] {
  try { return JSON.parse(localStorage.getItem(RUNS_KEY) ?? "[]") as SavedRun[]; } catch { return []; }
}

function renderSavedRuns(): void {
  const runs = savedRuns();
  $("saved-runs").innerHTML = runs.length ? runs.map((run) => {
    const min = Math.min(...run.samples.map((sample) => sample.critical));
    const consumption = run.samples.slice(1).reduce((total, sample, index) => total + sample.consumption * (sample.t - run.samples[index].t) / 3600, 0);
    return `<article class="card panel"><p class="eyebrow">PLANTA REAL · ${new Date(run.startedAt).toLocaleString("es-CO")}</p><h2>${fmt(run.durationS / 3600, 2)} h de sesión</h2><div class="readings"><span>Presión mín. <b>${fmt(min)} mca</b></span><span>Consumo <b>${fmt(consumption, 2)} m³</b></span><span>Muestras <b>${run.samples.length}</b></span></div><div class="controls"><button data-load-run="${run.id}">VER CURVAS</button><button data-delete-run="${run.id}">ELIMINAR</button></div></article>`;
  }).join("") : emptyState("Todavía no hay sesiones guardadas", "Aquí aparecerán las sesiones que finalice y guarde en este navegador. Podrá abrir sus curvas y revisar su desempeño.");
  document.querySelectorAll<HTMLButtonElement>("[data-load-run]").forEach((button) => button.onclick = () => {
    const run = savedRuns().find((item) => item.id === button.dataset.loadRun);
    if (!run) return;
    socket?.close(); history = run.samples; renderDay(); selectScreen("day");
  });
  document.querySelectorAll<HTMLButtonElement>("[data-delete-run]").forEach((button) => button.onclick = () => {
    localStorage.setItem(RUNS_KEY, JSON.stringify(savedRuns().filter((item) => item.id !== button.dataset.deleteRun)));
    renderSavedRuns();
  });
}

function saveCurrentRun(): void {
  if (runSaved || history.length < 2 || !runStartedAt) return;
  const durationS = history[history.length - 1].t - history[0].t;
  const run: SavedRun = { id: crypto.randomUUID(), startedAt: runStartedAt, durationS, samples: history };
  try {
    localStorage.setItem(RUNS_KEY, JSON.stringify([run, ...savedRuns()].slice(0, 12)));
    runSaved = true;
    renderSavedRuns();
  } catch { /* almacenamiento local no disponible o lleno; la sesión visible no se pierde */ }
}

function recordHistory(message: Message): void {
  const last = history.at(-1);
  if (last && message.t - last.t < SAMPLE_INTERVAL_S) return;
  const consumption = ["grid-01", "grid-02", "grid-03", "grid-04"].reduce((sum, id) => sum + (n(value(id, "consumption_m3h")) ?? 0), 0);
  const leakage = ["grid-01", "grid-02", "grid-03", "grid-04"].reduce((sum, id) => sum + (n(value(id, "leakage_m3h")) ?? 0), 0);
  const criticalValve = String(value("grid-04", "min_pressure_valve") ?? "c44");
  history.push({
    t: message.t,
    main: n(value("pumpset-main-01", "flow_m3h")) ?? 0,
    recirculation: n(value("pumpset-recirc-01", "flow_m3h")) ?? 0,
    consumption,
    leakage,
    critical: n(value("prs-01", "critical_pressure_mca")) ?? 0,
    supplyLevel: n(value("tank-supply-01", "level_pct")) ?? 0,
    pumpDischarge: n(value("pumpset-main-01", "discharge_pressure_mca")) ?? 0,
    stationIn: n(value("prs-01", "inlet_pressure_mca")) ?? 0,
    stationOut: n(value("prs-01", "outlet_pressure_mca")) ?? 0,
    grid1In: n(value("grid-01", "inlet_pressure_mca")) ?? 0,
    grid1Out: n(value("valve-between-12", "inlet_pressure_mca")) ?? 0,
    grid2Out: n(value("valve-between-23", "inlet_pressure_mca")) ?? 0,
    grid3Out: n(value("valve-between-34", "inlet_pressure_mca")) ?? 0,
    criticalFlow: n(value("grid-04", `q_${criticalValve}`)) ?? 0,
  });
  if (history.length > 5760) history.shift();
}

function trend(title: string, unit: string, samples: number[], color = "", reference?: number): string {
  const lineColor = color === "warn" ? "#4EA7FF" : color === "bad" ? "#f17474" : "#4EA7FF";
  const legend = `<div class="legend"><span><i style="background:${lineColor}"></i>Medición PLC · ${title}</span>${reference === undefined ? "" : `<span><i class="reference-key"></i>Límite de servicio</span>`}</div>`;
  if (samples.length < 2) return `<article class="trend panel"><h2>${title}<span>${unit}</span></h2><button class="chart-expand" data-expand-chart aria-label="Ampliar ${title}">⤢ AMPLIAR</button><p class="empty">Acumulando muestras…</p>${legend}</article>`;
  const width = 560, height = 160, pad = 20;
  const lo = Math.min(...samples, reference ?? Infinity);
  const hi = Math.max(...samples, reference ?? -Infinity);
  const range = Math.max(0.01, hi - lo);
  const point = (value: number, index: number) => `${pad + (index * (width - 2 * pad)) / (samples.length - 1)},${height - pad - ((value - lo) / range) * (height - 2 * pad)}`;
  const path = samples.map(point).join(" ");
  const refY = reference === undefined ? "" : `<line class="ref" x1="${pad}" x2="${width - pad}" y1="${height - pad - ((reference - lo) / range) * (height - 2 * pad)}" y2="${height - pad - ((reference - lo) / range) * (height - 2 * pad)}" />`;
  return `<article class="trend panel"><h2>${title}<span>${fmt(samples.at(-1), 2)} ${unit}</span></h2><button class="chart-expand" data-expand-chart aria-label="Ampliar ${title}">⤢ AMPLIAR</button><svg data-live-samples="${samples.join(",")}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Tendencia de ${title}"><line class="axis" x1="${pad}" x2="${width - pad}" y1="${height - pad}" y2="${height - pad}" />${refY}<polyline class="line ${color}" points="${path}" /></svg>${legend}<p class="muted">Mín. ${fmt(lo, 2)} · Máx. ${fmt(hi, 2)} · ${history.length} muestras</p></article>`;
}

function bindChartExpanders(): void {
  const modal = $<HTMLDialogElement>("chart-modal");
  const content = $("chart-modal-content");
  document.querySelectorAll<HTMLButtonElement>("[data-expand-chart], [data-expand-target]").forEach((button) => {
    button.onclick = () => {
      const target = button.dataset.expandTarget ? $<HTMLElement>(button.dataset.expandTarget) : button.closest<HTMLElement>(".trend");
      if (!target) return;
      const title = target.closest<HTMLElement>(".hydraulic-profile")?.querySelector("h2")?.textContent ?? target.querySelector("h2")?.textContent ?? "GRÁFICA AMPLIADA";
      $("chart-modal-title").textContent = title;
      content.innerHTML = target.classList.contains("hydraulic-profile-chart") ? `<div class="hydraulic-profile-chart">${target.innerHTML}</div>` : target.innerHTML;
      modal.showModal();
      const chart = content.querySelector<SVGSVGElement>("svg[data-live-samples]");
      if (chart) {
        const readings = (chart.dataset.liveSamples ?? "").split(",").map(Number);
        const measure = document.createElement("p");
        measure.className = "chart-measurement muted";
        measure.setAttribute("aria-live", "polite");
        measure.textContent = "Mueva el cursor sobre la curva para consultar una muestra PLC.";
        content.append(measure);
        chart.onpointermove = (pointer) => {
          const bounds = chart.getBoundingClientRect();
          const fraction = Math.max(0, Math.min(1, (pointer.clientX - bounds.left) / bounds.width));
          const index = Math.round(fraction * (readings.length - 1));
          const sample = history[index];
          if (!sample || !Number.isFinite(readings[index])) return;
          const elapsed = Math.floor(sample.t / 60);
          measure.textContent = `Medición PLC · ${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")} · ${fmt(readings[index], 2)} · muestra ${index + 1}/${readings.length}`;
        };
      }
    };
  });
}

function renderTrends(): void {
  if (history.length < 2) {
    $("trends-charts").innerHTML = emptyState("Aún no hay una tendencia registrada", "Las curvas se forman mientras avanza la emulación. La comparación de cálculos guardados se consulta en el reproductor del gemelo 3D.");
    return;
  }
  $("trends-charts").innerHTML = [
    trend("Caudal de bombeo principal", "m³/h", history.map((sample) => sample.main)),
    trend("Consumo residencial", "m³/h", history.map((sample) => sample.consumption), "warn"),
    trend("Fugas", "m³/h", history.map((sample) => sample.leakage), "bad"),
    trend("Presión crítica", "mca", history.map((sample) => sample.critical), "", schema.service_constraint.critical_pressure_min_mca),
    trend("Nivel tanque de bombeo", "%", history.map((sample) => sample.supplyLevel)),
    trend("Caudal de recirculación", "m³/h", history.map((sample) => sample.recirculation)),
  ].join("");
  bindChartExpanders();
}

function renderHydraulicProfile(): void {
  const criticalValve = String(value("grid-04", "min_pressure_valve") ?? "c44");
  const criticalFlow = value("grid-04", `q_${criticalValve}`);
  const points = [
    { label: "Salida bombeo", pressure: value("pumpset-main-01", "discharge_pressure_mca"), flow: value("pumpset-main-01", "flow_m3h") },
    { label: "Entrada estación", pressure: value("prs-01", "inlet_pressure_mca"), flow: value("prs-01", "flow_m3h") },
    { label: "Salida estación", pressure: value("prs-01", "outlet_pressure_mca"), flow: value("prs-01", "flow_m3h") },
    { label: "Entrada rejilla 1", pressure: value("grid-01", "inlet_pressure_mca"), flow: value("grid-01", "flow_in_m3h") },
    { label: "Salida rejilla 1", pressure: value("valve-between-12", "inlet_pressure_mca"), flow: value("valve-between-12", "flow_m3h") },
    { label: "Salida rejilla 2", pressure: value("valve-between-23", "inlet_pressure_mca"), flow: value("valve-between-23", "flow_m3h") },
    { label: "Salida rejilla 3", pressure: value("valve-between-34", "inlet_pressure_mca"), flow: value("valve-between-34", "flow_m3h") },
    { label: `Válvula crítica ${criticalValve.toUpperCase()}`, pressure: value("grid-04", "min_pressure_mca"), flow: criticalFlow, critical: true, flowUnit: "L/min" },
  ];
  const pressureMax = Math.max(1, ...points.map((point) => n(point.pressure) ?? 0));
  const flowMax = Math.max(1, ...points.map((point) => n(point.flow) ?? 0));
  const bars = (kind: "pressure" | "flow") => points.map((point) => {
    const reading = point[kind];
    const maximum = kind === "pressure" ? pressureMax : flowMax;
    const unit = kind === "pressure" ? "mca" : point.flowUnit ?? "m³/h";
    return `<div class="profile-row ${kind === "flow" ? "flow" : ""} ${point.critical ? "critical" : ""}"><span title="${point.label}">${point.label}</span><span class="profile-track"><i style="width:${100 * (n(reading) ?? 0) / maximum}%"></i></span><b>${fmt(reading, kind === "pressure" ? 1 : 2)} ${unit}</b></div>`;
  }).join("");
  $("hydraulic-profile").innerHTML = `<article class="profile-bars"><h2>Presión <span>${fmt(pressureMax)} mca máx.</span></h2>${bars("pressure")}</article><article class="profile-bars"><h2>Caudal <span>por punto</span></h2>${bars("flow")}</article>`;
  bindChartExpanders();
}

function dayChart(title: string, unit: string, series: { name: string; values: number[]; color: string }[], reference?: number): string {
  const width = 620, height = 245, left = 44, right = 14, top = 16, bottom = 30;
  const values = series.flatMap((item) => item.values);
  if (reference !== undefined) values.push(reference);
  const low = Math.min(0, ...values), high = Math.max(1, ...values), range = Math.max(0.01, high - low);
  const x = (index: number) => left + (index * (width - left - right)) / Math.max(1, history.length - 1);
  const y = (reading: number) => top + (height - top - bottom) - ((reading - low) / range) * (height - top - bottom);
  const axis = [0, .25, .5, .75, 1].map((fraction) => { const reading = low + range * fraction; return `<line x1="${left}" x2="${width - right}" y1="${y(reading)}" y2="${y(reading)}" class="axis" /><text x="${left - 5}" y="${y(reading) + 4}" text-anchor="end">${fmt(reading, 1)}</text>`; }).join("");
  const timeAxis = [0, .25, .5, .75, 1].map((fraction) => { const sample = history[Math.round((history.length - 1) * fraction)]; const elapsed = Math.floor(sample.t / 60); return `<text x="${left + fraction * (width - left - right)}" y="${height - 8}" text-anchor="middle">${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}</text>`; }).join("");
  const lines = series.map((item) => `<polyline points="${item.values.map((reading, index) => `${x(index)},${y(reading)}`).join(" ")}" fill="none" stroke="${item.color}" stroke-width="1.2" />`).join("");
  const referenceLine = reference === undefined ? "" : `<line x1="${left}" x2="${width - right}" y1="${y(reference)}" y2="${y(reference)}" class="ref" />`;
  const legend = series.map((item) => `<span><i style="background:${item.color}"></i>${item.name}</span>`).join("");
  return `<article class="trend panel"><h2>${title}<span>${unit}</span></h2><button class="chart-expand" data-expand-chart aria-label="Ampliar ${title}">⤢ AMPLIAR</button><svg class="day-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${title}"><g class="day-axis">${axis}${timeAxis}</g>${referenceLine}${lines}</svg><div class="legend">${legend}</div></article>`;
}

function integrate(reading: (sample: Sample) => number): number {
  return history.slice(1).reduce((total, sample, index) => total + reading(sample) * (sample.t - history[index].t) / 3600, 0);
}

function renderDay(): void {
  if (history.length < 2) {
    $("day-kpis").innerHTML = "";
    $("day-charts").innerHTML = emptyState("Todavía no hay datos para la curva del día", "Inicie o reanude una emulación para registrar señales, o abra las curvas de una sesión guardada desde Historial. No se muestra una curva de referencia como si fueran mediciones.");
    return;
  }
  const peak = history.reduce((best, sample) => sample.consumption > best.consumption ? sample : best, history[0]);
  const minimum = Math.min(...history.map((sample) => sample.critical));
  const consumption = integrate((sample) => sample.consumption);
  const leakage = integrate((sample) => sample.leakage);
  const duration = history[history.length - 1].t - history[0].t;
  const dayKpis: [string, string, string][] = [
    ["CONSUMO ACUMULADO", `${fmt(consumption, 2)} m³`, `historial de ${fmt(duration / 3600, 2)} h de sesión`],
    ["FUGAS ACUMULADAS", `${fmt(leakage, 2)} m³`, `${fmt(100 * leakage / Math.max(0.001, leakage + consumption), 1)} % del caudal registrado`],
    ["PICO REGISTRADO", `${String(Math.floor(peak.t / 3600)).padStart(2, "0")}:${String(Math.floor(peak.t / 60) % 60).padStart(2, "0")}`, `${fmt(peak.consumption)} m³/h residencial`],
    ["PRESIÓN MÍNIMA", `${fmt(minimum, 2)} mca`, `límite ${fmt(schema.service_constraint.critical_pressure_min_mca, 0)} mca`],
  ];
  $("day-kpis").innerHTML = dayKpis.map(([label, reading, detail]) => `<div class="kpi panel"><small>${label}</small><b>${reading}</b><small>${detail}</small></div>`).join("");
  $("day-charts").innerHTML = [
    dayChart("Caudales calculados por Planta Real", "m³/h", [{ name: "Consumo residencial", values: history.map((sample) => sample.consumption), color: "#2D7FF9" }, { name: "Fugas", values: history.map((sample) => sample.leakage), color: "#f17474" }, { name: "Bombeo", values: history.map((sample) => sample.main), color: "#4EA7FF" }]),
    dayChart("Presiones medidas", "mca", [{ name: "Salida de bombeo", values: history.map((sample) => sample.pumpDischarge), color: "#4EA7FF" }, { name: "Entrada reguladora", values: history.map((sample) => sample.stationIn), color: "#2D7FF9" }, { name: "Salida reguladora", values: history.map((sample) => sample.stationOut), color: "#55d58c" }, { name: "Punto crítico", values: history.map((sample) => sample.critical), color: "#f17474" }], schema.service_constraint.critical_pressure_min_mca),
    dayChart("Presión de la red por tramo", "mca", [{ name: "Entrada rejilla 1", values: history.map((sample) => sample.grid1In), color: "#4EA7FF" }, { name: "Salida rejilla 1", values: history.map((sample) => sample.grid1Out), color: "#2D7FF9" }, { name: "Salida rejilla 2", values: history.map((sample) => sample.grid2Out), color: "#55d58c" }, { name: "Salida rejilla 3", values: history.map((sample) => sample.grid3Out), color: "#9869ed" }]),
  ].join("");
  bindChartExpanders();
}

function renderAlarms(): void {
  const active: string[] = [];
  for (const [id, snapshot] of Object.entries(latest)) if (snapshot.state === "fault" || snapshot.active_faults.length) active.push(`${id}: ${snapshot.active_faults.join(", ") || "falla"}`);
  const critical = n(value("prs-01", "critical_pressure_mca"));
  if (critical !== null && critical < schema.service_constraint.critical_pressure_min_mca) active.unshift(`Presión crítica ${fmt(critical)} mca bajo el mínimo de servicio (${fmt(schema.service_constraint.critical_pressure_min_mca)} mca)`);
  $("alarms").innerHTML = active.length ? active.map((message) => `<div class="alarm">${message}</div>`).join("") : `<p class="muted">Sin alarmas activas.</p>`;
}

type VrpChartHour = {
  hour: number;
  commands?: { vrp_opening_pct?: number | null };
  scenarios: { state: { prs_inlet_mca: number; prs_outlet_mca: number } }[];
};

function renderVrpOptimizationCharts(hours: VrpChartHour[]): string {
  const points = hours.flatMap((item) => {
    const state = item.scenarios[1]?.state ?? item.scenarios[0]?.state;
    const opening = item.commands?.vrp_opening_pct;
    return state && typeof opening === "number" && Number.isFinite(opening)
      ? [{ hour: item.hour + 1, opening, inlet: state.prs_inlet_mca, outlet: state.prs_outlet_mca }]
      : [];
  });
  if (!points.length) return `<p class="muted">No hay aperturas VRP válidas en el rango calibrado para graficar.</p>`;

  const width = 760, height = 260, left = 54, right = 18, top = 18, bottom = 36;
  const meanInlet = points.reduce((total, point) => total + point.inlet, 0) / points.length;
  const pressureMax = Math.ceil(meanInlet / 10) * 10;
  const xOpening = (opening: number) => left + (opening - 20) / 80 * (width - left - right);
  const yPressure = (pressure: number) => top + (pressureMax - pressure) / (pressureMax - 15) * (height - top - bottom);
  const pressureTicks = [15, 30, 45, 60, 75, pressureMax].filter((tick, index, ticks) => tick <= pressureMax && ticks.indexOf(tick) === index);
  const pressureGrid = pressureTicks.map((tick) => `<line class="vrp-chart-grid" x1="${left}" x2="${width - right}" y1="${yPressure(tick)}" y2="${yPressure(tick)}"/><text class="vrp-chart-axis" x="${left - 8}" y="${yPressure(tick) + 4}" text-anchor="end">${fmt(tick, 0)}</text>`).join("");
  const curve = Array.from({ length: 41 }, (_, index) => {
    const opening = 20 + index * 2;
    const t = (opening - 20) / 80;
    const eased = (1 - Math.cos(Math.PI * t)) / 2;
    const outlet = 15 + eased * (meanInlet - 15);
    return `${index ? "L" : "M"}${xOpening(opening).toFixed(1)},${yPressure(outlet).toFixed(1)}`;
  }).join(" ");
  const operatingPoints = points.map((point) => `<circle class="vrp-chart-point" cx="${xOpening(point.opening).toFixed(1)}" cy="${yPressure(point.outlet).toFixed(1)}" r="3"><title>Hora ${String(point.hour).padStart(2, "0")}: apertura ${fmt(point.opening, 2)} %, salida ${fmt(point.outlet, 2)} mca</title></circle>`).join("");
  const curveChart = `<article class="fractal-vrp-chart panel"><h2>Curva sinusoidal de la VRP</h2><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Curva sinusoidal de apertura VRP a presión de salida; entrada media ${fmt(meanInlet, 2)} mca"><g>${pressureGrid}<line class="vrp-chart-axis-line" x1="${left}" x2="${width - right}" y1="${height - bottom}" y2="${height - bottom}"/></g><path class="vrp-chart-curve" d="${curve}"/>${operatingPoints}<text class="vrp-chart-axis" x="${left}" y="${height - 8}" text-anchor="middle">20 %</text><text class="vrp-chart-axis" x="${width - right}" y="${height - 8}" text-anchor="middle">100 %</text><text class="vrp-chart-axis" x="${(left + width - right) / 2}" y="${height - 8}" text-anchor="middle">Apertura VRP</text></svg><p class="muted">Curva teórica a entrada media ${fmt(meanInlet, 2)} mca · puntos: salidas optimizadas por hora · extremo 20 % = 15 mca</p></article>`;

  const openingMin = 20, openingMax = 100;
  const xHour = (index: number) => left + index * (width - left - right) / Math.max(1, points.length - 1);
  const yOpening = (opening: number) => top + (openingMax - opening) / (openingMax - openingMin) * (height - top - bottom);
  const openingTicks = [20, 40, 60, 80, 100];
  const openingGrid = openingTicks.map((tick) => `<line class="vrp-chart-grid" x1="${left}" x2="${width - right}" y1="${yOpening(tick)}" y2="${yOpening(tick)}"/><text class="vrp-chart-axis" x="${left - 8}" y="${yOpening(tick) + 4}" text-anchor="end">${tick}</text>`).join("");
  const openingPath = points.map((point, index) => `${index ? "L" : "M"}${xHour(index).toFixed(1)},${yOpening(point.opening).toFixed(1)}`).join(" ");
  const openingPoints = points.map((point, index) => `<circle class="vrp-chart-point" cx="${xHour(index).toFixed(1)}" cy="${yOpening(point.opening).toFixed(1)}" r="3"><title>Hora ${String(point.hour).padStart(2, "0")}: ${fmt(point.opening, 2)} %</title></circle>`).join("");
  const hourLabels = points.map((point, index) => index % 4 === 0 || index === points.length - 1 ? `<text class="vrp-chart-axis" x="${xHour(index).toFixed(1)}" y="${height - 8}" text-anchor="middle">${String(point.hour).padStart(2, "0")}</text>` : "").join("");
  const openingChart = `<article class="fractal-vrp-chart panel"><h2>Perfil optimizado de apertura · tiempo</h2><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Perfil horario optimizado de apertura de la VRP"><g>${openingGrid}<line class="vrp-chart-axis-line" x1="${left}" x2="${width - right}" y1="${height - bottom}" y2="${height - bottom}"/></g><path class="vrp-chart-curve" d="${openingPath}"/>${openingPoints}${hourLabels}</svg><p class="muted">Apertura por hora (%) · ${points.length} de ${hours.length} horas dentro del rango 20–100 %</p></article>`;
  return `<div class="fractal-vrp-charts">${curveChart}${openingChart}</div>`;
}

function trajectoryFromFrames(frames: unknown[]): TrajectoryPoint[] {
  return frames.flatMap((raw, index) => {
    if (!raw || typeof raw !== "object") return [];
    const frame = raw as Record<string, unknown>;
    const tags = (frame.plc_tags && typeof frame.plc_tags === "object" ? frame.plc_tags : {}) as Record<string, unknown>;
    const flow = Number(tags["PLC.Pump.FlowM3h"]);
    const pressure = Number(tags["PLC.Pump.DischargePressureMca"]);
    const absoluteTime = Number(frame.start_t_s ?? frame.end_t_s ?? (Number(frame.hour ?? index) * 3600));
    if (!Number.isFinite(flow) || !Number.isFinite(pressure) || !Number.isFinite(absoluteTime)) return [];
    return [{ t: Math.max(0, absoluteTime), flow, pressure }];
  });
}

type SavedStudySummary = { id: string; name: string; version_count: number; latest_version: number; updated_at: string };

async function renderSavedStudyLibrary(): Promise<void> {
  const box = $("saved-study-library");
  if (!box) return;
  const response = await apiFetch(`/api/plants/${encodeURIComponent(plantId)}/saved-studies`);
  if (!response.ok) { box.innerHTML = `<p class="muted">No se pudo cargar la biblioteca.</p>`; return; }
  const items = await response.json() as SavedStudySummary[];
  $("saved-study-count").textContent = items.length ? `· ${items.length} estudios` : "· Vacía";
  const library = document.querySelector<HTMLDetailsElement>(".study-library")!;
  if (items.length > Number(library.dataset.count ?? "-1") && items.length > 0) library.open = true;
  library.dataset.count = String(items.length);
  box.innerHTML = items.length ? items.map((item) => `<article class="panel saved-study-item"><p class="eyebrow">${item.version_count} VERSIONES · ACTUALIZADO ${safeHtml(item.updated_at)}</p><h3>${safeHtml(item.name)}</h3><p class="muted">Versión ${item.latest_version}</p><div class="controls"><a href="/plant.html?plant=${encodeURIComponent(plantId)}&savedStudy=${encodeURIComponent(item.id)}&savedVersion=${item.latest_version}${query.get("api") ? `&api=${encodeURIComponent(apiOrigin)}` : ""}">REPRODUCIR EN GEMELO 3D</a><button data-open-saved-study="${safeHtml(item.id)}">ABRIR RESULTADO</button><button data-rerun-saved-study="${safeHtml(item.id)}">RECALCULAR COMO VERSIÓN</button><button data-version-target="${safeHtml(item.id)}">USAR PRÓXIMO CÁLCULO</button><button data-rename-saved-study="${safeHtml(item.id)}">RENOMBRAR</button><button data-delete-saved-study="${safeHtml(item.id)}">ELIMINAR</button></div><div data-saved-study-result="${safeHtml(item.id)}"></div></article>`).join("") : `<p class="muted">Aún no hay estudios en esta biblioteca. Guarde una proyección desde una sesión PLC.</p>`;
  if (selectedSavedStudyId) box.querySelector(`[data-version-target="${CSS.escape(selectedSavedStudyId)}"]`)?.classList.add("primary");
}

function safeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

async function saveLatestFractalStudy(): Promise<void> {
  if (!latestFractalStudy || !sessionId || typeof latestFractalStudy.study_id !== "string") return;
  const note = $("saved-study-action-note");
  try {
    let response: Response;
    if (selectedSavedStudyId) {
      response = await apiFetch(`/api/plants/${encodeURIComponent(plantId)}/saved-studies/${encodeURIComponent(selectedSavedStudyId)}/versions`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ source_session_id: sessionId, source_study_id: latestFractalStudy.study_id }),
      });
    } else {
      const name = window.prompt("Nombre para guardar este estudio:", `${String(latestFractalStudy.study_type ?? "Fractal")} · ${new Date().toLocaleDateString("es-CO")}`)?.trim();
      if (!name) return;
      response = await apiFetch(`/api/plants/${encodeURIComponent(plantId)}/saved-studies`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, source_session_id: sessionId, source_study_id: latestFractalStudy.study_id }),
      });
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const saved = await response.json() as { id: string; latest_version: number };
    selectedSavedStudyId = null;
    note.textContent = `Guardado en la biblioteca · ${saved.id} · versión ${saved.latest_version}.`;
    await renderSavedStudyLibrary();
  } catch (error) {
    note.textContent = `No se pudo guardar el estudio: ${String(error)}`;
  }
}

async function handleSavedStudyLibraryClick(event: Event): Promise<void> {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
  if (!button) return;
  const openId = button.dataset.openSavedStudy;
  const versionId = button.dataset.versionTarget;
  const rerunId = button.dataset.rerunSavedStudy;
  const deleteId = button.dataset.deleteSavedStudy;
  const renameId = button.dataset.renameSavedStudy;
  if (openId) {
    const response = await apiFetch(`/api/plants/${encodeURIComponent(plantId)}/saved-studies/${encodeURIComponent(openId)}`);
    if (!response.ok) return;
    const saved = await response.json() as { versions: { version: number }[] };
    const latestSummary = saved.versions.at(-1);
    if (!latestSummary) return;
    const versionResponse = await apiFetch(`/api/plants/${encodeURIComponent(plantId)}/saved-studies/${encodeURIComponent(openId)}/versions/${latestSummary.version}`);
    if (!versionResponse.ok) return;
    const latest = await versionResponse.json() as { version: number; created_at: string; source_study_id: string; result: Record<string, unknown> };
    const target = document.querySelector<HTMLElement>(`[data-saved-study-result="${CSS.escape(openId)}"]`);
    if (target) {
      const pre = document.createElement("pre");
      pre.className = "saved-study-json";
      pre.textContent = JSON.stringify({ version: latest.version, created_at: latest.created_at, source_study_id: latest.source_study_id, result: latest.result }, null, 2);
      target.replaceChildren(pre);
    }
  } else if (rerunId) {
    const response = await apiFetch(`/api/plants/${encodeURIComponent(plantId)}/saved-studies/${encodeURIComponent(rerunId)}`);
    if (!response.ok) return;
    const archived = await response.json() as { versions: { version: number }[] };
    const latestSummary = archived.versions.at(-1);
    if (!latestSummary) return;
    const versionResponse = await apiFetch(`/api/plants/${encodeURIComponent(plantId)}/saved-studies/${encodeURIComponent(rerunId)}/versions/${latestSummary.version}`);
    if (!versionResponse.ok) return;
    const latestVersion = await versionResponse.json() as { version: number; result: Record<string, unknown> };
    const sourceInput = latestVersion.result.study_input as Record<string, unknown> | undefined;
    const originalProfile = sourceInput?.profile as OperationProfile | undefined;
    const profileWasEdited = Boolean(activeProfileId && JSON.stringify(activeProfile) !== JSON.stringify(originalProfile));
    const useEditedProfile = Boolean(profileWasEdited && window.confirm(`¿Recalcular con el escenario actualmente seleccionado «${activeProfile.name}»? Cancelar conserva exactamente el escenario archivado.`));
    const body: Record<string, unknown> = {
      plant_id: plantId, saved_study_id: rerunId, version: latestVersion.version, emulator_api: apiOrigin,
      ...(useEditedProfile ? { profile: activeProfile } : {}),
    };
    if (latestVersion.result.study_type === "optimized") {
      const priorTarget = Number(latestVersion.result.target_pressure_mca ?? sourceInput?.target_pressure_mca ?? 18);
      const entered = window.prompt("Presión mínima de las 64 viviendas para la nueva versión (10–45 mca):", String(priorTarget));
      if (entered === null) return;
      const target = Number(entered);
      if (!Number.isFinite(target) || target < 10 || target > 45) { window.alert("El objetivo debe estar entre 10 y 45 mca."); return; }
      body.target_pressure_mca = target;
    }
    $("saved-study-action-note").textContent = "Recalculando desde la instantánea y el perfil archivados; no se leerá ni accionará el PLC…";
    const rerun = await fractalFetch("/studies/saved/rerun", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (!rerun.ok) {
      const detail = await rerun.json().catch(() => ({})) as { detail?: string };
      $("saved-study-action-note").textContent = detail.detail ?? `No se pudo recalcular (HTTP ${rerun.status}).`;
      return;
    }
    const updated = await rerun.json() as { id: string; latest_version: number };
    $("saved-study-action-note").textContent = `Nueva versión calculada desde inputs congelados · ${updated.id} · v${updated.latest_version}. No aplicada al PLC.`;
    await renderSavedStudyLibrary();
  } else if (versionId) {
    selectedSavedStudyId = versionId;
    $("saved-study-action-note").textContent = `El próximo cálculo Fractal se guardará como nueva versión de ${versionId}; el resultado previo no se sobrescribe.`;
    await renderSavedStudyLibrary();
  } else if (renameId) {
    const name = window.prompt("Nuevo nombre del estudio:")?.trim();
    if (!name) return;
    const response = await apiFetch(`/api/plants/${encodeURIComponent(plantId)}/saved-studies/${encodeURIComponent(renameId)}`, {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }),
    });
    if (response.ok) await renderSavedStudyLibrary();
  } else if (deleteId && window.confirm("¿Eliminar definitivamente este estudio y todas sus versiones? Esta acción no se puede deshacer.")) {
    const response = await apiFetch(`/api/plants/${encodeURIComponent(plantId)}/saved-studies/${encodeURIComponent(deleteId)}`, { method: "DELETE" });
    if (response.ok) {
      if (selectedSavedStudyId === deleteId) selectedSavedStudyId = null;
      await renderSavedStudyLibrary();
    }
  }
}

async function renderFractal(): Promise<void> {
  void renderSavedStudyLibrary();
  const box = $("fractal-saved");
  if (!sessionId) { box.innerHTML = `<p class="muted">Inicie una sesión PLC para consultar estudios de esta sesión.</p>`; return; }
  const response = await apiFetch(`/api/plants/${plantId}/sessions/${sessionId}/fractal/studies`);
  if (!response.ok) { box.innerHTML = `<p class="muted">No se pudo consultar estudios de esta sesión.</p>`; return; }
  const studies = await response.json() as { study_id: string; study_type: string; base_time: number; profile_id?: string; profile_name?: string }[];
  const labels: Record<string, string> = { baseline: "Proyección base", alternative: "Escenario alternativo", optimized: "Optimización horaria" };
  const visibleStudies = studies.filter((study) => study.study_type in labels);
  const optimizedStudy = visibleStudies.find((study) => study.study_type === "optimized");
  if (optimizedStudy) {
    const framesResponse = await apiFetch(`/api/plants/${plantId}/sessions/${sessionId}/fractal/studies/${encodeURIComponent(optimizedStudy.study_id)}/frames`);
    if (framesResponse.ok) {
      const data = await framesResponse.json() as { base_time?: number; frames?: unknown[] };
      optimizedTrajectory = trajectoryFromFrames(data.frames ?? []);
    }
  } else optimizedTrajectory = [];
  renderSupplyComparison();
  const safe = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
  if (!latestFractalStudy) $("saved-study-action-note").textContent = "Guardar se habilita al terminar un cálculo nuevo.";
  if (!latestFractalStudy) $("fractal-recommendations").innerHTML = `<p class="muted">${visibleStudies.length ? "Abra uno de los estudios de esta sesión, o calcule uno nuevo en el paso 4." : "Todavía no ha calculado un estudio en esta sesión. Use el paso 4 para comenzar."}</p>`;
  box.innerHTML = visibleStudies.length ? `<h3 class="study-list-title">Estudios de esta sesión</h3>${visibleStudies.map((study) => {
    const profile = study.profile_name ?? study.profile_id ?? "perfil";
    return `<article class="panel study-session-item"><div><h3>${labels[study.study_type]}</h3><p class="muted">${safe(profile)}</p><p class="muted">Calculado desde ${comparisonTime(study.base_time)}</p></div><a href="/plant.html?plant=${encodeURIComponent(plantId)}&session=${encodeURIComponent(sessionId!)}&study=${encodeURIComponent(study.study_id)}${query.get("api") ? `&api=${encodeURIComponent(apiOrigin)}` : ""}">VER EN 3D</a><details><summary>Detalles del estudio</summary><p>${safe(study.study_id)}</p></details></article>`;
  }).join("")}` : `<p class="muted">No hay escenarios futuros guardados en esta sesión.</p>`;
}

function renderVisibleScreen(): void {
  const active = document.querySelector<HTMLElement>(".screen.active")?.id;
  if (active === "master") renderMaster();
  else if (active === "day") renderDay();
  else if (active === "pumping") { renderPumping(); renderHydraulicProfile(); if ($("grid").classList.contains("active")) renderGrid(); }
  else if (active === "grid") renderGrid();
  else if (active === "trends") renderTrends();
  else if (active === "history") renderSavedRuns();
}

function render(message: Message): void {  latest = message.snapshot.equipment;
  simTime = message.t;
  plcRunning = message.running ?? true;
  paused = message.paused;
  activeSessionProfileId = message.plc_tags?.["PLC.Profile.ActiveId"] as string | null ?? activeSessionProfileId;
  pendingSessionProfileId = message.plc_tags?.["PLC.Profile.PendingId"] as string | null ?? pendingSessionProfileId;
  if (activeSessionProfileId && activeSessionProfileId === pendingSessionProfileId) pendingSessionProfileId = null;
  renderWorkspaceContext();
  renderSessionControls();
  latestTags = message.plc_tags ?? latestTags;
  for (const asset of schema.assets) {
    const node = document.querySelector<HTMLElement>(`[data-asset="${asset.id}"]`);
    const state = eq(asset.id)?.state ?? "—";
    if (node) { node.textContent = state.toUpperCase(); node.className = `state ${state}`; }
  }
  const hh = String(Math.floor(simTime / 3600)).padStart(2, "0");
  const mm = String(Math.floor((simTime % 3600) / 60)).padStart(2, "0");
  const ss = String(Math.floor(simTime % 60)).padStart(2, "0");
  const effectiveSpeed = message.effective_speed ?? 0;
  const simulationLag = message.simulation_lag_s ?? 0;
  $("clock").textContent = `SIM ${hh}:${mm}:${ss} · OBJ ×${message.speed} · REAL ×${fmt(effectiveSpeed, 1)} · RETRASO ${fmt(simulationLag, 0)}s`;
  $("clock").title = "Velocidad seleccionada vs. velocidad efectiva observada; retraso pendiente expresado en segundos simulados.";
  $<HTMLSelectElement>("session-speed").value = String(message.speed);
  recordHistory(message);
  const lockHour = Math.floor(simTime / 3600);
  if (lockHour !== lastProfileLockHour && (document.querySelector<HTMLElement>(".screen.active")?.id === "profiles" || liveProfileEditing)) {
    lastProfileLockHour = lockHour;
    renderProfileEditor();
  }
  renderVisibleScreen();
  renderAlarms();
  if (message.t >= DAY_SECONDS) { saveCurrentRun(); socket?.close(); }
}

async function stopSession(): Promise<void> {
  if (!sessionId) return;
  stopRequested = true;
  renderSessionControls();
  const response = await apiFetch(`/api/plants/${plantId}/sessions/${sessionId}/stop`, { method: "POST" });
  if (!response.ok) { stopRequested = false; renderSessionControls(); throw Error(`No se pudo detener la sesión PLC (${response.status}).`); }
  plcRunning = false; paused = false;
  renderSessionControls(); renderRunProfileSelector();
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    socket.close();
  } else {
    stopRequested = false;
    saveCurrentRun();
    $("connection").textContent = "● EMULACIÓN DETENIDA · ÚLTIMO ESTADO CONSERVADO";
    $("connection").classList.remove("on");
    renderSessionControls();
  }
}

async function connect(): Promise<void> {
  if (socket?.readyState === WebSocket.OPEN) return;
  // Evita dobles clics mientras el proxy WebSocket termina el handshake.
  if (socket?.readyState === WebSocket.CONNECTING) return;
  if (!sessionId && !activeProfileId) { window.alert("Seleccione un escenario guardado antes de iniciar la emulación."); return; }
  if (sessionId && activeProfileId && activeSessionProfileId && activeProfileId !== activeSessionProfileId) {
    sessionId = null; activeSessionProfileId = null; pendingSessionProfileId = null;
    query.delete("session");
    window.history.replaceState(null, "", `${location.pathname}?${query}`);
  }
  saveCurrentRun();
  history = [];
  runStartedAt = new Date().toISOString();
  runSaved = false;
  renderDay();
  $("connection").textContent = "● INICIANDO EMULACIÓN PLC…";
  plcRunning = true;
  renderSessionControls();
  try {
    if (!sessionId) {
      const created = await apiFetch(`/api/plants/${plantId}/sessions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ profile_id: activeProfileId }) });
      if (!created.ok) throw Error("no se pudo crear la sesión");
      sessionId = (await created.json() as { id: string }).id;
      activeSessionProfileId = activeProfileId;
      pendingSessionProfileId = null;
      renderWorkspaceContext();
      renderRunProfileSelector();
      notify3d("plc-session-created", { sessionId });
      query.set("session", sessionId);
      window.history.replaceState(null, "", `${location.pathname}?${query}`);
      $<HTMLAnchorElement>("link-plant").href = `/plant.html?plant=${plantId}${query.get("api") ? `&api=${encodeURIComponent(apiOrigin)}` : ""}`;
    }
    // La conexión PLC inicia o reanuda la sesión guardada; sin conexión no queda un ciclo huérfano.
    socket = await demoWebSocket(apiOrigin, `/api/plants/${plantId}/sessions/${sessionId}?role=plc`);
  } catch (error) {
    plcRunning = false;
    $("connection").textContent = `● ERROR · ${String(error)}`;
    renderSessionControls();
    return;
  }
  socket.onopen = () => {
    $("connection").textContent = "● EMULACIÓN EN MARCHA · PLC VIRTUAL";
    $("connection").classList.add("on");
    renderSessionControls(); renderRunProfileSelector();
    void renderFractal();
  };
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data) as Message & { error?: string };
    if (message.error) { $("connection").textContent = `● ERROR · ${message.error}`; return; }
    render(message);
  };
  socket.onerror = () => { $("connection").textContent = "● ERROR DE CONEXIÓN CON PLANTA REAL"; };
  socket.onclose = () => {
    saveCurrentRun(); socket = null; plcRunning = false; paused = false;
    const stopped = stopRequested; stopRequested = false;
    $("connection").textContent = stopped ? "● EMULACIÓN DETENIDA · ÚLTIMO ESTADO CONSERVADO" : "● SESIÓN DESCONECTADA";
    $("connection").classList.remove("on");
    renderSessionControls(); renderRunProfileSelector();
  };
}

function currentProfileHour(): ProfileHour {
  const key = String(profileHour);
  return activeProfile.hours[key] ?? (activeProfile.hours[key] = {});
}

function updateProfileHourFromForm(): void {
  const hour = currentProfileHour();
  hour.global_consumers_pct = Number($<HTMLInputElement>("profile-global").value);
  hour.levels = Object.fromEntries([...document.querySelectorAll<HTMLInputElement>("[data-profile-level]")].map((input) => [input.dataset.profileLevel!, Number(input.value)]));
  hour.between_levels = Object.fromEntries([...document.querySelectorAll<HTMLInputElement>("[data-profile-between]")].map((input) => [input.dataset.profileBetween!, Number(input.value)]));
  const mode = $<HTMLSelectElement>("profile-prs-mode").value as "critical_pressure" | "critical_point" | "fixed_outlet";
  const inletValue = $<HTMLInputElement>("profile-prs-inlet").value;
  if (hour.prs || profilePrsControlsTouched) {
    const autoOutlet = Number($<HTMLInputElement>("profile-prs-auto-outlet").value);
    const openingValue = $<HTMLInputElement>("profile-prs-opening").value.trim();
    hour.prs = {
      ...hour.prs,
      branch: $<HTMLSelectElement>("profile-prs-branch").value as "auto" | "manual",
      control_mode: mode,
      critical_setpoint_mca: Number($<HTMLInputElement>("profile-prs-critical").value),
      manual_setting_mca: Number($<HTMLInputElement>("profile-prs-manual").value),
    };
    if (openingValue) hour.prs.auto_opening_pct = Number(openingValue);
    else delete hour.prs.auto_opening_pct;
    if (inletValue.trim()) hour.prs.inlet_pressure_mca = Number(inletValue);
    else delete hour.prs.inlet_pressure_mca;
    if (mode === "critical_point") hour.prs.critical_control_point = "L4.C44";
    else delete hour.prs.critical_control_point;
    if (mode === "fixed_outlet") hour.prs.auto_outlet_mca = autoOutlet;
    else delete hour.prs.auto_outlet_mca;
  }
}

function effectiveOpenings(upToHour: number): { consumers: Record<string, number>; leaks: Record<string, number> } {
  // Misma precedencia del PLC: un mando global/nivel sobrescribe aperturas previas;
  // las horas sin mandos conservan el último estado, incluso para fugas individuales.
  const consumers: Record<string, number> = {};
  const leaks: Record<string, number> = {};
  for (let level = 1; level <= 4; level++) {
    for (let branch = 1; branch <= 4; branch++) for (let house = 1; house <= 4; house++) consumers[`grid-0${level}.c${branch}${house}`] = 100;
    for (const valve of ["l1", "l2"]) leaks[`grid-0${level}.${valve}`] = 100;
  }
  for (let hour = 0; hour <= upToHour; hour++) {
    const entry = activeProfile.hours[String(hour)];
    if (!entry) continue;
    for (let level = 1; level <= 4; level++) {
      const grid = `grid-0${level}`;
      const global = entry.global_consumers_pct;
      const opening = entry.levels?.[String(level)] ?? global;
      if (opening !== undefined) for (let branch = 1; branch <= 4; branch++) for (let house = 1; house <= 4; house++) consumers[`${grid}.c${branch}${house}`] = opening;
      for (const [valve, pct] of Object.entries(entry.dwellings?.[grid] ?? {})) consumers[`${grid}.${valve}`] = pct;
      for (const [valve, pct] of Object.entries(entry.leaks?.[grid] ?? {})) leaks[`${grid}.${valve}`] = pct;
    }
  }
  return { consumers, leaks };
}

function effectivePrsOpening(upToHour: number): number | undefined {
  for (let hour = upToHour; hour >= 0; hour--) {
    const opening = activeProfile.hours[String(hour)]?.prs?.auto_opening_pct;
    if (typeof opening === "number") return opening;
  }
  return undefined;
}

function profileHourLockReason(hour: number): string | null {
  const sessionProfile = activeProfileId === activeSessionProfileId || activeProfileId === pendingSessionProfileId;
  if (!sessionId || (!plcRunning && !liveProfileEditing) || (!sessionProfile && !liveProfileEditing)) return null;
  const currentHour = Math.floor(simTime / 3600);
  if (hour > currentHour || (liveProfileEditing && hour === currentHour)) return null;
  const start = `${String(hour).padStart(2, "0")}:00`;
  const end = `${String(hour + 1).padStart(2, "0")}:00`;
  return `FRANJA BLOQUEADA · ${start}–${end}. ${hour < currentHour ? "Ya terminó" : "Ya comenzó"}; no se puede editar aquí.`;
}

async function persistFutureProfileEdit(hour: number): Promise<void> {
  if (liveProfileEditing) return;
  if (!sessionId || !plcRunning || !activeProfileId || (activeProfileId !== activeSessionProfileId && activeProfileId !== pendingSessionProfileId)) return;
  const blocked = profileHourLockReason(hour);
  if (blocked) { $("profile-point-status").textContent = blocked; return; }
  if (profileEditInFlight) { $("profile-point-status").textContent = "Guardando el cambio futuro anterior… espera antes de editar otra franja."; return; }
  profileEditInFlight = true;
  const status = $("profile-point-status");
  status.textContent = `Programando automáticamente desde la franja ${String(hour).padStart(2, "0")}:00…`;
  try {
    const createdResponse = await apiFetch(`/api/plants/${plantId}/operation-profiles`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(activeProfile),
    });
    const created = await createdResponse.json().catch(() => ({})) as OperationProfile & { detail?: string };
    if (!createdResponse.ok || !created.id) throw Error(created.detail ?? "No se pudo crear la versión privada del escenario.");
    const startsAtHour = Math.min(hour, pendingSessionProfileHour ?? hour);
    const scheduledResponse = await apiFetch(`/api/plants/${plantId}/sessions/${sessionId}/schedule-profile`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ profile_id: created.id, starts_at_hour: startsAtHour }),
    });
    const scheduled = await scheduledResponse.json().catch(() => ({})) as { starts_at_hour?: number; detail?: string };
    if (!scheduledResponse.ok) throw Error(scheduled.detail ?? "El reloj avanzó; vuelve a elegir una franja futura.");
    profiles.push(created);
    activeProfile = structuredClone(created);
    activeProfileId = created.id;
    pendingSessionProfileId = created.id;
    pendingSessionProfileHour = scheduled.starts_at_hour ?? startsAtHour;
    renderWorkspaceContext();
    renderRunProfileSelector();
    renderProfileEditor();
    $("profile-point-status").textContent = `Cambio programado automáticamente desde la hora ${String(pendingSessionProfileHour + 1).padStart(2, "0")}. Historial intacto; los futuros anteriores quedan desactualizados.`;
    void loadComparisons().catch(() => { $("triad-position").textContent = "No se pudo actualizar el estado de las comparaciones anteriores."; });
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : "No se pudo aplicar el cambio futuro.";
  } finally {
    profileEditInFlight = false;
  }
}

function profilePointValue(): number | undefined {
  const hour = currentProfileHour();
  if (profileParameter === "global") return hour.global_consumers_pct ?? 100;
  if (profileParameter.startsWith("level-")) {
    const level = profileParameter.slice(6);
    return hour.levels?.[level] ?? hour.global_consumers_pct ?? 100;
  }
  if (profileParameter.startsWith("between-")) return hour.between_levels?.[profileParameter.slice(8)] ?? 100;
  return effectivePrsOpening(profileHour);
}

function setProfilePointValue(value: number): void {
  const hour = currentProfileHour();
  if (profileParameter === "global") hour.global_consumers_pct = value;
  else if (profileParameter.startsWith("level-")) (hour.levels ??= {})[profileParameter.slice(6)] = value;
  else if (profileParameter.startsWith("between-")) (hour.between_levels ??= {})[profileParameter.slice(8)] = value;
  else hour.prs = { ...hour.prs, auto_opening_pct: value };
}

function profileHourContext(hour: number): string {
  const range = `${String(hour).padStart(2, "0")}:00–${String(hour + 1).padStart(2, "0")}:00`;
  const label = `H${String(hour + 1).padStart(2, "0")} · ${range}`;
  const belongsToSession = activeProfileId === activeSessionProfileId || activeProfileId === pendingSessionProfileId;
  if (sessionId && plcRunning && belongsToSession) {
    const currentHour = Math.floor(simTime / 3600);
    if (liveProfileEditing && hour === currentHour) return `FRANJA ACTUAL · ${label}. Guardar y aplicar actuará desde el instante actual, sin reescribir mediciones anteriores.`;
    return hour <= currentHour
      ? `FRANJA EN CURSO O YA INICIADA · ${label}. Está bloqueada: no cambia ni reescribe el instante actual.`
      : liveProfileEditing
        ? `FRANJA FUTURA · ${label}. Solo cambia el borrador; Guardar y aplicar programará el cambio para esta franja.`
        : `PUNTO FUTURO · ${label}. Guarde explícitamente los cambios antes de programarlos; editar la curva solo cambia el borrador.`;
  }
  if (sessionId && plcRunning) return `BORRADOR NO APLICADO · ${label}. Este punto cambia el archivo seleccionado, no la sesión en marcha; guarde y programe el perfil si desea aplicarlo.`;
  if (sessionId) return `PERFIL · ${label}. Esta edición no altera la sesión detenida; inicie una nueva sesión con este perfil para usarla.`;
  return `PUNTO DEL PERFIL · ${label}. Define el valor de esta hora cuando se ejecute el escenario; no actúa en tiempo real.`;
}

let selectedChartCurve: ProfileParameter = "level-1";
function closePointPopover(): void { document.querySelector("#scenario-point-popover")?.remove(); document.querySelector("#scenario-drag-value")?.remove(); }
function pointEditBlockReason(hour: number): string | null {
  return activeProfileId?.startsWith("builtin-") ? "Plantilla de solo lectura. Guarde una copia para editarla." : profileHourLockReason(hour);
}
function commitChartPoint(hour: number, parameter: ProfileParameter, value: number): string | null {
  const blocked = pointEditBlockReason(hour);
  if (blocked) return blocked;
  const minimum = parameter === "prs" ? 20 : 0;
  if (!Number.isFinite(value) || value < minimum || value > 100) return `Introduzca un porcentaje entre ${minimum} y 100.`;
  profileHour = hour; profileParameter = parameter;
  setProfilePointValue(Math.round(value * 100) / 100);
  // Synchronize all fields before a subsequent explicit Save reads the form.
  renderProfileEditor();
  return null;
}
function openPointPopover(hour: number, parameter: ProfileParameter, x: number, y: number): void {
  closePointPopover();
  const selectedId = activeProfileId;
  const popover = document.createElement("form");
  popover.id = "scenario-point-popover"; popover.className = "scenario-point-popover";
  popover.setAttribute("role", "dialog"); popover.setAttribute("aria-label", "Editar apertura horaria");
  const title = document.createElement("strong");
  title.textContent = `H${String(hour + 1).padStart(2, "0")} · ${parameter === "prs" ? "VRP AUTO" : "Nivel " + parameter.slice(6)}`;
  const label = document.createElement("label"); label.textContent = "Apertura (%)";
  const input = document.createElement("input"); input.type = "number"; input.step = "0.5";
  input.min = parameter === "prs" ? "20" : "0"; input.max = "100"; input.required = true;
  input.value = String(profilePointValue() ?? "");
  const down = document.createElement("button"); down.type = "button"; down.textContent = "▼"; down.setAttribute("aria-label", "Disminuir apertura 0,5 puntos"); down.onclick = () => { input.stepDown(); input.dispatchEvent(new Event("input", { bubbles: true })); };
  const up = document.createElement("button"); up.type = "button"; up.textContent = "▲"; up.setAttribute("aria-label", "Aumentar apertura 0,5 puntos"); up.onclick = () => { input.stepUp(); input.dispatchEvent(new Event("input", { bubbles: true })); };
  const numeric = document.createElement("div"); numeric.className = "scenario-numeric-stepper"; numeric.append(input, down, up); label.append(numeric);
  const note = document.createElement("p"); note.setAttribute("role", "status");
  const blocked = pointEditBlockReason(hour);
  if (blocked) { title.textContent = `BLOQUEADO · ${title.textContent}`; popover.setAttribute("aria-label", "Consultar franja bloqueada"); }
  note.textContent = blocked ?? (liveProfileEditing ? "Solo cambia el borrador. Confirme con Guardar y aplicar cambios." : "Actualiza el borrador. Pulse Guardar en archivo para conservarlo.");
  const actions = document.createElement("div");
  const apply = document.createElement("button"); apply.type = "submit"; apply.textContent = "ACTUALIZAR PUNTO";
  const close = document.createElement("button"); close.type = "button"; close.textContent = "CERRAR";
  input.disabled = apply.disabled = down.disabled = up.disabled = Boolean(blocked);
  actions.append(apply, close); popover.append(title, label, note, actions); document.body.append(popover);
  const rect = popover.getBoundingClientRect();
  popover.style.left = `${Math.max(8, Math.min(x + 12, innerWidth - rect.width - 8))}px`;
  popover.style.top = `${Math.max(8, Math.min(y + 12, innerHeight - rect.height - 8))}px`;
  close.onclick = closePointPopover;
  input.oninput = () => {
    if (activeProfileId !== selectedId || !input.value.trim() || !input.checkValidity()) return;
    const error = commitChartPoint(hour, parameter, input.valueAsNumber);
    if (error) { note.textContent = error; return; }
    document.body.append(popover);
    note.textContent = liveProfileEditing ? "Borrador actualizado. Confirme con Guardar y aplicar cambios." : "Valor actualizado en el borrador. Guarde el archivo para conservarlo.";
    input.focus();
  };
  popover.onkeydown = (event) => { if (event.key === "Escape") { event.preventDefault(); closePointPopover(); } };
  popover.onsubmit = (event) => {
    event.preventDefault();
    if (activeProfileId !== selectedId) { closePointPopover(); return; }
    const error = commitChartPoint(hour, parameter, input.value.trim() ? Number(input.value) : NaN);
    if (error) { note.textContent = error; return; }
    $("profile-point-status").textContent = "Punto actualizado en el borrador. Guarde el archivo para conservar el cambio.";
  };
  if (!blocked) input.focus();
}
function bindChartPoint(point: SVGCircleElement): void {
  const hour = Number(point.dataset.profileHour), parameter = point.dataset.profileParameter as ProfileParameter;
  const select = () => { if (!liveProfileEditing && !pointEditBlockReason(profileHour)) updateProfileHourFromForm(); profileHour = hour; profileParameter = parameter; };
  let drag: { id: number; y: number; value: number; moved: boolean; originalY: string; originalTitle: string } | null = null;
  const handle = point.parentElement?.querySelector<SVGCircleElement>(`[data-hit-hour="${hour}"]`) ?? point;
  handle.style.touchAction = "none";
  const down = (event: PointerEvent) => {
    if (event.button !== 0 || parameter !== selectedChartCurve) return;
    event.preventDefault(); closePointPopover(); select();
    if (pointEditBlockReason(hour)) { renderProfileEditor(); openPointPopover(hour, parameter, event.clientX, event.clientY); return; }
    drag = { id: event.pointerId, y: event.clientY, value: profilePointValue() ?? 0, moved: false,
      originalY: point.getAttribute("cy")!, originalTitle: point.querySelector("title")?.textContent ?? "" };
    handle.setPointerCapture(event.pointerId);
  };
  const move = (event: PointerEvent) => {
    if (!drag || drag.id !== event.pointerId) return;
    const svg = point.ownerSVGElement!, matrix = svg.getScreenCTM();
    if (!matrix) return;
    const cursor = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    drag.value = Math.round(Math.max(parameter === "prs" ? 20 : 0, Math.min(100, (244 - cursor.y) / 226 * 100)) * 2) / 2;
    drag.moved ||= Math.abs(event.clientY - drag.y) > 3;
    if (drag.moved) {
      point.setAttribute("cy", String(18 + 226 * (1 - drag.value / 100)));
      const title = point.querySelector("title"); if (title) title.textContent = `${drag.value.toFixed(2)} %`;
      svg.querySelector(`[data-scenario-series="${parameter}"]`)?.setAttribute("d", [...svg.querySelectorAll<SVGCircleElement>(`.scenario-point[data-profile-parameter="${parameter}"]`)].map((p, i) => `${i ? "L" : "M"}${p.getAttribute("cx")},${p.getAttribute("cy")}`).join(" "));
      let bubble = document.querySelector<HTMLOutputElement>("#scenario-drag-value");
      if (!bubble) { bubble = document.createElement("output"); bubble.id = "scenario-drag-value"; bubble.setAttribute("aria-live", "polite"); document.body.append(bubble); }
      bubble.textContent = `H${String(hour + 1).padStart(2, "0")} · ${drag.value.toFixed(1)} %`;
      bubble.style.left = `${Math.max(8, Math.min(event.clientX + 16, innerWidth - 160))}px`; bubble.style.top = `${Math.max(8, event.clientY - 42)}px`;
      $("profile-point-status").textContent = `H${String(hour + 1).padStart(2, "0")} · ${drag.value.toFixed(2)} % · suelte para actualizar el borrador`;
    }
  };
  const up = (event: PointerEvent) => {
    if (!drag || drag.id !== event.pointerId) return;
    const edit = drag; drag = null;
    if (edit.moved) {
      const error = commitChartPoint(hour, parameter, edit.value);
      if (error) { renderProfileEditor(); $("profile-point-status").textContent = error; return; }
    } else renderProfileEditor();
    openPointPopover(hour, parameter, event.clientX, event.clientY);
  };
  const cancel = () => { drag = null; closePointPopover(); renderProfileEditor(); };
  handle.onpointerdown = point.onpointerdown = down;
  handle.onpointermove = point.onpointermove = move;
  handle.onpointerup = point.onpointerup = up;
  handle.onpointercancel = point.onpointercancel = cancel;
  point.onkeydown = (event) => {
    if (parameter !== selectedChartCurve || !["Enter", " "].includes(event.key)) return;
    event.preventDefault(); select(); const rect = point.getBoundingClientRect();
    renderProfileEditor(); openPointPopover(hour, parameter, rect.x, rect.y);
  };
}
function renderProfileChart(): void {
  closePointPopover();
  const values = Array.from({ length: 24 }, (_, hour) => {
    const openings = effectiveOpenings(hour);
    const means = [1, 2, 3, 4].map((level) => {
      const entries = Object.entries(openings.consumers).filter(([key]) => key.startsWith(`grid-0${level}.`));
      return entries.reduce((sum, [, value]) => sum + value, 0) / Math.max(1, entries.length);
    });
    return { levels: means, vrp: effectivePrsOpening(hour) };
  });
  const width = 1100, height = 280, left = 48, right = 16, top = 18, bottom = 36;
  const x = (hour: number) => left + hour * (width - left - right) / 23;
  const y = (value: number, max: number) => top + (height - top - bottom) * (1 - value / max);
  const hourLabels = values.map((_, hour) => `<text class="scenario-hour-label" x="${x(hour)}" y="${height - 10}" text-anchor="middle">${String(hour + 1).padStart(2, "0")}</text>`).join("");
  const chart = (title: string, max: number, series: { label: string; color: string; value: (point: typeof values[number]) => number | undefined; parameter: ProfileParameter }[]) => {
    const grid = [0, .25, .5, .75, 1].map((fraction) => {
      const reading = max * (1 - fraction);
      return `<line class="scenario-grid" x1="${left}" x2="${width - right}" y1="${y(reading, max)}" y2="${y(reading, max)}"/><text class="scenario-axis" x="${left - 7}" y="${y(reading, max) + 4}" text-anchor="end">${Math.round(reading)}%</text>`;
    }).join("");
    const pastEnd = Math.min(23, Math.floor(simTime / 3600));
    const pastArea = liveProfileEditing && pastEnd > 0 ? `<rect x="${left}" y="${top}" width="${x(pastEnd) - left}" height="${height - top - bottom}" fill="#64748b" opacity=".18" pointer-events="none"/><text class="scenario-axis" x="${left + 8}" y="${top + 14}">PASADO · SOLO LECTURA</text>` : "";
    const lines = [...series].sort((a, b) => Number(a.parameter === selectedChartCurve) - Number(b.parameter === selectedChartCurve)).map((item) => {
      let connected = false;
      const path = values.map((point, hour) => {
        const reading = item.value(point);
        if (reading === undefined || !Number.isFinite(reading)) { connected = false; return ""; }
        const command = connected ? "L" : "M"; connected = true;
        return `${command}${x(hour)},${y(reading, max)}`;
      }).join(" ");
      const markers = values.map((point, hour) => {
        const reading = item.value(point);
        if (reading === undefined || !Number.isFinite(reading)) return "";
        const locked = Boolean(profileHourLockReason(hour));
        return `<circle class="scenario-point-hit ${locked ? "locked" : ""}" data-hit-hour="${hour}" cx="${x(hour)}" cy="${y(reading, max)}" r="14" fill="transparent" stroke="none" aria-hidden="true"/><circle class="scenario-point ${hour === profileHour ? "selected" : ""} ${locked ? "locked" : ""}" style="color:${item.color}" data-profile-hour="${hour}" data-profile-parameter="${item.parameter}" tabindex="${item.parameter === selectedChartCurve ? 0 : -1}" role="button" aria-disabled="${locked || Boolean(activeProfileId?.startsWith("builtin-"))}" aria-label="${locked ? "Franja bloqueada:" : "Editar"} ${item.label}, hora ${hour + 1}, ${reading.toFixed(2)} %" cx="${x(hour)}" cy="${y(reading, max)}" r="${hour === profileHour ? 4 : 2.5}"><title>Hora ${String(hour + 1).padStart(2, "0")} · ${item.label}: ${reading.toFixed(2)} %${locked ? " · franja bloqueada" : ""}</title></circle>`;
      }).join("");
      return `<g class="scenario-series ${item.parameter === selectedChartCurve ? "active-curve" : "inactive-curve"}" data-curve="${item.parameter}"><path data-scenario-series="${item.parameter}" fill="none" stroke="${item.color}" stroke-width="${item.parameter === selectedChartCurve ? 2.5 : 1.2}" ${item.parameter === "prs" ? 'stroke-dasharray="7 4"' : ""} d="${path}"/>${markers}</g>`;
    }).join("");
    const legend = series.map((item) => `<span><i style="background:${item.color}"></i>${item.label}</span>`).join("");
    return `<article class="scenario-chart-card"><div class="scenario-chart-toolbar"><div class="scenario-curve-buttons" role="group" aria-label="Curva que va a editar"><strong>Curva que va a editar</strong>${series.map((item) => `<button type="button" data-curve-select="${item.parameter}" aria-pressed="${item.parameter === selectedChartCurve}" class="${item.parameter === selectedChartCurve ? "active" : ""}" style="--curve-color:${item.color}">${item.label}</button>`).join("")}</div><p>${activeProfileId?.startsWith("builtin-") ? "Plantilla de solo lectura: pulse Guardar como archivo para crear una copia editable." : "Arrastre un punto de la curva activa, o púlselo para escribir. Las flechas actualizan la curva de inmediato en pasos de 0,5."}</p></div><h3>${title}</h3><div class="scenario-chart-scroll"><svg class="scenario-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${title}; seleccione una hora para editar">${pastArea}${grid}${lines}${hourLabels}</svg></div><div class="legend">${legend}</div></article>`;
  };
  const escapedName = activeProfile.name.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
  const levelSeries = [1, 2, 3, 4].map((level) => ({ label: `Nivel ${level}`, color: ["#4EA7FF", "#55d58c", "#b99aff", "#f4b56c"][level - 1], value: (point: typeof values[number]) => point.levels[level - 1], parameter: `level-${level}` as ProfileParameter }));
  const combinedSeries = [...levelSeries, { label: "VRP · apertura AUTO (%)", color: "#f472b6", value: (point: typeof values[number]) => point.vrp, parameter: "prs" as ProfileParameter }];
  $("profile-preview-chart").innerHTML = `<p class="scenario-chart-name">${escapedName || "Escenario sin nombre"} · HORA ${String(profileHour + 1).padStart(2, "0")}</p>${liveProfileEditing ? '<p id="live-chart-clock" class="profile-time-context" role="status"></p>' : ""}<p id="profile-time-context" class="profile-time-context" aria-live="polite">${profileHourContext(profileHour)}</p>${chart("Aperturas de viviendas y VRP · 24 horas", 100, combinedSeries)}<p id="profile-point-status" class="muted" aria-live="polite"></p>`;
  renderSessionControls();
  document.querySelectorAll<HTMLButtonElement>("[data-curve-select]").forEach((button) => {
    button.onclick = () => {
      if (!liveProfileEditing && !pointEditBlockReason(profileHour)) updateProfileHourFromForm();
      selectedChartCurve = button.dataset.curveSelect as ProfileParameter; profileParameter = selectedChartCurve;
      renderProfileEditor();
      document.querySelector<HTMLButtonElement>(`[data-curve-select="${selectedChartCurve}"]`)?.focus({ preventScroll: true });
    };
  });
  document.querySelectorAll<SVGCircleElement>(".scenario-point[data-profile-hour]").forEach(bindChartPoint);
  const readOnly = Boolean(activeProfileId?.startsWith("builtin-"));
  const locked = Boolean(profileHourLockReason(profileHour));
  document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>("#profiles input, #profiles select, #profiles button, #live-profile-chart-host input, #live-profile-chart-host select, #live-profile-chart-host button").forEach((control) => {
    if (["profile-select", "profile-new", "profile-save-as"].includes(control.id) || control.hasAttribute("data-curve-select")) return;
    control.disabled = readOnly || locked;
  });
  if (locked) $("profile-point-status").textContent = profileHourLockReason(profileHour)!;

}

function updateProfilePrsControls(mode: HTMLSelectElement, branch: HTMLSelectElement): void {
  const autoOnlyMode = mode.value === "fixed_outlet" || mode.value === "critical_point";
  if (autoOnlyMode) branch.value = "auto";
  branch.disabled = autoOnlyMode;
  const manualBranch = branch.value === "manual";
  mode.disabled = manualBranch;
  $<HTMLLabelElement>("profile-prs-fixed-outlet-control").hidden = mode.value !== "fixed_outlet" || manualBranch;
  const criticalControl = $<HTMLLabelElement>("profile-prs-critical-control");
  criticalControl.hidden = mode.value === "fixed_outlet" || manualBranch;
  const targetLabel = mode.value === "critical_point" ? "Consigna de presión C44 (mca)" : "Presión mínima global objetivo (mca)";
  const labelText = [...criticalControl.childNodes].find((node) => node.nodeType === Node.TEXT_NODE);
  if (labelText) labelText.textContent = `${targetLabel} `;
  $("profile-prs-mode-description").textContent = manualBranch
    ? "La rama MANUAL gobierna el emulador. Este modo solo describe el estudio Fractal independiente."
    : mode.value === "critical_point"
      ? "Metadato del estudio Fractal: control en C44; no es el lazo de la emulación PLC."
      : mode.value === "fixed_outlet"
        ? "Metadato del estudio Fractal: salida fija; no cambia la apertura fija mandada al emulador PLC."
        : "Metadato del estudio Fractal: control de presión crítica. El PLC opera por apertura fija, no por esta consigna.";
}

function renderProfileEditor(): void {
  profilePrsControlsTouched = false;
  const profileSelect = $<HTMLSelectElement>("profile-select");
  const templates = profiles.filter((profile) => profile.id?.startsWith("builtin-"));
  const customs = profiles.filter((profile) => !profile.id?.startsWith("builtin-"));
  const options = (items: OperationProfile[]) => items.map((profile) => `<option value="${profile.id}">${profile.name.replace(/[&<>"']/g, "")}</option>`).join("");
  profileSelect.innerHTML = `<option value="">Nuevo escenario sin guardar</option><optgroup label="PLANTILLAS">${options(templates)}</optgroup>${customs.length ? `<optgroup label="ARCHIVO">${options(customs)}</optgroup>` : ""}`;
  const isBuiltin = Boolean(activeProfileId?.startsWith("builtin-"));
  const isArchived = Boolean(activeProfileId && !isBuiltin);
  $<HTMLButtonElement>("profile-delete").hidden = !isArchived;
  $<HTMLButtonElement>("profile-rename").hidden = !isArchived;
  $<HTMLButtonElement>("profile-save-as").hidden = !isBuiltin;
  $<HTMLButtonElement>("profile-save").hidden = isBuiltin;
  $<HTMLButtonElement>("profile-save").disabled = isBuiltin;
  $<HTMLElement>("profile-readonly-note").hidden = !isBuiltin;
  $<HTMLButtonElement>("profile-new").textContent = isBuiltin ? "+ NUEVO DESDE PLANTILLA" : "+ NUEVO ESCENARIO";
  profileSelect.value = activeProfileId ?? "";
  renderRunProfileSelector();
  renderSessionControls();
  $<HTMLInputElement>("profile-name").value = activeProfile.name;
  $<HTMLInputElement>("profile-description").value = activeProfile.description;
  const hourSelect = $<HTMLSelectElement>("profile-hour");
  hourSelect.innerHTML = Array.from({ length: 24 }, (_, hour) => `<option value="${hour}">Hora ${String(hour + 1).padStart(2, "0")}</option>`).join("");
  hourSelect.value = String(profileHour);
  const hour = currentProfileHour();
  const openings = effectiveOpenings(profileHour);
  $("profile-individual-controls").innerHTML = [1, 2, 3, 4].map((level) => {
    const grid = `grid-0${level}`;
    const controls = [...Array.from({ length: 16 }, (_, index) => `c${1 + Math.floor(index / 4)}${1 + index % 4}`), "l1", "l2"];
    return `<fieldset><legend>NIVEL ${level}</legend>${controls.map((valve) => { const pct = valve.startsWith("l") ? openings.leaks[`${grid}.${valve}`] : openings.consumers[`${grid}.${valve}`]; return `<label class="${valve.startsWith("l") ? "leak" : ""}">${valve.toUpperCase()}<input type="range" min="0" max="100" value="${pct}" data-profile-grid="${grid}" data-profile-valve="${valve}"/><output>${pct}%</output></label>`; }).join("")}</fieldset>`;
  }).join("");
  $("profile-hour-title").textContent = String(profileHour + 1).padStart(2, "0");
  document.querySelectorAll(".profile-hour-duplicate").forEach((node) => node.textContent = String(profileHour + 1).padStart(2, "0"));
  const global = $<HTMLInputElement>("profile-global");
  global.value = String(hour.global_consumers_pct ?? 100);
  $("profile-global-output").textContent = `${global.value} %`;
  $("profile-level-controls").innerHTML = [1, 2, 3, 4].map((level) => `<label>Nivel ${level}<input data-profile-level="${level}" type="range" min="0" max="100" step="0.5" value="${hour.levels?.[level] ?? hour.global_consumers_pct ?? 100}" /><output>${hour.levels?.[level] ?? hour.global_consumers_pct ?? 100} %</output></label>`).join("");
  $("profile-between-controls").innerHTML = [["12", "Nivel 1 → 2"], ["23", "Nivel 2 → 3"], ["34", "Nivel 3 → 4"]].map(([valve, label]) => `<label>${label}<input data-profile-between="${valve}" type="range" min="0" max="100" step="0.5" value="${hour.between_levels?.[valve] ?? 100}" /><output>${hour.between_levels?.[valve] ?? 100} %</output></label>`).join("");
  const opening = $<HTMLInputElement>("profile-prs-opening");
  opening.value = hour.prs?.auto_opening_pct === undefined ? "" : String(hour.prs.auto_opening_pct);
  $("profile-prs-opening-output").textContent = opening.value ? `${opening.value} %` : "No programada · conserva el mando del PLC";
  const mode = $<HTMLSelectElement>("profile-prs-mode");
  mode.value = hour.prs?.control_mode ?? "critical_pressure";
  const branch = $<HTMLSelectElement>("profile-prs-branch");
  branch.value = hour.prs?.branch ?? "auto";
  $("live-manual-pressure-control").hidden = !liveProfileEditing || branch.value !== "manual";
  const liveManual = $<HTMLInputElement>("live-manual-pressure");
  liveManual.value = String(hour.prs?.manual_setting_mca ?? 20.95);
  liveManual.onchange = () => {
    if (pointEditBlockReason(profileHour) || !liveManual.checkValidity() || !liveManual.value.trim()) return;
    const entry = currentProfileHour(); entry.prs = { ...entry.prs, branch: "manual", manual_setting_mca: liveManual.valueAsNumber };
    $<HTMLInputElement>("profile-prs-manual").value = liveManual.value;
    $("live-profile-status").textContent = "Consigna MANUAL en borrador. Pulse Guardar y aplicar cambios.";
  };
  updateProfilePrsControls(mode, branch);
  const inlet = $<HTMLInputElement>("profile-prs-inlet");
  inlet.value = hour.prs?.inlet_pressure_mca === undefined ? "" : String(hour.prs.inlet_pressure_mca);
  const autoOutlet = $<HTMLInputElement>("profile-prs-auto-outlet");
  autoOutlet.value = String(hour.prs?.auto_outlet_mca ?? 40);
  const critical = $<HTMLInputElement>("profile-prs-critical");
  critical.value = String(hour.prs?.critical_setpoint_mca ?? schema.service_constraint.automatic_target_mca);
  $("profile-prs-critical-output").textContent = `${Number(critical.value).toFixed(2)} mca`;
  const manual = $<HTMLInputElement>("profile-prs-manual");
  manual.value = String(hour.prs?.manual_setting_mca ?? 20.94);
  $("profile-prs-manual-output").textContent = `${Number(manual.value).toFixed(2)} mca`;
  const draftContext = $("profile-draft-context");
  draftContext.hidden = !$<HTMLElement>("profiles").classList.contains("active") || (!activeProfileId && !activeProfile.name.trim());
  const updateDraftContext = () => {
    const selectedName = $<HTMLInputElement>("profile-name").value.trim() || activeProfile.name || "Perfil sin guardar";
    const activeName = profiles.find((profile) => profile.id === activeSessionProfileId)?.name ?? activeSessionProfileId;
    draftContext.textContent = activeName
      ? `PLC ACTUAL: ${activeName} · BORRADOR NO APLICADO: ${selectedName} · HORA ${String(profileHour + 1).padStart(2, "0")}`
      : `BORRADOR · NO APLICADO · ${selectedName} · HORA ${String(profileHour + 1).padStart(2, "0")}`;
  };
  updateDraftContext();
  $<HTMLInputElement>("profile-name").oninput = () => {
    updateDraftContext();
    const title = document.querySelector<HTMLElement>(".scenario-chart-name");
    if (title) title.textContent = `${$<HTMLInputElement>("profile-name").value.trim() || "Escenario sin nombre"} · HORA ${String(profileHour + 1).padStart(2, "0")}`;
  };
  const individualCount = Object.values(hour.dwellings ?? {}).reduce((total, valves) => total + Object.keys(valves).length, 0);
  const leakCount = Object.values(hour.leaks ?? {}).reduce((total, valves) => total + Object.keys(valves).length, 0);
  $("profile-capture-summary").textContent = individualCount || leakCount ? `${individualCount} viviendas y ${leakCount} válvulas de fuga capturadas para esta hora.` : "Sin mandos individuales capturados.";
  branch.onchange = () => {
    if (activeProfileId?.startsWith("builtin-") || profileHourLockReason(profileHour)) return;
    profilePrsControlsTouched = true;
    if (branch.value === "manual" && ["fixed_outlet", "critical_point"].includes(mode.value)) mode.value = "critical_pressure";
    if (liveProfileEditing) {
      const entry = currentProfileHour(); entry.prs = { ...entry.prs, branch: branch.value as "auto" | "manual" };
    } else updateProfileHourFromForm();
    renderProfileEditor();
    const status = liveProfileEditing ? $("live-profile-status") : $("profile-point-status");
    status.textContent = `Modo ${branch.value.toUpperCase()} actualizado en el borrador para esta hora. ${liveProfileEditing ? "Confirme con Guardar y aplicar cambios." : "Guarde el archivo para conservarlo."}`;
  };
  const inletControls = [mode, inlet, autoOutlet];
  opening.oninput = () => {
    profilePrsControlsTouched = true;
    $("profile-prs-opening-output").textContent = opening.value ? `${opening.value} %` : "No programada · conserva el mando del PLC";
    updateProfileHourFromForm();
    renderProfileChart();
  };
  inletControls.forEach((control) => control.onchange = () => {
    profilePrsControlsTouched = true;
    updateProfilePrsControls(mode, branch);
    updateProfileHourFromForm();
    renderProfileChart();
    void persistFutureProfileEdit(profileHour);
  });
  const ranges = [global, ...document.querySelectorAll<HTMLInputElement>("[data-profile-level], [data-profile-between]"), critical, manual];
  ranges.forEach((input) => {
    input.oninput = () => {
      if (input === critical || input === manual) profilePrsControlsTouched = true;
      const output = input.parentElement?.querySelector("output");
      if (output) output.textContent = input === critical || input === manual ? `${Number(input.value).toFixed(2)} mca` : `${input.value} %`;
      updateProfileHourFromForm();
      renderProfileChart();
    };
    input.onchange = () => { void persistFutureProfileEdit(profileHour); };
  });
  document.querySelectorAll<HTMLInputElement>("[data-profile-grid]").forEach((input) => {
    input.oninput = () => {
      const grid = input.dataset.profileGrid!, valve = input.dataset.profileValve!;
      const entry = currentProfileHour();
      const destination = valve.startsWith("l") ? (entry.leaks ??= {}) : (entry.dwellings ??= {});
      (destination[grid] ??= {})[valve] = Number(input.value);
      input.parentElement!.querySelector("output")!.textContent = `${input.value}%`;
      renderProfileChart();
    };
    input.onchange = () => { void persistFutureProfileEdit(profileHour); };
  });
  renderProfileChart();
}

async function loadProfiles(): Promise<void> {
  profiles = await getJson<OperationProfile[]>(`/api/plants/${plantId}/operation-profiles`);
  renderProfileEditor();
  renderRunProfileSelector();
}

async function loadComparisons(preferredId?: string): Promise<void> {
  if (!sessionId) return;
  if (triadPlaybackTimer !== null) window.clearInterval(triadPlaybackTimer);
  triadPlaybackTimer = null;
  $<HTMLButtonElement>("triad-pause").disabled = true;
  comparisons = await getJson<Comparison[]>(`/api/plants/${plantId}/sessions/${sessionId}/comparisons`);
  const select = $<HTMLSelectElement>("comparison-select");
  const previous = preferredId ?? select.value;
  select.replaceChildren(new Option(comparisons.length ? "Seleccione comparación guardada…" : "Sin ejecuciones comparables", ""));
  for (const comparison of comparisons) {
    const sources = Object.entries(comparison.source_status ?? {}).map(([source, item]) => `${source}: ${sourceStatusLabel(item.status)}`).join(" · ");
    const manifest = comparison.manifest;
    const version = manifest
      ? `t₀=${fmt(manifest.base_time_s / 3600, 2)} h · ${manifest.time_step_s / 3600}/${manifest.horizon_s / 3600} h · ${manifest.input_hash.slice(0, 10)}`
      : "contexto antiguo sin manifiesto";
    const currentScenarioId = pendingSessionProfileId ?? activeSessionProfileId;
    const stale = comparison.profile_outdated || Boolean(currentScenarioId && comparison.profile_id !== currentScenarioId);
    const name = profiles.find((profile) => profile.id === comparison.profile_id)?.name ?? "Escenario guardado";
    const option = new Option(`${stale ? "Perfil anterior · " : ""}${name} · ${manifest ? `${fmt(manifest.horizon_s / 3600, 0)} h desde ${comparisonTime(manifest.base_time_s)}` : "Cálculo anterior"}`, comparison.comparison_id);
    option.title = `${comparison.comparison_id} · ${comparison.profile_id} · ${version} · ${sources}`;
    select.add(option);
  }
  const selectedId = comparisons.some((item) => item.comparison_id === previous)
    ? previous
    : comparisons.at(-1)?.comparison_id ?? "";
  select.value = selectedId;
  $<HTMLInputElement>("triad-slider").disabled = true;
  $<HTMLButtonElement>("triad-play").disabled = true;
  triadFrames = [];
  renderEngineComparisonCharts();
  renderTriadFrame();
  if (selectedId) await loadTriadFrames();
}

let triadLoadRequest = 0;
function comparisonTime(t: number): string {
  const seconds = Math.max(0, Math.floor(t));
  return `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
async function loadTriadFrames(): Promise<void> {
  const request = ++triadLoadRequest;
  if (triadPlaybackTimer !== null) window.clearInterval(triadPlaybackTimer);
  triadPlaybackTimer = null;
  $<HTMLInputElement>("triad-slider").disabled = true;
  $<HTMLButtonElement>("triad-play").disabled = true;
  $<HTMLButtonElement>("triad-pause").disabled = true;
  $<HTMLButtonElement>("triad-show-3d").disabled = true;
  triadFrames = []; renderTriadFrame();
  if (!sessionId || !$<HTMLSelectElement>("comparison-select").value) return;
  $("triad-time-label").textContent = "Cargando instantes…";
  const comparisonId = $<HTMLSelectElement>("comparison-select").value;
  const response = await getJson<{ triads: TriadFrame[] }>(`/api/plants/${plantId}/sessions/${sessionId}/comparisons/${encodeURIComponent(comparisonId)}/triads`).catch((error) => {
    if (request === triadLoadRequest) $("triad-time-label").textContent = "No se pudieron cargar los instantes";
    throw error;
  });
  if (request !== triadLoadRequest || comparisonId !== $<HTMLSelectElement>("comparison-select").value) return;
  triadFrames = response.triads;
  renderEngineComparisonCharts();
  const sourceStatus = comparisons.find((item) => item.comparison_id === comparisonId)?.source_status;
  if (sourceStatus) $("triad-position").textContent = `Fuentes: ${Object.entries(sourceStatus).map(([source, item]) => `${source} ${sourceStatusLabel(item.status)}${item.detail ? ` (${item.detail})` : ""}`).join(" · ")}`;
  const slider = $<HTMLInputElement>("triad-slider");
  slider.min = "0"; slider.max = String(Math.max(0, triadFrames.length - 1)); slider.value = "0"; slider.disabled = triadFrames.length < 2;
  $<HTMLButtonElement>("triad-show-3d").disabled = triadFrames.length === 0;
  $<HTMLButtonElement>("triad-play").disabled = triadFrames.length < 2;
  renderTriadFrame();
}

type ComparisonObservables = Record<string, number | null>;

function triadObservables(state: Record<string, unknown>): ComparisonObservables {
  const snapshot = (state.snapshot && typeof state.snapshot === "object" ? state.snapshot : state) as Record<string, unknown>;
  const tags = (state.plc_tags && typeof state.plc_tags === "object" ? state.plc_tags : snapshot.plc_tags) as Record<string, unknown> | undefined;
  const equipment = (snapshot.equipment ?? state.equipment) as Record<string, { variables?: Record<string, unknown> }> | undefined;
  const tag = (key: string, asset: string, variable: string): number | null => {
    const tagged = tags?.[key];
    if (typeof tagged === "number" && Number.isFinite(tagged)) return tagged;
    const raw = equipment?.[asset]?.variables?.[variable];
    return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
  };
  const sumTags = (prefix: string, variable: string): number | null => {
    const values = [1, 2, 3, 4].map((level) => {
      const tagged = tags?.[`PLC.Grid.L${level}.${prefix}`];
      if (typeof tagged === "number" && Number.isFinite(tagged)) return tagged;
      const raw = equipment?.[`grid-0${level}`]?.variables?.[variable];
      return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
    });
    return values.every((item) => item !== null) ? (values as number[]).reduce((sum, item) => sum + item, 0) : null;
  }
  const command = (state.commands && typeof state.commands === "object" ? state.commands : {}) as Record<string, unknown>;
  const values: ComparisonObservables = {
    pump_flow: tag("PLC.Pump.FlowM3h", "pumpset-main-01", "flow_m3h"),
    pump_discharge: tag("PLC.Pump.DischargePressureMca", "pumpset-main-01", "discharge_pressure_mca"),
    prs_inlet: tag("PLC.PRS.InletPressureMca", "prs-01", "inlet_pressure_mca"),
    prs_outlet: tag("PLC.PRS.OutletPressureMca", "prs-01", "outlet_pressure_mca"),
    prs_flow: tag("PLC.PRS.FlowM3h", "prs-01", "flow_m3h"),
    prs_opening: tag("PLC.PRS.AutoOpeningPct", "prs-01", "auto_opening_pct"),
    critical_pressure: tag("PLC.PRS.CriticalPressureMca", "prs-01", "critical_pressure_mca"),
    demand: sumTags("ConsumptionM3h", "consumption_m3h"),
    leakage: sumTags("LeakageM3h", "leakage_m3h"),
    supply_level: tag("PLC.Tank.Supply.LevelPct", "tank-supply-01", "level_pct"),
    return1_level: tag("PLC.Tank.Recirc01.LevelPct", "tank-recirc-01", "level_pct"),
    return2_level: tag("PLC.Tank.Recirc02.LevelPct", "tank-recirc-02", "level_pct"),
    recirculation_flow: tag("PLC.Pump.RecirculationFlowM3h", "pumpset-recirc-01", "flow_m3h"),
    pump_speed: tag("PLC.Pump.SpeedPct", "pumpset-main-01", "speed_pct"),
    pump_power: tag("PLC.Pump.PowerKw", "pumpset-main-01", "power_kw"),
    pumps_running: tag("PLC.Pump.RunningCount", "pumpset-main-01", "pumps_running"),
    recirculation_auto: typeof tags?.["PLC.Pump.RecirculationAutoActive"] === "boolean"
      ? (tags["PLC.Pump.RecirculationAutoActive"] ? 1 : 0)
      : tag("PLC.Pump.RecirculationAutoActive", "pumpset-recirc-01", "level_auto_active"),
  };
  for (const level of [1, 2, 3, 4]) {
    values[`level${level}_pressure`] = tag(`PLC.Grid.L${level}.MinimumPressureMca`, `grid-0${level}`, "min_pressure_mca");
    values[`valve${level === 1 ? 12 : level === 2 ? 23 : 34}_opening`] = level < 4
      ? tag(`PLC.Valve.Vertical${level === 1 ? 12 : level === 2 ? 23 : 34}OpeningPct`, `valve-between-${level === 1 ? 12 : level === 2 ? 23 : 34}`, "opening_pct")
      : null;
  }
  if (values.prs_opening === null) {
    const estimated = tags?.["PLC.PRS.EstimatedOpeningPct"];
    const commanded = command.vrp_opening_pct;
    if (typeof estimated === "number" && Number.isFinite(estimated)) values.prs_opening = estimated;
    else if (typeof commanded === "number" && Number.isFinite(commanded)) values.prs_opening = commanded;
    // No reconstruir una apertura ausente desde presiones en la UI.
  }
  const levelPressures = [1, 2, 3, 4].map((level) => values[`level${level}_pressure`]);
  values.home_min_pressure = levelPressures.every((pressure) => pressure !== null) ? Math.min(...levelPressures as number[]) : null;
  values.total_delivery = values.demand !== null && values.leakage !== null ? values.demand + values.leakage : null;
  return values;
}

function accumulatedBalance(source: "cosimulation" | "optimization", metric: "demand" | "leakage" | "total_delivery", baseTime: number, step: number): (number | null)[] {
  let total = 0, last = baseTime, valid = step > 0;
  return triadFrames.map((frame) => {
    if (frame.simulation_time_s <= baseTime) return null;
    const saved = frame.sources[source];
    if (!saved || saved.temporal_context !== "forecast" || saved.simulation_time_s !== frame.simulation_time_s) { valid = false; return null; }
    const duration = frame.simulation_time_s - last;
    if (!valid || duration <= 0 || duration > step) { valid = false; return null; }
    const rate = triadObservables(saved.state)[metric];
    if (rate === null || rate === undefined) { valid = false; return null; }
    total += rate * duration / 3600;
    last = frame.simulation_time_s;
    return total;
  });
}

function renderEngineComparisonCharts(): void {
  const target = $("engine-comparison-charts");
  if (!target) return;
  if (!triadFrames.length) { target.innerHTML = `<p class="empty">Seleccione y cargue una comparación guardada para ver curvas de los motores.</p>`; return; }
  const selectedComparison = comparisons.find((item) => item.comparison_id === $<HTMLSelectElement>("comparison-select").value);
  const currentProfileId = pendingSessionProfileId ?? activeSessionProfileId;
  const staleNotice = currentProfileId && selectedComparison?.profile_id && selectedComparison.profile_id !== currentProfileId
    ? `<p class="comparison-status step-note">COMPARACIÓN OBSOLETA · Se calculó con ${selectedComparison.profile_id}; el escenario vigente es ${currentProfileId}. Se conserva como historial; solicite nuevos cálculos para actualizarla.</p>`
    : "";
  const colors = { emulator: "#4EA7FF", cosimulation: "#55d58c", optimization: "#f4b56c" } as const;
  const labels = { emulator: "Planta Real · observada", cosimulation: "Cosimulador · proyección", optimization: "Fractal · propuesta" } as const;
  const metrics = [
    ["home_min_pressure", "Presión mínima de viviendas · umbral del estudio", "mca"],
    ["prs_opening", "Apertura VRP · estimación declarada o medición", "%"],
    ["demand", "Consumo entregado a viviendas", "m³/h"],
    ["leakage", "Fugas", "m³/h"],
    ["total_delivery", "Consumo entregado + fugas", "m³/h"],
    ["cumulative_demand", "Volumen acumulado · consumo entregado", "m³"],
    ["cumulative_leakage", "Volumen acumulado · fugas", "m³"],
    ["cumulative_total_delivery", "Volumen acumulado · total", "m³"],
    ["pump_flow", "Caudal de alimentación antes de VRP", "m³/h"], ["pump_discharge", "Presión de descarga de bomba", "mca"],
    ["prs_opening", "Apertura VRP", "%"], ["prs_inlet", "Presión de entrada a VRP", "mca"],
    ["prs_outlet", "Presión de salida de VRP", "mca"], ["prs_flow", "Caudal a la salida de VRP", "m³/h"],
    ["supply_level", "Nivel del tanque de suministro", "%"],
    ["return1_level", "Nivel tanque de retorno 1", "%"], ["return2_level", "Nivel tanque de retorno 2", "%"],
    ["recirculation_flow", "Caudal de recirculación", "m³/h"], ["pump_speed", "Velocidad de bombas", "%"],
    ["pump_power", "Potencia de bombeo", "kW"], ["pumps_running", "Bombas principales en marcha", "unid."],
    ["recirculation_auto", "Control automático de recirculación", "0/1"], ["level1_pressure", "Presión mínima nivel 1", "mca"],
    ["level2_pressure", "Presión mínima nivel 2", "mca"], ["level3_pressure", "Presión mínima nivel 3", "mca"],
    ["level4_pressure", "Presión mínima nivel 4", "mca"], ["valve12_opening", "Apertura válvula entre niveles 1–2", "%"],
    ["valve23_opening", "Apertura válvula entre niveles 2–3", "%"], ["valve34_opening", "Apertura válvula entre niveles 3–4", "%"],
  ] as const;
  const width = 900, height = 230, left = 54, right = 18, top = 16, bottom = 32;
  const maxTime = Math.max(3600, ...triadFrames.map((frame) => frame.simulation_time_s));
  const targetPressure = triadFrames.map((frame) => (frame.sources.optimization?.state.commands as Record<string, unknown> | undefined)?.target_pressure_mca).find((value): value is number => typeof value === "number" && Number.isFinite(value));
  const baseTime = selectedComparison?.manifest?.base_time_s;
  const step = selectedComparison?.manifest?.time_step_s;
  const x = (t: number) => left + (t / maxTime) * (width - left - right);
  target.innerHTML = staleNotice + metrics.map(([key, title, unit]) => {
    const accumulated = key.startsWith("cumulative_") && baseTime !== undefined && step !== undefined
      ? (Object.fromEntries((["cosimulation", "optimization"] as const).map((source) =>
        [source, accumulatedBalance(source, key.slice("cumulative_".length) as "demand" | "leakage" | "total_delivery", baseTime, step)])) as Record<string, (number | null)[]>)
      : null;
    const all: ( { source: keyof typeof labels; t: number; v: number } | null )[][] = (["emulator", "cosimulation", "optimization"] as const).map((source) => triadFrames.map((frame, index) => {
      const saved = frame.sources[source];
      if (!saved || saved.simulation_time_s !== frame.simulation_time_s) return null;
      const value = accumulated ? accumulated[source]?.[index] ?? null : key.startsWith("cumulative_") ? null : triadObservables(saved.state)[key];
      return value === null || value === undefined ? null : { source, t: frame.simulation_time_s, v: value };
    }));
    const readings = all.flatMap((line) => line.flatMap((point) => point ? [point.v] : []));
    if (!readings.length) return `<article class="trend panel"><h2>${title}<span>${unit}</span></h2><p class="empty">Ningún motor publicó esta señal para la comparación.</p></article>`;
    const thresholdValues = key === "home_min_pressure" && targetPressure !== undefined ? [targetPressure] : [];
    const low = Math.min(...readings, ...thresholdValues), high = Math.max(...readings, ...thresholdValues), padY = Math.max((high - low) * .1, .1);
    const min = low - padY, max = high + padY;
    const y = (v: number) => height - bottom - ((v - min) / (max - min)) * (height - top - bottom);
    const grid = [0, .5, 1].map((fraction) => { const v = max - fraction * (max - min); return `<line class="scenario-grid" x1="${left}" x2="${width-right}" y1="${y(v)}" y2="${y(v)}"/><text class="scenario-axis" x="${left-7}" y="${y(v)+4}" text-anchor="end">${fmt(v, 1)}</text>`; }).join("");
    const ticks = [0, .25, .5, .75, 1].map((fraction) => { const t = maxTime * fraction; return `<text class="scenario-axis" x="${x(t)}" y="${height-7}" text-anchor="middle">${fmt(t / 3600, 1)} h</text>`; }).join("");
    const threshold = key === "home_min_pressure" && targetPressure !== undefined ? `<line x1="${left}" x2="${width-right}" y1="${y(targetPressure)}" y2="${y(targetPressure)}" stroke="#f17474" stroke-dasharray="6 4"/><text x="${width-right-5}" y="${y(targetPressure)-5}" fill="#f5b0b0" text-anchor="end">${fmt(targetPressure)} mca</text>` : "";
    const stepSignals = new Set(["prs_opening", "valve12_opening", "valve23_opening", "valve34_opening", "pumps_running", "recirculation_auto"]);
    const lines = all.map((points, index) => {
      const source = (["emulator", "cosimulation", "optimization"] as const)[index];
      if (!points.length) return "";
      let previous: { source: keyof typeof labels; t: number; v: number } | null = null;
      const commands: string[] = [];
      for (const point of points) {
        if (!point) { previous = null; continue; }
        if (!previous) commands.push(`M${x(point.t).toFixed(1)},${y(point.v).toFixed(1)}`);
        else if (stepSignals.has(key) && step !== undefined && point.t - previous.t === step) commands.push(`H${x(point.t).toFixed(1)} V${y(point.v).toFixed(1)}`);
        else commands.push(`M${x(point.t).toFixed(1)},${y(point.v).toFixed(1)}`);
        previous = point;
      }
      const dots = points.filter((point): point is NonNullable<typeof point> => point !== null).map((point) =>
        `<circle cx="${x(point.t).toFixed(1)}" cy="${y(point.v).toFixed(1)}" r="1.6" fill="${colors[source]}"><title>${labels[source]} · t=${point.t} s · ${fmt(point.v)} ${unit}</title></circle>`).join("");
      return `<path d="${commands.join(" ")}" fill="none" stroke="${colors[source]}" stroke-width="1.2"/>${dots}`;
    }).join("");
    const legend = (["emulator", "cosimulation", "optimization"] as const).map((source, index) => {
      const quality = triadFrames.map((frame) => frame.sources[source]?.model_quality ?? (typeof frame.sources[source]?.state.quality === "string" ? frame.sources[source]?.state.quality as string : "")).find(Boolean);
      return `<span title="${quality ?? "Calidad no declarada"}"><i style="background:${colors[source]}"></i>${labels[source]}${quality ? ` · ${quality}` : " · calidad no declarada"} · ${all[index].filter(Boolean).length ? `${all[index].filter(Boolean).length} puntos` : "sin datos"}</span>`;
    }).join("");
    return `<article class="trend panel"><h2>${title}<span>${unit}</span></h2><svg class="day-chart" data-engine-comparison data-max-time="${maxTime}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${title}, comparación temporal de tres fuentes">${grid}${ticks}${threshold}${lines}</svg><div class="legend">${legend}</div></article>`;
  }).join("");
  const selectedFrame = triadFrames[Number($<HTMLInputElement>("triad-slider").value)];
  updateComparisonCursor(selectedFrame?.simulation_time_s ?? null);
}

function updateComparisonCursor(simulationTime: number | null): void {
  document.querySelectorAll<SVGSVGElement>("svg[data-engine-comparison]").forEach((svg) => {
    svg.querySelector(".comparison-cursor")?.remove();
    if (simulationTime === null) return;
    const maxTime = Number(svg.dataset.maxTime);
    if (!Number.isFinite(maxTime) || maxTime <= 0) return;
    const width = 900, left = 54, right = 18;
    const x = left + Math.max(0, Math.min(1, simulationTime / maxTime)) * (width - left - right);
    const cursor = document.createElementNS("http://www.w3.org/2000/svg", "path");
    cursor.setAttribute("class", "comparison-cursor");
    cursor.setAttribute("d", `M ${x} 16 V 198`);
    cursor.setAttribute("fill", "none"); cursor.setAttribute("stroke", "#ffffff");
    cursor.setAttribute("stroke-width", "1"); cursor.setAttribute("stroke-dasharray", "4 3");
    cursor.setAttribute("vector-effect", "non-scaling-stroke");
    svg.append(cursor);
  });
}

function sourceStatusLabel(status: string): string {
  return ({ not_requested: "no solicitada", in_progress: "en proceso", ready: "lista", blocked: "bloqueada", failed: "fallida" } as Record<string, string>)[status] ?? status;
}

function renderTriadFrame(showIn3d = false): void {
  const output = $("triad-frames");
  const slider = $<HTMLInputElement>("triad-slider");
  const index = Number(slider?.value ?? 0);
  const frame = triadFrames[index];
  output.replaceChildren();
  if (!frame) {
    updateComparisonCursor(null);
    const selected = comparisons.find((item) => item.comparison_id === $<HTMLSelectElement>("comparison-select").value);
    const sourceStatus = Object.entries(selected?.source_status ?? {}).map(([source, item]) => `${source}: ${sourceStatusLabel(item.status)}${item.detail ? ` (${item.detail})` : ""}`).join(" · ");
    $("triad-time-label").textContent = "Sin instantes disponibles";
    $("triad-position").textContent = selected ? "Este cálculo todavía no tiene resultados para recorrer. Ejecute la proyección o la cosimulación correspondiente." : "Seleccione una comparación para consultar sus resultados.";
    $("triad-technical").textContent = sourceStatus;
    return;
  }
  $("triad-time-label").textContent = comparisonTime(frame.simulation_time_s);
  const selected = comparisons.find((item) => item.comparison_id === $<HTMLSelectElement>("comparison-select").value);
  const stale = selected?.profile_outdated || Boolean((pendingSessionProfileId ?? activeSessionProfileId) && selected?.profile_id !== (pendingSessionProfileId ?? activeSessionProfileId));
  $("triad-position").textContent = `${comparisonTime(triadFrames[0].simulation_time_s)} → ${comparisonTime(triadFrames.at(-1)!.simulation_time_s)} · Instante ${index + 1} de ${triadFrames.length}${stale ? " · Calculado con un perfil anterior." : ""}${frame.aligned ? "" : " · Alguna fuente no tiene datos en este instante."}`;
  $("triad-technical").textContent = `${selected?.comparison_id ?? ""} · t=${frame.simulation_time_s}s · perfil ${frame.profile_id} · hash ${frame.profile_hash} · ${frame.aligned ? "tiempos alineados" : "fuentes incompletas o tiempos desalineados"}`;
  updateComparisonCursor(frame.simulation_time_s);
  for (const source of ["emulator", "cosimulation", "optimization"]) {
    const saved = frame.sources[source];
    const card = document.createElement("article"); card.className = "panel";
    const title = document.createElement("h3"); title.textContent = source === "emulator" ? "Planta Real" : source === "cosimulation" ? "Cosimulador" : "Fractal"; card.append(title);
    if (!saved) {
      const missing = document.createElement("p"); missing.textContent = "Sin datos en este instante. Seleccione otra hora o calcule esta fuente."; card.append(missing);
    } else {
      const quality = saved.model_quality ?? (typeof saved.state.quality === "string" ? saved.state.quality : undefined);
      const meta = document.createElement("p"); meta.textContent = `Instante ${comparisonTime(saved.simulation_time_s)}`; card.append(meta);
      const values = triadObservables(saved.state);
      const reading = document.createElement("dl"); reading.className = "comparison-readings";
      for (const [label, key, unit] of [
        ["Presión mínima viviendas", "home_min_pressure", "mca"], ["Apertura VRP", "prs_opening", "%"],
        ["Consumo entregado", "demand", "m³/h"], ["Fugas", "leakage", "m³/h"], ["Total entregado", "total_delivery", "m³/h"],
      ]) {
        const term = document.createElement("dt"); term.textContent = label;
        const value = document.createElement("dd"); value.textContent = values[key] === null || values[key] === undefined ? "—" : `${fmt(values[key], 2)} ${unit}`;
        reading.append(term, value);
      }
      card.append(reading);
      const manifest = comparisons.find((item) => item.comparison_id === $<HTMLSelectElement>("comparison-select").value)?.manifest;
      if ((source === "cosimulation" || source === "optimization") && manifest) {
        const accumulated = (["demand", "leakage", "total_delivery"] as const).map((metric) => accumulatedBalance(source, metric, manifest.base_time_s, manifest.time_step_s)[index]);
        const volumes = document.createElement("p");
        volumes.textContent = `Acumulado desde t=${fmt(manifest.base_time_s, 0)} s · consumo ${accumulated[0] === null ? "—" : fmt(accumulated[0])} m³ · fugas ${accumulated[1] === null ? "—" : fmt(accumulated[1])} m³ · total ${accumulated[2] === null ? "—" : fmt(accumulated[2])} m³`;
        card.append(volumes);
      }
      const details = document.createElement("details");
      const summary = document.createElement("summary"); summary.textContent = "Detalles técnicos";
      const pre = document.createElement("pre"); pre.textContent = JSON.stringify(saved.state, null, 2);
      const modelNote = document.createElement("p"); modelNote.textContent = quality ? `Calidad del modelo: ${quality}` : "Lectura del emulador PLC";
      details.append(summary, modelNote, pre); card.append(details);
    }
    output.append(card);
  }
  if (sessionId && showIn3d) {
    const persistedSources = Object.fromEntries(
      Object.entries(frame.sources).map(([source, saved]) => [source, saved ? {
        simulation_time_s: saved.simulation_time_s,
        temporal_context: saved.temporal_context,
        model_quality: saved.model_quality,
        state: saved.state,
      } : null]),
    );
      const source = selectedTriadSource;
    const saved = frame.sources[source];
    const candidate = saved ? (source === "emulator" ? saved.state : saved.state.snapshot ?? saved.state) : undefined;
    notify3d("plc-show-3d", {
      sessionId,
      comparisonId: $<HTMLSelectElement>("comparison-select").value,
      triadFrame: {
        simulation_time_s: frame.simulation_time_s,
        timeline_s: triadFrames.map((item) => item.simulation_time_s),
        source,
        snapshot: candidate && typeof candidate === "object" ? candidate as Record<string, unknown> : undefined,
        sources: persistedSources,
      },
    });
  }
}

async function saveProfile(): Promise<void> {
  updateProfileHourFromForm();
  activeProfile.name = $<HTMLInputElement>("profile-name").value.trim();
  activeProfile.description = $<HTMLInputElement>("profile-description").value.trim();
  if (!activeProfile.name) { window.alert("Asigne un nombre al perfil antes de guardarlo."); return; }
  if (activeProfileId?.startsWith("builtin-")) { window.alert("Duplique la plantilla para crear su escenario editable."); return; }
  const url = activeProfileId ? `/api/plants/${plantId}/operation-profiles/${activeProfileId}` : `/api/plants/${plantId}/operation-profiles`;
  const response = await apiFetch(url, { method: activeProfileId ? "PUT" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(activeProfile) });
  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok) { const error = await response.json().catch(() => ({})) as { detail?: string }; window.alert(error.detail ?? "No se pudo guardar el escenario."); return; }
  if (!contentType.includes("application/json")) { window.alert("La respuesta del PLC no es JSON."); return; }
  activeProfile = await response.json() as OperationProfile;
  activeProfileId = activeProfile.id ?? null;
  await loadProfiles();
}

function captureCurrentCommands(): void {
  if (!Object.keys(latest).length) { window.alert("Inicie la operación en tiempo real antes de capturar los mandos actuales."); return; }
  updateProfileHourFromForm();
  const hour = currentProfileHour();
  hour.dwellings = {};
  hour.leaks = {};
  for (let level = 1; level <= 4; level++) {
    const grid = `grid-0${level}`;
    hour.dwellings[grid] = {};
    hour.leaks[grid] = {};
    for (let branch = 1; branch <= 4; branch++) for (let house = 1; house <= 4; house++) {
      const valve = `c${branch}${house}`;
      hour.dwellings[grid][valve] = Math.round((eq(grid)?.animation[`open_${valve}`] ?? 0) * 100);
    }
    for (const valve of ["l1", "l2"]) hour.leaks[grid][valve] = Math.round((eq(grid)?.animation[`open_${valve}`] ?? 0) * 100);
  }
  hour.between_levels = Object.fromEntries([["12", "valve-between-12"], ["23", "valve-between-23"], ["34", "valve-between-34"]].map(([key, id]) => [key, Math.round(n(value(id, "opening_target_pct")) ?? 100)]));
  hour.prs = {
    branch: String(value("prs-01", "branch_auto")) === "1" ? "auto" : "manual",
    control_mode: hour.prs?.control_mode ?? "critical_pressure",
    ...(n(value("prs-01", "auto_opening_pct")) === null ? {} : { auto_opening_pct: n(value("prs-01", "auto_opening_pct"))! }),
    inlet_pressure_mca: n(value("prs-01", "inlet_pressure_mca")) ?? 70,
    critical_setpoint_mca: n(value("prs-01", "critical_setpoint_mca")) ?? schema.service_constraint.automatic_target_mca,
    manual_setting_mca: n(value("prs-01", "manual_setting_mca")) ?? 20.94,
  };
  if (hour.prs.control_mode === "critical_point") hour.prs.critical_control_point = "L4.C44";
  if (hour.prs.control_mode === "fixed_outlet") hour.prs.auto_outlet_mca = n(value("prs-01", "auto_fixed_outlet_mca")) ?? 40;
  renderProfileEditor();
}

function randomize(): void {
  if (randomTimer !== null) { window.clearInterval(randomTimer); randomTimer = null; $("random").textContent = "⚄ ALEATORIO"; return; }
  const change = () => { const level = 1 + Math.floor(Math.random() * 4); const valve = `c${1 + Math.floor(Math.random() * 4)}${1 + Math.floor(Math.random() * 4)}`; send(`grid-0${level}`, "set_opening", { valve, pct: 30 + Math.round(Math.random() * 70) }); };
  change(); randomTimer = window.setInterval(change, 1800); $("random").textContent = "■ DETENER ALEATORIO";
}

async function start(): Promise<void> {
  schema = await getJson<Schema>(`/api/plants/${plantId}/plc-schema`);
  $("plant-name").textContent = ` · ${schema.name.replace(/^PLC MASTER\s*[·-]\s*/i, "").toUpperCase()}`;
  $<HTMLAnchorElement>("link-plant").href = `/plant.html?plant=${plantId}${query.get("api") ? `&api=${encodeURIComponent(apiOrigin)}` : ""}`;
  buildAssets();
  const initialScreen = query.get("screen");
  if (["master", "day", "operation", "pumping", "grid", "profiles", "trends", "fractal", "history"].includes(initialScreen ?? "")) selectScreen(initialScreen!);
  $("connect").onclick = () => { void connect(); };
  $("stop-session").onclick = () => { void stopSession().catch((error) => { $("connection").textContent = `● ERROR · ${String(error)}`; }); };
  $("pause").onclick = () => {
    if (socket?.readyState !== WebSocket.OPEN || !plcRunning) return;
    paused = !paused;
    socket.send(JSON.stringify({ pause: paused }));
    renderSessionControls();
  };
  $<HTMLSelectElement>("run-profile-select").onchange = (event) => {
    const id = (event.target as HTMLSelectElement).value;
    const profile = profiles.find((item) => item.id === id);
    if (!profile) { activeProfileId = null; activeProfile = { name: "", description: "", hours: {} }; }
    else { activeProfile = structuredClone(profile); activeProfileId = profile.id ?? null; profileHour = 0; }
    renderProfileEditor();
    renderSessionControls();
  };
  $("schedule-profile").onclick = async () => {
    if (!sessionId || socket?.readyState !== WebSocket.OPEN || !activeProfileId) return;
    const response = await apiFetch(`/api/plants/${plantId}/sessions/${sessionId}/schedule-profile`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ profile_id: activeProfileId }) });
    const result = await response.json().catch(() => ({})) as { starts_at_hour?: number; detail?: string };
    if (!response.ok) { $("scenario-selection-note").textContent = result.detail ?? "No se pudo programar el escenario."; return; }
    pendingSessionProfileId = activeProfileId;
    pendingSessionProfileHour = result.starts_at_hour ?? null;
    renderWorkspaceContext();
    $("scenario-selection-note").textContent = `Programado para la hora ${String((result.starts_at_hour ?? 0) + 1).padStart(2, "0")}. El PLC mantiene el perfil actual hasta entonces.`;
    renderSessionControls();
  };
  renderSessionControls();
  document.querySelectorAll<HTMLButtonElement>("[data-command]").forEach((button) => button.onclick = () => send("prs-01", "select_branch", { branch: button.dataset.command }));
  const opening = $<HTMLInputElement>("auto-opening");
  opening.oninput = () => $("auto-opening-output").textContent = `${Number(opening.value).toFixed(0)} %`;
  opening.onchange = () => send("prs-01", "set_auto_opening", { pct: Number(opening.value) });
  const manual = $<HTMLInputElement>("manual-setpoint");
  manual.oninput = () => $("manual-output").textContent = `${Number(manual.value).toFixed(2)} mca`;
  manual.onchange = () => send("prs-01", "set_manual_setting", { mca: Number(manual.value) });
  const all = $<HTMLInputElement>("all-consumers");
  all.oninput = () => $("all-consumers-output").textContent = `${all.value} %`;
  all.onchange = () => {
    for (let level = 1; level <= 4; level++) {
      const input = document.querySelector<HTMLInputElement>(`[data-level-consumers="${level}"]`)!;
      const output = document.querySelector<HTMLOutputElement>(`[data-level-output="${level}"]`)!;
      input.value = all.value; output.textContent = `${all.value} %`;
      send(`grid-0${level}`, "set_opening", { valve: "consumers", pct: Number(all.value) });
    }
  };
  document.querySelectorAll<HTMLInputElement>("[data-level-consumers]").forEach((input) => {
    const level = input.dataset.levelConsumers!;
    const output = document.querySelector<HTMLOutputElement>(`[data-level-output="${level}"]`)!;
    input.oninput = () => output.textContent = `${input.value} %`;
    input.onchange = () => send(`grid-0${level}`, "set_opening", { valve: "consumers", pct: Number(input.value) });
  });
  $("random").onclick = randomize;
  $("live-save-as-profile").onclick = () => {
    if (!Object.keys(latest).length) { window.alert("Inicie la operación en tiempo real antes de capturar mandos."); return; }
    const timestamp = new Date().toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" });
    activeProfile = { name: `Tiempo real · ${timestamp}`, description: "Estado capturado desde la operación en vivo; revisar y guardar antes de ejecutarlo como escenario.", hours: {} };
    activeProfileId = null;
    profileHour = Math.max(0, Math.min(23, Math.floor((simTime % DAY_SECONDS) / 3600)));
    captureCurrentCommands();
    selectScreen("profiles");
    $<HTMLInputElement>("profile-name").focus();
  };
  $("chart-modal-close").onclick = () => $<HTMLDialogElement>("chart-modal").close();
  $<HTMLSelectElement>("session-speed").onchange = (event) => {
    const speed = Number((event.target as HTMLSelectElement).value);
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ speed }));
  };
  $("live-profile-apply").onclick = async () => {
    if (!sessionId || !liveProfileOriginal || !liveProfileEditing) return;
    const button = $<HTMLButtonElement>("live-profile-apply"); button.disabled = true;
    const status = $("live-profile-status"); status.textContent = "Validando, guardando y aplicando…";
    try {
      const response = await apiFetch(`/api/plants/${plantId}/sessions/${sessionId}/edit-active-profile`, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ profile_id: activeSessionProfileId, expected_hour: Math.floor(simTime / 3600), expected_hours: liveProfileOriginal.hours, hours: activeProfile.hours }) });
      const result = await response.json() as { detail?: string; profile: OperationProfile; applied_at_t: number };
      if (!response.ok) throw Error(result.detail ?? "No se pudo aplicar el cambio");
      activeProfile = structuredClone(result.profile); liveProfileOriginal = structuredClone(result.profile);
      const index = profiles.findIndex((p) => p.id === result.profile.id); if (index >= 0) profiles[index] = result.profile;
      renderProfileEditor();
      status.textContent = `Guardado y aplicado desde ${comparisonTime(result.applied_at_t)}. Futuro actualizado; historial intacto. Los cálculos anteriores deben recalcularse.`;
    } catch (error) { status.textContent = String(error); }
    finally { button.disabled = !plcRunning || !liveProfileOriginal || Boolean(activeProfileId?.startsWith("builtin-")); }
  };
  $("fractal-refresh").onclick = () => { void renderFractal(); void renderSavedStudyLibrary(); void loadComparisons().catch((error) => { $("triad-position").textContent = `No se pudieron leer las comparaciones guardadas: ${String(error)}`; }); };
  $("save-fractal-study").onclick = () => { void saveLatestFractalStudy(); };
  $("saved-study-library").addEventListener("click", (event) => { void handleSavedStudyLibraryClick(event); });
  void renderSavedStudyLibrary();
  $("comparison-load").onclick = () => { void loadTriadFrames().catch((error) => { $("triad-position").textContent = `No se pudieron cargar los resultados: ${String(error)}`; }); };
  $<HTMLSelectElement>("comparison-select").onchange = () => { void loadTriadFrames().catch(() => { $("triad-time-label").textContent = "No se pudieron cargar los instantes"; $("triad-position").textContent = "Pulse Actualizar comparación para volver a intentarlo."; }); };
  $("triad-show-3d").onclick = () => renderTriadFrame(true);
  $<HTMLInputElement>("triad-slider").oninput = () => renderTriadFrame();
  $<HTMLSelectElement>("triad-source-select").onchange = (event) => {
    selectedTriadSource = (event.target as HTMLSelectElement).value as typeof selectedTriadSource;
    renderTriadFrame();
  };
  $("triad-play").onclick = () => {
    if (triadPlaybackTimer !== null || triadFrames.length < 2) return;
    $<HTMLButtonElement>("triad-play").disabled = true;
    $<HTMLButtonElement>("triad-pause").disabled = false;
    const slider = $<HTMLInputElement>("triad-slider");
    if (Number(slider.value) >= triadFrames.length - 1) slider.value = "0";
    let playbackTime = triadFrames[Number(slider.value)].simulation_time_s;
    let previousTick = performance.now();
    renderTriadFrame(true);
    triadPlaybackTimer = window.setInterval(() => {
      const now = performance.now();
      const elapsed = Math.min((now - previousTick) / 1000, 0.5); previousTick = now;
      playbackTime += elapsed * Number($<HTMLSelectElement>("triad-speed").value) * 3600;
      let index = Number(slider.value);
      while (index + 1 < triadFrames.length && triadFrames[index + 1].simulation_time_s <= playbackTime) index++;
      if (index !== Number(slider.value)) { slider.value = String(index); renderTriadFrame(true); }
      if (index >= triadFrames.length - 1) $("triad-pause").click();
    }, 100);
  };
  $("triad-pause").onclick = () => {
    if (triadPlaybackTimer !== null) window.clearInterval(triadPlaybackTimer);
    triadPlaybackTimer = null;
    $<HTMLButtonElement>("triad-play").disabled = triadFrames.length < 2;
    $<HTMLButtonElement>("triad-pause").disabled = true;
    if (embedded) window.parent.postMessage({ type: "plc-comparison-paused", plantId }, location.origin);
  };
  const fractalStudyType = $<HTMLSelectElement>("fractal-study-type");
  const fractalHorizonButton = $<HTMLButtonElement>("fractal-horizon");
  const fractalTarget = $<HTMLInputElement>("fractal-target-pressure");
  const fractalTargetControl = $("fractal-target-control");
  const updateFractalButtonLabel = () => {
    const optimized = fractalStudyType.value === "optimized";
    fractalTargetControl.hidden = !optimized;
    fractalHorizonButton.textContent = optimized ? "CALCULAR OPTIMIZACIÓN · 24 H" : "CALCULAR EVALUACIÓN · 24 H";
  };
  fractalStudyType.onchange = updateFractalButtonLabel;
  fractalTarget.oninput = () => { $("fractal-target-value").textContent = Number.isFinite(fractalTarget.valueAsNumber) ? `${fractalTarget.valueAsNumber.toFixed(1)} mca` : "Seleccione un objetivo"; };
  $("cosimulation-run").onclick = async () => {
    if (!sessionId || !activeSessionProfileId) { $("cosimulation-status").textContent = "Inicie una sesión PLC para ejecutar la cosimulación."; return; }
    if (!fractalOrigin) { $("cosimulation-status").textContent = "Configure Fractal con ?fractal=https://host-fractal para solicitar la cosimulación."; return; }
    const profileId = activeSessionProfileId;
    const horizonHours = $<HTMLInputElement>("cosim-horizon-hours").valueAsNumber;
    const stepHours = $<HTMLInputElement>("cosim-step-hours").valueAsNumber;
    if (!Number.isFinite(horizonHours) || !Number.isFinite(stepHours) || horizonHours < 1 || stepHours < 1 || horizonHours > 168 || stepHours > 24 || horizonHours % stepHours !== 0) {
      $("cosimulation-status").textContent = "Defina un horizonte de 1–168 h y un paso de 1–24 h que divida exactamente el horizonte."; return;
    }
    const selectedId = $<HTMLSelectElement>("comparison-select").value;
    const selectedComparison = comparisons.find((item) => item.comparison_id === selectedId);
    const comparisonId = selectedComparison?.manifest && selectedComparison.profile_id === profileId && !selectedComparison.runs.cosimulation
      ? selectedId
      : undefined;
    const button = $<HTMLButtonElement>("cosimulation-run");
    cosimulationRunning = true;
    renderSessionControls();
    const calculationStartedAt = performance.now();
    const monitoring = watchCalculation("cosim");
    let calculationSucceeded = false;
    button.textContent = "… EJECUTANDO MODELO COSIMULADO";
    $("cosimulation-status").textContent = "El backend leerá el perfil activo y las muestras persistidas de esta sesión; solo publicará frames devueltos por el modelo.";
    try {
      const response = await fractalFetch("/studies/cosimulation/from-plc", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          plant_id: plantId, session_id: sessionId, profile_id: profileId, progress_id: monitoring.id,
          comparison_id: comparisonId, time_step_s: stepHours * 3600, horizon_s: horizonHours * 3600,
          emulator_api: apiOrigin,
        }),
      });
      const body = await response.json().catch(() => ({})) as { detail?: string; comparison_id?: string; job_id?: string; model_id?: string; frame_count?: number; applied_to_plc?: boolean };
      if (!response.ok) throw Error(body.detail ?? `Cosimulation API respondió ${response.status}`);
      calculationSucceeded = true;
      updateCalculationTime("cosim", (performance.now() - calculationStartedAt) / 1000, horizonHours);
      await loadComparisons(body.comparison_id).catch((error) => { $("triad-position").textContent = `Resultado guardado; no se pudieron cargar las tríadas: ${String(error)}`; });
      $("cosimulation-status").textContent = `${body.frame_count ?? 0} frames guardados · modelo ${body.model_id ?? "sin ID"} · comparación ${body.comparison_id ?? "sin ID"} · ${body.applied_to_plc === false ? "NO APLICADO AL PLC" : "estado de aplicación no declarado"}.`;
    } catch (error) {
      $("cosimulation-status").textContent = `Sin resultado cosimulado: ${String(error)}. No se inventaron ni interpolaron frames.`;
    } finally {
      monitoring.finish(calculationSucceeded);
      cosimulationRunning = false;
      button.textContent = "CALCULAR FUTURO COSIMULADO";
      renderSessionControls();
    }
  };
  $("fractal-horizon").onclick = async () => {
    if (!sessionId) { window.alert("Inicie una sesión PLC con un perfil guardado antes de proyectar."); return; }
    if (!fractalOrigin) { window.alert("Configure Fractal con ?fractal=https://host-fractal."); return; }
    const studyType = fractalStudyType.value;
    const profileId = $<HTMLSelectElement>("fractal-profile-select").value;
    if (!profileId) { window.alert("Seleccione un perfil guardado para este estudio."); return; }
    if (profileId !== activeSessionProfileId) { window.alert("Para alinear el historial, el estudio debe usar el perfil activo del PLC. Inicie una sesión nueva para cambiar el perfil."); return; }
    if (studyType === "optimized" && (!Number.isFinite(fractalTarget.valueAsNumber) || fractalTarget.valueAsNumber < 10 || fractalTarget.valueAsNumber > 45)) { window.alert("Elija explícitamente una presión mínima objetivo entre 10 y 45 mca."); return; }
    if (fractalRunning) return;
    fractalRunning = true;
    const button = fractalHorizonButton;
    const calculationStartedAt = performance.now();
    const monitoring = watchCalculation("fractal");
    let calculationSucceeded = false;
    button.disabled = true; button.textContent = studyType === "optimized" ? "… OPTIMIZANDO PRESIÓN POR HORA" : "… LEYENDO PLC Y PROYECTANDO";
    let study: { study_id: string; study_type: string; base_time: number; target_pressure_mca?: number; profile_id?: string; profile_hash?: string; comparison_id?: string; comparison_run_published?: { frame_count?: number }; comparison_persistence_error?: string; hours: { hour: number; supply_level_pct: number; robust: boolean; commands?: { vrp_opening_pct?: number | null; vrp_opening_required_pct?: number | null; opening_curve_status?: string; target_pressure_mca?: number; applied_pressure_target_mca?: number; target_met?: boolean }; profile_commands?: { prs?: { control_mode?: string; critical_control_point?: string; critical_setpoint_mca?: number } }; scenarios: { demand_factor: number; state: Record<string, number> & { prs_inlet_mca: number; prs_outlet_mca: number; critical_pressure_mca: number; control_point_pressure_mca: number; consumer_pressures_mca: Record<string, number> }; feasible: boolean }[] }[]; published?: unknown };
    const selectedComparison = comparisons.find((item) => item.comparison_id === $<HTMLSelectElement>("comparison-select").value);
    const comparisonId = studyType === "optimized" && selectedComparison?.manifest && selectedComparison.profile_id === profileId && !selectedComparison.runs.optimization
      ? selectedComparison.comparison_id
      : undefined;
    const selectedManifest = comparisonId ? selectedComparison?.manifest : undefined;
    try {
      const response = await fractalFetch("/studies/horizon/from-plc", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ progress_id: monitoring.id, session_id: sessionId, plant_id: plantId, emulator_api: apiOrigin, profile_id: profileId, comparison_id: comparisonId, ...(selectedManifest ? { time_step_s: selectedManifest.time_step_s, horizon_s: selectedManifest.horizon_s } : {}), objective_id: "OBJ-PRESSURE-MIN", target_pressure_mca: studyType === "optimized" ? fractalTarget.valueAsNumber : undefined, study_type: studyType }) });
      if (!response.ok) { const detail = await response.json().catch(() => ({})) as { detail?: string }; throw Error(detail.detail ?? "Fractal no pudo proyectar el perfil PLC"); }
      study = await response.json();
      calculationSucceeded = true;
      updateCalculationTime("fractal", (performance.now() - calculationStartedAt) / 1000, study.hours.length || 24);
      latestFractalStudy = study as unknown as Record<string, unknown>;
      $<HTMLButtonElement>("save-fractal-study").disabled = false;
      if (study.study_type === "optimized") {
        optimizedTrajectory = trajectoryFromFrames(study.hours as unknown[]);
        renderSupplyComparison();
        await loadComparisons(study.comparison_id).catch((error) => { $("triad-position").textContent = `Estudio guardado, pero no se pudo cargar la tríada: ${String(error)}`; });
      }
    } catch (error) {
      const message = document.createElement("p"); message.className = "muted"; message.textContent = `No se pudo calcular el estudio: ${String(error)}`;
      $("fractal-recommendations").replaceChildren(message);
      return;
    }
    finally { monitoring.finish(calculationSucceeded); fractalRunning = false; renderSessionControls(); updateFractalButtonLabel(); }
    if (study.published) $<HTMLAnchorElement>("link-plant").href = `/plant.html?plant=${plantId}&session=${encodeURIComponent(sessionId)}&study=${encodeURIComponent(study.study_id)}${query.get("api") ? `&api=${encodeURIComponent(apiOrigin)}` : ""}`;
    $("fractal-recommendations").innerHTML = `<article class="panel"><p class="eyebrow">◆ FUTURO SIMULADO · NO APLICADO · ${study.study_type.toUpperCase()}</p><p><b>Estudio ${study.study_id}</b> · origen PLC t=${fmt(study.base_time, 0)} s · ${study.published ? study.comparison_run_published ? `estudio y ${study.comparison_run_published.frame_count ?? 0} frames del optimizador guardados` : study.comparison_persistence_error ? "estudio guardado; ejecución no guardada en el historiador" : "persistido en PLC" : "resultado Fractal (no persistido en PLC)"}</p>${study.hours.map((item) => { const state = item.scenarios[1]?.state ?? item.scenarios[0]?.state; const pressureScenarios = item.scenarios.map((scenario) => ({ factor: scenario.demand_factor, minimum: Math.min(...Object.values(scenario.state.consumer_pressures_mca)) })); const worst = pressureScenarios.reduce((a, b) => b.minimum < a.minimum ? b : a, { factor: Number.NaN, minimum: Number.POSITIVE_INFINITY }); const targetMet = study.study_type === "optimized" ? Boolean(item.commands?.target_met) : true; const safe = item.robust && targetMet; const point = item.profile_commands?.prs?.critical_control_point; const pointText = point ? `Control ${point}: ${fmt(state?.control_point_pressure_mca)} mca / objetivo ${fmt(item.profile_commands?.prs?.critical_setpoint_mca)} mca · ` : ""; const outletLabel = item.profile_commands?.prs?.control_mode === "fixed_outlet" ? "salida fija" : "salida variable"; const openingText = item.commands?.opening_curve_status === "outside_assumed_range" ? ` · apertura requerida ${fmt(item.commands?.vrp_opening_required_pct)} % · fuera del rango (20–100 %)` : ` · VRP estimada ${fmt(item.commands?.vrp_opening_pct)} %`;
      const targetText = study.study_type === "optimized" ? `${openingText} · mínimo de 64 viviendas ≥${fmt(study.target_pressure_mca)} mca ${item.commands?.target_met ? "alcanzado" : "no alcanzado"}` : ""; return `<p>Hora ${String(item.hour + 1).padStart(2, "0")} · entrada PRS ${fmt(state?.prs_inlet_mca)} / ${outletLabel} ${fmt(state?.prs_outlet_mca)} mca · ${pointText}mínima de las viviendas ${fmt(worst.minimum)} mca${targetText} · ${safe ? "objetivo/estado factible" : "objetivo no alcanzado o restricciones no factibles · REVISAR"}</p>`; }).join("")}${study.study_type === "optimized" ? renderVrpOptimizationCharts(study.hours) : ""}</article>`;
    if (selectedSavedStudyId) await saveLatestFractalStudy();
    void renderFractal();
  };
  $("profile-new").onclick = () => {
    const selected = profiles.find((profile) => profile.id === activeProfileId);
    const template = selected ?? profiles.find((profile) => profile.id?.endsWith("pfl-base-01"));
    activeProfile = template ? structuredClone(template) : { name: "", description: "", hours: {} };
    delete activeProfile.id;
    activeProfile.name = template ? `Copia de ${template.name}` : "Nuevo escenario";
    activeProfile.description = template?.description ?? "Escenario de operación creado por el operador.";
    activeProfileId = null;
    profileHour = 0;
    renderProfileEditor();
    $<HTMLInputElement>("profile-name").focus();
  };
  $<HTMLSelectElement>("profile-select").onchange = (event) => {
    const id = (event.target as HTMLSelectElement).value;
    const profile = profiles.find((item) => item.id === id);
    if (profile) { activeProfile = structuredClone(profile); activeProfileId = profile.id ?? null; profileHour = 0; }
    else { activeProfile = { name: "", description: "", hours: {} }; activeProfileId = null; }
    renderProfileEditor();
  };
  $<HTMLSelectElement>("profile-hour").onchange = (event) => { updateProfileHourFromForm(); profileHour = Number((event.target as HTMLSelectElement).value); renderProfileEditor(); };
  $("profile-clone").onclick = () => { updateProfileHourFromForm(); const target = Math.min(23, profileHour + 1); activeProfile.hours[String(target)] = structuredClone(currentProfileHour()); profileHour = target; renderProfileEditor(); };
  $("profile-capture").onclick = captureCurrentCommands;
  $("profile-save").onclick = () => { void saveProfile(); };
  $("profile-save-as").onclick = async () => {
    if (!activeProfileId?.startsWith("builtin-")) return;
    const name = window.prompt("Nombre del nuevo archivo basado en esta plantilla", `Copia de ${activeProfile.name}`)?.trim();
    if (!name) return;
    activeProfile = structuredClone(activeProfile);
    delete activeProfile.id;
    activeProfile.name = name;
    $<HTMLInputElement>("profile-name").value = name;
    activeProfileId = null;
    await saveProfile();
  };
  $("profile-rename").onclick = async () => {
    if (!activeProfileId || activeProfileId.startsWith("builtin-")) return;
    const name = window.prompt("Nuevo nombre del archivo", activeProfile.name)?.trim();
    if (!name || name === activeProfile.name) return;
    const renamed = { ...activeProfile, name };
    const response = await apiFetch(`/api/plants/${plantId}/operation-profiles/${activeProfileId}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(renamed) });
    if (!response.ok) { const error = await response.json().catch(() => ({})) as { detail?: string }; window.alert(error.detail ?? "No se pudo renombrar el archivo."); return; }
    activeProfile = await response.json() as OperationProfile;
    await loadProfiles();
  };
  $("profile-delete").onclick = async () => {
    if (!activeProfileId || activeProfileId.startsWith("builtin-")) return;
    if (!window.confirm(`¿Eliminar definitivamente «${activeProfile.name}»? El PLC no se modifica.`)) return;
    const response = await apiFetch(`/api/plants/${plantId}/operation-profiles/${activeProfileId}`, { method: "DELETE" });
    if (!response.ok) { const error = await response.json().catch(() => ({})) as { detail?: string }; window.alert(error.detail ?? "No se pudo eliminar el escenario"); return; }
    activeProfile = { name: "", description: "", hours: {} }; activeProfileId = null; profileHour = 0;
    await loadProfiles();
  };
  if (embedded) window.addEventListener("message", (event: MessageEvent<{ type?: string; plantId?: string; studyId?: string | null; studyType?: string; profileName?: string }>) => {
    if (event.origin !== location.origin || event.source !== window.parent || event.data.plantId !== plantId || event.data.type !== "plc-study-selected") return;
    selectedStudyContext = event.data.studyId ? { studyId: event.data.studyId, studyType: event.data.studyType, profileName: event.data.profileName } : null;
    renderWorkspaceContext();
  });
  if (embedded) document.addEventListener("click", (event) => {
    const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="/plant.html"]');
    if (!anchor) return;
    event.preventDefault();
    const selected = new URL(anchor.href).searchParams.get("study");
    notify3d("plc-show-3d", selected ? { studyId: selected } : {});
  });
  if (embedded) window.addEventListener("message", (event: MessageEvent<{ type?: string; action?: string; value?: string }>) => {
    if (event.origin !== location.origin || event.source !== window.parent || event.data.type !== "plc-comparison-control") return;
    const { action, value } = event.data;
    if (action === "speed" && ["1", "2", "4"].includes(value ?? "")) {
      $<HTMLSelectElement>("triad-speed").value = value!;
      return;
    }
    if (action === "pause") { $("triad-pause").click(); return; }
    if (action === "play") { $("triad-play").click(); return; }
    if (action === "select" && comparisons.some((item) => item.comparison_id === value)) {
      $<HTMLSelectElement>("comparison-select").value = value!;
      void loadTriadFrames().then(() => renderTriadFrame(true)).catch(() => { $("triad-position").textContent = "No se pudo abrir la comparación."; });
    } else if (action === "seek" && value !== undefined && Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) < triadFrames.length) {
      $("triad-pause").click();
      $<HTMLInputElement>("triad-slider").value = value; renderTriadFrame(true);
    } else if (action === "source" && ["emulator", "cosimulation", "optimization"].includes(value ?? "")) {
      selectedTriadSource = value as typeof selectedTriadSource;
      $<HTMLSelectElement>("triad-source-select").value = value!; renderTriadFrame(true);
    }
  });
  renderDay(); renderSavedRuns(); await loadProfiles();
  renderPumping();
  renderWorkspaceContext();
  if (sessionId) {
    const state = await getJson<{ running: boolean; paused?: boolean; profile_id?: string | null; pending_profile_id?: string | null; pending_profile_hour?: number | null; t?: number }>(`/api/plants/${plantId}/sessions/${sessionId}`).catch(() => null);
    if (state) {
      activeSessionProfileId = state.profile_id ?? null;
      pendingSessionProfileId = state.pending_profile_id ?? null;
      pendingSessionProfileHour = state.pending_profile_hour ?? null;
      const sessionProfile = profiles.find((profile) => profile.id === (pendingSessionProfileId ?? activeSessionProfileId));
      if (sessionProfile) {
        activeProfile = structuredClone(sessionProfile);
        activeProfileId = sessionProfile.id ?? null;
        profileHour = Math.max(0, Math.min(23, Math.floor((state.t ?? 0) / 3600)));
        renderProfileEditor();
      }
      plcRunning = state.running;
      paused = state.paused ?? false;
      renderWorkspaceContext();
      renderSessionControls(); renderRunProfileSelector();
      if (state.running) void connect();
      else {
        $("connection").textContent = "● EMULACIÓN DETENIDA · ÚLTIMO ESTADO CONSERVADO";
        const last = await getJson<{ t: number; snapshot: Message["snapshot"] }>(`/api/plants/${plantId}/sessions/${sessionId}/historian/frame?at_t=${state.t ?? 0}`).catch(() => null);
        if (last?.snapshot?.equipment) {
          latest = last.snapshot.equipment; simTime = last.t; renderSessionControls();
          $("clock").textContent = `ÚLTIMA LECTURA · ${comparisonTime(last.t)}`;
          renderVisibleScreen(); renderAlarms();
        }
      }
      if (sessionId) {
        void renderFractal();
        void loadComparisons().catch((error) => { $("triad-position").textContent = `No se pudieron leer las comparaciones guardadas: ${String(error)}`; });
      }
    }
  }
}

document.querySelector(".content")?.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-open-screen]");
  if (button?.dataset.openScreen) selectScreen(button.dataset.openScreen);
});
document.querySelectorAll<HTMLButtonElement>("[data-screen]").forEach((button) => button.onclick = () => selectScreen(button.dataset.screen!));
start().catch((error: unknown) => { $("plant-name").textContent = ` · ERROR: ${String(error)}`; });
