#!/usr/bin/env node
/**
 * Graba la demo de salsas: capturas (PNG), con --video un recorrido en video (WebM) por capítulo, y con --orbitas los
 * vuelos de cámara del gemelo 3D cuadro a cuadro (incluidos los recorridos de producto de la apertura).
 *
 *   pnpm gallery                                   # en otra terminal: la galería en http://localhost:5173
 *   uv run uvicorn twin_emulator_api.main:app --port 8000   # el 3D lo necesita
 *   NODE_PATH="$(pnpm root -g)" node tools/demo-video/grabar-salsas.cjs [0|0b|1|2|3|4|5|todos] [--video] [--lento] [--hd] [--orbitas]
 *
 * Mismo formato que grabar.cjs (plásticos): capturas en docs/demo-salsas/<capítulo>/capturas/, video y marcas.json en
 * <capítulo>/video/, órbitas en <capítulo>/orbitas/<nombre>/. Un recorrido de producto deja además ruta.json con el
 * cuadro en que llega a cada equipo, para que el montaje lo sincronice con la voz. AHORA = día 9, 10:00.
 */
const path = require("node:path");
const fs = require("node:fs");
const { chromium } = require("playwright");

const BASE = (process.env.GALLERY_URL || "http://localhost:5173").replace(/\/$/, "");
const NOW = "?now=2026-11-04T10:00";
const ROOT = process.env.DEMO_OUT || path.resolve(__dirname, "../../docs/demo-salsas");
const args = process.argv.slice(2);
const which = args.find((a) => /^(0|0b|1|2|3|4|5|todos)$/.test(a)) || "todos";
const VIDEO = args.includes("--video");
// En video, pausas largas para que se alcance a leer; --lento las alarga más.
const PACE = VIDEO ? (args.includes("--lento") ? 2.5 : 1.5) : 0.4;
const SIZE = args.includes("--hd") ? { width: 1920, height: 1080 } : { width: 1600, height: 900 };
// --orbitas: además de las capturas, vuelos de cámara del gemelo 3D cuadro a cuadro (JPG en <escenario>/orbitas/<nombre>/),
// que el montaje convierte en video; así el 3D se ve en movimiento aunque el navegador sin GPU dibuje lento.
const ORBITAS = args.includes("--orbitas");
const FOLDERS = { 0: "0-apertura", "0b": "0b-configurar-datos", 1: "1-calcular-programacion", 2: "2-adelantar-pedido", 3: "3-falla-llenadora-mostaza", 4: "4-menos-cip", 5: "5-merma-entregas" };

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
  // Punto de partida común: el plan manual vigente, sin fallas (?reset=1 limpia el estado compartido).
  await go(`/aps-salsas.html${NOW}&reset=1`);
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

/** Pulsa CALCULAR CON EL COSIMULADOR y espera la propuesta. */
async function calcular(pg) {
  await click(pg, "#sa-calc");
  await pg.waitForSelector("#sa-approve", { timeout: 120000 });
}

/** Arrastrar y soltar a la vista: el cursor toma el elemento, lo lleva hasta el destino y lo suelta (marca de clic en el destino). */
async function arrastrar(pg, de, a, { arriba = false } = {}) {
  const r0 = await (await pg.$(de)).boundingBox();
  const r1 = await (await pg.$(a)).boundingBox();
  const x0 = r0.x + r0.width / 2, y0 = r0.y + r0.height / 2;
  const x1 = r1.x + r1.width / 2, y1 = arriba ? r1.y + 4 : r1.y + r1.height / 2;
  await pg.mouse.move(x0, y0, { steps: VIDEO ? 24 : 2 });
  await pg.waitForTimeout(Math.round(400 * PACE));
  await pg.mouse.down();
  await pg.mouse.move(x0 + 8, y0 + 8, { steps: 4 });
  await pg.mouse.move(x1, y1, { steps: VIDEO ? 40 : 6 });
  await pg.waitForTimeout(Math.round(500 * PACE));
  if (VIDEO) REC.marcas.push({ tipo: "clic", t: ahora(), x: Math.round(r1.x), y: Math.round(r1.y), w: Math.round(r1.width), h: Math.round(r1.height), sel: a });
  await pg.mouse.up();
}

/** Escribe en un campo letra por letra (en video se ve escribir). */
async function escribir(pg, sel, texto) {
  await click(pg, sel);
  await pg.fill(sel, "");
  await pg.locator(sel).pressSequentially(texto, { delay: VIDEO ? 70 : 0 });
}

/** Abre FRACTAL · ESCENARIOS, corre un estudio y espera el resultado. */
async function fractal(pg, scenario) {
  await click(pg, "[data-tab=fractal]");
  await pg.waitForTimeout(Math.round(1000 * PACE));
  await click(pg, `[data-study=${scenario}]`);
  await pg.waitForSelector(".fr-result", { timeout: 120000 });
}

