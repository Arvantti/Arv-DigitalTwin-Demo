/**
 * Centro de control de la planta de plásticos (control.html): recibe las señales de los PLC de todas las máquinas y
 * muestra la planta en números. OEE de la planta y de cada máquina en el turno, la orden y el lote que corre en cada
 * una, su ocupación contra su disponibilidad en la semana, y las alarmas que llegan del emulador. No manda ni programa nada: la programación es del APS.
 *
 * Por ahora las señales salen del gemelo (programación vigente + eventos del emulador, ver plant-state.ts).
 */
import "./styles.css";
import "./aps.css";
import "./control.css";
import { events, model, onChange, onClock, sharedClock, shownClockText, shownNow, SOURCE_NAMES, useDemoDays, vigente } from "./aps-store.ts";
import { eventsAt, dayLoads, dayStrip, loadAt, loadColor, machineAt, machineLabel, minOf, moldOf, oeeAt, PLC_MACHINES, plantOee, STATE_COLORS, STATE_NAMES, unitsUntil, type MachineState } from "./plant-state.ts";
import { COLOR_NAMES, day, esc, nf, when } from "./schedule.ts";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const pct = (x: number) => `${nf(x * 100, 1)} %`;
const oeeClass = (x: number) => (x >= 0.85 ? "ok" : x >= 0.65 ? "warn" : "bad");
/** Gauge de 270° (0–100 %) con marcas en 65 % y 85 %, los umbrales de color. */
function gauge(v: number | undefined, label: string, cls = ""): string {
  const pt = (f: number, r: number) => {
    const a = ((135 + 270 * f) * Math.PI) / 180;
    return `${(50 + r * Math.cos(a)).toFixed(2)} ${(50 + r * Math.sin(a)).toFixed(2)}`;
  };
  const val = v === undefined ? 0 : Math.max(0, Math.min(1, v));
  const tick = (f: number) => `<line class="g-tick" x1="${pt(f, 34).split(" ")[0]}" y1="${pt(f, 34).split(" ")[1]}" x2="${pt(f, 46).split(" ")[0]}" y2="${pt(f, 46).split(" ")[1]}"/>`;
  return `<div class="cc-gauge ${cls} ${v === undefined ? "neutral" : oeeClass(v)}"><svg viewBox="0 0 100 86" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${label} ${v === undefined ? "sin datos" : pct(v)}">
    <path class="g-track" d="M ${pt(0, 40)} A 40 40 0 1 1 ${pt(1, 40)}" pathLength="100"/>
    <path class="g-val" d="M ${pt(0, 40)} A 40 40 0 1 1 ${pt(1, 40)}" pathLength="100" stroke-dasharray="${(val * 100).toFixed(1)} 100"/>
    ${tick(0.65)}${tick(0.85)}
    <text class="g-num" x="50" y="53">${v === undefined ? "—" : nf(val * 100, 1)}<tspan font-size="9" dx="1">%</tspan></text>
    <text class="g-sub" x="50" y="66">${label}</text>
  </svg></div>`;
}
let plan = vigente();
/** Orden filtrada: con filtro, la ocupación de cada máquina cuenta solo las horas de esa orden. */
let order = new URLSearchParams(location.search).get("order") ?? "";

/** Órdenes con horas programadas en la semana que empieza hoy, para el filtro. */
function fillOrders(t: number): void {
  const sel = $<HTMLSelectElement>("cc-order");
  const from = Math.floor(t / 1440) * 1440;
  const ids = [...new Set(plan.schedule.filter((r) => minOf(r.end) > from && minOf(r.start) < from + 7 * 1440).map((r) => r.order))].sort();
  if (order && !ids.includes(order)) order = "";
  const opts = `<option value="">Todas las órdenes</option>${ids
    .map((id) => {
      const o = plan.orders.find((x) => x.id === id);
      return `<option value="${esc(id)}"${id === order ? " selected" : ""}>${esc(id)}${o ? ` · ${esc(o.customer)} · ${esc(o.product_name)}` : ""}</option>`;
    })
    .join("")}`;
  if (sel.dataset.key !== opts) {
    sel.innerHTML = opts;
    sel.dataset.key = opts;
  }
  sel.value = order;
}

useDemoDays();

