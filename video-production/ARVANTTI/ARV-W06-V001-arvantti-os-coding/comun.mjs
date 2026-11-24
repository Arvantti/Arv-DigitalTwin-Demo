import fs from "node:fs";
// Piezas comunes de la serie Arvantti OS Coding: figura de tres capas con la caja Coding, motor de escenas
// por paneles (cada elemento entra cuando la voz lo nombra), componentes (terminal, tarjeta, flujo, rótulo) y firma.

export const MODS = [
  { n: "Tasks", p: "Organiza", c: "#4ea7ff" },
  { n: "Brain", p: "Recuerda", c: "#d8dadf" },
  { n: "Policy", p: "Controla", c: "#2d7ff9" },
  { n: "Grants", p: "Controla", c: "#2d7ff9" },
  { n: "Guardianes", p: "Protege", c: "#7ec8ff" },
  { n: "Receipts", p: "Rinde cuentas", c: "#f8fafc" },
];
export const LAV = "#c4b5fd";
export const AG = { fin: "#2d7ff9", piso: "#4ea7ff", qa: "#9fd0ff", coord: LAV };
export const TOTAL_EP = 9;

// ---------------------------------------------------------------- componentes
export const chip = (t, c = "#4ea7ff", cls = "") => `<span class="chip ${cls}" style="--c:${c}">${t}</span>`;
export const big = (t, cls = "") => `<h1 class="big ${cls}">${t}</h1>`;
export const reloj = (hora, dia = "MARTES") => `<div class="reloj"><span>${dia}</span><b>${hora}</b></div>`;
export const mod = (i, cls = "") => `<div class="modb ${cls}" style="--c:${MODS[i].c}"><b>${MODS[i].n}</b><span>${MODS[i].p}</span></div>`;
export const coding = (t = "Arvantti OS Coding", cls = "") => `<div class="codb ${cls}"><b>${t}</b><span>EDICIÓN CODING</span></div>`;
export const per = (n = "Líder técnica", ini = "LT", c = LAV) => `<span class="per" style="--c:${c}"><i>${ini}</i>${n}</span>`;
export const file = (n, c = "#4ea7ff", cls = "") => `<span class="file ${cls}" style="--c:${c}"><i></i>${n}</span>`;
export const sello = (t, c = "#4ea7ff", cls = "") => `<div class="stamp ${cls}" style="--c:${c}">${t}</div>`;
export const alerta = (t, cls = "") => `<div class="stamp red ${cls}">${t}</div>`;
export const cnt = (label, ini, c = "#4ea7ff", cls = "") => `<div class="cnt ${cls}" style="--c:${c}"><b class="num">${ini}</b><span>${label}</span></div>`;
export const barra = (label, c = "#4ea7ff", cls = "") => `<div class="barra ${cls}" style="--c:${c}"><span>${label}</span><div class="bt"><i class="bf"></i></div></div>`;

/** Fila de chips; con sub=true cada chip entra por su lado (subs). */
export const chips = (list, c = "#4ea7ff", sub = true, cls = "") => `<div class="chips ${cls}">${list.map((n) => chip(n, c, sub ? "sub" : "")).join("")}</div>`;

/** Tablero en vivo con columnas y tarjetas. */
export const tablero = (cols) => `<div class="tablero"><p class="tbt">TABLERO EN VIVO <span class="vivo">●</span></p><div class="cols">${cols.map(([n, cards]) => `<div class="col"><p class="cn">${n}</p>${cards.map((k) => `<div class="kc">${k}</div>`).join("")}</div>`).join("")}</div></div>`;

/** Árbol de agentes: coordinadora arriba, agentes y sus subagentes debajo. ags = [[nombre, arnés, color, [subagentes]]] */
export const arbol = (ags) => `<div class="arbol"><div class="nodo coord" data-n="c"><b>Terminal coordinadora</b><small>reparte y sigue el trabajo</small></div><div class="ramas">${ags.map(([n, h, col, subs], i) => `<div class="rama"><div class="nodo ag" data-n="${i}" style="--c:${col}"><b>${n}</b><small>${h}</small></div>${subs.map((x) => `<div class="nodo sa2" style="--c:${col}">${x}</div>`).join("")}</div>`).join("")}</div></div>`;

