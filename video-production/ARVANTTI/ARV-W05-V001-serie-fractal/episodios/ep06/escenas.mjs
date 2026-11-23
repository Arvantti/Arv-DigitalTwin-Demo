// Episodio 6 · Fractal Finance en Arvantti OS Enterprise (guion aprobado por Andy el 2026-11-23).
export const ESCENAS = [
  { id: "caja", dir: "01-caja", lead: 1.4, tail: 1.0 },
  { id: "finance", dir: "02-finance", lead: 0.3, tail: 1.0 },
  { id: "calcula", dir: "03-calcula", lead: 0.3, tail: 1.0 },
  { id: "reglas", dir: "04-reglas", lead: 0.3, tail: 1.0 },
  { id: "combina", dir: "05-combina", lead: 0.3, tail: 1.0 },
  { id: "demanda", dir: "06-demanda", lead: 0.3, tail: 1.0 },
  { id: "mezcla", dir: "07-mezcla", lead: 0.3, tail: 1.0 },
  { id: "proveedores", dir: "08-proveedores", lead: 0.3, tail: 1.0 },
  { id: "lunes", dir: "09-lunes", lead: 0.3, tail: 1.0 },
  { id: "cierre", dir: "10-cierre", lead: 0.9, tail: 4.5, sinSubtitulos: true },
];

import { barras, curva } from "../../viz.mjs";
import { ayudas, opciones, cierre } from "../../comun.mjs";

/** Histórico (línea sólida) y pronóstico con banda de incertidumbre. */
function pronostico(c, id, { w = 1100, h = 380, t0, tP }) {
  const hist = [52, 58, 50, 64, 60, 70, 66, 74, 68, 78, 75, 82];
  const pro = [82, 86, 84, 90, 88, 94];
  const n = hist.length + pro.length - 1, X = (i) => 40 + (i * (w - 80)) / n, Y = (v) => h - 40 - ((v - 40) / 70) * (h - 80);
  const lh = hist.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(" ");
  const k0 = hist.length - 1;
  const lp = pro.map((v, i) => `${i ? "L" : "M"}${X(k0 + i).toFixed(1)} ${Y(v).toFixed(1)}`).join(" ");
  const banda = `${pro.map((v, i) => `${i ? "L" : "M"}${X(k0 + i).toFixed(1)} ${Y(v + i * 3).toFixed(1)}`).join(" ")} ${pro.slice().reverse().map((v, j) => { const i = pro.length - 1 - j; return `L${X(k0 + i).toFixed(1)} ${Y(v - i * 3).toFixed(1)}`; }).join(" ")} Z`;
  c.at(`#${id} .ph`, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 1.4, ease: "power1.inOut" }, t0);
  c.at(`#${id} .pband`, { opacity: 0 }, { opacity: 1, duration: 0.8 }, tP + 0.3);
  c.at(`#${id} .pp2`, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 1, ease: "power1.out" }, tP);
  c.at(`#${id} .hoy, #${id} .lbl`, { opacity: 0 }, { opacity: 1, duration: 0.4, stagger: 0.2 }, tP - 0.3);
  return `<svg class="pron" id="${id}" viewBox="0 0 ${w} ${h}">
    <line class="ax" x1="40" y1="${h - 40}" x2="${w - 30}" y2="${h - 40}"/>
    <line class="hoy" x1="${X(k0)}" y1="20" x2="${X(k0)}" y2="${h - 40}"/>
    <text class="lbl" x="${X(k0) - 16}" y="${h - 12}" text-anchor="end">Históricos del ERP</text>
    <text class="lbl" x="${X(k0) + 16}" y="${h - 12}">Próximos meses</text>
    <path class="pband" d="${banda}"/>
    <path class="ph" d="${lh}" pathLength="1"/><path class="pp2" d="${lp}" pathLength="1"/></svg>`;
}

