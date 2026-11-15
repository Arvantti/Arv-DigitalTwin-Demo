#!/usr/bin/env node
/**
 * Tomas de la serie de videos verticales por módulo (1080x1920).
 *   pnpm gallery   y   uv run uvicorn twin_emulator_api.main:app --port 8000   (en otras terminales)
 *   node tomas.cjs [3d|vuelo|lapso|ui|todo]
 * El 3D se captura en vertical (1080x1920); las pantallas de la interfaz en horizontal (1920x1080), porque así se
 * usan dentro del marco del dispositivo. Todo queda en assets/tomas/ (no va al repo).
 */
const path = require("node:path");
const fs = require("node:fs");
const { chromium } = require("playwright");

const BASE = (process.env.GALLERY_URL || "http://localhost:5173").replace(/\/$/, "");
const NOW = "now=2026-11-04T10:00";
const OUT = path.join(__dirname, "assets/tomas");
const VW = 1080, VH = 1920;
const which = process.argv[2] || "todo";
fs.mkdirSync(OUT, { recursive: true });
const click = (pg, sel) => pg.$eval(sel, (e) => e.dispatchEvent(new MouseEvent("click", { bubbles: true })));
const PLAST = `/plant.html?plant=plastic-injection-plant-v1&${NOW}&lighting=night`;

// Vistas de la planta de plásticos: [x, y, z de la cámara, x, y, z del punto mirado] en metros.
const VISTAS = {
  "p-heroe": [10, -18, 42, 82, 46, 0],
  "p-inyectoras": [47, 26, 14, 63, 46, 1],
  "p-medio": [58, 12, 24, 76, 50, 0],
  "p-inyectoras-2": [100, 70, 9, 85, 56, 2],
  "p-silos": [32, 30, 14, 8, 53, 7],
};
// Otras plantas: una por industria (logística = equipajes, procesos = salsas, servicios = red de bombeo).
const OTRAS = [
  ["sauce-plant-v1", "salsas"],
  ["airport-baggage-v1", "logistica"],
  ["water-network-scale-v1", "red"],
  ["corrugated-box-plant-v1", "cajas"],
];

async function abrir(pg, url) {
  await pg.goto(BASE + url, { waitUntil: "networkidle", timeout: 300000 });
  await pg.waitForFunction(() => !document.body.classList.contains("loading"), null, { timeout: 300000 });
  await pg.waitForTimeout(6000);
}
const foto = (pg, name) => pg.screenshot({ path: path.join(OUT, name), timeout: 240000 }).then(() => console.log(name));

async function tomas3d(browser) {
  for (const [id, name] of OTRAS) {
    const pg = await browser.newPage({ viewport: { width: VW, height: VH } });
    await abrir(pg, `/plant.html?plant=${id}&shot=1&lighting=night`);
    await foto(pg, `${name}.png`);
    await pg.close();
  }
  for (const [name, v] of Object.entries(VISTAS)) {
    const pg = await browser.newPage({ viewport: { width: VW, height: VH } });
    await abrir(pg, `${PLAST}&shot=1&look=${v.join(",")}`);
    await foto(pg, `${name}.png`);
    await pg.close();
  }
  // Con etiquetas de estado de las máquinas (sin la interfaz lateral).
  const pg = await browser.newPage({ viewport: { width: VW, height: VH } });
  await abrir(pg, `${PLAST}&look=${VISTAS["p-medio"].join(",")}`);
  await foto(pg, "p-ui.png");
  await pg.close();
}

/** Vuelo de cámara sobre la planta de plásticos: N cuadros entre dos vistas (25 fps en el video). */
async function vuelo(browser) {
  const dir = path.join(OUT, "vuelo");
  fs.mkdirSync(dir, { recursive: true });
  const A = [-10, -40, 70, 80, 46, 0], B = [20, -6, 30, 82, 48, 0];
  const N = Number(process.env.VUELO_N || 125);
  const pg = await browser.newPage({ viewport: { width: VW, height: VH } });
  await abrir(pg, `${PLAST}&shot=1&look=${A.join(",")}`);
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1), e = t * t * (3 - 2 * t);
    await pg.evaluate((l) => window.__look(l), A.map((a, k) => a + (B[k] - a) * e));
    await pg.waitForTimeout(120);
    await pg.screenshot({ path: path.join(dir, `f${String(i).padStart(3, "0")}.png`), timeout: 240000 });
  }
  console.log("vuelo", N);
  await pg.close();
}

/** Lapso: el play avanzado de a 15 min, una foto por paso. */
async function lapso(browser) {
  const dir = path.join(OUT, "lapso");
  fs.mkdirSync(dir, { recursive: true });
  const pg = await browser.newPage({ viewport: { width: VW, height: VH } });
  await abrir(pg, `${PLAST}&shot=1&look=${VISTAS["p-inyectoras"].join(",")}`);
  const N = Number(process.env.LAPSO_N || 40);
  for (let i = 0; i < N; i++) {
    await pg.$eval("#tt-range", (el) => { el.value = String(Number(el.value) + 15); el.dispatchEvent(new Event("input")); });
    await pg.waitForTimeout(700);
    await pg.screenshot({ path: path.join(dir, `f${String(i).padStart(3, "0")}.png`), timeout: 240000 });
  }
  console.log("lapso", N);
  await pg.close();
}

async function tomasUi(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const pg = await ctx.newPage();
  pg.on("pageerror", (e) => console.error("error de la página:", e.message));
  const go = async (u) => { await pg.goto(BASE + u, { waitUntil: "networkidle", timeout: 240000 }); await pg.waitForTimeout(1500); };
  await go(`/aps.html?${NOW}&reset=1`);
  await foto(pg, "ui-aps-pedidos.png");
  await click(pg, "[data-tab=gantt]");
  await pg.waitForTimeout(1200);
  await foto(pg, "ui-aps-gantt.png");
  await go(`/control.html?${NOW}`);
  await pg.waitForTimeout(2500);
  await foto(pg, "ui-control.png");
  await go(`/arquitectura.html`);
  await foto(pg, "ui-arquitectura.png");
  await go(`/emulador.html?${NOW}`);
  await foto(pg, "ui-emulador.png");
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch();
  try {
    if (which === "3d" || which === "todo") await tomas3d(browser);
    if (which === "ui" || which === "todo") await tomasUi(browser);
    if (which === "vuelo" || which === "todo") await vuelo(browser);
    if (which === "lapso" || which === "todo") await lapso(browser);
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
