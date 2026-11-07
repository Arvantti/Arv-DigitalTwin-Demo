#!/usr/bin/env node
/**
 * Arma el video horizontal (1920×1080) de la demo de salsas con HyperFrames (mismo montaje que el de plásticos,
 * ARV-W01-V001, más los recorridos de producto por el 3D y las tarjetas propias de alimentos).
 *
 *   node armar.mjs preparar          guiones de docs/demo-salsas -> segmentos.json y capitulos/<cap>/script.md
 *   node armar.mjs voz [--enviar]    voz de ElevenLabs por segmento, con el tiempo de cada letra (solo lo que cambió)
 *   node armar.mjs musica [--enviar] música épica con ElevenLabs Music (musica-prompt.txt)
 *   node armar.mjs voz-temporal      locución TEMP_AUDIO local (Kokoro, vía `hyperframes tts`) por segmento
 *   node armar.mjs componer          escribe index.html (la composición): clips, zoom a clics y datos, tarjetas, subtítulos
 *   node armar.mjs render [vNNN]     renderiza out/demo-salsas-<vNNN>.mp4
 *
 * Material de pantalla: assets/grabacion/ (tools/demo-video/grabar-salsas.cjs todos --video --hd con DEMO_OUT apuntando ahí).
 * marcas.json de cada escenario trae el segundo de cada captura, cada clic (con su recuadro), cada carga de página y los
 * textos visibles con su recuadro: con eso el montaje corta los tramos sin cargas de página, acerca la cámara al botón
 * que se pulsa y a cada dato que dice la voz (líneas "- foco:" del guion). Ver README.md de esta carpeta.
 */
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../../..");
const DOCS = join(REPO, "docs/demo-salsas");
const GRAB = join(HERE, "assets/grabacion");
const VOZ = join(HERE, "assets/audio/voz");
const AUDIO = join(HERE, "assets/audio/segmentos");
const MUSICA = join(HERE, "assets/audio/musica");
const CLIPS = join(HERE, "assets/clips");
const HF = ["dlx", "hyperframes@0.9.9"];
const W = 1920, H = 1080, FPS = 25;
// Pantalla dentro del cuadro: 1600×900 con barra arriba y subtítulos abajo.
const SX = 160, SY = 74, SW = 1600, SH = 900;

const CAPITULOS = [
  { id: "0-apertura", eyebrow: "GEMELO DIGITAL · SALSAS", titulo: "Una planta de salsas y su gemelo digital" },
  { id: "1-calcular-programacion", eyebrow: "ESCENARIO 1", titulo: "Calcular la programación" },
  { id: "2-adelantar-pedido", eyebrow: "ESCENARIO 2", titulo: "Un cliente adelanta su pedido" },
  { id: "3-falla-llenadora-mostaza", eyebrow: "ESCENARIO 3", titulo: "Se cae la llenadora de mostaza" },
  { id: "4-menos-cip", eyebrow: "ESCENARIO 4", titulo: "Lavar menos con Fractal" },
  { id: "5-merma-entregas", eyebrow: "ESCENARIO 5", titulo: "Cuánta merma vale la pena ahorrar" },
  { id: "6-cierre", eyebrow: "CIERRE", titulo: "Lo que ahorra optimizar" },
];
// Los diez productos (tarjeta "productos"), por familia, con su envase.
const PRODUCTOS = [
  ["caliente", "Línea caliente", [["tomate-1000", "Salsa de tomate", "doypack 1.000 ml"], ["tomate-250", "Salsa de tomate", "sachet 250 ml"], ["bbq-1000", "Salsa BBQ", "doypack 1.000 ml"], ["picante-250", "Salsa picante", "sachet 250 ml"]]],
  ["fria", "Línea fría", [["mayonesa-1000", "Mayonesa", "doypack 1.000 ml"], ["mayonesa-500", "Mayonesa", "doypack 500 ml"], ["mayonesa-250", "Mayonesa", "sachet 250 ml"], ["light-1000", "Mayonesa light", "doypack 1.000 ml"], ["rosada-500", "Salsa rosada", "doypack 500 ml"]]],
  ["mostaza", "Mostaza", [["mostaza-250", "Mostaza", "sachet 250 ml"]]],
];
// Las cuatro reglas propias de los alimentos (tarjeta "reglas").
const REGLAS = [
  ["recetas", "Orden de recetas", "de suave a fuerte; devolverse = CIP completo de 90 min"],
  ["alergenos", "Alérgenos", "de mayonesa (huevo) a mostaza = CIP completo con verificación"],
  ["espera", "Tiempo de espera", "tomate caliente: 4 h en el pulmón; lo vencido es merma"],
  ["tandas", "Tandas", "una marmita no se deja a medias de un día para otro"],
];
// El puntaje de Fractal (tarjeta "puntaje"), de aps/aps.yaml.
const PUNTAJE = [
  ["atraso", "1 × horas de atraso"],
  ["tarde", "20 × pedidos tarde"],
  ["cip", "2 × horas de CIP"],
  ["envase", "1 × horas de cambio de envase"],
  ["merma", "0,05 × kg de merma"],
];
// Las cuatro partes del gemelo (tarjeta "partes"), con su captura.
const PARTES = [
  ["emulador", "Emulador", "hace de planta real", "0-apertura/capturas/07a-emulador.png"],
  ["control", "Centro de control", "recibe las señales", "0-apertura/capturas/07b-centro-control.png"],
  ["gemelo", "Gemelo 3D", "pasado, presente y futuro", "0-apertura/capturas/01-gemelo-3d.png"],
  ["aps", "APS", "programa la producción", "0-apertura/capturas/07c-aps-gantt.png"],
];

// Módulos de Arvantti Digital Twin (tarjeta "modulos"): el gemelo en el centro y siete módulos alrededor.
const MODULOS = [
  ["integrador", "1 · Integrator", "ERP, CRM, sistemas SCADA y otros"],
  ["aps", "2 · APS", "programación y planificación de órdenes y recursos"],
  ["cosimulacion", "3 · CoSimulation", "cosimulador matemático entrenable con las reglas de la empresa"],
  ["fractal", "4 · Fractal", "simulación robusta por escenarios y multiobjetivo"],
  ["control", "5 · Control Center", "monitoreo y control conectado a su SCADA o control de piso"],
  ["dendro", "6 · DendroScada", "hardware SCADA propio: conecta cualquier máquina o proceso"],
  ["ia", "7 · AI Assistant", "Cerebro Empresarial IA: IA privada en lenguaje natural"],
];
// De dónde sale la programación (tarjeta "fuentes").
const FUENTES = [
  ["manual", "Programación manual", "con las herramientas de Arvantti"],
  ["excel", "Importar desde Excel", "la hoja que ya usa la planta"],
  ["erp", "ERP u otro sistema", "integración por API"],
];
const RESTRICCIONES = [
  ["empezo", "Lo que ya empezó no se mueve"],
  ["turnos", "Turnos de cada máquina"],
  ["moldes", "Moldes montados en cada máquina"],
  ["entregas", "Fechas de entrega"],
];

