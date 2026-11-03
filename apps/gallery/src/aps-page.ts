/**
 * APS de la planta de plásticos (aps.html): pedidos, CALCULAR con el cosimulador y la programación como Gantt.
 *
 * - PEDIDOS: cartera inventada del cliente y los pedidos que se agregan aquí (entrega dentro de la ventana de una
 *   semana, importancia alta, normal o baja).
 * - CALCULAR: el cosimulador coloca la producción con restricciones lineales (HiGHS, en un hilo aparte) priorizando
 *   las entregas. La programación manual del planificador es la otra entrada. Las dos replanean desde AHORA y quedan
 *   como propuesta frente a la vigente: se adopta o se descarta.
 * - GANTT: arriba las órdenes (una fila por pedido, días en horizontal, inicio y fin, entrega marcada); abajo los
 *   recursos (máquinas) con los lotes de esas órdenes, los cambios de color y las paradas.
 * - AJUSTE MANUAL: en el Gantt se arrastra un lote a otra máquina u hora (o una orden entera en el tiempo) y el mismo
 *   despacho recalcula todo desde AHORA; el candado fija una orden donde está y CALCULAR organiza el resto sin moverla.
 *
 * El estado se comparte con el gemelo 3D por aps-store.ts (mismo navegador).
 */
import "./styles.css";
import "./aps.css";
import "./movil.css";
import type { CustomerOrder, Importance, ProductionPlan } from "@twin/cosim/core/contracts.ts";
import type { Objective } from "@twin/cosim/adapters/plastic-injection-plant-v1/solve.ts";
import { activeEvents, addedOrders, baseManual, molds, modelNow, manualPlan, model, now, onChange, portfolio, resetDemo, setAdded, setVigente, setViewed, setViewMode, SOURCE_NAMES, useDemoDays, vigente, viewedPlan, viewMode } from "./aps-store.ts";
import { editedPlan, moveChunk, queuesOf, type EditChunk, type ManualEdit } from "@twin/cosim/adapters/plastic-injection-plant-v1/manual.ts";
import { COLOR_NAMES, day, esc, nf, relativeDays, when } from "./schedule.ts";
import { renderInsumos } from "./insumos.ts";
import { plantLoadAt } from "./plant-state.ts";
import type { FractalStudy } from "@twin/fractal-manufacturing/contracts.ts";
import type { StudyInput } from "@twin/fractal-manufacturing/models/plastic-injection-plant-v1/study.ts";

/** Qué manda en un cambio de referencia (cosimulador, catalog/changeovers.yaml). */
const CHANGE_NAMES: Record<"molde" | "resina" | "color", string> = { molde: "cambio de molde", resina: "purga de resina", color: "purga de color" };

const IMPORTANCE: [Importance, string][] = [
  ["alta", "Alta"],
  ["normal", "Normal"],
  ["baja", "Baja"],
];
const PRODUCT_COLORS: Record<string, string> = {
  cubiertos: "#4EA7FF",
  "balde-12l": "#ff9f43",
  "papelera-20l": "#22c46b",
  "cuerpo-papelera-20l": "#7bd88f",
  "pedal-palanca-papelera": "#2ec4b6",
};
const COMPONENT_NAMES: Record<string, string> = { "cuerpo-papelera-20l": "Cuerpo de papelera 20 L", "pedal-palanca-papelera": "Pedal y palanca" };
const MACHINE_NAMES: Record<string, string> = { "assembly-01": "ENSAMBLE-01" };
const WEEKDAYS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const DAY_MS = 864e5;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const ms = (iso: string) => Date.parse(`${iso.slice(0, 16)}:00Z`);
const isoOf = (t: number) => new Date(t).toISOString().slice(0, 16);

if (new URLSearchParams(location.search).has("embed")) document.body.classList.add("embed");
if (new URLSearchParams(location.search).get("reset") === "1") resetDemo();

let proposal: ProductionPlan | null = null;
/** Escenarios que devolvió CALCULAR (A: cumplir entregas; B: menos cambios sin empeorar entregas), para elegir entre ellos. */
let alternatives: { id: string; label: string; plan: ProductionPlan }[] = [];
let current = vigente();
const TABS = ["orders", "gantt", "insumos", "fractal"];
let tab = TABS.find((x) => x === new URLSearchParams(location.search).get("tab")) ?? "orders";
let selected: string | null = null;
/** Recursos del Gantt: por máquina o por molde (cada copia del molde es una fila). */
let resView: "maquina" | "molde" = "maquina";
/** Orden que se acaba de mover: parpadea en el Gantt hasta que la persona le da clic. */
let flashOrder: string | null = null;
/** Al mover una orden, el Gantt la centra una vez. */
let scrollToFlash = false;
let viewFrom = ms(`${now().slice(0, 10)}T00:00`) - 2 * DAY_MS;
let running = "";
let error = "";
let formMsg = "";
let worker: Worker | null = null;
let runId = 0;

/** Qué se muestra en el APS: la vigente, o el escenario visto (la propuesta). El selector del Gantt cambia esto. */
let viewVigente = false;
const shown = () => (viewVigente ? current : (proposal ?? current));

useDemoDays();

/** Lo que el APS muestra como propuesta es el escenario que ve el gemelo, hasta que el gemelo vuelva a "vigente". */
let lastView = "";
function syncView(): void {
  const key = proposal?.plan_id ?? "";
  if (key === lastView) return;
  lastView = key;
  if (proposal) viewVigente = false;
  setViewed(proposal);
  setViewMode(proposal ? "escenario" : "vigente");
}

function render(): void {
  syncView();
  const p = shown();
  $("aps-clock").textContent = `AHORA · ${when(now())}`;
  const occ = occOf(current, loadIds(current));
  $("aps-vigente").innerHTML = `VIGENTE · <b>${esc(SOURCE_NAMES[current.source])} ${esc(current.plan_id)}</b> · ${nf(current.kpis.on_time_pct, 1)} % a tiempo · ocupación ${pctTxt(occ.occupancy)}`;
  document.querySelectorAll<HTMLButtonElement>(".aps-tabs [data-tab]").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  $("tab-orders").hidden = tab !== "orders";
  $("tab-gantt").hidden = tab !== "gantt";
  $("tab-fractal").hidden = tab !== "fractal";
  $("tab-insumos").hidden = tab !== "insumos";
  $("aps-calc").toggleAttribute("disabled", !!running);
  renderAlarm();
  renderProposal();
  if (tab === "orders") renderOrders(p);
  else if (tab === "gantt") renderGantt(p);
  else if (tab === "insumos") renderInsumos($("tab-insumos"), p);
  else renderFractal();
}

// ------------------------------------------------------------------ fallas del emulador
const machineLabel = (m: string) => (MACHINE_NAMES[m] ?? m).toUpperCase();
/** Ocupación de la planta en los 7 días desde AHORA: horas programadas / disponibles de las máquinas con molde u orden (como el centro de control). */
const T_MIN = () => Date.parse(`${now().slice(0, 16)}:00Z`) / 60000;
const loadIds = (...plans: ProductionPlan[]) => [...new Set([...model.machines, ...plans.flatMap((p) => p.schedule.map((r) => r.equipment))])];
const occOf = (plan: ProductionPlan, ids: string[]) => plantLoadAt(plan, activeEvents(), ids, T_MIN());
const pctTxt = (x: number) => `${nf(x * 100, 1)} %`;

/** Fallas y paros que llegaron del emulador y que la programación vigente todavía no tiene en cuenta. */
function pendingEvents() {
  return activeEvents().filter((e) => !current.downtime.some((d) => d.equipment === e.equipment && d.start.slice(0, 16) === e.start.slice(0, 16)));
}

function renderAlarm(): void {
  const el = $("aps-alarm");
  const list = activeEvents();
  el.hidden = !list.length;
  if (!list.length) return;
  const pending = pendingEvents();
  el.innerHTML = list
    .map((e) => {
      const hit = current.schedule.filter((r) => r.equipment === e.equipment && r.end.slice(0, 16) > e.start.slice(0, 16) && r.start.slice(0, 16) < e.est_end.slice(0, 16));
      const orders = [...new Set(hit.map((r) => r.order))];
      return `<p><b>⚠ ${esc(machineLabel(e.equipment))} · ${e.kind === "falla" ? "FALLA" : "PARO DE EMERGENCIA"}</b> desde ${when(e.start)} · ${esc(e.reason)} · reparación estimada hasta ${when(e.est_end)}${
        pending.some((x) => x.id === e.id) && orders.length ? ` · <span class="bad">afecta ${orders.length} orden${orders.length === 1 ? "" : "es"} de la vigente: ${orders.slice(0, 6).map(esc).join(", ")}${orders.length > 6 ? "…" : ""}</span>` : ""
      }</p>`;
    })
    .join("") + (pending.length ? '<p class="dim small">Avisado por el emulador a través del centro de control. Pulsa CALCULAR: el cosimulador replanea desde AHORA sin esa máquina y pasa su trabajo a las que tienen el mismo molde.</p>' : '<p class="dim small">La programación vigente ya tiene en cuenta esta parada.</p>');
}

