#!/usr/bin/env node
/**
 * Graba la demo de plásticos: capturas (PNG) y, con --video, un recorrido en video (WebM) por escenario.
 *
 *   pnpm gallery                                   # en otra terminal: la galería en http://localhost:5173
 *   pnpm add -g playwright@1.63.0 && pnpm dlx playwright@1.63.0 install chromium   # una vez
 *   NODE_PATH="$(pnpm root -g)" node tools/demo-video/grabar.cjs [1|2|3|4|5|6|todos] [--video] [--lento] [--hd]
 *
 * Las capturas quedan en docs/demo-plasticos/<escenario>/capturas/ con los nombres que usa cada guion.md; los videos en
 * docs/demo-plasticos/<escenario>/video/recorrido.webm (no se suben al repo: ver .gitignore). AHORA = día 9, 10:00.
 * GALLERY_URL cambia la dirección de la galería (p. ej. el sitio publicado).
 * --hd graba a 1920×1080 (para el video horizontal); con --video deja además video/marcas.json con el segundo del
 * recorrido en que se tomó cada captura, para cortar el tramo de video que lleva a ella.
 */
const path = require("node:path");
const fs = require("node:fs");
const { chromium } = require("playwright");

const BASE = (process.env.GALLERY_URL || "http://localhost:5173").replace(/\/$/, "");
const NOW = "?now=2026-11-04T10:00";
const ROOT = process.env.DEMO_OUT || path.resolve(__dirname, "../../docs/demo-plasticos");
const args = process.argv.slice(2);
const which = args.find((a) => /^(1|2|3|4|5|6|todos)$/.test(a)) || "todos";
const VIDEO = args.includes("--video");
// En video, pausas largas para que se alcance a leer; --lento las alarga más.
const PACE = VIDEO ? (args.includes("--lento") ? 2.5 : 1.5) : 0.4;
const SIZE = args.includes("--hd") ? { width: 1920, height: 1080 } : { width: 1600, height: 900 };
const FOLDERS = { 1: "1-calcular-programacion", 2: "2-cambio-fecha-pedido", 3: "3-contingencia-falla", 4: "4-pedidos-fijados", 5: "5-menos-cambios", 6: "versiones" };

const wait = (pg, s) => pg.waitForTimeout(Math.round(s * 1000 * PACE));
const click = (pg, sel) => pg.$eval(sel, (e) => e.dispatchEvent(new MouseEvent("click", { bubbles: true })));

async function scenario(browser, n, steps) {
  const dir = path.join(ROOT, FOLDERS[n]);
  fs.mkdirSync(path.join(dir, "capturas"), { recursive: true });
  const videoDir = path.join(dir, "video");
  const ctx = await browser.newContext({
    viewport: SIZE,
    ...(VIDEO ? { recordVideo: { dir: videoDir, size: SIZE } } : {}),
  });
  const pg = await ctx.newPage();
  const t0 = Date.now();
  const marcas = [];
  pg.on("pageerror", (e) => console.error(`[${n}] error de la página: ${e.message}`));
  const shot = async (name, full = false) => {
    await wait(pg, 1.5);
    if (!full) marcas.push({ captura: name, t: (Date.now() - t0) / 1000 });
    await pg.screenshot({ path: path.join(dir, "capturas", name), fullPage: full });
    console.log(`[${n}] ${name}`);
  };
  const go = async (url) => {
    await pg.goto(BASE + url, { waitUntil: "networkidle", timeout: 240000 });
    await wait(pg, 1);
  };
  // Punto de partida común: cartera inicial; los escenarios 2, 3 y 4 parten del plan del cosimulador.
  await go(`/aps.html${NOW}&reset=1`);
  if (n !== 1 && n !== 6) {
    await calcular(pg);
    await click(pg, "#aps-adopt");
  }
  await steps({ pg, go, shot, wait: (s) => wait(pg, s) });
  const video = pg.video();
  await ctx.close();
  if (video) {
    const out = path.join(videoDir, "recorrido.webm");
    fs.renameSync(await video.path(), out);
    fs.writeFileSync(path.join(videoDir, "marcas.json"), `${JSON.stringify(marcas, null, 2)}\n`);
    console.log(`[${n}] video: ${out}`);
  }
}

/** Pulsa CALCULAR, elige el objetivo (por defecto "Cumplir entregas") y espera la propuesta. */
async function calcular(pg, objetivo = "entregas", shot = null) {
  await click(pg, "#aps-calc");
  await pg.waitForSelector("#aps-objetivo[open]", { timeout: 30000 });
  if (shot) await shot();
  await pg.$$eval("#aps-obj-list input", (xs, v) => xs.forEach((i) => i.checked !== (i.value === v) && i.click()), objetivo);
  await click(pg, "#aps-obj-go");
  await pg.waitForSelector("#aps-adopt", { timeout: 120000 });
}

async function fractal(pg, run) {
  await click(pg, "[data-tab=fractal]");
  await wait(pg, 1);
  await click(pg, run);
  await pg.waitForSelector(".fr-result", { timeout: 120000 });
}

