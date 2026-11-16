// Parte 3 de 7 · Recuerda (módulo técnico: Brain, con sus dos cerebros para todos: proyecto y decisiones).
// Momento del lunes: 8:05, el agente arranca la T-12 sabiendo lo que pasó el mes pasado.
import { kicker, firma, sello, recap } from "../../comun.mjs";

export const ESCENAS = [
  { id: "recap", dir: "01-recap", lead: 0.6, tail: 0.5 },
  { id: "gancho", dir: "02-gancho", lead: 0.3, tail: 0.8 },
  { id: "dolor", dir: "03-dolor", lead: 0.3, tail: 0.8 },
  { id: "memoria", dir: "04-memoria", lead: 0.3, tail: 0.8 },
  { id: "fuente", dir: "05-fuente", lead: 0.2, tail: 0.8 },
  { id: "justo", dir: "06-justo", lead: 0.2, tail: 0.9 },
  { id: "lunes", dir: "07-lunes", lead: 0.3, tail: 1.2 },
  { id: "figura", dir: "08-figura", lead: 0.3, tail: 0.5 },
  { id: "siguiente", dir: "09-siguiente", lead: 0.2, tail: 1.6 },
  { id: "firma", dir: "10-firma", lead: 0.6, tail: 3.5 },
];

const AMB = "#fbbf24";

// Grafo de decisiones: nodos (x, y en un lienzo de 760x520) y enlaces.
const NODOS = [
  ["Gerente", "Persona", 120, 110], ["Cliente Andes", "Cliente", 620, 90], ["Pedido 4471", "Pedido", 640, 330],
  ["Margen por producto", "Decisión", 380, 260], ["Acta de junta", "Evidencia", 150, 420], ["Correo 3 oct", "Evidencia", 420, 470],
];
const ENL = [[0, 3], [3, 4], [3, 5], [1, 2], [2, 3], [0, 5]];