// ------------------------------------------------------------------ propuesta
function renderProposal(): void {
  const el = $("aps-proposal");
  if (running) {
    el.hidden = false;
    el.innerHTML = `<p><span class="spin">◌</span> ${esc(running)} <span id="aps-calc-secs" class="dim"></span></p><div class="aps-bar" aria-hidden="true"><i></i></div>`;
    return;
  }
  if (error) {
    el.hidden = false;
    el.innerHTML = `<p class="bad">${esc(error)}</p>`;
    return;
  }
  if (!proposal) {
    el.hidden = true;
    return;
  }
  const v = current.kpis;
  const k = proposal.kpis;
  const ids = loadIds(current, proposal);
  const ov = occOf(current, ids);
  const op = occOf(proposal, ids);
  const s = proposal.solver;
  const cell = (a: number, b: number, fmt: (x: number) => string, lowerIsBetter: boolean) =>
    `<span>${fmt(a)}</span><b class="${a === b ? "" : (b < a) === lowerIsBetter ? "ok" : "bad"}">${fmt(b)}</b>`;
  el.hidden = false;
  // Escenarios de CALCULAR: elegir entre cumplir entregas y menos cambios (mismas entregas).
  const choices = alternatives.length > 1 && alternatives.some((a) => a.plan.plan_id === proposal!.plan_id)
    ? `<div class="aps-scen" role="group" aria-label="Escenarios">${alternatives.map((a, i) => `<button data-scen="${esc(a.id)}" class="${a.plan.plan_id === proposal!.plan_id ? "primary" : ""}" aria-pressed="${a.plan.plan_id === proposal!.plan_id}">${String.fromCharCode(65 + i)} · ${esc(a.label)}</button>`).join("")}</div>`
    : "";
  el.innerHTML = `
    <div class="aps-prop-head">
      <div><div class="label">PROPUESTA · ${esc(SOURCE_NAMES[proposal.source])} ${esc(proposal.plan_id)}</div>${choices}
      <p class="dim small">${s ? `Colocación lineal con HiGHS: ${s.status === "Optimal" ? "óptima" : esc(s.status)} en ${nf(s.seconds, 1)} s, ${nf(s.variables)} variables y ${nf(s.constraints)} restricciones. ` : ""}${proposal.frozen_until ? `Replaneada desde ${when(proposal.frozen_until)}: lo que ya empezó no cambia.` : ""}${activeEvents().length ? ` Sin ${activeEvents().map((e) => `${machineLabel(e.equipment)} hasta ${when(e.est_end)}`).join(", ")}: el lote en curso se corta y lo que falta se reprograma.` : ""} ${proposal.notes?.map(esc).join(" ") ?? ""}</p></div>
      <div class="aps-prop-kpis">
        <div><small>A tiempo</small>${cell(v.on_time_pct, k.on_time_pct, (x) => `${nf(x, 1)} %`, false)}</div>
        <div><small>Pedidos tarde</small>${cell(v.late_orders, k.late_orders, (x) => nf(x), true)}</div>
        <div><small>Atraso total</small>${cell(v.tardiness_h, k.tardiness_h, (x) => `${nf(x, 1)} h`, true)}</div>
        <div title="Cambios de referencia: montaje de molde, purga de resina o purga de color (tiempos de catalog/changeovers.yaml)"><small>Cambios de referencia</small>${cell(v.changeovers, k.changeovers, (x) => nf(x), true)}<small>${nf(v.changeover_h ?? 0, 1)} → ${nf(k.changeover_h ?? 0, 1)} h</small></div>
        <div title="Horas programadas / horas disponibles de la planta en los 7 días desde AHORA"><small>Ocupación planta · 7 días</small>${cell(ov.occupancy, op.occupancy, pctTxt, true)}<small>${nf(ov.busyH, 0)} → ${nf(op.busyH, 0)} h de ${nf(op.availH, 0)} h</small></div>
      </div>
      <div class="aps-prop-actions"><button id="aps-adopt" class="primary">✓ ADOPTAR COMO VIGENTE</button><button id="aps-discard">✕ DESCARTAR</button></div>
    </div>`;
  el.querySelectorAll<HTMLButtonElement>("[data-scen]").forEach((b) => {
    b.onclick = () => {
      const pick = alternatives.find((a) => a.id === b.dataset.scen);
      if (!pick) return;
      proposal = pick.plan;
      clearEdit();
      render();
    };
  });
  $("aps-adopt").onclick = () => {
    setVigente(proposal!);
    current = vigente();
    proposal = null;
    alternatives = [];
    clearEdit();
    render();
  };
  $("aps-discard").onclick = () => {
    proposal = null;
    alternatives = [];
    clearEdit();
    render();
  };
}

/** Objetivos que el cosimulador puede optimizar, uno por corrida. Energía queda pendiente: no hay datos en el APS. */
const OBJECTIVE_OPTIONS: { id: Objective | "energia"; label: string; detail: string; pending?: boolean }[] = [
  { id: "entregas", label: "Cumplir entregas", detail: "Terminar cada pedido a tiempo, primero los de importancia alta (hoy es el cálculo de siempre)." },
  { id: "cambios", label: "Minimizar cambios de molde y color", detail: "Menos referencias encendidas por turno; cada cambio cuesta montaje y purgas de catalog/changeovers.yaml. En prueba: sin entregas en cuenta, puede dejar pedidos tarde." },
  { id: "cuellos", label: "Balancear cuellos de botella", detail: "Que ninguna inyectora quede más cargada que las demás. En prueba: sin entregas en cuenta, puede dejar pedidos tarde." },
  { id: "capacidad", label: "Maximizar capacidad ocupada", detail: "Llenar las máquinas desde el inicio y terminar la cartera antes (con demanda fija, es terminar pronto)." },
  { id: "energia", label: "Mejorar consumo energético", detail: "Pendiente: falta energía por arranque y por llegar a la temperatura de fusión en el APS. Hoy solo hay potencia nominal por equipo.", pending: true },
];
const OBJECTIVE_LABEL = Object.fromEntries(OBJECTIVE_OPTIONS.map((o) => [o.id, o.label])) as Record<string, string>;

const CALC_LABEL = "⚙ CALCULAR CON EL COSIMULADOR";
let calcTimer = 0;

/** Muestra que el cosimulador sigue trabajando: segundos en el botón y en la propuesta. */
function startCalcTimer(): void {
  const t0 = Date.now();
  const tick = () => {
    const secs = Math.floor((Date.now() - t0) / 1000);
    $("aps-calc").textContent = `⚙ CALCULANDO… ${secs} s`;
    const label = document.getElementById("aps-calc-secs");
    if (label) label.textContent = `· ${secs} s`;
  };
  tick();
  clearInterval(calcTimer);
  calcTimer = window.setInterval(tick, 250);
}

function stopCalcTimer(): void {
  clearInterval(calcTimer);
  calcTimer = 0;
  $("aps-calc").textContent = CALC_LABEL;
}

function calculate(objective: Objective = "entregas"): void {
  error = "";
  running = fixedOf().length
    ? `El cosimulador está organizando el resto de la producción sin mover ${fixedOf().length === 1 ? "el pedido fijado" : `los ${fixedOf().length} pedidos fijados`} · objetivo: ${OBJECTIVE_LABEL[objective]}…`
    : `El cosimulador está colocando la producción con restricciones lineales · objetivo: ${OBJECTIVE_LABEL[objective]}…`;
  render();
  startCalcTimer();
  worker?.terminate();
  worker = new Worker(new URL("./aps-worker.ts", import.meta.url), { type: "module" });
  const id = ++runId;
  const n = Number((current.plan_id.match(/SOL-(\d+)/) ?? [])[1] ?? 0) + 1;
  worker.onmessage = (e: MessageEvent<{ id: number; ok: boolean; plan?: ProductionPlan; scenarios?: typeof alternatives; error?: string }>) => {
    if (e.data.id !== id) return;
    running = "";
    stopCalcTimer();
    if (e.data.ok) {
      proposal = e.data.plan!;
      alternatives = e.data.scenarios ?? [];
      clearEdit();
    } else {
      alternatives = [];
      error = `El cosimulador no pudo programar: ${e.data.error}`;
    }
    worker?.terminate();
    worker = null;
    tab = "gantt";
    render();
  };
  worker.onerror = (e) => {
    running = "";
    stopCalcTimer();
    error = `El cosimulador no pudo arrancar: ${e.message}`;
    render();
  };
  // Con pedidos fijados se parte del plan que se está viendo: ahí están sus lotes, que no se mueven.
  const fixed = fixedOf();
  worker.postMessage({ id, portfolio: portfolio(), now: now(), previous: fixed.length ? shown() : current, planId: `APS-SOL-${String(n).padStart(2, "0")}`, events: activeEvents(), molds: molds(), fixed, objective });
}

/** Pregunta el objetivo antes de calcular. Un solo objetivo calcula; varios pasan a Fractal (multiobjetivo). */
function openObjectivePicker(): void {
  const dialog = $("aps-objetivo") as HTMLDialogElement;
  const list = $("aps-obj-list");
  list.innerHTML = OBJECTIVE_OPTIONS.map((o) => `
    <label class="aps-obj-opt${o.pending ? " pending" : ""}">
      <input type="checkbox" value="${o.id}" ${o.id === "entregas" ? "checked" : ""} ${o.pending ? "disabled" : ""}>
      <span><b>${esc(o.label)}</b>${o.pending ? ' <em class="chip">PENDIENTE</em>' : ""}<small>${esc(o.detail)}</small></span>
    </label>`).join("");
  list.querySelectorAll<HTMLInputElement>("input").forEach((i) => (i.onchange = updateObjectiveNote));
  updateObjectiveNote();
  dialog.showModal();
}

function chosenObjectives(): string[] {
  return [...$("aps-obj-list").querySelectorAll<HTMLInputElement>("input:checked")].map((i) => i.value);
}

function updateObjectiveNote(): void {
  const picked = chosenObjectives();
  const go = $("aps-obj-go") as HTMLButtonElement;
  const note = $("aps-obj-note");
  if (picked.length === 0) {
    note.textContent = "Elige un objetivo para calcular.";
    go.textContent = "Calcular";
  } else if (picked.length === 1) {
    note.textContent = "El cosimulador optimiza un solo objetivo por corrida.";
    go.textContent = "Calcular";
  } else {
    note.textContent = `Elegiste ${picked.length} objetivos a la vez. Eso es multiobjetivo: el cosimulador no lo calcula. Es trabajo de Fractal, que todavía no tiene el optimizador multiobjetivo; ¿lo escalamos ahí?`;
    go.textContent = "Llevar a Fractal";
  }
}

$("aps-obj-cancel").onclick = () => ($("aps-objetivo") as HTMLDialogElement).close();
$("aps-obj-go").onclick = () => {
  const picked = chosenObjectives();
  if (picked.length !== 1) {
    if (picked.length > 1) {
      ($("aps-objetivo") as HTMLDialogElement).close();
      tab = "fractal";
      render();
    }
    return;
  }
  ($("aps-objetivo") as HTMLDialogElement).close();
  calculate(picked[0] as Objective);
};

// ------------------------------------------------------------------ pedidos
function stateChips(p: ProductionPlan, id: string): string {
  const row = p.orders.find((x) => x.id === id);
  if (!row) return '<span class="chip">SIN PROGRAMAR</span>';
  const t = now();
  const st = row.completion.slice(0, 16) <= t ? ["done", "ENTREGADO"] : row.start.slice(0, 16) <= t ? ["now", "EN PRODUCCIÓN"] : ["todo", "PROGRAMADO"];
  return `<span class="chip ${st[0]}">${st[1]}</span>${row.late_h > 0 ? `<span class="chip late">TARDE ${nf(row.late_h, 1)} h</span>` : ""}`;
}

/** Opciones de fecha de entrega como "día N" (el valor sigue siendo la fecha de la planta). */
const dayOptions = (plus: (n: number) => string, from: number, to: number, selected: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i)
    .map((n) => `<option value="${plus(n)}"${n === selected ? " selected" : ""}>${esc(day(plus(n)))}${n === 1 ? " (mañana)" : ""}</option>`)
    .join("");