/** Terminal real: barra con nombre y arnés, líneas que aparecen una por una (.sub). */
export function term({ t, h = "", c = "#4ea7ff", l = [], cls = "", sub = true }) {
  return `<div class="term ${cls}" style="--c:${c}"><div class="tb"><i></i><i></i><i></i><span>${t}</span>${h ? `<em>${h}</em>` : ""}</div><div class="tbd">${l.map((x) => `<p class="${sub ? "sub " : ""}ln">${x}</p>`).join("")}</div></div>`;
}

/** Tarjeta: rótulo pequeño, título, filas clave/valor (cada fila .sub si subRows) y cuerpo libre. */
export function card({ k, t, rows, p, b = "", c = "#4ea7ff", cls = "", subRows = false }) {
  const R = rows ? `<dl>${rows.map(([a, v]) => `<div class="${subRows ? "sub " : ""}rw"><dt>${a}</dt><dd>${v}</dd></div>`).join("")}</dl>` : "";
  return `<div class="card ${cls}" style="--c:${c}">${k ? `<p class="ck">${k}</p>` : ""}${t ? `<h3>${t}</h3>` : ""}${R}${p ? `<p class="cp">${p}</p>` : ""}${b}</div>`;
}

/** Flujo de pasos con flechas; cada paso es .sub. */
export function flow(steps, { c = "#4ea7ff", cls = "", sub = true } = {}) {
  return `<div class="flow ${cls}" style="--c:${c}">${steps.map((s, i) => `<span class="${sub ? "sub " : ""}st" data-k="${i}">${s}</span>${i < steps.length - 1 ? `<i class="ar">›</i>` : ""}`).join("")}</div>`;
}

/** Escalera de niveles de plan: Directo, Tarea, Mini SDD, SDD completo. */
export function escalera(cls = "") {
  const N = [["Directo", "pequeño y reversible"], ["Tarea", "trabajo normal"], ["Mini SDD", "mediano"], ["SDD completo", "grande o con riesgo"]];
  return `<div class="esc ${cls}">${N.map(([n, h], i) => `<div class="esc-n" data-k="${i}" style="--i:${i}"><b>${n}</b><small>${h}</small></div>`).join("")}</div>`;
}

/** Figura de tres capas: caja Coding arriba, núcleo de seis módulos, base con la CLI y los asistentes. */
export function figura(id, cls = "") {
  const IA = ["Claude Code", "Codex", "Gemini", "Copilot", "OpenCode", "Kimi", "Modelos locales"];
  const CO = ["Terminales en paralelo", "Worktrees", "Mapa del código", "Room de concilio", "Flujos y QA"];
  const PL = ["Linux", "Mac", "Windows", "Nube"];
  return `<div class="capas ${cls}" id="${id}">
    <div class="capa cod" id="${id}-cod"><h3>Arvantti OS Coding</h3><div class="fila">${CO.map((n, i) => `<span id="${id}-co${i}">${n}</span>`).join("")}</div></div>
    <div class="capa nuc" id="${id}-nuc"><p class="ct">NÚCLEO · SEIS MÓDULOS</p><div class="mods">${MODS.map((m, i) => `<div class="m" id="${id}-m${i}" style="--c:${m.c}"><b>${m.n}</b><small>${m.p}</small></div>`).join("")}</div></div>
    <div class="capa base" id="${id}-base"><p class="ct">BASE · SE CONECTA CON TODOS TUS ASISTENTES</p>
      <div class="fila ia">${IA.map((n, i) => `<span id="${id}-a${i}">${n}<u></u></span>`).join("")}</div>
      <div class="cli" id="${id}-cli">CLI de Arvantti <small>el contrato que no cambia</small></div>
      <div class="fila pl">${PL.map((n, i) => `<span id="${id}-pl${i}">${n}</span>`).join("")}</div></div>
  </div>`;
}
export function modOn(c, id, i, t) {
  c.to(`#${id}-m${i}`, { opacity: 1, filter: "saturate(1)", boxShadow: `0 0 44px ${MODS[i].c}`, duration: 0.3 }, t);
}
export function codOn(c, id, t) {
  c.to(`#${id}-cod`, { boxShadow: `0 0 0 4px ${LAV}, 0 0 90px ${LAV}88`, duration: 0.4 }, t);
}

