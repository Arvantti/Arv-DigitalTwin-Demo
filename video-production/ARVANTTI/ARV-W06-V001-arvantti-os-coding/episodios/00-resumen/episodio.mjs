// Resumen de la serie Arvantti OS Coding (reemplaza a CodingHarness-capacidades v004).
import { escena, escenas, selloEp, firma, term, card, chip, chips, big, mod, coding, figura, modOn, codOn, file, sello, cnt, per, escalera, flow, arbol, MODS, AG, LAV } from "../../comun.mjs";

export const ESCENAS = escenas(new URL("./escenas/", import.meta.url), { figura: { lead: 0.3, tail: 1.6 } });
const barra = (l, col) => `<div class="barra" style="--c:${col}"><span>${l}</span><div class="bt"><i class="bf"></i></div></div>`;

export function componer(c) {
  const { S, P, at, to } = c;
  c.clip("kick", "", S.pregunta.start, S.firma.start - S.pregunta.start, `<p class="kicker">RESUMEN · ARVANTTI OS <span>CODING</span></p>`, 30);
  at("#kick .kicker", { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 0.6 }, 0.2);

  escena(c, S.pregunta, { panels: [{ items: [
    { h: term({ t: "terminal 1", h: "Claude Code", c: AG.fin, l: ["$ abre <b>costos.ts</b>", "editando línea 42…"] }), cls: "w3", at: 0 },
    { h: term({ t: "terminal 2", h: "Codex", c: AG.piso, l: ["$ abre <b>costos.ts</b>", "editando línea 42…"] }), cls: "w3", at: 0.4 },
    { h: term({ t: "terminal 3", h: "Gemini", c: AG.qa, l: ["$ abre <b>costos.ts</b>", "editando línea 42…"] }), cls: "w3", at: 0.8 },
    { h: big("¿Quién los gobierna?"), cls: "w1", at: "¿Quién", fx: "pop" },
  ] }] });

  escena(c, S.titulo, { panels: [{ items: [
    { h: `<img class="marca" src="assets/clips/marca.png" alt="" style="width:170px">`, cls: "w1", at: 0, fx: "pop" },
    { h: card({ k: "Arvantti Operating System for AI", t: "El sistema operativo empresarial para la IA", cls: "ctr" }), cls: "w23", at: "el sistema operativo" },
    { h: coding(), cls: "w1 ctr", at: "Arvantti OS Coding", fx: "pop" },
    { h: `<p class="lead">Su edición para equipos de software</p>`, cls: "w1", at: "su edición" },
  ] }] });

  const IA = ["Claude Code", "Codex", "Gemini", "Copilot", "OpenCode", "Kimi", "Modelos locales"];
  escena(c, S.base, {
    panels: [{ cap: "No los reemplaza: los envuelve", body: "col", items: [
      { h: `<div class="chips">${IA.map((n) => chip(n, "#4ea7ff", "sub")).join("")}</div>`, cls: "w1", at: 0, subs: ["Claude Code", "Codex", "Gemini", "Copilot", "OpenCode", "Kimi", "modelos locales"] },
      { h: chip("Sin cambiar cómo trabaja cada uno", LAV), cls: "w1 ctr", at: "sin cambiar" },
      { h: `<div class="cli">CLI de Arvantti <small>el contrato estable</small></div>`, cls: "w1", at: "Todo pasa", fx: "pop" },
      { h: chips(["Linux", "Mac", "Windows", "Nube"], "#4ea7ff"), cls: "w1", at: "En Linux", subs: ["Linux", "Mac", "Windows", "nube"] },
    ] }],
    glos: [["su línea de comandos", "CLI", "línea de comandos: la forma de hablarle al sistema escribiendo órdenes"]],
  });

  {
    const x = S.nucleo;
    escena(c, x, { panels: [{ items: [{ h: figura("f1"), cls: "w1", at: -0.2, fx: "fade" }] }] });
    at("#f1-nuc", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.5 }, x.voiceAt);
    MODS.forEach((_, i) => modOn(c, "f1", i, P(x, "seis módulos") + 0.2 + i * 0.22));
    to("#f1-cli", { boxShadow: "0 0 70px #4ea7ff", duration: 0.4 }, P(x, "las mismas reglas"));
    codOn(c, "f1", P(x, "Y todo"));
    c.clip("medida", "", P(x, "Y todo") - 0.1, x.start + x.dur - P(x, "Y todo") + 0.1, `<div class="center" style="position:absolute;left:0;right:0;bottom:${c.VERT ? 220 : 70}px;display:flex;justify-content:center">${sello("A la medida de tu empresa", LAV)}</div>`, 20);
    at("#medida .stamp", { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(2)" }, P(x, "se personaliza"));
  }

  escena(c, S.tasks, {
    panels: [{ items: [
      { h: mod(0), cls: "w1 ctr", at: "Tasks", fx: "pop" },
      { h: escalera(), cls: "w23", at: "mide cuánto", on: [["directo", '[data-k="0"]'], ["tarea", '[data-k="1"]'], ["mini SDD", '[data-k="2"]'], ["SDD completo", '[data-k="3"]']] },
      { h: `<div class="col2">${file("SDD-P07", "#4ea7ff", "sub")}${chip("Enlazado a la tarea P-07", LAV, "sub")}</div>`, cls: "w3 ctr", at: "Cada plan", subs: ["documentado", "enlazado"] },
    ] }],
    glos: [["SDD es", "SDD", "desarrollo guiado por especificación: el plan escrito antes de programar"]],
  });

  const T3 = [["Claude Code", AG.fin, "finanzas"], ["Codex", AG.piso, "control-piso"], ["Gemini", AG.qa, "pruebas"]];
  escena(c, S.terminales, {
    panels: [
      { items: [
        ...T3.map(([h, col, w], i) => ({ h: term({ t: `terminal ${i + 1}`, h, c: col, l: [`worktree: <b>${w}/</b>`, `rama: <b>p07-${w}</b>`] }), cls: "w3", at: 0.2 + i * 0.3, subs: ["su propio worktree", "con su rama"] })),
        { h: chip("Con el asistente que tú elijas", LAV), cls: "w1 ctr", at: "con el asistente" },
      ] },
      { at: "Avanzan en paralelo", items: [
        { h: flow(["Rama de la tarea", "Commit", "Pull request", "Aprueba una persona"], { c: "#4ea7ff" }), cls: "w1", at: "integrados con Git", gap: 0.18 },
        { h: arbol([["Agente de finanzas", "Claude Code", AG.fin, ["subagente: pruebas"]], ["Agente de piso", "Codex", AG.piso, ["subagente: UI"]], ["Agente de pruebas", "Gemini", AG.qa, ["subagente: datos"]]]), cls: "w23", at: "un árbol" },
        { h: cnt("choques", "0", "#7dd3a8"), cls: "w3 ctr", at: "sin pisarse", fx: "pop" },
        { h: chip("Quién delegó qué, a qué subagente", LAV), cls: "w1 ctr", at: "a qué subagentes" },
      ] },
    ],
    glos: [["worktree", "worktree", "una copia de trabajo aparte del mismo repositorio"], ["con Git", "Git", "el sistema que guarda la historia del código"]],
  });

  escena(c, S.brain, {
    panels: [{ items: [
      { h: mod(1), cls: "w1 ctr", at: "Brain", fx: "pop" },
      { h: card({ k: "cerebro 1", t: "Proyecto", p: "Tareas, planes y documentos", c: "#d8dadf" }), cls: "w3", at: "el proyecto" },
      { h: card({ k: "cerebro 2 · Graph Brain", t: "Decisiones", p: "Un grafo con fuente", c: "#d8dadf" }), cls: "w3", at: "las decisiones" },
      { h: card({ k: "cerebro 3 · edición Coding", t: "Mapa del código", p: "Lleva directo a lo que necesita", c: LAV }), cls: "w3", at: "el mapa del código" },
      { h: cnt("archivos leídos", "4 de 400", "#7dd3a8"), cls: "wa", at: "Lee cuatro", fx: "pop" },
      { h: chips(["Menos contexto", "Menos costo", "Con fuente"], "#7dd3a8"), cls: "wa", at: "Menos contexto", subs: ["Menos contexto", "menos costo", "con fuente"] },
    ] },
    { at: "Y tú decides", cap: "Tú decides dónde documentar", items: [
      { h: card({ k: "junto al código", t: "Archivos .md", c: "#4ea7ff" }), cls: "w3", at: "en archivos .md", on: "o en ambos" },
      { h: card({ k: "tres cerebros", t: "Base de datos", c: LAV }), cls: "w3", at: "en la base de datos", on: "o en ambos" },
      { h: sello("O en ambos", LAV), cls: "w3 ctr", at: "o en ambos", fx: "pop" },
    ] }],
    glos: [["Menos contexto", "contexto", "lo que la IA tiene en mente al trabajar"]],
  });

  escena(c, S.controla, {
    panels: [{ items: [
      { h: `<div class="chips">${mod(2)}${mod(3)}</div>`, cls: "w1 ctr", at: "Policy", fx: "pop" },
      { h: card({ k: "tus reglas · configurables · se cumplen con hooks", t: "Policy", rows: [["Leer", "todo el proyecto"], ["Escribir", "solo su carpeta"], ["Instalar", "librerías aprobadas"]], subRows: true, c: "#2d7ff9" }), cls: "w2", at: "tú configuras" },
      { h: flow(["Hook antes", "Acción", "Hook después"], { c: "#2d7ff9" }), cls: "w2", at: "los hooks", subs: ["antes", "cada acción", "después"] },
      { h: card({ k: "Grants · permiso puntual", t: "finanzas/ · solo para la tarea", c: "#2d7ff9" }), cls: "w2", at: "Grants" },
      { h: card({ k: "rama principal", t: "Espera el sí de una persona", c: LAV }), cls: "w2", at: "subir a la rama", fx: "pop" },
    ] }],
    glos: [["los hooks", "hook", "punto de control antes y después de cada acción"]],
  });

  const G = "#7ec8ff";
  escena(c, S.guardianes, {
    panels: [{ items: [
      { h: mod(4), cls: "w1 ctr", at: "Los guardianes", fx: "pop" },
      { h: card({ k: "escudo", t: "Ruta segura", p: "Dentro de su proyecto", c: G }), cls: "w3", at: "en su ruta" },
      { h: card({ k: "escudo", t: '<span class="sw"><span class="sa red">sk-live-9f2c…</span><span class="sb">•••• tapada</span></span>', p: "Claves tapadas", c: G }), cls: "w3", at: "tapan las claves", swap: "tapan las claves" },
      { h: term({ t: "erp-api.ts", c: G, l: ['const key = env("<b>ERP_API_KEY</b>")', "valor: •••• (no lo ve)"] }), cls: "w23", at: "Puede programar", subs: ["sin ver nunca", "por su nombre"] },
      { h: chips(["Tu memoria", "Tu código", "En tu equipo o tu nube privada"], G), cls: "w1", at: "Y tu memoria", subs: ["tu memoria", "tu código", "nube privada"] },
    ] }],
    glos: [["el ERP", "ERP", "el sistema de gestión de la empresa"]],
  });

  escena(c, S.concilio, { panels: [{ items: [
    { h: coding("Room de concilio"), cls: "w1 ctr", at: "room de concilio", fx: "pop" },
    { h: `<div class="mesa"><span class="ag sub" style="--c:${AG.fin}">Agente de finanzas</span><span class="ag sub" style="--c:${AG.piso}">Agente de piso</span><span class="ag sub" style="--c:${AG.qa}">Agente de pruebas</span><span class="sub">${per("Tú", "TÚ")}</span></div>`, cls: "w1", at: "los agentes hablan", subs: ["los agentes", "hablan", "contigo", "contigo"] },
    { h: card({ k: "propuesta 1", t: "Cada movimiento al instante", c: AG.piso }), cls: "w3", at: "cada uno presenta", off: "tú decides" },
    { h: card({ k: "propuesta 2", t: "Consolidar por turno", c: AG.fin }), cls: "w3", at: "sus razones", on: "tú decides" },
    { h: card({ k: "reparto", t: "Tarea → Terminal", c: LAV }), cls: "w3", at: "se reparten", fx: "pop" },
  ] }] });

  escena(c, S.fractal, { panels: [{ items: [
    { h: card({ k: "Optimización y apoyo a la decisión", t: "Fractal Process", p: "En el núcleo de Arvantti OS", c: LAV, cls: "ctr" }), cls: "w1 ctr", at: "Fractal Process", fx: "pop" },
    { h: flow(["Reglas y objetivos", "Alternativas y probabilidad", "Tú decides"], { c: LAV }), cls: "w1", at: "Primero incorpora", subs: ["Primero incorpora", "evalúa las alternativas", "para que tú decidas"] },
    { h: card({ k: "propuesta 1", t: "Cada movimiento al instante", b: barra("probabilidad de éxito", AG.piso), c: AG.piso }), cls: "w2", at: "como las propuestas", fill: ["qué tan probable", 0.62, 1.2] },
    { h: card({ k: "propuesta 2", t: "Consolidar por turno", b: barra("probabilidad de éxito", AG.fin), c: AG.fin }), cls: "w2", at: "como las propuestas", fill: ["qué tan probable", 0.86, 1.2] },
  ] }] });

  const PASOS = ["Observar", "Planear", "Ejecutar", "Verificar", "Aprobar", "Comprobante"];
  escena(c, S.flujos, {
    panels: [
      { items: [
        { h: coding("Tus flujos agénticos"), cls: "w1 ctr", at: 0, fx: "pop" },
        { h: flow(PASOS, { c: LAV }), cls: "w1", at: "recetas paso a paso", gap: 0.2 },
        { h: chips(["Tus agentes", "Tus habilidades", "+100 incluidas"], LAV), cls: "w1", at: "con tus agentes", subs: ["tus agentes", "habilidades", "más de cien"] },
        { h: `<div class="col2" style="width:100%">${barra("caché · intacto", "#7dd3a8")}${barra("contexto · no se reinicia", "#4ea7ff")}</div>`, cls: "w2", at: "los inyecta", fill: ["sin dañar", 1, 0.6] },
      ] },
      { at: "Y en cada commit", items: [
        { h: term({ t: "commit", h: "Codex", c: AG.piso, l: ['"<b>P-07 · avance en vivo</b>"'] }), cls: "w2", at: 0 },
        { h: flow(["QA de código ✓", "QA funcional ✓", "Revisión"], { c: "#7dd3a8" }), cls: "w1", at: "revisa el código", subs: ["el código", "cómo funciona", "antes de la revisión"] },
      ] },
    ],
    glos: [["flujos agénticos", "flujo agéntico", "receta de trabajo que siguen los agentes"], ["un hook de QA", "QA", "el control de calidad del software"]],
  });

  escena(c, S.dirige, { panels: [{ cap: "Un panel para dirigir", items: [
    { h: term({ t: "panel de dirección", c: LAV, l: ["> ¿qué avanzó hoy en P-07?", "finanzas · terminada · conexión con el ERP", "> ¿quién aprobó la subida?", "la líder técnica · 10:58", "> ¿qué está bloqueado?", "pruebas · espera tu aprobación"] }), cls: "w2", at: "le preguntas", subs: ["qué avanzó", "qué avanzó", "quién aprobó", "quién aprobó", "qué está bloqueado", "qué está bloqueado"] },
    { h: `<div class="col2">${chips(["Escritorio", "Nube"], "#4ea7ff")}${sello("Un mismo cerebro para todo tu equipo", LAV)}</div>`, cls: "w2 ctr", at: "en el escritorio", subs: ["escritorio", "nube"] },
  ] }] });

  const W0 = "#f8fafc";
  escena(c, S.receipts, { panels: [
    { items: [
      { h: mod(5), cls: "w1 ctr", at: "Receipts", fx: "pop" },
      { h: card({ k: "comprobante", t: "Cada acción", rows: [["Quién", "Persona o agente"], ["Qué", "El antes y el después"], ["Con qué IA", "Claude Code"], ["Permiso", "El que tenía"], ["Cuándo", "Fecha y hora exactas"]], subRows: true, c: W0 }), cls: "w2", at: "deja un comprobante", subs: ["quién,", "qué,", "con qué IA", "con qué permiso", "y cuándo"] },
      { h: `<div class="col2">${sello("Solo se agrega", W0)}${chips(["Commit", "Tarea", "SDD"], "#4ea7ff")}</div>`, cls: "w2 ctr", at: "no se puede borrar", subs: ["su commit", "su tarea", "y su SDD"] },
    ] },
    { at: "Apoya las prácticas", items: [
      { h: sello("ISO/IEC 42001", "#4ea7ff"), cls: "w1 ctr", at: 0, fx: "pop" },
      { h: `<p class="lead">La norma internacional para gestionar la IA</p>`, cls: "w1", at: "la norma" },
      { h: chip("Evidencia lista para la certificación", "#7dd3a8"), cls: "w1 ctr", at: "deja la evidencia", fx: "pop" },
    ] },
  ] });

  selloEp(c, S.figura, null, { mods: [0, 1, 2, 3, 4, 5], cod: true, n: 0 });
  firma(c, S.firma, { cta: ["Te acompañamos a implementarlo", "Agenda tu sesión en arvantti.tech", "Te acompañamos"] });
  [S.titulo, S.base, S.nucleo, S.tasks, S.terminales, S.brain, S.controla, S.guardianes, S.concilio, S.fractal, S.flujos, S.dirige, S.receipts, S.figura, S.firma].forEach((x) => c.sweep(x.start));
}