type OrderCol = "id" | "customer" | "product" | "color" | "qty" | "created" | "due" | "imp" | "state";
const ORDER_COLS: [OrderCol, string, boolean][] = [
  ["id", "Pedido", false],
  ["customer", "Cliente", false],
  ["product", "Producto", false],
  ["color", "Color", false],
  ["qty", "Cantidad", true],
  ["created", "Llegó", false],
  ["due", "Entrega", false],
  ["imp", "Importancia", false],
  ["state", "Estado", false],
];
const IMP_RANK: Record<string, number> = { alta: 0, normal: 1, baja: 2 };
const STATE_RANK: Record<string, number> = { "SIN PROGRAMAR": 0, PROGRAMADO: 1, "EN PRODUCCIÓN": 2, ENTREGADO: 3 };
/** Orden y filtros de la tabla de pedidos (solo en esta pantalla). */
let ordSort: { key: OrderCol; dir: 1 | -1 } | null = null;
const ordFilters = new Map<OrderCol, Set<string>>();
let ordPop: OrderCol | null = null;
/** Lo que muestra una celda, la clave por la que se filtra y el valor por el que se ordena. */
interface OrderCell { shown: string; key: string; sort: string | number }

const cmpSort = (a: string | number, b: string | number) =>
  typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), "es", { numeric: true });

function stateLabel(p: ProductionPlan, id: string): string {
  const row = p.orders.find((x) => x.id === id);
  if (!row) return "SIN PROGRAMAR";
  const t = now();
  return row.completion.slice(0, 16) <= t ? "ENTREGADO" : row.start.slice(0, 16) <= t ? "EN PRODUCCIÓN" : "PROGRAMADO";
}

function orderCells(o: CustomerOrder, p: ProductionPlan): Record<OrderCol, OrderCell> {
  const prod = model.products[o.product];
  const prodName = prod?.name ?? o.product;
  const color = o.color ? (COLOR_NAMES[o.color] ?? o.color) : "—";
  const imp = IMPORTANCE.find(([v]) => v === o.importance)?.[1] ?? o.importance;
  const state = stateLabel(p, o.id);
  const qty = `${nf(o.quantity)} ${prod?.unit ?? "u"}`;
  return {
    id: { shown: o.id, key: o.id, sort: o.id },
    customer: { shown: o.customer, key: o.customer, sort: o.customer.toLowerCase() },
    product: { shown: prodName, key: prodName, sort: prodName.toLowerCase() },
    color: { shown: color, key: color, sort: color.toLowerCase() },
    qty: { shown: qty, key: qty, sort: o.quantity },
    created: { shown: when(o.created), key: day(o.created), sort: o.created },
    due: { shown: `${day(o.due)} ${o.due.slice(11, 16)}`, key: day(o.due), sort: o.due },
    imp: { shown: imp, key: imp, sort: IMP_RANK[o.importance] ?? 9 },
    state: { shown: state, key: state, sort: STATE_RANK[state] ?? 9 },
  };
}

/** Pedidos en orden de la cartera: primero lo que falta por entregar, lo entregado al final. */
function ordersList(): CustomerOrder[] {
  const t = now();
  const byDue = (a: CustomerOrder, b: CustomerOrder) => (a.due < b.due ? -1 : a.due > b.due ? 1 : a.id.localeCompare(b.id));
  const isPending = (o: CustomerOrder) => o.due.slice(0, 16) >= t;
  const pending = portfolio().orders.filter(isPending).sort(byDue);
  return [...pending, ...portfolio().orders.filter((o) => !isPending(o)).sort(byDue)];
}

function renderOrders(p: ProductionPlan): void {
  const el = $("tab-orders");
  const t = now();
  const plus = (n: number) => new Date(ms(`${t.slice(0, 10)}T00:00`) + n * DAY_MS).toISOString().slice(0, 10);
  const all = ordersList();
  const pendingCount = all.filter((o) => o.due.slice(0, 16) >= t).length;
  const products = Object.values(model.products);
  const inPlan = new Set(p.orders.map((o) => o.id));
  const missing = all.filter((o) => !inPlan.has(o.id)).length;
  el.innerHTML = `
    <div class="aps-orders-head">
      <div class="aps-kpi"><b>${all.length}</b><small>pedidos en la cartera</small></div>
      <div class="aps-kpi"><b>${pendingCount}</b><small>por entregar desde hoy</small></div>
      <div class="aps-kpi"><b>${addedOrders().length}</b><small>agregados en esta pantalla</small></div>
      <div class="aps-kpi"><b class="${missing ? "warn" : ""}">${missing}</b><small>sin programar${missing ? " · pulsa CALCULAR" : ""}</small></div>
      <p class="dim small">Ventana de entrega de ${model.windowDays} días. Clientes, cantidades y fechas inventados. Dos turnos de 8 h, lunes a sábado.</p>
    </div>
    <details class="aps-add"${window.matchMedia("(min-width: 701px)").matches ? " open" : ""}>
      <summary class="label">AGREGAR PEDIDO</summary>
      <label>Cliente <input id="f-customer" list="f-customers" placeholder="Nombre del cliente" /></label>
      <datalist id="f-customers">${model.customers.map((c) => `<option value="${esc(c)}"></option>`).join("")}</datalist>
      <label>Producto <select id="f-product">${products.map((x) => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join("")}</select></label>
      <label>Color <select id="f-color"></select></label>
      <label>Cantidad <input id="f-qty" type="number" min="1" step="1" /></label>
      <label>Entrega <select id="f-due">${dayOptions(plus, 1, model.windowDays, Math.min(5, model.windowDays))}</select></label>
      <label>Importancia <select id="f-imp">${IMPORTANCE.map(([v, l]) => `<option value="${v}"${v === "normal" ? " selected" : ""}>${l}</option>`).join("")}</select></label>
      <button id="f-add" class="primary">＋ AGREGAR</button>
      <span id="f-msg" class="small">${formMsg}</span>
    </details>
    <div id="aps-orders-table"></div>`;
  const sel = $<HTMLSelectElement>("f-product");
  const sync = () => {
    const prod = model.products[sel.value];
    const line = model.demand.find((d) => d.product === sel.value);
    const step = line?.round ?? 1;
    $<HTMLInputElement>("f-qty").value = String(line ? Math.round((line.order_qty[0] + line.order_qty[1]) / 2 / step) * step : 1000);
    $("f-color").innerHTML = prod.colors.map((c) => `<option value="${esc(c)}">${esc(COLOR_NAMES[c] ?? c)}</option>`).join("");
  };
  sel.onchange = sync;
  sync();
  $("f-add").onclick = () => {
    const customer = $<HTMLInputElement>("f-customer").value.trim();
    const qty = Math.round(Number($<HTMLInputElement>("f-qty").value));
    const due = $<HTMLSelectElement>("f-due").value;
    const bad = (m: string) => ((formMsg = `<span class="bad">${m}</span>`), render());
    if (!customer) return bad("Falta el cliente.");
    if (!(qty > 0)) return bad("La cantidad debe ser mayor que cero.");
    if (!due || due <= t.slice(0, 10) || due > plus(model.windowDays)) return bad(`La entrega debe estar entre mañana y ${model.windowDays} días.`);
    const prod = model.products[sel.value];
    const close = model.calendar.shifts.map((s) => s.end).sort().at(-1)!;
    const list = addedOrders();
    const order: CustomerOrder = {
      id: `PED-N${String(list.length + 1).padStart(2, "0")}`,
      customer,
      product: prod.id,
      quantity: qty,
      unit: prod.unit,
      due: `${due}T${close}${model.timezone}`,
      created: `${t}${model.timezone}`,
      importance: $<HTMLSelectElement>("f-imp").value as Importance,
      added: true,
    };
    const color = $<HTMLSelectElement>("f-color").value;
    if (color) order.color = color;
    setAdded([...list, order]);
    formMsg = `<span class="ok">${esc(order.id)} agregado. Pulsa CALCULAR para programarlo.</span>`;
    render();
  };
  drawOrdersTable(p);
}

