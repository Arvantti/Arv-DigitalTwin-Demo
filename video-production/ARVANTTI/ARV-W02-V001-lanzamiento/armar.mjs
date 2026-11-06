#!/usr/bin/env node
/**
 * Video de lanzamiento de Arvantti Digital Twin (1920x1080, ~2 min).
 *
 *   node tomas.cjs todo            graba las tomas en assets/tomas/ (galería y emulador corriendo)
 *   node armar.mjs preparar        lapso del play en MP4, clip del Gantt, marca del logo y música de fondo
 *   node armar.mjs componer        mide la voz de cada escena (o la estima) y escribe index.html
 *   node armar.mjs render [vNNN]   renderiza out/lanzamiento-<vNNN>.mp4
 *
 *   node armar.mjs voz [--enviar]  voz de las escenas nuevas o cambiadas (ElevenLabs con tiempos por carácter)
 *   node armar.mjs musica [--enviar]  música épica (ElevenLabs Music) en assets/clips/musica-epica.mp3
 */
import { execFileSync, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const T = (p) => path.join(HERE, p);
const FPS = 25;
// FORMATO=vertical arma la versión 9:16 (1080x1920) para redes, con la misma voz y música.
const VERT = process.env.FORMATO === "vertical";
const W = VERT ? 1080 : 1920, H = VERT ? 1920 : 1080;
const sh = (cmd, args) => execFileSync(cmd, args, { stdio: "inherit" });

// Escenas en orden: id, carpeta de la voz y colas (segundos antes y después de la voz).
const ESCENAS = [
  { id: "pregunta", dir: "01-pregunta", lead: 1.6, tail: 1.0 },
  { id: "titulo", dir: "02-titulo", lead: 0.4, tail: 1.6 },
  { id: "planifica", dir: "03-planifica", lead: 0.5, tail: 0.8 },
  { id: "gemelo", dir: "04-gemelo", lead: 0.4, tail: 0.9 },
  { id: "control", dir: "05-control", lead: 0.3, tail: 0.9 },
  { id: "fractal", dir: "06-fractal", lead: 0.3, tail: 1.0 },
  { id: "asistente", dir: "07-asistente", lead: 0.3, tail: 0.9 },
  { id: "conecta", dir: "08-conecta", lead: 0.3, tail: 0.9 },
  { id: "modulos", dir: "09-modulos", lead: 0.3, tail: 1.6 },
  { id: "cierre", dir: "10-cierre", lead: 1.0, tail: 5.9 },
];

const texto = (e) => fs.readFileSync(T(`escenas/${e.dir}/script.md`), "utf8").trim();
const vozDe = (e) => T(`escenas/${e.dir}/assets/audio/voiceover.mp3`);
const alineacionDe = (e) => T(`escenas/${e.dir}/assets/audio/alignment.json`);

// Nombres en inglés que la voz en español lee mal: se envían escritos como se pronuncian.
const PRONUNCIA = [["Integrator", "Íntegreitor"]];
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
const hash = (s) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 16);
function credenciales() {
  const apiKey = process.env.ELEVENLABS_API_KEY, voiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!apiKey?.trim() || !voiceId?.trim()) throw new Error("Faltan ELEVENLABS_API_KEY o ELEVENLABS_VOICE_ID en el entorno.");
  return { apiKey, voiceId };
}

/**
 * Voz de cada escena con /with-timestamps: deja voiceover.mp3 y alignment.json (inicio de cada carácter) en
 * escenas/<escena>/assets/audio/. Solo envía las escenas cuyo texto cambió. Sin --enviar, solo muestra qué enviaría.
 */
async function voz() {
  const enviar = process.argv.includes("--enviar");
  const pend = ESCENAS.filter((e) => {
    const a = alineacionDe(e);
    return !(fs.existsSync(vozDe(e)) && fs.existsSync(a) && JSON.parse(fs.readFileSync(a, "utf8")).hash === hash(`${modelo()}|${paraVoz(texto(e)).texto}`));
  });
  console.log(`Voz: ${pend.length} escenas nuevas o cambiadas, ${pend.reduce((n, e) => n + texto(e).length, 0)} caracteres (modelo ${modelo()}).`);
  if (!pend.length) return;
  if (!enviar) {
    pend.forEach((e) => console.log(`- ${e.dir}: ${texto(e)}`));
    console.log("ElevenLabs recibirá estos textos. Para enviarlos: node armar.mjs voz --enviar");
    return;
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
    if (!res.ok) throw new Error(`${e.dir}: ElevenLabs respondió HTTP ${res.status}; respuesta omitida por seguridad.`);
    const j = await res.json();
    const audio = Buffer.from(j.audio_base64, "base64");
    if (!audio.length) throw new Error(`${e.dir}: audio vacío.`);
    fs.mkdirSync(path.dirname(vozDe(e)), { recursive: true });
    fs.writeFileSync(vozDe(e), audio);
    let a = j.alignment || j.normalized_alignment;
    // Si se cambió la escritura de algún nombre, la alineación se lleva de vuelta al texto original.
    if (a && pv.texto !== txt && a.characters?.length === pv.texto.length) a = { characters: [...txt], character_start_times_seconds: pv.idx.map((k) => a.character_start_times_seconds[k]) };
    fs.writeFileSync(alineacionDe(e), `${JSON.stringify({ hash: hash(`${modelo()}|${pv.texto}`), modelo: modelo(), texto: txt, alignment: a })}\n`);
    console.log(`${e.dir}: ${duracion(vozDe(e)).toFixed(1)} s`);
  }
}

/** Música épica con ElevenLabs Music (texto en musica-prompt.txt), un poco más larga que el video. */
async function musica() {
  const out = T("assets/clips/musica-epica.mp3");
  if (fs.existsSync(out)) return console.log("Ya existe assets/clips/musica-epica.mp3.");
  const prompt = fs.readFileSync(T("musica-prompt.txt"), "utf8").trim();
  const ms = Math.round((Math.ceil(tiempos().total) + 1) * 1000);
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
  console.log(`musica-epica.mp3: ${duracion(out).toFixed(1)} s`);
}
function duracion(f) {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f], { encoding: "utf8" });
  return Number(r.stdout.trim());
}

