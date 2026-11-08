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
const FPS = 25, W = 1080, H = 1920;
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
  const tomas = T("assets/tomas"), clips = T("assets/clips");
  fs.mkdirSync(clips, { recursive: true });
  // Vuelo de cámara: un cuadro por cuadro del video.
  sh("ffmpeg", ["-y", "-v", "error", "-framerate", String(FPS), "-i", path.join(tomas, "vuelo/f%03d.png"), "-vf", "format=yuv420p", "-c:v", "libx264", "-crf", "16", "-preset", "slow", path.join(clips, "vuelo.mp4")]);
  // Lapso del play: una foto cada 15 min de planta, con fundido entre fotos.
  const n = fs.readdirSync(path.join(tomas, "lapso")).filter((f) => f.endsWith(".png")).length;
  const fl = (n / 12).toFixed(2); // unos 12 s de lapso
  sh("ffmpeg", ["-y", "-v", "error", "-framerate", fl, "-i", path.join(tomas, "lapso/f%03d.png"), "-vf", `fps=${FPS},tmix=frames=3:weights='1 2 1',format=yuv420p`, "-c:v", "libx264", "-crf", "16", "-preset", "slow", path.join(clips, "lapso.mp4")]);
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
    video("g-vuelo", "bleedv", "assets/clips/vuelo.mp4", 0, d, 1);
    html.push(`<style>#g-vuelo{width:1080px;height:1920px;object-fit:cover}</style>`);
    const ventanas = (g.ventanas || []).map((n, i) => {
      const colores = { Excel: "#1f7a43", ERP: "#2d5fa8", Correo: "#c4473b", WhatsApp: "#1f9e55", Cuaderno: "#8a6d3b" };
      const cuerpo = n === "Excel" ? `<div class="grid">${"<span></span>".repeat(20)}</div>` : n === "WhatsApp" ? "Línea 2 parada desde las 6<br>¿Quién avisó a mantenimiento?" : n === "Correo" ? "RE: RE: pedido urgente<br>Adjunto versión final (3)" : n === "ERP" ? "PED-1184 · 2.400 und<br>Entrega: viernes" : "Turno noche:<br>molde 7 cambiado";
      const pos = [[60, 700], [610, 770], [90, 1000], [580, 1080], [320, 1250]][i];
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
      g.ventanas.forEach((_, i) => to(`#win${i}`, { left: 340, top: 775, scale: 0.05, opacity: 0, rotate: 0, duration: 0.7, ease: "power3.in" }, tJ + i * 0.05));
      at("#e-gancho .flash", { opacity: 0, scale: 0.2 }, { opacity: 1, scale: 6, duration: 0.35, ease: "power2.out" }, tJ + 0.75);
      to("#e-gancho .flash", { opacity: 0, duration: 0.5 }, tJ + 1.1);
      sfx("gj", "whoosh-short.mp3", tJ, 0.3);
    }
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
      clip("d-intro", "scene", s, tarjetas[0] - s + 0.2, `<div class="bleed dim"><img src="assets/tomas/p-heroe.png" alt=""></div><div class="repetir"><p>Copiar.</p><p>Pegar.</p><p>Repetir.</p></div>`, 3);
      enter("d-intro", s);
      const span0 = tarjetas[0] - x.voiceAt;
      [0, 1, 2].forEach((k) => at(`#d-intro .repetir p:nth-child(${k + 1})`, { opacity: 0, x: -60 }, { opacity: 1, x: 0, duration: 0.4, ease: "power3.out" }, x.voiceAt + 0.2 + (k * span0) / 3.2));
      sfx("d0", "typing.mp3", x.voiceAt, 0.15);
    }
    dl.items.forEach(([ind, frase, img], k) => {
      const a = k === 0 && !dl.saltarPrimero ? s : tarjetas[k] - 0.15;
      const b = k + 1 < tarjetas.length ? tarjetas[k + 1] + 0.15 : fin;
      const id = `ind${k}`;
      clip(id, "scene ind", a, b - a, `<div class="bleed"><img src="assets/tomas/${img}.png" alt=""></div><div class="shade fuerte"></div>
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
    const tPl = enPalabra(x, "plásticos"), tB = enPalabra(x, "bodega"), tSa = enPalabra(x, "salsas"), tR = enPalabra(x, "red de servicios");
    video("s-lapso", "bleedv", "assets/clips/lapso.mp4", s, tPl - s + 0.6, 3);
    html.push(`<style>#s-lapso{width:1080px;height:1920px;object-fit:cover}</style>`);
    const cuts = [["c-m", "p-inyectoras-2", tM, tL, "Máquinas"], ["c-l", "p-medio", tL, tP, "Líneas"], ["c-p", "p-personas", tP, tI, "Personas"], ["c-i", "p-silos", tI, tY, "Inventarios"],
      ["c-pl", "p-heroe", tPl, tB, "Plásticos"], ["c-b", "logistica", tB, tSa, "Bodega"], ["c-sa", "salsas", tSa, tR, "Salsas"], ["c-r", "red", tR, s + d, "Red de servicios"]];
    clip("e-sol", "scene", s, d, `
      ${cuts.map(([id, img]) => `<div class="bleed cut" id="${id}"><img src="assets/tomas/${img}.png" alt=""></div>`).join("")}
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
    const SYS = [["ERP", "Ventas, compras e inventario", 70, 380], ["CRM", "Clientes y ventas", 590, 560], ["SCADA", "Vigila y controla las máquinas", 70, 740]];
    const ancla = (i) => [SYS[i][2] + 210, SYS[i][3] + 150];
    const core = [540, 1160];
    const lin = SYS.map((_, i) => { const [ax, ay] = ancla(i); return `<line class="ok" id="ok${i}" x1="${ax}" y1="${ay}" x2="${core[0]}" y2="${core[1] - 150}" pathLength="1"/><circle class="pk" id="pk${i}" r="9" cx="${ax}" cy="${ay}"/>`; }).join("");
    const rotas = `<line id="rt0" x1="${ancla(0)[0] + 60}" y1="${ancla(0)[1] - 40}" x2="${ancla(1)[0] - 120}" y2="${ancla(1)[1] - 90}"/><line id="rt1" x1="${ancla(1)[0] - 120}" y1="${ancla(1)[1] + 40}" x2="${ancla(2)[0] + 60}" y2="${ancla(2)[1] - 60}"/><line id="rt2" x1="${ancla(0)[0] - 60}" y1="${ancla(0)[1]}" x2="${ancla(2)[0] - 60}" y2="${ancla(2)[1] - 140}"/>`;
    clip("e-sol", "scene", s, d, `
      <div class="bleed dim"><img src="assets/tomas/p-heroe.png" alt=""></div>
      <div class="top">${kick("", V.kicker)}</div>
      <svg class="net" viewBox="0 0 ${W} ${H}">${rotas}${lin}</svg>
      ${SYS.map(([n, sub, l, t], i) => `<div class="sys" id="sy${i}" style="left:${l}px;top:${t}px"><b>${n}</b><small>${sub}</small></div>`).join("")}
      <div class="cross" style="left:470px;top:470px" id="x0">✕</div><div class="cross" style="left:500px;top:780px" id="x1">✕</div>
      <div class="core"><img src="assets/clips/marca.png" alt=""><span>Digital Twin</span></div>
      <div class="stage3d"><div class="device" id="dv"><div class="shot" id="dv-s0"><img src="assets/tomas/ui-aps-pedidos.png" alt=""></div><div class="shot" id="dv-s1"><img src="assets/tomas/ui-aps-gantt.png" alt=""></div><div class="shot" id="dv-s2"><img src="assets/tomas/p-inyectoras-2.png" alt="" style="width:1000px;height:1778px;object-position:50% 40%;top:-500px"></div><div class="edge" id="dv-edge"></div></div></div>
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

  // 4. Heptágono: el núcleo y los siete módulos, con el del video encendido.
  {
    const x = S.modulos; const [s, d] = span(x);
    const n = V.modulo;
    const C = { x: 540, y: 930 }, RX = 365, RY = 470, MW = 310;
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
      <div class="cta">${c.cta}</div>
      <div class="fin"><img class="marca" src="assets/clips/marca.png" alt=""><h1>Arvantti <span>Digital Twin</span></h1><p class="firma">Decide antes de que pase.</p><p class="url">digitaltwin.arvantti.online</p></div>`, 3);
    enter("e-cierre", s);
    at("#e-cierre .cta", { opacity: 0, y: 40, scale: 0.95 }, { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: "back.out(1.6)" }, x.voiceAt);
    at("#e-cierre .marca", { opacity: 0, scale: 0.5, rotate: -8 }, { opacity: 1, scale: 1, rotate: 0, duration: 0.8, ease: "back.out(1.6)" }, tA - 0.3);
    at("#e-cierre h1", { opacity: 0, scale: 1.25, filter: "blur(10px)" }, { opacity: 1, scale: 1, filter: "blur(0px)", duration: 1.0, ease: "power3.out" }, tA);
    at("#e-cierre h1", { backgroundPosition: "-200% 0" }, { backgroundPosition: "200% 0", duration: 2, ease: "power1.inOut" }, tA + 1);
    at("#e-cierre .firma", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, tD);
    at("#e-cierre .url", { opacity: 0 }, { opacity: 1, duration: 0.6 }, tD + 0.8);
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

  const out = fs.readFileSync(T("plantilla.tpl"), "utf8")
    .replaceAll("{{TOTAL}}", total.toFixed(2))
    .replace("{{CLIPS}}", html.join("\n"))
    .replace("{{TIMELINE}}", tl.join("\n"));
  fs.writeFileSync(T("index.html"), out);
  fs.writeFileSync(vdir("tiempos.json"), JSON.stringify(escenas.map(({ id, start, voiceAt, voz, dur, real }) => ({ id, start: +start.toFixed(2), voiceAt: +voiceAt.toFixed(2), voz: +voz.toFixed(2), dur: +dur.toFixed(2), real })), null, 1));
  console.log(`index.html (${VIDEO}): ${total.toFixed(1)} s${temporal ? " (tiempos estimados, falta voz)" : ""}`);
}

function render(v = "v001") {
  fs.mkdirSync(T("out"), { recursive: true });
  const out = T(`out/${cfg().salida}-${v}.mp4`);
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
