#!/usr/bin/env node
/**
 * Graba las tomas del video de lanzamiento (capturas 1920x1080 y algunos clips cortos).
 *   pnpm gallery   y   uv run uvicorn twin_emulator_api.main:app --port 8000   (en otras terminales)
 *   node tomas.cjs [3d|ui|lapso|clips|todo]
 * Todo queda en assets/tomas/ (no va al repo).
 */
const path = require("node:path");
const fs = require("node:fs");
const { chromium } = require("playwright");

const BASE = (process.env.GALLERY_URL || "http://localhost:5173").replace(/\/$/, "");
const NOW = "now=2026-11-04T10:00";
const OUT = path.join(__dirname, "assets/tomas");
const W = 1920, H = 1080;
const which = process.argv[2] || "todo";
fs.mkdirSync(OUT, { recursive: true });
const click = (pg, sel) => pg.$eval(sel, (e) => e.dispatchEvent(new MouseEvent("click", { bubbles: true })));
const PLANT = `/plant.html?plant=plastic-injection-plant-v1&${NOW}&lighting=${process.env.LUZ || "night"}`;

// Vistas de cámara del gemelo: [x, y, z de la cámara, x, y, z del punto mirado] en metros de la planta.
const VISTAS = {
  "3d-heroe": [10, -18, 42, 82, 46, 0],
  "3d-este": [185, 5, 48, 85, 50, 0],
  "3d-inyectoras": [47, 26, 14, 63, 46, 1],
  "3d-medio": [58, 12, 24, 76, 50, 0],
  "3d-inyectoras-2": [100, 70, 9, 85, 56, 2],
  "3d-silos": [32, 30, 14, 8, 53, 7],
  "3d-cenital": [85, 44, 120, 85, 45, 0],
};

async function abrir3d(pg, extra = "") {
  await pg.goto(BASE + PLANT + extra, { waitUntil: "networkidle", timeout: 300000 });
  await pg.waitForFunction(() => !document.body.classList.contains("loading"), null, { timeout: 300000 });
  await pg.waitForTimeout(6000);
}
const foto = (pg, name) => pg.screenshot({ path: path.join(OUT, name), timeout: 240000 }).then(() => console.log(name));

// Otras plantas, para mostrar que el gemelo sirve en cualquier industria.
const OTRAS = [["sauce-plant-v1", "3d-salsas"], ["corrugated-box-plant-v1", "3d-cajas"], ["garment-factory-v1", "3d-confecciones"], ["airport-baggage-v1", "3d-aeropuerto"]];

async function tomas3d(browser) {
  for (const [id, name] of OTRAS) {
    const pg = await browser.newPage({ viewport: { width: W, height: H } });
    await pg.goto(`${BASE}/plant.html?plant=${id}&shot=1&lighting=night`, { waitUntil: "networkidle", timeout: 300000 });
    await pg.waitForFunction(() => !document.body.classList.contains("loading"), null, { timeout: 300000 });
    await pg.waitForTimeout(6000);
    await foto(pg, `${name}.png`);
    await pg.close();
  }
  for (const [name, v] of Object.entries(VISTAS)) {
    const pg = await browser.newPage({ viewport: { width: W, height: H } });
    await abrir3d(pg, `&shot=1&look=${v.join(",")}`);
    await foto(pg, `${name}.png`);
    await pg.close();
  }
  // Con la interfaz: panel del play y órdenes.
  const pg = await browser.newPage({ viewport: { width: W, height: H } });
  await abrir3d(pg, `&select=imm-21&look=${VISTAS["3d-heroe"].join(",")}`);
  await foto(pg, "3d-ui.png");
  await pg.close();
}

// Lapso: el play del gemelo avanzado de a 15 min, una foto por paso.
async function lapso(browser) {
  const dir = path.join(OUT, "lapso");
  fs.mkdirSync(dir, { recursive: true });
  const pg = await browser.newPage({ viewport: { width: W, height: H } });
  await abrir3d(pg, `&shot=1&look=${(process.env.LAPSO_LOOK || VISTAS["3d-inyectoras"].join(","))}`);
  const N = Number(process.env.LAPSO_N || 48);
  for (let i = 0; i < N; i++) {
    await pg.$eval("#tt-range", (el) => { el.value = String(Number(el.value) + 15); el.dispatchEvent(new Event("input")); });
    await pg.waitForTimeout(700);
    await pg.screenshot({ path: path.join(dir, `f${String(i).padStart(3, "0")}.png`), timeout: 240000 });
  }
  console.log("lapso", N);
  await pg.close();
}