export function componer(c) {
  const { S, VERT, at, to, clip, sfx, span, enter, leave, words, wordsIn, sweep, P } = c;

  kicker(c, 3, S.recap.start, S.firma.start);
  recap(c, S.recap);

  // 2. Gancho: la IA responde como si fuera su primer día.
  {
    const x = S.gancho; const [s, d] = span(x);
    clip("e-gancho", "scene", s, d, `
      <div class="conv"><div class="msg r" id="g1">¿Cómo cerramos el informe el mes pasado?</div>
        <div class="msg ia" id="g2"><b>IA</b> Hola, soy nueva aquí. ¿De qué empresa me habla?</div></div>
      <h1 class="center q q3">${words("Como si fuera su primer día.")}</h1>`);
    enter("e-gancho", s);
    at("#g1", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.4, ease: "back.out(1.6)" }, x.voiceAt);
    sfx("pop.mp3", x.voiceAt, 0.14);
    const tR = P(x, "le responde");
    at("#g2", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.4, ease: "back.out(1.6)" }, tR);
    sfx("pop.mp3", tR, 0.14);
    const tP = P(x, "primer día");
    to("#e-gancho .conv", { opacity: 0.3, duration: 0.4 }, tP - 0.6);
    at("#e-gancho .q .w", { opacity: 0, y: 40, filter: "blur(14px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.6, stagger: 0.1, ease: "power3.out" }, tP - 0.8);
    leave("e-gancho", s + d);
  }

  // 3. Dolor: decisiones dispersas, factura que crece, conocimiento que se va.
  {
    const x = S.dolor; const [s, d] = span(x);
    const tC = P(x, "Cada conversación"), tF = P(x, "la factura"), tY = P(x, "Y cuando");
    const MAIL = ["RE: margen", "FW: junta", "RE: RE: cierre", "Acuerdo cliente", "RE: precios", "Notas reunión"];
    clip("e-dolor", "scene", s, d, `
      <div class="b1"><div class="mails">${MAIL.map((m, i) => `<div class="mail" id="ml${i}" style="--r:${(i * 37) % 24 - 12}deg;left:${(i % 3) * 33}%;top:${Math.floor(i / 3) * 52}%"><i></i>${m}</div>`).join("")}</div>
        <p class="lbl">${words("Decisiones dispersas")}</p></div>
      <div class="b2"><div class="cero"><p class="ph">EMPIEZA DE CERO</p><p class="big0">0</p><p class="pf">No recuerda nada</p></div>
        <div class="todo"><p class="ph">ARRASTRA TODO</p><p class="cost">$<b id="cst">0</b></p><p class="pf">La factura crece sin aviso</p></div></div>
      <div class="b3"><div class="silla"><div class="persona"><span class="cab"></span><span class="cue"></span></div><div class="asiento"></div></div><p class="lbl">${words("Su conocimiento se va con él.")}</p></div>`);
    enter("e-dolor", s);
    MAIL.forEach((_, i) => at(`#ml${i}`, { opacity: 0, scale: 0.5, rotate: 0 }, { opacity: 1, scale: 1, rotate: `${(i * 37) % 24 - 12}deg`, duration: 0.4, ease: "back.out(2)" }, x.voiceAt + i * 0.22));
    wordsIn("#e-dolor .b1 .lbl", P(x, "en la cabeza"), 0.08);
    sfx("whoosh-short.mp3", x.voiceAt, 0.2);
    to("#e-dolor .b1", { opacity: 0, duration: 0.4 }, tC - 0.4);
    at("#e-dolor .b2", { opacity: 0 }, { opacity: 1, duration: 0.3 }, tC - 0.1);
    at("#e-dolor .cero", { opacity: 0, x: -60 }, { opacity: 1, x: 0, duration: 0.5, ease: "power3.out" }, tC);
    at("#e-dolor .todo", { opacity: 0, x: 60 }, { opacity: 1, x: 0, duration: 0.5, ease: "power3.out" }, P(x, "o arrastra"));
    at("#cst", { innerText: 0 }, { innerText: 4870, duration: 2.2, snap: { innerText: 1 }, ease: "power2.in" }, tF - 0.4);
    to("#e-dolor .cost", { color: "#ff4d4d", duration: 0.8 }, tF + 0.6);
    sfx("typing.mp3", tF - 0.3, 0.12);
    to("#e-dolor .b2", { opacity: 0, duration: 0.4 }, tY - 0.4);
    at("#e-dolor .b3", { opacity: 0 }, { opacity: 1, duration: 0.3 }, tY - 0.1);
    to("#e-dolor .persona", { opacity: 0, y: -80, filter: "blur(10px)", duration: 1.2, ease: "power2.in" }, P(x, "se va,"));
    wordsIn("#e-dolor .b3 .lbl", P(x, "su conocimiento"), 0.08);
    sfx("whoosh.wav", P(x, "se va,"), 0.2);
    leave("e-dolor", s + d);
  }

  // 4. Memoria del proyecto y mapa de decisiones.
  {
    const x = S.memoria; const [s, d] = span(x);
    const tR = P(x, "recuerda"), tG = P(x, "Guarda la memoria"), tD = P(x, "Y guarda las decisiones"), tM = P(x, "mapa de puntos");
    const Q = [["Quién", "quién decidió"], ["Qué", "qué,"], ["Cuándo", "cuándo"], ["Evidencia", "con qué evidencia"]];
    clip("e-memoria", "scene", s, d, `
      <p class="center figcap">${words("Arvantti OS recuerda por su empresa.")}</p>
      <div class="badge-prom" style="--c:${AMB}">RECUERDA</div>
      <div class="cerebros"><div class="cb proy"><p class="ph">MEMORIA DEL PROYECTO</p><div class="its">${["Tareas", "Planes", "Documentos"].map((n) => `<span class="it">${n}</span>`).join("")}</div></div>
        <div class="cb dec"><p class="ph">MAPA DE DECISIONES</p>${grafo("gm")}<div class="qs">${Q.map(([q]) => `<span>${q}</span>`).join("")}</div></div></div>`);
    enter("e-memoria", s);
    wordsIn("#e-memoria .figcap", x.voiceAt, 0.06);
    at("#e-memoria .badge-prom", { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(2)" }, tR);
    sfx("spark.wav", tR, 0.2);
    at("#e-memoria .proy", { opacity: 0, y: 50 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" }, tG);
    ["tareas", "planes", "documentos"].forEach((f, i) => {
      at(`#e-memoria .it:nth-child(${i + 1})`, { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.35, ease: "back.out(2)" }, P(x, f));
      sfx("click-soft.mp3", P(x, f), 0.2);
    });
    at("#e-memoria .dec", { opacity: 0, y: 50 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" }, tD);
    grafoIn(c, "gm", tM, 0.18);
    Q.forEach(([, f], i) => at(`#e-memoria .qs span:nth-child(${i + 1})`, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.35, ease: "back.out(2)" }, P(x, f)));
    leave("e-memoria", s + d);
  }

  // 5. Se alimenta solo, marca lo viejo y responde con fuente.
  {
    const x = S.fuente; const [s, d] = span(x);
    const tM = P(x, "marca lo que"), tC = P(x, "cita"), tN = P(x, "si no hay");
    clip("e-fuente", "scene", s, d, `
      <div class="gwrap">${grafo("gf", true)}<div class="viejo">YA NO APLICA</div></div>
      <div class="resp"><div class="msg ia"><b>IA</b> La junta pidió ver el margen por producto.<span class="src">Fuente · Acta de junta, 28 sep</span></div>
        <div class="msg ia sin"><b>IA</b> No encuentro evidencia de eso. Prefiero no inventarlo.</div></div>`);
    enter("e-fuente", s);
    grafoIn(c, "gf", s + 0.1, 0.05);
    at("#gf .n.extra", { opacity: 0, scale: 0.3, xPercent: -50, yPercent: -50 }, { opacity: 1, scale: 1, xPercent: -50, yPercent: -50, duration: 0.4, stagger: 0.3, ease: "back.out(2)" }, x.voiceAt + 0.3);
    at("#gf .l.extra", { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.5, stagger: 0.3 }, x.voiceAt + 0.4);
    sfx("pop.mp3", x.voiceAt + 0.3, 0.12); sfx("pop.mp3", x.voiceAt + 0.9, 0.12);
    to("#gf .n.old", { opacity: 0.35, filter: "grayscale(1)", duration: 0.4 }, tM);
    at("#e-fuente .viejo", { opacity: 0, scale: 1.8, rotate: -10 }, { opacity: 1, scale: 1, rotate: -6, duration: 0.3, ease: "power4.in" }, tM + 0.2);
    sfx("hit.wav", tM + 0.4, 0.2);
    at("#e-fuente .resp .msg:nth-child(1)", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.4, ease: "back.out(1.6)" }, tC - 0.6);
    at("#e-fuente .src", { opacity: 0, x: -20 }, { opacity: 1, x: 0, duration: 0.4 }, tC);
    to("#gf .n:nth-child(5), #gf .n:nth-child(6)", { boxShadow: `0 0 0 3px ${AMB}, 0 0 40px ${AMB}`, duration: 0.4 }, tC);
    at("#e-fuente .resp .sin", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.4, ease: "back.out(1.6)" }, tN);
    sfx("click-soft.mp3", tN, 0.2);
    leave("e-fuente", s + d);
  }

  // 6. Solo lo necesario; sus datos se quedan en su infraestructura.
  {
    const x = S.justo; const [s, d] = span(x);
    const tS = P(x, "Y sus datos");
    clip("e-justo", "scene", s, d, `
      <p class="center figcap">${words("Ni más ni menos.")}</p>
      <div class="embudo"><div class="todo-mem">${Array.from({ length: 18 }, (_, i) => `<span class="mem${[3, 8, 13].includes(i) ? " sel" : ""}"></span>`).join("")}</div>
        <div class="flecha"></div><div class="agente"><p>Agente de finanzas</p><div class="tres">${["Informe anterior", "Pedido de la junta", "Aprobación"].map((n) => `<span>${n}</span>`).join("")}</div></div></div>
      <div class="medidas"><span class="mj">Responde mejor <b>↑</b></span><span class="mc">Cuesta menos <b>↓</b></span></div>
      <div class="infra"><div class="cand"><span class="arco"></span><span class="cuerpo"></span></div><p>${words("Sus datos se quedan en su infraestructura")}</p><div class="dos"><span>Su equipo</span><span>Su nube privada</span></div></div>`);
    enter("e-justo", s);
    at("#e-justo .mem", { opacity: 0, scale: 0.5 }, { opacity: 1, scale: 1, duration: 0.25, stagger: 0.03 }, x.voiceAt);
    const tN = P(x, "necesita");
    to("#e-justo .mem:not(.sel)", { opacity: 0.15, duration: 0.4 }, tN);
    to("#e-justo .mem.sel", { backgroundColor: AMB, boxShadow: `0 0 20px ${AMB}`, duration: 0.4 }, tN);
    at("#e-justo .flecha", { scaleX: 0 }, { scaleX: 1, duration: 0.5, transformOrigin: "0 50%" }, tN + 0.2);
    at("#e-justo .agente", { opacity: 0, x: 40 }, { opacity: 1, x: 0, duration: 0.5 }, tN + 0.4);
    at("#e-justo .tres span", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.3, stagger: 0.15 }, tN + 0.6);
    wordsIn("#e-justo .figcap", P(x, "ni más"), 0.08);
    at("#e-justo .mj", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.4, ease: "back.out(2)" }, P(x, "responde mejor"));
    at("#e-justo .mc", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.4, ease: "back.out(2)" }, P(x, "cuesta menos"));
    sfx("click.wav", P(x, "responde mejor"), 0.2); sfx("click.wav", P(x, "cuesta menos"), 0.2);
    to("#e-justo .embudo, #e-justo .medidas, #e-justo .figcap", { opacity: 0, y: -40, duration: 0.4 }, tS - 0.3);
    at("#e-justo .infra", { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, duration: 0.5, ease: "power3.out" }, tS);
    at("#e-justo .cand", { opacity: 0, y: -40 }, { opacity: 1, y: 0, duration: 0.5, ease: "back.out(2)" }, tS);
    wordsIn("#e-justo .infra p", tS + 0.2, 0.06);
    at("#e-justo .dos span:nth-child(1)", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.4 }, P(x, "en su equipo"));
    at("#e-justo .dos span:nth-child(2)", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.4 }, P(x, "nube privada"));
    sfx("hit.wav", tS + 0.2, 0.18);
    leave("e-justo", s + d);
  }

  // 7. Lunes 8:05: el agente abre la T-12 con el contexto y sus fuentes.
  {
    const x = S.lunes; const [s, d] = span(x);
    const F = [["Así fue el informe del mes pasado", "Carpeta Cierre · septiembre", "el informe"], ["La junta pidió ver el margen por producto", "Acta de junta · 28 sep", "la junta pidió"], ["Lo aprobó la gerente el 3 de octubre", "Correo · 3 oct", "lo aprobó"]];
    clip("e-lunes", "scene", s, d, `
      <div class="reloj r2"><span class="dia">LUNES</span><span class="hora">8:05</span></div>
      <div class="t12 abre"><p class="tid">TAREA ABIERTA</p><h3>T-12 · Informe de cierre</h3><p class="asg"><i></i>Agente de finanzas</p></div>
      <div class="sabe">${F.map(([t, f]) => `<div class="fact"><p>${t}</p><span class="src">Fuente · ${f}</span></div>`).join("")}</div>
      <div class="confuente">CON FUENTE</div>`);
    enter("e-lunes", s);
    at("#e-lunes .reloj", { opacity: 0, y: -30 }, { opacity: 1, y: 0, duration: 0.5 }, x.voiceAt - 0.2);
    at("#e-lunes .t12", { opacity: 0, scale: 0.7 }, { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(1.8)" }, P(x, "abre"));
    F.forEach(([, , f], i) => {
      const t = P(x, f);
      at(`#e-lunes .fact:nth-child(${i + 1})`, { opacity: 0, x: 60 }, { opacity: 1, x: 0, duration: 0.45, ease: "power3.out" }, t);
      at(`#e-lunes .fact:nth-child(${i + 1}) .src`, { opacity: 0 }, { opacity: 1, duration: 0.3 }, t + 0.5);
      sfx("click-soft.mp3", t, 0.2);
    });
    const tF = P(x, "Con fuente");
    to("#e-lunes .src", { backgroundColor: AMB, color: "#0b1020", duration: 0.3, stagger: 0.12 }, tF);
    at("#e-lunes .confuente", { opacity: 0, scale: 1.6 }, { opacity: 1, scale: 1, duration: 0.35, ease: "power4.in" }, tF);
    sfx("spark.wav", tF, 0.25);
    leave("e-lunes", s + d);
  }

  sello(c, S.figura, S.siguiente, { prom: "recuerda", n: 3, sigue: "Controla", sigueId: "controla" });
  firma(c, S.firma);

  [S.gancho, S.dolor, S.memoria, S.fuente, S.justo, S.lunes, S.figura, S.firma].forEach((x) => sweep(x.start));
  void VERT;
}

/** Grafo de decisiones en un lienzo de 760x520 (se escala por CSS). */
function grafo(id, extra = false) {
  const N = extra ? [...NODOS, ["Precio 2027", "Decisión", 660, 470, "extra"], ["Proveedor nuevo", "Cliente", 300, 60, "extra"], ["Lista de precios 2025", "Evidencia", 40, 260, "old"]] : NODOS;
  const L = extra ? [...ENL, [2, 6, "extra"], [3, 7, "extra"]] : ENL;
  return `<div class="grafo" id="${id}"><svg viewBox="0 0 760 520">${L.map(([a, b, k]) => `<line class="l ${k || ""}" x1="${N[a][2]}" y1="${N[a][3]}" x2="${N[b][2]}" y2="${N[b][3]}" pathLength="1"/>`).join("")}</svg>
    ${N.map(([n, t, x, y, k]) => `<div class="n ${k || ""} t-${t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()}" style="left:${x}px;top:${y}px"><small>${t}</small>${n}</div>`).join("")}</div>`;
}
function grafoIn(c, id, t, st) {
  c.at(`#${id} .n:not(.extra)`, { opacity: 0, scale: 0.3, xPercent: -50, yPercent: -50 }, { opacity: 1, scale: 1, xPercent: -50, yPercent: -50, duration: 0.4, stagger: st, ease: "back.out(2)" }, t);
  c.at(`#${id} .l:not(.extra)`, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.5, stagger: st }, t + 0.2);
}
