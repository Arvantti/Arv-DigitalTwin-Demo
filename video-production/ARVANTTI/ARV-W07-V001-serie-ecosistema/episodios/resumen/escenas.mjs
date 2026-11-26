// Gran resumen Arvantti: pieza final de la serie del ecosistema (guion aprobado por Andy, 2026-11-24).
// Reutiliza las animaciones de los episodios 1 a 7; cada escena va envuelta en .eN para usar los estilos de su episodio
// (ver unir-css.mjs). Las escenas de Arvantti OS Coding usan estilos propios (propio.css).
// Escenas que abren capítulo: llevan unos 3 s de tarjeta de índice antes de la voz.
const INICIO_CAP = ["junta", "os", "coding", "gemelo", "metodos", "vuelve"];
export const ESCENAS = [
  "01-junta", "02-islas", "03-productos", "04-base", "05-os", "06-promesas", "07-enterprise", "08-coding", "09-planes", "10-claves",
  "11-gemelo", "12-modulos", "13-modulos2", "14-ia", "15-metodos", "16-montecarlo", "17-opciones", "18-vuelve", "19-decide", "21-mapa", "20-cierre",
].map((dir, i) => ({ id: dir.slice(3), dir, lead: INICIO_CAP.includes(dir.slice(3)) ? 3.2 : dir === "20-cierre" ? 0.9 : 0.35, tail: dir === "20-cierre" ? 4.5 : dir === "21-mapa" ? 2.5 : 1.0, sinSubtitulos: dir === "20-cierre" }));

// Capítulos (para la descripción de YouTube): escena con la que empieza cada uno.
export const CAPITULOS = [
  ["junta", "La pregunta"], ["os", "Arvantti OS Enterprise"], ["coding", "Arvantti OS Coding"],
  ["gemelo", "Arvantti Digital Twin"], ["metodos", "Arvantti Fractal"], ["vuelve", "La respuesta"],
];

import { red, caminos, curva, barras, pareto, montecarlo, gantt } from "../../viz.mjs";
import { ayudas, cierre, opciones, animarOpciones, familias, planta } from "../../comun.mjs";

const PRODUCTOS = [
  ["os", "Arvantti OS", "Gobierna la IA de tu empresa"],
  ["dt", "Arvantti Digital Twin", "Una copia viva de tu operación"],
  ["fr", "Arvantti Fractal", "Las mejores opciones y su impacto"],
];

