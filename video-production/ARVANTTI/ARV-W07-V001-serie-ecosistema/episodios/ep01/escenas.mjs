// Episodio 1 · Un ecosistema, tres productos (guion aprobado por Andy, ajustado el 2026-11-24).
export const ESCENAS = [
  { id: "junta", dir: "01-junta", lead: 1.4, tail: 1.0 },
  { id: "islas", dir: "02-islas", lead: 0.4, tail: 1.0 },
  { id: "arvantti", dir: "03-arvantti", lead: 0.4, tail: 0.8 },
  { id: "productos", dir: "04-productos", lead: 0.3, tail: 1.2 },
  { id: "base", dir: "05-base", lead: 0.3, tail: 1.2 },
  { id: "serie", dir: "06-serie", lead: 0.3, tail: 1.4 },
  { id: "cierre", dir: "07-cierre", lead: 0.9, tail: 4.5, sinSubtitulos: true },
];

import { red, caminos, curva, barras } from "../../viz.mjs";
import { ayudas, cierre, planta } from "../../comun.mjs";

export const PRODUCTOS = [
  ["os", "Arvantti OS", "Gobierna la IA de tu empresa"],
  ["dt", "Arvantti Digital Twin", "Una copia viva de tu operación"],
  ["fr", "Arvantti Fractal", "Las mejores opciones y su impacto"],
];

