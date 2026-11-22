// Parte 7 de 9 · Room de concilio. Martes, 11:30: el agente de piso y el de finanzas proponen dos diseños para la API.
import { escena, escenas, kicker, recap, selloEp, firma, term, card, chip, chips, big, coding, reloj, per, file, sello, alerta, flow, arbol, AG, LAV } from "../../comun.mjs";

export const ESCENAS = escenas(new URL("./escenas/", import.meta.url));

export function componer(c) {
  const { S } = c;
  kicker(c, 7, S.recap.start, S.firma.start);
  recap(c, S.recap);

  escena(c, S.gancho, { panels: [{ items: [
    { h: term({ t: "agente A", c: AG.piso, l: ["propuesta: <b>solución 1</b>"] }), cls: "w3", at: 0, fx: "left" },
    { h: term({ t: "agente B", c: AG.fin, l: ["propuesta: <b>solución 2</b>"] }), cls: "w3", at: 0.3, fx: "right" },
    { h: big("¿Quién decide?"), cls: "w1", at: "¿Quién decide", fx: "pop" },
  ] }] });

  escena(c, S.dolor, { panels: [{ items: [
    { h: term({ t: "conversación 1", c: "#9fb3cf", l: ["…", "…", "…"] }), cls: "w3", at: 0 },
    { h: term({ t: "conversación 2", c: "#9fb3cf", l: ["…", "…", "…"] }), cls: "w3", at: 0.3 },
    { h: alerta("Gana el último que habló", "s"), cls: "w1 ctr", at: "Gana el último", fx: "pop" },
    { h: card({ k: "a mano", t: "Copiar y pegar tareas entre terminales", c: "#ff6b63", cls: "ctr" }), cls: "w23", at: "Y repartir", fx: "pop" },
  ] }] });

  escena(c, S.concilio, { panels: [{ items: [
    { h: coding("Room de concilio"), cls: "w1 ctr", at: "el room de concilio", fx: "pop" },
    { h: `<div class="mesa"><span class="ag sub" style="--c:${AG.fin}">Agente de finanzas</span><span class="ag sub" style="--c:${AG.piso}">Agente de piso</span><span class="ag sub" style="--c:${AG.qa}">Agente de pruebas</span><span class="sub">${per("Tú", "TÚ")}</span></div>`, cls: "w1", at: "varios agentes", subs: ["varios agentes", 0.5 + 3.6, 0.8 + 3.6, "contigo"] },
    { h: card({ k: "propuesta 1", t: "Su propuesta y sus razones", c: "#4ea7ff" }), cls: "w3", at: "Cada uno presenta" },
    { h: card({ k: "propuesta 2", t: "Su propuesta y sus razones", c: "#4ea7ff" }), cls: "w3", at: "las contrastan", on: "tú decides" },
  ] }] });

  escena(c, S.reparto, { panels: [{ cap: "Se reparten el trabajo entre las terminales", items: [
    { h: card({ k: "reparto", t: "Tarea → Terminal", rows: [["Finanzas", "→ terminal 1"], ["Control de piso", "→ terminal 2 · después de finanzas"], ["Pruebas", "→ terminal 3 · al final"]], subRows: true, c: LAV }), cls: "w23", at: "quién toma qué", subs: ["quién toma qué", "en qué orden", "qué depende"] },
    { h: `<div class="col2">${file("SDD-P07.md · + acuerdo", "#4ea7ff")}${chip("Tú entras, preguntas o cambias el reparto", LAV, "sub")}</div>`, cls: "w3 ctr", at: "Cada acuerdo", subs: ["Y tú puedes"] },
  ] }] });

  escena(c, S.jerarquia, { panels: [{ cap: "La jerarquía de tus agentes", items: [
    { h: arbol([["Terminal 1", "Claude Code", AG.fin, ["subagente: pruebas"]], ["Terminal 2", "Codex", AG.piso, ["subagente: UI"]], ["Terminal 3", "Gemini", AG.qa, ["subagente: datos"]]]), cls: "w1", at: 0.2, on: [["quién coordina", '[data-n="c"]'], ["quién trabaja", '[data-n="0"]'], ["qué subagentes", ".sa2"]] },
  ] }] });

  const api = (t, col) => flow(["Piso", t, "Finanzas"], { c: col, sub: false });
  escena(c, S.martes, { panels: [{ items: [
    { h: reloj("11:30"), cls: "w1 ctr", at: 0 },
    { h: card({ k: "agente de piso · programa la API que envía", t: "Cada movimiento al instante", b: api("API", AG.piso), c: AG.piso }), cls: "w2", at: "El agente de control de piso" },
    { h: card({ k: "agente de finanzas · programa la API que recibe", t: "Consolidar por turno", b: api("API", AG.fin), c: AG.fin }), cls: "w2", at: "El de finanzas" },
    { h: chip("Para no llenar la contabilidad de registros", AG.fin), cls: "w1 ctr", at: "para no llenar" },
  ] }] });

  escena(c, S.decision, { panels: [
    { items: [
      { h: card({ k: "propuesta 1", t: "Cada movimiento al instante", c: AG.piso }), cls: "w2", at: 0, off: "elige consolidar" },
      { h: card({ k: "propuesta 2", t: "Consolidar por turno", c: AG.fin }), cls: "w2", at: 0.2, on: "elige consolidar" },
      { h: per(), cls: "w1 ctr", at: "la líder técnica" },
    ] },
    { at: "se reparten", items: [
      { h: term({ t: "terminal 1", h: "finanzas", c: AG.fin, l: ["cierre por turno"] }), cls: "w3", at: "finanzas programa" },
      { h: term({ t: "terminal 2", h: "piso", c: AG.piso, l: ["avance en vivo"] }), cls: "w3", at: "la pantalla de piso" },
      { h: term({ t: "terminal 3", h: "pruebas", c: AG.qa, l: ["los dos casos"] }), cls: "w3", at: "las pruebas cubren" },
    ] },
  ] });

  selloEp(c, S.figura, S.siguiente, { cod: true, n: 7, sigue: "Flujos agénticos y QA" });
  firma(c, S.firma);
  [S.gancho, S.dolor, S.concilio, S.reparto, S.jerarquia, S.martes, S.decision, S.figura, S.firma].forEach((x) => c.sweep(x.start));
}