async function open3d(pg, go, select = "", extra = "") {
  await go(`/plant.html?plant=sauce-plant-v1&now=2026-11-04T10:00${select ? `&select=${select}` : ""}&look=66,-30,45,62,36,0${extra}`);
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
/**
 * Recorrido de un producto por sus equipos: la cámara va de un equipo al siguiente (cuadros "ir") y se queda un rato
 * en cada uno (cuadros "quedarse"), resaltándolo con el recuadro azul del 3D. Deja ruta.json con el cuadro en que llega
 * a cada equipo: el montaje estira cada tramo hasta el segundo en que la voz lo nombra.
 * paradas: [{ id, t: [x, y, z], r, h, a }] con el mismo encuadre que orbita().
 */
async function ruta(pg, n, nombre, paradas, { ir = 50, quedarse = 30 } = {}) {
  if (!ORBITAS) return;
  if (process.env.ORBITAS_SOLO && !process.env.ORBITAS_SOLO.split(",").includes(nombre)) return;
  const esc = Number(process.env.ORBITA_CUADROS) ? Number(process.env.ORBITA_CUADROS) / 100 : 1;
  ir = Math.max(2, Math.round(ir * esc));
  quedarse = Math.max(1, Math.round(quedarse * esc));
  const dir = path.join(ROOT, FOLDERS[n], "orbitas", nombre);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  await pg.evaluate(() => document.body.classList.add("shot"));
  const lerp = (x, y, k) => x + (y - x) * k;
  const cam = (p) => {
    const az = (p.a * Math.PI) / 180;
    return [p.t[0] + p.r * Math.sin(az), p.t[1] - p.r * Math.cos(az), p.h, ...p.t];
  };
  // Cuadro a cuadro: pose de la cámara y equipo resaltado.
  const poses = [];
  const llegadas = [];
  paradas.forEach((p, j) => {
    const prev = paradas[j - 1];
    if (prev) {
      for (let i = 1; i <= ir; i++) {
        const k0 = i / ir, k = k0 * k0 * (3 - 2 * k0);
        poses.push({ look: cam({ t: prev.t.map((v, m) => lerp(v, p.t[m], k)), r: lerp(prev.r, p.r, k), h: lerp(prev.h, p.h, k), a: lerp(prev.a, p.a, k) }), sel: i === ir ? p.id : prev.id });
      }
    }
    llegadas.push({ id: p.id, cuadro: poses.length + 1 });
    for (let i = 0; i < quedarse; i++) poses.push({ look: cam(p), sel: p.id });
  });
  const pose = async (i) => pg.evaluate(({ look, sel }) => (window.__select?.(sel), window.__look(look)), poses[i]);
  await pose(0);
  await pg.waitForTimeout(6000);
  const inicio = Date.now();
  const cdp = await pg.context().newCDPSession(pg);
  let i = 0, previo = null, vigia = null, fin = () => {};
  // Si la pose nueva no cambia la imagen, el screencast no manda cuadro: a los 3 s se repite el anterior y se sigue.
  const poseYVigilar = async (k) => {
    clearTimeout(vigia);
    await pose(k);
    vigia = setTimeout(async () => {
      if (i !== k || !previo) return;
      fs.writeFileSync(path.join(dir, `${String(i + 1).padStart(4, "0")}.jpg`), previo);
      i++;
      if (i < poses.length) await poseYVigilar(i);
      else fin();
    }, 3000);
  };
  await new Promise((ok, mal) => {
    fin = ok;
    cdp.on("Page.screencastFrame", async (f) => {
      try {
        await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId });
        if (i >= poses.length) return;
        const buf = Buffer.from(f.data, "base64");
        if (previo && buf.equals(previo)) return;
        previo = buf;
        fs.writeFileSync(path.join(dir, `${String(i + 1).padStart(4, "0")}.jpg`), buf);
        i++;
        // Cuadros quietos (la cámara se queda en un equipo): la página no cambia y el screencast no manda cuadro nuevo,
        // así que se repite el último sin esperar.
        while (i < poses.length && JSON.stringify(poses[i]) === JSON.stringify(poses[i - 1])) {
          fs.writeFileSync(path.join(dir, `${String(i + 1).padStart(4, "0")}.jpg`), buf);
          i++;
        }
        if (i < poses.length) await poseYVigilar(i);
        else ok();
      } catch (e) {
        mal(e);
      }
    });
    cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: SIZE.width, maxHeight: SIZE.height, everyNthFrame: 1 }).catch(mal);
  });
  clearTimeout(vigia);
  await cdp.send("Page.stopScreencast");
  await cdp.detach();
  await pg.evaluate(() => (window.__select?.(null), document.body.classList.remove("shot")));
  fs.writeFileSync(path.join(dir, "ruta.json"), `${JSON.stringify({ cuadros: poses.length, llegadas }, null, 2)}\n`);
  console.log(`[${n}] ruta ${nombre}: ${poses.length} cuadros en ${Math.round((Date.now() - inicio) / 1000)} s`);
}

