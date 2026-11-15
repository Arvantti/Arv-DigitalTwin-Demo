/**
 * Emulador de la planta de salsas (emulador-salsas.html): hace de planta real. Plano 2D con el estado de cada equipo
 * con PLC (marmitas, pasteurizadores, caldera, emulsificador, tanque de mostaza, molinos y llenadoras), tomado de la
 * programación vigente del APS en el instante que se muestra (AHORA, o el del gemelo 3D cuando corre el play).
 *
 * Aquí se declaran las fallas y los paros de emergencia, siempre en el instante mostrado y con su reparación
 * estimada. El evento (`plant-event.v1`) llega al centro de control y al APS por store.ts. Una falla de la caldera,
 * de un pasteurizador o de un molino detiene toda su línea (aps.yaml, lines.down_with). No se programan paradas futuras:
 * eso son escenarios del cosimulador y de Fractal.
 */
import "./aps.css";
import { iso, parseLocal, type PlantEvent, type ProductionPlan } from "@twin/cosim-core";
import { buildModel } from "@plants/sauce-plant-v1-cosim/model.ts";
import { manualPlan } from "@plants/sauce-plant-v1-cosim/manual.ts";
import { demoManual, demoPortfolio, layoutEquipment, sauceData } from "./data.ts";
import { CHANGE_NAMES, doneOf, equipmentAt, plcEquipment, signals, STATE_NAMES, type EqState, type PlcEquipment } from "./plant-state.ts";
import { activeConfig, events, onChange, savedVigente, setEvents, sharedClock, shownNow } from "./store.ts";
import { dayLabel, when } from "./view.ts";
import yaml from "js-yaml";
import plantYaml from "../plant.yaml?raw";

const esc = (s: unknown) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const num = (x: number, d = 0) => x.toLocaleString("es-CO", { maximumFractionDigits: d, minimumFractionDigits: d });

interface LayoutEq {
  id: string;
  type: string;
  name?: string;
  zone?: string;
  position: [number, number, number];
  footprint?: [number, number, number];
  rotation_deg?: number;
  params?: Record<string, unknown>;
}
interface Zone {
  id: string;
  name: string;
  kind: string;
  rect: [number, number, number, number];
}

/** Causas por tipo de equipo (supuestas, típicas de una planta de salsas). */
const FAULTS: Record<string, string[]> = {
  jacketed_kettle: ["Fuga en la chaqueta de vapor", "Falla del motor del agitador", "Sensor de temperatura dañado"],
  tubular_heat_exchanger: ["Temperatura bajo el mínimo: válvula de desvío", "Fuga en un tubo"],
  fire_tube_boiler: ["Falla del quemador", "Nivel de agua bajo en la caldera", "Falla de la bomba de alimentación"],
  vacuum_emulsifier: ["Pérdida de vacío", "Falla del rotor del emulsificador", "Sello mecánico con fuga"],
  mixing_tank: ["Falla del agitador", "Válvula de fondo atascada"],
  colloid_mill: ["Desgaste del rotor del molino", "Sobrecorriente del motor"],
  stone_mill: ["Piedras desgastadas", "Sobrecorriente del motor"],
  vffs_sachet: ["Mordaza de sellado con temperatura baja", "Rollo de laminado roto", "Falla del dosificador", "Fotocelda de registro desalineada"],
};
const STOPS = ["Paro de emergencia por seguridad", "Derrame de producto caliente", "Atrapamiento de operario (simulacro)"];
const REPAIR_H = [2, 4, 8, 16, 24, 48, 60];
/** Rótulo corto dentro del equipo en el plano. */
const SHORT: Record<string, string> = {
  "kettle-01": "M1",
  "kettle-02": "M2",
  "kettle-03": "M3",
  "pasteurizer-01": "P1",
  "pasteurizer-02": "P2",
  "boiler-01": "CAL",
  "tank-aqueous-01": "FA",
  "emulsifier-01": "EM",
  "colloid-mill-01": "MC",
  "tank-mustard-01": "MS",
  "mustard-mill-01": "MP",
  "filler-sachet-01": "S1",
  "filler-sachet-02": "S2",
  "filler-sachet-03": "S3",
  "filler-pouch-01": "B1",
  "filler-pouch-02": "B2",
  "filler-pouch-03": "B3",
};
/** Nombre corto de las zonas angostas del plano (el nombre completo va en el título). */
const ZONE_SHORT: Record<string, string> = {
  "preparacion-pasta": "Pasta",
  caldera: "Caldera",
  encajado: "Encajado",
  "tanques-pulmon": "Pulmones",
  cip: "CIP",
  "tratamiento-agua": "Agua",
  frio: "Frío",
  compresores: "Aire",
  subestacion: "Subest.",
  "esclusa-proceso": "Esclusa",
  "sala-pesaje": "Pesaje",
  "esclusa-llenado": "Esclusa de llenado",
};
const LINE_NAMES: Record<string, string> = { "linea-caliente": "línea caliente", "linea-fria": "línea fría", "linea-mostaza": "línea de mostaza" };

