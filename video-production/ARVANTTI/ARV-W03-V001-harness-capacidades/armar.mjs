#!/usr/bin/env node
/**
 * Video vertical de capacidades de Arvantti Harness (1080x1920, ~3 min). Motion graphics, sin pantallas del producto.
 *
 *   node armar.mjs preparar         marca del logo y música de respaldo (sintetizada)
 *   node armar.mjs voz [--enviar]   voz de las escenas nuevas o cambiadas (ElevenLabs con tiempos por carácter)
 *   node armar.mjs componer         mide la voz de cada escena (o la estima) y escribe index.html
 *   node armar.mjs render [vNNN]    renderiza out/harness-capacidades-<vNNN>.mp4
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
  { id: "gancho", dir: "01-gancho", lead: 1.2, tail: 0.8 },
  { id: "dolor", dir: "02-dolor", lead: 0.4, tail: 0.8 },
  { id: "quees", dir: "03-que-es", lead: 0.5, tail: 1.0, harness: "Harness" },
  { id: "controla", dir: "04-controla", lead: 0.4, tail: 0.8 },
  { id: "protege", dir: "05-protege", lead: 0.4, tail: 0.8 },
  { id: "gobierna", dir: "06-gobierna", lead: 0.4, tail: 0.9 },
  { id: "planea", dir: "07-planea", lead: 0.4, tail: 0.8 },
  { id: "crea", dir: "08-crea", lead: 0.4, tail: 0.9 },
  { id: "conoce", dir: "09-conoce", lead: 0.4, tail: 0.9, harness: "Harness" },
  { id: "dirige", dir: "10-dirige", lead: 0.4, tail: 0.9 },
  { id: "equipo", dir: "11-equipo", lead: 0.4, tail: 1.0, harness: "Harness" },
  { id: "cierre", dir: "12-cierre", lead: 0.8, tail: 4.5, harness: "Harness" },
];

const texto = (e) => fs.readFileSync(T(`escenas/${e.dir}/script.md`), "utf8").trim();
const vozDe = (e) => T(`escenas/${e.dir}/assets/audio/voiceover.mp3`);
const alineacionDe = (e) => T(`escenas/${e.dir}/assets/audio/alignment.json`);

// Palabras que la voz en español lee mal: se envían escritas como se pronuncian.
// "Járnes" a veces sale como "yarnes"; las escenas con `harness` usan esa grafía para la marca
// (se eligió midiendo el ataque fricativo de la palabra en el audio; ver README).
const PRONUNCIA = [
  ["Harness", "Járnes"],
  ["GraphRAG", "Graf Rag"],
  ["RAG", "Rag"],
  ["SDD", "ese de de"],
  ["hooks", "juks"],
  ["OpenCode", "Open Cod"],
  ["Claude Code", "Clod Cod"],
  ["Codex", "Códex"],
];
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
  const head = (n, nombre, sub) => `<div class="head"><p class="kicker"><b>${n} de 8</b>ARVANTTI HARNESS</p><h1 class="idea">${nombre}</h1><p class="sub">${sub}</p></div>`;
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

  // 1. Gancho: varios asistentes escriben a la vez sobre el mismo código.
  {
    const x = S.gancho; const [s, d] = span(x);
    const lineas = [
      `<span class="k">export async function</span> facturar(pedido) {`,
      `  const cliente = await crm.buscar(pedido.id)`,
      `  <span class="k">if</span> (!cliente) <span class="k">throw</span> error(<span class="s">"sin cliente"</span>)`,
      `  const total = calcular(pedido.items)`,
      `  await erp.registrar(cliente, total)`,
      `  <span class="k">return</span> enviar(cliente.email, total)`,
      `}`,
    ];
    const ags = [["Claude Code", 700, 690], ["Codex", 460, 840], ["Gemini", 640, 1010], ["OpenCode", 380, 1170]];
    clip("e-gancho", "scene", s, d, `
      <h2 class="gt"><span class="kicker">ARVANTTI HARNESS</span>${words("Tu equipo ya programa con IA")}</h2>
      <div class="card code">${lineas.map((l) => `<div class="ln">${l}</div>`).join("")}</div>
      ${ags.map(([n, lx, ty], i) => `<div class="agent" id="ag${i}" style="left:${lx}px;top:${ty}px"><span class="tag">${n}</span><span class="cur"></span></div>`).join("")}
      <h2 class="q">${words("¿Quién los vigila?")}</h2>`, 3);
    at("#e-gancho .gt .kicker", { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 0.5, ease: "power3.out" }, s + 0.05);
    at("#e-gancho .gt .w", { opacity: 0, y: 30, filter: "blur(10px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.5, stagger: 0.08, ease: "power3.out" }, Math.max(s + 0.2, x.voiceAt - 0.2));
    at("#e-gancho .code", { opacity: 0, y: 80, rotateX: 20 }, { opacity: 1, y: 0, rotateX: 0, duration: 0.9, ease: "power3.out" }, s + 0.1);
    at("#e-gancho .ln", { opacity: 0, x: -20 }, { opacity: 1, x: 0, duration: 0.3, stagger: 0.18 }, s + 0.4);
    const tV = enPalabra(x, "Varios");
    ags.forEach((_, i) => {
      at(`#ag${i}`, { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.4, ease: "back.out(2)" }, tV + i * 0.25);
      at(`#ag${i}`, { x: 0 }, { x: i % 2 ? -60 : 60, duration: 0.8, ease: "sine.inOut", yoyo: true, repeat: 5 }, tV + 0.4 + i * 0.25);
    });
    at("#e-gancho .cur", { opacity: 1 }, { opacity: 0.1, duration: 0.25, yoyo: true, repeat: Math.ceil(d / 0.5) }, s);
    at("#e-gancho .q .w", { opacity: 0, y: 40, filter: "blur(14px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.6, stagger: 0.14, ease: "power3.out" }, enPalabra(x, "¿Quién"));
    sfx(1, "typing.mp3", tV, 0.18);
    sfx("1q", "hit.wav", enPalabra(x, "¿Quién"), 0.25);
    leave("e-gancho", s + d);
  }

  // 2. Dolor: tres alertas rojas.
  {
    const x = S.dolor; const [s, d] = span(x);
    const al = [["key", "Lee contraseñas", "Uno lee"], ["choque", "Se pisan el trabajo", "otro pisa"], ["duda", "Nadie sabe quién cambió qué", "nadie sabe"]];
    clip("e-dolor", "scene", s, d, `
      <div class="head"><h2 class="big">${words("Cada uno trae sus reglas.")}</h2></div>
      ${al.map(([ic, t], i) => `<div class="alerta" id="al${i}" style="top:${700 + i * 290}px">${ICON[ic]}<p>${t}</p></div>`).join("")}`, 3);
    enter("e-dolor", s);
    at("#e-dolor .big .w", { opacity: 0, y: 40, filter: "blur(10px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.5, stagger: 0.08, ease: "power3.out" }, x.voiceAt);
    al.forEach(([, , w], i) => {
      const t = enPalabra(x, w);
      at(`#al${i}`, { opacity: 0, x: 120 }, { opacity: 1, x: 0, duration: 0.5, ease: "back.out(1.6)" }, t - 0.1);
      to(`#al${i}`, { x: 10, duration: 0.06, yoyo: true, repeat: 5 }, t + 0.45);
      sfx(`2${i}`, "click.wav", t, 0.25);
    });
    leave("e-dolor", s + d);
  }

  // 3. Qué es: asistentes arriba, núcleo Harness al centro, tu empresa abajo.
  {
    const x = S.quees; const [s, d] = span(x);
    const ags = ["Claude Code", "Codex", "Gemini", "Copilot", "OpenCode", "Modelos locales"];
    const top = ags.map((n, i) => ({ n, x: 190 + (i % 3) * 350, y: 760 + Math.floor(i / 3) * 120 }));
    const core = { x: 540, y: 1210 };
    const emp = ["Código", "Consolas", "Documentos"].map((n, i) => ({ n, x: 210 + i * 330, y: 1590 }));
    const lines = top.map((p, i) => `<line id="q-l${i}" x1="${p.x}" y1="${p.y + 40}" x2="${core.x}" y2="${core.y - 150}" pathLength="1"/>`).join("") +
      emp.map((p, i) => `<line id="q-e${i}" x1="${core.x}" y1="${core.y + 150}" x2="${p.x}" y2="${p.y - 45}" pathLength="1"/>`).join("");
    clip("e-quees", "scene", s, d, `
      <div class="titulo"><h1>Arvantti <span>Harness®</span></h1><p>${words("Un arnés de arneses")}</p></div>
      <svg class="net" viewBox="0 0 ${W} ${H}">${lines}</svg>
      ${top.map((p, i) => `<div class="node ag" id="q-a${i}" style="left:${p.x - 160}px;top:${p.y - 40}px;width:320px;height:80px">${p.n}</div>`).join("")}
      <div class="core" style="left:${core.x - 150}px;top:${core.y - 150}px;width:300px;height:300px"><img src="assets/clips/marca.png" alt=""><b>Harness</b><span>UNA SOLA CAPA</span></div>
      ${emp.map((p, i) => `<div class="node emp" id="q-m${i}" style="left:${p.x - 150}px;top:${p.y - 45}px;width:300px;height:90px">${p.n}</div>`).join("")}
      <div class="pilares">${["Reglas", "Planes", "Memoria", "Evidencia"].map((c) => `<span class="chip">${c}</span>`).join("")}</div>`, 3);
    enter("e-quees", s);
    at("#e-quees .titulo h1", { opacity: 0, letterSpacing: "30px", filter: "blur(12px)" }, { opacity: 1, letterSpacing: "-3px", filter: "blur(0px)", duration: 1.1, ease: "power3.out" }, x.voiceAt - 0.1);
    at("#e-quees .titulo .w", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.4, stagger: 0.1 }, enPalabra(x, "un arnés"));
    const tC = enPalabra(x, "una sola capa"), tA = enPalabra(x, "todos los asistentes");
    at("#e-quees .core", { opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1, duration: 0.8, ease: "back.out(1.7)" }, tC - 0.2);
    tl.push(`tl.to("#e-quees .core",{boxShadow:"0 0 0 4px #4ea7ff, 0 0 140px #2d7ff9cc",duration:.6,yoyo:true,repeat:1},${(tC + 0.6).toFixed(2)});`);
    at("#e-quees .ag", { opacity: 0, y: -30 }, { opacity: 1, y: 0, duration: 0.4, stagger: 0.12, ease: "power3.out" }, tA - 0.2);
    top.forEach((_, i) => at(`#q-l${i}`, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.6, ease: "power2.out" }, tA + 0.3 + i * 0.1));
    const tR = enPalabra(x, "No los reemplaza");
    at("#e-quees .emp", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.4, stagger: 0.12 }, tR - 0.2);
    emp.forEach((_, i) => at(`#q-e${i}`, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.5 }, tR + i * 0.1));
    ["reglas", "planes", "memoria", "evidencia"].forEach((w, i) => pop(`#e-quees .pilares .chip:nth-child(${i + 1})`, enPalabra(x, w)));
    sfx(3, "whoosh.wav", s, 0.3); sfx("3c", "hit.wav", tC, 0.3);
    leave("e-quees", s + d);
  }

  // 4. Controla: permiso con nombre, hooks antes y después, aprobación humana.
  {
    const x = S.controla; const [s, d] = span(x);
    const pasos = ["Leer", "Editar", "Probar", "Subir"];
    clip("e-controla", "scene", s, d, `
      ${head(1, "Controla", "Nada sin permiso.")}
      <div class="card permiso"><h3>PERMISO</h3>
        <svg class="lock" viewBox="0 0 110 130"><rect x="10" y="56" width="90" height="66" rx="6"/><path class="arco" d="M28 56 V36 C28 6 82 6 82 36 V56"/></svg>
        <div class="row"><span class="tag" id="pq">quién: agente-3</span></div>
        <div class="row"><span class="tag" id="pa">archivo: src/pagos.ts</span></div>
        <div class="row"><span class="tag" id="pp">para qué: editar</span></div></div>
      <div class="pasos">${pasos.map((p, i) => `<div class="paso" style="left:${i * 220}px">${p}</div><i class="hook h${i}a" style="left:${i * 220 - 22}px;top:62px"></i><i class="hook h${i}b" style="left:${i * 220 + 178}px;top:62px"></i>`).join("")}</div>
      <div class="aprobar">APROBAR</div>
      <svg class="mano" viewBox="0 0 110 110"><circle cx="55" cy="55" r="40" fill="#ffffff22" stroke="#fff" stroke-width="5"/></svg>`, 3);
    enter("e-controla", s);
    headIn("e-controla", x, "controla");
    const tP = enPalabra(x, "Cada permiso");
    at("#e-controla .permiso", { opacity: 0, y: 60 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, enPalabra(x, "Todo está") - 0.1);
    to("#e-controla .lock .arco", { y: -14, duration: 0.4, ease: "back.out(2)" }, tP + 0.2);
    [["#pq", "quién"], ["#pa", "sobre qué archivo"], ["#pp", "para qué"]].forEach(([sel, w]) => pop(sel, enPalabra(x, w)));
    const tH = enPalabra(x, "Los hooks");
    at("#e-controla .paso", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.4, stagger: 0.1 }, tH - 0.3);
    at("#e-controla .hook", { opacity: 0, scale: 0 }, { opacity: 1, scale: 1, duration: 0.3, stagger: 0.12, ease: "back.out(3)" }, enPalabra(x, "antes"));
    const tS = enPalabra(x, "subir código");
    at("#e-controla .aprobar", { opacity: 0, scale: 0.7 }, { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(2)" }, tS);
    const tY = enPalabra(x, "el sí");
    at("#e-controla .mano", { opacity: 0, x: 120, y: 120 }, { opacity: 1, x: 0, y: 0, duration: 0.5, ease: "power3.out" }, tY - 0.5);
    to("#e-controla .aprobar", { scale: 0.92, background: "#37e38b", duration: 0.15, yoyo: true, repeat: 1 }, tY);
    tl.push(`tl.to("#e-controla .aprobar",{background:"#1f9d5c",boxShadow:"0 0 90px #37e38b",duration:.4},${(tY + 0.3).toFixed(2)});`);
    sfx(4, "whoosh-short.mp3", s, 0.3); sfx("4h", "click-soft.mp3", enPalabra(x, "antes"), 0.25); sfx("4y", "click.wav", tY, 0.35);
    leave("e-controla", s + d);
  }

  // 5. Protege: escudo, la clave se tapa en el chat, datos en casa.
  {
    const x = S.protege; const [s, d] = span(x);
    clip("e-protege", "scene", s, d, `
      ${head(2, "Protege", "Agentes guardianes.")}
      <svg class="escudo" viewBox="0 0 300 340"><path d="M150 14 L276 60 V160 C276 250 214 304 150 328 C86 304 24 250 24 160 V60 Z"/><path class="chk" d="M96 172 L136 212 L210 130"/></svg>
      <div class="card chat"><div class="bar"><span class="dot"></span>Sesión · agente-2</div>
        <div class="msg">API_KEY = <span class="key">sk_live_8f3a91c27e<span class="red">[REDACTED]</span></span></div></div>
      <p class="local">Tu equipo · tu nube privada · tus datos no salen</p>`, 3);
    enter("e-protege", s);
    headIn("e-protege", x, "protege");
    const tG = enPalabra(x, "Los agentes guardianes");
    at("#e-protege .escudo", { opacity: 0, scale: 0.5 }, { opacity: 1, scale: 1, duration: 0.7, ease: "back.out(1.7)" }, tG);
    at("#e-protege .escudo .chk", { opacity: 0 }, { opacity: 1, duration: 0.4 }, tG + 0.6);
    at("#e-protege .chat", { opacity: 0, y: 60 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, enPalabra(x, "lea una clave") - 0.3);
    const tM = enPalabra(x, "no se muestra");
    at("#e-protege .red", { opacity: 0, scaleX: 0 }, { opacity: 1, scaleX: 1, duration: 0.4, ease: "power3.out", transformOrigin: "left center" }, tM);
    tl.push(`tl.to("#e-protege .escudo path:first-child",{filter:"drop-shadow(0 0 50px #37e38b)",duration:.4,yoyo:true,repeat:1},${tM.toFixed(2)});`);
    at("#e-protege .local", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.6 }, enPalabra(x, "Tu memoria"));
    sfx(5, "whoosh-short.mp3", s, 0.3); sfx("5r", "spark.wav", tM, 0.3);
    leave("e-protege", s + d);
  }

  // 6. Gobierna: recibos que caen en una pila.
  {
    const x = S.gobierna; const [s, d] = span(x);
    const rec = [["agente-2", "editó src/pagos.ts", "Codex · permiso: editar", "10:42:07"], ["Ana López", "aprobó la subida", "panel · permiso: publicar", "10:44:31"], ["agente-5", "corrió las pruebas", "Claude · permiso: ejecutar", "10:46:12"]];
    clip("e-gobierna", "scene", s, d, `
      ${head(3, "Gobierna", "Cada acción tiene responsable.")}
      ${rec.map((r, i) => `<div class="card recibo" id="rc${i}" style="top:${620 + i * 20}px;z-index:${i + 1}"><span class="id">RECIBO #${4810 + i}</span>
        ${["Quién", "Qué", "Con qué", "Cuándo"].map((k, j) => `<div class="f f${j}"><b>${k}</b><span>${r[j]}</span></div>`).join("")}</div>`).join("")}
      <div class="chips">${["Quién", "Qué", "Con qué", "Cuándo"].map((c) => `<span class="chip">${c}</span>`).join("")}</div>`, 3);
    enter("e-gobierna", s);
    headIn("e-gobierna", x, "gobierna");
    rec.forEach((_, i) => at(`#rc${i}`, { opacity: 0, y: -400, rotate: -6 + i * 5 }, { opacity: 1, y: i * 240, rotate: -2 + i * 2, duration: 0.7, ease: "bounce.out" }, enPalabra(x, "Harness registra") + i * 0.45));
    [["quién hizo", 0], ["qué,", 1], ["con qué agente", 2], ["cuándo", 3]].forEach(([w, j]) => {
      const t = enPalabra(x, w);
      pop(`#e-gobierna .chips .chip:nth-child(${j + 1})`, t);
      tl.push(`tl.to("#e-gobierna .recibo .f${j} b",{color:"#ffffff",textShadow:"0 0 18px #4ea7ff",duration:.3,yoyo:true,repeat:1},${t.toFixed(2)});`);
    });
    const tB = enPalabra(x, "no se borra");
    tl.push(`tl.to("#e-gobierna .recibo",{boxShadow:"0 0 0 2px #37e38b, 0 0 60px #37e38b55",duration:.5},${tB.toFixed(2)});`);
    sfx(6, "whoosh-short.mp3", s, 0.3);
    rec.forEach((_, i) => sfx(`6${i}`, "pop.mp3", enPalabra(x, "Harness registra") + i * 0.45 + 0.4, 0.2));
    leave("e-gobierna", s + d);
  }

  // 7. Planea: tres tamaños de plan; luego el tablero de tareas con su responsable y su consola.
  {
    const x = S.planea; const [s, d] = span(x);
    const planes = [["Tarea", "Cambio pequeño", 1, 650], ["Mini SDD", "Qué se construye y cómo se comprueba", 3, 860], ["SDD completo", "De la idea al cierre · 7 fases", 7, 1110]];
    const tareas = [["Migrar pagos", "Ana López", "EN CURSO", "consola 1 · Codex"], ["Pruebas facturas", "agente-5", "EN CURSO", "consola 2 · Claude Code"], ["Revisar seguridad", "guardián-1", "LISTA", "consola 3 · OpenCode"], ["Documentar API", "agente-2", "ASIGNADA", "consola 4 · Gemini"]];
    clip("e-planea", "scene", s, d, `
      ${head(4, "Planea", "Lo justo, ni más ni menos.")}
      ${planes.map(([n, sub, k, top], i) => `<div class="plan" id="pn${i}" style="top:${top}px"><b>${n}</b><small>${sub}</small><div class="fases">${Array.from({ length: k }, () => "<i></i>").join("")}</div></div>`).join("")}
      <div class="tablero">${tareas.map(([n, q, st, c], i) => `<div class="tarea" id="ta${i}" style="top:${i * 200}px"><b>${n}</b><small>${q}</small><span class="st">${st}</span></div><div class="term" id="tc${i}" style="top:${i * 200}px"><b>${c.split(" · ")[0]}</b>${c.split(" · ")[1]} $ _</div>`).join("")}
        <svg class="net" viewBox="0 0 940 900" style="width:940px;height:900px">${tareas.map((_, i) => `<line id="tl${i}" x1="480" y1="${i * 200 + 60}" x2="620" y2="${i * 200 + 60}" pathLength="1"/>`).join("")}</svg></div>
      <div class="chips">${["Qué se hizo", "Cuándo", "Quién"].map((c) => `<span class="chip">${c}</span>`).join("")}</div>`, 3);
    enter("e-planea", s);
    headIn("e-planea", x, "planea");
    [["una tarea", 0], ["un mini SDD", 1], ["un SDD completo", 2]].forEach(([w, i]) => {
      const t = enPalabra(x, w);
      at(`#pn${i}`, { opacity: 0, x: -80 }, { opacity: 1, x: 0, duration: 0.5, ease: "power3.out" }, t - 0.1);
      at(`#pn${i} .fases i`, { scaleX: 0 }, { scaleX: 1, duration: 0.3, stagger: 0.08, transformOrigin: "left center" }, t + 0.2);
      sfx(`7${i}`, "click-soft.mp3", t, 0.22);
    });
    const tT = enPalabra(x, "Cada tarea se asigna");
    to("#e-planea .plan", { opacity: 0, y: -40, duration: 0.4, stagger: 0.05 }, tT - 0.5);
    at("#e-planea .tablero", { opacity: 0 }, { opacity: 1, duration: 0.3 }, tT - 0.2);
    at("#e-planea .tarea", { opacity: 0, x: -60 }, { opacity: 1, x: 0, duration: 0.4, stagger: 0.12, ease: "power3.out" }, tT);
    const tK = enPalabra(x, "con su propia consola");
    at("#e-planea .term", { opacity: 0, x: 60 }, { opacity: 1, x: 0, duration: 0.4, stagger: 0.12, ease: "power3.out" }, tK - 0.1);
    tareas.forEach((_, i) => at(`#tl${i}`, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.4 }, tK + 0.1 + i * 0.12));
    [["qué se hizo", 0], ["cuándo y", 1], ["quién.", 2]].forEach(([w, j]) => pop(`#e-planea .chips .chip:nth-child(${j + 1})`, enPalabra(x, w)));
    tl.push(`tl.to("#ta2 .st",{background:"#1f9d5c",color:"#fff",duration:.3},${(enPalabra(x, "hasta el final")).toFixed(2)});`);
    sfx(7, "whoosh-short.mp3", s, 0.3);
    leave("e-planea", s + d);
  }

  // 8. Crea: flujo paso a paso con subagentes; habilidades que entran en tres consolas sin llenar el contexto.
  {
    const x = S.crea; const [s, d] = span(x);
    const pasos = [["Observar", ""], ["Planear", ""], ["Ejecutar", ""], ["Verificar", ""], ["Aprobación", "gate"], ["Recibo", "rec"]];
    const F0 = 640, FS = 120;
    const cons = [["Claude Code", 60], ["Codex", 395], ["OpenCode", 730]];
    clip("e-crea", "scene", s, d, `
      ${head(5, "Crea", "Flujos, habilidades y agentes.")}
      <div class="flujo">
        <svg class="net" viewBox="0 0 ${W} ${H}">${pasos.slice(1).map((_, i) => `<line id="fl${i}" x1="540" y1="${F0 + i * FS + 84}" x2="540" y2="${F0 + (i + 1) * FS}" pathLength="1"/>`).join("")}
          <path id="fs0" d="M750 ${F0 + 2 * FS + 42} C 860 ${F0 + 2 * FS + 42} 880 ${F0 + 2 * FS - 40} 900 ${F0 + 2 * FS - 60}" pathLength="1"/>
          <path id="fs1" d="M750 ${F0 + 2 * FS + 42} C 860 ${F0 + 2 * FS + 42} 880 ${F0 + 2 * FS + 120} 900 ${F0 + 2 * FS + 140}" pathLength="1"/></svg>
        ${pasos.map(([n, c], i) => `<div class="fn ${c}" id="fn${i}" style="top:${F0 + i * FS}px">${n}</div>`).join("")}
        <div class="sa" id="sa0" style="left:790px;top:${F0 + 2 * FS - 110}px">subagente A</div>
        <div class="sa" id="sa1" style="left:790px;top:${F0 + 2 * FS + 110}px">subagente B</div>
      </div>
      ${cons.map(([n, l], i) => `<div class="cons" id="cs${i}" style="left:${l}px"><b>${n}</b><span class="ctxl">contexto</span><div class="ctx"><i></i></div></div>`).join("")}
      ${["revisar-código", "pruebas", "seguridad"].map((n, i) => `<div class="skill" id="sk${i}" style="left:${cons[i][1] + 20}px;top:1150px">${n}</div>`).join("")}
      <p class="cien"><span>+100</span> habilidades incluidas</p>`, 3);
    enter("e-crea", s);
    headIn("e-crea", x, "crea");
    const tF = enPalabra(x, "Diseñas flujos");
    [["observar", 0], ["planear,", 1], ["ejecutar", 2], ["verificar", 3], ["pedir aprobación", 4], ["dejar recibo", 5]].forEach(([w, i]) => {
      const t = i === 0 ? Math.min(enPalabra(x, w), tF + 0.6) : enPalabra(x, w);
      at(`#fn${i}`, { opacity: 0, scale: 0.7 }, { opacity: 1, scale: 1, duration: 0.35, ease: "back.out(2)" }, t - 0.1);
      if (i) at(`#fl${i - 1}`, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.3 }, t - 0.2);
      sfx(`8f${i}`, "click-soft.mp3", t, 0.15);
    });
    const tS = enPalabra(x, "subagentes");
    [0, 1].forEach((i) => {
      at(`#fs${i}`, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.4 }, tS - 0.3 + i * 0.15);
      at(`#sa${i}`, { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 0.4, ease: "power3.out" }, tS + i * 0.15);
    });
    const tH = enPalabra(x, "Creas habilidades");
    to("#e-crea .flujo", { opacity: 0, y: -60, scale: 0.9, duration: 0.5 }, tH - 0.4);
    const tI = enPalabra(x, "Harness los inyecta");
    at("#e-crea .cons", { opacity: 0, y: 60 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.12, ease: "power3.out" }, tH);
    at("#e-crea .cien", { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration: 0.6, ease: "back.out(1.7)" }, enPalabra(x, "más de cien"));
    [0, 1, 2].forEach((i) => {
      at(`#sk${i}`, { opacity: 0, y: -420, scale: 1.2 }, { opacity: 1, y: 70, scale: 1, duration: 0.6, ease: "power3.in" }, enPalabra(x, cons[i][0]) - 0.2);
      to(`#cs${i} .ctx i`, { scaleX: 0.3, duration: 0.3 }, enPalabra(x, cons[i][0]) + 0.4);
      sfx(`8k${i}`, "pop.mp3", enPalabra(x, cons[i][0]) + 0.4, 0.2);
    });
    const tL = enPalabra(x, "se mantiene limpio");
    to("#e-crea .cons .ctx i", { scaleX: 0.22, duration: 0.5 }, tL - 0.2);
    tl.push(`tl.to("#e-crea .cons",{borderColor:"#37e38b",boxShadow:"0 0 50px #37e38b44",duration:.4},${tL.toFixed(2)});`);
    to("#e-crea .cien", { opacity: 0, duration: 0.4 }, tI - 0.3);
    sfx(8, "whoosh-short.mp3", s, 0.3);
    leave("e-crea", s + d);
  }

  // 9. Conoce: documentos que se vuelven grafo; una respuesta con su fuente.
  {
    const x = S.conoce; const [s, d] = span(x);
    const docs = Array.from({ length: 6 }, (_, i) => ({ x: 150 + (i % 3) * 330, y: 900 + Math.floor(i / 3) * 220 }));
    const G = [["Proyecto", 300, 900], ["Decisiones", 780, 900], ["Código", 540, 1230]];
    const sats = Array.from({ length: 12 }, (_, i) => { const g = G[i % 3]; const a = (i * 2.1) % (2 * Math.PI); return { x: Math.round(g[1] + 190 * Math.cos(a)), y: Math.round(g[2] + 170 * Math.sin(a)), g: i % 3 }; });
    clip("e-conoce", "scene", s, d, `
      ${head(6, "Conoce", "RAG y GraphRAG de tu empresa.")}
      <p class="siglas"><b>RAG:</b> busca en tus documentos y cita la fuente.<br><b>GraphRAG:</b> sigue el mapa de relaciones.</p>
      ${docs.map((p, i) => `<div class="doc" id="dc${i}" style="left:${p.x}px;top:${p.y}px">${[30, 52, 74, 96].map((t) => `<i style="top:${t}px"></i>`).join("")}</div>`).join("")}
      <svg class="net" viewBox="0 0 ${W} ${H}"><line id="gk0" x1="${G[0][1]}" y1="${G[0][2]}" x2="${G[1][1]}" y2="${G[1][2]}" pathLength="1"/><line id="gk1" x1="${G[1][1]}" y1="${G[1][2]}" x2="${G[2][1]}" y2="${G[2][2]}" pathLength="1"/><line id="gk2" x1="${G[2][1]}" y1="${G[2][2]}" x2="${G[0][1]}" y2="${G[0][2]}" pathLength="1"/>
        ${sats.map((p, i) => `<line class="sl" id="sl${i}" x1="${G[p.g][1]}" y1="${G[p.g][2]}" x2="${p.x}" y2="${p.y}" pathLength="1" style="stroke-width:1.5;opacity:.6"/>`).join("")}</svg>
      ${sats.map((p, i) => `<i class="gs" id="gs${i}" style="left:${p.x}px;top:${p.y}px"></i>`).join("")}
      ${G.map(([n, gx, gy], i) => `<div class="gn" id="gn${i}" style="left:${gx}px;top:${gy}px">${n}</div>`).join("")}
      <div class="card resp"><p>"El cambio de pagos lo decidió Ana el 3 de noviembre, por la auditoría de octubre."</p><small>FUENTE · decisiones/2026-11-03.md</small></div>`, 3);
    enter("e-conoce", s);
    headIn("e-conoce", x, "conoce");
    const tC = enPalabra(x, "construyen el RAG");
    at("#e-conoce .doc", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.4, stagger: 0.08 }, tC - 0.4);
    const tB = enPalabra(x, "RAG es búsqueda");
    at("#e-conoce .siglas", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.5 }, tB);
    to("#e-conoce .doc", { scale: 0.2, opacity: 0, duration: 0.6, stagger: 0.05, ease: "power2.in" }, enPalabra(x, "con GraphRAG") - 0.9);
    const tG = enPalabra(x, "con GraphRAG");
    at("#e-conoce .gs", { opacity: 0, scale: 0 }, { opacity: 1, scale: 1, duration: 0.3, stagger: 0.04 }, tG - 0.3);
    at("#e-conoce .sl", { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.4, stagger: 0.03 }, tG);
    [["tu proyecto", 0], ["tus decisiones", 1], ["tu código", 2]].forEach(([w, i]) => {
      const t = enPalabra(x, w);
      at(`#gn${i}`, { opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(1.8)" }, t - 0.1);
      at(`#gk${i}`, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.5 }, t + 0.2);
      sfx(`9${i}`, "pop.mp3", t, 0.2);
    });
    to("#e-conoce .siglas", { opacity: 0, duration: 0.4 }, tG - 0.4);
    at("#e-conoce .resp", { opacity: 0, y: 60 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, enPalabra(x, "quién decidió"));
    sfx(9, "whoosh-short.mp3", s, 0.3);
    leave("e-conoce", s + d);
  }

  // 10. Dirige: conversación en el panel; consolas trabajando; anillos de construir y vigilar.
  {
    const x = S.dirige; const [s, d] = span(x);
    const q = "¿Qué está bloqueado hoy?";
    const a = "Una tarea: \"Migrar pagos\" espera tu aprobación para subir. Lo demás avanza.";
    clip("e-dirige", "scene", s, d, `
      ${head(7, "Dirige", "Conversa con tu operación de IA.")}
      <div class="card panel"><div class="bar"><span class="dot"></span>Panel de dirección</div>
        <div class="bub me" id="b1">¿Qué avanzó esta semana?</div>
        <div class="bub me" id="b2">${q}</div>
        <div class="bub ai" id="b3">${a}</div>
        <div class="minis">${["agente-2 $ npm test ✓", "agente-5 $ git diff", "guardián-1 vigilando", "agente-3 $ build"].map((m, i) => `<div class="mini${i === 2 ? " g" : ""}">${m}</div>`).join("")}</div></div>
      <div class="anillos"><div class="anillo" id="an0" style="left:220px"><svg viewBox="0 0 230 230"><circle cx="115" cy="115" r="100" style="stroke:#4ea7ff"/></svg><p>construyen</p></div>
        <div class="anillo" id="an1" style="left:630px"><svg viewBox="0 0 230 230"><circle cx="115" cy="115" r="100" style="stroke:#37e38b"/></svg><p>vigilan</p></div></div>`, 3);
    enter("e-dirige", s);
    headIn("e-dirige", x, "dirige");
    at("#e-dirige .panel", { opacity: 0, y: 80, rotateX: 18 }, { opacity: 1, y: 0, rotateX: 0, duration: 0.8, ease: "power3.out" }, enPalabra(x, "Desde un panel") - 0.2);
    pop("#b1", enPalabra(x, "qué avanzó"));
    pop("#b2", enPalabra(x, "qué está bloqueado"));
    at("#b3", { opacity: 0, filter: "blur(8px)" }, { opacity: 1, filter: "blur(0px)", duration: 0.6 }, enPalabra(x, "qué está bloqueado") + 1.0);
    to("#b1", { opacity: 0.4, duration: 0.3 }, enPalabra(x, "qué está bloqueado"));
    const tM = enPalabra(x, "Mientras");
    at("#e-dirige .mini", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.3, stagger: 0.1 }, tM - 0.2);
    at("#an0", { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(2)" }, enPalabra(x, "construyen"));
    at("#an1", { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(2)" }, enPalabra(x, "vigilan"));
    at("#e-dirige .anillo svg", { rotate: 0 }, { rotate: 360, duration: 3, ease: "none", repeat: 2 }, tM);
    sfx(10, "whoosh-short.mp3", s, 0.3); sfx("10t", "typing.mp3", enPalabra(x, "qué está bloqueado") + 0.9, 0.15);
    leave("e-dirige", s + d);
  }

  // 11. Equipo: plataformas y un mismo cerebro en la nube.
  {
    const x = S.equipo; const [s, d] = span(x);
    const plat = [["Linux", "Fedora 44 · Ubuntu · Arch", "Linux"], ["macOS", "escritorio", "Mac"], ["Windows", "escritorio", "Windows"]];
    const C = { x: 540, y: 1460 };
    const per = Array.from({ length: 6 }, (_, i) => { const a = Math.PI + (i * Math.PI) / 5; return { x: Math.round(C.x + 400 * Math.cos(a)), y: Math.round(C.y + 230 * Math.sin(a) + 120) }; });
    clip("e-equipo", "scene", s, d, `
      ${head(8, "En equipo", "Escritorio y nube.")}
      <div class="plataformas">${plat.map(([n, sub], i) => `<div class="plat" id="pl${i}"><b>${n}</b><span>${sub}</span></div>`).join("")}</div>
      <svg class="net" viewBox="0 0 ${W} ${H}">${per.map((p, i) => `<line id="pe${i}" x1="${p.x}" y1="${p.y}" x2="${C.x}" y2="${C.y}" pathLength="1"/>`).join("")}</svg>
      ${per.map((p, i) => `<div class="persona" id="ps${i}" style="left:${p.x}px;top:${p.y}px"><i></i><u></u></div>`).join("")}
      <div class="core" id="cer" style="left:${C.x - 140}px;top:${C.y - 140}px;width:280px;height:280px"><img src="assets/clips/marca.png" alt=""><b>Un cerebro</b><span>EMPRESARIAL</span></div>`, 3);
    enter("e-equipo", s);
    headIn("e-equipo", x, "trabaja en equipo");
    plat.forEach(([, , w], i) => at(`#pl${i}`, { opacity: 0, x: -80 }, { opacity: 1, x: 0, duration: 0.45, ease: "power3.out" }, enPalabra(x, w) - 0.1));
    const tN = enPalabra(x, "versión en la nube");
    at("#cer", { opacity: 0, scale: 0.5 }, { opacity: 1, scale: 1, duration: 0.7, ease: "back.out(1.7)" }, tN);
    const tP = enPalabra(x, "varias personas");
    per.forEach((_, i) => {
      at(`#ps${i}`, { opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1, duration: 0.4, ease: "back.out(2)" }, tP + i * 0.1);
      at(`#pe${i}`, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.4 }, tP + 0.2 + i * 0.1);
    });
    tl.push(`tl.to("#cer",{boxShadow:"0 0 0 4px #4ea7ff, 0 0 140px #2d7ff9cc",duration:.6,yoyo:true,repeat:1},${enPalabra(x, "un mismo cerebro").toFixed(2)});`);
    sfx(11, "whoosh-short.mp3", s, 0.3); sfx("11c", "hit.wav", tN, 0.25);
    leave("e-equipo", s + d);
  }

  // 12. Cierre: firma, acompañamiento y llamada a la acción.
  {
    const x = S.cierre; const [s, d] = span(x);
    const tR = enPalabra(x, "La inteligencia"), tD = enPalabra(x, "Tú decides"), tL = enPalabra(x, "Te acompañamos"), tA = enPalabra(x, "Agenda");
    clip("e-cierre", "scene", s, d, `
      <svg class="estela" viewBox="0 0 1080 1920" preserveAspectRatio="xMidYMid slice"><path id="p2" d="M-60 420 C 260 420 380 300 540 360 S 860 470 1140 330" pathLength="1"/></svg>
      <div class="fin"><img class="marca" src="assets/clips/marca.png" alt=""><h1>Arvantti <span>Harness®</span></h1>
        <p class="firma">${words("Tú decides qué puede tocar.")}</p>
        <p class="lic">Te acompañamos a <b>implementarlo</b></p>
        <div class="boton">Agenda tu sesión <span class="flecha">→</span></div>
        <p class="url">arvantti.tech</p><p class="pie">Arvantti Labs · una marca de Sequoia Space</p></div>`, 3);
    enter("e-cierre", s);
    at("#p2", { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 1.8, ease: "power2.inOut" }, s);
    to("#p2", { opacity: 0.25, duration: 1 }, s + 1.8);
    at("#e-cierre .marca", { opacity: 0, scale: 0.5, rotate: -8 }, { opacity: 1, scale: 1, rotate: 0, duration: 1, ease: "back.out(1.6)" }, x.voiceAt - 0.3);
    at("#e-cierre h1", { opacity: 0, letterSpacing: "30px", filter: "blur(10px)" }, { opacity: 1, letterSpacing: "-3px", filter: "blur(0px)", duration: 1.2, ease: "power3.out" }, x.voiceAt);
    at("#e-cierre h1", { backgroundPosition: "-200% 0" }, { backgroundPosition: "200% 0", duration: 2.2, ease: "power1.inOut" }, x.voiceAt + 1.2);
    at("#e-cierre .firma .w", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.08, ease: "power3.out" }, Math.max(tD, tR));
    at("#e-cierre .lic", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, tL - 0.1);
    at("#e-cierre .boton", { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.6, ease: "back.out(2)" }, tA - 0.1);
    at("#e-cierre .boton", { boxShadow: "0 0 0 0 #2d7ff900" }, { boxShadow: "0 0 0 22px #2d7ff900, 0 0 80px #2d7ff9cc", duration: 0.9, ease: "sine.out", repeat: Math.floor((s + d - tA - 1.5) / 0.9) }, tA + 0.5);
    at("#e-cierre .flecha", { x: 0 }, { x: 14, duration: 0.45, ease: "sine.inOut", yoyo: true, repeat: Math.floor((s + d - tA - 1.5) / 0.45) }, tA + 0.5);
    at("#e-cierre .url", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.6 }, enPalabra(x, "arvantti punto") - 0.1);
    at("#e-cierre .pie", { opacity: 0 }, { opacity: 1, duration: 0.8 }, x.voiceAt + x.voz + 0.4);
    to("#e-cierre .fin", { opacity: 0, duration: 1.0 }, s + d - 1.0);
    sfx(12, "hit.wav", x.voiceAt, 0.3);
    sfx("12a", "hit.wav", tA, 0.22);
  }

  [S.dolor, S.quees, S.controla, S.protege, S.gobierna, S.planea, S.crea, S.conoce, S.dirige, S.equipo, S.cierre].forEach((x) => sweep(x.start));

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
  const out = T(`out/harness-capacidades-${v}.mp4`);
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
