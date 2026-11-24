// Resumen de la serie Arvantti Fractal (guion aprobado por Andy el 2026-11-24, orden de módulos Finance, Process, Industrial).
// Reúne las animaciones de los 7 episodios. Cada escena trabaja con selectores acotados a su propio clip (#s01…#s16),
// así los ids internos que se repiten entre episodios no chocan; estilos.css se arma con los estilos de cada episodio
// acotados de la misma forma (node armar-estilos.mjs).
export const ESCENAS = [
  { id: "pedido", dir: "01-pedido", lead: 1.4, tail: 0.8 },
  { id: "areas", dir: "02-areas", lead: 0.3, tail: 0.7 },
  { id: "fractal", dir: "03-fractal", lead: 0.3, tail: 0.9 },
  { id: "reglas", dir: "04-reglas", lead: 0.3, tail: 0.7 },
  { id: "iaopt", dir: "05-ia-opt", lead: 0.3, tail: 0.8 },
  { id: "evol", dir: "06-evolutivos", lead: 0.3, tail: 0.8 },
  { id: "incert", dir: "07-incertidumbre", lead: 0.3, tail: 0.8 },
  { id: "rango", dir: "08-rango", lead: 0.3, tail: 0.8 },
  { id: "objetivos", dir: "09-objetivos", lead: 0.3, tail: 0.8 },
  { id: "modulos", dir: "10-modulos", lead: 0.3, tail: 0.8 },
  { id: "finance", dir: "11-finance", lead: 0.3, tail: 0.8 },
  { id: "process", dir: "12-process", lead: 0.3, tail: 0.8 },
  { id: "industrial", dir: "13-industrial", lead: 0.3, tail: 0.8 },
  { id: "miercoles", dir: "14-miercoles", lead: 0.4, tail: 0.8 },
  { id: "decide", dir: "15-decide", lead: 0.3, tail: 0.9 },
  { id: "cierre", dir: "16-cierre", lead: 0.9, tail: 4.5, sinSubtitulos: true },
];

import { red, caminos, curva, barras, region, genetico, pareto, montecarlo, gantt } from "../../viz.mjs";
import { ayudas, opciones, animarOpciones, familias, cierre } from "../../comun.mjs";

const KICK = `<p class="kick"><b>RESUMEN</b> SERIE ARVANTTI FRACTAL</p>`;

/** Contexto con selectores acotados al clip de la escena. */
function acotar(c, id) {
  const sc = (sel) => sel.split(",").map((p) => { p = p.trim(); return p === `#${id}` || p.startsWith(`#${id} `) ? p : `#${id} ${p}`; }).join(", ");
  let n = 0;
  const k = {
    ...c,
    at: (sel, a, b, t) => c.at(sc(sel), a, b, t),
    to: (sel, v, t) => c.to(sc(sel), v, t),
    set: (sel, v, t) => c.set(sc(sel), v, t),
    titleIn: (sel, t, st) => c.titleIn(sc(sel), t, st),
    sfx: (_n, file, t, vol) => c.sfx(`${id}-${n++}`, file, t, vol),
  };
  return { ...k, ...ayudas(k) };
}

/** Histórico (línea sólida) y pronóstico con banda de incertidumbre (como el episodio 6). */
function pronostico(c, id, { w = 1100, h = 330, t0, tP }) {
  const hist = [52, 58, 50, 64, 60, 70, 66, 74, 68, 78, 75, 82];
  const pro = [82, 86, 84, 90, 88, 94];
  const n = hist.length + pro.length - 1, X = (i) => 40 + (i * (w - 80)) / n, Y = (v) => h - 40 - ((v - 40) / 70) * (h - 80);
  const lh = hist.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(" ");
  const k0 = hist.length - 1;
  const lp = pro.map((v, i) => `${i ? "L" : "M"}${X(k0 + i).toFixed(1)} ${Y(v).toFixed(1)}`).join(" ");
  const banda = `${pro.map((v, i) => `${i ? "L" : "M"}${X(k0 + i).toFixed(1)} ${Y(v + i * 3).toFixed(1)}`).join(" ")} ${pro.slice().reverse().map((v, j) => { const i = pro.length - 1 - j; return `L${X(k0 + i).toFixed(1)} ${Y(v - i * 3).toFixed(1)}`; }).join(" ")} Z`;
  c.at(`#${id} .ph`, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 1.4, ease: "power1.inOut" }, t0);
  c.at(`#${id} .pband`, { opacity: 0 }, { opacity: 1, duration: 0.8 }, tP + 0.3);
  c.at(`#${id} .pp2`, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 1, ease: "power1.out" }, tP);
  c.at(`#${id} .hoy, #${id} .lbl`, { opacity: 0 }, { opacity: 1, duration: 0.4, stagger: 0.2 }, tP - 0.3);
  return `<svg class="pron" id="${id}" viewBox="0 0 ${w} ${h}">
    <line class="ax" x1="40" y1="${h - 40}" x2="${w - 30}" y2="${h - 40}"/>
    <line class="hoy" x1="${X(k0)}" y1="20" x2="${X(k0)}" y2="${h - 40}"/>
    <text class="lbl" x="${X(k0) - 16}" y="${h - 12}" text-anchor="end">Históricos del ERP</text>
    <text class="lbl" x="${X(k0) + 16}" y="${h - 12}">Próximos meses</text>
    <path class="pband" d="${banda}"/>
    <path class="ph" d="${lh}" pathLength="1"/><path class="pp2" d="${lp}" pathLength="1"/></svg>`;
}