/** Tabla de pedidos con orden y filtro por columna. Se redibuja sola al ordenar o filtrar, sin tocar el formulario. */
function drawOrdersTable(p: ProductionPlan): void {
  const el = $("aps-orders-table");
  const t = now();
  const rows = ordersList().map((o) => ({ o, c: orderCells(o, p) }));
  // Valores distintos de una columna, ordenados como la columna (fechas en orden de día).
  const valuesOf = (col: OrderCol): string[] => {
    const best = new Map<string, string | number>();
    for (const { c } of rows) {
      const v = c[col];
      const prev = best.get(v.key);
      if (prev === undefined || cmpSort(v.sort, prev) < 0) best.set(v.key, v.sort);
    }
    return [...best].sort((a, b) => cmpSort(a[1], b[1])).map(([key]) => key);
  };
  const visible = rows.filter(({ c }) => [...ordFilters].every(([col, set]) => set.has(c[col].key)));
  if (ordSort) {
    const { key, dir } = ordSort;
    visible.sort((a, b) => dir * cmpSort(a.c[key].sort, b.c[key].sort));
  }
  const active = ordSort || ordFilters.size;
  const th = (col: OrderCol, label: string, num: boolean) => {
    const on = ordSort?.key === col;
    const arrow = on ? (ordSort!.dir === 1 ? " ▲" : " ▼") : "";
    const filtered = ordFilters.has(col);
    return `<th class="${num ? "num" : ""}"><button class="ord-sort${on ? " on" : ""}" data-ord-sort="${col}">${label}${arrow}</button><button class="ord-filter${filtered ? " on" : ""}" data-ord-pop="${col}" title="Filtrar ${label}" aria-label="Filtrar ${label}">${filtered ? "⧩" : "▾"}</button></th>`;
  };
  el.innerHTML = `
    <div class="ord-status"><span>Mostrando ${visible.length} de ${rows.length} pedidos</span>${active ? `<button data-ord-act="reset">Quitar orden y filtros</button>` : ""}</div>
    <div class="aps-table-wrap"><table class="route-table aps-table">
      <thead><tr>${ORDER_COLS.map(([col, label, num]) => th(col, label, num)).join("")}<th></th></tr></thead>
      <tbody>${visible
        .map(({ o, c }) => `<tr class="${o.added ? "added" : ""}${o.due.slice(0, 16) < t ? " past" : ""}">
          <td><b>${esc(c.id.shown)}</b></td><td>${esc(c.customer.shown)}</td>
          <td><span class="dot" style="background:${PRODUCT_COLORS[o.product] ?? "#888"}"></span>${esc(c.product.shown)}</td>
          <td>${esc(c.color.shown)}</td>
          <td class="num">${esc(c.qty.shown)}</td>
          <td>${esc(c.created.shown)}</td>
          <td><b>${day(o.due)}</b> ${o.due.slice(11, 16)}</td>
          <td><span class="imp imp-${o.importance}">${esc(c.imp.shown.toUpperCase())}</span></td>
          <td>${stateChips(p, o.id)}</td>
          <td>${o.added ? `<button class="f-del" data-id="${esc(o.id)}" title="Quitar este pedido">✕</button>` : ""}</td>
        </tr>`)
        .join("")}</tbody></table></div>`;

  el.querySelectorAll<HTMLButtonElement>("[data-ord-sort]").forEach((b) => {
    b.onclick = () => {
      const key = b.dataset.ordSort as OrderCol;
      ordSort = ordSort?.key === key ? { key, dir: ordSort.dir === 1 ? -1 : 1 } : { key, dir: 1 };
      drawOrdersTable(p);
    };
  });
  el.querySelectorAll<HTMLButtonElement>("[data-ord-pop]").forEach((b) => {
    b.onclick = (e) => {
      e.stopPropagation();
      const key = b.dataset.ordPop as OrderCol;
      ordPop = ordPop === key ? null : key;
      drawOrdersTable(p);
    };
  });
  el.querySelector<HTMLButtonElement>('[data-ord-act="reset"]')?.addEventListener("click", () => {
    ordSort = null;
    ordFilters.clear();
    ordPop = null;
    drawOrdersTable(p);
  });
  el.querySelectorAll<HTMLButtonElement>(".f-del").forEach(
    (b) =>
      (b.onclick = () => {
        setAdded(addedOrders().filter((o) => o.id !== b.dataset.id));
        formMsg = "";
        render();
      }),
  );

  // Menú de filtro tipo Excel: flotante, fuera de la tabla para que no lo recorte el desplazamiento.
  document.querySelectorAll(".ord-pop").forEach((n) => n.remove());
  if (!ordPop) return;
  const col = ordPop;
  const btn = el.querySelector<HTMLElement>(`[data-ord-pop="${col}"]`);
  if (!btn) return;
  const vals = valuesOf(col);
  const f = ordFilters.get(col);
  const label = ORDER_COLS.find(([c]) => c === col)![1];
  const pop = document.createElement("div");
  pop.className = "ord-pop";
  pop.setAttribute("role", "dialog");
  pop.innerHTML = `
    <button data-act="asc">Ordenar de menor a mayor</button>
    <button data-act="desc">Ordenar de mayor a menor</button>
    <div class="ord-pop-list">
      <label><input type="checkbox" data-act="all"${f ? "" : " checked"} /> (Seleccionar todo)</label>
      ${vals.map((v, i) => `<label><input type="checkbox" data-idx="${i}"${!f || f.has(v) ? " checked" : ""} /> ${esc(v)}</label>`).join("")}
    </div>
    <button data-act="close">Cerrar</button>`;
  pop.setAttribute("aria-label", `Filtro de ${label}`);
  const r = btn.getBoundingClientRect();
  pop.style.left = `${Math.max(8, Math.min(r.left, innerWidth - 260))}px`;
  pop.style.top = `${r.bottom + 4}px`;
  pop.addEventListener("click", (e) => e.stopPropagation());
  pop.querySelector<HTMLButtonElement>('[data-act="asc"]')!.onclick = () => ((ordSort = { key: col, dir: 1 }), drawOrdersTable(p));
  pop.querySelector<HTMLButtonElement>('[data-act="desc"]')!.onclick = () => ((ordSort = { key: col, dir: -1 }), drawOrdersTable(p));
  pop.querySelector<HTMLButtonElement>('[data-act="close"]')!.onclick = () => ((ordPop = null), drawOrdersTable(p));
  pop.querySelector<HTMLInputElement>('[data-act="all"]')!.onchange = (e) => {
    if ((e.target as HTMLInputElement).checked) ordFilters.delete(col);
    else ordFilters.set(col, new Set());
    drawOrdersTable(p);
  };
  pop.querySelectorAll<HTMLInputElement>("[data-idx]").forEach((inp) => {
    inp.onchange = () => {
      const v = vals[Number(inp.dataset.idx)];
      const cur = new Set(ordFilters.get(col) ?? vals);
      if (inp.checked) cur.add(v);
      else cur.delete(v);
      if (cur.size === vals.length) ordFilters.delete(col);
      else ordFilters.set(col, cur);
      drawOrdersTable(p);
    };
  });
  document.body.append(pop);
}

// Un clic fuera del menú de filtro lo cierra.
document.addEventListener("click", () => {
  if (!ordPop) return;
  ordPop = null;
  document.querySelectorAll(".ord-pop").forEach((n) => n.remove());
});

