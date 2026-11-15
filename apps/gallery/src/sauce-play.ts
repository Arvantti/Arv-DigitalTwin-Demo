/**
 * Play del gemelo 3D de salsas: la barra de tiempo recorre la programación vigente del APS de salsas desde unos días
 * atrás (lo ejecutado) hasta una semana adelante (lo programado), igual que en plásticos. Sobre cada equipo con PLC va
 * un letrero con su estado y la tanda o el llenado que corre en ese instante (con la limpieza CIP o el cambio en
 * curso), y los equipos se animan según su estado: la marmita cocina con vapor y agitador, la caldera prende la llama,
 * el pasteurizador pasa producto y la llenadora corta sachets; detenidos o en falla, quietos y con la baliza.
 *
 * El instante del play se publica como reloj compartido (store.ts): el emulador y el centro de control de salsas lo
 * siguen. Las fallas del emulador marcan el equipo en rojo en la escena.
 *
 * El estado de cada equipo sale de plants/sauce-plant-v1/app/plant-state.ts, el mismo que usan el emulador y el centro
 * de control; aquí solo se pinta.
 */
import * as THREE from "three";
import { iso, parseLocal, type PlantEvent, type ProductionPlan } from "@twin/cosim-core";
import type { AnimationFrame } from "@twin/3d";
import { buildModel } from "@plants/sauce-plant-v1-cosim/model.ts";
import { manualPlan } from "@plants/sauce-plant-v1-cosim/manual.ts";
import { demoManual, demoPortfolio, layoutEquipment, sauceData } from "@plants/sauce-plant-v1-app/data.ts";
import { CHANGE_NAMES, dayLoads, doneOf, equipmentAt, eventsAt, loadColor, oeeAt, plcEquipment, progressOf, signals, STATE_COLORS, STATE_NAMES, weekLoad, type EqNow } from "@plants/sauce-plant-v1-app/plant-state.ts";
import { activeConfig, demoNow, events, onChange, savedVigente, setSharedClock } from "@plants/sauce-plant-v1-app/store.ts";
import { dayLabel, when } from "@plants/sauce-plant-v1-app/view.ts";

const SPEEDS: [number, string][] = [
  [15, "15 min/s"],
  [60, "1 h/s"],
  [240, "4 h/s"],
  [720, "12 h/s"],
];
const BACK_DAYS = 3;
const AHEAD_DAYS = 7;
const LABEL_FAR = 70;
const LABEL_NEAR = 12;
const esc = (s: unknown) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const num = (x: number, d = 0) => x.toLocaleString("es-CO", { maximumFractionDigits: d, minimumFractionDigits: d });
const BULK_NAME: Record<string, string> = { "salsa-tomate": "tomate", "salsa-bbq": "BBQ", "salsa-picante": "picante", "mayonesa-light": "mayonesa light", mayonesa: "mayonesa", "salsa-rosada": "rosada", "mostaza-granel": "mostaza" };

interface Opts {
  scene: THREE.Scene;
  rootOf: (id: string) => THREE.Object3D | undefined;
  select: (id: string | null) => void;
  /** Marca en rojo los equipos fuera de servicio. */
  markDown: (ids: string[]) => void;
  setAssetExtra: (fn: (id: string) => string) => void;
  refreshAsset: () => void;
}

export interface SaucePlay {
  /** Segundos de planta por segundo real: 1 quieto; con el play, la velocidad elegida. */
  rate: () => number;
  /** Cuadro de animación del equipo según la programación en el instante del play (null si no tiene PLC). */
  frameOf: (id: string, sceneTime: number) => AnimationFrame | null;
}

