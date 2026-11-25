// Episodio 5 · Dendro (guion aprobado por Andy, 2026-11-24).
export const ESCENAS = [
  { id: "falla", dir: "01-falla", lead: 1.4, tail: 1.0 },
  { id: "dendro", dir: "02-dendro", lead: 0.4, tail: 1.2 },
  { id: "hardware", dir: "03-hardware", lead: 0.3, tail: 1.2 },
  { id: "dosia", dir: "04-dos-ia", lead: 0.3, tail: 1.3 },
  { id: "mant", dir: "05-mantenimiento", lead: 0.3, tail: 1.3 },
  { id: "aprob", dir: "06-aprobacion", lead: 0.3, tail: 1.2 },
  { id: "patente", dir: "07-patente", lead: 0.3, tail: 1.2 },
  { id: "cierre", dir: "08-cierre", lead: 0.9, tail: 4.5, sinSubtitulos: true },
];

import { red, gantt } from "../../viz.mjs";
import { ayudas, cierre } from "../../comun.mjs";

const maquina = (id, alerta) => `<svg class="maq" id="${id}" viewBox="0 0 320 200">
  <rect class="mq-b" x="20" y="60" width="220" height="110" rx="10"/><rect class="mq-p" x="40" y="80" width="80" height="50" rx="6"/>
  <circle class="mq-r" cx="190" cy="115" r="32"/><line class="mq-r2" x1="190" y1="115" x2="190" y2="87"/>
  <rect class="mq-b" x="240" y="100" width="60" height="70" rx="6"/><rect class="mq-base" x="10" y="170" width="300" height="14" rx="4"/>
  ${alerta ? `<g class="mq-al"><circle cx="260" cy="50" r="26"/><text x="260" y="62" text-anchor="middle">!</text></g>` : ""}</svg>`;

/** Señal de la máquina: normal y luego desviándose. */
function senial(c, id, t0, tDesv) {
  const pts = Array.from({ length: 40 }, (_, k) => { const x = 10 + k * 15; const base = 100 + Math.sin(k * 0.9) * 12; const desv = k > 26 ? (k - 26) * 5.5 : 0; return `${k ? "L" : "M"}${x} ${(base - desv).toFixed(1)}`; }).join(" ");
  const svg = `<svg class="senial" id="${id}" viewBox="0 0 620 180"><rect class="banda" x="10" y="76" width="600" height="48" rx="6"/><path class="sl" d="${pts}"/><clipPath id="${id}-c"><rect id="${id}-r" x="0" y="0" width="0" height="180"/></clipPath><path class="sl on" d="${pts}" clip-path="url(#${id}-c)"/></svg>`;
  c.at(`#${id}-r`, { attr: { width: 0 } }, { attr: { width: 630 }, duration: tDesv - t0 + 1.2, ease: "none" }, t0);
  return svg;
}