// Encuadre de cerca de un equipo (posición del plano, plant.yaml).
// Desde arriba (h alto, r corto): a la altura de los ojos la tubería aérea tapa los equipos.
const P = (id, x, y, { z = 1.5, r = 10, h = 15, a = 0 } = {}) => ({ id, t: [x, y, z], r, h, a });
const PLANTA = { t: [60, 36, 0], r: 95, h: 62, a: -25 };
const RUTAS = {
  "03-tomate": [
    P("kettle-02", 44, 32, { a: -10 }),
    P("boiler-01", 35, 5, { r: 12, h: 14, a: -20 }),
    P("pasteurizer-01", 42, 22, { a: -5 }),
    P("buffer-hot-01", 56, 29, { a: 5 }),
    P("filler-pouch-01", 72.5, 56, { a: 10 }),
    P("cooling-tunnel-01", 71.5, 40, { r: 12, h: 16, a: 15 }),
    P("pack-sauce-1000", 81, 36, { a: 20 }),
    P("rack-pt-02", 93, 41, { z: 3, r: 24, h: 24, a: 25 }),
  ],
  "04-mayonesa": [
    P("tank-aqueous-01", 37.5, 55, { a: -10 }),
    P("emulsifier-01", 43, 55, { a: -5 }),
    P("colloid-mill-01", 48, 55, { r: 9, h: 13 }),
    P("buffer-cold-01", 56, 40, { a: 5 }),
    P("filler-sachet-01", 62.5, 56, { a: 10 }),
  ],
  "05-mostaza": [
    P("tank-mustard-01", 37.5, 44, { a: -10 }),
    P("mustard-mill-01", 43, 44, { r: 9, h: 13 }),
    P("buffer-mustard-01", 56, 51, { a: 5 }),
    P("filler-sachet-03", 68.5, 56, { a: 10 }),
    P("filler-sachet-01", 65.5, 56, { r: 14, h: 18, a: 5 }),
  ],
};