export function componerEpisodio(c) {
  const { S, P, at, to, clip, words, sfx, span, enter, leave, titleIn, sweep, VERT } = c;
  const { pop, fade, izq, luz, kick } = ayudas(c);
  const KICK = kick(6);

  // 1. ¿Y la caja?
  {
    const x = S.caja; const [s, d] = span(x);
    const tD = P(x, "la directora"), tC = P(x, "¿y la caja?");
    clip("e-caja", "scene", s, d, `${KICK}
      <div class="st">
        <div class="row hecho"><span class="chip on" id="h0">✓ Producido</span><span class="chip on" id="h1">✓ Despachado a tiempo</span></div>
        <div class="panel card dir"><small>Directora financiera</small><span>Pregunta lo que todos olvidan</span></div>
        <h1 class="h xl q">${words("¿Y la caja?")}</h1>
      </div>`, 3);
    at("#e-caja .kick", { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 0.6 }, s + 0.3);
    pop("#h0", P(x, "Producimos")); pop("#h1", P(x, "lo despachamos"));
    pop("#e-caja .dir", tD);
    titleIn("#e-caja .q", tC - 0.1, 0.15);
    sfx("1a", "hit.wav", tC, 0.25);
    leave("e-caja", s + d);
  }

  // 2. Fractal Finance, en Arvantti OS Enterprise.
  {
    const x = S.finance; const [s, d] = span(x);
    const tF = P(x, "Fractal Finance");
    clip("e-fin", "scene", s, d, `${KICK}
      <div class="st">
        <h1 class="h xl ti ff">Fractal Finance</h1>
        <span class="chip on en">Módulo financiero · en Arvantti OS Enterprise</span>
      </div>`, 3);
    enter("e-fin", s);
    at("#e-fin .ff", { opacity: 0, letterSpacing: "30px", filter: "blur(12px)" }, { opacity: 1, letterSpacing: "-3px", filter: "blur(0px)", duration: 1, ease: "power3.out" }, tF - 0.2);
    at("#e-fin .ff", { backgroundPosition: "-200% 0" }, { backgroundPosition: "200% 0", duration: 2, ease: "power1.inOut" }, tF + 0.8);
    pop("#e-fin .en", P(x, "en Arvantti"));
    sfx("2a", "hit.wav", tF, 0.25);
    leave("e-fin", s + d);
  }

  // 3. Calcula margen, flujo de caja, capital de trabajo y liquidez.
  {
    const x = S.calcula; const [s, d] = span(x);
    const K = ["el margen real", "el flujo de caja", "el capital de trabajo", "la liquidez"];
    const G = [
      ["Margen real", barras(c, "gm", { valores: [40, 55, 62, 70], t0: P(x, K[0]) + 0.2 })],
      ["Flujo de caja semanal", curva(c, "gf", { puntos: [6, 5, 3, 2.5, 4, 6, 7, 8], t0: P(x, K[1]) + 0.2 })],
      ["Capital de trabajo", barras(c, "gk", { valores: [85, 70, 48], alerta: 0, t0: P(x, K[2]) + 0.2 })],
      ["Liquidez", curva(c, "gl", { puntos: [5, 5.5, 5, 6, 6.5, 6, 7, 7.5], banda: true, t0: P(x, K[3]) + 0.2 })],
    ];
    clip("e-calc", "scene", s, d, `${KICK}
      <div class="st">
        <h2 class="h md c-t">${words("Calcula con tus números.")}</h2>
        <div class="row metr">${G.map(([n, g], i) => `<div class="panel area" id="mt${i}"><b>${n}</b><div class="mini">${g}</div>${i === 2 ? `<span class="am">Amarrado en material e inventario</span>` : ""}</div>`).join("")}</div>
      </div>`, 3);
    enter("e-calc", s);
    titleIn("#e-calc .c-t", x.voiceAt);
    K.forEach((k, i) => { pop(`#mt${i}`, P(x, k) - 0.1); sfx(`3${i}`, "pop.mp3", P(x, k), 0.1); });
    fade("#e-calc .am", P(x, "amarrado"));
    leave("e-calc", s + d);
  }

  // 4. Primero tus reglas financieras.
  {
    const x = S.reglas; const [s, d] = span(x);
    const R = [["plazos de pago", "Plazos de pago"], ["cupos de crédito", "Cupos de crédito"], ["límites", "Límites de endeudamiento"]];
    clip("e-reg", "scene", s, d, `${KICK}
      <div class="st">
        <h2 class="h md r-t">${words("Primero, tus reglas financieras.")}</h2>
        <div class="row rgs">${R.map(([, t], i) => `<div class="panel card rg" id="rg${i}"><i class="ic">${["⏱", "▣", "⛔"][i]}</i><b>${t}</b></div>`).join("")}</div>
      </div>`, 3);
    enter("e-reg", s);
    titleIn("#e-reg .r-t", x.voiceAt);
    R.forEach(([k], i) => { pop(`#rg${i}`, P(x, k) - 0.1); sfx(`4${i}`, "pop.mp3", P(x, k), 0.1); });
    leave("e-reg", s + d);
  }

  // 5. Mismo núcleo: se combina con Industrial en un solo cálculo.
  {
    const x = S.combina; const [s, d] = span(x);
    const tI = P(x, "combinarse"), tP = P(x, "el plan que"), tC = P(x, "y el que la caja"), tU = P(x, "en un solo cálculo");
    clip("e-comb", "scene", s, d, `${KICK}
      <div class="st">
        <span class="chip nucleo">Mismo núcleo de Fractal</span>
        <div class="venn"><div class="cir c1"><b>Industrial</b><span>Lo que la planta puede hacer</span></div><div class="cir c2"><b>Finance</b><span>Lo que la caja puede aguantar</span></div><em class="uno">Un solo cálculo</em></div>
      </div>`, 3);
    enter("e-comb", s);
    pop("#e-comb .nucleo", P(x, "el mismo núcleo"));
    at("#e-comb .c1", { opacity: 0, x: VERT ? 0 : -160, y: VERT ? -120 : 0 }, { opacity: 1, x: VERT ? 0 : -60, y: VERT ? -40 : 0, duration: 0.6, ease: "power3.out" }, Math.min(tI, tP) - 0.1);
    at("#e-comb .c2", { opacity: 0, x: VERT ? 0 : 160, y: VERT ? 120 : 0 }, { opacity: 1, x: VERT ? 0 : 60, y: VERT ? 40 : 0, duration: 0.6, ease: "power3.out" }, tC - 0.1);
    to("#e-comb .c1", { x: 0, y: 0, duration: 0.7, ease: "power2.inOut" }, tU - 0.3);
    to("#e-comb .c2", { x: 0, y: 0, duration: 0.7, ease: "power2.inOut" }, tU - 0.3);
    pop("#e-comb .uno", tU + 0.2);
    sfx("5a", "whoosh-short.mp3", tU - 0.3, 0.2); sfx("5b", "spark.wav", tU + 0.2, 0.2);
    leave("e-comb", s + d);
  }

  // 6. Predicción de demanda a partir de los históricos del ERP.
  {
    const x = S.demanda; const [s, d] = span(x);
    const tM = P(x, "Con modelos"), tH = P(x, "los históricos"), tE = P(x, "estima"), tR = P(x, "rango de incertidumbre");
    clip("e-dem", "scene", s, d, `${KICK}
      <div class="st">
        <div class="row tit"><span class="chip on" id="dm0">Predicción de demanda</span><span class="chip" id="dm1">Históricos del ERP · el sistema de gestión de tu empresa</span></div>
        <div class="panel vz pw">${pronostico(c, "pr6", { w: 1100, h: 380, t0: tH, tP: tE })}<p class="vl">Cuánto vas a vender · con su rango de incertidumbre</p></div>
      </div>`, 3);
    enter("e-dem", s);
    pop("#dm0", tM); pop("#dm1", tH);
    pop("#e-dem .pw", tH - 0.2);
    at("#e-dem .vl", { opacity: 0 }, { opacity: 1, duration: 0.4 }, tR);
    sfx("6a", "pop.mp3", tM, 0.15); sfx("6b", "whoosh-short.mp3", tE, 0.18);
    leave("e-dem", s + d);
  }

  // 7. Demanda + capacidad real: mezcla entre fabricar para inventario y contra pedido.
  {
    const x = S.mezcla; const [s, d] = span(x);
    const tA = P(x, "por adelantado"), tL = P(x, "solo cuando"), tI = P(x, "con el impacto");
    clip("e-mez", "scene", s, d, `${KICK}
      <div class="st">
        <div class="row cruce"><span class="chip" id="cz0">Demanda estimada</span><span class="flecha">×</span><span class="chip" id="cz1">Capacidad real · Fractal Industrial</span></div>
        <div class="balanza"><span id="bz0">Fabricar para inventario</span><div class="riel"><i class="cursor"></i></div><span id="bz1">Fabricar contra pedido</span></div>
        ${opciones("op7", [["Mezcla 1 · más inventario", [90, 85, 35]], ["Mezcla 2 · equilibrada", [80, 55, 65]], ["Mezcla 3 · más contra pedido", [60, 30, 85]]], [["Entregas"], ["Inventario", "r"], ["Caja"]])}
      </div>`, 3);
    enter("e-mez", s);
    pop("#cz0", P(x, "Cruza")); pop("#cz1", P(x, "la capacidad"));
    at("#e-mez .cruce .flecha", { opacity: 0 }, { opacity: 1, duration: 0.3 }, P(x, "la capacidad"));
    fade("#e-mez .balanza", tA - 0.4);
    luz("#bz0", tA); luz("#bz1", tL);
    at("#e-mez .cursor", { left: "50%" }, { left: "15%", duration: 0.8, ease: "power2.inOut" }, tA);
    to("#e-mez .cursor", { left: "85%", duration: 1, ease: "power2.inOut" }, tL);
    to("#e-mez .cursor", { left: "50%", duration: 0.8, ease: "power2.inOut" }, tI);
    at("#op7 .opt", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.2, ease: "power3.out" }, tI - 0.2);
    at("#op7 .bar i", { scaleX: 0 }, { scaleX: 1, duration: 0.6, stagger: 0.05, ease: "power2.out" }, tI + 0.3);
    sfx("7a", "pop.mp3", tA, 0.12); sfx("7b", "pop.mp3", tL, 0.12);
    leave("e-mez", s + d);
  }

  // 8. Mejor preparado para negociar con proveedores.
  {
    const x = S.proveedores; const [s, d] = span(x);
    const tV = P(x, "por volumen"), tP = P(x, "por partes");
    clip("e-prov", "scene", s, d, `${KICK}
      <div class="st">
        <h2 class="h md p-t">${words("Negociar con tus proveedores.")}</h2>
        <div class="row qs"><span class="chip" id="q0">¿Cuánto material?</span><span class="chip" id="q1">¿Cuándo?</span></div>
        ${opciones("op8", [["Comprar por volumen", [80, 40]], ["Comprar por partes", [62, 78]]], [["Margen"], ["Caja"]])}
      </div>`, 3);
    enter("e-prov", s);
    titleIn("#e-prov .p-t", P(x, "negociar") - 0.3);
    pop("#q0", P(x, "cuánto material")); pop("#q1", P(x, "cuándo"));
    at("#op8-0", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" }, tV - 0.2);
    at("#op8-1", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" }, tP - 0.2);
    at("#op8-0 .bar i", { scaleX: 0 }, { scaleX: 1, duration: 0.6, stagger: 0.1 }, tV + 0.2);
    at("#op8-1 .bar i", { scaleX: 0 }, { scaleX: 1, duration: 0.6, stagger: 0.1 }, tP + 0.2);
    sfx("8a", "pop.mp3", tV, 0.12); sfx("8b", "pop.mp3", tP, 0.12);
    leave("e-prov", s + d);
  }

  // 9. El pedido del lunes: la caja se aprieta tres semanas; dos opciones.
  {
    const x = S.lunes; const [s, d] = span(x);
    const tA = P(x, "la caja se aprieta"), tO = P(x, "te presenta"), tE = P(x, "Tú eliges");
    clip("e-lun", "scene", s, d, `${KICK}
      <div class="st">
        <div class="row arriba"><span class="chip on" id="lm">✓ Deja margen</span><div class="panel vz cj"><svg class="caja" viewBox="0 0 640 200"><rect class="apr" x="200" y="10" width="240" height="180" rx="10"/><path class="cjl" d="M20 70 L120 80 L200 120 L280 165 L360 170 L440 130 L520 80 L620 60" pathLength="1"/><text class="axl" x="320" y="34" text-anchor="middle">3 semanas</text></svg><p class="vl">Flujo de caja</p></div></div>
        ${opciones("op9", [["Pedir un anticipo", [85, 45]], ["Escalonar la compra de material", [65, 70]]], [["Caja"], ["Costo", "r"]])}
        <span class="chip on te">Tú eliges</span>
      </div>`, 3);
    enter("e-lun", s);
    pop("#lm", P(x, "deja margen"));
    pop("#e-lun .cj", tA - 0.3);
    at("#e-lun .cjl", { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 1.2, ease: "power1.inOut" }, tA - 0.2);
    at("#e-lun .apr, #e-lun .caja .axl", { opacity: 0 }, { opacity: 1, duration: 0.4 }, tA + 0.6);
    at("#op9-0", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" }, P(x, "pedir un anticipo") - 0.1);
    at("#op9-1", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" }, P(x, "escalonar") - 0.1);
    at("#op9 .bar i", { scaleX: 0 }, { scaleX: 1, duration: 0.6, stagger: 0.08 }, P(x, "escalonar") + 0.3);
    pop("#e-lun .te", tE);
    sfx("9a", "hit.wav", tA, 0.15); sfx("9b", "spark.wav", tE, 0.2);
    leave("e-lun", s + d);
  }

  cierre(c, S.cierre);
  [S.finance, S.calcula, S.reglas, S.combina, S.demanda, S.mezcla, S.proveedores, S.lunes, S.cierre].forEach((x) => sweep(x.start));
}