/** Tiempos de cada escena: con la voz real si existe; si no, estimados (2,5 palabras por segundo). */
function tiempos() {
  let t = 0;
  let temporal = false;
  const out = ESCENAS.map((e) => {
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

/** Silencios internos de una voz (fin de cada pausa), con ffmpeg silencedetect. */
function pausas(f) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", f, "-af", "silencedetect=noise=-38dB:d=0.18", "-f", "null", "-"], { encoding: "utf8" });
  return [...r.stderr.matchAll(/silence_end: ([0-9.]+)/g)].map((m) => Number(m[1]));
}

/**
 * Segundo (absoluto) en que la voz llega a una palabra. Con voz real, cada frase empieza al final de la pausa que la
 * precede (si las pausas cuadran con las frases); dentro de la frase, proporcional a los caracteres.
 */
function enPalabra(x, frag) {
  const i = x.txt.indexOf(frag);
  if (i < 0) throw new Error(`"${frag}" no está en ${x.id}`);
  // Con la alineación de ElevenLabs, el segundo exacto en que empieza la palabra.
  if (x.real && fs.existsSync(alineacionDe(x))) {
    const j = JSON.parse(fs.readFileSync(alineacionDe(x), "utf8"));
    const a = j.alignment;
    if (j.texto === x.txt && a?.character_start_times_seconds?.length === x.txt.length) return +(x.voiceAt + a.character_start_times_seconds[i]).toFixed(2);
  }
  const cortes = [0];
  for (const m of x.txt.matchAll(/[.?!:]\s+/g)) cortes.push(m.index + m[0].length);
  if (x.real) {
    const p = pausas(vozDe(x)).filter((t) => t > 0.3 && t < x.voz - 0.3);
    if (p.length === cortes.length - 1) {
      const k = cortes.filter((c) => c <= i).length - 1;
      const a = k === 0 ? 0 : p[k - 1];
      const b = k + 1 < cortes.length ? p[k] - 0.35 : x.voz;
      const fin = k + 1 < cortes.length ? cortes[k + 1] : x.txt.length;
      return +(x.voiceAt + a + ((i - cortes[k]) / (fin - cortes[k])) * (b - a)).toFixed(2);
    }
  }
  return +(x.voiceAt + (i / x.txt.length) * x.voz).toFixed(2);
}

// Recorta el símbolo del logo y vuelve transparente el fondo oscuro (alfa según el brillo).
const MARCA = `import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert("RGB").crop((560, 150, 980, 500))
out = Image.new("RGBA", im.size)
out.putdata([(r, g, b, max(0, min(255, int((max(r, g, b) - 40) * 255 / 70)))) for r, g, b in im.getdata()])
out.save(sys.argv[2])`;

function preparar() {
  const tomas = T("assets/tomas");
  const clips = T("assets/clips");
  fs.mkdirSync(clips, { recursive: true });
  // Lapso del play: 1 foto cada 15 min de planta, unos 6 s de video con fundido entre fotos.
  const nLapso = fs.readdirSync(path.join(tomas, "lapso")).filter((f) => f.endsWith(".png")).length;
  const fpsLapso = String(Math.max(5, Math.min(10, Math.round(nLapso / 6))));
  sh("ffmpeg", ["-y", "-v", "error", "-framerate", fpsLapso, "-i", path.join(tomas, "lapso/f%03d.png"), "-vf", `fps=${FPS},tmix=frames=3:weights='1 2 1',format=yuv420p`, "-c:v", "libx264", "-crf", "17", "-preset", "slow", path.join(clips, "lapso.mp4")]);
  // Clip del Gantt: se quitan los primeros segundos de carga.
  const meta = JSON.parse(fs.readFileSync(path.join(tomas, "clip-gantt-arrastrar.json"), "utf8"));
  const total = duracion(path.join(tomas, "clip-gantt-arrastrar.webm"));
  sh("ffmpeg", ["-y", "-v", "error", "-ss", String(Math.max(0, total - meta.desde_final - 0.3)), "-i", path.join(tomas, "clip-gantt-arrastrar.webm"), "-an", "-vf", `fps=${FPS},format=yuv420p`, "-c:v", "libx264", "-crf", "17", path.join(clips, "gantt-arrastrar.mp4")]);
  // Marca del logo (solo el símbolo), con el fondo vuelto transparente por luminancia.
  sh("python3", ["-I", "-c", MARCA, T("assets/shared/arvantti/branding/ArvanttiLabsLogo.png"), path.join(clips, "marca.png")]);
  // Música de fondo: acorde suave que respira, con un pulso grave (sintetizada, sin licencia de terceros).
  const { total: dur } = tiempos();
  const d = Math.ceil(dur) + 2;
  const pad = "0.10*sin(2*PI*110*t)+0.07*sin(2*PI*164.81*t)+0.06*sin(2*PI*220*t)+0.05*sin(2*PI*277.18*t)+0.035*sin(2*PI*329.63*t)";
  const expr = `(${pad})*(0.75+0.25*sin(2*PI*t/8))+0.06*sin(2*PI*55*t)*exp(-mod(t,2)*3)`;
  sh("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", `aevalsrc='${expr}|${expr}':s=48000:d=${d}`, "-af", `lowpass=f=1800,aecho=0.8:0.7:400|700:0.25|0.18,afade=t=in:d=3,afade=t=out:st=${d - 4}:d=4,volume=0.9`, "-c:a", "libmp3lame", "-q:a", "2", path.join(clips, "musica.mp3")]);
  console.log("listo: assets/clips/");
}

/**
 * Música épica (ElevenLabs Music, assets/clips/musica-epica.mp3): baja sola cuando habla la voz (sidechain) y se ajusta
 * a la duración del video. Deja assets/clips/musica-mezcla.mp3.
 */
function mezclaMusica(escenas, total) {
  const src = T("assets/clips/musica-epica.mp3");
  if (!fs.existsSync(src)) return null;
  const voces = escenas.filter((x) => x.real);
  const args = ["-y", "-v", "error", "-i", src];
  voces.forEach((x) => args.push("-i", vozDe(x)));
  const del = voces.map((x, i) => `[${i + 1}:a]adelay=${Math.round(x.voiceAt * 1000)}:all=1,aformat=sample_rates=48000:channel_layouts=stereo[v${i}]`).join(";");
  // Si la música dura casi lo mismo que el video, termina sola (con su golpe final); si no, se funde al final.
  const fade = duracion(src) > total + 0.5 ? Math.max(0, total - 3) : total + 10;
  const f = `${del};${voces.map((_, i) => `[v${i}]`).join("")}amix=inputs=${voces.length}:normalize=0,apad=whole_dur=${total.toFixed(2)}[vz];` +
    `[0:a]aformat=sample_rates=48000:channel_layouts=stereo,apad,atrim=0:${total.toFixed(2)},afade=t=out:st=${fade.toFixed(2)}:d=3[m];` +
    `[m][vz]sidechaincompress=threshold=0.03:ratio=8:attack=40:release=600:makeup=1[out]`;
  args.push("-filter_complex", f, "-map", "[out]", "-c:a", "libmp3lame", "-q:a", "2", T("assets/clips/musica-mezcla.mp3"));
  execFileSync("ffmpeg", args, { stdio: "inherit" });
  return "assets/clips/musica-mezcla.mp3";
}

// ---------------------------------------------------------------- composición
const words = (s, cls = "w") => s.split(" ").map((w) => `<span class="${cls}">${w}</span>`).join(" ");

function componer() {
  const { escenas, total, temporal } = tiempos();
  const S = Object.fromEntries(escenas.map((x) => [x.id, x]));
  const html = [];
  const tl = [];
  const at = (sel, from, to, t) => tl.push(`tl.fromTo(${JSON.stringify(sel)},${JSON.stringify(from)},${JSON.stringify({ ...to })},${(+t).toFixed(2)});`);
  const to = (sel, v, t) => tl.push(`tl.to(${JSON.stringify(sel)},${JSON.stringify(v)},${(+t).toFixed(2)});`);
  const clip = (id, cls, start, dur, inner, z = 2) => html.push(`<div id="${id}" class="clip ${cls}" data-start="${start.toFixed(2)}" data-duration="${dur.toFixed(2)}" data-track-index="${z}">${inner}</div>`);
  const audio = (id, src, start, dur, vol) => html.push(`<audio id="${id}" src="${src}" data-start="${start.toFixed(2)}" data-duration="${dur.toFixed(2)}" data-volume="${vol}" data-track-index="${20 + html.length}"></audio>`);
  const sfx = (n, file, t, vol = 0.35) => audio(`sfx-${n}`, `assets/shared/core/sfx/${file}`, t, 1.4, vol);
  const X = 0.5; // traslape entre escenas
  const span = (x) => [Math.max(0, x.start - (x.id === "pregunta" ? 0 : X / 2)), x.dur + (x.id === "pregunta" ? 0 : X / 2) + X / 2];
  // Entrada y salida estándar de una escena: fundido con desenfoque.
  const enter = (id, t) => at(`#${id}`, { opacity: 0, filter: "blur(18px)" }, { opacity: 1, filter: "blur(0px)", duration: X, ease: "power2.out" }, t);
  const leave = (id, t) => to(`#${id}`, { opacity: 0, filter: "blur(14px)", duration: X, ease: "power2.in" }, t - X / 2);
  // Barrido de luz entre escenas.
  let nSweep = 0;
  const sweep = (t) => {
    const id = `sweep-${nSweep++}`;
    clip(id, "sweep", t - 0.35, 0.9, "", 40);
    at(`#${id}`, { xPercent: -120 }, { xPercent: 120, duration: 0.9, ease: "power2.inOut" }, t - 0.35);
  };

  // Fondo permanente: resplandor y piso de rejilla en perspectiva que avanza.
  clip("fondo", "fondo", 0, total, `<div class="glow"></div><div class="floor"><div class="floorgrid"></div></div>`, 0);
  at("#fondo .floorgrid", { backgroundPositionY: "0px" }, { backgroundPositionY: `${Math.round(total * 40)}px`, duration: total, ease: "none" }, 0);
  at("#fondo .glow", { opacity: 0.5 }, { opacity: 1, duration: 6, ease: "sine.inOut", yoyo: true, repeat: Math.floor(total / 6) }, 0);

  // 1. Pregunta: una estela de luz cruza la pantalla y escribe la pregunta.
  {
    const x = S.pregunta; const [s, d] = span(x);
    clip("e-pregunta", "scene", s, d, `
      <svg class="estela" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="gEst" x1="0" x2="1"><stop offset="0" stop-color="#2d7ff9" stop-opacity="0"/><stop offset=".7" stop-color="#4ea7ff"/><stop offset="1" stop-color="#ffffff"/></linearGradient></defs>
      <path id="p1" d="M-60 640 C 380 640 560 430 960 520 S 1520 690 1980 470" pathLength="1"/></svg>
      <h1 class="q">${words("¿Qué pasa si...?")}</h1>`, 3);
    at("#p1", { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 2.2, ease: "power2.inOut" }, s + 0.2);
    at("#e-pregunta .q .w", { opacity: 0, y: 40, filter: "blur(16px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.7, stagger: 0.18, ease: "power3.out" }, enPalabra(x, "¿Qué"));
    to("#p1", { opacity: 0.25, duration: 1.2 }, enPalabra(x, "¿Qué") + 0.2);
    to("#e-pregunta .q", { scale: 1.6, opacity: 0, filter: "blur(20px)", duration: 0.8, ease: "power2.in" }, s + d - 0.8);
    sfx(1, "whoosh.wav", s + 0.25, 0.25);
  }

  // 2. Título sobre la planta 3D.
  {
    const x = S.titulo; const [s, d] = span(x);
    clip("e-titulo", "scene", s, d, `
      <div class="bleed"><img src="assets/tomas/3d-heroe.png" alt=""></div><div class="vignette"></div>
      <div class="titulo"><img class="marca" src="assets/clips/marca.png" alt=""><h1><span class="t1">Arvantti</span> <span class="t2">Digital Twin</span></h1></div>
      <div class="flare"></div>`, 3);
    enter("e-titulo", s);
    at("#e-titulo .bleed img", { scale: 1.3, filter: "blur(12px) brightness(.4)" }, { scale: 1.06, filter: "blur(0px) brightness(.75)", duration: d, ease: "power2.out" }, s);
    const tt = enPalabra(x, "Esto es");
    at("#e-titulo .marca", { opacity: 0, scale: 0.6, y: 30 }, { opacity: 1, scale: 1, y: 0, duration: 1, ease: "back.out(1.6)" }, tt - 0.3);
    at("#e-titulo h1", { opacity: 0, letterSpacing: "40px", filter: "blur(14px)" }, { opacity: 1, letterSpacing: "2px", filter: "blur(0px)", duration: 1.4, ease: "power3.out" }, tt);
    at("#e-titulo h1", { backgroundPosition: "-200% 0" }, { backgroundPosition: "200% 0", duration: 2.2, ease: "power1.inOut" }, tt + 1.2);
    at("#e-titulo .flare", { xPercent: -150, opacity: 0 }, { xPercent: 150, opacity: 1, duration: 1.6, ease: "power2.inOut" }, tt + 0.6);
    sfx(2, "hit.wav", tt, 0.3);
    leave("e-titulo", s + d);
  }

  // Un dispositivo en perspectiva con varias pantallas que se reemplazan con una cortina de luz.
  const device = (id, shots) => `<div class="stage3d"><div class="device" id="${id}-dev">${shots.map((sh, i) => sh.video
    ? `<video id="${id}-s${i}" class="shot" src="${sh.src}" muted playsinline data-start="${sh.start.toFixed(2)}" data-duration="${sh.dur.toFixed(2)}" data-track-index="${30 + i}"></video>`
    : `<div id="${id}-s${i}" class="shot"><img src="${sh.src}" alt=""></div>`).join("")}<div class="edge" id="${id}-edge"></div><div class="sheen" id="${id}-sheen"></div></div><div class="reflect"></div></div>`;
  const swap = (id, i, t) => {
    at(`#${id}-s${i}`, { clipPath: "inset(0 0 0 100%)" }, { clipPath: "inset(0 0 0 0%)", duration: 0.7, ease: "power3.inOut" }, t);
    at(`#${id}-edge`, { left: "100%", opacity: 1 }, { left: "0%", opacity: 0, duration: 0.7, ease: "power3.inOut" }, t);
  };
  const kicker = (n, name) => `<p class="kicker"><b>${n}</b> ${name}</p>`;

  // 3. Planifica: APS con Gantt.
  {
    const x = S.planifica; const [s, d] = span(x);
    const tA = enPalabra(x, "Arrastra"), tF = enPalabra(x, "Fija"), tE = enPalabra(x, "Elige"), tC = enPalabra(x, "El cosimulador");
    const tG = enPalabra(x, "Un programador");
    const shots = [
      { src: "assets/tomas/ui-aps-pedidos.png" },
      { src: "assets/tomas/ui-aps-gantt-manual.png" },
      { video: true, src: "assets/clips/gantt-arrastrar.mp4", start: tA - 0.3, dur: tE - tA + 0.6 },
      { src: "assets/tomas/ui-aps-objetivo.png" },
      { src: "assets/tomas/ui-aps-propuesta.png" },
    ];
    clip("e-planifica", "scene", s, d, `
      <div class="col">${kicker("01", "APS · COSIMULATION")}<h2 class="big">${words("Todo empieza con el plan.")}</h2>
      <div class="chips">${["Recursos", "Turnos", "Cambios", "Entregas"].map((c) => `<span class="chip">${c}</span>`).join("")}</div>
      <ul class="verbs"><li>Arrastra una orden.</li><li>Fija un pedido.</li><li>Elige un objetivo.</li><li>Calcula.</li></ul></div>
      <div class="right">${device("pl", shots)}</div>`, 3);
    enter("e-planifica", s);
    at("#e-planifica .kicker", { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 0.6, ease: "power3.out" }, s + 0.2);
    at("#e-planifica .big .w", { opacity: 0, y: 50, filter: "blur(10px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.6, stagger: 0.08, ease: "power3.out" }, x.voiceAt);
    at("#pl-dev", { rotateY: -32, rotateX: 8, z: -500, opacity: 0 }, { rotateY: -14, rotateX: 4, z: 0, opacity: 1, duration: 1.4, ease: "power3.out" }, s + 0.1);
    to("#pl-dev", { rotateY: -6, rotateX: 2, duration: d - 1.5, ease: "sine.inOut" }, s + 1.5);
    at("#pl-s0 img", { scale: 1.05, y: 0 }, { scale: 1.15, y: -40, duration: tG - s + 0.8, ease: "sine.inOut" }, s);
    swap("pl", 1, tG);
    at("#pl-s1 img", { scale: 1.0 }, { scale: 1.12, duration: tA - tG, ease: "sine.inOut" }, tG);
    at("#e-planifica .chip", { opacity: 0, y: 20, scale: 0.9 }, { opacity: 1, y: 0, scale: 1, duration: 0.5, stagger: 0.32, ease: "back.out(2)" }, enPalabra(x, "recursos"));
    swap("pl", 2, tA - 0.2);
    swap("pl", 3, tE - 0.1);
    at("#pl-s3 img", { scale: 1, x: 0, y: 0 }, { scale: 1.8, x: 0, y: 60, duration: tC - tE + 0.4, ease: "power2.inOut" }, tE);
    swap("pl", 4, tC);
    at("#pl-s4 img", { scale: 1.35, x: 300, y: 260 }, { scale: 1.02, x: 0, y: 0, duration: s + d - tC, ease: "power2.inOut" }, tC);
    to("#e-planifica .chips", { opacity: 0, y: -10, duration: 0.4 }, tA - 0.6);
    [tA, tF, tE, tC].forEach((t, i) => {
      at(`#e-planifica .verbs li:nth-child(${i + 1})`, { opacity: 0, x: -40 }, { opacity: 1, x: 0, color: "#ffffff", duration: 0.5, ease: "power3.out" }, t);
      if (i) to(`#e-planifica .verbs li:nth-child(${i})`, { color: "#5c6b80", duration: 0.4 }, t);
    });
    tl.push(`tl.to("#e-planifica .verbs li:nth-child(4)",{color:"#4ea7ff",textShadow:"0 0 30px #2d7ff9",duration:.5},${(tC + 0.3).toFixed(2)});`);
    at("#pl-sheen", { xPercent: -100 }, { xPercent: 200, duration: 1.4, ease: "power2.inOut" }, tC + 0.4);
    sfx(3, "whoosh-short.mp3", s + 0.1, 0.3);
    [tA, tF, tE].forEach((t, i) => sfx(`3c${i}`, "click-soft.mp3", t, 0.25));
    leave("e-planifica", s + d);
  }

  // 4. Gemelo 3D: el play del futuro.
  {
    const x = S.gemelo; const [s, d] = span(x);
    const tI = enPalabra(x, "máquinas"), tM = enPalabra(x, "líneas"), tO = enPalabra(x, "personas"), tV = enPalabra(x, "inventarios"), tP = enPalabra(x, "Dale play");
    html.push(`<video id="lapso" class="clip bleedv" src="assets/clips/lapso.mp4" muted playsinline data-start="${s.toFixed(2)}" data-duration="${(tI - s + 0.4).toFixed(2)}" data-track-index="4"></video>`);
    clip("e-gemelo", "scene", s, d, `
      <div class="bleed b1"><img src="assets/tomas/3d-inyectoras-2.png" alt=""></div>
      <div class="bleed b2"><img src="assets/tomas/3d-salsas.png" alt=""></div>
      <div class="bleed b5"><img src="assets/tomas/3d-confecciones.png" alt=""></div>
      <div class="bleed b3"><img src="assets/tomas/3d-cajas.png" alt=""></div>
      <div class="bleed b4"><img src="assets/tomas/3d-ui.png" alt=""></div>
      <div class="vignette"></div>
      <div class="hud"><i class="c tl"></i><i class="c tr"></i><i class="c bl"></i><i class="c br"></i><div class="scan"></div><p class="live">● PROYECCIÓN · HORA POR HORA</p><div class="scrub"><i></i></div></div>
      <div class="lowerleft">${kicker("02", "DIGITAL TWIN 3D")}<h2 class="big">${words("Míralo vivir.")}</h2></div>
      <p class="label" id="lb-0">Máquinas</p><p class="label" id="lb-1">Líneas</p><p class="label" id="lb-2">Personas</p><p class="label" id="lb-3">Inventarios</p>
      <div class="play"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="46"/><path d="M40 30 L72 50 L40 70 Z"/></svg></div>`, 5);
    at("#lapso", { opacity: 0, scale: 1.15 }, { opacity: 1, scale: 1.04, duration: tI - s, ease: "power1.out" }, s);
    at("#e-gemelo .hud", { opacity: 0 }, { opacity: 1, duration: 0.6 }, s + 0.3);
    at("#e-gemelo .hud .c", { scale: 1.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.6, stagger: 0.08, ease: "power3.out" }, s + 0.3);
    at("#e-gemelo .scan", { yPercent: -10 }, { yPercent: 1100, duration: 3.5, ease: "none", repeat: 2 }, s + 0.4);
    at("#e-gemelo .scrub i", { scaleX: 0 }, { scaleX: 1, duration: d, ease: "none" }, s);
    at("#e-gemelo .lowerleft .kicker", { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 0.6 }, s + 0.3);
    at("#e-gemelo .lowerleft .w", { opacity: 0, y: 60, filter: "blur(12px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.7, stagger: 0.12, ease: "power3.out" }, x.voiceAt + 0.3);
    to("#e-gemelo .lowerleft", { opacity: 0, y: 30, duration: 0.5 }, tI - 0.4);
    // Primeros planos con empuje de cámara, uno por palabra.
    const cuts = [["b1", tI, tM], ["b2", tM, tO], ["b5", tO, tV], ["b3", tV, tP], ["b4", tP, s + d]];
    cuts.forEach(([b, a, z], i) => {
      at(`#e-gemelo .${b}`, { opacity: 0, clipPath: "circle(0% at 50% 50%)" }, { opacity: 1, clipPath: "circle(80% at 50% 50%)", duration: 0.7, ease: "power3.inOut" }, a - 0.15);
      at(`#e-gemelo .${b} img`, { scale: 1.25, x: i % 2 ? 60 : -60 }, { scale: 1.05, x: 0, duration: z - a + 0.7, ease: "power1.out" }, a - 0.15);
      if (i < 4) {
        at(`#lb-${i}`, { opacity: 0, x: -50, filter: "blur(8px)" }, { opacity: 1, x: 0, filter: "blur(0px)", duration: 0.5, ease: "power3.out" }, a + 0.1);
        to(`#lb-${i}`, { opacity: 0, x: 40, duration: 0.3 }, z - 0.15);
      }
    });
    at("#e-gemelo .play", { opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1, duration: 0.6, ease: "back.out(2)" }, tP);
    to("#e-gemelo .play", { scale: 1.5, opacity: 0, duration: 0.8, ease: "power2.in" }, tP + 1.3);
    to("#e-gemelo .b4 img", { scale: 1.2, duration: 1.5, ease: "power2.in" }, tP + 0.9);
    sfx(4, "whoosh.wav", s, 0.3); sfx("4p", "pop.mp3", tP, 0.35);
    leave("e-gemelo", s + d);
  }

  // 5. Centro de control.
  {
    const x = S.control; const [s, d] = span(x);
    const tO = enPalabra(x, "O E E"), tU = enPalabra(x, "ocupación"), tB = enPalabra(x, "cuellos");
    clip("e-control", "scene", s, d, `
      <div class="top">${kicker("03", "CONTROL CENTER")}<h2 class="mid">${words("Cada indicador, en su lugar.")}</h2></div>
      <div class="wide">${device("cc", [{ src: "assets/tomas/ui-control.png" }])}</div>
      <div class="chips right3">${["OEE", "Ocupación", "Cuellos de botella"].map((c) => `<span class="chip lg">${c}</span>`).join("")}</div>`, 3);
    enter("e-control", s);
    at("#e-control .kicker", { opacity: 0, y: -20 }, { opacity: 1, y: 0, duration: 0.5 }, s + 0.2);
    at("#e-control .mid .w", { opacity: 0, y: 40, filter: "blur(10px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.6, stagger: 0.07, ease: "power3.out" }, x.voiceAt);
    at("#cc-dev", { rotateX: 30, y: 300, opacity: 0 }, { rotateX: 8, y: 0, opacity: 1, duration: 1.2, ease: "power3.out" }, s + 0.1);
    // Acercamiento al OEE (izquierda) y paneo a las máquinas.
    at("#cc-s0 img", { scale: 1, x: 0, y: 0 }, { scale: 2.1, x: 820, y: 260, duration: 1.4, ease: "power3.inOut" }, tO - 0.4);
    to("#cc-s0 img", { scale: 1.6, x: -60, y: 120, duration: 1.4, ease: "power3.inOut" }, tU - 0.2);
    to("#cc-s0 img", { scale: 1.05, x: 0, y: 0, duration: 1.4, ease: "power3.inOut" }, tB + 0.3);
    [tO, tU, tB].forEach((t, i) => at(`#e-control .chip:nth-child(${i + 1})`, { opacity: 0, x: 60 }, { opacity: 1, x: 0, duration: 0.5, ease: "back.out(1.8)" }, t));
    at("#cc-sheen", { xPercent: -100 }, { xPercent: 200, duration: 1.4, ease: "power2.inOut" }, s + 1.2);
    sfx(5, "whoosh-short.mp3", s, 0.3);
    leave("e-control", s + d);
  }

  // 6. Fractal: escenarios que se comparan y se eligen.
  {
    const x = S.fractal; const [s, d] = span(x);
    const tG = enPalabra(x, "Fractal genera"), tK = enPalabra(x, "los califica"), tB = enPalabra(x, "te entrega"), tC = enPalabra(x, "Los comparas"), tE = enPalabra(x, "Eliges"), tY = enPalabra(x, "Y solo entonces");
    const cards = ["ui-aps-gantt-manual.png", "ui-aps-gantt.png", "ui-fractal.png", "ui-aps-propuesta.png", "ui-control.png"];
    const scores = [62, 74, 91, 70, 58];
    clip("e-fractal", "scene", s, d, `
      <h2 class="center q2">${words("¿Y si hay más de una buena respuesta?")}</h2>
      <div class="topl">${kicker("04", "FRACTAL")}</div>
      <div class="fan">${cards.map((c, i) => `<div class="card c${i}"><img src="assets/tomas/${c}" alt=""><div class="score"><i style="width:${scores[i]}%"></i><b>${scores[i]}</b></div></div>`).join("")}</div>
      <div class="tags">${["Entregas", "Cambios", "Ocupación", "Energía"].map((c) => `<span class="chip">${c}</span>`).join("")}</div>
      <div class="bleed b4"><img src="assets/tomas/3d-ui.png" alt=""></div>
      <div class="decide"><p>${words("Tú decides.")}</p><button>ENVIAR A PLANTA</button></div>`, 3);
    enter("e-fractal", s);
    at("#e-fractal .q2 .w", { opacity: 0, y: 40, filter: "blur(12px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.6, stagger: 0.07, ease: "power3.out" }, x.voiceAt);
    to("#e-fractal .q2", { opacity: 0, scale: 0.8, filter: "blur(16px)", duration: 0.5, ease: "power2.in" }, tG - 0.4);
    at("#e-fractal .topl", { opacity: 0 }, { opacity: 1, duration: 0.5 }, tG - 0.2);
    cards.forEach((_, i) => {
      const k = i - 2;
      at(`#e-fractal .c${i}`, { opacity: 0, z: -1600, rotateY: 0, x: 0 }, { opacity: 1, z: -Math.abs(k) * 220, rotateY: -k * 16, x: k * (VERT ? 200 : 330), duration: 1.1, ease: "power3.out" }, tG + i * 0.12);
    });
    at("#e-fractal .score i", { scaleX: 0 }, { scaleX: 1, duration: 1.0, stagger: 0.1, ease: "power2.out" }, tK);
    at("#e-fractal .score b", { opacity: 0 }, { opacity: 1, duration: 0.4, stagger: 0.1 }, tK + 0.4);
    at("#e-fractal .tags .chip", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.45, stagger: 0.15, ease: "back.out(2)" }, tK);
    // La mejor sube al frente.
    to("#e-fractal .card:not(.c2)", { opacity: 0.25, filter: "blur(4px) brightness(.5)", duration: 0.6 }, tB);
    to("#e-fractal .c2", { z: 260, scale: 1.25, duration: 0.9, ease: "power3.inOut" }, tB);
    tl.push(`tl.to("#e-fractal .c2",{boxShadow:"0 0 0 3px #4ea7ff, 0 0 80px #2d7ff9aa",duration:.5},${tB.toFixed(2)});`);
    to("#e-fractal .tags", { opacity: 0, duration: 0.4 }, tB);
    // Se compara en el gemelo.
    at("#e-fractal .b4", { opacity: 0, clipPath: "inset(30% 30% 30% 30% round 24px)" }, { opacity: 1, clipPath: "inset(0% 0% 0% 0% round 0px)", duration: 0.9, ease: "power3.inOut" }, tC - 0.2);
    at("#e-fractal .b4 img", { scale: 1.2 }, { scale: 1.05, duration: tY - tC + 1, ease: "sine.out" }, tC - 0.2);
    at("#e-fractal .decide", { opacity: 0 }, { opacity: 1, duration: 0.4 }, tE - 0.1);
    at("#e-fractal .decide .w", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.1, ease: "power3.out" }, tE - 0.1);
    at("#e-fractal .decide button", { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(2)" }, tY - 0.2);
    to("#e-fractal .decide button", { scale: 0.92, background: "#4ea7ff", duration: 0.15, yoyo: true, repeat: 1 }, tY + 0.9);
    tl.push(`tl.to("#e-fractal .decide button",{boxShadow:"0 0 0 18px #4ea7ff00, 0 0 90px #4ea7ff",duration:.6},${(tY + 1.1).toFixed(2)});`);
    sfx(6, "whoosh.wav", tG, 0.3); sfx("6c", "click.wav", tY + 0.9, 0.35);
    leave("e-fractal", s + d);
  }

  // 7. Asistente IA: chat de consulta con voz.
  {
    const x = S.asistente; const [s, d] = span(x);
    const q = "¿Qué recurso va más cargado esta semana?";
    const a = "La línea 2, con 71 % de ocupación. Fractal puede repartir su carga sin mover ninguna entrega.";
    clip("e-asistente", "scene", s, d, `
      <div class="topl">${kicker("05", "AI ASSISTANT")}</div>
      <div class="chat"><div class="bar"><span class="dot"></span> AI Assistant <span class="badge">Solo consulta · según tu rol</span></div>
      <div class="msg me">${q.split("").map((c) => `<span class="ch">${c}</span>`).join("")}</div>
      <div class="msg ai">${words(a, "aw")}</div>
      <div class="wave">${Array.from({ length: 28 }, (_, i) => `<i style="--h:${(0.3 + 0.7 * Math.abs(Math.sin(i * 1.7))).toFixed(2)}"></i>`).join("")}</div></div>`, 3);
    enter("e-asistente", s);
    at("#e-asistente .chat", { opacity: 0, y: 80, rotateX: 18 }, { opacity: 1, y: 0, rotateX: 0, duration: 0.9, ease: "power3.out" }, s + 0.1);
    at("#e-asistente .topl", { opacity: 0 }, { opacity: 1, duration: 0.5 }, s + 0.2);
    at("#e-asistente .wave i", { scaleY: 0.15 }, { scaleY: 1, duration: 0.25, stagger: { each: 0.03, from: "center", yoyo: true, repeat: Math.ceil(d / 0.5) }, ease: "sine.inOut" }, s + 0.4);
    at("#e-asistente .ch", { opacity: 0 }, { opacity: 1, duration: 0.01, stagger: 0.035 }, x.voiceAt + 0.1);
    const tR = enPalabra(x, "El Asistente");
    at("#e-asistente .aw", { opacity: 0, filter: "blur(6px)" }, { opacity: 1, filter: "blur(0px)", duration: 0.25, stagger: 0.12 }, tR);
    sfx(7, "typing.mp3", x.voiceAt + 0.1, 0.2);
    leave("e-asistente", s + d);
  }

  // 8. Conecta: máquinas y ERP.
  {
    const x = S.conecta; const [s, d] = span(x);
    const tM = enPalabra(x, "con tus máquinas"), tE = enPalabra(x, "E R P");
    // Horizontal: máquinas en columna a la izquierda, núcleo al centro, ERP a la derecha. Vertical: máquinas arriba, ERP abajo.
    const left = ["Línea 1", "Línea 2", "Máquina 7", "Celda 3"].map((n, i) => (VERT ? { n, x: 150 + i * 260, y: 560 } : { n, x: 240, y: 260 + i * 170 }));
    const core = VERT ? { x: 540, y: 1000 } : { x: 960, y: 515 }, erp = VERT ? { x: 540, y: 1480 } : { x: 1680, y: 515 };
    left.forEach((p) => { p.a = VERT ? { x: p.x, y: p.y + 42 } : { x: p.x + 110, y: p.y }; });
    const coreIn = VERT ? { x: core.x, y: core.y - 150 } : { x: core.x - 150, y: core.y };
    const coreOut = VERT ? { x: core.x, y: core.y + 150 } : { x: core.x + 150, y: core.y };
    const erpIn = VERT ? { x: erp.x, y: erp.y - 60 } : { x: erp.x - 120, y: erp.y };
    const lines = left.map((p, i) => `<line id="ln${i}" x1="${p.a.x}" y1="${p.a.y}" x2="${coreIn.x}" y2="${coreIn.y}" pathLength="1"/>`).join("") + `<line id="lnE" x1="${coreOut.x}" y1="${coreOut.y}" x2="${erpIn.x}" y2="${erpIn.y}" pathLength="1"/>`;
    const dots = left.map((p, i) => `<circle class="pk" id="pk${i}" r="7" cx="${p.a.x}" cy="${p.a.y}"/>`).join("") + `<circle class="pk" id="pkE" r="7" cx="${erpIn.x}" cy="${erpIn.y}"/>`;
    clip("e-conecta", "scene", s, d, `
      <div class="bleed dim"><img src="assets/tomas/ui-arquitectura.png" alt=""></div>
      <div class="topl">${kicker("06", "INTEGRATOR · DENDROSCADA")}</div>
      <svg class="net" viewBox="0 0 ${W} ${H}">${lines}${dots}</svg>
      ${left.map((p, i) => `<div class="node m" id="nd${i}" style="left:${p.x - 110}px;top:${p.y - 42}px">${p.n}<small>PLC</small></div>`).join("")}
      <div class="proto" style="left:${VERT ? 580 : 560}px;top:${core.y - (VERT ? 250 : 160)}px">OPC UA · MQTT</div>
      <div class="core" style="left:${core.x - 150}px;top:${core.y - 150}px"><img src="assets/clips/marca.png" alt=""><span>Digital Twin</span></div>
      <div class="node erp" style="left:${erp.x - 120}px;top:${erp.y - 60}px">ERP<small>pedidos · inventario</small></div>
      <h2 class="bottomc">${words("Conectado.")}</h2>`, 3);
    enter("e-conecta", s);
    at("#e-conecta .core", { opacity: 0, scale: 0.5 }, { opacity: 1, scale: 1, duration: 0.8, ease: "back.out(1.7)" }, s + 0.2);
    at("#e-conecta .node.m", { opacity: 0, x: -60 }, { opacity: 1, x: 0, duration: 0.5, stagger: 0.1, ease: "power3.out" }, tM - 0.3);
    left.forEach((p, i) => {
      at(`#ln${i}`, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.6, ease: "power2.out" }, tM + i * 0.1);
      at(`#pk${i}`, { attr: { cx: p.a.x, cy: p.a.y }, opacity: 1 }, { attr: { cx: coreIn.x, cy: coreIn.y }, opacity: 1, duration: 0.9, ease: "power1.in", repeat: 3, repeatDelay: 0.2 + i * 0.05 }, tM + 0.4 + i * 0.12);
    });
    at("#e-conecta .proto", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.5 }, tM + 0.5);
    at("#e-conecta .erp", { opacity: 0, x: 60 }, { opacity: 1, x: 0, duration: 0.5, ease: "back.out(1.7)" }, tE - 0.3);
    at("#lnE", { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.5 }, tE - 0.1);
    at("#pkE", { attr: { cx: erpIn.x, cy: erpIn.y }, opacity: 1 }, { attr: { cx: coreOut.x, cy: coreOut.y }, opacity: 1, duration: 0.8, ease: "power1.in", repeat: 2, repeatDelay: 0.2 }, tE + 0.3);
    at("#e-conecta .bottomc .w", { opacity: 0, y: 30, filter: "blur(10px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.6 }, tE + 0.5);
    sfx(8, "spark.wav", tM, 0.25);
    leave("e-conecta", s + d);
  }

  // 9. Módulos: el heptágono. Núcleo Arvantti Digital Twin y siete módulos alrededor, que se encienden al nombrarlos.
  {
    const x = S.modulos; const [s, d] = span(x);
    const MOD = [
      ["Integrator", "ERP · CRM · SCADA"],
      ["APS", "Órdenes y recursos"],
      ["CoSimulation", "Reglas de tu planta"],
      ["Fractal", "Escenarios multiobjetivo"],
      ["Control Center", "Monitoreo en vivo"],
      ["DendroScada", "Hardware SCADA propio"],
      ["AI Assistant", "IA privada"],
    ];
    const C = VERT ? { x: 540, y: 1000 } : { x: 960, y: 590 }, RX = VERT ? 370 : 540, RY = VERT ? 560 : 330, MW = VERT ? 310 : 340;
    const V = MOD.map((_, i) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / 7; return { x: Math.round(C.x + RX * Math.cos(a)), y: Math.round(C.y + RY * Math.sin(a)) }; });
    const tN = enPalabra(x, "Todo corre"), tA = enPalabra(x, "Arvantti"), tS = enPalabra(x, "siete módulos"), tX = enPalabra(x, "Activas");
    const tM = MOD.map(([n]) => enPalabra(x, n));
    const elegidos = [1, 2, 3]; // ejemplo de selección: APS, CoSimulation y Fractal sobre el núcleo
    clip("e-modulos", "scene", s, d, `
      <h2 class="center hx">${words("Un núcleo. Siete módulos.")}</h2>
      <h2 class="center hx2">${words("Elige tus módulos.")} <span class="sinu">Sin cobro por usuario.</span></h2>
      <svg class="hepta" viewBox="0 0 ${W} ${H}">
        <polygon id="hx-borde" points="${V.map((v) => `${v.x},${v.y}`).join(" ")}" pathLength="1"/>
        ${V.map((v, i) => `<line id="hx-r${i}" x1="${C.x}" y1="${C.y}" x2="${v.x}" y2="${v.y}" pathLength="1"/>`).join("")}
      </svg>
      <div class="hcore" style="left:${C.x - 150}px;top:${C.y - 150}px"><img src="assets/clips/marca.png" alt=""><b>Arvantti</b><span>Digital Twin</span><small>Gemelo 3D · núcleo</small></div>
      ${MOD.map(([n, sub], i) => `<div class="mod" id="md${i}" style="left:${V[i].x - MW / 2}px;top:${V[i].y - 52}px"><i>${i + 1}</i><p>${n}</p><small>${sub}</small></div>`).join("")}`, 3);
    enter("e-modulos", s);
    at("#e-modulos .hx .w", { opacity: 0, y: 30, filter: "blur(10px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.6, stagger: 0.1, ease: "power3.out" }, x.voiceAt - 0.1);
    at("#e-modulos .hcore", { opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1, duration: 0.9, ease: "back.out(1.7)" }, tA - 0.3);
    tl.push(`tl.to("#e-modulos .hcore",{boxShadow:"0 0 0 3px #4ea7ff, 0 0 120px #2d7ff9aa",duration:.6,yoyo:true,repeat:1},${(tA + 0.6).toFixed(2)});`);
    at("#hx-borde", { strokeDashoffset: 1, opacity: 1 }, { strokeDashoffset: 0, opacity: 1, duration: Math.max(0.8, tM[0] - tS), ease: "power2.inOut" }, tS - 0.1);
    MOD.forEach((_, i) => {
      at(`#md${i}`, { opacity: 0, scale: 0.6, y: 20 }, { opacity: 1, scale: 1, y: 0, duration: 0.5, ease: "back.out(2)" }, tM[i] - 0.12);
      at(`#hx-r${i}`, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.45, ease: "power2.out" }, tM[i] - 0.12);
      tl.push(`tl.to("#md${i}",{boxShadow:"0 0 0 2px #4ea7ff, 0 0 50px #2d7ff9aa",duration:.25,yoyo:true,repeat:1},${tM[i].toFixed(2)});`);
      sfx(`9${i}`, "pop.mp3", tM[i], 0.18);
    });
    // "Activas solo los que necesitas": se encienden unos módulos de ejemplo y los demás quedan en espera.
    to("#e-modulos .hx", { opacity: 0, y: -20, duration: 0.4 }, tX - 0.3);
    at("#e-modulos .hx2 .w", { opacity: 0, y: 30, filter: "blur(10px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.5, stagger: 0.1, ease: "power3.out" }, tX);
    at("#e-modulos .sinu", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.6, ease: "back.out(1.6)" }, enPalabra(x, "sin cobro"));
    MOD.forEach((_, i) => {
      if (elegidos.includes(i)) {
        tl.push(`tl.to("#md${i}",{borderColor:"#4ea7ff",background:"#12305a",boxShadow:"0 0 0 2px #4ea7ff, 0 0 60px #2d7ff988",duration:.4},${(tX + 0.3 + elegidos.indexOf(i) * 0.25).toFixed(2)});`);
        to(`#hx-r${i}`, { stroke: "#4ea7ff", strokeWidth: 5, duration: 0.4 }, tX + 0.3 + elegidos.indexOf(i) * 0.25);
      } else {
        to(`#md${i} > *`, { opacity: 0.35, duration: 0.5 }, tX + 0.2);
        tl.push(`tl.to("#md${i}",{borderColor:"#4ea7ff22",duration:.5},${(tX + 0.2).toFixed(2)});`);
        to(`#hx-r${i}`, { opacity: 0.15, duration: 0.5 }, tX + 0.2);
      }
    });
    sfx(9, "whoosh-short.mp3", s, 0.3);
    leave("e-modulos", s + d);
  }

  // 10. Cierre.
  {
    const x = S.cierre; const [s, d] = span(x);
    const tD = enPalabra(x, "Decide");
    clip("e-cierre", "scene", s, d, `
      <svg class="estela" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice"><path id="p2" d="M-60 470 C 380 470 560 690 960 560 S 1520 430 1980 640" pathLength="1"/></svg>
      <div class="fin"><img class="marca" src="assets/clips/marca.png" alt=""><h1>Arvantti <span>Digital Twin</span></h1><p class="firma">Decide antes de que pase.</p><p class="url">digitaltwin.arvantti.online</p></div>`, 3);
    enter("e-cierre", s);
    at("#p2", { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 1.8, ease: "power2.inOut" }, s);
    to("#p2", { opacity: 0.2, duration: 1 }, s + 1.8);
    at("#e-cierre .marca", { opacity: 0, scale: 0.5, rotate: -8 }, { opacity: 1, scale: 1, rotate: 0, duration: 1, ease: "back.out(1.6)" }, x.voiceAt - 0.3);
    at("#e-cierre h1", { opacity: 0, letterSpacing: "30px", filter: "blur(10px)" }, { opacity: 1, letterSpacing: "2px", filter: "blur(0px)", duration: 1.2, ease: "power3.out" }, x.voiceAt);
    at("#e-cierre .firma", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.8, ease: "power3.out" }, tD);
    at("#e-cierre .url", { opacity: 0 }, { opacity: 1, duration: 0.8 }, tD + 1.0);
    to("#e-cierre .fin", { opacity: 0, duration: 1.0 }, s + d - 1.0);
    sfx(10, "hit.wav", x.voiceAt, 0.3);
  }

  [S.titulo, S.planifica, S.gemelo, S.fractal, S.modulos, S.cierre].forEach((x) => sweep(x.start));

  // Voz por escena y música.
  escenas.forEach((x) => { if (x.real) audio(`voz-${x.id}`, `escenas/${x.dir}/assets/audio/voiceover.mp3`, x.voiceAt, x.voz, 1); });
  const epica = mezclaMusica(escenas, total);
  if (epica) audio("musica", epica, 0, total, 0.55);
  else if (fs.existsSync(T("assets/clips/musica.mp3"))) audio("musica", "assets/clips/musica.mp3", 0, total, 0.22);
  if (temporal) html.push(`<div id="temp" class="clip" data-start="0" data-duration="${total.toFixed(2)}" data-track-index="50">SIN VOZ · TIEMPOS ESTIMADOS</div>`);

  let plantilla = fs.readFileSync(T("plantilla.html"), "utf8");
  if (VERT) plantilla = plantilla
    .replaceAll("width:1920px;height:1080px", "width:1080px;height:1920px")
    .replace('content="width=1920, height=1080"', 'content="width=1080, height=1920"')
    .replace('data-resolution="landscape"', 'data-resolution="portrait"')
    .replace('data-width="1920" data-height="1080"', 'data-width="1080" data-height="1920"')
    .replace("</style>", `${fs.readFileSync(T("vertical.css"), "utf8")}\n</style>`);
  const out = plantilla
    .replaceAll("{{TOTAL}}", total.toFixed(2))
    .replace("{{CLIPS}}", html.join("\n"))
    .replace("{{TIMELINE}}", tl.join("\n"));
  fs.writeFileSync(T("index.html"), out);
  fs.writeFileSync(T("tiempos.json"), JSON.stringify(escenas.map(({ id, start, voiceAt, voz, dur, real }) => ({ id, start: +start.toFixed(2), voiceAt: +voiceAt.toFixed(2), voz: +voz.toFixed(2), dur: +dur.toFixed(2), real })), null, 1));
  console.log(`index.html: ${total.toFixed(1)} s${temporal ? " (tiempos estimados, falta voz)" : ""}`);
}

function render(v = "v001") {
  fs.mkdirSync(T("out"), { recursive: true });
  const out = T(`out/lanzamiento-${VERT ? "vertical-" : ""}${v}.mp4`);
  execFileSync("pnpm", ["dlx", "hyperframes@0.9.9", "render", "-o", out, "--fps", String(FPS), "--quality", process.env.QUALITY || "standard", "--video-frame-format", "png", ...(process.env.HF_ARGS ? process.env.HF_ARGS.split(" ") : [])], { cwd: HERE, stdio: "inherit" });
  console.log(out);
}

const [cmd, arg] = process.argv.slice(2);
const cmds = { preparar, voz, musica, componer, render: () => render(arg), tiempos: () => console.log(tiempos()) };
if (!cmds[cmd]) {
  console.log("Uso: node armar.mjs preparar | voz [--enviar] | musica [--enviar] | componer | render [vNNN] | tiempos");
  process.exit(1);
}
await cmds[cmd]();
