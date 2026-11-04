#!/usr/bin/env node
/**
 * Video de lanzamiento de Arvantti Digital Twin (1920x1080, ~2 min).
 *
 *   node tomas.cjs todo            graba las tomas en assets/tomas/ (galería y emulador corriendo)
 *   node armar.mjs preparar        lapso del play en MP4, clip del Gantt, marca del logo y música de fondo
 *   node armar.mjs componer        mide la voz de cada escena (o la estima) y escribe index.html
 *   node armar.mjs render [vNNN]   renderiza out/lanzamiento-<vNNN>.mp4
 *
 * La voz: un `pnpm video:voice --project <este proyecto>/escenas/<escena>` por escena (pide ENVIAR).
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const T = (p) => path.join(HERE, p);
const FPS = 25;
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
  { id: "planes", dir: "09-planes", lead: 0.3, tail: 1.2 },
  { id: "cierre", dir: "10-cierre", lead: 1.0, tail: 3.0 },
];

const texto = (e) => fs.readFileSync(T(`escenas/${e.dir}/script.md`), "utf8").trim();
const vozDe = (e) => T(`escenas/${e.dir}/assets/audio/voiceover.mp3`);
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
      <svg class="estela" viewBox="0 0 1920 1080"><defs><linearGradient id="gEst" x1="0" x2="1"><stop offset="0" stop-color="#2d7ff9" stop-opacity="0"/><stop offset=".7" stop-color="#4ea7ff"/><stop offset="1" stop-color="#ffffff"/></linearGradient></defs>
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
      <div class="col">${kicker("01", "PLANIFICA")}<h2 class="big">${words("Todo empieza con el plan.")}</h2>
      <div class="chips">${["Moldes", "Turnos", "Colores", "Entregas"].map((c) => `<span class="chip">${c}</span>`).join("")}</div>
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
    at("#e-planifica .chip", { opacity: 0, y: 20, scale: 0.9 }, { opacity: 1, y: 0, scale: 1, duration: 0.5, stagger: 0.32, ease: "back.out(2)" }, enPalabra(x, "moldes"));
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
    const tI = enPalabra(x, "inyectoras"), tM = enPalabra(x, "montacargas"), tO = enPalabra(x, "operarios"), tV = enPalabra(x, "inventarios"), tP = enPalabra(x, "Dale play");
    html.push(`<video id="lapso" class="clip bleedv" src="assets/clips/lapso.mp4" muted playsinline data-start="${s.toFixed(2)}" data-duration="${(tI - s + 0.4).toFixed(2)}" data-track-index="4"></video>`);
    clip("e-gemelo", "scene", s, d, `
      <div class="bleed b1"><img src="assets/tomas/3d-inyectoras-2.png" alt=""></div>
      <div class="bleed b2"><img src="assets/tomas/3d-medio.png" alt=""></div>
      <div class="bleed b3"><img src="assets/tomas/3d-silos.png" alt=""></div>
      <div class="bleed b4"><img src="assets/tomas/3d-ui.png" alt=""></div>
      <div class="vignette"></div>
      <div class="hud"><i class="c tl"></i><i class="c tr"></i><i class="c bl"></i><i class="c br"></i><div class="scan"></div><p class="live">● PROYECCIÓN · HORA POR HORA</p><div class="scrub"><i></i></div></div>
      <div class="lowerleft">${kicker("02", "GEMELO 3D")}<h2 class="big">${words("Míralo vivir.")}</h2></div>
      <p class="label" id="lb-0">Inyectoras</p><p class="label" id="lb-1">Montacargas · Operarios</p><p class="label" id="lb-2">Inventarios</p>
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
    const cuts = [["b1", tI, tM], ["b2", tM, tV], ["b3", tV, tP], ["b4", tP, s + d]];
    cuts.forEach(([b, a, z], i) => {
      at(`#e-gemelo .${b}`, { opacity: 0, clipPath: "circle(0% at 50% 50%)" }, { opacity: 1, clipPath: "circle(80% at 50% 50%)", duration: 0.7, ease: "power3.inOut" }, a - 0.15);
      at(`#e-gemelo .${b} img`, { scale: 1.25, x: i % 2 ? 60 : -60 }, { scale: 1.05, x: 0, duration: z - a + 0.7, ease: "power1.out" }, a - 0.15);
      if (i < 3) {
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
      <div class="top">${kicker("03", "CENTRO DE CONTROL")}<h2 class="mid">${words("Cada indicador, en su lugar.")}</h2></div>
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
      <div class="tags">${["Entregas", "Cambios de molde", "Ocupación", "Energía"].map((c) => `<span class="chip">${c}</span>`).join("")}</div>
      <div class="bleed b4"><img src="assets/tomas/3d-ui.png" alt=""></div>
      <div class="decide"><p>${words("Tú decides.")}</p><button>ENVIAR A PLANTA</button></div>`, 3);
    enter("e-fractal", s);
    at("#e-fractal .q2 .w", { opacity: 0, y: 40, filter: "blur(12px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.6, stagger: 0.07, ease: "power3.out" }, x.voiceAt);
    to("#e-fractal .q2", { opacity: 0, scale: 0.8, filter: "blur(16px)", duration: 0.5, ease: "power2.in" }, tG - 0.4);
    at("#e-fractal .topl", { opacity: 0 }, { opacity: 1, duration: 0.5 }, tG - 0.2);
    cards.forEach((_, i) => {
      const k = i - 2;
      at(`#e-fractal .c${i}`, { opacity: 0, z: -1600, rotateY: 0, x: 0 }, { opacity: 1, z: -Math.abs(k) * 220, rotateY: -k * 16, x: k * 330, duration: 1.1, ease: "power3.out" }, tG + i * 0.12);
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
    const q = "¿Qué máquina va más cargada esta semana?";
    const a = "La IMM-21, con 71,4 % de ocupación. Fractal puede repartir su carga sin mover ninguna entrega.";
    clip("e-asistente", "scene", s, d, `
      <div class="topl">${kicker("05", "ASISTENTE IA")}</div>
      <div class="chat"><div class="bar"><span class="dot"></span> Asistente IA <span class="badge">Solo consulta · según tu rol</span></div>
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
    const left = ["IMM-01", "IMM-04", "IMM-21", "Ensamble"].map((n, i) => ({ n, x: 240, y: 260 + i * 170 }));
    const core = { x: 960, y: 515 }, erp = { x: 1680, y: 515 };
    const lines = left.map((p, i) => `<line id="ln${i}" x1="${p.x + 110}" y1="${p.y}" x2="${core.x - 150}" y2="${core.y}" pathLength="1"/>`).join("") + `<line id="lnE" x1="${core.x + 150}" y1="${core.y}" x2="${erp.x - 120}" y2="${erp.y}" pathLength="1"/>`;
    const dots = left.map((p, i) => `<circle class="pk" id="pk${i}" r="7" cx="${p.x + 110}" cy="${p.y}"/>`).join("") + `<circle class="pk" id="pkE" r="7" cx="${erp.x - 120}" cy="${erp.y}"/>`;
    clip("e-conecta", "scene", s, d, `
      <div class="bleed dim"><img src="assets/tomas/ui-arquitectura.png" alt=""></div>
      <div class="topl">${kicker("06", "CONECTA")}</div>
      <svg class="net" viewBox="0 0 1920 1080">${lines}${dots}</svg>
      ${left.map((p, i) => `<div class="node m" id="nd${i}" style="left:${p.x - 110}px;top:${p.y - 42}px">${p.n}<small>PLC</small></div>`).join("")}
      <div class="proto" style="left:560px;top:${core.y - 160}px">OPC UA · MQTT</div>
      <div class="core" style="left:${core.x - 150}px;top:${core.y - 150}px"><img src="assets/clips/marca.png" alt=""><span>Digital Twin</span></div>
      <div class="node erp" style="left:${erp.x - 120}px;top:${erp.y - 60}px">ERP<small>pedidos · inventario</small></div>
      <h2 class="bottomc">${words("Conectado.")}</h2>`, 3);
    enter("e-conecta", s);
    at("#e-conecta .core", { opacity: 0, scale: 0.5 }, { opacity: 1, scale: 1, duration: 0.8, ease: "back.out(1.7)" }, s + 0.2);
    at("#e-conecta .node.m", { opacity: 0, x: -60 }, { opacity: 1, x: 0, duration: 0.5, stagger: 0.1, ease: "power3.out" }, tM - 0.3);
    left.forEach((p, i) => {
      at(`#ln${i}`, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.6, ease: "power2.out" }, tM + i * 0.1);
      at(`#pk${i}`, { attr: { cx: p.x + 110, cy: p.y }, opacity: 1 }, { attr: { cx: core.x - 150, cy: core.y }, opacity: 1, duration: 0.9, ease: "power1.in", repeat: 3, repeatDelay: 0.2 + i * 0.05 }, tM + 0.4 + i * 0.12);
    });
    at("#e-conecta .proto", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.5 }, tM + 0.5);
    at("#e-conecta .erp", { opacity: 0, x: 60 }, { opacity: 1, x: 0, duration: 0.5, ease: "back.out(1.7)" }, tE - 0.3);
    at("#lnE", { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.5 }, tE - 0.1);
    at("#pkE", { attr: { cx: erp.x - 120, cy: erp.y }, opacity: 1 }, { attr: { cx: core.x + 150, cy: core.y }, opacity: 1, duration: 0.8, ease: "power1.in", repeat: 2, repeatDelay: 0.2 }, tE + 0.3);
    at("#e-conecta .bottomc .w", { opacity: 0, y: 30, filter: "blur(10px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.6 }, tE + 0.5);
    sfx(8, "spark.wav", tM, 0.25);
    leave("e-conecta", s + d);
  }

  // 9. Planes.
  {
    const x = S.planes; const [s, d] = span(x);
    const tP = enPalabra(x, "Planifica"), tG = enPalabra(x, "Gemelo"), tF = enPalabra(x, "Fractal"), tI = enPalabra(x, "Cada uno"), tU = enPalabra(x, "diez usuarios");
    const planes = [
      ["Planifica", ["APS con tabla y Gantt", "Versiones de la programación", "Cosimulador"]],
      ["Gemelo", ["Todo Planifica, más:", "Gemelo 3D de la planta", "Centro de control", "Emulador"]],
      ["Fractal", ["Todo Gemelo, más:", "Escenarios multiobjetivo", "Asistente IA"]],
    ];
    clip("e-planes", "scene", s, d, `
      <h2 class="center tp">${words("Tres planes.")}</h2>
      <div class="plans">${planes.map(([n, l], i) => `<div class="plan p${i}"><p class="pn">${n}</p><ul>${l.map((t) => `<li>${t}</li>`).join("")}</ul></div>`).join("")}</div>
      <div class="incl"><i></i></div>
      <p class="users"><b>10</b> usuarios incluidos en cada plan</p>`, 3);
    enter("e-planes", s);
    at("#e-planes .tp .w", { opacity: 0, y: 40, filter: "blur(10px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.6, stagger: 0.1, ease: "power3.out" }, x.voiceAt - 0.1);
    to("#e-planes .tp", { y: -330, scale: 0.6, duration: 0.7, ease: "power3.inOut" }, tP - 0.5);
    [tP, tG, tF].forEach((t, i) => {
      at(`#e-planes .p${i}`, { opacity: 0, y: 140, rotateX: -25 }, { opacity: 1, y: 0, rotateX: 0, duration: 0.8, ease: "power3.out" }, t - 0.15);
      at(`#e-planes .p${i} li`, { opacity: 0, x: -20 }, { opacity: 1, x: 0, duration: 0.35, stagger: 0.08 }, t + 0.25);
    });
    at("#e-planes .incl i", { scaleX: 0 }, { scaleX: 1, duration: 1.2, ease: "power2.inOut" }, tI);
    at("#e-planes .users", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.6, ease: "back.out(1.6)" }, tU - 0.1);
    at("#e-planes .users b", { scale: 0.4 }, { scale: 1, duration: 0.6, ease: "back.out(2.4)" }, tU);
    [tP, tG, tF].forEach((t, i) => sfx(`9${i}`, "pop.mp3", t, 0.25));
    leave("e-planes", s + d);
  }

  // 10. Cierre.
  {
    const x = S.cierre; const [s, d] = span(x);
    const tD = enPalabra(x, "Decide");
    clip("e-cierre", "scene", s, d, `
      <svg class="estela" viewBox="0 0 1920 1080"><path id="p2" d="M-60 470 C 380 470 560 690 960 560 S 1520 430 1980 640" pathLength="1"/></svg>
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

  [S.titulo, S.planifica, S.gemelo, S.fractal, S.planes, S.cierre].forEach((x) => sweep(x.start));

  // Voz por escena y música.
  escenas.forEach((x) => { if (x.real) audio(`voz-${x.id}`, `escenas/${x.dir}/assets/audio/voiceover.mp3`, x.voiceAt, x.voz, 1); });
  if (fs.existsSync(T("assets/clips/musica.mp3"))) audio("musica", "assets/clips/musica.mp3", 0, total, 0.22);
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
  const out = T(`out/lanzamiento-${v}.mp4`);
  execFileSync("pnpm", ["dlx", "hyperframes@0.9.9", "render", "-o", out, "--fps", String(FPS), "--quality", process.env.QUALITY || "standard", "--video-frame-format", "png", ...(process.env.HF_ARGS ? process.env.HF_ARGS.split(" ") : [])], { cwd: HERE, stdio: "inherit" });
  console.log(out);
}

const [cmd, arg] = process.argv.slice(2);
const cmds = { preparar, componer, render: () => render(arg), tiempos: () => console.log(tiempos()) };
if (!cmds[cmd]) {
  console.log("Uso: node armar.mjs preparar | componer | render [vNNN] | tiempos");
  process.exit(1);
}
cmds[cmd]();
