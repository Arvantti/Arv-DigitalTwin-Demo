/**
 * Centro de control de la planta de salsas (control-salsas.html): recibe las señales de los PLC de todos los equipos
 * y muestra la planta en números. OEE de la planta y de cada equipo en el turno, la tanda o el llenado que corre en
 * cada uno con su avance y sus valores de proceso, la limpieza en curso (CIP, alérgeno, boquillas), la ocupación de
 * la semana contra la disponibilidad, y las alarmas que llegan del emulador. No manda ni programa nada: la
 * programación es del APS.
 *
 * Por ahora las señales salen del gemelo: programación vigente + eventos del emulador (plant-state.ts, store.ts).
 */
import "./aps.css";
import { iso, parseLocal, type ProductionPlan } from "@twin/cosim-core";
import { buildModel } from "@plants/sauce-plant-v1-cosim/model.ts";
import { manualPlan } from "@plants/sauce-plant-v1-cosim/manual.ts";
import { demoManual, demoPortfolio, layoutEquipment, sauceData } from "./data.ts";
import { CHANGE_NAMES, dayLoads, doneOf, equipmentAt, eventsAt, loadColor, oeeAt, plantOee, plcEquipment, signals, STATE_COLORS, STATE_NAMES, weekLoad, type EqState } from "./plant-state.ts";
import { activeConfig, events, onChange, savedVigente, sharedClock, shownNow } from "./store.ts";
import { dayLabel, when } from "./view.ts";

const esc = (s: unknown) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const num = (x: number, d = 0) => x.toLocaleString("es-CO", { maximumFractionDigits: d, minimumFractionDigits: d });
const pct = (x: number) => `${num(x * 100, 1)} %`;
const oeeClass = (x: number) => (x >= 0.85 ? "ok" : x >= 0.65 ? "warn" : "bad");
const LINE_NAMES: Record<string, string> = { "linea-caliente": "Línea caliente", "linea-fria": "Línea fría", "linea-mostaza": "Línea de mostaza" };
const SOURCE: Record<string, string> = { manual: "MANUAL", solver: "COSIMULADOR", fractal: "FRACTAL", reference: "REFERENCIA" };
const WEEKDAY = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

/** Gauge de 270° (0–100 %) con marcas en 65 % y 85 %, los umbrales de color (igual que en plásticos). */
function gauge(v: number | undefined, label: string, cls = ""): string {
  const pt = (f: number, r: number) => {
    const a = ((135 + 270 * f) * Math.PI) / 180;
    return [50 + r * Math.cos(a), 50 + r * Math.sin(a)].map((x) => x.toFixed(2));
  };
  const val = v === undefined ? 0 : Math.max(0, Math.min(1, v));
  const tick = (f: number) => `<line class="g-tick" x1="${pt(f, 34)[0]}" y1="${pt(f, 34)[1]}" x2="${pt(f, 46)[0]}" y2="${pt(f, 46)[1]}"/>`;
  const arc = `M ${pt(0, 40).join(" ")} A 40 40 0 1 1 ${pt(1, 40).join(" ")}`;
  return `<div class="cc-gauge ${cls} ${v === undefined ? "neutral" : oeeClass(v)}"><svg viewBox="0 0 100 86" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${label} ${v === undefined ? "sin datos" : pct(v)}">
    <path class="g-track" d="${arc}" pathLength="100"/>
    <path class="g-val" d="${arc}" pathLength="100" stroke-dasharray="${(val * 100).toFixed(1)} 100"/>
    ${tick(0.65)}${tick(0.85)}
    <text class="g-num" x="50" y="53">${v === undefined ? "—" : num(val * 100, 1)}<tspan font-size="9" dx="1">%</tspan></text>
    <text class="g-sub" x="50" y="66">${label}</text>
  </svg></div>`;
}