const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 1 << 26, ...opts });
const dur = (f) => Number(sh("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).trim());
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const r2 = (x) => Math.round(x * 100) / 100;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const hash = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16);

// ---------- preparar ----------

/**
 * Lee los bloques "### Snn · título" de un guion: "- imagen:", "- en pantalla:", "- tarjeta:", "- orbita:" (vuelo 3D), las líneas
 * "- foco: <frase de la voz> => <texto en pantalla o clave de la tarjeta> [=> rótulo]" y las citas ">" (la voz).
 */
function parseGuion(md, cap, folder) {
  const segs = [];
  for (const block of md.split(/^### /m).slice(1)) {
    const head = block.split("\n")[0].trim();
    const m = head.match(/^((?:\d-)?S\d+[a-z]?)\s*·\s*(.+)$/);
    if (!m) continue;
    const field = (k) => (block.match(new RegExp(`^- ${k}:\\s*(.+)$`, "m")) || [])[1]?.trim() ?? null;
    const texto = block.split("\n").filter((l) => l.startsWith(">")).map((l) => l.replace(/^>\s?/, "").trim()).join(" ").trim();
    if (!texto) continue;
    let imagen = field("imagen");
    if (imagen && imagen.startsWith("capturas/")) imagen = `${folder}/${imagen}`;
    if (imagen && !/\.(png|jpe?g)$/i.test(imagen)) imagen = null;
    const tarjeta = field("tarjeta");
    const orbita = field("orbita");
    // Recorrido de producto: "- ruta: orbitas/<nombre>" y una "- parada: <frase de la voz> => <equipo> => <rótulo>" por
    // equipo; la cámara llega a cada equipo en el segundo en que la voz lo nombra (ruta.json de grabar-salsas.cjs).
    const ruta = field("ruta");
    const paradas = [...block.matchAll(/^- parada:\s*(.+)$/gm)].map(([, l]) => {
      const [frase, equipo, rotulo] = l.split("=>").map((x) => x.trim());
      return { frase, equipo, rotulo: rotulo ?? equipo };
    });
    const focos = [...block.matchAll(/^- foco:\s*(.+)$/gm)].map(([, l]) => {
      const [frase, objetivo, rotulo] = l.split("=>").map((x) => x.trim());
      return { frase, objetivo, ...(rotulo ? { rotulo } : {}) };
    });
    segs.push({
      id: m[1].includes("-") ? m[1] : `${cap.split("-")[0]}-${m[1]}`,
      titulo: m[2],
      texto,
      imagen,
      enPantalla: field("en pantalla"),
      ...(tarjeta ? { tarjeta } : {}),
      ...(orbita ? { orbita: orbita.startsWith("orbitas/") ? `${folder}/${orbita}` : orbita } : {}),
      ...(ruta ? { ruta: ruta.startsWith("orbitas/") ? `${folder || "0-apertura"}/${ruta}` : ruta, paradas } : {}),
      ...(focos.length ? { focos } : {}),
    });
  }
  return segs;
}

function preparar() {
  const video = readFileSync(join(DOCS, "VIDEO.md"), "utf8");
  const sec4 = video.split(/^## 4\./m)[1].split(/^## 5\./m)[0];
  const abiertos = parseGuion(sec4, "0", "").map((s) => ({ ...s, imagen: s.imagen?.replace(/^\//, "") }));
  const capitulos = CAPITULOS.map((c) => {
    let segmentos;
    if (c.id === "0-apertura") {
      // Cargar los datos a mano (0b-configurar-datos/guion.md) va entre la cartera (0-S08) y los escenarios (0-S09).
      const datos = parseGuion(readFileSync(join(DOCS, "0b-configurar-datos", "guion.md"), "utf8"), "0b", "0b-configurar-datos");
      const ap = abiertos.filter((s) => s.id.startsWith("0-"));
      const i = ap.findIndex((s) => s.id === "0-S09");
      segmentos = [...ap.slice(0, i), ...datos, ...ap.slice(i)];
    }
    else if (c.id === "6-cierre") segmentos = abiertos.filter((s) => s.id.startsWith("6-")).map((s) => ({ ...s, imagen: null, tarjeta: "ahorro" }));
    else segmentos = parseGuion(readFileSync(join(DOCS, c.id, "guion.md"), "utf8"), c.id, c.id);
    return { ...c, segmentos };
  });
  // Cifras de la tarjeta de cierre: la tabla de la sección 4 de VIDEO.md, tal cual.
  const filas = sec4.split("\n").filter((l) => /^\|\s*\d ·/.test(l)).map((l) => l.split("|").slice(1, -1).map((x) => x.trim()));
  writeFileSync(join(HERE, "segmentos.json"), `${JSON.stringify({ fuente: "docs/demo-salsas (guion.md de cada escenario y VIDEO.md §4)", cierre: filas, capitulos }, null, 2)}\n`);
  for (const c of capitulos) {
    const dir = join(HERE, "capitulos", c.id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "script.md"), `${c.segmentos.map((s) => s.texto).join("\n\n")}\n`);
  }
  const n = capitulos.reduce((a, c) => a + c.segmentos.length, 0);
  const chars = capitulos.map((c) => `${c.id}: ${c.segmentos.map((s) => s.texto).join("\n\n").length} caracteres`);
  console.log(`segmentos.json: ${capitulos.length} capítulos, ${n} segmentos\n${chars.join("\n")}`);
}

const load = () => JSON.parse(readFileSync(join(HERE, "segmentos.json"), "utf8"));

// ---------- ElevenLabs ----------

// Nombres en inglés que la voz en español leería mal: se envían escritos como se pronuncian; el subtítulo no cambia.
const PRONUNCIA = [["Integrator", "Íntegreitor"], ["BBQ", "barbikiú"], ["SKU", "eskiú"], ["CIP", "cip"], ["APS", "a pe ese"], ["OEE", "o e e"], ["Gantt", "Gant"], ["doypack", "doipak"], ["sachet", "sashé"]];
/** Texto que se envía a la voz y, para cada carácter del original, su posición en ese texto. */
function paraVoz(texto) {
  let out = "", idx = [];
  for (let i = 0; i < texto.length; ) {
    const p = PRONUNCIA.find(([a]) => texto.startsWith(a, i) && !/\p{L}/u.test(texto[i - 1] || "") && !/\p{L}/u.test(texto[i + a.length] || ""));
    if (p) {
      for (let k = 0; k < p[0].length; k++) idx.push(out.length + Math.floor((k * p[1].length) / p[0].length));
      out += p[1];
      i += p[0].length;
    } else idx.push(out.length), (out += texto[i++]);
  }
  return { texto: out, idx };
}

const VOICE_SETTINGS = { stability: 0.5, similarity_boost: 0.85, style: 0, speed: 1, use_speaker_boost: true };
const modelo = () => process.env.ELEVENLABS_MODEL_ID || "eleven_v4";

function credenciales() {
  const apiKey = process.env.ELEVENLABS_API_KEY, voiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!apiKey?.trim() || !voiceId?.trim()) throw new Error("Faltan ELEVENLABS_API_KEY o ELEVENLABS_VOICE_ID en el entorno.");
  return { apiKey, voiceId };
}

/** Voz por segmento con /with-timestamps: guarda <id>.mp3 y <id>.json con el inicio y fin de cada carácter. */
async function voz() {
  const enviar = process.argv.includes("--enviar");
  mkdirSync(VOZ, { recursive: true });
  const pend = [];
  for (const c of load().capitulos)
    c.segmentos.forEach((s, i) => {
      const h = hash(`${modelo()}|${paraVoz(s.texto).texto}`);
      const meta = join(VOZ, `${s.id}.json`);
      if (existsSync(meta) && existsSync(join(VOZ, `${s.id}.mp3`)) && JSON.parse(readFileSync(meta, "utf8")).hash === h) return;
      pend.push({ s, h, prev: c.segmentos[i - 1]?.texto, next: c.segmentos[i + 1]?.texto });
    });
  const chars = pend.reduce((a, p) => a + p.s.texto.length, 0);
  console.log(`Voz: ${pend.length} segmentos nuevos o cambiados, ${chars} caracteres (modelo ${modelo()}).`);
  if (!pend.length) return;
  if (!enviar) {
    for (const p of pend) console.log(`- ${p.s.id}: ${p.s.texto}`);
    console.log("ElevenLabs recibirá estos textos. Para enviarlos: node armar.mjs voz --enviar");
    return;
  }
  const { apiKey, voiceId } = credenciales();
  for (const p of pend) {
    if (p.s.texto.includes(apiKey)) throw new Error("El guion parece contener una credencial; no se envía.");
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=mp3_44100_128`;
    const pedir = (contexto) =>
      fetch(url, {
        method: "POST",
        headers: { "xi-api-key": apiKey, "content-type": "application/json" },
        body: JSON.stringify({
          text: paraVoz(p.s.texto).texto,
          model_id: modelo(),
          voice_settings: VOICE_SETTINGS,
          ...(contexto ? { ...(p.prev ? { previous_text: p.prev } : {}), ...(p.next ? { next_text: p.next } : {}) } : {}),
        }),
      });
    let res = await pedir(true);
    if (res.status === 400 || res.status === 422) res = await pedir(false);
    if (!res.ok) throw new Error(`${p.s.id}: ElevenLabs respondió HTTP ${res.status}; respuesta omitida por seguridad.`);
    const j = await res.json();
    const audio = Buffer.from(j.audio_base64, "base64");
    if (!audio.length) throw new Error(`${p.s.id}: audio vacío.`);
    writeFileSync(join(VOZ, `${p.s.id}.mp3`), audio);
    let a = j.alignment || j.normalized_alignment;
    // Si se cambió la escritura de algún nombre, la alineación se lleva de vuelta al texto original.
    const pv = paraVoz(p.s.texto);
    if (a && pv.texto !== p.s.texto && a.characters?.length === pv.texto.length)
      a = { characters: [...p.s.texto], character_start_times_seconds: pv.idx.map((k) => a.character_start_times_seconds[k]), character_end_times_seconds: pv.idx.map((k) => a.character_end_times_seconds[k]) };
    writeFileSync(join(VOZ, `${p.s.id}.json`), `${JSON.stringify({ hash: p.h, modelo: modelo(), texto: p.s.texto, alignment: a })}\n`);
    console.log(`${p.s.id}: ${dur(join(VOZ, `${p.s.id}.mp3`)).toFixed(1)} s`);
  }
}

/** Música épica: una pista por párrafo de musica-prompt.txt (ElevenLabs Music), en assets/audio/musica/. */
async function musica() {
  const enviar = process.argv.includes("--enviar");
  const prompts = readFileSync(join(HERE, "musica-prompt.txt"), "utf8").split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
  mkdirSync(MUSICA, { recursive: true });
  const pend = prompts.map((p, i) => ({ p, out: join(MUSICA, `musica-${i + 1}.mp3`) })).filter((x) => !existsSync(x.out));
  console.log(`Música: ${pend.length} pistas por generar.`);
  if (!pend.length) return;
  if (!enviar) {
    pend.forEach((x) => console.log(`- ${basename(x.out)}: ${x.p}`));
    console.log("Para enviarlas a ElevenLabs Music: node armar.mjs musica --enviar");
    return;
  }
  const { apiKey } = credenciales();
  const ms = Number(process.env.MUSICA_MS || 300000);
  for (const x of pend) {
    const res = await fetch("https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128", {
      method: "POST",
      headers: { "xi-api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify({ prompt: x.p, music_length_ms: ms, model_id: "music_v1" }),
    });
    if (!res.ok) throw new Error(`Música: ElevenLabs respondió HTTP ${res.status}; respuesta omitida por seguridad.`);
    writeFileSync(x.out, Buffer.from(await res.arrayBuffer()));
    console.log(`${basename(x.out)}: ${dur(x.out).toFixed(1)} s`);
  }
}

// ---------- voz temporal (Kokoro local) ----------

function vozTemporal() {
  mkdirSync(AUDIO, { recursive: true });
  const voice = process.env.TEMP_VOICE || "em_alex";
  for (const c of load().capitulos)
    for (const s of c.segmentos) {
      const out = join(AUDIO, `${s.id}.wav`);
      if (existsSync(out)) continue;
      sh("pnpm", [...HF, "tts", s.texto, "-v", voice, "-l", "es", "-o", out], { stdio: ["ignore", "ignore", "inherit"] });
      console.log(`${s.id}: ${dur(out).toFixed(1)} s (TEMP_AUDIO)`);
    }
}

// ---------- componer ----------

/** Ancho y alto de una captura (PNG o JPG). */
function pngSize(f) {
  const b = readFileSync(f);
  if (b.readUInt32BE(0) === 0x89504e47) return [b.readUInt32BE(16), b.readUInt32BE(20)];
  const [w, h] = sh("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", f]).trim().split(",").map(Number);
  return [w, h];
}

function imagen(rel) {
  if (!rel) return null;
  const hd = join(GRAB, rel);
  if (existsSync(hd)) return hd;
  // Si no hay captura en alta, se copia la de docs/ dentro del proyecto (el render no lee fuera de esta carpeta).
  const doc = join(DOCS, rel);
  if (!existsSync(doc)) return null;
  mkdirSync(dirname(hd), { recursive: true });
  copyFileSync(doc, hd);
  return hd;
}

const marcasCache = new Map();
function marcas(folder) {
  if (!marcasCache.has(folder)) {
    const f = join(GRAB, folder, "video/marcas.json");
    marcasCache.set(folder, existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : []);
  }
  return marcasCache.get(folder);
}

/** Trozos de subtítulo: frases cortas, partidas en comas si pasan de ~90 caracteres. */
function trozos(texto) {
  const frases = texto.match(/[^.?!:;]+[.?!:;]*/g).map((x) => x.trim()).filter(Boolean);
  const out = [];
  for (const f of frases) {
    if (f.length <= 92) out.push(f);
    else {
      let cur = "";
      for (const p of f.split(/(?<=,)\s+/)) {
        if (cur && (cur + " " + p).length > 92) out.push(cur), (cur = p);
        else cur = cur ? `${cur} ${p}` : p;
      }
      if (cur) out.push(cur);
    }
  }
  return out.reduce((a, x) => (a.length && x.length < 22 && (a.at(-1) + " " + x).length < 110 ? (a[a.length - 1] += ` ${x}`) : a.push(x), a), []);
}

/** Audio de un segmento y el segundo (desde el inicio del audio) en que se dice cada carácter del texto. */
function vozDe(s) {
  const mp3 = join(VOZ, `${s.id}.mp3`), meta = join(VOZ, `${s.id}.json`);
  if (existsSync(mp3) && existsSync(meta)) {
    const j = JSON.parse(readFileSync(meta, "utf8"));
    const a = j.alignment;
    const d = dur(mp3);
    if (j.texto !== s.texto) console.warn(`${s.id}: la voz es de otra versión del texto (corre: node armar.mjs voz --enviar)`);
    let starts = null;
    if (a && a.characters?.length === s.texto.length) starts = a.character_start_times_seconds;
    else if (a?.characters?.length) {
      // Si ElevenLabs normalizó el texto, se reparte proporcionalmente.
      const k = a.characters.length / s.texto.length;
      starts = [...s.texto].map((_, i) => a.character_start_times_seconds[Math.min(a.characters.length - 1, Math.floor(i * k))]);
    }
    return { af: mp3, voz: d, starts, real: j.texto === s.texto };
  }
  for (const f of [join(AUDIO, `${s.id}.mp3`), join(AUDIO, `${s.id}.wav`)])
    if (existsSync(f)) return { af: f, voz: dur(f), starts: null, temp: f.endsWith(".wav") };
  return { af: null, voz: s.texto.length / 14, starts: null, falta: true };
}

const normal = (x) => x.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Recuadro (en px de la ventana grabada) de un texto visible en la captura: exacto, si no el más corto que lo contenga. */
function buscarTexto(textos, objetivo, cerca = null) {
  const t = normal(objetivo);
  let cands = textos.filter((x) => normal(x.s) === t);
  if (!cands.length) cands = textos.filter((x) => normal(x.s).includes(t)).sort((a, b) => a.s.length - b.s.length);
  if (!cands.length) return null;
  if (cerca) {
    // En las tarjetas el dato va debajo o a la derecha de su título: lo que queda arriba o a la izquierda pesa menos.
    const d = (r) => Math.hypot(r.x + r.w / 2 - cerca.x - cerca.w / 2, r.y + r.h / 2 - cerca.y - cerca.h / 2) * (r.y < cerca.y - 5 ? 1.8 : 1) * (r.x < cerca.x - 5 ? 1.8 : 1);
    cands = [...cands].sort((a, b) => d(a) - d(b));
  }
  return cands[0];
}

function rectFoco(objetivo, textos) {
  const lit = objetivo.match(/^@(\d+),(\d+),(\d+),(\d+)$/);
  if (lit) {
    const r = { x: +lit[1], y: +lit[2], w: +lit[3], h: +lit[4] };
    return { ...r, partes: [r] };
  }
  // "texto + texto" une los recuadros (cada uno el más cercano al primero).
  const partes = objetivo.split(" + ").map((x) => x.trim());
  let base = null, u = null;
  const rs = [];
  for (const p of partes) {
    const r = buscarTexto(textos, p, base);
    if (!r) return null;
    rs.push(r);
    if (!base) base = r;
    u = u ? { x: Math.min(u.x, r.x), y: Math.min(u.y, r.y), w: Math.max(u.x + u.w, r.x + r.w) - Math.min(u.x, r.x), h: Math.max(u.y + u.h, r.y + r.h) - Math.min(u.y, r.y) } : { ...r };
  }
  return { ...u, partes: rs };
}

/** Cámara que encuadra un recuadro (px de pantalla 1600×900): escala y desplazamiento, sin salirse de la captura. */
function encuadre(r, zmax = 2.4) {
  const w = Math.max(r.w, 240), h = Math.max(r.h, 120);
  const z = clamp(Math.min((SW * 0.55) / w, (SH * 0.5) / h), 1.25, zmax);
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  const x = clamp(SW / 2 - z * cx, SW - z * SW, 0), y = clamp(SH / 2 - z * cy, SH - z * SH, 0);
  return { z: r2(z), x: Math.round(x), y: Math.round(y) };
}

function componer() {
  const data = load();
  mkdirSync(CLIPS, { recursive: true });
  const el = [];
  const anim = [];
  const vozEnTimeline = [];
  let t = 0;
  let audioTemp = false, audioFalta = false;
  const usadas = new Set();
  const avisos = [];
  const qa = []; // recuadros con su cámara, para revisarlos sobre la captura (assets/qa-recuadros.json)
  const sfx = (at, file, vol = 0.35) => el.push(`<audio id="sfx-${el.length}" src="assets/shared/core/sfx/${file}" data-start="${r2(at)}" data-duration="1.2" data-volume="${vol}"></audio>`);
  const cam = (sel, a, b, at, d = 0.7, ease = "power2.inOut") =>
    anim.push(`tl.fromTo("${sel}",{x:${a.x},y:${a.y},scale:${a.z}},{x:${b.x},y:${b.y},scale:${b.z},duration:${r2(d)},ease:"${ease}",immediateRender:false},${r2(at)});`);
  const UNO = { x: 0, y: 0, z: 1 };

  // Intro con el logo.
  el.push(`<div id="intro" class="clip full" data-start="0" data-duration="5"><img class="logo" src="assets/shared/arvantti/branding/ArvanttiLabsLogo.png" alt=""></div>`);
  anim.push(`tl.fromTo("#intro .logo",{opacity:0,scale:1.08},{opacity:1,scale:1,duration:1.2,ease:"power2.out"},0);tl.to("#intro .logo",{opacity:0,duration:.6},4.4);`);
  sfx(0.2, "whoosh.wav", 0.3);
  t = 5;

  const resumen = [];
  // CAPITULOS=0,1 arma solo esos capítulos (vista previa más corta de renderizar).
  const solo = process.env.CAPITULOS?.split(",").map((x) => x.trim());
  for (const c of data.capitulos.filter((x) => !solo || solo.includes(x.id.split("-")[0]))) {
    const c0 = t;
    const cid = `cap-${c.id}`;
    el.push(`<div id="${cid}" class="clip full card" data-start="${r2(t)}" data-duration="3.4"><div class="grid"></div><div class="in"><p class="eyebrow">${esc(c.eyebrow)}</p><h1>${esc(c.titulo)}</h1><div class="rule"></div></div></div>`);
    anim.push(`tl.fromTo("#${cid} .eyebrow",{opacity:0,y:30},{opacity:1,y:0,duration:.5,ease:"power3.out"},${r2(t + 0.2)});tl.fromTo("#${cid} h1",{opacity:0,y:40},{opacity:1,y:0,duration:.8,ease:"back.out(1.4)"},${r2(t + 0.4)});tl.fromTo("#${cid} .rule",{scaleX:0},{scaleX:1,duration:.9,ease:"power2.inOut"},${r2(t + 0.6)});tl.to("#${cid} .in",{opacity:0,y:-20,duration:.4},${r2(t + 3)});`);
    sfx(t + 0.1, "whoosh-short.mp3", 0.3);
    t += 3.4;
    const folder = c.id;

    c.segmentos.forEach((s, i) => {
      const v = vozDe(s);
      if (v.temp) audioTemp = true;
      if (v.falta) audioFalta = true;
      const d = r2(v.voz + 0.9);
      const s0 = t;
      const sid = `s-${s.id}`;
      const v0 = s0 + 0.3; // la voz arranca 0,3 s después del inicio del segmento
      if (v.af) {
        el.push(`<audio id="voz-${s.id}" src="${relative(HERE, v.af)}" data-start="${r2(v0)}" data-duration="${r2(v.voz)}" data-volume="1"></audio>`);
        vozEnTimeline.push({ af: v.af, at: v0 });
      }
      // Segundo (en la línea de tiempo) en que la voz dice la frase; con la alineación de ElevenLabs es exacto.
      const cue = (frase, desde = 0) => {
        const k = normal(s.texto).indexOf(normal(frase), desde);
        if (k < 0) throw new Error(`${s.id}: la frase del foco "${frase}" no está en el texto de la voz`);
        return r2(v0 + (v.starts ? v.starts[k] : (v.voz * k) / s.texto.length));
      };

      el.push(`<div id="bar-${s.id}" class="clip bar" data-start="${r2(s0)}" data-duration="${d}"><span class="eb">${esc(c.eyebrow)}</span><span class="tt">${esc(s.titulo)}</span><span class="brand">ARVANTTI LABS</span></div>`);
      anim.push(`tl.fromTo("#bar-${s.id} .tt",{opacity:0,x:-24},{opacity:1,x:0,duration:.4,ease:"power2.out"},${r2(s0 + 0.1)});`);

      // Tramo de video que lleva a la captura: desde que la página quedó cargada (sin pantallas en blanco ni pestañas
      // por defecto) hasta la captura, con la cámara acercándose a cada botón que se pulsa.
      let lead = 0;
      // Vuelo de cámara del gemelo 3D (cuadros JPG de grabar.cjs --orbitas): ocupa el segmento hasta el primer foco.
      const orb = s.orbita ? join(GRAB, s.orbita) : null;
      if (orb) {
        if (!existsSync(orb)) throw new Error(`${s.id}: no encuentro la órbita ${s.orbita}`);
        const nf = readdirSync(orb).filter((x) => x.endsWith(".jpg")).length;
        const cues = (s.focos || []).map((f) => cue(f.frase));
        let largo = cues.length ? Math.min(...cues) - 0.45 - s0 : d;
        if (d - largo < 2.5) largo = d;
        lead = r2(Math.max(1.5, largo));
        const clip = join(CLIPS, `${s.id}-orbita.mp4`);
        sh("ffmpeg", ["-y", "-v", "error", "-framerate", String(r2(nf / lead)), "-i", join(orb, "%04d.jpg"), "-vf", `fps=${FPS},scale=${W}:${H}:flags=lanczos`, "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", clip]);
        const vid = `v-${s.id}`;
        el.push(`<div id="vb-${s.id}" class="clip screen" data-start="${r2(s0)}" data-duration="${lead}"><video id="${vid}" class="clip vcam" src="${relative(HERE, clip)}" muted data-start="${r2(s0)}" data-duration="${lead}"></video></div>`);
        anim.push(`tl.fromTo("#vb-${s.id}",{opacity:0},{opacity:1,duration:.35},${r2(s0)});`);
      }
      // Recorrido de producto por el 3D: cada tramo del vuelo se estira para que la cámara llegue a cada equipo justo
      // cuando la voz lo nombra; el rótulo con el nombre del equipo acompaña cada parada.
      if (s.ruta && !orb) {
        const dirR = join(GRAB, s.ruta);
        if (!existsSync(join(dirR, "ruta.json"))) throw new Error(`${s.id}: no encuentro la ruta ${s.ruta}`);
        const R = JSON.parse(readFileSync(join(dirR, "ruta.json"), "utf8"));
        const ll = R.llegadas.map((x, j) => {
          const p = s.paradas.find((q) => q.equipo === x.id && !q.usada);
          if (p) p.usada = true;
          return { ...x, rotulo: p?.rotulo ?? x.id, tc: p ? cue(p.frase) - 0.35 - s0 : null };
        });
        // Las paradas sin frase se reparten entre sus vecinas; la primera arranca con el segmento.
        ll[0].tc = 0;
        for (let j = 1; j < ll.length; j++) {
          if (ll[j].tc !== null) continue;
          let k = j;
          while (k < ll.length && ll[k].tc === null) k++;
          const fin = k < ll.length ? ll[k].tc : d - 1;
          for (let m = j; m < k; m++) ll[m].tc = ll[j - 1].tc + ((fin - ll[j - 1].tc) * (m - j + 1)) / (k - j + 1);
        }
        const partes = [];
        const lista = join(CLIPS, `${s.id}-ruta.txt`);
        ll.forEach((x, j) => {
          const c0 = x.cuadro, c1 = j + 1 < ll.length ? ll[j + 1].cuadro : R.cuadros + 1;
          const t1 = j + 1 < ll.length ? ll[j + 1].tc : d;
          const nf = Math.max(1, c1 - c0), dt = Math.max(0.3, t1 - x.tc);
          // El tramo es: la cámara quieta en el equipo (cuadros iguales) y el vuelo al siguiente. La quieta se estira y
          // el vuelo dura a lo sumo 2,4 s, así la cámara llega al equipo siguiente justo cuando la voz lo nombra.
          const foto = (c) => join(dirR, `${String(c).padStart(4, "0")}.jpg`);
          const f0 = readFileSync(foto(c0));
          let q = 1;
          while (q < nf && readFileSync(foto(c0 + q)).equals(f0)) q++;
          const mv = q < nf ? Math.min(2.4, dt * 0.6) : 0;
          const trozos = [[c0, q, dt - mv], ...(mv ? [[c0 + q, nf - q, mv]] : [])];
          trozos.forEach(([a, n, t], m) => {
            const pc = join(CLIPS, `${s.id}-ruta-${j}-${m}.mp4`);
            sh("ffmpeg", ["-y", "-v", "error", "-framerate", String(Math.max(0.05, n / t)), "-start_number", String(a), "-i", join(dirR, "%04d.jpg"), "-frames:v", String(Math.max(1, Math.round(t * FPS))), "-vf", `fps=${FPS},scale=${W}:${H}:flags=lanczos`, "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", pc]);
            partes.push(`file '${pc}'`);
          });
        });
        writeFileSync(lista, `${partes.join("\n")}\n`);
        const clip = join(CLIPS, `${s.id}-ruta.mp4`);
        sh("ffmpeg", ["-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", lista, "-c", "copy", clip]);
        const vid = `v-${s.id}`;
        el.push(`<div id="vb-${s.id}" class="clip screen" data-start="${r2(s0)}" data-duration="${d}"><video id="${vid}" class="clip vcam" src="${relative(HERE, clip)}" muted data-start="${r2(s0)}" data-duration="${d}"></video>${ll.map((x, j) => `<div class="parada" id="${sid}-p${j}"><i>${j + 1}</i><b>${esc(x.rotulo)}</b></div>`).join("")}</div>`);
        anim.push(`tl.fromTo("#vb-${s.id}",{opacity:0},{opacity:1,duration:.35},${r2(s0)});`);
        ll.forEach((x, j) => {
          const a0 = s0 + x.tc + 0.25, a1 = j + 1 < ll.length ? s0 + ll[j + 1].tc : s0 + d - 0.4;
          anim.push(`tl.fromTo("#${sid}-p${j}",{opacity:0,x:-30},{opacity:1,x:0,duration:.4,ease:"power3.out"},${r2(a0)});tl.to("#${sid}-p${j}",{opacity:0,duration:.25},${r2(Math.max(a0 + 0.5, a1 - 0.25))});`);
          sfx(a0, "pop.mp3", 0.15);
        });
        lead = d;
      }
      const img = imagen(s.imagen);
      if (s.imagen && !img) throw new Error(`${s.id}: no encuentro la imagen ${s.imagen}`);
      const cap = s.imagen ? basename(s.imagen) : null;
      // La carpeta de grabación es la de la captura (un capítulo puede traer segmentos de otra, como 0b en la apertura).
      const carpeta = s.imagen ? s.imagen.split("/")[0] : folder;
      const ms = marcas(carpeta);
      const k = cap ? ms.findIndex((m) => m.captura === cap) : -1;
      if (!orb && k >= 0 && !usadas.has(s.imagen) && img.startsWith(GRAB)) {
        let p = k - 1;
        while (p >= 0 && !ms[p].captura) p--;
        let ini = p >= 0 ? ms[p].t : 0;
        for (let j = p + 1; j < k; j++) if (ms[j].tipo === "nav") ini = Infinity;
        for (let j = p + 1; j < k; j++) if (ms[j].tipo === "listo") ini = ms[j].t + 0.2;
        const fin = ms[k].t;
        if (!Number.isFinite(ini)) ini = fin;
        const max = Math.min(14, Math.max(0, d - 3.5));
        if (fin - ini > max) ini = fin - max;
        lead = r2(fin - ini);
        if (lead >= 1.2) {
          const clip = join(CLIPS, `${s.id}.mp4`);
          const src = join(GRAB, carpeta, "video/recorrido.webm");
          sh("ffmpeg", ["-y", "-v", "error", "-ss", String(r2(ini)), "-i", src, "-t", String(lead), "-an", "-vf", `fps=${FPS},scale=${W}:${H}:flags=lanczos`, "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", clip]);
          lead = r2(Math.min(lead, dur(clip)));
          // La grabación puede adelantar unas décimas la página siguiente (pantalla en blanco al navegar): se corta
          // el clip antes del primer cuadro claro del final.
          const blanco = primerBlanco(clip);
          if (blanco !== null && blanco < lead) lead = r2(Math.max(0, blanco - 0.08));
          // Y si al final ya se ve la pantalla siguiente (otra pestaña), se corta en el último cuadro igual a la captura.
          const igual = ultimoIgual(clip, img, lead);
          if (igual !== null && igual < lead - 0.05) lead = r2(igual + 0.04);
          if (lead < 1.2) lead = 0;
        }
        if (lead >= 1.2) {
          const clip = join(CLIPS, `${s.id}.mp4`);
          const vid = `v-${s.id}`;
          el.push(`<div id="vb-${s.id}" class="clip screen" data-start="${r2(s0)}" data-duration="${lead}"><video id="${vid}" class="clip vcam" src="${relative(HERE, clip)}" muted data-start="${r2(s0)}" data-duration="${lead}"></video></div>`);
          const kx = SW / W;
          anim.push(`tl.set("#${vid}",{x:0,y:0,scale:1},${r2(s0)});`);
          const clics = ms.filter((m) => m.tipo === "clic" && m.t > ini && m.t < fin);
          let estado = UNO, libre = s0;
          for (const [n, m] of clics.entries()) {
            const tc = s0 + (m.t - ini);
            const e = encuadre({ x: m.x * kx, y: m.y * kx, w: m.w * kx, h: m.h * kx }, 1.9);
            const tin = Math.max(libre, tc - 1.1);
            if (tc - tin < 0.35) continue;
            cam(`#${vid}`, estado, e, tin, Math.min(0.8, tc - tin - 0.1));
            sfx(tc, "click-soft.mp3", 0.4);
            const sig = clics[n + 1] ? s0 + (clics[n + 1].t - ini) : Infinity;
            const tout = Math.min(tc + 0.6, s0 + lead - 0.75);
            if (sig - 1.1 > tout + 0.7 || !Number.isFinite(sig)) {
              if (tout > tc) {
                cam(`#${vid}`, e, UNO, tout, Math.min(0.7, s0 + lead - tout - 0.05));
                estado = UNO;
                libre = tout + 0.7;
              } else estado = e;
            } else (estado = e), (libre = tc + 0.3);
          }
        } else lead = 0;
      }
      if (s.imagen) usadas.add(s.imagen);
      const still0 = r2(s0 + lead), stillD = r2(d - lead);
      const focos = s.focos || [];

      if (s.tarjeta === "ahorro") {
        const rows = data.cierre
          .map((r, k) => `<tr id="${sid}-r${k}"><th>${esc(r[0])}</th><td>${esc(r[1])}</td><td class="new">${esc(r[2])}</td><td class="save">${esc(r[3])}</td></tr>`)
          .join("");
        el.push(`<div id="${sid}" class="clip screen ahorro" data-start="${r2(s0)}" data-duration="${d}"><div class="grid"></div><h2>Lo que ahorra optimizar</h2><table><thead><tr><th>Escenario</th><th>Antes</th><th>Con el gemelo</th><th>Ahorro</th></tr></thead><tbody>${rows}</tbody></table><p class="foot">Cifras de las corridas de la demo. Fractal recomienda; la persona decide.</p></div>`);
        anim.push(`tl.fromTo("#${sid} h2",{opacity:0,y:30},{opacity:1,y:0,duration:.6,ease:"power3.out"},${r2(s0 + 0.2)});`);
        // Cada fila entra cuando la voz habla de ella (focos con la clave r0..r4) o, si no hay, repartidas.
        data.cierre.forEach((_, k) => {
          const f = focos.find((x) => x.objetivo === `r${k}`);
          const at = f ? cue(f.frase) - 0.2 : s0 + 1 + k * ((d - 6) / data.cierre.length);
          anim.push(`tl.fromTo("#${sid}-r${k}",{opacity:0,x:-40},{opacity:1,x:0,duration:.5,ease:"back.out(1.3)"},${r2(at)});`);
          if (f) anim.push(`tl.fromTo("#${sid}-r${k}",{backgroundColor:"rgba(45,127,249,0)"},{backgroundColor:"rgba(45,127,249,.22)",duration:.4,yoyo:true,repeat:1},${r2(at + 0.5)});`);
        });
        anim.push(`tl.fromTo("#${sid} .foot",{opacity:0},{opacity:1,duration:.6},${r2(s0 + d - 5)});`);
      } else if (s.tarjeta) {
        tarjeta(s, sid, still0, stillD, cue, el, anim, sfx);
      } else if (stillD < 0.3) {
        // La órbita cubre todo el segmento.
      } else {
        const [iw, ih] = pngSize(img);
        const kx = SW / iw;
        const alto = (ih / iw) * SW;
        // La captura y sus recuadros van en la misma capa (.drift): se mueven juntos con la cámara y con la deriva.
        const pos = el.length, rings = [];
        el.push("");
        const pintar = () => (el[pos] = `<div id="${sid}" class="clip screen" data-start="${still0}" data-duration="${stillD}"><div class="cam" id="cam-${s.id}"><div class="drift" style="height:${Math.round(alto)}px"><img src="${relative(HERE, img)}" alt="" style="height:${Math.round(alto)}px">${rings.join("")}</div></div></div>`);
        pintar();
        if (!lead) anim.push(`tl.fromTo("#${sid}",{opacity:0},{opacity:1,duration:.35},${r2(s0)});`);
        anim.push(`tl.set("#cam-${s.id}",{x:0,y:0,scale:1},${still0});`);
        if (alto > SH + 40) {
          // Captura de página completa: se recorre de arriba abajo.
          anim.push(`tl.fromTo("#${sid} img",{y:0},{y:${-Math.round(alto - SH)},duration:${r2(Math.max(1, stillD - 2.5))},ease:"sine.inOut"},${r2(still0 + 1.2)});`);
          if (focos.length) avisos.push(`${s.id}: captura de página completa, los focos no se usan`);
        } else {
          // Nunca una pantalla quieta: deriva suave y, con cada dato que dice la voz, la cámara va a donde se ve.
          const zin = i % 2 === 0;
          anim.push(`tl.fromTo("#${sid} .drift",{scale:${zin ? 1 : 1.04}},{scale:${zin ? 1.04 : 1},duration:${stillD},ease:"sine.inOut"},${still0});`);
          const textos = ms.find((m) => m.captura === cap)?.textos || (marcasDeCualquiera(s.imagen)?.textos ?? []);
          const otros = textos.map((x) => ({ s: x.s, x: x.x * kx, y: x.y * kx, w: x.w * kx, h: x.h * kx }));
          const fs = [];
          for (const f of focos) {
            // "—": el dato no está en esta pantalla; solo el rótulo, con la cámara abierta.
            if (f.objetivo === "—") {
              fs.push({ ...f, r: { x: 0, y: 0, w: SW, h: SH }, tc: cue(f.frase), solo: true });
              continue;
            }
            const r = rectFoco(f.objetivo, textos);
            if (!r) {
              avisos.push(`${s.id}: no encuentro "${f.objetivo}" en ${cap}`);
              continue;
            }
            const k1 = (q) => ({ x: q.x * kx, y: q.y * kx, w: q.w * kx, h: q.h * kx });
            fs.push({ ...f, r: k1(r), partes: r.partes.map(k1), tc: cue(f.frase) });
          }
          fs.sort((a, b) => a.tc - b.tc);
          let estado = UNO;
          const fin = still0 + stillD;
          fs.forEach((f, j) => {
            const e = f.solo ? UNO : encuadre(f.r);
            const tin = Math.max(still0 + 0.1, f.tc - 0.45);
            const sig = fs[j + 1] ? Math.max(still0 + 0.1, fs[j + 1].tc - 0.45) : Infinity;
            const hasta = Math.min(sig - 0.05, f.tc + 3.4, fin - 0.8);
            if (hasta - tin < 0.6) return;
            cam(`#cam-${s.id}`, estado, e, tin, 0.6);
            // Recuadro en la captura (se mueve con la cámara) y rótulo con el dato. El borde mide 3 px en pantalla; el
            // margen se achica hasta que el borde no pise otro texto, y un dato de varias partes ("a + b") lleva un
            // recuadro por parte si el recuadro común pisaría algo entre ellas.
            const rid = `${sid}-f${j}`;
            let ring = null;
            if (!f.solo) {
              const bw = 3 / e.z;
              const une = (a, o) => ({ x: Math.min(a.x, o.x), y: Math.min(a.y, o.y), w: Math.max(a.x + a.w, o.x + o.w) - Math.min(a.x, o.x), h: Math.max(a.y + a.h, o.y + o.h) - Math.min(a.y, o.y) });
              const anillo = (r0) => {
                let r = r0;
                const caja = (m) => ({ x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m });
                const corta = (pad) => {
                  const fuera = caja(pad + bw), dentro = caja(pad);
                  return otros.filter((o) => {
                    const toca = o.x < fuera.x + fuera.w && o.x + o.w > fuera.x && o.y < fuera.y + fuera.h && o.y + o.h > fuera.y;
                    const adentro = o.x >= dentro.x - 0.5 && o.y >= dentro.y - 0.5 && o.x + o.w <= dentro.x + dentro.w + 0.5 && o.y + o.h <= dentro.y + dentro.h + 0.5;
                    return toca && !adentro;
                  });
                };
                const pads = [10, 8, 6, 5, 4, 3, 2, 1].map((x) => x / Math.sqrt(e.z));
                let pad = pads.find((x) => !corta(x).length);
                // Si el borde pisa un texto pequeño pegado al dato (un ícono, una unidad, su etiqueta), el recuadro lo
                // incluye, pero solo si así pisa menos textos (no se come la fila vecina de una lista).
                for (let vuelta = 0; pad === undefined && vuelta < 3; vuelta++) {
                  const antes = corta(pads.at(-1));
                  let mejor = null;
                  for (const o of antes.filter((x) => x.w * x.h <= 1.5 * Math.max(r0.w * r0.h, 600))) {
                    const guarda = r;
                    r = une(r, o);
                    const n = corta(pads.at(-1)).length;
                    if (n < antes.length && (!mejor || n < mejor.n)) mejor = { n, r };
                    r = guarda;
                  }
                  if (!mejor) break;
                  r = mejor.r;
                  pad = pads.find((x) => !corta(x).length);
                }
                if (pad !== undefined) return { box: caja(pad + bw), toca: [] };
                // Sin margen libre: el borde pasa por la mitad del espacio entre el dato y cada texto vecino.
                const p = pads.at(-1), c = caja(p + bw);
                let L = c.x, T = c.y, R = c.x + c.w, B = c.y + c.h;
                for (const o of corta(p)) {
                  // Solo contra textos de una línea que quedan claramente a un lado (las cajas de línea se pisan unos px).
                  if (o.h > 1.6 * Math.min(r.h, 40)) continue;
                  if (o.y + o.h <= r.y + r.h * 0.35) T = Math.max(T, (o.y + o.h + r.y) / 2 - bw / 2);
                  else if (o.y >= r.y + r.h * 0.65) B = Math.min(B, (o.y + r.y + r.h) / 2 + bw / 2);
                  else if (o.x + o.w <= r.x + 2) L = Math.max(L, (o.x + o.w + r.x) / 2 - bw / 2);
                  else if (o.x >= r.x + r.w - 2) R = Math.min(R, (o.x + r.x + r.w) / 2 + bw / 2);
                }
                const box = { x: L, y: T, w: R - L, h: B - T };
                const dentro = { x: L + bw, y: T + bw, w: R - L - 2 * bw, h: B - T - 2 * bw };
                const propio = (o) => Math.max(0, Math.min(o.x + o.w, r.x + r.w) - Math.max(o.x, r.x)) * Math.max(0, Math.min(o.y + o.h, r.y + r.h) - Math.max(o.y, r.y)) > 0.5 * o.w * o.h;
                const toca = otros.filter((o) => {
                  if (propio(o)) return false;
                  const t = o.x < box.x + box.w - 0.5 && o.x + o.w > box.x + 0.5 && o.y < box.y + box.h - 0.5 && o.y + o.h > box.y + 0.5;
                  const a = o.x >= dentro.x - 0.5 && o.y >= dentro.y - 0.5 && o.x + o.w <= dentro.x + dentro.w + 0.5 && o.y + o.h <= dentro.y + dentro.h + 0.5;
                  return t && !a;
                });
                return { box, toca };
              };
              let anillos = [anillo(f.r)];
              // Partes separadas (p. ej. dos máquinas): un recuadro por parte, no uno grande que cruce lo de en medio.
              const area = (q) => (q.w + 8) * (q.h + 8);
              if (f.partes.length > 1 && area(f.r) > 2.2 * f.partes.reduce((n, q) => n + area(q), 0)) anillos = f.partes.map(anillo);
              else if (anillos[0].toca.length && f.partes.length > 1) {
                const sep = f.partes.map(anillo);
                if (sep.reduce((n, x) => n + x.toca.length, 0) < anillos[0].toca.length) anillos = sep;
              }
              const toca = anillos.flatMap((x) => x.toca);
              if (toca.length) avisos.push(`${s.id}: el recuadro de "${f.objetivo}" toca ${toca.map((o) => `"${o.s.slice(0, 30)}"`).join(", ")}`);
              anillos.forEach((x, n) => {
                const o = x.box, id = `${rid}-${n}`;
                qa.push({ seg: s.id, objetivo: f.objetivo, img: relative(HERE, img), ring: o, bw, cam: e });
                rings.push(`<div id="${id}" class="clip ring" data-start="${r2(tin)}" data-duration="${r2(hasta - tin)}" style="left:${r2(o.x)}px;top:${r2(o.y)}px;width:${r2(o.w)}px;height:${r2(o.h)}px;border-width:${r2(bw)}px;border-radius:${r2(8 / e.z)}px;box-shadow:0 0 ${r2(12 / e.z)}px #ffb020aa"></div>`);
                anim.push(`tl.fromTo("#${id}",{opacity:0,scale:1.25},{opacity:1,scale:1,duration:.35,ease:"back.out(2)"},${r2(tin + 0.5)});`);
              });
              pintar();
              const o = anillos.map((x) => x.box).reduce(une);
              ring = { x: SX + e.x + e.z * o.x, y: SY + e.y + e.z * o.y, w: e.z * o.w, h: e.z * o.h };
            }
            if (f.rotulo) {
              // El rótulo va abajo o arriba, donde no tape el recuadro.
              const lineas = Math.ceil((f.rotulo.length * 25) / 1340);
              const alto = 28 + lineas * 51;
              const zona = (arr) => (arr ? [SY + 40, SY + 40 + alto] : [SY + SH - 130, SY + SH - 130 + alto]);
              const pisa = (arr) => ring && ring.y < zona(arr)[1] + 12 && ring.y + ring.h > zona(arr)[0] - 12;
              let arriba = !f.solo && ring.y + ring.h / 2 > SY + SH * 0.55;
              if (pisa(arriba) && !pisa(!arriba)) arriba = !arriba;
              if (pisa(arriba)) avisos.push(`${s.id}: el rótulo "${f.rotulo}" queda sobre el recuadro`);
              el.push(`<div id="${rid}-r" class="clip rotulo ${arriba ? "arriba" : "abajo"}" data-start="${r2(tin)}" data-duration="${r2(hasta - tin)}"><span>${esc(f.rotulo)}</span></div>`);
              anim.push(`tl.fromTo("#${rid}-r span",{opacity:0,y:${arriba ? -20 : 20}},{opacity:1,y:0,duration:.4,ease:"power3.out"},${r2(tin + 0.55)});`);
            }
            sfx(tin + 0.5, "pop.mp3", 0.18);
            estado = e;
            if (sig - hasta > 1.1) {
              cam(`#cam-${s.id}`, estado, UNO, hasta, Math.min(0.8, fin - hasta - 0.05));
              estado = UNO;
            }
          });
        }
      }

      // Subtítulos: cada trozo arranca cuando la voz dice su primera letra.
      const ts = trozos(s.texto);
      let desde = 0;
      const ini = ts.map((x) => {
        const kk = normal(s.texto).indexOf(normal(x.slice(0, 12)), desde);
        desde = kk >= 0 ? kk + 1 : desde;
        return kk >= 0 ? kk : null;
      });
      const total = ts.reduce((a, x) => a + x.length, 0);
      let ct = v0;
      ts.forEach((x, j) => {
        const st = v.starts && ini[j] !== null ? v0 + v.starts[ini[j]] : ct;
        const nx = j + 1 < ts.length ? (v.starts && ini[j + 1] !== null ? v0 + v.starts[ini[j + 1]] : st + (v.voz * x.length) / total) : v0 + v.voz + 0.5;
        el.push(`<div id="cc-${s.id}-${j}" class="clip cc" data-start="${r2(st)}" data-duration="${r2(Math.max(0.4, nx - st))}"><span>${esc(x)}</span></div>`);
        ct = nx;
      });
      t = r2(s0 + d);
    });
    resumen.push(`${c.id}: ${r2(t - c0)} s`);
  }

  // Cierre con el logo.
  el.push(`<div id="outro" class="clip full" data-start="${r2(t)}" data-duration="6"><img class="logo" src="assets/shared/arvantti/branding/ArvanttiLabsLogo.png" alt=""><p class="sign">Gemelo digital · Planta de salsas y aderezos</p></div>`);
  anim.push(`tl.fromTo("#outro .logo",{opacity:0,scale:.96},{opacity:1,scale:1,duration:1.2,ease:"power2.out"},${r2(t + 0.2)});tl.fromTo("#outro .sign",{opacity:0,y:20},{opacity:1,y:0,duration:.8},${r2(t + 1.2)});`);
  sfx(t + 0.1, "whoosh.wav", 0.3);
  const TOTAL = r2(t + 6);
  anim.push(`tl.fromTo("#progress",{scaleX:0},{scaleX:1,duration:${TOTAL},ease:"none"},0);`);
  if (audioTemp) el.push(`<div id="temp" class="clip" data-start="0" data-duration="${TOTAL}">TEMP_AUDIO · voz local de prueba</div>`);
  const mus = mezclaMusica(vozEnTimeline, TOTAL);
  if (mus) el.push(`<audio id="musica" src="${mus}" data-start="0" data-duration="${TOTAL}" data-volume="1"></audio>`);

  const html = `<!doctype html>
<html lang="es" data-resolution="landscape">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=${W}, height=${H}">
<title>Demo de salsas · gemelo digital</title>
<script src="assets/vendor/gsap.min.js"></script>
<link rel="stylesheet" href="assets/shared/core/brand.css">
<style>
@font-face{font-family:"Inter";src:local("Inter")}
@font-face{font-family:"Inter Display";src:local("Inter Display")}
@font-face{font-family:"IBM Plex Mono";src:local("IBM Plex Mono")}
html,body{width:${W}px;height:${H}px;margin:0;overflow:hidden;background:#0b0f18;font-family:Inter,"Inter Display",Arial,sans-serif;color:#f8fafc}
#root{position:relative;width:${W}px;height:${H}px;background:radial-gradient(1200px 700px at 50% 40%,#111a2c 0%,#0b0f18 70%)}
#root>.grid0{position:absolute;inset:0;opacity:.07;background-image:linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px);background-size:80px 80px}
.full{position:absolute;inset:0;background:#0b0f18;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:20}
.full .logo{width:1300px;height:auto}
.full .sign{position:absolute;bottom:120px;font:500 30px Inter,sans-serif;letter-spacing:6px;color:#d8dadf;text-transform:uppercase}
.card{background:#0b0f18}
.card .grid,.tj .grid{position:absolute;inset:0;opacity:.08;background-image:linear-gradient(#4ea7ff 1px,transparent 1px),linear-gradient(90deg,#4ea7ff 1px,transparent 1px);background-size:80px 80px}
.card .in{position:relative;text-align:center;max-width:1500px}
.card .eyebrow{font:700 30px "IBM Plex Mono",monospace;letter-spacing:8px;color:#4ea7ff;margin:0 0 24px}
.card h1{font:800 84px/1.08 "Inter Display",Inter,sans-serif;margin:0;color:#f8fafc;letter-spacing:-1px}
.card .rule{height:6px;width:520px;margin:40px auto 0;background:linear-gradient(90deg,#2d7ff9,#4ea7ff);transform-origin:left}
.bar{position:absolute;left:${SX}px;top:18px;width:${SW}px;height:44px;display:flex;align-items:center;gap:22px;z-index:5;font:600 26px Inter,sans-serif}
.bar .eb{font:700 22px "IBM Plex Mono",monospace;letter-spacing:4px;color:#4ea7ff;padding:6px 14px;border:2px solid #2d7ff9}
.bar .tt{color:#f8fafc}
.bar .brand{margin-left:auto;font:600 20px Inter,sans-serif;letter-spacing:5px;color:#7a7e86}
.screen{position:absolute;left:${SX}px;top:${SY}px;width:${SW}px;height:${SH}px;overflow:hidden;background:#0e1430;box-shadow:0 0 0 2px #2d7ff955,0 24px 60px #000a;z-index:3}
.screen .vcam{position:absolute;left:0;top:0;width:${SW}px;height:${SH}px;object-fit:cover;transform-origin:0 0}
.screen .cam{position:absolute;left:0;top:0;width:${SW}px;height:${SH}px;transform-origin:0 0}
.screen .drift{position:absolute;left:0;top:0;width:${SW}px;transform-origin:50% 40%}
.screen img{position:absolute;left:0;top:0;width:${SW}px;transform-origin:50% 40%}
.ring{position:absolute;z-index:7;box-sizing:border-box;border:3px solid #ffb020;pointer-events:none}
.rotulo{position:absolute;left:${SX}px;width:${SW}px;z-index:8;display:flex;justify-content:center}
.rotulo.abajo{top:${SY + SH - 130}px}
.rotulo.arriba{top:${SY + 40}px}
.rotulo span{font:800 44px/1.15 "Inter Display",Inter,sans-serif;color:#0b0f18;background:#ffb020;padding:14px 30px;border-radius:12px;box-shadow:0 12px 40px #000c;max-width:1400px;text-align:center}
.cc{position:absolute;left:${SX}px;width:${SW}px;top:${SY + SH + 10}px;height:86px;display:flex;align-items:center;justify-content:center;text-align:center;z-index:6}
.cc span{font:600 31px/1.25 Inter,sans-serif;color:#f8fafc;text-shadow:0 2px 8px #000}
.tj{background:#0b0f18;padding:48px 64px;box-sizing:border-box}
.tj h2{position:relative;font:800 54px "Inter Display",Inter,sans-serif;margin:0 0 34px;color:#f8fafc}
.tj .eyebrow{position:relative;font:700 22px "IBM Plex Mono",monospace;letter-spacing:6px;color:#4ea7ff;margin:0 0 12px}
.esc{position:relative;display:flex;flex-direction:column;gap:18px}
.esc .it{display:flex;align-items:center;gap:30px;padding:18px 26px;border:2px solid #2d7ff944;border-radius:14px;background:#111a2c;opacity:.28}
.esc .n{font:800 56px "Inter Display",Inter,sans-serif;color:#4ea7ff;width:70px;text-align:center}
.esc .tx{font:700 40px Inter,sans-serif;color:#f8fafc}
.prods{position:relative;display:grid;grid-template-columns:1fr 1.2fr .8fr;gap:26px}
.prods .fam{display:flex;flex-direction:column;gap:12px;opacity:.3}
.prods .fh{font:700 20px "IBM Plex Mono",monospace;letter-spacing:4px;color:#4ea7ff;text-transform:uppercase;margin-bottom:4px}
.prods .p{padding:14px 20px;border:2px solid #2d7ff944;border-radius:12px;background:#111a2c;opacity:.35}
.prods .p b{display:block;font:700 30px Inter,sans-serif;color:#f8fafc}
.prods .p i{font:500 22px "IBM Plex Mono",monospace;font-style:normal;color:#d8dadf}
.reglas{position:relative;display:grid;grid-template-columns:1fr 1fr;gap:24px}
.reglas .rg{padding:26px 30px;border:2px solid #2d7ff944;border-radius:14px;background:#111a2c;opacity:.25}
.reglas .n{font:800 44px "Inter Display",Inter,sans-serif;color:#4ea7ff;margin-right:16px}
.reglas b{font:800 40px Inter,sans-serif;color:#f8fafc}
.reglas i{display:block;margin-top:12px;font:500 27px/1.35 Inter,sans-serif;font-style:normal;color:#d8dadf}
.puntaje{position:relative;display:flex;flex-wrap:wrap;align-items:center;gap:20px;margin-top:40px}
.puntaje .pt{padding:24px 26px;border:2px solid #2d7ff966;border-radius:14px;background:#111a2c;font:700 34px "IBM Plex Mono",monospace;color:#f8fafc;opacity:.25}
.puntaje .mas{font:800 48px Inter,sans-serif;color:#4ea7ff}
.partes{position:relative;display:grid;grid-template-columns:repeat(4,1fr);gap:22px}
.partes .pa{opacity:.25;border:2px solid #2d7ff944;border-radius:14px;background:#111a2c;padding:14px;display:flex;flex-direction:column;gap:8px}
.partes img{width:100%;border-radius:8px;border:1px solid #2d7ff933}
.partes b{font:800 32px Inter,sans-serif;color:#f8fafc}
.partes i{font:500 23px Inter,sans-serif;font-style:normal;color:#d8dadf}
.parada{position:absolute;left:40px;bottom:46px;display:flex;align-items:center;gap:16px;padding:14px 26px 14px 16px;background:#0b0f18e6;border:2px solid #4ea7ff;border-radius:12px;opacity:0}
.parada i{font:800 28px "IBM Plex Mono",monospace;font-style:normal;color:#0b0f18;background:#4ea7ff;border-radius:50%;width:46px;height:46px;display:flex;align-items:center;justify-content:center}
.parada b{font:800 36px Inter,sans-serif;color:#f8fafc}
.mods{position:absolute;left:0;top:0;width:${SW}px;height:${SH}px}
.mods svg{position:absolute;left:0;top:0}
.mods .centro{position:absolute;left:${SW / 2 - 170}px;top:${SH / 2 - 120}px;width:340px;height:340px;border-radius:50%;background:radial-gradient(circle at 50% 40%,#2d7ff9,#123a7a 70%);box-shadow:0 0 80px #2d7ff988;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
.mods .centro b{font:700 22px "IBM Plex Mono",monospace;letter-spacing:5px;color:#cfe3ff}
.mods .centro .nucleo{font:600 18px Inter,sans-serif;font-style:normal;color:#cfe3ff;margin-top:10px}
.mods .centro strong{font:800 50px/1.05 "Inter Display",Inter,sans-serif;color:#fff;margin-top:8px}
.mods .m{position:absolute;width:330px;margin-left:-165px;margin-top:-66px;height:132px;border-radius:16px;background:#111a2c;border:2px solid #4ea7ff;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;opacity:.25}
.mods .m b{font:800 30px Inter,sans-serif;color:#f8fafc}
.mods .m i{font:500 19px/1.25 Inter,sans-serif;font-style:normal;color:#a9c9f5;margin-top:6px;padding:0 12px}
.flujo{position:relative;display:grid;grid-template-columns:520px 120px 420px 120px 300px;align-items:center;margin-top:30px}
.flujo .col{display:flex;flex-direction:column;gap:22px}
.flujo .f{padding:22px 26px;border-radius:14px;border:2px solid #4ea7ff;background:#111a2c;opacity:.25}
.flujo .f b{display:block;font:800 34px Inter,sans-serif;color:#f8fafc}
.flujo .f i{display:block;font:500 22px Inter,sans-serif;font-style:normal;color:#a9c9f5;margin-top:6px}
.flujo .flecha{font:800 70px Inter,sans-serif;color:#4ea7ff;text-align:center;opacity:.25}
.flujo .ia{border-color:#37e38b}
.flujo .ia b{color:#37e38b}
.flujo .aps{border-color:#ffb020;text-align:center}
.cosim{position:relative;display:grid;grid-template-columns:900px 1fr;gap:48px}
.cosim .cells{display:grid;grid-template-columns:repeat(48,1fr);gap:3px;width:900px;align-content:start}
.cosim .cells i{display:block;height:14px;border-radius:2px;background:#2d7ff9;opacity:.08}
.cosim .lado{display:flex;flex-direction:column;gap:18px}
.cosim .num{font:800 64px "Inter Display",Inter,sans-serif;color:#f8fafc;line-height:1}
.cosim .lbl{font:600 20px "IBM Plex Mono",monospace;letter-spacing:3px;color:#4ea7ff;text-transform:uppercase}
.cosim .ok{font:800 40px "IBM Plex Mono",monospace;letter-spacing:6px;color:#37e38b;opacity:0}
.cosim .rs{display:flex;flex-direction:column;gap:12px;margin-top:8px}
.cosim .r{font:600 26px Inter,sans-serif;color:#f8fafc;opacity:.25}
.cosim .r:before{content:"✓ ";color:#37e38b}
.ahorro{background:#0b0f18;padding:44px 56px}
.ahorro h2{position:relative;font:800 52px "Inter Display",Inter,sans-serif;margin:0 0 30px;color:#f8fafc}
.ahorro table{position:relative;width:100%;border-collapse:collapse;font:500 23px/1.3 Inter,sans-serif}
.ahorro th,.ahorro td{text-align:left;padding:16px 14px;border-bottom:1px solid #2d7ff944;vertical-align:top}
.ahorro thead th{font:700 18px "IBM Plex Mono",monospace;letter-spacing:3px;color:#4ea7ff;text-transform:uppercase}
.ahorro tbody th{color:#f8fafc;width:21%}
.ahorro td{color:#d8dadf}
.ahorro td.new{color:#4ea7ff}
.ahorro td.save{color:#37e38b;font-weight:700}
.ahorro .grid{position:absolute;inset:0;opacity:.08;background-image:linear-gradient(#4ea7ff 1px,transparent 1px),linear-gradient(90deg,#4ea7ff 1px,transparent 1px);background-size:80px 80px}
.ahorro .foot{position:absolute;bottom:34px;left:56px;font:500 24px Inter,sans-serif;color:#d8dadf}
#progress{position:absolute;left:0;bottom:0;height:6px;width:${W}px;background:#2d7ff9;transform-origin:left;z-index:30}
#temp{position:absolute;right:20px;bottom:16px;font:700 15px "IBM Plex Mono",monospace;color:#ff6b35;letter-spacing:2px;z-index:40}
</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="${TOTAL}" data-width="${W}" data-height="${H}" data-fps="${FPS}">
<div class="grid0"></div>
${el.join("\n")}
<div id="progress"></div>
</div>
<script>
window.__timelines = window.__timelines || {};
const tl = gsap.timeline({ paused: true });
${anim.join("\n")}
window.__timelines["main"] = tl;
tl.seek(0);
</script>
</body>
</html>
`;
  writeFileSync(join(HERE, "index.html"), html);
  const estadoAudio = audioFalta ? "falta (duración estimada)" : audioTemp ? "TEMP_AUDIO" : "ElevenLabs";
  writeFileSync(join(HERE, "tiempos.json"), `${JSON.stringify({ total_s: TOTAL, audio: estadoAudio, musica: mus ? "ElevenLabs Music" : "sin música", capitulos: resumen }, null, 2)}\n`);
  writeFileSync(join(HERE, "assets/qa-recuadros.json"), `${JSON.stringify(qa)}\n`);
  for (const a of avisos) console.warn(`aviso: ${a}`);
  console.log(`index.html: ${TOTAL} s (${(TOTAL / 60).toFixed(1)} min), audio ${estadoAudio}, ${mus ? "con" : "sin"} música\n${resumen.join("\n")}`);
}

