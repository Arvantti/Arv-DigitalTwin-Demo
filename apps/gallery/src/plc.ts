import "./plc.css";

type Value = number | string | null;
type Snapshot = { state: string; variables: Record<string, Value>; animation: Record<string, number>; active_faults: string[] };
type Message = { t: number; speed: number; paused: boolean; plc_tags?: Record<string, Value>; snapshot: { equipment: Record<string, Snapshot> }; events: { type: string; equipment_id?: string }[] };
type Asset = { id: string; name: string; group: string; level?: number };
type Schema = { name: string; assets: Asset[]; service_constraint: { critical_pressure_min_mca: number; automatic_target_mca: number } };
type Sample = { t: number; main: number; recirculation: number; consumption: number; leakage: number; critical: number; supplyLevel: number; pumpDischarge: number; stationIn: number; stationOut: number; grid1In: number; grid1Out: number; grid2Out: number; grid3Out: number; criticalFlow: number };
type SavedRun = { id: string; startedAt: string; durationS: number; samples: Sample[] };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const query = new URLSearchParams(location.search);
const plantId = query.get("plant") ?? "water-network-scale-v1";
// En desarrollo usa el proxy local. Una HMI publicada puede apuntar a un host FastAPI explícito:
// plc.html?plant=water-network-scale-v1&api=https://emulador.ejemplo.com
const apiOrigin = (query.get("api") ?? location.origin).replace(/\/$/, "");
const apiUrl = (path: string) => `${apiOrigin}${path}`;
const websocketUrl = (path: string) => `${apiOrigin.replace(/^http/, "ws")}${path}`;
const fractalOrigin = (query.get("fractal") ?? "").replace(/\/$/, "");

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(apiUrl(path));
  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok || !contentType.includes("application/json")) {
    throw Error("El emulador API no está disponible en esta dirección. La galería publicada es estática; abra la HMI local con el API o proporcione ?api=https://host-del-emulador.");
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
let runStartedAt = "";
let runSaved = false;

type ProfileHour = {
  global_consumers_pct?: number;
  levels?: Record<string, number>;
  dwellings?: Record<string, Record<string, number>>;
  leaks?: Record<string, Record<string, number>>;
  between_levels?: Record<string, number>;
  prs?: { branch?: "auto" | "manual"; critical_setpoint_mca?: number; manual_setting_mca?: number };
};
type OperationProfile = { id?: string; name: string; description: string; hours: Record<string, ProfileHour> };
let profiles: OperationProfile[] = [];
let activeProfile: OperationProfile = { name: "", description: "", hours: {} };
let activeProfileId: string | null = null;
let profileHour = 0;
let sessionId = query.get("session");

const n = (value: Value | undefined): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;
const fmt = (value: Value | undefined, digits = 1) => {
  const number = n(value);
  return number === null ? "—" : number.toLocaleString("es-CO", { maximumFractionDigits: digits, minimumFractionDigits: digits });
};
const eq = (id: string) => latest[id];
const value = (id: string, key: string) => eq(id)?.variables[key];
const send = (equipment: string, command: string, args: Record<string, unknown> = {}) => socket?.readyState === WebSocket.OPEN && socket.send(JSON.stringify({ equipment, command, args }));

function selectScreen(id: string): void {
  document.querySelectorAll<HTMLElement>(".screen").forEach((node) => node.classList.toggle("active", node.id === id));
  document.querySelectorAll<HTMLButtonElement>(".tabs button").forEach((node) => node.classList.toggle("active", node.dataset.screen === id));
  document.body.classList.toggle("screen-grid", id === "grid");
  document.body.classList.toggle("screen-day", id === "day");
  document.body.classList.toggle("screen-pumping", id === "pumping");
  if (Object.keys(latest).length) renderVisibleScreen();
  if (id === "fractal") void renderFractal();
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
  $("kpis").innerHTML = [
    ["PRESIÓN CRÍTICA", `${fmt(critical)} mca`, `mínimo ${schema.service_constraint.critical_pressure_min_mca} mca`],
    ["CAUDAL PRINCIPAL", `${fmt(mainFlow)} m³/h`, "bombeo a la red"],
    ["CONSUMO", `${fmt(consumption)} m³/h`, "64 consumos residenciales"],
    ["RECIRCULACIÓN", `${fmt(recircFlow)} m³/h`, "retorno al tanque de bombeo"],
    ["BOMBAS ACTIVAS", `${fmt(main?.variables.pumps_running, 0)}`, "grupo principal"],
  ].map(([label, reading, detail]) => `<div class="kpi panel"><small>${label}</small><b>${reading}</b><small>${detail}</small></div>`).join("");
}

function tankCard(id: string, label: string): string {
  const level = Math.max(0, Math.min(100, n(value(id, "level_pct")) ?? 0));
  return `<article class="card panel"><p class="eyebrow">${label}</p><div class="tank-level"><i style="height:${level}%"></i><span>${fmt(level)} %</span></div><div class="readings"><span>Entrada <b>${fmt(value(id, "inflow_kg_h"))} kg/h</b></span><span>Salida <b>${fmt(value(id, "outflow_kg_h"))} kg/h</b></span><span>Masa <b>${fmt(value(id, "mass_kg"), 0)} kg</b></span><span>Estado <b>${eq(id)?.state ?? "—"}</b></span></div></article>`;
}

function pumpCard(id: string, label: string): string {
  const isLevelControlled = id === "pumpset-recirc-01";
  const automatic = n(value(id, "automatic_enabled")) === 1;
  const levelActive = n(value(id, "level_auto_active")) === 1;
  const state = eq(id)?.state?.toUpperCase() ?? "—";
  const mode = isLevelControlled
    ? automatic
      ? levelActive ? "AUTO · RECIRCULANDO POR NIVEL" : "AUTO · EN ESPERA DE NIVEL"
      : "PARO MANUAL · AUTO BLOQUEADO"
    : state;
  const levelReadings = isLevelControlled ? `<span>Retorno <b>${fmt(value(id, "source_level_pct"))} %</b></span><span>Tanque destino <b>${fmt(value(id, "target_level_pct"))} %</b></span><span>Arranque auto <b>≥ ${fmt(value(id, "start_level_pct"), 0)} %</b></span><span>Paro auto <b>&lt; ${fmt(value(id, "stop_level_pct"), 0)} % / destino ${fmt(value(id, "target_full_pct"), 0)} %</b></span>` : "";
  return `<article class="card panel pump-card"><p class="eyebrow">${label}</p><h2>${state}</h2><p class="pump-mode ${automatic ? "automatic" : "manual-stop"}">${mode}</p><div class="readings"><span>Caudal <b>${fmt(value(id, "flow_m3h"))} m³/h</b></span><span>VFD <b>${fmt(value(id, "speed_pct"))} %</b></span><span>Succión <b>${fmt(value(id, "suction_pressure_mca"))} mca</b></span><span>Descarga <b>${fmt(value(id, "discharge_pressure_mca"))} mca</b></span><span>Potencia <b>${fmt(value(id, "power_kw"))} kW</b></span><span>Bombas <b>${fmt(value(id, "pumps_running"), 0)}/${fmt(value(id, "pumps_available"), 0)}</b></span>${levelReadings}</div><div class="controls"><button data-pump="${id}" data-pump-command="start">${isLevelControlled ? "REARMAR AUTO" : "START"}</button><button data-pump="${id}" data-pump-command="stop">PARO MANUAL</button></div></article>`;
}

function renderPumping(): void {
  $("tanks").innerHTML = tankCard("tank-recirc-01", "TANQUE DE RETORNO 1") + tankCard("tank-recirc-02", "TANQUE DE RETORNO 2") + tankCard("tank-supply-01", "TANQUE DE BOMBEO");
  $("pumps").innerHTML = pumpCard("pumpset-recirc-01", "GRUPO DE RECIRCULACIÓN") + pumpCard("pumpset-main-01", "GRUPO PRINCIPAL");
  const prs = eq("prs-01");
  const branch = String(prs?.variables.branch_auto ?? "") === "1" ? "AUTO" : "MANUAL";
  $("branch-state").textContent = `RAMA · ${branch}`;
  const criticalInput = $<HTMLInputElement>("critical-setpoint");
  const manualInput = $<HTMLInputElement>("manual-setpoint");
  if (document.activeElement !== criticalInput) criticalInput.value = String(n(value("prs-01", "critical_setpoint_mca")) ?? schema.service_constraint.automatic_target_mca);
  if (document.activeElement !== manualInput) manualInput.value = String(n(value("prs-01", "manual_setting_mca")) ?? 20.94);
  $("critical-output").textContent = `${Number(criticalInput.value).toFixed(2)} mca`;
  $("manual-output").textContent = `${Number(manualInput.value).toFixed(2)} mca`;
  const autoOpening = 100 * (prs?.animation.valve_a_open ?? 0);
  const manualOpening = 100 * (prs?.animation.valve_b_open ?? 0);
  $("prs-values").innerHTML = [
    ["Presión antes (entrada)", `${fmt(value("prs-01", "inlet_pressure_mca"))} mca`], ["Presión después (salida)", `${fmt(value("prs-01", "outlet_pressure_mca"))} mca`],
    ["Caudal total", `${fmt(value("prs-01", "flow_m3h"))} m³/h`], ["Caudal AUTO", `${fmt(value("prs-01", "flow_auto_m3h"))} m³/h`], ["Caudal MANUAL", `${fmt(value("prs-01", "flow_manual_m3h"))} m³/h`],
    ["Apertura PRV AUTO", `${fmt(autoOpening)} %`], ["Apertura PRV MANUAL", `${fmt(manualOpening)} %`], ["Casa crítica", `${fmt(value("prs-01", "critical_pressure_mca"))} mca`],
    ["SP crítica", `${fmt(value("prs-01", "critical_setpoint_mca"))} mca`], ["SP auto", `${fmt(value("prs-01", "auto_outlet_setpoint_mca"))} mca`], ["Ajuste manual", `${fmt(value("prs-01", "manual_setting_mca"))} mca`],
  ].map(([label, reading]) => `<span>${label} <b>${reading}</b></span>`).join("");
  document.querySelectorAll<HTMLButtonElement>("[data-pump-command]").forEach((button) => button.onclick = () => send(button.dataset.pump!, button.dataset.pumpCommand!));
}

function renderGrid(): void {
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
    cards.push(`<section class="level panel"><h2>NIVEL ${level}<span>${fmt(value(id, "consumption_m3h"))} m³/h</span></h2><p class="level-min">Mín. nivel: <b>L${level}.${minimum.valve.toUpperCase()} · ${fmt(minimum.pressure)} mca</b>${networkLowest?.grid === id ? " · MÍNIMO DE RED" : ""}</p><div class="leak-controls"><span>VÁLVULAS DE FUGA</span>${leaks}</div><div class="houses">${houses.join("")}</div></section>`);
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
    return `<article class="card panel"><p class="eyebrow">SIMULACIÓN ${new Date(run.startedAt).toLocaleString("es-CO")}</p><h2>${fmt(run.durationS / 3600, 2)} h simuladas</h2><div class="readings"><span>Presión mín. <b>${fmt(min)} mca</b></span><span>Consumo <b>${fmt(consumption, 2)} m³</b></span><span>Muestras <b>${run.samples.length}</b></span></div><div class="controls"><button data-load-run="${run.id}">VER CURVAS</button><button data-delete-run="${run.id}">ELIMINAR</button></div></article>`;
  }).join("") : `<p class="muted">Aún no hay sesiones guardadas. Al desconectar o completar una simulación, sus señales se archivarán aquí.</p>`;
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
  return `<article class="trend panel"><h2>${title}<span>${fmt(samples.at(-1), 2)} ${unit}</span></h2><button class="chart-expand" data-expand-chart aria-label="Ampliar ${title}">⤢ AMPLIAR</button><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Tendencia de ${title}"><line class="axis" x1="${pad}" x2="${width - pad}" y1="${height - pad}" y2="${height - pad}" />${refY}<polyline class="line ${color}" points="${path}" /></svg>${legend}<p class="muted">Mín. ${fmt(lo, 2)} · Máx. ${fmt(hi, 2)} · ${history.length} muestras</p></article>`;
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
    };
  });
}