const SCENARIOS = {
  // Cargar los datos a mano: pestaña CONFIGURACIÓN del APS (pedido nuevo, llenadora asignada, secuencia, versión).
  "0b": async ({ pg, go, shot, wait }) => {
    await click(pg, "[data-tab=config]");
    await shot("01-configuracion.png");
    await escribir(pg, "#cf-customer", "Restaurante La Esquina");
    await click(pg, "#cf-product");
    await pg.selectOption("#cf-product", "bbq-1000");
    await escribir(pg, "#cf-qty", "1500");
    await pg.selectOption("#cf-due", "2026-11-07");
    await wait(1);
    await click(pg, "#cf-add");
    await shot("02-pedido-nuevo.png");
    await click(pg, "[data-cf=products]");
    await shot("03-productos.png");
    await arrastrar(pg, '[data-filler="filler-pouch-02"]', '[data-drop-sku="bbq-1000"]');
    await shot("04-llenadora-asignada.png");
    await arrastrar(pg, '[data-filler="filler-sachet-02"]', '[data-drop-sku="bbq-1000"]');
    await shot("05-rechazada.png");
    await click(pg, "[data-cf=sequence]");
    await shot("06-secuencia.png");
    await arrastrar(pg, ".cf-col.pool [data-card]", '[data-col="filler-pouch-01"] [data-card]:nth-child(2)', { arriba: true });
    await shot("07-secuencia-movida.png");
    await click(pg, "#cf-save-as");
    await escribir(pg, "#cf-name", "Semana 45 · pedido BBQ");
    await click(pg, "#cf-save-new");
    await shot("08-guardada.png");
    await click(pg, "[data-cf=versions]");
    await shot("09-versiones.png");
    await click(pg, '[data-use="CFG-01"]');
    // USAR EN LA PLANTA recarga el APS: la carga queda marcada como una navegación.
    REC.marcas.push({ tipo: "nav", t: ahora(), url: "/aps-salsas.html (CFG-01)" });
    await pg.waitForSelector(".sa-orders", { timeout: 120000 });
    await pg.waitForTimeout(1000);
    REC.marcas.push({ tipo: "listo", t: ahora() });
    await shot("10-en-la-planta.png");
    await wait(2);
  },
  // Apertura: la planta en el 3D, los recorridos de tres productos, cómo se conecta todo y la cartera.
  0: async ({ pg, go, shot, wait }) => {
    await open3d(pg, go);
    await shot("01-gemelo-3d.png");
    await orbita(pg, 0, "01-planta", PLANTA, { t: [62, 40, 0], r: 80, h: 48, a: 25 }, 200, 120);
    for (const [nombre, paradas] of Object.entries(RUTAS)) await ruta(pg, 0, nombre, paradas);
    await go(`/emulador-salsas.html${NOW}`);
    await shot("07a-emulador.png");
    await go(`/control-salsas.html${NOW}`);
    await shot("07b-centro-control.png");
    await go(`/aps-salsas.html${NOW}&tab=gantt`);
    await shot("07c-aps-gantt.png");
    await click(pg, "[data-tab=orders]");
    await shot("08-pedidos.png");
    await wait(2);
  },
  1: async ({ pg, go, shot, wait }) => {
    await shot("00-pedidos-manual.png");
    await click(pg, "[data-tab=gantt]");
    await shot("01-gantt-manual.png");
    await calcular(pg);
    await shot("03-propuesta.png");
    await click(pg, "#sa-approve");
    await shot("05-gantt-cosimulador.png");
    await open3d(pg, go, "kettle-02");
    await shot("05b-gemelo-3d.png");
    await orbita(pg, 1, "05-play", { t: [55, 40, 0], r: 60, h: 38, a: -20 }, { t: [52, 42, 0], r: 48, h: 30, a: 15 }, 160, 180);
    await go(`/control-salsas.html${NOW}`);
    await shot("05c-centro-control.png");
    await wait(2);
  },
  2: async ({ pg, go, shot, wait }) => {
    await go(`/aps-salsas.html${NOW}&tab=gantt&order=PED-D11-04`);
    await shot("01-pedido-gantt.png");
    await click(pg, "[data-tab=fractal]");
    await pg.selectOption("#fr-order", "PED-D11-04");
    await pg.selectOption("#fr-due", "2026-11-05");
    await shot("02-fractal-pregunta.png");
    await click(pg, "[data-study=adelantar]");
    await pg.waitForSelector(".fr-result", { timeout: 120000 });
    // La tarjeta se vuelve a dibujar con el resultado: se deja a la vista el pedido y la fecha estudiados.
    await pg.selectOption("#fr-order", "PED-D11-04");
    await pg.selectOption("#fr-due", "2026-11-05");
    await shot("03-fractal.png");
    await shot("03b-fractal-full.png", true);
    await click(pg, "#fr-adopt");
    await shot("04-gantt-adoptado.png");
    await wait(2);
  },
  3: async ({ pg, go, shot, wait }) => {
    await go(`/emulador-salsas.html${NOW}`);
    await shot("01-emulador.png");
    await click(pg, '.emu-m[data-id="filler-sachet-03"]');
    await pg.waitForSelector("#emu-fail", { timeout: 30000 });
    await shot("02-plc-sachet03.png");
    await pg.selectOption("#emu-hours", "60");
    await click(pg, "#emu-fail");
    await shot("03-falla.png");
    await open3d(pg, go, "filler-sachet-03");
    await shot("04-gemelo-3d-falla.png");
    await orbita(pg, 3, "04-falla", { t: [64, 50, 0], r: 40, h: 26, a: -15 }, P("filler-sachet-03", 68.5, 56, { r: 12, h: 16, a: 15 }), 120);
    await go(`/control-salsas.html${NOW}`);
    await shot("05-centro-control.png");
    await go(`/aps-salsas.html${NOW}&tab=gantt`);
    await shot("06-aps-alerta.png");
    await calcular(pg);
    await shot("07-propuesta.png");
    await click(pg, "#sa-approve");
    await shot("08-gantt-replaneado.png");
    await fractal(pg, "falla");
    await shot("09-fractal.png");
    await shot("09b-fractal-full.png", true);
    await wait(2);
  },
  4: async ({ pg, shot, wait }) => {
    await click(pg, "[data-tab=gantt]");
    await shot("01-gantt-manual.png");
    await click(pg, "[data-tab=fractal]");
    await shot("02-fractal-pregunta.png");
    await click(pg, "[data-study=limpiezas]");
    await pg.waitForSelector(".fr-result", { timeout: 120000 });
    await shot("03-fractal.png");
    await shot("03b-fractal-full.png", true);
    await click(pg, "#fr-adopt");
    await shot("04-gantt-campanas.png");
    await wait(2);
  },
  5: async ({ pg, shot, wait }) => {
    await fractal(pg, "limpiezas");
    await pg.$eval(".sa-fr-table", (e) => e.scrollIntoView({ block: "center" }));
    await shot("01-opciones.png");
    await shot("01b-fractal-full.png", true);
    await wait(2);
  },
};

(async () => {
  const browser = await chromium.launch();
  try {
    for (const n of which === "todos" ? [0, "0b", 1, 2, 3, 4, 5] : [which === "0b" ? "0b" : Number(which)]) await scenario(browser, n, SCENARIOS[n]);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