export function componerEpisodio(c0) {
  const { S, VERT } = c0;
  const escena = (x, id, html, fn, { conKick = true } = {}) => {
    const c = acotar(c0, id);
    const [s, d] = c.span(x);
    const P = (frag) => c.P(x, frag);
    c.clip(id, "scene", s, d, `${conKick ? KICK : ""}${typeof html === "function" ? html(c, s, d, P) : html}`, 3);
    fn(c, s, d, P);
  };

  // 01. El pedido del lunes (ep 1).
  escena(S.pedido, "s01", `
    <div class="st">
      <div class="panel mail">
        <div class="mh"><span class="dot"></span><b>Nuevo pedido</b><small>Lunes · 8:00</small></div>
        <div class="ml"><span>Volumen</span><b>El triple de lo habitual</b></div>
        <div class="ml"><span>Entrega</span><b>En tres semanas</b></div>
        <div class="ml"><span>Estado</span><b class="alert">Sin respuesta</b></div>
      </div>
      <h1 class="h xl q1">${c0.words("¿Lo aceptamos?")}</h1>
    </div>`, (c, s, d, P) => {
    c.at(".kick", { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 0.6 }, s + 0.3);
    c.at(".mail", { opacity: 0, y: 80, rotateX: 25 }, { opacity: 1, y: 0, rotateX: 0, duration: 0.9, ease: "power3.out" }, P("Llega") - 0.3);
    c.at(".ml", { opacity: 0, x: -20 }, { opacity: 1, x: 0, duration: 0.4, stagger: 0.25, ease: "power2.out" }, P("Llega") + 0.4);
    c.to(".mail", { scale: 0.86, opacity: 0.55, duration: 0.6, ease: "power2.inOut" }, P("¿lo") - 0.4);
    c.titleIn(".q1", P("¿lo") - 0.1, 0.15);
    c.sfx(0, "pop.mp3", P("Llega"), 0.2); c.sfx(0, "hit.wav", P("¿lo"), 0.25);
    c.leave("s01", s + d);
  });

  // 02. Cada área tiene su propia respuesta (ep 1).
  {
    const A = [["planta", "Planta", "¿Hay capacidad?"], ["procesos", "Procesos", "¿Llegamos a tiempo?"], ["inventario", "Inventario", "¿Alcanza el material?"], ["caja", "Caja", "¿Aguanta la caja?"]];
    escena(S.areas, "s02", (c, s, d, P) => {
      const G = {
        planta: barras(c, "g-planta", { valores: [55, 70, 62, 88, 100, 76], alerta: 4, t0: P("planta") }),
        procesos: curva(c, "g-procesos", { puntos: [3, 5, 4, 6, 5, 8, 7, 9], t0: P("procesos") }),
        inventario: barras(c, "g-inventario", { valores: [95, 82, 70, 58, 40, 28], alerta: 5, t0: P("inventario") }),
        caja: curva(c, "g-caja", { puntos: [8, 7, 7.5, 5, 4, 3, 4.5, 6], banda: true, t0: P("caja") }),
      };
      return `<div class="st">
        <h2 class="h md a-t">${c.words("Una pregunta, cuatro áreas.")}</h2>
        <div class="row areas">${A.map(([k, n, q]) => `<div class="panel area" id="ar-${k}"><b>${n}</b><div class="mini">${G[k]}</div><span>${q}</span></div>`).join("")}</div>
      </div>`;
    }, (c, s, d, P) => {
      const { VERT } = c;
      c.enter("s02", s);
      c.titleIn(".a-t", c0.S.areas.voiceAt);
      A.forEach(([k]) => c.pop(`#ar-${k}`, P(k) - 0.1));
      const tC = P("cada área");
      c.at(".area span", { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.4, stagger: 0.15 }, tC);
      c.to("#ar-planta", { x: VERT ? 0 : -40, rotate: -3, duration: 0.6, ease: "power2.out" }, tC);
      c.to("#ar-procesos", { y: VERT ? 0 : 30, rotate: 2, duration: 0.6, ease: "power2.out" }, tC);
      c.to("#ar-inventario", { y: VERT ? 0 : -30, rotate: -2, duration: 0.6, ease: "power2.out" }, tC);
      c.to("#ar-caja", { x: VERT ? 0 : 40, rotate: 3, duration: 0.6, ease: "power2.out" }, tC);
      c.to(".a-t", { opacity: 0.4, duration: 0.5 }, P("Y cada"));
      A.forEach(([k]) => c.sfx(0, "pop.mp3", P(k), 0.12));
      c.leave("s02", s + d);
    });
  }

  // 03. Arvantti Fractal: motor de optimización y apoyo a la decisión; no decide por ti (ep 1).
  escena(S.fractal, "s03", (c, s, d) => `
    <div class="fondo-red">${red(c, "red3", { w: 1600, h: 900, capas: [5, 8, 9, 8, 5], t0: s + 0.3, dur: d - 1.2, seed: 21 })}</div>
    <div class="st">
      <img class="marca fm" src="assets/clips/marca.png" alt="">
      <h1 class="h xl ti ft">Arvantti Fractal</h1>
      <span class="chip mot">Motor de optimización y apoyo a la decisión</span>
      <p class="sub nd">${c.words("No decide por ti.")}</p>
      <div class="row ops">${["Opción A", "Opción B", "Opción C"].map((o, i) => `<div class="panel op" id="fo${i}"><b>${o}</b><i style="--w:${[78, 62, 85][i]}%"></i><small>Impacto</small></div>`).join("")}</div>
      <span class="chip on td">Tú decides</span>
    </div>`, (c, s, d, P) => {
    const tF = P("Arvantti Fractal"), tN = P("No decide"), tO = P("las mejores"), tD = P("para que");
    c.enter("s03", s);
    c.at(".fm", { opacity: 0, scale: 0.5 }, { opacity: 1, scale: 1, duration: 0.9, ease: "back.out(1.6)" }, tF - 0.6);
    c.at(".ft", { opacity: 0, letterSpacing: "40px", filter: "blur(14px)" }, { opacity: 1, letterSpacing: "-3px", filter: "blur(0px)", duration: 1.1, ease: "power3.out" }, tF - 0.2);
    c.at(".ft", { backgroundPosition: "-200% 0" }, { backgroundPosition: "200% 0", duration: 2, ease: "power1.inOut" }, tF + 0.8);
    c.pop(".mot", P("el motor"));
    c.titleIn(".nd", tN);
    [0, 1, 2].forEach((i) => c.pop(`#fo${i}`, tO + i * 0.25));
    c.at(".op i", { scaleX: 0 }, { scaleX: 1, duration: 0.8, stagger: 0.2, ease: "power2.out" }, P("su impacto"));
    c.pop(".td", tD);
    c.sfx(0, "hit.wav", tF, 0.28); c.sfx(0, "spark.wav", tD, 0.2);
    c.leave("s03", s + d);
  }, { conKick: false });

  // 04. Primero tus reglas (ep 2).
  {
    const R = [["qué se puede mover", "Se puede mover", "✓"], ["qué no", "No se mueve", "✕"], ["qué cliente", "Cliente primero", "1"]];
    escena(S.reglas, "s04", `
      <div class="st">
        <h2 class="h md r-t">${c0.words("Primero, tus reglas.")}</h2>
        <div class="row rgs">${R.map(([, t, ic], i) => `<div class="panel card rg" id="rg${i}"><i class="ic">${ic}</i><b>${t}</b></div>`).join("")}</div>
        <div class="row pas"><span class="chip on" id="pa0">1 · Incorpora tus reglas</span><span class="flecha" id="pa1">→</span><span class="chip" id="pa2">2 · Optimiza</span></div>
      </div>`, (c, s, d, P) => {
      const tA = P("primero incorpora"), tO = P("optimiza");
      c.enter("s04", s);
      c.titleIn(".r-t", P("tus reglas") - 0.2);
      R.forEach(([k], i) => { c.pop(`#rg${i}`, P(k) - 0.1); c.sfx(0, "pop.mp3", P(k), 0.12); });
      c.izq("#pa0", tA); c.fade("#pa1", tO - 0.4); c.pop("#pa2", tO); c.luz("#pa2", tO + 0.3);
      c.leave("s04", s + d);
    });
  }

  // 05. Cinco familias de métodos: IA y optimización matemática (ep 2).
  escena(S.iaopt, "s05", (c, s, d, P) => {
    const tI = P("La inteligencia"), tO = P("La optimización");
    return `<div class="st">
      ${familias("fa3")}
      <div class="row dos">
        <div class="panel met" id="me-ia"><small>Inteligencia artificial</small>${red(c, "red5", { w: 600, h: 330, capas: [4, 6, 6, 3], t0: tI, dur: tO - tI + 0.5, seed: 8 })}
          <div class="row lb"><span class="tag" id="li0">Entender</span><span class="tag" id="li1">Formular escenarios</span><span class="tag" id="li2">Interpretar</span></div></div>
        <div class="panel met" id="me-op"><small>Optimización matemática</small>${region(c, "reg5", { w: 520, h: 360, t0: tO + 0.3, dur: Math.max(2.5, s + d - tO - 1) })}</div>
      </div>
    </div>`;
  }, (c, s, d, P) => {
    const tF = P("cinco familias"), tI = P("La inteligencia"), tO = P("La optimización");
    c.enter("s05", s);
    c.at("#fa3 .chip", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.4, stagger: 0.12 }, tF);
    c.luz("#fa3-0", tI); c.luz("#fa3-1", tO);
    c.pop("#me-ia", tI - 0.2);
    ["entender", "formular", "interpretar"].forEach((k, i) => c.pop(`#li${i}`, P(k)));
    c.pop("#me-op", tO - 0.1);
    c.sfx(0, "whoosh-short.mp3", tI, 0.2); c.sfx(0, "pop.mp3", tO, 0.15);
    c.leave("s05", s + d);
  });

  // 06. Genéticos y evolutivos (ep 2): planes que se seleccionan, recombinan y mutan; no es una red neuronal.
  escena(S.evol, "s06", (c, s, d, P) => `
    <div class="st">
      <div class="row ops3"><span class="chip" id="ev0">Selección</span><span class="chip" id="ev1">Recombinación</span><span class="chip" id="ev2">Mutación</span></div>
      <div class="panel pobw">${genetico(c, "gen6", { t0: P("los algoritmos") - 0.2, tS: P("seleccionan"), tR: P("recombinan"), tM: P("mutan"), tG: P("generación tras"), tEnd: s + d - 0.6 })}</div>
      <span class="chip on ne">Optimización evolutiva · no es una red neuronal</span>
    </div>`, (c, s, d, P) => {
    const tG = P("los algoritmos");
    c.enter("s06", s);
    c.pop(".pobw", tG - 0.3);
    [["seleccionan", 0], ["recombinan", 1], ["mutan", 2]].forEach(([k, i]) => { c.pop(`#ev${i}`, P(k)); c.luz(`#ev${i}`, P(k) + 0.2); });
    c.pop(".ne", P("Es optimización"));
    c.sfx(0, "whoosh-short.mp3", tG, 0.2); c.sfx(0, "spark.wav", P("Es optimización"), 0.18);
    c.leave("s06", s + d);
  });

  // 07. Incertidumbre: estocásticos y Monte Carlo (ep 3).
  escena(S.incert, "s07", (c, s, d, P) => `
    <div class="st">
      <h2 class="h md m-t">${c.words("Un plan perfecto en papel…")}</h2>
      <div class="row mts"><span class="chip" id="mt0">Métodos estocásticos · la incertidumbre con probabilidades</span><span class="chip" id="mt1">Simulación Monte Carlo</span></div>
      <div class="panel vz mcw">${montecarlo(c, "mc7", { w: 1100, h: 400, n: 60, t0: P("repite") + 0.2, dur: Math.max(2.5, s + d - P("repite") - 1), seed: 31 })}<p class="vl">Cada línea, un escenario sorteado · a la derecha, cuántas veces sale cada resultado</p></div>
    </div>`, (c, s, d, P) => {
    const tE = P("los métodos"), tM = P("La simulación");
    c.enter("s07", s);
    c.titleIn(".m-t", c0.S.incert.voiceAt);
    c.to(".m-t", { color: "#ff8a3d", duration: 0.3 }, P("el martes"));
    c.to(".m-t", { opacity: 0.35, scale: 0.8, duration: 0.5 }, tE - 0.2);
    c.pop("#mt0", tE); c.luz("#mt0", P("con probabilidades"));
    c.pop("#mt1", tM); c.luz("#mt1", tM + 0.3);
    c.pop(".mcw", P("repite") - 0.2);
    c.sfx(0, "hit.wav", P("el martes"), 0.14); c.sfx(0, "pop.mp3", tE, 0.15); c.sfx(0, "whoosh-short.mp3", P("muchas veces"), 0.2);
    c.leave("s07", s + d);
  });

  // 08. Cada alternativa se vuelve un rango; robustez (ep 3).
  {
    const R = [["Opción A", 18, 82, 55, "78%"], ["Opción B", 38, 70, 56, "91%"], ["Opción C", 8, 92, 62, "64%"]];
    escena(S.rango, "s08", `
      <div class="st">
        <h2 class="h md r-t">${c0.words("De un número a un rango.")}</h2>
        <div class="panel rangos">
          <div class="leyenda"><span id="lg0">Pesimista</span><span id="lg1">Esperado</span><span id="lg2">Optimista</span><span class="pq" id="lg3">Prob. de cumplir</span></div>
          ${R.map(([n, a, b, m, q]) => `<div class="rg"><span>${n}</span><div class="rt"><i class="rb" style="left:${a}%;width:${b - a}%"></i><i class="rm" style="left:${m}%"></i><i class="r1" style="left:${m}%"></i></div><b class="pq">${q}</b></div>`).join("")}
        </div>
        <div class="row robu"><span class="chip on" id="rb0">Robustez</span><span class="chip" id="rb1">Cuánto varía</span><span class="chip" id="rb2">Peores escenarios</span></div>
      </div>`, (c, s, d, P) => {
      const x = c0.S.rango;
      const tR = P("un rango"), tP = P("lo esperado"), tW = P("pesimista"), tB = P("optimista"), tQ = P("la probabilidad");
      c.enter("s08", s);
      c.titleIn(".r-t", x.voiceAt);
      c.pop(".rangos", x.voiceAt + 0.3);
      c.at(".r1", { opacity: 0 }, { opacity: 1, duration: 0.3, stagger: 0.1 }, x.voiceAt + 0.6);
      c.to(".r1", { opacity: 0, duration: 0.3 }, tR - 0.2);
      c.at(".rb", { scaleX: 0 }, { scaleX: 1, transformOrigin: "50% 50%", duration: 0.7, stagger: 0.15, ease: "power2.out" }, tR);
      c.at(".rm", { opacity: 0, scale: 0 }, { opacity: 1, scale: 1, duration: 0.4, stagger: 0.1, ease: "back.out(2)" }, tP);
      c.fade("#lg1", tP); c.fade("#lg2", tB); c.fade("#lg0", tW); c.fade("#lg3", tQ);
      c.at("b.pq", { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.4, stagger: 0.15, ease: "back.out(2)" }, tQ + 0.2);
      c.pop("#rb0", P("qué tan robusta")); c.pop("#rb1", P("cuánto varía")); c.pop("#rb2", P("peores escenarios"));
      c.to(".rb", { scaleX: 1.12, duration: 0.5, yoyo: true, repeat: 1, ease: "sine.inOut" }, P("cuánto varía"));
      c.sfx(0, "whoosh-short.mp3", tR, 0.18); c.sfx(0, "pop.mp3", P("qué tan robusta"), 0.14);
      c.leave("s08", s + d);
    });
  }

  // 09. Varios objetivos; ninguna opción gana en todo (ep 2).
  {
    const O = [["entregas", "Cumplir entregas"], ["energía", "Menos energía"], ["margen", "Cuidar el margen"]];
    escena(S.objetivos, "s09", (c, s, d, P) => `
      <div class="st capaA">
        <h2 class="h md o-t">${c.words("Varios objetivos a la vez.")}</h2>
        <div class="row dos">
          <div class="objs">${O.map(([, t], i) => `<span class="chip" id="ob${i}">${t}</span>`).join("")}</div>
          <div class="panel vz par">${pareto(c, "par9", { w: 760, h: 500, ejeX: "Menos energía", ejeY: "Entregas a tiempo", t0: P("Busca varios") + 0.2 })}<p class="vl">Mejores combinaciones</p></div>
        </div>
      </div>
      <div class="st capaB">
        <span class="h md nogana">${c.words("Ninguna opción gana en todo.")}</span>
        ${opciones("op9", [["Opción A", [85, 40, 55], "Gana entregas · cede costo"], ["Opción B", [60, 80, 50], "Gana costo · cede tiempo"], ["Opción C", [72, 62, 78], "Equilibrada · no gana en todo"]], [["Entregas"], ["Costo"], ["Margen"]])}
        <span class="chip on te">Las mejores que encontró · tú eliges</span>
      </div>`, (c, s, d, P) => {
      const tV = P("Busca varios"), tN = P("Ninguna"), tS = P("Son las mejores");
      c.enter("s09", s);
      c.titleIn(".o-t", tV - 0.2);
      c.pop(".par", tV);
      O.forEach(([k], i) => { c.izq(`#ob${i}`, P(k) - 0.1); c.luz(`#ob${i}`, P(k) + 0.2); c.sfx(0, "pop.mp3", P(k), 0.12); });
      c.to(".capaA", { opacity: 0, duration: 0.4 }, tN - 0.4);
      c.titleIn(".nogana", tN - 0.1);
      animarOpciones(c, "op9", tS - 0.1, P("lo que gana"));
      c.at("#op9 small", { opacity: 0 }, { opacity: 1, duration: 0.4, stagger: 0.2 }, P("lo que gana"));
      c.pop(".te", P("lo que cede"));
      c.sfx(0, "hit.wav", tN, 0.15); c.sfx(0, "spark.wav", tS, 0.18);
      c.leave("s09", s + d);
    });
  }

  // 10. Producto propio, optimizador de Arvantti OS y del gemelo; un núcleo, tres módulos (ep 1).
  escena(S.modulos, "s10", `
    <div class="st">
      <h2 class="h md p-t">${c0.words("Un producto propio.")}</h2>
      <div class="row prods">
        <div class="panel prod" id="pr-os"><small>Gobierno de la IA</small><b>Arvantti OS</b></div>
        <div class="panel prod on" id="pr-fr"><small>Opciones e impacto</small><b>Arvantti Fractal</b><span class="chip dat">Con tus datos</span></div>
        <div class="panel prod" id="pr-dt"><small>Gemelo digital</small><b>Arvantti Digital Twin</b></div>
      </div>
      <div class="row trio"><span class="chip on opt2">Optimizador de los dos</span><span class="chip nt">Un núcleo · Finance · Process · Industrial</span></div>
    </div>`, (c, s, d, P) => {
    const tP = P("es el optimizador"), tN = P("Un núcleo");
    c.enter("s10", s);
    c.titleIn(".p-t", c0.S.modulos.voiceAt);
    c.pop("#pr-fr", P("funciona solo") - 0.3);
    c.pop(".dat", P("con tus datos"));
    c.pop("#pr-os", P("Arvantti OS"));
    c.pop("#pr-dt", P("gemelo digital"));
    c.to("#pr-fr", { boxShadow: "0 0 0 4px #4ea7ff, 0 0 120px #2d7ff9cc", duration: 0.5, yoyo: true, repeat: 1 }, tP);
    c.pop(".opt2", tP);
    c.pop(".nt", tN); c.luz(".nt", tN + 0.4);
    c.sfx(0, "pop.mp3", P("Arvantti OS"), 0.15); c.sfx(0, "pop.mp3", P("gemelo digital"), 0.15); c.sfx(0, "spark.wav", tN, 0.2);
    c.leave("s10", s + d);
  });

  // 11. Fractal Finance (ep 6).
  escena(S.finance, "s11", (c, s, d, P) => {
    const K = ["margen", "flujo de caja", "capital de trabajo", "liquidez"];
    const G = [
      ["Margen real", barras(c, "gm", { valores: [40, 55, 62, 70], t0: P(K[0]) + 0.2 })],
      ["Flujo de caja semanal", curva(c, "gf", { puntos: [6, 5, 3, 2.5, 4, 6, 7, 8], t0: P(K[1]) + 0.2 })],
      ["Capital de trabajo", barras(c, "gk", { valores: [85, 70, 48], alerta: 0, t0: P(K[2]) + 0.2 })],
      ["Liquidez", curva(c, "gl", { puntos: [5, 5.5, 5, 6, 6.5, 6, 7, 7.5], banda: true, t0: P(K[3]) + 0.2 })],
    ];
    return `<div class="st capaA">
        <h1 class="h ti ff">Fractal Finance</h1>
        <span class="chip on en">En Arvantti OS Enterprise</span>
        <div class="row metr">${G.map(([n, g], i) => `<div class="panel area" id="mt${i}"><b>${n}</b><div class="mini">${g}</div></div>`).join("")}</div>
      </div>
      <div class="st capaB">
        <div class="row tit"><span class="chip on" id="dm0">Demanda estimada</span><span class="chip" id="dm1">Históricos del ERP · el sistema de gestión de tu empresa</span><span class="chip" id="dm2">Capacidad real de la planta</span></div>
        <div class="panel vz pw">${pronostico(c, "pr11", { w: 1100, h: 300, t0: P("los históricos"), tP: P("y la capacidad") })}</div>
        <div class="balanza"><span id="bz0">Fabricar por adelantado</span><div class="riel"><i class="cursor"></i></div><span id="bz1">Solo bajo pedido</span></div>
        <span class="chip on neg">Mejor preparado para negociar con tus proveedores</span>
      </div>`;
  }, (c, s, d, P) => {
    const K = ["margen", "flujo de caja", "capital de trabajo", "liquidez"];
    const tF = P("Fractal Finance"), tD = P("Con la demanda"), tA = P("por adelantado"), tL = P("solo bajo pedido");
    c.enter("s11", s);
    c.at(".ff", { opacity: 0, letterSpacing: "30px", filter: "blur(12px)" }, { opacity: 1, letterSpacing: "-2px", filter: "blur(0px)", duration: 1, ease: "power3.out" }, tF - 0.2);
    c.at(".ff", { backgroundPosition: "-200% 0" }, { backgroundPosition: "200% 0", duration: 2, ease: "power1.inOut" }, tF + 0.8);
    c.pop(".en", P("en Arvantti"));
    K.forEach((k, i) => { c.pop(`#mt${i}`, P(k) - 0.1); c.sfx(0, "pop.mp3", P(k), 0.1); });
    c.to(".capaA", { opacity: 0, duration: 0.4 }, tD - 0.4);
    c.pop("#dm0", tD); c.pop("#dm1", P("los históricos")); c.pop("#dm2", P("y la capacidad"));
    c.pop(".pw", P("los históricos") - 0.2);
    c.fade(".balanza", tA - 0.4);
    c.luz("#bz0", tA); c.luz("#bz1", tL);
    c.at(".cursor", { left: "50%" }, { left: "15%", duration: 0.8, ease: "power2.inOut" }, tA);
    c.to(".cursor", { left: "85%", duration: 1, ease: "power2.inOut" }, tL);
    c.to(".cursor", { left: "50%", duration: 0.8, ease: "power2.inOut" }, P("negociar"));
    c.pop(".neg", P("negociar"));
    c.sfx(0, "hit.wav", tF, 0.25); c.sfx(0, "whoosh-short.mp3", tD, 0.18); c.sfx(0, "spark.wav", P("negociar"), 0.18);
    c.leave("s11", s + d);
  });

  // 12. Fractal Process (ep 5).
  {
    const T = [["Confirmar", 18], ["Comprar material", 92], ["Programar", 24], ["Producir", 60], ["Despachar", 20]];
    escena(S.process, "s12", `
      <div class="st capaA">
        <h1 class="h xl ti fp">Fractal Process</h1>
        <span class="chip on op">El optimizador de Arvantti OS</span>
        <span class="chip osd">El sistema operativo empresarial para la IA</span>
      </div>
      <div class="st capaB">
        <div class="panel tiempos"><small>Flujo del pedido · tiempo de cada paso</small>${T.map(([n, v], i) => `<div class="bar"><span>${n}</span><i class="${i === 1 ? "lento" : ""}" style="--n:${v}"></i></div>`).join("")}</div>
        <div class="row tg"><span class="tag" id="as0">Tareas</span><span class="tag" id="as1">Personas</span><span class="tag" id="as2">Recursos</span></div>
        <div class="panel recibo"><small>Comprobante · Arvantti OS</small>
          <div class="ln"><span>Recomendación</span><b>Pedir material el mismo día</b></div>
          <div class="ln"><span>Decidió</span><b>Una persona</b></div></div>
      </div>`, (c, s, d, P) => {
      const tF = P("Fractal Process"), tA = P("Analiza"), tD = P("dónde se pierde"), tC = P("Y cada recomendación");
      c.enter("s12", s);
      c.at(".fp", { opacity: 0, letterSpacing: "30px", filter: "blur(12px)" }, { opacity: 1, letterSpacing: "-3px", filter: "blur(0px)", duration: 1, ease: "power3.out" }, tF - 0.2);
      c.at(".fp", { backgroundPosition: "-200% 0" }, { backgroundPosition: "200% 0", duration: 2, ease: "power1.inOut" }, tF + 0.8);
      c.pop(".op", P("el optimizador"));
      c.pop(".osd", P("el sistema operativo"));
      c.to(".capaA", { opacity: 0, duration: 0.4 }, tA - 0.4);
      c.pop(".tiempos", tA);
      c.at(".tiempos i", { scaleX: 0 }, { scaleX: 1, duration: 0.6, stagger: 0.1, ease: "power2.out" }, tA + 0.3);
      c.at(".tiempos i.lento", { background: "linear-gradient(90deg,#2d7ff9,#4ea7ff)" }, { background: "linear-gradient(90deg,#c2561a,#ff8a3d)", duration: 0.4 }, tD);
      [["tareas", 0], ["personas", 1], ["recursos", 2]].forEach(([k, i]) => c.pop(`#as${i}`, P(k)));
      c.pop(".recibo", tC);
      c.at(".recibo .ln", { opacity: 0, x: -20 }, { opacity: 1, x: 0, duration: 0.4, stagger: 0.3 }, tC + 0.4);
      c.sfx(0, "hit.wav", tF, 0.25); c.sfx(0, "hit.wav", tD, 0.14); c.sfx(0, "spark.wav", P("comprobante"), 0.18);
      c.leave("s12", s + d);
    });
  }

  // 13. Fractal Industrial, en el gemelo digital (ep 4).
  {
    const A = [
      ["Todo esta semana", [["Línea 1", [[0, 45], [48, 100]]], ["Línea 2", [[0, 50], [55, 80]]], ["Empaque", [[30, 70], [72, 100]]]], 0],
      ["Partir el pedido", [["Línea 1", [[0, 40], [44, 70]]], ["Línea 2", [[0, 38], [42, 74]]], ["Empaque", [[30, 62], [66, 88]]]], 2],
      ["Sumar un turno", [["Línea 1", [[0, 35], [38, 66]]], ["Línea 2", [[0, 46], [50, 78]]], ["Empaque", [[24, 58], [60, 92]]]], 2],
    ];
    const V = [["observa", "Observa"], ["simula", "Simula"], ["recomienda", "Recomienda"]];
    escena(S.industrial, "s13", (c, s, d, P) => `
      <div class="st capaA">
        <h1 class="h xl ti fi">Fractal Industrial</h1>
        <div class="row par2">
          <div class="panel card on" id="pi0"><small>Módulo de Fractal</small><b>Industrial</b></div>
          <svg class="enlace" viewBox="0 0 200 20"><line x1="0" y1="10" x2="200" y2="10" pathLength="1"/></svg>
          <div class="panel card" id="pi1"><small>La copia viva de tu planta</small><b>Arvantti Digital Twin</b></div>
        </div>
      </div>
      <div class="st capaB">
        <span class="chip on rgp">Con tus reglas de producción</span>
        <div class="alts">${A.map(([n, f, cu], i) => `<div class="panel alt" id="al${i}"><b>${n}</b>${gantt(c, `ga${i}`, { filas: f, cuello: cu, t0: P("compara") + 0.2 + i * 0.3 })}<span class="cb-l">Cuello de botella</span></div>`).join("")}</div>
      </div>
      <div class="st capaC">
        <div class="row verbos">${V.map(([, t], i) => `<span class="chip" id="vb${i}">${t}</span>`).join("")}</div>
        <div class="panel card nomueve"><i class="candado">🔒</i><b>No mueve nada en la planta</b></div>
      </div>`, (c, s, d, P) => {
      const tF = P("Fractal Industrial"), tR = P("Con tus reglas"), tB = P("cuello de botella"), tS = P("El gemelo solo");
      c.enter("s13", s);
      c.at(".fi", { opacity: 0, letterSpacing: "30px", filter: "blur(12px)" }, { opacity: 1, letterSpacing: "-3px", filter: "blur(0px)", duration: 1, ease: "power3.out" }, tF - 0.2);
      c.at(".fi", { backgroundPosition: "-200% 0" }, { backgroundPosition: "200% 0", duration: 2, ease: "power1.inOut" }, tF + 0.8);
      c.pop("#pi0", tF + 0.4);
      c.at(".enlace line", { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.6 }, P("el gemelo") - 0.3);
      c.pop("#pi1", P("el gemelo"));
      c.to(".capaA", { opacity: 0, duration: 0.4 }, tR - 0.4);
      c.pop(".rgp", tR);
      A.forEach((_, i) => c.pop(`#al${i}`, P("compara") - 0.1 + i * 0.3));
      c.at(".gt i.al", { background: "linear-gradient(90deg,#2d7ff9,#4ea7ff)", boxShadow: "0 0 0px #ff8a3d00" }, { background: "linear-gradient(90deg,#c2561a,#ff8a3d)", boxShadow: "0 0 20px #ff8a3d88", duration: 0.4, stagger: 0.25 }, tB);
      c.at(".cb-l", { opacity: 0 }, { opacity: 1, duration: 0.3, stagger: 0.25 }, tB + 0.2);
      c.to(".capaB", { opacity: 0, duration: 0.4 }, tS - 0.4);
      V.forEach(([k], i) => { c.pop(`#vb${i}`, P(k) - 0.05); c.luz(`#vb${i}`, P(k) + 0.2); c.sfx(0, "pop.mp3", P(k), 0.12); });
      c.pop(".nomueve", P("no mueve"));
      c.sfx(0, "hit.wav", tF, 0.25); c.sfx(0, "hit.wav", tB, 0.16);
      c.leave("s13", s + d);
    });
  }

  // 14. Miércoles: la respuesta completa (ep 7), en el orden caja, proceso, planta.
  {
    const R = [["un anticipo", "Fractal Finance", "Caja", "Un anticipo alivia la caja"], ["el material", "Fractal Process", "Proceso", "Material el mismo día"], ["la planta alcanza", "Fractal Industrial", "Planta", "Alcanza si partimos el pedido"]];
    const L = [["qué reglas", "Reglas que respetó"], ["qué datos", "Datos que usó"], ["cuánto riesgo", "Riesgo de cada opción"]];
    escena(S.miercoles, "s14", `
      <div class="st capaA">
        <div class="cal panel"><div class="dias">${["Lun", "Mar", "Mié", "Jue", "Vie"].map((d, i) => `<span class="${i === 2 ? "hoy" : ""}">${d}</span>`).join("")}</div></div>
        <div class="row resu">${R.map(([, m, t, v], i) => `<div class="panel card rs" id="rs${i}"><small>${m}</small><b><em>✓</em> ${t}</b><span>${v}</span></div>`).join("")}</div>
      </div>
      <div class="st capaB">
        <h2 class="h md x-t">${c0.words("Fractal explica por qué.")}</h2>
        <div class="panel expl">${L.map(([, t], i) => `<div class="ln" id="ln${i}"><em>${i + 1}</em><b>${t}</b>${i === 2 ? `<div class="rng"><i style="left:20%;width:50%"></i><i style="left:35%;width:30%"></i><i style="left:10%;width:75%"></i></div>` : `<i class="ok">✓</i>`}</div>`).join("")}</div>
        <div class="row vers">${["Escenario v1", "v2", "v3"].map((v, i) => `<span class="chip" id="vr${i}">${v}</span>`).join("")}<span class="chip on" id="vr3">Guardado con su versión</span></div>
      </div>`, (c, s, d, P) => {
      const x = c0.S.miercoles, tE = P("Fractal explica"), tV = P("Y cada escenario");
      c.enter("s14", s);
      c.pop(".cal", x.voiceAt - 0.2);
      c.at(".hoy", { backgroundColor: "#0d1a3000" }, { backgroundColor: "#2d7ff9", color: "#fff", duration: 0.4 }, x.voiceAt + 0.2);
      R.forEach(([k], i) => { c.pop(`#rs${i}`, P(k) - 0.1); c.sfx(0, "pop.mp3", P(k), 0.12); });
      c.to(".capaA", { opacity: 0, duration: 0.4 }, tE - 0.4);
      c.titleIn(".x-t", tE - 0.1);
      c.pop(".expl", P("qué reglas") - 0.4);
      L.forEach(([k], i) => { c.izq(`#ln${i}`, P(k) - 0.1); c.sfx(0, "pop.mp3", P(k), 0.1); });
      c.at(".rng i", { scaleX: 0 }, { scaleX: 1, transformOrigin: "50% 50%", duration: 0.5, stagger: 0.12 }, P("cuánto riesgo") + 0.3);
      [0, 1, 2, 3].forEach((i) => c.pop(`#vr${i}`, tV + i * 0.25));
      c.sfx(0, "whoosh-short.mp3", tV, 0.16);
      c.leave("s14", s + d);
    });
  }

  // 15. Juntos o por separado: Fractal no decide; la decisión es tuya (ep 7).
  escena(S.decide, "s15", (c, s, d) => `
    <div class="fondo-red">${red(c, "red15", { w: 1600, h: 900, capas: [5, 8, 9, 8, 5], t0: s + 0.3, dur: d - 1, seed: 33 })}</div>
    <div class="st">
      <div class="row tres">${["Finance", "Process", "Industrial"].map((m, i) => `<span class="chip" id="m${i}">${m}</span>`).join("")}<span class="chip on" id="jp">Juntos o por separado</span></div>
      <h1 class="h xl ti nd">Fractal no decide.</h1>
      <div class="row ops">${["A", "B", "C"].map((n, i) => `<div class="panel op" id="dop${i}"><b>Opción ${n}</b><i style="--w:${[78, 62, 85][i]}%"></i><small>Impacto</small></div>`).join("")}</div>
      <span class="chip on tuya">La decisión es tuya</span>
    </div>`, (c, s, d, P) => {
    const x = c0.S.decide, tN = P("Fractal no decide"), tD = P("La decisión");
    c.enter("s15", s);
    [0, 1, 2].forEach((i) => c.pop(`#m${i}`, x.voiceAt + i * 0.2));
    c.pop("#jp", P("por separado"));
    c.at(".nd", { opacity: 0, letterSpacing: "30px", filter: "blur(12px)" }, { opacity: 1, letterSpacing: "-3px", filter: "blur(0px)", duration: 1, ease: "power3.out" }, tN - 0.2);
    [0, 1, 2].forEach((i) => c.pop(`#dop${i}`, tN + 0.5 + i * 0.2));
    c.at(".op i", { scaleX: 0 }, { scaleX: 1, duration: 0.7, stagger: 0.2 }, tN + 0.8);
    c.pop(".tuya", tD);
    c.sfx(0, "hit.wav", tN, 0.25); c.sfx(0, "spark.wav", tD, 0.22);
    c.leave("s15", s + d);
  }, { conKick: false });

  cierre(c0, S.cierre);
  [S.areas, S.fractal, S.reglas, S.iaopt, S.evol, S.incert, S.rango, S.objetivos, S.modulos, S.finance, S.process, S.industrial, S.miercoles, S.decide, S.cierre].forEach((x) => c0.sweep(x.start));
}
