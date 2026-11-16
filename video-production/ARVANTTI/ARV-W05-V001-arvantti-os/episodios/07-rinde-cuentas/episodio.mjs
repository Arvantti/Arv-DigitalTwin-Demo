// Parte 7 de 7 · Rinde cuentas (módulo técnico: Receipts). Cierre de la serie.
// Momento del lunes: la junta pregunta quién cambió una cifra; repaso de todo el lunes con su evidencia.
import { kicker, firma, figura, PROMESAS, promOn } from "../../comun.mjs";

export const ESCENAS = [
  { id: "recap", dir: "01-recap", lead: 0.6, tail: 0.5 },
  { id: "gancho", dir: "02-gancho", lead: 0.3, tail: 0.8 },
  { id: "dolor", dir: "03-dolor", lead: 0.3, tail: 0.8 },
  { id: "comprobante", dir: "04-comprobante", lead: 0.3, tail: 0.8 },
  { id: "hoja", dir: "05-hoja", lead: 0.2, tail: 0.8 },
  { id: "iso", dir: "06-iso", lead: 0.2, tail: 0.9 },
  { id: "repaso", dir: "07-repaso", lead: 0.3, tail: 1.2 },
  { id: "completa", dir: "08-completa", lead: 0.3, tail: 1.0 },
  { id: "firma", dir: "09-firma", lead: 0.6, tail: 6.0 },
];

const CIAN = "#22d3ee";
const PC = Object.fromEntries(PROMESAS.map((p) => [p.id, p.c]));