// ------------------------------------------------------------------ Gantt
function renderGantt(p: ProductionPlan): void {
  const el = $("tab-gantt");
  const keep = el.querySelector(".g-scroll")?.scrollTop ?? null;
  const days = 10;
  const from = viewFrom;
  const to = from + days * DAY_MS;
  const t = ms(now());
  const pct = (x: number) => `${(((Math.min(Math.max(x, from), to) - from) / (to - from)) * 100).toFixed(3)}%`;
  const span = (a: number, b: number) => `left:${pct(a)};width:calc(${pct(b)} - ${pct(a)})`;
  const inView = (a: number, b: number) => b > from && a < to;

  // Columnas de días y turnos (sombreado de la noche y de los domingos).
  const spans = model.calendar.spans;
  let grid = "";
  let head = "";
  for (let d = 0; d < days; d++) {
    const d0 = from + d * DAY_MS;
    const date = new Date(d0);
    const work = model.calendar.workdays.includes(((date.getUTCDay() + 6) % 7) + 1);
    head += `<div class="g-day${work ? "" : " off"}" style="${span(d0, d0 + DAY_MS)}">${relativeDays() ? "" : `${WEEKDAYS[date.getUTCDay()]} `}${day(isoOf(d0))}</div>`;
    if (!work) grid += `<div class="g-off" style="${span(d0, d0 + DAY_MS)}"></div>`;
    else {
      const a = d0 + spans[0][0] * 60000;
      const b = d0 + spans[spans.length - 1][1] * 60000;
      grid += `<div class="g-off" style="${span(d0, a)}"></div><div class="g-off" style="${span(b, d0 + DAY_MS)}"></div>`;
    }
    grid += `<div class="g-line" style="left:${pct(d0)}"></div>`;
  }
  const nowLine = t >= from && t <= to ? `<div class="g-now" style="left:${pct(t)}"><span>AHORA</span></div>` : "";

  // Máquinas que trabajan la orden seleccionada (en todo el plan): lotes y horas.
  const usedBy = new Map<string, { lots: number; h: number }>();
  if (selected)
    for (const r of p.schedule.filter((x) => x.order === selected).sort((a, b) => (a.start < b.start ? -1 : 1))) {
      const u = usedBy.get(r.equipment) ?? { lots: 0, h: 0 };
      u.lots += 1;
      u.h += model.calendar.workBetween(ms(r.start) / 60000, ms(r.end) / 60000) / 60;
      usedBy.set(r.equipment, u);
    }

  // Ajuste manual: qué se puede arrastrar (lo que no ha empezado y no está fijado).
  const fixed = new Set(p.fixed_orders ?? []);
  const nowIso = now().slice(0, 16);
  const movableOrders = new Set(p.schedule.filter((r) => r.start.slice(0, 16) >= nowIso).map((r) => r.order));
  const pins = new Set(Object.entries(edit?.queues ?? {}).flatMap(([m, q]) => q.filter((c) => c.notBefore).map((c) => `${m}|${c.job}`)));

  // Arriba: una fila por pedido con actividad en la ventana.
  const orders = p.orders
    .filter((o) => inView(ms(o.start), Math.max(ms(o.completion), ms(o.due))))
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.id.localeCompare(b.id)));
  const orderRows = orders
    .map((o) => {
      const a = ms(o.start);
      const b = ms(o.completion);
      const due = ms(o.due);
      const color = PRODUCT_COLORS[o.product] ?? "#888";
      const late = o.late_h > 0;
      const res = o.id === selected ? [...usedBy.keys()].map(machineLabel).join(" · ") : "";
      const isFixed = fixed.has(o.id);
      const movable = !isFixed && movableOrders.has(o.id);
      return `<div class="g-row${o.id === selected ? " sel" : ""}${isFixed ? " fixed" : ""}" data-order="${esc(o.id)}" title="Clic: ver sus máquinas y lotes abajo">
        <div class="g-label"><b>${isFixed || movableOrders.has(o.id) ? `<button class="g-lock${isFixed ? " on" : ""}" data-lock="${esc(o.id)}" title="${isFixed ? "Fijada: no se mueve al replanear. Clic para soltarla" : "Fijar esta orden donde está: CALCULAR organiza el resto sin moverla"}">${isFixed ? "🔒" : "🔓"}</button>` : '<span class="g-lock-gap"></span>'}${esc(o.id)}</b><small>${esc(o.product_name)} · ${nf(o.quantity)} ${esc(o.unit)} · ${esc(o.customer)}</small>${res ? `<small class="g-uses">▸ ${esc(res)}</small>` : ""}</div>
        <div class="g-track">
          <div class="g-bar${late ? " late" : ""}${b <= t ? " done" : ""}${movable ? " drag" : ""}${isFixed ? " fixed" : ""}${flashOrder === o.id ? " flash" : ""}" data-move-order="${esc(o.id)}" style="${span(a, b)};--c:${color}" title="${esc(o.id)}: ${when(o.start)} → ${when(o.completion)}${late ? ` · ${nf(o.late_h, 1)} h tarde` : ""}${isFixed ? " · FIJADA" : movable ? " · arrástrala para moverla en el tiempo" : ""}">
            <span>${when(o.start)} → ${when(o.completion)}</span></div>
          ${due >= from && due <= to ? `<div class="g-due${late ? " late" : ""}" style="left:${pct(due)}" title="Entrega ${when(o.due)}"></div>` : ""}
        </div></div>`;
    })
    .join("");

  // Abajo: recursos con los lotes de esas órdenes.
  const visible = new Set(orders.map((o) => o.id));
  const machines = [...new Set([...model.machines, ...p.schedule.map((r) => r.equipment)])]
    .sort()
    .sort((a, b) => Number(usedBy.has(b)) - Number(usedBy.has(a)));
  /** Fila de recurso con los lotes que corren en la máquina m (en la vista por molde, la máquina donde está la copia). */
  const resourceRow = (m: string, title: string, info?: string, rowCls = "") => {
      const rows = p.schedule.filter((r) => r.equipment === m && inView(ms(r.start), ms(r.end)));
      const busy = rows.reduce((s, r) => s + model.calendar.workBetween(Math.max(ms(r.start), from) / 60000, Math.min(ms(r.end), to) / 60000), 0);
      const work = model.calendar.workBetween(from / 60000, to / 60000);
      const load = work ? Math.round((100 * busy) / work) : 0;
      const bars = rows
        .map((r) => {
          const a = ms(r.start);
          const b = ms(r.end);
          const dim = (selected && r.order !== selected) || !visible.has(r.order) ? " dim" : "";
          const tip = `${esc(r.order)} · ${esc(r.product)}${r.color ? ` · ${esc(COLOR_NAMES[r.color] ?? r.color)}` : ""} · lote ${r.batch ? `${r.batch[0]} de ${r.batch[1]}` : "—"} · ${nf(r.quantity)} u · ${when(r.start)} → ${when(r.end)}${r.changeover_min ? ` · ${CHANGE_NAMES[r.changeover_kind ?? "color"]} ${nf(r.changeover_min)} min` : ""}`;
          // Un lote que cruza la noche o el domingo se dibuja solo en las horas de turno.
          const parts = workParts(a / 60000, b / 60000);
          return parts
            .map((x, i) => {
              const co = i === 0 ? Math.min(100, ((r.changeover_min * 60000) / Math.max(1, (x.end - x.start) * 60000)) * 100) : 0;
              const mine = selected && r.order === selected ? " sel" : "";
              const isFixed = fixed.has(r.order);
              const drag = !isFixed && r.start.slice(0, 16) >= nowIso ? " drag" : "";
              const pin = pins.has(`${m}|${r.order}/${r.product}`) ? " pinned" : "";
              const extra = isFixed ? " · FIJADA" : drag ? " · arrástralo a otra máquina u hora" : "";
              return `<div class="g-lot${dim}${mine}${drag}${pin}${isFixed ? " fixed" : ""}" style="${span(x.start * 60000, x.end * 60000)};--c:${PRODUCT_COLORS[r.product] ?? "#888"};--co:${co.toFixed(1)}%" data-order="${esc(r.order)}" data-job="${esc(`${r.order}/${r.product}`)}" data-m="${esc(m)}" data-start="${r.start.slice(0, 16)}" title="${tip}${extra}"></div>`;
            })
            .join("");
        })
        .join("");
      const extra = proposal ? [] : pendingEvents().map((e) => ({ equipment: e.equipment, start: e.start, end: e.est_end, reason: `${e.kind === "falla" ? "Falla" : "Paro de emergencia"}: ${e.reason} (del emulador, sin replanear)` }));
      const downs = [...p.downtime, ...extra]
        .filter((d) => d.equipment === m && inView(ms(d.start), ms(d.end)))
        .map((d) => `<div class="g-down" style="${span(ms(d.start), ms(d.end))}" title="Parada: ${esc(d.reason)} · ${when(d.start)} → ${when(d.end)}"></div>`)
        .join("");
      const u = usedBy.get(m);
      const cls = selected ? (u ? " used" : " unused") : "";
      const detail = u ? `${info ? `${info} · ` : ""}${esc(selected!)}: ${u.lots} ${u.lots === 1 ? "lote" : "lotes"} · ${nf(u.h, 1)} h` : `${info ?? esc(machineProducts(m))} · carga ${load} %`;
      return `<div class="g-row res${cls}${rowCls}" data-machine="${esc(m)}"><div class="g-label"><b>${esc(title)}</b><small>${detail}</small></div><div class="g-track">${downs}${bars}</div></div>`;
  };
  // Por molde: dónde está cada molde físico (numerados) en este escenario (lo montado, con los cambios de Fractal) y el resto en el almacén.
  const where: Record<string, string> = { ...model.mounted };
  for (const [m, t] of Object.entries(p.molds ?? {})) t ? (where[m] = t) : delete where[m];
  const moldRows = model.molds
    .map((t) => {
      const short = t.name.replace(/^Molde del? /i, "");
      const at = Object.keys(where)
        .filter((m) => where[m] === t.id)
        // Numeración fija: primero las inyectoras del montaje inicial, luego las que Fractal montó.
        .sort((a, b) => Number(model.mounted[a] !== t.id) - Number(model.mounted[b] !== t.id) || a.localeCompare(b));
      const n = Math.max(t.copies, at.length);
      const head = `<div class="g-row res g-mold-head"><div class="g-label"><b>${esc(short.toUpperCase())}</b><small>${n} ${n === 1 ? "molde" : "moldes"} · ${at.length} montado${at.length === 1 ? "" : "s"} · montaje ${nf(t.changeMin)} min</small></div><div class="g-track"></div></div>`;
      const copies = Array.from({ length: n }, (_, i) => {
        const m = at[i];
        const title = `Molde ${i + 1}`;
        if (!m) return `<div class="g-row res g-copy g-mold-idle${selected ? " unused" : ""}"><div class="g-label"><b>${esc(title)}</b><small>en el almacén de moldes</small></div><div class="g-track"></div></div>`;
        const moved = p.molds?.[m] === t.id ? " (Fractal)" : "";
        return resourceRow(m, title, `en ${esc(machineLabel(m))}${moved}`, " g-copy");
      });
      return head + copies.join("");
    })
    .join("");
  const resRows = resView === "molde" ? moldRows : machines.map((m) => resourceRow(m, machineLabel(m))).join("");

  const legend = Object.entries(PRODUCT_COLORS)
    .map(([id, c]) => `<span><i style="background:${c}"></i>${esc(productName(id))}</span>`)
    .join("");
  el.innerHTML = `
    <div class="g-toolbar">
      <button id="g-prev" title="Un día atrás">◀</button><button id="g-today">HOY</button><button id="g-next" title="Un día adelante">▶</button>
      <span class="dim small">${day(isoOf(from))} a ${day(isoOf(to - DAY_MS))} · mostrando ${p === current ? "la VIGENTE" : "el ESCENARIO"} ${esc(p.plan_id)} · ${orders.length} órdenes</span>
      <select id="g-view" title="Qué programación muestra el Gantt: la vigente o el escenario visto">
        <option value="vigente">VIGENTE · ${esc(current.plan_id)}</option>
        <option value="escenario"${proposal ? "" : " disabled"}>ESCENARIO · ${esc(proposal?.plan_id ?? "ninguno visto")}</option>
      </select>
      <span class="g-legend">${legend}<span><i class="hatch"></i>cambio (molde, resina o color)</span><span><i class="down"></i>parada</span><span><i class="pin"></i>hora fijada</span><span><i class="fix"></i>orden fijada</span></span>
    </div>
    <div class="g-manual">
      <span>✋ <b>AJUSTE MANUAL</b> · arrastra un lote a otra máquina: sobre otro lote queda antes o después de él; en un espacio libre queda fijado a esa hora. Arrastra una orden de arriba para moverla en el tiempo. 🔒 fija una orden: CALCULAR organiza el resto sin moverla.</span>
      <span class="aps-spacer"></span>
      ${dragMsg ? `<span class="g-msg ${dragMsg.ok ? "ok" : "bad"}">${esc(dragMsg.text)}</span>` : ""}
      <button id="g-undo"${history.length ? "" : " disabled"} title="Deshacer el último movimiento">↶ DESHACER${history.length ? ` (${history.length})` : ""}</button>
    </div>
    <div class="g-wrap">
      <div class="g-section-title">ÓRDENES DE PRODUCCIÓN</div>
      <div class="g-head"><div class="g-label"></div><div class="g-track">${head}</div></div>
      <div class="g-scroll"><div class="g-body g-orders"><div class="g-gridlayer"><div class="g-label"></div><div class="g-track">${grid}${nowLine}</div></div>${orderRows || '<p class="dim small">Sin órdenes en estos días.</p>'}</div></div>
      <div class="g-section-title g-res-title"><span class="g-resview"><button id="g-by-machine"${resView === "maquina" ? ' class="on"' : ""}>POR MÁQUINA</button><button id="g-by-mold"${resView === "molde" ? ' class="on"' : ""} title="Cada molde físico es una fila, numerado: un molde solo está en una inyectora a la vez">POR MOLDE</button></span>${selected ? `RECURSOS DE ${esc(selected)} · ${usedBy.size} ${usedBy.size === 1 ? "máquina" : "máquinas"} arriba, resaltadas; el resto atenuado · clic de nuevo en la orden para quitar` : "RECURSOS · lotes de las órdenes de arriba · clic en una orden o en un lote para ver sus máquinas"}</div>
      <div class="g-body g-res"><div class="g-gridlayer"><div class="g-label"></div><div class="g-track">${grid}${nowLine}</div></div>${resRows}</div>
    </div>`;
  // La primera vez se abre en la primera orden que aún no termina.
  const scroller = el.querySelector<HTMLElement>(".g-scroll")!;
  const firstOpen = orders.find((o) => ms(o.completion) > t);
  const row = firstOpen && scroller.querySelector<HTMLElement>(`.g-row[data-order="${firstOpen.id}"]`);
  scroller.scrollTop = keep ?? (row ? row.offsetTop - 4 : 0);
  const gView = document.getElementById("g-view") as HTMLSelectElement;
  gView.value = viewVigente || !proposal ? "vigente" : "escenario";
  gView.onchange = () => {
    viewVigente = gView.value === "vigente";
    setViewMode(viewVigente ? "vigente" : "escenario");
    render();
  };
  $("g-prev").onclick = () => ((viewFrom -= DAY_MS), render());
  $("g-next").onclick = () => ((viewFrom += DAY_MS), render());
  $("g-today").onclick = () => ((viewFrom = ms(`${now().slice(0, 10)}T00:00`) - 2 * DAY_MS), render());
  el.querySelectorAll<HTMLElement>("[data-order]").forEach(
    (n) =>
      (n.onclick = (e) => {
        e.stopPropagation();
        if (suppressClick) return;
        if (flashOrder === n.dataset.order) flashOrder = null;
        selected = selected === n.dataset.order ? null : n.dataset.order!;
        render();
      }),
  );
  el.querySelectorAll<HTMLElement>(".g-bar.drag[data-move-order]").forEach(
    (n) =>
      (n.ondblclick = (e) => {
        e.stopPropagation();
        openOrderDialog(n.dataset.moveOrder!);
      }),
  );
  el.querySelectorAll<HTMLButtonElement>("[data-lock]").forEach(
    (b) =>
      (b.onclick = (e) => {
        e.stopPropagation();
        toggleFixed(b.dataset.lock!);
      }),
  );
  if (scrollToFlash) {
    scrollToFlash = false;
    el.querySelector<HTMLElement>(".g-bar.flash")?.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
  }
  $("g-undo").onclick = () => undo();
  $("g-by-machine").onclick = () => ((resView = "maquina"), render());
  $("g-by-mold").onclick = () => ((resView = "molde"), render());
  el.querySelectorAll<HTMLElement>(".g-lot.drag, .g-bar.drag").forEach((n) => (n.onpointerdown = (e) => startDrag(e, n, from, to)));
}

