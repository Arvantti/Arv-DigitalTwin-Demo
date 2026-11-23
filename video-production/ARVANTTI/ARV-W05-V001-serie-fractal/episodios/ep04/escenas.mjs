// Episodio 4 · Fractal Industrial: ¿la planta alcanza? (guion aprobado por Andy el 2026-11-23).
export const ESCENAS = [
  { id: "pregunta", dir: "01-pregunta", lead: 1.4, tail: 1.0 },
  { id: "industrial", dir: "02-industrial", lead: 0.3, tail: 1.0 },
  { id: "gemelo", dir: "03-gemelo", lead: 0.3, tail: 1.0 },
  { id: "reglas", dir: "04-reglas", lead: 0.3, tail: 1.0 },
  { id: "alternativas", dir: "05-alternativas", lead: 0.3, tail: 1.0 },
  { id: "solo", dir: "06-solo", lead: 0.3, tail: 1.0 },
  { id: "respuesta", dir: "07-respuesta", lead: 0.3, tail: 1.0 },
  { id: "cierre", dir: "08-cierre", lead: 0.9, tail: 4.5, sinSubtitulos: true },
];

import { barras, gantt } from "../../viz.mjs";
import { ayudas, cierre } from "../../comun.mjs";

export function componerEpisodio(c) {
  const { S, P, at, to, clip, words, sfx, span, enter, leave, titleIn, sweep } = c;
  const { pop, fade, izq, luz, kick } = ayudas(c);
  const KICK = kick(4);

  // 1. ¿La planta alcanza?
  {
    const x = S.pregunta; const [s, d] = span(x);
    const tJ = P(x, "El jefe");
    clip("e-preg", "scene", s, d, `${KICK}
      <div class="st">
        <span class="chip parte">Parte 1 de la respuesta · La planta</span>
        <h1 class="h xl q">${words("¿La planta alcanza?")}</h1>
        <div class="panel card jefe"><small>Jefe de planta</small><span>No quiere adivinar</span></div>
      </div>`, 3);
    at("#e-preg .kick", { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 0.6 }, s + 0.3);
    pop("#e-preg .parte", x.voiceAt);
    titleIn("#e-preg .q", P(x, "¿la planta") - 0.1, 0.15);
    pop("#e-preg .jefe", tJ);
    sfx("1a", "hit.wav", P(x, "¿la planta"), 0.22);
    leave("e-preg", s + d);
  }

  // 2. Fractal Industrial, en el gemelo digital.
  {
    const x = S.industrial; const [s, d] = span(x);
    const tF = P(x, "Fractal Industrial"), tG = P(x, "el gemelo");
    clip("e-ind", "scene", s, d, `${KICK}
      <div class="st">
        <h1 class="h xl ti fi">Fractal Industrial</h1>
        <div class="row par2">
          <div class="panel card on" id="pi0"><small>Módulo de Fractal</small><b>Industrial</b></div>
          <svg class="enlace" viewBox="0 0 200 20"><line x1="0" y1="10" x2="200" y2="10" pathLength="1"/></svg>
          <div class="panel card" id="pi1"><small>Va en</small><b>Arvantti Digital Twin</b></div>
        </div>
      </div>`, 3);
    enter("e-ind", s);
    at("#e-ind .fi", { opacity: 0, letterSpacing: "30px", filter: "blur(12px)" }, { opacity: 1, letterSpacing: "-3px", filter: "blur(0px)", duration: 1, ease: "power3.out" }, tF - 0.2);
    at("#e-ind .fi", { backgroundPosition: "-200% 0" }, { backgroundPosition: "200% 0", duration: 2, ease: "power1.inOut" }, tF + 0.8);
    pop("#pi0", P(x, "el módulo"));
    at("#e-ind .enlace line", { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.6 }, tG - 0.3);
    pop("#pi1", tG);
    sfx("2a", "hit.wav", tF, 0.25); sfx("2b", "pop.mp3", tG, 0.15);
    leave("e-ind", s + d);
  }

  // 3. El gemelo: copia viva de la planta.
  {
    const x = S.gemelo; const [s, d] = span(x);
    const EQ = [["Mezcla", [70, 85, 60, 90]], ["Línea 1", [80, 95, 88, 72]], ["Línea 2", [55, 62, 70, 58]], ["Empaque", [65, 78, 82, 74]]];
    const tE = P(x, "qué equipos"), tC = P(x, "qué capacidad"), tP = P(x, "qué se está");
    clip("e-gem", "scene", s, d, `${KICK}
      <div class="st">
        <h2 class="h md g-t">${words("Una copia viva de la planta.")}</h2>
        <div class="planta">${EQ.map(([n, v], i) => `<div class="panel eq" id="eq${i}"><b>${n}</b><div class="mini">${barras(c, `gb${i}`, { valores: v, t0: tC + i * 0.15 })}</div><span class="vivo"><i></i>Produciendo</span></div>${i < EQ.length - 1 ? `<span class="flecha fl${i}">→</span>` : ""}`).join("")}</div>
        <div class="row tg"><span class="tag" id="tg0">Equipos</span><span class="tag" id="tg1">Capacidad</span><span class="tag" id="tg2">Producción ahora</span></div>
      </div>`, 3);
    enter("e-gem", s);
    titleIn("#e-gem .g-t", x.voiceAt);
    at("#e-gem .eq", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.18, ease: "power3.out" }, tE - 0.2);
    at("#e-gem .flecha", { opacity: 0 }, { opacity: 1, duration: 0.3, stagger: 0.18 }, tE + 0.2);
    pop("#tg0", tE); pop("#tg1", tC); pop("#tg2", tP);
    at("#e-gem .vivo", { opacity: 0 }, { opacity: 1, duration: 0.3, stagger: 0.1 }, tP);
    at("#e-gem .vivo i", { opacity: 0.3 }, { opacity: 1, duration: 0.5, yoyo: true, repeat: 7, ease: "sine.inOut" }, tP);
    sfx("3a", "pop.mp3", tE, 0.15); sfx("3b", "pop.mp3", tP, 0.15);
    leave("e-gem", s + d);
  }

  // 4. Usa el modelo y tus reglas de producción.
  {
    const x = S.reglas; const [s, d] = span(x);
    const R = [["secuencias", "Secuencias"], ["cambios entre", "Cambios entre productos"], ["turnos", "Turnos"], ["inventario", "Inventario"]];
    const tP = P(x, "Primero las reglas"), tO = P(x, "después optimiza");
    clip("e-reg", "scene", s, d, `${KICK}
      <div class="st">
        <div class="row dos">
          <div class="panel card mod"><small>Modelo del gemelo</small><b>Tu planta</b></div>
          <span class="flecha">+</span>
          <div class="panel card mod"><small>Tus reglas de producción</small><div class="rgs">${R.map(([, t], i) => `<span class="chip" id="rr${i}">${t}</span>`).join("")}</div></div>
        </div>
        <div class="row pas"><span class="chip" id="pa0">1 · Primero las reglas</span><span class="flecha" id="pa1">→</span><span class="chip" id="pa2">2 · Después optimiza</span></div>
      </div>`, 3);
    enter("e-reg", s);
    at("#e-reg .mod, #e-reg .dos>.flecha", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.2 }, x.voiceAt);
    R.forEach(([k], i) => { pop(`#rr${i}`, P(x, k)); });
    pop("#pa0", tP); luz("#pa0", tP + 0.2); fade("#pa1", tO - 0.3); pop("#pa2", tO); luz("#pa2", tO + 0.3);
    R.forEach(([k], i) => sfx(`4${i}`, "pop.mp3", P(x, k), 0.1));
    leave("e-reg", s + d);
  }

  // 5. Compara alternativas y muestra el cuello de botella en cada una.
  {
    const x = S.alternativas; const [s, d] = span(x);
    const A = [
      ["meter el pedido", "Todo esta semana", [["Línea 1", [[0, 45], [48, 100]]], ["Línea 2", [[0, 50], [55, 80]]], ["Empaque", [[30, 70], [72, 100]]]], 0],
      ["partirlo en dos", "Partir el pedido", [["Línea 1", [[0, 40], [44, 70]]], ["Línea 2", [[0, 38], [42, 74]]], ["Empaque", [[30, 62], [66, 88]]]], 2],
      ["sumar un turno", "Sumar un turno", [["Línea 1", [[0, 35], [38, 66]]], ["Línea 2", [[0, 46], [50, 78]]], ["Empaque", [[24, 58], [60, 92]]]], 2],
    ];
    const tB = P(x, "cuello de botella");
    clip("e-alt", "scene", s, d, `${KICK}
      <div class="st">
        <h2 class="h md a-t">${words("Compara alternativas.")}</h2>
        <div class="alts">${A.map(([, n, f, cu], i) => `<div class="panel alt" id="al${i}"><b>${n}</b>${gantt(c, `ga${i}`, { filas: f, cuello: cu, t0: P(x, A[i][0]) + 0.2 })}<span class="cb-l">Cuello de botella</span></div>`).join("")}</div>
      </div>`, 3);
    enter("e-alt", s);
    titleIn("#e-alt .a-t", x.voiceAt);
    A.forEach(([k], i) => pop(`#al${i}`, P(x, k) - 0.1));
    at("#e-alt .gt i", { background: "linear-gradient(90deg,#2d7ff9,#4ea7ff)" }, { background: "linear-gradient(90deg,#2d7ff9,#4ea7ff)", duration: 0.01 }, s);
    at("#e-alt .gt i.al", { background: "linear-gradient(90deg,#2d7ff9,#4ea7ff)", boxShadow: "0 0 0px #ff8a3d00" }, { background: "linear-gradient(90deg,#c2561a,#ff8a3d)", boxShadow: "0 0 20px #ff8a3d88", duration: 0.4, stagger: 0.25 }, tB);
    at("#e-alt .cb-l", { opacity: 0 }, { opacity: 1, duration: 0.3, stagger: 0.25 }, tB + 0.2);
    A.forEach(([k], i) => sfx(`5${i}`, "pop.mp3", P(x, k), 0.12));
    sfx("5x", "hit.wav", tB, 0.18);
    leave("e-alt", s + d);
  }

  // 6. El gemelo solo observa, simula y recomienda.
  {
    const x = S.solo; const [s, d] = span(x);
    const V = [["observa", "Observa"], ["simula", "Simula"], ["recomienda", "Recomienda"]];
    const tN = P(x, "No mueve");
    clip("e-solo", "scene", s, d, `${KICK}
      <div class="st">
        <div class="row verbos">${V.map(([, t], i) => `<span class="chip" id="vb${i}">${t}</span>`).join("")}</div>
        <div class="panel card nomueve"><i class="candado">🔒</i><b>No mueve nada en la planta</b></div>
      </div>`, 3);
    enter("e-solo", s);
    V.forEach(([k], i) => { pop(`#vb${i}`, P(x, k) - 0.05); luz(`#vb${i}`, P(x, k) + 0.2); });
    pop("#e-solo .nomueve", tN);
    V.forEach(([k], i) => sfx(`6${i}`, "pop.mp3", P(x, k), 0.12));
    leave("e-solo", s + d);
  }

  // 7. La respuesta del jefe de planta.
  {
    const x = S.respuesta; const [s, d] = span(x);
    const tA = P(x, "sí alcanza"), tM = P(x, "movemos");
    clip("e-resp", "scene", s, d, `${KICK}
      <div class="st">
        <div class="panel cita"><small>Respuesta del jefe de planta</small><p>“Sí alcanza, si partimos el pedido y movemos dos órdenes al jueves.”</p></div>
        <div class="panel semana">
          <div class="dias">${["Lun", "Mar", "Mié", "Jue", "Vie"].map((d) => `<span>${d}</span>`).join("")}</div>
          <div class="pista"><i class="blk ped" style="left:0%;width:38%">Pedido · parte 1</i><i class="blk ped" style="left:40%;width:18%">Parte 2</i></div>
          <div class="pista"><i class="blk ord" id="o0" style="left:41%;width:9%">Orden 1</i><i class="blk ord" id="o1" style="left:51%;width:9%">Orden 2</i></div>
        </div>
      </div>`, 3);
    enter("e-resp", s);
    fade("#e-resp .cita small", x.voiceAt);
    at("#e-resp .cita p", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.7, ease: "power3.out" }, tA - 0.2);
    pop("#e-resp .semana", tA - 0.1);
    at("#e-resp .ped", { scaleX: 0, transformOrigin: "0% 50%" }, { scaleX: 1, duration: 0.5, stagger: 0.25 }, P(x, "partimos"));
    to("#o0", { left: "60.5%", duration: 0.8, ease: "power2.inOut" }, tM + 0.2);
    to("#o1", { left: "70%", duration: 0.8, ease: "power2.inOut" }, tM + 0.4);
    sfx("7a", "spark.wav", tA, 0.2); sfx("7b", "whoosh-short.mp3", tM, 0.18);
    leave("e-resp", s + d);
  }

  cierre(c, S.cierre);
  [S.industrial, S.gemelo, S.reglas, S.alternativas, S.solo, S.respuesta, S.cierre].forEach((x) => sweep(x.start));
}
