#!/usr/bin/env node
/**
 * "Arvantti Digital Twin: la IA en cada módulo" (guion aprobado por Andy el 2026-11-22).
 *   node tomas.cjs todo                    tomas del 3D (vertical y horizontal) y de la interfaz
 *   node voz.mjs --enviar                  voz por escena (ElevenLabs)
 *   node armar.mjs preparar                vuelo en MP4, marca del logo y música de respaldo
 *   FMT=v node armar.mjs componer          index.html vertical 1080x1920 (FMT=h: horizontal 1920x1080)
 *   FMT=v node armar.mjs render v001       out/<salida>-v001.mp4 (horizontal: <salida>-h-v001.mp4)
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { vozDe, alineacionDe } from "./voz.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const T = (p) => path.join(HERE, p);
const FPS = 25;
const FMT = process.env.FMT === "h" ? "h" : "v";
const [W, H] = FMT === "h" ? [1920, 1080] : [1080, 1920];
const V = JSON.parse(fs.readFileSync(T("video.json"), "utf8"));
const sh = (cmd, args) => execFileSync(cmd, args, { stdio: "inherit" });

// Disposición por formato: cabecera (kicker, módulo, IA), escenario de 900x640 escalado, subtítulos y heptágono pequeño.
const L = FMT === "v"
  ? { head: { x: 70, y: 210, w: 940 }, stage: { x: 90, y: 600, s: 1 }, sub: { top: 1330, h: 200, side: 60, font: 56 }, mini: { x: 390, y: 1590, s: 300 }, hook: 98 }
  : { head: { x: 100, y: 120, w: 700 }, stage: { x: 880, y: 150, s: 1.044 }, sub: { top: 880, h: 150, side: 160, font: 46 }, mini: { x: 220, y: 540, s: 300 }, hook: 96 };

function duracion(f) {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f], { encoding: "utf8" });
  return Number(r.stdout.trim());
}

// ---------------------------------------------------------------- tiempos
const COLA = { gancho: [0.3, 0.5], cierre: [0.4, 4.2] };
function tiempos() {
  let t = 0;
  const escenas = V.escenas.map((e) => {
    const [lead, tail] = COLA[e.id] || [0.35, 0.65];
    const real = fs.existsSync(vozDe(e.id));
    const voz = real ? duracion(vozDe(e.id)) : e.voz.split(/\s+/).length / 2.5;
    const x = { ...e, txt: e.voz, real, start: t, voiceAt: t + lead, voz, dur: lead + voz + tail };
    t += x.dur;
    return x;
  });
  return { escenas, total: t };
}
function alineacion(x) {
  if (!fs.existsSync(alineacionDe(x.id))) return null;
  const j = JSON.parse(fs.readFileSync(alineacionDe(x.id), "utf8"));
  const a = j.alignment?.character_start_times_seconds;
  return j.texto === x.txt && a?.length === x.txt.length ? a : null;
}
const enIndice = (x, i) => { const a = alineacion(x); return +(x.voiceAt + (a ? a[i] : (i / x.txt.length) * x.voz)).toFixed(2); };
function en(x, frag, desde = "") {
  const i = x.txt.indexOf(frag, desde ? x.txt.indexOf(desde) : 0);
  if (i < 0) throw new Error(`"${frag}" no está en ${x.id}`);
  return enIndice(x, i);
}
function palabras(x) {
  const out = [], re = /\S+/g;
  let m;
  while ((m = re.exec(x.txt))) out.push({ w: m[0], t: enIndice(x, m.index) });
  out.forEach((p, k) => (p.f = k + 1 < out.length ? out[k + 1].t : x.voiceAt + x.voz));
  return out;
}
function frases(ps) {
  const out = [];
  let cur = [];
  const max = FMT === "v" ? 30 : 44;
  ps.forEach((p, k) => {
    cur.push(p);
    const largo = cur.map((c) => c.w).join(" ").length, sig = ps[k + 1];
    if (!sig || /[.,:;?!]$/.test(p.w) || cur.length >= (FMT === "v" ? 5 : 7) || largo + (sig ? sig.w.length + 1 : 0) > max) { out.push(cur); cur = []; }
  });
  return out;
}

// ---------------------------------------------------------------- preparar
const MARCA = `import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert("RGB").crop((560, 150, 980, 500))
out = Image.new("RGBA", im.size)
out.putdata([(r, g, b, max(0, min(255, int((max(r, g, b) - 40) * 255 / 70)))) for r, g, b in im.getdata()])
out.save(sys.argv[2])`;
function preparar() {
  const clips = T("assets/clips");
  fs.mkdirSync(clips, { recursive: true });
  for (const f of ["v", "h"]) {
    const dir = T(`assets/tomas/${f}/vuelo`);
    if (!fs.existsSync(dir)) continue;
    // Pocos cuadros del 3D estirados a ~12 s con interpolación de movimiento (la cámara se mueve suave).
    const n = fs.readdirSync(dir).filter((x) => x.endsWith(".png")).length;
    sh("ffmpeg", ["-y", "-v", "error", "-framerate", (n / 12).toFixed(3), "-i", path.join(dir, "f%03d.png"), "-vf", `minterpolate=fps=${FPS}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1,format=yuv420p`, "-c:v", "libx264", "-crf", "16", "-preset", "slow", path.join(clips, `vuelo-${f}.mp4`)]);
  }
  sh("python3", ["-I", "-c", MARCA, T("assets/shared/arvantti/branding/ArvanttiLabsLogo.png"), path.join(clips, "marca.png")]);
  const pad = "0.10*sin(2*PI*110*t)+0.07*sin(2*PI*164.81*t)+0.06*sin(2*PI*220*t)+0.05*sin(2*PI*277.18*t)+0.035*sin(2*PI*329.63*t)";
  const expr = `(${pad})*(0.75+0.25*sin(2*PI*t/8))+0.06*sin(2*PI*55*t)*exp(-mod(t,2)*3)`;
  sh("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", `aevalsrc='${expr}|${expr}':s=48000:d=140`, "-af", "lowpass=f=1800,aecho=0.8:0.7:400|700:0.25|0.18,afade=t=in:d=3,volume=0.9", "-c:a", "libmp3lame", "-q:a", "2", path.join(clips, "musica.mp3")]);
  console.log("listo: assets/clips/");
}

/** Música bajo la voz (sidechain), recortada y fundida. Usa la pista de la serie si está en assets/clips/musica-serie.mp3. */
function mezcla(escenas, total) {
  const serie = T("assets/clips/musica-serie.mp3");
  const src = fs.existsSync(serie) ? serie : T("assets/clips/musica.mp3");
  const out = T("assets/clips/mezcla.mp3");
  const args = ["-y", "-v", "error", "-stream_loop", "-1", "-i", src];
  const voces = escenas.filter((x) => x.real);
  voces.forEach((x) => args.push("-i", vozDe(x.id)));
  const del = voces.map((x, i) => `[${i + 1}:a]adelay=${Math.round(x.voiceAt * 1000)}:all=1,aformat=sample_rates=48000:channel_layouts=stereo[v${i}]`).join(";");
  const fin = `[0:a]aformat=sample_rates=48000:channel_layouts=stereo,atrim=0:${total.toFixed(2)},volume=${fs.existsSync(serie) ? 0.55 : 0.3},afade=t=in:d=0.6,afade=t=out:st=${(total - 3.5).toFixed(2)}:d=3.5[m]`;
  args.push("-filter_complex", `${del};${voces.map((_, i) => `[v${i}]`).join("")}amix=inputs=${voces.length}:normalize=0,apad=whole_dur=${total.toFixed(2)},asplit[vz][sc];${fin};[m][sc]sidechaincompress=threshold=0.03:ratio=8:attack=40:release=600[mb];[vz][mb]amix=inputs=2:normalize=0,atrim=0:${total.toFixed(2)},loudnorm=I=-15:TP=-1.5:LRA=11[out]`, "-map", "[out]", "-ar", "48000", "-c:a", "libmp3lame", "-b:a", "256k", out);
  execFileSync("ffmpeg", args, { stdio: "inherit" });
  return path.relative(HERE, out);
}

