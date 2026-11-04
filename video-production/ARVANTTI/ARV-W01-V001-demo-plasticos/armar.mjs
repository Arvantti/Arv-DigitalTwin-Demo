#!/usr/bin/env node
/**
 * Arma el video horizontal (1920×1080) de la demo de plásticos con HyperFrames.
 *
 *   node armar.mjs preparar       guiones de docs/demo-plasticos -> segmentos.json y capitulos/<cap>/script.md
 *   node armar.mjs voz-temporal   locución TEMP_AUDIO local (Kokoro, vía `hyperframes tts`) por segmento
 *   node armar.mjs alinear        corta la locución de ElevenLabs de cada capítulo en un audio por segmento
 *   node armar.mjs componer       escribe index.html (la composición) con tiempos, clips y subtítulos
 *   node armar.mjs render [vNNN]  renderiza out/demo-plasticos-<vNNN>.mp4
 *
 * Material de pantalla: assets/grabacion/ (tools/demo-video/grabar.cjs todos --video --hd con DEMO_OUT apuntando ahí);
 * si falta una captura en alta, usa la de docs/demo-plasticos/. Ver README.md de esta carpeta.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../../..");
const DOCS = join(REPO, "docs/demo-plasticos");
const GRAB = join(HERE, "assets/grabacion");
const AUDIO = join(HERE, "assets/audio/segmentos");
const CLIPS = join(HERE, "assets/clips");
const HF = ["dlx", "hyperframes@0.9.9"];
const W = 1920, H = 1080, FPS = 25;
// Pantalla dentro del cuadro: 1600×900 con barra arriba y subtítulos abajo.
const SX = 160, SY = 74, SW = 1600, SH = 900;

const CAPITULOS = [
  { id: "0-apertura", eyebrow: "GEMELO DIGITAL · PLÁSTICOS", titulo: "Una planta de inyección y su gemelo digital" },
  { id: "1-calcular-programacion", eyebrow: "ESCENARIO 1", titulo: "Calcular la programación según las entregas" },
  { id: "2-cambio-fecha-pedido", eyebrow: "ESCENARIO 2", titulo: "Un cliente adelanta su pedido" },
  { id: "3-contingencia-falla", eyebrow: "ESCENARIO 3", titulo: "Contingencia: falla una inyectora" },
  { id: "4-pedidos-fijados", eyebrow: "ESCENARIO 4", titulo: "Pedidos fijados a mano" },
  { id: "5-menos-cambios", eyebrow: "ESCENARIO 5", titulo: "Menos cambios de referencia" },
  { id: "6-versiones", eyebrow: "APS", titulo: "Zoom del Gantt y versiones de la programación" },
  { id: "7-cierre", eyebrow: "CIERRE", titulo: "El ahorro potencial de Fractal" },
];

const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts });
const dur = (f) => Number(sh("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).trim());
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const r2 = (x) => Math.round(x * 100) / 100;

// ---------- preparar ----------

/** Lee los bloques "### Snn · título" con "- imagen:", "- en pantalla:" y las citas ">" de un guion. */
function parseGuion(md, cap, folder) {
  const segs = [];
  for (const block of md.split(/^### /m).slice(1)) {
    const head = block.split("\n")[0].trim();
    const m = head.match(/^((?:\d-)?S\d+)\s*·\s*(.+)$/);
    if (!m) continue;
    const field = (k) => (block.match(new RegExp(`^- ${k}:\\s*(.+)$`, "m")) || [])[1]?.trim() ?? null;
    const texto = block.split("\n").filter((l) => l.startsWith(">")).map((l) => l.replace(/^>\s?/, "").trim()).join(" ").trim();
    if (!texto) continue;
    let imagen = field("imagen");
    if (imagen && imagen.startsWith("capturas/")) imagen = `${folder}/${imagen}`;
    if (imagen && !/\.(png|jpe?g)$/i.test(imagen)) imagen = null;
    segs.push({ id: m[1].includes("-") ? m[1] : `${cap.split("-")[0]}-${m[1]}`, titulo: m[2], texto, imagen, enPantalla: field("en pantalla") });
  }
  return segs;
}

function preparar() {
  const video = readFileSync(join(DOCS, "VIDEO.md"), "utf8");
  const sec4 = video.split(/^## 4\./m)[1].split(/^## 5\./m)[0];
  const abiertos = parseGuion(sec4, "0", "").map((s) => ({ ...s, imagen: s.imagen?.replace(/^\//, "") }));
  const capitulos = CAPITULOS.map((c) => {
    let segmentos;
    if (c.id === "0-apertura") segmentos = abiertos.filter((s) => s.id.startsWith("0-"));
    else if (c.id === "7-cierre") {
      segmentos = abiertos.filter((s) => s.id.startsWith("6-")).map((s) => ({ ...s, id: s.id.replace(/^6-/, "7-"), imagen: null, tarjeta: "ahorro" }));
    } else if (c.id === "6-versiones") segmentos = parseGuion(readFileSync(join(HERE, "guion-versiones.md"), "utf8"), "6", "versiones");
    else segmentos = parseGuion(readFileSync(join(DOCS, c.id, "guion.md"), "utf8"), c.id, c.id);
    return { ...c, segmentos };
  });
  // Cifras de la tarjeta de cierre: la tabla de la sección 4 de VIDEO.md, tal cual.
  const filas = sec4.split("\n").filter((l) => /^\|\s*\d ·/.test(l)).map((l) => l.split("|").slice(1, -1).map((x) => x.trim()));
  writeFileSync(join(HERE, "segmentos.json"), `${JSON.stringify({ fuente: "docs/demo-plasticos (guion.md de cada escenario y VIDEO.md §4) + guion-versiones.md", cierre: filas, capitulos }, null, 2)}\n`);
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

// ---------- alinear la locución de ElevenLabs ----------

function alinear() {
  mkdirSync(AUDIO, { recursive: true });
  for (const c of load().capitulos) {
    const dir = join(HERE, "capitulos", c.id);
    const f = join(dir, "assets/audio/voiceover.mp3");
    if (!existsSync(f)) {
      console.log(`${c.id}: falta ${relative(REPO, f)} (pnpm video:voice --project ${relative(REPO, dir)})`);
      continue;
    }
    const total = dur(f);
    let cortes;
    const manual = join(dir, "cortes.json");
    if (existsSync(manual)) cortes = JSON.parse(readFileSync(manual, "utf8"));
    else {
      const log = silenceLog(f);
      const sil = [];
      const re = /silence_start: ([\d.]+)[\s\S]*?silence_end: ([\d.]+)/g;
      for (let m; (m = re.exec(log)); ) sil.push([Number(m[1]), Number(m[2])]);
      // Cada corte va al silencio más cercano a la posición esperada (proporcional a los caracteres), prefiriendo los largos.
      const lens = c.segmentos.map((s) => s.texto.length + 20);
      const sum = lens.reduce((a, b) => a + b, 0);
      cortes = [];
      let acc = 0, prev = 0;
      for (let k = 0; k < lens.length - 1; k++) {
        acc += lens[k];
        const esperado = (total * acc) / sum;
        const cands = sil.filter(([a, b]) => (a + b) / 2 > prev + 1.5 && (a + b) / 2 < total - 1);
        let best = null, score = Infinity;
        for (const [a, b] of cands) {
          const sc = Math.abs((a + b) / 2 - esperado) - 6 * (b - a);
          if (sc < score) (score = sc), (best = (a + b) / 2);
        }
        if (best === null) best = esperado;
        cortes.push(r2(best));
        prev = best;
      }
      writeFileSync(join(dir, "cortes-detectados.json"), `${JSON.stringify(cortes)}\n`);
    }
    const bounds = [0, ...cortes, total];
    c.segmentos.forEach((s, i) => {
      const out = join(AUDIO, `${s.id}.mp3`);
      sh("ffmpeg", ["-y", "-v", "error", "-i", f, "-ss", String(bounds[i]), "-to", String(bounds[i + 1]), "-af", "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse", "-c:a", "libmp3lame", "-q:a", "2", out]);
    });
    console.log(`${c.id}: ${c.segmentos.length} segmentos, cortes en ${cortes.join(", ")} s (revisa o corrige en ${relative(REPO, manual)})`);
  }
}

/** Log de ffmpeg silencedetect (va por stderr). */
function silenceLog(f) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", f, "-af", "silencedetect=noise=-38dB:d=0.28", "-f", "null", "-"], { encoding: "utf8" });
  return r.stderr || "";
}

// ---------- componer ----------

function pngSize(f) {
  if (/\.png$/i.test(f)) {
    const b = readFileSync(f);
    return [b.readUInt32BE(16), b.readUInt32BE(20)];
  }
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

function marcas(folder) {
  const f = join(GRAB, folder, "video/marcas.json");
  return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : [];
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
  // Une restos muy cortos con el anterior.
  return out.reduce((a, x) => (a.length && x.length < 22 && (a.at(-1) + " " + x).length < 110 ? (a[a.length - 1] += ` ${x}`) : a.push(x), a), []);
}

function componer() {
  const data = load();
  mkdirSync(CLIPS, { recursive: true });
  const el = [];
  const anim = [];
  let t = 0;
  let audioTemp = false, audioFalta = false;
  const usadas = new Set();
  const sfx = (at, file, vol = 0.35) => el.push(`<audio id="sfx-${el.length}" src="assets/shared/core/sfx/${file}" data-start="${r2(at)}" data-duration="1.2" data-volume="${vol}"></audio>`);

  // Intro con el logo.
  el.push(`<div id="intro" class="clip full" data-start="0" data-duration="5"><img class="logo" src="assets/shared/arvantti/branding/ArvanttiLabsLogo.png" alt=""></div>`);
  anim.push(`tl.fromTo("#intro .logo",{opacity:0,scale:1.08},{opacity:1,scale:1,duration:1.2,ease:"power2.out"},0);tl.to("#intro .logo",{opacity:0,duration:.6},4.4);`);
  sfx(0.2, "whoosh.wav", 0.3);
  t = 5;

  const resumen = [];
  for (const c of data.capitulos) {
    const c0 = t;
    // Tarjeta de capítulo.
    const cid = `cap-${c.id}`;
    el.push(`<div id="${cid}" class="clip full card" data-start="${r2(t)}" data-duration="3.4"><div class="grid"></div><div class="in"><p class="eyebrow">${esc(c.eyebrow)}</p><h1>${esc(c.titulo)}</h1><div class="rule"></div></div></div>`);
    anim.push(`tl.fromTo("#${cid} .eyebrow",{opacity:0,y:30},{opacity:1,y:0,duration:.5,ease:"power3.out"},${r2(t + 0.2)});tl.fromTo("#${cid} h1",{opacity:0,y:40},{opacity:1,y:0,duration:.8,ease:"back.out(1.4)"},${r2(t + 0.4)});tl.fromTo("#${cid} .rule",{scaleX:0},{scaleX:1,duration:.9,ease:"power2.inOut"},${r2(t + 0.6)});tl.to("#${cid} .in",{opacity:0,y:-20,duration:.4},${r2(t + 3)});`);
    sfx(t + 0.1, "whoosh-short.mp3", 0.3);
    t += 3.4;
    const folder = c.id === "6-versiones" ? "versiones" : c.id;
    const ms = marcas(folder);

    c.segmentos.forEach((s, i) => {
      const mp3 = join(AUDIO, `${s.id}.mp3`), wav = join(AUDIO, `${s.id}.wav`);
      const af = existsSync(mp3) ? mp3 : existsSync(wav) ? wav : null;
      if (af && af === wav) audioTemp = true;
      if (!af) audioFalta = true;
      const voz = af ? dur(af) : s.texto.length / 14;
      const d = r2(voz + 0.9);
      const s0 = t;
      const sid = `s-${s.id}`;
      if (af) el.push(`<audio id="voz-${s.id}" src="${relative(HERE, af)}" data-start="${r2(s0 + 0.3)}" data-duration="${r2(voz)}" data-volume="1"></audio>`);

      // Barra superior: capítulo y segmento.
      el.push(`<div id="bar-${s.id}" class="clip bar" data-start="${r2(s0)}" data-duration="${d}"><span class="eb">${esc(c.eyebrow)}</span><span class="tt">${esc(s.titulo)}</span><span class="brand">ARVANTTI LABS</span></div>`);
      anim.push(`tl.fromTo("#bar-${s.id} .tt",{opacity:0,x:-24},{opacity:1,x:0,duration:.4,ease:"power2.out"},${r2(s0 + 0.1)});`);

      if (s.tarjeta === "ahorro") {
        const rows = data.cierre
          .map((r, k) => `<tr id="${sid}-r${k}"><th>${esc(r[0])}</th><td>${esc(r[1])}</td><td class="new">${esc(r[2])}</td><td class="save">${esc(r[3])}</td></tr>`)
          .join("");
        el.push(`<div id="${sid}" class="clip screen ahorro" data-start="${r2(s0)}" data-duration="${d}"><div class="grid"></div><h2>El ahorro potencial de Fractal</h2><table><thead><tr><th>Escenario</th><th>Antes</th><th>Con el plan optimizado</th><th>Ahorro</th></tr></thead><tbody>${rows}</tbody></table><p class="foot">Cifras de las corridas de la demo. Fractal recomienda; la persona decide.</p></div>`);
        anim.push(`tl.fromTo("#${sid} h2",{opacity:0,y:30},{opacity:1,y:0,duration:.6,ease:"power3.out"},${r2(s0 + 0.2)});`);
        data.cierre.forEach((_, k) => anim.push(`tl.fromTo("#${sid}-r${k}",{opacity:0,x:-40},{opacity:1,x:0,duration:.5,ease:"back.out(1.3)"},${r2(s0 + 1 + k * ((d - 6) / data.cierre.length))});`));
        anim.push(`tl.fromTo("#${sid} .foot",{opacity:0},{opacity:1,duration:.6},${r2(s0 + d - 5)});`);
      } else {
        const img = imagen(s.imagen);
        if (!img) throw new Error(`${s.id}: no encuentro la imagen ${s.imagen}`);
        const [iw, ih] = pngSize(img);
        const alto = (ih / iw) * SW;
        // Tramo de video que lleva a esta captura (clics, cálculo, carga), si es la primera vez que se usa.
        const cap = basename(s.imagen);
        const k = ms.findIndex((m) => m.captura === cap && (s.imagen.startsWith(folder) || folder === "versiones"));
        let lead = 0;
        const key = s.imagen;
        if (k >= 0 && !usadas.has(key) && img.startsWith(GRAB)) {
          const tm = ms[k].t, prevT = k > 0 ? ms[k - 1].t : 0;
          lead = r2(Math.min(tm - prevT, Math.max(0, d - 3.5), 14));
          if (lead >= 1.5) {
            const clip = join(CLIPS, `${s.id}.mp4`);
            const src = join(GRAB, folder, "video/recorrido.webm");
            sh("ffmpeg", ["-y", "-v", "error", "-ss", String(r2(tm - lead)), "-i", src, "-t", String(lead), "-an", "-vf", `fps=${FPS},scale=${W}:${H}:flags=lanczos`, "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", clip]);
            lead = r2(Math.min(lead, dur(clip)));
            el.push(`<video id="v-${s.id}" class="clip screen" src="${relative(HERE, clip)}" muted data-start="${r2(s0)}" data-duration="${lead}"></video>`);
          } else lead = 0;
        }
        usadas.add(key);
        const still0 = r2(s0 + lead), stillD = r2(d - lead);
        el.push(`<div id="${sid}" class="clip screen" data-start="${still0}" data-duration="${stillD}"><img src="${relative(HERE, img)}" alt="" style="height:${Math.round(alto)}px"></div>`);
        if (alto > SH + 40) {
          // Captura de página completa: se recorre de arriba abajo.
          anim.push(`tl.fromTo("#${sid} img",{y:0},{y:${-Math.round(alto - SH)},duration:${r2(Math.max(1, stillD - 2.5))},ease:"sine.inOut"},${r2(still0 + 1.2)});`);
        } else {
          const zin = i % 2 === 0;
          anim.push(`tl.fromTo("#${sid} img",{scale:${zin ? 1 : 1.07}},{scale:${zin ? 1.07 : 1},duration:${stillD},ease:"sine.inOut"},${still0});`);
        }
        if (!lead) anim.push(`tl.fromTo("#${sid}",{opacity:0},{opacity:1,duration:.35},${r2(s0)});`);
      }

      // Subtítulos.
      const ts = trozos(s.texto);
      const total = ts.reduce((a, x) => a + x.length, 0);
      let ct = s0 + 0.3;
      ts.forEach((x, j) => {
        const cd = r2((voz * x.length) / total);
        el.push(`<div id="cc-${s.id}-${j}" class="clip cc" data-start="${r2(ct)}" data-duration="${j === ts.length - 1 ? r2(cd + 0.5) : cd}"><span>${esc(x)}</span></div>`);
        ct += cd;
      });
      t = r2(s0 + d);
    });
    resumen.push(`${c.id}: ${r2(t - c0)} s`);
  }

  // Cierre con el logo.
  el.push(`<div id="outro" class="clip full" data-start="${r2(t)}" data-duration="6"><img class="logo" src="assets/shared/arvantti/branding/ArvanttiLabsLogo.png" alt=""><p class="sign">Gemelo digital · Planta de inyección de plásticos</p></div>`);
  anim.push(`tl.fromTo("#outro .logo",{opacity:0,scale:.96},{opacity:1,scale:1,duration:1.2,ease:"power2.out"},${r2(t + 0.2)});tl.fromTo("#outro .sign",{opacity:0,y:20},{opacity:1,y:0,duration:.8},${r2(t + 1.2)});`);
  sfx(t + 0.1, "whoosh.wav", 0.3);
  const TOTAL = r2(t + 6);
  anim.push(`tl.fromTo("#progress",{scaleX:0},{scaleX:1,duration:${TOTAL},ease:"none"},0);`);
  if (audioTemp) el.push(`<div id="temp" class="clip" data-start="0" data-duration="${TOTAL}">TEMP_AUDIO · voz local de prueba</div>`);

  const html = `<!doctype html>
<html lang="es" data-resolution="landscape">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=${W}, height=${H}">
<title>Demo de plásticos · gemelo digital</title>
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
.card .grid,.ahorro .grid{position:absolute;inset:0;opacity:.08;background-image:linear-gradient(#4ea7ff 1px,transparent 1px),linear-gradient(90deg,#4ea7ff 1px,transparent 1px);background-size:80px 80px}
.card .in{position:relative;text-align:center;max-width:1500px}
.card .eyebrow{font:700 30px "IBM Plex Mono",monospace;letter-spacing:8px;color:#4ea7ff;margin:0 0 24px}
.card h1{font:800 84px/1.08 "Inter Display",Inter,sans-serif;margin:0;color:#f8fafc;letter-spacing:-1px}
.card .rule{height:6px;width:520px;margin:40px auto 0;background:linear-gradient(90deg,#2d7ff9,#4ea7ff);transform-origin:left}
.bar{position:absolute;left:${SX}px;top:18px;width:${SW}px;height:44px;display:flex;align-items:center;gap:22px;z-index:5;font:600 26px Inter,sans-serif}
.bar .eb{font:700 22px "IBM Plex Mono",monospace;letter-spacing:4px;color:#4ea7ff;padding:6px 14px;border:2px solid #2d7ff9}
.bar .tt{color:#f8fafc}
.bar .brand{margin-left:auto;font:600 20px Inter,sans-serif;letter-spacing:5px;color:#7a7e86}
.screen{position:absolute;left:${SX}px;top:${SY}px;width:${SW}px;height:${SH}px;overflow:hidden;background:#0e1430;box-shadow:0 0 0 2px #2d7ff955,0 24px 60px #000a;z-index:3}
video.screen{object-fit:cover;z-index:4}
.screen img{position:absolute;left:0;top:0;width:${SW}px;transform-origin:50% 30%}
.cc{position:absolute;left:${SX}px;width:${SW}px;top:${SY + SH + 10}px;height:86px;display:flex;align-items:center;justify-content:center;text-align:center;z-index:6}
.cc span{font:600 31px/1.25 Inter,sans-serif;color:#f8fafc;text-shadow:0 2px 8px #000}
.ahorro{background:#0b0f18;padding:44px 56px}
.ahorro h2{position:relative;font:800 52px "Inter Display",Inter,sans-serif;margin:0 0 30px;color:#f8fafc}
.ahorro table{position:relative;width:100%;border-collapse:collapse;font:500 23px/1.3 Inter,sans-serif}
.ahorro th,.ahorro td{text-align:left;padding:16px 14px;border-bottom:1px solid #2d7ff944;vertical-align:top}
.ahorro thead th{font:700 18px "IBM Plex Mono",monospace;letter-spacing:3px;color:#4ea7ff;text-transform:uppercase}
.ahorro tbody th{color:#f8fafc;width:21%}
.ahorro td{color:#d8dadf}
.ahorro td.new{color:#4ea7ff}
.ahorro td.save{color:#37e38b;font-weight:700}
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
  writeFileSync(join(HERE, "tiempos.json"), `${JSON.stringify({ total_s: TOTAL, audio: audioFalta ? "falta (duración estimada)" : audioTemp ? "TEMP_AUDIO" : "ElevenLabs", capitulos: resumen }, null, 2)}\n`);
  console.log(`index.html: ${TOTAL} s (${(TOTAL / 60).toFixed(1)} min), audio ${audioFalta ? "FALTA en algunos segmentos" : audioTemp ? "TEMP_AUDIO" : "ElevenLabs"}\n${resumen.join("\n")}`);
}

function render(v = "v001") {
  const out = join(HERE, "out", `demo-plasticos-${v}.mp4`);
  if (existsSync(out)) throw new Error(`Ya existe ${relative(REPO, out)}; usa otra versión (p. ej. v002).`);
  mkdirSync(dirname(out), { recursive: true });
  execFileSync("pnpm", [...HF, "render", "-o", out, "--fps", String(FPS), "--quality", process.env.QUALITY || "standard", "--video-frame-format", "png"], { cwd: HERE, stdio: "inherit" });
  console.log(`Video: ${relative(REPO, out)}`);
}

const [cmd, arg] = process.argv.slice(2);
const cmds = { preparar, "voz-temporal": vozTemporal, alinear, componer, render: () => render(arg) };
if (!cmds[cmd]) {
  console.log("Uso: node armar.mjs preparar | voz-temporal | alinear | componer | render [vNNN]");
  process.exit(1);
}
cmds[cmd]();
