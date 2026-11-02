/**
 * Play del gemelo 3D de plásticos por día y hora: una barra de tiempo con velocidad que recorre la programación
 * vigente desde unos días atrás (lo ejecutado) hasta una semana adelante (lo programado). Sobre cada máquina con PLC
 * va un letrero con su estado, la orden, el producto, el color y el lote en ese instante, así se ve cuándo una
 * máquina pasa de un producto a otro o hace un cambio de color. Debajo, la ocupación de la máquina contra su
 * disponibilidad en el día.
 *
 * Arriba de la barra va el panel de órdenes: las que se están procesando en el instante del gemelo, con lo producido
 * y su avance, y una orden seguida (selector o `?order=`) con lo producido por etapa mientras corre el play. Las
 * máquinas de la orden seguida se marcan en sus letreros.
 */
import * as THREE from "three";
import type { PlantEvent, ProductionPlan } from "@twin/cosim/core/contracts.ts";
import { model, now } from "./aps-store.ts";
import { type MachineState, dayLoadAt, dayLoads, dayStrip, isoOf, loadAt, loadColor, machineAt, machineLabel, minOf, moldOf, oeeAt, PLC_MACHINES, STATE_COLORS, STATE_NAMES, unitsUntil } from "./plant-state.ts";
import { COLOR_NAMES, day, dayTag, esc, nf, relativeDays } from "./schedule.ts";

const SPEEDS: [number, string][] = [
  [15, "15 min/s"],
  [60, "1 h/s"],
  [240, "4 h/s"],
  [720, "12 h/s"],
];
const BACK_DAYS = 3;
const AHEAD_DAYS = 7;
const WEEKDAYS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

interface Opts {
  scene: THREE.Scene;
  rootOf: (id: string) => THREE.Object3D | undefined;
  plan: () => ProductionPlan;
  events: () => PlantEvent[];
  /** Avisa cada vez que cambia el instante del gemelo (para el PLC de la máquina seleccionada). */
  onTime?: (t: number) => void;
}

export interface TwinPlay {
  /** Instante que muestra el gemelo, en minutos de la planta. */
  time: () => number;
  /** Segundos de planta por segundo real: 1 en vivo o en pausa; con el play, la velocidad elegida (15 min/s = 900). */
  rate: () => number;
  /** Estado de una máquina en el instante del gemelo (produciendo, fuera de turno…), para animarla o dejarla quieta. */
  stateOf: (id: string) => MachineState;
  /** Vuelve a pintar los letreros (cambió la programación o llegó un evento). */
  refresh: () => void;
}

