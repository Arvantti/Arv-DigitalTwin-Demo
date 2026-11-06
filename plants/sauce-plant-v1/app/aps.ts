/**
 * APS de la planta de salsas: pedidos, Gantt por línea de proceso y por llenadora, y la comparación entre el plan
 * manual del planificador (APS-MAN-01) y el que calcula el cosimulador con HiGHS desde AHORA.
 *
 * La página arma todo dentro de `root`; la galería solo pone los estilos comunes (styles.css y aps.css) y la llama.
 * Parámetros de la URL: tab=orders|gantt, now=2026-11-04T10:00 (AHORA; por defecto el día 9 de la demo),
 * solve=1 (calcula al abrir), order=PED-… (resalta un pedido).
 */
import "./aps.css";
import { parseLocal, type ProductionPlan } from "@twin/cosim-core";
import { buildModel, type SauceModel } from "@plants/sauce-plant-v1-cosim/model.ts";
import { manualPlan } from "@plants/sauce-plant-v1-cosim/manual.ts";
import type { HighsLike } from "@plants/sauce-plant-v1-cosim/solve.ts";
import { demoManual, demoPortfolio, layoutEquipment, sauceData } from "./data.ts";
import { BULK_COLOR, compareKpis, DEMO_NOW, dayLabel, dayNumber, ganttSections, orderState, score, when, type Bar, type Lane } from "./view.ts";

const esc = (s: unknown) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const num = (x: number, d = 0) => x.toLocaleString("es-CO", { maximumFractionDigits: d, minimumFractionDigits: d });
const DAY = 1440;
const BULK_NAME: Record<string, string> = { "salsa-tomate": "tomate", "salsa-bbq": "BBQ", "salsa-picante": "picante", "mayonesa-light": "light", mayonesa: "mayonesa", "salsa-rosada": "rosada", "mostaza-granel": "mostaza" };

interface State {
  model: SauceModel;
  now: number;
  nowText: string;
  start: number;
  manual: ProductionPlan;
  vigente: ProductionPlan;
  propuesta: ProductionPlan | null;
  showing: "vigente" | "propuesta";
  tab: "orders" | "gantt";
  windowDays: 3 | 7 | 0;
  selected: string | null;
  busy: boolean;
  error: string | null;
}

