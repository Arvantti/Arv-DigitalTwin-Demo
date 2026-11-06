/**
 * APS de la planta de salsas: pedidos, Gantt por línea de proceso y por llenadora, y la comparación entre el plan
 * manual del planificador (APS-MAN-01) y el que calcula el cosimulador con HiGHS desde AHORA.
 *
 * La página arma todo dentro de `root`; la galería solo pone los estilos comunes (styles.css y aps.css) y la llama.
 * La pestaña FRACTAL prueba escenarios (adelantar un pedido, menos CIP y merma, falla de un equipo): cada combinación de
 * palancas la coloca el cosimulador y Fractal recomienda la de menor puntaje; la persona decide si la adopta.
 *
 * La programación vigente y las fallas del emulador se comparten con el emulador y el centro de control (store.ts): lo
 * que se adopta aquí es lo que corre en la planta, y una falla declarada en el emulador aparece aquí como alarma.
 *
 * La pestaña CONFIGURACIÓN (config.ts) carga a mano los pedidos, las llenadoras de cada producto y la secuencia del
 * planificador, y guarda versiones; la que se usa en la planta reemplaza a la precargada en todas las pantallas.
 *
 * Parámetros de la URL: tab=orders|gantt|fractal|config, now=2026-11-04T10:00 (AHORA; por defecto el día 9 de la demo),
 * solve=1 (calcula al abrir), order=PED-… (resalta un pedido), reset=1 (vuelve al plan manual y sin fallas).
 */
import "./aps.css";
import { iso, parseLocal, type PlantEvent, type ProductionPlan } from "@twin/cosim-core";
import type { FractalStudy } from "@twin/fractal-core";
import { SCENARIO_NAMES, type SauceScenario, type StudyInput } from "@plants/sauce-plant-v1-fractal/study.ts";
import { buildModel, type SauceModel } from "@plants/sauce-plant-v1-cosim/model.ts";
import { manualPlan } from "@plants/sauce-plant-v1-cosim/manual.ts";
import type { HighsLike } from "@plants/sauce-plant-v1-cosim/solve.ts";
import { demoManual, demoPortfolio, layoutEquipment, sauceData } from "./data.ts";
import { activeConfig, activeEvents, events as storedEvents, onChange, resetDemo, savedVigente, setEvents, setVigente } from "./store.ts";
import { mountConfig } from "./config.ts";
import { BULK_COLOR, compareKpis, DEMO_NOW, dayLabel, dayNumber, failureCandidates, ganttSections, movableOrders, orderState, score, studyKpis, when, type Bar, type Lane } from "./view.ts";

const esc = (s: unknown) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const num = (x: number, d = 0) => x.toLocaleString("es-CO", { maximumFractionDigits: d, minimumFractionDigits: d });
const DAY = 1440;
const sourceName = (p: ProductionPlan) => (p.source === "manual" ? "manual" : p.source === "fractal" ? "Fractal" : "cosimulador");
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
  tab: "orders" | "gantt" | "fractal" | "config";
  windowDays: 3 | 7 | 0;
  selected: string | null;
  busy: boolean;
  error: string | null;
  /** Fallas y paros del emulador (o simulados en la pestaña de Fractal): los usan Fractal y CALCULAR. */
  events: PlantEvent[];
  study: FractalStudy | null;
  studying: SauceScenario | null;
  studyError: string | null;
}

