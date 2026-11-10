/**
 * Emulador de la planta de plásticos (emulador.html): plano 2D en tiempo real con el estado de cada inyectora y celda
 * de ensamble, tomado de la programación vigente del APS.
 *
 * El emulador muestra el mismo instante que el gemelo 3D: el del play o la barra de tiempo, y AHORA si el gemelo está
 * EN VIVO (aps-store.ts, `shownNow`). Así el estado de cada máquina y las piezas del lote no dependen de cuándo se abre
 * la pantalla. Una falla o un paro se declara en el instante mostrado, con su reparación estimada. No se programan
 * paradas futuras (eso son escenarios del cosimulador y de Fractal). El evento (`plant-event.v1`) va al centro de
 * control, al gemelo 3D y al APS por aps-store.ts.
 */
import "./styles.css";
import "./aps.css";
import "./movil.css";
import yaml from "js-yaml";
import plantYaml from "../../../industrial-models/plastic-injection-plant-v1/plant.yaml?raw";
import type { PlantEvent, PlanScheduleRow } from "@twin/cosim/core/contracts.ts";
import { activeEvents, events, model, onChange, onClock, PLASTICS, setEvents, sharedClock, shownClockText, shownNow, useDemoDays, vigente } from "./aps-store.ts";
import { COLOR_NAMES, day, esc, nf, when } from "./schedule.ts";
import { minOf, moldOf, plantPower, powerOf, unitsUntil } from "./plant-state.ts";

interface Eq {
  id: string;
  name?: string;
  type: string;
  zone?: string;
  position: [number, number, number];
  footprint: [number, number, number];
  rotation?: number;
  params?: Record<string, unknown>;
}
interface Zone {
  id: string;
  name: string;
  kind: string;
  rect: [number, number, number, number];
}
type State = "run" | "idle" | "plan" | "fault" | "off";

const doc = yaml.load(plantYaml) as { equipment: Eq[]; zones: Zone[]; plant: { site: { width_x: number; length_y: number } } };
const MACHINES = doc.equipment.filter((e) => e.type === "injection_molding_machine" || e.type === "assembly_cell");
const SITE_Y = doc.plant.site.length_y;
// Nave, celda de ensamble, semielaborado y central de materiales (el plano entero sobra para la pantalla).
const VIEW = { x: 30, y: SITE_Y - 80, w: 118, h: 62 };
const FAULTS = ["Resistencia del cañón quemada", "Fuga de aceite hidráulico", "Molde atascado", "Falla del robot extractor", "Falla eléctrica del tablero"];
const STOPS = ["Paro de emergencia por seguridad", "Atrapamiento de operario (simulacro)", "Derrame en el área"];
const REPAIR_H = [2, 4, 8, 16, 24, 48, 72];
const STATE_NAMES: Record<State, string> = { run: "PRODUCIENDO", idle: "SIN ORDEN", plan: "PARADA PROGRAMADA", fault: "FUERA DE SERVICIO", off: "FUERA DE TURNO" };

if (new URLSearchParams(location.search).has("embed")) document.body.classList.add("embed");
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const ms = (iso: string) => Date.parse(`${iso.slice(0, 16)}:00Z`);
const isoTz = (t: number) => `${new Date(t).toISOString().slice(0, 16)}${model.timezone}`;
let selected: string | null = new URLSearchParams(location.search).get("machine");
let plan = vigente();

/** Estado de una máquina en este instante. */
function stateOf(id: string): { state: State; row?: PlanScheduleRow; ev?: PlantEvent; why?: string } {
  const t = shownNow();
  const ev = activeEvents(t).find((e) => e.equipment === id);
  if (ev) return { state: "fault", ev };
  const minute = ms(t) / 60000;
  const day = Math.floor(minute / 1440) * 1440;
  const inShift = model.calendar.isWorkday(day) && model.calendar.spans.some(([a, b]) => minute >= day + a && minute < day + b);
  if (!inShift) return { state: "off" };
  const down = plan.downtime.find((d) => d.equipment === id && d.start.slice(0, 16) <= t && d.end.slice(0, 16) > t);
  if (down) return { state: "plan", why: down.reason };
  const row = plan.schedule.find((r) => r.equipment === id && r.start.slice(0, 16) <= t && r.end.slice(0, 16) > t);
  return row ? { state: "run", row } : { state: "idle" };
}

const label = (id: string) => id.toUpperCase();
const PW_NAMES = { run: "produciendo", standby: "espera caliente", heatup: "calentando", off: "apagada" } as const;

useDemoDays();