async function calcular(pg) {
  await click(pg, "#aps-calc");
  await pg.waitForSelector("#aps-objetivo[open]", { timeout: 30000 });
}

async function tomasUi(browser) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
  const pg = await ctx.newPage();
  pg.on("pageerror", (e) => console.error("error de la página:", e.message));
  const go = async (u) => { await pg.goto(BASE + u, { waitUntil: "networkidle", timeout: 240000 }); await pg.waitForTimeout(1500); };
  await go(`/aps.html?${NOW}&reset=1`);
  await foto(pg, "ui-aps-pedidos.png");
  await click(pg, "[data-tab=gantt]");
  await pg.waitForTimeout(1200);
  await foto(pg, "ui-aps-gantt-manual.png");
  await calcular(pg);
  await pg.waitForTimeout(800);
  await foto(pg, "ui-aps-objetivo.png");
  await pg.$$eval("#aps-obj-list input", (xs) => xs.forEach((i) => i.checked !== (i.value === "entregas") && i.click()));
  await click(pg, "#aps-obj-go");
  await pg.waitForSelector("#aps-adopt", { timeout: 120000 });
  await pg.waitForTimeout(1200);
  await foto(pg, "ui-aps-propuesta.png");
  await click(pg, "#aps-adopt");
  await pg.waitForTimeout(1500);
  await foto(pg, "ui-aps-gantt.png");
  await go(`/control.html?${NOW}`);
  await pg.waitForTimeout(2500);
  await foto(pg, "ui-control.png");
  await go(`/aps.html?${NOW}`);
  await click(pg, "[data-tab=fractal]");
  await pg.waitForTimeout(1000);
  await click(pg, "#fr-run-balancear");
  await pg.waitForSelector(".fr-result", { timeout: 120000 });
  await pg.waitForTimeout(1500);
  await foto(pg, "ui-fractal.png");
  await go(`/arquitectura.html`);
  await foto(pg, "ui-arquitectura.png");
  await go(`/emulador.html?${NOW}`);
  await foto(pg, "ui-emulador.png");
  await ctx.close();
}

// Clip: arrastrar una orden en el Gantt y fijarla (video WebM real de la interfaz).
async function clips(browser) {
  const dir = path.join(OUT, "clip-tmp");
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir, size: { width: W, height: H } } });
  const pg = await ctx.newPage();
  await pg.goto(BASE + `/aps.html?${NOW}`, { waitUntil: "networkidle", timeout: 240000 });
  await click(pg, "[data-tab=gantt]");
  await pg.waitForTimeout(1500);
  const t0 = Date.now();
  const bar = await (await pg.$(".g-bar.drag[data-move-order]")).boundingBox();
  const id = await pg.$eval(".g-bar.drag[data-move-order]", (e) => e.dataset.moveOrder);
  await pg.mouse.move(bar.x + 40, bar.y + 12);
  await pg.waitForTimeout(400);
  await pg.mouse.down();
  await pg.mouse.move(bar.x + 120, bar.y + 12, { steps: 20 });
  await pg.mouse.move(bar.x + 200, bar.y + 12, { steps: 25 });
  await pg.mouse.up();
  await pg.waitForTimeout(1500);
  const lock = `.g-lock[data-lock="${id}"]`;
  if (await pg.$(lock)) { await click(pg, lock); await pg.waitForTimeout(1500); }
  const dur = (Date.now() - t0) / 1000;
  const video = pg.video();
  await ctx.close();
  fs.renameSync(await video.path(), path.join(OUT, "clip-gantt-arrastrar.webm"));
  fs.writeFileSync(path.join(OUT, "clip-gantt-arrastrar.json"), JSON.stringify({ desde_final: dur }));
  fs.rmSync(dir, { recursive: true, force: true });
  console.log("clip-gantt-arrastrar.webm", dur);
}

(async () => {
  const browser = await chromium.launch();
  try {
    if (which === "3d" || which === "todo") await tomas3d(browser);
    if (which === "ui" || which === "todo") await tomasUi(browser);
    if (which === "clips" || which === "todo") await clips(browser);
    if (which === "lapso" || which === "todo") await lapso(browser);
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