async function open3d(pg, go, select, extra = "") {
  await go(`/plant.html?plant=plastic-injection-plant-v1&now=2026-11-04T10:00&select=${select}&look=88,62,0,30${extra}`);
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
    await calcular(pg, "entregas", () => shot("03b-objetivo.png"));
    await shot("04-calcular.png");
    await click(pg, "#aps-adopt");
    await shot("05-gantt-cosimulador.png");
    // Clic en una orden de papelera (cuerpo, pedal y ensamble): sus máquinas suben y se resaltan.
    await pg.$$eval(".g-orders .g-row[data-order]", (rows) => {
      const r = rows.find((x) => x.innerText.includes("Papelera de pedal") && !x.querySelector(".g-bar.done"));
      if (r) r.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await shot("05b-gantt-orden.png");
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
    // Gemelo 3D siguiendo la orden: lo producido avanza con el play y sus máquinas llevan una estrella.
    await open3d(pg, go, "imm-01", `&order=${order}`);
    await shot("06-gemelo-orden.png");
    await pg.$eval("#tt-range", (el) => {
      el.value = String(Number(el.value) + 24 * 60);
      el.dispatchEvent(new Event("input"));
    });
    await shot("07-gemelo-orden-play.png");
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
  4: async ({ pg, go, shot, wait }) => {
    await click(pg, "[data-tab=gantt]");
    await shot("01-gantt-vigente.png");
    // Un compromiso firmado: la papelera PED-D12-07 se corre un día a mano (arrastrando su barra).
    const bar = await (await pg.$('.g-bar.drag[data-move-order="PED-D12-07"]')).boundingBox();
    await pg.mouse.move(bar.x + 100, bar.y + 12);
    await pg.mouse.down();
    await pg.mouse.move(bar.x + 160, bar.y + 12, { steps: 5 });
    await pg.mouse.move(bar.x + 231, bar.y + 12, { steps: 10 });
    await pg.mouse.up();
    await wait(2);
    // Y se bloquean (🔒) tres órdenes que hay que entregar sí o sí donde están.
    for (const id of ["PED-D11-02", "PED-D12-07", "PED-D14-06"]) {
      const sel = `.g-lock[data-lock="${id}"]`;
      if (!(await pg.$(`${sel}.on`))) {
        await click(pg, sel);
        await pg.waitForSelector(`${sel}.on`, { timeout: 60000 });
        await wait(1);
      }
    }
    await shot("02-gantt-fijadas.png");
    await click(pg, "[data-tab=fractal]");
    await shot("03-fractal-pregunta.png");
    await click(pg, "#fr-run-fijadas");
    await pg.waitForSelector(".fr-result", { timeout: 120000 });
    await shot("04-fractal.png");
    await shot("04b-fractal-full.png", true);
    await click(pg, "#fr-adopt");
    await shot("05-gantt-adoptado.png");
    await go(`/control.html${NOW}`);
    await shot("06-centro-control.png");
    await wait(2);
    },
  // Menos cambios de referencia: parte del plan del cosimulador (el balde alterna azul y blanco en sus dos inyectoras).
  5: async ({ pg, go, shot, wait }) => {
    await go(`/aps.html${NOW}`);
    await click(pg, "[data-tab=gantt]");
    await pg.$eval('.g-row.res[data-machine="imm-21"]', (e) => e.scrollIntoView({ block: "center" }));
    await shot("01-gantt-cambios.png");
    await click(pg, "[data-tab=fractal]");
    await shot("02-fractal-pregunta.png");
    await click(pg, "#fr-run-cambios");
    await pg.waitForSelector(".fr-result", { timeout: 120000 });
    await shot("03-fractal.png");
    await click(pg, "#fr-adopt");
    await pg.$eval('.g-row.res[data-machine="imm-21"]', (e) => e.scrollIntoView({ block: "center" }));
    await shot("04-gantt-adoptado.png");
    await go(`/aps.html${NOW}&tab=insumos`);
    await click(pg, "[data-tab=insumos]");
    await shot("05-insumos.png", true);
    await wait(2);
  },
  // Zoom del Gantt y versiones guardadas de la programación (parte de la VIGENTE manual).
  6: async ({ pg, shot, wait }) => {
    await click(pg, "[data-tab=gantt]");
    await shot("01-gantt-10d.png");
    for (let i = 0; i < 3; i++) await click(pg, "#g-zoom-out"), await wait(0.8);
    await shot("02-gantt-30d.png");
    for (let i = 0; i < 5; i++) await click(pg, "#g-zoom-in"), await wait(0.8);
    await shot("03-gantt-5d.png");
    await click(pg, "#g-zoom-reset");
    await calcular(pg);
    await click(pg, "#aps-save");
    await shot("04-guardar-cosimulador.png");
    // La mejor opción de Fractal se abre en el Gantt y se guarda también.
    await fractal(pg, "#fr-run-balancear");
    await pg.$$eval(".fr-see:not(.fr-pick)", (bs) => bs.at(-1)?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await pg.waitForSelector("#aps-save:not([disabled])", { timeout: 60000 });
    await wait(1);
    await click(pg, "#aps-save");
    await shot("05-guardar-fractal.png");
    await click(pg, "[data-tab=versions]");
    await wait(1);
    // Marca cada versión para compararla (la tabla se vuelve a dibujar con cada clic).
    const n = (await pg.$$("[data-cmp]")).length;
    for (let i = 0; i < n; i++) await pg.locator("[data-cmp]").nth(i).check(), await wait(0.8);
    await shot("06-versiones-comparar.png");
    await wait(2);
  },
};

(async () => {
  const browser = await chromium.launch();
  try {
    for (const n of which === "todos" ? [1, 2, 3, 4, 5, 6] : [Number(which)]) await scenario(browser, n, SCENARIOS[n]);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
