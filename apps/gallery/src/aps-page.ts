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
import type { CustomerOrder, Importance, ProductionPlan } from "@twin/cosim/core/contracts.ts";
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

if (new URLSearchParams(location.search).get("reset") === "1") resetDemo();

let proposal: ProductionPlan | null = null;
let current = vigente();
const TABS = ["orders", "gantt", "insumos", "fractal"];
let tab = TABS.find((x) => x === new URLSearchParams(location.search).get("tab")) ?? "orders";
let selected: string | null = null;
let viewFrom = ms(`${now().slice(0, 10)}T00:00`) - 2 * DAY_MS;
let running = "";
let error = "";
let formMsg = "";
let worker: Worker | null = null;
let runId = 0;

const shown = () => proposal ?? current;

useDemoDays();

/** Lo que el APS muestra como propuesta es el escenario que ve el gemelo, hasta que el gemelo vuelva a "vigente". */
let lastView = "";
function syncView(): void {
  const key = proposal?.plan_id ?? "";
  if (key === lastView) return;
  lastView = key;
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
    el.innerHTML = `<p><span class="spin">◌</span> ${esc(running)}</p>`;
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
  el.innerHTML = `
    <div class="aps-prop-head">
      <div><div class="label">PROPUESTA · ${esc(SOURCE_NAMES[proposal.source])} ${esc(proposal.plan_id)}</div>
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
  $("aps-adopt").onclick = () => {
    setVigente(proposal!);
    current = vigente();
    proposal = null;
    clearEdit();
    render();
  };
  $("aps-discard").onclick = () => {
    proposal = null;
    clearEdit();
    render();
  };
}

function calculate(): void {
  error = "";
  running = fixedOf().length
    ? `El cosimulador está organizando el resto de la producción sin mover ${fixedOf().length === 1 ? "el pedido fijado" : `los ${fixedOf().length} pedidos fijados`}…`
    : "El cosimulador está colocando la producción con restricciones lineales…";
  render();
  worker?.terminate();
  worker = new Worker(new URL("./aps-worker.ts", import.meta.url), { type: "module" });
  const id = ++runId;
  const n = Number((current.plan_id.match(/SOL-(\d+)/) ?? [])[1] ?? 0) + 1;
  worker.onmessage = (e: MessageEvent<{ id: number; ok: boolean; plan?: ProductionPlan; error?: string }>) => {
    if (e.data.id !== id) return;
    running = "";
    if (e.data.ok) {
      proposal = e.data.plan!;
      clearEdit();
    } else error = `El cosimulador no pudo programar: ${e.data.error}`;
    worker?.terminate();
    worker = null;
    tab = "gantt";
    render();
  };
  worker.onerror = (e) => {
    running = "";
    error = `El cosimulador no pudo arrancar: ${e.message}`;
    render();
  };
  // Con pedidos fijados se parte del plan que se está viendo: ahí están sus lotes, que no se mueven.
  const fixed = fixedOf();
  worker.postMessage({ id, portfolio: portfolio(), now: now(), previous: fixed.length ? shown() : current, planId: `APS-SOL-${String(n).padStart(2, "0")}`, events: activeEvents(), molds: molds(), fixed });
}

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

function renderOrders(p: ProductionPlan): void {
  const el = $("tab-orders");
  const t = now();
  const plus = (n: number) => new Date(ms(`${t.slice(0, 10)}T00:00`) + n * DAY_MS).toISOString().slice(0, 10);
  const byDue = (a: CustomerOrder, b: CustomerOrder) => (a.due < b.due ? -1 : a.due > b.due ? 1 : a.id.localeCompare(b.id));
  const isPending = (o: CustomerOrder) => o.due.slice(0, 16) >= t;
  // Primero lo que falta por entregar; lo entregado queda al final.
  const pending = portfolio().orders.filter(isPending).sort(byDue);
  const all = [...pending, ...portfolio().orders.filter((o) => !isPending(o)).sort(byDue)];
  const products = Object.values(model.products);
  const inPlan = new Set(p.orders.map((o) => o.id));
  const missing = all.filter((o) => !inPlan.has(o.id)).length;
  el.innerHTML = `
    <div class="aps-orders-head">
      <div class="aps-kpi"><b>${all.length}</b><small>pedidos en la cartera</small></div>
      <div class="aps-kpi"><b>${pending.length}</b><small>por entregar desde hoy</small></div>
      <div class="aps-kpi"><b>${addedOrders().length}</b><small>agregados en esta pantalla</small></div>
      <div class="aps-kpi"><b class="${missing ? "warn" : ""}">${missing}</b><small>sin programar${missing ? " · pulsa CALCULAR" : ""}</small></div>
      <p class="dim small">Ventana de entrega de ${model.windowDays} días. Clientes, cantidades y fechas inventados. Dos turnos de 8 h, lunes a sábado.</p>
    </div>
    <div class="aps-add">
      <div class="label">AGREGAR PEDIDO</div>
      <label>Cliente <input id="f-customer" list="f-customers" placeholder="Nombre del cliente" /></label>
      <datalist id="f-customers">${model.customers.map((c) => `<option value="${esc(c)}"></option>`).join("")}</datalist>
      <label>Producto <select id="f-product">${products.map((x) => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join("")}</select></label>
      <label>Color <select id="f-color"></select></label>
      <label>Cantidad <input id="f-qty" type="number" min="1" step="1" /></label>
      <label>Entrega <select id="f-due">${dayOptions(plus, 1, model.windowDays, Math.min(5, model.windowDays))}</select></label>
      <label>Importancia <select id="f-imp">${IMPORTANCE.map(([v, l]) => `<option value="${v}"${v === "normal" ? " selected" : ""}>${l}</option>`).join("")}</select></label>
      <button id="f-add" class="primary">＋ AGREGAR</button>
      <span id="f-msg" class="small">${formMsg}</span>
    </div>
    <div class="aps-table-wrap"><table class="route-table aps-table">
      <thead><tr><th>Pedido</th><th>Cliente</th><th>Producto</th><th>Color</th><th class="num">Cantidad</th><th>Llegó</th><th>Entrega</th><th>Importancia</th><th>Estado</th><th></th></tr></thead>
      <tbody>${all
        .map((o) => {
          const prod = model.products[o.product];
          return `<tr class="${o.added ? "added" : ""}${o.due.slice(0, 16) < t ? " past" : ""}">
            <td><b>${esc(o.id)}</b></td><td>${esc(o.customer)}</td>
            <td><span class="dot" style="background:${PRODUCT_COLORS[o.product] ?? "#888"}"></span>${esc(prod?.name ?? o.product)}</td>
            <td>${o.color ? esc(COLOR_NAMES[o.color] ?? o.color) : "—"}</td>
            <td class="num">${nf(o.quantity)} ${esc(prod?.unit ?? "u")}</td>
            <td>${when(o.created)}</td><td><b>${day(o.due)}</b> ${o.due.slice(11, 16)}</td>
            <td><span class="imp imp-${o.importance}">${esc(o.importance.toUpperCase())}</span></td>
            <td>${stateChips(p, o.id)}</td>
            <td>${o.added ? `<button class="f-del" data-id="${esc(o.id)}" title="Quitar este pedido">✕</button>` : ""}</td>
          </tr>`;
        })
        .join("")}</tbody></table></div>`;
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
  el.querySelectorAll<HTMLButtonElement>(".f-del").forEach(
    (b) =>
      (b.onclick = () => {
        setAdded(addedOrders().filter((o) => o.id !== b.dataset.id));
        formMsg = "";
        render();
      }),
  );
}

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
          <div class="g-bar${late ? " late" : ""}${b <= t ? " done" : ""}${movable ? " drag" : ""}${isFixed ? " fixed" : ""}" data-move-order="${esc(o.id)}" style="${span(a, b)};--c:${color}" title="${esc(o.id)}: ${when(o.start)} → ${when(o.completion)}${late ? ` · ${nf(o.late_h, 1)} h tarde` : ""}${isFixed ? " · FIJADA" : movable ? " · arrástrala para moverla en el tiempo" : ""}">
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
  const resRows = machines
    .map((m) => {
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
      const info = u ? `${esc(selected!)}: ${u.lots} ${u.lots === 1 ? "lote" : "lotes"} · ${nf(u.h, 1)} h` : `${esc(machineProducts(m))} · carga ${load} %`;
      return `<div class="g-row res${cls}" data-machine="${esc(m)}"><div class="g-label"><b>${esc((MACHINE_NAMES[m] ?? m).toUpperCase())}</b><small>${info}</small></div><div class="g-track">${downs}${bars}</div></div>`;
    })
    .join("");

  const legend = Object.entries(PRODUCT_COLORS)
    .map(([id, c]) => `<span><i style="background:${c}"></i>${esc(productName(id))}</span>`)
    .join("");
  el.innerHTML = `
    <div class="g-toolbar">
      <button id="g-prev" title="Un día atrás">◀</button><button id="g-today">HOY</button><button id="g-next" title="Un día adelante">▶</button>
      <span class="dim small">${day(isoOf(from))} a ${day(isoOf(to - DAY_MS))} · mostrando ${proposal ? "la PROPUESTA" : "la VIGENTE"} ${esc(p.plan_id)} · ${orders.length} órdenes</span>
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
      <div class="g-section-title">${selected ? `RECURSOS DE ${esc(selected)} · ${usedBy.size} ${usedBy.size === 1 ? "máquina" : "máquinas"} arriba, resaltadas; el resto atenuado · clic de nuevo en la orden para quitar` : "RECURSOS · lotes de las órdenes de arriba · clic en una orden o en un lote para ver sus máquinas"}</div>
      <div class="g-body g-res"><div class="g-gridlayer"><div class="g-label"></div><div class="g-track">${grid}${nowLine}</div></div>${resRows}</div>
    </div>`;
  // La primera vez se abre en la primera orden que aún no termina.
  const scroller = el.querySelector<HTMLElement>(".g-scroll")!;
  const firstOpen = orders.find((o) => ms(o.completion) > t);
  const row = firstOpen && scroller.querySelector<HTMLElement>(`.g-row[data-order="${firstOpen.id}"]`);
  scroller.scrollTop = keep ?? (row ? row.offsetTop - 4 : 0);
  $("g-prev").onclick = () => ((viewFrom -= DAY_MS), render());
  $("g-next").onclick = () => ((viewFrom += DAY_MS), render());
  $("g-today").onclick = () => ((viewFrom = ms(`${now().slice(0, 10)}T00:00`) - 2 * DAY_MS), render());
  el.querySelectorAll<HTMLElement>("[data-order]").forEach(
    (n) =>
      (n.onclick = (e) => {
        e.stopPropagation();
        if (suppressClick) return;
        selected = selected === n.dataset.order ? null : n.dataset.order!;
        render();
      }),
  );
  el.querySelectorAll<HTMLButtonElement>("[data-lock]").forEach(
    (b) =>
      (b.onclick = (e) => {
        e.stopPropagation();
        toggleFixed(b.dataset.lock!);
      }),
  );
  $("g-undo").onclick = () => undo();
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
$("aps-calc").onclick = () => calculate();
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
    // El gemelo eligió: "vigente" quita la propuesta; "escenario" muestra el escenario visto.
    if (viewMode() === "vigente") proposal = null;
    else if (!proposal) proposal = viewedPlan();
    lastView = proposal?.plan_id ?? "";
  }
  if (what === "events") error = "";
  render();
});
addEventListener("resize", () => render());
setInterval(() => ($("aps-clock").textContent = `AHORA · ${when(now())}`), 30000);
render();
