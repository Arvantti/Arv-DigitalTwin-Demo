/**
 * Play del gemelo 3D de plásticos por día y hora: una barra de tiempo con velocidad que recorre la programación
 * vigente desde unos días atrás (lo ejecutado) hasta una semana adelante (lo programado). Sobre cada máquina con PLC
 * va un letrero con su estado, la orden, el producto, el color y el lote en ese instante, así se ve cuándo una
 * máquina pasa de un producto a otro o hace un cambio de color.
 */
import * as THREE from "three";
import type { PlantEvent, ProductionPlan } from "@twin/cosim/core/contracts.ts";
import { model, now } from "./aps-store.ts";
import { isoOf, machineAt, machineLabel, minOf, moldOf, oeeAt, PLC_MACHINES, STATE_COLORS, STATE_NAMES, unitsUntil } from "./plant-state.ts";
import { COLOR_NAMES, day, esc, nf } from "./schedule.ts";

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
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const range = $<HTMLInputElement>("tt-range");

  // Marcas de días sobre la barra; el tramo antes de AHORA es lo ejecutado.
  const span = to - from;
  let days = "";
  for (let d = from; d < to; d += 1440) {
    const date = new Date(d * 60000);
    const work = model.calendar.isWorkday(d);
    days += `<span class="${work ? "" : "off"}" style="left:${((100 * (d - from)) / span).toFixed(2)}%;width:${((100 * 1440) / span).toFixed(2)}%">${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()}</span>`;
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
    canvas.height = 150;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    const box = new THREE.Box3().setFromObject(root);
    sprite.position.set((box.min.x + box.max.x) / 2, box.max.y + 3, (box.min.z + box.max.z) / 2);
    sprite.scale.set(9, 2.64, 1);
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
      const key = `${s.state}|${line2}|${line3}`;
      if (key === l.key) continue;
      l.key = key;
      const g = l.canvas.getContext("2d")!;
      g.clearRect(0, 0, 512, 150);
      g.fillStyle = "rgba(6, 8, 40, 0.86)";
      g.strokeStyle = STATE_COLORS[s.state];
      g.lineWidth = 6;
      g.beginPath();
      g.roundRect(4, 4, 504, 142, 14);
      g.fill();
      g.stroke();
      g.fillStyle = STATE_COLORS[s.state];
      g.font = "700 34px Inter, sans-serif";
      g.fillText(`${machineLabel(id)} · ${STATE_NAMES[s.state]}`, 22, 46);
      g.fillStyle = "#F8FAFC";
      g.font = "600 30px 'IBM Plex Mono', monospace";
      g.fillText(line2.slice(0, 30), 22, 88);
      g.fillStyle = "#aab0be";
      g.font = "500 28px Inter, sans-serif";
      g.fillText(line3, 22, 128);
      (l.sprite.material.map as THREE.CanvasTexture).needsUpdate = true;
    }
  }

  function show(): void {
    const n = live();
    range.value = String(t);
    const date = new Date(t * 60000);
    $("tt-when").textContent = `${WEEKDAYS[date.getUTCDay()]} ${day(isoOf(t))} ${isoOf(t).slice(11, 16)}`;
    const zone = following ? "EN VIVO" : t < n - 1 ? "PASADO · ejecutado" : t > n + 1 ? "FUTURO · programado" : "AHORA";
    $("tt-zone").textContent = zone;
    $("tt-zone").className = following ? "live" : t < n ? "past" : "future";
    $("tt-live").classList.toggle("active", following);
    $("tt-play").textContent = playing ? "❚❚" : "▶";
    paint();
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
      ${s.ev ? tag("alarma", `<b class="bad">${esc(s.ev.reason)}</b>`) : ""}
    </div>
    <a class="btn-link" href="/control.html" target="_blank" rel="noopener">◉ CENTRO DE CONTROL</a>
  </div>`;
}
