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
// --orbitas: además de las capturas, vuelos de cámara del gemelo 3D cuadro a cuadro (JPG en <escenario>/orbitas/<nombre>/),
// que el montaje convierte en video; así el 3D se ve en movimiento aunque el navegador sin GPU dibuje lento.
const ORBITAS = args.includes("--orbitas");
const FOLDERS = { 1: "1-calcular-programacion", 2: "2-cambio-fecha-pedido", 3: "3-contingencia-falla", 4: "4-pedidos-fijados", 5: "5-menos-cambios", 6: "versiones" };

const wait = (pg, s) => pg.waitForTimeout(Math.round(s * 1000 * PACE));
// Grabación en curso: inicio, marcas (capturas, clics, navegación) y página; la usan click() y go().
const REC = { t0: 0, marcas: [] };
const ahora = () => Math.round((Date.now() - REC.t0)) / 1000;

/**
 * En video el clic se ve: un cursor dibujado en la página va hasta el elemento, hace un pulso y luego se dispara el
 * clic. Cada clic queda en marcas.json ({tipo: "clic", t, x, y, w, h}) para que el montaje acerque la cámara al botón.
 */
async function click(pg, sel) {
  if (VIDEO) {
    const el = await pg.$(sel);
    const r = el && (await el.boundingBox());
    if (r && r.width > 0 && r.y >= 0 && r.y + r.height <= SIZE.height) {
      const x = r.x + r.width / 2, y = r.y + r.height / 2;
      await pg.mouse.move(x, y, { steps: 28 });
      await pg.waitForTimeout(Math.round(450 * PACE));
      REC.marcas.push({ tipo: "clic", t: ahora(), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), sel });
      await pg.evaluate(() => window.__curClick?.());
      await pg.waitForTimeout(220);
    }
  }
  await pg.$eval(sel, (e) => e.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

/** Cursor visible para el video: sigue al mouse de Playwright y hace un pulso en cada clic (no sale en las capturas). */
const CURSOR = () => {
  const pos = JSON.parse(sessionStorage.getItem("__cur") || "[960,620]");
  const add = () => {
    if (document.getElementById("__cur")) return;
    const c = document.createElement("div");
    c.id = "__cur";
    c.innerHTML = '<svg width="34" height="34" viewBox="0 0 24 24"><path d="M3 2l7.5 19 2.6-7.6L21 11z" fill="#fff" stroke="#0b0f18" stroke-width="1.6" stroke-linejoin="round"/></svg><i></i>';
    c.style.cssText = `position:fixed;left:${pos[0]}px;top:${pos[1]}px;z-index:2147483647;pointer-events:none;filter:drop-shadow(0 3px 6px #000a)`;
    const st = document.createElement("style");
    st.textContent = "#__cur svg{position:absolute;left:-4px;top:-3px}#__cur i{position:absolute;left:-26px;top:-26px;width:52px;height:52px;border-radius:50%;border:4px solid #4ea7ff;opacity:0;transform:scale(.3)}#__cur i.on{animation:__p .6s ease-out}@keyframes __p{0%{opacity:1;transform:scale(.3)}100%{opacity:0;transform:scale(1.4)}}";
    document.documentElement.append(st, c);
  };
  document.addEventListener("DOMContentLoaded", add);
  addEventListener("mousemove", (e) => {
    const c = document.getElementById("__cur");
    if (!c) return;
    c.style.left = `${e.clientX}px`;
    c.style.top = `${e.clientY}px`;
    sessionStorage.setItem("__cur", JSON.stringify([e.clientX, e.clientY]));
  }, true);
  window.__curClick = () => {
    const i = document.querySelector("#__cur i");
    if (!i) return;
    i.classList.remove("on");
    void i.offsetWidth;
    i.classList.add("on");
  };
  window.__curHide = (v) => {
    const c = document.getElementById("__cur");
    if (c) c.style.opacity = v ? "0" : "1";
  };
};

/** Textos visibles con su recuadro (coordenadas de la ventana): el montaje los usa para acercar la cámara a un dato. */
const TEXTOS = () => {
  const out = [];
  const W = innerWidth, H = innerHeight;
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = tw.nextNode()); ) {
    const s = n.textContent.replace(/\s+/g, " ").trim();
    if (!s || !n.parentElement || n.parentElement.closest("#__cur,script,style")) continue;
    if (!n.parentElement.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
    const rg = document.createRange();
    rg.selectNodeContents(n);
    const r = rg.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > H || r.right < 0 || r.left > W) continue;
    out.push({ s, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) });
  }
  return out;
};

