/**
 * Presentaciones de la demo de plásticos (presentaciones.html), una por escenario. Se arman solas con los guiones y
 * capturas de docs/demo-plasticos/: si cambian, el siguiente despliegue ya las trae.
 *
 * Láminas: portada, una por segmento del guion (captura, lo que se señala y las notas del orador) y cierre con las
 * cifras del frontmatter (`cifras`). Teclas: ← → o espacio para avanzar, N notas, F pantalla completa, Esc volver.
 * Cada lámina tiene ABRIR EN VIVO: la pantalla real que muestra la captura. `?esc=2&s=4` abre una lámina.
 */
import "./styles.css";
import "./aps.css";
import yaml from "js-yaml";
import { esc } from "./schedule.ts";

interface Segment {
  id: string;
  title: string;
  img: string;
  duration: string;
  screen: string;
  text: string;
}
interface Scenario {
  key: string;
  n: number;
  title: string;
  message: string;
  duration: string;
  numbers: [string, string][];
  segments: Segment[];
}

const guiones = import.meta.glob("../../../docs/demo-plasticos/*/guion.md", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const images = import.meta.glob("../../../docs/demo-plasticos/*/capturas/*.png", { query: "?url", import: "default", eager: true }) as Record<string, string>;

function parse(path: string, text: string): Scenario {
  const key = path.split("/").at(-2)!;
  const fm = text.match(/^---\n([\s\S]*?)\n---/);
  const meta = (fm ? yaml.load(fm[1]) : {}) as { title?: string; duracion_aprox?: string; cifras?: [string, string][] };
  const segments: Segment[] = [];
  const re = /### S(\d+) · (.+)\n- imagen: capturas\/(.+?)\n- duración: (.+)\n- en pantalla: (.+)\n\n((?:> .*\n?)+)/g;
  for (const m of text.matchAll(re)) {
    const img = images[`../../../docs/demo-plasticos/${key}/capturas/${m[3]}`];
    segments.push({ id: m[1], title: m[2], img: img ?? "", duration: m[4], screen: m[5], text: m[6].replace(/^> /gm, "").replace(/\n/g, " ").trim() });
  }
  return {
    key,
    n: Number(key.split("-")[0]),
    title: (text.match(/^# Escenario \d+ · (.+)$/m)?.[1] ?? meta.title ?? key).trim(),
    message: (text.match(/^Mensaje central: (.+)$/m)?.[1] ?? "").replace(/^./, (c) => c.toUpperCase()),
    duration: meta.duracion_aprox ?? "",
    numbers: meta.cifras ?? [],
    segments,
  };
}

const SCENARIOS = Object.entries(guiones)
  .map(([p, t]) => parse(p, t))
  .sort((a, b) => a.n - b.n);

/** La pantalla real que muestra una captura, por su nombre. */
function liveUrl(img: string): { href: string; label: string } {
  const name = img.split("/").at(-1) ?? "";
  if (/gemelo/.test(name)) return { href: "/plant.html?plant=plastic-injection-plant-v1", label: "GEMELO 3D" };
  if (/centro-control/.test(name)) return { href: "/control.html", label: "CENTRO DE CONTROL" };
  if (/emulador|falla|plc/.test(name)) return { href: "/emulador.html", label: "EMULADOR" };
  if (/fractal/.test(name)) return { href: "/aps.html?tab=fractal", label: "APS · FRACTAL" };
  if (/insumos/.test(name)) return { href: "/aps.html?tab=insumos", label: "APS · INSUMOS" };
  if (/pedidos/.test(name)) return { href: "/aps.html?tab=orders", label: "APS · PEDIDOS" };
  return { href: "/aps.html?tab=gantt", label: "APS · GANTT" };
}

const main = document.getElementById("pr-main")!;
const url = new URLSearchParams(location.search);
let current: Scenario | null = SCENARIOS.find((s) => s.n === Number(url.get("esc"))) ?? null;
let slide = Number(url.get("s") ?? 0) || 0;
let notes = url.get("notas") !== "0";

function index(): void {
  main.innerHTML = `
    <p class="pr-intro">Cuatro escenarios de la planta de inyección de plásticos. Cada presentación sigue el guion de la demo con sus capturas;
    en cualquier lámina, <b>ABRIR EN VIVO</b> lleva a la pantalla real. Hoy es el día 9 de la programación.</p>
    <div class="pr-cards">${SCENARIOS.map(
      (s) => `<button class="pr-card" data-esc="${s.n}">
        <span class="pr-n">ESCENARIO ${s.n}</span>
        <b>${esc(s.title)}</b>
        <span class="dim">${esc(s.message)}</span>
        ${s.segments[0]?.img ? `<img src="${s.segments[0].img}" alt="" loading="lazy" />` : ""}
        <span class="pr-meta">${s.segments.length + 2} láminas · ${esc(s.duration)}</span>
      </button>`,
    ).join("")}</div>
    <p class="dim pr-keys">Teclas: ← → o espacio para avanzar · N notas del orador · F pantalla completa · Esc volver.</p>`;
  main.querySelectorAll<HTMLButtonElement>(".pr-card").forEach((b) => (b.onclick = () => open(SCENARIOS.find((s) => s.n === Number(b.dataset.esc))!, 0)));
}

function open(s: Scenario | null, k: number): void {
  current = s;
  slide = k;
  const q = new URLSearchParams();
  if (s) {
    q.set("esc", String(s.n));
    if (k) q.set("s", String(k));
  }
  history.replaceState(null, "", `${location.pathname}${q.toString() ? `?${q}` : ""}`);
  render();
}

function render(): void {
  if (!current) return index();
  const s = current;
  const total = s.segments.length + 2;
  slide = Math.max(0, Math.min(total - 1, slide));
  let body = "";
  let note = "";
  let live: { href: string; label: string } | null = null;
  if (slide === 0) {
    body = `<div class="pr-cover"><span class="pr-n">ESCENARIO ${s.n} · PLANTA DE PLÁSTICOS</span><h1>${esc(s.title)}</h1><p>${esc(s.message)}</p>
      <ol>${s.segments.map((g) => `<li>${esc(g.title)}</li>`).join("")}</ol></div>`;
    note = s.message;
  } else if (slide === total - 1) {
    body = `<div class="pr-cover pr-close"><span class="pr-n">ESCENARIO ${s.n} · RESULTADO</span><h1>${esc(s.title)}</h1>
      <div class="pr-nums">${s.numbers.map(([a, b]) => `<div><b>${esc(a)}</b><span>${esc(b)}</span></div>`).join("")}</div>
      <p class="dim">Fractal recomienda; la persona decide.</p></div>`;
  } else {
    const g = s.segments[slide - 1];
    live = liveUrl(g.img);
    body = `<div class="pr-seg"><div class="pr-seg-head"><span class="pr-n">S${esc(g.id)}</span><h2>${esc(g.title)}</h2></div>
      <img src="${g.img}" alt="${esc(g.title)}" />
      <p class="pr-screen">▸ ${esc(g.screen)}</p></div>`;
    note = g.text;
  }
  main.innerHTML = `
    <section class="pr-stage">
      <div class="pr-bar">
        <button id="pr-home" title="Volver a las presentaciones (Esc)">☰ ESCENARIOS</button>
        <span class="pr-where">ESCENARIO ${s.n} · ${esc(s.title)}</span>
        ${live ? `<a class="btn-link pr-live" href="${live.href}" target="_blank" rel="noopener">● ABRIR EN VIVO · ${live.label}</a>` : ""}
        <button id="pr-notes" class="${notes ? "active" : ""}" title="Notas del orador (N)">NOTAS</button>
        <button id="pr-full" title="Pantalla completa (F)">⛶</button>
      </div>
      <div class="pr-slide">${body}</div>
      ${notes && note ? `<div class="pr-notes"><span class="label">NOTAS DEL ORADOR</span><p>${esc(note)}</p></div>` : ""}
      <div class="pr-nav">
        <button id="pr-prev" ${slide === 0 ? "disabled" : ""}>←</button>
        <div class="pr-dots">${Array.from({ length: total }, (_, i) => `<i class="${i === slide ? "on" : ""}" data-k="${i}"></i>`).join("")}</div>
        <span class="pr-count">${slide + 1} / ${total}</span>
        <button id="pr-next" ${slide === total - 1 ? "disabled" : ""}>→</button>
      </div>
    </section>`;
  const $ = (id: string) => document.getElementById(id)!;
  $("pr-home").onclick = () => open(null, 0);
  $("pr-prev").onclick = () => open(s, slide - 1);
  $("pr-next").onclick = () => open(s, slide + 1);
  $("pr-notes").onclick = () => {
    notes = !notes;
    render();
  };
  $("pr-full").onclick = () => toggleFull();
  main.querySelectorAll<HTMLElement>(".pr-dots i").forEach((d) => (d.onclick = () => open(s, Number(d.dataset.k))));
}

function toggleFull(): void {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen?.();
}

document.addEventListener("keydown", (e) => {
  if (!current || e.target instanceof HTMLInputElement) return;
  if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") open(current, slide + 1);
  else if (e.key === "ArrowLeft" || e.key === "PageUp") open(current, slide - 1);
  else if (e.key === "Home") open(current, 0);
  else if (e.key === "End") open(current, current.segments.length + 1);
  else if (e.key.toLowerCase() === "n") {
    notes = !notes;
    render();
  } else if (e.key.toLowerCase() === "f") toggleFull();
  else if (e.key === "Escape" && !document.fullscreenElement) open(null, 0);
  else return;
  e.preventDefault();
});

render();