// ---------------------------------------------------------------- composición
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const words = (s) => s.split(" ").map((w) => `<span class="w">${w}</span>`).join(" ");
const MOD = ["Integrator", "APS", "CoSimulation", "Fractal Industrial", "Control Center", "Dendro Scada", "AI Embedded Assistant"];
const FONDO = { nucleo: "p-heroe", integrator: "p-medio", aps: "ui:aps-gantt", cosim: "p-inyectoras", fractal: "p-silos", control: "ui:control", dendro: "p-inyectoras-2", asistente: "p-ui" };
const fondoSrc = (id) => { const f = FONDO[id]; return f.startsWith("ui:") ? `assets/tomas/ui/${f.slice(3)}.png` : `assets/tomas/${FMT}/${f}.png`; };

function componer() {
  const { escenas, total } = tiempos();
  const S = Object.fromEntries(escenas.map((x) => [x.id, x]));
  const html = [], tl = [];
  const q = (v) => JSON.stringify(v);
  const at = (sel, from, to, t) => tl.push(`tl.fromTo(${q(sel)},${q(from)},${q(to)},${(+t).toFixed(2)});`);
  const to = (sel, v, t) => tl.push(`tl.to(${q(sel)},${q(v)},${(+t).toFixed(2)});`);
  const set = (sel, v, t) => tl.push(`tl.set(${q(sel)},${q(v)},${(+t).toFixed(2)});`);
  const clip = (id, cls, start, dur, inner, z = 2) => html.push(`<div id="${id}" class="clip ${cls}" data-start="${start.toFixed(2)}" data-duration="${dur.toFixed(2)}" data-track-index="${z}">${inner}</div>`);
  let nA = 0;
  const audio = (id, src, start, dur, vol) => html.push(`<audio id="${id}" src="${src}" data-start="${start.toFixed(2)}" data-duration="${dur.toFixed(2)}" data-volume="${vol}" data-track-index="${70 + nA++}"></audio>`);
  const sfx = (file, t, vol = 0.25) => audio(`sfx-${nA}`, `assets/shared/core/sfx/${file}`, Math.max(0, t), 1.4, vol);
  const X = 0.4;
  const span = (x) => [Math.max(0, x.start - X / 2), x.dur + X];
  const enter = (id, t) => at(`#${id}`, { opacity: 0 }, { opacity: 1, duration: X, ease: "power2.out" }, t);
  const leave = (id, t) => to(`#${id}`, { opacity: 0, duration: X, ease: "power2.in" }, t - X);
  const pop = (sel, t, extra = {}) => at(sel, { opacity: 0, scale: 0.7, y: 20 }, { opacity: 1, scale: 1, y: 0, duration: 0.45, ease: "back.out(1.8)", ...extra }, t);
  const fade = (sel, t, d = 0.4) => at(sel, { opacity: 0 }, { opacity: 1, duration: d }, t);
  const out = (sel, t, d = 0.35) => to(sel, { opacity: 0, duration: d }, t);

  clip("fondo", "fondo", 0, total, `<div class="glow"></div>`, 0);

  // Escena de módulo: fondo 3D o pantalla, cabecera con el módulo y lo que hace la IA, y el escenario de 900x640.
  function escenaModulo(x, stage) {
    const [s, d] = span(x);
    const n = x.modulo;
    const kick = n === 0 ? "NÚCLEO" : `MÓDULO ${n}`;
    clip(`e-${x.id}`, "scene", s, d, `
      <div class="bleed"><img src="${fondoSrc(x.id)}" alt=""></div><div class="shade"></div>
      <div class="head"><p class="kicker"><b>${kick}</b></p><h2 class="mname">${x.nombre}</h2><p class="iab"><span class="dot"></span><em>IA</em>${x.ia}</p></div>
      <div class="stage">${stage}</div>`, 3);
    enter(`e-${x.id}`, s);
    at(`#e-${x.id} .bleed img`, { scale: 1.12 }, { scale: 1.02, duration: d, ease: "none" }, s);
    at(`#e-${x.id} .kicker`, { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 0.4, ease: "power3.out" }, s + 0.15);
    at(`#e-${x.id} .mname`, { opacity: 0, y: 30, filter: "blur(8px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.5, ease: "power3.out" }, s + 0.25);
    at(`#e-${x.id} .iab`, { opacity: 0, x: -40 }, { opacity: 1, x: 0, duration: 0.45, ease: "power3.out" }, s + 0.6);
    at(`#e-${x.id} .iab .dot`, { scale: 0 }, { scale: 1, duration: 0.4, ease: "back.out(3)" }, s + 0.75);
    at(`#e-${x.id} .stage`, { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" }, s + 0.3);
    sfx("whoosh-short.mp3", s + 0.1, 0.22);
    sfx("pop.mp3", s + 0.75, 0.22);
    leave(`e-${x.id}`, s + d);
    return `#e-${x.id} .stage`;
  }

  // 1. Gancho: vuelo sobre el gemelo 3D desde el primer cuadro.
  {
    const x = S.gancho; const d = x.dur + X / 2;
    html.push(`<video id="g-vuelo" class="clip bleedv" src="assets/clips/vuelo-${FMT}.mp4" muted playsinline data-start="0" data-duration="${d.toFixed(2)}" data-track-index="1"></video>`);
    clip("e-gancho", "scene", 0, d, `<div class="shade"></div>
      <div class="hud"><i class="c tl"></i><i class="c tr"></i><i class="c bl"></i><i class="c br"></i></div>
      <div class="tag3d"><i></i>ARVANTTI DIGITAL TWIN · 3D</div>
      <h1 class="hook"><span class="l1">${words("La IA no es un módulo.")}</span><span class="l2">${words("Está en todos.")}</span></h1>`, 3);
    at("#g-vuelo", { scale: 1.08 }, { scale: 1.0, duration: d, ease: "none" }, 0);
    at("#e-gancho .tag3d", { opacity: 0, x: -40 }, { opacity: 1, x: 0, duration: 0.5, ease: "back.out(2)" }, en(x, "Arvantti") - 0.1);
    at("#e-gancho .l1 .w", { opacity: 0, y: 40, filter: "blur(10px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.4, stagger: 0.09, ease: "power3.out" }, en(x, "inteligencia"));
    at("#e-gancho .l2 .w", { opacity: 0, y: 40, filter: "blur(10px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.4, stagger: 0.12, ease: "power3.out" }, en(x, "Está en"));
    sfx("hit.wav", 0.05, 0.25);
    sfx("spark.wav", en(x, "Está en"), 0.25);
    to("#e-gancho, #g-vuelo", { opacity: 0, duration: X }, d - X);
  }

  // 2. Núcleo: planos, fotos y catálogos se vuelven 3D; luego el cerebro empresarial en grafo.
  {
    const x = S.nucleo;
    const nodos = [["Equipos", 170, 150], ["Procesos", 730, 150], ["Pedidos", 170, 500], ["Personas", 730, 500]];
    const menores = Array.from({ length: 14 }, (_, i) => { const a = (i / 14) * Math.PI * 2 + 0.2; return [450 + Math.cos(a) * (300 + rnd() * 110), 325 + Math.sin(a) * (210 + rnd() * 70)]; });
    const st = escenaModulo(x, `
      <div class="doc" id="n-d0"><p>PLANO</p><svg viewBox="0 0 240 130"><rect x="10" y="10" width="220" height="110"/><line x1="10" y1="60" x2="130" y2="60"/><line x1="130" y1="10" x2="130" y2="120"/><rect x="150" y="30" width="60" height="40"/><circle cx="60" cy="95" r="16"/></svg></div>
      <div class="doc" id="n-d1"><p>FOTO</p><img src="assets/tomas/${FMT}/p-inyectoras-2.png" alt=""></div>
      <div class="doc" id="n-d2"><p>CATÁLOGO</p><div class="spec"><i></i><i></i><i></i><i></i><i></i></div></div>
      <div class="panel" id="n-3d"><img src="assets/tomas/ui/equipos.png" alt=""><div class="scan"></div></div>
      <svg class="graph" id="n-g" viewBox="0 0 900 640">
        ${menores.map(([a, b], i) => `<line class="e2" x1="${nodos[i % 4][1]}" y1="${nodos[i % 4][2]}" x2="${a.toFixed(0)}" y2="${b.toFixed(0)}"/>`).join("")}
        ${nodos.map(([, a, b], i) => `<line class="e1" id="n-e${i}" x1="450" y1="325" x2="${a}" y2="${b}" pathLength="1"/>`).join("")}
        <line class="e2" x1="170" y1="150" x2="730" y2="150"/><line class="e2" x1="170" y1="500" x2="730" y2="500"/><line class="e2" x1="170" y1="150" x2="170" y2="500"/><line class="e2" x1="730" y1="150" x2="730" y2="500"/>
        ${menores.map(([a, b]) => `<circle class="n2" cx="${a.toFixed(0)}" cy="${b.toFixed(0)}" r="9"/>`).join("")}
      </svg>
      <div class="gcore" id="n-core"><span class="dot"></span>Cerebro<br>empresarial</div>
      ${nodos.map(([n, a, b], i) => `<div class="gnode" id="n-n${i}" style="left:${a - 95}px;top:${b - 34}px">${n}</div>`).join("")}`);
    const tP = en(x, "planos"), tF = en(x, "fotos"), tC = en(x, "catálogos"), tA = en(x, "arma rápido"), tN = en(x, "Pero el núcleo"), tB = en(x, "cerebro"), tG = en(x, "un grafo");
    [tP, tF, tC].forEach((t, i) => { at(`${st} #n-d${i}`, { opacity: 0, y: -60, rotate: i === 1 ? 4 : -4 }, { opacity: 1, y: 0, rotate: i === 1 ? 2 : -2, duration: 0.5, ease: "back.out(1.6)" }, t - 0.1); sfx("click-soft.mp3", t, 0.2); });
    [320, 15, -290].forEach((dx, i) => to(`${st} #n-d${i}`, { x: dx, y: 250, scale: 0.2, opacity: 0, rotate: 0, duration: 0.6, ease: "power3.in" }, tA - 0.3 + i * 0.06));
    at(`${st} #n-3d`, { opacity: 0, clipPath: "inset(50% 50% 50% 50%)" }, { opacity: 1, clipPath: "inset(0% 0% 0% 0%)", duration: 0.7, ease: "power3.inOut" }, tA + 0.3);
    at(`${st} #n-3d .scan`, { y: -60 }, { y: 510, duration: 1.6, ease: "power1.inOut", repeat: 1 }, tA + 0.6);
    sfx("spark.wav", tA + 0.3, 0.22);
    to(`${st} #n-3d`, { opacity: 0.18, scale: 0.96, filter: "blur(3px)", duration: 0.6 }, tN);
    fade(`${st} #n-g .e2`, tB - 0.2, 0.8);
    fade(`${st} #n-g .n2`, tB - 0.1, 0.8);
    pop(`${st} #n-core`, tB - 0.1);
    sfx("pop.mp3", tB, 0.25);
    nodos.forEach(([n], i) => {
      const t = en(x, n.toLowerCase(), "un grafo");
      at(`${st} #n-e${i}`, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.4, ease: "power2.out" }, Math.min(t - 0.3, tG + i * 0.15));
      pop(`${st} #n-n${i}`, t - 0.15);
      tl.push(`tl.to(${q(`${st} #n-n${i}`)},{boxShadow:"0 0 0 3px #4ea7ff, 0 0 50px #2d7ff9cc",duration:.3,yoyo:true,repeat:1},${t.toFixed(2)});`);
      sfx("click-soft.mp3", t, 0.18);
    });
    tl.push(`tl.to(${q(`${st} #n-g .n2`)},{fill:"#4ea7ff",duration:.3,stagger:.05},${(en(x, "información") - 0.3).toFixed(2)});`);
  }

  // 3. Integrator: datos de ERP, CRM y SCADA; la IA marca los que no cuadran.
  {
    const x = S.integrator;
    const SYS = [["ERP", "Software de gestión"], ["CRM", "Clientes"], ["SCADA", "Vigila las máquinas"]];
    const FILAS = [["PED-1041", "2.400 u", "Línea 2", "68 °C", ""], ["PED-1042", "1.800 u", "Línea 1", "66 °C", ""], ["PED-1043", "−120 u", "Línea 3", "67 °C", "Cantidad negativa"], ["PED-1044", "3.200 u", "Línea 2", "65 °C", ""], ["PED-1045", "900 u", "Línea 9", "64 °C", "Línea inexistente"], ["PED-1046", "2.100 u", "Línea 4", "410 °C", "Temperatura imposible"]];
    const st = escenaModulo(x, `
      ${SYS.map(([n, sub], i) => `<div class="sys" id="i-s${i}" style="top:${40 + i * 200}px"><b>${n}</b><small>${sub}</small></div>`).join("")}
      <svg class="flow" viewBox="0 0 900 640">${SYS.map((_, i) => `<path id="i-l${i}" d="M240 ${100 + i * 200} C 290 ${100 + i * 200}, 290 320, 330 320" pathLength="1"/>`).join("")}</svg>
      <div class="tabla" id="i-t"><div class="th"><span>Pedido</span><span>Cantidad</span><span>Línea</span><span>Temp.</span></div>
        ${FILAS.map((f, i) => `<div class="tr" id="i-r${i}"><span>${f[0]}</span><span>${f[1]}</span><span>${f[2]}</span><span>${f[3]}</span>${f[4] ? `<em>${f[4]}</em>` : ""}</div>`).join("")}<div class="scan"></div></div>`);
    SYS.forEach(([n], i) => { const t = en(x, n); pop(`${st} #i-s${i}`, t - 0.1); at(`${st} #i-l${i}`, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.5 }, t + 0.2); sfx("click-soft.mp3", t, 0.18); });
    const tR = en(x, "revisa"), tM = en(x, "marca");
    fade(`${st} #i-t`, en(x, "ERP") + 0.3, 0.5);
    at(`${st} #i-t .tr`, { opacity: 0, x: 30 }, { opacity: 1, x: 0, duration: 0.3, stagger: 0.12 }, en(x, "ERP") + 0.5);
    at(`${st} #i-t .scan`, { y: 50, opacity: 1 }, { y: 560, opacity: 1, duration: tM - tR + 0.3, ease: "none" }, tR - 0.2);
    out(`${st} #i-t .scan`, tM + 0.2);
    [2, 4, 5].forEach((r, k) => {
      tl.push(`tl.to(${q(`${st} #i-r${r}`)},{backgroundColor:"#ff4b0026",borderColor:"#ff4b00",color:"#ffd0bd",duration:.3},${(tM + k * 0.25).toFixed(2)});`);
      at(`${st} #i-r${r} em`, { opacity: 0, x: 20 }, { opacity: 1, x: 0, duration: 0.3 }, tM + k * 0.25 + 0.1);
    });
    sfx("click.wav", tM, 0.25);
  }

  // 4. APS: un plan armado a mano choca; la IA lo muestra y propone uno que cumple las restricciones.
  {
    const x = S.aps;
    const LIN = ["Línea 1", "Línea 2", "Línea 3", "Línea 4"];
    // [id, fila, inicio, largo] en unidades de 50 px (0..13); el lote "m" es el que se arrastra a mano.
    const LOTES = [["a", 0, 0, 4], ["b", 0, 5, 3], ["c", 1, 0, 5], ["d", 1, 6, 4], ["e", 2, 1, 3], ["f", 2, 5, 5], ["g", 3, 0, 3], ["m", 3, 4, 3]];
    const cx = (u) => 130 + u * 54, cy = (r) => 90 + r * 110;
    const st = escenaModulo(x, `
      <div class="gantt" id="a-g">
        <div class="gx">${Array.from({ length: 13 }, (_, i) => `<span style="left:${cx(i)}px">${String(6 + i).padStart(2, "0")}:00</span>`).join("")}</div>
        ${LIN.map((n, r) => `<div class="glin" style="top:${cy(r)}px"><b>${n}</b></div>`).join("")}
        ${LOTES.map(([id, r, a, l]) => `<div class="lote ${id === "m" ? "mano" : ""}" id="a-${id}" style="left:${cx(a)}px;top:${cy(r) + 14}px;width:${l * 54 - 6}px"></div>`).join("")}
        <div class="choque" id="a-x">Choque: misma línea, misma hora</div>
        <div class="cursor" id="a-cur" style="left:${cx(5.5)}px;top:${cy(3) + 40}px"></div>
        <div class="ok" id="a-ok"><span class="dot"></span>Plan que cumple todas tus restricciones</div>
        <div class="metodo" id="a-met">IA + métodos exactos</div>
      </div>`);
    const tM = en(x, "a mano"), tF = en(x, "falla"), tC = en(x, "lo construye"), tR = en(x, "respetando");
    at(`${st} .lote`, { opacity: 0, scaleX: 0 }, { opacity: 1, scaleX: 1, duration: 0.4, stagger: 0.06, ease: "power3.out", transformOrigin: "0% 50%" }, x.start + 0.6);
    // El lote se arrastra a mano encima de otro de la línea 2.
    fade(`${st} #a-cur`, tM - 0.4, 0.2);
    to(`${st} #a-m`, { x: cx(3) - cx(4), y: cy(1) - cy(3), duration: 0.9, ease: "power2.inOut" }, tM);
    to(`${st} #a-cur`, { x: cx(4.5) - cx(5.5), y: cy(1) - cy(3), duration: 0.9, ease: "power2.inOut" }, tM);
    out(`${st} #a-cur`, tM + 1.1);
    tl.push(`tl.to(${q(`${st} #a-m, ${st} #a-c`)},{backgroundColor:"#ff4b00",boxShadow:"0 0 0 3px #ff4b00, 0 0 30px #ff4b0088",duration:.3},${(tF - 0.2).toFixed(2)});`);
    pop(`${st} #a-x`, tF - 0.1);
    sfx("click.wav", tF, 0.25);
    out(`${st} #a-x`, tC - 0.2);
    // La IA reacomoda: el lote va a una hora libre de la línea 4 y los demás se ajustan.
    to(`${st} #a-m`, { x: cx(3.5) - cx(4), y: 0, backgroundColor: "#4ea7ff", boxShadow: "0 0 0 0 #0000", duration: 0.8, ease: "power3.inOut" }, tC);
    to(`${st} #a-c`, { backgroundColor: "#2d7ff9", boxShadow: "0 0 0 0 #0000", duration: 0.5 }, tC);
    to(`${st} #a-b`, { x: cx(4.5) - cx(5), duration: 0.6, ease: "power3.inOut" }, tC + 0.4);
    pop(`${st} #a-met`, tC + 0.4);
    pop(`${st} #a-ok`, tR - 0.1);
    sfx("spark.wav", tR, 0.22);
  }

  // 5. CoSimulation: primero las reglas; luego la simulación se ajusta a la planta real y proyecta.
  {
    const x = S.cosim;
    const real = (t) => 300 - 80 * Math.sin(t / 2.2) - 40 * Math.sin(t / 0.9 + 1);
    const pts = (f, a, b) => Array.from({ length: 61 }, (_, i) => { const t = a + ((b - a) * i) / 60; return `${(90 + t * 32).toFixed(1)},${f(t).toFixed(1)}`; }).join(" ");
    const lejos = (t) => real(t) + 70 * Math.cos(t / 1.6) - 30;
    const cerca = (t) => real(t) + 6 * Math.sin(t * 1.7);
    const st = escenaModulo(x, `
      <div class="reglas" id="c-r"><p>Reglas de la empresa</p><ul><li>Limpieza entre productos</li><li>Turnos y descansos</li><li>Lote mínimo por pedido</li></ul></div>
      <svg class="chart" id="c-ch" viewBox="0 0 900 640">
        <line class="ax" x1="90" y1="520" x2="860" y2="520"/><line class="ax" x1="90" y1="140" x2="90" y2="520"/>
        <line class="now" x1="570" y1="140" x2="570" y2="520"/><text x="578" y="160" class="lbl">AHORA</text>
        <polyline class="real" id="c-real" points="${pts(real, 0, 15)}" pathLength="1"/>
        <polyline class="sim lejos" id="c-lejos" points="${pts(lejos, 0, 15)}" pathLength="1"/>
        <polyline class="sim" id="c-cerca" points="${pts(cerca, 0, 15)}"/>
        <polygon class="band" id="c-band" points="${pts((t) => cerca(t) - 22, 15, 24)} ${pts((t) => cerca(t) + 22, 24, 15).split(" ").reverse().join(" ")}"/>
        <polyline class="sim proy" id="c-proy" points="${pts(cerca, 15, 24)}" pathLength="1"/>
        <text x="100" y="560" class="lbl">Planta real</text><text x="300" y="560" class="lbl e">Cosimulación</text><text x="610" y="560" class="lbl">Próximas horas</text>
      </svg>`);
    const tR = en(x, "reglas"), tC = en(x, "compara"), tA = en(x, "ajusta"), tP = en(x, "proyectar");
    pop(`${st} #c-r`, tR - 0.2);
    at(`${st} #c-r li`, { opacity: 0, x: -20 }, { opacity: 1, x: 0, duration: 0.3, stagger: 0.2 }, tR + 0.2);
    sfx("pop.mp3", tR, 0.2);
    to(`${st} #c-r`, { scale: 0.62, x: -12, y: -18, duration: 0.6, ease: "power3.inOut" }, tC - 0.6);
    fade(`${st} #c-ch`, tC - 0.5);
    set(`${st} #c-cerca, ${st} #c-band, ${st} #c-proy`, { opacity: 0 }, x.start);
    at(`${st} #c-real`, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 1.2, ease: "power1.inOut" }, tC - 0.3);
    at(`${st} #c-lejos`, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 1.2, ease: "power1.inOut" }, tC);
    to(`${st} #c-lejos`, { opacity: 0, duration: 1.0 }, tA);
    to(`${st} #c-cerca`, { opacity: 1, duration: 1.0 }, tA);
    sfx("spark.wav", tA, 0.2);
    to(`${st} #c-band`, { opacity: 1, duration: 0.6 }, tP);
    set(`${st} #c-proy`, { opacity: 1 }, tP);
    at(`${st} #c-proy`, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 1.0, ease: "power1.out" }, tP);
  }

  // 6. Fractal Industrial: reglas primero, universo de planes, algoritmos genéticos, frente de mejores y Monte Carlo.
  {
    const x = S.fractal;
    const N = 120, P = 6;
    const ox = 120, oy = 560, w = 720, h = 400; // ejes: ocupación → derecha, energía ↓ arriba = menos energía
    const front = (u) => [ox + 60 + u * (w - 120), oy - 70 - (h - 140) * Math.sqrt(1 - (u - 0.05) ** 2 * 0.95)];
    const dots = Array.from({ length: N }, (_, i) => {
      const r0 = [ox + 20 + rnd() * (w - 40), oy - 20 - rnd() * (h - 40)];
      const u = rnd();
      const f = front(u);
      const g1 = [r0[0] + (f[0] - r0[0]) * 0.45 + (rnd() - 0.5) * 60, r0[1] + (f[1] - r0[1]) * 0.45 + (rnd() - 0.5) * 60];
      const g2 = [f[0] + (rnd() - 0.5) * 40, f[1] + 18 + rnd() * 40];
      return { r0, g1, g2 };
    });
    const best = Array.from({ length: P }, (_, i) => front(0.08 + (i * 0.84) / (P - 1)));
    const st = escenaModulo(x, `
      <div class="chip" id="f-r"><span class="ok">✓</span>Tus reglas, primero</div>
      <svg class="chart" id="f-ch" viewBox="0 0 900 640">
        <line class="ax" x1="${ox}" y1="${oy}" x2="${ox + w}" y2="${oy}"/><line class="ax" x1="${ox}" y1="${oy}" x2="${ox}" y2="${oy - h}"/>
        <text x="${ox + w - 250}" y="${oy + 40}" class="lbl">Más ocupación →</text><text x="${ox - 10}" y="${oy - h - 16}" class="lbl">↑ Menos energía</text>
        ${dots.map((p, i) => `<circle class="pl" id="f-p${i}" cx="${p.r0[0].toFixed(0)}" cy="${p.r0[1].toFixed(0)}" r="6"/>`).join("")}
        ${best.map(([a, b], i) => `<g class="best" id="f-b${i}"><line class="wh" x1="${a.toFixed(0)}" y1="${(b - 34).toFixed(0)}" x2="${a.toFixed(0)}" y2="${(b + 34).toFixed(0)}"/><line class="wh" x1="${(a - 12).toFixed(0)}" y1="${(b - 34).toFixed(0)}" x2="${(a + 12).toFixed(0)}" y2="${(b - 34).toFixed(0)}"/><line class="wh" x1="${(a - 12).toFixed(0)}" y1="${(b + 34).toFixed(0)}" x2="${(a + 12).toFixed(0)}" y2="${(b + 34).toFixed(0)}"/><circle cx="${a.toFixed(0)}" cy="${b.toFixed(0)}" r="12"/></g>`).join("")}
      </svg>
      <div class="gen" id="f-gen">Generación <b>1</b></div>
      <div class="obj" id="f-o"><span>Máxima ocupación</span><span>Menor energía</span></div>
      <div class="mc" id="f-mc">Incertidumbre de cada plan · Monte Carlo</div>`);
    const tR = en(x, "reglas"), tU = en(x, "universo"), tG = en(x, "algoritmos"), tB = en(x, "buscan los mejores"), tO = en(x, "objetivos"), tM = en(x, "Monte Carlo");
    pop(`${st} #f-r`, tR - 0.2);
    sfx("pop.mp3", tR, 0.2);
    fade(`${st} #f-ch`, tR + 0.3, 0.5);
    set(`${st} .best, ${st} #f-gen, ${st} #f-o, ${st} #f-mc`, { opacity: 0 }, x.start);
    at(`${st} .pl`, { opacity: 0, scale: 0, transformOrigin: "50% 50%" }, { opacity: 0.85, scale: 1, duration: 0.3, stagger: 0.008, ease: "back.out(2)" }, Math.min(tG - 1.0, tU - 0.6));
    // Generaciones: la población se acerca al frente de mejores planes.
    const t1 = tG + 0.3, t2 = tB - 0.2;
    fade(`${st} #f-gen`, t1 - 0.2, 0.3);
    dots.forEach((p, i) => {
      to(`${st} #f-p${i}`, { attr: { cx: +p.g1[0].toFixed(0), cy: +p.g1[1].toFixed(0) }, duration: 0.9, ease: "power2.inOut" }, t1);
      to(`${st} #f-p${i}`, { attr: { cx: +p.g2[0].toFixed(0), cy: +p.g2[1].toFixed(0) }, duration: 0.9, ease: "power2.inOut" }, Math.max(t1 + 1.1, t2 - 1.0));
    });
    tl.push(`tl.call(()=>{},null,${t1.toFixed(2)});`);
    [[t1 + 0.45, 12], [Math.max(t1 + 1.5, t2 - 0.5), 48]].forEach(([t, g]) => tl.push(`tl.set(${q(`${st} #f-gen b`)},{textContent:"${g}"},${t.toFixed(2)});`));
    sfx("whoosh-short.mp3", t1, 0.2);
    to(`${st} .pl`, { opacity: 0.18, duration: 0.5 }, t2 + 0.3);
    at(`${st} .best`, { opacity: 0, scale: 0.4, transformOrigin: "50% 50%" }, { opacity: 1, scale: 1, duration: 0.4, stagger: 0.1, ease: "back.out(2)" }, t2 + 0.3);
    set(`${st} .best .wh`, { opacity: 0 }, x.start);
    sfx("spark.wav", t2 + 0.3, 0.22);
    out(`${st} #f-gen`, tO - 0.3);
    pop(`${st} #f-o`, tO - 0.1);
    at(`${st} .best .wh`, { opacity: 0 }, { opacity: 1, duration: 0.4, stagger: 0.05 }, tM);
    pop(`${st} #f-mc`, tM + 0.1);
  }

  // 7. Control Center: patrón de alarmas y acción sugerida (una persona decide).
  {
    const x = S.control;
    const AL = [["10:02", "Línea 2", "Temperatura alta", 1], ["10:05", "Línea 4", "Presión baja", 0], ["10:07", "Línea 2", "Temperatura alta", 1], ["10:09", "Banda 1", "Atasco en la entrada", 0], ["10:12", "Línea 2", "Temperatura alta", 1], ["10:14", "Silo 3", "Nivel bajo", 0]];
    const st = escenaModulo(x, `
      <div class="alarmas" id="k-a"><p class="tt">ALARMAS · EN VIVO</p>${AL.map(([h, e, m, p], i) => `<div class="al ${p ? "pat" : ""}" id="k-${i}"><i></i><span>${h}</span><b>${e}</b><span>${m}</span></div>`).join("")}</div>
      <div class="patron" id="k-p">Patrón: se repite cada 5 minutos</div>
      <div class="sug" id="k-s"><p><span class="dot"></span>Acción sugerida</p><h4>Revisar el enfriamiento de la Línea 2</h4><div class="bt"><span class="si">Aceptar</span><span>Descartar</span></div></div>`);
    const tP = en(x, "patrones"), tS = en(x, "sugiere");
    at(`${st} .al`, { opacity: 0, x: 40 }, { opacity: 1, x: 0, duration: 0.3, stagger: 0.18 }, x.start + 0.5);
    tl.push(`tl.to(${q(`${st} .al.pat`)},{borderColor:"#4ea7ff",backgroundColor:"#12305acc",duration:.3,stagger:.15},${(tP - 0.1).toFixed(2)});`);
    pop(`${st} #k-p`, tP + 0.3);
    sfx("click.wav", tP, 0.2);
    pop(`${st} #k-s`, tS - 0.1);
    sfx("pop.mp3", tS, 0.22);
  }

  // 8. Dendro Scada: IA física en el chip, predicción de falla y acción solo con aprobación humana.
  {
    const x = S.dendro;
    const sig = (t) => 400 - 30 * Math.sin(t * 2.3) - 12 * Math.sin(t * 7.1) - (t > 9 ? (t - 9) ** 2 * 1.9 : 0);
    const pts = (a, b) => Array.from({ length: 80 }, (_, i) => { const t = a + ((b - a) * i) / 79; return `${(300 + t * 30).toFixed(1)},${sig(t).toFixed(1)}`; }).join(" ");
    const st = escenaModulo(x, `
      <div class="chipd" id="d-c"><div class="die"><span>PHYSICAL<br>AI</span></div>${Array.from({ length: 6 }, (_, i) => `<i style="top:${30 + i * 26}px;left:-18px"></i><i style="top:${30 + i * 26}px;right:-18px"></i>`).join("")}</div>
      <svg class="chart" id="d-ch" viewBox="0 0 900 640">
        <line class="ax" x1="300" y1="520" x2="880" y2="520"/><line class="thr" x1="300" y1="230" x2="880" y2="230"/><text x="310" y="218" class="lbl o">Umbral de falla</text>
        <line class="now" x1="570" y1="140" x2="570" y2="520"/><text x="578" y="160" class="lbl">AHORA</text>
        <polyline class="real" id="d-r" points="${pts(0, 9)}" pathLength="1"/>
        <polyline class="sim proy" id="d-p" points="${pts(9, 18.6)}" pathLength="1"/>
        <circle class="hit" id="d-h" cx="858" cy="230" r="14"/>
        <text x="320" y="560" class="lbl">Comportamiento real</text><text x="590" y="560" class="lbl e">Predicción</text>
      </svg>
      <div class="falla" id="d-f">Falla probable</div>
      <div class="aprob" id="d-a"><p>Acción propuesta</p><h4>Bajar la velocidad y programar mantenimiento</h4><span class="btn" id="d-b">Aprobar</span><div class="cursor" id="d-cur" style="left:520px;top:260px"></div></div>`);
    const tC = en(x, "chip"), tA = en(x, "aprende"), tP = en(x, "predice"), tAc = en(x, "si hay que"), tAp = en(x, "aprobación");
    pop(`${st} #d-c`, x.start + 0.6);
    tl.push(`tl.to(${q(`${st} #d-c .die`)},{boxShadow:"0 0 0 4px #4ea7ff, 0 0 70px #2d7ff9",duration:.35,yoyo:true,repeat:3},${(tC - 0.1).toFixed(2)});`);
    sfx("spark.wav", tC, 0.2);
    fade(`${st} #d-ch`, tA - 0.4);
    at(`${st} #d-r`, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 1.0, ease: "none" }, tA - 0.3);
    at(`${st} #d-p`, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 1.0, ease: "power1.in" }, tP - 0.2);
    set(`${st} #d-h, ${st} #d-f, ${st} #d-a`, { opacity: 0 }, x.start);
    pop(`${st} #d-h`, tP + 0.8);
    pop(`${st} #d-f`, tP + 0.9);
    sfx("click.wav", tP + 0.9, 0.22);
    to(`${st} #d-ch, ${st} #d-f`, { opacity: 0.25, duration: 0.4 }, tAc - 0.2);
    pop(`${st} #d-a`, tAc);
    at(`${st} #d-cur`, { opacity: 0, x: 0, y: 0 }, { opacity: 1, x: -190, y: -85, duration: 0.8, ease: "power2.inOut" }, tAp - 0.9);
    tl.push(`tl.to(${q(`${st} #d-b`)},{backgroundColor:"#4ea7ff",color:"#05070c",scale:.94,duration:.12,yoyo:true,repeat:1},${(tAp - 0.05).toFixed(2)});`);
    tl.push(`tl.set(${q(`${st} #d-b`)},{textContent:"Aprobado por una persona ✓",backgroundColor:"#2d7ff9",color:"#ffffff"},${(tAp + 0.25).toFixed(2)});`);
    sfx("click-soft.mp3", tAp, 0.3);
  }

  // 9. AI Embedded Assistant: la capa conversacional que reúne la IA de todos los módulos.
  {
    const x = S.asistente;
    const st = escenaModulo(x, `
      <div class="chat" id="s-c">
        <div class="ct"><span class="dot"></span>Asistente del gemelo</div>
        <div class="bq" id="s-q">¿Qué máquina me preocupa hoy?</div>
        <div class="ba" id="s-a"><p>La <b>Línea 2</b>: su vibración va en aumento, repite alarmas de temperatura y Fractal propone moverle dos pedidos.</p>
          <div class="bars"><i style="height:30%"></i><i style="height:38%"></i><i style="height:46%"></i><i style="height:61%"></i><i style="height:82%"></i></div>
          <div class="src"><span>Dendro Scada</span><span>Control Center</span><span>Fractal</span><span>Cerebro empresarial</span></div></div>
      </div>
      <div class="pills" id="s-p"><span class="pill os">IA de Arvantti OS</span><span class="pill" id="s-mcp">MCP</span><span class="pill" id="s-cli">CLI</span><span class="pill otros" id="s-o">Otros modelos de IA</span></div>`);
    const tCap = en(x, "capa"), tRes = en(x, "Responde"), tCe = en(x, "cerebro"), tOS = en(x, "Arvantti OS"), tM = en(x, "MCP"), tCl = en(x, "CLI"), tOt = en(x, "otros modelos");
    fade(`${st} #s-c`, x.start + 0.4);
    pop(`${st} #s-q`, tCap - 0.3);
    sfx("pop.mp3", tCap - 0.3, 0.2);
    pop(`${st} #s-a`, tRes - 0.1);
    at(`${st} #s-a .bars i`, { scaleY: 0, transformOrigin: "50% 100%" }, { scaleY: 1, duration: 0.4, stagger: 0.08 }, tRes + 0.4);
    at(`${st} #s-a .src span`, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.3, stagger: 0.12 }, tCe - 0.4);
    set(`${st} .pill`, { opacity: 0 }, x.start);
    pop(`${st} .pill.os`, tOS - 0.1);
    pop(`${st} #s-mcp`, tM - 0.1);
    pop(`${st} #s-cli`, tCl - 0.1);
    pop(`${st} #s-o`, tOt - 0.1);
    [tOS, tM, tCl].forEach((t) => sfx("click-soft.mp3", t, 0.18));
  }

  // Heptágono pequeño: un punto de IA se enciende en cada módulo que pasa.
  {
    const a = S.nucleo.start, b = S.asistente.start + S.asistente.dur;
    const r = L.mini.s / 2, c = r;
    const P = MOD.map((_, i) => { const t = -Math.PI / 2 + (i * 2 * Math.PI) / 7; return [c + (r - 26) * Math.cos(t), c + (r - 26) * Math.sin(t)]; });
    clip("mini", "mini", a, b - a, `<svg viewBox="0 0 ${L.mini.s} ${L.mini.s}"><polygon points="${P.map((p) => p.map((v) => v.toFixed(0)).join(",")).join(" ")}"/>${P.map(([px, py], i) => `<line id="mr${i}" x1="${c}" y1="${c}" x2="${px.toFixed(0)}" y2="${py.toFixed(0)}"/>`).join("")}
      <circle class="mn" id="mn0" cx="${c}" cy="${c}" r="30"/>${P.map(([px, py], i) => `<circle class="mn" id="mn${i + 1}" cx="${px.toFixed(0)}" cy="${py.toFixed(0)}" r="20"/>`).join("")}
      <text x="${c}" y="${c + 8}" class="mt">3D</text>${P.map(([px, py], i) => `<text x="${px.toFixed(0)}" y="${(py + 7).toFixed(0)}" class="mt">${i + 1}</text>`).join("")}</svg><p>La IA en cada módulo</p>`, 20);
    fade("#mini", a + 0.3, 0.6);
    ["nucleo", "integrator", "aps", "cosim", "fractal", "control", "dendro", "asistente"].forEach((id, i) => {
      const t = S[id].start + 0.7;
      tl.push(`tl.to("#mn${i}",{fill:"#2d7ff9",stroke:"#bfe0ff",filter:"drop-shadow(0 0 10px #4ea7ff)",duration:.35},${t.toFixed(2)});`);
      tl.push(`tl.fromTo("#mn${i}",{scale:1,transformOrigin:"50% 50%"},{scale:1.5,duration:.25,yoyo:true,repeat:1,transformOrigin:"50% 50%"},${t.toFixed(2)});`);
      if (i > 0) to(`#mr${i - 1}`, { stroke: "#4ea7ff", opacity: 1, duration: 0.35 }, t);
    });
    to("#mini", { opacity: 0, duration: 0.4 }, b - 0.4);
  }

  // 10. Cierre: el heptágono completo con la IA en todos, y la firma.
  {
    const x = S.cierre; const [s, d] = span(x);
    const R = FMT === "v" ? { cx: 540, cy: 760, rx: 360, ry: 430 } : { cx: 960, cy: 470, rx: 560, ry: 330 };
    const P = MOD.map((_, i) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / 7; return [Math.round(R.cx + R.rx * Math.cos(a)), Math.round(R.cy + R.ry * Math.sin(a))]; });
    clip("e-cierre", "scene", s, d, `
      <div class="bleed" id="z-bg"><img src="assets/tomas/${FMT}/p-heroe.png" alt=""></div><div class="shade fuerte"></div>
      <svg class="hepta" viewBox="0 0 ${W} ${H}"><polygon id="z-b" points="${P.map((p) => p.join(",")).join(" ")}" pathLength="1"/>${P.map(([a, b], i) => `<line id="z-r${i}" x1="${R.cx}" y1="${R.cy}" x2="${a}" y2="${b}" pathLength="1"/>`).join("")}</svg>
      <div class="hcore" style="left:${R.cx - 130}px;top:${R.cy - 130}px"><span class="dot"></span><b>Digital Twin</b><small>Núcleo 3D + cerebro</small></div>
      ${MOD.map((n, i) => `<div class="hm" id="z-m${i}" style="left:${P[i][0] - 170}px;top:${P[i][1] - 40}px"><span class="dot"></span>${n}</div>`).join("")}
      <p class="lema" id="z-l"><span class="u">Ocho piezas, una sola inteligencia.</span><br><span class="g">El gemelo observa, simula y recomienda.</span><br><b>Tu equipo decide.</b></p>
      <div class="fin" id="z-f"><img class="marca" src="assets/clips/marca.png" alt=""><h1>Arvantti <span>Digital Twin</span></h1><p class="firma">Ensaya el mañana antes de vivirlo.</p><p class="url">digitaltwin.arvantti.online</p></div>`, 3);
    const tU = en(x, "una sola"), tG = en(x, "El gemelo"), tT = en(x, "Tu equipo");
    enter("e-cierre", s);
    at("#z-bg img", { scale: 1.0 }, { scale: 1.12, duration: d, ease: "none" }, s);
    at("#z-b", { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 1.0, ease: "power2.inOut" }, s + 0.2);
    pop("#e-cierre .hcore", s + 0.3);
    at("#e-cierre .hm", { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.35, stagger: 0.1, ease: "back.out(2)" }, x.voiceAt);
    at("#e-cierre .hepta line", { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.4, stagger: 0.1 }, x.voiceAt);
    tl.push(`tl.to("#e-cierre .dot",{scale:1.6,boxShadow:"0 0 24px 8px #4ea7ff",duration:.3,yoyo:true,repeat:1,stagger:.06},${tU.toFixed(2)});`);
    tl.push(`tl.to("#e-cierre .hepta line",{stroke:"#4ea7ff",strokeWidth:5,duration:.4},${tU.toFixed(2)});`);
    sfx("spark.wav", tU, 0.25);
    set("#z-l .g, #z-l b", { opacity: 0 }, s);
    at("#z-l", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" }, x.voiceAt);
    fade("#z-l .g", tG - 0.1);
    fade("#z-l b", tT - 0.1);
    tl.push(`tl.fromTo("#z-l b",{color:"#ffffff"},{color:"#4ea7ff",duration:.4},${tT.toFixed(2)});`);
    const tF = x.voiceAt + x.voz + 0.2;
    to("#e-cierre .hepta, #e-cierre .hcore, #e-cierre .hm, #z-l", { opacity: 0, duration: 0.5 }, tF - 0.2);
    to("#z-bg", { opacity: 0.25, duration: 0.6 }, tF - 0.2);
    at("#z-f .marca", { opacity: 0, scale: 0.5, rotate: -8 }, { opacity: 1, scale: 1, rotate: 0, duration: 0.8, ease: "back.out(1.6)" }, tF);
    at("#z-f h1", { opacity: 0, scale: 1.2, filter: "blur(10px)" }, { opacity: 1, scale: 1, filter: "blur(0px)", duration: 0.9, ease: "power3.out" }, tF + 0.2);
    at("#z-f .firma", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.6 }, tF + 0.9);
    at("#z-f .url", { opacity: 0 }, { opacity: 1, duration: 0.6 }, tF + 1.4);
    sfx("hit.wav", tF + 0.2, 0.25);
    to("#e-cierre", { opacity: 0, duration: 0.8 }, s + d - 0.8);
  }

  // Subtítulos quemados (menos el gancho, que ya tiene la frase en pantalla), con la palabra que suena resaltada.
  let nSub = 0;
  escenas.filter((x) => x.id !== "gancho" && x.id !== "cierre").forEach((x) => {
    const fs_ = frases(palabras(x));
    fs_.forEach((f, k) => {
      const a = f[0].t - 0.05;
      const sig = fs_[k + 1] ? fs_[k + 1][0].t - 0.05 : Infinity;
      const b = Math.min(f[f.length - 1].f + 0.15, x.voiceAt + x.voz + 0.3, sig);
      const id = `sub${nSub++}`;
      clip(id, "sub", a, Math.max(0.3, b - a), `<p>${f.map((p) => `<span class="w">${p.w}</span>`).join(" ")}</p>`, 50);
      at(`#${id} p`, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.12, ease: "power2.out" }, a);
      f.forEach((p, j) => tl.push(`tl.to("#${id} .w:nth-child(${j + 1})",{color:"#4ea7ff",duration:.05},${p.t.toFixed(2)});tl.to("#${id} .w:nth-child(${j + 1})",{color:"#ffffff",duration:.05},${Math.max(p.t + 0.06, p.f - 0.02).toFixed(2)});`));
    });
  });

  audio("mezcla", mezcla(escenas, total), 0, total, 1);

  const page = fs.readFileSync(T("plantilla.tpl"), "utf8")
    .replaceAll("{{W}}", String(W)).replaceAll("{{H}}", String(H)).replaceAll("{{RES}}", FMT === "v" ? "portrait" : "landscape")
    .replaceAll("{{TOTAL}}", total.toFixed(2))
    .replace("{{CSS}}", css())
    .replace("{{CLIPS}}", html.join("\n"))
    .replace("{{TIMELINE}}", tl.join("\n"));
  fs.writeFileSync(T("index.html"), page);
  fs.writeFileSync(T(`tiempos-${FMT}.json`), JSON.stringify(escenas.map(({ id, start, voiceAt, voz, dur }) => ({ id, start: +start.toFixed(2), voiceAt: +voiceAt.toFixed(2), voz: +voz.toFixed(2), dur: +dur.toFixed(2) })), null, 1));
  console.log(`index.html (${FMT} ${W}x${H}): ${total.toFixed(1)} s`);
}

/** CSS que depende del formato (la parte fija está en plantilla.tpl). */
function css() {
  const { head, stage, sub, mini, hook } = L;
  const v = FMT === "v";
  return `
.head{position:absolute;left:${head.x}px;top:${head.y}px;width:${head.w}px}
.mname{font-size:${v ? 84 : 64}px}
.stage{position:absolute;left:${stage.x}px;top:${stage.y}px;width:900px;height:640px;transform:scale(${stage.s});transform-origin:0 0}
.sub{top:${sub.top}px;height:${sub.h}px;left:${sub.side}px;right:${sub.side}px}
.sub p{font-size:${sub.font}px}
.mini{inset:auto;left:${mini.x}px;top:${mini.y}px;width:${mini.s}px;height:${mini.s + 50}px}
.hook{font-size:${hook}px;${v ? "left:60px;right:60px;top:380px" : "left:100px;right:700px;top:300px"}}
.tag3d{${v ? "left:70px;top:250px" : "left:100px;top:180px"}}
.lema{${v ? "left:60px;right:60px;top:1390px;font-size:54px" : "left:0;right:0;top:900px;font-size:44px"}}
.fin{top:${v ? 620 : 250}px}
.fin h1{font-size:${v ? 116 : 104}px}${v ? "" : "\n.fin h1 span{display:inline}"}
.hm{font-size:${v ? 28 : 26}px}`;
}

function render(ver = "v001") {
  fs.mkdirSync(T("out"), { recursive: true });
  const out = T(`out/${V.salida}${FMT === "h" ? "-h" : ""}-${ver}.mp4`);
  execFileSync("pnpm", ["dlx", "hyperframes@0.9.9", "render", "-o", out, "--fps", String(FPS), "--quality", process.env.QUALITY || "high", "--video-frame-format", "png", ...(process.env.HF_ARGS ? process.env.HF_ARGS.split(" ") : [])], { cwd: HERE, stdio: "inherit" });
  console.log(out);
}

const [cmd, arg] = process.argv.slice(2);
const cmds = { preparar, componer, render: () => render(arg), tiempos: () => console.log(tiempos().total) };
if (!cmds[cmd]) { console.log("Uso: FMT=v|h node armar.mjs preparar | componer | render [vNNN] | tiempos"); process.exit(1); }
await cmds[cmd]();