export function componerEpisodio(c) {
  const { S, P, at, to, clip, words, sfx, span, enter, leave, titleIn, sweep, VERT } = c;
  const { pop, fade, izq, luz } = ayudas(c);
  const cap = () => ""; // el capítulo lo muestran la barra de avance y las tarjetas de índice (indice())
  const escena = (id, x, ep, n, inner) => { const [s, d] = span(x); clip(id, "scene", s, d, `<div class="${ep}" style="display:contents">${cap(n)}${inner}</div>`, 3); return [s, d]; };
  const brilla = (sel, t) => to(sel, { borderColor: "#4ea7ff", boxShadow: "0 0 50px #2d7ff988", duration: 0.35 }, t);

  // ── Capítulo 0 · La pregunta ──────────────────────────────────────────────

  // 1. La junta directiva pregunta.
  {
    const x = S.junta;
    const Q = [["la planta", "planta", "la"], ["el inventario", "inventario", "el"], ["la caja", "caja", "la"]];
    const [s, d] = escena("r-junta", x, "e1", 0, `
      <div class="st">
        <div class="mesa">
          <svg viewBox="0 0 900 260" class="mesa-svg">
            <ellipse class="tabla" cx="450" cy="150" rx="380" ry="88"/>
            ${[0, 1, 2, 3, 4, 5, 6, 7].map((k) => { const a = Math.PI * (k / 7); const cx = 450 - Math.cos(a) * 430, cy = 150 - Math.sin(a) * 120; return `<circle class="silla${k === 4 ? " ger" : ""}" cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${k === 4 ? 30 : 24}"/>`; }).join("")}
          </svg>
          <span class="chip lbl">Junta directiva</span>
        </div>
        <h2 class="h md q">${words("Si la demanda sube el próximo trimestre…")}</h2>
        <div class="row qs">${Q.map(([, t, a], i) => `<span class="chip" id="rq${i}">¿Nos alcanza ${a} <b>${t}</b>?</span>`).join("")}</div>
      </div>`);
    at("#r-junta .tabla", { opacity: 0, scale: 0.8, transformOrigin: "50% 50%" }, { opacity: 1, scale: 1, duration: 0.8, ease: "power3.out" }, x.voiceAt - 0.6);
    at("#r-junta .silla", { opacity: 0, scale: 0, transformOrigin: "50% 50%" }, { opacity: 1, scale: 1, duration: 0.4, stagger: 0.06, ease: "back.out(2)" }, x.voiceAt - 0.3);
    pop("#r-junta .lbl", x.voiceAt + 0.2);
    at("#r-junta .ger", { scale: 1 }, { scale: 1.35, duration: 0.4, yoyo: true, repeat: 1, transformOrigin: "50% 50%" }, P(x, "La gerente"));
    titleIn("#r-junta .q", P(x, "si la demanda") - 0.1, 0.09);
    Q.forEach(([k], i) => { pop(`#rq${i}`, P(x, k) - 0.1); luz(`#rq${i}`, P(x, k) + 0.3); });
    sfx("1a", "pop.mp3", P(x, "La gerente"), 0.2);
    Q.forEach(([k], i) => sfx(`1q${i}`, "pop.mp3", P(x, k), 0.14));
    leave("r-junta", s + d);
  }

  // 2. Islas de datos y varias IA que responden distinto.
  {
    const x = S.islas;
    const I = [
      ["Producción", "Excel", barras(c, "rg-prod", { valores: [55, 70, 62, 88, 76], alerta: 3, t0: P(x, "Producción") })],
      ["Finanzas", "Excel", curva(c, "rg-fin", { puntos: [8, 7, 7.5, 5, 4, 5, 6], banda: true, t0: P(x, "Finanzas") })],
      ["ERP", "Sistema de gestión", `<svg class="db" viewBox="0 0 80 90"><ellipse cx="40" cy="16" rx="34" ry="12"/><path d="M6 16v58c0 7 15 12 34 12s34-5 34-12V16"/><path d="M6 45c0 7 15 12 34 12s34-5 34-12"/></svg>`],
    ];
    const R = [["IA de producción", "Sí alcanza"], ["IA de finanzas", "No alcanza"], ["IA de ventas", "Depende"]];
    const tI = P(x, "Y cada área");
    const [s, d] = escena("r-islas", x, "e1", 0, `
      <div class="st">
        <div class="row islas">${I.map(([n, f, g], i) => `<div class="panel isla" id="ris${i}"><b>${n}</b><div class="mini">${g}</div><small>${f}</small></div>`).join("")}</div>
        <div class="row chats">${R.map(([n, r], i) => `<div class="chat" id="rch${i}"><small>${n}</small><span>${r}</span></div>`).join("")}</div>
      </div>`);
    enter("r-islas", s);
    pop("#ris0", P(x, "Producción") - 0.1); pop("#ris1", P(x, "Finanzas") - 0.1); pop("#ris2", P(x, "ERP") - 0.1);
    to("#ris0", { x: VERT ? -20 : -50, rotate: -3, duration: 0.6 }, tI - 0.6);
    to("#ris2", { x: VERT ? 20 : 50, rotate: 3, duration: 0.6 }, tI - 0.6);
    to("#r-islas .islas", { opacity: 0.45, scale: 0.9, duration: 0.5 }, tI);
    at("#r-islas .chat", { opacity: 0, y: 30, scale: 0.8 }, { opacity: 1, y: 0, scale: 1, duration: 0.45, stagger: 0.35, ease: "back.out(1.8)" }, tI + 0.1);
    at("#r-islas .chat span", { color: "#e6eefc" }, { color: "#ff8a3d", duration: 0.3, stagger: 0.1 }, P(x, "responde distinto"));
    sfx("2a", "pop.mp3", P(x, "Producción"), 0.12); sfx("2b", "pop.mp3", P(x, "Finanzas"), 0.12); sfx("2c", "pop.mp3", P(x, "ERP"), 0.12);
    sfx("2d", "hit.wav", P(x, "responde distinto"), 0.2);
    leave("r-islas", s + d);
  }

  // 3. Arvantti: tres productos, solos o juntos.
  {
    const x = S.productos;
    const T = { os: "Arvantti OS", dt: "Arvantti Digital Twin", fr: "Arvantti Fractal" };
    const viz = {
      os: red(c, "rred3", { w: 340, h: 190, capas: [3, 5, 5, 2], t0: P(x, T.os) + 0.2, dur: 2.4, seed: 5 }),
      dt: foto3d("rpl3", ["3d-heroe"]),
      fr: caminos(c, "rcam3", { w: 340, h: 190, cols: 5, filas: 3, explorar: 8, mejores: 3, t0: P(x, T.fr) + 0.2, dur: 2.6, seed: 11 }),
    };
    const [s, d] = escena("r-prod", x, "e1", 0, `
      <div class="st">
        <div class="row cab"><img class="marca am" src="assets/clips/marca.png" alt=""><h1 class="h ti">Arvantti</h1><span class="chip on sj">Solos o juntos</span></div>
        <div class="row prods">${PRODUCTOS.map(([k, n, f]) => `<div class="panel prod" id="rpr-${k}"><div class="pv">${viz[k]}</div><b>${n}</b><span>${f}</span></div>`).join("")}</div>
        <span class="chip on td">Para que tú decidas</span>
      </div>`);
    enter("r-prod", s);
    at("#r-prod .am", { opacity: 0, scale: 0.5, rotate: -8 }, { opacity: 1, scale: 1, rotate: 0, duration: 0.8, ease: "back.out(1.6)" }, x.voiceAt - 0.2);
    at("#r-prod h1", { opacity: 0, letterSpacing: "24px", filter: "blur(10px)" }, { opacity: 1, letterSpacing: "-2px", filter: "blur(0px)", duration: 0.9, ease: "power3.out" }, x.voiceAt);
    pop("#r-prod .sj", P(x, "solos o juntos"));
    PRODUCTOS.forEach(([k]) => { const t = P(x, T[k]); pop(`#rpr-${k}`, t - 0.15); brilla(`#rpr-${k}`, t + 0.2); });
    at("#rpl3 img", { opacity: 0, scale: 1.15 }, { opacity: 1, scale: 1, duration: 3, ease: "power2.out" }, P(x, T.dt) - 0.2);
    pop("#r-prod .td", P(x, "para que tú"));
    sfx("3a", "whoosh-short.mp3", x.voiceAt, 0.2);
    PRODUCTOS.forEach(([k], i) => sfx(`3${i}`, "pop.mp3", P(x, T[k]), 0.15));
    leave("r-prod", s + d);
  }

  // 4. Lo que comparten: conectores y cerebro empresarial.
  {
    const x = S.base;
    const SIS = ["Gestión (ERP)", "Clientes (CRM)", "Equipos (SCADA)"];
    const N = ["productos", "pedidos", "costos", "decisiones"];
    const [s, d] = escena("r-base", x, "e1", 0, `
      <div class="st apretado">
        <div class="row mini3">${PRODUCTOS.map(([k, n]) => `<div class="panel m3">${n}</div>`).join("")}</div>
        <svg class="hilos" viewBox="0 0 1200 80" preserveAspectRatio="none">${[200, 600, 1000].map((xx) => `<line x1="${xx}" y1="0" x2="${xx}" y2="80" pathLength="1"/>`).join("")}</svg>
        <div class="capa panel" id="rcp-con"><b>Un solo juego de conectores</b><div class="row">${SIS.map((t) => `<span class="tag">${t}</span>`).join("")}</div></div>
        <div class="capa panel" id="rcp-db"><b>Un cerebro empresarial</b><div class="row">${N.map((t, i) => `<span class="tag" id="rcn${i}">${t[0].toUpperCase() + t.slice(1)}</span>`).join("")}</div></div>
      </div>`);
    enter("r-base", s);
    at("#r-base .m3", { opacity: 0, y: -20 }, { opacity: 1, y: 0, duration: 0.4, stagger: 0.1 }, x.voiceAt);
    at("#r-base .hilos line", { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.6, stagger: 0.1 }, P(x, "un solo juego") - 0.2);
    pop("#rcp-con", P(x, "un solo juego"));
    at("#rcp-con .tag", { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.35, stagger: 0.15 }, P(x, "con tus sistemas"));
    pop("#rcp-db", P(x, "un cerebro"));
    N.forEach((k, i) => pop(`#rcn${i}`, P(x, k) - 0.1));
    sfx("4a", "pop.mp3", P(x, "un solo juego"), 0.15); sfx("4b", "spark.wav", P(x, "un cerebro"), 0.15);
    leave("r-base", s + d);
  }

  // ── Capítulo 1 · Arvantti OS Enterprise ───────────────────────────────────

  // 5. Todas las IA bajo las mismas reglas, memoria y registro.
  {
    const x = S.os;
    const C = [["las mismas reglas", "Reglas"], ["la misma memoria", "Memoria"], ["el mismo registro", "Registro"]];
    const [s, d] = escena("r-os", x, "e2", 1, `
      <div class="st">
        <div class="row ias">${["IA 1", "IA 2", "IA 3", "IA 4"].map((n) => `<span class="chip">${n}</span>`).join("")}</div>
        <div class="panel capa-os"><img class="marca" src="assets/clips/marca.png" alt=""><b>Arvantti OS</b><small>Sistema operativo empresarial para la IA</small></div>
        <div class="row tres">${C.map(([, t], i) => `<span class="chip" id="ros${i}">${t}</span>`).join("")}</div>
        <span class="tag medida">Configurado a la medida de cada empresa</span>
      </div>`);
    enter("r-os", s);
    pop("#r-os .capa-os", x.voiceAt);
    at("#r-os .ias .chip", { opacity: 0, y: -60 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.12, ease: "power3.out" }, P(x, "todas las IA") - 0.2);
    to("#r-os .ias .chip", { y: 30, scale: 0.9, borderColor: "#4ea7ff", duration: 0.5, stagger: 0.08 }, P(x, "todas las IA") + 0.8);
    C.forEach(([k], i) => { pop(`#ros${i}`, P(x, k) - 0.1); luz(`#ros${i}`, P(x, k) + 0.3); });
    fade("#r-os .medida", P(x, "configurado"));
    sfx("5a", "whoosh-short.mp3", x.voiceAt, 0.18);
    C.forEach(([k], i) => sfx(`5${i}`, "pop.mp3", P(x, k), 0.12));
    leave("r-os", s + d);
  }

  // 6. Las cinco promesas.
  {
    const x = S.promesas;
    const PR = [["Controla", "Controla", "Qué puede hacer cada IA", "◎"], ["Protege", "Protege", "Claves y datos sensibles", "⛨"], ["Organiza", "Organiza", "Cada trabajo, una tarea con responsable", "▤"], ["Recuerda", "Recuerda", "Qué se decidió y por qué", "✦"], ["rinde cuentas", "Rinde cuentas", "Cada acción, un comprobante", "✓"]];
    const [s, d] = escena("r-prom", x, "e2", 1, `
      <div class="st">
        <h2 class="h md p-t">${words("Cinco promesas")}</h2>
        <div class="row proms">${PR.map(([, n, t, ic], i) => `<div class="panel card prom" id="${i === 4 ? "pm4" : `rpm${i}`}"><i class="ic">${ic}</i><b>${n}</b><small>${t}</small></div>`).join("")}</div>
      </div>`);
    enter("r-prom", s);
    titleIn("#r-prom .p-t", x.voiceAt);
    PR.forEach(([k], i) => { const sel = i === 4 ? "#pm4" : `#rpm${i}`; pop(sel, P(x, k) - 0.15); brilla(sel, P(x, k) + 0.2); });
    PR.forEach(([k], i) => sfx(`6${i}`, "pop.mp3", P(x, k), 0.12));
    leave("r-prom", s + d);
  }

  // 7. Edición Enterprise: agentes con flujos y aprobaciones; Fractal Process y Fractal Finance.
  {
    const x = S.enterprise;
    const AG = ["Agente de ventas", "Agente de producción", "Agente de finanzas"];
    const tP = P(x, "Fractal Process"), tF = P(x, "Fractal Finance");
    const [s, d] = escena("r-ent", x, "e2", 1, `
      <div class="st apretado">
        <div class="row ags">${AG.map((t) => `<div class="panel card ag"><i class="ic">◉</i><small>${t}</small></div>`).join("")}</div>
        <div class="row flujo"><span class="chip" id="rfl0">Flujos de la empresa</span><span class="flecha-t">→</span><span class="chip" id="rfl1">Aprobación ✓</span></div>
        <div class="row anill">
          <div class="panel card mod" id="rmp"><b>Fractal Process</b><small>Optimiza procesos y decisiones</small></div>
          <div class="panel card mod" id="rmf"><b>Fractal Finance</b><small>Caja, margen y compras</small></div>
        </div>
      </div>`);
    enter("r-ent", s);
    at("#r-ent .ag", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.4, stagger: 0.18, ease: "back.out(1.8)" }, P(x, "agentes") - 0.2);
    pop("#rfl0", P(x, "los flujos")); luz("#rfl0", P(x, "los flujos") + 0.3);
    fade("#r-ent .flecha-t", P(x, "las aprobaciones") - 0.2); pop("#rfl1", P(x, "las aprobaciones")); luz("#rfl1", P(x, "las aprobaciones") + 0.3);
    pop("#rmp", tP - 0.1); brilla("#rmp", tP + 0.3);
    pop("#rmf", tF - 0.1); brilla("#rmf", tF + 0.3);
    sfx("7a", "pop.mp3", P(x, "agentes"), 0.12); sfx("7b", "spark.wav", tP, 0.16); sfx("7c", "spark.wav", tF, 0.16);
    leave("r-ent", s + d);
  }

  // ── Capítulo 2 · Arvantti OS Coding ───────────────────────────────────────

  // 8. Tres agentes de código, cada uno en su terminal y su rama, bajo las mismas reglas.
  {
    const x = S.coding;
    const A = [["Claude Code", "tarea-142-reportes"], ["Codex", "tarea-143-pruebas"], ["Gemini", "tarea-144-docs"]];
    const [s, d] = escena("r-cod", x, "rc", 2, `
      <div class="st">
        <h2 class="h md c-t">${words("Arvantti OS Coding")}</h2>
        <div class="row terms">${A.map(([n, r], i) => `<div class="panel term" id="rt${i}"><div class="barra"><i></i><i></i><i></i><span>${n}</span></div>
          <p class="ln">$ git switch <em>${r}</em></p><p class="ln">$ leer reglas del proyecto</p><p class="ln ok">✓ listo para trabajar</p><span class="rama">rama · ${r}</span></div>`).join("")}</div>
        <span class="chip on reglas">Las mismas reglas para todos</span>
      </div>`);
    enter("r-cod", s);
    titleIn("#r-cod .c-t", P(x, "Arvantti OS Coding") - 0.1, 0.1);
    A.forEach(([n], i) => {
      const t = P(x, n);
      pop(`#rt${i}`, t - 0.15);
      at(`#rt${i} .ln`, { opacity: 0, x: -14 }, { opacity: 1, x: 0, duration: 0.25, stagger: 0.35 }, t + 0.2);
      fade(`#rt${i} .rama`, P(x, "su rama"));
    });
    pop("#r-cod .reglas", P(x, "las mismas reglas"));
    A.forEach(([n], i) => sfx(`8${i}`, "click.wav", P(x, n), 0.15));
    sfx("8r", "spark.wav", P(x, "las mismas reglas"), 0.16);
    leave("r-cod", s + d);
  }

  // 9. Niveles de plan documentados; pruebas automáticas; aprobación humana antes de la rama principal.
  {
    const x = S.planes;
    const N = [["Tarea simple", 30], ["Plan corto", 50], ["Plan detallado", 72], ["Especificación completa", 100]];
    const F = [["Cambio", ""], ["Pruebas", "✓"], ["Aprobación de una persona", "✓"], ["Rama principal", ""]];
    const [s, d] = escena("r-plan", x, "rc", 2, `
      <div class="st">
        <div class="row planes">
          <div class="panel niveles"><small>Nivel de plan</small>${N.map(([n, w], i) => `<div class="nv" id="rnv${i}"><span>${n}</span><i style="width:${w}%"></i></div>`).join("")}
            <div class="row docs">${["plan.md", "spec.md", "Base del proyecto"].map((t) => `<span class="tag">${t}</span>`).join("")}</div></div>
          <div class="flujo-c">${F.map(([n, ok], i) => `<div class="panel paso" id="rps${i}"><b>${n}</b>${ok ? `<em class="ok">${ok}</em>` : ""}</div>${i < 3 ? `<span class="fl" id="rfc${i}">↓</span>` : ""}`).join("")}</div>
        </div>
      </div>`);
    enter("r-plan", s);
    pop("#r-plan .niveles", x.voiceAt);
    at("#r-plan .nv", { opacity: 0, x: -20 }, { opacity: 1, x: 0, duration: 0.35, stagger: 0.25 }, P(x, "tarea simple") - 0.3);
    at("#r-plan .nv i", { scaleX: 0 }, { scaleX: 1, transformOrigin: "0% 50%", duration: 0.5, stagger: 0.25 }, P(x, "tarea simple"));
    brilla("#rnv3", P(x, "especificación completa"));
    at("#r-plan .docs .tag", { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.3, stagger: 0.18 }, P(x, "documentada"));
    const tPr = P(x, "Las pruebas"), tAp = P(x, "sin la aprobación");
    pop("#rps0", tPr - 0.4); fade("#rfc0", tPr - 0.1); pop("#rps1", tPr); luz("#rps1", P(x, "en cada cambio"));
    fade("#rfc1", tAp - 0.4); pop("#rps2", tAp - 0.2); luz("#rps2", tAp + 0.5);
    fade("#rfc2", tAp + 0.6); pop("#rps3", tAp + 0.8);
    sfx("9a", "pop.mp3", P(x, "tarea simple"), 0.12); sfx("9b", "click.wav", tPr, 0.15); sfx("9c", "spark.wav", tAp + 0.5, 0.16);
    leave("r-plan", s + d);
  }

  // 10. Claves ocultas; cada cambio enlazado a su tarea, su aprobación y su comprobante.
  {
    const x = S.claves;
    const E = [["su tarea", "Tarea 142"], ["su aprobación", "Aprobación"], ["su comprobante", "Comprobante"]];
    const [s, d] = escena("r-cla", x, "rc", 2, `
      <div class="st">
        <div class="row cla">
          <div class="panel llave"><small>Clave de acceso</small><code>API_KEY = <span class="oculta">••••••••••••</span></code><em class="cand">🔒 Nunca se ve</em></div>
          <div class="cadena"><div class="panel card on camb" id="rcb"><b>Cambio</b></div>${E.map(([, n], i) => `<span class="eslabon" id="res${i}"></span><div class="panel card ces" id="rce${i}"><b>${n}</b></div>`).join("")}</div>
        </div>
        <h2 class="h md gob">${words("La IA bajo tu gobierno.")}</h2>
      </div>`);
    enter("r-cla", s);
    pop("#r-cla .llave", x.voiceAt);
    at("#r-cla .oculta", { opacity: 0 }, { opacity: 1, duration: 0.3 }, x.voiceAt + 0.5);
    fade("#r-cla .cand", P(x, "nunca se ven"));
    pop("#rcb", P(x, "cada cambio"));
    E.forEach(([k], i) => { at(`#res${i}`, { scaleY: 0 }, { scaleY: 1, transformOrigin: "50% 0%", duration: 0.25 }, P(x, k) - 0.25); pop(`#rce${i}`, P(x, k) - 0.05); brilla(`#rce${i}`, P(x, k) + 0.3); });
    titleIn("#r-cla .gob", P(x, "La IA bajo") - 0.1, 0.08);
    E.forEach(([k], i) => sfx(`10${i}`, "pop.mp3", P(x, k), 0.12));
    sfx("10g", "spark.wav", P(x, "La IA bajo"), 0.18);
    leave("r-cla", s + d);
  }

  // ── Capítulo 3 · Arvantti Digital Twin ────────────────────────────────────

  // 11. Copia viva en 3D: observa, simula y recomienda; desde el Control Center lo aprobado baja a planta.
  {
    const x = S.gemelo;
    const V = [["observa", "Observa"], ["simula", "Simula"], ["recomienda", "Recomienda"]];
    const [s, d] = escena("r-gem", x, "e3", 3, `
      <div class="st">
        <div class="row gem">
          <div class="pg">${foto3d("rpl11", ["3d-inyectoras", "3d-medio", "3d-heroe"])}</div>
          <div class="ld3">
            <div class="panel card on" id="rtw"><b>Digital Twin</b><small>Copia viva en 3D</small></div>
            <span class="chip" id="rsl">Conectado a tus sistemas</span>
            <div class="row vb">${V.map(([, t], i) => `<span class="chip" id="rvb${i}">${t}</span>`).join("")}</div>
            <span class="chip nunca" id="rcc11">Control Center · lo aprobado baja a planta</span>
            <div class="row vb"><span class="chip" id="rsc0">SCADA de tu empresa</span><span class="chip" id="rsc1">Dendro SCADA</span></div>
          </div>
        </div>
      </div>`);
    enter("r-gem", s);
    { const tf = [x.voiceAt - 0.3, P(x, "al ritmo"), P(x, "observa")];
      tf.forEach((t, i) => { at(`#rpl11 img:nth-child(${i + 1})`, { opacity: 0, scale: 1.12 }, { opacity: 1, scale: 1, duration: 1, ease: "power2.out" }, t); to(`#rpl11 img:nth-child(${i + 1})`, { scale: 1.06, duration: 6, ease: "none" }, t + 1); }); }
    pop("#rtw", P(x, "copia viva") - 0.2);
    pop("#rsl", P(x, "lo que ya tienes")); luz("#rsl", P(x, "lo que ya tienes") + 0.3);
    V.forEach(([k], i) => { pop(`#rvb${i}`, P(x, k) - 0.1); luz(`#rvb${i}`, P(x, k) + 0.3); });
    pop("#rcc11", P(x, "Control Center")); luz("#rcc11", P(x, "una persona aprueba"));
    pop("#rsc0", P(x, "SCADA de tu empresa")); pop("#rsc1", P(x, "Dendro SCADA")); luz("#rsc1", P(x, "Dendro SCADA") + 0.3);
    sfx("11a", "whoosh-short.mp3", x.voiceAt, 0.18);
    V.forEach(([k], i) => sfx(`11${i}`, "pop.mp3", P(x, k), 0.12));
    leave("r-gem", s + d);
  }

  // 12 y 13. Un núcleo y siete módulos (heptágono con conexiones al núcleo).
  const M = [["Integrator", "Integrator", "Conecta ERP, CRM y SCADA"], ["APS", "APS", "Planificador avanzado"], ["CoSimulation", "CoSimulation", "Reglas primero, luego el futuro"], ["Fractal Industrial", "Fractal Industrial", "Compara alternativas"], ["Control Center", "Control Center", "Avance, inventarios y necesidades"], ["Dendro", "Dendro", "IA en la máquina"], ["asistente", "Asistente de IA", "Reportes y gráficas"]];
  const R = VERT ? 330 : 290, RX = VERT ? 1.05 : 1.45;
  const pos = (i) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / 7; return [Math.cos(a) * R * RX, Math.sin(a) * R]; };
  const hepta = (id) => `<div class="hepta">
      <svg class="rayos" viewBox="-800 -500 1600 1000">${M.map((_, i) => { const [px, py] = pos(i); return `<line id="${id}-l${i}" x1="0" y1="0" x2="${px.toFixed(0)}" y2="${py.toFixed(0)}" pathLength="1"/>`; }).join("")}</svg>
      <div class="nucleo-dt"><b>Núcleo</b><small>Digital Twin</small></div>
      ${M.map(([, n, f], i) => { const [px, py] = pos(i); return `<div class="panel md-m" id="${id}-m${i}" style="left:calc(50% + ${px.toFixed(0)}px);top:calc(50% + ${py.toFixed(0)}px)"><b>${n}</b><small>${f}</small></div>`; }).join("")}
    </div>`;
  const encender = (id, i, t) => { to(`#${id}-m${i}`, { opacity: 1, borderColor: "#4ea7ff", backgroundColor: "#10264a", boxShadow: "0 0 50px #2d7ff988", duration: 0.35 }, t); at(`#${id}-l${i}`, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.4 }, t - 0.1); };
  {
    const x = S.modulos;
    const [s, d] = escena("r-mod", x, "e3", 3, `<div class="st">${hepta("hA")}<span class="chip on reglas12" id="rrg">1 · Incorpora tus reglas → 2 · Corre el futuro</span></div>`);
    enter("r-mod", s);
    pop("#r-mod .nucleo-dt", x.voiceAt);
    at("#r-mod .md-m", { opacity: 0, scale: 0.5 }, { opacity: 0.45, scale: 1, duration: 0.4, stagger: 0.1, ease: "back.out(2)" }, P(x, "siete módulos"));
    encender("hA", 0, P(x, "Integrator"));
    encender("hA", 1, P(x, "El APS"));
    encender("hA", 2, P(x, "el cosimulador"));
    pop("#rrg", P(x, "primero incorpora"));
    sfx("12a", "pop.mp3", x.voiceAt, 0.12);
    ["Integrator", "El APS", "el cosimulador"].forEach((k, i) => sfx(`12${i}`, "pop.mp3", P(x, k), 0.12));
    leave("r-mod", s + d);
  }
  {
    const x = S.modulos2;
    const K = [[3, "Fractal Industrial"], [4, "El Control Center"], [5, "Dendro"], [6, "el asistente"]];
    const [s, d] = escena("r-mod2", x, "e3", 3, `<div class="st">${hepta("hB")}<span class="chip ap13" id="rap">Dendro actúa solo con aprobación de una persona</span></div>`);
    enter("r-mod2", s);
    at("#r-mod2 .md-m", { opacity: 0.45 }, { opacity: 0.45, duration: 0.01 }, s);
    [0, 1, 2].forEach((i) => { to(`#hB-m${i}`, { opacity: 1, borderColor: "#4ea7ff", backgroundColor: "#10264a", duration: 0.01 }, s); at(`#hB-l${i}`, { strokeDashoffset: 0 }, { strokeDashoffset: 0, duration: 0.01 }, s); });
    K.forEach(([i, k]) => encender("hB", i, P(x, k)));
    pop("#rap", P(x, "la aprobación")); luz("#rap", P(x, "la aprobación") + 0.3);
    K.forEach(([, k], i) => sfx(`13${i}`, "pop.mp3", P(x, k), 0.12));
    leave("r-mod2", s + d);
  }

  // 14. IA en cada módulo; MCP y CLI para otras IA.
  {
    const x = S.ia;
    const tM = P(x, "MCP");
    const [s, d] = escena("r-ia", x, "e3", 3, `
      <div class="st">
        <div class="row asi">
          <div class="panel vz redia">${red(c, "rred14", { w: 620, h: 330, capas: [4, 6, 6, 3], t0: x.voiceAt, dur: 3.5, seed: 8 })}<small>IA en cada módulo</small></div>
          <div class="conex">
            <span class="chip" id="rcx0">MCP · conexión estándar para IA</span>
            <span class="chip" id="rcx1">CLI · línea de comandos</span>
            <div class="row otras">${["Otra IA 1", "Otra IA 2", "Otra IA 3"].map((t) => `<span class="tag">${t}</span>`).join("")}</div>
          </div>
        </div>
      </div>`);
    enter("r-ia", s);
    pop("#r-ia .redia", x.voiceAt);
    pop("#rcx0", tM - 0.1); pop("#rcx1", P(x, "CLI") - 0.1);
    at("#r-ia .otras .tag", { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.35, stagger: 0.15 }, P(x, "otros modelos"));
    sfx("14a", "spark.wav", x.voiceAt, 0.15); sfx("14b", "pop.mp3", tM, 0.12); sfx("14c", "pop.mp3", P(x, "CLI"), 0.12);
    leave("r-ia", s + d);
  }

  // ── Capítulo 4 · Arvantti Fractal ─────────────────────────────────────────

  // 15. No es un solo algoritmo: primero las reglas, después cinco familias de métodos.
  {
    const x = S.metodos;
    const FK = ["inteligencia artificial", "optimización matemática", "algoritmos genéticos", "métodos estocásticos", "simulación Montecarlo"];
    const tD = P(x, "Después combina");
    const [s, d] = escena("r-met", x, "e4", 4, `
      <div class="st apretado">
        <h2 class="h md f-t">${words("No es un solo algoritmo")}</h2>
        <span class="chip on rg">1 · Incorpora tus reglas</span>
        ${familias("rfa")}
        <div class="row mv">
          <div class="panel vz">${red(c, "rred15", { w: 560, h: 260, capas: [4, 6, 6, 3], t0: P(x, FK[0]), dur: 3, seed: 15 })}<small>Inteligencia artificial</small></div>
          <div class="panel vz">${caminos(c, "rcm15", { w: 560, h: 260, cols: 6, filas: 4, explorar: 12, mejores: 3, t0: P(x, FK[1]), dur: 3.4, seed: 11 })}<small>Busca mejores planes</small></div>
        </div>
      </div>`);
    enter("r-met", s);
    titleIn("#r-met .f-t", x.voiceAt, 0.08);
    pop("#r-met .rg", P(x, "Primero incorpora"));
    at("#rfa .chip", { opacity: 0 }, { opacity: 0.35, duration: 0.2 }, tD - 0.2);
    FK.forEach((k, i) => { to(`#rfa-${i}`, { opacity: 1, duration: 0.2 }, P(x, k)); luz(`#rfa-${i}`, P(x, k) + 0.2); });
    at("#r-met .mv .vz", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.45, stagger: 0.3 }, tD + 0.2);
    sfx("15a", "pop.mp3", P(x, "Primero incorpora"), 0.15);
    FK.forEach((k, i) => sfx(`15${i}`, "pop.mp3", P(x, k), 0.1));
    leave("r-met", s + d);
  }

  // 16. Varios objetivos a la vez y Montecarlo ante escenarios inciertos.
  {
    const x = S.montecarlo;
    const C = [["probabilidad de cumplir", "Prob. de cumplir"], ["cuánto varía", "Variabilidad"], ["peores casos", "Peores casos"]];
    const tMC = P(x, "con Montecarlo");
    const [s, d] = escena("r-mc", x, "e4", 4, `
      <div class="st">
        <div class="row mcr">
          <div class="panel vz" id="rpa">${pareto(c, "rpr16", { w: 560, h: 330, t0: x.voiceAt + 0.2 })}<small>Varios objetivos a la vez</small></div>
          <div class="panel vz" id="rmc">${montecarlo(c, "rmc16", { w: 620, h: 330, n: 50, t0: tMC + 0.2, dur: 3.5, seed: 31 })}<small>Escenarios inciertos</small></div>
        </div>
        <div class="row caps">${C.map(([, t], i) => `<span class="chip" id="rcp${i}">${t}</span>`).join("")}</div>
      </div>`);
    enter("r-mc", s);
    pop("#rpa", x.voiceAt);
    pop("#rmc", tMC - 0.1);
    C.forEach(([k], i) => { pop(`#rcp${i}`, P(x, k) - 0.1); luz(`#rcp${i}`, P(x, k) + 0.3); });
    sfx("16a", "pop.mp3", x.voiceAt, 0.12); sfx("16b", "whoosh-short.mp3", tMC, 0.18);
    C.forEach(([k], i) => sfx(`16${i}`, "pop.mp3", P(x, k), 0.1));
    leave("r-mc", s + d);
  }

  // 17. Las mejores opciones con lo que gana y cede cada una; un núcleo, tres módulos.
  {
    const x = S.opciones;
    const Mo = [["Industrial", "Fractal Industrial", "En el gemelo"], ["Process", "Fractal Process", "En Arvantti OS"], ["Finance", "Fractal Finance", "En Arvantti OS Enterprise"]];
    const tN = P(x, "Un núcleo");
    const [s, d] = escena("r-opc", x, "e4", 4, `
      <div class="st apretado">
        ${opciones("rop17", [["Opción A", [88, 52, 60], "Gana capacidad, cede caja"], ["Opción B", [72, 80, 70], "Equilibrada"], ["Opción C", [60, 66, 88], "Gana caja, cede plazo"]], [["Capacidad"], ["Plazo"], ["Caja"]])}
        <div class="row tri">${Mo.map(([, n, p], i) => `<div class="panel card" id="rfm${i}"><b>${n}</b><small>${p}</small></div>`).join("")}</div>
      </div>`);
    enter("r-opc", s);
    animarOpciones(c, "rop17", P(x, "las mejores opciones") - 0.2, P(x, "lo que gana"));
    to("#rop17", { opacity: 0.4, scale: 0.92, duration: 0.4 }, tN - 0.2);
    Mo.forEach(([k], i) => { pop(`#rfm${i}`, P(x, k) - 0.1); brilla(`#rfm${i}`, P(x, k) + 0.3); });
    sfx("17a", "pop.mp3", P(x, "las mejores opciones"), 0.12);
    Mo.forEach(([k], i) => sfx(`17${i}`, "pop.mp3", P(x, k), 0.12));
    leave("r-opc", s + d);
  }

  // ── Capítulo 5 · La respuesta ─────────────────────────────────────────────

  // 18. Vuelve la junta: datos, escenario, simulación y aviso de Dendro.
  {
    const x = S.vuelve;
    const D = ["ventas", "pedidos", "inventarios", "costos"];
    const tO = P(x, "Arvantti OS"), tG = P(x, "El gemelo"), tD = P(x, "Dendro");
    const [s, d] = escena("r-vue", x, "e7", 5, `
      <div class="st">
        <div class="row cuatro">
          <div class="panel vz4" id="rv0"><small>Integrator</small><div class="pila4">${D.map((t, i) => `<span class="tag" id="rdt${i}">${t}</span>`).join("")}</div></div>
          <div class="panel vz4" id="rv1"><small>Arvantti OS</small><span class="tag" id="rcer18">Cerebro empresarial</span><b>Escenario</b><span>Con certeza · contexto y permisos</span></div>
          <div class="panel vz4" id="rv2"><small>Gemelo</small><div class="pl">${foto3d("rpl18", ["3d-inyectoras-2"])}</div>${gantt(c, "rgt18", { filas: [["Línea 1", [[0, 40], [44, 80]]], ["Línea 2", [[0, 52], [56, 99]]]], cuello: 1, t0: P(x, "cuello de botella") - 0.4 })}</div>
          <div class="panel vz4" id="rv3"><small>Dendro</small><div class="aviso"><b>Máquina 7</b><span>Mantenimiento antes</span></div></div>
        </div>
      </div>`);
    enter("r-vue", s);
    pop("#rv0", P(x, "Integrator") - 0.1);
    D.forEach((k, i) => izq(`#rdt${i}`, P(x, k) - 0.1));
    pop("#rv1", tO - 0.1);
    pop("#rcer18", P(x, "cerebro empresarial") - 0.1); luz("#rcer18", P(x, "cerebro empresarial") + 0.3);
    pop("#rv2", tG - 0.1);
    at("#rpl18 img", { opacity: 0, scale: 1.15 }, { opacity: 1, scale: 1, duration: 1.2, ease: "power2.out" }, tG);
    pop("#rv3", tD - 0.1);
    at("#r-vue .aviso", { opacity: 0, scale: 0.7 }, { opacity: 1, scale: 1, duration: 0.4, ease: "back.out(2)" }, P(x, "qué máquina"));
    sfx("18a", "pop.mp3", P(x, "Integrator"), 0.12); sfx("18b", "pop.mp3", tO, 0.12); sfx("18c", "pop.mp3", tG, 0.12); sfx("18d", "hit.wav", P(x, "qué máquina"), 0.18);
    leave("r-vue", s + d);
  }

  // 19. Fractal compara; Arvantti OS explica con fuentes y comprobantes; la junta decide.
  {
    const x = S.decide;
    const tE = P(x, "Arvantti OS presentó"), tJ = P(x, "Y la junta decide");
    const [s, d] = escena("r-dec", x, "e7", 5, `
      <div class="st apretado">
        ${opciones("rop19", [["Alternativa A", [88, 52, 58, 40], "Sumar un turno"], ["Alternativa B", [70, 82, 70, 75], "Más inventario"], ["Alternativa C", [64, 66, 86, 55], "Otro proveedor"]], [["Capacidad"], ["Inventario"], ["Caja"], ["Riesgo bajo"]])}
        <div class="panel res" id="rres"><small>Resultado explicado</small><b>La alternativa B cumple la demanda con el margen más estable.</b>
          <div class="row fuentes">${["Fuentes", "Comprobantes"].map((t) => `<span class="tag">${t} <em class="ok">✓</em></span>`).join("")}</div></div>
        <div class="row rd"><span class="chip" id="rrd0">La IA recomienda</span><span class="chip on" id="rrd1">Las personas deciden</span></div>
      </div>`);
    enter("r-dec", s);
    animarOpciones(c, "rop19", x.voiceAt, P(x, "capacidad"));
    to("#rop19-1", { borderColor: "#4ea7ff", boxShadow: "0 0 50px #2d7ff988", duration: 0.4 }, P(x, "con su riesgo"));
    pop("#rres", tE - 0.1);
    at("#rres .tag", { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.3, stagger: 0.2 }, P(x, "con sus fuentes"));
    pop("#rrd0", P(x, "La IA recomienda")); pop("#rrd1", P(x, "la decisión"));
    sfx("19a", "pop.mp3", x.voiceAt, 0.12); sfx("19b", "pop.mp3", tE, 0.12); sfx("19c", "spark.wav", tJ, 0.18);
    leave("r-dec", s + d);
  }

  mapa(c, S.mapa, pop);
  indice(c);
  cierre(c, S.cierre);
  ESCENAS.slice(1).forEach((e) => sweep(S[e.id].start));
  void words;
}

