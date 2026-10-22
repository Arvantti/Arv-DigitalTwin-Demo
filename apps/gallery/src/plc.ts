import "./plc.css";

type Value = number | string | null;
type Snapshot = { state: string; variables: Record<string, Value>; animation: Record<string, number>; active_faults: string[] };
type Message = { t: number; speed: number; paused: boolean; snapshot: { equipment: Record<string, Snapshot> }; events: { type: string; equipment_id?: string }[] };
type Asset = { id: string; name: string; group: string; level?: number };
type Schema = { name: string; assets: Asset[]; service_constraint: { critical_pressure_min_mca: number; automatic_target_mca: number } };
type Sample = { t: number; main: number; recirculation: number; consumption: number; leakage: number; critical: number; supplyLevel: number };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const plantId = new URLSearchParams(location.search).get("plant") ?? "water-network-scale-v1";
let schema: Schema;
let socket: WebSocket | null = null;
let paused = false;
let latest: Record<string, Snapshot> = {};
let simTime = 0;
let randomTimer: number | null = null;
const history: Sample[] = [];

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
  $("prs-values").innerHTML = [
    ["Entrada", `${fmt(value("prs-01", "inlet_pressure_mca"))} mca`], ["Salida", `${fmt(value("prs-01", "outlet_pressure_mca"))} mca`],
    ["Casa crítica", `${fmt(value("prs-01", "critical_pressure_mca"))} mca`], ["SP crítica", `${fmt(value("prs-01", "critical_setpoint_mca"))} mca`],
    ["SP auto", `${fmt(value("prs-01", "auto_outlet_setpoint_mca"))} mca`], ["Manual", `${fmt(value("prs-01", "manual_setting_mca"))} mca`],
  ].map(([label, reading]) => `<span>${label} <b>${reading}</b></span>`).join("");
  document.querySelectorAll<HTMLButtonElement>("[data-pump-command]").forEach((button) => button.onclick = () => send(button.dataset.pump!, button.dataset.pumpCommand!));
}

function renderGrid(): void {
  const cards: string[] = [];
  let lowest: { grid: string; valve: string; pressure: number } | null = null;
  for (let level = 1; level <= 4; level++) {
    const id = `grid-0${level}`;
    for (let branch = 1; branch <= 4; branch++) for (let house = 1; house <= 4; house++) {
      const valve = `c${branch}${house}`;
      const pressure = n(value(id, `p_${valve}`)) ?? Infinity;
      if (!lowest || pressure < lowest.pressure) lowest = { grid: id, valve, pressure };
    }
  }
  for (let level = 1; level <= 4; level++) {
    const id = `grid-0${level}`;
    const houses: string[] = [];
    for (let branch = 1; branch <= 4; branch++) for (let house = 1; house <= 4; house++) {
      const valve = `c${branch}${house}`;
      const open = Math.round((eq(id)?.animation[`open_${valve}`] ?? 0) * 100);
      const critical = lowest?.grid === id && lowest.valve === valve;
      houses.push(`<article class="house ${critical ? "critical" : ""}"><span class="id">L${level}.${valve.toUpperCase()}</span><span class="values">${fmt(value(id, `p_${valve}`))} mca<br>${fmt(value(id, `q_${valve}`))} L/min</span><input data-grid="${id}" data-valve="${valve}" type="range" min="0" max="100" value="${open}" title="Apertura ${valve}" /><span class="muted">${open} %</span></article>`);
    }
    cards.push(`<section class="level panel"><h2>NIVEL ${level}<span>${fmt(value(id, "consumption_m3h"))} m³/h</span></h2><div class="houses">${houses.join("")}</div></section>`);
  }
  $("grid-levels").innerHTML = cards.join("");
  document.querySelectorAll<HTMLInputElement>("[data-grid]").forEach((input) => input.onchange = () => send(input.dataset.grid!, "set_opening", { valve: input.dataset.valve, pct: Number(input.value) }));
}

function recordHistory(message: Message): void {
  const last = history.at(-1);
  if (last && message.t - last.t < 15) return;
  const consumption = ["grid-01", "grid-02", "grid-03", "grid-04"].reduce((sum, id) => sum + (n(value(id, "consumption_m3h")) ?? 0), 0);
  const leakage = ["grid-01", "grid-02", "grid-03", "grid-04"].reduce((sum, id) => sum + (n(value(id, "leakage_m3h")) ?? 0), 0);
  history.push({ t: message.t, main: n(value("pumpset-main-01", "flow_m3h")) ?? 0, recirculation: n(value("pumpset-recirc-01", "flow_m3h")) ?? 0, consumption, leakage, critical: n(value("prs-01", "critical_pressure_mca")) ?? 0, supplyLevel: n(value("tank-supply-01", "level_pct")) ?? 0 });
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
  renderMaster(); renderPumping(); renderGrid(); renderTrends(); renderAlarms();
}

function connect(): void {
  if (socket?.readyState === WebSocket.OPEN) { socket.close(); return; }
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  socket = new WebSocket(`${protocol}://${location.host}/api/plants/${plantId}/simulate?speed=60`);
  socket.onopen = () => { $("connection").textContent = "● SIMULACIÓN CONECTADA"; $("connection").classList.add("on"); $("connect").textContent = "■ DESCONECTAR"; };
  socket.onmessage = (event) => { const message = JSON.parse(event.data) as Message & { error?: string }; if (!message.error) render(message); };
  socket.onclose = () => { socket = null; $("connection").textContent = "● DESCONECTADO"; $("connection").classList.remove("on"); $("connect").textContent = "▶ CONECTAR SIMULACIÓN"; };
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
  $("connect").onclick = connect;
  $("pause").onclick = () => { paused = !paused; socket?.send(JSON.stringify({ pause: paused })); $("pause").textContent = paused ? "▶ REANUDAR" : "❚❚ PAUSA"; };
  document.querySelectorAll<HTMLButtonElement>("[data-command]").forEach((button) => button.onclick = () => send("prs-01", "select_branch", { branch: button.dataset.command }));
  const critical = $<HTMLInputElement>("critical-setpoint");
  critical.oninput = () => $("critical-output").textContent = `${Number(critical.value).toFixed(2)} mca`;
  critical.onchange = () => send("prs-01", "set_critical_setpoint", { mca: Number(critical.value) });
  const all = $<HTMLInputElement>("all-consumers");
  all.oninput = () => $("all-consumers-output").textContent = `${all.value} %`;
  all.onchange = () => { for (let level = 1; level <= 4; level++) send(`grid-0${level}`, "set_opening", { valve: "consumers", pct: Number(all.value) }); };
  $("random").onclick = randomize;
}

start().catch((error: unknown) => { $("plant-name").textContent = ` · ERROR: ${String(error)}`; });
