#!/usr/bin/env node
/**
 * Tomas del video "La IA en cada módulo" en los dos formatos.
 *   pnpm gallery   y   uv run uvicorn twin_emulator_api.main:app --port 8000   (en otras terminales)
 *   node tomas.cjs [3d|vuelo|ui|todo]
 * El 3D se captura en vertical (assets/tomas/v/) y en horizontal (assets/tomas/h/); las pantallas de la interfaz
 * solo en horizontal (assets/tomas/ui/). Nada de esto va al repo.
 */
const path = require("node:path");
const fs = require("node:fs");
const { chromium } = require("playwright");

const BASE = (process.env.GALLERY_URL || "http://localhost:5173").replace(/\/$/, "");
const NOW = "now=2026-11-04T10:00";
const OUT = path.join(__dirname, "assets/tomas");
const FMT = { v: [1080, 1920], h: [1920, 1080] };
const which = process.argv[2] || "todo";
const click = (pg, sel) => pg.$eval(sel, (e) => e.dispatchEvent(new MouseEvent("click", { bubbles: true })));
const PLAST = `/plant.html?plant=plastic-injection-plant-v1&${NOW}&lighting=night`;

// [x, y, z de la cámara, x, y, z del punto mirado] en metros.
const VISTAS = {
  "p-heroe": [10, -18, 42, 82, 46, 0],
  "p-inyectoras": [47, 26, 14, 63, 46, 1],
  "p-medio": [58, 12, 24, 76, 50, 0],
  "p-inyectoras-2": [100, 70, 9, 85, 56, 2],
  "p-silos": [32, 30, 14, 8, 53, 7],
};

async function abrir(pg, url) {
  await pg.goto(BASE + url, { waitUntil: "networkidle", timeout: 300000 });
  await pg.waitForFunction(() => !document.body.classList.contains("loading"), null, { timeout: 300000 });
  await pg.waitForTimeout(6000);
}
const foto = (pg, file) => pg.screenshot({ path: file, timeout: 240000 }).then(() => console.log(path.relative(OUT, file)));

async function tomas3d(browser) {
  for (const [f, [w, h]] of Object.entries(FMT)) {
    const dir = path.join(OUT, f);
    fs.mkdirSync(dir, { recursive: true });
    for (const [name, v] of Object.entries(VISTAS)) {
      const pg = await browser.newPage({ viewport: { width: w, height: h } });
      await abrir(pg, `${PLAST}&shot=1&look=${v.join(",")}`);
      await foto(pg, path.join(dir, `${name}.png`));
      await pg.close();
    }
    const pg = await browser.newPage({ viewport: { width: w, height: h } });
    await abrir(pg, `${PLAST}&look=${VISTAS["p-medio"].join(",")}`);
    await foto(pg, path.join(dir, "p-ui.png"));
    await pg.close();
  }
}

/** Vuelo de cámara sobre la planta de plásticos (N cuadros a 25 fps). */
async function vuelo(browser) {
  const A = [-10, -40, 70, 80, 46, 0], B = [20, -6, 30, 82, 48, 0];
  const N = Number(process.env.VUELO_N || 125);
  for (const [f, [w, h]] of Object.entries(FMT)) {
    const dir = path.join(OUT, f, "vuelo");
    fs.mkdirSync(dir, { recursive: true });
    const pg = await browser.newPage({ viewport: { width: w, height: h } });
    await abrir(pg, `${PLAST}&shot=1&look=${A.join(",")}`);
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1), e = t * t * (3 - 2 * t);
      await pg.evaluate((l) => window.__look(l), A.map((a, k) => a + (B[k] - a) * e));
      await pg.waitForTimeout(120);
      await pg.screenshot({ path: path.join(dir, `f${String(i).padStart(3, "0")}.png`), timeout: 240000 });
    }
    console.log(f, "vuelo", N);
    await pg.close();
  }
}

async function tomasUi(browser) {
  const dir = path.join(OUT, "ui");
  fs.mkdirSync(dir, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const pg = await ctx.newPage();
  pg.on("pageerror", (e) => console.error("error de la página:", e.message));
  const go = async (u, w = 1500) => { await pg.goto(BASE + u, { waitUntil: "networkidle", timeout: 240000 }); await pg.waitForTimeout(w); };
  await go(`/aps.html?${NOW}&reset=1`);
  await click(pg, "[data-tab=gantt]");
  await pg.waitForTimeout(1500);
  await foto(pg, path.join(dir, "aps-gantt.png"));
  await go(`/control.html?${NOW}`, 4000);
  await foto(pg, path.join(dir, "control.png"));
  await go(`/equipos.html`, 6000);
  await foto(pg, path.join(dir, "equipos.png"));
  await go(`/emulador.html?${NOW}`, 3000);
  await foto(pg, path.join(dir, "emulador.png"));
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch();
  try {
    if (which === "ui" || which === "todo") await tomasUi(browser);
    if (which === "3d" || which === "todo") await tomas3d(browser);
    if (which === "vuelo" || which === "todo") await vuelo(browser);
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