// ── Índice: barra de avance arriba y tarjeta de capítulo al empezar cada uno ──
const NOMBRES = ["La pregunta", "Arvantti OS Enterprise", "Arvantti OS Coding", "Arvantti Digital Twin", "Arvantti Fractal", "La respuesta"];
const CORTOS = ["La pregunta", "OS Enterprise", "OS Coding", "Digital Twin", "Fractal", "La respuesta"];
const LEMAS = ["Si la demanda sube, ¿nos alcanza?", "Gobierna la IA de tu empresa", "Cada IA en su terminal, con aprobación humana", "Tu operación en 3D: observa, simula y recomienda", "Las mejores opciones y su impacto", "La IA recomienda; la junta decide"];
function indice(c) {
  const { S, total, clip, at, to, set } = c;
  const ini = CAPITULOS.map(([id]) => S[id].start);
  const fin = ini.map((t, k) => (k + 1 < ini.length ? ini[k + 1] : total));
  clip("barra", "barra", 0, total, `<div class="pb">${CORTOS.map((n, k) => `<div class="s" id="pb${k}"><span><i></i></span><b><em>${k + 1}</em><u> · ${n}</u></b></div>`).join("")}</div><div class="pbn">${CORTOS.map((n, k) => `<b id="pbn${k}">${k + 1} · ${n}</b>`).join("")}</div>`, 30);
  ini.forEach((t, k) => {
    at(`#pb${k} i`, { scaleX: 0 }, { scaleX: 1, duration: fin[k] - t, ease: "none" }, t);
    set(`#pb${k} b`, { color: "#ffffff" }, t);
    set(`#pb${k} b`, { color: "#7fa6d6" }, fin[k]);
    set(`#pb${k} i`, { backgroundColor: "#2d7ff9" }, fin[k]);
    at(`#pbn${k}`, { opacity: 0 }, { opacity: 1, duration: 0.3 }, t);
    if (k + 1 < ini.length) to(`#pbn${k}`, { opacity: 0, duration: 0.3 }, fin[k]);
  });
  at("#barra", { opacity: 0 }, { opacity: 1, duration: 0.5 }, ini[0] + 2.8);
  to("#barra", { opacity: 0, duration: 0.5 }, S.mapa.start);
  // Tarjetas: cubren la pantalla mientras la escena entra y se van justo antes de la voz.
  CAPITULOS.forEach(([id], k) => {
    const x = S[id], t0 = x.start, t1 = x.voiceAt - 0.25, idc = `idx${k}`;
    clip(idc, "indice", t0, t1 - t0, `<div class="cab">GRAN RESUMEN ARVANTTI · CAPÍTULO ${k + 1} DE 6</div><h1>${NOMBRES[k]}</h1><div class="sub">${LEMAS[k]}</div>
      <div class="ruta"><span class="base"></span><span class="hecho"></span>${NOMBRES.map((n, j) => `<div class="p${j < k ? " ok" : j === k ? " on" : ""}"><i>${j + 1}</i><b>${n}</b></div>`).join("")}</div>`, 35);
    at(`#${idc}`, { opacity: k ? 0 : 1 }, { opacity: 1, duration: 0.35 }, t0);
    at(`#${idc} h1, #${idc} .cab, #${idc} .sub`, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.08, ease: "power3.out" }, t0 + 0.15);
    at(`#${idc} .hecho`, { scaleX: k ? (k - 1) / 5 : 0 }, { scaleX: k / 5, duration: 0.8, ease: "power2.inOut" }, t0 + 0.4);
    at(`#${idc} .p.on i`, { scale: 0.6 }, { scale: 1, duration: 0.5, ease: "back.out(2)" }, t0 + 0.9);
    to(`#${idc}`, { opacity: 0, filter: "blur(12px)", duration: 0.4 }, t1 - 0.4);
  });
}

