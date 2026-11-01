#!/usr/bin/env node
/**
 * Graba la demo de plásticos: capturas (PNG) y, con --video, un recorrido en video (WebM) por escenario.
 *
 *   pnpm gallery                                   # en otra terminal: la galería en http://localhost:5173
 *   pnpm add -g playwright@1.63.0 && pnpm dlx playwright@1.63.0 install chromium   # una vez
 *   NODE_PATH="$(pnpm root -g)" node tools/demo-video/grabar.cjs [1|2|3|todos] [--video] [--lento]
 *
 * Las capturas quedan en docs/demo-plasticos/<escenario>/capturas/ con los nombres que usa cada guion.md; los videos en
 * docs/demo-plasticos/<escenario>/video/recorrido.webm (no se suben al repo: ver .gitignore). AHORA = día 9, 10:00.
 * GALLERY_URL cambia la dirección de la galería (p. ej. el sitio publicado).
 */
const path = require("node:path");
const fs = require("node:fs");
const { chromium } = require("playwright");

const BASE = (process.env.GALLERY_URL || "http://localhost:5173").replace(/\/$/, "");
const NOW = "?now=2026-11-04T10:00";
const ROOT = process.env.DEMO_OUT || path.resolve(__dirname, "../../docs/demo-plasticos");
const args = process.argv.slice(2);
const which = args.find((a) => /^(1|2|3|todos)$/.test(a)) || "todos";
const VIDEO = args.includes("--video");
// En video, pausas largas para que se alcance a leer; --lento las alarga más.
const PACE = VIDEO ? (args.includes("--lento") ? 2.5 : 1.5) : 0.4;
const FOLDERS = { 1: "1-calcular-programacion", 2: "2-cambio-fecha-pedido", 3: "3-contingencia-falla" };

const wait = (pg, s) => pg.waitForTimeout(Math.round(s * 1000 * PACE));
const click = (pg, sel) => pg.$eval(sel, (e) => e.dispatchEvent(new MouseEvent("click", { bubbles: true })));

async function scenario(browser, n, steps) {
  const dir = path.join(ROOT, FOLDERS[n]);
  fs.mkdirSync(path.join(dir, "capturas"), { recursive: true });
  const videoDir = path.join(dir, "video");
  const ctx = await browser.newContext({
    viewport: { width: 1600, height: 900 },
    ...(VIDEO ? { recordVideo: { dir: videoDir, size: { width: 1600, height: 900 } } } : {}),
  });
  const pg = await ctx.newPage();
  pg.on("pageerror", (e) => console.error(`[${n}] error de la página: ${e.message}`));
  const shot = async (name, full = false) => {
    await wait(pg, 1.5);
    await pg.screenshot({ path: path.join(dir, "capturas", name), fullPage: full });
    console.log(`[${n}] ${name}`);
  };
  const go = async (url) => {
    await pg.goto(BASE + url, { waitUntil: "networkidle", timeout: 240000 });
    await wait(pg, 1);
  };
  // Punto de partida común: cartera inicial; los escenarios 2 y 3 parten del plan del cosimulador.
  await go(`/aps.html${NOW}&reset=1`);
  if (n !== 1) {
    await click(pg, "#aps-calc");
    await pg.waitForSelector("#aps-adopt", { timeout: 120000 });
    await click(pg, "#aps-adopt");
  }
  await steps({ pg, go, shot, wait: (s) => wait(pg, s) });
  const video = pg.video();
  await ctx.close();
  if (video) {
    const out = path.join(videoDir, "recorrido.webm");
    fs.renameSync(await video.path(), out);
    console.log(`[${n}] video: ${out}`);
  }
}

async function fractal(pg, run) {
  await click(pg, "[data-tab=fractal]");
  await wait(pg, 1);
  await click(pg, run);
  await pg.waitForSelector(".fr-result", { timeout: 120000 });
}

