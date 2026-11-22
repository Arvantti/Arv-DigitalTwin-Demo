// Parte 3 de 9 · Terminales, worktrees y multi arnés. Martes, 9:20: tres agentes arrancan en paralelo.
import { escena, escenas, kicker, recap, selloEp, firma, term, card, chip, chips, big, coding, reloj, sello, cnt, flow, arbol, AG, LAV } from "../../comun.mjs";

export const ESCENAS = escenas(new URL("./escenas/", import.meta.url));

export function componer(c) {
  const { S } = c;
  kicker(c, 3, S.recap.start, S.firma.start);
  recap(c, S.recap);

  escena(c, S.gancho, { panels: [{ items: [
    ...[["agente 1", AG.fin], ["agente 2", AG.piso], ["agente 3", AG.qa]].map(([t, col], i) => ({ h: term({ t, c: col, l: ["repo: <b>p07/</b>", "escribiendo línea 42…"] }), cls: "w3", at: i * 0.3 })),
    { h: big("¿Qué podría salir mal?"), cls: "w1", at: "¿Qué", fx: "pop" },
  ] }] });

  escena(c, S.dolor, {
    panels: [{ items: [
      { h: card({ k: "misma carpeta", t: '<span class="sw"><span class="sa">costos.ts · versión A</span><span class="sb red">costos.ts · borrado</span></span>', c: "#4ea7ff" }), cls: "w3", at: 0, swap: "uno borra", alert: "uno borra" },
      { h: card({ k: "pruebas", t: "Fallan sin saber por qué", c: "#ff6b63" }), cls: "w3", at: "Las pruebas", fx: "pop" },
      { h: card({ k: "tú", t: "Abriendo ventanas para adivinar", c: "#ff6b63" }), cls: "w3", at: "abriendo ventanas", fx: "pop" },
    ] }],
    glos: [["la misma carpeta", "repositorio", "la carpeta del código con toda su historia"]],
  });

  const T3 = [["Claude Code", AG.fin, "finanzas"], ["Codex", AG.piso, "control-piso"], ["Gemini", AG.qa, "pruebas"]];
  escena(c, S.terminal, {
    panels: [{ items: [
      { h: coding(), cls: "w1 ctr", at: 0, fx: "pop" },
      ...T3.map(([h, col, w], i) => ({ h: term({ t: `terminal ${i + 1}`, h, c: col, l: [`worktree: <b>${w}/</b>`, `rama: <b>p07-${w}</b>`] }), cls: "w3", at: i ? `su propia terminal` : "su propia terminal", subs: ["su worktree", "su propia rama"] })),
      { h: sello("Revisado · se junta", "#7dd3a8"), cls: "w1 ctr", at: "listo y revisado", fx: "pop" },
    ] }],
    glos: [["su worktree", "worktree", "una copia de trabajo aparte del mismo repositorio"], ["su propia rama", "rama", "una línea de cambios separada"]],
  });

  escena(c, S.git, {
    panels: [{ cap: "Integrado con Git", items: [
      { h: flow(["Rama de la tarea", "Commit · P-07 · SDD-P07", "Pull request", "Aprueba una persona"], { c: "#4ea7ff" }), cls: "w1", at: "Todo va integrado", subs: ["cada tarea abre", "cada commit", "con un pull request", "aprueba una persona"] },
      { h: term({ t: "git", c: "#4ea7ff", l: ['$ git commit -m "<b>P-07 · SDD-P07</b>: conexión finanzas"', "✓ commit guardado en p07-finanzas"] }), cls: "w23", at: "cada commit" },
      { h: card({ k: "pull request", t: "Espera aprobación", c: LAV, cls: "ctr" }), cls: "w3", at: "aprueba una persona", fx: "pop" },
    ] }],
    glos: [["con Git", "Git", "el sistema que guarda la historia del código"], ["cada commit", "commit", "un cambio guardado"], ["pull request", "pull request", "solicitud para juntar cambios, que revisa una persona"]],
  });

  escena(c, S.panel, { panels: [
    { cap: "Un solo panel con todas las terminales", items: [
      ...[["Claude Code", AG.fin, "finanzas · en curso"], ["Codex", AG.piso, "control de piso · en curso"], ["Gemini", AG.qa, "pruebas · espera tu aprobación"], ["Codex", AG.piso, "formato de fecha · terminada"]].map(([h, col, l], i) => ({ h: term({ t: `terminal ${i + 1}`, h, c: col, l: [l] }), cls: "w2", at: 0.2 + i * 0.25 })),
      { h: chips(["Entrar", "Escribirle", "Detener"], LAV), cls: "w1", at: "Puedes entrar", subs: ["Puedes entrar", "escribirle", "detenerla"] },
    ] },
    { at: "Y un árbol", items: [
      { h: arbol([["Agente de finanzas", "Claude Code", AG.fin, ["subagente: pruebas", "subagente: docs"]], ["Agente de piso", "Codex", AG.piso, ["subagente: UI"]], ["Agente de pruebas", "Gemini", AG.qa, ["subagente: datos"]]]), cls: "w23", at: 0.0 + 0, on: [["tocas un agente", '[data-n="0"]']] },
      { h: term({ t: "terminal 1", h: "Claude Code", c: AG.fin, l: ["finanzas · en curso", "sigue trabajando igual"] }), cls: "w3", at: "llegas a su terminal", on: "llegas a su terminal" },
    ] },
  ] });

  const H4 = [["Claude Code", AG.fin], ["Codex", AG.piso], ["OpenCode", "#d8dadf"], ["Gemini", AG.qa]];
  escena(c, S.multi, {
    panels: [{ items: [
      { h: sello("Multi arnés", LAV), cls: "w1 ctr", at: 0, fx: "pop" },
      ...H4.map(([h, col], i) => ({ h: term({ t: `T${i + 1}`, h, c: col, l: ["↳ subagente", "↳ subagente"] }), cls: "w4", at: h === "Claude Code" ? "Claude Code" : h })),
      { h: card({ k: "Arvantti", t: "Solo les da el contexto adecuado", c: LAV, cls: "ctr" }), cls: "w2", at: "solo les da" },
      { h: chips(["No modifica sus arneses", "No daña su contexto", "No cambia cómo trabajan"], LAV), cls: "w1", at: "Arvantti no modifica", subs: ["no modifica", "no daña", "ni cambia"] },
    ] }],
    glos: [["su propio arnés", "arnés", "el entorno propio de cada asistente"], ["sus subagentes", "subagente", "ayudante que el asistente lanza por su cuenta"]],
  });

  escena(c, S.coordinadora, { panels: [{ items: [
    { h: term({ t: "terminal coordinadora", h: "P-07", c: LAV, cls: "coord", l: ["reparte: finanzas → T1 · piso → T2 · pruebas → T3", "sigue: 3 en curso"] }), cls: "w23", at: "terminal coordinadora", fx: "pop" },
    { h: `<div class="barra" style="--c:${LAV}"><span>su contexto · claro y limpio</span><div class="bt"><i class="bf"></i></div></div>`, cls: "w23", at: "su contexto", fill: ["su contexto", 0.22, 1] },
    ...T3.map(([h, col, w], i) => ({ h: term({ t: `T${i + 1}`, h, c: col, l: [w] }), cls: "w4 vw2", at: "reparte" })),
  ] }] });

  escena(c, S.martes, { panels: [{ items: [
    { h: reloj("9:20"), cls: "w1 ctr", at: 0 },
    { h: term({ t: "terminal 1", h: "Claude Code", c: AG.fin, l: ["conexión con finanzas", "worktree: finanzas/"] }), cls: "w3", at: "Claude Code" },
    { h: term({ t: "terminal 2", h: "Codex", c: AG.piso, l: ["pantalla de control de piso", "worktree: control-piso/"] }), cls: "w3", at: "Codex" },
    { h: term({ t: "terminal 3", h: "Gemini", c: AG.qa, l: ["pruebas", "worktree: pruebas/"] }), cls: "w3", at: "Gemini" },
    { h: chip("3 tareas en curso", "#4ea7ff"), cls: "wa", at: "tres tareas" },
    { h: cnt("choques", "0", "#7dd3a8"), cls: "wa", at: "cero choques", fx: "pop" },
  ] }] });

  selloEp(c, S.figura, S.siguiente, { cod: true, n: 3, sigue: "Recuerda · Brain" });
  firma(c, S.firma);
  [S.gancho, S.dolor, S.terminal, S.git, S.panel, S.multi, S.coordinadora, S.martes, S.figura, S.firma].forEach((x) => c.sweep(x.start));
}
