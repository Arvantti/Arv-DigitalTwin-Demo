#!/usr/bin/env node
/**
 * Serie de videos verticales por módulo (1080x1920, 60 a 90 s). Un video por carpeta en videos/<id>/video.json.
 *
 *   node tomas.cjs todo                          graba las tomas en assets/tomas/ (galería y emulador corriendo)
 *   node armar.mjs preparar                      vuelo y lapso en MP4, marca del logo y música de respaldo
 *   node armar.mjs musica [--enviar]             música de la serie (ElevenLabs Music), una sola para todos
 *   VIDEO=01-nucleo node armar.mjs voz [--enviar]   voz de las escenas nuevas o cambiadas (con tiempos por carácter)
 *   VIDEO=01-nucleo node armar.mjs componer      mide la voz y escribe index.html
 *   VIDEO=01-nucleo node armar.mjs render v001   deja out/<salida>-v001.mp4
 *
 * Reglas de la serie (estrategia aprobada por Andy, 2026-11-07/08): el gemelo 3D aparece en el primer cuadro y se
 * nombra en el gancho; subtítulos quemados; cuatro industrias en el dolor; heptágono con el módulo encendido; sin precios.
 */
import { execFileSync, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const T = (p) => path.join(HERE, p);
const HORIZ = process.env.ORIENT === "h";
const FPS = 25, W = HORIZ ? 1920 : 1080, H = HORIZ ? 1080 : 1920;
// Tomas del 3D según la orientación (las pantallas de la interfaz, ui-*, son horizontales y sirven para ambas).
const tm = (n) => `assets/${HORIZ && !n.startsWith("ui-") ? "tomas-h" : "tomas"}/${n}.png`;
const clipH = (n) => (HORIZ ? n.replace(".mp4", "-h.mp4") : n);
const sh = (cmd, args) => execFileSync(cmd, args, { stdio: "inherit" });

const VIDEO = process.env.VIDEO || "01-nucleo";
const vdir = (p = "") => T(path.join("videos", VIDEO, p));
const cfg = () => JSON.parse(fs.readFileSync(vdir("video.json"), "utf8"));

// Escenas en orden y colas (segundos antes y después de la voz).
const ORDEN = [
  { id: "gancho", lead: 0.35, tail: 0.5 },
  { id: "dolor", lead: 0.3, tail: 0.7 },
  { id: "solucion", lead: 0.3, tail: 0.6 },
  { id: "modulos", lead: 0.3, tail: 1.0 },
  { id: "cierre", lead: 0.4, tail: 2.6 },
];
const vozDe = (e) => vdir(`escenas/${e.id}/assets/audio/voiceover.mp3`);
const alineacionDe = (e) => vdir(`escenas/${e.id}/assets/audio/alignment.json`);
const relVoz = (e) => path.relative(HERE, vozDe(e));

// Palabras que la voz en español lee mal: se envían escritas como se pronuncian (los subtítulos muestran el original).
const PRONUNCIA = [["DigitalTwin", "Digital Twin"], ["Integrator", "Íntegreitor"], ["SCADA", "Escada"], ["ERP", "E R P"], ["CRM", "C R M"], ["APS", "A P S"], ["OEE", "O E E"], ["3D", "tres D"], ["GEMELO", "gemelo"]];
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
const hash = (s) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 16);
function credenciales() {
  const apiKey = process.env.ELEVENLABS_API_KEY, voiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!apiKey?.trim() || !voiceId?.trim()) throw new Error("Faltan ELEVENLABS_API_KEY o ELEVENLABS_VOICE_ID en el entorno.");
  return { apiKey, voiceId };
}
const texto = (e) => cfg().escenas[e.id].voz.trim();

async function voz() {
  const enviar = process.argv.includes("--enviar");
  const pend = ORDEN.filter((e) => {
    const a = alineacionDe(e);
    return !(fs.existsSync(vozDe(e)) && fs.existsSync(a) && JSON.parse(fs.readFileSync(a, "utf8")).hash === hash(`${modelo()}|${paraVoz(texto(e)).texto}`));
  });
  console.log(`Voz ${VIDEO}: ${pend.length} escenas nuevas o cambiadas, ${pend.reduce((n, e) => n + paraVoz(texto(e)).texto.length, 0)} caracteres (modelo ${modelo()}).`);
  if (!pend.length) return;
  if (!enviar) {
    pend.forEach((e) => console.log(`- ${e.id}: ${paraVoz(texto(e)).texto}`));
    return console.log("ElevenLabs recibirá estos textos. Para enviarlos: añade --enviar");
  }
  const { apiKey, voiceId } = credenciales();
  for (const e of pend) {
    const txt = texto(e), pv = paraVoz(txt);
    if (txt.includes(apiKey)) throw new Error("El guion parece contener una credencial; no se envía.");
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify({ text: pv.texto, model_id: modelo(), voice_settings: VOICE_SETTINGS }),
    });
    if (!res.ok) throw new Error(`${e.id}: ElevenLabs respondió HTTP ${res.status}; respuesta omitida por seguridad.`);
    const j = await res.json();
    const audio = Buffer.from(j.audio_base64, "base64");
    if (!audio.length) throw new Error(`${e.id}: audio vacío.`);
    fs.mkdirSync(path.dirname(vozDe(e)), { recursive: true });
    fs.writeFileSync(vozDe(e), audio);
    let a = j.alignment || j.normalized_alignment;
    if (a && pv.texto !== txt && a.characters?.length === pv.texto.length) a = { characters: [...txt], character_start_times_seconds: pv.idx.map((k) => a.character_start_times_seconds[k]) };
    fs.writeFileSync(alineacionDe(e), `${JSON.stringify({ hash: hash(`${modelo()}|${pv.texto}`), modelo: modelo(), texto: txt, alignment: a })}\n`);
    console.log(`${e.id}: ${duracion(vozDe(e)).toFixed(1)} s`);
  }
}

/** Música de la serie (una pista para todos los videos; cada video la recorta y la funde). */
async function musica() {
  const out = T("assets/clips/musica-serie.mp3");
  if (fs.existsSync(out)) return console.log("Ya existe assets/clips/musica-serie.mp3.");
  const prompt = fs.readFileSync(T("musica-prompt.txt"), "utf8").trim();
  const ms = 95000;
  if (!process.argv.includes("--enviar")) return console.log(`ElevenLabs Music recibirá (${ms} ms):\n${prompt}\nPara enviarlo: node armar.mjs musica --enviar`);
  const { apiKey } = credenciales();
  const res = await fetch("https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128", {
    method: "POST",
    headers: { "xi-api-key": apiKey, "content-type": "application/json" },
    body: JSON.stringify({ prompt, music_length_ms: ms, model_id: "music_v1" }),
  });
  if (!res.ok) throw new Error(`Música: ElevenLabs respondió HTTP ${res.status}; respuesta omitida por seguridad.`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from(await res.arrayBuffer()));
  console.log(`musica-serie.mp3: ${duracion(out).toFixed(1)} s`);
}
function duracion(f) {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f], { encoding: "utf8" });
  return Number(r.stdout.trim());
}

function tiempos() {
  let t = 0, temporal = false;
  const out = ORDEN.map((e) => {
    const txt = texto(e);
    const real = fs.existsSync(vozDe(e));
    if (!real) temporal = true;
    const voz = real ? duracion(vozDe(e)) : txt.split(/\s+/).length / 2.5 + 0.4;
    const x = { ...e, txt, real, start: t, voiceAt: t + e.lead, voz, dur: e.lead + voz + e.tail };
    t += x.dur;
    return x;
  });
  return { escenas: out, total: t, temporal };
}

/** Segundo absoluto en que la voz llega a un fragmento (con la alineación de ElevenLabs, o proporcional). */
function enPalabra(x, frag, desde = 0) {
  const i = x.txt.indexOf(frag, desde);
  if (i < 0) throw new Error(`"${frag}" no está en ${x.id}`);
  return enIndice(x, i);
}
function alineacion(x) {
  if (!x.real || !fs.existsSync(alineacionDe(x))) return null;
  const j = JSON.parse(fs.readFileSync(alineacionDe(x), "utf8"));
  const a = j.alignment;
  return j.texto === x.txt && a?.character_start_times_seconds?.length === x.txt.length ? a.character_start_times_seconds : null;
}
function enIndice(x, i) {
  const a = alineacion(x);
  if (a) return +(x.voiceAt + a[i]).toFixed(2);
  return +(x.voiceAt + (i / x.txt.length) * x.voz).toFixed(2);
}

const MARCA = `import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert("RGB").crop((560, 150, 980, 500))
out = Image.new("RGBA", im.size)
out.putdata([(r, g, b, max(0, min(255, int((max(r, g, b) - 40) * 255 / 70)))) for r, g, b in im.getdata()])
out.save(sys.argv[2])`;

function preparar() {
  const tomas = T(HORIZ ? "assets/tomas-h" : "assets/tomas"), clips = T("assets/clips");
  fs.mkdirSync(clips, { recursive: true });
  // Vuelo de cámara: un cuadro por cuadro del video.
  sh("ffmpeg", ["-y", "-v", "error", "-framerate", String(FPS), "-i", path.join(tomas, "vuelo/f%03d.png"), "-vf", "format=yuv420p", "-c:v", "libx264", "-crf", "16", "-preset", "slow", path.join(clips, clipH("vuelo.mp4"))]);
  // Lapso del play: una foto cada 15 min de planta, con fundido entre fotos.
  const n = fs.readdirSync(path.join(tomas, "lapso")).filter((f) => f.endsWith(".png")).length;
  const fl = (n / 12).toFixed(2); // unos 12 s de lapso
  sh("ffmpeg", ["-y", "-v", "error", "-framerate", fl, "-i", path.join(tomas, "lapso/f%03d.png"), "-vf", `fps=${FPS},tmix=frames=3:weights='1 2 1',format=yuv420p`, "-c:v", "libx264", "-crf", "16", "-preset", "slow", path.join(clips, clipH("lapso.mp4"))]);
  sh("python3", ["-I", "-c", MARCA, T("assets/shared/arvantti/branding/ArvanttiLabsLogo.png"), path.join(clips, "marca.png")]);
  // Música de respaldo sintetizada (sin licencia de terceros), por si no hay pista de ElevenLabs.
  const d = 100;
  const pad = "0.10*sin(2*PI*110*t)+0.07*sin(2*PI*164.81*t)+0.06*sin(2*PI*220*t)+0.05*sin(2*PI*277.18*t)+0.035*sin(2*PI*329.63*t)";
  const expr = `(${pad})*(0.75+0.25*sin(2*PI*t/8))+0.06*sin(2*PI*55*t)*exp(-mod(t,2)*3)`;
  sh("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", `aevalsrc='${expr}|${expr}':s=48000:d=${d}`, "-af", "lowpass=f=1800,aecho=0.8:0.7:400|700:0.25|0.18,afade=t=in:d=3,volume=0.9", "-c:a", "libmp3lame", "-q:a", "2", path.join(clips, "musica.mp3")]);
  console.log("listo: assets/clips/");
}