export function buildTwinPlay(opts: Opts): TwinPlay {
  const live = () => minOf(now());
  const base = Math.floor(live() / 1440) * 1440;
  const from = base - BACK_DAYS * 1440;
  const to = base + (AHEAD_DAYS + 1) * 1440;
  let t = live();
  let following = true;
  let playing = false;
  let speed = 60;
  let timer: number | undefined;
  let followed: string | null = new URLSearchParams(location.search).get("order");

  const bar = document.createElement("section");
  bar.className = "glass twin-time";
  bar.innerHTML = `
    <div class="tt-controls">
      <button id="tt-play" title="Reproducir la programación">▶</button>
      <button id="tt-live" class="active" title="Volver al instante actual">● EN VIVO</button>
      <select id="tt-speed" title="Velocidad de reproducción">${SPEEDS.map(([v, l]) => `<option value="${v}"${v === speed ? " selected" : ""}>${l}</option>`).join("")}</select>
    </div>
    <div class="tt-track">
      <div class="tt-days" id="tt-days"></div>
      <input id="tt-range" type="range" min="${from}" max="${to}" step="15" value="${t}" aria-label="Día y hora del gemelo" />
    </div>
    <div class="tt-label"><b id="tt-when"></b><small id="tt-zone"></small></div>`;
  document.body.appendChild(bar);
  const ordersBox = document.createElement("section");
  ordersBox.className = "glass twin-orders";
  ordersBox.innerHTML = `
    <div class="to-head"><button class="label to-toggle" id="to-toggle" title="Mostrar u ocultar las órdenes en proceso">▾ ÓRDENES EN EL GEMELO</button>
      <select id="to-pick" title="Seguir una orden con el play"><option value="">seguir una orden…</option></select></div>
    <div id="to-followed"></div>
    <div class="label to-sub" id="to-now-title"></div>
    <div id="to-now"></div>`;
  document.body.appendChild(ordersBox);
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const range = $<HTMLInputElement>("tt-range");

  // Marcas de días sobre la barra; el tramo antes de AHORA es lo ejecutado.
  const span = to - from;
  let days = "";
  for (let d = from; d < to; d += 1440) {
    const work = model.calendar.isWorkday(d);
    days += `<span class="${work ? "" : "off"}" style="left:${((100 * (d - from)) / span).toFixed(2)}%;width:${((100 * 1440) / span).toFixed(2)}%">${dayTag(d)}</span>`;
  }
  $("tt-days").innerHTML = `${days}<i class="tt-past" style="width:${((100 * (live() - from)) / span).toFixed(2)}%"></i><i class="tt-now" style="left:${((100 * (live() - from)) / span).toFixed(2)}%"></i>`;

  // Letreros sobre las máquinas.
  const labels = new Map<string, { sprite: THREE.Sprite; canvas: HTMLCanvasElement; key: string }>();
  function ensure(id: string): void {
    if (labels.has(id)) return;
    const root = opts.rootOf(id);
    if (!root) return;
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 196;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    const box = new THREE.Box3().setFromObject(root);
    sprite.position.set((box.min.x + box.max.x) / 2, box.max.y + 3, (box.min.z + box.max.z) / 2);
    sprite.scale.set(9, (9 * 196) / 512, 1);
    sprite.renderOrder = 10;
    opts.scene.add(sprite);
    labels.set(id, { sprite, canvas, key: "" });
  }

  function paint(): void {
    const plan = opts.plan();
    const events = opts.events();
    // Las máquinas del catálogo y las que recibieron un molde por una recomendación de Fractal.
    for (const id of new Set([...model.machines, ...plan.schedule.map((r) => r.equipment)])) ensure(id);
    for (const [id, l] of labels) {
      const s = machineAt(plan, events, id, t);
      const r = s.row;
      const order = r ? plan.orders.find((o) => o.id === r.order) : undefined;
      const line2 = r ? `${r.order} · ${(order?.product_name ?? r.product).slice(0, 22)}` : s.ev ? s.ev.reason : s.why ?? "";
      const line3 = r ? `${r.color ? (COLOR_NAMES[r.color] ?? r.color) : ""}${r.batch ? ` · lote ${r.batch[0]}/${r.batch[1]}` : ""}` : "";
      // Ocupación vs disponibilidad del día (o del siguiente laborable).
      const ld = dayLoadAt(plan, events, id, t) ?? loadAt(plan, events, id, t, 1);
      const occ = Math.round(ld.occupancy * 100);
      const av = Math.round(ld.availability * 100);
      const mark = followed !== null && plan.schedule.some((x) => x.order === followed && x.equipment === id);
      const key = `${s.state}|${line2}|${line3}|${occ}|${av}|${mark}`;
      if (key === l.key) continue;
      l.key = key;
      const g = l.canvas.getContext("2d")!;
      g.clearRect(0, 0, 512, 196);
      g.fillStyle = "rgba(6, 8, 40, 0.86)";
      g.strokeStyle = mark ? "#ffd166" : STATE_COLORS[s.state];
      g.lineWidth = mark ? 12 : 6;
      g.beginPath();
      g.roundRect(4, 4, 504, 188, 14);
      g.fill();
      g.stroke();
      g.fillStyle = STATE_COLORS[s.state];
      g.font = "700 34px Inter, sans-serif";
      g.fillText(`${mark ? "★ " : ""}${machineLabel(id)} · ${STATE_NAMES[s.state]}`, 22, 46);
      g.fillStyle = "#F8FAFC";
      g.font = "600 30px 'IBM Plex Mono', monospace";
      g.fillText(line2.slice(0, 30), 22, 88);
      g.fillStyle = "#aab0be";
      g.font = "500 28px Inter, sans-serif";
      g.fillText(line3, 22, 128);
      // Barra de horas disponibles del día con las programadas encima.
      g.fillStyle = "rgba(255,255,255,0.10)";
      g.fillRect(22, 146, 180, 26);
      g.fillStyle = "rgba(170,176,190,0.35)";
      g.fillRect(22, 146, 180 * ld.availability, 26);
      g.fillStyle = loadColor(ld.occupancy);
      g.fillRect(22, 146, 180 * ld.availability * Math.min(1, ld.occupancy), 26);
      g.fillStyle = "#F8FAFC";
      g.font = "600 24px 'IBM Plex Mono', monospace";
      g.fillText(`DÍA OCUP ${occ}% DISP ${av}%`, 214, 168);
      (l.sprite.material.map as THREE.CanvasTexture).needsUpdate = true;
    }
  }

  /** Panel de órdenes: las que corren en el instante t y la orden seguida con lo producido hasta t. */
  let pickKey = "";
  function paintOrders(): void {
    const plan = opts.plan();
    const events = opts.events();
    const pick = $<HTMLSelectElement>("to-pick");
    // Órdenes con trabajo dentro de la ventana del play, en orden de inicio.
    const inWindow = plan.orders.filter((o) => plan.schedule.some((r) => r.order === o.id && minOf(r.end) > from && minOf(r.start) < to)).sort((a, b) => a.start.localeCompare(b.start));
    const k = `${plan.plan_id}|${inWindow.length}|${followed}`;
    if (k !== pickKey) {
      pickKey = k;
      pick.innerHTML = `<option value="">seguir una orden…</option>${inWindow.map((o) => `<option value="${esc(o.id)}"${o.id === followed ? " selected" : ""}>${esc(o.id)} · ${esc(o.product_name)}</option>`).join("")}`;
    }
    const finished = (o: (typeof plan.orders)[number]) => plan.schedule.filter((r) => r.order === o.id && r.product === o.product);
    const made = (o: (typeof plan.orders)[number]) => finished(o).reduce((n, r) => n + unitsUntil(r, t), 0);
    const bar = (x: number) => `<span class="to-bar"><i style="width:${Math.min(100, x * 100).toFixed(1)}%"></i></span>`;
    // Orden seguida
    const o = followed ? plan.orders.find((x) => x.id === followed) : undefined;
    if (o) {
      const rows = plan.schedule.filter((r) => r.order === o.id);
      const done = Math.min(o.quantity, made(o));
      const start = Math.min(...rows.map((r) => minOf(r.start)));
      const end = Math.max(...rows.map((r) => minOf(r.end)));
      const state = t < start ? "PENDIENTE" : t >= end ? "TERMINADA" : "EN PROCESO";
      const stages = [...new Set(rows.map((r) => `${r.stage}|${r.product}`))].map((sp) => {
        const [stage, product] = sp.split("|");
        const rs = rows.filter((r) => r.stage === stage && r.product === product);
        const qty = rs.reduce((n, r) => n + r.quantity, 0);
        const u = rs.reduce((n, r) => n + unitsUntil(r, t), 0);
        const now = rs.filter((r) => minOf(r.start) <= t && minOf(r.end) > t && machineAt(plan, events, r.equipment, t).row === r).map((r) => machineLabel(r.equipment));
        const machines = [...new Set(rs.map((r) => machineLabel(r.equipment)))];
        return `<div class="to-stage"><span>${esc(stage)} · ${esc(product)}</span><span>${nf(u)} / ${nf(qty)}</span>${bar(u / Math.max(1, qty))}<small>${machines.map((m) => (now.includes(m) ? `<b>${esc(m)}</b>` : esc(m))).join(" · ")}</small></div>`;
      }).join("");
      $("to-followed").innerHTML = `<div class="to-card">
        <div class="to-title"><b>${esc(o.id)}</b> · ${esc(o.product_name)} <span class="to-state ${state === "EN PROCESO" ? "run" : state === "TERMINADA" ? "done" : ""}">${state}</span></div>
        <div class="to-qty"><b>${nf(done)}</b> de ${nf(o.quantity)} ${esc(o.unit)} terminadas ${bar(done / Math.max(1, o.quantity))}</div>
        <small class="dim">${esc(o.customer)} · entrega ${esc(day(o.due))} ${o.due.slice(11, 16)} · fin programado ${esc(day(o.completion))} ${o.completion.slice(11, 16)}</small>
        ${stages}</div>`;
    } else $("to-followed").innerHTML = "";
    // Órdenes que se están procesando en el instante
    const running = new Map<string, string[]>();
    for (const id of new Set([...model.machines, ...plan.schedule.map((r) => r.equipment)])) {
      const r = machineAt(plan, events, id, t).row;
      if (r) running.set(r.order, [...(running.get(r.order) ?? []), machineLabel(id)]);
    }
    $("to-now-title").textContent = `EN PROCESO AHORA EN EL GEMELO · ${running.size}`;
    $("to-now").innerHTML = running.size
      ? [...running].map(([id, ms]) => {
          const x = plan.orders.find((y) => y.id === id);
          const d = x ? Math.min(x.quantity, made(x)) : 0;
          return `<button class="to-row${id === followed ? " sel" : ""}" data-order="${esc(id)}"><span><b>${esc(id)}</b> ${esc((x?.product_name ?? "").slice(0, 22))}</span><span>${x ? `${nf(d)} / ${nf(x.quantity)}` : ""}</span>${bar(x ? d / Math.max(1, x.quantity) : 0)}<small>${ms.map(esc).join(" · ")}</small></button>`;
        }).join("")
      : `<div class="dim">ninguna orden en proceso a esta hora</div>`;
    $("to-now").querySelectorAll<HTMLButtonElement>(".to-row").forEach((b) => (b.onclick = () => follow(b.dataset.order === followed ? null : b.dataset.order!)));
  }

  function follow(id: string | null): void {
    followed = id;
    for (const l of labels.values()) l.key = "";
    show();
  }

  function show(): void {
    const n = live();
    range.value = String(t);
    const date = new Date(t * 60000);
    $("tt-when").textContent = `${relativeDays() ? "" : `${WEEKDAYS[date.getUTCDay()]} `}${day(isoOf(t))} ${isoOf(t).slice(11, 16)}`;
    const zone = following ? "EN VIVO" : t < n - 1 ? "PASADO · ejecutado" : t > n + 1 ? "FUTURO · programado" : "AHORA";
    $("tt-zone").textContent = zone;
    $("tt-zone").className = following ? "live" : t < n ? "past" : "future";
    $("tt-live").classList.toggle("active", following);
    $("tt-play").textContent = playing ? "❚❚" : "▶";
    paint();
    paintOrders();
    opts.onTime?.(t);
  }

  function setTime(x: number, follow = false): void {
    t = Math.max(from, Math.min(to, x));
    following = follow;
    show();
  }

  function stop(): void {
    playing = false;
    if (timer) clearInterval(timer);
    timer = undefined;
  }

  range.oninput = () => {
    stop();
    setTime(Number(range.value));
  };
  $("tt-live").onclick = () => {
    stop();
    setTime(live(), true);
  };
  $("to-toggle").onclick = () => {
    const min = ordersBox.classList.toggle("min");
    $("to-toggle").textContent = `${min ? "▸" : "▾"} ÓRDENES EN EL GEMELO`;
  };
  $<HTMLSelectElement>("to-pick").onchange = (e) => follow((e.target as HTMLSelectElement).value || null);
  $<HTMLSelectElement>("tt-speed").onchange = (e) => (speed = Number((e.target as HTMLSelectElement).value));
  $("tt-play").onclick = () => {
    if (playing) {
      stop();
      show();
      return;
    }
    if (t >= to) t = from;
    playing = true;
    following = false;
    // Cada décima de segundo avanza speed/10 minutos de planta.
    timer = window.setInterval(() => {
      if (t >= to) {
        stop();
        show();
        return;
      }
      t = Math.min(to, t + speed / 10);
      show();
    }, 100);
    show();
  };
  // En vivo, el gemelo sigue el reloj.
  setInterval(() => following && setTime(live(), true), 30000);
  show();
  return {
    time: () => t,
    rate: () => (playing ? speed * 60 : 1),
    stateOf: (id) => machineAt(opts.plan(), opts.events(), id, t).state,
    refresh: () => {
      for (const l of labels.values()) l.key = "";
      show();
    },
  };
}