function render(): void {
  const t = minOf(shownNow());
  const evs = events();
  fillOrders(t);
  const all = PLC_MACHINES.map((e) => ({ e, s: machineAt(plan, evs, e.id, t), o: oeeAt(plan, evs, e.id, t), ld: loadAt(plan, evs, e.id, t, 7, order || undefined) }));
  // Con una orden filtrada, solo las máquinas donde esa orden tiene horas en la semana.
  const states = order ? all.filter((x) => x.ld.busyH > 0) : all;
  const total = plantOee(states.map((x) => x.o));
  const count = (k: MachineState) => states.filter((x) => x.s.state === k).length;
  const units = states.reduce((s, x) => s + (x.o?.units ?? 0), 0);
  const good = states.reduce((s, x) => s + (x.o?.good ?? 0), 0);
  // Ocupación de la planta en la semana: horas programadas / horas disponibles de las máquinas con molde u orden.
  const loaded = order ? states : states.filter((x) => moldOf(x.e.id) || x.ld.busyH > 0);
  const availH = loaded.reduce((s, x) => s + x.ld.availH, 0);
  const busyH = loaded.reduce((s, x) => s + x.ld.busyH, 0);
  const shiftH = loaded.reduce((s, x) => s + x.ld.shiftH, 0);
  const running = [...new Set(states.map((x) => x.s.row?.order).filter(Boolean))];

  $("cc-plan").innerHTML = `PROGRAMACIÓN · <b>${esc(SOURCE_NAMES[plan.source])} ${esc(plan.plan_id)}</b>`;
  const active = eventsAt(evs, t);
  $("cc-alarms").hidden = !active.length;
  $("cc-alarms").innerHTML = active
    .map((e) => `<p><b>⚠ ALARMA · ${esc(machineLabel(e.equipment))} · ${e.kind === "falla" ? "FALLA" : "PARO DE EMERGENCIA"}</b> desde ${when(e.start)} · ${esc(e.reason)} · reparación estimada ${when(e.est_end)} · <a href="/aps.html?tab=gantt">replanear en el APS →</a></p>`)
    .join("");

  const stat = (l: string, v: string, cls = "") => `<div><small>${l}</small><b class="${cls}">${v}</b></div>`;
  $("cc-side").innerHTML = `<h2>OEE DE LA PLANTA · TURNO</h2>
    ${gauge(total?.oee, "OEE", "main")}
    <div class="cc-gauges3">${gauge(total?.availability, "DISPONIBILIDAD")}${gauge(total?.performance, "RENDIMIENTO")}${gauge(total?.quality, "CALIDAD")}</div>
    <div class="cc-stats">
      ${stat("Unidades buenas del turno", nf(good))}
      ${stat("Rechazo del turno", nf(units - good))}
      ${stat("Máquinas produciendo", `${count("run") + count("change")} / ${PLC_MACHINES.length}`, "ok")}
      ${stat("Fuera de servicio", String(count("fault")), count("fault") ? "bad" : "")}
      ${stat("Órdenes en curso", String(running.length))}
      ${stat(`${order ? `Ocupación de ${esc(order)}` : "Ocupación"} · semana`, availH ? pct(busyH / availH) : "—")}
      ${stat("Disponibilidad · semana", shiftH ? pct(availH / shiftH) : "—")}
    </div>`;

  // Primero las que tienen algo que decir: fallas, produciendo, paradas; las que no tienen molde ni orden al final.
  const rank: Record<MachineState, number> = { fault: 0, run: 1, change: 1, plan: 2, idle: 3, off: 4 };
  states.sort((a, b) => rank[a.s.state] - rank[b.s.state] || Number(!moldOf(a.e.id)) - Number(!moldOf(b.e.id)) || a.e.id.localeCompare(b.e.id));
  // Máquinas sin molde montado y sin orden: en reserva, en una sola línea.
  const reserve = order ? [] : states.filter((x) => !moldOf(x.e.id) && !x.s.row && x.s.state !== "fault");
  const shown = states.filter((x) => !reserve.includes(x));
  $("cc-grid").innerHTML = shown
    .map(({ e, s, o, ld }) => {
      const r = s.row;
      const ord = r ? plan.orders.find((x) => x.id === r.order) : undefined;
      const made = r ? unitsUntil(r, t) : 0;
      const bar = (x: number) => `<i style="width:${Math.max(0, Math.min(100, x * 100)).toFixed(1)}%"></i>`;
      const link = `/plant.html?plant=${model.plant}&select=${esc(e.id)}&focus=${esc(e.id)}`;
      return `<article class="cc-card ${s.state}" style="--st:${STATE_COLORS[s.state]}">
        <header><b><a href="${link}" title="Ver la máquina en el gemelo 3D">${esc(machineLabel(e.id))}</a></b><span class="cc-state">${STATE_NAMES[s.state]}</span></header>
        <p class="dim small">${e.params?.clamp_t ? `${nf(Number(e.params.clamp_t))} t · ` : ""}${moldOf(e.id) ? esc(moldOf(e.id)!) : e.type === "assembly_cell" ? "celda de ensamble" : "sin molde montado"}</p>
        ${
          r
            ? `<div class="cc-order"><b>${esc(r.order)}${ord ? ` · ${esc(ord.customer)}` : ""}</b><span>${esc(r.product)}${r.color ? ` · ${esc(COLOR_NAMES[r.color] ?? r.color)}` : ""} · lote ${r.batch ? `${r.batch[0]}/${r.batch[1]}` : "—"}</span>
              <div class="cc-bar">${bar(made / Math.max(1, r.quantity))}</div><small>${nf(made)} de ${nf(r.quantity)} ${esc(r.unit)} · termina ${when(r.end)}</small></div>`
            : s.ev
              ? `<div class="cc-order bad">${esc(s.ev.reason)}<small>hasta ${when(s.ev.est_end)}</small></div>`
              : `<div class="cc-order dim">${s.why ? esc(s.why) : "—"}</div>`
        }
        ${
          o
            ? `<div class="cc-oee" title="${nf(o.good)} buenas en el turno · ${nf(o.downH, 1)} h paradas"><div><small>OEE</small><b class="${oeeClass(o.oee)}">${pct(o.oee)}</b></div><div><small>D</small>${pct(o.availability)}</div><div><small>R</small>${pct(o.performance)}</div><div><small>C</small>${pct(o.quality)}</div></div>`
            : '<div class="cc-oee dim"><small>Sin carga en el turno</small></div>'
        }
        <div class="cc-load" title="Semana desde hoy: horas programadas sobre horas disponibles (turno menos paradas y fallas). Abajo, ocupación por día (%)">
          <div><small>${order ? "OCUPACIÓN ORDEN" : "OCUPACIÓN"} · SEM</small><b style="color:${loadColor(ld.occupancy)}">${pct(ld.occupancy)}</b></div>
          <div><small>DISPONIB. · SEM</small><b>${pct(ld.availability)}</b></div>
          <div class="cc-load-bar"><i class="av" style="width:${(ld.availability * 100).toFixed(1)}%"></i><i class="oc" style="width:${(ld.availability * Math.min(1, ld.occupancy) * 100).toFixed(1)}%;background:${loadColor(ld.occupancy)}"></i></div>
          <div class="cc-strip">${dayStrip(dayLoads(plan, evs, e.id, t, 7, order), t)}</div>
        </div>
      </article>`;
    })
    .join("") +
    (reserve.length
      ? `<article class="cc-card cc-reserve" style="--st:${STATE_COLORS.idle}"><header><b>EN RESERVA</b><span class="cc-state">${reserve.length} SIN MOLDE</span></header><p class="dim small" title="Inyectoras sin molde montado ni órdenes en la programación vigente. Fractal puede proponer montar un molde aquí.">Sin molde ni órdenes</p><p class="cc-chips">${reserve
          .map((x) => `<a href="/plant.html?plant=${model.plant}&select=${esc(x.e.id)}&focus=${esc(x.e.id)}" title="${x.e.params?.clamp_t ? `${nf(Number(x.e.params.clamp_t))} t` : ""}">${esc(machineLabel(x.e.id))}</a>`)
          .join("")}</p></article>`
      : "");
  layoutGrid();
}