// ── Gran mapa final: todo conectado con todo ──
function mapa(c, x, pop) {
  const { at, to, clip, span, P, VERT, sfx } = c;
  const [s, d] = span(x);
  const Z = VERT
    ? [["fr", 40, 180, 1000, 460], ["os", 40, 668, 1000, 400], ["dt", 40, 1094, 1000, 420], ["ba", 40, 1546, 1000, 236]]
    : [["fr", 70, 144, 1780, 286], ["os", 70, 448, 870, 372], ["dt", 980, 448, 870, 372], ["ba", 70, 850, 1780, 124]];
  clip("r-mapa", "scene mapa", s, d, `<div class="lienzo"><div class="zoom"><img src="assets/clips/gran-mapa-${VERT ? "vertical" : "horizontal"}.png">${Z.map(([k, l, t, w, h]) => `<span class="zona" id="mz-${k}" style="left:${l - 6}px;top:${t - 6}px;width:${w + 12}px;height:${h + 12}px"></span>`).join("")}</div></div>`, 3);
  at("#r-mapa", { opacity: 0 }, { opacity: 1, duration: 0.6 }, s);
  at("#r-mapa .zoom", { scale: 0.92, filter: "blur(14px)" }, { scale: 1, filter: "blur(0px)", duration: 1.2, ease: "power3.out" }, s);
  [["fr", "Arvantti Fractal"], ["os", "Arvantti OS"], ["dt", "Arvantti Digital Twin"], ["ba", "los dos comparten"]].forEach(([k, frag], i) => {
    const t = P(x, frag);
    at(`#mz-${k}`, { opacity: 0 }, { opacity: 1, duration: 0.35 }, t - 0.1);
    to(`#mz-${k}`, { opacity: 0, duration: 0.5 }, t + 2.6);
    sfx(`mp${i}`, "pop.mp3", t, 0.12);
  });
  to("#r-mapa", { opacity: 0, filter: "blur(14px)", duration: 0.5 }, s + d - 0.25);
  void pop;
}

// Tomas reales del gemelo 3D de la planta de plásticos (las mismas del video de lanzamiento).
function foto3d(id, tomas) {
  return `<div class="foto3d" id="${id}">${tomas.map((t) => `<img src="assets/clips/${t}.png" alt="">`).join("")}</div>`;
}
