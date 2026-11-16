// Parte 2 de 7 · Organiza (módulo técnico: Tasks). Momento del lunes: el pedido se vuelve la tarea T-12.
import { kicker, firma, sello, recap } from "../../comun.mjs";

export const ESCENAS = [
  { id: "recap", dir: "01-recap", lead: 0.6, tail: 0.5 },
  { id: "gancho", dir: "02-gancho", lead: 0.3, tail: 0.8 },
  { id: "dolor", dir: "03-dolor", lead: 0.3, tail: 0.8 },
  { id: "tarea", dir: "04-tarea", lead: 0.3, tail: 0.8 },
  { id: "escalera", dir: "05-escalera", lead: 0.2, tail: 0.8 },
  { id: "paralelo", dir: "06-paralelo", lead: 0.2, tail: 1.0 },
  { id: "lunes", dir: "07-lunes", lead: 0.3, tail: 1.2 },
  { id: "figura", dir: "08-figura", lead: 0.3, tail: 0.5 },
  { id: "siguiente", dir: "09-siguiente", lead: 0.2, tail: 1.6 },
  { id: "firma", dir: "10-firma", lead: 0.6, tail: 3.5 },
];

const VERDE = "#34d399";

export function componer(c) {
  const { S, VERT, at, to, set, clip, sfx, span, enter, leave, words, wordsIn, sweep, P } = c;

  kicker(c, 2, S.recap.start, S.firma.start);
  recap(c, S.recap);

  // 2. Gancho: agentes trabajando sin orden.
  {
    const x = S.gancho; const [s, d] = span(x);
    const V = [["Agente", "¿Ventas?"], ["Agente", "¿Informe?"], ["Agente", "¿Pedidos?"], ["Agente", "¿Compras?"], ["Agente", "¿Cartera?"], ["Agente", "¿Inventario?"]];
    const pos = VERT
      ? [[90, 300], [600, 360], [120, 560], [560, 1380], [90, 1600], [600, 1640]]
      : [[90, 160], [1420, 150], [120, 760], [1450, 740], [700, 70], [760, 880]];
    clip("e-gancho", "scene", s, d, `
      ${V.map(([a, b], i) => `<div class="win" id="win${i}" style="left:${pos[i][0]}px;top:${pos[i][1]}px"><div class="wb"><i></i><i></i><i></i><span>${a} ${i + 1}</span></div><p>${b}</p><div class="ln"></div><div class="ln s"></div></div>`).join("")}
      <p class="center pre">${words("Agentes de IA trabajando.")}</p>
      <h1 class="center q q2">${words("¿Sabe cuál hace qué?")}</h1>`);
    enter("e-gancho", s);
    V.forEach((_, i) => {
      at(`#win${i}`, { opacity: 0 }, { opacity: 1, duration: 0.25 }, s + 0.2 + i * 0.25);
      c.tl.push(`tl.to("#win${i}",{opacity:.25,duration:.18,yoyo:true,repeat:${7 + i},ease:"steps(1)"},${(s + 0.6 + i * 0.25).toFixed(2)});`);
      sfx("click-soft.mp3", s + 0.2 + i * 0.25, 0.1);
    });
    wordsIn("#e-gancho .pre", x.voiceAt, 0.08);
    const tS = P(x, "¿Sabe");
    to("#e-gancho .pre", { opacity: 0.45, duration: 0.5 }, tS);
    at("#e-gancho .q .w", { opacity: 0, y: 40, filter: "blur(16px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.6, stagger: 0.12, ease: "power3.out" }, tS - 0.1);
    to("#e-gancho .win", { opacity: 0.2, filter: "blur(3px)", duration: 0.5 }, tS + 0.3);
    leave("e-gancho", s + d);
  }

  // 3. Dolor: pedidos perdidos en el chat, planes de más o de menos, agentes que se pisan.
  {
    const x = S.dolor; const [s, d] = span(x);
    const tB = P(x, "Unas veces"), tO = P(x, "otras"), tC = P(x, "Y cuando"), tP = P(x, "se pisan");
    const M = ["¿Me ayudas con el informe?", "Revisa los pedidos de octubre", "¿Ya quedó lo de cartera?", "¿Quién tiene el informe?", "Lo necesito para hoy"];
    clip("e-dolor", "scene", s, d, `
      <div class="chat">${M.map((m, i) => `<div class="msg${i % 2 ? " r" : ""}" id="msg${i}">${m}</div>`).join("")}<p class="perdido">${words("¿Se terminó?")}</p></div>
      <div class="planes"><div class="plan mas"><p class="ph">PLANEA DE MÁS</p>${Array.from({ length: 9 }, (_, i) => `<div class="pl" style="width:${60 + ((i * 37) % 40)}%"></div>`).join("")}<p class="pf">Paso 1 de 48…</p></div>
        <div class="plan menos"><p class="ph">SIN PLAN</p><p class="rayo">¡Ya!</p><p class="pf">Se lanza sin pensar</p></div></div>
      <div class="choque"><div class="doc"><p>Informe de cierre</p><div class="ln"></div><div class="ln"></div><div class="ln s"></div></div>
        <div class="agc a1">Agente A</div><div class="agc a2">Agente B</div><div class="flash">SE PISAN</div></div>`);
    enter("e-dolor", s);
    M.forEach((_, i) => at(`#msg${i}`, { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.35, ease: "back.out(1.6)" }, x.voiceAt - 0.2 + i * 0.32));
    M.forEach((_, i) => sfx("pop.mp3", x.voiceAt - 0.2 + i * 0.32, 0.1));
    to("#e-dolor .msg", { opacity: 0.18, y: -30, filter: "blur(6px)", duration: 0.6, stagger: 0.08 }, P(x, "se pierden") + 0.3);
    wordsIn("#e-dolor .perdido", P(x, "nadie sabe"), 0.08);
    to("#e-dolor .chat", { opacity: 0, duration: 0.4 }, tB - 0.4);
    at("#e-dolor .planes", { opacity: 0 }, { opacity: 1, duration: 0.3 }, tB - 0.1);
    at("#e-dolor .plan.mas", { opacity: 0, x: -60 }, { opacity: 1, x: 0, duration: 0.5, ease: "power3.out" }, tB);
    at("#e-dolor .plan.mas .pl", { scaleX: 0 }, { scaleX: 1, duration: 0.2, stagger: 0.1, transformOrigin: "0 50%" }, tB + 0.2);
    at("#e-dolor .plan.menos", { opacity: 0, x: 60 }, { opacity: 1, x: 0, duration: 0.5, ease: "power3.out" }, tO);
    at("#e-dolor .rayo", { scale: 0.3, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: "back.out(3)" }, tO + 0.4);
    sfx("whoosh-short.mp3", tO + 0.3, 0.25);
    to("#e-dolor .planes", { opacity: 0, duration: 0.4 }, tC - 0.4);
    at("#e-dolor .choque", { opacity: 0 }, { opacity: 1, duration: 0.3 }, tC - 0.1);
    at("#e-dolor .doc", { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration: 0.4 }, tC);
    at("#e-dolor .a1", { opacity: 0, x: VERT ? -300 : -500 }, { opacity: 1, x: 0, duration: 0.9, ease: "power2.in" }, tC + 0.3);
    at("#e-dolor .a2", { opacity: 0, x: VERT ? 300 : 500 }, { opacity: 1, x: 0, duration: 0.9, ease: "power2.in" }, tC + 0.3);
    at("#e-dolor .flash", { opacity: 0, scale: 2 }, { opacity: 1, scale: 1, duration: 0.3, ease: "power4.in" }, tP);
    to("#e-dolor .doc", { x: 8, duration: 0.05, yoyo: true, repeat: 7 }, tP);
    sfx("hit.wav", tP + 0.2, 0.3);
    leave("e-dolor", s + d);
  }

  // 4. Cada pedido, una tarea con dueño, estado y fecha.
  {
    const x = S.tarea; const [s, d] = span(x);
    const F = [["Dueño", "Agente de finanzas", "dueño"], ["Estado", "Por hacer", "estado"], ["Fecha", "Lunes, 11:00", "fecha"]];
    clip("e-tarea", "scene", s, d, `
      <p class="center figcap">${words("Arvantti OS organiza el trabajo.")}</p>
      <div class="badge-prom" style="--c:${VERDE}">ORGANIZA</div>
      <div class="tcard"><p class="tid">TAREA</p><h3>${words("Pedido → tarea")}</h3><dl>${F.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl></div>`);
    enter("e-tarea", s);
    wordsIn("#e-tarea .figcap", x.voiceAt, 0.06);
    at("#e-tarea .badge-prom", { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(2)" }, P(x, "organiza"));
    sfx("spark.wav", P(x, "organiza"), 0.2);
    const tC = P(x, "Cada pedido");
    at("#e-tarea .tcard", { opacity: 0, y: 60, rotateX: 20 }, { opacity: 1, y: 0, rotateX: 0, duration: 0.6, ease: "power3.out" }, tC);
    wordsIn("#e-tarea .tcard h3", tC + 0.2, 0.08);
    F.forEach(([, , f], i) => {
      at(`#e-tarea dt:nth-of-type(${i + 1}), #e-tarea dd:nth-of-type(${i + 1})`, { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 0.4 }, P(x, f));
      sfx("click-soft.mp3", P(x, f), 0.22);
    });
    leave("e-tarea", s + d);
  }

  // 5. Cuánto planear: escalera de cuatro niveles y la última palabra de una persona.
  {
    const x = S.escalera; const [s, d] = span(x);
    const N = [["Directo", "un paso pequeño", "paso pequeño"], ["Tarea", "trabajo normal", "trabajo normal"], ["Plan corto", "grande o con riesgo", "corto"], ["Plan completo", "grande o con riesgo", "completo"]];
    clip("e-escalera", "scene", s, d, `
      <p class="center figcap">${words("¿Cuánto planear?")}</p>
      <div class="esc">${N.map(([n, h], i) => `<div class="esc-n" id="es${i}" style="--i:${i}"><b>${n}</b><small>${h}</small></div>`).join("")}</div>
      <div class="plandoc"><p class="ph">PLAN ESCRITO</p><p class="pq"><i>1</i>Qué se va a hacer</p><p class="pq"><i>2</i>Cómo se sabrá que quedó bien</p><div class="ok">✓ Lo aprueba una persona</div></div>`);
    enter("e-escalera", s);
    wordsIn("#e-escalera .figcap", x.voiceAt, 0.08);
    at("#e-escalera .esc-n", { opacity: 0.0, y: 40 }, { opacity: 0.3, y: 0, duration: 0.4, stagger: 0.1 }, x.voiceAt + 0.6);
    N.forEach(([, , f], i) => {
      const t = P(x, f);
      to(`#es${i}`, { opacity: 1, borderColor: VERDE, boxShadow: `0 0 50px ${VERDE}88`, duration: 0.3 }, t);
      if (i) to(`#es${i - 1}`, { boxShadow: "0 0 0px #0000", duration: 0.3 }, t);
      sfx("click.wav", t, 0.2);
    });
    const tQ = P(x, "qué se va");
    at("#e-escalera .plandoc", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" }, P(x, "completo") + 0.5);
    at("#e-escalera .pq:nth-of-type(2)", { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 0.4 }, tQ);
    at("#e-escalera .pq:nth-of-type(3)", { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 0.4 }, P(x, "cómo se sabrá"));
    const tU = P(x, "La última palabra");
    at("#e-escalera .ok", { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(2.2)" }, tU + 0.3);
    sfx("spark.wav", tU + 0.3, 0.25);
    leave("e-escalera", s + d);
  }

  // 6. En paralelo, cada uno en su espacio; tablero en vivo.
  {
    const x = S.paralelo; const [s, d] = span(x);
    const L = [["Agente de finanzas", "#f87171", 0.92], ["Agente de datos", "#34d399", 0.7], ["Agente redactor", "#a78bfa", 0.5]];
    const tT = P(x, "Y usted");
    clip("e-paralelo", "scene", s, d, `
      <p class="center figcap">${words("En paralelo, sin pisarse.")}</p>
      <div class="lanes">${L.map(([n, col], i) => `<div class="lane" id="ln${i}" style="--c:${col}"><span class="lt">${n}</span><span class="ls">su espacio</span><div class="bar"><i></i></div></div>`).join("")}</div>
      ${tablero("tb1", [["Por hacer", ["Conciliar bancos"]], ["En curso", ["Informe de cierre", "Ventas por producto"]], ["Terminada", ["Cartera vencida"]]])}`);
    enter("e-paralelo", s);
    wordsIn("#e-paralelo .figcap", x.voiceAt, 0.07);
    L.forEach(([, , p], i) => {
      at(`#ln${i}`, { opacity: 0, x: -60 }, { opacity: 1, x: 0, duration: 0.45, ease: "power3.out" }, x.voiceAt + 0.2 + i * 0.2);
      at(`#ln${i} .bar i`, { scaleX: 0 }, { scaleX: p, duration: tT - x.voiceAt - 0.6, ease: "none", transformOrigin: "0 50%" }, x.voiceAt + 0.6);
    });
    at("#e-paralelo .ls", { opacity: 0 }, { opacity: 1, duration: 0.4, stagger: 0.15 }, P(x, "cada uno"));
    to("#e-paralelo .lanes, #e-paralelo .figcap", { opacity: 0, y: -30, duration: 0.4 }, tT - 0.3);
    at("#tb1", { opacity: 0, y: 50 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, tT);
    at("#tb1 .kc", { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration: 0.3, stagger: 0.12, ease: "back.out(2)" }, tT + 0.3);
    at("#tb1 .vivo", { opacity: 0.3 }, { opacity: 1, duration: 0.5, yoyo: true, repeat: 5 }, tT + 0.3);
    sfx("whoosh-short.mp3", tT, 0.25);
    leave("e-paralelo", s + d);
  }

  // 7. Lunes 8:02: nace la T-12 y avanza en el tablero.
  {
    const x = S.lunes; const [s, d] = span(x);
    const tA = P(x, "crea la tarea"), tAs = P(x, "se la asigna");
    const cols = [["Tomada", "tomada"], ["En curso", "en curso"], ["Terminada", "terminada"]];
    clip("e-lunes", "scene", s, d, `
      <div class="reloj r2"><span class="dia">LUNES</span><span class="hora">8:02</span></div>
      <div class="t12"><p class="tid">TAREA</p><h3>T-12 · Informe de cierre</h3><p class="asg"><i></i>Agente de finanzas</p></div>
      ${tablero("tb2", cols.map(([n]) => [n, []]))}`);
    enter("e-lunes", s);
    at("#e-lunes .reloj", { opacity: 0, y: -30 }, { opacity: 1, y: 0, duration: 0.5 }, x.voiceAt - 0.2);
    at("#e-lunes .t12", { opacity: 0, scale: 0.5 }, { opacity: 1, scale: 1, duration: 0.6, ease: "back.out(1.8)" }, tA);
    sfx("spark.wav", tA, 0.25);
    at("#e-lunes .asg", { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 0.4 }, tAs);
    const tE = P(x, "En el tablero");
    at("#tb2", { opacity: 0, y: 50 }, { opacity: 1, y: 0, duration: 0.5 }, tE - 0.2);
    // La tarjeta vuela a cada columna cuando la voz la nombra.
    cols.forEach(([, f], i) => {
      const t = P(x, f);
      to("#e-lunes .t12", { opacity: 0, duration: 0.2 }, t - 0.2);
      at(`#tb2 .col:nth-child(${i + 1}) .slot`, { opacity: 0, y: -30 }, { opacity: 1, y: 0, duration: 0.35, ease: "back.out(2)" }, t);
      if (i) to(`#tb2 .col:nth-child(${i}) .slot`, { opacity: 0, duration: 0.25 }, t);
      to(`#tb2 .col:nth-child(${i + 1})`, { borderColor: VERDE, duration: 0.3 }, t);
      sfx("click.wav", t, 0.2);
    });
    at("#tb2 .col:nth-child(3) .slot", { boxShadow: "0 0 0 #0000" }, { boxShadow: `0 0 50px ${VERDE}`, duration: 0.5, yoyo: true, repeat: 1 }, P(x, "terminada") + 0.3);
    leave("e-lunes", s + d);
  }

  sello(c, S.figura, S.siguiente, { prom: "organiza", n: 2, sigue: "Recuerda", sigueId: "recuerda" });
  firma(c, S.firma);

  [S.gancho, S.dolor, S.tarea, S.escalera, S.paralelo, S.lunes, S.figura, S.firma].forEach((x) => sweep(x.start));
}

/** Tablero de tareas con columnas; cada columna tiene un hueco .slot para la T-12. */
function tablero(id, cols) {
  return `<div class="tablero" id="${id}"><p class="tbt">TABLERO EN VIVO <span class="vivo">●</span></p><div class="cols">${cols.map(([n, cards]) => `<div class="col"><p class="cn">${n}</p>${cards.map((k) => `<div class="kc">${k}</div>`).join("")}<div class="kc slot">T-12 · Informe de cierre</div></div>`).join("")}</div></div>`;
}