function renderTrends(): void {
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
  const lines = series.map((item) => `<polyline points="${item.values.map((reading, index) => `${x(index)},${y(reading)}`).join(" ")}" fill="none" stroke="${item.color}" stroke-width="2.5" />`).join("");
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
    $("day-charts").innerHTML = `<p class="muted">Conecta la simulación para registrar señales del emulador. Esta pantalla no usa datos precalculados.</p>`;
    return;
  }
  const peak = history.reduce((best, sample) => sample.consumption > best.consumption ? sample : best, history[0]);
  const minimum = Math.min(...history.map((sample) => sample.critical));
  const consumption = integrate((sample) => sample.consumption);
  const leakage = integrate((sample) => sample.leakage);
  const duration = history[history.length - 1].t - history[0].t;
  const dayKpis: [string, string, string][] = [
    ["CONSUMO ACUMULADO", `${fmt(consumption, 2)} m³`, `historial de ${fmt(duration / 3600, 2)} h simuladas`],
    ["FUGAS ACUMULADAS", `${fmt(leakage, 2)} m³`, `${fmt(100 * leakage / Math.max(0.001, leakage + consumption), 1)} % del caudal registrado`],
    ["PICO REGISTRADO", `${String(Math.floor(peak.t / 3600)).padStart(2, "0")}:${String(Math.floor(peak.t / 60) % 60).padStart(2, "0")}`, `${fmt(peak.consumption)} m³/h residencial`],
    ["PRESIÓN MÍNIMA", `${fmt(minimum, 2)} mca`, `límite ${fmt(schema.service_constraint.critical_pressure_min_mca, 0)} mca`],
  ];
  $("day-kpis").innerHTML = dayKpis.map(([label, reading, detail]) => `<div class="kpi panel"><small>${label}</small><b>${reading}</b><small>${detail}</small></div>`).join("");
  $("day-charts").innerHTML = [
    dayChart("Caudales medidos por el emulador", "m³/h", [{ name: "Consumo residencial", values: history.map((sample) => sample.consumption), color: "#2D7FF9" }, { name: "Fugas", values: history.map((sample) => sample.leakage), color: "#f17474" }, { name: "Bombeo", values: history.map((sample) => sample.main), color: "#4EA7FF" }]),
    dayChart("Presiones medidas", "mca", [{ name: "Salida de bombeo", values: history.map((sample) => sample.pumpDischarge), color: "#4EA7FF" }, { name: "Entrada reguladora", values: history.map((sample) => sample.stationIn), color: "#2D7FF9" }, { name: "Salida reguladora", values: history.map((sample) => sample.stationOut), color: "#55d58c" }, { name: "Punto crítico", values: history.map((sample) => sample.critical), color: "#f17474" }], schema.service_constraint.critical_pressure_min_mca),
    dayChart("Presión de la red por tramo", "mca", [{ name: "Entrada rejilla 1", values: history.map((sample) => sample.grid1In), color: "#4EA7FF" }, { name: "Salida rejilla 1", values: history.map((sample) => sample.grid1Out), color: "#2D7FF9" }, { name: "Salida rejilla 2", values: history.map((sample) => sample.grid2Out), color: "#55d58c" }, { name: "Salida rejilla 3", values: history.map((sample) => sample.grid3Out), color: "#9869ed" }]),
  ].join("");
  bindChartExpanders();
}

