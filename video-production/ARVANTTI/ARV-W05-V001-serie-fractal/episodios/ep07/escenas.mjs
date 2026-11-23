// Episodio 7 · La respuesta completa y quién decide (guion aprobado por Andy el 2026-11-23).
export const ESCENAS = [
  { id: "miercoles", dir: "01-miercoles", lead: 1.4, tail: 1.0 },
  { id: "resumen", dir: "02-resumen", lead: 0.3, tail: 1.0 },
  { id: "explica", dir: "03-explica", lead: 0.3, tail: 1.0 },
  { id: "versiones", dir: "04-versiones", lead: 0.3, tail: 1.0 },
  { id: "decide", dir: "05-decide", lead: 0.3, tail: 1.0 },
  { id: "modulos", dir: "06-modulos", lead: 0.3, tail: 1.0 },
  { id: "cierre", dir: "07-cierre", lead: 0.9, tail: 4.5, sinSubtitulos: true },
];

import { red } from "../../viz.mjs";
import { ayudas, cierre } from "../../comun.mjs";

export function componerEpisodio(c) {
  const { S, P, at, to, clip, words, sfx, span, enter, leave, titleIn, sweep } = c;
  const { pop, fade, izq, luz, tachar, kick } = ayudas(c);
  const KICK = kick(7);

  // 1. Miércoles: la respuesta completa a la pregunta del lunes.
  {
    const x = S.miercoles; const [s, d] = span(x);
    clip("e-mie", "scene", s, d, `${KICK}
      <div class="st">
        <div class="cal panel"><small>Semana</small><div class="dias">${["Lun", "Mar", "Mié", "Jue", "Vie"].map((d, i) => `<span class="${i === 2 ? "hoy" : ""}">${d}</span>`).join("")}</div></div>
        <div class="panel card ger"><small>La gerente</small><b>Tiene la respuesta completa</b><span>a la pregunta del lunes: ¿lo aceptamos?</span></div>
      </div>`, 3);
    at("#e-mie .kick", { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 0.6 }, s + 0.3);
    pop("#e-mie .cal", x.voiceAt - 0.2);
    at("#e-mie .hoy", { backgroundColor: "#0d1a3000" }, { backgroundColor: "#2d7ff9", color: "#fff", duration: 0.4 }, x.voiceAt + 0.2);
    pop("#e-mie .ger", P(x, "La gerente"));
    sfx("1a", "pop.mp3", x.voiceAt, 0.15);
    leave("e-mie", s + d);
  }

  // 2. Resumen: planta, proceso y caja.
  {
    const x = S.resumen; const [s, d] = span(x);
    const R = [["La planta", "Planta", "Alcanza si partimos el pedido"], ["El material", "Proceso", "Material el mismo día: la compra ya no frena"], ["La caja", "Caja", "Se aprieta, pero un anticipo lo resuelve"]];
    clip("e-res", "scene", s, d, `${KICK}
      <div class="st"><div class="row resu">${R.map(([, t, v], i) => `<div class="panel card rs" id="rs${i}"><small>${["Fractal Industrial", "Fractal Process", "Fractal Finance"][i]}</small><b><em>✓</em> ${t}</b><span>${v}</span></div>`).join("")}</div></div>`, 3);
    enter("e-res", s);
    R.forEach(([k], i) => { pop(`#rs${i}`, P(x, k) - 0.1); sfx(`2${i}`, "pop.mp3", P(x, k), 0.12); });
    leave("e-res", s + d);
  }

  // 3. Fractal explica por qué.
  {
    const x = S.explica; const [s, d] = span(x);
    const L = [["Qué reglas", "Reglas que respetó"], ["qué datos", "Datos que usó"], ["qué supuso", "Supuestos"], ["cuánto riesgo", "Riesgo de cada alternativa"]];
    clip("e-exp", "scene", s, d, `${KICK}
      <div class="st">
        <h2 class="h md x-t">${words("Fractal explica por qué.")}</h2>
        <div class="panel expl">${L.map(([, t], i) => `<div class="ln" id="ln${i}"><em>${i + 1}</em><b>${t}</b>${i === 3 ? `<div class="rng"><i style="left:20%;width:50%"></i><i style="left:35%;width:30%"></i><i style="left:10%;width:75%"></i></div>` : `<i class="ok">✓</i>`}</div>`).join("")}</div>
      </div>`, 3);
    enter("e-exp", s);
    titleIn("#e-exp .x-t", P(x, "Fractal explica") - 0.2);
    pop("#e-exp .expl", P(x, "Qué reglas") - 0.4);
    L.forEach(([k], i) => { izq(`#ln${i}`, P(x, k) - 0.1); sfx(`3${i}`, "pop.mp3", P(x, k), 0.1); });
    at("#e-exp .rng i", { scaleX: 0 }, { scaleX: 1, transformOrigin: "50% 50%", duration: 0.5, stagger: 0.12 }, P(x, "cuánto riesgo") + 0.3);
    leave("e-exp", s + d);
  }

  // 4. Cada escenario queda con su versión; si cambian los datos, se recalcula y se compara.
  {
    const x = S.versiones; const [s, d] = span(x);
    const tM = P(x, "Si mañana"), tR = P(x, "se vuelve a calcular"), tC = P(x, "se compara");
    clip("e-ver", "scene", s, d, `${KICK}
      <div class="st">
        <div class="vline"><svg viewBox="0 0 1000 20" preserveAspectRatio="none"><line x1="0" y1="10" x2="1000" y2="10" pathLength="1"/></svg>
          ${["Escenario v1", "Escenario v2", "Escenario v3"].map((v, i) => `<div class="panel vn" id="vn${i}"><b>${v}</b><small>${["Lunes", "Martes", "Hoy · datos nuevos"][i]}</small></div>`).join("")}</div>
        <span class="chip al cd">Cambian los datos</span>
        <div class="panel comp"><div class="bar"><span>v2</span><i style="--n:70"></i></div><div class="bar"><span>v3</span><i style="--n:82"></i></div><small>Se compara antes de decidir</small></div>
      </div>`, 3);
    enter("e-ver", s);
    at("#e-ver .vline line", { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 1.2 }, x.voiceAt);
    pop("#vn0", P(x, "Cada escenario")); pop("#vn1", P(x, "su versión"));
    pop("#e-ver .cd", tM);
    pop("#vn2", tR); luz("#vn2", tR + 0.3);
    pop("#e-ver .comp", tC - 0.2);
    at("#e-ver .comp i", { scaleX: 0 }, { scaleX: 1, duration: 0.6, stagger: 0.2 }, tC);
    sfx("4a", "hit.wav", tM, 0.14); sfx("4b", "whoosh-short.mp3", tR, 0.18);
    leave("e-ver", s + d);
  }

  // 5. Fractal no decide: la decisión es tuya.
  {
    const x = S.decide; const [s, d] = span(x);
    const tP = P(x, "Te presenta"), tD = P(x, "La decisión");
    clip("e-dec", "scene", s, d, `
      <div class="fondo-red">${red(c, "red7", { w: 1600, h: 900, capas: [5, 8, 9, 8, 5], t0: s + 0.3, dur: d - 1, seed: 33 })}</div>
      <div class="st">
        <h1 class="h xl ti nd">Fractal no decide.</h1>
        <div class="row ops">${["A", "B", "C"].map((n, i) => `<div class="panel op" id="dop${i}"><b>Opción ${n}</b><i style="--w:${[78, 62, 85][i]}%"></i><small>Impacto</small></div>`).join("")}</div>
        <span class="chip on tuya">La decisión es tuya</span>
      </div>`, 3);
    enter("e-dec", s);
    at("#e-dec .nd", { opacity: 0, letterSpacing: "30px", filter: "blur(12px)" }, { opacity: 1, letterSpacing: "-3px", filter: "blur(0px)", duration: 1, ease: "power3.out" }, x.voiceAt - 0.2);
    [0, 1, 2].forEach((i) => pop(`#dop${i}`, tP + i * 0.25));
    at("#e-dec .op i", { scaleX: 0 }, { scaleX: 1, duration: 0.7, stagger: 0.2 }, P(x, "su impacto"));
    pop("#e-dec .tuya", tD);
    sfx("5a", "hit.wav", x.voiceAt, 0.25); sfx("5b", "spark.wav", tD, 0.22);
    leave("e-dec", s + d);
  }

  // 6. Un núcleo y tres módulos.
  {
    const x = S.modulos; const [s, d] = span(x);
    const M = [["Industrial", "Arvantti Digital Twin"], ["Process", "Arvantti OS"], ["Finance", "Arvantti OS Enterprise"]];
    const K = ["Industrial", "Process", "Finance"];
    clip("e-mod", "scene", s, d, `${KICK}
      <div class="st">
        <div class="anillos">
          <svg viewBox="-300 -300 600 600">${[150, 210, 270].map((r, i) => `<circle id="an${i}" r="${r}" pathLength="1"/><g class="orb" id="orb${i}"><circle class="orbp" cx="${r}" cy="0" r="9"/></g>`).join("")}</svg>
          <div class="nuc"><span>Fractal</span><small>Un núcleo</small></div>
          ${M.map(([n, q], i) => `<div class="mlab" id="ml${i}"><b>${n}</b><small>${q}</small></div>`).join("")}
        </div>
        <span class="chip on jps">Juntos o por separado</span>
      </div>`, 3);
    enter("e-mod", s);
    pop("#e-mod .nuc", P(x, "Un núcleo"));
    K.forEach((k, i) => {
      const t = P(x, k);
      at(`#an${i}`, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.8, ease: "power2.out" }, t - 0.3);
      pop(`#ml${i}`, t);
      at(`#orb${i} .orbp`, { opacity: 0 }, { opacity: 1, duration: 0.3 }, t + 0.4);
      at(`#orb${i}`, { rotation: [0, 120, 240][i] }, { rotation: [0, 120, 240][i] + (i % 2 ? -1 : 1) * 300, svgOrigin: "0 0", duration: s + d - t, ease: "none" }, t + 0.4);
      sfx(`6${i}`, "pop.mp3", t, 0.15);
    });
    pop("#e-mod .jps", P(x, "Juntos"));
    leave("e-mod", s + d);
  }

  cierre(c, S.cierre);
  [S.resumen, S.explica, S.versiones, S.decide, S.modulos, S.cierre].forEach((x) => sweep(x.start));
}
