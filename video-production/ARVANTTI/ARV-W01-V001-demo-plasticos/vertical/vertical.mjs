#!/usr/bin/env node
/**
 * Versión vertical 9:16 (1080x1920) del demo de plásticos para redes.
 *   node vertical.mjs voz [--enviar]     voz nueva por toma (ElevenLabs, con tiempos por carácter)
 *   node vertical.mjs musica [--enviar]  una pista corta de ElevenLabs Music (assets/musica.mp3)
 *   node vertical.mjs render [vNNN]      arma el video con tramos del video largo renderizado
 * El video largo se toma de LARGO=<ruta.mp4> (por defecto ../out/demo-plasticos-v008.mp4).
 * Cada clip es { desde, hasta, x }: segundos del video largo y recorte cuadrado de 904 px dentro de la pantalla.
 * Las credenciales sólo se leen del entorno y nunca se imprimen.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const LARGO = process.env.LARGO || join(HERE, "../out/demo-plasticos-v008.mp4");
const MUSICA = join(HERE, "assets/musica.mp3");
const PANTALLA = { x: 158, y: 72, s: 904 };
const LOGO = join(HERE, "../../../shared/arvantti/branding/ArvanttiLabsLogo.png");
const VOZ = join(HERE, "assets/voz");
const TMP = join(HERE, "assets/tmp");
const OUT = join(HERE, "out");
const W = 1080, H = 1920, FPS = 25, WIN = 1080, WIN_Y = 470, PAUSA = 0.6;
const FONT = "/usr/share/fonts/opentype/inter/InterDisplay-Bold.otf";

const guion = () => JSON.parse(readFileSync(join(HERE, "guion.json"), "utf8")).tomas;
const hash = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16);
const dur = (f) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString());
const ff = (args) => execFileSync("ffmpeg", ["-v", "error", "-y", ...args], { stdio: "inherit" });

const PRONUNCIA = [["APS", "a pe ese"], ["3D", "tres de"], ["DigitalTwin", "Digital Twin"]];
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

async function voz() {
  const enviar = process.argv.includes("--enviar");
  mkdirSync(VOZ, { recursive: true });
  const tomas = guion();
  const pend = tomas
    .map((t, i) => ({ t, i, h: hash(`${modelo()}|${paraVoz(t.texto).texto}`) }))
    .filter(({ t, h }) => {
      const meta = join(VOZ, `${t.id}.json`);
      return !(existsSync(meta) && existsSync(join(VOZ, `${t.id}.mp3`)) && JSON.parse(readFileSync(meta, "utf8")).hash === h);
    });
  console.log(`Voz: ${pend.length} tomas nuevas o cambiadas, ${pend.reduce((a, p) => a + p.t.texto.length, 0)} caracteres.`);
  if (!pend.length || !enviar) return pend.forEach((p) => console.log(`- ${p.t.id}: ${p.t.texto}`));
  const apiKey = process.env.ELEVENLABS_API_KEY, voiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!apiKey?.trim() || !voiceId?.trim()) throw new Error("Faltan ELEVENLABS_API_KEY o ELEVENLABS_VOICE_ID en el entorno.");
  for (const { t, i, h } of pend) {
    const pv = paraVoz(t.texto);
    const body = { text: pv.texto, model_id: modelo(), voice_settings: VOICE_SETTINGS };
    if (tomas[i - 1]) body.previous_text = paraVoz(tomas[i - 1].texto).texto;
    if (tomas[i + 1]) body.next_text = paraVoz(tomas[i + 1].texto).texto;
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=mp3_44100_128`;
    const pedir = (b) => fetch(url, { method: "POST", headers: { "xi-api-key": apiKey, "content-type": "application/json" }, body: JSON.stringify(b) });
    let res = await pedir(body);
    if (res.status === 400 || res.status === 422) res = await pedir({ text: pv.texto, model_id: modelo(), voice_settings: VOICE_SETTINGS });
    if (!res.ok) throw new Error(`${t.id}: ElevenLabs respondió HTTP ${res.status}; respuesta omitida por seguridad.`);
    const j = await res.json();
    writeFileSync(join(VOZ, `${t.id}.mp3`), Buffer.from(j.audio_base64, "base64"));
    let a = j.alignment || j.normalized_alignment;
    if (a && pv.texto !== t.texto && a.characters?.length === pv.texto.length)
      a = { characters: [...t.texto], character_start_times_seconds: pv.idx.map((k) => a.character_start_times_seconds[k]), character_end_times_seconds: pv.idx.map((k) => a.character_end_times_seconds[k]) };
    writeFileSync(join(VOZ, `${t.id}.json`), `${JSON.stringify({ hash: h, modelo: modelo(), texto: t.texto, alignment: a })}\n`);
    console.log(`${t.id}: ${dur(join(VOZ, `${t.id}.mp3`)).toFixed(1)} s`);
  }
}

/** Frases cortas de subtítulo (≤ 28 caracteres) con su inicio y fin según la alineación de la voz. */
function frases(texto, a) {
  const words = [];
  const re = /\S+/g;
  let m;
  while ((m = re.exec(texto))) {
    const s = a?.character_start_times_seconds?.[m.index], e = a?.character_end_times_seconds?.[m.index + m[0].length - 1];
    words.push({ w: m[0], s, e });
  }
  const out = [];
  let cur = [];
  const cerrar = () => cur.length && out.push({ txt: cur.map((x) => x.w).join(" "), s: cur[0].s, e: cur.at(-1).e }) && (cur = []);
  for (const w of words) {
    if (cur.length && cur.map((x) => x.w).join(" ").length + w.w.length + 1 > 34) cerrar();
    cur.push(w);
    if (/[.,:;]$/.test(w.w)) cerrar();
  }
  cerrar();
  return out;
}

