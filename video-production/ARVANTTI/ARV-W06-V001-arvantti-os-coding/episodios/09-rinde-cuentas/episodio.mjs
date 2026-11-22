// Parte 9 de 9 · Rinde cuentas · Receipts. Un mes después: ¿quién cambió esta línea? Cierre de la serie.
import { escena, escenas, kicker, recap, selloEp, firma, term, card, chip, chips, big, mod, reloj, per, sello, alerta, flow, AG, LAV } from "../../comun.mjs";

export const ESCENAS = escenas(new URL("./escenas/", import.meta.url), { figura: { tail: 1.2 } });
const W = "#f8fafc";

export function componer(c) {
  const { S } = c;
  kicker(c, 9, S.recap.start, S.firma.start);
  recap(c, S.recap);

  escena(c, S.gancho, { panels: [{ items: [
    { h: term({ t: "costos/orden.ts", c: "#ff6b63", sub: false, l: ["41  const horas = reporte.horasReales;", '<span class="red">42  const costo = horas * tarifa;  ?</span>'] }), cls: "w2", at: 0, alert: "sale mal" },
    { h: chips(["¿Quién la cambió?", "¿Con qué IA?", "¿Quién lo aprobó?"], "#ff6b63"), cls: "w1", at: "¿Quién cambió", subs: ["¿Quién cambió", "con qué IA", "quién lo aprobó"] },
  ] }] });

  escena(c, S.dolor, { panels: [{ items: [
    { h: term({ t: "historial", c: "#9fb3cf", l: ["autor: <b>bot</b> · «ajuste»", "autor: <b>bot</b> · «fix»"] }), cls: "w3", at: 0 },
    { h: card({ k: "chat", t: "Lo demás se perdió en un chat", c: "#ff6b63" }), cls: "w3", at: "Lo demás" },
    { h: card({ k: "registros", t: "Se pueden editar", c: "#ff6b63" }), cls: "w3", at: "los registros", alert: "se pueden editar" },
  ] }] });

  escena(c, S.receipts, { panels: [{ items: [
    { h: mod(5), cls: "w1 ctr", at: "Receipts", fx: "pop" },
    { h: card({ k: "comprobante", t: "Cada acción", rows: [["Quién", "Persona o agente"], ["Qué", "El antes y el después"], ["Con qué", "Herramienta e IA"], ["Permiso", "El que tenía"], ["Cuándo", "Fecha y hora exactas"]], subRows: true, c: W }), cls: "w23", at: "deja un comprobante", subs: ["quién la hizo", "qué hizo", "con qué herramienta", "qué permiso", "y cuándo"] },
  ] }] });

  escena(c, S.ndjson, {
    panels: [{ items: [
      { h: term({ t: "receipts.ndjson", c: W, l: ['{"quien":"agente-finanzas","ia":"Claude Code","accion":"edit","huella":"9f2c…"}', '{"quien":"lider-tecnica","accion":"aprobar","pr":"P-07"}'] }), cls: "w1", at: 0 },
      { h: sello("Solo se agrega", W), cls: "wa", at: "Solo se agregan", fx: "pop" },
      { h: chip("Sin claves, solo huellas", "#7dd3a8"), cls: "wa", at: "No guardan claves", fx: "pop" },
      { h: chips(["Commit en Git", "Tarea", "SDD"], "#4ea7ff"), cls: "w1", at: "cada comprobante enlaza", subs: ["su commit", "su tarea", "y su SDD"] },
    ] }],
    glos: [["Se guardan en NDJSON", "NDJSON", "formato de texto donde cada línea es un registro"]],
  });

  escena(c, S.hoja, { panels: [{ items: [
    { h: card({ k: "hoja de vida del agente", t: "Agente de finanzas", rows: [["Versión", "v4 · actual"], ["Anterior", "v3"], ["Mejoras", "1 espera aprobación"]], subRows: true, b: chips(["Volver atrás", "Apagar"], "#ff6b63"), c: W }), cls: "w2", at: "su hoja de vida", subs: ["sus versiones", "sus versiones", "las mejoras", "volver atrás", "apagarlo"] },
    { h: `<div class="col2">${sello("ISO/IEC 42001", "#4ea7ff")}<p class="lead" style="font-size:36px">Evidencia lista para la certificación</p></div>`, cls: "w2 ctr", at: "Apoya las prácticas", fx: "pop" },
  ] }] });

  const PTS = [["9:02", "SDD aprobado · .md + base de datos", "9:02"], ["9:20", "Tres terminales en paralelo", "9:20"], ["9:25", "Mapa del código · 4 archivos", "9:25"], ["10:40", "Hook frena la librería", "10:40"], ["10:52", "Guardián tapa la clave", "10:52"], ["11:30", "El concilio decide", "11:30"], ["11:45", "QA frena el commit hasta pasar", "11:45"]];
  escena(c, S.martes, { panels: [{ cap: "Repasemos el martes", items: [
    { h: `<div class="linea">${PTS.map(([h, t]) => `<div class="pt sub"><b>${h}</b><span>${t}</span></div>`).join("")}</div>`, cls: "w1", at: 0.5, subs: PTS.map((p) => p[2]) },
  ] }] });

  escena(c, S.linea, { panels: [{ items: [
    { h: term({ t: "costos/orden.ts · línea 42", c: AG.fin, sub: false, l: ["42  const costo = horas * tarifa;"] }), cls: "w2", at: 0 },
    { h: card({ k: "comprobante", t: "Línea 42", rows: [["Escribió", "Agente de finanzas"], ["Con", "Claude Code"], ["Aprobó", "Líder técnica"]], subRows: true, c: W }), cls: "w2", at: 0.3, subs: ["agente de finanzas", "con Claude Code", "la aprobó"] },
    { h: sello("Todo, con comprobante", W), cls: "w1 ctr", at: "Todo, con comprobante", fx: "pop" },
  ] }] });

  selloEp(c, S.figura, null, { mods: [0, 1, 2, 3, 4, 5], cod: true, n: 9 });
  firma(c, S.firma, { final: true });
  [S.gancho, S.dolor, S.receipts, S.ndjson, S.hoja, S.martes, S.linea, S.figura, S.firma].forEach((x) => c.sweep(x.start));
}
