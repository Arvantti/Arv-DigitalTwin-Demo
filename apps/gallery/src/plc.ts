import "./plc.css";

type Value = number | string | null;
type Snapshot = { state: string; variables: Record<string, Value>; animation: Record<string, number>; active_faults: string[] };
type Message = { t: number; speed: number; paused: boolean; snapshot: { equipment: Record<string, Snapshot> }; events: { type: string; equipment_id?: string }[] };
type Asset = { id: string; name: string; group: string; level?: number };
type Schema = { name: string; assets: Asset[]; service_constraint: { critical_pressure_min_mca: number; automatic_target_mca: number } };
type Sample = { t: number; main: number; recirculation: number; consumption: number; leakage: number; critical: number; supplyLevel: number; pumpDischarge: number; stationIn: number; stationOut: number; grid1In: number; grid1Out: number; grid2Out: number; grid3Out: number; criticalFlow: number };
type SavedRun = { id: string; startedAt: string; durationS: number; samples: Sample[] };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const plantId = new URLSearchParams(location.search).get("plant") ?? "water-network-scale-v1";
let schema: Schema;
let socket: WebSocket | null = null;
let paused = false;
let latest: Record<string, Snapshot> = {};
let simTime = 0;
let randomTimer: number | null = null;
const DAY_SECONDS = 24 * 3600;
const SAMPLE_INTERVAL_S = 60;
const RUNS_KEY = "arvantti.water-plc.runs.v1";
let history: Sample[] = [];
let runStartedAt = "";
let runSaved = false;

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
  return `<article class="card panel"><p class="eyebrow">${label}</p><h2>${eq(id)?.state?.toUpperCase() ?? "—"}</h2><div class="readings"><span>Caudal <b>${fmt(value(id, "flow_m3h"))} m³/h</b></span><span>VFD <b>${fmt(value(id, "speed_pct"))} %</b></span><span>Succión <b>${fmt(value(id, "suction_pressure_mca"))} mca</b></span><span>Descarga <b>${fmt(value(id, "discharge_pressure_mca"))} mca</b></span><span>Potencia <b>${fmt(value(id, "power_kw"))} kW</b></span><span>Bombas <b>${fmt(value(id, "pumps_running"), 0)}/${fmt(value(id, "pumps_available"), 0)}</b></span></div><div class="controls"><button data-pump="${id}" data-pump-command="start">START</button><button data-pump="${id}" data-pump-command="stop">STOP</button></div></article>`;
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
  if (samples.length < 2) return `<article class="trend panel"><h2>${title}<span>${unit}</span></h2><p class="empty">Acumulando muestras…</p></article>`;
  const width = 560, height = 160, pad = 20;
  const lo = Math.min(...samples, reference ?? Infinity);
  const hi = Math.max(...samples, reference ?? -Infinity);
  const range = Math.max(0.01, hi - lo);
  const point = (value: number, index: number) => `${pad + (index * (width - 2 * pad)) / (samples.length - 1)},${height - pad - ((value - lo) / range) * (height - 2 * pad)}`;
  const path = samples.map(point).join(" ");
  const refY = reference === undefined ? "" : `<line class="ref" x1="${pad}" x2="${width - pad}" y1="${height - pad - ((reference - lo) / range) * (height - 2 * pad)}" y2="${height - pad - ((reference - lo) / range) * (height - 2 * pad)}" />`;
  return `<article class="trend panel"><h2>${title}<span>${fmt(samples.at(-1), 2)} ${unit}</span></h2><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Tendencia de ${title}"><line class="axis" x1="${pad}" x2="${width - pad}" y1="${height - pad}" y2="${height - pad}" />${refY}<polyline class="line ${color}" points="${path}" /></svg><p class="muted">Mín. ${fmt(lo, 2)} · Máx. ${fmt(hi, 2)} · ${history.length} muestras</p></article>`;
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
  return `<article class="trend panel"><h2>${title}<span>${unit}</span></h2><svg class="day-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${title}"><g class="day-axis">${axis}${timeAxis}</g>${referenceLine}${lines}</svg><div class="legend">${legend}</div></article>`;
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
}