function renderFloor(): void {
  const svg = $("emu-svg");
  svg.setAttribute("viewBox", `${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`);
  const zones = doc.zones
    .filter((z) => z.rect[0] < VIEW.x + VIEW.w && z.rect[0] + z.rect[2] > VIEW.x)
    .map((z) => {
      const [x, y, w, h] = z.rect;
      return `<g class="emu-zone ${z.kind}"><rect x="${x}" y="${SITE_Y - y - h}" width="${w}" height="${h}"/>${w >= 18 ? `<text x="${x + 0.8}" y="${SITE_Y - y - h + 2}">${esc(z.name)}</text>` : ""}</g>`;
    })
    .join("");
  const others = doc.equipment
    .filter((e) => !MACHINES.includes(e) && e.footprint && !e.id.startsWith("crane"))
    .map((e) => rect(e, "emu-eq"))
    .join("");
  const machines = MACHINES.map((e) => {
    const s = stateOf(e.id);
    const [cx, cy] = [e.position[0], SITE_Y - e.position[1]];
    const product = s.row ? ` · ${s.row.product}` : "";
    return `<g class="emu-m ${s.state}${e.id === selected ? " sel" : ""}" data-id="${esc(e.id)}"><title>${esc(label(e.id))} · ${STATE_NAMES[s.state]}${esc(product)}</title>${rect(e, "body")}<text x="${cx}" y="${cy + 0.45}">${esc(e.id.replace("imm-", "").replace("assembly-", "E"))}</text></g>`;
  }).join("");
  svg.innerHTML = `<rect class="emu-site" x="0" y="0" width="${doc.plant.site.width_x}" height="${SITE_Y}"/>${zones}${others}${machines}`;
  svg.querySelectorAll<SVGGElement>(".emu-m").forEach((g) => (g.onclick = () => ((selected = g.dataset.id!), render())));
}

function rect(e: Eq, cls: string): string {
  const rot = Math.round((e.rotation ?? 0) / 90) % 2 !== 0;
  const [w, h] = rot ? [e.footprint[1], e.footprint[0]] : [e.footprint[0], e.footprint[1]];
  return `<rect class="${cls}" x="${e.position[0] - w / 2}" y="${SITE_Y - e.position[1] - h / 2}" width="${w}" height="${h}" rx="0.3"/>`;
}

/** Piezas hechas del lote en el instante mostrado: la misma cuenta que el gemelo 3D (horas de turno, sin ciclos reales). */
function madeOf(r: PlanScheduleRow): number {
  return unitsUntil(r, minOf(shownNow()));
}

function renderMachine(): void {
  const el = $("emu-machine");
  const e = MACHINES.find((m) => m.id === selected);
  if (!e) {
    el.innerHTML = `<div class="label">MÁQUINA</div><p class="dim">Haz clic en una inyectora o en una celda de ensamble del plano para ver su estado y declarar una falla o un paro de emergencia.</p>`;
    return;
  }
  const s = stateOf(e.id);
  const p = e.params ?? {};
  const mold = moldOf(e.id) ? { tooling: moldOf(e.id)! } : undefined;
  const r = s.row;
  const order = r ? plan.orders.find((o) => o.id === r.order) : undefined;
  const cycle = Number(p.cycle_s ?? 0);
  const cav = Number(p.cavities ?? 1);
  const pw = powerOf(plan, events(), e.id, minOf(shownNow()));
  const pwRow = pw ? `<tr><td>Potencia</td><td><b>${nf(pw.kw, 1)} kW</b> · ${PW_NAMES[pw.state]}</td></tr>` : "";
  let detail = "";
  if (r) {
    const made = madeOf(r);
    detail = `<table class="route-table emu-tags">
      <tr><td>Orden</td><td><b>${esc(r.order)}</b>${order ? ` · ${esc(order.customer)}` : ""}</td></tr>
      <tr><td>Producto</td><td>${esc(order?.product_name ?? r.product)}${r.product !== order?.product ? ` (${esc(r.product)})` : ""}</td></tr>
      <tr><td>Color</td><td>${r.color ? esc(COLOR_NAMES[r.color] ?? r.color) : "—"}</td></tr>
      <tr><td>Lote</td><td>${r.batch ? `${r.batch[0]} de ${r.batch[1]}` : "—"} · ${nf(r.quantity)} ${esc(r.unit)}</td></tr>
      <tr><td>Piezas del lote</td><td><b class="emu-count">${nf(made)}</b> / ${nf(r.quantity)}</td></tr>
      <tr><td>Fin del lote</td><td>${when(r.end)}</td></tr>
      ${cycle ? `<tr><td>Ciclo</td><td>${nf(cycle, 1)} s · ${nf(cav)} cavidades</td></tr>` : ""}
      ${pwRow}
    </table>`;
  } else if (s.state === "fault" && s.ev) {
    detail = `<p class="bad"><b>${s.ev.kind === "falla" ? "FALLA" : "PARO DE EMERGENCIA"}</b> desde ${when(s.ev.start)}: ${esc(s.ev.reason)}.<br/>Reparación estimada hasta ${when(s.ev.est_end)}.</p>`;
  } else if (s.state === "plan") detail = `<p class="dim">Parada en la programación: ${esc(s.why ?? "")}.</p>`;
  else if (s.state === "off") detail = `<p class="dim">Fuera de turno. Turnos de 06:00 a 22:00, lunes a sábado.</p>`;
  else detail = `<p class="dim">${mold ? "Sin orden en este momento." : "Sin molde montado ni órdenes en la programación vigente."}</p>`;
  if (!r && pwRow) detail += `<table class="route-table emu-tags">${pwRow}</table>`;

  const actions =
    s.state === "fault"
      ? `<button id="emu-clear" class="primary">✓ RESTABLECER · VUELVE A SERVICIO</button>`
      : `<div class="emu-form">
        <label>Tipo <select id="emu-kind"><option value="falla">Falla de máquina</option><option value="paro-emergencia">Paro de emergencia</option></select></label>
        <label>Causa <select id="emu-reason"></select></label>
        <label>Reparación estimada <select id="emu-hours">${REPAIR_H.map((h) => `<option value="${h}"${h === 72 ? " selected" : ""}>${h} h</option>`).join("")}</select></label>
        <button id="emu-fail" class="danger">⚠ DETENER LA MÁQUINA AHORA</button>
      </div>`;
  el.innerHTML = `
    <div class="label">MÁQUINA</div>
    <div class="emu-head"><b>${esc(label(e.id))}</b><span class="emu-state ${s.state}">${STATE_NAMES[s.state]}</span></div>
    <p class="dim small">${esc(e.name ?? (e.type === "assembly_cell" ? "Celda de ensamble" : "Inyectora"))}${p.clamp_t ? ` · ${nf(Number(p.clamp_t))} t` : ""}${mold ? ` · molde ${esc(mold.tooling)}` : ""}</p>
    ${detail}
    ${actions}`;
  if (s.state === "fault") {
    $("emu-clear").onclick = () => {
      setEvents(events().map((x) => (x.id === s.ev!.id ? { ...x, cleared: `${shownNow()}${model.timezone}` } : x)));
      render();
    };
    return;
  }
  const kind = $<HTMLSelectElement>("emu-kind");
  const sync = () => ($("emu-reason").innerHTML = (kind.value === "falla" ? FAULTS : STOPS).map((x) => `<option>${esc(x)}</option>`).join(""));
  kind.onchange = sync;
  sync();
  $("emu-fail").onclick = () => {
    const start = ms(shownNow());
    const hours = Number($<HTMLSelectElement>("emu-hours").value);
    const list = events();
    const ev: PlantEvent = {
      contract: "plant-event.v1",
      id: `EV-${String(list.length + 1).padStart(3, "0")}`,
      plant: PLASTICS,
      equipment: e.id,
      kind: kind.value as PlantEvent["kind"],
      reason: $<HTMLSelectElement>("emu-reason").value,
      start: isoTz(start),
      est_end: isoTz(start + hours * 3600000),
    };
    setEvents([ev, ...list]);
    render();
  };
}