export function componerEpisodio(c) {
  const { S, P, at, to, set, clip, words, sfx, span, enter, leave, titleIn, sweep, VERT } = c;
  const { pop, fade, izq, luz, kick } = ayudas(c);
  const KICK = kick(1);

  // 1. La pregunta de la junta.
  {
    const x = S.junta; const [s, d] = span(x);
    const Q = [["la planta", "Planta"], ["el inventario", "Inventario"], ["la caja", "Caja"]];
    clip("e-junta", "scene", s, d, `${KICK}
      <div class="st">
        <div class="mesa">
          <svg viewBox="0 0 900 260" class="mesa-svg">
            <ellipse class="tabla" cx="450" cy="150" rx="380" ry="88"/>
            ${[0, 1, 2, 3, 4, 5, 6, 7].map((k) => { const a = Math.PI * (k / 7); const cx = 450 - Math.cos(a) * 430, cy = 150 - Math.sin(a) * 120; return `<circle class="silla${k === 4 ? " ger" : ""}" cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${k === 4 ? 30 : 24}"/>`; }).join("")}
          </svg>
          <span class="chip lbl">Junta directiva</span>
        </div>
        <h2 class="h md q">${words("Si la demanda sube el próximo trimestre…")}</h2>
        <div class="row qs">${Q.map(([, t], i) => `<span class="chip" id="q${i}">¿Nos alcanza ${["la", "el", "la"][i]} <b>${t.toLowerCase()}</b>?</span>`).join("")}</div>
      </div>`, 3);
    at("#e-junta .kick", { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 0.6 }, s + 0.3);
    at("#e-junta .tabla", { opacity: 0, scale: 0.8, transformOrigin: "50% 50%" }, { opacity: 1, scale: 1, duration: 0.8, ease: "power3.out" }, x.voiceAt - 0.6);
    at("#e-junta .silla", { opacity: 0, scale: 0, transformOrigin: "50% 50%" }, { opacity: 1, scale: 1, duration: 0.4, stagger: 0.06, ease: "back.out(2)" }, x.voiceAt - 0.3);
    pop("#e-junta .lbl", x.voiceAt + 0.2);
    at("#e-junta .ger", { scale: 1 }, { scale: 1.35, duration: 0.4, yoyo: true, repeat: 1, transformOrigin: "50% 50%" }, P(x, "La gerente"));
    titleIn("#e-junta .q", P(x, "si la demanda") - 0.1, 0.09);
    Q.forEach(([k], i) => { pop(`#q${i}`, P(x, k) - 0.1); luz(`#q${i}`, P(x, k) + 0.3); });
    sfx("1a", "pop.mp3", P(x, "La gerente"), 0.2);
    Q.forEach(([k], i) => sfx(`1q${i}`, "pop.mp3", P(x, k), 0.14));
    leave("e-junta", s + d);
  }

  // 2. Islas de datos y varias IA que responden distinto.
  {
    const x = S.islas; const [s, d] = span(x);
    const I = [
      ["Producción", "Excel", barras(c, "g-prod", { valores: [55, 70, 62, 88, 76], alerta: 3, t0: P(x, "Producción") })],
      ["Finanzas", "Excel", curva(c, "g-fin", { puntos: [8, 7, 7.5, 5, 4, 5, 6], banda: true, t0: P(x, "Finanzas") })],
      ["Sistemas", "ERP · sistema de gestión", `<svg class="db" viewBox="0 0 80 90"><ellipse cx="40" cy="16" rx="34" ry="12"/><path d="M6 16v58c0 7 15 12 34 12s34-5 34-12V16"/><path d="M6 45c0 7 15 12 34 12s34-5 34-12"/></svg>`],
    ];
    const R = [["IA de producción", "Sí alcanza"], ["IA de finanzas", "No alcanza"], ["IA de ventas", "Depende"]];
    const tI = P(x, "Y la IA");
    clip("e-islas", "scene", s, d, `${KICK}
      <div class="st">
        <div class="row islas">${I.map(([n, f, g], i) => `<div class="panel isla" id="is${i}"><b>${n}</b><div class="mini">${g}</div><small>${f}</small></div>`).join("")}</div>
        <div class="row chats">${R.map(([n, r], i) => `<div class="chat" id="ch${i}"><small>${n}</small><span>${r}</span></div>`).join("")}</div>
      </div>`, 3);
    enter("e-islas", s);
    pop("#is0", P(x, "Producción") - 0.1); pop("#is1", P(x, "Finanzas") - 0.1); pop("#is2", P(x, "Sistemas") - 0.1);
    to("#is0", { x: VERT ? -20 : -50, rotate: -3, duration: 0.6 }, tI - 0.6);
    to("#is2", { x: VERT ? 20 : 50, rotate: 3, duration: 0.6 }, tI - 0.6);
    to("#e-islas .islas", { opacity: 0.45, scale: 0.9, duration: 0.5 }, tI);
    at("#e-islas .chat", { opacity: 0, y: 30, scale: 0.8 }, { opacity: 1, y: 0, scale: 1, duration: 0.45, stagger: 0.35, ease: "back.out(1.8)" }, tI + 0.1);
    at("#e-islas .chat span", { color: "#e6eefc" }, { color: "#ff8a3d", duration: 0.3, stagger: 0.1 }, P(x, "responde distinto"));
    sfx("2a", "pop.mp3", P(x, "Producción"), 0.12); sfx("2b", "pop.mp3", P(x, "Finanzas"), 0.12); sfx("2c", "pop.mp3", P(x, "Sistemas"), 0.12);
    sfx("2d", "hit.wav", P(x, "responde distinto"), 0.2);
    leave("e-islas", s + d);
  }

  // 3. Arvantti: un sistema empresarial completo.
  {
    const x = S.arvantti; const [s, d] = span(x);
    clip("e-arv", "scene", s, d, `
      <div class="fondo-red">${red(c, "red3", { w: 1600, h: 900, capas: [5, 8, 9, 8, 5], t0: s + 0.3, dur: d - 1, seed: 21 })}</div>
      <div class="st">
        <img class="marca am" src="assets/clips/marca.png" alt="">
        <h1 class="h xl ti">Arvantti</h1>
        <p class="sub ss">Un sistema empresarial completo</p>
        <div class="row tres">${["OS", "Digital Twin", "Fractal"].map((t, i) => `<span class="slot" id="sl${i}">${t}</span>`).join("")}<span class="chip on sj">Solos o juntos</span></div>
      </div>`, 3);
    enter("e-arv", s);
    at("#e-arv .am", { opacity: 0, scale: 0.5, rotate: -8 }, { opacity: 1, scale: 1, rotate: 0, duration: 0.9, ease: "back.out(1.6)" }, x.voiceAt - 0.3);
    at("#e-arv h1", { opacity: 0, letterSpacing: "30px", filter: "blur(10px)" }, { opacity: 1, letterSpacing: "-3px", filter: "blur(0px)", duration: 1, ease: "power3.out" }, x.voiceAt);
    fade("#e-arv .ss", P(x, "sistema empresarial"));
    at("#e-arv .slot", { opacity: 0, scale: 0 }, { opacity: 1, scale: 1, duration: 0.45, stagger: 0.18, ease: "back.out(2)" }, P(x, "tres productos"));
    pop("#e-arv .sj", P(x, "solos o juntos"));
    sfx("3a", "whoosh-short.mp3", x.voiceAt, 0.2); sfx("3b", "spark.wav", P(x, "tres productos"), 0.18);
    leave("e-arv", s + d);
  }

  // 4. Los tres productos.
  {
    const x = S.productos; const [s, d] = span(x);
    const viz = {
      os: red(c, "red4", { w: 340, h: 190, capas: [3, 5, 5, 2], t0: P(x, "Arvantti OS") + 0.2, dur: 2.4, seed: 5 }),
      dt: planta("pl4"),
      fr: caminos(c, "cam4", { w: 340, h: 190, cols: 5, filas: 3, explorar: 8, mejores: 3, t0: P(x, "Arvantti Fractal") + 0.2, dur: 2.6, seed: 11 }),
    };
    const T = { os: "Arvantti OS", dt: "Arvantti Digital Twin", fr: "Arvantti Fractal" };
    clip("e-prod", "scene", s, d, `${KICK}
      <div class="st">
        <div class="row prods">${PRODUCTOS.map(([k, n, f]) => `<div class="panel prod" id="pr-${k}"><div class="pv">${viz[k]}</div><b>${n}</b><span>${f}</span></div>`).join("")}</div>
        <span class="chip on td">Para que tú decidas</span>
      </div>`, 3);
    enter("e-prod", s);
    PRODUCTOS.forEach(([k]) => { const t = P(x, T[k]); pop(`#pr-${k}`, t - 0.15); to(`#pr-${k}`, { borderColor: "#4ea7ff", boxShadow: "0 0 60px #2d7ff988", duration: 0.4 }, t + 0.2); });
    at("#pl4 .iso", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.15, ease: "power3.out" }, P(x, "Arvantti Digital Twin") + 0.1);
    at("#pl4 .pulso", { opacity: 0.2, scale: 0.6, transformOrigin: "50% 50%" }, { opacity: 1, scale: 1.4, duration: 0.6, stagger: 0.2, yoyo: true, repeat: 5, ease: "sine.inOut" }, P(x, "copia viva"));
    pop("#e-prod .td", P(x, "para que tú"));
    PRODUCTOS.forEach(([k], i) => sfx(`4${i}`, "pop.mp3", P(x, T[k]), 0.15));
    leave("e-prod", s + d);
  }

  // 5. Lo que comparten: conectores, base común y Dendro junto a la máquina.
  {
    const x = S.base; const [s, d] = span(x);
    const SIS = ["Gestión (ERP)", "Clientes (CRM)", "Equipos (SCADA)"];
    clip("e-base", "scene", s, d, `${KICK}
      <div class="st">
        <div class="row mini3">${PRODUCTOS.map(([k, n]) => `<div class="panel m3" id="m3-${k}">${n}</div>`).join("")}</div>
        <svg class="hilos" viewBox="0 0 1200 80" preserveAspectRatio="none">${[200, 600, 1000].map((xx, i) => `<line class="hl${i}" x1="${xx}" y1="0" x2="${xx}" y2="80" pathLength="1"/>`).join("")}</svg>
        <div class="capa panel" id="cp-con"><b>Los mismos conectores</b><div class="row">${SIS.map((t, i) => `<span class="tag" id="sis${i}">${t}</span>`).join("")}</div></div>
        <div class="capa panel" id="cp-db"><b>Una base común de datos</b><small>Productos · pedidos · materiales · costos · decisiones</small></div>
        <div class="panel dendro" id="dendro"><svg viewBox="0 0 60 40"><rect x="4" y="8" width="52" height="26" rx="4"/><circle cx="16" cy="21" r="5"/><path d="M30 15h18M30 21h18M30 27h12"/></svg><div><b>Dendro</b><small>Junto a la máquina</small></div></div>
      </div>`, 3);
    enter("e-base", s);
    at("#e-base .m3", { opacity: 0, y: -20 }, { opacity: 1, y: 0, duration: 0.4, stagger: 0.1 }, x.voiceAt);
    at("#e-base .hilos line", { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.6, stagger: 0.1 }, P(x, "los mismos conectores") - 0.2);
    pop("#cp-con", P(x, "los mismos conectores"));
    at("#e-base .tag", { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.35, stagger: 0.15 }, P(x, "con tus sistemas"));
    pop("#cp-db", P(x, "una base común"));
    pop("#dendro", P(x, "Dendro") - 0.2); luz("#dendro", P(x, "Dendro") + 0.3);
    sfx("5a", "pop.mp3", P(x, "los mismos conectores"), 0.15); sfx("5b", "pop.mp3", P(x, "una base común"), 0.15); sfx("5c", "spark.wav", P(x, "Dendro"), 0.18);
    leave("e-base", s + d);
  }

  // 6. La serie responde la pregunta, pieza por pieza.
  {
    const x = S.serie; const [s, d] = span(x);
    const E = ["El ecosistema", "Arvantti OS", "Digital Twin", "Fractal", "Dendro", "Integrator", "La respuesta", "Gran resumen"];
    clip("e-serie", "scene", s, d, `${KICK}
      <div class="st">
        <h2 class="h md sq">${words("¿Nos alcanza la planta, el inventario y la caja?")}</h2>
        <div class="row eps">${E.map((t, i) => `<div class="panel ep" id="ep${i}"><small>${i < 7 ? `EP ${i + 1}` : "FINAL"}</small><b>${t}</b></div>`).join("")}</div>
      </div>`, 3);
    enter("e-serie", s);
    titleIn("#e-serie .sq", x.voiceAt, 0.06);
    at("#e-serie .ep", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.4, stagger: 0.12, ease: "power3.out" }, P(x, "pieza por pieza") - 0.4);
    to("#ep0", { borderColor: "#4ea7ff", backgroundColor: "#10264a", boxShadow: "0 0 50px #2d7ff988", duration: 0.4 }, P(x, "pieza por pieza") + 0.8);
    sfx("6a", "whoosh-short.mp3", P(x, "pieza por pieza"), 0.18);
    leave("e-serie", s + d);
  }

  cierre(c, S.cierre);
  [S.islas, S.arvantti, S.productos, S.base, S.serie, S.cierre].forEach((x) => sweep(x.start));
  void set; void izq;
}
