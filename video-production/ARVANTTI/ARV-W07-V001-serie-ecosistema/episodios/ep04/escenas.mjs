// Episodio 4 · Arvantti Fractal (guion aprobado por Andy, ajustado el 2026-11-24 con la matriz técnica).
export const ESCENAS = [
  { id: "elegir", dir: "01-elegir", lead: 1.4, tail: 1.0 },
  { id: "fractal", dir: "02-fractal", lead: 0.4, tail: 1.2 },
  { id: "metodos", dir: "03-metodos", lead: 0.3, tail: 1.3 },
  { id: "montecarlo", dir: "04-montecarlo", lead: 0.3, tail: 1.3 },
  { id: "modulos", dir: "05-modulos", lead: 0.3, tail: 1.3 },
  { id: "junta", dir: "06-junta", lead: 0.3, tail: 1.4 },
  { id: "cierre", dir: "07-cierre", lead: 0.9, tail: 4.5, sinSubtitulos: true },
];

import { red, caminos, pareto, montecarlo } from "../../viz.mjs";
import { ayudas, cierre, opciones, animarOpciones, familias } from "../../comun.mjs";

export function componerEpisodio(c) {
  const { S, P, at, to, clip, words, sfx, span, enter, leave, titleIn, sweep, VERT } = c;
  const { pop, fade, luz, kick } = ayudas(c);
  const KICK = kick(4);

  // 1. Hay que elegir.
  {
    const x = S.elegir; const [s, d] = span(x);
    const O = [["más turnos", "¿Más turnos?"], ["más inventario", "¿Más inventario?"], ["otro proveedor", "¿Otro proveedor?"], ["otra secuencia", "¿Otra secuencia?"]];
    clip("e-ele", "scene", s, d, `${KICK}
      <div class="st">
        <h1 class="h xl e-t">${words("Hay que elegir.")}</h1>
        <div class="row elec">${O.map(([, t], i) => `<span class="chip grande" id="el${i}">${t}</span>`).join("")}</div>
      </div>`, 3);
    at("#e-ele .kick", { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 0.6 }, s + 0.3);
    titleIn("#e-ele .e-t", P(x, "hay que elegir") - 0.1, 0.12);
    O.forEach(([k], i) => pop(`#el${i}`, P(x, k) - 0.1));
    O.forEach(([k], i) => sfx(`1${i}`, "pop.mp3", P(x, k), 0.12));
    leave("e-ele", s + d);
  }

  // 2. Fractal: motor de optimización y apoyo a la decisión; no decide por ti.
  {
    const x = S.fractal; const [s, d] = span(x);
    clip("e-fr", "scene", s, d, `
      <div class="fondo-red">${red(c, "red2", { w: 1600, h: 900, capas: [5, 8, 9, 8, 5], t0: s + 0.3, dur: d - 1.2, seed: 21 })}</div>
      <div class="st">
        <img class="marca fm" src="assets/clips/marca.png" alt="">
        <h1 class="h xl ti">Arvantti Fractal</h1>
        <p class="sub mo">Motor de optimización y apoyo a la decisión</p>
        <div class="row td2"><span class="chip nd">No decide por ti</span><span class="chip on tu">Tú decides</span></div>
      </div>`, 3);
    enter("e-fr", s);
    at("#e-fr .fm", { opacity: 0, scale: 0.5 }, { opacity: 1, scale: 1, duration: 0.8, ease: "back.out(1.6)" }, x.voiceAt - 0.3);
    at("#e-fr h1", { opacity: 0, letterSpacing: "30px", filter: "blur(10px)" }, { opacity: 1, letterSpacing: "-3px", filter: "blur(0px)", duration: 1, ease: "power3.out" }, x.voiceAt);
    fade("#e-fr .mo", P(x, "el motor"));
    pop("#e-fr .nd", P(x, "No decide"));
    pop("#e-fr .tu", P(x, "para que tú"));
    sfx("2a", "whoosh-short.mp3", x.voiceAt, 0.2); sfx("2b", "spark.wav", P(x, "para que tú"), 0.18);
    leave("e-fr", s + d);
  }

  // 3. Primero las reglas; después la combinación de métodos con varios objetivos.
  {
    const x = S.metodos; const [s, d] = span(x);
    const tD = P(x, "Después combina"), tV = P(x, "varios objetivos");
    const FK = ["inteligencia artificial", "optimización matemática", "algoritmos genéticos", "métodos estocásticos"];
    clip("e-met", "scene", s, d, `${KICK}
      <div class="st">
        <span class="chip on rg">1 · Incorpora tus reglas</span>
        ${familias("fa3")}
        <div class="row mv">
          <div class="panel vz">${caminos(c, "cm3", { w: 560, h: 300, cols: 6, filas: 4, explorar: 12, mejores: 3, t0: tD + 0.4, dur: 3, seed: 11 })}<small>Busca mejores planes</small></div>
          <div class="panel vz">${pareto(c, "pr3", { w: 520, h: 300, t0: tV - 0.2 })}<small>Varios objetivos a la vez</small></div>
        </div>
      </div>`, 3);
    enter("e-met", s);
    pop("#e-met .rg", P(x, "Primero incorpora"));
    at("#fa3 .chip", { opacity: 0 }, { opacity: 0.35, duration: 0.2 }, tD - 0.2);
    FK.forEach((k, i) => { to(`#fa3-${i}`, { opacity: 1, duration: 0.2 }, P(x, k)); luz(`#fa3-${i}`, P(x, k) + 0.2); });
    pop("#e-met .mv .vz:first-child", tD + 0.2); pop("#e-met .mv .vz:last-child", tV - 0.3);
    sfx("3a", "pop.mp3", P(x, "Primero incorpora"), 0.15);
    FK.forEach((k, i) => sfx(`3${i}`, "pop.mp3", P(x, k), 0.1));
    leave("e-met", s + d);
  }

  // 4. Montecarlo: probabilidad de cumplir, variabilidad y peores casos; las mejores opciones encontradas.
  {
    const x = S.montecarlo; const [s, d] = span(x);
    const R = [["Opción A", 18, 82, 55, "78%"], ["Opción B", 38, 70, 56, "91%"], ["Opción C", 8, 92, 62, "64%"]];
    const C = [["probabilidad de cumplir", "Prob. de cumplir"], ["cuánto varía", "Variabilidad"], ["peores casos", "Peores casos"]];
    const tN = P(x, "No promete");
    clip("e-mc", "scene", s, d, `${KICK}
      <div class="st">
        <div class="row mcr">
          <div class="panel vz">${montecarlo(c, "mc4", { w: 620, h: 330, n: 50, t0: x.voiceAt + 0.4, dur: 3.5, seed: 31 })}<small>Numerosos escenarios inciertos</small></div>
          <div class="panel rangos">${R.map(([n, a, b, m, q]) => `<div class="rg"><span>${n}</span><div class="rt"><i class="rb" style="left:${a}%;width:${b - a}%"></i><i class="rm" style="left:${m}%"></i></div><b class="pq">${q}</b></div>`).join("")}</div>
        </div>
        <div class="row caps">${C.map(([, t], i) => `<span class="chip" id="cp${i}">${t}</span>`).join("")}</div>
        <span class="chip on mej">Las mejores opciones que encontró</span>
      </div>`, 3);
    enter("e-mc", s);
    pop("#e-mc .mcr .vz", x.voiceAt);
    pop("#e-mc .rangos", P(x, "cada alternativa") - 0.2);
    at("#e-mc .rb", { scaleX: 0 }, { scaleX: 1, transformOrigin: "50% 50%", duration: 0.6, stagger: 0.15 }, P(x, "cada alternativa"));
    at("#e-mc .rm", { opacity: 0 }, { opacity: 1, duration: 0.3, stagger: 0.1 }, P(x, "cada alternativa") + 0.5);
    at("#e-mc .pq", { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.35, stagger: 0.12 }, P(x, "probabilidad de cumplir"));
    C.forEach(([k], i) => { pop(`#cp${i}`, P(x, k) - 0.1); luz(`#cp${i}`, P(x, k) + 0.3); });
    pop("#e-mc .mej", tN + 0.6);
    sfx("4a", "whoosh-short.mp3", x.voiceAt, 0.18);
    C.forEach(([k], i) => sfx(`4${i}`, "pop.mp3", P(x, k), 0.1));
    leave("e-mc", s + d);
  }

  // 5. Un núcleo, tres módulos junto a su producto.
  {
    const x = S.modulos; const [s, d] = span(x);
    const M = [["Industrial", "Fractal Industrial", "en el gemelo"], ["Process", "Fractal Process", "en Arvantti OS"], ["Finance", "Fractal Finance", "en Arvantti OS Enterprise"]];
    clip("e-mods", "scene", s, d, `${KICK}
      <div class="st">
        <div class="nuc-f"><b>Núcleo</b><small>Fractal</small></div>
        <div class="row tri">${M.map(([, n, p], i) => `<div class="panel card" id="fm${i}"><b>${n}</b><small>${p}</small></div>`).join("")}</div>
      </div>`, 3);
    enter("e-mods", s);
    pop("#e-mods .nuc-f", P(x, "Un núcleo"));
    M.forEach(([k], i) => { pop(`#fm${i}`, P(x, k) - 0.1); to(`#fm${i}`, { borderColor: "#4ea7ff", boxShadow: "0 0 50px #2d7ff988", duration: 0.3 }, P(x, k) + 0.3); });
    M.forEach(([k], i) => sfx(`5${i}`, "pop.mp3", P(x, k), 0.12));
    leave("e-mods", s + d);
  }

  // 6. Para la junta: capacidad, procesos y caja en un solo cálculo; la junta decide.
  {
    const x = S.junta; const [s, d] = span(x);
    clip("e-jun", "scene", s, d, `${KICK}
      <div class="st">
        <h2 class="h md j-t">${words("Capacidad, procesos y caja en un solo cálculo")}</h2>
        ${opciones("op6", [["Alternativa A", [85, 55, 60], "Más turnos"], ["Alternativa B", [70, 80, 72], "Más inventario"], ["Alternativa C", [62, 66, 88], "Otro proveedor"]], [["Capacidad"], ["Procesos"], ["Caja"]])}
        <span class="chip on ld">La junta decide</span>
      </div>`, 3);
    enter("e-jun", s);
    titleIn("#e-jun .j-t", P(x, "compara") - 0.1, 0.05);
    animarOpciones(c, "op6", P(x, "las alternativas"), P(x, "un solo cálculo"));
    pop("#e-jun .ld", P(x, "para que la junta"));
    sfx("6a", "pop.mp3", P(x, "las alternativas"), 0.15); sfx("6b", "spark.wav", P(x, "para que la junta"), 0.18);
    leave("e-jun", s + d);
  }

  cierre(c, S.cierre);
  [S.fractal, S.metodos, S.montecarlo, S.modulos, S.junta, S.cierre].forEach((x) => sweep(x.start));
  void VERT;
}
