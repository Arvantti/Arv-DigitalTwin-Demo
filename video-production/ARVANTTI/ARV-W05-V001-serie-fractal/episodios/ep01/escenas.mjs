// Episodio 1 · Qué es Arvantti Fractal (guion aprobado por Andy el 2026-11-23).
export const ESCENAS = [
  { id: "pedido", dir: "01-pedido", lead: 1.4, tail: 1.0 },
  { id: "areas", dir: "02-areas", lead: 0.4, tail: 0.9 },
  { id: "fractal", dir: "03-fractal", lead: 0.4, tail: 1.2 },
  { id: "reglas", dir: "04-reglas", lead: 0.3, tail: 1.2 },
  { id: "producto", dir: "05-producto", lead: 0.3, tail: 1.1 },
  { id: "modulos", dir: "06-modulos", lead: 0.3, tail: 1.1 },
  { id: "serie", dir: "07-serie", lead: 0.3, tail: 1.0 },
  { id: "cierre", dir: "08-cierre", lead: 0.9, tail: 4.5, sinSubtitulos: true },
];

import { red, caminos, curva, barras } from "../../viz.mjs";

const KICK = `<p class="kick"><b>EP 1</b> SERIE ARVANTTI FRACTAL</p>`;

export function componerEpisodio(c) {
  const { S, P, at, to, clip, words, sfx, span, enter, leave, titleIn, sweep, VERT } = c;
  const pop = (sel, t) => at(sel, { opacity: 0, scale: 0.6, y: 30 }, { opacity: 1, scale: 1, y: 0, duration: 0.5, ease: "back.out(1.8)" }, t);
  const fade = (sel, t, d = 0.5) => at(sel, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: d, ease: "power3.out" }, t);

  // 1. El pedido del lunes.
  {
    const x = S.pedido; const [s, d] = span(x);
    clip("e-pedido", "scene", s, d, `${KICK}
      <div class="st">
        <div class="panel mail">
          <div class="mh"><span class="dot"></span><b>Nuevo pedido</b><small>Lunes · 8:00</small></div>
          <div class="ml"><span>Volumen</span><b>El triple de lo habitual</b></div>
          <div class="ml"><span>Entrega</span><b>En tres semanas</b></div>
          <div class="ml"><span>Estado</span><b class="alert">Sin respuesta</b></div>
        </div>
        <h1 class="h xl q1">${words("¿Lo aceptamos?")}</h1>
      </div>`, 3);
    at("#e-pedido .kick", { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 0.6 }, s + 0.3);
    at("#e-pedido .mail", { opacity: 0, y: 80, rotateX: 25 }, { opacity: 1, y: 0, rotateX: 0, duration: 0.9, ease: "power3.out" }, P(x, "Llega") - 0.3);
    at("#e-pedido .ml", { opacity: 0, x: -20 }, { opacity: 1, x: 0, duration: 0.4, stagger: 0.25, ease: "power2.out" }, P(x, "Llega") + 0.4);
    to("#e-pedido .mail", { scale: 0.86, opacity: 0.55, duration: 0.6, ease: "power2.inOut" }, P(x, "¿lo") - 0.4);
    titleIn("#e-pedido .q1", P(x, "¿lo") - 0.1, 0.15);
    sfx("1a", "pop.mp3", P(x, "Llega"), 0.2); sfx("1b", "hit.wav", P(x, "¿lo"), 0.25);
    leave("e-pedido", s + d);
  }

  // 2. Cada área tiene su propia respuesta.
  {
    const x = S.areas; const [s, d] = span(x);
    const A = [["planta", "Planta", "¿Hay capacidad?"], ["procesos", "Procesos", "¿Llegamos a tiempo?"], ["inventario", "Inventario", "¿Alcanza el material?"], ["caja", "Caja", "¿Aguanta la caja?"]];
    const tG = P(x, "toca");
    const G = {
      planta: barras(c, "g-planta", { valores: [55, 70, 62, 88, 100, 76], alerta: 4, t0: P(x, "planta") }),
      procesos: curva(c, "g-procesos", { puntos: [3, 5, 4, 6, 5, 8, 7, 9], t0: P(x, "procesos") }),
      inventario: barras(c, "g-inventario", { valores: [95, 82, 70, 58, 40, 28], alerta: 5, t0: P(x, "inventario") }),
      caja: curva(c, "g-caja", { puntos: [8, 7, 7.5, 5, 4, 3, 4.5, 6], banda: true, t0: P(x, "caja") }),
    };
    void tG;
    clip("e-areas", "scene", s, d, `${KICK}
      <div class="st">
        <h2 class="h md a-t">${words("Parece una pregunta simple.")}</h2>
        <div class="row areas">${A.map(([k, n, q]) => `<div class="panel area" id="ar-${k}"><b>${n}</b><div class="mini">${G[k]}</div><span>${q}</span></div>`).join("")}</div>
      </div>`, 3);
    enter("e-areas", s);
    titleIn("#e-areas .a-t", x.voiceAt);
    A.forEach(([k]) => pop(`#ar-${k}`, P(x, k) - 0.1));
    const tC = P(x, "cada área");
    at("#e-areas .area span", { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.4, stagger: 0.15 }, tC);
    to("#ar-planta", { x: VERT ? 0 : -40, rotate: -3, duration: 0.6, ease: "power2.out" }, tC);
    to("#ar-procesos", { y: VERT ? 0 : 30, rotate: 2, duration: 0.6, ease: "power2.out" }, tC);
    to("#ar-inventario", { y: VERT ? 0 : -30, rotate: -2, duration: 0.6, ease: "power2.out" }, tC);
    to("#ar-caja", { x: VERT ? 0 : 40, rotate: 3, duration: 0.6, ease: "power2.out" }, tC);
    to("#e-areas .a-t", { opacity: 0.4, duration: 0.5 }, P(x, "Pero"));
    A.forEach(([k], i) => sfx(`2${i}`, "pop.mp3", P(x, k), 0.12));
    leave("e-areas", s + d);
  }

  // 3. Arvantti Fractal: no decide por ti.
  {
    const x = S.fractal; const [s, d] = span(x);
    const tF = P(x, "Arvantti Fractal"), tN = P(x, "no decide"), tO = P(x, "las mejores"), tD = P(x, "para que");
    clip("e-fractal", "scene", s, d, `
      <div class="fondo-red">${red(c, "red3", { w: 1600, h: 900, capas: [5, 8, 9, 8, 5], t0: s + 0.3, dur: d - 1.2, seed: 21 })}</div>
      <div class="st">
        <img class="marca fm" src="assets/clips/marca.png" alt="">
        <h1 class="h xl ti ft">Arvantti Fractal</h1>
        <p class="sub nd">${words("No decide por ti.")}</p>
        <div class="row ops">${["Opción A", "Opción B", "Opción C"].map((o, i) => `<div class="panel op" id="fo${i}"><b>${o}</b><i style="--w:${[78, 62, 85][i]}%"></i><small>Impacto</small></div>`).join("")}</div>
        <span class="chip on td">Tú decides</span>
      </div>`, 3);
    enter("e-fractal", s);
    at("#e-fractal .fm", { opacity: 0, scale: 0.5 }, { opacity: 1, scale: 1, duration: 0.9, ease: "back.out(1.6)" }, tF - 0.6);
    at("#e-fractal .ft", { opacity: 0, letterSpacing: "40px", filter: "blur(14px)" }, { opacity: 1, letterSpacing: "-3px", filter: "blur(0px)", duration: 1.1, ease: "power3.out" }, tF - 0.2);
    at("#e-fractal .ft", { backgroundPosition: "-200% 0" }, { backgroundPosition: "200% 0", duration: 2, ease: "power1.inOut" }, tF + 0.8);
    titleIn("#e-fractal .nd", tN);
    [0, 1, 2].forEach((i) => pop(`#fo${i}`, tO + i * 0.25));
    at("#e-fractal .op i", { scaleX: 0 }, { scaleX: 1, duration: 0.8, stagger: 0.2, ease: "power2.out" }, P(x, "el impacto"));
    pop("#e-fractal .td", tD);
    sfx("3a", "hit.wav", tF, 0.28); sfx("3b", "spark.wav", tD, 0.2);
    leave("e-fractal", s + d);
  }

  // 4. Primero tus reglas; después combina métodos y muestra impacto y riesgo.
  {
    const x = S.reglas; const [s, d] = span(x);
    const R = ["Qué se puede mover", "Qué cliente va primero", "Turnos y capacidad"];
    const O = [["A", [80, 55, 30]], ["B", [65, 75, 50]], ["C", [90, 40, 70]]];
    const tR = P(x, "las reglas"), tM = P(x, "combina"), tA = P(x, "buscar"), tI = P(x, "el impacto");
    clip("e-reglas", "scene", s, d, `${KICK}
      <div class="st"><div class="flujo">
        <div class="reglas">${R.map((r, i) => `<span class="chip rg" id="rg${i}">${r}</span>`).join("")}</div>
        <div class="motor" id="nu"><div class="m-red">${red(c, "red4", { w: 620, h: 400, capas: [3, 6, 6, 4], t0: tM - 0.2, dur: tA - tM + 0.6, seed: 5 })}</div><div class="m-cam">${caminos(c, "cam4", { w: 620, h: 400, t0: tA - 0.1, dur: tI - tA + 0.4, seed: 17 })}</div><p class="m-l"><b>FRACTAL</b> · tus reglas primero</p></div>
        <div class="opts">${O.map(([n, v], i) => `<div class="panel opt" id="op${i}"><b>Opción ${n}</b>${["Entregas", "Costo", "Riesgo"].map((m, k) => `<div class="bar"><span>${m}</span><i class="${k === 2 ? "r" : ""}" style="--n:${v[k]}"></i></div>`).join("")}</div>`).join("")}</div>
      </div></div>`, 3);
    enter("e-reglas", s);
    R.forEach((_, i) => at(`#rg${i}`, { opacity: 0, x: -40 }, { opacity: 1, x: 0, duration: 0.45, ease: "power3.out" }, tR + i * 0.3));
    fade("#nu .m-l", tR + 0.2);
    to("#e-reglas .rg", { x: VERT ? 0 : 60, y: VERT ? 40 : 0, opacity: 0.35, scale: 0.9, duration: 0.6, stagger: 0.12, ease: "power2.in" }, tM - 0.6);
    to("#nu .m-red", { opacity: 0, duration: 0.4 }, tA - 0.3);
    at("#nu .m-cam", { opacity: 0 }, { opacity: 1, duration: 0.3 }, tA - 0.2);
    O.forEach((_, i) => at(`#op${i}`, { opacity: 0, x: 40 }, { opacity: 1, x: 0, duration: 0.5, ease: "power3.out" }, tA + i * 0.3));
    at("#e-reglas .opt i", { scaleX: 0 }, { scaleX: 1, duration: 0.7, stagger: 0.08, ease: "power2.out" }, tI - 0.1);
    sfx("4a", "whoosh-short.mp3", tM, 0.25); sfx("4b", "pop.mp3", tA, 0.15);
    leave("e-reglas", s + d);
  }

  // 5. Producto propio; trabaja con el gemelo y con Arvantti OS.
  {
    const x = S.producto; const [s, d] = span(x);
    const tS = P(x, "Funciona solo"), tG = P(x, "el gemelo"), tO = P(x, "Arvantti OS"), tP = P(x, "es el optimizador");
    clip("e-producto", "scene", s, d, `${KICK}
      <div class="st">
        <h2 class="h md p-t">${words("Un producto propio.")}</h2>
        <div class="row prods">
          <div class="panel prod" id="pr-os"><small>Gobierno de la IA</small><b>Arvantti OS</b></div>
          <div class="panel prod on" id="pr-fr"><small>Opciones e impacto</small><b>Arvantti Fractal</b><span class="chip dat">Con tus datos</span></div>
          <div class="panel prod" id="pr-dt"><small>Gemelo digital</small><b>Arvantti Digital Twin</b></div>
        </div>
        <span class="chip on opt2">Optimizador de los dos</span>
      </div>`, 3);
    enter("e-producto", s);
    titleIn("#e-producto .p-t", x.voiceAt);
    pop("#pr-fr", tS - 0.3);
    pop("#e-producto .dat", P(x, "con tus datos"));
    pop("#pr-dt", tG);
    pop("#pr-os", tO);
    c.tl.push(`tl.to("#pr-fr",{boxShadow:"0 0 0 4px #4ea7ff, 0 0 120px #2d7ff9cc",duration:.5,yoyo:true,repeat:1},${tP.toFixed(2)});`);
    pop("#e-producto .opt2", tP);
    sfx("5a", "pop.mp3", tG, 0.15); sfx("5b", "pop.mp3", tO, 0.15); sfx("5c", "spark.wav", tP, 0.2);
    leave("e-producto", s + d);
  }

  // 6. Un núcleo, tres módulos.
  {
    const x = S.modulos; const [s, d] = span(x);
    const M = [["Industrial", "La planta", "Industrial"], ["Process", "Los procesos", "Process"], ["Finance", "El dinero", "Finance"]];
    clip("e-modulos", "scene", s, d, `${KICK}
      <div class="st">
        <div class="anillos">
          <svg viewBox="-300 -300 600 600">${[150, 210, 270].map((r, i) => `<circle id="an${i}" r="${r}" pathLength="1"/><g class="orb" id="orb${i}"><circle class="orbp" cx="${r}" cy="0" r="9"/></g>`).join("")}</svg>
          <div class="nuc"><span>Fractal</span><small>Un solo núcleo</small></div>
          ${M.map(([n, q], i) => `<div class="mlab" id="ml${i}"><b>${n}</b><small>${q}</small></div>`).join("")}
        </div>
      </div>`, 3);
    enter("e-modulos", s);
    pop("#e-modulos .nuc", P(x, "núcleo") - 0.4);
    M.forEach(([, , k], i) => {
      const t = P(x, k);
      at(`#an${i}`, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.8, ease: "power2.out" }, t - 0.3);
      pop(`#ml${i}`, t);
      at(`#orb${i} .orbp`, { opacity: 0 }, { opacity: 1, duration: 0.3 }, t + 0.4);
      at(`#orb${i}`, { rotation: [0, 120, 240][i] }, { rotation: [0, 120, 240][i] + (i % 2 ? -1 : 1) * 300, svgOrigin: "0 0", duration: s + d - t, ease: "none" }, t + 0.4);
      sfx(`6${i}`, "pop.mp3", t, 0.15);
    });
    leave("e-modulos", s + d);
  }

  // 7. La serie responde la pregunta del lunes; decide una persona.
  {
    const x = S.serie; const [s, d] = span(x);
    const PASOS = ["Planta", "Procesos", "Caja", "Riesgo"];
    const tP = P(x, "paso a paso"), tD = P(x, "decide");
    clip("e-serie", "scene", s, d, `${KICK}
      <div class="st">
        <h1 class="h xl q2">${words("¿Lo aceptamos?")}</h1>
        <div class="ruta-w"><svg class="ruta" viewBox="0 0 1200 60" preserveAspectRatio="none"><line x1="40" y1="30" x2="1160" y2="30" pathLength="1"/></svg><div class="row pasos">${PASOS.map((p, i) => `<span class="chip ps" id="ps${i}">${i + 1}. ${p}</span>`).join("")}</div></div>
        <span class="chip on dp">Decide una persona</span>
      </div>`, 3);
    enter("e-serie", s);
    titleIn("#e-serie .q2", P(x, "la pregunta") - 0.1, 0.15);
    at("#e-serie .ruta line", { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 1.2, ease: "power1.inOut" }, tP);
    PASOS.forEach((_, i) => { pop(`#ps${i}`, tP + i * 0.25); to(`#ps${i}`, { backgroundColor: "#1f4f9a", borderColor: "#4ea7ff", duration: 0.3 }, tP + 0.3 + i * 0.25); });
    pop("#e-serie .dp", tD);
    sfx("7a", "spark.wav", tD, 0.2);
    leave("e-serie", s + d);
  }

  // 8. Cierre.
  {
    const x = S.cierre; const [s, d] = span(x);
    clip("e-cierre", "scene", s, d, `
      <div class="st fin">
        <img class="marca" src="assets/clips/marca.png" alt="">
        <h1 class="h xl ti">Arvantti Fractal</h1>
        <p class="firma">Las mejores opciones y su impacto,<br>para que tú decidas.</p>
        <p class="url">arvantti.tech</p>
      </div>`, 3);
    enter("e-cierre", s);
    at("#e-cierre .marca", { opacity: 0, scale: 0.5, rotate: -8 }, { opacity: 1, scale: 1, rotate: 0, duration: 1, ease: "back.out(1.6)" }, x.voiceAt - 0.4);
    at("#e-cierre h1", { opacity: 0, letterSpacing: "30px", filter: "blur(10px)" }, { opacity: 1, letterSpacing: "-3px", filter: "blur(0px)", duration: 1.1, ease: "power3.out" }, x.voiceAt);
    fade("#e-cierre .firma", P(x, "Las mejores"), 0.8);
    fade("#e-cierre .url", P(x, "para que") + 0.8, 0.8);
    to("#e-cierre .fin", { opacity: 0, duration: 1 }, s + d - 1);
    sfx(8, "hit.wav", x.voiceAt, 0.28);
  }

  [S.areas, S.fractal, S.reglas, S.producto, S.modulos, S.serie, S.cierre].forEach((x) => sweep(x.start));
}
