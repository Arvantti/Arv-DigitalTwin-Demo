// Episodio 2 · Cómo encuentra las mejores opciones (guion aprobado por Andy el 2026-11-23).
export const ESCENAS = [
  { id: "arbol", dir: "01-arbol", lead: 1.4, tail: 1.0 },
  { id: "reglas", dir: "02-reglas", lead: 0.3, tail: 1.0 },
  { id: "ia-opt", dir: "03-ia-opt", lead: 0.3, tail: 1.0 },
  { id: "evolutivos", dir: "04-evolutivos", lead: 0.3, tail: 1.0 },
  { id: "objetivos", dir: "05-objetivos", lead: 0.3, tail: 1.0 },
  { id: "resultado", dir: "06-resultado", lead: 0.3, tail: 1.0 },
  { id: "siguiente", dir: "07-siguiente", lead: 0.3, tail: 1.0 },
  { id: "cierre", dir: "08-cierre", lead: 0.9, tail: 4.5, sinSubtitulos: true },
];

import { red, region, arbol, genetico, pareto } from "../../viz.mjs";
import { ayudas, opciones, animarOpciones, familias, cierre } from "../../comun.mjs";

export function componerEpisodio(c) {
  const { S, P, at, to, clip, words, sfx, span, enter, leave, titleIn, sweep, VERT } = c;
  const { pop, fade, izq, luz, tachar, kick } = ayudas(c);
  const KICK = kick(2);

  // 1. Muchísimas formas de producir el pedido.
  {
    const x = S.arbol; const [s, d] = span(x);
    const tC = P(x, "muchísimas"), tM = P(x, "Probarlas");
    clip("e-arbol", "scene", s, d, `${KICK}
      <div class="st">
        <h1 class="h q">${words("¿Aceptamos el pedido?")}</h1>
        <div class="arb">${arbol(c, "arb1", { w: 1000, h: 500, niveles: 6, t0: tC - 0.2, dur: 2.6, seed: 4 })}<span class="chip al am">A mano no alcanza</span></div>
        <div class="row vs">${[["cambiar turnos", "Cambiar turnos"], ["mover otros", "Mover pedidos"], ["comprar más", "Comprar material"]].map(([k, t], i) => `<span class="chip" id="vs${i}" data-k="${k}">${t}</span>`).join("")}</div>
      </div>`, 3);
    at("#e-arbol .kick", { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 0.6 }, s + 0.3);
    titleIn("#e-arbol .q", x.voiceAt - 0.1, 0.12);
    ["cambiar turnos", "mover otros", "comprar más"].forEach((k, i) => pop(`#vs${i}`, P(x, k) - 0.1));
    pop("#e-arbol .am", tM);
    to("#arb1", { opacity: 0.45, duration: 0.5 }, tM - 0.2);
    sfx("1a", "whoosh-short.mp3", tC, 0.2); sfx("1b", "hit.wav", tM, 0.2);
    leave("e-arbol", s + d);
  }

  // 2. Primero tus reglas.
  {
    const x = S.reglas; const [s, d] = span(x);
    const R = [["Qué se puede mover", "Se puede mover", "✓"], ["qué no", "No se mueve", "✕"], ["qué cliente", "Cliente primero", "1"]];
    const tA = P(x, "Primero incorpora"), tO = P(x, "optimiza");
    clip("e-reglas", "scene", s, d, `${KICK}
      <div class="st">
        <h2 class="h md r-t">${words("Primero, tus reglas.")}</h2>
        <div class="row rgs">${R.map(([, t, ic], i) => `<div class="panel card rg" id="rg${i}"><i class="ic">${ic}</i><b>${t}</b></div>`).join("")}</div>
        <div class="row pas"><span class="chip on" id="pa0">1 · Incorpora tus reglas</span><span class="flecha" id="pa1">→</span><span class="chip" id="pa2">2 · Optimiza</span></div>
      </div>`, 3);
    enter("e-reglas", s);
    titleIn("#e-reglas .r-t", P(x, "tus reglas") - 0.2);
    R.forEach(([k], i) => pop(`#rg${i}`, P(x, k) - 0.1));
    izq("#pa0", tA); fade("#pa1", tO - 0.4); pop("#pa2", tO); luz("#pa2", tO + 0.3);
    R.forEach((_, i) => sfx(`2${i}`, "pop.mp3", P(x, R[i][0]), 0.12));
    leave("e-reglas", s + d);
  }

  // 3. Familias de métodos: IA y optimización matemática.
  {
    const x = S["ia-opt"]; const [s, d] = span(x);
    const tF = P(x, "varias familias"), tI = P(x, "La inteligencia"), tO = P(x, "Y la optimización");
    clip("e-iaopt", "scene", s, d, `${KICK}
      <div class="st">
        ${familias("fa3")}
        <div class="row dos">
          <div class="panel met" id="me-ia"><small>Inteligencia artificial</small>${red(c, "red3", { w: 600, h: 330, capas: [4, 6, 6, 3], t0: tI, dur: tO - tI + 0.5, seed: 8 })}
            <div class="row lb"><span class="tag" id="li0">Entender</span><span class="tag" id="li1">Formular escenarios</span><span class="tag" id="li2">Interpretar</span></div></div>
          <div class="panel met" id="me-op"><small>Optimización matemática</small>${region(c, "reg3", { w: 520, h: 360, t0: tO + 0.3, dur: Math.max(2.5, s + d - tO - 1) })}</div>
        </div>
      </div>`, 3);
    enter("e-iaopt", s);
    at("#fa3 .chip", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.4, stagger: 0.12 }, tF);
    luz("#fa3-0", tI); luz("#fa3-1", tO);
    pop("#me-ia", tI - 0.2);
    ["entender", "formular", "interpretar"].forEach((k, i) => pop(`#li${i}`, P(x, k)));
    pop("#me-op", tO - 0.1);
    sfx("3a", "whoosh-short.mp3", tI, 0.2); sfx("3b", "pop.mp3", tO, 0.15);
    leave("e-iaopt", s + d);
  }

  // 4. Genéticos y evolutivos: población que evoluciona (no es una red neuronal).
  {
    const x = S.evolutivos; const [s, d] = span(x);
    const tG = P(x, "los algoritmos"), tN = P(x, "Es optimización"), tC = P(x, "Su valor");
    clip("e-evol", "scene", s, d, `${KICK}
      <div class="st">
        <div class="row ops3"><span class="chip" id="ev0">Selección</span><span class="chip" id="ev1">Recombinación</span><span class="chip" id="ev2">Mutación</span></div>
        <div class="panel pobw">${genetico(c, "gen4", { t0: tG - 0.2, tS: P(x, "seleccionan"), tR: P(x, "recombinan"), tM: P(x, "mutan"), tG: P(x, "generación tras"), tEnd: tC - 0.5 })}</div>
        <span class="chip on ne">Optimización evolutiva · no es una red neuronal</span>
      </div>
      <div class="st capa"><h2 class="h md cv">${words("Su valor: la combinación.")}</h2>${familias("fa4")}</div>`, 3);
    enter("e-evol", s);
    pop("#e-evol .pobw", tG - 0.3);
    [["seleccionan", 0], ["recombinan", 1], ["mutan", 2]].forEach(([k, i]) => { pop(`#ev${i}`, P(x, k)); luz(`#ev${i}`, P(x, k) + 0.2); });
    pop("#e-evol .ne", tN);
    to("#e-evol .pobw", { opacity: 0, duration: 0.4 }, tC - 0.4);
    to("#e-evol .ops3, #e-evol .ne", { opacity: 0, duration: 0.4 }, tC - 0.4);
    at("#fa4 .chip", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.4, stagger: 0.1 }, tC);
    titleIn("#e-evol .cv", tC - 0.1);
    luz("#fa4 .chip", P(x, "combinarse"));
    sfx("4a", "whoosh-short.mp3", tG, 0.2); sfx("4b", "spark.wav", P(x, "combinarse"), 0.2);
    leave("e-evol", s + d);
  }

  // 5. Varios objetivos a la vez.
  {
    const x = S.objetivos; const [s, d] = span(x);
    const O = [["cumplir", "Cumplir entregas"], ["gastar", "Menos energía"], ["cuidar", "Cuidar el margen"]];
    const tV = P(x, "Busca varios");
    clip("e-obj", "scene", s, d, `${KICK}
      <div class="st">
        <h2 class="h md o-t">${words("Varios objetivos a la vez.")}</h2>
        <div class="row dos">
          <div class="objs">${O.map(([, t], i) => `<span class="chip" id="ob${i}">${t}</span>`).join("")}</div>
          <div class="panel vz par">${pareto(c, "par5", { w: 760, h: 500, ejeX: "Menos energía", ejeY: "Entregas a tiempo", t0: tV + 0.2 })}<p class="vl">Mejores combinaciones</p></div>
        </div>
      </div>`, 3);
    enter("e-obj", s);
    titleIn("#e-obj .o-t", tV - 0.2);
    pop("#e-obj .par", tV);
    O.forEach(([k], i) => { izq(`#ob${i}`, P(x, k) - 0.1); luz(`#ob${i}`, P(x, k) + 0.2); });
    O.forEach(([k], i) => sfx(`5${i}`, "pop.mp3", P(x, k), 0.12));
    leave("e-obj", s + d);
  }

  // 6. El resultado: las mejores alternativas con su impacto.
  {
    const x = S.resultado; const [s, d] = span(x);
    const tS = P(x, "son las mejores"), tG = P(x, "lo que gana"), tE = P(x, "Tú eliges");
    clip("e-res", "scene", s, d, `${KICK}
      <div class="st">
        <div class="row nos"><span class="h md tache" id="no0">Una respuesta única</span><span class="h md tache" id="no1">El óptimo perfecto</span></div>
        ${opciones("op6", [["Opción A", [85, 40, 55], "Gana entregas · cede costo"], ["Opción B", [60, 80, 50], "Gana costo · cede tiempo"], ["Opción C", [72, 62, 78], "Equilibrada · no gana en todo"]], [["Entregas"], ["Costo"], ["Margen"]])}
        <span class="chip on te">Tú eliges según tus prioridades</span>
      </div>`, 3);
    enter("e-res", s);
    fade("#no0", P(x, "una respuesta") - 0.2); fade("#no1", P(x, "la promesa") - 0.2);
    tachar("#no0", P(x, "ni la")); tachar("#no1", tS - 0.3);
    to("#e-res .nos", { opacity: 0.35, scale: 0.8, duration: 0.5 }, tS);
    animarOpciones(c, "op6", tS + 0.1, P(x, "lo que gana"));
    at("#op6 small", { opacity: 0 }, { opacity: 1, duration: 0.4, stagger: 0.2 }, tG);
    pop("#e-res .te", tE);
    sfx("6a", "pop.mp3", tS, 0.15); sfx("6b", "spark.wav", tE, 0.2);
    leave("e-res", s + d);
  }

  // 7. Falta medir el riesgo: próximo episodio.
  {
    const x = S.siguiente; const [s, d] = span(x);
    const tP = P(x, "Eso lo vemos");
    clip("e-sig", "scene", s, d, `${KICK}
      <div class="st">
        <div class="row rsg">${["A", "B", "C"].map((n, i) => `<div class="panel card" id="sg${i}"><b>Opción ${n}</b><span class="riesgo">Riesgo <em>?</em></span></div>`).join("")}</div>
        <span class="chip on px">Próximo episodio · El riesgo</span>
      </div>`, 3);
    enter("e-sig", s);
    [0, 1, 2].forEach((i) => pop(`#sg${i}`, x.voiceAt + i * 0.2));
    at("#e-sig .riesgo em", { scale: 0.6, opacity: 0.4 }, { scale: 1.2, opacity: 1, duration: 0.5, yoyo: true, repeat: 3, ease: "sine.inOut" }, P(x, "riesgo"));
    pop("#e-sig .px", tP);
    sfx("7a", "pop.mp3", tP, 0.15);
    leave("e-sig", s + d);
  }

  cierre(c, S.cierre);
  [S.reglas, S["ia-opt"], S.evolutivos, S.objetivos, S.resultado, S.siguiente, S.cierre].forEach((x) => sweep(x.start));
}
