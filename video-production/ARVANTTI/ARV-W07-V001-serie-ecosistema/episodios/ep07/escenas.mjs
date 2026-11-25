// Episodio 7 · La respuesta completa (guion aprobado por Andy, 2026-11-24).
export const ESCENAS = [
  { id: "junta", dir: "01-junta", lead: 1.4, tail: 1.0 },
  { id: "datos", dir: "02-datos", lead: 0.4, tail: 1.2 },
  { id: "simula", dir: "03-simula", lead: 0.3, tail: 1.3 },
  { id: "fractal", dir: "04-fractal", lead: 0.3, tail: 1.3 },
  { id: "explica", dir: "05-explica", lead: 0.3, tail: 1.2 },
  { id: "decide", dir: "06-decide", lead: 0.3, tail: 1.2 },
  { id: "nombre", dir: "07-nombre", lead: 0.3, tail: 1.4 },
  { id: "cierre", dir: "08-cierre", lead: 0.9, tail: 4.5, sinSubtitulos: true },
];

import { curva, gantt } from "../../viz.mjs";
import { ayudas, cierre, opciones, animarOpciones, planta } from "../../comun.mjs";

export function componerEpisodio(c) {
  const { S, P, at, to, clip, words, sfx, span, enter, leave, titleIn, sweep, VERT } = c;
  const { pop, fade, izq, luz, kick } = ayudas(c);
  const KICK = kick(7);

  // 1. Siguiente junta: esta vez hay respuesta.
  {
    const x = S.junta; const [s, d] = span(x);
    const Q = [["la planta", "planta"], ["el inventario", "inventario"], ["la caja", "caja"]];
    clip("e-jun", "scene", s, d, `${KICK}
      <div class="st">
        <h2 class="h md q">${words("Si la demanda sube…")}</h2>
        <div class="row qs">${Q.map(([, t], i) => `<span class="chip" id="q${i}">¿Nos alcanza la ${t}?</span>`).join("")}</div>
        <h1 class="h xl hay">${words("Esta vez hay respuesta.")}</h1>
      </div>`, 3);
    at("#e-jun .kick", { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 0.6 }, s + 0.3);
    titleIn("#e-jun .q", P(x, "si la demanda") - 0.1, 0.1);
    Q.forEach(([k], i) => pop(`#q${i}`, P(x, k) - 0.1));
    to("#e-jun .q, #e-jun .qs", { opacity: 0.35, duration: 0.4 }, P(x, "Esta vez") - 0.2);
    titleIn("#e-jun .hay", P(x, "Esta vez"), 0.1);
    sfx("1a", "spark.wav", P(x, "Esta vez"), 0.2);
    leave("e-jun", s + d);
  }

  // 2. Integrator trajo los datos; Arvantti OS armó el escenario.
  {
    const x = S.datos; const [s, d] = span(x);
    const D = ["ventas", "pedidos", "inventarios", "costos", "capacidad"];
    const tO = P(x, "Arvantti OS");
    clip("e-dat", "scene", s, d, `${KICK}
      <div class="st">
        <div class="row dat"><span class="chip on" id="it">Integrator</span>${D.map((t, i) => `<span class="tag" id="dt${i}">${t}</span>`).join("")}</div>
        <span class="flecha">↓</span>
        <div class="panel card os"><b>Arvantti OS</b><small>Arma el escenario con el contexto y los permisos</small></div>
      </div>`, 3);
    enter("e-dat", s);
    pop("#it", x.voiceAt);
    D.forEach((k, i) => izq(`#dt${i}`, P(x, k) - 0.1));
    fade("#e-dat .flecha", tO - 0.3); pop("#e-dat .os", tO);
    sfx("2a", "pop.mp3", x.voiceAt, 0.12); sfx("2b", "pop.mp3", tO, 0.15);
    leave("e-dat", s + d);
  }

  // 3. Demanda con su rango, gemelo con el cuello de botella y aviso de Dendro.
  {
    const x = S.simula; const [s, d] = span(x);
    const tG = P(x, "El gemelo"), tD = P(x, "Dendro");
    clip("e-sim", "scene", s, d, `${KICK}
      <div class="st">
        <div class="row tri3">
          <div class="panel vz3" id="v0"><small>Demanda estimada · con su rango</small>${curva(c, "cv3", { w: 420, h: 200, puntos: [4, 4.5, 5, 5.6, 6.2, 7, 7.5], banda: true, t0: x.voiceAt + 0.3, dur: 1.2 })}</div>
          <div class="panel vz3" id="v1"><small>Gemelo · cuello de botella</small><div class="pl">${planta("pl3")}</div>${gantt(c, "gt3", { filas: [["Línea 1", [[0, 40], [44, 80]]], ["Línea 2", [[0, 52], [56, 99]]]], cuello: 1, t0: tG + 0.4 })}</div>
          <div class="panel vz3" id="v2"><small>Dendro · aviso</small><div class="aviso"><b>Máquina 7</b><span>Mantenimiento antes</span></div></div>
        </div>
      </div>`, 3);
    enter("e-sim", s);
    pop("#v0", x.voiceAt); pop("#v1", tG - 0.1); pop("#v2", tD - 0.1);
    at("#pl3 .iso", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.4, stagger: 0.12 }, tG);
    at("#e-sim .aviso", { opacity: 0, scale: 0.7 }, { opacity: 1, scale: 1, duration: 0.4, ease: "back.out(2)" }, P(x, "qué máquina"));
    sfx("3a", "pop.mp3", x.voiceAt, 0.12); sfx("3b", "pop.mp3", tG, 0.12); sfx("3c", "hit.wav", P(x, "qué máquina"), 0.18);
    leave("e-sim", s + d);
  }

  // 4. Fractal combinó sus tres módulos y comparó alternativas.
  {
    const x = S.fractal; const [s, d] = span(x);
    const M = ["Industrial", "Process", "Finance"];
    clip("e-fra", "scene", s, d, `${KICK}
      <div class="st">
        <div class="row mods">${M.map((m, i) => `<span class="chip" id="fm${i}">Fractal ${m}</span>`).join("")}</div>
        ${opciones("op4", [["Alternativa A", [88, 52, 58], "Sumar un turno"], ["Alternativa B", [70, 82, 70], "Más inventario"], ["Alternativa C", [64, 66, 86], "Otro proveedor"]], [["Capacidad"], ["Inventario"], ["Margen y caja"]])}
      </div>`, 3);
    enter("e-fra", s);
    M.forEach((m, i) => { pop(`#fm${i}`, P(x, m) - 0.1); luz(`#fm${i}`, P(x, m) + 0.3); });
    animarOpciones(c, "op4", P(x, "comparó"), P(x, "cuánta capacidad"));
    M.forEach((m, i) => sfx(`4${i}`, "pop.mp3", P(x, m), 0.12));
    leave("e-fra", s + d);
  }

  // 5. Resultado explicado, con fuentes y comprobantes.
  {
    const x = S.explica; const [s, d] = span(x);
    clip("e-exp", "scene", s, d, `${KICK}
      <div class="st">
        <div class="row exp">
          <div class="panel res"><small>Resultado explicado</small><b>La alternativa B cumple la demanda con el margen más estable.</b>
            <div class="row fuentes">${["Ventas", "Costos", "Gemelo", "Fractal"].map((t, i) => `<span class="tag" id="fs${i}">${t}</span>`).join("")}</div></div>
          <div class="pila">${[0, 1, 2].map((i) => `<div class="panel recibo mini" id="rb${i}"><b>Comprobante ${i + 1}</b><div><span>Paso</span><em>${["Datos", "Simulación", "Comparación"][i]}</em></div></div>`).join("")}</div>
        </div>
      </div>`, 3);
    enter("e-exp", s);
    pop("#e-exp .res", x.voiceAt);
    at("#e-exp .fuentes .tag", { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.3, stagger: 0.15 }, P(x, "con sus fuentes"));
    at("#e-exp .recibo", { opacity: 0, x: 40 }, { opacity: 1, x: 0, duration: 0.35, stagger: 0.2 }, P(x, "comprobante") - 0.6);
    sfx("5a", "pop.mp3", x.voiceAt, 0.12); sfx("5b", "pop.mp3", P(x, "comprobante"), 0.12);
    leave("e-exp", s + d);
  }

  // 6. La junta decide.
  {
    const x = S.decide; const [s, d] = span(x);
    clip("e-dec", "scene", s, d, `${KICK}
      <div class="st">
        <h1 class="h xl dj">${words("La junta decide.")}</h1>
        <div class="row rd"><span class="chip" id="rd0">La IA recomienda</span><span class="chip on" id="rd1">Las personas deciden</span></div>
      </div>`, 3);
    enter("e-dec", s);
    titleIn("#e-dec .dj", x.voiceAt, 0.12);
    pop("#rd0", P(x, "La IA recomienda")); pop("#rd1", P(x, "la decisión"));
    sfx("6a", "spark.wav", P(x, "la decisión"), 0.18);
    leave("e-dec", s + d);
  }

  // 7. Inteligencia económico-operativa predictiva: los tres productos juntos.
  {
    const x = S.nombre; const [s, d] = span(x);
    const tN = P(x, "No es un cuarto");
    clip("e-nom", "scene", s, d, `${KICK}
      <div class="st">
        <h2 class="h md nm">${words("Inteligencia económico-operativa predictiva")}</h2>
        <div class="row tres3">${["Arvantti OS", "Arvantti Digital Twin", "Arvantti Fractal"].map((t, i) => `<div class="panel card" id="tp${i}"><b>${t}</b></div>`).join("")}</div>
        <span class="chip on juntos">Los tres productos, trabajando juntos</span>
      </div>`, 3);
    enter("e-nom", s);
    titleIn("#e-nom .nm", P(x, "inteligencia"), 0.1);
    at("#e-nom .card", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.45, stagger: 0.2, ease: "back.out(1.8)" }, tN + 0.3);
    to("#e-nom .card", { borderColor: "#4ea7ff", boxShadow: "0 0 50px #2d7ff988", duration: 0.4 }, P(x, "trabajando juntos"));
    pop("#e-nom .juntos", P(x, "trabajando juntos"));
    sfx("7a", "spark.wav", P(x, "trabajando juntos"), 0.2);
    leave("e-nom", s + d);
  }

  cierre(c, S.cierre);
  [S.datos, S.simula, S.fractal, S.explica, S.decide, S.nombre, S.cierre].forEach((x) => sweep(x.start));
  void VERT;
}
