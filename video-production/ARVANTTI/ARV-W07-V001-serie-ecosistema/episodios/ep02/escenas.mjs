// Episodio 2 · Arvantti OS (guion aprobado por Andy, ajustado el 2026-11-24).
export const ESCENAS = [
  { id: "sueltas", dir: "01-sueltas", lead: 1.4, tail: 1.0 },
  { id: "os", dir: "02-os", lead: 0.4, tail: 1.0 },
  { id: "promesas", dir: "03-promesas", lead: 0.3, tail: 1.2 },
  { id: "cerebro", dir: "04-cerebro", lead: 0.3, tail: 1.2 },
  { id: "escenario", dir: "05-escenario", lead: 0.3, tail: 1.2 },
  { id: "process", dir: "06-process", lead: 0.3, tail: 1.3 },
  { id: "cierre", dir: "07-cierre", lead: 0.9, tail: 4.5, sinSubtitulos: true },
];

import { red } from "../../viz.mjs";
import { ayudas, cierre } from "../../comun.mjs";

/** Grafo de conocimiento: nodos que se conectan alrededor de una decisión. */
function grafo(c, id, t0) {
  const N = [["Decisión", 300, 170, 1], ["Pedido", 110, 70], ["Costo", 500, 70], ["Proveedor", 90, 270], ["Evidencia", 510, 270], ["Fecha", 300, 30], ["Aprobó", 300, 320]];
  const E = [[0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6], [1, 3], [2, 4]];
  const svg = `<svg class="grafo" id="${id}" viewBox="0 0 600 350">${E.map(([a, b], k) => `<line class="ge" id="${id}-e${k}" x1="${N[a][1]}" y1="${N[a][2]}" x2="${N[b][1]}" y2="${N[b][2]}" pathLength="1"/>`).join("")}
    ${N.map(([n, x, y, m], k) => `<g class="gn${m ? " gm" : ""}" id="${id}-n${k}"><circle cx="${x}" cy="${y}" r="${m ? 48 : 34}"/><text x="${x}" y="${y + 7}" text-anchor="middle">${n}</text></g>`).join("")}</svg>`;
  if (t0 != null) {
    c.at(`#${id} .gn`, { opacity: 0, scale: 0, transformOrigin: "50% 50%" }, { opacity: 1, scale: 1, duration: 0.4, stagger: 0.12, ease: "back.out(2)" }, t0);
    c.at(`#${id} .ge`, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.4, stagger: 0.08 }, t0 + 0.4);
  }
  return svg;
}