export function mountSauceControl(root: HTMLElement): void {
  const model = buildModel(sauceData());
  const portfolio = demoPortfolio();
  const manual: ProductionPlan = { ...manualPlan(model, portfolio, demoManual()), status: "vigente" };
  const start = parseLocal(portfolio.plan_start);
  const tz = model.timezone;
  const EQ = plcEquipment(model, layoutEquipment());
  // Tarjetas: los equipos donde corre la producción y la caldera (da vapor a toda la línea caliente); el resto del apoyo
  // va en una tarjeta de servicios.
  const CARDS = EQ.filter((q) => q.role !== "apoyo" || q.type === "fire_tube_boiler");
  const SUPPORT = EQ.filter((q) => !CARDS.includes(q));
  let plan = savedVigente(portfolio.portfolio_id) ?? manual;
  let list = events();

  root.innerHTML = `
    <header class="aps-top">
      <a class="aps-back" href="/plant.html?plant=sauce-plant-v1">← GEMELO 3D</a>
      <a class="aps-back" href="/aps-salsas.html">APS</a>
      <a class="aps-back" href="/emulador-salsas.html">EMULADOR</a>
      <div class="aps-title"><strong>CENTRO DE CONTROL</strong><span class="dim"> · señales de los PLC de todos los equipos · planta de salsas</span></div>
      <div id="cc-plan" class="aps-chip"></div>
      <div id="cc-clock" class="aps-clock">—</div>
    </header>
    <section id="cc-alarms" class="aps-alarm" hidden></section>
    <main class="cc-body">
      <aside id="cc-side" class="cc-side"></aside>
      <div id="cc-grid" class="cc-grid"></div>
    </main>`;
  const $ = <T extends HTMLElement>(id: string) => root.querySelector(`#${id}`) as T;

  const strip = (loads: ReturnType<typeof dayLoads>, t: number) =>
    `<div class="shift-strip">${loads
      .map((x) => {
        const occ = Math.round(x.occupancy * 100);
        const av = Math.round(x.availability * 100);
        const d = new Date(x.from * 60000);
        const tag = `${WEEKDAY[d.getUTCDay()]} ${d.getUTCDate()}`;
        return `<div class="ss-day${t >= x.from && t < x.to ? " now" : ""}" title="${tag}: ocupación ${occ} % (${num(x.busyH, 1)} de ${num(x.availH, 1)} h) · disponibilidad ${av} %"><span class="ss-cell"><i class="av" style="height:${av}%"></i><i class="oc" style="height:${(av * Math.min(1, x.occupancy)).toFixed(0)}%;background:${loadColor(x.occupancy)}"></i></span><b>${occ}</b><small>${tag}</small></div>`;
      })
      .join("")}</div>`;

  function render(): void {
    const nowText = shownNow(tz);
    const t = parseLocal(nowText);
    $("cc-clock").textContent = `${sharedClock() ? "SIGUIENDO EL GEMELO" : "AHORA"} · ${dayLabel(t, start)} · ${nowText.slice(11, 16)}`;
    $("cc-plan").innerHTML = `PROGRAMACIÓN · <b>${esc(SOURCE[plan.source] ?? plan.source)} ${esc(plan.plan_id)}</b>`;

    const active = eventsAt(list, t);
    $("cc-alarms").hidden = !active.length;
    $("cc-alarms").innerHTML = active
      .map((e) => {
        const line = Object.values(model.lines).find((l) => l.equipment.includes(e.equipment) || l.downWith.includes(e.equipment));
        return `<p><b>⚠ ALARMA · ${esc(e.equipment.toUpperCase())} · ${e.kind === "falla" ? "FALLA" : "PARO DE EMERGENCIA"}</b> desde ${esc(when(e.start))} · ${esc(e.reason)} · reparación estimada ${esc(when(e.est_end))}${line ? ` · detiene la ${esc((LINE_NAMES[line.id] ?? line.id).toLowerCase())}` : ""} · <a href="/aps-salsas.html?tab=fractal">replanear en el APS →</a></p>`;
      })
      .join("");

    const all = CARDS.map((q) => ({ q, s: equipmentAt(model, plan, list, q, t), o: oeeAt(model, plan, list, q, t), ld: weekLoad(model, plan, list, q, t) }));
    const prod = all.filter((x) => x.q.role !== "apoyo");
    const total = plantOee(prod.map((x) => x.o));
    const count = (k: EqState) => all.filter((x) => x.s.state === k).length;
    const fillers = prod.filter((x) => x.q.role === "llenadora");
    const units = fillers.reduce((s, x) => s + (x.o?.good ?? 0), 0);
    const kg = prod.filter((x) => x.q.role === "proceso").reduce((s, x) => s + (x.o?.good ?? 0), 0);
    const avail = prod.reduce((s, x) => s + x.ld.availH, 0);
    const busy = prod.reduce((s, x) => s + x.ld.busyH, 0);
    const shift = prod.reduce((s, x) => s + x.ld.shiftH, 0);
    const cleaning = all.filter((x) => x.s.state === "change" && /cip|alergeno/.test(x.s.change?.kind ?? "")).length;
    const stat = (l: string, v: string, cls = "") => `<div><small>${l}</small><b class="${cls}">${v}</b></div>`;
    $("cc-side").innerHTML = `<h2>OEE DE LA PLANTA · TURNO</h2>
      ${gauge(total?.oee, "OEE", "main")}
      <div class="cc-gauges3">${gauge(total?.availability, "DISPONIBILIDAD")}${gauge(total?.performance, "RENDIMIENTO")}${gauge(total?.quality, "CALIDAD")}</div>
      <div class="cc-stats">
        ${stat("Kilos cocinados buenos del turno", `${num(kg)} kg`)}
        ${stat("Sachets buenos del turno", num(units))}
        ${stat("Equipos produciendo", `${count("run")} / ${CARDS.length}`, "ok")}
        ${stat("En limpieza CIP", String(cleaning), cleaning ? "warn" : "")}
        ${stat("Detenidos", String(count("fault") + count("blocked")), count("fault") + count("blocked") ? "bad" : "")}
        ${stat("Ocupación · semana", avail ? pct(busy / avail) : "—")}
        ${stat("Disponibilidad · semana", shift ? pct(avail / shift) : "—")}
      </div>
      <p class="dim small">OEE: eficiencia general del equipo = disponibilidad × rendimiento × calidad. CIP: limpieza en sitio de tuberías y tanques entre recetas.</p>`;

    const rank: Record<EqState, number> = { fault: 0, blocked: 1, run: 2, change: 2, plan: 3, idle: 4, off: 5 };
    const order = (x: (typeof all)[number]) => rank[x.s.state];
    const cards = [...all].sort((a, b) => order(a) - order(b) || CARDS.indexOf(a.q) - CARDS.indexOf(b.q));
    const bar = (x: number) => `<i style="width:${Math.max(0, Math.min(100, x * 100)).toFixed(1)}%"></i>`;
    $("cc-grid").innerHTML =
      cards
        .map(({ q, s, o, ld }) => {
          const r = s.row;
          const ord = r ? plan.orders.find((x) => x.id === r.order) : undefined;
          const done = r ? doneOf(model, r, t) : 0;
          const isBatch = !!r?.batch_id && q.role !== "llenadora";
          const sig = signals(model, q, s, t, Math.floor(Date.now() / 5000)).slice(0, 2);
          const link = `/emulador-salsas.html?equipment=${esc(q.id)}`;
          const body = r
            ? `<div class="cc-order"><b>${esc(isBatch ? r.batch_id : r.order)}${!isBatch && ord ? ` · ${esc(ord.customer)}` : ""}</b><span>${esc(isBatch ? r.product : (ord?.product_name ?? r.product))}</span>
                ${s.change ? `<small class="warn">${esc(CHANGE_NAMES[s.change.kind] ?? s.change.kind)} hasta ${esc(when(iso(s.change.until, tz)))}</small>` : `<div class="cc-bar">${bar(done / Math.max(1, r.quantity))}</div><small>${num(done)} de ${num(r.quantity)} ${esc(r.unit)} · termina ${esc(when(r.end))}</small>`}</div>`
            : s.ev
              ? `<div class="cc-order bad">${s.state === "blocked" ? `Detenido por ${esc(s.ev.equipment)} · ${esc(s.ev.reason.toLowerCase())}` : esc(s.ev.reason)}<small>hasta ${esc(when(s.ev.est_end))}</small></div>`
              : `<div class="cc-order dim">${s.why ? esc(s.why) : "—"}</div>`;
          return `<article class="cc-card ${s.state}" style="--st:${STATE_COLORS[s.state]}">
            <header><b><a href="${link}" title="Ver el equipo en el emulador">${esc(q.id.toUpperCase())}</a></b><span class="cc-state">${STATE_NAMES[s.state]}</span></header>
            <p class="dim small">${esc(q.name)}${q.line ? ` · ${esc((LINE_NAMES[q.line] ?? q.line).toLowerCase())}` : ""}${sig.length ? ` · ${sig.map((x) => `${esc(x.label.toLowerCase())} ${num(x.value, x.digits ?? 0)} ${esc(x.unit)}`).join(" · ")}` : ""}</p>
            ${body}
            ${
              o
                ? `<div class="cc-oee" title="${num(o.good)} ${esc(o.unit)} buenos en el turno · ${num(o.changeH, 1)} h de cambios · ${num(o.downH, 1)} h detenido"><div><small>OEE</small><b class="${oeeClass(o.oee)}">${pct(o.oee)}</b></div><div><small>D</small>${pct(o.availability)}</div><div><small>R</small>${pct(o.performance)}</div><div><small>C</small>${pct(o.quality)}</div></div>`
                : '<div class="cc-oee dim"><small>Sin carga en el turno</small></div>'
            }
            ${
              q.role === "apoyo"
                ? ""
                : `<div class="cc-load" title="Semana desde hoy: horas programadas sobre horas disponibles (turno menos paradas y fallas). Abajo, ocupación por día (%)">
                <div><small>OCUPACIÓN · SEM</small><b style="color:${loadColor(ld.occupancy)}">${pct(ld.occupancy)}</b></div>
                <div><small>DISPONIB. · SEM</small><b>${pct(ld.availability)}</b></div>
                <div class="cc-load-bar"><i class="av" style="width:${(ld.availability * 100).toFixed(1)}%"></i><i class="oc" style="width:${(ld.availability * Math.min(1, ld.occupancy) * 100).toFixed(1)}%;background:${loadColor(ld.occupancy)}"></i></div>
                <div class="cc-strip">${strip(dayLoads(model, plan, list, q, t), t)}</div>
              </div>`
            }
          </article>`;
        })
        .join("") +
      `<article class="cc-card cc-reserve" style="--st:${STATE_COLORS.idle}"><header><b>APOYO DE LAS LÍNEAS</b><span class="cc-state">${SUPPORT.length} EQUIPOS</span></header><p class="dim small">Si uno falla, se detiene su línea.</p><p class="cc-chips">${SUPPORT.map((q) => {
        const s = equipmentAt(model, plan, list, q, t);
        return `<a href="/emulador-salsas.html?equipment=${esc(q.id)}" title="${esc(q.name)} · ${STATE_NAMES[s.state]}" style="border-color:${STATE_COLORS[s.state]};color:${STATE_COLORS[s.state]}">${esc(q.id.toUpperCase())}</a>`;
      }).join("")}</p></article>`;
    layoutGrid();
  }

  /** Reparte las tarjetas en filas y columnas iguales que llenan el área, sin scroll (igual que en plásticos). */
  function layoutGrid(): void {
    const g = $("cc-grid");
    const n = g.children.length;
    if (!n || window.matchMedia("(max-width: 900px)").matches) {
      g.style.gridTemplateColumns = g.style.gridTemplateRows = "";
      return;
    }
    const W = g.clientWidth, H = g.clientHeight, gap = 8, MIN_W = 190, MIN_H = 200;
    let best = 1, bestScore = -Infinity;
    for (let c = 1; c <= n; c++) {
      const r = Math.ceil(n / c);
      const score = Math.min((W - gap * (c - 1)) / c / MIN_W, (H - gap * (r - 1)) / r / MIN_H);
      if (score > bestScore) {
        best = c;
        bestScore = score;
      }
    }
    g.style.gridTemplateColumns = `repeat(${best}, minmax(0, 1fr))`;
    g.style.gridTemplateRows = `repeat(${Math.ceil(n / best)}, minmax(0, 1fr))`;
  }

  window.addEventListener("resize", layoutGrid);
  // Otra configuración de datos activada en el APS: la pantalla se vuelve a armar con ella.
  const cfgId = activeConfig()?.id ?? null;
  onChange((what) => {
    if (what === "config" && (activeConfig()?.id ?? null) !== cfgId) return location.reload();
    if (what === "plan") plan = savedVigente(portfolio.portfolio_id) ?? manual;
    if (what === "events") list = events();
    render();
  });
  render();
  // Los valores de proceso cambian minuto a minuto aunque el reloj de la demo esté quieto: se refrescan cada 5 s.
  setInterval(render, 5000);
}