/** PLC de una máquina en el instante del gemelo: las señales que publica hacia el centro de control. */
export function plcCard(plan: ProductionPlan, events: PlantEvent[], id: string, t: number): string {
  if (!PLC_MACHINES.some((e) => e.id === id)) return "";
  const eq = PLC_MACHINES.find((e) => e.id === id)!;
  const s = machineAt(plan, events, id, t);
  const o = oeeAt(plan, events, id, t);
  const ld = loadAt(plan, events, id, t);
  const sl = dayLoadAt(plan, events, id, t);
  const r = s.row;
  const cycle = Number(eq.params?.cycle_s ?? 0);
  const cav = Number(eq.params?.cavities ?? 0);
  const pct = (x: number) => `${nf(x * 100, 1)} %`;
  const tag = (k: string, v: string) => `<div><span>${k}</span><span>${v}</span></div>`;
  return `<div class="plc-card" style="--st:${STATE_COLORS[s.state]}">
    <div class="label">PLC · ${esc(machineLabel(id))} <span class="dim">· ${isoOf(t).slice(11, 16)} del ${day(isoOf(t))}</span></div>
    <div class="plc-state">${STATE_NAMES[s.state]}</div>
    <div class="vars">
      ${tag("orden", r ? esc(r.order) : "—")}
      ${tag("producto", r ? esc(r.product) : moldOf(id) ? `molde ${esc(moldOf(id)!)}` : "—")}
      ${tag("color", r?.color ? esc(COLOR_NAMES[r.color] ?? r.color) : "—")}
      ${tag("lote", r?.batch ? `${r.batch[0]} de ${r.batch[1]}` : "—")}
      ${tag("unidades del lote", r ? `${nf(unitsUntil(r, t))} / ${nf(r.quantity)}` : "—")}
      ${cycle ? tag("tiempo de ciclo", `${nf(cycle, 1)} s · ${nf(cav)} cav.`) : ""}
      ${tag("unidades del turno", o ? `${nf(o.good)} buenas` : "—")}
      ${tag("OEE del turno", o ? `<b>${pct(o.oee)}</b>` : "—")}
      ${o ? tag("D · R · C", `${pct(o.availability)} · ${pct(o.performance)} · ${pct(o.quality)}`) : ""}
      ${sl ? tag("ocupación · día", `<b style="color:${loadColor(sl.occupancy)}">${pct(sl.occupancy)}</b> · disp. ${pct(sl.availability)}`) : ""}
      ${tag("ocupación · semana", `<b style="color:${loadColor(ld.occupancy)}">${pct(ld.occupancy)}</b> · ${nf(ld.busyH, 1)} de ${nf(ld.availH, 1)} h`)}
      ${tag("disponibilidad · semana", `${pct(ld.availability)} · ${nf(ld.availH, 1)} de ${nf(ld.shiftH, 1)} h de turno`)}
      ${s.ev ? tag("alarma", `<b class="bad">${esc(s.ev.reason)}</b>`) : ""}
    </div>
    <div class="label" style="margin-top:6px">OCUPACIÓN VS DISPONIBILIDAD · POR DÍA (%)</div>
    ${dayStrip(dayLoads(plan, events, id, t), t)}
    <a class="btn-link" href="/control.html" target="_blank" rel="noopener">◉ CENTRO DE CONTROL</a>
  </div>`;
}