export function componerEpisodio(c) {
  const { S, P, at, to, clip, words, sfx, span, enter, leave, titleIn, sweep, VERT } = c;
  const { pop, fade, izq, luz, kick } = ayudas(c);
  const KICK = kick(2);

  // 1. Cada área con una IA distinta, sin control.
  {
    const x = S.sueltas; const [s, d] = span(x);
    const A = [["Ventas", "IA de chat 1"], ["Finanzas", "IA de chat 2"], ["Producción", "IA de chat 3"], ["Compras", "IA de chat 4"]];
    const tH = P(x, "Hoy cada área");
    clip("e-sueltas", "scene", s, d, `${KICK}
      <div class="st">
        <h2 class="h md s-t">${words("Que tu IA conozca la empresa y siga sus reglas.")}</h2>
        <div class="row sueltas">${A.map(([a, n], i) => `<div class="chat" id="su${i}"><small>${a}</small><span>${n}</span><i class="alerta">Sin reglas</i></div>`).join("")}</div>
      </div>`, 3);
    at("#e-sueltas .kick", { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 0.6 }, s + 0.3);
    titleIn("#e-sueltas .s-t", P(x, "su IA") - 0.4, 0.06);
    at("#e-sueltas .chat", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.45, stagger: 0.2, ease: "back.out(1.8)" }, tH);
    at("#e-sueltas .alerta", { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.3, stagger: 0.12 }, P(x, "sin control"));
    to("#e-sueltas .s-t", { opacity: 0.4, duration: 0.4 }, tH);
    sfx("1a", "pop.mp3", tH, 0.15); sfx("1b", "hit.wav", P(x, "sin control"), 0.2);
    leave("e-sueltas", s + d);
  }

  // 2. Arvantti OS: todas las IA bajo las mismas reglas, memoria y registro.
  {
    const x = S.os; const [s, d] = span(x);
    const C = [["las mismas reglas", "Reglas"], ["la misma memoria", "Memoria"], ["el mismo registro", "Registro"]];
    clip("e-os", "scene", s, d, `${KICK}
      <div class="st">
        <div class="row ias">${["IA 1", "IA 2", "IA 3", "IA 4"].map((n, i) => `<span class="chip" id="ia${i}">${n}</span>`).join("")}</div>
        <div class="panel capa-os"><img class="marca" src="assets/clips/marca.png" alt=""><b>Arvantti OS</b><small>Sistema operativo empresarial para la IA</small></div>
        <div class="row tres">${C.map(([, t], i) => `<span class="chip" id="os${i}">${t}</span>`).join("")}</div>
        <span class="tag medida">Configurado a la medida de cada empresa</span>
      </div>`, 3);
    enter("e-os", s);
    pop("#e-os .capa-os", x.voiceAt);
    at("#e-os .ias .chip", { opacity: 0, y: -60 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.12, ease: "power3.out" }, P(x, "todas tus IA") - 0.2);
    to("#e-os .ias .chip", { y: 30, scale: 0.9, borderColor: "#4ea7ff", duration: 0.5, stagger: 0.08 }, P(x, "todas tus IA") + 0.8);
    C.forEach(([k], i) => { pop(`#os${i}`, P(x, k) - 0.1); luz(`#os${i}`, P(x, k) + 0.3); });
    fade("#e-os .medida", P(x, "configurado"));
    sfx("2a", "whoosh-short.mp3", x.voiceAt, 0.18);
    C.forEach(([k], i) => sfx(`2${i}`, "pop.mp3", P(x, k), 0.12));
    leave("e-os", s + d);
  }

  // 3. Las cinco promesas.
  {
    const x = S.promesas; const [s, d] = span(x);
    const PR = [["controla", "Controla", "Qué puede hacer cada IA", "◎"], ["protege", "Protege", "Claves y datos sensibles", "⛨"], ["organiza", "Organiza", "Cada trabajo, una tarea", "▤"], ["recuerda", "Recuerda", "Un cerebro empresarial", "✦"], ["rinde cuentas", "Rinde cuentas", "Cada acción, un comprobante", "✓"]];
    clip("e-prom", "scene", s, d, `${KICK}
      <div class="st">
        <h2 class="h md p-t">${words("Cinco promesas")}</h2>
        <div class="row proms">${PR.map(([, n, t, ic], i) => `<div class="panel card prom" id="pm${i}"><i class="ic">${ic}</i><b>${n}</b><small>${t}</small></div>`).join("")}</div>
      </div>`, 3);
    enter("e-prom", s);
    titleIn("#e-prom .p-t", x.voiceAt);
    PR.forEach(([k], i) => { pop(`#pm${i}`, P(x, k) - 0.15); to(`#pm${i}`, { borderColor: "#4ea7ff", boxShadow: "0 0 50px #2d7ff988", duration: 0.3 }, P(x, k) + 0.2); });
    PR.forEach(([k], i) => sfx(`3${i}`, "pop.mp3", P(x, k), 0.12));
    leave("e-prom", s + d);
  }

  // 4. Cerebro empresarial y comprobantes.
  {
    const x = S.cerebro; const [s, d] = span(x);
    const tC = P(x, "Y cada acción");
    clip("e-cer", "scene", s, d, `${KICK}
      <div class="st">
        <div class="row cer">
          <div class="panel gw"><small class="gl">Cerebro empresarial</small>${grafo(c, "gr4", P(x, "Su cerebro"))}</div>
          <div class="panel recibo" id="rc4"><b>Comprobante</b>
            <div><span>Acción</span><em>Consulta de inventario</em></div>
            <div><span>IA</span><em>Agente de compras</em></div>
            <div><span>Permiso</span><em class="ok">Concedido</em></div>
            <div><span>Evidencia</span><em>3 fuentes</em></div>
            <div><span>Hora</span><em>10:42</em></div>
          </div>
        </div>
      </div>`, 3);
    enter("e-cer", s);
    pop("#e-cer .gw", x.voiceAt);
    ["qué se decidió", "cuándo", "con qué evidencia"].forEach((k, i) => to(`#gr4-n${[0, 5, 4][i]} circle`, { fill: "#2d7ff9", duration: 0.3 }, P(x, k)));
    pop("#rc4", tC - 0.1);
    at("#rc4 div", { opacity: 0, x: -20 }, { opacity: 1, x: 0, duration: 0.3, stagger: 0.15 }, tC + 0.3);
    sfx("4a", "spark.wav", P(x, "Su cerebro"), 0.15); sfx("4b", "pop.mp3", tC, 0.15);
    leave("e-cer", s + d);
  }

  // 5. Arma el escenario: contexto, permisos y agentes.
  {
    const x = S.escenario; const [s, d] = span(x);
    const PASOS = [["reúne el contexto", "Reúne el contexto"], ["aplica los permisos", "Aplica los permisos"], ["reparte el trabajo", "Reparte el trabajo"]];
    const AG = ["Agente de ventas", "Agente de producción", "Agente de finanzas"];
    const tR = P(x, "reparte el trabajo");
    clip("e-esc", "scene", s, d, `${KICK}
      <div class="st">
        <div class="panel pq"><small>Pregunta de la junta</small><b>¿Nos alcanza la planta, el inventario y la caja?</b></div>
        <div class="row pasos">${PASOS.map(([, t], i) => `<span class="chip" id="pa${i}">${i + 1} · ${t}</span>`).join("")}</div>
        <div class="row ags">${AG.map((t, i) => `<div class="panel card ag" id="ag${i}"><i class="ic">◉</i><small>${t}</small></div>`).join("")}</div>
      </div>`, 3);
    enter("e-esc", s);
    pop("#e-esc .pq", x.voiceAt);
    PASOS.forEach(([k], i) => { izq(`#pa${i}`, P(x, k) - 0.1); luz(`#pa${i}`, P(x, k) + 0.3); });
    at("#e-esc .ag", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.4, stagger: 0.18, ease: "back.out(1.8)" }, tR + 0.3);
    PASOS.forEach(([k], i) => sfx(`5${i}`, "pop.mp3", P(x, k), 0.12));
    leave("e-esc", s + d);
  }

  // 6. Fractal Process y, en Enterprise, Fractal Finance.
  {
    const x = S.process; const [s, d] = span(x);
    const tP = P(x, "Fractal Process"), tF = P(x, "Fractal Finance");
    clip("e-proc", "scene", s, d, `
      <div class="fondo-red">${red(c, "red6", { w: 1600, h: 900, capas: [5, 8, 9, 8, 5], t0: s + 0.3, dur: d - 1, seed: 17 })}</div>
      ${KICK}
      <div class="st">
        <div class="row anill">
          <div class="nucleo-os"><b>Arvantti OS</b></div>
          <div class="panel card mod" id="mp"><b>Fractal Process</b><small>Optimiza procesos y decisiones</small></div>
          <div class="panel card mod" id="mf"><b>Fractal Finance</b><small>El dinero: caja, margen y compras</small><span class="tag ent">Edición Enterprise</span></div>
        </div>
      </div>`, 3);
    enter("e-proc", s);
    pop("#e-proc .nucleo-os", x.voiceAt);
    pop("#mp", tP - 0.1); to("#mp", { borderColor: "#4ea7ff", boxShadow: "0 0 60px #2d7ff988", duration: 0.4 }, tP + 0.3);
    pop("#mf", tF - 0.3); to("#mf", { borderColor: "#4ea7ff", boxShadow: "0 0 60px #2d7ff988", duration: 0.4 }, tF + 0.3);
    fade("#e-proc .ent", P(x, "edición Enterprise"));
    sfx("6a", "spark.wav", tP, 0.18); sfx("6b", "spark.wav", tF, 0.18);
    leave("e-proc", s + d);
  }

  cierre(c, S.cierre);
  [S.os, S.promesas, S.cerebro, S.escenario, S.process, S.cierre].forEach((x) => sweep(x.start));
  void VERT;
}
