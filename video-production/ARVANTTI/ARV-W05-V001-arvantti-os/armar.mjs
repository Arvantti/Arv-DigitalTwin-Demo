#!/usr/bin/env node
/**
 * Serie Arvantti OS Enterprise: 7 videos, cada uno en horizontal (1920x1080) y vertical (1080x1920).
 * Cada episodio vive en episodios/<ep>/: escenas/<escena>/script.md (voz) y episodio.mjs (escenas y animación).
 *
 *   EP=01-arvantti-os node armar.mjs voz [--enviar]     voz de las escenas nuevas o cambiadas (ElevenLabs)
 *   EP=01-arvantti-os node armar.mjs revisar            transcribe cada voz con Scribe y la compara con el guion
 *   node armar.mjs musica [--enviar]                    una pista para toda la serie (ElevenLabs Music)
 *   EP=01-arvantti-os node armar.mjs componer           mide la voz y escribe index.html (FORMATO=vertical: vertical/)
 *   EP=01-arvantti-os node armar.mjs render v001        out/<ep>-horizontal-v001.mp4 (FORMATO=vertical: -vertical-)
 */
import { execFileSync, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EP = process.env.EP || "01-arvantti-os";
const EPDIR = path.join(HERE, "episodios", EP);
const E = (p) => path.join(EPDIR, p);
const FPS = 25;
const VERT = process.env.FORMATO === "vertical";
const W = VERT ? 1080 : 1920, H = VERT ? 1920 : 1080;

const { ESCENAS, componer: componerEpisodio } = await import(pathToFileURL(E("episodio.mjs")).href);

const texto = (e) => fs.readFileSync(E(`escenas/${e.dir}/script.md`), "utf8").trim();
const vozDe = (e) => E(`escenas/${e.dir}/assets/audio/voiceover.mp3`);
const alineacionDe = (e) => E(`escenas/${e.dir}/assets/audio/alignment.json`);

// Palabras que la voz en español lee mal: se envían escritas como se pronuncian (en pantalla quedan igual).
const PRONUNCIA = [["ISO 42001", "ISO cuarenta y dos mil uno"], ["SDD", "ese de de"], ["T-12", "te doce"],
  ["8:02", "ocho y dos"], ["8:05", "ocho y cinco"], ["8:14", "ocho y catorce"], ["8:15", "ocho y quince"], ["8:21", "ocho y veintiuno"], ["9:10", "nueve y diez"]];
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

/** Voz con /with-timestamps: voiceover.mp3 y alignment.json por escena. Solo envía las escenas que cambiaron. */
async function voz() {
  const enviar = process.argv.includes("--enviar");
  const solo = process.env.ESCENA;
  const pend = ESCENAS.filter((e) => {
    if (solo) return e.dir.startsWith(solo);
    const a = alineacionDe(e);
    return !(fs.existsSync(vozDe(e)) && fs.existsSync(a) && JSON.parse(fs.readFileSync(a, "utf8")).hash === hash(`${modelo()}|${paraVoz(texto(e)).texto}`));
  });
  console.log(`Voz ${EP}: ${pend.length} escenas, ${pend.reduce((n, e) => n + texto(e).length, 0)} caracteres (modelo ${modelo()}).`);
  if (!pend.length) return;
  if (!enviar) return pend.forEach((e) => console.log(`- ${e.dir}: ${paraVoz(texto(e)).texto}`));
  const { apiKey, voiceId } = credenciales();
  for (const e of pend) {
    const txt = texto(e), pv = paraVoz(txt);
    if (txt.includes(apiKey)) throw new Error("El guion parece contener una credencial; no se envía.");
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify({ text: pv.texto, model_id: modelo(), language_code: "es", voice_settings: VOICE_SETTINGS }),
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

/** Transcribe cada voz con ElevenLabs Scribe para comprobar la pronunciación (nombres en inglés, siglas). */
async function revisar() {
  const { apiKey } = credenciales();
  for (const e of ESCENAS) {
    if (!fs.existsSync(vozDe(e))) continue;
    const fd = new FormData();
    fd.append("model_id", "scribe_v1");
    fd.append("language_code", "es");
    fd.append("file", new Blob([fs.readFileSync(vozDe(e))], { type: "audio/mpeg" }), "voz.mp3");
    const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", { method: "POST", headers: { "xi-api-key": apiKey }, body: fd });
    if (!res.ok) throw new Error(`${e.dir}: Scribe respondió HTTP ${res.status}`);
    const j = await res.json();
    console.log(`\n${e.dir}\n  guion: ${texto(e)}\n  oído:  ${j.text}`);
  }
}

/** Una sola pista para la serie (cada episodio la recorta y la baja bajo la voz). */
async function musica() {
  const out = path.join(HERE, "assets/clips/musica-serie.mp3");
  if (fs.existsSync(out)) return console.log("Ya existe assets/clips/musica-serie.mp3.");
  const prompt = fs.readFileSync(path.join(HERE, "musica-prompt.txt"), "utf8").trim();
  const ms = 110000;
  if (!process.argv.includes("--enviar")) return console.log(`ElevenLabs Music recibirá (${ms} ms):\n${prompt}`);
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

/** Tiempos de cada escena: con la voz real si existe; si no, estimados (2,5 palabras por segundo). */
function tiempos() {
  let t = 0, temporal = false;
  const escenas = ESCENAS.map((e) => {
    const txt = texto(e), real = fs.existsSync(vozDe(e));
    if (!real) temporal = true;
    const voz = real ? duracion(vozDe(e)) : txt.split(/\s+/).length / 2.5 + 0.4;
    const x = { ...e, txt, real, start: t, voiceAt: t + e.lead, voz, dur: e.lead + voz + e.tail };
    t += x.dur;
    return x;
  });
  return { escenas, total: t, temporal };
}

/** Segundo absoluto en que la voz llega a un fragmento del texto (alineación de ElevenLabs o proporcional). */
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

/** Música de la serie recortada al episodio, con compresión lateral bajo la voz y fundido al final. */
function mezclaMusica(escenas, total) {
  const src = path.join(HERE, "assets/clips/musica-serie.mp3");
  if (!fs.existsSync(src)) return null;
  const out = E("audio/musica-mezcla.mp3");
  if (VERT && fs.existsSync(out)) return "audio/musica-mezcla.mp3";
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const voces = escenas.filter((x) => x.real);
  const args = ["-y", "-v", "error", "-stream_loop", "-1", "-i", src];
  voces.forEach((x) => args.push("-i", vozDe(x)));
  const del = voces.map((x, i) => `[${i + 1}:a]adelay=${Math.round(x.voiceAt * 1000)}:all=1,aformat=sample_rates=48000:channel_layouts=stereo[v${i}]`).join(";");
  const f = `${del};${voces.map((_, i) => `[v${i}]`).join("")}amix=inputs=${voces.length}:normalize=0,apad=whole_dur=${total.toFixed(2)}[vz];` +
    `[0:a]aformat=sample_rates=48000:channel_layouts=stereo,apad,atrim=0:${total.toFixed(2)},afade=t=in:st=0:d=1,afade=t=out:st=${Math.max(0, total - 3).toFixed(2)}:d=3[m];` +
    `[m][vz]sidechaincompress=threshold=0.03:ratio=8:attack=40:release=600:makeup=1[out]`;
  args.push("-filter_complex", f, "-map", "[out]", "-c:a", "libmp3lame", "-q:a", "0", out);
  execFileSync("ffmpeg", args, { stdio: "inherit" });
  return "audio/musica-mezcla.mp3";
}

function preparar() {
  const clips = path.join(HERE, "assets/clips");
  fs.mkdirSync(clips, { recursive: true });
  const MARCA = `import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert("RGB").crop((560, 150, 980, 500))
out = Image.new("RGBA", im.size)
out.putdata([(r, g, b, max(0, min(255, int((max(r, g, b) - 40) * 255 / 70)))) for r, g, b in im.getdata()])
out.save(sys.argv[2])`;
  execFileSync("python3", ["-I", "-c", MARCA, path.join(HERE, "assets/shared/arvantti/branding/ArvanttiLabsLogo.png"), path.join(clips, "marca.png")], { stdio: "inherit" });
  console.log("listo: assets/clips/marca.png");
}

// ---------------------------------------------------------------- composición
function componer() {
  const { escenas, total, temporal } = tiempos();
  const S = Object.fromEntries(escenas.map((x) => [x.id, x]));
  const html = [], tl = [];
  const at = (sel, from, to, t) => tl.push(`tl.fromTo(${JSON.stringify(sel)},${JSON.stringify(from)},${JSON.stringify(to)},${(+t).toFixed(2)});`);
  const to = (sel, v, t) => tl.push(`tl.to(${JSON.stringify(sel)},${JSON.stringify(v)},${(+t).toFixed(2)});`);
  const set = (sel, v, t) => tl.push(`tl.set(${JSON.stringify(sel)},${JSON.stringify(v)},${(+t).toFixed(2)});`);
  const clip = (id, cls, start, dur, inner, z = 3) => html.push(`<div id="${id}" class="clip ${cls}" data-start="${start.toFixed(2)}" data-duration="${dur.toFixed(2)}" data-track-index="${z}">${inner}</div>`);
  let nA = 0;
  const audio = (id, src, start, dur, vol) => html.push(`<audio id="${id}" src="${src}" data-start="${start.toFixed(2)}" data-duration="${dur.toFixed(2)}" data-volume="${vol}" data-track-index="${100 + nA++}"></audio>`);
  let nS = 0;
  const sfx = (file, t, vol = 0.3) => audio(`sfx-${nS++}`, `assets/shared/core/sfx/${file}`, Math.max(0, t), 1.4, vol);
  const X = 0.5;
  const span = (x) => (x === escenas[0] ? [0, x.dur + X / 2] : [x.start - X / 2, x.dur + X]);
  const enter = (id, t) => at(`#${id}`, { opacity: 0, filter: "blur(18px)" }, { opacity: 1, filter: "blur(0px)", duration: X, ease: "power2.out" }, t);
  const leave = (id, t) => to(`#${id}`, { opacity: 0, filter: "blur(14px)", duration: X, ease: "power2.in" }, t - X);
  const words = (s, cls = "w") => s.split(" ").map((w) => `<span class="${cls}">${w}</span>`).join(" ");
  const wordsIn = (sel, t, stagger = 0.07) => at(`${sel} .w`, { opacity: 0, y: 36, filter: "blur(10px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.55, stagger, ease: "power3.out" }, t);
  let nSw = 0;
  const sweep = (t) => {
    const id = `sweep-${nSw++}`;
    clip(id, "sweep", Math.max(0, t - 0.35), 0.9, "", 40);
    at(`#${id}`, { xPercent: -120 }, { xPercent: 120, duration: 0.9, ease: "power2.inOut" }, Math.max(0, t - 0.35));
  };

  clip("fondo", "fondo", 0, total, `<div class="glow"></div><div class="floor"><div class="floorgrid"></div></div>`, 0);
  at("#fondo .floorgrid", { backgroundPositionY: "0px" }, { backgroundPositionY: `${Math.round(total * 40)}px`, duration: total, ease: "none" }, 0);
  at("#fondo .glow", { opacity: 0.55 }, { opacity: 1, duration: 6, ease: "sine.inOut", yoyo: true, repeat: Math.floor(total / 6) }, 0);

  componerEpisodio({ S, escenas, total, VERT, W, H, at, to, set, clip, sfx, span, enter, leave, words, wordsIn, sweep, P: enPalabra, tl, html });

  escenas.forEach((x) => { if (x.real) audio(`voz-${x.id}`, `escenas/${x.dir}/assets/audio/voiceover.mp3`, x.voiceAt, x.voz, 1); });
  const mus = mezclaMusica(escenas, total);
  if (mus) audio("musica", mus, 0, total, 0.5);
  if (temporal) html.push(`<div id="temp" class="clip" data-start="0" data-duration="${total.toFixed(2)}" data-track-index="50">SIN VOZ · TIEMPOS ESTIMADOS</div>`);

  const css = fs.readFileSync(path.join(HERE, "plantilla.html"), "utf8");
  const epcss = fs.readFileSync(path.join(HERE, "comun.css"), "utf8") + "\n" + (fs.existsSync(E("estilos.css")) ? fs.readFileSync(E("estilos.css"), "utf8") : "");
  const out = css
    .replaceAll("{{W}}", String(W)).replaceAll("{{H}}", String(H))
    .replace("{{RES}}", VERT ? "portrait" : "landscape")
    .replace("{{FMT}}", VERT ? "v" : "h")
    .replace("{{EPCSS}}", epcss)
    .replaceAll("{{TOTAL}}", total.toFixed(2))
    .replace("{{CLIPS}}", html.join("\n"))
    .replace("{{TIMELINE}}", tl.join("\n"));
  const dir = VERT ? E("vertical") : EPDIR;
  fs.mkdirSync(dir, { recursive: true });
  const links = VERT ? [["assets", "../../../assets"], ["escenas", "../escenas"], ["audio", "../audio"]] : [["assets", "../../assets"]];
  for (const [n, t] of links) if (!fs.existsSync(path.join(dir, n))) fs.symlinkSync(t, path.join(dir, n));
  fs.writeFileSync(path.join(dir, "index.html"), out);
  if (!VERT) fs.writeFileSync(E("tiempos.json"), JSON.stringify(escenas.map(({ id, start, voiceAt, voz, dur, real }) => ({ id, start: +start.toFixed(2), voiceAt: +voiceAt.toFixed(2), voz: +voz.toFixed(2), dur: +dur.toFixed(2), real })), null, 1));
  console.log(`${EP}/${VERT ? "vertical/" : ""}index.html: ${total.toFixed(1)} s${temporal ? " (tiempos estimados, falta voz)" : ""}`);
}

function render(v = "v001") {
  fs.mkdirSync(path.join(HERE, "out"), { recursive: true });
  const out = path.join(HERE, `out/${EP}-${VERT ? "vertical" : "horizontal"}-${v}.mp4`);
  execFileSync("pnpm", ["dlx", "hyperframes@0.9.9", "render", "-o", out, "--fps", String(FPS), "--quality", process.env.QUALITY || "high", "--video-frame-format", "png", ...(process.env.HF_ARGS ? process.env.HF_ARGS.split(" ") : [])], { cwd: VERT ? E("vertical") : EPDIR, stdio: "inherit" });
  console.log(out);
}

const [cmd, arg] = process.argv.slice(2);
const cmds = { preparar, voz, revisar, musica, componer, render: () => render(arg), tiempos: () => console.log(JSON.stringify(tiempos(), null, 1)) };
if (!cmds[cmd]) {
  console.log("Uso: EP=<episodio> node armar.mjs preparar | voz [--enviar] | revisar | musica [--enviar] | componer | render [vNNN] | tiempos");
  process.exit(1);
}
await cmds[cmd]();
