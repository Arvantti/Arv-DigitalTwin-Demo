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
 *
 * El estado se comparte con el gemelo 3D por aps-store.ts (mismo navegador).
 */
import "./styles.css";
import "./aps.css";
import type { CustomerOrder, Importance, ProductionPlan } from "@twin/cosim/core/contracts.ts";
import { addedOrders, baseManual, manualPlan, model, now, onChange, portfolio, resetDemo, setAdded, setVigente, SOURCE_NAMES, vigente } from "./aps-store.ts";
import { COLOR_NAMES, day, esc, nf, when } from "./schedule.ts";

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
let tab = new URLSearchParams(location.search).get("tab") === "gantt" ? "gantt" : "orders";
let selected: string | null = null;
let viewFrom = ms(`${now().slice(0, 10)}T00:00`) - 2 * DAY_MS;
let running = "";
let error = "";
let formMsg = "";
let worker: Worker | null = null;
let runId = 0;

const shown = () => proposal ?? current;

function render(): void {
  const p = shown();
  $("aps-clock").textContent = `AHORA · ${when(now())}`;
  $("aps-vigente").innerHTML = `VIGENTE · <b>${esc(SOURCE_NAMES[current.source])} ${esc(current.plan_id)}</b> · ${nf(current.kpis.on_time_pct, 1)} % a tiempo`;
  document.querySelectorAll<HTMLButtonElement>(".aps-tabs [data-tab]").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  $("tab-orders").hidden = tab !== "orders";
  $("tab-gantt").hidden = tab !== "gantt";
  $("aps-calc").toggleAttribute("disabled", !!running);
  renderProposal();
  if (tab === "orders") renderOrders(p);
  else renderGantt(p);
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
  const s = proposal.solver;
  const cell = (a: number, b: number, fmt: (x: number) => string, lowerIsBetter: boolean) =>
    `<span>${fmt(a)}</span><b class="${a === b ? "" : (b < a) === lowerIsBetter ? "ok" : "bad"}">${fmt(b)}</b>`;
  el.hidden = false;
  el.innerHTML = `
    <div class="aps-prop-head">
      <div><div class="label">PROPUESTA · ${esc(SOURCE_NAMES[proposal.source])} ${esc(proposal.plan_id)}</div>
      <p class="dim small">${s ? `Colocación lineal con HiGHS: ${s.status === "Optimal" ? "óptima" : esc(s.status)} en ${nf(s.seconds, 1)} s, ${nf(s.variables)} variables y ${nf(s.constraints)} restricciones. ` : ""}${proposal.frozen_until ? `Replaneada desde ${when(proposal.frozen_until)}: lo que ya empezó no cambia.` : ""} ${proposal.notes?.map(esc).join(" ") ?? ""}</p></div>
      <div class="aps-prop-kpis">
        <div><small>A tiempo</small>${cell(v.on_time_pct, k.on_time_pct, (x) => `${nf(x, 1)} %`, false)}</div>
        <div><small>Pedidos tarde</small>${cell(v.late_orders, k.late_orders, (x) => nf(x), true)}</div>
        <div><small>Atraso total</small>${cell(v.tardiness_h, k.tardiness_h, (x) => `${nf(x, 1)} h`, true)}</div>
        <div><small>Cambios de color</small>${cell(v.changeovers, k.changeovers, (x) => nf(x), true)}</div>
      </div>
      <div class="aps-prop-actions"><button id="aps-adopt" class="primary">✓ ADOPTAR COMO VIGENTE</button><button id="aps-discard">✕ DESCARTAR</button></div>
    </div>`;
  $("aps-adopt").onclick = () => {
    setVigente(proposal!);
    current = vigente();
    proposal = null;
    render();
  };
  $("aps-discard").onclick = () => {
    proposal = null;
    render();
  };
}