const assT = (t) => {
  const cs = Math.max(0, Math.round(t * 100));
  return `${Math.floor(cs / 360000)}:${String(Math.floor(cs / 6000) % 60).padStart(2, "0")}:${String(Math.floor(cs / 100) % 60).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
};
const esc = (s) => s.replace(/[{}]/g, "").replace(/−/g, "-");

function render(ver = "v001") {
  mkdirSync(TMP, { recursive: true });
  mkdirSync(OUT, { recursive: true });
  const tomas = guion();
  let t0 = 0.3;
  const plan = tomas.map((t) => {
    const mp3 = join(VOZ, `${t.id}.mp3`);
    if (!existsSync(mp3)) throw new Error(`Falta la voz de ${t.id}: node vertical.mjs voz --enviar`);
    const meta = JSON.parse(readFileSync(join(VOZ, `${t.id}.json`), "utf8"));
    const d = dur(mp3);
    const largo = (t.id === tomas[0].id ? 0.3 : 0) + d + PAUSA + (t.cierre ? 2.2 : 0);
    const p = { ...t, voz: mp3, inicioVoz: t0, d, largo, frases: frases(t.texto, meta.alignment) };
    t0 += d + PAUSA;
    return p;
  });

  // 1) Cada toma a 1080x1920: fondo oscuro, ventana cuadrada con la toma recortada.
  const piezas = plan.map((p) => {
    const out = join(TMP, `${p.id}.mp4`);
    if (p.cierre) {
      ff(["-f", "lavfi", "-i", `color=c=0xffffff:s=${W}x${H}:r=${FPS}:d=${p.largo}`, "-loop", "1", "-i", LOGO,
        "-filter_complex", `[1]scale=900:-1,format=rgba,drawbox=x=iw*0.645:y=0:w=iw:h=ih*0.47:color=white:t=fill,drawbox=x=iw*0.42:y=0:w=iw*0.25:h=ih*0.145:color=white:t=fill,fade=in:st=0:d=0.6:alpha=1[l];[0][l]overlay=(W-w)/2:330:shortest=1,format=yuv420p`,
        "-t", String(p.largo), "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", out]);
      return out;
    }
    const { s } = PANTALLA;
    const ins = p.clips.flatMap((c) => ["-ss", String(c.desde), "-to", String(c.hasta), "-i", LARGO]);
    const vel = p.vel || 1;
    const cadena = p.clips.map((c, i) => `[${i}:v]setpts=(PTS-STARTPTS)/${vel},crop=${s}:${s}:${PANTALLA.x + c.x}:${PANTALLA.y},scale=${WIN}:${WIN}:flags=lanczos,fps=${FPS},setsar=1[c${i}]`).join(";");
    const concat = `${p.clips.map((_, i) => `[c${i}]`).join("")}concat=n=${p.clips.length}:v=1:a=0,tpad=stop_mode=clone:stop_duration=${p.largo}[v]`;
    ff([...ins, "-f", "lavfi", "-i", `color=c=0x05070c:s=${W}x${H}:r=${FPS}:d=${p.largo}`,
      "-filter_complex", `${cadena};${concat};[${p.clips.length}][v]overlay=0:${WIN_Y}:shortest=1,format=yuv420p`,
      "-t", String(p.largo), "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-an", out]);
    return out;
  });
  const lista = join(TMP, "lista.txt");
  writeFileSync(lista, piezas.map((f) => `file '${f}'`).join("\n"));
  const base = join(TMP, "base.mp4");
  ff(["-f", "concat", "-safe", "0", "-i", lista, "-c", "copy", base]);
  const total = dur(base);

  // 2) Textos (ASS): marca arriba, título por toma, subtítulos con la voz.
  let ini = 0;
  const ev = [];
  for (const p of plan) {
    const fin = ini + p.largo;
    const yT = p.cierre ? 1250 : 240;
    ev.push(`Dialogue: 1,${assT(ini)},${assT(fin)},Titulo,,0,0,0,,{\\pos(540,${yT})\\fad(250,150)${p.cierre ? "\\c&H2A1A0B&" : ""}}${esc(p.titulo[0])}\\N{\\c&H${p.cierre ? "D07A1E" : "3DB5FF"}&}${esc(p.titulo[1])}`);
    p.frases.forEach((f, k) => {
      if (f.s == null) return;
      const sig = p.frases[k + 1]?.s;
      const finF = sig != null ? Math.min(f.e + 0.15, sig - 0.02) : f.e + 0.15;
      ev.push(`Dialogue: 2,${assT(p.inicioVoz + f.s)},${assT(p.inicioVoz + finF)},Sub,,0,0,0,,{\\pos(540,${p.cierre ? 1440 : WIN_Y + WIN + 50})}${esc(f.txt)}`);
    });
    ini = fin;
  }
  ev.push(`Dialogue: 0,${assT(0)},${assT(total - 3)},Marca,,0,0,0,,ARVANTTI LABS  ·  GEMELO DIGITAL`);
  const ass = `[Script Info]
ScriptType: v4.00+
PlayResX: ${W}
PlayResY: ${H}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Marca,Inter Display,30,&H00B8A99A,&H00FFFFFF,&H00000000,&H00000000,1,0,0,0,100,100,6,0,1,0,0,8,60,60,90,1
Style: Titulo,Inter Display,84,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,1,0,0,0,100,100,0,0,1,0,0,5,50,50,0,1
Style: Sub,Inter Display,60,&H00FFFFFF,&H00FFFFFF,&H00000000,&HA0000000,1,0,0,0,100,100,0,0,3,14,0,8,60,60,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${ev.join("\n")}
`;
  const assF = join(TMP, "textos.ass");
  writeFileSync(assF, ass);

  // 3) Audio: voz por toma en su tiempo + música baja con sidechain, fundido al final.
  const vIns = plan.flatMap((p) => ["-i", p.voz]);
  const delays = plan.map((p, i) => `[${i + 1}:a]adelay=${Math.round(p.inicioVoz * 1000)}:all=1[a${i}]`).join(";");
  const mix = `${plan.map((_, i) => `[a${i}]`).join("")}amix=inputs=${plan.length}:normalize=0,apad=whole_dur=${total},asplit[voz][sc]`;
  const mus = `[${plan.length + 1}:a]aloop=loop=-1:size=2e9,atrim=0:${total},volume=0.32,afade=t=in:d=1,afade=t=out:st=${total - 2.5}:d=2.5[m];[m][sc]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[md]`;
  const out = join(OUT, `plasticos-vertical-${ver}.mp4`);
  ff(["-i", base, ...vIns, "-i", MUSICA,
    "-filter_complex", `${delays};${mix};${mus};[voz][md]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11[a];[0:v]subtitles=${assF}:fontsdir=/usr/share/fonts/opentype/inter[v]`,
    "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-t", String(total), out]);
  console.log(`${out}: ${dur(out).toFixed(1)} s`);
}

const PROMPT_MUSICA =
  "Epic cinematic orchestral underscore for a short technology product teaser, original composition, no vocals. Driving low strings ostinato, soft taiko pulse, warm brass swells, hopeful and confident, steady energy that builds to a clear ending, mixed with space for a narrator voice.";

async function musica() {
  if (existsSync(MUSICA)) return console.log(`Ya existe ${MUSICA}.`);
  if (!process.argv.includes("--enviar")) return console.log("Para pedirla a ElevenLabs Music: node vertical.mjs musica --enviar");
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey?.trim()) throw new Error("Falta ELEVENLABS_API_KEY en el entorno.");
  mkdirSync(dirname(MUSICA), { recursive: true });
  const res = await fetch("https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128", {
    method: "POST",
    headers: { "xi-api-key": apiKey, "content-type": "application/json" },
    body: JSON.stringify({ prompt: PROMPT_MUSICA, music_length_ms: 75000, model_id: "music_v1" }),
  });
  if (!res.ok) throw new Error(`ElevenLabs Music respondió HTTP ${res.status}; respuesta omitida por seguridad.`);
  writeFileSync(MUSICA, Buffer.from(await res.arrayBuffer()));
  console.log(`${MUSICA}: ${dur(MUSICA).toFixed(1)} s`);
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === "voz") await voz();
else if (cmd === "musica") await musica();
else if (cmd === "render") render(arg);
else console.log("Uso: node vertical.mjs voz [--enviar] | musica [--enviar] | render [vNNN]");