// ------------------------------------------------------------------ ajuste manual en el Gantt
/** Ajuste manual en curso: las colas por máquina y los pasos anteriores para deshacer. */
let edit: ManualEdit | null = null;
let history: { edit: ManualEdit | null; proposal: ProductionPlan | null }[] = [];
let dragMsg: { ok: boolean; text: string } | null = null;
let suppressClick = false;

function clearEdit(): void {
  edit = null;
  history = [];
  dragMsg = null;
}

const fixedOf = () => shown().fixed_orders ?? [];
const SNAP_MIN = 30;
/** Instante de la planta (ms, hora local como UTC) → "AAAA-MM-DDTHH:MM" redondeado a la media hora y nunca antes de AHORA. */
const snapIso = (t: number) => {
  const snapped = Math.round(t / (SNAP_MIN * 60000)) * SNAP_MIN * 60000;
  // Fuera de turno (noche o domingo) arranca al empezar el siguiente turno, como lo haría el despacho.
  return isoOf(model.calendar.nextWork(Math.max(snapped, ms(now())) / 60000) * 60000);
};

/** Máquinas que pueden hacer un producto con los moldes montados ahora. */
function machinesFor(product: string): string[] {
  const m = modelNow();
  for (const p of Object.values(m.products)) {
    if (p.final.product === product) return p.final.machines;
    for (const c of p.components) if (c.step.product === product) return c.step.machines;
  }
  return [];
}

/** Colas de la programación que se está viendo, con las horas fijadas del ajuste en curso. */
function liveQueues(): Record<string, EditChunk[]> {
  const q = queuesOf(shown(), now());
  for (const [m, list] of Object.entries(q))
    for (const c of list) {
      const pin = edit?.queues[m]?.find((x) => x.job === c.job && x.notBefore)?.notBefore;
      if (pin) c.notBefore = pin;
    }
  return q;
}

function nextManualId(): string {
  if (edit) return edit.plan_id;
  const used = [current.plan_id, proposal?.plan_id ?? ""].map((id) => Number((id.match(/APS-MAN-(\d+)/) ?? [])[1] ?? 1));
  return `APS-MAN-${String(Math.max(...used) + 1).padStart(2, "0")}`;
}

/** Recalcula con las colas nuevas desde AHORA (lo empezado y lo fijado no se mueve) y lo deja como propuesta. */
function applyEdit(queues: Record<string, EditChunk[]>, move: string, fixed = fixedOf()): void {
  const next: ManualEdit = { contract: "manual-edit.v1", plan_id: nextManualId(), author: "planificador", queues, moves: [...(edit?.moves ?? []), move] };
  try {
    const plan = editedPlan(modelNow(), portfolio(), next, { now: now(), previous: shown(), events: activeEvents(), fixed });
    history.push({ edit, proposal });
    edit = next;
    proposal = plan;
    error = "";
    dragMsg = { ok: true, text: move };
  } catch (err) {
    flashOrder = null;
    scrollToFlash = false;
    dragMsg = { ok: false, text: (err as Error).message };
  }
  render();
}

function undo(): void {
  const last = history.pop();
  if (!last) return;
  edit = last.edit;
  proposal = last.proposal;
  dragMsg = { ok: true, text: "Movimiento deshecho." };
  render();
}

function toggleFixed(id: string): void {
  const list = fixedOf();
  const on = !list.includes(id);
  applyEdit(liveQueues(), on ? `${id} fijada donde está` : `${id} suelta`, on ? [...list, id] : list.filter((x) => x !== id));
}

const jobLabel = (job: string) => {
  const [order, product] = job.split("/");
  flashOrder = order;
  scrollToFlash = true;
  return `${order} (${productName(product).toLowerCase()})`;
};

/** Suelta un lote sobre una máquina: antes o después del lote que haya ahí, o fijado a la hora si es espacio libre. */
function dropLot(job: string, fromM: string, fromStart: string, toM: string, at: number, over: HTMLElement | null): void {
  const product = job.split("/")[1];
  if (!machinesFor(product).includes(toM)) {
    dragMsg = { ok: false, text: `${machineLabel(toM)} no tiene el molde de ${productName(product).toLowerCase()}: el lote vuelve a su sitio.` };
    render();
    return;
  }
  const q = liveQueues();
  const src = q[fromM] ?? [];
  const index = src.reduce((k, c, i) => (c.job === job && (c.start ?? "") <= fromStart ? i : k), src.findIndex((c) => c.job === job));
  if (index < 0) return;
  const dst = (q[toM] ?? []).filter((_, i) => !(toM === fromM && i === index));
  const atIso = isoOf(at);
  let to: { machine: string; index: number; notBefore?: string };
  let text: string;
  const target = over && over.dataset.job !== job && over.dataset.m === toM ? over : null;
  if (target) {
    // Sobre otro lote: antes o después de él según la mitad donde se suelte, sin fecha fijada.
    const box = target.getBoundingClientRect();
    const after = lastPointer.x > box.left + box.width / 2;
    const k = dst.reduce((acc, c, i) => (c.job === target.dataset.job && (c.start ?? "") <= target.dataset.start! ? i : acc), dst.findIndex((c) => c.job === target.dataset.job));
    to = { machine: toM, index: k < 0 ? dst.length : k + (after ? 1 : 0) };
    text = `${jobLabel(job)} → ${machineLabel(toM)}, ${after ? "después" : "antes"} de ${target.dataset.order}`;
  } else {
    const pin = snapIso(at);
    const pos = dst.filter((c) => (c.start ?? "") < atIso).length;
    to = { machine: toM, index: pos, notBefore: pin };
    text = `${jobLabel(job)} → ${machineLabel(toM)}, desde ${when(pin)}`;
  }
  // La posición se contó sin el lote; moveChunk la cuenta con él todavía en su cola (misma máquina, más adelante).
  if (toM === fromM && to.index >= index) to.index += 1;
  applyEdit(moveChunk(q, { machine: fromM, index }, to), text);
}

/** Corre una orden entera en el tiempo: cada tramo suyo queda fijado `delta` más tarde (o más temprano) en su máquina. */
function dropOrder(id: string, deltaMs: number): void {
  flashOrder = id;
  scrollToFlash = true;
  let q = liveQueues();
  let first = "";
  for (const m of Object.keys(q)) {
    const mine = q[m].map((c, i) => ({ c, i })).filter((x) => x.c.job.startsWith(`${id}/`));
    for (const { c } of mine.reverse()) {
      const from = q[m].indexOf(q[m].find((x) => x.job === c.job && x.start === c.start)!);
      const pin = snapIso(ms(c.start ?? now()) + deltaMs);
      const rest = q[m].filter((_, i) => i !== from);
      let pos = rest.filter((x) => (x.start ?? "") < pin).length;
      if (pos >= from) pos += 1;
      q = moveChunk(q, { machine: m, index: from }, { machine: m, index: pos, notBefore: pin });
      if (!first || pin < first) first = pin;
    }
  }
  if (!first) return;
  applyEdit(q, `${id} movida ${deltaMs >= 0 ? "más tarde" : "más temprano"}, desde ${when(first)}`);
}

/** Doble clic en una orden movible: fecha de inicio o de fin; al guardar corre la orden igual que arrastrarla. */
function openOrderDialog(id: string): void {
  const o = shown().orders.find((x) => x.id === id);
  if (!o) return;
  document.querySelector(".ord-dialog-backdrop")?.remove();
  const box = document.createElement("div");
  box.className = "ord-dialog-backdrop";
  box.innerHTML = `<form class="ord-dialog">
    <h3>Pedido ${esc(id)} · ${esc(o.product_name)}</h3>
    <label>Inicio <input type="datetime-local" name="start" value="${esc(o.start.slice(0, 16))}" /></label>
    <label>Fin <input type="datetime-local" name="end" value="${esc(o.completion.slice(0, 16))}" /></label>
    <small class="dim">Cambia la fecha de inicio o la de fin: la orden entera se corre, igual que al arrastrarla.</small>
    <div class="ord-dialog-actions"><button type="submit" class="primary">GUARDAR</button><button type="button" id="ord-cancel">CANCELAR</button></div>
  </form>`;
  document.body.appendChild(box);
  const form = box.querySelector("form")!;
  const startIn = form.elements.namedItem("start") as HTMLInputElement;
  const endIn = form.elements.namedItem("end") as HTMLInputElement;
  const oldStart = o.start.slice(0, 16);
  const oldEnd = o.completion.slice(0, 16);
  box.querySelector<HTMLButtonElement>("#ord-cancel")!.onclick = () => box.remove();
  form.onsubmit = (e) => {
    e.preventDefault();
    const delta = startIn.value !== oldStart ? ms(startIn.value) - ms(oldStart) : endIn.value !== oldEnd ? ms(endIn.value) - ms(oldEnd) : 0;
    box.remove();
    if (delta) dropOrder(id, delta);
  };
}

let lastPointer = { x: 0, y: 0 };