async function open3d(pg, go, select) {
  await go(`/plant.html?plant=plastic-injection-plant-v1&now=2026-11-04T10:00&select=${select}&look=88,62,0,30`);
  await pg.waitForSelector("#tt-range", { timeout: 300000 });
  await pg.waitForFunction(() => !document.body.classList.contains("loading"), null, { timeout: 300000 });
  await pg.waitForTimeout(8000);
}

const SCENARIOS = {
  1: async ({ pg, go, shot, wait }) => {
    await shot("01-pedidos.png");
    await click(pg, "[data-tab=gantt]");
    await shot("02-gantt-manual.png");
    await go(`/control.html${NOW}`);
    await shot("03-centro-control-manual.png");
    await go(`/aps.html${NOW}`);
    await click(pg, "[data-tab=gantt]");
    await click(pg, "#aps-calc");
    await pg.waitForSelector("#aps-adopt", { timeout: 120000 });
    await shot("04-calcular.png");
    await click(pg, "#aps-adopt");
    await shot("05-gantt-cosimulador.png");
    await go(`/control.html${NOW}`);
    await shot("06-centro-control.png");
    await go(`/aps.html${NOW}`);
    await fractal(pg, "#fr-run-balancear");
    await shot("07-fractal-balancear.png");
    await click(pg, "#fr-adopt");
    await shot("08-gantt-balanceado.png");
    await go(`/control.html${NOW}`);
    await shot("09-centro-control-balanceado.png");
    await go(`/aps.html${NOW}`);
    await click(pg, "[data-tab=insumos]");
    await shot("10-insumos.png");
    await wait(2);
  },
  2: async ({ pg, go, shot, wait }) => {
    await click(pg, "[data-tab=orders]");
    await shot("01-pedidos.png");
    await click(pg, "[data-tab=fractal]");
    await shot("02-fractal-pregunta.png");
    const order = await pg.$eval("#fr-order", (x) => x.value);
    await click(pg, "#fr-run-adelantar");
    await pg.waitForSelector(".fr-result", { timeout: 120000 });
    await shot("03-fractal.png");
    await shot("03b-fractal-full.png", true);
    await click(pg, "#fr-adopt");
    await shot("04-gantt-adoptado.png");
    await go(`/control.html${NOW}&order=${order}`);
    await shot("05-centro-control-orden.png");
    await wait(2);
  },
  3: async ({ pg, go, shot, wait }) => {
    await go(`/emulador.html${NOW}`);
    await shot("01-emulador.png");
    await click(pg, '.emu-m[data-id="imm-21"]');
    await shot("02-plc-imm21.png");
    await pg.selectOption("#emu-hours", "72");
    await click(pg, "#emu-fail");
    await shot("03-falla.png");
    await go(`/control.html${NOW}`);
    await shot("04-centro-control.png");
    await go(`/aps.html${NOW}`);
    await click(pg, "[data-tab=gantt]");
    await shot("05-aps-alerta.png");
    await fractal(pg, "#fr-run-falla");
    await shot("06-fractal.png");
    await shot("06b-fractal-full.png", true);
    await open3d(pg, go, "imm-21");
    await shot("10-gemelo-3d.png");
    await go(`/aps.html${NOW}`);
    await fractal(pg, "#fr-run-falla");
    await click(pg, "#fr-adopt");
    await shot("07-gantt-adoptado.png");
    await go(`/control.html${NOW}`);
    await shot("08-centro-control-despues.png");
    await go(`/emulador.html${NOW}`);
    await shot("09-emulador-despues.png");
    await open3d(pg, go, "imm-20");
    await pg.$eval("#tt-range", (el) => {
      el.value = String(Number(el.value) + 4 * 60);
      el.dispatchEvent(new Event("input"));
    });
    await shot("11-gemelo-3d-despues.png");
    await wait(2);
  },
};

(async () => {
  const browser = await chromium.launch();
  try {
    for (const n of which === "todos" ? [1, 2, 3] : [Number(which)]) await scenario(browser, n, SCENARIOS[n]);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
