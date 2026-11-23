// Episodio 5 · Fractal Process en Arvantti OS (guion aprobado por Andy el 2026-11-23).
export const ESCENAS = [
  { id: "flujo", dir: "01-flujo", lead: 1.4, tail: 1.0 },
  { id: "process", dir: "02-process", lead: 0.3, tail: 1.0 },
  { id: "os", dir: "03-os", lead: 0.3, tail: 1.0 },
  { id: "reglas", dir: "04-reglas", lead: 0.3, tail: 1.0 },
  { id: "material", dir: "05-material", lead: 0.3, tail: 1.0 },
  { id: "comprobante", dir: "06-comprobante", lead: 0.3, tail: 1.0 },
  { id: "cierre", dir: "07-cierre", lead: 0.9, tail: 4.5, sinSubtitulos: true },
];

import { red } from "../../viz.mjs";
import { ayudas, opciones, animarOpciones, cierre } from "../../comun.mjs";

const PASOS = ["Confirmar", "Comprar material", "Programar", "Producir", "Despachar"];
const flujo = (id) => `<div class="flujo5" id="${id}"><svg class="linea" viewBox="0 0 100 4" preserveAspectRatio="none"><line x1="0" y1="2" x2="100" y2="2" pathLength="1"/></svg>${PASOS.map((p, i) => `<div class="panel paso" id="${id}-${i}"><em>${i + 1}</em><b>${p}</b></div>`).join("")}</div>`;

