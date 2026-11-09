#!/usr/bin/env node
/**
 * Video horizontal de Arvantti Harness (1920x1080, ~2 min), basado en la presentación para directivos.
 *
 *   node armar.mjs preparar        copia las capturas del Shell V3, recorta la marca y crea una música de respaldo
 *   node armar.mjs componer        mide la voz de cada escena (o la estima) y escribe index.html
 *   node armar.mjs render [vNNN]   renderiza out/harness-<vNNN>.mp4
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
const W = 1920, H = 1080;
const sh = (cmd, args) => execFileSync(cmd, args, { stdio: "inherit" });

// Escenas en orden: id, carpeta de la voz y colas (segundos antes y después de la voz).
const ESCENAS = [
  { id: "pregunta", dir: "01-pregunta", lead: 1.6, tail: 1.0 },
  { id: "titulo", dir: "02-titulo", lead: 0.4, tail: 1.4 },
  { id: "ia", dir: "03-cualquier-ia", lead: 0.4, tail: 0.9 },
  { id: "agentes", dir: "04-agentes", lead: 0.3, tail: 0.9 },
  { id: "voz", dir: "05-voz", lead: 0.4, tail: 1.0 },
  { id: "seguridad", dir: "06-seguridad", lead: 0.3, tail: 0.9 },
  { id: "cerebro", dir: "07-cerebro", lead: 0.3, tail: 0.9 },
  { id: "auditoria", dir: "08-auditoria", lead: 0.3, tail: 1.2 },
  { id: "cierre", dir: "09-cierre", lead: 1.0, tail: 5.5 },
];

const texto = (e) => fs.readFileSync(T(`escenas/${e.dir}/script.md`), "utf8").trim();
const vozDe = (e) => T(`escenas/${e.dir}/assets/audio/voiceover.mp3`);
const alineacionDe = (e) => T(`escenas/${e.dir}/assets/audio/alignment.json`);

// Nombres en inglés que la voz en español lee mal: se envían escritos como se pronuncian.
const PRONUNCIA = [["Harness", "Jarnes"], ["hooks", "juks"], ["ISO 42001", "ISO cuarenta y dos mil uno"]];
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


// Capturas del Shell V3 de Arvantti Harness (las mismas de la presentación para directivos). No van al repo.
const CAPTURAS = process.env.HARNESS_CAPTURAS || "/mnt/project-files/harness-clevel";
const TOMAS = ["v3-inicio", "v3-paquetes", "v3-red-agentes", "v3-auditoria", "v3-tareas"];

function preparar() {
  const tomas = T("assets/tomas"), clips = T("assets/clips");
  fs.mkdirSync(tomas, { recursive: true });
  fs.mkdirSync(clips, { recursive: true });
  for (const n of TOMAS) fs.copyFileSync(path.join(CAPTURAS, `${n}.png`), path.join(tomas, `${n}.png`));
  sh("python3", ["-I", "-c", MARCA, T("assets/shared/arvantti/branding/ArvanttiLabsLogo.png"), path.join(clips, "marca.png")]);
  console.log("listo: assets/tomas y assets/clips");
}

// ---------------------------------------------------------------- composición
const words = (s, cls = "w") => s.split(" ").map((w) => `<span class="${cls}">${w}</span>`).join(" ");

function componer() {
  const { escenas, total, temporal } = tiempos();
  const S = Object.fromEntries(escenas.map((x) => [x.id, x]));
  const html = [];
  const tl = [];
  const at = (sel, from, to, t) => tl.push(`tl.fromTo(${JSON.stringify(sel)},${JSON.stringify(from)},${JSON.stringify(to)},${(+t).toFixed(2)});`);
  const to = (sel, v, t) => tl.push(`tl.to(${JSON.stringify(sel)},${JSON.stringify(v)},${(+t).toFixed(2)});`);
  const clip = (id, cls, start, dur, inner, z = 2) => html.push(`<div id="${id}" class="clip ${cls}" data-start="${start.toFixed(2)}" data-duration="${dur.toFixed(2)}" data-track-index="${z}">${inner}</div>`);
  const audio = (id, src, start, dur, vol) => html.push(`<audio id="${id}" src="${src}" data-start="${start.toFixed(2)}" data-duration="${dur.toFixed(2)}" data-volume="${vol}" data-track-index="${20 + html.length}"></audio>`);
  const sfx = (n, file, t, vol = 0.35) => audio(`sfx-${n}`, `assets/shared/core/sfx/${file}`, t, 1.4, vol);
  const X = 0.5;
  const span = (x) => [Math.max(0, x.start - (x.id === "pregunta" ? 0 : X / 2)), x.dur + (x.id === "pregunta" ? 0 : X / 2) + X / 2];
  const enter = (id, t) => at(`#${id}`, { opacity: 0, filter: "blur(18px)" }, { opacity: 1, filter: "blur(0px)", duration: X, ease: "power2.out" }, t);
  const leave = (id, t) => to(`#${id}`, { opacity: 0, filter: "blur(14px)", duration: X, ease: "power2.in" }, t - X / 2);
  const P = (x, frag) => enPalabra(x, frag);
  const kicker = (n, name) => `<p class="kicker"><b>${n}</b> ${name}</p>`;
  const titleIn = (sel, t) => at(`${sel} .w`, { opacity: 0, y: 40, filter: "blur(10px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.6, stagger: 0.07, ease: "power3.out" }, t);
  let nSweep = 0;
  const sweep = (t) => {
    const id = `sweep-${nSweep++}`;
    clip(id, "sweep", t - 0.35, 0.9, "", 40);
    at(`#${id}`, { xPercent: -120 }, { xPercent: 120, duration: 0.9, ease: "power2.inOut" }, t - 0.35);
  };
  // Dispositivo en perspectiva: pantallas (imagen o HTML) que se reemplazan con una cortina de luz.
  const device = (id, shots) => `<div class="stage3d"><div class="device" id="${id}-dev">${shots.map((sh, i) => `<div id="${id}-s${i}" class="shot">${sh.html || `<img src="${sh.src}" alt="">`}</div>`).join("")}<div class="edge" id="${id}-edge"></div><div class="sheen" id="${id}-sheen"></div></div><div class="reflect"></div></div>`;
  const swap = (id, i, t) => {
    at(`#${id}-s${i}`, { clipPath: "inset(0 0 0 100%)" }, { clipPath: "inset(0 0 0 0%)", duration: 0.7, ease: "power3.inOut" }, t);
    at(`#${id}-edge`, { left: "100%", opacity: 1 }, { left: "0%", opacity: 0, duration: 0.7, ease: "power3.inOut" }, t);
  };

  clip("fondo", "fondo", 0, total, `<div class="glow"></div><div class="floor"><div class="floorgrid"></div></div>`, 0);
  at("#fondo .floorgrid", { backgroundPositionY: "0px" }, { backgroundPositionY: `${Math.round(total * 40)}px`, duration: total, ease: "none" }, 0);
  at("#fondo .glow", { opacity: 0.5 }, { opacity: 1, duration: 6, ease: "sine.inOut", yoyo: true, repeat: Math.floor(total / 6) }, 0);

  // 1. Pregunta.
  {
    const x = S.pregunta; const [s, d] = span(x);
    const tP = P(x, "Pero");
    clip("e-pregunta", "scene", s, d, `
      <svg class="estela" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice"><path id="p1" d="M-60 640 C 380 640 560 430 960 520 S 1520 690 1980 470" pathLength="1"/></svg>
      <p class="pre">${words("La IA ya está en su empresa.")}</p>
      <h1 class="q">${words("¿Quién la controla?")}</h1>`, 3);
    at("#p1", { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 2.2, ease: "power2.inOut" }, s + 0.2);
    at("#e-pregunta .pre .w", { opacity: 0, y: 20, filter: "blur(10px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.5, stagger: 0.09, ease: "power3.out" }, x.voiceAt);
    to("#e-pregunta .pre", { opacity: 0.45, duration: 0.6 }, tP);
    at("#e-pregunta .q .w", { opacity: 0, y: 40, filter: "blur(16px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.7, stagger: 0.16, ease: "power3.out" }, P(x, "¿quién") - 0.1);
    to("#p1", { opacity: 0.25, duration: 1.2 }, tP + 0.2);
    to("#e-pregunta .q", { scale: 1.5, opacity: 0, filter: "blur(20px)", duration: 0.8, ease: "power2.in" }, s + d - 0.8);
    to("#e-pregunta .pre", { opacity: 0, duration: 0.5 }, s + d - 0.8);
    sfx(1, "whoosh.wav", s + 0.25, 0.25);
  }

  // 2. Título sobre el Shell.
  {
    const x = S.titulo; const [s, d] = span(x);
    const tt = P(x, "Arvantti"), tS = P(x, "La sala");
    clip("e-titulo", "scene", s, d, `
      <div class="bleed shell"><img src="assets/tomas/v3-inicio.png" alt=""></div><div class="vignette"></div>
      <div class="titulo"><img class="marca" src="assets/clips/marca.png" alt=""><h1>Arvantti Harness<sup>®</sup></h1><p class="sub">${words("La sala de control de la IA de su empresa")}</p></div>
      <div class="flare"></div>`, 3);
    enter("e-titulo", s);
    at("#e-titulo .bleed img", { scale: 1.3, filter: "blur(14px) brightness(.3)" }, { scale: 1.08, filter: "blur(6px) brightness(.32)", duration: d, ease: "power2.out" }, s);
    at("#e-titulo .marca", { opacity: 0, scale: 0.6, y: 30 }, { opacity: 1, scale: 1, y: 0, duration: 1, ease: "back.out(1.6)" }, tt - 0.5);
    at("#e-titulo h1", { opacity: 0, letterSpacing: "40px", filter: "blur(14px)" }, { opacity: 1, letterSpacing: "2px", filter: "blur(0px)", duration: 1.3, ease: "power3.out" }, tt - 0.2);
    at("#e-titulo h1", { backgroundPosition: "-200% 0" }, { backgroundPosition: "200% 0", duration: 2.2, ease: "power1.inOut" }, tt + 1.0);
    at("#e-titulo .sub .w", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.06, ease: "power3.out" }, tS);
    at("#e-titulo .flare", { xPercent: -150, opacity: 0 }, { xPercent: 150, opacity: 1, duration: 1.6, ease: "power2.inOut" }, tt + 0.4);
    sfx(2, "hit.wav", tt, 0.3);
    leave("e-titulo", s + d);
  }

  // 3. Cualquier IA: las herramientas llegan al arnés y quedan bajo las mismas reglas.
  {
    const x = S.ia; const [s, d] = span(x);
    const C = { x: 960, y: 450 };
    const IA = [
      ["Claude", P(x, "Claude"), 0], ["ChatGPT", P(x, "ChatGPT"), 1], ["Gemini", P(x, "Gemini"), 2], ["Copilot", P(x, "Copilot"), 3],
      ["Modelos privados", P(x, "modelos privados"), 4], ["Codex", P(x, "modelos privados") + 0.3, 5], ["OpenCode", P(x, "modelos privados") + 0.4, 6],
      ["OpenRouter", P(x, "modelos privados") + 0.5, 7], ["Kimi", P(x, "modelos privados") + 0.6, 8], ["Antigravity", P(x, "modelos privados") + 0.7, 9],
    ];
    const pos = IA.map((_, i) => { const a = Math.PI + (i * 2 * Math.PI) / IA.length; return { x: Math.round(C.x + 640 * Math.cos(a)), y: Math.round(C.y + 270 * Math.sin(a)) }; });
    const BAD = [["reglas", "Mismas reglas"], ["guardianes", "Mismos guardianes"], ["memoria", "Misma memoria"], ["auditoría", "Misma auditoría"]];
    const tA = P(x, "Un arnés"), tU = P(x, "Usted elige");
    clip("e-ia", "scene", s, d, `
      <div class="topl">${kicker("01", "UN ARNÉS DE ARNESES")}</div>
      <h2 class="center ia-t">${words("Funciona con cualquier IA.")}</h2>
      <svg class="net" viewBox="0 0 1920 1080">${pos.map((p, i) => `<line id="ia-l${i}" x1="${p.x}" y1="${p.y}" x2="${C.x}" y2="${C.y}" pathLength="1"/>`).join("")}</svg>
      ${IA.map(([n], i) => `<div class="aichip${i > 4 ? " sm" : ""}${i === 4 ? " priv" : ""}" id="ia-c${i}" style="left:${pos[i].x}px;top:${pos[i].y}px">${n}</div>`).join("")}
      <div class="core" id="ia-core" style="left:${C.x - 150}px;top:${C.y - 150}px"><img src="assets/clips/marca.png" alt=""><span>Arvantti</span><small>Harness®</small></div>
      <div class="badges">${BAD.map(([, b]) => `<span class="chip">${b}</span>`).join("")}</div>
      <h2 class="elige">${words("Usted elige.")}</h2>`, 3);
    enter("e-ia", s);
    at("#e-ia .topl", { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 0.5 }, s + 0.2);
    titleIn("#e-ia .ia-t", x.voiceAt);
    to("#e-ia .ia-t", { opacity: 0, y: -40, scale: 0.85, duration: 0.5, ease: "power2.in" }, IA[0][1] - 0.5);
    at("#ia-core", { opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1, duration: 0.8, ease: "back.out(1.7)" }, IA[0][1] - 0.4);
    IA.forEach(([, t], i) => {
      at(`#ia-c${i}`, { opacity: 0, scale: 0.5, xPercent: -50, yPercent: -50 }, { opacity: 1, scale: 1, xPercent: -50, yPercent: -50, duration: 0.45, ease: "back.out(2)" }, t - 0.1);
      at(`#ia-l${i}`, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.5, ease: "power2.out" }, tA + i * 0.06);
      if (i < 5) sfx(`3c${i}`, "pop.mp3", t, 0.15);
    });
    tl.push(`tl.to("#ia-core",{boxShadow:"0 0 0 4px #4ea7ff, 0 0 140px #2d7ff9cc",scale:1.08,duration:.5,yoyo:true,repeat:1},${(tA + 0.2).toFixed(2)});`);
    BAD.forEach(([w], i) => at(`#e-ia .badges .chip:nth-child(${i + 1})`, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.45, ease: "back.out(2)" }, P(x, w) - 0.1));
    to("#e-ia .aichip, #e-ia .net", { opacity: 0.35, duration: 0.5 }, tU - 0.2);
    at("#e-ia .elige .w", { opacity: 0, y: 40, filter: "blur(12px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.6, stagger: 0.12, ease: "power3.out" }, tU);
    sfx(3, "whoosh-short.mp3", s + 0.1, 0.3); sfx("3h", "hit.wav", tA, 0.22);
    leave("e-ia", s + d);
  }

  // 4. Crear agentes: diseñador, catálogo de habilidades y ficha del agente.
  {
    const x = S.agentes; const [s, d] = span(x);
    const tD = P(x, "Lo dibuja"), tH = P(x, "elige"), tC = P(x, "y le asigna");
    const flujo = `<div class="flow"><p class="ftit">Diseñador de agentes · Revisión de pedidos</p>
      ${["Recibe pedidos", "Revisa atrasos", "Consulta al cerebro", "Pide aprobación", "Entrega informe"].map((n, i) => `<div class="fn" id="fn${i}" style="left:${70 + (i % 3) * 360}px;top:${120 + Math.floor(i / 3) * 230}px"><i>${i + 1}</i>${n}</div>`).join("")}
      <svg class="fl" viewBox="0 0 1180 664"><path id="fpath" d="M330 165 H430 M690 165 H790 M920 210 V260 C920 300 860 330 760 340 H330 M330 395 H430" pathLength="1"/></svg></div>`;
    clip("e-agentes", "scene", s, d, `
      <div class="col">${kicker("02", "CREACIÓN DE AGENTES")}<h2 class="big">${words("Un agente, un proceso.")}</h2>
      <ul class="verbs"><li>Lo dibuja.</li><li>Elige habilidades.</li><li>Le asigna un dueño.</li></ul>
      <p class="contador"><b id="cnt">0</b> habilidades listas</p></div>
      <div class="right">${device("ag", [{ html: flujo }, { src: "assets/tomas/v3-paquetes.png" }, { src: "assets/tomas/v3-red-agentes.png" }])}
      <div class="ficha"><p class="fh">AGENTE · Analista de pedidos</p><dl><dt>Cargo</dt><dd>Analista</dd><dt>Alcance</dt><dd>Ventas · solo lectura</dd><dt>Responsable</dt><dd>Dir. de Operaciones</dd></dl></div></div>`, 3);
    enter("e-agentes", s);
    at("#e-agentes .kicker", { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 0.6 }, s + 0.2);
    at("#e-agentes .big .w", { opacity: 0, y: 50, filter: "blur(10px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.6, stagger: 0.08, ease: "power3.out" }, x.voiceAt);
    at("#ag-dev", { rotateY: -32, rotateX: 8, z: -500, opacity: 0 }, { rotateY: -14, rotateX: 4, z: 0, opacity: 1, duration: 1.4, ease: "power3.out" }, s + 0.1);
    to("#ag-dev", { rotateY: -6, rotateX: 2, duration: d - 1.5, ease: "sine.inOut" }, s + 1.5);
    for (let i = 0; i < 5; i++) at(`#fn${i}`, { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.4, ease: "back.out(2)" }, tD + i * 0.28);
    at("#fpath", { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 1.4, ease: "power1.inOut" }, tD + 0.2);
    swap("ag", 1, tH - 0.1);
    at("#ag-s1 img", { scale: 1.6, x: 380, y: 230 }, { scale: 1.25, x: 160, y: 90, duration: tC - tH + 0.6, ease: "sine.inOut" }, tH - 0.1);
    at("#e-agentes .contador", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.5 }, tH);
    at("#cnt", { innerText: 0 }, { innerText: 120, duration: 1.4, snap: { innerText: 1 }, ease: "power2.out" }, tH + 0.1);
    tl.push(`tl.call(()=>{const e=document.getElementById("cnt");if(e)e.textContent="+"+e.textContent.replace("+","")},null,${(tH + 1.55).toFixed(2)});`);
    swap("ag", 2, tC - 0.1);
    at("#ag-s2 img", { scale: 1.05 }, { scale: 1.2, duration: s + d - tC, ease: "sine.inOut" }, tC);
    at("#e-agentes .ficha", { opacity: 0, x: 80, rotateY: -20 }, { opacity: 1, x: 0, rotateY: 0, duration: 0.7, ease: "power3.out" }, tC + 0.1);
    ["Cargo", "Alcance", "Responsable"].forEach((w, i) => at(`#e-agentes .ficha dd:nth-of-type(${i + 1})`, { opacity: 0, x: -20 }, { opacity: 1, x: 0, duration: 0.35 }, P(x, w === "Cargo" ? "cargo" : w === "Alcance" ? "alcance" : "responsable")));
    [tD, tH, tC].forEach((t, i) => {
      at(`#e-agentes .verbs li:nth-child(${i + 1})`, { opacity: 0, x: -40 }, { opacity: 1, x: 0, color: "#ffffff", duration: 0.5, ease: "power3.out" }, t);
      if (i) to(`#e-agentes .verbs li:nth-child(${i})`, { color: "#5c6b80", duration: 0.4 }, t);
      sfx(`4c${i}`, "click-soft.mp3", t, 0.25);
    });
    at("#ag-sheen", { xPercent: -100 }, { xPercent: 200, duration: 1.4, ease: "power2.inOut" }, tC + 0.3);
    sfx(4, "whoosh-short.mp3", s + 0.1, 0.3);
    leave("e-agentes", s + d);
  }

  // 5. Voz: usted habla, los coordinadores reparten y siguen el trabajo, y le responden.
  {
    const x = S.voz; const [s, d] = span(x);
    const tPi = P(x, "Usted le pide"), tA = P(x, "El coordinador de agentes"), tH = P(x, "El coordinador de hilos"), tR = P(x, "Y le responde"), tD = P(x, "Desde el carro");
    const pedido = "“Revisa los pedidos atrasados y prepárame un resumen para la junta del lunes.”";
    const AG = ["Analista de datos", "Revisor", "Redactor"];
    const HI = [["Pedidos atrasados", 1], ["Causas por cliente", 0.85], ["Resumen para la junta", 0.7]];
    clip("e-voz", "scene", s, d, `
      <div class="topl">${kicker("03", "CONVERSACIÓN POR VOZ")}</div>
      <h2 class="center vz-t">${words("Basta con hablar.")}</h2>
      <div class="orb"><div class="ring r1"></div><div class="ring r2"></div><div class="mic"><svg viewBox="0 0 24 24"><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zm-7 9h2a5 5 0 0 0 10 0h2a7 7 0 0 1-6 6.9V21h-2v-2.1A7 7 0 0 1 5 12z"/></svg></div>
        <div class="wave">${Array.from({ length: 22 }, (_, i) => `<i style="--h:${(0.3 + 0.7 * Math.abs(Math.sin(i * 1.3))).toFixed(2)}"></i>`).join("")}</div></div>
      <p class="pedido">${pedido.split("").map((c) => `<span class="ch">${c}</span>`).join("")}</p>
      <svg class="net" viewBox="0 0 1920 1080"><line id="vz-l0" x1="480" y1="600" x2="660" y2="600" pathLength="1"/><path id="vz-l1" d="M980 560 C 1060 560 1060 420 1140 420" pathLength="1"/><path id="vz-l2" d="M980 640 C 1060 640 1060 780 1140 780" pathLength="1"/></svg>
      <div class="coord"><b>Coordinador</b><small>Arvantti</small></div>
      <div class="grupo g1"><p class="gt">Coordinador de agentes</p>${AG.map((a, i) => `<span class="ag" id="vz-a${i}"><i></i>${a}</span>`).join("")}</div>
      <div class="grupo g2"><p class="gt">Coordinador de hilos</p>${HI.map(([h], i) => `<div class="hilo" id="vz-h${i}"><span>${h}</span><div class="bar"><i></i></div></div>`).join("")}</div>
      <div class="resp"><div class="dot"></div><p>Resumen listo para la junta.<br><b>1 aprobación pendiente.</b></p><div class="wave sm">${Array.from({ length: 14 }, (_, i) => `<i style="--h:${(0.3 + 0.7 * Math.abs(Math.sin(i * 1.9))).toFixed(2)}"></i>`).join("")}</div></div>
      <p class="lugares">${["Carro", "Celular", "Sala de juntas"].map((l) => `<span>${l}</span>`).join("")}</p>`, 3);
    enter("e-voz", s);
    at("#e-voz .topl", { opacity: 0 }, { opacity: 1, duration: 0.5 }, s + 0.2);
    titleIn("#e-voz .vz-t", x.voiceAt);
    to("#e-voz .vz-t", { opacity: 0, y: -60, duration: 0.5, ease: "power2.in" }, tPi - 0.4);
    at("#e-voz .orb", { opacity: 0, scale: 0.5 }, { opacity: 1, scale: 1, duration: 0.7, ease: "back.out(1.8)" }, tPi - 0.4);
    at("#e-voz .orb .ring", { scale: 1, opacity: 0.8 }, { scale: 1.8, opacity: 0, duration: 1.4, stagger: 0.7, repeat: Math.ceil((tA - tPi) / 1.4) + 1, ease: "power1.out" }, tPi - 0.2);
    at("#e-voz .orb .wave i", { scaleY: 0.15 }, { scaleY: 1, duration: 0.22, stagger: { each: 0.03, from: "center", yoyo: true, repeat: Math.ceil((tA - tPi) / 0.44) }, ease: "sine.inOut" }, tPi);
    at("#e-voz .ch", { opacity: 0 }, { opacity: 1, duration: 0.01, stagger: Math.min(0.03, (tA - tPi - 0.4) / pedido.length) }, tPi + 0.1);
    at("#vz-l0", { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.5 }, tA - 0.6);
    at("#e-voz .coord", { opacity: 0, scale: 0.5 }, { opacity: 1, scale: 1, duration: 0.6, ease: "back.out(1.8)" }, tA - 0.4);
    at("#vz-l1", { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.5 }, tA);
    at("#e-voz .g1", { opacity: 0, x: 60 }, { opacity: 1, x: 0, duration: 0.5, ease: "power3.out" }, tA + 0.1);
    AG.forEach((_, i) => at(`#vz-a${i}`, { opacity: 0, y: 20, scale: 0.8 }, { opacity: 1, y: 0, scale: 1, duration: 0.4, ease: "back.out(2)" }, tA + 0.6 + i * 0.3));
    at("#vz-l2", { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.5 }, tH);
    at("#e-voz .g2", { opacity: 0, x: 60 }, { opacity: 1, x: 0, duration: 0.5, ease: "power3.out" }, tH + 0.1);
    HI.forEach(([, f], i) => {
      at(`#vz-h${i}`, { opacity: 0, x: 30 }, { opacity: 1, x: 0, duration: 0.4 }, tH + 0.4 + i * 0.25);
      at(`#vz-h${i} .bar i`, { scaleX: 0 }, { scaleX: f, duration: tR - tH - 0.2, ease: "power1.inOut" }, tH + 0.5 + i * 0.25);
    });
    at("#e-voz .resp", { opacity: 0, y: 40, scale: 0.9 }, { opacity: 1, y: 0, scale: 1, duration: 0.6, ease: "back.out(1.7)" }, tR);
    at("#e-voz .resp .wave i", { scaleY: 0.15 }, { scaleY: 1, duration: 0.22, stagger: { each: 0.03, from: "center", yoyo: true, repeat: 6 }, ease: "sine.inOut" }, tR + 0.2);
    HI.forEach((_, i) => to(`#vz-h${i} .bar i`, { scaleX: 1, duration: 0.5 }, tR));
    at("#e-voz .lugares span", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.45, stagger: 0.35, ease: "back.out(2)" }, tD);
    sfx(5, "whoosh-short.mp3", s + 0.1, 0.3); sfx("5t", "typing.mp3", tPi + 0.1, 0.15); sfx("5r", "pop.mp3", tR, 0.3);
    leave("e-voz", s + d);
  }

  // 6. Seguridad: cada acción pasa por el guardián antes de ocurrir.
  {
    const x = S.seguridad; const [s, d] = span(x);
    const tG = P(x, "Los guardianes"), tK = P(x, "Los hooks"), tY = P(x, "Y lo sensible");
    const ACC = [["Leer claves de acceso", "BLOQUEADO", "no", tG + 0.3], ["Generar informe de ventas", "PERMITIDO · registrado", "ok", tK + 0.2], ["Publicar en el sitio web", "ESPERA APROBACIÓN", "wait", tY + 0.2]];
    clip("e-seguridad", "scene", s, d, `
      <div class="topl">${kicker("04", "SEGURIDAD DE LOS AGENTES")}</div>
      <h2 class="topt">${words("Nada pasa sin permiso.")}</h2>
      <div class="gate"><div class="beam"></div><div class="shield"><svg viewBox="0 0 24 24"><path d="M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5l-8-3z"/></svg></div><p>Guardián</p></div>
      <div class="hooks">${[0, 1, 2].map((i) => `<span class="hk" id="hk${i}">hook</span>`).join("")}</div>
      ${ACC.map(([a, r, k], i) => `<div class="acc" id="acc${i}" style="top:${330 + i * 190}px">${a}</div><div class="res ${k}" id="res${i}" style="top:${330 + i * 190}px">${r}</div>`).join("")}
      <div class="humano"><span class="av">DO</span><p>Aprobar publicación</p><button>Aprobar</button></div>`, 3);
    enter("e-seguridad", s);
    at("#e-seguridad .topl", { opacity: 0 }, { opacity: 1, duration: 0.5 }, s + 0.2);
    titleIn("#e-seguridad .topt", x.voiceAt);
    at("#e-seguridad .gate", { opacity: 0, scaleY: 0.2 }, { opacity: 1, scaleY: 1, duration: 0.7, ease: "power3.out" }, x.voiceAt + 0.3);
    at("#e-seguridad .beam", { backgroundPositionY: "0px" }, { backgroundPositionY: "600px", duration: d, ease: "none" }, s);
    ACC.forEach(([, , k, t], i) => {
      at(`#acc${i}`, { opacity: 0, x: -400 }, { opacity: 1, x: 0, duration: 0.7, ease: "power3.out" }, t - 0.3);
      to(`#acc${i}`, { x: 40, duration: 0.5, ease: "power2.in" }, t + 0.5);
      if (k === "no") to(`#acc${i}`, { x: 0, borderColor: "#ff6b35", color: "#ff8a5c", duration: 0.25, ease: "power2.out" }, t + 1.0);
      else to(`#acc${i}`, { x: 260, opacity: 0, scale: 0.8, duration: 0.4, ease: "power2.in" }, t + 1.0);
      at(`#res${i}`, { opacity: 0, x: -40, scale: 0.8 }, { opacity: 1, x: 0, scale: 1, duration: 0.45, ease: "back.out(2)" }, t + 1.0);
      tl.push(`tl.to("#e-seguridad .shield",{scale:1.15,boxShadow:"0 0 0 3px ${k === "no" ? "#ff6b35" : k === "ok" ? "#4ea7ff" : "#f5b942"}, 0 0 90px ${k === "no" ? "#ff6b35aa" : k === "ok" ? "#2d7ff9aa" : "#f5b942aa"}",duration:.25,yoyo:true,repeat:1},${(t + 0.9).toFixed(2)});`);
      sfx(`6${i}`, k === "no" ? "hit.wav" : "click.wav", t + 1.0, 0.22);
    });
    at("#e-seguridad .hk", { opacity: 0, scale: 0.5 }, { opacity: 1, scale: 1, duration: 0.35, stagger: 0.25, ease: "back.out(2)" }, tK);
    at("#e-seguridad .humano", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" }, tY + 1.4);
    to("#e-seguridad .humano button", { scale: 0.92, background: "#4ea7ff", duration: 0.15, yoyo: true, repeat: 1 }, Math.min(s + d - 1.0, tY + 2.6));
    sfx(6, "whoosh-short.mp3", s + 0.1, 0.3);
    leave("e-seguridad", s + d);
  }

  // 7. Cerebro empresarial: grafo de conocimiento y respuesta con fuente.
  {
    const x = S.cerebro; const [s, d] = span(x);
    const C = { x: 700, y: 600 };
    const N = [["Decisiones", "decisiones", { x: 700, y: 330 }], ["Clientes", "clientes", { x: 1010, y: 470 }], ["Pedidos", "pedidos", { x: 980, y: 790 }], ["Personas", "personas", { x: 400, y: 760 }], ["Documentos", "personas", { x: 390, y: 450 }]];
    const tR = P(x, "La IA responde"), tI = P(x, "sus datos");
    clip("e-cerebro", "scene", s, d, `
      <div class="topl">${kicker("05", "CEREBRO EMPRESARIAL")}</div>
      <h2 class="topt">${words("La memoria de su empresa.")}</h2>
      <svg class="net" viewBox="0 0 1920 1080">${N.map(([, , p], i) => `<line id="cb-l${i}" x1="${C.x}" y1="${C.y}" x2="${p.x}" y2="${p.y}" pathLength="1"/>`).join("")}<line id="cb-x0" class="dash" x1="1010" y1="470" x2="980" y2="790" pathLength="1"/><line id="cb-x1" class="dash" x1="390" y1="450" x2="700" y2="330" pathLength="1"/></svg>
      <div class="kcore" style="left:${C.x - 110}px;top:${C.y - 110}px"><img src="assets/clips/marca.png" alt=""><b>Cerebro</b></div>
      ${N.map(([n, , p], i) => `<div class="kn" id="cb-n${i}" style="left:${p.x}px;top:${p.y}px">${n}</div>`).join("")}
      <div class="qa"><p class="qq">¿Por qué se aprobó el descuento a este cliente?</p><p class="qr">${words("Lo aprobó la Dirección Comercial en el comité, por volumen anual.", "aw")}</p><p class="src">FUENTE · Acta del comité comercial · Pedido 4471</p></div>
      <div class="infra"><svg viewBox="0 0 24 24"><path d="M6 10V7a6 6 0 1 1 12 0v3h1v12H5V10h1zm2 0h8V7a4 4 0 1 0-8 0v3z"/></svg><p>Sus datos, en su infraestructura</p></div>`, 3);
    enter("e-cerebro", s);
    at("#e-cerebro .topl", { opacity: 0 }, { opacity: 1, duration: 0.5 }, s + 0.2);
    titleIn("#e-cerebro .topt", x.voiceAt);
    at("#e-cerebro .kcore", { opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1, duration: 0.7, ease: "back.out(1.8)" }, P(x, "Un cerebro") - 0.2);
    N.forEach(([, w], i) => {
      const t = P(x, w) + (i === 4 ? 0.4 : 0);
      at(`#cb-l${i}`, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.5, ease: "power2.out" }, t - 0.1);
      at(`#cb-n${i}`, { opacity: 0, scale: 0.5, xPercent: -50, yPercent: -50 }, { opacity: 1, scale: 1, xPercent: -50, yPercent: -50, duration: 0.45, ease: "back.out(2)" }, t);
      sfx(`7${i}`, "pop.mp3", t, 0.14);
    });
    at("#cb-x0, #cb-x1", { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.6 }, P(x, "personas") + 0.6);
    at("#e-cerebro .qa", { opacity: 0, x: 80 }, { opacity: 1, x: 0, duration: 0.6, ease: "power3.out" }, tR - 0.4);
    at("#e-cerebro .aw", { opacity: 0, filter: "blur(6px)" }, { opacity: 1, filter: "blur(0px)", duration: 0.25, stagger: 0.08 }, tR);
    at("#e-cerebro .src", { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.4 }, P(x, "con fuente"));
    tl.push(`tl.to("#e-cerebro .src",{boxShadow:"0 0 0 2px #4ea7ff, 0 0 40px #2d7ff988",duration:.3,yoyo:true,repeat:1},${(P(x, "con fuente") + 0.4).toFixed(2)});`);
    at("#e-cerebro .infra", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.5, ease: "back.out(1.8)" }, tI);
    sfx(7, "whoosh-short.mp3", s + 0.1, 0.3);
    leave("e-cerebro", s + d);
  }

  // 8. Auditoría: el registro real del Shell, un comprobante y la norma.
  {
    const x = S.auditoria; const [s, d] = span(x);
    const tQ = ["quién", "qué,", "con qué", "cuándo"].map((w) => P(x, w)), tE = P(x, "Evidencia");
    clip("e-auditoria", "scene", s, d, `
      <div class="top">${kicker("06", "LOG DE AUDITORÍA")}<h2 class="mid">${words("Cada acción deja un comprobante.")}</h2></div>
      <div class="wide">${device("au", [{ src: "assets/tomas/v3-auditoria.png" }])}</div>
      <div class="recibo"><p class="rh">COMPROBANTE · AUD-0008</p>
        <div class="rr" id="rr0"><span>Quién</span><b>Arvantti Architect</b></div>
        <div class="rr" id="rr1"><span>Qué</span><b>Decisión actualizada</b></div>
        <div class="rr" id="rr2"><span>Con qué</span><b>Claude (declarado)</b></div>
        <div class="rr" id="rr3"><span>Cuándo</span><b>14:11 UTC</b></div>
        <p class="sello">SOLO SE AGREGA · NO SE BORRA</p></div>
      <div class="iso"><svg viewBox="0 0 24 24"><path d="M12 1 3 5v6c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V5l-9-4zm-1.5 15.5-4-4 1.4-1.4 2.6 2.6 5.6-5.6 1.4 1.4-7 7z"/></svg><div><b>ISO/IEC 42001</b><span>Evidencia lista para la certificación</span></div></div>`, 3);
    enter("e-auditoria", s);
    at("#e-auditoria .kicker", { opacity: 0, y: -20 }, { opacity: 1, y: 0, duration: 0.5 }, s + 0.2);
    titleIn("#e-auditoria .mid", x.voiceAt);
    at("#au-dev", { rotateX: 30, y: 300, opacity: 0 }, { rotateX: 8, y: 0, opacity: 1, duration: 1.2, ease: "power3.out" }, s + 0.1);
    at("#au-s0 img", { scale: 1.25, x: 0, y: 0 }, { scale: 1.6, x: 180, y: 70, duration: tQ[0] - s, ease: "sine.inOut" }, s);
    to("#au-s0 img", { scale: 1.3, x: 40, y: 20, duration: s + d - tQ[0], ease: "sine.inOut" }, tQ[0]);
    at("#e-auditoria .recibo", { opacity: 0, x: 100 }, { opacity: 1, x: 0, duration: 0.6, ease: "power3.out" }, P(x, "comprobante"));
    tQ.forEach((t, i) => {
      at(`#rr${i}`, { opacity: 0.15 }, { opacity: 1, duration: 0.3 }, t);
      tl.push(`tl.to("#rr${i}",{background:"#12305a",duration:.25,yoyo:true,repeat:1},${t.toFixed(2)});`);
    });
    at("#e-auditoria .sello", { opacity: 0, scale: 1.6, rotate: -8 }, { opacity: 1, scale: 1, rotate: -4, duration: 0.4, ease: "back.out(2)" }, P(x, "no se puede borrar"));
    at("#e-auditoria .iso", { opacity: 0, y: 60, scale: 0.9 }, { opacity: 1, y: 0, scale: 1, duration: 0.7, ease: "back.out(1.6)" }, tE);
    at("#au-sheen", { xPercent: -100 }, { xPercent: 200, duration: 1.4, ease: "power2.inOut" }, tE + 0.2);
    sfx(8, "whoosh-short.mp3", s + 0.1, 0.3); sfx("8s", "hit.wav", P(x, "no se puede borrar"), 0.2); sfx("8i", "spark.wav", tE, 0.25);
    leave("e-auditoria", s + d);
  }

  // 9. Cierre.
  {
    const x = S.cierre; const [s, d] = span(x);
    const tD = P(x, "La IA");
    clip("e-cierre", "scene", s, d, `
      <svg class="estela" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice"><path id="p2" d="M-60 470 C 380 470 560 690 960 560 S 1520 430 1980 640" pathLength="1"/></svg>
      <div class="fin"><img class="marca" src="assets/clips/marca.png" alt=""><h1>Arvantti Harness<sup>®</sup></h1><p class="firma">La IA bajo su gobierno.</p><p class="url">arvantti.tech</p></div>`, 3);
    enter("e-cierre", s);
    at("#p2", { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 1.8, ease: "power2.inOut" }, s);
    to("#p2", { opacity: 0.2, duration: 1 }, s + 1.8);
    at("#e-cierre .marca", { opacity: 0, scale: 0.5, rotate: -8 }, { opacity: 1, scale: 1, rotate: 0, duration: 1, ease: "back.out(1.6)" }, x.voiceAt - 0.3);
    at("#e-cierre h1", { opacity: 0, letterSpacing: "30px", filter: "blur(10px)" }, { opacity: 1, letterSpacing: "2px", filter: "blur(0px)", duration: 1.2, ease: "power3.out" }, x.voiceAt);
    at("#e-cierre .firma", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.8, ease: "power3.out" }, tD);
    at("#e-cierre .url", { opacity: 0 }, { opacity: 1, duration: 0.8 }, tD + 1.0);
    to("#e-cierre .fin", { opacity: 0, duration: 1.0 }, s + d - 1.0);
    sfx(9, "hit.wav", x.voiceAt, 0.3);
  }

  [S.titulo, S.ia, S.voz, S.seguridad, S.auditoria, S.cierre].forEach((x) => sweep(x.start));

  escenas.forEach((x) => { if (x.real) audio(`voz-${x.id}`, `escenas/${x.dir}/assets/audio/voiceover.mp3`, x.voiceAt, x.voz, 1); });
  const epica = mezclaMusica(escenas, total);
  if (epica) audio("musica", epica, 0, total, 0.55);
  if (temporal) html.push(`<div id="temp" class="clip" data-start="0" data-duration="${total.toFixed(2)}" data-track-index="50">SIN VOZ · TIEMPOS ESTIMADOS</div>`);

  const out = fs.readFileSync(T("plantilla.html"), "utf8")
    .replaceAll("{{TOTAL}}", total.toFixed(2))
    .replace("{{CLIPS}}", html.join("\n"))
    .replace("{{TIMELINE}}", tl.join("\n"));
  fs.writeFileSync(T("index.html"), out);
  fs.writeFileSync(T("tiempos.json"), JSON.stringify(escenas.map(({ id, start, voiceAt, voz, dur, real }) => ({ id, start: +start.toFixed(2), voiceAt: +voiceAt.toFixed(2), voz: +voz.toFixed(2), dur: +dur.toFixed(2), real })), null, 1));
  console.log(`index.html: ${total.toFixed(1)} s${temporal ? " (tiempos estimados, falta voz)" : ""}`);
}

function render(v = "v001") {
  fs.mkdirSync(T("out"), { recursive: true });
  const out = T(`out/harness-${v}.mp4`);
  execFileSync("pnpm", ["dlx", "hyperframes@0.9.9", "render", "-o", out, "--fps", String(FPS), "--quality", process.env.QUALITY || "standard", "--video-frame-format", "png", ...(process.env.HF_ARGS ? process.env.HF_ARGS.split(" ") : [])], { cwd: HERE, stdio: "inherit" });
  console.log(out);
}

const [cmd, arg] = process.argv.slice(2);
const cmds = { preparar, voz, musica, componer, render: () => render(arg), tiempos: () => console.log(JSON.stringify(tiempos(), null, 1)) };
if (!cmds[cmd]) {
  console.log("Uso: node armar.mjs preparar | voz [--enviar] | musica [--enviar] | componer | render [vNNN] | tiempos");
  process.exit(1);
}
await cmds[cmd]();