function renderAlarms(): void {
  const active: string[] = [];
  for (const [id, snapshot] of Object.entries(latest)) if (snapshot.state === "fault" || snapshot.active_faults.length) active.push(`${id}: ${snapshot.active_faults.join(", ") || "falla"}`);
  const critical = n(value("prs-01", "critical_pressure_mca"));
  if (critical !== null && critical < schema.service_constraint.critical_pressure_min_mca) active.unshift(`Presión crítica ${fmt(critical)} mca bajo 15 mca`);
  $("alarms").innerHTML = active.length ? active.map((message) => `<div class="alarm">${message}</div>`).join("") : `<p class="muted">Sin alarmas activas.</p>`;
}

async function renderFractal(): Promise<void> {
  const box = $("fractal-saved");
  if (!sessionId) { box.innerHTML = `<p class="muted">Inicie una sesión PLC para consultar estudios.</p>`; return; }
  const response = await fetch(apiUrl(`/api/plants/${plantId}/sessions/${sessionId}/fractal/studies`));
  if (!response.ok) { box.innerHTML = `<p class="muted">No se pudo consultar estudios de esta sesión.</p>`; return; }
  const studies = await response.json() as { study_id: string; study_type: string; base_time: number }[];
  box.innerHTML = studies.length ? `<article class="panel"><p class="eyebrow">ESTUDIOS GUARDADOS EN PLC · FUTURO NO APLICADO</p>${studies.filter((study) => ["baseline", "alternative"].includes(study.study_type)).map((study) => `<p>${study.study_type === "baseline" ? "Proyección base" : "Escenario alternativo"} · ${study.study_id.replace(/[&<>"']/g, "")} · t=${fmt(study.base_time, 0)} s · <a href="/plant.html?plant=${plantId}&session=${encodeURIComponent(sessionId!)}&study=${encodeURIComponent(study.study_id)}${query.get("api") ? `&api=${encodeURIComponent(apiOrigin)}` : ""}">VER FUTURO EN 3D</a></p>`).join("")}</article>` : `<p class="muted">No hay estudios futuros guardados en esta sesión.</p>`;
}

function renderVisibleScreen(): void {
  const active = document.querySelector<HTMLElement>(".screen.active")?.id;
  if (active === "master") renderMaster();
  else if (active === "day") renderDay();
  else if (active === "pumping") { renderPumping(); renderHydraulicProfile(); }
  else if (active === "grid") renderGrid();
  else if (active === "trends") renderTrends();
  else if (active === "history") renderSavedRuns();
}

function render(message: Message): void {  latest = message.snapshot.equipment;
  simTime = message.t;
  latestTags = message.plc_tags ?? latestTags;
  for (const asset of schema.assets) {
    const node = document.querySelector<HTMLElement>(`[data-asset="${asset.id}"]`);
    const state = eq(asset.id)?.state ?? "—";
    if (node) { node.textContent = state.toUpperCase(); node.className = `state ${state}`; }
  }
  const hh = String(Math.floor(simTime / 3600)).padStart(2, "0");
  const mm = String(Math.floor((simTime % 3600) / 60)).padStart(2, "0");
  const ss = String(Math.floor(simTime % 60)).padStart(2, "0");
  $("clock").textContent = `SIM · ${hh}:${mm}:${ss} · ×${message.speed}`;
  $<HTMLSelectElement>("session-speed").value = String(message.speed);
  recordHistory(message);
  renderVisibleScreen();
  renderAlarms();
  if (message.t >= DAY_SECONDS) { saveCurrentRun(); socket?.close(); }
}

async function connect(): Promise<void> {
  if (socket?.readyState === WebSocket.OPEN) {
    if (sessionId) await fetch(apiUrl(`/api/plants/${plantId}/sessions/${sessionId}/stop`), { method: "POST" });
    socket.close();
    return;
  }
  // Evita dobles clics mientras el proxy WebSocket termina el handshake.
  if (socket?.readyState === WebSocket.CONNECTING) return;
  saveCurrentRun();
  history = [];
  runStartedAt = new Date().toISOString();
  runSaved = false;
  renderDay();
  // ×240: 15 s reales recorren una hora hidráulica; el día completo tarda 6 min.
  $("connection").textContent = "● CREANDO SESIÓN PLC…";
  $("connect").textContent = "… CONECTANDO";
  try {
    if (!sessionId) {
      const created = await fetch(apiUrl(`/api/plants/${plantId}/sessions`), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ profile_id: activeProfileId }) });
      if (!created.ok) throw Error("no se pudo crear la sesión");
      sessionId = (await created.json() as { id: string }).id;
      query.set("session", sessionId);
      window.history.replaceState(null, "", `${location.pathname}?${query}`);
      $<HTMLAnchorElement>("link-plant").href = `/plant.html?plant=${plantId}&session=${encodeURIComponent(sessionId)}${query.get("api") ? `&api=${encodeURIComponent(apiOrigin)}` : ""}`;
    }
    const started = await fetch(apiUrl(`/api/plants/${plantId}/sessions/${sessionId}/start`), { method: "POST" });
    if (!started.ok) throw Error("no se pudo iniciar la sesión");
  } catch (error) {
    $("connection").textContent = `● ERROR · ${String(error)}`;
    $("connect").textContent = "▶ INICIAR OPERACIÓN PLC";
    return;
  }
  socket = new WebSocket(websocketUrl(`/api/plants/${plantId}/sessions/${sessionId}?role=plc`));
  socket.onopen = () => { $("connection").textContent = "● SIMULACIÓN CONECTADA · 15 s/h"; $("connection").classList.add("on"); $("connect").textContent = "■ DETENER Y GUARDAR"; };
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data) as Message & { error?: string };
    if (message.error) {
      $("connection").textContent = `● ERROR · ${message.error}`;
      return;
    }
    render(message);
  };
  socket.onerror = () => { $("connection").textContent = "● ERROR DE CONEXIÓN CON EL EMULADOR"; };
  socket.onclose = () => { saveCurrentRun(); socket = null; $("connection").textContent = "● DESCONECTADO"; $("connection").classList.remove("on"); $("connect").textContent = "▶ INICIAR SIMULACIÓN 24 H"; };
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
  hour.prs = {
    branch: $<HTMLSelectElement>("profile-prs-branch").value as "auto" | "manual",
    critical_setpoint_mca: Number($<HTMLInputElement>("profile-prs-critical").value),
    manual_setting_mca: Number($<HTMLInputElement>("profile-prs-manual").value),
  };
}