export function componerEpisodio(c) {
  const { S, P, at, to, clip, words, sfx, span, enter, leave, titleIn, sweep } = c;
  const { pop, fade, izq, luz, kick } = ayudas(c);
  const KICK = kick(5);

  // 1. Del pedido al camión hay un proceso.
  {
    const x = S.flujo; const [s, d] = span(x);
    const K = ["confirmar", "comprar material", "programar", "producir", "despachar"];
    const tC = P(x, "Cada paso");
    clip("e-flujo", "scene", s, d, `${KICK}
      <div class="st">
        <span class="chip on ok">✓ La planta alcanza</span>
        <h2 class="h md f-t">${words("Del pedido al camión hay un proceso.")}</h2>
        ${flujo("f1")}
        <div class="row tg"><span class="tag" id="tg0">Cada paso tiene su gente</span><span class="tag" id="tg1">y sus tiempos</span></div>
      </div>`, 3);
    at("#e-flujo .kick", { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 0.6 }, s + 0.3);
    pop("#e-flujo .ok", x.voiceAt);
    titleIn("#e-flujo .f-t", P(x, "Pero"));
    at("#f1 .linea line", { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 2.4, ease: "power1.inOut" }, P(x, K[0]) - 0.2);
    K.forEach((k, i) => { pop(`#f1-${i}`, P(x, k) - 0.1); sfx(`1${i}`, "pop.mp3", P(x, k), 0.1); });
    pop("#tg0", tC); pop("#tg1", P(x, "sus tiempos"));
    leave("e-flujo", s + d);
  }

  // 2. Fractal Process, el optimizador de Arvantti OS.
  {
    const x = S.process; const [s, d] = span(x);
    const tF = P(x, "Fractal Process");
    clip("e-proc", "scene", s, d, `${KICK}
      <div class="st">
        <h1 class="h xl ti fp">Fractal Process</h1>
        <span class="chip on op">El optimizador de Arvantti OS</span>
      </div>`, 3);
    enter("e-proc", s);
    at("#e-proc .fp", { opacity: 0, letterSpacing: "30px", filter: "blur(12px)" }, { opacity: 1, letterSpacing: "-3px", filter: "blur(0px)", duration: 1, ease: "power3.out" }, tF - 0.2);
    at("#e-proc .fp", { backgroundPosition: "-200% 0" }, { backgroundPosition: "200% 0", duration: 2, ease: "power1.inOut" }, tF + 0.8);
    pop("#e-proc .op", P(x, "el optimizador"));
    sfx("2a", "hit.wav", tF, 0.25);
    leave("e-proc", s + d);
  }

  // 3. Arvantti OS prepara, aplica permisos y deja registro; Fractal Process calcula.
  {
    const x = S.os; const [s, d] = span(x);
    const F = [["Prepara", "Prepara el contexto"], ["aplica", "Aplica los permisos"], ["deja registro", "Deja registro"]];
    const tK = P(x, "Fractal Process calcula");
    clip("e-os", "scene", s, d, `${KICK}
      <div class="st"><div class="row dos">
        <div class="panel card osb"><small>Sistema operativo empresarial para la IA</small><b>Arvantti OS</b>${F.map(([, t], i) => `<span class="it" id="it${i}">✓ ${t}</span>`).join("")}</div>
        <div class="panel card calc"><small>Fractal Process</small>${red(c, "red5", { w: 520, h: 280, capas: [3, 5, 5, 3], t0: tK - 0.1, dur: s + d - tK, seed: 12 })}<b class="cl">Calcula</b></div>
      </div></div>`, 3);
    enter("e-os", s);
    pop("#e-os .osb", x.voiceAt);
    F.forEach(([k], i) => izq(`#it${i}`, P(x, k) - 0.1));
    pop("#e-os .calc", tK - 0.3);
    fade("#e-os .cl", tK + 0.6);
    sfx("3a", "pop.mp3", tK, 0.15);
    leave("e-os", s + d);
  }

  // 4. Primero tus reglas; después analiza dónde se pierde el tiempo y cómo asignar.
  {
    const x = S.reglas; const [s, d] = span(x);
    const T = [["Confirmar", 18], ["Comprar material", 92], ["Programar", 24], ["Producir", 60], ["Despachar", 20]];
    const tA = P(x, "Después analiza"), tD = P(x, "dónde se pierde"), tS = P(x, "cómo asignar");
    clip("e-reg", "scene", s, d, `${KICK}
      <div class="st">
        <div class="row rgs"><span class="chip" id="rg0">Quién aprueba</span><span class="chip" id="rg1">Qué paso no se salta</span></div>
        <div class="panel tiempos"><small>Tiempo de cada paso</small>${T.map(([n, v], i) => `<div class="bar"><span>${n}</span><i class="${i === 1 ? "lento" : ""}" style="--n:${v}"></i></div>`).join("")}</div>
        <div class="row tg"><span class="tag" id="as0">Tareas</span><span class="tag" id="as1">Personas</span><span class="tag" id="as2">Recursos</span></div>
      </div>`, 3);
    enter("e-reg", s);
    pop("#rg0", P(x, "quién aprueba")); pop("#rg1", P(x, "qué paso"));
    luz("#e-reg .rgs .chip", tA - 0.3);
    pop("#e-reg .tiempos", tA);
    at("#e-reg .tiempos i", { scaleX: 0 }, { scaleX: 1, duration: 0.6, stagger: 0.1, ease: "power2.out" }, tA + 0.3);
    at("#e-reg .tiempos i.lento", { background: "linear-gradient(90deg,#2d7ff9,#4ea7ff)" }, { background: "linear-gradient(90deg,#c2561a,#ff8a3d)", duration: 0.4 }, tD);
    [0, 1, 2].forEach((i) => pop(`#as${i}`, tS + 0.3 + i * 0.25));
    sfx("4a", "hit.wav", tD, 0.15);
    leave("e-reg", s + d);
  }

  // 5. El material del proveedor: dos opciones con su impacto.
  {
    const x = S.material; const [s, d] = span(x);
    const tM = P(x, "esperar el material"), tO = P(x, "te presenta"), tE = P(x, "Tú eliges");
    clip("e-mat", "scene", s, d, `${KICK}
      <div class="st">
        <div class="panel card espera"><small>Lo que más demora</small><b>Esperar el material del proveedor</b></div>
        ${opciones("op5", [["Pedirlo el mismo día que se confirma", [85, 55, 45]], ["Acuerdo de suministro con el proveedor", [75, 70, 30]]], [["Entrega a tiempo"], ["Costo", "r"], ["Riesgo", "r"]])}
        <span class="chip on te">Tú eliges</span>
      </div>`, 3);
    enter("e-mat", s);
    pop("#e-mat .espera", P(x, "lo que más demora"));
    to("#e-mat .espera", { borderColor: "#ff8a3d", boxShadow: "0 0 50px #ff8a3d55", duration: 0.4 }, tM);
    to("#e-mat .espera", { scale: 0.85, opacity: 0.6, duration: 0.5 }, tO - 0.3);
    at("#op5-0", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" }, P(x, "pedir el material"));
    at("#op5-1", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" }, P(x, "o tener"));
    at("#op5-0 .bar i", { scaleX: 0 }, { scaleX: 1, duration: 0.6, stagger: 0.1 }, P(x, "pedir el material") + 0.4);
    at("#op5-1 .bar i", { scaleX: 0 }, { scaleX: 1, duration: 0.6, stagger: 0.1 }, P(x, "o tener") + 0.4);
    pop("#e-mat .te", tE);
    sfx("5a", "hit.wav", tM, 0.15); sfx("5b", "spark.wav", tE, 0.2);
    leave("e-mat", s + d);
  }

  // 6. Comprobante en Arvantti OS; la siguiente pregunta la responde Fractal Finance.
  {
    const x = S.comprobante; const [s, d] = span(x);
    const tS = P(x, "Y la siguiente"), tF = P(x, "Fractal Finance");
    clip("e-comp", "scene", s, d, `${KICK}
      <div class="st">
        <div class="panel recibo"><small>Comprobante · Arvantti OS</small>
          <div class="ln"><span>Recomendación</span><b>Pedir material el mismo día</b></div>
          <div class="ln"><span>Reglas aplicadas</span><b>Aprobación de compras</b></div>
          <div class="ln"><span>Decidió</span><b>Una persona</b></div></div>
        <div class="row sig"><span class="chip" id="sq">¿Cuánto material conviene tener?</span><span class="chip on" id="sf">Fractal Finance · próximo episodio</span></div>
      </div>`, 3);
    enter("e-comp", s);
    pop("#e-comp .recibo", x.voiceAt);
    at("#e-comp .ln", { opacity: 0, x: -20 }, { opacity: 1, x: 0, duration: 0.4, stagger: 0.3 }, x.voiceAt + 0.5);
    to("#e-comp .recibo", { scale: 0.85, opacity: 0.5, duration: 0.5 }, tS - 0.2);
    pop("#sq", tS); pop("#sf", tF);
    sfx("6a", "pop.mp3", tS, 0.15); sfx("6b", "spark.wav", tF, 0.2);
    leave("e-comp", s + d);
  }

  cierre(c, S.cierre);
  [S.process, S.os, S.reglas, S.material, S.comprobante, S.cierre].forEach((x) => sweep(x.start));
}
