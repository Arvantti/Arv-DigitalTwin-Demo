// Parte 6 de 9 · Protege · Guardianes. Martes, 10:52: el agente programa la API del ERP sin ver la clave.
import { escena, escenas, kicker, recap, selloEp, firma, term, card, chip, chips, big, mod, reloj, file, sello, alerta, flow, AG, LAV } from "../../comun.mjs";

export const ESCENAS = escenas(new URL("./escenas/", import.meta.url));
const G = "#7ec8ff";

export function componer(c) {
  const { S } = c;
  kicker(c, 6, S.recap.start, S.firma.start);
  recap(c, S.recap);

  escena(c, S.gancho, { panels: [{ items: [
    { h: chip("clave: sk-live-9f2c…", "#ff6b63"), cls: "w1 ctr", at: 0, fx: "pop" },
    { h: flow(["Chat de IA", "Archivo", "Repositorio público"], { c: "#ff6b63", cls: "xl" }), cls: "w1", at: 0.6, subs: ["chat de IA", "puede terminar", "repositorio público"], alert: [["repositorio público", '[data-k="2"]']] },
  ] }] });

  escena(c, S.dolor, {
    panels: [{ items: [
      { h: term({ t: ".env", c: "#ff6b63", sub: false, l: ["ERP_URL=https://erp.empresa", "ERP_API_KEY=sk-live-9f2c…"] }), cls: "w2", at: 0 },
      { h: chips(["La lee", "La pega en el chat", "La deja en un registro", "La sube con el código"], "#ff6b63"), cls: "w2", at: "Una IA puede", subs: ["leerlas", "pegarlas", "dejarlas", "subirlas"] },
      { h: card({ k: "atajo de ruta", t: "../../ fuera de su carpeta", c: "#ff6b63", cls: "ctr" }), cls: "w2", at: "atajo de ruta", fx: "pop", alert: "sin que nadie" },
    ] }],
    glos: [["Las claves de acceso", "API key", "la llave con la que un programa entra a un servicio"], ["como el .env", ".env", "archivo de configuración con claves"]],
  });

  escena(c, S.guardianes, { panels: [{ items: [
    { h: mod(4), cls: "w1 ctr", at: "Guardianes", fx: "pop" },
    { h: card({ k: "escudo 1", t: "Ruta segura", p: "Dentro de su proyecto", c: G }), cls: "w4", at: "La ruta segura" },
    { h: card({ k: "escudo 2", t: "Claves tapadas", p: "El .env, fuera de su alcance", c: G }), cls: "w4", at: "Los secretos" },
    { h: card({ k: "respuesta", t: '<span class="sw"><span class="sa red">sk-live-9f2c…</span><span class="sb">•••• tapada</span></span>', c: G }), cls: "w2", at: "si una clave aparece", swap: "se tapa" },
    { h: chips(["Chat", "Registro", "Código"], G), cls: "w1", at: "antes de llegar", subs: ["al chat", "al registro", "al código"] },
  ] }] });

  escena(c, S.conexiones, {
    panels: [{ items: [
      { h: flow(["Agente", "Arvantti · guarda la credencial", "Herramienta"], { c: G }), cls: "w1", at: 0, subs: ["Las herramientas", "a través de Arvantti", "usa la conexión"] },
      { h: chips(["CLI · preferida", "MCP"], LAV), cls: "w2", at: "de preferencia", subs: ["por la CLI", "o por MCP"] },
      { h: term({ t: "su código", c: G, l: ['key = env("<b>ERP_API_KEY</b>")', "valor: •••• (no lo ve)"] }), cls: "w2", at: "si el código" },
      { h: card({ k: "escudo 4", t: "Gasto bajo control", c: G }), cls: "w3", at: "Un guardián de gasto" },
      { h: chips(["Agentes que programan", "Agentes que vigilan"], G), cls: "w23", at: "mientras unos", subs: ["unos agentes programan", "otros vigilan"] },
    ] }],
    glos: [["o por MCP", "MCP", "el estándar con el que la IA se conecta a herramientas"]],
  });

  escena(c, S.martes, {
    panels: [{ items: [
      { h: reloj("10:52"), cls: "w1 ctr", at: 0 },
      { h: term({ t: "agente de finanzas", h: "Claude Code", c: AG.fin, l: ["programando <b>erp-api.ts</b>", "conexión: software ↔ ERP"] }), cls: "w2", at: "programa la API" },
      { h: card({ k: "ERP", t: "Contabilidad", p: "Sistema de gestión", c: "#4ea7ff" }), cls: "w3", at: "el sistema de gestión" },
      { h: `<div class="col2">${file(".env", "#ff6b63")}${sello("Fuera de su alcance", G, "s")}</div>`, cls: "w2 ctr", at: "no puede abrir", fx: "pop", alert: [["no puede abrir", ".file"]] },
    ] }],
    glos: [["el ERP", "ERP", "el sistema de gestión de la empresa"]],
  });

  escena(c, S.variable, {
    panels: [{ items: [
      { h: term({ t: "erp-api.ts", c: G, l: ['const key = env("<b>ERP_API_KEY</b>")', 'erp.conectar(url, key)'] }), cls: "w2", at: 0, on: "por el nombre", subs: ["su código la llama", "por el nombre"] },
      { h: card({ k: "valor de la variable", t: "••••••••", p: "El agente nunca lo lee", c: G }), cls: "w3", at: "nunca lee" },
      { h: flow(["Prueba de la API", "ERP ✓"], { c: "#7dd3a8" }), cls: "w2", at: "nunca lee", subs: [1.0, 1.4] },
      { h: term({ t: "registro", c: G, sub: false, l: ['prueba: key=<span class="sw"><span class="sa red">sk-live-9f2c…</span><span class="sb">••••</span></span>'] }), cls: "w2", at: "si una prueba", swap: "sale tapada" },
      { h: sello("Sin fugas", "#7dd3a8"), cls: "w1 ctr", at: "sin fugas", fx: "pop" },
    ] }],
    glos: [["la variable de entorno", "variable de entorno", "un dato del sistema que el código usa por su nombre"]],
  });

  selloEp(c, S.figura, S.siguiente, { mods: [4], n: 6, sigue: "Room de concilio" });
  firma(c, S.firma);
  [S.gancho, S.dolor, S.guardianes, S.conexiones, S.martes, S.variable, S.figura, S.firma].forEach((x) => c.sweep(x.start));
}