function renderProfileEditor(): void {
  const profileSelect = $<HTMLSelectElement>("profile-select");
  const official = profiles.filter((profile) => profile.name.startsWith("PFL-"));
  const other = profiles.filter((profile) => !profile.name.startsWith("PFL-"));
  const options = (items: OperationProfile[]) => items.map((profile) => `<option value="${profile.id}">${profile.name}</option>`).join("");
  profileSelect.innerHTML = `<option value="">Nuevo perfil</option>${official.length ? `<optgroup label="PERFILES OPERATIVOS PLC">${options(official)}</optgroup>` : ""}${other.length ? `<optgroup label="OTRAS PLANTILLAS">${options(other)}</optgroup>` : ""}`;
  profileSelect.value = activeProfileId ?? "";
  $<HTMLInputElement>("profile-name").value = activeProfile.name;
  $<HTMLInputElement>("profile-description").value = activeProfile.description;
  const hourSelect = $<HTMLSelectElement>("profile-hour");
  hourSelect.innerHTML = Array.from({ length: 24 }, (_, hour) => `<option value="${hour}">Hora ${String(hour + 1).padStart(2, "0")}</option>`).join("");
  hourSelect.value = String(profileHour);
  const hour = currentProfileHour();
  $("profile-hour-title").textContent = String(profileHour + 1).padStart(2, "0");
  document.querySelectorAll(".profile-hour-duplicate").forEach((node) => node.textContent = String(profileHour + 1).padStart(2, "0"));
  const global = $<HTMLInputElement>("profile-global");
  global.value = String(hour.global_consumers_pct ?? 100);
  $("profile-global-output").textContent = `${global.value} %`;
  $("profile-level-controls").innerHTML = [1, 2, 3, 4].map((level) => `<label>Nivel ${level}<input data-profile-level="${level}" type="range" min="0" max="100" value="${hour.levels?.[level] ?? hour.global_consumers_pct ?? 100}" /><output>${hour.levels?.[level] ?? hour.global_consumers_pct ?? 100} %</output></label>`).join("");
  $("profile-between-controls").innerHTML = [["12", "Nivel 1 → 2"], ["23", "Nivel 2 → 3"], ["34", "Nivel 3 → 4"]].map(([valve, label]) => `<label>${label}<input data-profile-between="${valve}" type="range" min="0" max="100" value="${hour.between_levels?.[valve] ?? 100}" /><output>${hour.between_levels?.[valve] ?? 100} %</output></label>`).join("");
  $<HTMLSelectElement>("profile-prs-branch").value = hour.prs?.branch ?? "auto";
  const critical = $<HTMLInputElement>("profile-prs-critical");
  critical.value = String(hour.prs?.critical_setpoint_mca ?? schema.service_constraint.automatic_target_mca);
  $("profile-prs-critical-output").textContent = `${Number(critical.value).toFixed(2)} mca`;
  const manual = $<HTMLInputElement>("profile-prs-manual");
  manual.value = String(hour.prs?.manual_setting_mca ?? 20.94);
  $("profile-prs-manual-output").textContent = `${Number(manual.value).toFixed(2)} mca`;
  const individualCount = Object.values(hour.dwellings ?? {}).reduce((total, valves) => total + Object.keys(valves).length, 0);
  const leakCount = Object.values(hour.leaks ?? {}).reduce((total, valves) => total + Object.keys(valves).length, 0);
  $("profile-capture-summary").textContent = individualCount || leakCount ? `${individualCount} viviendas y ${leakCount} válvulas de fuga capturadas para esta hora.` : "Sin mandos individuales capturados.";
  const ranges = [global, ...document.querySelectorAll<HTMLInputElement>("[data-profile-level], [data-profile-between]"), critical, manual];
  ranges.forEach((input) => input.oninput = () => {
    const output = input.parentElement?.querySelector("output");
    if (output) output.textContent = input === critical || input === manual ? `${Number(input.value).toFixed(2)} mca` : `${input.value} %`;
    updateProfileHourFromForm();
  });
}