async function scenario(browser, n, steps) {
  const dir = path.join(ROOT, FOLDERS[n]);
  fs.mkdirSync(path.join(dir, "capturas"), { recursive: true });
  const videoDir = path.join(dir, "video");
  const ctx = await browser.newContext({
    viewport: SIZE,
    ...(VIDEO ? { recordVideo: { dir: videoDir, size: SIZE } } : {}),
  });
  if (VIDEO) await ctx.addInitScript(CURSOR);
  const pg = await ctx.newPage();
  REC.t0 = Date.now();
  REC.marcas = [];
  const marcas = REC.marcas;
  pg.on("pageerror", (e) => console.error(`[${n}] error de la página: ${e.message}`));
  const shot = async (name, full = false) => {
    await wait(pg, 1.5);
    if (!full) {
      const textos = VIDEO ? await pg.evaluate(TEXTOS) : undefined;
      marcas.push({ captura: name, t: ahora(), ...(textos ? { textos } : {}) });
    }
    if (VIDEO) await pg.evaluate(() => window.__curHide?.(true));
    await pg.screenshot({ path: path.join(dir, "capturas", name), fullPage: full });
    if (VIDEO) await pg.evaluate(() => window.__curHide?.(false));
    console.log(`[${n}] ${name}`);
  };
  // La carga de una página (pantalla en blanco, pestaña por defecto) queda marcada para que el montaje no la muestre.
  const go = async (url) => {
    marcas.push({ tipo: "nav", t: ahora(), url });
    await pg.goto(BASE + url, { waitUntil: "networkidle", timeout: 240000 });
    await wait(pg, 1);
    marcas.push({ tipo: "listo", t: ahora() });
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

/**
 * Vuelo de cámara: n cuadros entre dos encuadres { t: [x, y, z] objetivo, r: distancia, h: altura, a: azimut en grados
 * (0 = desde el sur) }, con aceleración suave. minutos > 0 avanza además la línea de tiempo del gemelo (la grúa se mueve).
 * Sin GPU el 3D dibuja ~1 cuadro por segundo: se toma cada cuadro que pinta el navegador (screencast) y recién entonces se
 * mueve la cámara al punto siguiente. Sin la interfaz (paneles ocultos), salvo { ui: true }.
 */
async function orbita(pg, n, nombre, de, a, cuadros = 240, minutos = 0, { ui = false } = {}) {
  if (!ORBITAS) return;
  // ORBITAS_SOLO=a,b graba solo esas (las demás ya están).
  if (process.env.ORBITAS_SOLO && !process.env.ORBITAS_SOLO.split(",").includes(nombre)) return;
  cuadros = Number(process.env.ORBITA_CUADROS) || cuadros; // vista previa rápida del encuadre
  const dir = path.join(ROOT, FOLDERS[n], "orbitas", nombre);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  if (!ui) await pg.evaluate(() => document.body.classList.add("shot"));
  const t0 = minutos ? await pg.$eval("#tt-range", (el) => Number(el.value)) : 0;
  const lerp = (x, y, k) => x + (y - x) * k;
  const pose = async (i) => {
    const k0 = i / (cuadros - 1), k = k0 * k0 * (3 - 2 * k0);
    const t = de.t.map((v, j) => lerp(v, a.t[j], k));
    const r = lerp(de.r, a.r, k), h = lerp(de.h, a.h, k), az = (lerp(de.a, a.a, k) * Math.PI) / 180;
    if (minutos) {
      await pg.$eval("#tt-range", (el, v) => {
        el.value = String(v);
        el.dispatchEvent(new Event("input"));
      }, Math.round(t0 + minutos * k0));
    }
    await pg.evaluate((l) => window.__look(l), [t[0] + r * Math.sin(az), t[1] - r * Math.cos(az), h, ...t]);
  };
  await pose(0);
  await pg.waitForTimeout(6000);
  const inicio = Date.now();
  const cdp = await pg.context().newCDPSession(pg);
  let i = 0, previo = null;
  await new Promise((ok, mal) => {
    cdp.on("Page.screencastFrame", async (f) => {
      try {
        await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId });
        if (i >= cuadros) return;
        const buf = Buffer.from(f.data, "base64");
        if (previo && buf.equals(previo)) return; // el navegador aún no pintó la cámara nueva
        previo = buf;
        fs.writeFileSync(path.join(dir, `${String(i + 1).padStart(4, "0")}.jpg`), buf);
        i++;
        if (i < cuadros) await pose(i);
        else ok();
      } catch (e) {
        mal(e);
      }
    });
    cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: SIZE.width, maxHeight: SIZE.height, everyNthFrame: 1 }).catch(mal);
  });
  await cdp.send("Page.stopScreencast");
  await cdp.detach();
  if (!ui) await pg.evaluate(() => document.body.classList.remove("shot"));
  console.log(`[${n}] órbita ${nombre}: ${cuadros} cuadros en ${Math.round((Date.now() - inicio) / 1000)} s`);
}

