// Parte 5 de 9 · Controla · Policy y Grants. Martes, 10:40: una librería fuera de la lista y la subida a la rama principal.
import { escena, escenas, kicker, recap, selloEp, firma, term, card, chip, chips, big, mod, reloj, per, file, sello, alerta, flow, AG, LAV } from "../../comun.mjs";

export const ESCENAS = escenas(new URL("./escenas/", import.meta.url));

export function componer(c) {
  const { S } = c;
  kicker(c, 5, S.recap.start, S.firma.start);
  recap(c, S.recap);

  escena(c, S.gancho, {
    panels: [{ items: [
      { h: flow(["Terminal del agente", "Producción"], { c: "#ff6b63", cls: "xl" }), cls: "w1", at: 0, alert: [["directo a producción", '[data-k="1"]']] },
      { h: big("¿Directo a producción?", "m"), cls: "w1", at: "porque las pruebas", fx: "pop" },
    ] }],
    glos: [["producción", "producción", "la versión que usan los clientes"]],
  });

  escena(c, S.dolor, { panels: [{ items: [
    ...["Claude Code", "Codex", "Gemini", "Copilot"].map((n, i) => ({ h: card({ k: "reglas de fábrica", t: n, p: "Nadie las puede ajustar", c: "#9fb3cf" }), cls: "w4", at: i ? 0.4 + i * 0.25 : 0.4 })),
    { h: card({ k: "permisos", t: "Se dan «para que funcione» y nadie los quita", c: "#ff6b63", cls: "ctr" }), cls: "w23", at: "los permisos", fx: "pop", alert: "nadie los vuelve" },
  ] }] });

  escena(c, S.policy, {
    panels: [{ items: [
      { h: `<div class="chips">${mod(2)}${mod(3, "dim")}</div>`, cls: "w1", at: "El módulo Policy", fx: "pop" },
      { h: card({ k: "tus reglas · configurables · se cumplen con hooks", t: "Policy", rows: [["Leer", "todo el proyecto"], ["Escribir", "solo su carpeta"], ["Borrar", "pide el sí de una persona"], ["Ejecutar", "comandos de la lista"], ["Instalar", "librerías aprobadas"]], subRows: true, c: "#2d7ff9" }), cls: "w2", at: "tú las configuras", subs: ["leer", "escribir", "borrar", "comandos", "librerías"] },
      { h: `<div class="col2">${flow(["Empresa", "Proyecto"], { c: "#2d7ff9" })}${chip("Más estrictas, nunca más flojas", "#2d7ff9")}</div>`, cls: "w3 ctr", at: "La empresa pone", subs: ["La empresa", "cada proyecto"] },
    ] }],
    glos: [["librerías", "librería", "código de terceros que se instala"]],
  });

  escena(c, S.hooks, {
    panels: [{ items: [
      { h: flow(["Hook antes", "Acción", "Hook después"], { c: "#2d7ff9" }), cls: "w1", at: 0, subs: ["antes", "cada acción", "después"] },
      { h: chips(["Claude Code", "Codex", "Gemini", "OpenCode"], "#4ea7ff", false), cls: "w1", at: "sea cual sea" },
      { h: card({ k: "cada programador", t: "Mis hooks", rows: [["A", "Inyectados en el arnés"], ["B", "Configuración global"]], subRows: true, c: LAV }), cls: "w2", at: "Cada programador", subs: ["inyectados", "configuración global"] },
      { h: card({ k: "director del proyecto", t: "Reglas de negocio para su equipo", c: "#2d7ff9" }), cls: "w2", at: "el director", fx: "pop" },
    ] }],
    glos: [["Los hooks", "hook", "punto de control antes y después de cada acción"]],
  });

  escena(c, S.grants, { panels: [{ items: [
    { h: mod(3), cls: "w1 ctr", at: "Grants", fx: "pop" },
    { h: card({ k: "permiso puntual", t: "Mientras dura la tarea", rows: [["Quién", "Agente de finanzas"], ["Sobre qué", "finanzas/"], ["Para qué", "Tarea P-07"]], subRows: true, b: `<div class="chips">${chip("Retirar", "#ff6b63", "sub")}</div>`, c: "#2d7ff9" }), cls: "w2", at: "permisos puntuales", subs: ["quién", "sobre qué", "para qué", "un clic"] },
    { h: `<div class="col2">${card({ k: "rama principal", t: "Subir o publicar: espera el sí de una persona", c: LAV })}${card({ k: "negado", t: "Queda escrita la razón", c: "#ff6b63", cls: "sub" })}</div>`, cls: "w2", at: "Subir código", subs: ["Y cuando algo se niega"] },
  ] }] });

  escena(c, S.martes, { panels: [{ items: [
    { h: reloj("10:40"), cls: "w1 ctr", at: 0 },
    { h: term({ t: "agente de finanzas", h: "Claude Code", c: AG.fin, l: ["$ npm install costeo-rapido", '<span class="red">✗ detenido por el hook</span>'] }), cls: "w2", at: "quiere instalar", subs: ["quiere instalar", "lo detiene"] },
    { h: alerta("Motivo: fuera de la lista del equipo", "s"), cls: "w2 ctr", at: "deja el motivo", fx: "pop" },
    { h: card({ k: "permiso", t: "finanzas/ · escribir", p: "Solo durante esta tarea", c: "#2d7ff9" }), cls: "w2", at: "Recibe permiso" },
    { h: `<div class="col2">${card({ k: "solicitud", t: "Subir a la rama principal · en espera", c: LAV })}<div class="sub">${per()}</div></div>`, cls: "w2", at: "subir a la rama", subs: ["la líder técnica"] },
  ] }] });

  selloEp(c, S.figura, S.siguiente, { mods: [2, 3], n: 5, sigue: "Protege · Guardianes" });
  firma(c, S.firma);
  [S.gancho, S.dolor, S.policy, S.hooks, S.grants, S.martes, S.figura, S.firma].forEach((x) => c.sweep(x.start));
}