async function loadProfiles(): Promise<void> {
  profiles = await getJson<OperationProfile[]>(`/api/plants/${plantId}/operation-profiles`);
  renderProfileEditor();
}

async function saveProfile(): Promise<void> {
  updateProfileHourFromForm();
  activeProfile.name = $<HTMLInputElement>("profile-name").value.trim();
  activeProfile.description = $<HTMLInputElement>("profile-description").value.trim();
  if (!activeProfile.name) { window.alert("Asigne un nombre al perfil antes de guardarlo."); return; }
  const url = activeProfileId ? `/api/plants/${plantId}/operation-profiles/${activeProfileId}` : `/api/plants/${plantId}/operation-profiles`;
  const response = await fetch(apiUrl(url), { method: activeProfileId ? "PUT" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(activeProfile) });
  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok || !contentType.includes("application/json")) { window.alert("No se pudo guardar: el emulador API no está disponible."); return; }
  activeProfile = await response.json() as OperationProfile;
  activeProfileId = activeProfile.id ?? null;
  await loadProfiles();
}

function captureCurrentCommands(): void {
  if (!Object.keys(latest).length) { window.alert("Inicie la simulación y ajuste la Rejilla antes de capturar los mandos actuales."); return; }
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
  hour.prs = { branch: String(value("prs-01", "branch_auto")) === "1" ? "auto" : "manual", critical_setpoint_mca: n(value("prs-01", "critical_setpoint_mca")) ?? schema.service_constraint.automatic_target_mca, manual_setting_mca: n(value("prs-01", "manual_setting_mca")) ?? 20.94 };
  renderProfileEditor();
}

