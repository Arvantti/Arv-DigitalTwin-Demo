#!/usr/bin/env node
/**
 * Serie Arvantti · Sistema empresarial completo (7 episodios + gran resumen, 1920x1080 y 1080x1920). Cada episodio vive en episodios/<ep>/ con sus escenas
 * (escenas/<NN-nombre>/script.md) y su composición (escenas.mjs). Todo es animación propia, sin capturas.
 *
 *   EP=ep01 node armar.mjs voz [--enviar]     voz de las escenas nuevas o cambiadas (ElevenLabs con tiempos)
 *   node armar.mjs musica [--enviar]          una pista de ElevenLabs Music para toda la serie
 *   EP=ep01 node armar.mjs componer           mide la voz y escribe episodios/ep01/index.html
 *   EP=ep01 node armar.mjs render v001        out/ecosistema-ep01-v001.mp4
 *   FORMATO=vertical ...                      lo mismo en 9:16 (episodios/ep01/vertical/), misma voz y música
 */
import { execFileSync, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EP = process.env.EP || "ep01";
const EPDIR = path.join(HERE, "episodios", EP);
const FPS = 25;
const VERT = process.env.FORMATO === "vertical";
const W = VERT ? 1080 : 1920, H = VERT ? 1920 : 1080;
const MUSICA = path.join(HERE, "assets/clips/musica-serie.mp3");
const MUSICA_LARGA = path.join(HERE, "assets/clips/musica-serie-larga.mp3");
// Gran resumen (unos 5 min): la pista larga encadenada consigo misma con fundidos (assets/clips/musica-resumen.mp3).
const MUSICA_RESUMEN = path.join(HERE, "assets/clips/musica-resumen.mp3");

const { ESCENAS, componerEpisodio } = await import(pathToFileURL(path.join(EPDIR, "escenas.mjs")).href);

const texto = (e) => fs.readFileSync(path.join(EPDIR, `escenas/${e.dir}/script.md`), "utf8").trim();
const vozDe = (e) => path.join(EPDIR, `escenas/${e.dir}/assets/audio/voiceover.mp3`);
const alineacionDe = (e) => path.join(EPDIR, `escenas/${e.dir}/assets/audio/alignment.json`);

// Siglas y nombres que la voz en español lee mal: se envían escritos como se pronuncian.
const PRONUNCIA = [["Integrator", "Íntegreitor"], ["ERP", "E R P"], ["CRM", "C R M"], ["SCADA", "Escada"], ["OEE", "O E E"], ["APS", "A P S"], ["3D", "tres D"], ["MCP", "M C P"], ["CLI", "C L I"]];
function paraVoz(t) {
  let out = "", idx = [];
  for (let i = 0; i < t.length; ) {
    const p = PRONUNCIA.find(([a]) => t.startsWith(a, i) && !/\p{L}/u.test(t[i - 1] || "") && !/\p{L}/u.test(t[i + a.length] || ""));
    if (p) {
      for (let k = 0; k < p[0].length; k++) idx.push(out.length + Math.floor((k * p[1].length) / p[0].length));
      out += p[1];
      i += p[0].length;
    } else idx.push(out.length), (out += t[i++]);
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

async function voz() {
  const enviar = process.argv.includes("--enviar");
  const pend = ESCENAS.filter((e) => {
    const a = alineacionDe(e);
    return !(fs.existsSync(vozDe(e)) && fs.existsSync(a) && JSON.parse(fs.readFileSync(a, "utf8")).hash === hash(`${modelo()}|${paraVoz(texto(e)).texto}`));
  });
  console.log(`${EP} voz: ${pend.length} escenas nuevas o cambiadas, ${pend.reduce((n, e) => n + texto(e).length, 0)} caracteres (modelo ${modelo()}).`);
  if (!pend.length) return;
  if (!enviar) {
    pend.forEach((e) => console.log(`- ${e.dir}: ${paraVoz(texto(e)).texto}`));
    return console.log("Para enviarlos a ElevenLabs: agrega --enviar");
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
    if (a && pv.texto !== txt && a.characters?.length === pv.texto.length) a = { characters: [...txt], character_start_times_seconds: pv.idx.map((k) => a.character_start_times_seconds[k]) };
    fs.writeFileSync(alineacionDe(e), `${JSON.stringify({ hash: hash(`${modelo()}|${pv.texto}`), modelo: modelo(), texto: txt, alignment: a })}\n`);
    console.log(`${e.dir}: ${duracion(vozDe(e)).toFixed(1)} s`);
  }
}

async function musica() {
  if (fs.existsSync(MUSICA)) return console.log("Ya existe assets/clips/musica-serie.mp3.");
  const prompt = fs.readFileSync(path.join(HERE, "musica-prompt.txt"), "utf8").trim();
  const ms = 100000;
  if (!process.argv.includes("--enviar")) return console.log(`ElevenLabs Music recibirá (${ms} ms):\n${prompt}\nPara enviarlo: agrega --enviar`);
  const { apiKey } = credenciales();
  const res = await fetch("https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128", {
    method: "POST",
    headers: { "xi-api-key": apiKey, "content-type": "application/json" },
    body: JSON.stringify({ prompt, music_length_ms: ms, model_id: "music_v1" }),
  });
  if (!res.ok) throw new Error(`Música: ElevenLabs respondió HTTP ${res.status}; respuesta omitida por seguridad.`);
  fs.mkdirSync(path.dirname(MUSICA), { recursive: true });
  fs.writeFileSync(MUSICA, Buffer.from(await res.arrayBuffer()));
  console.log(`musica-serie.mp3: ${duracion(MUSICA).toFixed(1)} s`);
}
function duracion(f) {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f], { encoding: "utf8" });
  return Number(r.stdout.trim());
}

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

/** Segundo absoluto en que la voz llega a un fragmento del texto (alineación de ElevenLabs o proporción). */
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

/** Voz + música de la serie con la música bajando bajo la voz (sidechain); se funde al final del episodio. */
function mezclaMusica(escenas, total) {
  const dst = path.join(EPDIR, "musica-mezcla.mp3");
  if (VERT && fs.existsSync(dst)) return dst;
  if (!fs.existsSync(MUSICA)) return null;
  // Episodios más largos que la pista de la serie usan la versión larga (misma indicación, 130 s).
  let src = total > duracion(MUSICA) - 1 && fs.existsSync(MUSICA_LARGA) ? MUSICA_LARGA : MUSICA;
  if (total > duracion(src) - 1 && fs.existsSync(MUSICA_RESUMEN)) src = MUSICA_RESUMEN;
  const voces = escenas.filter((x) => x.real);
  const args = ["-y", "-v", "error", "-i", src];
  voces.forEach((x) => args.push("-i", vozDe(x)));
  const del = voces.map((x, i) => `[${i + 1}:a]adelay=${Math.round(x.voiceAt * 1000)}:all=1,aformat=sample_rates=48000:channel_layouts=stereo[v${i}]`).join(";");
  const f = `${del};${voces.map((_, i) => `[v${i}]`).join("")}amix=inputs=${voces.length}:normalize=0,apad=whole_dur=${total.toFixed(2)}[vz];` +
    `[0:a]aformat=sample_rates=48000:channel_layouts=stereo,apad,atrim=0:${total.toFixed(2)},afade=t=out:st=${Math.max(0, total - 3.5).toFixed(2)}:d=3.5[m];` +
    `[m][vz]sidechaincompress=threshold=0.03:ratio=8:attack=40:release=600:makeup=1[out]`;
  args.push("-filter_complex", f, "-map", "[out]", "-c:a", "libmp3lame", "-q:a", "2", dst);
  execFileSync("ffmpeg", args, { stdio: "inherit" });
  return dst;
}

/** Subtítulos quemados: líneas cortas (corte en puntuación) y la palabra que suena en blanco. */
function subtitulos(ctx, escenas) {
  const max = VERT ? 4 : 7;
  let n = 0;
  for (const x of escenas) {
    if (!x.real || x.sinSubtitulos) continue;
    const palabras = [...x.txt.matchAll(/\S+/g)].map((m) => ({ w: m[0], t: enPalabra(x, x.txt.slice(m.index)) }));
    const lineas = [];
    let cur = [];
    for (const p of palabras) {
      cur.push(p);
      if (cur.length >= max || /[.?!:,;]$/.test(p.w) && cur.length >= 2) lineas.push(cur), (cur = []);
    }
    if (cur.length) lineas.push(cur);
    lineas.forEach((l, i) => {
      const t0 = l[0].t - 0.05, t1 = i + 1 < lineas.length ? lineas[i + 1][0].t - 0.05 : x.voiceAt + x.voz + 0.3;
      const id = `cap${n++}`;
      ctx.clip(id, "cap", t0, Math.max(0.3, t1 - t0), `<span class="l">${l.map((p, k) => `<span class="cw" id="${id}w${k}">${p.w}</span>`).join(" ")}</span>`, 45);
      l.forEach((p, k) => {
        ctx.set(`#${id}w${k}`, { color: "#ffffff", textShadow: "0 0 18px #4ea7ff" }, p.t);
        if (k > 0) ctx.set(`#${id}w${k - 1}`, { color: "#c9d1e0", textShadow: "none" }, p.t);
      });
    });
  }
}

function componer() {
  const { escenas, total, temporal } = tiempos();
  const S = Object.fromEntries(escenas.map((x) => [x.id, x]));
  const html = [], tl = [];
  const ctx = {
    S, total, W, H, VERT, html, tl,
    P: (x, frag) => enPalabra(x, frag),
    at: (sel, from, to, t) => tl.push(`tl.fromTo(${JSON.stringify(sel)},${JSON.stringify(from)},${JSON.stringify(to)},${(+t).toFixed(2)});`),
    to: (sel, v, t) => tl.push(`tl.to(${JSON.stringify(sel)},${JSON.stringify(v)},${(+t).toFixed(2)});`),
    set: (sel, v, t) => tl.push(`tl.set(${JSON.stringify(sel)},${JSON.stringify(v)},${(+t).toFixed(2)});`),
    clip: (id, cls, start, dur, inner, z = 2) => html.push(`<div id="${id}" class="clip ${cls}" data-start="${start.toFixed(2)}" data-duration="${dur.toFixed(2)}" data-track-index="${z}">${inner}</div>`),
    audio: (id, src, start, dur, vol) => html.push(`<audio id="${id}" src="${src}" data-start="${start.toFixed(2)}" data-duration="${dur.toFixed(2)}" data-volume="${vol}" data-track-index="${20 + html.length}"></audio>`),
    words: (s, cls = "w") => s.split(" ").map((w) => `<span class="${cls}">${w}</span>`).join(" "),
  };
  ctx.sfx = (n, file, t, vol = 0.3) => ctx.audio(`sfx-${n}`, `assets/shared/core/sfx/${file}`, t, 1.4, vol);
  const X = 0.5;
  ctx.span = (x) => { const first = x === escenas[0]; return [Math.max(0, x.start - (first ? 0 : X / 2)), x.dur + (first ? 0 : X / 2) + X / 2]; };
  ctx.enter = (id, t) => ctx.at(`#${id}`, { opacity: 0, filter: "blur(18px)" }, { opacity: 1, filter: "blur(0px)", duration: X, ease: "power2.out" }, t);
  ctx.leave = (id, t) => ctx.to(`#${id}`, { opacity: 0, filter: "blur(14px)", duration: X, ease: "power2.in" }, t - X / 2);
  ctx.titleIn = (sel, t, st = 0.07) => ctx.at(`${sel} .w`, { opacity: 0, y: 40, filter: "blur(10px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.6, stagger: st, ease: "power3.out" }, t);
  let nSweep = 0;
  ctx.sweep = (t) => {
    const id = `sweep-${nSweep++}`;
    ctx.clip(id, "sweep", t - 0.35, 0.9, "", 40);
    ctx.at(`#${id}`, { xPercent: -120 }, { xPercent: 120, duration: 0.9, ease: "power2.inOut" }, t - 0.35);
  };

  ctx.clip("fondo", "fondo", 0, total, `<div class="glow"></div><div class="floor"><div class="floorgrid"></div></div>`, 0);
  ctx.at("#fondo .floorgrid", { backgroundPositionY: "0px" }, { backgroundPositionY: `${Math.round(total * 40)}px`, duration: total, ease: "none" }, 0);
  ctx.at("#fondo .glow", { opacity: 0.5 }, { opacity: 1, duration: 6, ease: "sine.inOut", yoyo: true, repeat: Math.floor(total / 6) }, 0);

  componerEpisodio(ctx);
  subtitulos(ctx, escenas);

  escenas.forEach((x) => { if (x.real) ctx.audio(`voz-${x.id}`, `escenas/${x.dir}/assets/audio/voiceover.mp3`, x.voiceAt, x.voz, 1); });
  const mezcla = mezclaMusica(escenas, total);
  if (mezcla) ctx.audio("musica", "musica-mezcla.mp3", 0, total, 0.5);
  if (temporal) html.push(`<div id="temp" class="clip" data-start="0" data-duration="${total.toFixed(2)}" data-track-index="50">SIN VOZ · TIEMPOS ESTIMADOS</div>`);

  let plantilla = fs.readFileSync(path.join(HERE, "plantilla.html"), "utf8");
  const extra = path.join(EPDIR, "estilos.css");
  const compartido = path.join(HERE, "viz.css");
  let css = (fs.existsSync(compartido) ? fs.readFileSync(compartido, "utf8") + "\n" : "") + (fs.existsSync(extra) ? fs.readFileSync(extra, "utf8") : "");
  if (VERT) {
    plantilla = plantilla
      .replaceAll("width:1920px;height:1080px", "width:1080px;height:1920px")
      .replace('content="width=1920, height=1080"', 'content="width=1080, height=1920"')
      .replace('data-resolution="landscape"', 'data-resolution="portrait"')
      .replace('data-width="1920" data-height="1080"', 'data-width="1080" data-height="1920"');
    const v = path.join(EPDIR, "vertical.css");
    css += `\n${fs.readFileSync(path.join(HERE, "vertical.css"), "utf8")}\n${fs.existsSync(v) ? fs.readFileSync(v, "utf8") : ""}`;
  }
  const out = plantilla
    .replace("/*{{CSS}}*/", css)
    .replaceAll("{{TOTAL}}", total.toFixed(2))
    .replace("{{CLIPS}}", html.join("\n"))
    .replace("{{TIMELINE}}", tl.join("\n"));
  const dir = VERT ? path.join(EPDIR, "vertical") : EPDIR;
  fs.mkdirSync(dir, { recursive: true });
  const links = VERT ? [["assets", "../../../assets"], ["escenas", "../escenas"], ["musica-mezcla.mp3", "../musica-mezcla.mp3"]] : [["assets", "../../assets"]];
  for (const [n, t] of links) if (!fs.existsSync(path.join(dir, n)) && !fs.lstatSync(path.join(dir, n), { throwIfNoEntry: false })) fs.symlinkSync(t, path.join(dir, n));
  fs.writeFileSync(path.join(dir, "index.html"), out);
  if (!VERT) fs.writeFileSync(path.join(EPDIR, "tiempos.json"), JSON.stringify(escenas.map(({ id, start, voiceAt, voz, dur, real }) => ({ id, start: +start.toFixed(2), voiceAt: +voiceAt.toFixed(2), voz: +voz.toFixed(2), dur: +dur.toFixed(2), real })), null, 1));
  console.log(`${EP}${VERT ? "/vertical" : ""}/index.html: ${total.toFixed(1)} s${temporal ? " (tiempos estimados, falta voz)" : ""}`);
}

function render(v = "v001") {
  fs.mkdirSync(path.join(HERE, "out"), { recursive: true });
  const out = path.join(HERE, `out/ecosistema-${EP}-${VERT ? "vertical" : "horizontal"}-${v}.mp4`);
  execFileSync("pnpm", ["dlx", "hyperframes@0.9.9", "render", "-o", out, "--fps", String(FPS), "--quality", process.env.QUALITY || "high", "--video-frame-format", "png", ...(process.env.HF_ARGS ? process.env.HF_ARGS.split(" ") : [])], { cwd: VERT ? path.join(EPDIR, "vertical") : EPDIR, stdio: "inherit" });
  console.log(out);
}

const [cmd, arg] = process.argv.slice(2);
const cmds = { voz, musica, componer, render: () => render(arg), tiempos: () => console.log(JSON.stringify(tiempos(), null, 1)) };
if (!cmds[cmd]) {
  console.log("Uso: EP=ep01 [FORMATO=vertical] node armar.mjs voz [--enviar] | musica [--enviar] | componer | render [vNNN] | tiempos");
  process.exit(1);
}
await cmds[cmd]();