/** Segundo del primer cuadro casi blanco (página cargando) en el clip, o null. */
function primerBlanco(clip) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-i", clip, "-vf", "signalstats,metadata=print:key=lavfi.signalstats.YAVG", "-f", "null", "-"], { encoding: "utf8" });
  const ys = [...(r.stderr || "").matchAll(/pts_time:([\d.]+)[\s\S]*?YAVG=([\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
  const hit = ys.find(([, y]) => y > 150);
  return hit ? hit[0] : null;
}

/** Segundo del último cuadro del clip (hasta `hasta`) que se parece a la captura, o null si ninguno se parece. */
function ultimoIgual(clip, png, hasta) {
  const gray = (args) => execFileSync("ffmpeg", ["-v", "error", ...args, "-vf", "fps=25,scale=80:45,format=gray", "-f", "rawvideo", "-"], { maxBuffer: 1 << 28 });
  const n = 80 * 45;
  const ref = gray(["-i", png]);
  const v = gray(["-t", String(hasta), "-i", clip]);
  const frames = Math.floor(v.length / n);
  const diff = (k) => {
    let d = 0;
    for (let i = 0; i < n; i++) d += Math.abs(v[k * n + i] - ref[i]);
    return d / n;
  };
  for (let k = frames - 1; k >= 0; k--) if (diff(k) < 14) return k / 25;
  return null;
}

/** Textos de una captura tomada en otro escenario (p. ej. la apertura usa capturas de los escenarios). */
function marcasDeCualquiera(rel) {
  if (!rel) return null;
  const [folder] = rel.split("/");
  return marcas(folder).find((m) => m.captura === basename(rel)) || null;
}

/** Tarjetas animadas: cinco escenarios, módulos, fuentes de la programación y el cosimulador resolviendo. */
function tarjeta(s, sid, t0, d, cue, el, anim, sfx) {
  const [tipo, ...args] = s.tarjeta.split("|").map((x) => x.trim());
  const focos = s.focos || [];
  const at = (clave) => {
    const f = focos.find((x) => x.objetivo === clave);
    return f ? cue(f.frase) : null;
  };
  const encender = (sel, clave, desde = { opacity: 0.25, scale: 0.96 }) => {
    const tc = at(clave);
    if (tc === null) return anim.push(`tl.set("${sel}",{opacity:1},${r2(t0 + 0.6)});`);
    anim.push(`tl.fromTo("${sel}",{opacity:${desde.opacity},scale:${desde.scale}},{opacity:1,scale:1,duration:.45,ease:"back.out(1.8)"},${r2(tc - 0.15)});`);
    sfx(tc - 0.15, "pop.mp3", 0.2);
  };
  let body = "";
  if (tipo === "escenarios") {
    const items = CAPITULOS.slice(1, 6);
    body = `<p class="eyebrow">DEMO DE SALSAS</p><h2>Cinco escenarios</h2><div class="esc">${items.map((c, k) => `<div class="it" id="${sid}-k${k + 1}"><span class="n">${k + 1}</span><span class="tx">${esc(c.titulo)}</span></div>`).join("")}</div>`;
    items.forEach((_, k) => encender(`#${sid}-k${k + 1}`, String(k + 1), { opacity: 0.28, scale: 0.97 }));
  } else if (tipo === "modulos") {
    const cx = SW / 2, cy = SH / 2 + 50, rx = 600, ry = 330;
    const pos = MODULOS.map((_, k) => {
      const a = -Math.PI / 2 + (k * 2 * Math.PI) / MODULOS.length;
      return [Math.round(cx + rx * Math.cos(a)), Math.round(cy + ry * Math.sin(a))];
    });
    const lines = pos.map(([x, y], k) => `<line id="${sid}-l${k}" x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#4ea7ff" stroke-width="3" opacity=".15"/>`).join("");
    body = `<div class="mods"><svg width="${SW}" height="${SH}">${lines}</svg><div class="centro" id="${sid}-centro" style="top:${cy - 170}px"><b>ARVANTTI</b><strong>Digital<br>Twin</strong><i class="nucleo">núcleo · gemelo 3D</i></div>${MODULOS.map(([k, n, x], j) => `<div class="m" id="${sid}-m-${k}" style="left:${pos[j][0]}px;top:${pos[j][1]}px"><b>${esc(n)}</b><i>${esc(x)}</i></div>`).join("")}</div>`;
    const tc = at("centro");
    anim.push(`tl.fromTo("#${sid}-centro",{opacity:0,scale:.6},{opacity:1,scale:1,duration:.8,ease:"back.out(1.6)"},${r2(tc ?? t0 + 0.3)});`);
    MODULOS.forEach(([k], j) => {
      encender(`#${sid}-m-${k}`, k);
      const tk = at(k);
      if (tk !== null) anim.push(`tl.fromTo("#${sid}-l${j}",{opacity:.15},{opacity:.9,duration:.4},${r2(tk - 0.15)});`);
    });
  } else if (tipo === "fuentes") {
    body = `<p class="eyebrow">DE DÓNDE SALE LA PROGRAMACIÓN</p><h2>Manual, importada o integrada</h2><div class="flujo"><div class="col">${FUENTES.map(([k, n, x]) => `<div class="f" id="${sid}-k-${k}"><b>${esc(n)}</b><i>${esc(x)}</i></div>`).join("")}</div><div class="flecha" id="${sid}-a1">→</div><div class="f ia" id="${sid}-k-ia"><b>Asistente de IA</b><i>entrenado para normalizar los datos</i></div><div class="flecha" id="${sid}-a2">→</div><div class="f aps" id="${sid}-k-aps"><b>APS</b><i>programación vigente</i></div></div>`;
    for (const [k] of FUENTES) encender(`#${sid}-k-${k}`, k);
    encender(`#${sid}-k-ia`, "ia");
    encender(`#${sid}-a1`, "ia", { opacity: 0.25, scale: 1 });
    encender(`#${sid}-k-aps`, "aps");
    encender(`#${sid}-a2`, "aps", { opacity: 0.25, scale: 1 });
  } else if (tipo === "cosimulador") {
    const [vars = "4.877 variables", restr = "1.301 restricciones", seg = "0,8 s"] = args;
    const n = 48 * 30;
    const nv = Number(vars.replace(/\D/g, "")), nr = Number(restr.replace(/\D/g, "")), ss = Number(seg.replace(",", ".").replace(/[^\d.]/g, ""));
    body = `<p class="eyebrow">COSIMULADOR · PROGRAMACIÓN LINEAL</p><h2>Casi cinco mil variables en menos de un segundo</h2><div class="cosim"><div class="cells">${"<i></i>".repeat(n)}</div><div class="lado"><div><div class="num" id="${sid}-nv">0</div><div class="lbl">variables</div></div><div><div class="num" id="${sid}-nr">0</div><div class="lbl">restricciones</div></div><div><div class="num" id="${sid}-ns">0,0 s</div><div class="lbl">tiempo de cálculo</div></div><div class="ok" id="${sid}-ok">ÓPTIMO</div><div class="rs">${RESTRICCIONES.map(([k, x]) => `<div class="r" id="${sid}-r-${k}">${esc(x)}</div>`).join("")}</div></div></div>`;
    // Arranca cuando la voz dice "resuelve" (o al inicio): el modelo se arma (celdas) y se resuelve en ~1 s de video.
    // Si la voz lo dice mientras corre el clip previo, la animación arranca al aparecer la tarjeta.
    const ta = Math.max(at("armar") ?? 0, t0 + 0.5);
    const tr = Math.max(at("resolver") ?? 0, ta + 2);
    const fmt = (x) => `Math.round(${x}).toLocaleString("es-CO")`;
    anim.push(`tl.fromTo("#${sid} .cells i",{opacity:.08,backgroundColor:"#2d7ff9"},{opacity:.85,duration:.2,stagger:{each:${r2(1.6 / n)},from:"start"}},${r2(ta)});`);
    anim.push(`(()=>{const o={v:0,r:0};tl.fromTo(o,{v:0,r:0},{v:${nv},r:${nr},duration:1.8,ease:"power1.out",onUpdate(){document.getElementById("${sid}-nv").textContent=${fmt("o.v")};document.getElementById("${sid}-nr").textContent=${fmt("o.r")};}},${r2(ta)});})();`);
    anim.push(`tl.to("#${sid} .cells i",{backgroundColor:"#37e38b",opacity:1,duration:.12,stagger:{each:${r2((ss * 1.0) / n)},grid:[30,48],from:"center"}},${r2(tr)});`);
    anim.push(`(()=>{const o={s:0};tl.fromTo(o,{s:0},{s:${ss},duration:${ss},ease:"none",onUpdate(){document.getElementById("${sid}-ns").textContent=o.s.toFixed(1).replace(".",",")+" s";}},${r2(tr)});})();`);
    anim.push(`tl.fromTo("#${sid}-ok",{opacity:0,scale:1.6},{opacity:1,scale:1,duration:.4,ease:"back.out(2)"},${r2(tr + ss + 0.4)});`);
    sfx(tr, "spark.wav", 0.3);
    sfx(tr + ss + 0.4, "hit.wav", 0.3);
    for (const [k] of RESTRICCIONES) encender(`#${sid}-r-${k}`, k);
  } else if (tipo === "productos") {
    body = `<p class="eyebrow">DIEZ PRODUCTOS · TRES FAMILIAS</p><h2>Estos son los productos</h2><div class="prods">${PRODUCTOS.map(([k, n, xs]) => `<div class="fam" id="${sid}-k-${k}"><div class="fh">${esc(n)}</div>${xs.map(([id, nom, env]) => `<div class="p" id="${sid}-p-${id}"><b>${esc(nom)}</b><i>${esc(env)}</i></div>`).join("")}</div>`).join("")}</div>`;
    for (const [k, , xs] of PRODUCTOS) {
      encender(`#${sid}-k-${k}`, k);
      for (const [id] of xs) encender(`#${sid}-p-${id}`, id, { opacity: 0.35, scale: 0.97 });
    }
  } else if (tipo === "reglas") {
    body = `<p class="eyebrow">LO QUE HACE DISTINTA ESTA PLANTA</p><h2>Cuatro reglas de los alimentos</h2><div class="reglas">${REGLAS.map(([k, n, x], j) => `<div class="rg" id="${sid}-k-${k}"><span class="n">${j + 1}</span><b>${esc(n)}</b><i>${esc(x)}</i></div>`).join("")}</div>`;
    for (const [k] of REGLAS) encender(`#${sid}-k-${k}`, k, { opacity: 0.25, scale: 0.96 });
  } else if (tipo === "puntaje") {
    body = `<p class="eyebrow">FRACTAL · UN SOLO PUNTAJE</p><h2>Menos es mejor</h2><div class="puntaje">${PUNTAJE.map(([k, x], j) => `${j ? '<span class="mas">+</span>' : ""}<div class="pt" id="${sid}-k-${k}">${esc(x)}</div>`).join("")}</div>`;
    for (const [k] of PUNTAJE) encender(`#${sid}-k-${k}`, k);
  } else if (tipo === "partes") {
    body = `<p class="eyebrow">CUATRO PARTES CONECTADAS</p><h2>Cómo se conecta todo</h2><div class="partes">${PARTES.map(([k, n, x, img]) => `<div class="pa" id="${sid}-k-${k}"><img src="${relative(HERE, join(GRAB, img))}" alt=""><b>${esc(n)}</b><i>${esc(x)}</i></div>`).join("")}</div>`;
    for (const [k] of PARTES) encender(`#${sid}-k-${k}`, k);
  } else throw new Error(`${s.id}: tarjeta desconocida "${tipo}"`);
  el.push(`<div id="${sid}" class="clip screen tj" data-start="${r2(t0)}" data-duration="${r2(d)}"><div class="grid"></div>${body}</div>`);
  anim.push(`tl.fromTo("#${sid}",{opacity:0},{opacity:1,duration:.4},${r2(t0)});`);
  anim.push(`tl.fromTo("#${sid} h2, #${sid} .eyebrow",{opacity:0,y:24},{opacity:1,y:0,duration:.5,ease:"power3.out"},${r2(t0 + 0.15)});`);
}

/**
 * Música (assets/audio/musica/musica-N.mp3) encadenada con fundidos hasta cubrir el video; baja sola cuando habla la
 * voz (sidechain). Deja assets/clips/musica-mezcla.mp3.
 */
function mezclaMusica(voces, total) {
  const pistas = [1, 2, 3, 4].map((n) => join(MUSICA, `musica-${n}.mp3`)).filter(existsSync);
  if (!pistas.length) return null;
  // Lista de pistas alternadas hasta pasar la duración total.
  const lista = [];
  let acc = 0;
  for (let k = 0; acc < total + 4; k++) {
    const p = pistas[k % pistas.length];
    lista.push(p);
    acc += dur(p) - 6;
  }
  const xf = join(CLIPS, "musica-cadena.wav");
  const args = ["-y", "-v", "error"];
  lista.forEach((p) => args.push("-i", p));
  let f = "", prev = "[0:a]";
  for (let k = 1; k < lista.length; k++) {
    f += `${prev}[${k}:a]acrossfade=d=6:c1=tri:c2=tri[x${k}];`;
    prev = `[x${k}]`;
  }
  f += `${prev}aformat=sample_rates=48000:channel_layouts=stereo,atrim=0:${total.toFixed(2)},afade=t=in:d=2,afade=t=out:st=${(total - 5).toFixed(2)}:d=5[out]`;
  execFileSync("ffmpeg", [...args, "-filter_complex", f, "-map", "[out]", xf], { stdio: "inherit" });
  // Pista de voz completa (solo para el sidechain).
  const vz = join(CLIPS, "voz-completa.wav");
  const a2 = ["-y", "-v", "error"];
  voces.forEach((x) => a2.push("-i", x.af));
  const del = voces.map((x, i) => `[${i}:a]adelay=${Math.round(x.at * 1000)}:all=1,aformat=sample_rates=48000:channel_layouts=stereo[v${i}]`).join(";");
  execFileSync("ffmpeg", [...a2, "-filter_complex", `${del};${voces.map((_, i) => `[v${i}]`).join("")}amix=inputs=${voces.length}:normalize=0,apad=whole_dur=${total.toFixed(2)}[out]`, "-map", "[out]", vz], { stdio: "inherit" });
  const out = join(CLIPS, "musica-mezcla.mp3");
  const nivel = process.env.MUSICA_NIVEL || "0.32";
  execFileSync("ffmpeg", ["-y", "-v", "error", "-i", xf, "-i", vz, "-filter_complex", `[0:a]volume=${nivel}[m];[m][1:a]sidechaincompress=threshold=0.02:ratio=10:attack=30:release=700:makeup=1[out]`, "-map", "[out]", "-c:a", "libmp3lame", "-q:a", "2", out], { stdio: "inherit" });
  return relative(HERE, out);
}

function render(v = "v001") {
  const out = join(HERE, "out", `demo-salsas-${v}.mp4`);
  if (existsSync(out)) throw new Error(`Ya existe ${relative(REPO, out)}; usa otra versión (p. ej. v004).`);
  mkdirSync(dirname(out), { recursive: true });
  execFileSync("pnpm", [...HF, "render", "-o", out, "--fps", String(FPS), "--quality", process.env.QUALITY || "standard", "--video-frame-format", "png"], { cwd: HERE, stdio: "inherit" });
  console.log(`Video: ${relative(REPO, out)}`);
}

/** Lista los textos visibles de una captura (para escribir las líneas "- foco:"): node armar.mjs textos <carpeta>/<png> [filtro]. */
function textos(rel, filtro = "") {
  const m = marcasDeCualquiera(rel);
  if (!m?.textos) throw new Error(`Sin textos para ${rel}: graba con --video --hd.`);
  for (const x of m.textos) if (!filtro || normal(x.s).includes(normal(filtro))) console.log(`${String(x.x).padStart(5)} ${String(x.y).padStart(5)}  ${x.s}`);
}

const [cmd, arg, arg2] = process.argv.slice(2);
const cmds = { preparar, voz, musica, "voz-temporal": vozTemporal, componer, render: () => render(arg), textos: () => textos(arg, arg2) };
if (!cmds[cmd]) {
  console.log("Uso: node armar.mjs preparar | voz [--enviar] | musica [--enviar] | voz-temporal | componer | render [vNNN]");
  process.exit(1);
}
await cmds[cmd]();
