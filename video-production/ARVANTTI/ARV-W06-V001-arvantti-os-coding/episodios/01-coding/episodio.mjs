// Parte 1 de 9 · Arvantti OS Coding. Martes, 9:00: tres asistentes van a trabajar en el proyecto P-07.
import { escena, escenas, kicker, selloEp, firma, term, card, chip, big, coding, figura, modOn, codOn, MODS, AG, LAV, reloj, per, sello } from "../../comun.mjs";

export const ESCENAS = escenas(new URL("./escenas/", import.meta.url));

export function componer(c) {
  const { S, P, to, at } = c;
  kicker(c, 1, S.gancho.start, S.firma.start);

  escena(c, S.gancho, { panels: [{ items: [
    { h: term({ t: "terminal 1", h: "Claude Code", c: AG.fin, l: ["$ abre <b>costos.ts</b>", "editando línea 42…", "guardando…"] }), cls: "w3", at: 0 },
    { h: term({ t: "terminal 2", h: "Codex", c: AG.piso, l: ["$ abre <b>costos.ts</b>", "editando línea 42…", "guardando…"] }), cls: "w3", at: 0.4 },
    { h: term({ t: "terminal 3", h: "Gemini", c: AG.qa, l: ["$ abre <b>costos.ts</b>", "editando línea 42…", "guardando…"] }), cls: "w3", at: 0.8 },
    { h: big("¿Quién los coordina?"), cls: "w1", at: "¿Quién", fx: "pop" },
  ] }] });

  escena(c, S.dolor, { panels: [
    { cap: "Cada asistente trae sus propias reglas", items: [
      ...["Claude Code", "Codex", "Gemini", "Copilot"].map((n, i) => ({ h: card({ k: "reglamento propio", t: n, c: ["#2d7ff9", "#4ea7ff", "#9fd0ff", "#d8dadf"][i] }), cls: "w4", at: 0.3 + i * 0.25 })),
      { h: card({ k: "problema", t: "Lee contraseñas", c: "#ff6b63" }), cls: "w3", at: "Uno lee", fx: "pop" },
      { h: card({ k: "problema", t: "Pisa el trabajo del otro", c: "#ff6b63" }), cls: "w3", at: "otro pisa", fx: "pop" },
      { h: card({ k: "problema", t: "Olvida la sesión anterior", c: "#ff6b63" }), cls: "w3", at: "cada sesión", fx: "pop" },
    ] },
    { at: "Y cuando", items: [
      { h: term({ t: "costos.ts", c: "#ff6b63", sub: false, l: ["41  const horas = orden.horas;", '<span class="red">42  const costo = horas * tarifa;  ?</span>', "43  return costo;"] }), cls: "w2", alert: "se rompe" },
      { h: big("¿Quién cambió qué?", "m"), cls: "w1", at: "nadie sabe", fx: "pop" },
    ] },
  ] });

  escena(c, S.sistema, { panels: [{ items: [
    { h: `<img class="marca" src="assets/clips/marca.png" alt="" style="width:170px">`, cls: "w1", at: 0, fx: "pop" },
    { h: card({ k: "Arvantti Operating System for AI", t: "El sistema operativo empresarial para la IA", cls: "ctr" }), cls: "w23", at: 0.4 },
    { h: coding(), cls: "w1 ctr", at: "Arvantti OS Coding", fx: "pop" },
    { h: `<p class="lead">Su edición para equipos de software</p>`, cls: "w1", at: "edición" },
  ] }] });

  const IA = ["Claude Code", "Codex", "Gemini", "Copilot", "OpenCode", "Kimi", "modelos locales"];
  escena(c, S.envuelve, {
    panels: [{ cap: "No los reemplaza: los envuelve", body: "col", items: [
      { h: `<div class="chips">${IA.map((n) => chip(n === "modelos locales" ? "Modelos locales" : n, "#4ea7ff", "sub")).join("")}</div>`, cls: "w1", at: 0, subs: IA.map((n) => n) },
      { h: `<div class="chips ad">${IA.map(() => `<span class="sub adp">adaptador</span>`).join("")}</div>`, cls: "w1", at: "adaptador delgado", gap: 0.08 },
      { h: `<div class="cli">CLI de Arvantti <small>el contrato estable</small></div>`, cls: "w1", at: "Por dentro", fx: "pop" },
      { h: `<p class="lead">Cambias de IA <b>sin cambiar tus reglas</b>.</p>`, cls: "w1", at: "Así cambias" },
    ] }],
    glos: [["su línea de comandos", "CLI", "línea de comandos: la forma de hablarle al sistema escribiendo órdenes"]],
  });

  escena(c, S.cli, {
    panels: [{ cap: "Se prefiere la CLI sobre MCP", items: [
      { h: card({ k: "cada servidor MCP", t: "Llena el contexto", c: "#ff6b63", b: `<div style="margin-top:18px">${barraHtml("contexto", "#ff6b63")}</div><p class="cp sub red">rompe el caché</p>` }), cls: "w2", at: "cada servidor", fill: ["llena el contexto", 0.92, 1.6], subs: ["rompe el caché"] },
      { h: card({ k: "la CLI de Arvantti", t: "Responde por partes", c: "#4ea7ff", rows: [["✓", "por partes"], ["✓", "sin secretos"], ["✓", "con registro"]], subRows: true, cls: "chk" }), cls: "w2", at: "la CLI responde", subs: ["por partes", "sin secretos", "con registro"] },
      { h: chip("MCP sigue disponible, con las mismas reglas", "#c4b5fd"), cls: "w1 ctr", at: "MCP queda" },
    ] }],
    glos: [["cada servidor", "MCP", "el estándar con el que la IA se conecta a herramientas"], ["rompe el caché", "caché", "lo que la IA ya leyó y se reutiliza más barato"]],
  });

  // Figura completa que se arma de abajo hacia arriba.
  {
    const x = S.modulos;
    escena(c, x, { panels: [{ items: [{ h: figura("f1"), cls: "w1", at: -0.2, fx: "fade" }] }] });
    at("#f1-base", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.5 }, x.voiceAt);
    at("#f1-nuc", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.5 }, P(x, "seis módulos") - 0.2);
    MODS.forEach((m, i) => modOn(c, "f1", i, P(x, m.n)));
    at("#f1-cod", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.5 }, P(x, "Encima"));
    codOn(c, "f1", P(x, "Encima") + 0.2);
    [["terminales en paralelo", 0], ["planes antes", 4], ["el mapa del código", 2], ["el room de concilio", 3], ["tus propios flujos", 4]].forEach(([f, i], k) => {
      if (k === 1) return;
      to(`#f1-co${i}`, { backgroundColor: LAV, color: "#0b1020", duration: 0.25 }, P(x, f));
    });
    to("#f1-co1", { backgroundColor: LAV, color: "#0b1020", duration: 0.25 }, P(x, "terminales en paralelo") + 0.4);
    ["Linux", "Mac", "Windows", "nube"].forEach((f, i) => to(`#f1-pl${i}`, { borderColor: "#4ea7ff", color: "#fff", boxShadow: "0 0 24px #4ea7ff", duration: 0.25 }, P(x, f)));
    to("#f1-cli", { boxShadow: "0 0 70px #4ea7ff", duration: 0.4 }, P(x, "un mismo cerebro"));
  }

  escena(c, S.medida, { panels: [{ cap: "Todo se personaliza según tu empresa", items: [
    { h: `<div class="chips">${["Las reglas", "Los guardianes", "Los niveles de plan", "Los flujos", "Dónde queda la evidencia"].map((n) => chip(n, "#c4b5fd", "sub")).join("")}</div>`, cls: "w1", at: 0, subs: ["las reglas", "los guardianes", "los niveles", "los flujos", "dónde queda"] },
    { h: sello("A la medida de tu empresa", LAV), cls: "w1 ctr", at: "dónde queda", fx: "pop" },
  ] }] });

  escena(c, S.martes, { panels: [
    { body: "row", items: [
      { h: reloj("9:00"), cls: "w1 ctr", at: 0 },
      { h: card({ k: "proyecto P-07", t: "Producción + Control de piso + Finanzas", c: "#4ea7ff", b: `<div class="chips p07">${chip("Planta", "#4ea7ff", "sub")}${chip("Tablero de piso", "#4ea7ff", "sub")}${chip("Costos", "#4ea7ff", "sub")}</div>`, cls: "ctr" }), cls: "w23", at: "La líder técnica", subs: ["producción", "control de piso", "y finanzas"] },
      { h: `<p class="lead">Cada orden cerrada en planta <b>→</b> su costo real en finanzas</p>`, cls: "w1", at: "cada orden" },
      { h: per(), cls: "w1 ctr", at: "La líder técnica", fx: "left" },
    ] },
    { at: "En el proyecto", items: [
      { h: term({ t: "agente 1", h: "Claude Code", c: AG.fin, l: ["P-07 · listo"] }), cls: "w3", at: "tres asistentes", fx: "pop" },
      { h: term({ t: "agente 2", h: "Codex", c: AG.piso, l: ["P-07 · listo"] }), cls: "w3", at: 1.6, fx: "pop" },
      { h: term({ t: "agente 3", h: "Gemini", c: AG.qa, l: ["P-07 · listo"] }), cls: "w3", at: 1.9, fx: "pop" },
      { h: coding("Bajo Arvantti OS"), cls: "w1 ctr", at: "Los tres", fx: "pop" },
      { h: `<div class="chips">${["Las mismas reglas", "La misma memoria", "El mismo registro"].map((n) => chip(n, "#4ea7ff", "sub")).join("")}</div>`, cls: "w1", at: "las mismas reglas", subs: ["las mismas reglas", "la misma memoria", "el mismo registro"] },
    ] },
  ] });

  selloEp(c, S.figura, S.siguiente, { mods: [0, 1, 2, 3, 4, 5], cod: true, n: 1, sigue: "Organiza · Tasks" });
  firma(c, S.firma);
  [S.dolor, S.sistema, S.envuelve, S.cli, S.modulos, S.medida, S.martes, S.figura, S.firma].forEach((x) => c.sweep(x.start));
}

const barraHtml = (label, col) => `<div class="barra" style="--c:${col}"><span>${label}</span><div class="bt"><i class="bf"></i></div></div>`;