async function moverReloj(pg, min) {
  await pg.$eval("#tt-range", (el, m) => {
    el.value = String(Number(el.value) + m);
    el.dispatchEvent(new Event("input"));
  }, min);
}

const SCENARIOS = {
  1: async ({ pg, go, shot, wait }) => {
    await shot("01-pedidos.png");
    await click(pg, "[data-tab=gantt]");
    await shot("02-gantt-manual.png");
    await go(`/control.html${NOW}`);
    await shot("03-centro-control-manual.png");
    await go(`/aps.html${NOW}&tab=gantt`);
    await calcular(pg, "entregas", () => shot("03b-objetivo.png"));
    await shot("04-calcular.png");
    await click(pg, "#aps-adopt");
    await shot("05-gantt-cosimulador.png");
    // Clic en una orden de papelera (cuerpo, pedal y ensamble): sus máquinas suben y se resaltan.
    const papelera = await pg.$$eval(".g-orders .g-row[data-order]", (rows) =>
      rows.find((x) => x.innerText.includes("Papelera de pedal") && !x.querySelector(".g-bar.done"))?.dataset.order);
    if (papelera) await click(pg, `.g-orders .g-row[data-order="${papelera}"]`);
    await shot("05b-gantt-orden.png");
    await go(`/control.html${NOW}`);
    await shot("06-centro-control.png");
    await go(`/aps.html${NOW}&tab=fractal`);
    await fractal(pg, "#fr-run-balancear");
    await shot("07-fractal-balancear.png");
    await click(pg, "#fr-adopt");
    await shot("08-gantt-balanceado.png");
    await go(`/control.html${NOW}`);
    await shot("09-centro-control-balanceado.png");
    await go(`/aps.html${NOW}&tab=insumos`);
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
    await orbita(pg, 2, "06-imm01", { t: [60, 45, 0], r: 80, h: 50, a: -15 }, { t: [38.5, 42, 1], r: 18, h: 9, a: 25 }, 80);
    await moverReloj(pg, 24 * 60);
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
    await go(`/aps.html${NOW}&tab=gantt`);
    await shot("05-aps-alerta.png");
    await fractal(pg, "#fr-run-falla");
    await shot("06-fractal.png");
    await shot("06b-fractal-full.png", true);
    await open3d(pg, go, "imm-21");
    await shot("10-gemelo-3d.png");
    await orbita(pg, 3, "00-planta", { t: [100, 44, 0], r: 150, h: 90, a: -30 }, { t: [95, 46, 0], r: 120, h: 60, a: 20 }, 200);
    await orbita(pg, 3, "10-imm21", { t: [75, 48, 0], r: 95, h: 60, a: -20 }, { t: [52.5, 57, 1.5], r: 22, h: 11, a: 20 }, 170);
    await go(`/aps.html${NOW}&tab=fractal`);
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
    await orbita(pg, 3, "11-imm20", { t: [50, 52, 0], r: 60, h: 35, a: -30 }, { t: [40.5, 57, 1.5], r: 20, h: 10, a: 15 }, 170);
    if (ORBITAS) {
      // El cambio de molde con el play, desde las 10:00, de cerca en IMM-20: la grúa saca su molde al carro, el carro
      // va al almacén y vuelve con el de repuesto, y la grúa lo monta.
      await moverReloj(pg, -4 * 60);
      await orbita(pg, 3, "12-montaje-ida", { t: [40.5, 57, 2], r: 28, h: 15, a: -45 }, { t: [42, 55, 1.5], r: 24, h: 13, a: -5 }, 220, 45);
      await orbita(pg, 3, "13-montaje-vuelta", { t: [42, 55, 1.5], r: 24, h: 13, a: -5 }, { t: [40.5, 57, 2], r: 20, h: 11, a: 35 }, 220, 50);
    }
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
    await go(`/aps.html${NOW}&tab=gantt`);
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
    const nSee = (await pg.$$(".fr-see:not(.fr-pick)")).length;
    if (nSee) await click(pg, `.fr-see:not(.fr-pick) >> nth=${nSee - 1}`);
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