/** Música bajo la voz (sidechain), recortada a la duración del video y fundida al final. */
function mezclaMusica(escenas, total) {
  const src = fs.existsSync(T("assets/clips/musica-serie.mp3")) ? T("assets/clips/musica-serie.mp3") : T("assets/clips/musica.mp3");
  if (!fs.existsSync(src)) return null;
  const voces = escenas.filter((x) => x.real);
  const out = T(`assets/clips/mezcla-${VIDEO}.mp3`);
  const args = ["-y", "-v", "error", "-i", src];
  voces.forEach((x) => args.push("-i", vozDe(x)));
  const fin = `[0:a]aformat=sample_rates=48000:channel_layouts=stereo,apad,atrim=0:${total.toFixed(2)},afade=t=in:d=0.4,afade=t=out:st=${(total - 3).toFixed(2)}:d=3[m]`;
  if (!voces.length) args.push("-filter_complex", fin, "-map", "[m]");
  else {
    const del = voces.map((x, i) => `[${i + 1}:a]adelay=${Math.round(x.voiceAt * 1000)}:all=1,aformat=sample_rates=48000:channel_layouts=stereo[v${i}]`).join(";");
    args.push("-filter_complex", `${del};${voces.map((_, i) => `[v${i}]`).join("")}amix=inputs=${voces.length}:normalize=0,apad=whole_dur=${total.toFixed(2)}[vz];${fin};[m][vz]sidechaincompress=threshold=0.03:ratio=8:attack=40:release=600:makeup=1[out]`, "-map", "[out]");
  }
  args.push("-c:a", "libmp3lame", "-q:a", "2", out);
  execFileSync("ffmpeg", args, { stdio: "inherit" });
  return path.relative(HERE, out);
}

// ---------------------------------------------------------------- composición
const words = (s, cls = "w") => s.split(" ").map((w) => `<span class="${cls}">${w}</span>`).join(" ");
const MOD = [
  ["Integrator", "ERP · CRM · SCADA"],
  ["APS", "Programa la producción"],
  ["CoSimulation", "Aprende tus reglas"],
  ["Fractal", "Escenarios multiobjetivo"],
  ["Control Center", "Indicadores en vivo"],
  ["Dendro Scada", "Physical AI en el chip"],
  ["AI Assistant", "IA privada"],
];

/** Palabras con su segundo de inicio y fin (para los subtítulos). */
function palabras(x) {
  const out = [];
  const re = /\S+/g;
  let m;
  while ((m = re.exec(x.txt))) out.push({ w: m[0], i: m.index, t: enIndice(x, m.index) });
  out.forEach((p, k) => (p.f = k + 1 < out.length ? out[k + 1].t : x.voiceAt + x.voz));
  return out;
}
/** Agrupa las palabras en frases cortas de pantalla (máx. 5 palabras o 28 caracteres, corta en la puntuación). */
function frases(ps) {
  const out = [];
  let cur = [];
  ps.forEach((p, k) => {
    cur.push(p);
    const largo = cur.map((c) => c.w).join(" ").length;
    const punt = /[.,:?!…]$/.test(p.w);
    const sig = ps[k + 1];
    if (!sig || punt || cur.length >= 5 || largo + (sig ? sig.w.length + 1 : 0) > 30) { out.push(cur); cur = []; }
  });
  return out;
}

