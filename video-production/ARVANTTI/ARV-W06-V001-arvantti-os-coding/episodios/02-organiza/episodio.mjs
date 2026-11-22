// Parte 2 de 9 · Organiza · Tasks. Martes, 9:02: SDD completo para P-07, mini SDD y tarea simple para otros pedidos.
import { escena, escenas, kicker, recap, selloEp, firma, term, card, chip, chips, big, mod, reloj, per, file, sello, alerta, cnt, escalera, tablero, AG, LAV } from "../../comun.mjs";

export const ESCENAS = escenas(new URL("./escenas/", import.meta.url));

export function componer(c) {
  const { S } = c;
  kicker(c, 2, S.recap.start, S.firma.start);
  recap(c, S.recap);

  escena(c, S.gancho, { panels: [{ items: [
    { h: term({ t: "terminal", h: "asistente", c: "#4ea7ff", l: ["> cambia el formato del reporte", "modificando archivos…"] }), cls: "w2", at: 0 },
    { h: cnt("archivos modificados", "0", "#ff6b63"), cls: "w3 ctr", at: 0.4, count: { at: "en diez minutos", from: 0, to: 40, dur: 2.2 } },
    { h: big("¿Ese era el plan?"), cls: "w1", at: "¿Ese", fx: "pop" },
  ] }] });

  escena(c, S.dolor, { panels: [{ items: [
    { h: card({ k: "planea de más", t: "40 páginas para cambiar una línea", c: "#ff6b63" }), cls: "w3", at: "A veces", fx: "pop" },
    { h: card({ k: "sin plan", t: "Algo grande, programado a ciegas", c: "#ff6b63" }), cls: "w3", at: "Otras", fx: "pop" },
    { h: card({ k: "en el chat", t: "Pedidos que se pierden", c: "#ff6b63" }), cls: "w3", at: "Los pedidos", fx: "pop" },
    { h: big("¿Qué quedó terminado?", "m"), cls: "w1", at: "nadie sabe", fx: "pop" },
  ] }] });

  escena(c, S.tasks, { panels: [{ items: [
    { h: mod(0), cls: "w1 ctr", at: "Tasks", fx: "pop" },
    { h: escalera(), cls: "w23", at: "mide cuánto", on: [["se hace directo", '[data-k="0"]'], ["queda como tarea", '[data-k="1"]'], ["mini SDD", '[data-k="2"]'], ["SDD completo", '[data-k="3"]']] },
    { h: card({ k: "tarea", t: "Trabajo normal", rows: [["Dueño", "Agente de finanzas"], ["Estado", "Por hacer"], ["Fecha", "Martes"]], subRows: true }), cls: "w3", at: "queda como tarea", subs: ["dueño", "estado", "fecha"] },
  ] }] });

  escena(c, S.sdd, {
    panels: [{ items: [
      { h: card({ k: "SDD · el plan escrito", t: "Antes de programar", rows: [["1", "Qué se va a construir"], ["2", "Cómo"], ["3", "Cómo se comprueba"]], subRows: true, cls: "chk" }), cls: "w2", at: 0, subs: ["qué se va a construir", "cómo, y", "comprobar"] },
      { h: `<div class="col2">${sello("Aprobar plan", "#4ea7ff")}${chips(["Persona", "Agente"], "#4ea7ff")}</div>`, cls: "w3 ctr", at: "Tú apruebas", fx: "pop", subs: ["una persona", "un agente"] },
      { h: tablero([["Por hacer", ["Pruebas"]], ["En curso", ["Finanzas", "Control de piso"]], ["Terminada", []]]), cls: "w1", at: "tablero en vivo" },
    ] }],
    glos: [["SDD es", "SDD", "desarrollo guiado por especificación: el plan escrito antes de programar"]],
  });

  escena(c, S.gobernanza, {
    panels: [
      { items: [
        { h: sello("Gobernanza", LAV), cls: "w1 ctr", at: 0, fx: "pop" },
        { h: card({ k: "junto al código", t: "SDD-P07.md", p: "El equipo lo lee y lo versiona", c: "#4ea7ff" }), cls: "w3", at: "en archivos" },
        { h: card({ k: "base de datos · tres cerebros", t: "SDD-P07", rows: [["Tarea", "P-07"], ["Aprobó", "Líder técnica"], ["Versión", "v3"], ["Comprobantes", "12"]], subRows: true, c: LAV }), cls: "w3", at: "en la base de datos", subs: ["su tarea", "quién lo aprobó", "quién lo aprobó", "sus comprobantes"] },
        { h: `<div class="col2">${chip("Agente → CLI", LAV)}${cnt("tokens por consulta", "0", LAV)}</div>`, cls: "w3 ctr", at: "por la CLI", count: { at: "mínimo gasto", from: 0, to: 120, dur: 1.2 } },
      ] },
      { at: "A medida que", cap: "La evidencia queda registrada", items: [
        { h: card({ k: "destino 1", t: "Graph Brain · base de datos del proyecto", c: LAV }), cls: "w2", at: "en el cerebro", on: "o en ambos" },
        { h: card({ k: "destino 2", t: "Documentos .md", c: "#4ea7ff" }), cls: "w2", at: "en documentos", on: "o en ambos" },
        { h: chip("Según la configuración de tu empresa", LAV), cls: "w1 ctr", at: "según lo configure", fx: "pop" },
      ] },
    ],
    glos: [["archivos .md", ".md", "documento de texto que se versiona con el código"], ["tokens", "token", "la unidad con que se mide y se cobra lo que lee la IA"]],
  });

  escena(c, S.martes, { panels: [
    { items: [
      { h: reloj("9:02"), cls: "w1 ctr", at: 0 },
      { h: chips(["Toca tres sistemas", "Mueve datos de dinero"], "#ff6b63"), cls: "w1", at: "mide el pedido", subs: ["toca tres", "mueve datos"] },
      { h: escalera(), cls: "w23", at: "tiene riesgo", on: [["Propone", '[data-k="3"]']] },
      { h: `<div class="col2">${sello("Aprobado", "#7dd3a8")}${chips(["SDD-P07.md", "Base de datos"], "#4ea7ff")}</div>`, cls: "w3 ctr", at: "lo aprueba", fx: "pop", subs: ["queda guardado", "en la base"] },
    ] },
    { at: "el proyecto P-07", items: [
      { h: card({ k: "proyecto P-07", t: "Tres tareas", c: "#4ea7ff", cls: "ctr" }), cls: "w1 ctr", at: "el proyecto P-07" },
      { h: card({ k: "tarea 1", t: "Conexión con finanzas", c: AG.fin }), cls: "w3", at: "la conexión" },
      { h: card({ k: "tarea 2", t: "Pantalla de control de piso", c: AG.piso }), cls: "w3", at: "la pantalla" },
      { h: card({ k: "tarea 3", t: "Pruebas", c: AG.qa }), cls: "w3", at: "y las pruebas" },
      { h: per(), cls: "w1 ctr", at: "La líder técnica, que dirige", fx: "left" },
      { h: chips(["Personas", "Agentes"], LAV), cls: "w1", at: "reparte las tareas", subs: ["entre personas", "y agentes"] },
    ] },
  ] });

  escena(c, S.pedidos, { panels: [{ cap: "Cada pedido, con el plan a su medida", items: [
    { h: card({ k: "SDD completo", t: "P-07 · Integración", p: "Plan completo, aprobado", c: "#4ea7ff" }), cls: "w3", at: 0 },
    { h: card({ k: "Mini SDD · una página", t: "Filtro por turno", p: "Reporte de costos", c: "#9fd0ff" }), cls: "w3", at: "Agregar un filtro", on: "mini SDD" },
    { h: card({ k: "Tarea simple · sin plan", t: "Formato de fecha", p: "Pantalla de piso", c: "#d8dadf" }), cls: "w3", at: "Y corregir", on: "tarea simple" },
  ] }] });

  selloEp(c, S.figura, S.siguiente, { mods: [0], n: 2, sigue: "Terminales y worktrees" });
  firma(c, S.firma);
  [S.gancho, S.dolor, S.tasks, S.sdd, S.gobernanza, S.martes, S.pedidos, S.figura, S.firma].forEach((x) => c.sweep(x.start));
}