function randomize(): void {
  if (randomTimer !== null) { window.clearInterval(randomTimer); randomTimer = null; $("random").textContent = "⚄ ALEATORIO"; return; }
  const change = () => { const level = 1 + Math.floor(Math.random() * 4); const valve = `c${1 + Math.floor(Math.random() * 4)}${1 + Math.floor(Math.random() * 4)}`; send(`grid-0${level}`, "set_opening", { valve, pct: 30 + Math.round(Math.random() * 70) }); };
  change(); randomTimer = window.setInterval(change, 1800); $("random").textContent = "■ DETENER ALEATORIO";
}

async function start(): Promise<void> {
  schema = await getJson<Schema>(`/api/plants/${plantId}/plc-schema`);
  $("plant-name").textContent = ` · ${schema.name.toUpperCase()}`;
  $<HTMLAnchorElement>("link-plant").href = `/plant.html?plant=${plantId}${sessionId ? `&session=${encodeURIComponent(sessionId)}` : ""}${query.get("api") ? `&api=${encodeURIComponent(apiOrigin)}` : ""}`;
  buildAssets();
  document.querySelectorAll<HTMLButtonElement>(".tabs button").forEach((button) => button.onclick = () => selectScreen(button.dataset.screen!));
  const initialScreen = new URLSearchParams(location.search).get("screen");
  if (["master", "day", "pumping", "grid", "profiles", "trends", "fractal", "history"].includes(initialScreen ?? "")) selectScreen(initialScreen!);
  $("connect").onclick = () => { void connect(); };
  $("pause").onclick = () => { paused = !paused; socket?.send(JSON.stringify({ pause: paused })); $("pause").textContent = paused ? "▶ REANUDAR" : "❚❚ PAUSA"; };
  document.querySelectorAll<HTMLButtonElement>("[data-command]").forEach((button) => button.onclick = () => send("prs-01", "select_branch", { branch: button.dataset.command }));
  const critical = $<HTMLInputElement>("critical-setpoint");
  critical.oninput = () => $("critical-output").textContent = `${Number(critical.value).toFixed(2)} mca`;
  critical.onchange = () => send("prs-01", "set_critical_setpoint", { mca: Number(critical.value) });
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
  $("chart-modal-close").onclick = () => $<HTMLDialogElement>("chart-modal").close();
  $<HTMLSelectElement>("session-speed").onchange = (event) => {
    const speed = Number((event.target as HTMLSelectElement).value);
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ speed }));
  };
  $("fractal-refresh").onclick = () => { void renderFractal(); };
  $("fractal-horizon").onclick = async () => {
    if (!sessionId) { window.alert("Inicie una sesión PLC con un perfil guardado antes de proyectar."); return; }
    if (!fractalOrigin) { window.alert("Configure Fractal con ?fractal=https://host-fractal."); return; }
    const studyType = $<HTMLSelectElement>("fractal-study-type").value;
    const valveOpening = Number($<HTMLInputElement>("fractal-valve-opening").value);
    const overrides = studyType === "alternative" ? {
      demand_multiplier: Number($<HTMLInputElement>("fractal-demand-multiplier").value),
      leakage_multiplier: Number($<HTMLInputElement>("fractal-leak-multiplier").value),
      valve_12_pct: valveOpening, valve_23_pct: valveOpening, valve_34_pct: valveOpening,
    } : undefined;
    const button = $<HTMLButtonElement>("fractal-horizon");
    button.disabled = true; button.textContent = "… LEYENDO PLC Y PROYECTANDO";
    let study: { study_id: string; study_type: string; base_time: number; hours: { hour: number; supply_level_pct: number; robust: boolean; scenarios: { demand_factor: number; state: Record<string, number>; feasible: boolean }[] }[]; published?: unknown };
    try {
      const response = await fetch(`${fractalOrigin}/studies/horizon/from-plc`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ session_id: sessionId, plant_id: plantId, emulator_api: apiOrigin, overrides, study_type: studyType }) });
      if (!response.ok) { const detail = await response.json().catch(() => ({})) as { detail?: string }; throw Error(detail.detail ?? "Fractal no pudo proyectar el perfil PLC"); }
      study = await response.json();
    } catch (error) { window.alert(String(error)); return; }
    finally { button.disabled = false; button.textContent = "◫ PROYECTAR 24 H DESDE PLC"; }
    if (study.published) $<HTMLAnchorElement>("link-plant").href = `/plant.html?plant=${plantId}&session=${encodeURIComponent(sessionId)}&study=${encodeURIComponent(study.study_id)}${query.get("api") ? `&api=${encodeURIComponent(apiOrigin)}` : ""}`;
    $("fractal-recommendations").innerHTML = `<article class="panel"><p class="eyebrow">◆ FUTURO SIMULADO · NO APLICADO · ${study.study_type.toUpperCase()}</p><p><b>Estudio ${study.study_id}</b> · origen PLC t=${fmt(study.base_time, 0)} s · ${study.published ? "persistido en PLC" : "resultado Fractal (no persistido en PLC)"}</p>${study.hours.map((item) => `<p>Hora ${String(item.hour + 1).padStart(2, "0")} · tanque ${fmt(item.supply_level_pct)} % · ${item.robust ? "FACTIBLE" : "REVISAR · NO VALIDADO"} · presión nominal ${fmt(item.scenarios[1]?.state.critical_pressure_mca)} mca</p>`).join("")}</article>`;
    void renderFractal();
  };
  $("profile-new").onclick = () => { activeProfile = { name: "", description: "", hours: {} }; activeProfileId = null; profileHour = 0; renderProfileEditor(); };
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
  $("profile-run").onclick = () => { if (!activeProfileId) { window.alert("Guarde el perfil antes de ejecutarlo."); return; } void connect(); };
  renderDay(); renderSavedRuns(); await loadProfiles();
  if (sessionId) void connect();
}

start().catch((error: unknown) => { $("plant-name").textContent = ` · ERROR: ${String(error)}`; });
