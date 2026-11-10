#!/usr/bin/env node
/**
 * Video vertical C-Level de Arvantti Harness (1080x1920, ~95 s): beneficios para la alta dirección, sin jerga técnica.
 *
 *   node armar.mjs preparar         marca del logo y música de respaldo (sintetizada)
 *   node armar.mjs voz [--enviar]   voz de las escenas nuevas o cambiadas (ElevenLabs con tiempos por carácter)
 *   node armar.mjs componer         mide la voz de cada escena (o la estima) y escribe index.html
 *   node armar.mjs render [vNNN]    renderiza out/harness-clevel-<vNNN>.mp4
 */
import { execFileSync, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const T = (p) => path.join(HERE, p);
const FPS = 25;
const W = 1080, H = 1920;
const sh = (cmd, args) => execFileSync(cmd, args, { stdio: "inherit" });

// Escenas en orden: id, carpeta de la voz y colas (segundos antes y después de la voz).
const ESCENAS = [
  { id: "gancho", dir: "01-gancho", lead: 1.0, tail: 0.8 },
  { id: "riesgo", dir: "02-riesgo", lead: 0.4, tail: 0.8 },
  { id: "quees", dir: "03-que-es", lead: 0.4, tail: 0.9 },
  { id: "control", dir: "04-control", lead: 0.4, tail: 0.8 },
  { id: "seguridad", dir: "05-seguridad", lead: 0.4, tail: 0.9 },
  { id: "eficiencia", dir: "06-eficiencia", lead: 0.4, tail: 0.9 },
  { id: "conocimiento", dir: "07-conocimiento", lead: 0.4, tail: 0.9 },
  { id: "direccion", dir: "08-direccion", lead: 0.4, tail: 1.0 },
  { id: "cierre", dir: "09-cierre", lead: 0.6, tail: 4.0 },
];

const texto = (e) => fs.readFileSync(T(`escenas/${e.dir}/script.md`), "utf8").trim();
const vozDe = (e) => T(`escenas/${e.dir}/assets/audio/voiceover.mp3`);
const alineacionDe = (e) => T(`escenas/${e.dir}/assets/audio/alignment.json`);

// Palabras que la voz en español lee mal. "Harness" va tal cual: "Járnes" a veces sale "yarnes" (ver README).
const PRONUNCIA = [];
/** Texto que se envía a la voz y, para cada carácter del original, su posición en ese texto. */
function paraVoz(texto, e = {}) {
  const tabla = PRONUNCIA.map(([a, b]) => (a === "Harness" && e.harness ? [a, e.harness] : [a, b]));
  let out = "", idx = [];
  for (let i = 0; i < texto.length; ) {
    const p = tabla.find(([a]) => texto.startsWith(a, i) && !/\p{L}/u.test(texto[i - 1] || "") && !/\p{L}/u.test(texto[i + a.length] || ""));
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

/** Voz de cada escena con /with-timestamps. Solo envía las escenas cuyo texto cambió. Sin --enviar, solo muestra qué enviaría. */
async function voz() {
  const enviar = process.argv.includes("--enviar");
  const pend = ESCENAS.filter((e) => {
    const a = alineacionDe(e);
    return !(fs.existsSync(vozDe(e)) && fs.existsSync(a) && JSON.parse(fs.readFileSync(a, "utf8")).hash === hash(`${modelo()}|${paraVoz(texto(e), e).texto}`));
  });
  console.log(`Voz: ${pend.length} escenas nuevas o cambiadas, ${pend.reduce((n, e) => n + paraVoz(texto(e), e).texto.length, 0)} caracteres (modelo ${modelo()}).`);
  if (!pend.length) return;
  if (!enviar) {
    pend.forEach((e) => console.log(`- ${e.dir}: ${paraVoz(texto(e), e).texto}`));
    console.log("ElevenLabs recibirá estos textos. Para enviarlos: node armar.mjs voz --enviar");
    return;
  }
  const { apiKey, voiceId } = credenciales();
  for (const e of pend) {
    const txt = texto(e), pv = paraVoz(txt, e);
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
    if (a && pv.texto !== txt && a.characters?.length === pv.texto.length) a = { characters: [...txt], character_start_times_seconds: pv.idx.map((k) => a.character_start_times_seconds[k]) };
    fs.writeFileSync(alineacionDe(e), `${JSON.stringify({ hash: hash(`${modelo()}|${pv.texto}`), modelo: modelo(), texto: txt, alignment: a })}\n`);
    console.log(`${e.dir}: ${duracion(vozDe(e)).toFixed(1)} s`);
  }
}

/** Música original (ElevenLabs Music, texto en musica-prompt.txt), un poco más larga que el video. */
async function musica() {
  const out = T("assets/clips/musica-epica.mp3");
  if (fs.existsSync(out)) return console.log("Ya existe assets/clips/musica-epica.mp3.");
  const prompt = fs.readFileSync(T("musica-prompt.txt"), "utf8").trim();
  const ms = Math.min(300000, Math.round((Math.ceil(tiempos().total) + 1) * 1000));
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
  let t = 0, temporal = false;
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

/** Segundo (absoluto) en que la voz llega a un fragmento del texto. */
function enPalabra(x, frag) {
  const i = x.txt.indexOf(frag);
  if (i < 0) throw new Error(`"${frag}" no está en ${x.id}`);
  if (x.real && fs.existsSync(alineacionDe(x))) {
    const j = JSON.parse(fs.readFileSync(alineacionDe(x), "utf8"));
    const a = j.alignment;
    if (j.texto === x.txt && a?.character_start_times_seconds?.length === x.txt.length) return +(x.voiceAt + a.character_start_times_seconds[i]).toFixed(2);
  }
  return +(x.voiceAt + (i / x.txt.length) * x.voz).toFixed(2);
}

const MARCA = `import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert("RGB").crop((560, 150, 980, 500))
out = Image.new("RGBA", im.size)
out.putdata([(r, g, b, max(0, min(255, int((max(r, g, b) - 40) * 255 / 70)))) for r, g, b in im.getdata()])
out.save(sys.argv[2])`;

function preparar() {
  const clips = T("assets/clips");
  fs.mkdirSync(clips, { recursive: true });
  sh("python3", ["-I", "-c", MARCA, T("assets/shared/arvantti/branding/ArvanttiLabsLogo.png"), path.join(clips, "marca.png")]);
  // Música de respaldo: acorde suave que respira con un pulso grave (sintetizada, sin licencia de terceros).
  const { total } = tiempos();
  const d = Math.ceil(total) + 2;
  const pad = "0.10*sin(2*PI*110*t)+0.07*sin(2*PI*164.81*t)+0.06*sin(2*PI*220*t)+0.05*sin(2*PI*277.18*t)+0.035*sin(2*PI*329.63*t)";
  const expr = `(${pad})*(0.75+0.25*sin(2*PI*t/8))+0.06*sin(2*PI*55*t)*exp(-mod(t,2)*3)`;
  sh("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", `aevalsrc='${expr}|${expr}':s=48000:d=${d}`, "-af", `lowpass=f=1800,aecho=0.8:0.7:400|700:0.25|0.18,afade=t=in:d=3,afade=t=out:st=${d - 4}:d=4,volume=0.9`, "-c:a", "libmp3lame", "-q:a", "2", path.join(clips, "musica.mp3")]);
  console.log("listo: assets/clips/");
}

/** Música (assets/clips/musica-epica.mp3 si existe; si no, la sintetizada) que baja sola cuando habla la voz. */
function mezclaMusica(escenas, total) {
  const src = fs.existsSync(T("assets/clips/musica-epica.mp3")) ? T("assets/clips/musica-epica.mp3") : T("assets/clips/musica.mp3");
  if (!fs.existsSync(src)) return null;
  const voces = escenas.filter((x) => x.real);
  if (!voces.length) return null;
  const args = ["-y", "-v", "error", "-i", src];
  voces.forEach((x) => args.push("-i", vozDe(x)));
  const del = voces.map((x, i) => `[${i + 1}:a]adelay=${Math.round(x.voiceAt * 1000)}:all=1,aformat=sample_rates=48000:channel_layouts=stereo[v${i}]`).join(";");
  const f = `${del};${voces.map((_, i) => `[v${i}]`).join("")}amix=inputs=${voces.length}:normalize=0,apad=whole_dur=${total.toFixed(2)}[vz];` +
    `[0:a]aformat=sample_rates=48000:channel_layouts=stereo,apad,atrim=0:${total.toFixed(2)},afade=t=out:st=${Math.max(0, total - 3).toFixed(2)}:d=3[m];` +
    `[m][vz]sidechaincompress=threshold=0.03:ratio=8:attack=40:release=600:makeup=1[out]`;
  args.push("-filter_complex", f, "-map", "[out]", "-c:a", "libmp3lame", "-q:a", "2", T("assets/clips/musica-mezcla.mp3"));
  execFileSync("ffmpeg", args, { stdio: "inherit" });
  return "assets/clips/musica-mezcla.mp3";
}

// ---------------------------------------------------------------- composición
const words = (s, cls = "w") => s.split(" ").map((w) => `<span class="${cls}">${w}</span>`).join(" ");
const ICON = {
  key: `<svg viewBox="0 0 120 120"><circle cx="38" cy="60" r="22"/><path d="M60 60 H108 M92 60 V78 M104 60 V74"/></svg>`,
  choque: `<svg viewBox="0 0 120 120"><path d="M20 20 L58 58 M100 20 L62 58 M60 66 L60 104 M40 84 L80 84"/></svg>`,
  duda: `<svg viewBox="0 0 120 120"><path d="M40 42 C40 18 82 18 82 42 C82 60 60 60 60 76"/><circle cx="60" cy="98" r="3"/></svg>`,
};

function componer() {
  const { escenas, total, temporal } = tiempos();
  const S = Object.fromEntries(escenas.map((x) => [x.id, x]));
  const html = [];
  const tl = [];
  const at = (sel, from, to, t) => tl.push(`tl.fromTo(${JSON.stringify(sel)},${JSON.stringify(from)},${JSON.stringify(to)},${(+t).toFixed(2)});`);
  const to = (sel, v, t) => tl.push(`tl.to(${JSON.stringify(sel)},${JSON.stringify(v)},${(+t).toFixed(2)});`);
  const clip = (id, cls, start, dur, inner, z = 2) => html.push(`<div id="${id}" class="clip ${cls}" data-start="${start.toFixed(2)}" data-duration="${dur.toFixed(2)}" data-track-index="${z}">${inner}</div>`);
  const audio = (id, src, start, dur, vol) => html.push(`<audio id="${id}" src="${src}" data-start="${start.toFixed(2)}" data-duration="${dur.toFixed(2)}" data-volume="${vol}" data-track-index="${20 + html.length}"></audio>`);
  const sfx = (n, file, t, vol = 0.3) => audio(`sfx-${n}`, `assets/shared/core/sfx/${file}`, t, 1.4, vol);
  const X = 0.5;
  const span = (x) => [Math.max(0, x.start - (x.id === "gancho" ? 0 : X / 2)), x.dur + (x.id === "gancho" ? 0 : X / 2) + X / 2];
  const enter = (id, t) => at(`#${id}`, { opacity: 0, filter: "blur(18px)" }, { opacity: 1, filter: "blur(0px)", duration: X, ease: "power2.out" }, t);
  const leave = (id, t) => to(`#${id}`, { opacity: 0, filter: "blur(14px)", duration: X, ease: "power2.in" }, t - X / 2);
  const pop = (sel, t, extra = {}) => at(sel, { opacity: 0, y: 40, scale: 0.92 }, { opacity: 1, y: 0, scale: 1, duration: 0.55, ease: "back.out(1.8)", ...extra }, t);
  let nSweep = 0;
  const sweep = (t) => {
    const id = `sweep-${nSweep++}`;
    clip(id, "sweep", t - 0.35, 0.9, "", 40);
    at(`#${id}`, { xPercent: -120 }, { xPercent: 120, duration: 0.9, ease: "power2.inOut" }, t - 0.35);
  };
  // Encabezado de cada idea: número, palabra grande y frase corta.
  const head = (n, nombre, sub) => `<div class="head"><p class="kicker"><b>${n} de 5</b>ARVANTTI HARNESS</p><h1 class="idea">${nombre}</h1><p class="sub">${sub}</p></div>`;
  const headIn = (id, x, word) => {
    at(`#${id} .kicker`, { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 0.5, ease: "power3.out" }, x.start + 0.1);
    at(`#${id} .idea`, { opacity: 0, letterSpacing: "30px", filter: "blur(12px)" }, { opacity: 1, letterSpacing: "-4px", filter: "blur(0px)", duration: 0.9, ease: "power3.out" }, enPalabra(x, word) - 0.1);
    at(`#${id} .idea`, { backgroundPosition: "-200% 0" }, { backgroundPosition: "200% 0", duration: 1.8, ease: "power1.inOut" }, enPalabra(x, word) + 0.6);
    at(`#${id} .sub`, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, enPalabra(x, word) + 0.5);
  };

  // Fondo permanente.
  clip("fondo", "fondo", 0, total, `<div class="glow"></div><div class="floor"><div class="floorgrid"></div></div>`, 0);
  at("#fondo .floorgrid", { backgroundPositionY: "0px" }, { backgroundPositionY: `${Math.round(total * 40)}px`, duration: total, ease: "none" }, 0);
  at("#fondo .glow", { opacity: 0.5 }, { opacity: 1, duration: 6, ease: "sine.inOut", yoyo: true, repeat: Math.floor(total / 6) }, 0);

  // 1. Gancho: la empresa, con asistentes de IA trabajando solos alrededor.
  {
    const x = S.gancho; const [s, d] = span(x);
    const ags = [["Claude Code", 150, 720], ["Codex", 690, 760], ["Gemini", 110, 1080], ["Copilot", 720, 1110], ["OpenCode", 400, 1300]];
    clip("e-gancho", "scene", s, d, `
      <h2 class="gt"><span class="kicker">ARVANTTI HARNESS</span>${words("Tu empresa ya usa IA")}</h2>
      <div class="edif"><svg viewBox="0 0 360 400"><path d="M40 390 V120 L180 30 L320 120 V390 Z"/>${[0, 1, 2].map((r) => [0, 1, 2].map((c) => `<rect x="${88 + c * 70}" y="${150 + r * 70}" width="44" height="44"/>`).join("")).join("")}<rect x="150" y="330" width="60" height="60"/></svg></div>
      ${ags.map(([n, lx, ty], i) => `<div class="agent" id="ag${i}" style="left:${lx}px;top:${ty}px"><span class="tag">${n}</span><span class="cur"></span></div>`).join("")}
      <h2 class="q">${words("¿Quién la gobierna?")}</h2>`, 3);
    at("#e-gancho .gt .kicker", { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 0.5, ease: "power3.out" }, s + 0.05);
    at("#e-gancho .gt .w", { opacity: 0, y: 30, filter: "blur(10px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.5, stagger: 0.1, ease: "power3.out" }, x.voiceAt - 0.1);
    at("#e-gancho .edif", { opacity: 0, y: 60 }, { opacity: 1, y: 0, duration: 0.8, ease: "power3.out" }, s + 0.2);
    at("#e-gancho .edif rect", { fill: "#0d1a30" }, { fill: "#4ea7ff", duration: 0.2, stagger: { each: 0.15, from: "random" } }, x.voiceAt + 0.4);
    ags.forEach((_, i) => {
      at(`#ag${i}`, { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.4, ease: "back.out(2)" }, x.voiceAt + 0.8 + i * 0.25);
      at(`#ag${i}`, { x: 0, y: 0 }, { x: i % 2 ? -50 : 50, y: i % 3 ? 20 : -20, duration: 0.9, ease: "sine.inOut", yoyo: true, repeat: 5 }, x.voiceAt + 1.2 + i * 0.25);
    });
    at("#e-gancho .cur", { opacity: 1 }, { opacity: 0.1, duration: 0.25, yoyo: true, repeat: Math.ceil(d / 0.5) }, s);
    const tQ = enPalabra(x, "¿quién");
    at("#e-gancho .q .w", { opacity: 0, y: 40, filter: "blur(14px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.6, stagger: 0.14, ease: "power3.out" }, tQ);
    sfx(1, "typing.mp3", x.voiceAt + 0.8, 0.15); sfx("1q", "hit.wav", tQ, 0.25);
    leave("e-gancho", s + d);
  }

  // 2. Riesgo: tres indicadores en rojo que suben.
  {
    const x = S.riesgo; const [s, d] = span(x);
    const ind = [["Fugas de información", "filtrar"], ["Costos ocultos", "gastar de más"], ["Decisiones sin rastro", "decisiones"]];
    clip("e-riesgo", "scene", s, d, `
      <div class="head"><h2 class="big">${words("Sin reglas, la IA es un riesgo.")}</h2></div>
      ${ind.map(([t], i) => `<div class="ind" id="in${i}" style="top:${760 + i * 230}px"><p>${t}</p><div class="barra"><i></i></div><b class="pct">▲</b></div>`).join("")}
      <p class="aviso">${words("Ese riesgo ya está en tu operación.")}</p>`, 3);
    enter("e-riesgo", s);
    at("#e-riesgo .big .w", { opacity: 0, y: 40, filter: "blur(10px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.5, stagger: 0.07, ease: "power3.out" }, x.voiceAt);
    ind.forEach(([, w], i) => {
      const t = enPalabra(x, w);
      at(`#in${i}`, { opacity: 0, x: 100 }, { opacity: 1, x: 0, duration: 0.5, ease: "back.out(1.6)" }, t - 0.2);
      at(`#in${i} .barra i`, { scaleX: 0.1 }, { scaleX: 0.85 + i * 0.05, duration: 1.4, ease: "power2.out" }, t);
      sfx(`2${i}`, "click.wav", t, 0.25);
    });
    const tA = enPalabra(x, "Ese riesgo");
    at("#e-riesgo .aviso .w", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.4, stagger: 0.06 }, tA);
    tl.push(`tl.to("#e-riesgo .ind",{boxShadow:"0 0 80px #ff4d5e77",duration:.35,yoyo:true,repeat:3},${tA.toFixed(2)});`);
    leave("e-riesgo", s + d);
  }

  // 3. Qué es: indicadores en verde; Harness al centro con las herramientas conectadas.
  {
    const x = S.quees; const [s, d] = span(x);
    const ags = ["Claude Code", "Codex", "Gemini", "Copilot", "OpenCode", "Modelos locales"];
    const core = { x: 540, y: 1100 };
    const pos = ags.map((n, i) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / ags.length; return { n, x: Math.round(core.x + 340 * Math.cos(a)), y: Math.round(core.y + 300 * Math.sin(a)) }; });
    clip("e-quees", "scene", s, d, `
      <div class="titulo"><h1>Arvantti <span>Harness®</span></h1><p>${words("Gobierno de IA para tu empresa")}</p></div>
      <svg class="net" viewBox="0 0 ${W} ${H}">${pos.map((p, i) => `<line id="q-l${i}" x1="${p.x}" y1="${p.y}" x2="${core.x}" y2="${core.y}" pathLength="1"/>`).join("")}</svg>
      ${pos.map((p, i) => `<div class="node ag" id="q-a${i}" style="left:${p.x - 140}px;top:${p.y - 38}px;width:280px;height:76px">${p.n}</div>`).join("")}
      <div class="core" style="left:${core.x - 140}px;top:${core.y - 140}px;width:280px;height:280px"><img src="assets/clips/marca.png" alt=""><b>Harness</b><span>GOBIERNO</span></div>
      <div class="verdes">${["Control", "Seguridad", "Trazabilidad"].map((c) => `<span class="chip ok">✓ ${c}</span>`).join("")}</div>`, 3);
    enter("e-quees", s);
    at("#e-quees .titulo h1", { opacity: 0, letterSpacing: "30px", filter: "blur(12px)" }, { opacity: 1, letterSpacing: "-3px", filter: "blur(0px)", duration: 1.1, ease: "power3.out" }, x.voiceAt - 0.1);
    const tC = enPalabra(x, "la capa de gobierno");
    at("#e-quees .titulo .w", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.4, stagger: 0.08 }, tC);
    at("#e-quees .core", { opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1, duration: 0.8, ease: "back.out(1.7)" }, tC);
    tl.push(`tl.to("#e-quees .core",{boxShadow:"0 0 0 4px #4ea7ff, 0 0 140px #2d7ff9cc",duration:.6,yoyo:true,repeat:1},${(tC + 0.8).toFixed(2)});`);
    const tF = enPalabra(x, "Funciona con");
    at("#e-quees .ag", { opacity: 0, scale: 0.7 }, { opacity: 1, scale: 1, duration: 0.4, stagger: 0.1, ease: "back.out(2)" }, tF - 0.2);
    pos.forEach((_, i) => at(`#q-l${i}`, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.5, ease: "power2.out" }, tF + 0.2 + i * 0.1));
    ["Control", "Seguridad", "Trazabilidad"].forEach((_, i) => pop(`#e-quees .verdes .chip:nth-child(${i + 1})`, enPalabra(x, "ya usa") + i * 0.25));
    sfx(3, "whoosh.wav", s, 0.3); sfx("3c", "hit.wav", tC, 0.3);
    leave("e-quees", s + d);
  }

  // 4. Control: nada sin permiso; lo crítico lo aprueba una persona.
  {
    const x = S.control; const [s, d] = span(x);
    clip("e-control", "scene", s, d, `
      ${head(1, "Control", "Nada sin permiso.")}
      <div class="card solicitud"><h3>SOLICITUD DE LA IA</h3><p>Publicar cambio en el sistema de pagos</p><span class="tag rojo">CRÍTICO · requiere aprobación</span>
        <svg class="lock" viewBox="0 0 110 130"><rect x="10" y="56" width="90" height="66" rx="6"/><path class="arco" d="M28 56 V36 C28 6 82 6 82 36 V56"/></svg></div>
      <div class="aprobar">APROBAR</div>
      <svg class="mano" viewBox="0 0 110 110"><circle cx="55" cy="55" r="40" fill="#ffffff22" stroke="#fff" stroke-width="5"/></svg>
      <p class="firmado">Aprobado por: Gerencia · 10:44</p>`, 3);
    enter("e-control", s);
    headIn("e-control", x, "Control");
    at("#e-control .solicitud", { opacity: 0, y: 60 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, enPalabra(x, "Ninguna") - 0.1);
    const tC = enPalabra(x, "lo crítico");
    at("#e-control .aprobar", { opacity: 0, scale: 0.7 }, { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(2)" }, tC - 0.2);
    const tP = enPalabra(x, "una persona");
    at("#e-control .mano", { opacity: 0, x: 120, y: 120 }, { opacity: 1, x: 0, y: 0, duration: 0.5, ease: "power3.out" }, tP - 0.5);
    to("#e-control .aprobar", { scale: 0.92, background: "#37e38b", duration: 0.15, yoyo: true, repeat: 1 }, tP);
    tl.push(`tl.to("#e-control .aprobar",{background:"#1f9d5c",boxShadow:"0 0 90px #37e38b",duration:.4},${(tP + 0.3).toFixed(2)});`);
    to("#e-control .lock .arco", { y: -14, duration: 0.4, ease: "back.out(2)" }, tP + 0.3);
    at("#e-control .firmado", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.5 }, tP + 0.5);
    sfx(4, "whoosh-short.mp3", s, 0.3); sfx("4y", "click.wav", tP, 0.35);
    leave("e-control", s + d);
  }

  // 5. Seguridad: escudo sobre los datos; recibos con quién, qué y cuándo.
  {
    const x = S.seguridad; const [s, d] = span(x);
    const rec = [["Gerencia", "aprobó publicar pagos", "10:44"], ["Agente de ventas", "consultó reporte mensual", "10:46"]];
    clip("e-seguridad", "scene", s, d, `
      ${head(2, "Seguridad", "Y trazabilidad.")}
      <svg class="escudo chico" viewBox="0 0 300 340"><path d="M150 14 L276 60 V160 C276 250 214 304 150 328 C86 304 24 250 24 160 V60 Z"/><path class="chk" d="M96 172 L136 212 L210 130"/></svg>
      <div class="datos">${["Datos de clientes", "Claves", "Contratos"].map((t) => `<span class="chip ok">🔒 ${t}</span>`).join("")}</div>
      ${rec.map((r, i) => `<div class="card recibo2" id="rc${i}" style="top:${1080 + i * 190}px">${["Quién", "Qué", "Cuándo"].map((k, j) => `<div class="f f${j}"><b>${k}</b><span>${r[j]}</span></div>`).join("")}</div>`).join("")}
      <span class="sello">LISTO PARA AUDITORÍA</span>`, 3);
    enter("e-seguridad", s);
    headIn("e-seguridad", x, "Seguridad");
    const tD = enPalabra(x, "Tus datos");
    at("#e-seguridad .escudo", { opacity: 0, scale: 0.5 }, { opacity: 1, scale: 1, duration: 0.7, ease: "back.out(1.7)" }, tD - 0.2);
    at("#e-seguridad .escudo .chk", { opacity: 0 }, { opacity: 1, duration: 0.4 }, tD + 0.4);
    ["Tus datos", "tus claves", "no salen"].forEach((w, i) => pop(`#e-seguridad .datos .chip:nth-child(${i + 1})`, enPalabra(x, w)));
    const tR = enPalabra(x, "cada acción");
    rec.forEach((_, i) => at(`#rc${i}`, { opacity: 0, y: -200 }, { opacity: 1, y: 0, duration: 0.6, ease: "bounce.out" }, tR + i * 0.4));
    [["quién", 0], ["qué y", 1], ["cuándo", 2]].forEach(([w, j]) => tl.push(`tl.to("#e-seguridad .recibo2 .f${j} b",{color:"#ffffff",textShadow:"0 0 18px #4ea7ff",duration:.3,yoyo:true,repeat:1},${enPalabra(x, w).toFixed(2)});`));
    const tA = enPalabra(x, "listo para auditoría");
    at("#e-seguridad .sello", { opacity: 0, scale: 2, rotate: -14 }, { opacity: 1, scale: 1, rotate: -6, duration: 0.4, ease: "power4.in" }, tA);
    sfx(5, "whoosh-short.mp3", s, 0.3); sfx("5a", "hit.wav", tA + 0.4, 0.3);
    leave("e-seguridad", s + d);
  }

  // 6. Eficiencia: el gasto baja y el avance sube.
  {
    const x = S.eficiencia; const [s, d] = span(x);
    clip("e-eficiencia", "scene", s, d, `
      ${head(3, "Eficiencia", "Menos gasto, más velocidad.")}
      <div class="medidor" id="mg"><p>Gasto en IA</p><div class="barra"><i></i></div><b>▼</b></div>
      <div class="medidor ok" id="ma"><p>Avance de proyectos</p><div class="barra"><i></i></div><b>▲</b></div>
      <div class="ciclo">${["Planear", "Asignar", "Seguir", "Cerrar"].map((p, i) => `<span class="etapa" id="et${i}">${p}</span>`).join('<span class="sep">→</span>')}</div>`, 3);
    enter("e-eficiencia", s);
    headIn("e-eficiencia", x, "Eficiencia");
    const t1 = enPalabra(x, "solo usa");
    at("#mg", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.5 }, t1 - 0.3);
    at("#mg .barra i", { scaleX: 0.9 }, { scaleX: 0.35, duration: 2.4, ease: "power2.inOut" }, t1 + 0.2);
    const t2 = enPalabra(x, "reutiliza");
    at("#ma", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.5 }, t2 - 0.3);
    at("#ma .barra i", { scaleX: 0.2 }, { scaleX: 0.9, duration: 3, ease: "power2.inOut" }, t2 + 0.2);
    [["se planea", 0], ["se asigna", 1], ["se sigue", 2], ["cerrarlo", 3]].forEach(([w, i]) => pop(`#et${i}`, enPalabra(x, w)));
    at("#e-eficiencia .sep", { opacity: 0 }, { opacity: 1, duration: 0.3, stagger: 0.3 }, enPalabra(x, "se planea") + 0.3);
    const tM = enPalabra(x, "Menos gasto");
    tl.push(`tl.to("#e-eficiencia .medidor",{boxShadow:"0 0 70px #37e38b55",duration:.4,yoyo:true,repeat:1},${tM.toFixed(2)});`);
    sfx(6, "whoosh-short.mp3", s, 0.3); sfx("6m", "spark.wav", tM, 0.25);
    leave("e-eficiencia", s + d);
  }

  // 7. Conocimiento: un cerebro que se queda aunque alguien se vaya.
  {
    const x = S.conocimiento; const [s, d] = span(x);
    const C = { x: 540, y: 1000 };
    const nodes = Array.from({ length: 10 }, (_, i) => { const a = (i * 2 * Math.PI) / 10; const r = i % 2 ? 400 : 290; return { x: Math.round(C.x + r * Math.cos(a)), y: Math.round(C.y + r * 0.85 * Math.sin(a)) }; });
    const lab = [["Decisiones", 0], ["Documentos", 4], ["Experiencia", 7]];
    clip("e-conocimiento", "scene", s, d, `
      ${head(4, "Conocimiento", "Un cerebro que se queda.")}
      <svg class="net" viewBox="0 0 ${W} ${H}">${nodes.map((p, i) => `<line class="kl" x1="${p.x}" y1="${p.y}" x2="${C.x}" y2="${C.y}" pathLength="1"/><line class="kl" x1="${p.x}" y1="${p.y}" x2="${nodes[(i + 1) % 10].x}" y2="${nodes[(i + 1) % 10].y}" pathLength="1" style="stroke-width:1.5;opacity:.6"/>`).join("")}</svg>
      ${nodes.map((p, i) => `<i class="gs" id="kn${i}" style="left:${p.x}px;top:${p.y}px"></i>`).join("")}
      ${lab.map(([n, i], k) => `<span class="tag klab" id="kb${k}" style="left:${nodes[i].x}px;top:${nodes[i].y + 24}px">${n}</span>`).join("")}
      <div class="core" id="kc" style="left:${C.x - 140}px;top:${C.y - 140}px;width:280px;height:280px"><img src="assets/clips/marca.png" alt=""><b>Cerebro</b><span>EMPRESARIAL</span></div>
      <div class="persona" id="kp" style="left:930px;top:1330px"><i></i><u></u></div>
      <p class="queda">El conocimiento se queda.</p>`, 3);
    enter("e-conocimiento", s);
    headIn("e-conocimiento", x, "Conocimiento");
    const tD = enPalabra(x, "Las decisiones");
    at("#e-conocimiento .gs", { opacity: 0, scale: 0 }, { opacity: 1, scale: 1, duration: 0.3, stagger: 0.08 }, tD - 0.2);
    [["Las decisiones", 0], ["los documentos", 1], ["la experiencia", 2]].forEach(([w, k]) => pop(`#kb${k}`, enPalabra(x, w)));
    const tF = enPalabra(x, "forman un cerebro");
    at("#e-conocimiento .kl", { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.5, stagger: 0.03 }, tF - 0.3);
    at("#kc", { opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1, duration: 0.7, ease: "back.out(1.7)" }, tF);
    at("#kp", { opacity: 0, scale: 0.5 }, { opacity: 1, scale: 1, duration: 0.4, ease: "back.out(2)" }, tF + 0.8);
    const tV = enPalabra(x, "cuando alguien se va");
    to("#kp", { x: 260, opacity: 0, duration: 1.1, ease: "power2.in" }, tV);
    tl.push(`tl.to("#kc",{boxShadow:"0 0 0 4px #37e38b, 0 0 140px #37e38b99",duration:.5,yoyo:true,repeat:1},${(tV + 0.9).toFixed(2)});`);
    at("#e-conocimiento .queda", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.6 }, tV + 0.9);
    sfx(7, "whoosh-short.mp3", s, 0.3); sfx("7c", "pop.mp3", tF, 0.25);
    leave("e-conocimiento", s + d);
  }

  // 8. Dirección: la gerencia pregunta en sus palabras y Harness responde.
  {
    const x = S.direccion; const [s, d] = span(x);
    clip("e-direccion", "scene", s, d, `
      ${head(5, "Dirección", "Pregunta y decide.")}
      <div class="card panel corto"><div class="bar"><span class="dot"></span>Panel de dirección</div>
        <div class="bub me" id="b1">¿Qué avanzó esta semana?</div>
        <div class="bub me" id="b2">¿Qué está bloqueado?</div>
        <div class="bub me" id="b3">¿Quién aprobó la publicación?</div>
        <div class="bub ai" id="b4">3 proyectos avanzan a tiempo. 1 espera tu aprobación. La publicación la aprobó Gerencia a las 10:44.</div></div>`, 3);
    enter("e-direccion", s);
    headIn("e-direccion", x, "Dirección");
    at("#e-direccion .panel", { opacity: 0, y: 80, rotateX: 18 }, { opacity: 1, y: 0, rotateX: 0, duration: 0.8, ease: "power3.out" }, enPalabra(x, "Preguntas") - 0.2);
    [["qué avanzó", "#b1"], ["qué está bloqueado", "#b2"], ["quién aprobó", "#b3"]].forEach(([w, sel]) => pop(sel, enPalabra(x, w)));
    const tR = enPalabra(x, "te responde");
    at("#b4", { opacity: 0, filter: "blur(8px)" }, { opacity: 1, filter: "blur(0px)", duration: 0.6 }, tR - 0.3);
    sfx(8, "whoosh-short.mp3", s, 0.3); sfx("8t", "typing.mp3", tR - 0.6, 0.15);
    leave("e-direccion", s + d);
  }

  // 9. Cierre: la pregunta sola; luego el informe de diagnóstico, la marca y la web.
  {
    const x = S.cierre; const [s, d] = span(x);
    const tA = enPalabra(x, "Nosotros"), tQ = enPalabra(x, "¿hoy sabes"), tG = enPalabra(x, "Agenda"), tW = enPalabra(x, "arvantti punto");
    clip("e-cierre", "scene", s, d, `
      <div class="acomp"><img class="marca" src="assets/clips/marca.png" alt=""><p>${words("Te acompañamos a implementarlo,")}<br>${words("a la medida de tu empresa.")}</p></div>
      <h2 class="pregunta">${words("¿Hoy sabes qué está haciendo la IA en tu empresa?")}</h2>
      <div class="informe card"><span class="id">INFORME EJECUTIVO</span><h3>Diagnóstico de gobernanza de IA</h3>
        ${["Control", "Seguridad", "Trazabilidad"].map((c, i) => `<div class="item" id="it${i}"><i class="box"><em>✓</em></i>${c}</div>`).join("")}
        <p class="agenda">Agenda tu diagnóstico</p></div>
      <div class="pieweb"><p class="url">arvantti.tech</p><p class="pie">Arvantti Harness® · Arvantti Labs, una marca de Sequoia Space</p></div>`, 3);
    enter("e-cierre", s);
    at("#e-cierre .acomp .marca", { opacity: 0, scale: 0.5 }, { opacity: 1, scale: 1, duration: 0.8, ease: "back.out(1.6)" }, tA - 0.3);
    at("#e-cierre .acomp .w", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.4, stagger: 0.06 }, tA);
    to("#e-cierre .acomp", { opacity: 0, y: -40, duration: 0.5 }, tQ - 0.6);
    at("#e-cierre .pregunta .w", { opacity: 0, y: 40, filter: "blur(12px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.55, stagger: 0.09, ease: "power3.out" }, tQ - 0.1);
    to("#e-cierre .pregunta", { y: -420, scale: 0.62, duration: 0.8, ease: "power3.inOut" }, tG - 0.5);
    at("#e-cierre .informe", { opacity: 0, y: 120 }, { opacity: 1, y: 0, duration: 0.7, ease: "power3.out" }, tG - 0.3);
    [0, 1, 2].forEach((i) => {
      at(`#it${i}`, { opacity: 0, x: -40 }, { opacity: 1, x: 0, duration: 0.35 }, tG + 0.2 + i * 0.35);
      at(`#it${i} em`, { opacity: 0, scale: 0 }, { opacity: 1, scale: 1, duration: 0.3, ease: "back.out(3)" }, tG + 0.5 + i * 0.35);
      sfx(`9${i}`, "pop.mp3", tG + 0.5 + i * 0.35, 0.2);
    });
    at("#e-cierre .agenda", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.5 }, tG + 1.5);
    at("#e-cierre .pieweb .url", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.6 }, tW - 0.1);
    at("#e-cierre .pieweb .pie", { opacity: 0 }, { opacity: 1, duration: 0.8 }, x.voiceAt + x.voz + 0.3);
    to("#e-cierre", { opacity: 0, duration: 1.0 }, s + d - 1.0);
    sfx(9, "whoosh.wav", s, 0.3); sfx("9q", "hit.wav", tQ, 0.25);
  }

  [S.riesgo, S.quees, S.control, S.seguridad, S.eficiencia, S.conocimiento, S.direccion, S.cierre].forEach((x) => sweep(x.start));

  escenas.forEach((x) => { if (x.real) audio(`voz-${x.id}`, `escenas/${x.dir}/assets/audio/voiceover.mp3`, x.voiceAt, x.voz, 1); });
  const mezcla = mezclaMusica(escenas, total);
  if (mezcla) audio("musica", mezcla, 0, total, fs.existsSync(T("assets/clips/musica-epica.mp3")) ? 0.5 : 0.22);
  else if (fs.existsSync(T("assets/clips/musica.mp3"))) audio("musica", "assets/clips/musica.mp3", 0, total, 0.22);
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
  const out = T(`out/harness-clevel-${v}.mp4`);
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
