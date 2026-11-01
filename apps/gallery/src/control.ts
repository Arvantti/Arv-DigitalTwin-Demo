/**
 * Centro de control de la planta de plásticos (control.html): recibe las señales de los PLC de todas las máquinas y
 * muestra la planta en números. OEE de la planta y de cada máquina en el turno, la orden y el lote que corre en cada
 * una, su ocupación contra su disponibilidad en la semana, y las alarmas que llegan del emulador. No manda ni programa nada: la programación es del APS.
 *
 * Por ahora las señales salen del gemelo (programación vigente + eventos del emulador, ver plant-state.ts).
 */
import "./styles.css";
import "./aps.css";
import { events, model, now, onChange, SOURCE_NAMES, useDemoDays, vigente } from "./aps-store.ts";
import { eventsAt, dayLoads, dayStrip, loadAt, loadColor, machineAt, machineLabel, minOf, moldOf, oeeAt, PLC_MACHINES, plantOee, STATE_COLORS, STATE_NAMES, unitsUntil, type MachineState } from "./plant-state.ts";
import { COLOR_NAMES, esc, nf, when } from "./schedule.ts";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const pct = (x: number) => `${nf(x * 100, 1)} %`;
const oeeClass = (x: number) => (x >= 0.85 ? "ok" : x >= 0.65 ? "warn" : "bad");
const loadedAt = Date.now();
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
  const t = minOf(now());
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

  const kpi = (v: string, l: string, cls = "") => `<div class="aps-kpi"><b class="${cls}">${v}</b><small>${l}</small></div>`;
  $("cc-kpis").innerHTML = [
    kpi(total ? pct(total.oee) : "—", "OEE de la planta · turno", total ? oeeClass(total.oee) : ""),
    kpi(total ? pct(total.availability) : "—", "disponibilidad"),
    kpi(total ? pct(total.performance) : "—", "rendimiento"),
    kpi(total ? pct(total.quality) : "—", "calidad"),
    kpi(nf(good), `unidades buenas del turno · ${nf(units - good)} rechazo`),
    kpi(`${count("run") + count("change")} / ${PLC_MACHINES.length}`, "máquinas produciendo", "ok"),
    kpi(String(count("fault")), "fuera de servicio", count("fault") ? "bad" : ""),
    kpi(String(running.length), "órdenes en curso"),
    kpi(availH ? pct(busyH / availH) : "—", `${order ? `ocupación de ${esc(order)}` : "ocupación"} · semana · ${nf(busyH, 0)} de ${nf(availH, 0)} h`),
    kpi(shiftH ? pct(availH / shiftH) : "—", "disponibilidad · semana"),
  ].join("");

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
      const live = r && e.params?.cycle_s && s.state === "run" ? Math.floor(((Date.now() - loadedAt) / 1000 / Number(e.params.cycle_s)) * Number(e.params.cavities ?? 1)) : 0;
      const made = r ? Math.min(r.quantity, unitsUntil(r, t) + live) : 0;
      const bar = (x: number) => `<i style="width:${Math.max(0, Math.min(100, x * 100)).toFixed(1)}%"></i>`;
      return `<article class="cc-card ${s.state}" style="--st:${STATE_COLORS[s.state]}">
        <header><b>${esc(machineLabel(e.id))}</b><span class="cc-state">${STATE_NAMES[s.state]}</span></header>
        <p class="dim small">${e.params?.clamp_t ? `${nf(Number(e.params.clamp_t))} t · ` : ""}${moldOf(e.id) ? esc(moldOf(e.id)!) : e.type === "assembly_cell" ? "celda de ensamble" : "sin molde montado"}</p>
        ${
          r
            ? `<div class="cc-order"><b>${esc(r.order)}</b> ${ord ? `· ${esc(ord.customer)}` : ""}<br/><span>${esc(r.product)}${r.color ? ` · ${esc(COLOR_NAMES[r.color] ?? r.color)}` : ""} · lote ${r.batch ? `${r.batch[0]}/${r.batch[1]}` : "—"}</span>
              <div class="cc-bar">${bar(made / Math.max(1, r.quantity))}</div><small>${nf(made)} de ${nf(r.quantity)} ${esc(r.unit)} · termina ${when(r.end)}</small></div>`
            : s.ev
              ? `<div class="cc-order bad">${esc(s.ev.reason)}<br/><small>hasta ${when(s.ev.est_end)}</small></div>`
              : `<div class="cc-order dim">${s.why ? esc(s.why) : "—"}</div>`
        }
        ${
          o
            ? `<div class="cc-oee"><div><small>OEE</small><b class="${oeeClass(o.oee)}">${pct(o.oee)}</b></div><div><small>D</small>${pct(o.availability)}</div><div><small>R</small>${pct(o.performance)}</div><div><small>C</small>${pct(o.quality)}</div></div>
               <div class="cc-bar oee">${bar(o.oee)}</div><small class="dim">${nf(o.good)} buenas en el turno · ${nf(o.downH, 1)} h paradas</small>`
            : '<div class="cc-oee dim"><small>Sin carga en el turno</small></div>'
        }
        <div class="cc-load" title="Semana desde hoy: horas programadas sobre horas disponibles (turno menos paradas y fallas)">
          <div><small>${order ? "OCUPACIÓN DE LA ORDEN" : "OCUPACIÓN · SEMANA"}</small><b style="color:${loadColor(ld.occupancy)}">${pct(ld.occupancy)}</b></div>
          <div><small>DISPONIBILIDAD · SEMANA</small><b>${pct(ld.availability)}</b></div>
          <div class="cc-load-bar"><i class="av" style="width:${(ld.availability * 100).toFixed(1)}%"></i><i class="oc" style="width:${(ld.availability * Math.min(1, ld.occupancy) * 100).toFixed(1)}%;background:${loadColor(ld.occupancy)}"></i></div>
          <small class="dim">${nf(ld.busyH, 1)} de ${nf(ld.availH, 1)} h disponibles · abajo, por día (%)</small>
          <div class="cc-strip">${dayStrip(dayLoads(plan, evs, e.id, t, 7, order), t)}</div>
        </div>
        <a class="cc-link" href="/plant.html?plant=${model.plant}&select=${esc(e.id)}&focus=${esc(e.id)}" title="Ver la máquina en el gemelo 3D">VER EN 3D →</a>
      </article>`;
    })
    .join("") +
    (reserve.length
      ? `<article class="cc-card cc-reserve" style="--st:${STATE_COLORS.idle}"><header><b>EN RESERVA</b><span class="cc-state">${reserve.length} SIN MOLDE</span></header><p class="dim small">Inyectoras sin molde montado ni órdenes en la programación vigente. Fractal puede proponer montar un molde aquí.</p><p class="cc-chips">${reserve
          .map((x) => `<a href="/plant.html?plant=${model.plant}&select=${esc(x.e.id)}&focus=${esc(x.e.id)}" title="${x.e.params?.clamp_t ? `${nf(Number(x.e.params.clamp_t))} t` : ""}">${esc(machineLabel(x.e.id))}</a>`)
          .join("")}</p></article>`
      : "");
}

function tick(): void {
  const sec = Math.floor((Date.now() - loadedAt) / 1000);
  const extra = new Date(minOf(now()) * 60000 + sec * 1000).toISOString().slice(11, 19);
  $("cc-clock").textContent = `EN VIVO · ${when(now()).split(" ")[0]} ${extra}`;
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
render();
tick();
setInterval(tick, 1000);
setInterval(render, 5000);
