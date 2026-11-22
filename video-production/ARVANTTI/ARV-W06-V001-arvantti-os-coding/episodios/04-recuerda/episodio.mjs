// Parte 4 de 9 · Recuerda · Brain. Martes, 9:25: el agente de finanzas va directo a cuatro archivos.
import { escena, escenas, kicker, recap, selloEp, firma, term, card, chip, chips, big, mod, reloj, file, cnt, AG, LAV } from "../../comun.mjs";

export const ESCENAS = escenas(new URL("./escenas/", import.meta.url));
const barra = (l, col) => `<div class="barra" style="--c:${col}"><span>${l}</span><div class="bt"><i class="bf"></i></div></div>`;

export function componer(c) {
  const { S } = c;
  kicker(c, 4, S.recap.start, S.firma.start);
  recap(c, S.recap);

  escena(c, S.gancho, { panels: [{ items: [
    { h: term({ t: "agente", c: "#4ea7ff", l: ["leyendo src/…", "leyendo src/modules/…", "leyendo tests/…", "leyendo docs/…"], gap: 0.2 }), cls: "w2", at: 0, gap: 0.5 },
    { h: cnt("costo de la tarea", "0", "#ff6b63"), cls: "w3 ctr", at: "lee todo", count: { at: "lee todo", from: 0, to: 4800, dur: 3, fmt: " tokens" } },
    { h: big("Y tú pagas cada línea", "m"), cls: "w1", at: "Y tú pagas", fx: "pop" },
  ] }] });

  escena(c, S.dolor, {
    panels: [{ items: [
      { h: card({ k: "sesión nueva", t: "¿Qué se decidió ayer?", p: "Empieza de cero", c: "#ff6b63" }), cls: "w3", at: 0 },
      { h: term({ t: "a ciegas", c: "#ff6b63", l: ["ls src/", "ls src/core/", "ls src/legacy/", "ls src/utils/"] }), cls: "w3", at: "Recorre carpetas" },
      { h: `<div class="col2" style="width:100%">${barra("contexto", "#ff6b63")}</div>`, cls: "w3", at: "se llena", fill: ["se llena", 1, 1.6] },
      { h: big("La factura sube", "m"), cls: "w1", at: "la factura", fx: "pop" },
    ] }],
    glos: [["se llena de contexto", "contexto", "lo que la IA tiene en mente al trabajar"]],
  });

  escena(c, S.brain, { panels: [{ items: [
    { h: mod(1), cls: "w1 ctr", at: "Brain", fx: "pop" },
    { h: card({ k: "cerebro 1 · proyecto", t: "Dónde va el trabajo", p: "Tareas, planes y documentos", c: "#d8dadf" }), cls: "w3", at: "El de proyecto" },
    { h: card({ k: "cerebro 2 · Graph Brain", t: "Las decisiones", b: chips(["Tarea", "Decisión", "Persona", "Evidencia"], "#d8dadf"), c: "#d8dadf" }), cls: "w3", at: "El Graph Brain", subs: ["quién decidió", "qué,", "cuándo", "evidencia"] },
  ] }] });

  escena(c, S.mapa, { panels: [{ items: [
    { h: card({ k: "cerebro 3 · edición Coding", t: "Understanding Repo", p: "Qué hace cada parte y de qué depende", c: LAV }), cls: "w2", at: 0, fx: "pop" },
    { h: `<div class="mapa">${["api", "costos", "ordenes", "piso", "finanzas", "pruebas"].map((n) => `<span class="sub">${n}</span>`).join("")}</div>`, cls: "w2", at: "el mapa del código", gap: 0.15 },
    { h: chips(["worktree finanzas", "worktree piso", "worktree pruebas"], LAV), cls: "w1", at: "un mapa por cada worktree", subs: ["un mapa por cada worktree", "por cada worktree", "sigue cada cambio"] },
    { h: chips(["Contexto: particular", "Contexto: global"], "#4ea7ff"), cls: "w1", at: "su propia copia", subs: ["su propia copia", "proyecto entero"] },
  ] }] });

  escena(c, S.cache, {
    panels: [{ items: [
      { h: term({ t: "agente de finanzas", h: "Claude Code", c: AG.fin, l: ["contexto: solo su tarea", "+ habilidad: costeo", "+ habilidad: pruebas"] }), cls: "w2", at: 0, subs: ["solo lo que su tarea", "sus habilidades", "cuando hacen falta"] },
      { h: `<div class="col2" style="width:100%">${barra("caché · ya leído, se reutiliza", "#7dd3a8")}</div>`, cls: "w2", at: "cuida el caché", fill: ["cuida el caché", 0.85, 1.2] },
      { h: card({ k: "respuesta", t: "El costo se calcula en costos/orden.ts", p: "Fuente: mapa del código · decisión del 3 de noviembre", c: "#4ea7ff" }), cls: "w23", at: "cita su fuente", fx: "pop" },
    ] }],
    glos: [["cuida el caché", "caché", "lo que la IA ya leyó y se reutiliza más barato"]],
  });

  escena(c, S.martes, { panels: [{ items: [
    { h: reloj("9:25"), cls: "w1 ctr", at: 0 },
    { h: `<div class="mapa">${["api", "costos", "ordenes", "piso", "finanzas", "pruebas"].map((n) => `<span class="${n === "costos" ? "lit" : ""}">${n}</span>`).join("")}</div>`, cls: "w3", at: "El mapa del código", on: [["dónde se calcula", ".lit"]] },
    { h: card({ k: "Graph Brain · decisión", t: "Costear con los tiempos reales del piso, no con los estándar", p: "Líder técnica · 3 de noviembre", c: "#d8dadf" }), cls: "w3", at: "el Graph Brain" },
    { h: `<div class="col2">${["costos/orden.ts", "costos/tiempos.ts", "piso/reportes.ts", "finanzas/asientos.ts"].map((f) => file(f, "#4ea7ff", "sub")).join("")}</div>`, cls: "w3 ctr", at: "Lee cuatro", gap: 0.15 },
    { h: cnt("archivos leídos", "4 de 400", "#7dd3a8"), cls: "wa", at: "no cuatrocientos", fx: "pop" },
    { h: chip("Con fuente", "#7dd3a8"), cls: "wa", at: "Con fuente", fx: "pop" },
  ] }] });

  selloEp(c, S.figura, S.siguiente, { mods: [1], cod: true, n: 4, sigue: "Controla · Policy y Grants" });
  firma(c, S.firma);
  [S.gancho, S.dolor, S.brain, S.mapa, S.cache, S.martes, S.figura, S.firma].forEach((x) => c.sweep(x.start));
}