function startDrag(e: PointerEvent, node: HTMLElement, from: number, to: number): void {
  if (e.button !== 0) return;
  const x0 = e.clientX;
  const y0 = e.clientY;
  const isOrder = !!node.dataset.moveOrder;
  const box0 = node.getBoundingClientRect();
  // Dónde agarraste la barra: la barra flotante conserva ese punto bajo el cursor.
  const gx = x0 - box0.left;
  const gy = y0 - box0.top;
  let started = false;
  let float: HTMLElement | null = null;
  let landing: HTMLElement | null = null;
  let tip: HTMLElement | null = null;
  let hot: HTMLElement | null = null;
  const track = node.parentElement!;
  const timeAt = (x: number, tr: HTMLElement) => {
    const r = tr.getBoundingClientRect();
    return from + ((x - r.left) / r.width) * (to - from);
  };
  const pctOf = (t: number) => ((Math.min(Math.max(t, from), to) - from) / (to - from)) * 100;
  const clean = () => {
    float?.remove();
    landing?.remove();
    tip?.remove();
    hot?.classList.remove("drop-ok", "drop-bad");
    node.classList.remove("g-origin");
    document.body.classList.remove("g-dragging");
  };
  /** Qué pasaría si sueltas ahora: fila destino, si vale, dónde cae y el texto. */
  const target = (ev: PointerEvent) => {
    const under = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null;
    if (isOrder) {
      const delta = timeAt(ev.clientX, track) - timeAt(x0, track);
      const startMs = ms(shown().orders.find((o) => o.id === node.dataset.moveOrder)?.start ?? now());
      const at = ms(snapIso(startMs + delta));
      return { row: track.parentElement as HTMLElement, tr: track, ok: true, left: pctOf(at), text: `${node.dataset.moveOrder} desde ${when(snapIso(startMs + delta))}` };
    }
    const row = under?.closest<HTMLElement>(".g-row.res[data-machine]") ?? null;
    if (!row) return null;
    const m = row.dataset.machine!;
    const tr = row.querySelector<HTMLElement>(".g-track")!;
    const trBox = tr.getBoundingClientRect();
    const ok = machinesFor(node.dataset.job!.split("/")[1]).includes(m);
    if (!ok) return { row, tr, ok, left: -1, text: `${machineLabel(m)} no tiene el molde de ${productName(node.dataset.job!.split("/")[1]).toLowerCase()}` };
    const lot = under?.closest<HTMLElement>(".g-lot") ?? null;
    const onLot = lot && lot.dataset.job !== node.dataset.job && lot.dataset.m === m ? lot : null;
    const w = (box0.width / trBox.width) * 100;
    if (onLot) {
      const r = onLot.getBoundingClientRect();
      const after = ev.clientX > r.left + r.width / 2;
      const edge = after ? r.left : r.left - box0.width;
      const left = (((after ? r.right : edge) - trBox.left) / trBox.width) * 100;
      return { row, tr, ok, left, w, text: `${node.dataset.order} → ${machineLabel(m)}, ${after ? "después" : "antes"} de ${onLot.dataset.order}` };
    }
    const iso = snapIso(timeAt(ev.clientX - gx, tr));
    return { row, tr, ok, left: pctOf(ms(iso)), w, text: `${node.dataset.order} → ${machineLabel(m)}, desde ${when(iso)}` };
  };
  const move = (ev: PointerEvent) => {
    lastPointer = { x: ev.clientX, y: ev.clientY };
    if (ev.buttons === 0) return started ? up(ev) : stop();
    if (!started && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) return;
    if (!started) {
      started = true;
      float = node.cloneNode(true) as HTMLElement;
      float.className = `${node.className} g-float`;
      float.removeAttribute("title");
      float.style.cssText = `--c:${node.style.getPropertyValue("--c")};--co:${node.style.getPropertyValue("--co") || "0%"};width:${box0.width}px;height:${box0.height}px`;
      document.body.append(float);
      landing = document.createElement("div");
      landing.className = "g-landing";
      tip = document.createElement("div");
      tip.className = "g-ghost";
      document.body.append(tip);
      node.classList.add("g-origin");
      document.body.classList.add("g-dragging");
    }
    // La barra sigue al cursor sin demora.
    float!.style.left = `${ev.clientX - gx}px`;
    float!.style.top = `${ev.clientY - gy}px`;
    tip!.style.left = `${ev.clientX + 16}px`;
    tip!.style.top = `${ev.clientY + 18}px`;
    const t = target(ev);
    if (t?.row !== hot) {
      hot?.classList.remove("drop-ok", "drop-bad");
      hot = isOrder ? null : (t?.row ?? null);
    }
    if (!t) {
      landing!.remove();
      float!.classList.remove("ok", "bad");
      tip!.className = "g-ghost";
      tip!.textContent = `${node.dataset.order} · suéltala sobre una máquina`;
      return;
    }
    if (!isOrder) {
      t.row.classList.toggle("drop-ok", t.ok);
      t.row.classList.toggle("drop-bad", !t.ok);
    }
    float!.classList.toggle("ok", t.ok);
    float!.classList.toggle("bad", !t.ok);
    tip!.className = `g-ghost ${t.ok ? "ok" : "bad"}`;
    tip!.textContent = t.ok ? t.text : `✕ ${t.text}`;
    if (t.ok && t.w !== undefined) {
      landing!.style.left = `${t.left}%`;
      landing!.style.width = `${t.w}%`;
      t.tr.append(landing!);
    } else if (t.ok) {
      landing!.style.left = `${t.left}%`;
      landing!.style.width = `${(box0.width / track.getBoundingClientRect().width) * 100}%`;
      t.tr.append(landing!);
    } else landing!.remove();
  };
  const stop = () => {
    removeEventListener("pointermove", move);
    removeEventListener("pointerup", up);
    removeEventListener("pointercancel", cancel);
    removeEventListener("mouseup", up);
    removeEventListener("blur", cancel);
    removeEventListener("keydown", esc);
  };
  const up = (ev: PointerEvent | MouseEvent) => {
    stop();
    if (!started) return;
    suppressClick = true;
    setTimeout(() => (suppressClick = false), 0);
    let t: ReturnType<typeof target> = null;
    try {
      t = target(ev as PointerEvent);
    } finally {
      // Pase lo que pase, la barra flotante nunca se queda en pantalla.
      clean();
    }
    lastPointer = { x: ev.clientX, y: ev.clientY };
    if (!t) return;
    if (isOrder) {
      const delta = timeAt(ev.clientX, track) - timeAt(x0, track);
      if (Math.abs(delta) >= (SNAP_MIN / 2) * 60000) dropOrder(node.dataset.moveOrder!, delta);
      return;
    }
    const under = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null;
    // La hora de caída es la del borde izquierdo de la barra, no la del cursor.
    dropLot(node.dataset.job!, node.dataset.m!, node.dataset.start!, t.row.dataset.machine!, timeAt(ev.clientX - gx, t.tr), under?.closest<HTMLElement>(".g-lot") ?? null);
  };
  const cancel = () => {
    stop();
    clean();
  };
  const esc = (ev: KeyboardEvent) => ev.key === "Escape" && cancel();
  e.preventDefault();
  addEventListener("pointermove", move);
  addEventListener("pointerup", up);
  addEventListener("pointercancel", cancel);
  addEventListener("mouseup", up);
  addEventListener("blur", cancel);
  addEventListener("keydown", esc);
}

/** Tramos [inicio, fin] en minutos dentro de los turnos entre a y b. */
function workParts(a: number, b: number): { start: number; end: number }[] {
  const cal = model.calendar;
  const out: { start: number; end: number }[] = [];
  for (let d = Math.floor(a / 1440) * 1440; d < b; d += 1440) {
    if (!cal.isWorkday(d)) continue;
    for (const [s, e] of cal.spans) {
      const x = Math.max(a, d + s);
      const y = Math.min(b, d + e);
      if (y > x) out.push({ start: x, end: y });
    }
  }
  return out;
}

const productName = (id: string) => model.products[id]?.name ?? COMPONENT_NAMES[id] ?? Object.values(model.products).flatMap((p) => p.components).find((c) => c.step.product === id)?.step.product.replace(/-/g, " ") ?? id;
function machineProducts(m: string): string {
  const ids = new Set<string>();
  for (const p of Object.values(model.products)) {
    if (p.final.machines.includes(m)) ids.add(p.id);
    for (const c of p.components) if (c.step.machines.includes(m)) ids.add(c.step.product);
  }
  const moved = shown().molds?.[m];
  if (moved) return `molde ${moved} (Fractal)`;
  if (shown().molds?.[m] === null) return "molde desmontado (Fractal)";
  return [...ids].map((id) => productName(id)).join(", ");
}

// ------------------------------------------------------------------ Fractal
let study: FractalStudy | null = null;
let studying = "";
let studyError = "";
let fractalWorker: Worker | null = null;
let studyN = 0;
/** Plan sobre el que corrió el estudio: la vigente, o el plan que se veía con órdenes fijadas. */
let studyBase: ProductionPlan | null = null;
const SCENARIO_NAMES: Record<string, string> = { adelantar: "ADELANTAR UN PEDIDO", balancear: "BALANCEAR LA OCUPACIÓN", falla: "FALLA EN CURSO", fijadas: "ÓRDENES FIJADAS", cambios: "MENOS CAMBIOS DE REFERENCIA" };

function runFractal(input: Omit<StudyInput, "portfolio" | "now" | "previous" | "events" | "molds" | "studyId">): void {
  studyError = "";
  study = null;
  studying = `Fractal está probando combinaciones para «${SCENARIO_NAMES[input.scenario].toLowerCase()}»: cada una la coloca el cosimulador…`;
  render();
  fractalWorker?.terminate();
  fractalWorker = new Worker(new URL("./fractal-worker.ts", import.meta.url), { type: "module" });
  const id = ++studyN;
  fractalWorker.onmessage = (e: MessageEvent<{ id: number; ok: boolean; study?: FractalStudy; error?: string }>) => {
    if (e.data.id !== id) return;
    studying = "";
    if (e.data.ok) study = e.data.study!;
    else studyError = `Fractal no pudo terminar el estudio: ${e.data.error}`;
    fractalWorker?.terminate();
    fractalWorker = null;
    render();
  };
  fractalWorker.onerror = (e) => {
    studying = "";
    studyError = `Fractal no pudo arrancar: ${e.message}`;
    render();
  };
  // Con órdenes fijadas se parte del plan que se está viendo (ahí están sus lotes) y ninguna opción las mueve.
  const fixed = fixedOf();
  studyBase = fixed.length ? shown() : current;
  fractalWorker.postMessage({ id, input: { ...input, fixed, portfolio: portfolio(), now: now(), previous: fixed.length ? shown() : current, events: activeEvents(), molds: molds(), studyId: `FRA-${String(id).padStart(2, "0")}` } });
}