function componer() {
  const V = cfg();
  const { escenas, total, temporal } = tiempos();
  const S = Object.fromEntries(escenas.map((x) => [x.id, x]));
  const E = V.escenas;
  const html = [], tl = [];
  const at = (sel, from, to, t) => tl.push(`tl.fromTo(${JSON.stringify(sel)},${JSON.stringify(from)},${JSON.stringify(to)},${(+t).toFixed(2)});`);
  const to = (sel, v, t) => tl.push(`tl.to(${JSON.stringify(sel)},${JSON.stringify(v)},${(+t).toFixed(2)});`);
  const clip = (id, cls, start, dur, inner, z = 2) => html.push(`<div id="${id}" class="clip ${cls}" data-start="${start.toFixed(2)}" data-duration="${dur.toFixed(2)}" data-track-index="${z}">${inner}</div>`);
  const video = (id, cls, src, start, dur, z) => html.push(`<video id="${id}" class="clip ${cls}" src="${src}" muted playsinline data-start="${start.toFixed(2)}" data-duration="${dur.toFixed(2)}" data-track-index="${z}"></video>`);
  const audio = (id, src, start, dur, vol) => html.push(`<audio id="${id}" src="${src}" data-start="${start.toFixed(2)}" data-duration="${dur.toFixed(2)}" data-volume="${vol}" data-track-index="${60 + html.length}"></audio>`);
  const sfx = (n, file, t, vol = 0.3) => audio(`sfx-${n}`, `assets/shared/core/sfx/${file}`, t, 1.4, vol);
  const X = 0.4;
  const span = (x) => [Math.max(0, x.start - (x.id === "gancho" ? 0 : X / 2)), x.dur + (x.id === "gancho" ? 0 : X / 2) + X / 2];
  const enter = (id, t) => at(`#${id}`, { opacity: 0, filter: "blur(16px)" }, { opacity: 1, filter: "blur(0px)", duration: X, ease: "power2.out" }, t);
  const leave = (id, t) => to(`#${id}`, { opacity: 0, filter: "blur(12px)", duration: X, ease: "power2.in" }, t - X / 2);
  const kick = (n, name) => `<p class="kicker">${n ? `<b>${n}</b>` : ""}${name}</p>`;
  let nSweep = 0;
  const sweep = (t) => { const id = `sweep-${nSweep++}`; clip(id, "sweep", Math.max(0, t - 0.35), 0.9, "", 40); at(`#${id}`, { xPercent: -120 }, { xPercent: 120, duration: 0.9, ease: "power2.inOut" }, Math.max(0, t - 0.35)); };

  clip("fondo", "fondo", 0, total, `<div class="glow"></div><div class="floor"><div class="floorgrid"></div></div>`, 0);
  at("#fondo .floorgrid", { backgroundPositionY: "0px" }, { backgroundPositionY: `${Math.round(total * 40)}px`, duration: total, ease: "none" }, 0);

  // 1. Gancho: el gemelo 3D en movimiento desde el primer cuadro y la frase grande encima.
  {
    const x = S.gancho, g = E.gancho; const [s, d] = span(x);
    video("g-vuelo", "bleedv", clipH("assets/clips/vuelo.mp4"), 0, d, 1);
    html.push(`<style>#g-vuelo{width:${W}px;height:${H}px;object-fit:cover}</style>`);
    const ventanas = (g.ventanas || []).map((n, i) => {
      const colores = { Excel: "#1f7a43", ERP: "#2d5fa8", Correo: "#c4473b", WhatsApp: "#1f9e55", Cuaderno: "#8a6d3b" };
      const cuerpo = n === "Excel" ? `<div class="grid">${"<span></span>".repeat(20)}</div>` : n === "WhatsApp" ? "Línea 2 parada desde las 6<br>¿Quién avisó a mantenimiento?" : n === "Correo" ? "RE: RE: pedido urgente<br>Adjunto versión final (3)" : n === "ERP" ? "PED-1184 · 2.400 und<br>Entrega: viernes" : "Turno noche:<br>línea 3 en ajuste";
      const pos = (HORIZ ? [[1000, 120], [1460, 200], [1040, 420], [1470, 500], [1230, 700]] : [[60, 700], [610, 770], [90, 1000], [580, 1080], [320, 1250]])[i];
      return `<div class="win" id="win${i}" style="left:${pos[0]}px;top:${pos[1]}px"><div class="wb" style="background:${colores[n]}"><i></i>${n}</div><div class="wc">${cuerpo}</div></div>`;
    }).join("");
    clip("e-gancho", "scene", s, d, `
      <div class="shade"></div>
      <div class="hud"><i class="c tl"></i><i class="c tr"></i><i class="c bl"></i><i class="c br"></i><p class="live">● GEMELO DIGITAL 3D</p></div>
      <h1 class="hook">${words(g.titulo)}</h1>${ventanas}<div class="flash"></div>
      <div class="tag3d"><i></i>GEMELO DIGITAL 3D</div>`, 3);
    at("#g-vuelo", { scale: 1.08 }, { scale: 1.0, duration: d, ease: "none" }, 0);
    // La frase entra palabra por palabra al ritmo de la voz (en el cuadro 0 ya se ve el 3D).
    const ps = palabras(x).slice(0, g.titulo.split(" ").length);
    ps.forEach((p, k) => at(`#e-gancho .hook .w:nth-of-type(${k + 1})`, { opacity: 0, y: 40, filter: "blur(10px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.35, ease: "power3.out" }, Math.max(0.05, p.t - 0.08)));
    const t3d = enPalabra(x, "gemelo");
    at("#e-gancho .tag3d", { opacity: 0, x: -40, scale: 0.9 }, { opacity: 1, x: 0, scale: 1, duration: 0.5, ease: "back.out(2)" }, t3d - 0.1);
    if (g.ventanas) {
      const tE = enPalabra(x, "Están");
      g.ventanas.forEach((_, i) => at(`#win${i}`, { opacity: 0, scale: 0.6, rotate: (i % 2 ? 6 : -6) }, { opacity: 1, scale: 1, rotate: (i % 2 ? 3 : -3), duration: 0.45, ease: "back.out(1.8)" }, tE + i * 0.16));
      const tJ = enPalabra(x, "Júntalos");
      g.ventanas.forEach((_, i) => to(`#win${i}`, { left: HORIZ ? 760 : 340, top: HORIZ ? 415 : 775, scale: 0.05, opacity: 0, rotate: 0, duration: 0.7, ease: "power3.in" }, tJ + i * 0.05));
      at("#e-gancho .flash", { opacity: 0, scale: 0.2 }, { opacity: 1, scale: 6, duration: 0.35, ease: "power2.out" }, tJ + 0.75);
      to("#e-gancho .flash", { opacity: 0, duration: 0.5 }, tJ + 1.1);
      sfx("gj", "whoosh-short.mp3", tJ, 0.3);
    }
    if (g.tarjeta) {
      const c = g.tarjeta, tR = enPalabra(x, c.rompeEn);
      html.push(`<div id="g-tj" class="clip" data-start="0.00" data-duration="${(tR + 1.2).toFixed(2)}" data-track-index="5"><div class="win xl tj" id="tjw"><div class="wb" style="background:${c.color || "#2d5fa8"}"><i></i>${c.titulo}</div><div class="wc">${c.cuerpo}</div></div></div>`);
      at("#tjw", { opacity: 0, scale: 0.7, rotate: -4 }, { opacity: 1, scale: 1, rotate: -3, duration: 0.5, ease: "back.out(1.8)" }, 0.6);
      to("#tjw", { opacity: 0, y: 260, rotate: 12, scale: 0.8, duration: 0.6, ease: "power2.in" }, tR);
      sfx("gt", "whoosh-short.mp3", tR, 0.3);
    }
    if (g.excel) {
      const tR = enPalabra(x, g.excel.rompeEn);
      html.push(`<div id="g-xl" class="clip" data-start="0.00" data-duration="${(tR + 1.4).toFixed(2)}" data-track-index="5"><div class="win xl" id="xlw"><div class="wb" style="background:#1f7a43"><i></i>Plan_semana_v7_FINAL.xlsx</div><div class="wc"><div class="grid">${Array.from({ length: 40 }, (_, i) => `<span class="${["", "r", "g", "y", "", "b"][i % 6]}"></span>`).join("")}</div></div></div></div>`);
      at("#xlw", { opacity: 0, scale: 0.7, rotate: -4 }, { opacity: 1, scale: 1, rotate: -3, duration: 0.5, ease: "back.out(1.8)" }, 0.5);
      for (let i = 0; i < 40; i++) {
        const ang = (i * 137.5 * Math.PI) / 180, r = 500 + (i % 7) * 90;
        to(`#xlw .grid span:nth-child(${i + 1})`, { x: Math.round(Math.cos(ang) * r), y: Math.round(Math.sin(ang) * r + 300), rotate: (i % 2 ? 1 : -1) * (90 + i * 7), opacity: 0, duration: 0.9, ease: "power2.in" }, tR + (i % 10) * 0.02);
      }
      to("#xlw", { opacity: 0, duration: 0.5 }, tR + 0.5);
      sfx("gx", "whoosh-short.mp3", tR, 0.3);
    }
    if (V.parte) { html.push(`<div id="g-parte" class="clip" data-start="0.00" data-duration="${d.toFixed(2)}" data-track-index="6"><div class="parte">PARTE ${V.parte} DE 8</div></div>`); at("#g-parte .parte", { opacity: 0, y: -20 }, { opacity: 1, y: 0, duration: 0.4 }, 0.3); }
    sfx("g0", "hit.wav", 0.05, 0.25);
    leave("e-gancho", s + d);
  }

  // 2. Dolor: una tarjeta por industria con su frase, sobre el 3D de esa industria.
  {
    const x = S.dolor, dl = E.dolor; const [s, d] = span(x);
    const cortes = dl.cortes.map((c) => enPalabra(x, c));
    const tarjetas = dl.saltarPrimero ? cortes.slice(1) : cortes;
    const fin = s + d;
    const inicio = dl.saltarPrimero ? cortes[0] : s;
    if (dl.saltarPrimero) {
      clip("d-intro", "scene", s, tarjetas[0] - s + 0.2, `<div class="bleed dim"><img src="${tm("p-heroe")}" alt=""></div><div class="repetir">${(dl.intro || ["Copiar.", "Pegar.", "Repetir."]).map((t) => `<p>${t}</p>`).join("")}</div>`, 3);
      enter("d-intro", s);
      const span0 = tarjetas[0] - x.voiceAt;
      [0, 1, 2].forEach((k) => at(`#d-intro .repetir p:nth-child(${k + 1})`, { opacity: 0, x: -60 }, { opacity: 1, x: 0, duration: 0.4, ease: "power3.out" }, x.voiceAt + 0.2 + (k * span0) / 3.2));
      sfx("d0", "typing.mp3", x.voiceAt, 0.15);
    }
    dl.items.forEach(([ind, frase, img], k) => {
      const a = k === 0 && !dl.saltarPrimero ? s : tarjetas[k] - 0.15;
      const b = k + 1 < tarjetas.length ? tarjetas[k + 1] + 0.15 : fin;
      const id = `ind${k}`;
      clip(id, "scene ind", a, b - a, `<div class="bleed"><img src="${tm(img)}" alt=""></div><div class="shade fuerte"></div>
        <div class="lab"><span class="n">${String(k + 1).padStart(2, "0")} / 04</span><h3>${ind}</h3></div>
        <blockquote>“${frase}”</blockquote>${k === 3 && dl.remate ? `<div class="remate">${dl.remate.texto}</div>` : ""}`, 4 + k);
      at(`#${id}`, { opacity: 0, clipPath: "inset(0% 0% 0% 100%)" }, { opacity: 1, clipPath: "inset(0% 0% 0% 0%)", duration: 0.45, ease: "power3.inOut" }, a);
      at(`#${id} .bleed img`, { scale: 1.18, x: k % 2 ? 40 : -40 }, { scale: 1.04, x: 0, duration: b - a, ease: "power1.out" }, a);
      at(`#${id} .lab`, { opacity: 0, y: -20 }, { opacity: 1, y: 0, duration: 0.4, ease: "power3.out" }, a + 0.15);
      at(`#${id} blockquote`, { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" }, a + 0.25);
      sfx(`d${k + 1}`, "whoosh-short.mp3", a, 0.22);
    });
    if (dl.remate) at("#ind3 .remate", { opacity: 0, scale: 1.4 }, { opacity: 1, scale: 1, duration: 0.4, ease: "back.out(2)" }, enPalabra(x, dl.remate.en));
    void inicio;
    leave(`ind${dl.items.length - 1}`, fin);
  }

  // 3. Solución.
  const sol = S.solucion, so = E.solucion;
  if (so.tipo === "gemelo") {
    const x = sol; const [s, d] = span(x);
    const tG = enPalabra(x, "gemelo digital:"), tM = enPalabra(x, "Máquinas"), tL = enPalabra(x, "líneas"), tP = enPalabra(x, "personas"), tI = enPalabra(x, "inventarios"), tY = enPalabra(x, "Le das play"), tS = enPalabra(x, "Sirve igual");
    const tPl = enPalabra(x, "una fábrica,"), tB = enPalabra(x, "bodega"), tSa = enPalabra(x, "planta de procesos"), tR = enPalabra(x, "red de servicios");
    video("s-lapso", "bleedv", clipH("assets/clips/lapso.mp4"), s, tPl - s + 0.6, 3);
    html.push(`<style>#s-lapso{width:${W}px;height:${H}px;object-fit:cover}</style>`);
    const cuts = [["c-m", "p-inyectoras-2", tM, tL, "Máquinas"], ["c-l", "p-medio", tL, tP, "Líneas"], ["c-p", "p-personas", tP, tI, "Personas"], ["c-i", "p-silos", tI, tY, "Inventarios"],
      ["c-pl", "p-heroe", tPl, tB, "Fábrica"], ["c-b", "logistica", tB, tSa, "Bodega"], ["c-sa", "salsas", tSa, tR, "Procesos"], ["c-r", "red", tR, s + d, "Red de servicios"]];
    clip("e-sol", "scene", s, d, `
      ${cuts.map(([id, img]) => `<div class="bleed cut" id="${id}"><img src="${tm(img)}" alt=""></div>`).join("")}
      <div class="shade"></div>
      <div class="hud"><i class="c tl"></i><i class="c tr"></i><i class="c bl"></i><i class="c br"></i><p class="live">● PROYECCIÓN · HORA POR HORA</p></div>
      <div class="top">${kick("", V.kicker)}</div>
      <h2 class="titular">${words("Una copia 3D de tu planta.")}</h2>
      ${cuts.map(([id, , , , lab]) => `<p class="label" id="lb-${id}">${lab}</p>`).join("")}
      <div class="play"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="46"/><path d="M40 30 L72 50 L40 70 Z"/></svg></div>
      <div class="scrub"><i></i></div>`, 4);
    at("#s-lapso", { opacity: 0, scale: 1.12 }, { opacity: 1, scale: 1.02, duration: 1.2, ease: "power1.out" }, s);
    enter("e-sol", s);
    at("#e-sol .top", { opacity: 0 }, { opacity: 1, duration: 0.5 }, s + 0.2);
    at("#e-sol .titular .w", { opacity: 0, y: 40, filter: "blur(10px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.5, stagger: 0.08, ease: "power3.out" }, tG - 0.2);
    to("#e-sol .titular", { opacity: 0, y: -20, duration: 0.4 }, tM - 0.3);
    cuts.forEach(([id, , a, b], i) => {
      at(`#${id}`, { opacity: 0, clipPath: "circle(0% at 50% 45%)" }, { opacity: 1, clipPath: "circle(90% at 50% 45%)", duration: 0.55, ease: "power3.inOut" }, a - 0.12);
      at(`#${id} img`, { scale: 1.22, x: i % 2 ? 50 : -50 }, { scale: 1.04, x: 0, duration: b - a + 0.6, ease: "power1.out" }, a - 0.12);
      at(`#lb-${id}`, { opacity: 0, x: -50, filter: "blur(8px)" }, { opacity: 1, x: 0, filter: "blur(0px)", duration: 0.4, ease: "power3.out" }, a + 0.05);
      to(`#lb-${id}`, { opacity: 0, x: 40, duration: 0.25 }, b - 0.15);
      if (i !== 3 && i !== cuts.length - 1) to(`#${id}`, { opacity: 0, duration: 0.3 }, b + 0.3);
    });
    // "Le das play": vuelve el lapso con el play y la barra del tiempo.
    to("#c-i", { opacity: 0, duration: 0.4 }, tY - 0.1);
    at("#e-sol .play", { opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(2)" }, tY);
    to("#e-sol .play", { scale: 1.5, opacity: 0, duration: 0.7, ease: "power2.in" }, tY + 1.1);
    at("#e-sol .scrub", { opacity: 0 }, { opacity: 1, duration: 0.3 }, tY + 0.4);
    at("#e-sol .scrub i", { scaleX: 0 }, { scaleX: 1, duration: tS - tY - 0.4, ease: "none" }, tY + 0.4);
    to("#e-sol .scrub", { opacity: 0, duration: 0.3 }, tS - 0.2);
    sfx("s0", "whoosh.wav", s, 0.25); sfx("sp", "pop.mp3", tY, 0.3);
    [tPl, tB, tSa, tR].forEach((t, i) => sfx(`sc${i}`, "click-soft.mp3", t, 0.2));
    leave("e-sol", s + d);
  } else if (so.tipo === "integrator") {
    const x = sol; const [s, d] = span(x);
    const tE = enPalabra(x, "ERP"), tC = enPalabra(x, "CRM"), tS = enPalabra(x, "SCADA"), tN = enPalabra(x, "Ninguno"), tI = enPalabra(x, "Integrator"), tP = enPalabra(x, "Los pedidos entran"), tV = enPalabra(x, "el inventario"), tMq = enPalabra(x, "lo que pasa"), tSin = enPalabra(x, "Sin copiar"), tVer = enPalabra(x, "Sin versiones");
    const SYS = HORIZ ? [["ERP", "Ventas, compras e inventario", 120, 170], ["CRM", "Clientes y ventas", 1380, 170], ["SCADA", "Vigila y controla las máquinas", 750, 120]] : [["ERP", "Ventas, compras e inventario", 70, 380], ["CRM", "Clientes y ventas", 590, 560], ["SCADA", "Vigila y controla las máquinas", 70, 740]];
    const ancla = (i) => [SYS[i][2] + 210, SYS[i][3] + 150];
    const core = HORIZ ? [960, 690] : [540, 1160];
    const lin = SYS.map((_, i) => { const [ax, ay] = ancla(i); return `<line class="ok" id="ok${i}" x1="${ax}" y1="${ay}" x2="${core[0]}" y2="${core[1] - 150}" pathLength="1"/><circle class="pk" id="pk${i}" r="9" cx="${ax}" cy="${ay}"/>`; }).join("");
    const rotas = `<line id="rt0" x1="${ancla(0)[0] + 60}" y1="${ancla(0)[1] - 40}" x2="${ancla(1)[0] - 120}" y2="${ancla(1)[1] - 90}"/><line id="rt1" x1="${ancla(1)[0] - 120}" y1="${ancla(1)[1] + 40}" x2="${ancla(2)[0] + 60}" y2="${ancla(2)[1] - 60}"/><line id="rt2" x1="${ancla(0)[0] - 60}" y1="${ancla(0)[1]}" x2="${ancla(2)[0] - 60}" y2="${ancla(2)[1] - 140}"/>`;
    clip("e-sol", "scene", s, d, `
      <div class="bleed dim"><img src="${tm("p-heroe")}" alt=""></div>
      <div class="top">${kick("", V.kicker)}</div>
      <svg class="net" viewBox="0 0 ${W} ${H}">${rotas}${lin}</svg>
      ${SYS.map(([n, sub, l, t], i) => `<div class="sys" id="sy${i}" style="left:${l}px;top:${t}px"><b>${n}</b><small>${sub}</small></div>`).join("")}
      <div class="cross" style="left:${HORIZ ? 590 : 470}px;top:${HORIZ ? 250 : 470}px" id="x0">✕</div><div class="cross" style="left:${HORIZ ? 1240 : 500}px;top:${HORIZ ? 250 : 780}px" id="x1">✕</div>
      <div class="core"><img src="assets/clips/marca.png" alt=""><span>Digital Twin</span></div>
      <div class="stage3d"><div class="device" id="dv"><div class="shot" id="dv-s0"><img src="assets/tomas/ui-aps-pedidos.png" alt=""></div><div class="shot" id="dv-s1"><img src="assets/tomas/ui-aps-gantt.png" alt=""></div><div class="shot" id="dv-s2"><img src="${tm("p-inyectoras-2")}" alt="" style="${HORIZ ? "" : "width:1000px;height:1778px;object-position:50% 40%;top:-500px"}"></div><div class="edge" id="dv-edge"></div></div></div>
      <div class="stamp" id="st0">Sin copiar y pegar.</div><div class="stamp" id="st1" style="color:#4ea7ff">Una sola verdad.</div>`, 4);
    enter("e-sol", s);
    at("#e-sol .top", { opacity: 0 }, { opacity: 1, duration: 0.5 }, s + 0.2);
    [tE, tC, tS].forEach((t, i) => at(`#sy${i}`, { opacity: 0, y: 30, scale: 0.9 }, { opacity: 1, y: 0, scale: 1, duration: 0.45, ease: "back.out(1.8)" }, t - 0.1));
    [0, 1, 2].forEach((i) => at(`#rt${i}`, { opacity: 0 }, { opacity: 0.9, duration: 0.3 }, tN));
    [0, 1].forEach((i) => at(`#x${i}`, { opacity: 0, scale: 2 }, { opacity: 1, scale: 1, duration: 0.35, ease: "back.out(2)" }, tN + 0.15 + i * 0.12));
    sfx("sn", "click.wav", tN + 0.15, 0.3);
    to("#e-sol .net line:not(.ok)", { opacity: 0, duration: 0.3 }, tI - 0.1);
    to("#e-sol .cross", { opacity: 0, duration: 0.3 }, tI - 0.1);
    at("#e-sol .core", { opacity: 0, scale: 0.5 }, { opacity: 1, scale: 1, duration: 0.6, ease: "back.out(1.7)" }, tI - 0.1);
    [0, 1, 2].forEach((i) => {
      at(`#ok${i}`, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.6, ease: "power2.out" }, tI + 0.1 + i * 0.1);
      const [ax, ay] = ancla(i);
      at(`#pk${i}`, { attr: { cx: ax, cy: ay }, opacity: 1 }, { attr: { cx: core[0], cy: core[1] - 150 }, opacity: 1, duration: 0.8, ease: "power1.in", repeat: 2, repeatDelay: 0.15 }, tI + 0.5 + i * 0.12);
    });
    sfx("si", "spark.wav", tI, 0.25);
    // Los datos entran solos: la pantalla del APS, el plan y el 3D con el estado de las máquinas.
    to(".sys,.net,.core", { opacity: 0, y: -40, duration: 0.4 }, tP - 0.3);
    at("#e-sol .stage3d", { opacity: 0, y: 120, rotateX: 20 }, { opacity: 1, y: 0, rotateX: 0, duration: 0.6, ease: "power3.out" }, tP - 0.2);
    const swap = (i, t) => { at(`#dv-s${i}`, { clipPath: "inset(0 0 0 100%)" }, { clipPath: "inset(0 0 0 0%)", duration: 0.6, ease: "power3.inOut" }, t); at("#dv-edge", { left: "100%", opacity: 1 }, { left: "0%", opacity: 0, duration: 0.6, ease: "power3.inOut" }, t); };
    at("#dv-s1", { clipPath: "inset(0 0 0 100%)" }, { clipPath: "inset(0 0 0 100%)", duration: 0.01 }, s);
    at("#dv-s2", { clipPath: "inset(0 0 0 100%)" }, { clipPath: "inset(0 0 0 100%)", duration: 0.01 }, s);
    at("#dv-s0 img", { scale: 1 }, { scale: 1.25, duration: tV - tP + 0.5, ease: "sine.inOut" }, tP);
    swap(1, tV - 0.1);
    swap(2, tMq - 0.1);
    to("#e-sol .stage3d", { opacity: 0, y: -60, duration: 0.4 }, tSin - 0.3);
    at("#st0", { opacity: 0, scale: 1.4 }, { opacity: 1, scale: 1, duration: 0.4, ease: "back.out(2)" }, tSin);
    to("#st0", { opacity: 0, y: -30, duration: 0.3 }, tVer - 0.2);
    at("#st1", { opacity: 0, scale: 1.4 }, { opacity: 1, scale: 1, duration: 0.4, ease: "back.out(2)" }, tVer);
    sfx("s0", "whoosh.wav", s, 0.25);
    leave("e-sol", s + d);
  }

  if (so.tipo === "aps") {
    const x = sol; const [s, d] = span(x);
    const tiempos_ = so.clips.map((c) => enPalabra(x, c.desde));
    const tG = enPalabra(x, so.gemeloEn);
    const fin = s + d;
    const fuente = so.fuente;
    clip("e-sol", "scene", s, d, `
      <div class="bleed dim"><img src="${tm("p-heroe")}" alt=""></div>
      <div class="top">${kick("", V.kicker)}</div>
      <div class="apsT"><h2${so.titulo?.size ? ` style="font-size:${so.titulo.size}px;letter-spacing:-3px"` : ""}>${words(so.titulo?.grande || "APS")}</h2><p>${words(so.titulo?.nombre || "Planificación y programación avanzada")}</p><small>${words(so.titulo?.def || "Qué orden va en qué máquina, y a qué hora.")}</small></div>`, 3);
    enter("e-sol", s);
    at("#e-sol .top", { opacity: 0 }, { opacity: 1, duration: 0.5 }, s + 0.2);
    at("#e-sol .apsT h2", { opacity: 0, scale: 1.6, filter: "blur(14px)" }, { opacity: 1, scale: 1, filter: "blur(0px)", duration: 0.6, ease: "power3.out" }, x.voiceAt - 0.1);
    at("#e-sol .apsT p .w", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.4, stagger: 0.1, ease: "power3.out" }, enPalabra(x, so.siglaEn));
    at("#e-sol .apsT small .w", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.35, stagger: 0.07, ease: "power3.out" }, enPalabra(x, so.definicionEn));
    to("#e-sol .apsT", { opacity: 0, y: -40, duration: 0.4 }, tiempos_[0] - 0.4);
    // Gráficos propios (sin tomas de la demo): el universo de planes y los escenarios lado a lado.
    const grafico = (c, i, a, b, dur) => {
      const PX = HORIZ ? 880 : 40, PW = HORIZ ? 960 : 1000, PH = HORIZ ? 700 : 840, top = HORIZ ? 90 : 400;
      const fases = (c.fases || []).map((f) => enPalabra(x, f));
      const lab = `<p class="clab" style="top:${HORIZ ? 380 : top + PH + 40}px">${c.label}</p>`;
      if (c.grafico === "universo") {
        // Puntos = planes posibles. Cada generación se acercan al frente de mejores equilibrios.
        let sem = 7; const rnd = () => ((sem = (sem * 16807) % 2147483647) / 2147483647);
        const N = 110, M = 70, w = PW - 2 * M, h = PH - 2 * M - 40, X0 = M, Y0 = PH - M;
        const frente = (u) => [0.18 + 0.78 * Math.cos(u), 0.18 + 0.78 * Math.sin(u)]; // cuarto de círculo arriba a la derecha
        const gen = Array.from({ length: N }, () => {
          const u = rnd() * Math.PI / 2, p0 = [0.05 + 0.6 * rnd(), 0.05 + 0.6 * rnd()], f = frente(u);
          return [0, 0.45, 0.8, 0.97].map((k, g) => { const j = (1 - k) * 0.08 * (rnd() - 0.5); return [p0[0] + (f[0] - p0[0]) * k + j, p0[1] + (f[1] - p0[1]) * k + j]; });
        });
        const P = ([u, v]) => [Math.round(X0 + u * w), Math.round(Y0 - v * h)];
        const ruta = Array.from({ length: 21 }, (_, k) => P(frente((k / 20) * Math.PI / 2))).map(([px, py], k) => `${k ? "L" : "M"}${px},${py}`).join("");
        const top3 = [0.25, 0.78, 1.32].map((u) => P(frente(u)));
        const gens = ["Generación 1", "Generación 20", "Generación 80", "Generación 300"];
        clip(`pg${i}`, "scene", a, dur, `<div class="pframe uni" style="left:${PX}px;width:${PW}px;top:${top}px;height:${PH}px">
          <div class="uniT">${gens.map((g, k) => `<span class="g${k}">${g}</span>`).join("")}</div>
          <svg viewBox="0 0 ${PW} ${PH}" width="${PW}" height="${PH}">
            <line class="eje" x1="${X0}" y1="${Y0}" x2="${X0 + w}" y2="${Y0}"/><line class="eje" x1="${X0}" y1="${Y0}" x2="${X0}" y2="${Y0 - h}"/>
            <text class="ejeT" x="${X0 + w}" y="${Y0 + 44}" text-anchor="end">Cumple a tiempo →</text>
            <text class="ejeT" transform="translate(${X0 - 24},${Y0 - h}) rotate(-90)" text-anchor="end">Menos energía →</text>
            ${Array.from({ length: 8 }, (_, k) => `<line class="cruce" id="cx${i}-${k}" x1="0" y1="0" x2="0" y2="0"/>`).join("")}
            <path class="fr" d="${ruta}" pathLength="1"/>
            ${gen.map((g, k) => { const [px, py] = P(g[0]); return `<circle class="pl" id="d${i}-${k}" cx="${px}" cy="${py}" r="9"/>`; }).join("")}
            ${top3.map(([px, py], k) => `<g class="best" id="b${i}-${k}"><circle cx="${px}" cy="${py}" r="20"/><text x="${px}" y="${py - 34}" text-anchor="middle">${"ABC"[k]}</text></g>`).join("")}
          </svg></div>${lab}`, 6 + i * 2);
        const [t1, t2, t3, tF] = [0, 1, 2, 3].map((k) => fases[k] ?? a + ((k + 1) * dur) / 5);
        at(`#pg${i} .pframe`, { opacity: 0, scale: 0.92 }, { opacity: 1, scale: 1, duration: 0.35, ease: "power3.out" }, a);
        at(`#pg${i} .pl`, { opacity: 0, scale: 0, transformOrigin: "50% 50%" }, { opacity: 0.85, scale: 1, duration: 0.25, stagger: 0.012, ease: "back.out(2)" }, a + 0.2);
        at(`#pg${i} .g0`, { opacity: 0 }, { opacity: 1, duration: 0.3 }, a + 0.3);
        [t1, t2, t3].forEach((t, g) => {
          to(`#pg${i} .g${g}`, { opacity: 0, duration: 0.2 }, t - 0.2);
          at(`#pg${i} .g${g + 1}`, { opacity: 0 }, { opacity: 1, duration: 0.25 }, t);
          for (let k = 0; k < 8; k++) {
            const d1 = gen[(k * 13 + g * 7) % N][g], d2 = gen[(k * 29 + g * 11 + 5) % N][g];
            const [x1, y1] = P(d1), [x2, y2] = P(d2);
            at(`#cx${i}-${k}`, { attr: { x1, y1, x2, y2 }, opacity: 0 }, { attr: { x1, y1, x2, y2 }, opacity: 0.9, duration: 0.15 }, t - 0.45 + k * 0.03);
            to(`#cx${i}-${k}`, { opacity: 0, duration: 0.25 }, t + 0.1);
          }
          gen.forEach((p, k) => { const [px, py] = P(p[g + 1]); to(`#d${i}-${k}`, { attr: { cx: px, cy: py }, duration: 0.9, ease: "power2.inOut" }, t); });
        });
        at(`#pg${i} .fr`, { strokeDashoffset: 1, strokeDasharray: 1, opacity: 1 }, { strokeDashoffset: 0, strokeDasharray: 1, opacity: 1, duration: 0.8, ease: "power2.out" }, tF);
        to(`#pg${i} .pl`, { opacity: 0.25, duration: 0.4 }, tF);
        at(`#pg${i} .best`, { opacity: 0, scale: 0, transformOrigin: "50% 50%" }, { opacity: 1, scale: 1, duration: 0.35, stagger: 0.15, ease: "back.out(2.5)" }, tF + 0.3);
      } else if (c.grafico === "inventario") {
        // Centro de control: avance de órdenes, inventario por etapa y requerimientos de los próximos días.
        const ords = c.ordenes || [["Orden 101 · Producto A", 0.72], ["Orden 102 · Producto B", 0.4], ["Orden 103 · Producto C", 0.12]];
        const inv = c.inventario || [["En proceso", 0.55], ["Semielaborado", 0.7], ["Terminado", 0.4]];
        const req = c.requerimientos || [0.4, 0.55, 0.9, 0.5, 0.7, 0.35, 0.6];
        const falta = c.falta ?? 2;
        clip(`pg${i}`, "scene", a, dur, `<div class="pframe inv" style="left:${PX}px;width:${PW}px;top:${top}px;height:${PH}px">
          <section class="ivO"><h4>Avance de órdenes</h4>${ords.map(([n, v]) => `<p><span>${n}</span><i><em style="width:${Math.round(v * 100)}%"></em></i></p>`).join("")}</section>
          <section class="ivI"><h4>Inventario</h4><div>${inv.map(([n, v]) => `<figure><i><em style="height:${Math.round(v * 100)}%"></em></i><figcaption>${n}</figcaption></figure>`).join("")}</div></section>
          <section class="ivR"><h4>Lo que vas a necesitar · próximos días</h4><div>${req.map((v, k) => `<figure class="${k === falta ? "falta" : ""}"><i><em style="height:${Math.round(v * 100)}%"></em></i><figcaption>${"LMMJVSD"[k]}</figcaption></figure>`).join("")}</div><b class="ivF">Falta material el miércoles</b></section>
        </div>${lab}`, 6 + i * 2);
        const [tI, tR] = [0, 1].map((k) => fases[k] ?? a + ((k + 1) * dur) / 3);
        at(`#pg${i} .pframe`, { opacity: 0, scale: 0.92 }, { opacity: 1, scale: 1, duration: 0.35, ease: "power3.out" }, a);
        at(`#pg${i} .ivO`, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.4, ease: "power3.out" }, a + 0.2);
        at(`#pg${i} .ivO em`, { scaleX: 0, transformOrigin: "0% 50%" }, { scaleX: 1, duration: 1.2, stagger: 0.2, ease: "power2.out" }, a + 0.4);
        at(`#pg${i} .ivI`, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.4, ease: "power3.out" }, tI - 0.2);
        at(`#pg${i} .ivI em`, { scaleY: 0, transformOrigin: "50% 100%" }, { scaleY: 1, duration: 0.8, stagger: 0.25, ease: "power2.out" }, tI);
        at(`#pg${i} .ivR`, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.4, ease: "power3.out" }, tR - 0.2);
        at(`#pg${i} .ivR em`, { scaleY: 0, transformOrigin: "50% 100%" }, { scaleY: 1, duration: 0.6, stagger: 0.08, ease: "power2.out" }, tR);
        at(`#pg${i} .ivF`, { opacity: 0, scale: 1.3 }, { opacity: 1, scale: 1, duration: 0.35, ease: "back.out(2)" }, tR + 1);
      } else if (["dendro", "senal", "dosia", "chat", "grafo", "gobierno"].includes(c.grafico)) {
        // Dibujos en un lienzo fijo de 1000x840 que se escala al panel (vertical u horizontal).
        const svg = (inner) => `<div class="pframe dz" style="left:${PX}px;width:${PW}px;top:${top}px;height:${PH}px"><svg viewBox="0 0 1000 840" width="${PW}" height="${PH}" preserveAspectRatio="xMidYMid meet">${inner}</svg></div>${lab}`;
        const caja = (x0, y0, w0, h0, t, cls = "") => `<g class="dzB ${cls}"><rect x="${x0}" y="${y0}" width="${w0}" height="${h0}" rx="18"/><text x="${x0 + w0 / 2}" y="${y0 + h0 / 2 + 12}" text-anchor="middle">${t}</text></g>`;
        at(`#pg${i} .pframe`, { opacity: 0, scale: 0.92 }, { opacity: 1, scale: 1, duration: 0.35, ease: "power3.out" }, a);
        if (c.grafico === "dendro") {
          const lect = c.lecturas || ["Andando", "Producido ▲", "Temperatura normal"];
          clip(`pg${i}`, "scene", a, dur, svg(`
            ${caja(250, 40, 500, 110, "Gemelo 3D · Control Center", "dzT")}
            <path class="dzL" id="dzup${i}" d="M500,330 L500,150" pathLength="1"/>
            <path class="dzL" d="M500,600 L500,470" pathLength="1"/><path class="dzL" d="M250,690 L390,470" pathLength="1"/><path class="dzL" d="M750,690 L610,470" pathLength="1"/>
            <g class="dzD"><rect x="380" y="330" width="240" height="140" rx="24"/><rect class="chip" x="465" y="350" width="70" height="60" rx="10"/><text x="500" y="458" text-anchor="middle" font-size="26">DENDRO</text></g>
            ${caja(390, 600, 220, 100, "Máquina", "dzM")}${caja(150, 690, 200, 90, "PLC")}${caja(650, 690, 200, 90, "Sensores")}
            ${lect.map((t, k) => `<g class="dzR" id="dr${i}-${k}"><rect x="${40 + k * 320}" y="200" width="290" height="70" rx="35"/><text x="${185 + k * 320}" y="245" text-anchor="middle">${t}</text></g>`).join("")}
            ${[0, 1, 2, 3, 4, 5].map((k) => `<circle class="dzP" id="dp${i}-${k}" cx="500" cy="330" r="10"/>`).join("")}`));
          at(`#pg${i} .dzM, #pg${i} .dzB:not(.dzT):not(.dzM)`, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.4, stagger: 0.12, ease: "power3.out" }, a + 0.2);
          at(`#pg${i} .dzL`, { strokeDasharray: 1, strokeDashoffset: 1 }, { strokeDasharray: 1, strokeDashoffset: 0, duration: 0.6, stagger: 0.1 }, a + 0.6);
          at(`#pg${i} .dzD`, { opacity: 0, scale: 0.6, transformOrigin: "500px 400px" }, { opacity: 1, scale: 1, duration: 0.45, ease: "back.out(2)" }, a + 0.5);
          at(`#pg${i} .dzT`, { opacity: 0, y: -30 }, { opacity: 1, y: 0, duration: 0.4, ease: "power3.out" }, a + 1);
          const tL = fases[0] ?? a + 1.5;
          lect.forEach((_, k) => at(`#dr${i}-${k}`, { opacity: 0, scale: 0.7, transformOrigin: "50% 50%" }, { opacity: 1, scale: 1, duration: 0.35, ease: "back.out(2)" }, tL + k * 0.6));
          for (let k = 0; k < 6; k++) at(`#dp${i}-${k}`, { attr: { cy: 330 }, opacity: 1 }, { attr: { cy: 150 }, opacity: 0, duration: 0.9, ease: "none" }, a + 1.2 + k * 0.55);
          at(`#pg${i} .chip`, { fill: "#2d7ff9" }, { fill: "#6dff9c", duration: 0.5, yoyo: true, repeat: Math.max(1, Math.floor(dur / 1)), ease: "sine.inOut" }, a + 0.8);
        } else if (c.grafico === "senal") {
          let sem = 3; const rnd = () => ((sem = (sem * 16807) % 2147483647) / 2147483647);
          const n = 60, X = (k) => 80 + (k * 860) / (n - 1);
          const ys = Array.from({ length: n }, (_, k) => { const base = 470 + 30 * Math.sin(k / 4) + (rnd() - 0.5) * 30; const sube = k > 34 ? (k - 34) * (k > 46 ? 11 : 6) : 0; return Math.max(240, Math.round(base - sube)); });
          const banda = `M80,410 ${Array.from({ length: n }, (_, k) => `L${X(k)},${Math.round(410 + 25 * Math.sin(k / 4))}`).join(" ")} L940,560 ${Array.from({ length: n }, (_, k) => `L${X(n - 1 - k)},${Math.round(540 + 25 * Math.sin((n - 1 - k) / 4))}`).join(" ")} Z`;
          clip(`pg${i}`, "scene", a, dur, svg(`
            <text class="dzH" x="500" y="110" text-anchor="middle">Lo que aprende la IA del chip</text>
            <path class="dzBand" d="${banda}"/><text class="dzS" x="90" y="600">Normal para esta máquina</text>
            <polyline class="dzLive" points="${ys.map((y, k) => `${X(k)},${y}`).join(" ")}" pathLength="1"/>
            <g class="dzA a1"><rect x="220" y="640" width="560" height="66" rx="33"/><text x="500" y="684" text-anchor="middle">Toca mantenimiento preventivo</text></g>
            <g class="dzA a2"><rect x="220" y="725" width="560" height="66" rx="33"/><text x="500" y="769" text-anchor="middle">Posible falla: anticípate</text></g>`));
          at(`#pg${i} .dzBand`, { opacity: 0 }, { opacity: 1, duration: 0.6 }, a + 0.3);
          const [t1, t2] = [0, 1].map((k) => fases[k] ?? a + ((k + 1) * dur) / 3);
          at(`#pg${i} .dzLive`, { strokeDasharray: 1, strokeDashoffset: 1 }, { strokeDasharray: 1, strokeDashoffset: 0, duration: Math.max(1, t2 - a), ease: "none" }, a + 0.4);
          at(`#pg${i} .a1`, { opacity: 0, x: 40 }, { opacity: 1, x: 0, duration: 0.4, ease: "back.out(2)" }, t1);
          at(`#pg${i} .a2`, { opacity: 0, x: 40 }, { opacity: 1, x: 0, duration: 0.4, ease: "back.out(2)" }, t2);
        } else if (c.grafico === "chat") {
          const barras = [0.85, 0.6, 0.45, 0.3, 0.2];
          clip(`pg${i}`, "scene", a, dur, svg(`
            <rect class="chW" x="30" y="20" width="940" height="800" rx="26"/>
            <text class="chH" x="70" y="78">Asistente de IA · tu planta</text>
            <g class="chQ"><rect x="290" y="110" width="650" height="90" rx="30"/><text x="615" y="166" text-anchor="middle">¿Qué pedidos van en riesgo esta semana?</text></g>
            <g class="chA"><rect x="60" y="225" width="620" height="90" rx="30"/><text x="370" y="281" text-anchor="middle">Cinco pedidos. Te armé el reporte →</text></g>
            <g class="chP"><rect x="60" y="345" width="880" height="445" rx="22"/><text class="chPT" x="90" y="395">REPORTE · PEDIDOS EN RIESGO</text>
              ${barras.map((v, k) => `<rect class="chBar" x="${110 + k * 165}" y="${740 - v * 300}" width="110" height="${v * 300}" rx="10"/><text class="chBL" x="${165 + k * 165}" y="775" text-anchor="middle">P${k + 1}</text>`).join("")}
              <g class="chBtn"><rect x="700" y="365" width="210" height="50" rx="25"/><text x="805" y="398" text-anchor="middle">Compartir</text></g></g>`));
          const tP = fases[0] ?? a + dur * 0.4;
          at(`#pg${i} .chQ`, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.4, ease: "back.out(2)" }, a + 0.3);
          at(`#pg${i} .chA`, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.4, ease: "back.out(2)" }, a + 1.6);
          at(`#pg${i} .chP`, { opacity: 0, y: 60 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" }, tP);
          at(`#pg${i} .chBar`, { scaleY: 0, transformOrigin: "50% 100%" }, { scaleY: 1, duration: 0.6, stagger: 0.12, ease: "power2.out" }, tP + 0.3);
          at(`#pg${i} .chBtn`, { opacity: 0, scale: 0.7, transformOrigin: "805px 390px" }, { opacity: 1, scale: 1, duration: 0.35, ease: "back.out(2)" }, tP + 1.4);
        } else if (c.grafico === "grafo") {
          const N = [["Equipos", 500, 230], ["Pedidos", 250, 380], ["Clientes", 750, 380], ["Personas", 330, 620], ["Inventario", 670, 620]];
          const E = [[0, 1], [0, 2], [1, 2], [1, 3], [2, 4], [3, 4], [0, 3], [0, 4]];
          let sem = 11; const rnd = () => ((sem = (sem * 16807) % 2147483647) / 2147483647);
          const extra = Array.from({ length: 14 }, (_, k) => { const p = N[k % 5]; const ang = rnd() * Math.PI * 2, r = 110 + rnd() * 60; return [p[1], p[2], Math.round(p[1] + r * Math.cos(ang)), Math.round(p[2] + r * Math.sin(ang))]; });
          clip(`pg${i}`, "scene", a, dur, svg(`
            ${E.map(([u, v]) => `<line class="grE" x1="${N[u][1]}" y1="${N[u][2]}" x2="${N[v][1]}" y2="${N[v][2]}" pathLength="1"/>`).join("")}
            ${extra.map(([x1, y1, x2, y2]) => `<g class="grX"><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/><circle cx="${x2}" cy="${y2}" r="12"/></g>`).join("")}
            ${N.map(([t, x0, y0]) => `<g class="grN"><circle cx="${x0}" cy="${y0}" r="70"/><text x="${x0}" y="${y0 + 10}" text-anchor="middle">${t}</text></g>`).join("")}
            <text class="dzH grT" x="500" y="790" text-anchor="middle">Crece contigo, se actualiza solo</text>`));
          at(`#pg${i} .grN`, { opacity: 0, scale: 0.4, transformOrigin: "50% 50%" }, { opacity: 1, scale: 1, duration: 0.4, stagger: 0.15, ease: "back.out(2)" }, a + 0.2);
          at(`#pg${i} .grE`, { strokeDasharray: 1, strokeDashoffset: 1 }, { strokeDasharray: 1, strokeDashoffset: 0, duration: 0.5, stagger: 0.08 }, a + 0.8);
          const tX = fases[0] ?? a + dur * 0.5;
          at(`#pg${i} .grX`, { opacity: 0 }, { opacity: 1, duration: 0.3, stagger: 0.12 }, tX);
          at(`#pg${i} .grT`, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.4 }, tX + 0.4);
        } else if (c.grafico === "gobierno") {
          const filas = [["Qué puede hacer la IA", "Solo lo que tú permites"], ["Quién la usa", "Administrador · Programador · Visualizador"], ["Cada respuesta", "Queda registrada"]];
          clip(`pg${i}`, "scene", a, dur, svg(`
            <text class="dzH" x="500" y="90" text-anchor="middle">Gobernanza · Arvantti Harness</text>
            ${filas.map(([t, d], k) => `<g class="goF" id="gf${i}-${k}"><rect x="60" y="${150 + k * 200}" width="880" height="160" rx="22"/><text class="goT" x="100" y="${215 + k * 200}">${t}</text><text class="goD" x="100" y="${265 + k * 200}">${d}</text><text class="goK" x="890" y="${245 + k * 200}" text-anchor="end">✓</text></g>`).join("")}`));
          filas.forEach((_, k) => at(`#gf${i}-${k}`, { opacity: 0, x: -50 }, { opacity: 1, x: 0, duration: 0.4, ease: "power3.out" }, (fases[k] ?? a + 0.3 + k * 0.9)));
        } else {
          clip(`pg${i}`, "scene", a, dur, svg(`
            <line class="dzL2" x1="380" y1="420" x2="620" y2="420"/>
            <g class="dzN n1"><circle cx="230" cy="420" r="150"/><rect class="chip" x="195" y="350" width="70" height="60" rx="10"/><text x="230" y="480" text-anchor="middle">IA en la</text><text x="230" y="515" text-anchor="middle">máquina</text></g>
            <g class="dzN n2"><circle cx="770" cy="420" r="150"/><text x="770" y="410" text-anchor="middle">IA en el</text><text x="770" y="450" text-anchor="middle">Control Center</text></g>
            ${[0, 1, 2, 3, 4, 5].map((k) => `<circle class="dzP" id="dq${i}-${k}" cx="380" cy="420" r="10"/>`).join("")}
            <text class="dzH" x="500" y="700" text-anchor="middle">Juntas, para que te anticipes</text>`));
          at(`#pg${i} .n1`, { opacity: 0, x: -60 }, { opacity: 1, x: 0, duration: 0.5, ease: "power3.out" }, a + 0.2);
          at(`#pg${i} .n2`, { opacity: 0, x: 60 }, { opacity: 1, x: 0, duration: 0.5, ease: "power3.out" }, a + 0.5);
          for (let k = 0; k < 6; k++) { const ida = k % 2 === 0; at(`#dq${i}-${k}`, { attr: { cx: ida ? 380 : 620 }, opacity: 1 }, { attr: { cx: ida ? 620 : 380 }, opacity: 1, duration: 0.8, ease: "none" }, a + 0.9 + k * 0.45); to(`#dq${i}-${k}`, { opacity: 0, duration: 0.1 }, a + 1.7 + k * 0.45); }
          at(`#pg${i} .dzH`, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.4 }, a + 1.4);
        }
      } else if (c.grafico === "escenarios") {
        const fotos = ["p-heroe", "p-medio", "p-inyectoras-2"];
        const barras = [[0.92, 0.6, 0.45], [0.8, 0.85, 0.75], [0.55, 0.7, 0.95]];
        const metas = c.metas || ["A tiempo", "Ocupación", "Ahorro de energía"];
        const elegido = c.elegido ?? 1;
        clip(`pg${i}`, "scene", a, dur, `<div class="esc3 ${HORIZ ? "h" : ""}" style="left:${PX}px;width:${PW}px;top:${top}px;height:${PH}px">${fotos.map((f, k) => `
          <div class="escC" id="ec${i}-${k}"><div class="escI"><img src="${tm(f)}" alt=""><b>Escenario ${"ABC"[k]}</b></div>
            <div class="escB">${metas.map((m, j) => `<p><span>${m}</span><i><em style="width:${Math.round(barras[k][j] * 100)}%"></em></i></p>`).join("")}</div>
            ${k === elegido ? `<div class="escY">Tú eliges</div>` : ""}</div>`).join("")}</div>${lab}`, 6 + i * 2);
        at(`#pg${i} .escC`, { opacity: 0, y: 60 }, { opacity: 1, y: 0, duration: 0.45, stagger: 0.18, ease: "power3.out" }, a);
        at(`#pg${i} .escB em`, { scaleX: 0, transformOrigin: "0% 50%" }, { scaleX: 1, duration: 0.6, stagger: 0.05, ease: "power2.out" }, a + 0.5);
        const tY = fases[0] ?? a + dur * 0.55;
        to(`#pg${i} .escC:not(#ec${i}-${elegido})`, { opacity: 0.35, duration: 0.4 }, tY);
        at(`#ec${i}-${elegido}`, { boxShadow: "0 0 0 0px #4ea7ff" }, { boxShadow: "0 0 0 4px #4ea7ff", scale: 1.03, duration: 0.35, ease: "back.out(2)" }, tY);
        at(`#ec${i}-${elegido} .escY`, { opacity: 0, scale: 1.4 }, { opacity: 1, scale: 1, duration: 0.35, ease: "back.out(2)" }, tY + 0.1);
      }
      at(`#pg${i} .clab`, { opacity: 0, x: -40 }, { opacity: 1, x: 0, duration: 0.4, ease: "power3.out" }, a + 0.2);
      if (i + 1 < so.clips.length) to(`#pg${i} .clab`, { opacity: 0, duration: 0.2 }, b - 0.4);
      to(`#pg${i} > div`, { opacity: 0, duration: 0.3 }, b - 0.3);
      sfx(`pg${i}`, "click-soft.mp3", a, 0.2);
    };
    so.clips.forEach((c, i) => {
      const a = tiempos_[i] - 0.25, b = (i + 1 < tiempos_.length ? tiempos_[i + 1] : tG) + 0.15;
      const dur = b - a;
      if (c.grafico) return grafico(c, i, a, b, dur);
      const rel = `assets/clips/${VIDEO}-c${i}${HORIZ ? "-h" : ""}.mp4`;
      const [cx, cy, cw, ch] = c.crop || [158, 72, 1604, 904];
      const PW = HORIZ ? 960 : 1000, PX = HORIZ ? 880 : 40;
      const h = Math.round((PW * ch) / cw / 2) * 2;
      // Las tomas salen de la demo de plásticos: ocultar.py difumina sus palabras propias (molde, inyectora…).
      const ocultar = so.ocultar !== false && c.ocultar !== false;
      const fuente = c.fuente || so.fuente;
      const clave = `${fuente}|${c.ss}|${dur.toFixed(2)}|${cx},${cy},${cw},${ch}|${PW}${ocultar ? "|ocultar1" : ""}${c.congelar ? "|congelar" : ""}`;
      if (!fs.existsSync(T(rel)) || JSON.parse(fs.readFileSync(T(rel + ".json"), "utf8") || "{}").k !== clave) {
        if (ocultar) sh("python3", [T("ocultar.py"), fuente, String(c.ss), (dur + 0.2).toFixed(2), `${cx},${cy},${cw},${ch}`, String(PW), T(rel), ...(c.congelar ? ["congelar"] : [])]);
        else sh("ffmpeg", ["-y", "-v", "error", "-ss", String(c.ss), "-t", (dur + 0.2).toFixed(2), "-i", fuente, "-vf", `crop=${cw}:${ch}:${cx}:${cy},scale=${PW}:${h}:flags=lanczos,fps=${FPS},format=yuv420p`, "-an", "-c:v", "libx264", "-crf", "14", "-preset", "slow", T(rel)]);
        fs.writeFileSync(T(rel + ".json"), JSON.stringify({ k: clave }));
      }
      const top = HORIZ ? Math.max(90, Math.round((880 - h) / 2)) : h > 700 ? 430 : 560;
      clip(`pc${i}`, "scene", a, dur, `<div class="pframe" style="left:${PX}px;width:${PW}px;top:${top}px;height:${h}px"></div><p class="clab" style="top:${HORIZ ? 380 : top + h + 40}px">${c.label}</p>`, 6 + i * 2);
      video(`pv${i}`, "pvid", rel, a, dur, 7 + i * 2);
      html.push(`<style>#pv${i}{left:${PX}px;top:${top}px;width:${PW}px;height:${h}px}</style>`);
      if (c.tapar || c.marca) {
        const k = PW / cw;
        clip(`pt${i}`, "scene", a, dur, `${(c.tapar || []).map((t) => `<div class="tapa ${t.cls || ""}" style="left:${PX + Math.round(t.x * k)}px;top:${top + Math.round(t.y * k)}px;width:${Math.round(t.w * k)}px;height:${Math.round(t.h * k)}px">${t.html || ""}</div>`).join("")}${c.marca ? `<div class="marcaN" style="top:${top - 90}px;${HORIZ ? `left:${PX}px;width:${PW}px;right:auto;text-align:center` : ""}">${c.marca}</div>` : ""}`, 41 + i);
        at(`#pt${i} .marcaN`, { opacity: 0, scale: 1.3 }, { opacity: 1, scale: 1, duration: 0.35, ease: "back.out(2)" }, a + 0.8);
      }
      at(`#pc${i} .pframe`, { opacity: 0, scale: 0.92 }, { opacity: 1, scale: 1, duration: 0.35, ease: "power3.out" }, a);
      at(`#pv${i}`, { opacity: 0, clipPath: "inset(0% 0% 0% 100% round 18px)" }, { opacity: 1, clipPath: "inset(0% 0% 0% 0% round 18px)", duration: 0.45, ease: "power3.inOut" }, a);
      at(`#pc${i} .clab`, { opacity: 0, x: -40 }, { opacity: 1, x: 0, duration: 0.4, ease: "power3.out" }, a + 0.2);
      if (i + 1 < so.clips.length) to(`#pc${i} .clab`, { opacity: 0, duration: 0.2 }, b - 0.4);
      if (c.zoom) at(`#pv${i}`, { scale: 1 }, { scale: c.zoom, transformOrigin: c.origen || "50% 50%", duration: dur, ease: "sine.inOut" }, a);
      sfx(`pc${i}`, "click-soft.mp3", a, 0.2);
    });
    // Y el gemelo muestra la planta con ese plan.
    video("s-lapso", "bleedv", clipH("assets/clips/lapso.mp4"), tG - 0.3, fin - tG + 0.3, 30);
    html.push(`<style>#s-lapso{width:${W}px;height:${H}px;object-fit:cover}</style>`);
    clip("s-g3d", "scene", tG - 0.3, fin - tG + 0.3, `<div class="tag3d" style="top:${HORIZ ? 80 : 300}px"><i></i>GEMELO DIGITAL 3D · CON TU PLAN</div>`, 31);
    at("#s-lapso", { opacity: 0, scale: 1.15 }, { opacity: 1, scale: 1.02, duration: 0.8, ease: "power2.out" }, tG - 0.3);
    at("#s-g3d .tag3d", { opacity: 0, x: -40 }, { opacity: 1, x: 0, duration: 0.5, ease: "back.out(2)" }, tG);
    sfx("s0", "whoosh.wav", s, 0.25); sfx("sg", "whoosh-short.mp3", tG - 0.3, 0.25);
    leave("e-sol", fin);
  }

  // 4. Heptágono: el núcleo y los siete módulos, con el del video encendido.
  {
    const x = S.modulos; const [s, d] = span(x);
    const n = V.modulo;
    const C = HORIZ ? { x: 960, y: 560 } : { x: 540, y: 930 }, RX = HORIZ ? 620 : 365, RY = HORIZ ? 310 : 470, MW = 310;
    const P = MOD.map((_, i) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / 7; return { x: Math.round(C.x + RX * Math.cos(a)), y: Math.round(C.y + RY * Math.sin(a)) }; });
    const titulo = n === 0 ? "Un núcleo. Siete módulos." : `Módulo ${n} de 7`;
    clip("e-mod", "scene", s, d, `
      <h2 class="hx">${words(titulo)}</h2>
      <p class="hx2">${n === 0 ? "Activas solo los que necesitas" : MOD[n - 1][0]}</p>
      <svg class="hepta" viewBox="0 0 ${W} ${H}"><polygon id="hx-borde" points="${P.map((v) => `${v.x},${v.y}`).join(" ")}" pathLength="1"/>${P.map((v, i) => `<line id="hx-r${i}" x1="${C.x}" y1="${C.y}" x2="${v.x}" y2="${v.y}" pathLength="1"/>`).join("")}</svg>
      <div class="hcore" style="left:${C.x - 145}px;top:${C.y - 145}px"><img src="assets/clips/marca.png" alt=""><b>Arvantti</b><span>Digital Twin</span><small>Gemelo 3D · núcleo</small></div>
      ${MOD.map(([nm, sub], i) => `<div class="mod" id="md${i}" style="left:${P[i].x - MW / 2}px;top:${P[i].y - 52}px"><i>${i + 1}</i><p>${nm}</p><small>${sub}</small></div>`).join("")}`, 3);
    enter("e-mod", s);
    at("#e-mod .hx .w", { opacity: 0, y: 30, filter: "blur(10px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.5, stagger: 0.1, ease: "power3.out" }, x.voiceAt - 0.1);
    at("#e-mod .hcore", { opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1, duration: 0.7, ease: "back.out(1.7)" }, s + 0.2);
    at("#hx-borde", { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 1.0, ease: "power2.inOut" }, s + 0.3);
    const tMods = n === 0 ? enPalabra(x, "siete módulos") : s + 0.4;
    MOD.forEach((_, i) => {
      at(`#md${i}`, { opacity: 0, scale: 0.6, y: 20 }, { opacity: 1, scale: 1, y: 0, duration: 0.4, ease: "back.out(2)" }, tMods + i * 0.12);
      at(`#hx-r${i}`, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.4, ease: "power2.out" }, tMods + i * 0.12);
    });
    if (n === 0) {
      const tN = enPalabra(x, "núcleo");
      tl.push(`tl.to("#e-mod .hcore",{boxShadow:"0 0 0 4px #4ea7ff, 0 0 140px #2d7ff9cc",scale:1.12,duration:.5,yoyo:true,repeat:1},${tN.toFixed(2)});`);
      const tS = enPalabra(x, "solo los que");
      at("#e-mod .hx2", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.5 }, tS);
      [1, 2, 3].forEach((i, k) => { tl.push(`tl.to("#md${i}",{borderColor:"#4ea7ff",background:"#12305a",boxShadow:"0 0 0 2px #4ea7ff, 0 0 60px #2d7ff988",duration:.4},${(tS + 0.2 + k * 0.2).toFixed(2)});`); });
      [0, 4, 5, 6].forEach((i) => to(`#md${i} > *`, { opacity: 0.35, duration: 0.5 }, tS + 0.2));
    } else {
      const k = n - 1, tOn = Math.max(s + 1.3, x.voiceAt + 0.6);
      at("#e-mod .hx2", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.5 }, tOn);
      tl.push(`tl.to("#md${k}",{borderColor:"#4ea7ff",background:"#12305a",scale:1.15,boxShadow:"0 0 0 3px #4ea7ff, 0 0 80px #2d7ff9cc",duration:.5},${tOn.toFixed(2)});`);
      to(`#hx-r${k}`, { stroke: "#4ea7ff", strokeWidth: 6, duration: 0.4 }, tOn);
      MOD.forEach((_, i) => { if (i !== k) { to(`#md${i} > *`, { opacity: 0.3, duration: 0.5 }, tOn); to(`#hx-r${i}`, { opacity: 0.15, duration: 0.5 }, tOn); } });
      sfx("mo", "pop.mp3", tOn, 0.3);
    }
    sfx("m0", "whoosh-short.mp3", s, 0.25);
    leave("e-mod", s + d);
  }

  // 5. Cierre: llamado a la acción y firma.
  {
    const x = S.cierre, c = E.cierre; const [s, d] = span(x);
    const tA = enPalabra(x, "Arvantti"), tD = enPalabra(x, "Decide");
    clip("e-cierre", "scene", s, d, `
      <div class="bleed" id="c-bg"><img src="${tm("p-heroe")}" alt=""></div>
      <div class="cta">${c.cta}</div>
      <div class="fin"><img class="marca" src="assets/clips/marca.png" alt=""><h1>Arvantti <span>Digital Twin</span></h1><p class="firma">Decide antes de que pase.</p><p class="url">digitaltwin.arvantti.online</p>${c.sigue ? `<div><p class="sigue">${c.sigue}</p></div>` : ""}</div>`, 3);
    enter("e-cierre", s);
    at("#c-bg", { opacity: 0, scale: 1.0 }, { opacity: 0.9, scale: 1.08, duration: 1.0, ease: "power2.out" }, s);
    to("#c-bg", { scale: 1.16, duration: Math.max(1, tA - s - 1), ease: "none" }, s + 1);
    to("#c-bg", { opacity: 0.12, duration: 0.8, ease: "power2.inOut" }, tA - 0.6);
    at("#e-cierre .cta", { opacity: 0, y: 40, scale: 0.95 }, { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: "back.out(1.6)" }, x.voiceAt);
    at("#e-cierre .marca", { opacity: 0, scale: 0.5, rotate: -8 }, { opacity: 1, scale: 1, rotate: 0, duration: 0.8, ease: "back.out(1.6)" }, tA - 0.3);
    at("#e-cierre h1", { opacity: 0, scale: 1.25, filter: "blur(10px)" }, { opacity: 1, scale: 1, filter: "blur(0px)", duration: 1.0, ease: "power3.out" }, tA);
    at("#e-cierre h1", { backgroundPosition: "-200% 0" }, { backgroundPosition: "200% 0", duration: 2, ease: "power1.inOut" }, tA + 1);
    at("#e-cierre .firma", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, tD);
    at("#e-cierre .url", { opacity: 0 }, { opacity: 1, duration: 0.6 }, tD + 0.8);
    if (c.sigue) at("#e-cierre .sigue", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, tD + 1.4);
    to("#e-cierre .fin, #e-cierre .cta", { opacity: 0, duration: 0.8 }, s + d - 0.8);
    sfx("c0", "hit.wav", tA, 0.25);
  }

  [S.dolor, S.solucion, S.modulos, S.cierre].forEach((x) => sweep(x.start));

  // Subtítulos quemados (todas las escenas menos el gancho, que ya tiene la frase grande en pantalla).
  let nSub = 0;
  escenas.filter((x) => x.id !== "gancho").forEach((x) => {
    const fs_ = frases(palabras(x));
    fs_.forEach((f, k) => {
      const a = f[0].t - 0.05;
      const sig = fs_[k + 1] ? fs_[k + 1][0].t - 0.05 : Infinity;
      const b = Math.min(f[f.length - 1].f + 0.15, x.voiceAt + x.voz + 0.3, sig);
      const id = `sub${nSub++}`;
      clip(id, "sub", a, Math.max(0.3, b - a), `<p>${f.map((p) => `<span class="w">${p.w}</span>`).join(" ")}</p>`, 50);
      at(`#${id} p`, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.12, ease: "power2.out" }, a);
      f.forEach((p, k) => tl.push(`tl.to("#${id} .w:nth-child(${k + 1})",{color:"#4ea7ff",duration:.05},${p.t.toFixed(2)});tl.to("#${id} .w:nth-child(${k + 1})",{color:"#ffffff",duration:.05},${Math.max(p.t + 0.06, p.f - 0.02).toFixed(2)});`));
    });
  });

  escenas.forEach((x) => { if (x.real) audio(`voz-${x.id}`, relVoz(x), x.voiceAt, x.voz, 1); });
  const mez = mezclaMusica(escenas, total);
  if (mez) audio("musica", mez, 0, total, fs.existsSync(T("assets/clips/musica-serie.mp3")) ? 0.5 : 0.22);
  if (temporal) html.push(`<div id="temp" class="clip" data-start="0" data-duration="${total.toFixed(2)}" data-track-index="90">SIN VOZ · TIEMPOS ESTIMADOS</div>`);

  let base = fs.readFileSync(T("plantilla.tpl"), "utf8");
  if (HORIZ) base = base.replaceAll("width:1080px;height:1920px", "width:1920px;height:1080px").replace('data-width="1080" data-height="1920"', 'data-width="1920" data-height="1080"').replace('data-resolution="portrait"', 'data-resolution="landscape"').replace("width=1080, height=1920", "width=1920, height=1080").replace("</style>", `${fs.readFileSync(T("plantilla-h.css"), "utf8")}\n</style>`);
  const out = base
    .replaceAll("{{TOTAL}}", total.toFixed(2))
    .replace("{{CLIPS}}", html.join("\n"))
    .replace("{{TIMELINE}}", tl.join("\n"));
  fs.writeFileSync(T("index.html"), out);
  fs.writeFileSync(vdir("tiempos.json"), JSON.stringify(escenas.map(({ id, start, voiceAt, voz, dur, real }) => ({ id, start: +start.toFixed(2), voiceAt: +voiceAt.toFixed(2), voz: +voz.toFixed(2), dur: +dur.toFixed(2), real })), null, 1));
  console.log(`index.html (${VIDEO}): ${total.toFixed(1)} s${temporal ? " (tiempos estimados, falta voz)" : ""}`);
}

function render(v = "v001") {
  fs.mkdirSync(T("out"), { recursive: true });
  const out = T(`out/${cfg().salida}${HORIZ ? "-h" : ""}-${v}.mp4`);
  execFileSync("pnpm", ["dlx", "hyperframes@0.9.9", "render", "-o", out, "--fps", String(FPS), "--quality", process.env.QUALITY || "high", "--video-frame-format", "png", ...(process.env.HF_ARGS ? process.env.HF_ARGS.split(" ") : [])], { cwd: HERE, stdio: "inherit" });
  console.log(out);
}

const [cmd, arg] = process.argv.slice(2);
const cmds = { preparar, voz, musica, componer, render: () => render(arg), tiempos: () => console.log(tiempos()) };
if (!cmds[cmd]) {
  console.log("Uso: [VIDEO=<id>] node armar.mjs preparar | musica [--enviar] | voz [--enviar] | componer | render [vNNN] | tiempos");
  process.exit(1);
}
await cmds[cmd]();
