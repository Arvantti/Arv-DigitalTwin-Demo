// Parte 8 de 9 · Flujos agénticos y QA. Martes, 11:45: el hook de QA frena un commit (código y funcional).
import { escena, escenas, kicker, recap, selloEp, firma, term, card, chip, chips, big, coding, reloj, sello, alerta, cnt, flow, AG, LAV } from "../../comun.mjs";

export const ESCENAS = escenas(new URL("./escenas/", import.meta.url));
const barra = (l, col) => `<div class="barra" style="--c:${col}"><span>${l}</span><div class="bt"><i class="bf"></i></div></div>`;
const gate = (k, t, col = "#4ea7ff") => `<div class="gate" style="--c:${col}"><small>${k}</small><b>${t}</b><span class="sw"><span class="sa">en espera</span><span class="sb">resultado</span></span></div>`;

export function componer(c) {
  const { S } = c;
  kicker(c, 8, S.recap.start, S.firma.start);
  recap(c, S.recap);

  escena(c, S.gancho, { panels: [{ items: [
    { h: `<div class="col2">${term({ t: "agente", c: "#4ea7ff", sub: false, l: ["✓ terminado", '<span class="red">✗ prueba: turno noche</span>'] })}${sello("Listo", "#7dd3a8")}</div>`, cls: "w2 ctr", at: 0 },
    { h: big("¿Quién comprobó que funciona?", "m"), cls: "w1", at: "¿Y quién", fx: "pop" },
  ] }] });

  escena(c, S.dolor, { panels: [{ items: [
    { h: chips(["Sesión 1: «sigue estos pasos…»", "Sesión 2: «sigue estos pasos…»", "Sesión 3: «sigue estos pasos…»"], "#9fb3cf"), cls: "w1", at: "repites", gap: 0.4 },
    { h: `<div style="width:100%">${barra("contexto", "#ff6b63")}</div>`, cls: "w2", at: "vuelve a empezar", fill: ["vuelve a empezar", 0.05, 0.5] },
    { h: cnt("pagas otra vez", "0", "#ff6b63"), cls: "w3 ctr", at: "pagas de nuevo", count: { at: "pagas de nuevo", from: 0, to: 3200, dur: 1.5, fmt: " tokens" } },
  ] }] });

  const PASOS = ["Observar", "Planear", "Ejecutar", "Verificar", "Pedir aprobación", "Comprobante"];
  escena(c, S.flujos, {
    panels: [{ items: [
      { h: coding("Tus flujos agénticos"), cls: "w1 ctr", at: 0, fx: "pop" },
      { h: flow(PASOS, { c: LAV }), cls: "w1", at: "paso a paso", subs: ["observar", "planear", "ejecutar", "verificar", "pedir aprobación", "dejar comprobante"] },
      { h: chips(["Tus habilidades", "Tus agentes"], LAV), cls: "w1", at: "tus propias habilidades", subs: ["habilidades", "agentes"] },
    ] }],
    glos: [["flujos agénticos", "flujo agéntico", "receta de trabajo que siguen los agentes"]],
  });

  escena(c, S.inyecta, { panels: [{ items: [
    { h: chips(["Claude Code", "Codex", "OpenCode"], "#4ea7ff"), cls: "w1", at: "Claude Code", subs: ["Claude Code", "Codex", "OpenCode"] },
    { h: term({ t: "terminal en marcha", h: "Codex", c: AG.piso, l: ["… trabajando en avance en vivo", '<b>+ receta P-07 inyectada</b>', "sigue donde iba"] }), cls: "w2", at: "justo cuando", subs: ["justo cuando", "justo cuando hacen falta", "sigue donde iba"] },
    { h: `<div class="col2" style="width:100%">${barra("caché · intacto", "#7dd3a8")}${barra("contexto · no se reinicia", "#4ea7ff")}</div>`, cls: "w2", at: "sin dañar el caché", fill: ["sin dañar el caché", 1, 0.6] },
    { h: card({ k: "cada asistente", t: "Trabaja igual: solo se le suma tu receta", c: LAV, cls: "ctr" }), cls: "w23", at: "No cambia cómo" },
  ] }] });
  // La segunda barra se llena con la primera.

  escena(c, S.qa, {
    panels: [{ items: [
      { h: flow(["Ejecutar", "QA de código", "QA funcional", "Aprobar"], { c: "#4ea7ff" }), cls: "w1", at: 0, subs: [0.2, "la de código", "la funcional", "no pasa a la aprobación"] },
      { h: card({ k: "QA de código", t: "Revisa cómo está escrito", p: "Análisis de calidad", c: "#4ea7ff" }), cls: "w3", at: "la de código" },
      { h: card({ k: "QA funcional", t: "Revisa que haga lo que debe", p: "Pruebas", c: "#4ea7ff" }), cls: "w3", at: "la funcional" },
      { h: card({ k: "si alguna falla", t: "El agente corrige primero", c: "#ff6b63" }), cls: "w3", at: "Si alguna falla" },
      { h: chip("Pasos, pruebas y quién aprueba: a la medida de tu empresa", LAV), cls: "w1 ctr", at: "Los pasos" },
    ] }],
    glos: [["QA, el control", "QA", "el control de calidad del software"]],
  });

  escena(c, S.martes, {
    panels: [{ items: [
      { h: reloj("11:45"), cls: "w1 ctr", at: 0 },
      { h: term({ t: "commit", h: "Codex", c: AG.piso, l: ['"<b>P-07 · avance en vivo</b>"'] }), cls: "w2", at: "hace su commit" },
      { h: flow(["QA de código", "QA funcional"], { c: "#4ea7ff", sub: false }), cls: "w2", at: "dos validaciones", alert: [["detecta un monkeypatch", '[data-k="0"]']] },
      { h: alerta("Monkeypatch detectado", "s"), cls: "w2 ctr", at: "detecta un monkeypatch", fx: "pop" },
      { h: chip("↩ vuelve a Ejecutar para corregir", "#ff6b63"), cls: "w2 ctr", at: "devuelve el cambio", fx: "pop" },
    ] }],
    glos: [["un parche improvisado", "monkeypatch", "parche improvisado que cambia una función por debajo"]],
  });

  escena(c, S.funcional, { panels: [
    { items: [
      { h: flow(["QA de código ✓", "QA funcional"], { c: "#7dd3a8", sub: false }), cls: "w1", at: 0, alert: [["sale en rojo", '[data-k="1"]']] },
      { h: alerta("Prueba en rojo: el turno de la noche no cierra a medianoche", "s"), cls: "w1 ctr", at: "sale en rojo", fx: "pop" },
      { h: chip("↩ vuelve a Ejecutar · el agente corrige", "#ff6b63"), cls: "w1 ctr", at: "el flujo vuelve" },
    ] },
    { at: "todo pasa en verde", items: [
      { h: flow(["QA de código ✓", "QA funcional ✓"], { c: "#7dd3a8" }), cls: "w1", at: "todo pasa en verde", on: [["todo pasa en verde", '[data-k="0"]'], ["en verde", '[data-k="1"]']] },
      { h: card({ k: "pull request", t: "Lista para revisión", c: LAV, cls: "ctr" }), cls: "w2", at: "se pide la revisión", fx: "pop" },
    ] },
  ] });

  selloEp(c, S.figura, S.siguiente, { mods: [2], cod: true, n: 8, sigue: "Rinde cuentas · Receipts" });
  firma(c, S.firma);
  [S.gancho, S.dolor, S.flujos, S.inyecta, S.qa, S.martes, S.funcional, S.figura, S.firma].forEach((x) => c.sweep(x.start));
}