function renderEvents(): void {
  const list = events();
  $("emu-events").innerHTML = list.length
    ? list
        .map(
          (e) => `<div class="emu-ev${e.cleared ? " cleared" : ""}"><b>${esc(e.id)} · ${esc(label(e.equipment))}</b> ${e.kind === "falla" ? "falla" : "paro de emergencia"} · ${esc(e.reason)}<br/>
            <small>${when(e.start)} · ${e.cleared ? `restablecida ${when(e.cleared)}` : `reparación estimada ${when(e.est_end)}`} · enviada al centro de control, al gemelo y al APS</small></div>`,
        )
        .join("")
    : '<p class="dim small">Sin eventos. Toda la planta está en servicio.</p>';
}

function render(): void {
  const counts: Record<State, number> = { run: 0, idle: 0, plan: 0, fault: 0, off: 0 };
  for (const m of MACHINES) counts[stateOf(m.id).state]++;
  const pw = model.energy ? plantPower(plan, events(), minOf(shownNow())) : undefined;
  $("emu-summary").innerHTML = `${counts.run} produciendo · ${counts.idle} sin orden${counts.fault ? ` · <b class="bad">${counts.fault} fuera de servicio</b>` : ""}${pw ? ` · <b title="Inyectoras ${nf(pw.machinesKw, 0)} kW + servicios ${nf(pw.servicesKw, 0)} kW${pw.limitKw ? ` · transformador ${nf(pw.limitKw, 0)} kW` : ""}">⚡ ${nf(pw.kw, 0)} kW</b>` : ""} · programación ${esc(plan.plan_id)}`;
  renderFloor();
  renderMachine();
  renderEvents();
}

function tick(): void {
  const live = !sharedClock();
  $("emu-clock").textContent = `${live ? "EN VIVO" : "SIGUIENDO EL GEMELO"} · ${day(shownNow())} ${shownClockText()}`;
  const c = document.querySelector(".emu-count");
  const e = MACHINES.find((m) => m.id === selected);
  const r = e && stateOf(e.id).row;
  if (c && e && r) c.textContent = nf(madeOf(r));
}

// Re-dibujar al mover el gemelo: el play cambia el instante varias veces por segundo, así que se agrupan los cambios.
let pending = false;
const redraw = () => {
  if (pending) return;
  pending = true;
  setTimeout(() => {
    pending = false;
    render();
  }, 250);
};
onChange(() => {
  plan = vigente();
  render();
});
onClock(() => {
  tick();
  redraw();
});
render();
tick();
setInterval(tick, 1000);
setInterval(render, 30000);