export function mountSauceAps(root: HTMLElement): void {
  const url = new URLSearchParams(location.search);
  const model = buildModel(sauceData());
  const portfolio = demoPortfolio();
  const nowText = url.get("now") ? `${url.get("now")!.slice(0, 16)}${model.timezone}` : DEMO_NOW;
  const manual = { ...manualPlan(model, portfolio, demoManual()), status: "vigente" as const };
  const params = Object.fromEntries(layoutEquipment().map((e) => [e.id, e.params]));
  const st: State = {
    model,
    now: parseLocal(nowText),
    nowText,
    start: parseLocal(portfolio.plan_start),
    manual,
    vigente: manual,
    propuesta: null,
    showing: "vigente",
    tab: url.get("tab") === "gantt" ? "gantt" : "orders",
    windowDays: 7,
    selected: url.get("order"),
    busy: false,
    error: null,
  };
  const shown = () => (st.showing === "propuesta" && st.propuesta ? st.propuesta : st.vigente);

  root.innerHTML = `
    <header class="aps-top">
      <a class="aps-back" href="/plant.html?plant=sauce-plant-v1">← GEMELO 3D</a>
      <a class="aps-back" href="/">PORTAL</a>
      <div class="aps-title"><strong>APS</strong><span class="dim"> · programación detallada · planta de salsas</span></div>
      <div id="sa-vigente" class="aps-chip"></div>
      <div class="aps-clock">AHORA · ${esc(dayLabel(st.now, st.start))} · ${esc(nowText.slice(11, 16))}</div>
    </header>
    <nav class="aps-tabs" aria-label="Pantallas del APS">
      <button data-tab="orders">PEDIDOS</button>
      <button data-tab="gantt">PROGRAMACIÓN · GANTT</button>
      <span class="aps-spacer"></span>
      <button id="sa-calc" class="primary" title="Programa lineal por turnos (HiGHS) sobre las líneas de proceso, desde AHORA; lo anterior queda congelado">⚙ CALCULAR CON EL COSIMULADOR</button>
      <button id="sa-manual" title="Vuelve a la secuencia del planificador (APS-MAN-01): por orden de llegada, llenadoras alternas">✎ PLAN MANUAL</button>
    </nav>
    <section id="sa-proposal" class="aps-proposal" hidden></section>
    <main>
      <section id="sa-orders" class="aps-panel"></section>
      <section id="sa-gantt" class="aps-panel" hidden></section>
    </main>`;
  const $ = <T extends HTMLElement>(sel: string) => root.querySelector(sel) as T;

  function render() {
    root.querySelectorAll<HTMLButtonElement>(".aps-tabs [data-tab]").forEach((b) => b.classList.toggle("active", b.dataset.tab === st.tab));
    $("#sa-orders").hidden = st.tab !== "orders";
    $("#sa-gantt").hidden = st.tab !== "gantt";
    const calc = $<HTMLButtonElement>("#sa-calc");
    calc.disabled = st.busy;
    calc.textContent = st.busy ? "⚙ CALCULANDO…" : "⚙ CALCULAR CON EL COSIMULADOR";
    $("#sa-vigente").textContent = `VIGENTE · ${st.vigente.plan_id} · ${st.vigente.source === "manual" ? "manual" : "cosimulador"}`;
    renderProposal();
    if (st.tab === "orders") renderOrders();
    else renderGantt();
  }

  function renderProposal() {
    const box = $("#sa-proposal");
    if (st.error) {
      box.hidden = false;
      box.innerHTML = `<p class="bad"><b>No se pudo calcular:</b> ${esc(st.error)}</p>`;
      return;
    }
    const p = st.propuesta;
    if (!p) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    const deltas = compareKpis(st.vigente, p);
    const s0 = score(st.model, st.vigente);
    const s1 = score(st.model, p);
    const kpis = deltas
      .map((d) => `<div><small>${esc(d.label)}</small><span>${num(d.before, d.unit === "kg" ? 0 : d.unit ? 1 : 0)}${d.unit ? ` ${d.unit}` : ""}</span><b class="${d.better ? "ok" : d.worse ? "bad" : ""}">${num(d.after, d.unit === "kg" ? 0 : d.unit ? 1 : 0)}${d.unit ? ` ${d.unit}` : ""}</b></div>`)
      .join("");
    const sv = p.solver;
    box.innerHTML = `
      <div class="aps-prop-head">
        <div>
          <p><b>PROPUESTA ${esc(p.plan_id)}</b> · cosimulador desde AHORA (${esc(when(st.nowText))}); lo anterior queda como estaba.</p>
          <p class="dim small">${sv ? `HiGHS ${esc(sv.status)} · ${num(sv.variables)} variables · ${num(sv.constraints)} restricciones · ${num(sv.seconds, 2)} s` : ""} · puntaje ${num(s0, 1)} → <b class="${s1 < s0 ? "ok" : "bad"}">${num(s1, 1)}</b> (menor es mejor)</p>
          <div class="aps-scen">
            <button data-show="vigente" class="${st.showing === "vigente" ? "active" : ""}">VER VIGENTE</button>
            <button data-show="propuesta" class="${st.showing === "propuesta" ? "active" : ""}">VER PROPUESTA</button>
          </div>
        </div>
        <div class="aps-prop-kpis">${kpis}</div>
        <div class="aps-prop-actions">
          <button id="sa-approve" class="primary">✓ APROBAR</button>
          <button id="sa-discard">✕ DESCARTAR</button>
        </div>
      </div>`;
  }

  function renderOrders() {
    const plan = shown();
    const k = plan.kpis;
    const counts = { hecho: 0, "en curso": 0, "por hacer": 0 };
    for (const o of plan.orders) counts[orderState(o, st.now)]++;
    const cards = [
      [num(k.orders), "pedidos en la cartera"],
      [`${num(k.on_time_pct, 1)} %`, "a tiempo"],
      [num(k.late_orders), "pedidos tarde", k.late_orders ? "bad" : "ok"],
      [`${num(k.tardiness_h, 1)} h`, "atraso total"],
      [num(k.changeovers), "cambios en llenadoras"],
      [`${num(k.cip_h ?? 0, 1)} h`, "de CIP"],
      [`${num(k.waste_kg ?? 0)} kg`, "merma de granel"],
    ]
      .map(([b, s, cls]) => `<div class="aps-kpi"><b class="${cls ?? ""}">${b}</b><small>${s}</small></div>`)
      .join("");
    const rows = plan.orders
      .map((o) => {
        const state = orderState(o, st.now);
        const chip = state === "hecho" ? "done" : state === "en curso" ? "now" : "todo";
        const imp = o.importance === "alta" ? `<span class="chip late">ALTA</span>` : o.importance === "baja" ? `<span class="chip">baja</span>` : "";
        const sku = st.model.products[o.product];
        return `<tr class="${state === "hecho" ? "past" : ""}${o.id === st.selected ? " sel" : ""}" data-order="${esc(o.id)}">
          <td><b>${esc(o.id)}</b></td>
          <td>${esc(o.customer ?? "")}</td>
          <td><i class="dot" style="background:${BULK_COLOR[sku?.bulk ?? ""] ?? "#9ab"}"></i>${esc(o.product_name)}</td>
          <td class="num">${num(o.quantity)}</td>
          <td>${imp}</td>
          <td>${esc(when(o.created))}</td>
          <td>${esc(when(o.due))}</td>
          <td>${esc(when(o.completion))}</td>
          <td class="num ${o.late_h > 0 ? "bad" : ""}">${o.late_h > 0 ? `${num(o.late_h, 1)} h` : "—"}</td>
          <td><span class="chip ${o.late_h > 0 && state !== "hecho" ? "late" : chip}">${state.toUpperCase()}</span></td>
        </tr>`;
      })
      .join("");
    $("#sa-orders").innerHTML = `
      <div class="aps-orders-head">
        <p class="dim">${esc(plan.plan_id)} · ${plan.source === "manual" ? "secuencia del planificador por orden de llegada" : "cosimulador (HiGHS)"} · ${counts.hecho} hechos, ${counts["en curso"]} en curso y ${counts["por hacer"]} por hacer en AHORA. Clic en un pedido para verlo en el Gantt.</p>
        ${cards}
      </div>
      <div class="aps-table-wrap">
        <table class="route-table aps-table sa-orders">
          <thead><tr><th>Pedido</th><th>Cliente</th><th>Producto</th><th class="num">Unidades</th><th>Importancia</th><th>Llegó</th><th>Entrega</th><th>Termina</th><th class="num">Atraso</th><th>Estado</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  function renderGantt() {
    const plan = shown();
    const from = parseLocal(plan.from);
    const to = parseLocal(plan.to) + DAY;
    const a = st.windowDays ? Math.max(from, Math.floor(st.now / DAY) * DAY - DAY) : from;
    const b = st.windowDays ? Math.min(to, a + st.windowDays * DAY) : to;
    const pct = (t: number) => `${(((Math.min(b, Math.max(a, t)) - a) / (b - a)) * 100).toFixed(3)}%`;
    const width = (s: number, e: number) => `${(((Math.min(b, e) - Math.max(a, s)) / (b - a)) * 100).toFixed(3)}%`;
    const cal = st.model.calendar;
    let days = "";
    let off = "";
    for (let d = Math.floor(a / DAY) * DAY; d < b; d += DAY) {
      const work = cal.isWorkday(d);
      days += `<div class="g-day${work ? "" : " off"}" style="left:${pct(d)};width:${width(d, d + DAY)}">${esc(dayLabel(d, st.start))}</div>`;
      // Fuera de turno: de 22:00 a 06:00 y el domingo entero.
      const spans = work ? cal.spans : [];
      let t = d;
      for (const [s, e] of [...spans].sort((x, y) => x[0] - y[0])) {
        if (d + s > t) off += `<div class="g-off" style="left:${pct(t)};width:${width(t, d + s)}"></div>`;
        t = d + e;
      }
      if (t < d + DAY) off += `<div class="g-off" style="left:${pct(t)};width:${width(t, d + DAY)}"></div>`;
      off += `<div class="g-line" style="left:${pct(d)}"></div>`;
    }
    const nowMark = st.now >= a && st.now <= b ? `<div class="g-now" style="left:${pct(st.now)}"><span>AHORA</span></div>` : "";
    const bar = (x: Bar) => {
      if (x.end <= a || x.start >= b) return "";
      const coPct = x.end > x.start ? Math.min(100, (100 * Math.min(x.changeoverMin, x.end - x.start)) / (x.end - x.start)) : 0;
      const cls = ["g-bar", "sa-bar", x.end <= st.now ? "done" : "", x.late ? "late" : "", st.selected && x.order !== st.selected ? "dim" : "", x.order === st.selected ? "sel" : "", x.changeoverKind ? `co-${x.changeoverKind}` : ""].filter(Boolean).join(" ");
      return `<div class="${cls}" data-order="${esc(x.order)}" title="${esc(x.title)}" style="left:${pct(x.start)};width:${width(x.start, x.end)};--c:${x.color};--co:${coPct.toFixed(2)}%"><span>${esc(x.text)}</span></div>`;
    };
    const lane = (l: Lane) => {
      const busy = plan.equipment[l.id]?.busy_pct;
      const downs = l.down.filter((d) => d.end > a && d.start < b).map((d) => `<div class="g-down" title="${esc(`${d.reason} · ${when(new Date(d.start * 60000).toISOString())} a ${when(new Date(d.end * 60000).toISOString())}`)}" style="left:${pct(d.start)};width:${width(d.start, d.end)}"></div>`).join("");
      return `<div class="g-row res"><div class="g-label"><b>${esc(l.label)}${busy !== undefined ? ` <span class="dim">${num(busy, 0)} %</span>` : ""}</b><small title="${esc(l.sub)}">${esc(l.sub)}</small></div><div class="g-track">${downs}${l.bars.map(bar).join("")}</div></div>`;
    };
    const sections = ganttSections(st.model, plan, params)
      .map((s) => `<div class="g-section-title">${esc(s.title)}</div>${s.lanes.map(lane).join("")}`)
      .join("");
    const sel = st.selected ? plan.orders.find((o) => o.id === st.selected) : null;
    const selText = sel
      ? `<p class="sa-sel"><b>${esc(sel.id)}</b> · ${esc(sel.customer ?? "")} · ${num(sel.quantity)} u de ${esc(sel.product_name)} · entrega ${esc(when(sel.due))} · termina ${esc(when(sel.completion))}${sel.late_h > 0 ? ` · <span class="bad">${num(sel.late_h, 1)} h tarde</span>` : ` · <span class="ok">a tiempo</span>`} <button id="sa-unsel">✕</button></p>`
      : "";
    const legend = `
      ${Object.entries(BULK_NAME).map(([b, n]) => `<span><i style="background:${BULK_COLOR[b]}"></i>${n}</span>`).join("")}
      <span><i class="sa-key co-alergeno"></i>CIP por alérgeno</span>
      <span><i class="sa-key co-cip"></i>CIP</span>
      <span><i class="sa-key co-receta"></i>receta</span>
      <span><i class="sa-key co-formato"></i>formato</span>
      <span><i class="sa-key co-boquillas"></i>boquillas</span>
      <span><i class="sa-key co-tanque"></i>pulmón</span>
      <span><i class="down"></i>parada</span>`;
    $("#sa-gantt").innerHTML = `
      <div class="g-toolbar">
        <span class="dim">${esc(plan.plan_id)} · ${plan.source === "manual" ? "plan manual" : "cosimulador"}</span>
        <span class="g-zoom">
          <button data-win="3" class="${st.windowDays === 3 ? "active" : ""}">3 DÍAS</button>
          <button data-win="7" class="${st.windowDays === 7 ? "active" : ""}">7 DÍAS</button>
          <button data-win="0" class="${st.windowDays === 0 ? "active" : ""}">TODO</button>
        </span>
        <div class="g-legend">${legend}</div>
      </div>
      ${selText}
      <div class="g-wrap sa-gantt">
        <div class="g-head"><div></div><div class="g-track">${days}</div></div>
        <div class="g-body">
          <div class="g-gridlayer"><div></div><div class="g-track">${off}${nowMark}</div></div>
          ${sections}
        </div>
      </div>
      <p class="dim small">Cada barra empieza con su cambio (rayado). En las líneas: cambio de receta al avanzar en el orden (de claro a oscuro, de suave a picante), CIP completo al devolverse y lavado del pulmón si se botó granel vencido. En las llenadoras: CIP por alérgeno, CIP corto o completo según el orden de las recetas, CIP de rutina cada ${num(st.model.cip.max_run_h)} h, cambio de formato y limpieza de boquillas cada ${num(st.model.nozzle.every_h)} h. Pasa el cursor por una barra para ver el detalle; clic para seguir el pedido.</p>`;
  }

  async function calculate() {
    if (st.busy) return;
    st.busy = true;
    st.error = null;
    render();
    try {
      const [{ default: highsLoader }, { default: wasmUrl }, { solve }] = await Promise.all([import("highs"), import("highs/runtime?url"), import("@plants/sauce-plant-v1-cosim/solve.ts")]);
      // Una instancia nueva por corrida: highs-js no garantiza resolver varias veces con la misma.
      const highs = (await highsLoader({ locateFile: () => wasmUrl })) as unknown as HighsLike;
      const n = Number(st.propuesta?.plan_id.match(/(\d+)$/)?.[1] ?? 0) + 1;
      st.propuesta = { ...solve(highs, st.model, portfolio, { now: st.nowText, previous: st.vigente, planId: `APS-SOL-${String(n).padStart(2, "0")}` }), status: "propuesta" };
      st.showing = "propuesta";
    } catch (err) {
      st.error = (err as Error).message ?? String(err);
    } finally {
      st.busy = false;
      render();
    }
  }

  root.addEventListener("click", (e) => {
    const el = e.target as HTMLElement;
    const tab = el.closest<HTMLElement>("[data-tab]")?.dataset.tab;
    if (tab === "orders" || tab === "gantt") {
      st.tab = tab;
      return render();
    }
    if (el.closest("#sa-calc")) return void calculate();
    if (el.closest("#sa-manual")) {
      Object.assign(st, { vigente: st.manual, propuesta: null, showing: "vigente", error: null });
      return render();
    }
    if (el.closest("#sa-approve") && st.propuesta) {
      Object.assign(st, { vigente: { ...st.propuesta, status: "vigente" }, propuesta: null, showing: "vigente" });
      return render();
    }
    if (el.closest("#sa-discard")) {
      Object.assign(st, { propuesta: null, showing: "vigente", error: null });
      return render();
    }
    const show = el.closest<HTMLElement>("[data-show]")?.dataset.show;
    if (show === "vigente" || show === "propuesta") {
      st.showing = show;
      return render();
    }
    const win = el.closest<HTMLElement>("[data-win]")?.dataset.win;
    if (win !== undefined) {
      st.windowDays = Number(win) as State["windowDays"];
      return render();
    }
    if (el.closest("#sa-unsel")) {
      st.selected = null;
      return render();
    }
    const order = el.closest<HTMLElement>("[data-order]")?.dataset.order;
    if (order) {
      const fromTable = st.tab === "orders";
      st.selected = st.selected === order && !fromTable ? null : order;
      if (fromTable) {
        st.tab = "gantt";
        // El Gantt se abre en la semana del pedido.
        const o = shown().orders.find((x) => x.id === order);
        if (o && st.windowDays && Math.abs(dayNumber(parseLocal(o.start), st.start) - dayNumber(st.now, st.start)) > 5) st.windowDays = 0;
      }
      render();
    }
  });

  render();
  if (url.get("solve") === "1") void calculate();
}