function renderFractal(): void {
  const el = $("tab-fractal");
  const t = now();
  const plus = (n: number) => new Date(ms(`${t.slice(0, 10)}T00:00`) + n * DAY_MS).toISOString().slice(0, 10);
  // Pedidos que aún no empiezan en la vigente: los que se pueden adelantar.
  const movable = current.orders
    .filter((o) => o.start.slice(0, 16) > t && o.due.slice(0, 10) > plus(2))
    .sort((a, b) => (a.due < b.due ? -1 : 1));
  const ev = activeEvents()[0];
  const pinned = fixedOf();
  const loadsRow = (s: FractalStudy) => {
    const best = s.options.find((o) => o.id === s.best)!;
    const ids = Object.keys({ ...s.baseline.loads, ...best.loads }).filter((m) => (s.baseline.loads[m] ?? 0) > 0 || (best.loads[m] ?? 0) > 0).sort();
    return ids
      .map((m) => {
        const a = s.baseline.loads[m] ?? 0;
        const b = best.loads[m] ?? 0;
        return `<div class="fr-load"><span>${esc(machineLabel(m))}</span><div class="fr-bars"><i class="was" style="width:${Math.min(100, a)}%"></i><i class="${b > 85 ? "hot" : ""}" style="width:${Math.min(100, b)}%"></i></div><b>${nf(a, 0)} → ${nf(b, 0)} %</b></div>`;
      })
      .join("");
  };
  el.innerHTML = `
    <p class="dim small fr-intro">Fractal es la optimización multivariable: además de la secuencia, prueba cambiar la planta (prioridades, montar un molde de repuesto del almacén en una inyectora libre del tamaño correcto, mudar el molde de una máquina parada, dedicar un color a cada máquina para purgar menos). Cada combinación la coloca el cosimulador y Fractal recomienda la mejor. Recomienda; el APS decide.</p>
    <div class="fr-cards">
      <article class="fr-card"><div class="label">1 · ADELANTAR UN PEDIDO</div><p class="dim small">Un cliente pide su pedido antes. ¿Cómo mover todo para cumplirle sin atrasar a los demás?</p>
        <label>Pedido <select id="fr-order">${movable.map((o) => `<option value="${esc(o.id)}">${esc(o.id)} · ${esc(o.product_name)} · ${nf(o.quantity)} · entrega ${day(o.due)}</option>`).join("")}</select></label>
        <label>Nueva entrega <select id="fr-due">${dayOptions(plus, 1, model.windowDays, 2)}</select></label>
        <button id="fr-run-adelantar" class="primary"${movable.length && !studying ? "" : " disabled"}>◆ ESTUDIAR</button></article>
      <article class="fr-card"><div class="label">2 · BALANCEAR LA OCUPACIÓN</div><p class="dim small">Repartir la carga de la próxima semana sin sobrecargas ni cuellos de botella (objetivo 70 % por etapa).</p>
        <button id="fr-run-balancear" class="primary"${studying ? " disabled" : ""}>◆ ESTUDIAR</button></article>
      <article class="fr-card${ev ? " alarm" : ""}"><div class="label">3 · FALLA EN CURSO</div>${
        ev
          ? `<p class="small"><b class="bad">⚠ ${esc(machineLabel(ev.equipment))}</b> fuera de servicio desde ${when(ev.start)} · ${esc(ev.reason)} · reparación estimada ${when(ev.est_end)}.</p><p class="dim small">¿Esperar la reparación o desviar su trabajo a otra máquina del mismo tamaño?</p>`
          : `<p class="dim small">No hay máquinas fuera de servicio. Detén una en el <a href="/emulador.html" target="_blank" rel="noopener">emulador</a> y vuelve aquí.</p>`
      }
        <button id="fr-run-falla" class="primary"${ev && !studying ? "" : " disabled"}>◆ ESTUDIAR</button></article>
      <article class="fr-card"><div class="label">4 · ÓRDENES FIJADAS A MANO</div>${
        pinned.length
          ? `<p class="small">🔒 <b>${pinned.map(esc).join(", ")}</b> ${pinned.length === 1 ? "está fijada" : "están fijadas"} donde ${pinned.length === 1 ? "está" : "están"}.</p><p class="dim small">Fractal organiza el resto de la producción sin moverlas${pinned.length === 1 ? "" : "s"} y prueba si un molde de repuesto ayuda.</p>`
          : `<p class="dim small">Bloquea a mano órdenes en el Gantt con el candado 🔓 (o arrástralas a su día). Fractal organiza el resto sin moverlas.</p>`
      }
        <button id="fr-run-fijadas" class="primary"${pinned.length && !studying ? "" : " disabled"}>◆ ESTUDIAR</button></article>
      <article class="fr-card"><div class="label">5 · MENOS CAMBIOS DE REFERENCIA</div><p class="dim small">Cada cambio cuesta montaje de molde y purgas de resina y color (tiempos del catálogo). La vigente tiene ${nf(current.kpis.changeovers)} cambios y ${nf(current.kpis.changeover_h ?? 0, 1)} h de cambio. ¿Cómo hacer menos sin atrasar pedidos?</p>
        <button id="fr-run-cambios" class="primary"${studying ? " disabled" : ""}>◆ ESTUDIAR</button></article>
    </div>
    ${studying ? `<p class="fr-status"><span class="spin">◌</span> ${esc(studying)}</p>` : ""}
    ${studyError ? `<p class="fr-status bad">${esc(studyError)}</p>` : ""}
    ${
      study
        ? `<section class="fr-result">
        <div class="label">ESTUDIO ${esc(study.study_id)} · ${SCENARIO_NAMES[study.scenario]} · ${study.options.length} combinaciones en ${nf(study.seconds, 1)} s</div>
        <p class="fr-q">${esc(study.question)}</p>
        <p class="fr-rec">◆ ${esc(study.recommendation)}</p>
        <div class="aps-table-wrap"><table class="route-table aps-table fr-table">
          <thead><tr><th>Opción</th><th>Qué cambia</th><th class="num">A tiempo</th><th class="num">Tarde</th><th class="num">Atraso</th><th class="num">Cambios de referencia</th><th class="num">Montaje de moldes</th><th class="num">Ocupación planta</th><th>Carga máxima</th><th class="num">Puntaje</th><th></th></tr></thead>
          <tbody>
            <tr class="past"><td>${studyBase && studyBase !== current ? "ACTUAL" : "VIGENTE"}</td><td>${esc(SOURCE_NAMES[(studyBase ?? current).source])} ${esc(study.baseline.plan_id)}</td><td class="num">${nf(study.baseline.kpis.on_time_pct, 1)} %</td><td class="num">${study.baseline.kpis.late_orders}</td><td class="num">${nf(study.baseline.kpis.tardiness_h, 1)} h</td><td class="num">${study.baseline.kpis.changeovers} · ${nf(study.baseline.kpis.changeover_h ?? 0, 1)} h</td><td class="num">—</td><td class="num">${pctTxt(occOf(studyBase ?? current, loadIds(studyBase ?? current)).occupancy)}</td><td>${esc(machineLabel(study.baseline.max_load.equipment))} ${nf(study.baseline.max_load.pct, 0)} %</td><td></td><td></td></tr>
            ${study.options
              .map(
                (o) => `<tr class="${o.id === study!.best ? "best" : ""}"><td><b>${esc(o.id.split("-").at(-1)!)}</b>${o.id === study!.best ? ' <span class="chip done">MEJOR</span>' : ""}</td><td>${esc(o.label)}<br/><small class="dim">${o.levers.map((l) => esc(l.text)).join(" · ")}</small></td>
                <td class="num">${nf(o.kpis.on_time_pct, 1)} %</td><td class="num">${o.kpis.late_orders}</td><td class="num">${nf(o.kpis.tardiness_h, 1)} h</td><td class="num">${o.kpis.changeovers} · ${nf(o.kpis.changeover_h ?? 0, 1)} h</td><td class="num">${o.mold_change_h ? `${nf(o.mold_change_h, 1)} h` : "—"}</td><td class="num">${pctTxt(occOf(o.plan, loadIds(o.plan)).occupancy)}</td><td>${esc(machineLabel(o.max_load.equipment))} ${nf(o.max_load.pct, 0)} %</td><td class="num">${nf(o.score, 1)}</td>
                <td class="fr-btns"><button class="fr-see" data-id="${esc(o.id)}">VER EN GANTT</button><button class="fr-see fr-pick" data-id="${esc(o.id)}">ADOPTAR</button></td></tr>`,
              )
              .join("")}
          </tbody></table></div>
        <div class="fr-foot"><div><div class="label">OCUPACIÓN POR MÁQUINA · VIGENTE → MEJOR OPCIÓN · próximos 7 días</div><div class="fr-loads">${loadsRow(study)}</div></div>
        <div class="fr-actions"><button id="fr-adopt" class="primary">✓ ADOPTAR LA RECOMENDACIÓN</button><p class="dim small">Pasa a ser la programación vigente; los cambios de moldes y de fechas quedan en la planta y el gemelo los muestra.</p></div></div>
      </section>`
        : ""
    }`;
  $("fr-run-adelantar").onclick = () => runFractal({ scenario: "adelantar", order: { id: $<HTMLSelectElement>("fr-order").value, due: `${$<HTMLSelectElement>("fr-due").value}T${model.calendar.shifts.map((x) => x.end).sort().at(-1)}` } });
  $("fr-run-balancear").onclick = () => runFractal({ scenario: "balancear" });
  $("fr-run-falla").onclick = () => runFractal({ scenario: "falla" });
  $("fr-run-fijadas").onclick = () => runFractal({ scenario: "fijadas" });
  $("fr-run-cambios").onclick = () => runFractal({ scenario: "cambios" });
  // Cualquier opción se puede adoptar, no solo la recomendada: Fractal recomienda y la persona decide.
  const adoptOption = (id: string) => {
    setVigente(study!.options.find((o) => o.id === id)!.plan);
    current = vigente();
    proposal = null;
    study = null;
    tab = "gantt";
    render();
  };
  el.querySelectorAll<HTMLButtonElement>(".fr-pick").forEach((b) => (b.onclick = () => adoptOption(b.dataset.id!)));
  el.querySelectorAll<HTMLButtonElement>(".fr-see:not(.fr-pick)").forEach(
    (b) =>
      (b.onclick = () => {
        proposal = study!.options.find((o) => o.id === b.dataset.id)!.plan;
        tab = "gantt";
        render();
      }),
  );
  const adopt = document.getElementById("fr-adopt");
  if (adopt)
    adopt.onclick = () => adoptOption(study!.best);
}

// ------------------------------------------------------------------ arranque
document.querySelectorAll<HTMLButtonElement>(".aps-tabs [data-tab]").forEach((b) => (b.onclick = () => ((tab = b.dataset.tab!), render())));
$("aps-calc").onclick = () => openObjectivePicker();
$("aps-manual").onclick = () => {
  error = "";
  try {
    const fixed = fixedOf();
    proposal = manualPlan(modelNow(), portfolio(), baseManual, { now: now(), previous: fixed.length ? shown() : current, events: activeEvents(), fixed });
    clearEdit();
    tab = "gantt";
  } catch (err) {
    error = (err as Error).message;
  }
  render();
};
onChange((what) => {
  current = vigente();
  if (what === "view") {
    // El gemelo eligió: "vigente" muestra la vigente en el APS; "escenario" muestra el escenario visto.
    viewVigente = viewMode() === "vigente";
    if (!viewVigente && !proposal) proposal = viewedPlan();
    lastView = proposal?.plan_id ?? "";
  }
  if (what === "events") error = "";
  render();
});
addEventListener("resize", () => render());
setInterval(() => ($("aps-clock").textContent = `AHORA · ${when(now())}`), 30000);
render();
