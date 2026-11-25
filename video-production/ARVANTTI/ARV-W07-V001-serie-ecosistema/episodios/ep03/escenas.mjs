// Episodio 3 · Arvantti Digital Twin (guion aprobado por Andy, ajustado el 2026-11-24).
export const ESCENAS = [
  { id: "reporte", dir: "01-reporte", lead: 1.4, tail: 1.0 },
  { id: "gemelo", dir: "02-gemelo", lead: 0.4, tail: 1.1 },
  { id: "lectura", dir: "03-lectura", lead: 0.3, tail: 1.1 },
  { id: "modulos", dir: "04-modulos", lead: 0.3, tail: 1.3 },
  { id: "cosim", dir: "05-cosim", lead: 0.3, tail: 1.3 },
  { id: "asistente", dir: "06-asistente", lead: 0.3, tail: 1.3 },
  { id: "cierre", dir: "07-cierre", lead: 0.9, tail: 4.5, sinSubtitulos: true },
];

import { gantt, curva, barras } from "../../viz.mjs";
import { ayudas, cierre, planta } from "../../comun.mjs";

export function componerEpisodio(c) {
  const { S, P, at, to, clip, words, sfx, span, enter, leave, titleIn, sweep, VERT } = c;
  const { pop, fade, izq, luz, kick } = ayudas(c);
  const KICK = kick(3);

  // 1. Un reporte viejo no alcanza.
  {
    const x = S.reporte; const [s, d] = span(x);
    const tR = P(x, "no un reporte");
    clip("e-rep", "scene", s, d, `${KICK}
      <div class="st">
        <h2 class="h md r-t">${words("¿La operación aguanta más demanda?")}</h2>
        <div class="row rep">
          <div class="panel reporte"><small>Reporte · semana pasada</small>${barras(c, "g-rep", { valores: [62, 70, 58, 66, 72], t0: x.voiceAt + 0.6 })}<em class="viejo">Desactualizado</em></div>
          <div class="panel vivo"><small>Operación completa · ahora</small>${curva(c, "g-vivo", { puntos: [4, 5, 4.5, 6, 5.5, 7, 6.5, 8], t0: P(x, "la operación completa") })}<em class="live">● En vivo</em></div>
        </div>
      </div>`, 3);
    at("#e-rep .kick", { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 0.6 }, s + 0.3);
    titleIn("#e-rep .r-t", P(x, "¿la operación") - 0.1, 0.08);
    pop("#e-rep .reporte", x.voiceAt + 0.4);
    pop("#e-rep .vivo", P(x, "la operación completa") - 0.2);
    to("#e-rep .reporte", { opacity: 0.35, filter: "grayscale(1) blur(2px)", scale: 0.92, duration: 0.6 }, tR);
    fade("#e-rep .viejo", tR + 0.2);
    sfx("1a", "pop.mp3", x.voiceAt + 0.4, 0.12); sfx("1b", "whoosh-short.mp3", tR, 0.18);
    leave("e-rep", s + d);
  }

  // 2. Una copia viva de la operación en 3D.
  {
    const x = S.gemelo; const [s, d] = span(x);
    const SE = [["Temperatura", "212 °C"], ["Ciclo", "18,4 s"], ["Estado", "Produciendo"]];
    clip("e-gem", "scene", s, d, `${KICK}
      <div class="st">
        <div class="pg">${planta("pl2")}</div>
        <h2 class="h md g-t">${words("Una copia viva de tu operación")}</h2>
        <div class="row seniales">${SE.map(([n, v], i) => `<span class="tag" id="se${i}">${n} · <b>${v}</b></span>`).join("")}</div>
      </div>`, 3);
    enter("e-gem", s);
    at("#pl2 .iso", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.6, stagger: 0.2, ease: "power3.out" }, x.voiceAt);
    titleIn("#e-gem .g-t", P(x, "copia viva") - 0.2, 0.06);
    at("#pl2 .pulso", { opacity: 0.2, scale: 0.6, transformOrigin: "50% 50%" }, { opacity: 1, scale: 1.5, duration: 0.5, stagger: 0.15, yoyo: true, repeat: 9, ease: "sine.inOut" }, P(x, "al ritmo"));
    at("#e-gem .tag", { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.35, stagger: 0.18 }, P(x, "las mismas señales") - 0.3);
    sfx("2a", "whoosh-short.mp3", x.voiceAt, 0.18); sfx("2b", "pop.mp3", P(x, "las mismas señales"), 0.12);
    leave("e-gem", s + d);
  }

  // 3. Solo lectura: observa, simula y recomienda.
  {
    const x = S.lectura; const [s, d] = span(x);
    const V = [["observa", "Observa"], ["simula", "Simula"], ["recomienda", "Recomienda"]];
    clip("e-lec", "scene", s, d, `${KICK}
      <div class="st">
        <div class="row lec">
          <div class="panel card" id="sis"><b>Tus sistemas</b><small>Máquinas · ERP · planillas</small></div>
          <svg class="flecha-l" viewBox="0 0 220 40"><line x1="10" y1="20" x2="190" y2="20" pathLength="1"/><polygon points="190,8 214,20 190,32"/></svg>
          <div class="panel card on" id="tw"><b>Digital Twin</b><small>Solo lectura</small></div>
        </div>
        <div class="row vb">${V.map(([, t], i) => `<span class="chip" id="vb${i}">${t}</span>`).join("")}</div>
        <span class="chip nunca">Nunca mueve nada en la planta</span>
      </div>`, 3);
    enter("e-lec", s);
    pop("#sis", x.voiceAt); pop("#tw", x.voiceAt + 0.4);
    at("#e-lec .flecha-l line", { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.6 }, x.voiceAt + 0.3);
    luz("#tw", P(x, "solo lectura"));
    V.forEach(([k], i) => { pop(`#vb${i}`, P(x, k) - 0.1); luz(`#vb${i}`, P(x, k) + 0.3); });
    pop("#e-lec .nunca", P(x, "nunca mueve"));
    V.forEach(([k], i) => sfx(`3${i}`, "pop.mp3", P(x, k), 0.12));
    leave("e-lec", s + d);
  }

  // 4. Un núcleo y siete módulos.
  {
    const x = S.modulos; const [s, d] = span(x);
    const M = [["Integrator", "Integrator", "Conecta"], ["el APS", "APS", "Planificador avanzado"], ["CoSimulation", "CoSimulation", "Simula el futuro"], ["Fractal Industrial", "Fractal Industrial", "Mejores opciones"], ["Control Center", "Control Center", "Avance e inventarios"], ["Dendro", "Dendro", "IA en la máquina"], ["el asistente", "Asistente de IA", "Reportes y gráficas"]];
    const R = VERT ? 330 : 290, CX = 0, CY = 0;
    clip("e-mod", "scene", s, d, `${KICK}
      <div class="st">
        <div class="hepta">
          <div class="nucleo-dt"><b>Núcleo</b><small>Digital Twin</small></div>
          ${M.map(([, n, f], i) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / 7; return `<div class="panel md-m" id="md${i}" style="left:calc(50% + ${(CX + Math.cos(a) * R * (VERT ? 1.05 : 1.45)).toFixed(0)}px);top:calc(50% + ${(CY + Math.sin(a) * R).toFixed(0)}px)"><b>${n}</b><small>${f}</small></div>`; }).join("")}
        </div>
      </div>`, 3);
    enter("e-mod", s);
    pop("#e-mod .nucleo-dt", P(x, "Un núcleo"));
    M.forEach(([k], i) => { at(`#md${i}`, { opacity: 0, scale: 0.5 }, { opacity: 1, scale: 1, duration: 0.4, ease: "back.out(2)" }, P(x, k) - 0.1); to(`#md${i}`, { borderColor: "#4ea7ff", boxShadow: "0 0 40px #2d7ff988", duration: 0.3 }, P(x, k) + 0.2); });
    M.forEach(([k], i) => sfx(`4${i}`, "pop.mp3", P(x, k), 0.1));
    leave("e-mod", s + d);
  }

  // 5. El cosimulador: primero las reglas, después el futuro en paralelo.
  {
    const x = S.cosim; const [s, d] = span(x);
    const tR = P(x, "Primero incorpora"), tC = P(x, "y después calcula");
    clip("e-cos", "scene", s, d, `${KICK}
      <div class="st">
        <div class="row pasos2"><span class="chip" id="p1">1 · Incorpora tus reglas</span><span class="flecha">→</span><span class="chip" id="p2">2 · Calcula el futuro</span></div>
        <div class="panel gw3"><small>Si la demanda sube un trimestre entero</small>${gantt(c, "gt5", { filas: [["Línea 1", [[0, 28], [30, 62], [64, 96]]], ["Línea 2", [[0, 40], [42, 98]]], ["Línea 3", [[4, 30], [32, 58], [60, 99]]]], cuello: 1, t0: tC + 0.2 })}<em class="cuello">Cuello de botella</em></div>
      </div>`, 3);
    enter("e-cos", s);
    pop("#p1", tR - 0.1); luz("#p1", tR + 0.3);
    fade("#e-cos .flecha", tC - 0.3); pop("#p2", tC); luz("#p2", tC + 0.3);
    pop("#e-cos .gw3", tC);
    fade("#e-cos .cuello", P(x, "un trimestre entero"));
    sfx("5a", "pop.mp3", tR, 0.12); sfx("5b", "whoosh-short.mp3", tC, 0.18);
    leave("e-cos", s + d);
  }

  // 6. Asistente con la IA de Arvantti OS; MCP y CLI para otras IA.
  {
    const x = S.asistente; const [s, d] = span(x);
    const tM = P(x, "MCP");
    clip("e-asi", "scene", s, d, `${KICK}
      <div class="st">
        <div class="row asi">
          <div class="panel asist"><small>Asistente · IA de Arvantti OS</small>
            <div class="chat q"><span>¿Qué línea se satura primero?</span></div>
            <div class="chat r"><span>La línea 2, en la semana 6.</span></div>
          </div>
          <div class="conex">
            <span class="chip" id="cx0">MCP · conexión estándar para IA</span>
            <span class="chip" id="cx1">CLI · línea de comandos</span>
            <div class="row otras">${["Otra IA 1", "Otra IA 2", "Otra IA 3"].map((t, i) => `<span class="tag" id="ot${i}">${t}</span>`).join("")}</div>
          </div>
        </div>
      </div>`, 3);
    enter("e-asi", s);
    pop("#e-asi .asist", x.voiceAt);
    at("#e-asi .chat.q", { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 0.4 }, x.voiceAt + 0.6);
    at("#e-asi .chat.r", { opacity: 0, x: 30 }, { opacity: 1, x: 0, duration: 0.4 }, x.voiceAt + 1.6);
    pop("#cx0", tM - 0.1); pop("#cx1", P(x, "CLI") - 0.1);
    at("#e-asi .otras .tag", { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.35, stagger: 0.15 }, P(x, "otros modelos"));
    sfx("6a", "pop.mp3", x.voiceAt + 0.6, 0.12); sfx("6b", "pop.mp3", tM, 0.12);
    leave("e-asi", s + d);
  }

  cierre(c, S.cierre);
  [S.gemelo, S.lectura, S.modulos, S.cosim, S.asistente, S.cierre].forEach((x) => sweep(x.start));
  void izq;
}