/** Reparte las tarjetas en filas y columnas iguales que llenan el área, sin scroll: elige las columnas con las que cada tarjeta queda más holgada. */
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
    if (score > bestScore) { best = c; bestScore = score; }
  }
  g.style.gridTemplateColumns = `repeat(${best}, minmax(0, 1fr))`;
  g.style.gridTemplateRows = `repeat(${Math.ceil(n / best)}, minmax(0, 1fr))`;
}
window.addEventListener("resize", layoutGrid);

function tick(): void {
  $("cc-clock").textContent = `${sharedClock() ? "SIGUIENDO EL GEMELO" : "EN VIVO"} · ${day(shownNow())} ${shownClockText()}`;
}

$<HTMLSelectElement>("cc-order").onchange = (ev) => {
  order = (ev.target as HTMLSelectElement).value;
  const u = new URL(location.href);
  if (order) u.searchParams.set("order", order);
  else u.searchParams.delete("order");
  history.replaceState(null, "", u);
  render();
};
onChange(() => {
  plan = vigente();
  render();
});
let pending = false;
onClock(() => {
  tick();
  if (pending) return;
  pending = true;
  setTimeout(() => {
    pending = false;
    render();
  }, 250);
});
render();
tick();
setInterval(tick, 1000);
setInterval(render, 5000);