function renderAlarms(): void {
  const active: string[] = [];
  for (const [id, snapshot] of Object.entries(latest)) if (snapshot.state === "fault" || snapshot.active_faults.length) active.push(`${id}: ${snapshot.active_faults.join(", ") || "falla"}`);
  const critical = n(value("prs-01", "critical_pressure_mca"));
  if (critical !== null && critical < schema.service_constraint.critical_pressure_min_mca) active.unshift(`Presión crítica ${fmt(critical)} mca bajo 15 mca`);
  $("alarms").innerHTML = active.length ? active.map((message) => `<div class="alarm">${message}</div>`).join("") : `<p class="muted">Sin alarmas activas.</p>`;
}

function render(message: Message): void {
  latest = message.snapshot.equipment;
  simTime = message.t;
  for (const asset of schema.assets) {
    const node = document.querySelector<HTMLElement>(`[data-asset="${asset.id}"]`);
    const state = eq(asset.id)?.state ?? "—";
    if (node) { node.textContent = state.toUpperCase(); node.className = `state ${state}`; }
  }
  const hh = String(Math.floor(simTime / 3600)).padStart(2, "0");
  const mm = String(Math.floor((simTime % 3600) / 60)).padStart(2, "0");
  const ss = String(Math.floor(simTime % 60)).padStart(2, "0");
  $("clock").textContent = `SIM · ${hh}:${mm}:${ss} · ×${message.speed}`;
  recordHistory(message);
  renderMaster(); renderDay(); renderPumping(); renderGrid(); renderTrends(); renderHydraulicProfile(); renderAlarms();
  if (message.t >= DAY_SECONDS) { saveCurrentRun(); socket?.close(); }
}

function connect(): void {
  if (socket?.readyState === WebSocket.OPEN) { socket.close(); return; }
  saveCurrentRun();
  history = [];
  runStartedAt = new Date().toISOString();
  runSaved = false;
  renderDay();
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  // ×60: un minuto real recorre una hora hidráulica; el día completo tarda 24 min.
  socket = new WebSocket(`${protocol}://${location.host}/api/plants/${plantId}/simulate?speed=60`);
  socket.onopen = () => { $("connection").textContent = "● SIMULACIÓN CONECTADA · 1 h/min"; $("connection").classList.add("on"); $("connect").textContent = "■ DETENER Y GUARDAR"; };
  socket.onmessage = (event) => { const message = JSON.parse(event.data) as Message & { error?: string }; if (!message.error) render(message); };
  socket.onclose = () => { saveCurrentRun(); socket = null; $("connection").textContent = "● DESCONECTADO"; $("connection").classList.remove("on"); $("connect").textContent = "▶ INICIAR SIMULACIÓN 24 H"; };
}

function randomize(): void {
  if (randomTimer !== null) { window.clearInterval(randomTimer); randomTimer = null; $("random").textContent = "⚄ ALEATORIO"; return; }
  const change = () => { const level = 1 + Math.floor(Math.random() * 4); const valve = `c${1 + Math.floor(Math.random() * 4)}${1 + Math.floor(Math.random() * 4)}`; send(`grid-0${level}`, "set_opening", { valve, pct: 30 + Math.round(Math.random() * 70) }); };
  change(); randomTimer = window.setInterval(change, 1800); $("random").textContent = "■ DETENER ALEATORIO";
}

async function start(): Promise<void> {
  const response = await fetch(`/api/plants/${plantId}/plc-schema`);
  if (!response.ok) throw Error(`No se pudo cargar el contrato PLC (${response.status})`);
  schema = await response.json() as Schema;
  $("plant-name").textContent = ` · ${schema.name.toUpperCase()}`;
  buildAssets();
  document.querySelectorAll<HTMLButtonElement>(".tabs button").forEach((button) => button.onclick = () => selectScreen(button.dataset.screen!));
  const initialScreen = new URLSearchParams(location.search).get("screen");
  if (["master", "day", "pumping", "grid", "trends", "history"].includes(initialScreen ?? "")) selectScreen(initialScreen!);
  $("connect").onclick = connect;
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
  renderDay(); renderSavedRuns();
}

start().catch((error: unknown) => { $("plant-name").textContent = ` · ERROR: ${String(error)}`; });