export function componerEpisodio(c) {
  const { S, P, at, to, clip, words, sfx, span, enter, leave, titleIn, sweep, VERT } = c;
  const { pop, fade, luz, kick } = ayudas(c);
  const KICK = kick(5);

  // 1. Más horas de máquina; una falla sin aviso arruina el plan.
  {
    const x = S.falla; const [s, d] = span(x);
    const tF = P(x, "Y una máquina");
    clip("e-fal", "scene", s, d, `${KICK}
      <div class="st">
        <div class="row fal">
          <div class="panel horas"><small>Horas de máquina por semana</small><div class="hb">${[60, 68, 76, 88, 100].map((v, i) => `<i style="height:${v * 2}px" class="${i === 4 ? "al" : ""}"></i>`).join("")}</div></div>
          <div class="mw">${maquina("mq1", true)}<span class="chip arru">El plan se cae</span></div>
        </div>
      </div>`, 3);
    at("#e-fal .kick", { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 0.6 }, s + 0.3);
    pop("#e-fal .horas", x.voiceAt);
    at("#e-fal .hb i", { scaleY: 0, transformOrigin: "50% 100%" }, { scaleY: 1, duration: 0.5, stagger: 0.15, ease: "power2.out" }, P(x, "más horas") - 0.6);
    pop("#e-fal .mw", tF - 0.2);
    at("#mq1 .mq-al", { opacity: 0, scale: 0, transformOrigin: "260px 50px" }, { opacity: 1, scale: 1, duration: 0.4, ease: "back.out(2)" }, P(x, "falla sin aviso"));
    at("#mq1 .mq-al", { opacity: 1 }, { opacity: 0.4, duration: 0.3, yoyo: true, repeat: 5 }, P(x, "falla sin aviso") + 0.5);
    pop("#e-fal .arru", P(x, "arruina"));
    sfx("1a", "pop.mp3", x.voiceAt, 0.12); sfx("1b", "hit.wav", P(x, "falla sin aviso"), 0.25);
    leave("e-fal", s + d);
  }

  // 2. Dendro Scada Physical AI.
  {
    const x = S.dendro; const [s, d] = span(x);
    clip("e-den", "scene", s, d, `
      <div class="fondo-red">${red(c, "red2", { w: 1600, h: 900, capas: [5, 8, 9, 8, 5], t0: s + 0.3, dur: d - 1, seed: 7 })}</div>
      <div class="st">
        <h1 class="h xl ti">Dendro</h1>
        <p class="sub dn">Scada Physical AI</p>
        <div class="row dm">${maquina("mq2", false)}<span class="chip on ia">IA en la máquina</span></div>
      </div>`, 3);
    enter("e-den", s);
    at("#e-den h1", { opacity: 0, letterSpacing: "30px", filter: "blur(10px)" }, { opacity: 1, letterSpacing: "-3px", filter: "blur(0px)", duration: 1, ease: "power3.out" }, x.voiceAt);
    fade("#e-den .dn", P(x, "Scada"));
    pop("#e-den .dm", P(x, "lleva"));
    pop("#e-den .ia", P(x, "a la máquina"));
    sfx("2a", "whoosh-short.mp3", x.voiceAt, 0.2); sfx("2b", "spark.wav", P(x, "a la máquina"), 0.18);
    leave("e-den", s + d);
  }

  // 3. Hardware propio de Sequoia Space.
  {
    const x = S.hardware; const [s, d] = span(x);
    clip("e-hw", "scene", s, d, `${KICK}
      <div class="st">
        <div class="row hw">
          <svg class="tarjeta" viewBox="0 0 420 260"><rect class="pcb" x="10" y="10" width="400" height="240" rx="16"/>
            <rect class="chipc" x="150" y="80" width="120" height="100" rx="8"/><text x="210" y="138" text-anchor="middle">IA</text>
            ${[0, 1, 2, 3, 4, 5].map((k) => `<line class="pista" x1="40" y1="${50 + k * 32}" x2="150" y2="${100 + k * 12}" pathLength="1"/><line class="pista" x1="270" y1="${100 + k * 12}" x2="380" y2="${50 + k * 32}" pathLength="1"/>`).join("")}
            ${[0, 1, 2, 3].map((k) => `<rect class="con" x="${40 + k * 90}" y="220" width="50" height="22" rx="4"/>`).join("")}</svg>
          <div class="hw-t">
            <span class="chip" id="hw0">Hardware propio de Sequoia Space</span>
            <span class="chip" id="hw1">Criterios de ingeniería espacial</span>
            <span class="chip" id="hw2">Conecta equipos sin conectividad</span>
          </div>
        </div>
      </div>`, 3);
    enter("e-hw", s);
    at("#e-hw .tarjeta", { opacity: 0, rotateY: 50, scale: 0.8 }, { opacity: 1, rotateY: 0, scale: 1, duration: 0.9, ease: "power3.out" }, x.voiceAt);
    at("#e-hw .pista", { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.5, stagger: 0.05 }, x.voiceAt + 0.5);
    [["hardware propio", 0], ["ingeniería espacial", 1], ["se conecta", 2]].forEach(([k, i]) => { pop(`#hw${i}`, P(x, k) - 0.1); luz(`#hw${i}`, P(x, k) + 0.3); });
    sfx("3a", "pop.mp3", P(x, "hardware propio"), 0.12); sfx("3b", "pop.mp3", P(x, "ingeniería espacial"), 0.12); sfx("3c", "pop.mp3", P(x, "se conecta"), 0.12);
    leave("e-hw", s + d);
  }

  // 4. Dos IA: en la máquina y en el Control Center.
  {
    const x = S.dosia; const [s, d] = span(x);
    const tD = P(x, "empieza a desviarse"), tO = P(x, "Otra IA");
    clip("e-dos", "scene", s, d, `${KICK}
      <div class="st">
        <div class="panel sw"><small>IA en la máquina · comportamiento normal</small>${senial(c, "sn4", x.voiceAt + 0.3, tD)}<em class="desv">Empieza a desviarse</em></div>
        <div class="row cc"><span class="flecha">↓</span><div class="panel card on" id="cc4"><b>Control Center</b><small>Otra IA cruza la señal con toda la operación</small></div></div>
      </div>`, 3);
    enter("e-dos", s);
    pop("#e-dos .sw", x.voiceAt);
    fade("#e-dos .desv", tD);
    fade("#e-dos .flecha", tO - 0.3); pop("#cc4", tO);
    sfx("4a", "hit.wav", tD, 0.2); sfx("4b", "pop.mp3", tO, 0.15);
    leave("e-dos", s + d);
  }

  // 5. Mantenimiento a tiempo y plan recalculado.
  {
    const x = S.mant; const [s, d] = span(x);
    const tR = P(x, "recalcular");
    clip("e-man", "scene", s, d, `${KICK}
      <div class="st">
        <div class="row mt"><span class="chip" id="mt0">Ves venir la falla</span><span class="chip" id="mt1">Mantenimiento a tiempo</span><span class="chip" id="mt2">Plan recalculado</span></div>
        <div class="panel gw5">${gantt(c, "gt5", { filas: [["Máquina 7", [[0, 30], [34, 44], [48, 96]]], ["Línea 2", [[0, 46], [50, 98]]], ["Línea 3", [[4, 40], [44, 94]]]], t0: tR })}<em class="mlab">Mantenimiento</em></div>
      </div>`, 3);
    enter("e-man", s);
    pop("#mt0", P(x, "ves venir")); pop("#mt1", P(x, "programas")); pop("#mt2", tR - 0.1); luz("#mt2", tR + 0.3);
    pop("#e-man .gw5", P(x, "programas") + 0.3);
    to("#gt5 .gr:first-child i:nth-child(2)", { background: "linear-gradient(90deg,#d8dadf,#ffffff)", boxShadow: "0 0 20px #fff", duration: 0.4 }, P(x, "a tiempo"));
    fade("#e-man .mlab", P(x, "a tiempo"));
    sfx("5a", "pop.mp3", P(x, "ves venir"), 0.12); sfx("5b", "spark.wav", tR, 0.15);
    leave("e-man", s + d);
  }

  // 6. La única pieza que actúa sobre una máquina, siempre con aprobación.
  {
    const x = S.aprob; const [s, d] = span(x);
    const tA = P(x, "con aprobación");
    clip("e-apr", "scene", s, d, `${KICK}
      <div class="st">
        <div class="panel accion"><small>Acción propuesta por Dendro</small><b>Bajar velocidad de la máquina 7 un 10&nbsp;%</b>
          <div class="row btns"><span class="chip on ap">✓ Aprobar</span><span class="chip">Rechazar</span></div>
          <div class="persona"><svg viewBox="0 0 60 60"><circle cx="30" cy="20" r="12"/><path d="M8 58c0-14 10-22 22-22s22 8 22 22"/></svg><span>Supervisor de turno</span></div>
        </div>
        <span class="chip unica">La única pieza que puede actuar sobre una máquina</span>
      </div>`, 3);
    enter("e-apr", s);
    pop("#e-apr .unica", P(x, "la única pieza"));
    pop("#e-apr .accion", P(x, "actuar") - 0.2);
    fade("#e-apr .persona", tA - 0.3);
    at("#e-apr .ap", { scale: 1 }, { scale: 1.2, duration: 0.25, yoyo: true, repeat: 1 }, tA + 0.2);
    sfx("6a", "pop.mp3", P(x, "actuar"), 0.12); sfx("6b", "click.wav", tA + 0.2, 0.25);
    leave("e-apr", s + d);
  }

  // 7. En proceso de patente.
  {
    const x = S.patente; const [s, d] = span(x);
    clip("e-pat", "scene", s, d, `${KICK}
      <div class="st">
        <h2 class="h md pa-t">${words("Physical AI")}</h2>
        <span class="chip on pat">En proceso de patente</span>
      </div>`, 3);
    enter("e-pat", s);
    titleIn("#e-pat .pa-t", x.voiceAt, 0.12);
    pop("#e-pat .pat", P(x, "proceso de patente"));
    sfx("7a", "spark.wav", P(x, "proceso de patente"), 0.18);
    leave("e-pat", s + d);
  }

  cierre(c, S.cierre);
  [S.dendro, S.hardware, S.dosia, S.mant, S.aprob, S.patente, S.cierre].forEach((x) => sweep(x.start));
  void VERT;
}
