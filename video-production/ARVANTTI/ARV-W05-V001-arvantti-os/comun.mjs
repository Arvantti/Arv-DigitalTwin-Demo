// Piezas comunes de la serie: la figura de tres capas (sello) y los colores de las cinco promesas.
export const PROMESAS = [
  { id: "controla", n: "Controla", c: "#2d7ff9" },
  { id: "protege", n: "Protege", c: "#c4b5fd" },
  { id: "organiza", n: "Organiza", c: "#4ea7ff" },
  { id: "recuerda", n: "Recuerda", c: "#d8dadf" },
  { id: "rinde", n: "Rinde cuentas", c: "#f8fafc" },
];

/** Figura de tres capas: Enterprise arriba, núcleo con las cinco promesas y base que se conecta con todo. */
export function figura(id) {
  const IA = ["Claude", "ChatGPT", "Gemini", "Copilot", "Modelos privados"];
  const SIS = [["CRM", "sistema de clientes"], ["ERP", "sistema de gestión"], ["Nube", "sus servicios"], ["Archivos", "sus documentos"]];
  return `<div class="capas" id="${id}">
    <div class="capa ent" id="${id}-ent"><h3>Arvantti OS Enterprise</h3><p>Agentes, habilidades, voz y panel de dirección</p></div>
    <div class="capa nuc" id="${id}-nuc"><p class="ct">NÚCLEO · CINCO PROMESAS</p><div class="proms">${PROMESAS.map((p, i) => `<div class="prom" id="${id}-p${i}" style="--c:${p.c}">${p.n}</div>`).join("")}</div></div>
    <div class="capa base" id="${id}-base"><p class="ct">BASE · SE CONECTA CON TODO</p>
      <div class="fila">${IA.map((n, i) => `<span id="${id}-ia${i}">${n}</span>`).join("")}</div>
      <div class="fila sis">${SIS.map(([n, s], i) => `<span id="${id}-s${i}">${n}<small>${s}</small></span>`).join("")}<span class="pl" id="${id}-pl0">En el escritorio</span><span class="pl" id="${id}-pl1">En la nube</span></div></div>
  </div>`;
}

/** Enciende una promesa de la figura. */
export function promOn(c, id, i, t) {
  const p = PROMESAS[i];
  c.to(`#${id}-p${i}`, { opacity: 1, filter: "saturate(1)", boxShadow: `0 0 40px ${p.c}`, duration: 0.3 }, t);
}

/** Rótulo fijo «n/7 ARVANTTI OS» entre dos segundos. */
export function kicker(c, n, s, e) {
  c.clip("kick", "", s, e - s, `<p class="kicker"><b>${n}/7</b> ARVANTTI OS</p>`, 30);
  c.at("#kick .kicker", { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 0.6 }, s + 0.2);
}

/** Firma final: marca, nombre, nombre completo, «La IA bajo su gobierno.» y arvantti.tech. */
export function firma(c, x) {
  const { W, H, at, to, clip, enter, sfx, span, P } = c;
  const [s, d] = span(x);
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

/**
 * Sello del episodio: la figura completa con su promesa encendida (escena x, con su frase) y, en la escena y,
 * la pregunta que lleva a la siguiente parte con el rótulo «Parte n de 7 · Continúa en la parte n+1: <promesa>».
 */
export function sello(c, x, y, { prom, n, sigue, sigueId }) {
  const { at, to, clip, enter, leave, sfx, words, wordsIn, P } = c;
  const s = x.start - 0.25, d = y.start + y.dur - s + 0.25;
  const iP = PROMESAS.findIndex((p) => p.id === prom);
  const iS = PROMESAS.findIndex((p) => p.id === sigueId);
  clip("e-sello", "scene", s, d, `<p class="center figcap c2">${words(x.txt)}</p><p class="center figcap c3">${words(y.txt)}</p>${figura("fb")}
    <div class="sigue"><span>Parte ${n} de 7</span> Continúa en la parte ${n + 1}: <b style="color:${PROMESAS[iS]?.c || "#4ea7ff"}">${sigue}</b></div>`);
  enter("e-sello", s);
  wordsIn("#e-sello .c2", x.voiceAt, 0.07);
  if (iP >= 0) {
    PROMESAS.forEach((_, i) => { if (i !== iP) c.to(`#fb-p${i}`, { opacity: 0.35, duration: 0.3 }, s + 0.3); });
    promOn(c, "fb", iP, x.voiceAt + 0.2);
    at(`#fb-p${iP}`, { scale: 1 }, { scale: 1.12, duration: 0.5, ease: "back.out(2)" }, x.voiceAt + 0.2);
  } else {
    // Sin promesa: se enciende la edición Enterprise sobre el núcleo completo.
    PROMESAS.forEach((_, i) => promOn(c, "fb", i, s + 0.3 + i * 0.1));
    to("#fb-ent", { boxShadow: "0 0 0 4px #4ea7ff, 0 0 90px #2d7ff9", duration: 0.5 }, x.voiceAt + 0.2);
  }
  sfx("spark.wav", x.voiceAt + 0.2, 0.2);
  to("#e-sello .c2", { opacity: 0, duration: 0.3 }, y.voiceAt - 0.3);
  wordsIn("#e-sello .c3", y.voiceAt, 0.06);
  if (iS >= 0) {
    if (iP >= 0) to(`#fb-p${iP}`, { scale: 1, duration: 0.4 }, P(y, y.txt.split(" ").slice(-2).join(" ")) - 0.2);
    promOn(c, "fb", iS, P(y, y.txt.split(" ").slice(-2).join(" ")));
  }
  at("#e-sello .sigue", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" }, y.voiceAt + y.voz - 0.6);
  leave("e-sello", s + d);
}

/** Recap corto al inicio: la figura de tres capas con una frase. */
export function recap(c, x) {
  const { clip, enter, leave, wordsIn, words, span } = c;
  const [s, d] = span(x);
  clip("e-recap", "scene", s, d, `<p class="center figcap">${words(x.txt)}</p>${figura("fr")}`);
  wordsIn("#e-recap .figcap", x.voiceAt, 0.06);
  PROMESAS.forEach((_, i) => promOn(c, "fr", i, 0.1 + i * 0.12));
  c.at("#fr", { opacity: 0 }, { opacity: 1, duration: 0.8, ease: "power3.out" }, 0);
  leave("e-recap", s + d);
}