export function mountSauceAps(root: HTMLElement): void {
  const url = new URLSearchParams(location.search);
  // reset=1 antes de leer los datos: vuelve también a la configuración precargada.
  if (url.get("reset") === "1") resetDemo();
  const model = buildModel(sauceData());
  const portfolio = demoPortfolio();
  const nowText = url.get("now") ? `${url.get("now")!.slice(0, 16)}${model.timezone}` : DEMO_NOW;
  const manual = { ...manualPlan(model, portfolio, demoManual()), status: "vigente" as const };
  const cfg = activeConfig();
  const params = Object.fromEntries(layoutEquipment().map((e) => [e.id, e.params]));
  const st: State = {
    model,
    now: parseLocal(nowText),
    nowText,
    start: parseLocal(portfolio.plan_start),
    manual,
    vigente: savedVigente(portfolio.portfolio_id) ?? manual,
    propuesta: null,
    showing: "vigente",
    tab: (["gantt", "fractal", "config"] as const).find((t) => t === url.get("tab")) ?? "orders",
    windowDays: 7,
    selected: url.get("order"),
    busy: false,
    error: null,
    events: storedEvents(),
    study: null,
    studying: null,
    studyError: null,
  };
  const shown = () => (st.showing === "propuesta" && st.propuesta ? st.propuesta : st.vigente);

  root.innerHTML = `
    <header class="aps-top">
      <a class="aps-back" href="/plant.html?plant=sauce-plant-v1">← GEMELO 3D</a>
      <a class="aps-back" href="/">PORTAL</a>
      <div class="aps-title"><strong>APS</strong><span class="dim"> · programación detallada · planta de salsas</span></div>
      <div id="sa-vigente" class="aps-chip"></div>${cfg ? `<div class="aps-chip cf-chip-top" title="Configuración de datos activa">DATOS · ${esc(cfg.name)}</div>` : ""}
      <div class="aps-clock">AHORA · ${esc(dayLabel(st.now, st.start))} · ${esc(nowText.slice(11, 16))}</div>
    </header>
    <nav class="aps-tabs" aria-label="Pantallas del APS">
      <button data-tab="orders">PEDIDOS</button>
      <button data-tab="gantt">PROGRAMACIÓN · GANTT</button>
      <button data-tab="fractal">◆ FRACTAL · ESCENARIOS</button>
      <button data-tab="config">⚙ CONFIGURACIÓN</button>
      <span class="aps-spacer"></span>
      <button id="sa-calc" class="primary" title="Programa lineal por turnos (HiGHS) sobre las líneas de proceso, desde AHORA; lo anterior queda congelado">⚙ CALCULAR CON EL COSIMULADOR</button>
      <button id="sa-manual" title="Vuelve a la secuencia del planificador (APS-MAN-01): por orden de llegada, llenadoras alternas">✎ PLAN MANUAL</button>
    </nav>
    <section id="sa-alarm" class="aps-alarm" hidden></section>
    <section id="sa-proposal" class="aps-proposal" hidden></section>
    <main>
      <section id="sa-orders" class="aps-panel"></section>
      <section id="sa-gantt" class="aps-panel" hidden></section>
      <section id="sa-fractal" class="aps-panel" hidden></section>
      <section id="sa-config" class="aps-panel" hidden></section>
    </main>`;
  const $ = <T extends HTMLElement>(sel: string) => root.querySelector(sel) as T;
  const config = mountConfig($("#sa-config"), {
    now: st.now,
    start: st.start,
    activated: () => {
      // Se rearma con los datos de la versión activada, en su plan manual.
      const u = new URL(location.href);
      u.searchParams.set("tab", "orders");
      u.searchParams.delete("reset");
      location.href = u.toString();
    },
  });

  function render() {
    root.querySelectorAll<HTMLButtonElement>(".aps-tabs [data-tab]").forEach((b) => b.classList.toggle("active", b.dataset.tab === st.tab));
    $("#sa-orders").hidden = st.tab !== "orders";
    $("#sa-gantt").hidden = st.tab !== "gantt";
    $("#sa-fractal").hidden = st.tab !== "fractal";
    $("#sa-config").hidden = st.tab !== "config";
    const calc = $<HTMLButtonElement>("#sa-calc");
    calc.disabled = st.busy;
    calc.textContent = st.busy ? "⚙ CALCULANDO…" : "⚙ CALCULAR CON EL COSIMULADOR";
    $("#sa-vigente").textContent = `VIGENTE · ${st.vigente.plan_id} · ${sourceName(st.vigente)}`;
    renderAlarm();
    renderProposal();
    if (st.tab === "orders") renderOrders();
    else if (st.tab === "gantt") renderGantt();
    else if (st.tab === "config") config.render();
    else renderFractal();
  }

  /** Fallas del emulador vigentes en AHORA: la planta cambió y la programación vigente ya no se puede cumplir igual. */
  function renderAlarm() {
    const box = $("#sa-alarm");
    const list = activeEvents(st.now, st.events);
    box.hidden = !list.length;
    box.innerHTML = list
      .map((e) => `<p><b>⚠ ALARMA DEL EMULADOR · ${esc(e.equipment)} · ${e.kind === "falla" ? "FALLA" : "PARO DE EMERGENCIA"}</b> desde ${esc(when(e.start))} · ${esc(e.reason)} · reparación estimada ${esc(when(e.est_end))}. La vigente no la tiene en cuenta: <button data-tab="fractal" class="fr-see">◆ ESTUDIAR EN FRACTAL</button> o calcula con el cosimulador.</p>`)
      .join("");
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
          <p><b>PROPUESTA ${esc(p.plan_id)}</b> · ${p.source === "fractal" ? `Fractal · ${esc((p.notes?.[0] ?? "").replace(/^Fractal · /, "").replace(/\.$/, ""))}` : "cosimulador"} desde AHORA (${esc(when(st.nowText))}); lo anterior queda como estaba.</p>
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
        <p class="dim">${esc(plan.plan_id)} · ${plan.source === "manual" ? (cfg ? "secuencia del planificador (configuración manual)" : "secuencia del planificador por orden de llegada") : plan.source === "fractal" ? "escenario de Fractal" : "cosimulador (HiGHS)"} · ${counts.hecho} hechos, ${counts["en curso"]} en curso y ${counts["por hacer"]} por hacer en AHORA. Clic en un pedido para verlo en el Gantt.</p>
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
        <span class="dim">${esc(plan.plan_id)} · ${sourceName(plan)}</span>
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
      st.propuesta = { ...solve(highs, st.model, portfolio, { now: st.nowText, previous: st.vigente, events: st.events, planId: `APS-SOL-${String(n).padStart(2, "0")}` }), status: "propuesta" };
      st.showing = "propuesta";
    } catch (err) {
      st.error = (err as Error).message ?? String(err);
    } finally {
      st.busy = false;
      render();
    }
  }

  // ---------------------------------------------------------------- Fractal
  const newHighs = async () => {
    const [{ default: highsLoader }, { default: wasmUrl }] = await Promise.all([import("highs"), import("highs/runtime?url")]);
    return (await highsLoader({ locateFile: () => wasmUrl })) as unknown as HighsLike;
  };
  let studies = 0;

  async function study(input: Omit<StudyInput, "portfolio" | "now" | "previous" | "events" | "studyId">) {
    if (st.studying) return;
    st.studying = input.scenario;
    st.studyError = null;
    render();
    try {
      const { runStudy } = await import("@plants/sauce-plant-v1-fractal/study.ts");
      studies += 1;
      st.study = await runStudy(newHighs, st.model, { ...input, portfolio, now: st.nowText, previous: st.vigente, events: st.events, studyId: `FRA-${String(studies).padStart(2, "0")}` });
    } catch (err) {
      st.studyError = (err as Error).message ?? String(err);
    } finally {
      st.studying = null;
      render();
    }
  }

  function renderFractal() {
    const v = st.vigente;
    const movable = movableOrders(v, st.now);
    const ev = activeEvents(st.now, st.events)[0];
    const fail = failureCandidates(st.model);
    const d0 = Math.floor(st.now / DAY) * DAY;
    const dueClose = st.model.calendar.shifts.map((x) => x.end).sort().at(-1) ?? "22:00";
    const dayOpts = [1, 2, 3, 4, 5].map((n) => {
      const t = d0 + n * DAY;
      return `<option value="${iso(t, st.model.timezone).slice(0, 10)}">${esc(dayLabel(t, st.start))}</option>`;
    });
    const busy = st.studying !== null;
    const card = (key: SauceScenario, n: number, body: string, button: string, extra = "") =>
      `<article class="fr-card${st.study?.scenario === key ? " active" : ""}${extra}"><div class="fr-card-h"><span class="fr-n">${n}</span><span>${esc(SCENARIO_NAMES[key].toUpperCase())}</span></div><div class="fr-card-b">${body}</div>${button}</article>`;
    const run = (key: SauceScenario, ok = true) => `<button data-study="${key}" class="primary"${ok && !busy ? "" : " disabled"}>${st.studying === key ? "◌ ESTUDIANDO…" : "◆ ESTUDIAR"}</button>`;
    const s = st.study;
    const best = s ? s.options.find((o) => o.id === s.best)! : null;
    const fmt = (x: number, unit: string) => `${num(x, unit === "kg" ? 0 : unit ? 1 : 0)}${unit ? ` ${unit}` : ""}`;
    const deltaTxt = (d: { before: number; after: number; unit: string; better: boolean; worse: boolean }) =>
      d.better || d.worse ? `<span class="fr-d ${d.better ? "good" : "bad"}">${d.after > d.before ? "▲" : "▼"} ${fmt(Math.abs(d.after - d.before), d.unit)}</span>` : `<span class="fr-d same">igual</span>`;
    const loads = (st2: FractalStudy) => {
      const b = st2.options.find((o) => o.id === st2.best)!;
      return Object.keys(b.loads)
        .sort((x, y) => (b.loads[y] ?? 0) - (b.loads[x] ?? 0))
        .map((m) => {
          const a = st2.baseline.loads[m] ?? 0;
          const c = b.loads[m] ?? 0;
          const ch = Math.round(a) !== Math.round(c);
          return `<div class="fr-load${ch ? " changed" : ""}"><span>${esc(m)}</span><div class="fr-bars"><i class="was" style="width:${Math.min(100, a)}%"></i><i class="${c > 85 ? "hot" : ""}" style="width:${Math.min(100, c)}%"></i></div><b>${ch ? `${num(a)} → ${num(c)} %` : `${num(c)} %`}</b></div>`;
        })
        .join("");
    };
    $("#sa-fractal").innerHTML = `
      <div class="fr-head"><div><h2 class="fr-title">◆ Fractal · escenarios</h2><p class="fr-intro">Fractal prueba cambios en cómo se organiza la planta (campañas de recetas por día, recetas pequeñas cada 2 o 3 días, llenadoras multipropósito dedicadas, prioridad de un pedido). El cosimulador coloca cada combinación y Fractal la califica con el puntaje de la planta: atraso, pedidos tarde, horas de CIP, otros cambios y merma. <b>Fractal recomienda; la persona decide.</b></p></div></div>
      <div class="fr-cards">
        ${card("adelantar", 1, `<p class="fr-desc">Un cliente pide su pedido antes. ¿Cómo cumplirle sin atrasar a los demás?</p>
          <label>Pedido <select id="fr-order">${movable.map((o) => `<option value="${esc(o.id)}">${esc(o.id)} · ${esc(o.product_name)} · ${num(o.quantity)} u · entrega ${esc(dayLabel(parseLocal(o.due), st.start))}</option>`).join("")}</select></label>
          <label>Nueva entrega (cierre del turno, ${esc(dueClose)}) <select id="fr-due">${dayOpts.join("")}</select></label>`, run("adelantar", movable.length > 0))}
        ${card("limpiezas", 2, `<p class="fr-desc">La vigente tiene <b>${num(v.kpis.cip_h ?? 0, 1)} h de CIP</b> y <b>${num(v.kpis.waste_kg ?? 0)} kg de merma</b>. ¿Cómo lavar menos y botar menos salsa sin atrasar pedidos?</p>`, run("limpiezas"))}
        ${card("falla", 3, ev
          ? `<p class="fr-desc"><b class="bad">⚠ ${esc(ev.equipment)}</b> fuera de servicio desde ${esc(when(ev.start))} · ${esc(ev.reason)} · reparación estimada ${esc(when(ev.est_end))}. ¿Qué conviene mientras lo reparan? <button id="fr-clear" class="fr-see">✕ QUITAR LA FALLA</button></p>`
          : `<p class="fr-desc">Declara la falla en el <a href="/emulador-salsas.html">emulador</a> o simúlala aquí en AHORA. La falla llega también al centro de control y la tiene en cuenta CALCULAR.</p>
          <label>Equipo <select id="fr-eq">${fail.map((f) => `<option value="${esc(f.id)}">${esc(f.label)}</option>`).join("")}</select></label>
          <label>Reparación estimada <select id="fr-hours">${[6, 12, 24, 48, 60].map((h) => `<option value="${h}"${h === 60 ? " selected" : ""}>en ${h} h de calendario</option>`).join("")}</select></label>`,
          run("falla"), ev ? " alarm" : "")}
      </div>
      ${st.studying ? `<p class="fr-status"><span class="spin">◌</span> Fractal está probando combinaciones para «${esc(SCENARIO_NAMES[st.studying].toLowerCase())}»: cada una la coloca el cosimulador…</p>` : ""}
      ${st.studyError ? `<p class="fr-status bad">${esc(st.studyError)}</p>` : ""}
      ${s && best ? `<section class="fr-result">
        <div class="fr-result-h"><span class="fr-tag">ESTUDIO ${esc(s.study_id)} · ${esc(SCENARIO_NAMES[s.scenario as SauceScenario].toUpperCase())}</span><span class="fr-tag dim">${s.options.length} combinaciones en ${num(s.seconds, 1)} s</span></div>
        <p class="fr-q">${esc(s.question)}</p>
        <div class="fr-reco">
          <div class="fr-reco-t"><div class="fr-k">RECOMENDACIÓN · OPCIÓN ${esc(best.id.split("-").at(-1)!)}</div><p class="fr-rec">${esc(best.label)}</p><p class="fr-why">${esc(s.recommendation.replace(/^Recomendación:[^.]*\.\s*/i, ""))}</p>
            <button id="fr-adopt" class="primary" data-pick="${esc(best.id)}">✓ ADOPTAR LA RECOMENDACIÓN</button><p class="fr-note">Pasa a ser la programación vigente. Puntaje ${num(score(st.model, v), 1)} → ${num(best.score, 1)} (menor es mejor).</p></div>
          <div class="fr-kpis">${studyKpis(s.baseline.kpis, best.kpis).map((d) => `<div class="fr-kpi"><div class="fr-k">${esc(d.label)}</div><div class="fr-v"><s>${fmt(d.before, d.unit)}</s><span>→</span><b>${fmt(d.after, d.unit)}</b></div>${deltaTxt(d)}</div>`).join("")}</div>
        </div>
        <div class="fr-k fr-sub">TODAS LAS OPCIONES · cualquiera se puede ver en el Gantt o adoptar</div>
        <div class="aps-table-wrap"><table class="route-table aps-table fr-table sa-fr-table">
          <thead><tr><th>Opción</th><th>Qué cambia</th><th class="num">Tarde</th><th class="num">Atraso</th><th class="num">CIP</th><th class="num">Otros cambios</th><th class="num">Merma</th><th>Carga máxima</th><th class="num">Puntaje</th><th></th></tr></thead>
          <tbody>
            <tr class="past"><td>VIGENTE</td><td>${esc(sourceName(v))} ${esc(s.baseline.plan_id)}</td>${studyKpis(s.baseline.kpis, s.baseline.kpis).map((d) => `<td class="num">${fmt(d.before, d.unit)}</td>`).join("")}<td>${esc(s.baseline.max_load.equipment)} ${num(s.baseline.max_load.pct)} %</td><td class="num">${num(score(st.model, v), 1)}</td><td></td></tr>
            ${s.options.map((o) => `<tr class="${o.id === s.best ? "best" : ""}"><td><b class="fr-opt">${esc(o.id.split("-").at(-1)!)}</b>${o.id === s.best ? ' <span class="chip done">MEJOR</span>' : ""}</td><td><b>${esc(o.label)}</b><br/><small>${o.levers.map((l) => esc(l.text)).join(" · ")}</small></td>${studyKpis(s.baseline.kpis, o.kpis).map((d) => `<td class="num">${fmt(d.after, d.unit)}<br/>${deltaTxt(d)}</td>`).join("")}<td>${esc(o.max_load.equipment)} ${num(o.max_load.pct)} %</td><td class="num">${num(o.score, 1)}</td><td class="fr-btns"><button class="fr-see" data-see="${esc(o.id)}">VER EN GANTT</button><button class="fr-see fr-pick" data-pick="${esc(o.id)}">ADOPTAR</button></td></tr>`).join("")}
          </tbody></table></div>
        <div class="fr-k fr-sub">OCUPACIÓN · próximos 7 días · <span class="fr-leg was">vigente</span> <span class="fr-leg now">opción ${esc(best.id.split("-").at(-1)!)}</span> · las líneas de proceso cuentan sus marmitas como una</div>
        <div class="fr-loads">${loads(s)}</div>
      </section>` : ""}`;
  }

  root.addEventListener("click", (e) => {
    const el = e.target as HTMLElement;
    const tab = el.closest<HTMLElement>("[data-tab]")?.dataset.tab;
    if (tab === "orders" || tab === "gantt" || tab === "fractal" || tab === "config") {
      st.tab = tab;
      return render();
    }
    if (el.closest("#sa-calc")) return void calculate();
    const scenario = el.closest<HTMLElement>("[data-study]")?.dataset.study as SauceScenario | undefined;
    if (scenario === "adelantar") return void study({ scenario, order: { id: $<HTMLSelectElement>("#fr-order").value, due: `${$<HTMLSelectElement>("#fr-due").value}T${st.model.calendar.shifts.map((x) => x.end).sort().at(-1)}` } });
    if (scenario === "limpiezas") return void study({ scenario });
    if (scenario === "falla") {
      if (!activeEvents(st.now, st.events).length) {
        const eq = $<HTMLSelectElement>("#fr-eq").value;
        const hours = Number($<HTMLSelectElement>("#fr-hours").value);
        const ev: PlantEvent = { contract: "plant-event.v1", id: `EV-${String(st.events.length + 1).padStart(3, "0")}`, plant: st.model.plant, equipment: eq, kind: "falla", reason: "Falla simulada en el APS", start: st.nowText, est_end: iso(st.now + hours * 60, st.model.timezone) };
        st.events = [ev, ...st.events];
        setEvents(st.events);
      }
      return void study({ scenario });
    }
    if (el.closest("#fr-clear")) {
      // La falla vuelve a servicio en AHORA (como RESTABLECER en el emulador).
      const live = new Set(activeEvents(st.now, st.events).map((e) => e.id));
      st.events = st.events.map((e) => (live.has(e.id) ? { ...e, cleared: st.nowText } : e));
      setEvents(st.events);
      st.study = st.study?.scenario === "falla" ? null : st.study;
      return render();
    }
    const see = el.closest<HTMLElement>("[data-see]")?.dataset.see;
    if (see && st.study) {
      Object.assign(st, { propuesta: { ...st.study.options.find((o) => o.id === see)!.plan }, showing: "propuesta", tab: "gantt" });
      return render();
    }
    const pick = el.closest<HTMLElement>("[data-pick]")?.dataset.pick;
    if (pick && st.study) {
      // Cualquier opción se puede adoptar, no solo la recomendada: Fractal recomienda y la persona decide.
      Object.assign(st, { vigente: { ...st.study.options.find((o) => o.id === pick)!.plan, status: "vigente" }, propuesta: null, showing: "vigente", study: null, tab: "gantt" });
      setVigente(st.vigente);
      return render();
    }
    if (el.closest("#sa-manual")) {
      Object.assign(st, { vigente: st.manual, propuesta: null, showing: "vigente", error: null, study: null });
      setVigente(null);
      return render();
    }
    if (el.closest("#sa-approve") && st.propuesta) {
      Object.assign(st, { vigente: { ...st.propuesta, status: "vigente" }, propuesta: null, showing: "vigente" });
      setVigente(st.vigente);
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

  // Otra pantalla adoptó una programación o el emulador declaró o restableció una falla; otra ventana activó otra
  // configuración de datos (la pantalla se vuelve a armar con ella).
  onChange((what) => {
    if (what === "config" && (activeConfig()?.id ?? null) !== (cfg?.id ?? null)) return location.reload();
    if (what === "plan") st.vigente = savedVigente(portfolio.portfolio_id) ?? st.manual;
    if (what === "events") st.events = storedEvents();
    if (what !== "clock") render();
  });

  render();
  if (url.get("solve") === "1") void calculate();
}
