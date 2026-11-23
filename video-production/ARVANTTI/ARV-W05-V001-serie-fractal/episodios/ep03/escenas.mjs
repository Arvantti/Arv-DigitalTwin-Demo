// Episodio 3 · El riesgo: métodos estocásticos y Monte Carlo (guion aprobado por Andy el 2026-11-23).
export const ESCENAS = [
  { id: "martes", dir: "01-martes", lead: 1.4, tail: 1.0 },
  { id: "azar", dir: "02-azar", lead: 0.3, tail: 1.0 },
  { id: "dados", dir: "03-dados", lead: 0.3, tail: 1.0 },
  { id: "rango", dir: "04-rango", lead: 0.3, tail: 1.0 },
  { id: "robustez", dir: "05-robustez", lead: 0.3, tail: 1.0 },
  { id: "lunes", dir: "06-lunes", lead: 0.3, tail: 1.0 },
  { id: "cierre", dir: "07-cierre", lead: 0.9, tail: 4.5, sinSubtitulos: true },
];

import { curva, montecarlo, gantt } from "../../viz.mjs";
import { ayudas, cierre } from "../../comun.mjs";

export function componerEpisodio(c) {
  const { S, P, at, to, set, clip, words, sfx, span, enter, leave, titleIn, sweep } = c;
  const { pop, fade, izq, luz, tachar, kick } = ayudas(c);
  const KICK = kick(3);

  // 1. Un plan perfecto en papel puede fallar el martes.
  {
    const x = S.martes; const [s, d] = span(x);
    const E = [["Un proveedor", "Proveedor atrasado", 0], ["una máquina", "Máquina parada", 1], ["un cliente", "Cliente cambia la fecha", 2]];
    clip("e-martes", "scene", s, d, `${KICK}
      <div class="st">
        <h1 class="h md m-t">${words("Un plan perfecto en papel…")}</h1>
        <div class="panel plan"><small class="pl">Plan de la semana</small>${gantt(c, "g1", { filas: [["Compras", [[0, 22], [26, 48]]], ["Línea 1", [[10, 46], [50, 88]]], ["Despacho", [[52, 70], [76, 96]]]], t0: x.voiceAt + 0.4 })}<div class="dias"><span>Lun</span><span class="mar">Mar</span><span>Mié</span><span>Jue</span><span>Vie</span></div></div>
        <div class="row evs">${E.map(([, t], i) => `<span class="chip al" id="ev${i}">${t}</span>`).join("")}</div>
      </div>`, 3);
    at("#e-martes .kick", { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 0.6 }, s + 0.3);
    titleIn("#e-martes .m-t", x.voiceAt - 0.1);
    pop("#e-martes .plan", x.voiceAt + 0.2);
    to("#e-martes .mar", { color: "#ff8a3d", scale: 1.3, duration: 0.3 }, P(x, "el martes"));
    E.forEach(([k], i) => {
      const t = P(x, k);
      pop(`#ev${i}`, t);
      to(`#g1 .gr:nth-child(${i + 1}) i:last-child`, { background: "linear-gradient(90deg,#c2561a,#ff8a3d)", x: 50, duration: 0.5, ease: "power2.inOut" }, t + 0.1);
      sfx(`1${i}`, "hit.wav", t, 0.14);
    });
    leave("e-martes", s + d);
  }

  // 2. No se conforma con un solo cálculo: estocásticos y Monte Carlo.
  {
    const x = S.azar; const [s, d] = span(x);
    const tE = P(x, "Usa métodos"), tM = P(x, "Montecarlo");
    clip("e-azar", "scene", s, d, `${KICK}
      <div class="st">
        <div class="panel card uno"><small>Un solo cálculo</small>${curva(c, "cv2", { w: 520, h: 150, puntos: [3, 4, 4.5, 5, 6, 6.5, 7.5, 8], t0: x.voiceAt + 0.2 })}</div>
        <div class="row mts"><span class="chip" id="mt0">Métodos estocásticos · el azar en el modelo</span><span class="chip" id="mt1">Simulación Monte Carlo</span></div>
      </div>`, 3);
    enter("e-azar", s);
    pop("#e-azar .uno", x.voiceAt);
    to("#e-azar .uno", { opacity: 0.35, scale: 0.85, duration: 0.5 }, tE - 0.3);
    pop("#mt0", tE); luz("#mt0", P(x, "el azar"));
    pop("#mt1", tM); luz("#mt1", tM + 0.3);
    sfx("2a", "pop.mp3", tE, 0.15); sfx("2b", "pop.mp3", tM, 0.15);
    leave("e-azar", s + d);
  }

  // 3. Monte Carlo: el mismo cálculo miles de veces.
  {
    const x = S.dados; const [s, d] = span(x);
    const tM = P(x, "miles de veces"), tD = P(x, "tirar los dados");
    clip("e-dados", "scene", s, d, `${KICK}
      <div class="st">
        <div class="cont"><b class="nsc">${["1", "10", "100", "500", "1.000", "2.500", "5.000", "10.000"].map((n, i) => `<em id="ns${i}">${n}</em>`).join("")}</b><span>escenarios simulados</span></div>
        <div class="panel vz mcw">${montecarlo(c, "mc3", { w: 1100, h: 460, n: 60, t0: x.voiceAt + 0.3, dur: d - 2.2, seed: 31 })}<p class="vl">Cada línea, un escenario · a la derecha, cuántas veces sale cada resultado</p></div>
      </div>`, 3);
    enter("e-dados", s);
    fade("#e-dados .cont", x.voiceAt);
    pop("#e-dados .mcw", x.voiceAt + 0.1);
    const N = [1, 10, 100, 500, 1000, 2500, 5000, 10000];
    N.forEach((_, i) => { const t = tM - 0.6 + i * ((tD - tM + 1.2) / N.length); if (i) set(`#ns${i - 1}`, { display: "none" }, t); set(`#ns${i}`, { display: "inline" }, t); });
    sfx("3a", "whoosh-short.mp3", tM, 0.2);
    leave("e-dados", s + d);
  }

  // 4. Cada alternativa se vuelve un rango.
  {
    const x = S.rango; const [s, d] = span(x);
    const R = [["Opción A", 18, 82, 55], ["Opción B", 38, 70, 56], ["Opción C", 8, 92, 62]];
    const tR = P(x, "un rango"), tP = P(x, "lo más probable"), tB = P(x, "el mejor caso"), tW = P(x, "el peor caso");
    clip("e-rango", "scene", s, d, `${KICK}
      <div class="st">
        <h2 class="h md r-t">${words("De un número a un rango.")}</h2>
        <div class="panel rangos">
          <div class="leyenda"><span id="lg0">Peor caso</span><span id="lg1">Más probable</span><span id="lg2">Mejor caso</span></div>
          ${R.map(([n, a, b, m], i) => `<div class="rg"><span>${n}</span><div class="rt"><i class="rb" style="left:${a}%;width:${b - a}%"></i><i class="rm" style="left:${m}%"></i><i class="r1" style="left:${m}%"></i></div></div>`).join("")}
        </div>
      </div>`, 3);
    enter("e-rango", s);
    titleIn("#e-rango .r-t", x.voiceAt);
    pop("#e-rango .rangos", x.voiceAt + 0.3);
    at("#e-rango .r1", { opacity: 0 }, { opacity: 1, duration: 0.3, stagger: 0.1 }, x.voiceAt + 0.6);
    to("#e-rango .r1", { opacity: 0, duration: 0.3 }, tR - 0.2);
    at("#e-rango .rb", { scaleX: 0 }, { scaleX: 1, transformOrigin: "50% 50%", duration: 0.7, stagger: 0.15, ease: "power2.out" }, tR);
    at("#e-rango .rm", { opacity: 0, scale: 0 }, { opacity: 1, scale: 1, duration: 0.4, stagger: 0.1, ease: "back.out(2)" }, tP);
    fade("#lg1", tP); fade("#lg2", tB); fade("#lg0", tW);
    sfx("4a", "whoosh-short.mp3", tR, 0.18);
    leave("e-rango", s + d);
  }

  // 5. Monte Carlo genera escenarios, evalúa riesgos, sensibilidad y robustez; también dentro de la optimización.
  {
    const x = S.robustez; const [s, d] = span(x);
    const C = [["genera escenarios", "Genera escenarios"], ["evalúa riesgos", "Evalúa riesgos"], ["sensible", "Sensibilidad"], ["compara su robustez", "Robustez"]];
    const V = [["Retraso del proveedor", 92], ["Paro de una máquina", 64], ["Cambio de fecha", 38]];
    const tS = P(x, "sensible"), tO = P(x, "dentro de la optimización");
    clip("e-rob", "scene", s, d, `${KICK}
      <div class="st">
        <div class="row caps">${C.map(([, t], i) => `<span class="chip" id="ca${i}">${t}</span>`).join("")}</div>
        <div class="panel sens"><small>¿A qué es más sensible el plan?</small>${V.map(([n, v], i) => `<div class="bar"><span>${n}</span><i class="${i === 0 ? "al" : ""}" style="--n:${v}"></i></div>`).join("")}</div>
        <span class="chip on oi">Optimización bajo incertidumbre</span>
      </div>`, 3);
    enter("e-rob", s);
    C.forEach(([k], i) => { pop(`#ca${i}`, P(x, k) - 0.1); luz(`#ca${i}`, P(x, k) + 0.2); });
    pop("#e-rob .sens", tS - 0.2);
    at("#e-rob .sens i", { scaleX: 0 }, { scaleX: 1, duration: 0.7, stagger: 0.12, ease: "power2.out" }, tS + 0.2);
    pop("#e-rob .oi", tO);
    C.forEach(([k], i) => sfx(`5${i}`, "pop.mp3", P(x, k), 0.12));
    sfx("5x", "spark.wav", tO, 0.2);
    leave("e-rob", s + d);
  }

  // 6. El pedido del lunes: qué opciones aguantan un retraso.
  {
    const x = S.lunes; const [s, d] = span(x);
    const O = [["Opción A", "Aguanta un retraso", true], ["Opción B", "No lo aguanta", false], ["Opción C", "Aguanta un retraso", true]];
    clip("e-lunes", "scene", s, d, `${KICK}
      <div class="st">
        <h2 class="h md l-t">${words("El pedido del lunes.")}</h2>
        <div class="row aguanta">${O.map(([n, t, ok], i) => `<div class="panel card ${ok ? "on" : "no"}" id="ag${i}"><b>${n}</b><span><em>${ok ? "✓" : "✕"}</em> ${t}</span></div>`).join("")}</div>
      </div>`, 3);
    enter("e-lunes", s);
    titleIn("#e-lunes .l-t", x.voiceAt);
    O.forEach((_, i) => pop(`#ag${i}`, P(x, "aguantan") + i * 0.25));
    to("#ag1", { opacity: 0.6, duration: 0.4 }, P(x, "cuáles no"));
    sfx("6a", "pop.mp3", P(x, "aguantan"), 0.15);
    leave("e-lunes", s + d);
  }

  cierre(c, S.cierre);
  [S.azar, S.dados, S.rango, S.robustez, S.lunes, S.cierre].forEach((x) => sweep(x.start));
}
