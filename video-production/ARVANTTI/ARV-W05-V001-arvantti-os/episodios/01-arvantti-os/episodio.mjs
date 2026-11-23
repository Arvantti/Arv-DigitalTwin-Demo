// Parte 1 de 7 · Arvantti OS: el sistema operativo empresarial para la IA.
import { figura, PROMESAS, promOn } from "../../comun.mjs";

export const ESCENAS = [
  { id: "gancho", dir: "01-gancho", lead: 1.2, tail: 1.0 },
  { id: "dolor", dir: "02-dolor", lead: 0.4, tail: 1.0 },
  { id: "titulo", dir: "03-titulo", lead: 0.6, tail: 1.2 },
  { id: "analogia", dir: "04-analogia", lead: 0.3, tail: 0.9 },
  { id: "base", dir: "05-base", lead: 0.3, tail: 0.6 },
  { id: "promesas", dir: "06-promesas", lead: 0.2, tail: 1.4 },
  { id: "fractal", dir: "06b-fractal", lead: 0.3, tail: 1.0 },
  { id: "lunes", dir: "07-lunes", lead: 0.4, tail: 1.0 },
  { id: "figura", dir: "08-figura", lead: 0.3, tail: 0.6 },
  { id: "siguiente", dir: "09-siguiente", lead: 0.2, tail: 1.6 },
  { id: "firma", dir: "10-firma", lead: 0.6, tail: 3.5 },
];