export function buildSaucePlay(opts: Opts): SaucePlay {
  const model = buildModel(sauceData());
  const portfolio = demoPortfolio();
  const manual: ProductionPlan = { ...manualPlan(model, portfolio, demoManual()), status: "vigente" };
  const tz = model.timezone;
  const start = parseLocal(portfolio.plan_start);
  const EQ = plcEquipment(model, layoutEquipment());
  const byId = new Map(EQ.map((q) => [q.id, q]));
  let plan = savedVigente(portfolio.portfolio_id) ?? manual;
  let list: PlantEvent[] = events();
  const live = () => parseLocal(demoNow(tz));
  const base = Math.floor(live() / 1440) * 1440;
  const from = base - BACK_DAYS * 1440;
  const to = base + (AHEAD_DAYS + 1) * 1440;
  let t = live();
  let atNow = true;
  let playing = false;
  let speed = 60;
  let timer: number | undefined;
  let followed: string | null = new URLSearchParams(location.search).get("order");
  // Estado de cada equipo en t, calculado una vez por instante (el ciclo de dibujo lo pide en cada cuadro).
  let cacheKey = "";
  let cache = new Map<string, EqNow>();
  const stateOf = (id: string): EqNow | undefined => {
    const k = `${t}|${plan.plan_id}|${list.length}`;
    if (k !== cacheKey) {
      cacheKey = k;
      cache = new Map(EQ.map((q) => [q.id, equipmentAt(model, plan, list, q, t)]));
    }
    return cache.get(id);
  };

  // ---------------------------------------------------------------- panel lateral: enlaces
  const section = document.createElement("div");
  section.id = "aps-section";
  document.getElementById("schedule-section")!.before(section);
  section.innerHTML = `
    <h3>APS <span class="dim">· programación de salsas</span></h3>
    <div id="sp-down"></div>
    <div class="sim-controls"><a class="btn-link" href="/aps-salsas.html" target="_blank" rel="noopener">▦ ABRIR APS · PEDIDOS Y GANTT</a></div>
    <div class="sim-controls"><a class="btn-link alt" href="/emulador-salsas.html" target="_blank" rel="noopener">◫ EMULADOR DE PLANTA · 2D</a></div>
    <div class="sim-controls"><a class="btn-link" href="/control-salsas.html" target="_blank" rel="noopener">◉ CENTRO DE CONTROL</a></div>`;

  // ---------------------------------------------------------------- barra de tiempo
  const bar = document.createElement("section");
  bar.className = "glass twin-time";
  bar.innerHTML = `
    <div class="tt-controls">
      <button id="tt-play" title="Reproducir la programación">▶</button>
      <button id="tt-live" class="active" title="Volver a AHORA (día 9, 10:00)">● AHORA</button>
      <select id="tt-speed" title="Velocidad de reproducción">${SPEEDS.map(([v, l]) => `<option value="${v}"${v === speed ? " selected" : ""}>${l}</option>`).join("")}</select>
      <span class="aps-chip" id="tt-plan" title="Programación vigente del APS de salsas"></span>
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
    <div class="to-head"><button class="label to-toggle" id="to-toggle" title="Mostrar u ocultar lo que corre en la planta">▾ EN EL GEMELO</button>
      <select id="to-pick" title="Seguir un pedido con el play"><option value="">seguir un pedido…</option></select></div>
    <div id="to-followed"></div>
    <div class="label to-sub" id="to-now-title"></div>
    <div id="to-now"></div>`;
  document.body.appendChild(ordersBox);
  if (window.matchMedia("(max-width: 700px)").matches) {
    ordersBox.classList.add("min");
    document.getElementById("to-toggle")!.textContent = "▸ EN EL GEMELO";
  }
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const range = $<HTMLInputElement>("tt-range");
  const span = to - from;
  let days = "";
  for (let d = from; d < to; d += 1440) {
    const work = model.calendar.isWorkday(d);
    days += `<span class="${work ? "" : "off"}" style="left:${((100 * (d - from)) / span).toFixed(2)}%;width:${((100 * 1440) / span).toFixed(2)}%">${esc(dayLabel(d, start).split(" · ")[0].replace("día ", "d"))}</span>`;
  }
  $("tt-days").innerHTML = `${days}<i class="tt-past" style="width:${((100 * (live() - from)) / span).toFixed(2)}%"></i><i class="tt-now" style="left:${((100 * (live() - from)) / span).toFixed(2)}%"></i>`;

  // ---------------------------------------------------------------- letreros sobre los equipos
  const labels = new Map<string, { sprite: THREE.Sprite; canvas: HTMLCanvasElement; key: string }>();
  for (const q of EQ) {
    const root = opts.rootOf(q.id);
    if (!root) continue;
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 196;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    const box = new THREE.Box3().setFromObject(root);
    sprite.position.set((box.min.x + box.max.x) / 2, box.max.y + 2.2, (box.min.z + box.max.z) / 2);
    sprite.renderOrder = 10;
    sprite.onBeforeRender = (renderer, _scene, camera) => {
      const cam = camera as THREE.PerspectiveCamera;
      const dist = cam.position.distanceTo(sprite.position);
      const viewH = renderer.getSize(new THREE.Vector2()).y || 1;
      const px = Math.min(96, Math.max(52, viewH * 0.07));
      const eff = Math.min(LABEL_FAR, Math.max(dist, 0.001));
      const near = dist < LABEL_NEAR ? dist / LABEL_NEAR : 1;
      const h = (px * near * 2 * eff * Math.tan((cam.fov * Math.PI) / 360)) / viewH;
      sprite.scale.set((h * 512) / 196, h, 1);
      sprite.updateMatrixWorld();
    };
    opts.scene.add(sprite);
    labels.set(q.id, { sprite, canvas, key: "" });
  }

  function paint(): void {
    for (const [id, l] of labels) {
      const q = byId.get(id)!;
      const s = stateOf(id)!;
      const r = s.row;
      const isBatch = !!r?.batch_id && q.role !== "llenadora";
      const order = r ? plan.orders.find((o) => o.id === r.order) : undefined;
      const line2 = r ? (isBatch ? `${r.batch_id?.replace(/^TND-/, "")} · ${BULK_NAME[r.product] ?? r.product}` : `${r.order} · ${(order?.product_name ?? r.product).slice(0, 18)}`) : s.ev ? (s.state === "blocked" ? `por ${s.ev.equipment}: ${s.ev.reason.toLowerCase()}` : s.ev.reason) : (s.why ?? "");
      const line3 = s.change ? `${CHANGE_NAMES[s.change.kind] ?? s.change.kind} → ${iso(s.change.until, tz).slice(11, 16)}` : r && q.role !== "apoyo" ? `${num(doneOf(model, r, t))} / ${num(r.quantity)} ${r.unit}` : "";
      const k = r ? progressOf(model, r, t) : 0;
      const mark = followed !== null && plan.schedule.some((x) => x.order === followed && (x.equipment === id || (x.batch_id && r?.batch_id === x.batch_id)));
      const key = `${s.state}|${line2}|${line3}|${Math.round(k * 50)}|${mark}`;
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
      // Cada línea se achica hasta caber en el letrero.
      const fit = (text: string, weight: string, size: number, family: string, y: number, color: string) => {
        let px = size;
        do g.font = `${weight} ${px}px ${family}`;
        while (g.measureText(text).width > 468 && --px > 16);
        g.fillStyle = color;
        g.fillText(text, 22, y);
      };
      fit(`${mark ? "★ " : ""}${id.toUpperCase()} · ${STATE_NAMES[s.state]}`, "700", 32, "Inter, sans-serif", 46, STATE_COLORS[s.state]);
      fit(line2, "600", 29, "'IBM Plex Mono', monospace", 88, "#F8FAFC");
      fit(line3, "500", 27, "Inter, sans-serif", 128, "#aab0be");
      if (r && !s.change && q.role !== "apoyo") {
        g.fillStyle = "rgba(255,255,255,0.10)";
        g.fillRect(22, 146, 468, 24);
        g.fillStyle = STATE_COLORS[s.state];
        g.fillRect(22, 146, 468 * k, 24);
      }
      (l.sprite.material.map as THREE.CanvasTexture).needsUpdate = true;
    }
  }

  // ---------------------------------------------------------------- lo que corre y el pedido seguido
  let pickKey = "";
  function paintOrders(): void {
    const pick = $<HTMLSelectElement>("to-pick");
    const inWindow = plan.orders.filter((o) => parseLocal(o.completion) > from && parseLocal(o.start) < to).sort((a, b) => a.start.localeCompare(b.start));
    const k = `${plan.plan_id}|${inWindow.length}|${followed}`;
    if (k !== pickKey) {
      pickKey = k;
      pick.innerHTML = `<option value="">seguir un pedido… (${inWindow.length})</option>${inWindow.map((o) => `<option value="${esc(o.id)}"${o.id === followed ? " selected" : ""}>${esc(o.id)} · ${esc(o.product_name)}</option>`).join("")}`;
    }
    const bar2 = (x: number) => `<span class="to-bar"><i style="width:${Math.min(100, x * 100).toFixed(1)}%"></i></span>`;
    const o = followed ? plan.orders.find((x) => x.id === followed) : undefined;
    if (o) {
      const fills = plan.schedule.filter((r) => r.order === o.id && model.fillers.includes(r.equipment));
      const batches = [...new Set(fills.map((r) => r.batch_id).filter(Boolean))];
      const cooked = plan.schedule.filter((r) => r.batch_id && batches.includes(r.batch_id) && !model.fillers.includes(r.equipment));
      const done = Math.min(o.quantity, fills.reduce((n, r) => n + doneOf(model, r, t), 0));
      const first = Math.min(...[...cooked, ...fills].map((r) => parseLocal(r.start)));
      const state = done >= o.quantity ? "TERMINADO" : t < first ? "PENDIENTE" : "EN PROCESO";
      const kgDone = cooked.reduce((n, r) => n + doneOf(model, r, t), 0);
      const kgAll = cooked.reduce((n, r) => n + r.quantity, 0);
      $("to-followed").innerHTML = `<div class="to-card">
        <div class="to-title"><b>${esc(o.id)}</b> · ${esc(o.product_name)} <span class="to-state ${state === "EN PROCESO" ? "run" : state === "TERMINADO" ? "done" : ""}">${state}</span></div>
        <div class="to-qty"><b>${num(done)}</b> de ${num(o.quantity)} ${esc(o.unit)} llenadas ${bar2(done / Math.max(1, o.quantity))}</div>
        <small class="dim">${esc(o.customer)} · entrega ${esc(when(o.due))} · fin programado ${esc(when(o.completion))}</small>
        ${cooked.length ? `<div class="to-stage"><span>cocción o emulsión · ${esc(batches.length)} tanda${batches.length === 1 ? "" : "s"} (compartidas)</span><span>${num(kgDone)} / ${num(kgAll)} kg</span>${bar2(kgDone / Math.max(1, kgAll))}<small>${esc([...new Set(cooked.map((r) => r.equipment))].join(" · "))}</small></div>` : ""}
        <div class="to-stage"><span>llenado</span><span>${num(done)} / ${num(o.quantity)}</span>${bar2(done / Math.max(1, o.quantity))}<small>${esc([...new Set(fills.map((r) => r.equipment))].join(" · "))}</small></div></div>`;
    } else $("to-followed").innerHTML = "";
    const running: { id: string; what: string; done: number; qty: number; unit: string; order?: string }[] = [];
    for (const q of EQ) {
      if (q.role === "apoyo") continue;
      const s = stateOf(q.id)!;
      if (!s.row || s.state !== "run") continue;
      const isBatch = q.role !== "llenadora";
      running.push({ id: q.id, what: isBatch ? `${s.row.batch_id ?? ""} · ${BULK_NAME[s.row.product] ?? s.row.product}` : `${s.row.order} · ${s.row.product}`, done: doneOf(model, s.row, t), qty: s.row.quantity, unit: s.row.unit, ...(isBatch ? {} : { order: s.row.order }) });
    }
    $("to-now-title").textContent = `CORRIENDO EN EL GEMELO · ${running.length}`;
    $("to-now").innerHTML = running.length
      ? running.map((x) => `<button class="to-row${x.order && x.order === followed ? " sel" : ""}"${x.order ? ` data-order="${esc(x.order)}"` : ""}><span><b>${esc(x.id.toUpperCase())}</b> ${esc(x.what.slice(0, 30))}</span><span>${num(x.done)} / ${num(x.qty)} ${esc(x.unit)}</span>${bar2(x.done / Math.max(1, x.qty))}</button>`).join("")
      : `<div class="dim">nada corre a esta hora (fuera de turno, limpieza o equipos detenidos)</div>`;
    $("to-now").querySelectorAll<HTMLButtonElement>(".to-row[data-order]").forEach((b) => (b.onclick = () => follow(b.dataset.order === followed ? null : b.dataset.order!)));
  }

  function follow(id: string | null): void {
    followed = id;
    for (const l of labels.values()) l.key = "";
    show();
  }

  let lastPublish = 0;
  function publishClock(force = false): void {
    if (playing && !force && Date.now() - lastPublish < 500) return;
    lastPublish = Date.now();
    setSharedClock(atNow ? null : iso(t, tz));
  }

  function show(): void {
    range.value = String(t);
    const n = live();
    $("tt-when").textContent = `${dayLabel(t, start)} ${iso(t, tz).slice(11, 16)}`;
    $("tt-zone").textContent = atNow ? "AHORA" : t < n - 1 ? "PASADO · ejecutado" : t > n + 1 ? "FUTURO · programado" : "AHORA";
    $("tt-zone").className = atNow ? "live" : t < n ? "past" : "future";
    $("tt-live").classList.toggle("active", atNow);
    $("tt-play").textContent = playing ? "❚❚" : "▶";
    $("tt-plan").textContent = `VIGENTE · ${plan.plan_id}`;
    const down = eventsAt(list, t).map((e) => e.equipment);
    opts.markDown(down);
    $("sp-down").innerHTML = eventsAt(list, t)
      .map((e) => `<p class="aps-down" title="${esc(e.reason)}">⚠ ${esc(e.equipment.toUpperCase())} fuera de servicio · ${e.kind === "falla" ? "falla" : "paro de emergencia"}</p>`)
      .join("");
    paint();
    paintOrders();
    publishClock();
    opts.refreshAsset();
  }

  function setTime(x: number, now = false): void {
    t = Math.max(from, Math.min(to, x));
    atNow = now;
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
    publishClock(true);
  };
  $("to-toggle").onclick = () => {
    const min = ordersBox.classList.toggle("min");
    $("to-toggle").textContent = `${min ? "▸" : "▾"} EN EL GEMELO`;
  };
  $<HTMLSelectElement>("to-pick").onchange = (e) => follow((e.target as HTMLSelectElement).value || null);
  $<HTMLSelectElement>("tt-speed").onchange = (e) => (speed = Number((e.target as HTMLSelectElement).value));
  $("tt-play").onclick = () => {
    if (playing) {
      stop();
      show();
      publishClock(true);
      return;
    }
    if (t >= to) t = from;
    playing = true;
    atNow = false;
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

  // PLC del equipo seleccionado en el instante del play.
  opts.setAssetExtra((id) => {
    const q = byId.get(id);
    if (!q) return "";
    const s = stateOf(id)!;
    const o = oeeAt(model, plan, list, q, t);
    const ld = weekLoad(model, plan, list, q, t);
    const r = s.row;
    const pct = (x: number) => `${num(x * 100, 1)} %`;
    const tag = (k: string, v: string) => `<div><span>${k}</span><span>${v}</span></div>`;
    const isBatch = q.role !== "llenadora";
    const day = dayLoads(model, plan, list, q, t)[0];
    return `<div class="plc-card" style="--st:${STATE_COLORS[s.state]}">
      <div class="label">PLC · ${esc(id.toUpperCase())} <span class="dim">· ${esc(dayLabel(t, start))} ${iso(t, tz).slice(11, 16)}</span></div>
      <div class="plc-state">${STATE_NAMES[s.state]}</div>
      <div class="vars">
        ${s.change ? tag("en curso", `${esc(CHANGE_NAMES[s.change.kind] ?? s.change.kind)} hasta ${iso(s.change.until, tz).slice(11, 16)}`) : ""}
        ${tag(isBatch ? "tanda" : "pedido", r ? esc(isBatch ? r.batch_id : r.order) : "—")}
        ${tag(isBatch ? "receta" : "producto", r ? esc(r.product) : "—")}
        ${tag(isBatch ? "kilos de la tanda" : "unidades del llenado", r ? `${num(doneOf(model, r, t))} / ${num(r.quantity)} ${esc(r.unit)}` : "—")}
        ${signals(model, q, s, t).map((x) => tag(x.label.toLowerCase(), `${num(x.value, x.digits ?? 0)} ${esc(x.unit)}`)).join("")}
        ${tag("OEE del turno", o ? `<b>${pct(o.oee)}</b> · ${pct(o.availability)} · ${pct(o.performance)} · ${pct(o.quality)}` : "—")}
        ${q.role !== "apoyo" && day ? tag("ocupación · día", `<b style="color:${loadColor(day.occupancy)}">${pct(day.occupancy)}</b> · disp. ${pct(day.availability)}`) : ""}
        ${q.role !== "apoyo" ? tag("ocupación · semana", `<b style="color:${loadColor(ld.occupancy)}">${pct(ld.occupancy)}</b> · ${num(ld.busyH, 1)} de ${num(ld.availH, 1)} h`) : ""}
        ${s.ev ? tag("alarma", `<b class="bad">${esc(s.ev.equipment)} · ${esc(s.ev.reason)}</b>`) : ""}
      </div>
      <a class="btn-link" href="/emulador-salsas.html?equipment=${esc(id)}" target="_blank" rel="noopener">◫ VER EN EL EMULADOR</a>
    </div>`;
  });

  // Otra configuración de datos activada en el APS: la pantalla se vuelve a armar con ella.
  const cfgId = activeConfig()?.id ?? null;
  onChange((what) => {
    if (what === "config" && (activeConfig()?.id ?? null) !== cfgId) return location.reload();
    if (what === "plan") plan = savedVigente(portfolio.portfolio_id) ?? manual;
    if (what === "events") list = events();
    if (what === "clock") return;
    pickKey = "";
    for (const l of labels.values()) l.key = "";
    show();
  });
  if (followed) follow(followed);
  // Al abrir, el gemelo está en AHORA: el emulador y el centro de control también.
  setSharedClock(null);
  show();

  // ---------------------------------------------------------------- animación de los equipos
  const light = (s: EqNow) => (s.state === "fault" ? 3 : s.state === "blocked" || s.state === "plan" || s.state === "change" ? 2 : s.state === "run" ? 1 : 0);
  return {
    rate: () => (playing ? speed * 60 : 1),
    frameOf(id, time): AnimationFrame | null {
      const q = byId.get(id);
      if (!q) return null;
      const s = stateOf(id)!;
      const on = s.state === "run";
      const k = s.row ? progressOf(model, s.row, t) : 0;
      const base = { state: on ? "running" : s.state === "fault" ? "fault" : "idle", label: id.toUpperCase() };
      switch (q.type) {
        case "jacketed_kettle": {
          const heat = on ? Math.min(1, 0.06 + (k / 0.4) * 0.74) : s.state === "change" ? 0.6 : 0.1;
          return { ...base, channels: { level: on ? 0.85 : s.state === "change" ? 0.25 : 0.05, agitator_rpm: on ? 45 : 0, steam: on && k < 0.4 ? 0.9 : on ? 0.35 : 0, cooling: 0, product_heat: heat, charging: on && k < 0.05 ? 1 : 0, discharging: on && k > 0.95 ? 1 : 0, alarm_light: light(s) } };
        }
        case "fire_tube_boiler":
          return { ...base, channels: { flame: on ? 0.75 + 0.15 * Math.sin(time * 3) : s.state === "fault" ? 0 : 0.2, pressure_norm: on ? 0.8 : s.state === "fault" ? 0 : 0.6, stack: on ? 0.8 : 0.2, alarm_light: light(s) } };
        case "tubular_heat_exchanger":
          return { ...base, channels: { flow: on ? 0.8 : 0, heat: on ? 0.9 : 0.1, divert: 0, steam: on ? 0.7 : 0, alarm_light: light(s) } };
        case "vffs_sachet": {
          // Un ciclo de llenado por cada corte de sachet: avanza la película, dosifica, cierran las mordazas y cae la unidad.
          const rate = model.fillerRate[id] ?? 60;
          const lanes = Number(q.params.lanes ?? 1);
          const cps = on ? rate / lanes / 60 : 0;
          const ph = on ? (time * cps) % 1 : 0;
          return { ...base, phase: on ? "llenando" : null, channels: { film_feed: on ? Math.min(1, ph / 0.35) : 0, jaws: on && ph > 0.35 && ph < 0.75 ? 1 : 0, dosing: on ? Math.max(0, Math.sin(Math.PI * Math.min(1, ph / 0.5))) : 0, roll_remaining: r1(1 - 0.8 * k), unit_drop: on && ph > 0.75 ? (ph - 0.75) / 0.25 : 0, stack_light: light(s) } };
        }
        default:
          return { ...base, channels: { level: on ? 0.8 : 0.1, agitator_rpm: on ? (q.type === "vacuum_emulsifier" ? 2800 : 180) : 0, inflow_active: on ? 0.6 : 0, outflow_active: on && k > 0.9 ? 1 : 0, heating: 0, alarm_light: light(s) } };
      }
    },
  };
}

const r1 = (x: number) => Math.max(0, Math.min(1, x));