function calculate(): void {
  error = "";
  running = "El cosimulador está colocando la producción con restricciones lineales…";
  render();
  worker?.terminate();
  worker = new Worker(new URL("./aps-worker.ts", import.meta.url), { type: "module" });
  const id = ++runId;
  const n = Number((current.plan_id.match(/SOL-(\d+)/) ?? [])[1] ?? 0) + 1;
  worker.onmessage = (e: MessageEvent<{ id: number; ok: boolean; plan?: ProductionPlan; error?: string }>) => {
    if (e.data.id !== id) return;
    running = "";
    if (e.data.ok) proposal = e.data.plan!;
    else error = `El cosimulador no pudo programar: ${e.data.error}`;
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
  worker.postMessage({ id, portfolio: portfolio(), now: now(), previous: current, planId: `APS-SOL-${String(n).padStart(2, "0")}` });
}

// ------------------------------------------------------------------ pedidos
function stateChips(p: ProductionPlan, id: string): string {
  const row = p.orders.find((x) => x.id === id);
  if (!row) return '<span class="chip">SIN PROGRAMAR</span>';
  const t = now();
  const st = row.completion.slice(0, 16) <= t ? ["done", "ENTREGADO"] : row.start.slice(0, 16) <= t ? ["now", "EN PRODUCCIÓN"] : ["todo", "PROGRAMADO"];
  return `<span class="chip ${st[0]}">${st[1]}</span>${row.late_h > 0 ? `<span class="chip late">TARDE ${nf(row.late_h, 1)} h</span>` : ""}`;
}

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
      <label>Entrega <input id="f-due" type="date" min="${plus(1)}" max="${plus(model.windowDays)}" value="${plus(Math.min(5, model.windowDays))}" /></label>
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
    const due = $<HTMLInputElement>("f-due").value;
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
    head += `<div class="g-day${work ? "" : " off"}" style="${span(d0, d0 + DAY_MS)}">${WEEKDAYS[date.getUTCDay()]} ${day(isoOf(d0))}</div>`;
    if (!work) grid += `<div class="g-off" style="${span(d0, d0 + DAY_MS)}"></div>`;
    else {
      const a = d0 + spans[0][0] * 60000;
      const b = d0 + spans[spans.length - 1][1] * 60000;
      grid += `<div class="g-off" style="${span(d0, a)}"></div><div class="g-off" style="${span(b, d0 + DAY_MS)}"></div>`;
    }
    grid += `<div class="g-line" style="left:${pct(d0)}"></div>`;
  }
  const nowLine = t >= from && t <= to ? `<div class="g-now" style="left:${pct(t)}"><span>AHORA</span></div>` : "";

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
      return `<div class="g-row${o.id === selected ? " sel" : ""}" data-order="${esc(o.id)}">
        <div class="g-label"><b>${esc(o.id)}</b><small>${esc(o.product_name)} · ${nf(o.quantity)} ${esc(o.unit)} · ${esc(o.customer)}</small></div>
        <div class="g-track">
          <div class="g-bar${late ? " late" : ""}${b <= t ? " done" : ""}" style="${span(a, b)};--c:${color}" title="${esc(o.id)}: ${when(o.start)} → ${when(o.completion)}${late ? ` · ${nf(o.late_h, 1)} h tarde` : ""}">
            <span>${when(o.start)} → ${when(o.completion)}</span></div>
          ${due >= from && due <= to ? `<div class="g-due${late ? " late" : ""}" style="left:${pct(due)}" title="Entrega ${when(o.due)}"></div>` : ""}
        </div></div>`;
    })
    .join("");

  // Abajo: recursos con los lotes de esas órdenes.
  const visible = new Set(orders.map((o) => o.id));
  const machines = model.machines;
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
          const tip = `${esc(r.order)} · ${esc(r.product)}${r.color ? ` · ${esc(COLOR_NAMES[r.color] ?? r.color)}` : ""} · lote ${r.batch ? `${r.batch[0]} de ${r.batch[1]}` : "—"} · ${nf(r.quantity)} u · ${when(r.start)} → ${when(r.end)}${r.changeover_min ? ` · cambio de color ${nf(r.changeover_min)} min` : ""}`;
          // Un lote que cruza la noche o el domingo se dibuja solo en las horas de turno.
          const parts = workParts(a / 60000, b / 60000);
          return parts
            .map((x, i) => {
              const co = i === 0 ? Math.min(100, ((r.changeover_min * 60000) / Math.max(1, (x.end - x.start) * 60000)) * 100) : 0;
              return `<div class="g-lot${dim}" style="${span(x.start * 60000, x.end * 60000)};--c:${PRODUCT_COLORS[r.product] ?? "#888"};--co:${co.toFixed(1)}%" data-order="${esc(r.order)}" title="${tip}"></div>`;
            })
            .join("");
        })
        .join("");
      const downs = p.downtime
        .filter((d) => d.equipment === m && inView(ms(d.start), ms(d.end)))
        .map((d) => `<div class="g-down" style="${span(ms(d.start), ms(d.end))}" title="Parada: ${esc(d.reason)} · ${when(d.start)} → ${when(d.end)}"></div>`)
        .join("");
      return `<div class="g-row res"><div class="g-label"><b>${esc((MACHINE_NAMES[m] ?? m).toUpperCase())}</b><small>${esc(machineProducts(m))} · carga ${load} %</small></div><div class="g-track">${downs}${bars}</div></div>`;
    })
    .join("");

  const legend = Object.entries(PRODUCT_COLORS)
    .map(([id, c]) => `<span><i style="background:${c}"></i>${esc(productName(id))}</span>`)
    .join("");
  el.innerHTML = `
    <div class="g-toolbar">
      <button id="g-prev" title="Un día atrás">◀</button><button id="g-today">HOY</button><button id="g-next" title="Un día adelante">▶</button>
      <span class="dim small">${day(isoOf(from))} a ${day(isoOf(to - DAY_MS))} · mostrando ${proposal ? "la PROPUESTA" : "la VIGENTE"} ${esc(p.plan_id)} · ${orders.length} órdenes</span>
      <span class="g-legend">${legend}<span><i class="hatch"></i>cambio de color</span><span><i class="down"></i>parada</span></span>
    </div>
    <div class="g-wrap">
      <div class="g-section-title">ÓRDENES DE PRODUCCIÓN</div>
      <div class="g-head"><div class="g-label"></div><div class="g-track">${head}</div></div>
      <div class="g-scroll"><div class="g-body g-orders"><div class="g-gridlayer"><div class="g-label"></div><div class="g-track">${grid}${nowLine}</div></div>${orderRows || '<p class="dim small">Sin órdenes en estos días.</p>'}</div></div>
      <div class="g-section-title">RECURSOS · lotes de las órdenes de arriba${selected ? ` · resaltada ${esc(selected)}` : ""}</div>
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
        selected = selected === n.dataset.order ? null : n.dataset.order!;
        render();
      }),
  );
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
  return [...ids].map((id) => productName(id)).join(", ");
}

// ------------------------------------------------------------------ arranque
document.querySelectorAll<HTMLButtonElement>(".aps-tabs [data-tab]").forEach((b) => (b.onclick = () => ((tab = b.dataset.tab!), render())));
$("aps-calc").onclick = () => calculate();
$("aps-manual").onclick = () => {
  error = "";
  try {
    proposal = manualPlan(model, portfolio(), baseManual, { now: now(), previous: current });
    tab = "gantt";
  } catch (err) {
    error = (err as Error).message;
  }
  render();
};
onChange(() => {
  current = vigente();
  render();
});
addEventListener("resize", () => render());
setInterval(() => ($("aps-clock").textContent = `AHORA · ${when(now())}`), 30000);
render();