export function mountSauceEmulator(root: HTMLElement): void {
  const model = buildModel(sauceData());
  const portfolio = demoPortfolio();
  const manual: ProductionPlan = { ...manualPlan(model, portfolio, demoManual()), status: "vigente" };
  const start = parseLocal(portfolio.plan_start);
  const doc = yaml.load(plantYaml) as { equipment: LayoutEq[]; zones: Zone[]; plant: { site: { width_x: number; length_y: number } } };
  const SITE_Y = doc.plant.site.length_y;
  // Caldera abajo, proceso, CIP, pulmones, llenado y encajado: lo que tiene PLC y lo que lo rodea.
  const VIEW = { x: 26, y: 0, w: 62, h: 64 };
  const EQ = plcEquipment(model, layoutEquipment() as LayoutEq[]);
  const LAYOUT = Object.fromEntries(doc.equipment.map((e) => [e.id, e]));
  const url = new URLSearchParams(location.search);
  let selected: string | null = url.get("equipment");
  let plan = savedVigente(portfolio.portfolio_id) ?? manual;
  let list = events();
  const tz = model.timezone;
  const t = () => parseLocal(shownNow(tz));

  root.innerHTML = `
    <header class="aps-top">
      <a class="aps-back" href="/plant.html?plant=sauce-plant-v1">← GEMELO 3D</a>
      <a class="aps-back" href="/aps-salsas.html">APS</a>
      <a class="aps-back" href="/control-salsas.html">CENTRO DE CONTROL</a>
      <div class="aps-title"><strong>EMULADOR</strong><span class="dim"> · planta de salsas · señales hacia el centro de control</span></div>
      <div id="emu-summary" class="aps-chip"></div>
      <div id="emu-clock" class="aps-clock">—</div>
    </header>
    <main class="emu-main">
      <section class="emu-floor"><svg id="emu-svg" class="sa-emu-svg" role="img" aria-label="Plano de la planta de salsas con el estado de cada equipo"></svg>
        <div class="emu-legend"><span><i class="run"></i>produciendo</span><span><i class="change"></i>cambio o limpieza</span><span><i class="idle"></i>sin orden</span><span><i class="plan"></i>parada programada</span><span><i class="fault"></i>falla o paro</span><span><i class="blocked"></i>detenido por la falla de otro equipo</span><span><i class="off"></i>fuera de turno</span></div>
      </section>
      <aside class="emu-side">
        <div id="emu-machine"></div>
        <div class="label">EVENTOS DE PLANTA</div>
        <div id="emu-events" class="emu-events"></div>
      </aside>
    </main>`;
  const $ = <T extends HTMLElement>(id: string) => root.querySelector(`#${id}`) as T;

  const rect = (e: LayoutEq, cls: string) => {
    const [fx, fy] = e.footprint ?? [1, 1];
    const rot = Math.round((e.rotation_deg ?? 0) / 90) % 2 !== 0;
    const [w, h] = rot ? [fy, fx] : [fx, fy];
    const round = /tank|kettle|emulsifier|buffer/.test(e.type) || e.type === "jacketed_kettle" ? Math.min(w, h) / 2 : 0.25;
    return `<rect class="${cls}" x="${e.position[0] - w / 2}" y="${SITE_Y - e.position[1] - h / 2}" width="${w}" height="${h}" rx="${round}"/>`;
  };

  function renderFloor(): void {
    const svg = $("emu-svg");
    svg.setAttribute("viewBox", `${VIEW.x} ${SITE_Y - VIEW.y - VIEW.h} ${VIEW.w} ${VIEW.h}`);
    const inView = (x: number, y: number, w: number, h: number) => x < VIEW.x + VIEW.w && x + w > VIEW.x && y < VIEW.y + VIEW.h && y + h > VIEW.y;
    const zones = doc.zones
      .filter((z) => inView(...z.rect))
      .map((z) => {
        const [x, y, w, h] = z.rect;
        const name = ZONE_SHORT[z.id] ?? z.name;
        return `<g class="emu-zone ${z.kind}"><title>${esc(z.name)}</title><rect x="${x}" y="${SITE_Y - y - h}" width="${w}" height="${h}"/>${name.length * 0.55 < w ? `<text x="${x + 0.5}" y="${SITE_Y - y - h + 1.5}">${esc(name)}</text>` : ""}</g>`;
      })
      .join("");
    const plc = new Set(EQ.map((e) => e.id));
    const others = doc.equipment
      .filter((e) => !plc.has(e.id) && e.footprint && inView(e.position[0] - 2, e.position[1] - 2, 4, 4))
      .map((e) => rect(e, "emu-eq"))
      .join("");
    const tt = t();
    const eqs = EQ.map((q) => {
      const e = LAYOUT[q.id];
      if (!e) return "";
      const s = equipmentAt(model, plan, list, q, tt);
      const what = s.row ? ` · ${s.row.product}` : "";
      return `<g class="emu-m ${s.state}${q.id === selected ? " sel" : ""}" data-id="${esc(q.id)}"><title>${esc(q.id)} · ${STATE_NAMES[s.state]}${esc(what)}</title>${rect(e, "body")}<text x="${e.position[0]}" y="${SITE_Y - e.position[1] + 0.4}">${esc(SHORT[q.id] ?? q.id)}</text></g>`;
    }).join("");
    svg.innerHTML = `<rect class="emu-site" x="0" y="0" width="${doc.plant.site.width_x}" height="${SITE_Y}"/>${zones}${others}${eqs}`;
  }

  /** Señales, tanda o llenado del equipo en el instante mostrado (se refresca solo, sin tocar el formulario). */
  function detailOf(q: PlcEquipment): string {
    const tt = t();
    const s = equipmentAt(model, plan, list, q, tt);
    const r = s.row;
    const order = r ? plan.orders.find((o) => o.id === r.order) : undefined;
    const sig = signals(model, q, s, tt, Math.floor(Date.now() / 3000));
    const sigRows = sig.map((x) => `<tr><td>${esc(x.label)}</td><td><b>${num(x.value, x.digits ?? 0)}</b> ${esc(x.unit)}</td></tr>`).join("");
    if (r) {
      const done = doneOf(model, r, tt);
      const isBatch = !!r.batch_id && q.role !== "llenadora";
      return `<table class="route-table emu-tags">
        ${s.change ? `<tr><td>Ahora</td><td><b>${esc(CHANGE_NAMES[s.change.kind] ?? s.change.kind)}</b> hasta ${esc(when(iso(s.change.until, tz)))}</td></tr>` : ""}
        <tr><td>${isBatch ? "Tanda" : "Pedido"}</td><td><b>${esc(isBatch ? r.batch_id : r.order)}</b>${!isBatch && order ? ` · ${esc(order.customer)}` : ""}</td></tr>
        <tr><td>${isBatch ? "Receta" : "Producto"}</td><td>${esc(isBatch ? r.product : (order?.product_name ?? r.product))}</td></tr>
        <tr><td>${isBatch ? "Kilos de la tanda" : "Unidades del llenado"}</td><td><b class="emu-count">${num(done)}</b> / ${num(r.quantity)} ${esc(r.unit)}</td></tr>
        <tr><td>Termina</td><td>${esc(when(r.end))}</td></tr>
        ${sigRows}
      </table>`;
    }
    if (s.state === "fault" && s.ev)
      return `<p class="bad"><b>${s.ev.kind === "falla" ? "FALLA" : "PARO DE EMERGENCIA"}</b> desde ${esc(when(s.ev.start))}: ${esc(s.ev.reason)}.<br/>Reparación estimada hasta ${esc(when(s.ev.est_end))}.${q.line ? `<br/>Detiene la ${esc(LINE_NAMES[q.line] ?? q.line)}.` : ""}</p>`;
    if (s.state === "blocked" && s.ev) return `<p class="warn">Detenido: <b>${esc(s.ev.equipment)}</b> está fuera de servicio (${esc(s.ev.reason)}) hasta ${esc(when(s.ev.est_end))}.</p>`;
    if (s.state === "plan") return `<p class="dim">Parada en la programación: ${esc(s.why ?? "")}.</p>`;
    if (s.state === "off") return `<p class="dim">Fuera de turno. Turnos de 06:00 a 22:00, lunes a sábado.</p>`;
    return `<p class="dim">Sin tanda ni llenado en este momento.</p>${sigRows ? `<table class="route-table emu-tags">${sigRows}</table>` : ""}`;
  }

  function renderMachine(): void {
    const el = $("emu-machine");
    const q = EQ.find((m) => m.id === selected);
    if (!q) {
      el.innerHTML = `<div class="label">EQUIPO</div><p class="dim">Haz clic en un equipo del plano (marmitas, pasteurizadores, caldera, emulsificador, tanque de mostaza, molinos o llenadoras) para ver sus señales y declarar una falla o un paro de emergencia.</p>`;
      return;
    }
    const s = equipmentAt(model, plan, list, q, t());
    const detail = `<div id="emu-detail">${detailOf(q)}</div>`;
    const actions =
      s.state === "fault"
        ? `<button id="emu-clear" class="primary">✓ RESTABLECER · VUELVE A SERVICIO</button>`
        : `<div class="emu-form">
          <label>Tipo <select id="emu-kind"><option value="falla">Falla del equipo</option><option value="paro-emergencia">Paro de emergencia</option></select></label>
          <label>Causa <select id="emu-reason"></select></label>
          <label>Reparación estimada <select id="emu-hours">${REPAIR_H.map((h) => `<option value="${h}"${h === 60 ? " selected" : ""}>${h} h</option>`).join("")}</select></label>
          <button id="emu-fail" class="danger">⚠ DETENER EL EQUIPO AHORA</button>
          ${q.role === "apoyo" ? `<p class="dim small">Si falla, se detiene toda la ${esc(LINE_NAMES[q.line!] ?? q.line!)}.</p>` : ""}
        </div>`;
    el.innerHTML = `
      <div class="label">EQUIPO</div>
      <div class="emu-head"><b>${esc(q.id.toUpperCase())}</b><span class="emu-state ${s.state}">${STATE_NAMES[s.state]}</span></div>
      <p class="dim small">${esc(q.name)}${q.line ? ` · ${esc(LINE_NAMES[q.line] ?? q.line)}` : " · sala de llenado"}</p>
      ${detail}
      ${actions}`;
    if (s.state === "fault") {
      $("emu-clear").onclick = () => {
        list = list.map((x) => (x.id === s.ev!.id ? { ...x, cleared: shownNow(tz) } : x));
        setEvents(list);
        render();
      };
      return;
    }
    const kind = $<HTMLSelectElement>("emu-kind");
    const sync = () => ($("emu-reason").innerHTML = (kind.value === "falla" ? (FAULTS[q.type] ?? ["Falla del equipo"]) : STOPS).map((x) => `<option>${esc(x)}</option>`).join(""));
    kind.onchange = sync;
    sync();
    $("emu-fail").onclick = () => {
      const t0 = t();
      const hours = Number($<HTMLSelectElement>("emu-hours").value);
      const ev: PlantEvent = {
        contract: "plant-event.v1",
        id: `EV-${String(list.length + 1).padStart(3, "0")}`,
        plant: model.plant,
        equipment: q.id,
        kind: kind.value as PlantEvent["kind"],
        reason: $<HTMLSelectElement>("emu-reason").value,
        start: iso(t0, tz),
        est_end: iso(t0 + hours * 60, tz),
      };
      list = [ev, ...list];
      setEvents(list);
      render();
    };
  }

  function renderEvents(): void {
    $("emu-events").innerHTML = list.length
      ? list
          .map(
            (e) => `<div class="emu-ev${e.cleared ? " cleared" : ""}"><b>${esc(e.id)} · ${esc(e.equipment.toUpperCase())}</b> ${e.kind === "falla" ? "falla" : "paro de emergencia"} · ${esc(e.reason)}<br/>
              <small>${esc(when(e.start))} · ${e.cleared ? `restablecido ${esc(when(e.cleared))}` : `reparación estimada ${esc(when(e.est_end))}`} · enviado al centro de control y al APS</small></div>`,
          )
          .join("")
      : '<p class="dim small">Sin eventos. Toda la planta está en servicio.</p>';
  }

  function render(): void {
    const tt = t();
    const counts: Partial<Record<EqState, number>> = {};
    for (const q of EQ) {
      const k = equipmentAt(model, plan, list, q, tt).state;
      counts[k] = (counts[k] ?? 0) + 1;
    }
    const bad = (counts.fault ?? 0) + (counts.blocked ?? 0);
    $("emu-summary").innerHTML = `${counts.run ?? 0} produciendo · ${counts.change ?? 0} en cambio${bad ? ` · <b class="bad">${bad} detenidos</b>` : ""} · programación ${esc(plan.plan_id)}`;
    $("emu-clock").textContent = `${sharedClock() ? "SIGUIENDO EL GEMELO" : "AHORA"} · ${dayLabel(tt, start)} · ${shownNow(tz).slice(11, 16)}`;
    renderFloor();
    renderMachine();
    renderEvents();
  }

  root.addEventListener("click", (ev) => {
    const g = (ev.target as Element).closest<SVGGElement>(".emu-m");
    if (g?.dataset.id) {
      selected = g.dataset.id;
      render();
    }
  });
  // Otra configuración de datos activada en el APS: la pantalla se vuelve a armar con ella.
  const cfgId = activeConfig()?.id ?? null;
  onChange((what) => {
    if (what === "config" && (activeConfig()?.id ?? null) !== cfgId) return location.reload();
    if (what === "plan") plan = savedVigente(portfolio.portfolio_id) ?? manual;
    if (what === "events") list = events();
    render();
  });
  render();
  // Las señales del equipo elegido se refrescan solas; el formulario de falla queda como estaba.
  setInterval(() => {
    const q = EQ.find((m) => m.id === selected);
    const box = root.querySelector("#emu-detail");
    if (q && box) box.innerHTML = detailOf(q);
  }, 3000);
}