export function componer(c) {
  const { S, VERT, W, H, at, to, set, clip, sfx, span, enter, leave, words, wordsIn, sweep, P } = c;

  // Rótulo fijo de la serie, desde el dolor hasta antes de la firma.
  clip("kick", "", S.dolor.start, S.firma.start - S.dolor.start, `<p class="kicker"><b>1/7</b> ARVANTTI OS</p>`, 30);
  at("#kick .kicker", { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 0.6 }, S.dolor.start + 0.2);
  set("#kick .kicker", { opacity: 0 }, S.titulo.start - 0.3);
  at("#kick .kicker", { opacity: 0 }, { opacity: 1, duration: 0.5 }, S.analogia.start + 0.2);

  // 1. Gancho: ventanas de IA por todas partes.
  {
    const x = S.gancho; const [s, d] = span(x);
    const V = [["Chat de IA", "Ventas"], ["Asistente", "Finanzas"], ["Copiloto", "Operaciones"], ["Agente", "Compras"], ["Chat de IA", "Talento humano"], ["Bot", "Servicio al cliente"]];
    const pos = VERT
      ? [[90, 260], [600, 330], [120, 560], [560, 1380], [90, 1600], [600, 1640]]
      : [[90, 120], [1420, 110], [120, 760], [1450, 740], [700, 60], [760, 880]];
    clip("e-gancho", "scene", s, d, `
      ${V.map(([a, b], i) => `<div class="win" id="win${i}" style="left:${pos[i][0]}px;top:${pos[i][1]}px"><div class="wb"><i></i><i></i><i></i><span>${a}</span></div><p>${b}</p><div class="ln"></div><div class="ln s"></div></div>`).join("")}
      <p class="center pre">${words("La IA ya está en su empresa.")}</p>
      <h1 class="center q">${words("¿Quién la controla?")}</h1>`);
    V.forEach((_, i) => {
      at(`#win${i}`, { opacity: 0, scale: 0.6, y: 40 }, { opacity: 1, scale: 1, y: 0, duration: 0.5, ease: "back.out(1.8)" }, 0.15 + i * 0.32);
      at(`#win${i}`, { rotate: 0 }, { rotate: i % 2 ? 2 : -2, y: i % 2 ? -18 : 18, duration: d, ease: "sine.inOut" }, 0.7 + i * 0.32);
      sfx("pop.mp3", 0.15 + i * 0.32, 0.12);
    });
    wordsIn("#e-gancho .pre", x.voiceAt, 0.08);
    const tP = P(x, "Pero");
    to("#e-gancho .win", { opacity: 0.25, filter: "blur(3px)", duration: 0.6 }, tP);
    to("#e-gancho .pre", { opacity: 0.45, duration: 0.6 }, tP);
    at("#e-gancho .q .w", { opacity: 0, y: 40, filter: "blur(16px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.7, stagger: 0.16, ease: "power3.out" }, P(x, "¿quién") - 0.1);
    to("#e-gancho .q", { scale: 1.4, opacity: 0, filter: "blur(20px)", duration: 0.7, ease: "power2.in" }, s + d - 0.7);
    to("#e-gancho .pre, #e-gancho .win", { opacity: 0, duration: 0.5 }, s + d - 0.7);
    sfx("whoosh.wav", 0.1, 0.2);
  }

  // 2. Dolor: cuatro áreas, cuatro IA, cuatro reglamentos; preguntas sin respuesta.
  {
    const x = S.dolor; const [s, d] = span(x);
    const A = [["Ventas", "ChatGPT"], ["Finanzas", "Claude"], ["Operaciones", "Gemini"], ["Talento humano", "Copilot"]];
    const Q = [["¿Qué datos ve?", "qué datos"], ["¿Qué puede cambiar?", "qué puede"], ["¿Cuánto cuesta?", "cuánto"]];
    clip("e-dolor", "scene", s, d, `
      <div class="areas">${A.map(([a, ia], i) => `<div class="area" id="ar${i}"><p class="an">${a}</p><p class="ai">${ia}</p><p class="rg">Reglas propias</p><b class="qm">?</b></div>`).join("")}</div>
      <div class="pregs">${Q.map(([q]) => `<span>${q}</span>`).join("")}</div>
      <div class="sello">SIN RASTRO</div>`);
    enter("e-dolor", s);
    A.forEach((_, i) => {
      at(`#ar${i}`, { opacity: 0, y: 60 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" }, x.voiceAt + i * 0.22);
      at(`#ar${i} .rg`, { opacity: 0 }, { opacity: 1, duration: 0.4 }, P(x, "con sus propias") + i * 0.12);
      at(`#ar${i} .qm`, { opacity: 0, scale: 0.3 }, { opacity: 1, scale: 1, duration: 0.45, ease: "back.out(2.4)" }, P(x, "Nadie") + i * 0.12);
    });
    sfx("whoosh-short.mp3", x.voiceAt, 0.25);
    Q.forEach(([, f], i) => {
      at(`#e-dolor .pregs span:nth-child(${i + 1})`, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.45, ease: "back.out(2)" }, P(x, f) - 0.05);
      sfx("click-soft.mp3", P(x, f), 0.22);
    });
    const tR = P(x, "no hay rastro");
    to("#e-dolor .area, #e-dolor .pregs", { opacity: 0.35, duration: 0.5 }, tR - 0.2);
    at("#e-dolor .sello", { opacity: 0, scale: 2.2, rotate: -14 }, { opacity: 1, scale: 1, rotate: -6, duration: 0.35, ease: "power4.in" }, tR);
    sfx("hit.wav", tR + 0.3, 0.3);
    leave("e-dolor", s + d);
  }

  // 3. Título.
  {
    const x = S.titulo; const [s, d] = span(x);
    const tE = P(x, "es el sistema");
    clip("e-titulo", "scene", s, d, `
      <div class="titulo"><img class="marca" src="assets/clips/marca.png" alt=""><h1 class="metal">Arvantti OS</h1><p class="full">ARVANTTI OPERATING SYSTEM FOR AI</p><p class="sub">${words("El sistema operativo empresarial para la IA")}</p></div>
      <div class="flare"></div>`);
    enter("e-titulo", s);
    at("#e-titulo .marca", { opacity: 0, scale: 0.6, y: 30 }, { opacity: 1, scale: 1, y: 0, duration: 1, ease: "back.out(1.6)" }, x.voiceAt - 0.5);
    at("#e-titulo h1", { opacity: 0, letterSpacing: "40px", filter: "blur(14px)" }, { opacity: 1, letterSpacing: "0px", filter: "blur(0px)", duration: 1.3, ease: "power3.out" }, x.voiceAt - 0.1);
    at("#e-titulo h1", { backgroundPosition: "-200% 0" }, { backgroundPosition: "200% 0", duration: 2.2, ease: "power1.inOut" }, x.voiceAt + 1.2);
    at("#e-titulo .full", { opacity: 0, letterSpacing: "20px" }, { opacity: 1, letterSpacing: "8px", duration: 1, ease: "power3.out" }, x.voiceAt + 0.3);
    wordsIn("#e-titulo .sub", tE, 0.06);
    at("#e-titulo .flare", { xPercent: -150, opacity: 0 }, { xPercent: 150, opacity: 1, duration: 1.6, ease: "power2.inOut" }, x.voiceAt + 0.3);
    sfx("hit.wav", x.voiceAt, 0.3);
    leave("e-titulo", s + d);
  }

  // 4. Analogía: el sistema operativo del computador y el de la IA.
  {
    const x = S.analogia; const [s, d] = span(x);
    const APPS = ["Correo", "Hojas de cálculo", "Navegador", "Documentos", "Calendario", "Mensajes"];
    const IAS = ["Claude", "ChatGPT", "Gemini", "Copilot", "Modelo privado", "Agente propio"];
    const R = [["Mismo control", "control"], ["Misma memoria", "memoria"], ["Mismo registro", "registro"]];
    const tA = P(x, "Arvantti OS pone");
    clip("e-analogia", "scene", s, d, `
      <div class="pc"><div class="pcb"><i></i><i></i><i></i><span class="pct">Su computador</span><span class="pct2">Sus IA</span></div>
        <div class="tiles">${APPS.map((a, i) => `<div class="tile" id="tl${i}"><span class="ta">${a}</span><span class="tb">${IAS[i]}</span></div>`).join("")}</div>
        <div class="osbar"><span class="o1">Sistema operativo · mismas reglas</span><span class="o2">Arvantti OS</span></div></div>
      <div class="reglas">${R.map(([r]) => `<span class="chip">${r}</span>`).join("")}</div>`);
    enter("e-analogia", s);
    at("#e-analogia .pc", { opacity: 0, y: 60, scale: 0.92 }, { opacity: 1, y: 0, scale: 1, duration: 0.8, ease: "power3.out" }, s + 0.1);
    APPS.forEach((_, i) => at(`#tl${i}`, { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.4, ease: "back.out(2)" }, P(x, "todos los programas") + i * 0.1));
    at("#e-analogia .osbar", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.5 }, P(x, "bajo las mismas"));
    // Cambio: los programas se vuelven IA y la barra se vuelve Arvantti OS.
    APPS.forEach((_, i) => {
      to(`#tl${i} .ta`, { opacity: 0, y: -20, duration: 0.3 }, tA + i * 0.08);
      at(`#tl${i} .tb`, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.35 }, tA + 0.15 + i * 0.08);
      to(`#tl${i}`, { borderColor: "#4ea7ff", backgroundColor: "#12305e", duration: 0.35 }, tA + 0.15 + i * 0.08);
    });
    to("#e-analogia .pct", { opacity: 0, duration: 0.3 }, tA);
    at("#e-analogia .pct2", { opacity: 0 }, { opacity: 1, duration: 0.3 }, tA + 0.2);
    to("#e-analogia .o1", { opacity: 0, duration: 0.3 }, tA);
    at("#e-analogia .o2", { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(2)" }, tA + 0.2);
    to("#e-analogia .osbar", { backgroundColor: "#2d7ff9", boxShadow: "0 0 60px #2d7ff9", duration: 0.5 }, tA + 0.2);
    sfx("whoosh-short.mp3", tA, 0.3);
    R.forEach(([, f], i) => {
      at(`#e-analogia .reglas .chip:nth-child(${i + 1})`, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.45, ease: "back.out(2)" }, P(x, f) - 0.1);
      sfx("click-soft.mp3", P(x, f), 0.22);
    });
    leave("e-analogia", s + d);
  }

  // 5 y 6. La figura de tres capas se arma de abajo hacia arriba.
  {
    const x = S.base, y = S.promesas;
    const s = x.start - 0.25, d = y.start + y.dur - s + 0.25;
    clip("e-capas", "scene", s, d, `<p class="center figcap">${words("No los reemplaza: los envuelve.")}</p>${figura("fa")}`);
    enter("e-capas", s);
    set("#fa-ent, #fa-nuc", { opacity: 0 }, s);
    at("#fa-base", { opacity: 0, y: 60 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, s + 0.1);
    ["Claude", "ChatGPT", "Gemini", "Copilot", "modelos privados"].forEach((f, i) => {
      at(`#fa-ia${i}`, { opacity: 0, scale: 0.5 }, { opacity: 1, scale: 1, duration: 0.4, ease: "back.out(2.2)" }, P(x, f) - 0.05);
      sfx("pop.mp3", P(x, f), 0.12);
    });
    const tE = P(x, "los envuelve");
    wordsIn("#e-capas .figcap", P(x, "no los"), 0.06);
    tl_pulse(c, "#fa-base", tE);
    sfx("hit.wav", tE, 0.22);
    [["CRM", 0], ["ERP", 1], ["la nube,", 2], ["la nube,", 3]].forEach(([f, i]) => at(`#fa-s${i}`, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.4, ease: "back.out(2)" }, P(x, f) + (i === 3 ? 0.3 : 0)));
    const tF = P(x, "funciona en");
    to("#e-capas .figcap", { opacity: 0, duration: 0.3 }, tF - 0.2);
    [0, 1].forEach((i) => at(`#fa-pl${i}`, { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.4, ease: "back.out(2)" }, P(x, i ? "en la nube." : "escritorio")));
    // Núcleo y promesas.
    at("#fa-nuc", { opacity: 0, y: 60 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, y.voiceAt);
    sfx("whoosh-short.mp3", y.voiceAt, 0.25);
    ["controla", "protege", "organiza", "recuerda", "rinde cuentas"].forEach((f, i) => {
      promOn(c, "fa", i, P(y, f));
      at(`#fa-p${i}`, { scale: 0.8 }, { scale: 1, duration: 0.4, ease: "back.out(2.5)" }, P(y, f));
      sfx("click.wav", P(y, f), 0.2);
    });
    const tEnt = y.voiceAt + y.voz + 0.1;
    at("#fa-ent", { opacity: 0, y: -40 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, tEnt);
    sfx("spark.wav", tEnt, 0.22);
    leave("e-capas", s + d);
  }

  // 6b. Arvantti Fractal: optimización y apoyo a la decisión; reglas, alternativas, usted decide.
  {
    const x = S.fractal; const [s, d] = span(x);
    const tR = P(x, "Primero incorpora"), tO = P(x, "después explora"), tD = P(x, "usted decida");
    clip("e-fractal", "scene", s, d, `
      <div class="fx-core"><p class="fx-k">OPTIMIZACIÓN Y APOYO A LA DECISIÓN</p><h3>Arvantti Fractal</h3></div>
      <div class="fx-flujo"><span class="fx-a">Reglas y objetivos</span><i class="fx-f">→</i><span class="fx-b">Alternativas e impacto</span><i class="fx-f fx-f2">→</i><span class="fx-c">Usted decide</span></div>
      <div class="fx-mods"><div class="fx-m"><b>Muchas variables</b><p>Capacidad, costos, tiempos y riesgo</p></div><div class="fx-m"><b>Alternativas</b><p>Compara y muestra su impacto</p></div><div class="fx-m"><b>Una persona decide</b><p>Con las fuentes a la vista</p></div></div>`);
    enter("e-fractal", s);
    at("#e-fractal .fx-core", { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration: 0.6, ease: "back.out(1.8)" }, P(x, "Arvantti Fractal"));
    sfx("spark.wav", P(x, "Arvantti Fractal"), 0.22);
    at("#e-fractal .fx-m:nth-child(1)", { opacity: 0, y: 50 }, { opacity: 1, y: 0, duration: 0.5, ease: "back.out(1.6)" }, P(x, "muchas variables"));
    at("#e-fractal .fx-a", { opacity: 0, x: -40 }, { opacity: 1, x: 0, duration: 0.45 }, tR);
    at("#e-fractal .fx-f:not(.fx-f2)", { opacity: 0 }, { opacity: 1, duration: 0.3 }, tO - 0.2);
    at("#e-fractal .fx-b", { opacity: 0, x: 40 }, { opacity: 1, x: 0, duration: 0.45, ease: "back.out(2)" }, tO);
    at("#e-fractal .fx-f2", { opacity: 0 }, { opacity: 1, duration: 0.3 }, tD - 0.3);
    at("#e-fractal .fx-c", { opacity: 0, x: 40 }, { opacity: 1, x: 0, duration: 0.45, ease: "back.out(2)" }, tD);
    sfx("click.wav", tD, 0.2);
    at("#e-fractal .fx-m:nth-child(2)", { opacity: 0, y: 50 }, { opacity: 1, y: 0, duration: 0.5, ease: "back.out(1.6)" }, tO + 0.3);
    at("#e-fractal .fx-m:nth-child(3)", { opacity: 0, y: 50 }, { opacity: 1, y: 0, duration: 0.5, ease: "back.out(1.6)" }, tO + 0.8);
    sfx("click.wav", tO, 0.2);
    leave("e-fractal", s + d);
  }

  // 7. El lunes: tres IA distintas, un solo sistema.
  {
    const x = S.lunes; const [s, d] = span(x);
    const AG = [["Agente de finanzas", "Claude", "#2d7ff9"], ["Agente de datos", "ChatGPT", "#4ea7ff"], ["Agente redactor", "Gemini", "#c4b5fd"]];
    const R = [["Mismas reglas", "las mismas reglas"], ["Misma memoria", "la misma memoria"], ["Mismo registro", "el mismo registro"]];
    const pedido = "«Prepárame el informe de cierre del mes para la junta.»";
    clip("e-lunes", "scene", s, d, `
      <div class="reloj"><span class="dia">LUNES</span><span class="hora">8:00</span></div>
      <div class="pedido"><p class="pq">GERENTE</p><p class="pt">${pedido.split("").map((ch) => `<span class="ch">${ch}</span>`).join("")}</p></div>
      <div class="caja"><div class="cajat"><img src="assets/clips/marca.png" alt=""><span>Arvantti OS</span></div>
        <div class="ags">${AG.map(([a, ia, col], i) => `<div class="agn" id="ag${i}" style="--c:${col}"><i></i><b>${a}</b><small>${ia}</small></div>`).join("")}</div>
        <div class="rg3">${R.map(([r]) => `<span class="chip">${r}</span>`).join("")}</div></div>`);
    enter("e-lunes", s);
    at("#e-lunes .reloj", { opacity: 0, y: -30 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, x.voiceAt - 0.2);
    const tG = P(x, "La gerente");
    at("#e-lunes .pedido", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.5 }, tG - 0.2);
    at("#e-lunes .pt .ch", { opacity: 0 }, { opacity: 1, duration: 0.01, stagger: 0.035 }, tG + 0.1);
    sfx("typing.mp3", tG + 0.1, 0.14);
    const tT = P(x, "tres IA");
    at("#e-lunes .caja", { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, duration: 0.6, ease: "power3.out" }, tT - 0.6);
    AG.forEach((_, i) => {
      at(`#ag${i}`, { opacity: 0, x: VERT ? 0 : 200, y: VERT ? 120 : 0 }, { opacity: 1, x: 0, y: 0, duration: 0.55, ease: "back.out(1.6)" }, tT + i * 0.3);
      sfx("pop.mp3", tT + i * 0.3, 0.14);
    });
    const tB = P(x, "Las tres trabajan");
    to("#e-lunes .caja", { borderColor: "#4ea7ff", boxShadow: "0 0 0 3px #4ea7ff, 0 0 120px #2d7ff988", duration: 0.5 }, P(x, "bajo Arvantti"));
    R.forEach(([, f], i) => at(`#e-lunes .rg3 .chip:nth-child(${i + 1})`, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.4, ease: "back.out(2)" }, P(x, f)));
    sfx("hit.wav", tB, 0.15);
    leave("e-lunes", s + d);
  }

  // 8 y 9. Un solo sistema, cinco promesas; la primera es Organiza.
  {
    const x = S.figura, y = S.siguiente;
    const s = x.start - 0.25, d = y.start + y.dur - s + 0.25;
    clip("e-sello", "scene", s, d, `<p class="center figcap c2">${words("Un solo sistema, cinco promesas.")}</p><p class="center figcap c3">${words("La primera: que cada trabajo tenga dueño.")}</p>${figura("fb")}
      <div class="sigue"><span>Parte 1 de 7</span> Continúa en la parte 2: <b>Organiza</b></div>`);
    enter("e-sello", s);
    wordsIn("#e-sello .c2", x.voiceAt, 0.08);
    PROMESAS.forEach((_, i) => {
      promOn(c, "fb", i, x.voiceAt + 0.3 + i * 0.3);
      sfx("click.wav", x.voiceAt + 0.3 + i * 0.3, 0.16);
    });
    to("#e-sello .c2", { opacity: 0, duration: 0.3 }, y.voiceAt - 0.3);
    wordsIn("#e-sello .c3", y.voiceAt, 0.06);
    const iO = PROMESAS.findIndex((p) => p.id === "organiza");
    PROMESAS.forEach((_, i) => { if (i !== iO) to(`#fb-p${i}`, { opacity: 0.2, filter: "saturate(.4)", duration: 0.4 }, y.voiceAt + 0.2); });
    to(`#fb-p${iO}`, { scale: 1.12, duration: 0.5, ease: "back.out(2)" }, y.voiceAt + 0.2);
    at("#e-sello .sigue", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" }, P(y, "dueño"));
    sfx("spark.wav", y.voiceAt + 0.2, 0.2);
    leave("e-sello", s + d);
  }

  // 10. Firma.
  {
    const x = S.firma; const [s, d] = span(x);
    const tG = P(x, "La IA");
    clip("e-firma", "scene", s, d, `
      <svg class="estela" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><path id="p2" d="M-60 ${H * 0.44} C ${W * 0.2} ${H * 0.44} ${W * 0.3} ${H * 0.64} ${W * 0.5} ${H * 0.52} S ${W * 0.8} ${H * 0.4} ${W + 60} ${H * 0.6}" pathLength="1"/></svg>
      <div class="fin"><img class="marca" src="assets/clips/marca.png" alt=""><h1 class="metal">Arvantti OS</h1><p class="full">ARVANTTI OPERATING SYSTEM FOR AI</p><p class="firma">La IA bajo su gobierno.</p><p class="url">arvantti.tech</p></div>`);
    enter("e-firma", s);
    at("#p2", { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 1.8, ease: "power2.inOut" }, s);
    to("#p2", { opacity: 0.2, duration: 1 }, s + 1.8);
    at("#e-firma .marca", { opacity: 0, scale: 0.5, rotate: -8 }, { opacity: 1, scale: 1, rotate: 0, duration: 1, ease: "back.out(1.6)" }, x.voiceAt - 0.3);
    at("#e-firma h1", { opacity: 0, letterSpacing: "30px", filter: "blur(10px)" }, { opacity: 1, letterSpacing: "0px", filter: "blur(0px)", duration: 1.2, ease: "power3.out" }, x.voiceAt);
    at("#e-firma .full", { opacity: 0 }, { opacity: 1, duration: 0.8 }, x.voiceAt + 0.4);
    at("#e-firma .firma", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.8, ease: "power3.out" }, tG);
    at("#e-firma .url", { opacity: 0 }, { opacity: 1, duration: 0.8 }, tG + 1.0);
    to("#e-firma .fin", { opacity: 0, duration: 1.0 }, s + d - 1.0);
    sfx("hit.wav", x.voiceAt, 0.3);
  }

  [S.dolor, S.titulo, S.analogia, S.base, S.fractal, S.lunes, S.figura, S.firma].forEach((x) => sweep(x.start));
}

function tl_pulse(c, sel, t) {
  c.tl.push(`tl.to(${JSON.stringify(sel)},{boxShadow:"0 0 0 4px #4ea7ff, 0 0 120px #2d7ff9cc",duration:.45,yoyo:true,repeat:1},${t.toFixed(2)});`);
}