export function componer(c) {
  const { S, VERT, at, to, clip, sfx, span, enter, leave, words, wordsIn, sweep, P } = c;

  kicker(c, 7, S.recap.start, S.firma.start);
  // Recap: aprobado por voz.
  {
    const x = S.recap; const [s, d] = span(x);
    clip("e-recap", "scene", s, d, `<p class="center figcap">${words(x.txt)}</p><div class="aprob-ok">✓ Aprobado por voz</div>`);
    wordsIn("#e-recap .figcap", x.voiceAt, 0.06);
    at("#e-recap .aprob-ok", { opacity: 0, scale: 0.7 }, { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(2)" }, 0.3);
    leave("e-recap", s + d);
  }

  // 2. Gancho: ¿quién cambió esta cifra?
  {
    const x = S.gancho; const [s, d] = span(x);
    clip("e-gancho", "scene", s, d, `
      <div class="informe"><p class="ph">INFORME DE CIERRE · JUNTA</p><div class="ln"></div><div class="ln s"></div><div class="cifra"><span>Margen por producto</span><b>32,4 %</b><i>?</i></div><div class="ln"></div></div>
      <h1 class="center q q7">${words("Nadie sabe responder.")}</h1>`);
    enter("e-gancho", s);
    at("#e-gancho .informe", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.5 }, x.voiceAt);
    to("#e-gancho .cifra", { backgroundColor: "#3a2f0c", boxShadow: "0 0 0 4px #fbbf24", duration: 0.4 }, P(x, "esta cifra"));
    at("#e-gancho .cifra i", { opacity: 0, scale: 0.3 }, { opacity: 1, scale: 1, duration: 0.4, ease: "back.out(3)" }, P(x, "esta cifra") + 0.2);
    const tN = P(x, "Y nadie");
    to("#e-gancho .informe", { opacity: 0.3, duration: 0.4 }, tN);
    at("#e-gancho .q .w", { opacity: 0, y: 40, filter: "blur(14px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.55, stagger: 0.1, ease: "power3.out" }, tN);
    sfx("hit.wav", tN, 0.2);
    leave("e-gancho", s + d);
  }

  // 3. Dolor: perdido en el chat, registros editables, sin prueba.
  {
    const x = S.dolor; const [s, d] = span(x);
    const tL = P(x, "Los registros"), tC = P(x, "y cuando");
    const MSG = Array.from({ length: 14 }, (_, i) => ["Revisa el margen", "Listo, ajusté la fórmula", "¿Y el de octubre?", "Cambié la cifra", "Ok", "Actualizado", "¿Quién lo pidió?"][i % 7]);
    clip("e-dolor", "scene", s, d, `
      <div class="scroll"><div class="sc-in">${MSG.map((m, i) => `<div class="msg${i % 2 ? " r" : ""}">${m}</div>`).join("")}</div></div>
      <div class="regis"><p class="ph">REGISTRO</p><p class="rl">08:47 · Agente cambió margen 31,8 % → 32,4 %</p><p class="rl b">08:48 · Exportó informe</p><span class="goma"></span></div>
      <div class="sinprueba">${["¿Quién?", "¿Con qué?", "¿Cuándo?"].map((q) => `<span>${q}</span>`).join("")}</div>`);
    enter("e-dolor", s);
    at("#e-dolor .sc-in", { y: 0 }, { y: VERT ? -900 : -700, duration: tL - x.voiceAt, ease: "none" }, x.voiceAt);
    to("#e-dolor .scroll", { opacity: 0, duration: 0.4 }, tL - 0.3);
    at("#e-dolor .regis", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.45 }, tL);
    at("#e-dolor .rl:not(.b)", { clipPath: "inset(0 0% 0 0)" }, { clipPath: "inset(0 100% 0 0)", duration: 1, ease: "power1.inOut" }, P(x, "editar"));
    at("#e-dolor .goma", { x: 0, opacity: 0 }, { x: VERT ? 600 : 800, opacity: 1, duration: 1, ease: "power1.inOut" }, P(x, "editar"));
    sfx("whoosh-short.mp3", P(x, "editar"), 0.2);
    to("#e-dolor .regis", { opacity: 0.3, duration: 0.4 }, tC);
    ["quién actuó", "con qué", "cuándo"].forEach((f, i) => at(`#e-dolor .sinprueba span:nth-child(${i + 1})`, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.4, ease: "back.out(2)" }, P(x, f)));
    leave("e-dolor", s + d);
  }

  // 4. Cada acción deja un comprobante: quién, qué, con qué, cuándo; solo se agrega; huellas, no claves.
  {
    const x = S.comprobante; const [s, d] = span(x);
    const F = [["Quién", "Agente de finanzas · agente", "quién la hizo"], ["Qué", "Margen 31,8 % → 32,4 %", "qué hizo"], ["Con qué", "Hoja de cálculo · Claude", "con qué herramienta"], ["Cuándo", "16 nov 2026 · 08:47:12", "y cuándo"]];
    const tS = P(x, "Los comprobantes"), tH = P(x, "solo huellas");
    clip("e-comp", "scene", s, d, `
      <p class="center figcap">${words("Arvantti OS rinde cuentas.")}</p>
      <div class="badge-prom" style="--c:${CIAN}">RINDE CUENTAS</div>
      <div class="recibo"><p class="ph">COMPROBANTE #000847</p><dl>${F.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>
        <div class="pie"><span class="solo"><span class="lock"></span>Solo se agrega</span><span class="huella">Huella: 9f2c…a71e</span></div></div>`);
    enter("e-comp", s);
    wordsIn("#e-comp .figcap", x.voiceAt, 0.06);
    at("#e-comp .badge-prom", { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(2)" }, P(x, "rinde cuentas"));
    sfx("spark.wav", P(x, "rinde cuentas"), 0.2);
    at("#e-comp .recibo", { opacity: 0, y: 80 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, P(x, "Cada acción"));
    F.forEach(([, , f], i) => {
      at(`#e-comp dt:nth-of-type(${i + 1}), #e-comp dd:nth-of-type(${i + 1})`, { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 0.35 }, P(x, f));
      sfx("click-soft.mp3", P(x, f), 0.2);
    });
    at("#e-comp .solo", { opacity: 0, scale: 0.7 }, { opacity: 1, scale: 1, duration: 0.4, ease: "back.out(2)" }, tS);
    at("#e-comp .huella", { opacity: 0, scale: 0.7 }, { opacity: 1, scale: 1, duration: 0.4, ease: "back.out(2)" }, tH);
    sfx("click.wav", tS, 0.22);
    leave("e-comp", s + d);
  }

  // 5. Hoja de vida del agente.
  {
    const x = S.hoja; const [s, d] = span(x);
    clip("e-hoja", "scene", s, d, `
      <div class="hv"><p class="ph">HOJA DE VIDA DEL AGENTE</p><h3>Agente de finanzas</h3>
        <div class="hv-g"><div class="hv-i"><small>Versiones</small><b>v3 actual · v2 anterior</b></div><div class="hv-i"><small>Lo creó</small><b>Gerente financiera</b></div>
        <div class="hv-i"><small>Mejoras por aprobar</small><b>1 en espera</b></div></div>
        <div class="hv-b"><span class="volver">↺ Volver a v2</span><span class="apagar">⏻ Apagar</span></div></div>`);
    enter("e-hoja", s);
    at("#e-hoja .hv", { opacity: 0, y: 60 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, x.voiceAt);
    ["sus versiones", "quién lo creó", "las mejoras"].forEach((f, i) => {
      at(`#e-hoja .hv-i:nth-child(${i + 1})`, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.35 }, P(x, f));
      sfx("click-soft.mp3", P(x, f), 0.2);
    });
    at("#e-hoja .volver", { opacity: 0, scale: 0.7 }, { opacity: 1, scale: 1, duration: 0.35, ease: "back.out(2)" }, P(x, "volver"));
    at("#e-hoja .apagar", { opacity: 0, scale: 0.7 }, { opacity: 1, scale: 1, duration: 0.35, ease: "back.out(2)" }, P(x, "apagarlo"));
    to("#e-hoja .apagar", { backgroundColor: "#ff4d4d", duration: 0.2, yoyo: true, repeat: 1 }, P(x, "de inmediato"));
    sfx("click.wav", P(x, "apagarlo"), 0.25);
    leave("e-hoja", s + d);
  }

  // 6. Evidencia para auditores; ISO/IEC 42001.
  {
    const x = S.iso; const [s, d] = span(x);
    clip("e-iso", "scene", s, d, `
      <p class="center figcap">${words("La evidencia que piden auditores y clientes.")}</p>
      <div class="sello-iso"><b>ISO/IEC</b><span>42001</span></div>
      <div class="iso-t"><p class="i1">Apoya las prácticas de ISO/IEC 42001</p><p class="i0">La norma internacional para gestionar la IA en las empresas</p><p class="i2">Evidencia lista para la certificación</p></div>`);
    enter("e-iso", s);
    wordsIn("#e-iso .figcap", x.voiceAt, 0.06);
    const tA = P(x, "apoya");
    at("#e-iso .sello-iso", { opacity: 0, scale: 0.4, rotate: -20 }, { opacity: 1, scale: 1, rotate: 0, duration: 0.7, ease: "back.out(1.8)" }, tA);
    sfx("hit.wav", tA, 0.25);
    at("#e-iso .i1", { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 0.4 }, tA + 0.2);
    at("#e-iso .i0", { opacity: 0 }, { opacity: 1, duration: 0.4 }, P(x, "la norma"));
    at("#e-iso .i2", { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 0.4 }, P(x, "deja la evidencia"));
    sfx("spark.wav", P(x, "deja la evidencia"), 0.2);
    leave("e-iso", s + d);
  }

  // 7. Repaso del lunes: cada momento con su promesa; la cifra con su comprobante.
  {
    const x = S.repaso; const [s, d] = span(x);
    const M = [["8:02", "Se crea la tarea T-12", "organiza", "Organiza"], ["8:05", "Contexto con fuentes", "recuerda", "Recuerda"], ["8:14", "Salida a internet bloqueada", "controla", "Controla"], ["8:15", "Permiso: leer ventas", "controla", "Controla"], ["8:21", "Clave del banco tapada", "protege", "Protege"], ["9:10", "La gerente aprueba por voz", "ent", "Enterprise"]];
    const tC = P(x, "La cifra"), tT = P(x, "Todo, con");
    clip("e-repaso", "scene", s, d, `
      <div class="linea">${M.map(([h, t, p, n]) => `<div class="hito" style="--c:${PC[p] || "#4ea7ff"}"><span class="hh">${h}</span><span class="ht">${t}</span><span class="hp">${n}</span></div>`).join("")}</div>
      <div class="cifra-f"><p class="ph">MARGEN POR PRODUCTO · 32,4 %</p><p>Lo cambió: <b>Agente de finanzas</b></p><p>Lo aprobó: <b>Gerente</b></p><span class="sello-c">CON COMPROBANTE</span></div>`);
    enter("e-repaso", s);
    M.forEach(([h], i) => {
      const t = P(x, `${h},`);
      at(`#e-repaso .hito:nth-child(${i + 1})`, { opacity: 0, x: -40 }, { opacity: 1, x: 0, duration: 0.35, ease: "power3.out" }, t);
      at(`#e-repaso .hito:nth-child(${i + 1}) .hp`, { opacity: 0, scale: 0.5 }, { opacity: 1, scale: 1, duration: 0.3, ease: "back.out(2.5)" }, t + 0.5);
      sfx("click.wav", t, 0.18);
    });
    to("#e-repaso .linea", { opacity: 0.25, duration: 0.4 }, tC - 0.3);
    at("#e-repaso .cifra-f", { opacity: 0, scale: 0.85 }, { opacity: 1, scale: 1, duration: 0.5, ease: "power3.out" }, tC);
    at("#e-repaso .sello-c", { opacity: 0, scale: 1.8, rotate: -12 }, { opacity: 1, scale: 1, rotate: -6, duration: 0.3, ease: "power4.in" }, tT);
    sfx("hit.wav", tT + 0.25, 0.3);
    leave("e-repaso", s + d);
  }

  // 8. Figura completa: cinco promesas, un solo sistema operativo.
  {
    const x = S.completa; const [s, d] = span(x);
    const orden = [["organiza", "Organiza"], ["recuerda", "recuerda"], ["controla", "controla"], ["protege", "protege"], ["rinde", "rinde cuentas"]];
    clip("e-completa", "scene", s, d, `<p class="center figcap">${words("Cinco promesas, un solo sistema operativo.")}</p>${figura("fz")}`);
    enter("e-completa", s);
    orden.forEach(([id, f]) => {
      const i = PROMESAS.findIndex((p) => p.id === id);
      promOn(c, "fz", i, P(x, f));
      at(`#fz-p${i}`, { scale: 0.85 }, { scale: 1, duration: 0.4, ease: "back.out(2.5)" }, P(x, f));
      sfx("click.wav", P(x, f), 0.18);
    });
    wordsIn("#e-completa .figcap", P(x, "Cinco promesas"), 0.07);
    to("#fz-ent", { boxShadow: "0 0 0 4px #4ea7ff, 0 0 90px #2d7ff9", duration: 0.5 }, P(x, "Cinco promesas"));
    to("#fz-base", { boxShadow: "0 0 0 4px #4ea7ff, 0 0 90px #2d7ff9", duration: 0.5 }, P(x, "para todas"));
    sfx("spark.wav", P(x, "para todas"), 0.25);
    leave("e-completa", s + d);
  }

  // 9. Firma y cierre de la serie, con la tarjeta del diagnóstico.
  firma(c, S.firma);
  {
    const x = S.firma; const [s, d] = span(x);
    const t = P(x, "La IA") + 2.0;
    clip("e-diag", "", t, s + d - t, `<div class="fin-serie">FIN DE LA SERIE</div><div class="diag"><b>Diagnóstico de gobernanza de IA</b><span>Agende su sesión en arvantti.tech</span></div>`, 35);
    at("#e-diag .fin-serie", { opacity: 0, y: -20 }, { opacity: 1, y: 0, duration: 0.6 }, t);
    at("#e-diag .diag", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.7, ease: "power3.out" }, t + 0.3);
    to("#e-diag .diag, #e-diag .fin-serie", { opacity: 0, duration: 0.8 }, s + d - 0.9);
  }

  [S.gancho, S.dolor, S.comprobante, S.hoja, S.iso, S.repaso, S.completa, S.firma].forEach((x) => sweep(x.start));
}