// ---------------------------------------------------------------- motor de escenas
let nG = 0;
/**
 * Escena por paneles. spec = { panels: [{ at, cap, body, cls, style, items: [{ h, at, fx, cls, on, off, alert, swap, subs, count, fill }] }], glos: [[at, término, definición]] }
 * `at` es un fragmento del texto de la voz (o segundos desde que empieza la voz). Los paneles se reemplazan;
 * los elementos de un panel entran cuando la voz los nombra.
 */
export function escena(c, x, spec) {
  const { at, to, set, clip, enter, leave, words, wordsIn, span, P, sfx } = c;
  const [s, d] = span(x);
  const T = (ph, def) => (ph == null ? def : typeof ph === "number" ? +(x.voiceAt + ph).toFixed(2) : P(x, ph));
  const id = `e-${x.id}`;
  const panels = spec.panels.map((p, i) => ({ ...p, t: p.at != null ? T(p.at) : i === 0 ? s + 0.15 : T(0) }));
  let html = "";
  panels.forEach((p, i) => {
    const pid = `${id}-p${i}`;
    const items = p.items.map((it, k) => {
      let n = 0;
      const h = it.h.replace(/class="([^"]*?)\bsub\b/g, (_, pre) => `data-s="${n++}" class="${pre}sub`);
      it._n = n;
      return `<div class="it ${it.cls || ""}" id="${pid}-i${k}">${h}</div>`;
    });
    html += `<div class="panel ${p.cls || ""}" id="${pid}" style="${p.style || ""}">${p.cap ? `<h2 class="cap">${words(p.cap)}</h2>` : ""}<div class="body ${p.body || "row"}">${items.join("")}</div></div>`;
  });
  const G = (spec.glos || []).map(([ph, a, b]) => ({ t: T(ph), id: `g${nG++}`, a, b }));
  G.forEach((g) => (html += `<div class="glos" id="${g.id}"><b>${g.a}</b><span>${b2(g.b)}</span></div>`));
  clip(id, "scene", s, d, html);
  enter(id, s);

  const FX = {
    up: (sel, t) => at(sel, { opacity: 0, y: 40, filter: "blur(8px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.5, ease: "power3.out" }, t),
    pop: (sel, t) => at(sel, { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(2)" }, t),
    left: (sel, t) => at(sel, { opacity: 0, x: -70 }, { opacity: 1, x: 0, duration: 0.5, ease: "power3.out" }, t),
    right: (sel, t) => at(sel, { opacity: 0, x: 70 }, { opacity: 1, x: 0, duration: 0.5, ease: "power3.out" }, t),
    fade: (sel, t) => at(sel, { opacity: 0 }, { opacity: 1, duration: 0.5 }, t),
    none: () => {},
  };
  panels.forEach((p, i) => {
    const pid = `${id}-p${i}`;
    const t0 = p.t, t1 = i < panels.length - 1 ? panels[i + 1].t : null;
    at(`#${pid}`, { opacity: 0 }, { opacity: 1, duration: 0.35 }, Math.max(s, t0 - 0.15));
    if (t1 != null) {
      to(`#${pid}`, { opacity: 0, y: -24, filter: "blur(8px)", duration: 0.35, ease: "power2.in" }, t1 - 0.45);
      if (i > 0 || t0 > s + 1) sfx("whoosh-short.mp3", t1 - 0.3, 0.12);
    }
    if (p.cap) wordsIn(`#${pid} .cap`, t0, 0.05);
    p.items.forEach((it, k) => {
      const sel = `#${pid}-i${k}`;
      const ta = it.at != null ? T(it.at) : +(t0 + 0.15 + k * 0.16).toFixed(2);
      (FX[it.fx || "up"] || FX.up)(sel, ta);
      if (it.fx === "pop") sfx("pop.mp3", ta, 0.12);
      else if (it.at != null) sfx("click-soft.mp3", ta, 0.12);
      // Partes internas (.sub): con tiempos propios o en cascada.
      for (let j = 0; j < it._n; j++) {
        const tj = it.subs && it.subs[j] != null ? T(it.subs[j]) : +(ta + 0.3 + j * (it.gap || 0.22)).toFixed(2);
        at(`${sel} [data-s="${j}"]`, { opacity: 0, x: -20 }, { opacity: 1, x: 0, duration: 0.35, ease: "power2.out" }, tj);
        if (it.subs && it.subs[j] != null) sfx("click.wav", tj, 0.1);
      }
      for (const o of [].concat(it.on || [])) {
        const [ph, sub] = Array.isArray(o) ? o : [o, ""];
        const tt = T(ph), ss = sub ? `${sel} ${sub}` : sel;
        set(ss, { attr: { "data-on": "1" } }, tt);
        at(ss, { scale: 1 }, { scale: 1.06, duration: 0.18, yoyo: true, repeat: 1, ease: "power2.out" }, tt);
        sfx("click.wav", tt, 0.12);
      }
      for (const o of [].concat(it.off || [])) {
        const [ph, sub] = Array.isArray(o) ? o : [o, ""];
        to(sub ? `${sel} ${sub}` : sel, { opacity: 0.28, filter: "saturate(.3)", duration: 0.35 }, T(ph));
      }
      for (const o of [].concat(it.alert || [])) {
        const [ph, sub] = Array.isArray(o) ? o : [o, ""];
        const tt = T(ph), ss = sub ? `${sel} ${sub}` : sel;
        set(ss, { attr: { "data-alert": "1" } }, tt);
        to(ss, { x: 8, duration: 0.05, yoyo: true, repeat: 5 }, tt);
        sfx("hit.wav", tt, 0.22);
      }
      for (const o of [].concat(it.swap || [])) {
        const [ph, sub] = Array.isArray(o) ? o : [o, ""];
        const tt = T(ph), ss = sub ? `${sel} ${sub}` : sel;
        to(`${ss} .sa`, { opacity: 0, y: -16, duration: 0.25 }, tt);
        at(`${ss} .sb`, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.3 }, tt + 0.15);
      }
      if (it.count) {
        const { at: ph, from, to: hasta, dur = 2, fmt = "" } = it.count;
        c.tl.push(`(()=>{const o={v:${from}};const el=document.querySelector(${JSON.stringify(`${sel} .num`)});tl.fromTo(o,{v:${from}},{v:${hasta},duration:${dur},ease:"power1.in",onUpdate:()=>{el.textContent=Math.round(o.v).toLocaleString("es-CO")+${JSON.stringify(fmt)}}},${T(ph).toFixed(2)});})();`);
      }
      if (it.fill) {
        const [ph, v = 1, dur = 1.5] = it.fill;
        at(`${sel} .bf`, { scaleX: 0 }, { scaleX: v, duration: dur, ease: "power1.inOut", transformOrigin: "0 50%" }, T(ph));
      }
    });
  });
  G.forEach((g, i) => {
    const fin = i < G.length - 1 ? Math.min(G[i + 1].t - 0.1, g.t + 5) : Math.min(s + d - 0.6, g.t + 5);
    at(`#${g.id}`, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.4, ease: "power3.out" }, g.t);
    to(`#${g.id}`, { opacity: 0, y: 20, duration: 0.3 }, Math.max(g.t + 1.5, fin - 0.3));
  });
  leave(id, s + d);
}
const b2 = (s) => s;

// ---------------------------------------------------------------- piezas de cada episodio
/** Rótulo fijo «n/9 ARVANTTI OS CODING». */
export function kicker(c, n, s, e) {
  c.clip("kick", "", s, e - s, `<p class="kicker"><b>${n}/${TOTAL_EP}</b> ARVANTTI OS <span>CODING</span></p>`, 30);
  c.at("#kick .kicker", { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 0.6 }, s + 0.2);
}

/** Recap: la figura de tres capas con la frase del episodio anterior. */
export function recap(c, x, { mods = [], cod = false } = {}) {
  const { clip, enter, leave, wordsIn, words, span, at } = c;
  const [s, d] = span(x);
  clip("e-recap", "scene", s, d, `<p class="center figcap">${words(x.txt)}</p>${figura("fr", "chica")}`);
  wordsIn("#e-recap .figcap", x.voiceAt, 0.06);
  at("#fr", { opacity: 0 }, { opacity: 1, duration: 0.8, ease: "power3.out" }, 0);
  MODS.forEach((_, i) => modOn(c, "fr", i, 0.1 + i * 0.1));
  codOn(c, "fr", 0.8);
  leave("e-recap", s + d);
}

/**
 * Sello del episodio: figura completa con sus módulos (o la caja Coding) encendidos en la escena x y, en la y,
 * la pregunta que lleva a la siguiente parte con «Parte n de 9 · Continúa en la parte n+1: <sigue>».
 */
export function selloEp(c, x, y0, { mods = [], cod = false, n, sigue }) {
  const { at, to, clip, enter, leave, sfx, words, wordsIn } = c;
  const y = y0 || { ...x, txt: "", start: x.start, dur: x.dur, voiceAt: x.voiceAt + x.voz + 5, voz: 0 };
  const s = x.start - 0.25, d = y.start + y.dur - s + 0.25;
  clip("e-sello", "scene", s, d, `<p class="center figcap c2">${words(x.txt)}</p><p class="center figcap c3">${words(y.txt)}</p>${figura("fb")}
    ${sigue ? `<div class="sigue"><span>Parte ${n} de ${TOTAL_EP}</span> Continúa en la parte ${n + 1}: <b>${sigue}</b></div>` : ""}`);
  enter("e-sello", s);
  wordsIn("#e-sello .c2", x.voiceAt, 0.07);
  MODS.forEach((_, i) => { if (!mods.includes(i)) to(`#fb-m${i}`, { opacity: 0.3, duration: 0.3 }, s + 0.3); });
  if (!cod) to("#fb-cod", { opacity: 0.45, duration: 0.3 }, s + 0.3);
  mods.forEach((i, k) => {
    modOn(c, "fb", i, x.voiceAt + 0.2 + k * 0.25);
    at(`#fb-m${i}`, { scale: 1 }, { scale: 1.1, duration: 0.5, ease: "back.out(2)" }, x.voiceAt + 0.2 + k * 0.25);
  });
  if (cod) {
    codOn(c, "fb", x.voiceAt + 0.2 + mods.length * 0.25);
    at("#fb-cod", { scale: 1 }, { scale: 1.04, duration: 0.5, ease: "back.out(2)" }, x.voiceAt + 0.2 + mods.length * 0.25);
  }
  sfx("spark.wav", x.voiceAt + 0.2, 0.2);
  if (y0) {
    to("#e-sello .c2", { opacity: 0, duration: 0.3 }, y.voiceAt - 0.3);
    wordsIn("#e-sello .c3", y.voiceAt, 0.06);
  }
  if (sigue) at("#e-sello .sigue", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" }, y.voiceAt + y.voz - 0.6);
  leave("e-sello", s + d);
}

/** Firma final: marca, «Arvantti OS Coding», nombre completo, «La IA bajo tu gobierno.» y arvantti.tech. */
export function firma(c, x, { final = false, cta = null } = {}) {
  const { W, H, at, to, clip, enter, sfx, span, P } = c;
  const [s, d] = span(x);
  const tG = P(x, "La IA");
  clip("e-firma", "scene", s, d, `
    <svg class="estela" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><path id="p2" d="M-60 ${H * 0.44} C ${W * 0.2} ${H * 0.44} ${W * 0.3} ${H * 0.64} ${W * 0.5} ${H * 0.52} S ${W * 0.8} ${H * 0.4} ${W + 60} ${H * 0.6}" pathLength="1"/></svg>
    <div class="fin${final ? " final" : ""}"><img class="marca" src="assets/clips/marca.png" alt=""><h1 class="metal">Arvantti OS</h1><p class="cod">CODING</p><p class="full">ARVANTTI OPERATING SYSTEM FOR AI</p><p class="firma">La IA bajo tu gobierno.</p>
    ${final ? `<p class="finser">FIN DE LA SERIE</p><div class="diag"><b>Diagnóstico de gobernanza de IA para equipos de software</b><span>Agenda tu sesión en arvantti.tech</span></div>` : cta ? `<div class="diag"><b>${cta[0]}</b><span>${cta[1]}</span></div>` : `<p class="url">arvantti.tech</p>`}</div>`);
  enter("e-firma", s);
  at("#p2", { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 1.8, ease: "power2.inOut" }, s);
  to("#p2", { opacity: 0.2, duration: 1 }, s + 1.8);
  at("#e-firma .marca", { opacity: 0, scale: 0.5, rotate: -8 }, { opacity: 1, scale: 1, rotate: 0, duration: 1, ease: "back.out(1.6)" }, x.voiceAt - 0.3);
  at("#e-firma h1", { opacity: 0, letterSpacing: "30px", filter: "blur(10px)" }, { opacity: 1, letterSpacing: "0px", filter: "blur(0px)", duration: 1.2, ease: "power3.out" }, x.voiceAt);
  at("#e-firma .cod", { opacity: 0, letterSpacing: "40px" }, { opacity: 1, letterSpacing: "18px", duration: 1, ease: "power3.out" }, x.voiceAt + 0.3);
  at("#e-firma .full", { opacity: 0 }, { opacity: 1, duration: 0.8 }, x.voiceAt + 0.5);
  at("#e-firma .firma", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.8, ease: "power3.out" }, tG);
  if (final) {
    at("#e-firma .finser", { opacity: 0 }, { opacity: 1, duration: 0.8 }, tG + 1.0);
    at("#e-firma .diag", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.7, ease: "power3.out" }, tG + 1.6);
  } else if (cta) at("#e-firma .diag", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.7, ease: "power3.out" }, P(x, cta[2]));
  else at("#e-firma .url", { opacity: 0 }, { opacity: 1, duration: 0.8 }, tG + 1.0);
  to("#e-firma .fin", { opacity: 0, duration: 1.0 }, s + d - 1.0);
  sfx("hit.wav", x.voiceAt, 0.3);
}

/** Lista ESCENAS a partir de las carpetas escenas/NN-id del episodio. */
export function escenas(url, extra = {}) {
  const dirs = fs.readdirSync(url).filter((d) => /^\d\d-/.test(d)).sort();
  return dirs.map((dir) => {
    const id = dir.replace(/^\d+-/, "");
    const def = id === "firma" ? { lead: 0.6, tail: 3.5 } : id === "siguiente" ? { lead: 0.2, tail: 1.6 } : id === "recap" ? { lead: 0.6, tail: 0.5 } : { lead: 0.3, tail: 1.1 };
    return { id, dir, ...def, ...(extra[id] || {}) };
  });
}
