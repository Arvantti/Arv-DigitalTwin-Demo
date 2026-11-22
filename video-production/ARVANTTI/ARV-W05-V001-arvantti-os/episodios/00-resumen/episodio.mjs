// Resumen de la serie · Arvantti OS Enterprise. Reúne las piezas visuales de los episodios 1 a 7.
import { figura, PROMESAS, promOn, firma } from "../../comun.mjs";

export const ESCENAS = [
  { id: "pregunta", dir: "01-pregunta", lead: 1.2, tail: 1.0 },
  { id: "titulo", dir: "02-titulo", lead: 0.5, tail: 1.2 },
  { id: "base", dir: "03-base", lead: 0.3, tail: 0.8 },
  { id: "nucleo", dir: "04-nucleo", lead: 0.2, tail: 1.0 },
  { id: "organiza", dir: "05-organiza", lead: 0.3, tail: 0.9 },
  { id: "recuerda", dir: "06-recuerda", lead: 0.3, tail: 0.9 },
  { id: "controla", dir: "07-controla", lead: 0.3, tail: 0.9 },
  { id: "protege", dir: "08-protege", lead: 0.3, tail: 0.9 },
  { id: "enterprise", dir: "09-enterprise", lead: 0.3, tail: 0.9 },
  { id: "dirigir", dir: "10-dirigir", lead: 0.2, tail: 0.9 },
  { id: "fractal", dir: "11-fractal", lead: 0.3, tail: 1.0 },
  { id: "rinde", dir: "12-rinde", lead: 0.3, tail: 1.0 },
  { id: "coding", dir: "13-coding", lead: 0.3, tail: 1.2 },
  { id: "firma", dir: "14-firma", lead: 0.6, tail: 3.5 },
];

const C = Object.fromEntries(PROMESAS.map((p) => [p.id, p.c]));
const NODOS = [
  ["Gerente", "Persona", 120, 110], ["Cliente Andes", "Cliente", 620, 90], ["Pedido 4471", "Pedido", 640, 330],
  ["Margen por producto", "Decisión", 380, 260], ["Acta de junta", "Evidencia", 150, 420], ["Correo 3 oct", "Evidencia", 420, 470],
];
const ENL = [[0, 3], [3, 4], [3, 5], [1, 2], [2, 3], [0, 5]];
const orbe = (id) => `<div class="orb" id="${id}"><div class="ring r1"></div><div class="ring r2"></div><div class="mic"><svg viewBox="0 0 24 24"><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zm-7 9h2a5 5 0 0 0 10 0h2a7 7 0 0 1-6 6.9V21h-2v-2.1A7 7 0 0 1 5 12z"/></svg></div></div>`;

export function componer(c) {
  const { S, VERT, at, to, set, clip, sfx, span, enter, leave, words, wordsIn, sweep, P } = c;

  // 1. Pregunta: ventanas de IA por todas partes.
  {
    const x = S.pregunta; const [s, d] = span(x);
    const V = [["Chat de IA", "Ventas"], ["Asistente", "Finanzas"], ["Copiloto", "Operaciones"], ["Agente", "Compras"], ["Chat de IA", "Talento humano"], ["Bot", "Servicio al cliente"]];
    const pos = VERT
      ? [[90, 260], [600, 330], [120, 560], [560, 1380], [90, 1600], [600, 1640]]
      : [[90, 120], [1420, 110], [120, 760], [1450, 740], [700, 60], [760, 880]];
    clip("e-gancho", "scene", s, d, `
      ${V.map(([a, b], i) => `<div class="win" id="win${i}" style="left:${pos[i][0]}px;top:${pos[i][1]}px"><div class="wb"><i></i><i></i><i></i><span>${a}</span></div><p>${b}</p><div class="ln"></div><div class="ln s"></div></div>`).join("")}
      <p class="center pre">${words("La IA ya está en su empresa.")}</p>
      <h1 class="center q">${words("¿Quién la gobierna?")}</h1>`);
    V.forEach((_, i) => {
      at(`#win${i}`, { opacity: 0, scale: 0.6, y: 40 }, { opacity: 1, scale: 1, y: 0, duration: 0.5, ease: "back.out(1.8)" }, 0.15 + i * 0.25);
      sfx("pop.mp3", 0.15 + i * 0.25, 0.12);
    });
    wordsIn("#e-gancho .pre", x.voiceAt, 0.08);
    const tP = P(x, "Pero");
    to("#e-gancho .win", { opacity: 0.25, filter: "blur(3px)", duration: 0.6 }, tP);
    to("#e-gancho .pre", { opacity: 0.45, duration: 0.6 }, tP);
    at("#e-gancho .q .w", { opacity: 0, y: 40, filter: "blur(16px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.7, stagger: 0.16, ease: "power3.out" }, P(x, "¿quién") - 0.1);
    to("#e-gancho .q", { scale: 1.4, opacity: 0, filter: "blur(20px)", duration: 0.7, ease: "power2.in" }, s + d - 0.7);
    to("#e-gancho .pre, #e-gancho .win", { opacity: 0, duration: 0.5 }, s + d - 0.7);
    sfx("whoosh.wav", 0.1, 0.2);
  }

  // 2. Título.
  {
    const x = S.titulo; const [s, d] = span(x);
    clip("e-titulo", "scene", s, d, `
      <div class="titulo"><img class="marca" src="assets/clips/marca.png" alt=""><h1 class="metal">Arvantti OS</h1><p class="full">ARVANTTI OPERATING SYSTEM FOR AI</p><p class="sub">${words("El sistema operativo empresarial para la IA")}</p></div>
      <div class="flare"></div>`);
    enter("e-titulo", s);
    at("#e-titulo .marca", { opacity: 0, scale: 0.6, y: 30 }, { opacity: 1, scale: 1, y: 0, duration: 1, ease: "back.out(1.6)" }, x.voiceAt - 0.5);
    at("#e-titulo h1", { opacity: 0, letterSpacing: "40px", filter: "blur(14px)" }, { opacity: 1, letterSpacing: "0px", filter: "blur(0px)", duration: 1.3, ease: "power3.out" }, x.voiceAt - 0.1);
    at("#e-titulo h1", { backgroundPosition: "-200% 0" }, { backgroundPosition: "200% 0", duration: 2.2, ease: "power1.inOut" }, x.voiceAt + 1.2);
    at("#e-titulo .full", { opacity: 0, letterSpacing: "20px" }, { opacity: 1, letterSpacing: "8px", duration: 1, ease: "power3.out" }, x.voiceAt + 0.3);
    wordsIn("#e-titulo .sub", P(x, "El sistema"), 0.06);
    at("#e-titulo .flare", { xPercent: -150, opacity: 0 }, { xPercent: 150, opacity: 1, duration: 1.6, ease: "power2.inOut" }, x.voiceAt + 0.3);
    sfx("hit.wav", x.voiceAt, 0.3);
    leave("e-titulo", s + d);
  }

  // 3 y 4. Base que se conecta con todo y núcleo de cinco promesas.
  {
    const x = S.base, y = S.nucleo;
    const s = x.start - 0.25, d = y.start + y.dur - s + 0.25;
    clip("e-capas", "scene", s, d, `<p class="center figcap c1">${words("Funciona con cualquier IA.")}</p><p class="center figcap c2">${words("Las mismas reglas para todas sus IA.")}</p>${figura("fa")}`);
    enter("e-capas", s);
    set("#fa-ent, #fa-nuc", { opacity: 0 }, s);
    at("#fa-base", { opacity: 0, y: 60 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, s + 0.1);
    wordsIn("#e-capas .c1", x.voiceAt, 0.06);
    ["Claude", "ChatGPT", "Gemini", "Copilot", "modelos privados"].forEach((f, i) => {
      at(`#fa-ia${i}`, { opacity: 0, scale: 0.5 }, { opacity: 1, scale: 1, duration: 0.4, ease: "back.out(2.2)" }, P(x, f) - 0.05);
      sfx("pop.mp3", P(x, f), 0.12);
    });
    ["el de clientes", "el de gestión", "la nube y", "documentos"].forEach((f, i) => at(`#fa-s${i}`, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.4, ease: "back.out(2)" }, P(x, f)));
    [0, 1].forEach((i) => at(`#fa-pl${i}`, { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.4, ease: "back.out(2)" }, P(x, i ? "en la nube." : "escritorio")));
    c.tl.push(`tl.to("#fa-base",{boxShadow:"0 0 0 4px #4ea7ff, 0 0 120px #2d7ff9cc",duration:.45,yoyo:true,repeat:1},${P(x, "se conecta").toFixed(2)});`);
    to("#e-capas .c1", { opacity: 0, duration: 0.3 }, y.voiceAt - 0.2);
    at("#fa-nuc", { opacity: 0, y: 60 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, y.voiceAt);
    sfx("whoosh-short.mp3", y.voiceAt, 0.25);
    const tC = P(y, "cinco promesas");
    PROMESAS.forEach((_, i) => {
      promOn(c, "fa", i, tC + i * 0.22);
      at(`#fa-p${i}`, { scale: 0.8 }, { scale: 1, duration: 0.4, ease: "back.out(2.5)" }, tC + i * 0.22);
      sfx("click.wav", tC + i * 0.22, 0.18);
    });
    wordsIn("#e-capas .c2", P(y, "las mismas"), 0.06);
    leave("e-capas", s + d);
  }

  // 5. Organiza: cada pedido, una tarea con dueño, plan y avance.
  {
    const x = S.organiza; const [s, d] = span(x);
    const F = [["Dueño", "Agente de finanzas", "dueño"], ["Plan", "Paso 1 de 4", "plan"], ["Avance", "60 % · a la vista", "avance"]];
    clip("e-tarea", "scene", s, d, `
      <p class="center figcap">${words("Arvantti OS organiza el trabajo.")}</p>
      <div class="badge-prom" style="--c:${C.organiza}">ORGANIZA</div>
      <div class="tcard"><p class="tid">TAREA T-12</p><h3>${words("Pedido → tarea")}</h3><dl>${F.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl></div>`);
    enter("e-tarea", s);
    at("#e-tarea .badge-prom", { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(2)" }, x.voiceAt);
    wordsIn("#e-tarea .figcap", x.voiceAt + 0.2, 0.06);
    sfx("spark.wav", x.voiceAt, 0.2);
    const tC = P(x, "cada pedido");
    at("#e-tarea .tcard", { opacity: 0, y: 60, rotateX: 20 }, { opacity: 1, y: 0, rotateX: 0, duration: 0.6, ease: "power3.out" }, tC);
    wordsIn("#e-tarea .tcard h3", tC + 0.2, 0.08);
    F.forEach(([, , f], i) => {
      at(`#e-tarea dt:nth-of-type(${i + 1}), #e-tarea dd:nth-of-type(${i + 1})`, { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 0.4 }, P(x, f));
      sfx("click-soft.mp3", P(x, f), 0.22);
    });
    leave("e-tarea", s + d);
  }

  // 6. Recuerda: cerebro en grafo que crece y responde con fuente.
  {
    const x = S.recuerda; const [s, d] = span(x);
    clip("e-fuente", "scene", s, d, `
      <div class="gwrap">${grafo("gf")}</div>
      <div class="resp"><div class="badge-prom rb" style="--c:${C.recuerda}">RECUERDA</div><div class="msg ia"><b>IA</b> La junta pidió ver el margen por producto.<span class="src">Fuente · Acta de junta, 28 sep</span></div></div>`);
    enter("e-fuente", s);
    at("#e-fuente .rb", { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(2)" }, x.voiceAt);
    sfx("spark.wav", x.voiceAt, 0.2);
    const tG = P(x, "un cerebro");
    c.at(`#gf .n:not(.extra)`, { opacity: 0, scale: 0.3, xPercent: -50, yPercent: -50 }, { opacity: 1, scale: 1, xPercent: -50, yPercent: -50, duration: 0.4, stagger: 0.25, ease: "back.out(2)" }, tG);
    c.at(`#gf .l:not(.extra)`, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.5, stagger: 0.25 }, tG + 0.3);
    const tK = P(x, "crece");
    at("#gf .n.extra", { opacity: 0, scale: 0.3, xPercent: -50, yPercent: -50 }, { opacity: 1, scale: 1, xPercent: -50, yPercent: -50, duration: 0.4, stagger: 0.3, ease: "back.out(2)" }, tK);
    at("#gf .l.extra", { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.5, stagger: 0.3 }, tK + 0.1);
    sfx("pop.mp3", tK, 0.12); sfx("pop.mp3", tK + 0.3, 0.12);
    const tF = P(x, "responde con");
    at("#e-fuente .msg", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.4, ease: "back.out(1.6)" }, tF - 0.3);
    at("#e-fuente .src", { opacity: 0, x: -20 }, { opacity: 1, x: 0, duration: 0.4 }, P(x, "fuente"));
    to("#gf .n:nth-child(5), #gf .n:nth-child(6)", { boxShadow: `0 0 0 3px ${C.recuerda}, 0 0 40px ${C.recuerda}`, duration: 0.4 }, P(x, "fuente"));
    leave("e-fuente", s + d);
  }

  // 7. Controla: sus reglas, cumplidas con hooks; lo sensible espera a una persona.
  {
    const x = S.controla; const [s, d] = span(x);
    const tT = P(x, "configura"), tL = P(x, "Lo sensible");
    const A = ["Publicar", "Borrar", "Conectarse afuera"];
    clip("e-principio", "scene", s, d, `
      <p class="center figcap">${words("Arvantti OS controla.")}</p>
      <div class="badge-prom" style="--c:${C.controla}">CONTROLA</div>
      <div class="switch"><div class="track"><div class="knob"></div></div><p class="sw-l">${words("Sus reglas")}</p><p class="sw-s">${words("configurables · se cumplen con hooks")}</p></div>
      <div class="acciones">${A.map((a) => `<div class="acc"><span class="lock"></span>${a}</div>`).join("")}</div>
      <div class="aprob"><p class="ph">ESPERA APROBACIÓN</p><p class="who">Una persona decide</p><div class="btns"><span class="si">Aprobar</span><span class="no">Negar</span></div></div>`);
    enter("e-principio", s);
    set("#e-principio .acciones, #e-principio .aprob", { opacity: 0 }, s);
    at("#e-principio .badge-prom", { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(2)" }, x.voiceAt);
    wordsIn("#e-principio .figcap", x.voiceAt + 0.2, 0.06);
    at("#e-principio .switch", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.5 }, tT - 0.4);
    to("#e-principio .knob", { x: VERT ? 150 : 170, duration: 0.35, ease: "back.out(2)" }, tT);
    to("#e-principio .track", { backgroundColor: C.controla, boxShadow: `0 0 50px ${C.controla}`, duration: 0.3 }, tT);
    sfx("click.wav", tT, 0.35);
    wordsIn("#e-principio .sw-l", tT, 0.08);
    wordsIn("#e-principio .sw-s", P(x, "hooks"), 0.06);
    to("#e-principio .switch, #e-principio .figcap, #e-principio .badge-prom", { opacity: 0, duration: 0.4 }, tL - 0.4);
    to("#e-principio .acciones", { opacity: 1, duration: 0.01 }, tL - 0.05);
    at("#e-principio .acc", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.4, stagger: 0.2, ease: "back.out(2)" }, tL);
    at("#e-principio .aprob", { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, duration: 0.5, ease: "power3.out" }, P(x, "siempre espera"));
    to("#e-principio .si", { scale: 1.1, duration: 0.2, yoyo: true, repeat: 1 }, P(x, "persona"));
    sfx("pop.mp3", tL, 0.14);
    leave("e-principio", s + d);
  }

  // 8. Protege: guardianes que la empresa ajusta, claves tapadas, datos en casa.
  {
    const x = S.protege; const [s, d] = span(x);
    const AC = ["Leer archivo", "Enviar correo", "Abrir conexión", "Borrar carpeta"];
    const tK = P(x, "Las claves"), tD = P(x, "sus datos");
    clip("e-protege", "scene", s, d, `
      <p class="center figcap">${words("Arvantti OS protege.")}</p>
      <div class="badge-prom" style="--c:${C.protege}">PROTEGE</div>
      <div class="control"><div class="cola">${AC.map((a, i) => `<span class="ac" id="ac${i}">${a}</span>`).join("")}</div><div class="escudo"><span>Guardián</span></div><div class="res">${AC.map((_, i) => `<span class="ok${i === 3 ? " no" : ""}">${i === 3 ? "✕ Detenida" : "✓ Revisada"}</span>`).join("")}</div></div>
      <div class="tapa"><p class="ph">RESPUESTA DEL AGENTE</p><p class="rt">La clave del banco es <code class="tapada">•••••••• tapada</code></p></div>
      <p class="nota">${words("Sus datos se quedan en su infraestructura.")}</p>`);
    enter("e-protege", s);
    set("#e-protege .tapa", { opacity: 0 }, s);
    at("#e-protege .badge-prom", { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(2)" }, x.voiceAt);
    wordsIn("#e-protege .figcap", x.voiceAt + 0.2, 0.06);
    sfx("spark.wav", x.voiceAt, 0.2);
    const tG = P(x, "guardianes");
    at("#e-protege .control", { opacity: 0 }, { opacity: 1, duration: 0.4 }, tG - 0.1);
    at("#e-protege .escudo", { opacity: 0, scale: 0.5 }, { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(2)" }, tG);
    AC.forEach((_, i) => {
      at(`#ac${i}`, { opacity: 0, x: -80 }, { opacity: 1, x: 0, duration: 0.35 }, P(x, "revisan") + i * 0.35);
      at(`#e-protege .res span:nth-child(${i + 1})`, { opacity: 0, x: -20 }, { opacity: 1, x: 0, duration: 0.3 }, P(x, "revisan") + i * 0.35 + 0.35);
      sfx("click.wav", P(x, "revisan") + i * 0.35 + 0.35, 0.15);
    });
    to("#e-protege .control, #e-protege .figcap, #e-protege .badge-prom", { opacity: 0, duration: 0.4 }, tK - 0.4);
    at("#e-protege .tapa", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" }, tK);
    at("#e-protege .tapada", { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.35, ease: "back.out(2)" }, P(x, "nunca se leen"));
    sfx("spark.wav", P(x, "nunca se leen"), 0.22);
    wordsIn("#e-protege .nota", tD, 0.06);
    leave("e-protege", s + d);
  }

  // 9. Enterprise: diseñador, +120 habilidades y las suyas; cada agente con cargo, alcance y responsable.
  {
    const x = S.enterprise; const [s, d] = span(x);
    const tD = P(x, "lo dibuja"), tH = P(x, "ciento veinte"), tC = P(x, "o las suyas"), tA = P(x, "Cada agente");
    const PASOS = ["Recibe pedidos", "Revisa atrasos", "Consulta la memoria", "Pide aprobación", "Entrega informe"];
    const AG = [["Agente CFO", "Finanzas", "Gerente financiera"], ["Agente COO", "Operaciones", "Dir. de operaciones"], ["Agente CMO", "Mercadeo", "Dir. de mercadeo"]];
    clip("e-edicion", "scene", s, d, `
      <div class="ent-box"><h3>Arvantti OS Enterprise</h3><p>${words("La edición para dirigir")}</p></div>
      <div class="disenador"><p class="ph">DISEÑADOR VISUAL · Revisión de pedidos</p>${PASOS.map((n, i) => `<div class="fn" id="fn${i}"><i>${i + 1}</i>${n}</div>`).join("")}</div>
      <div class="habil"><p class="cnt"><b id="cnt120">0</b><small>habilidades listas</small></p><button class="crear">+ Crear habilidad</button><span class="nueva">Política de descuentos · de su empresa</span></div>
      <div class="organi"><div class="jefe">Gerente</div><div class="lineas"></div><div class="fila3">${AG.map(([n, a, r]) => `<div class="ficha2"><b>${n}</b><dl><dt>Cargo</dt><dd>${n.split(" ")[1]}</dd><dt>Alcance</dt><dd>${a}</dd><dt>Responsable</dt><dd>${r}</dd></dl></div>`).join("")}</div></div>`);
    enter("e-edicion", s);
    set("#e-edicion .organi", { opacity: 0 }, s);
    at("#e-edicion .ent-box", { opacity: 0, y: -40 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, x.voiceAt);
    wordsIn("#e-edicion .ent-box p", x.voiceAt + 0.6, 0.07);
    sfx("spark.wav", x.voiceAt, 0.22);
    at("#e-edicion .disenador", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.5 }, tD - 0.3);
    PASOS.forEach((_, i) => {
      at(`#fn${i}`, { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.35, ease: "back.out(2)" }, tD + i * 0.2);
      sfx("click-soft.mp3", tD + i * 0.2, 0.12);
    });
    at("#e-edicion .habil", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.5 }, tH - 0.3);
    at("#cnt120", { innerText: 0 }, { innerText: 120, duration: 1.1, snap: { innerText: 1 }, ease: "power2.out" }, tH - 0.2);
    c.tl.push(`tl.call(()=>{const e=document.getElementById("cnt120");if(e)e.textContent="+120"},null,${(tH + 1.0).toFixed(2)});`);
    to("#e-edicion .crear", { scale: 0.92, backgroundColor: "#ffffff", color: "#0b1020", duration: 0.12, yoyo: true, repeat: 1 }, tC);
    at("#e-edicion .nueva", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.4, ease: "back.out(2)" }, tC + 0.2);
    sfx("click.wav", tC, 0.25);
    to("#e-edicion .ent-box, #e-edicion .disenador, #e-edicion .habil", { opacity: 0, duration: 0.4 }, tA - 0.4);
    to("#e-edicion .organi", { opacity: 1, duration: 0.01 }, tA - 0.05);
    at("#e-edicion .jefe", { opacity: 0, y: -30 }, { opacity: 1, y: 0, duration: 0.4 }, tA);
    at("#e-edicion .ficha2", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.45, stagger: 0.15, ease: "back.out(1.6)" }, tA + 0.2);
    ["cargo", "alcance", "responsable"].forEach((f, i) => at(`#e-edicion dt:nth-of-type(${i + 1}), #e-edicion dd:nth-of-type(${i + 1})`, { opacity: 0 }, { opacity: 1, duration: 0.3 }, P(x, f)));
    leave("e-edicion", s + d);
  }

  // 10. Dirigir por voz desde cualquier lugar; panel de dirección e inventario.
  {
    const x = S.dirigir; const [s, d] = span(x);
    const tP = P(x, "Un panel"), tI = P(x, "un inventario");
    const L = [["En el carro", "el carro"], ["En el celular", "el celular"], ["En la sala de juntas", "la sala"]];
    const INV = [["Agente CFO", "Claude", "ERP, Banco", "Gerente financiera"], ["Agente COO", "ChatGPT", "CRM", "Dir. de operaciones"], ["Agente CMO", "Gemini", "Nube", "Dir. de mercadeo"]];
    clip("e-dirigir", "scene", s, d, `
      <div class="voz">${orbe("orbR")}<p class="habla">${words("Basta con hablar.")}</p><div class="lugares">${L.map(([l]) => `<span>${l}</span>`).join("")}</div></div>
      <div class="panel"><p class="ph">PANEL DE DIRECCIÓN</p><div class="preg">¿Qué avanzó y qué está bloqueado?</div>
        <div class="resps"><span class="r-ok">Avanzó: informe de cierre, 80 %</span><span class="r-no">Bloqueado: espera aprobación del margen</span></div></div>
      <div class="inv"><p class="ph">INVENTARIO DE IA</p><table><tr><th>Agente</th><th>IA</th><th>Conexiones</th><th>Dueño</th></tr>${INV.map((r) => `<tr>${r.map((v) => `<td>${v}</td>`).join("")}</tr>`).join("")}</table></div>`);
    enter("e-dirigir", s);
    set("#e-dirigir .panel", { opacity: 0 }, s);
    at("#e-dirigir .voz", { opacity: 0 }, { opacity: 1, duration: 0.3 }, x.voiceAt - 0.1);
    at("#orbR", { opacity: 0, scale: 0.5 }, { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(2)" }, x.voiceAt);
    c.tl.push(`tl.fromTo("#orbR .r1",{scale:1,opacity:.8},{scale:1.6,opacity:0,duration:1,repeat:4,ease:"power1.out"},${(x.voiceAt + 0.3).toFixed(2)});`);
    c.tl.push(`tl.fromTo("#orbR .r2",{scale:1,opacity:.6},{scale:2,opacity:0,duration:1.3,repeat:4,ease:"power1.out"},${(x.voiceAt + 0.6).toFixed(2)});`);
    wordsIn("#e-dirigir .habla", P(x, "basta"), 0.08);
    L.forEach(([, f], i) => {
      at(`#e-dirigir .lugares span:nth-child(${i + 1})`, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.4, ease: "back.out(2)" }, P(x, f));
      sfx("click-soft.mp3", P(x, f), 0.18);
    });
    sfx("whoosh-short.mp3", x.voiceAt, 0.2);
    to("#e-dirigir .voz", { opacity: 0, duration: 0.4 }, tP - 0.4);
    to("#e-dirigir .panel", { opacity: 1, duration: 0.01 }, tP - 0.05);
    at("#e-dirigir .panel", { y: 40 }, { y: 0, duration: 0.5 }, tP);
    at("#e-dirigir .preg", { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 0.4 }, tP + 0.2);
    at("#e-dirigir .r-ok", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.35 }, P(x, "qué avanzó"));
    at("#e-dirigir .r-no", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.35 }, P(x, "bloqueado"));
    sfx("pop.mp3", P(x, "qué avanzó"), 0.15);
    to("#e-dirigir .panel", { opacity: 0, duration: 0.4 }, tI - 0.4);
    at("#e-dirigir .inv", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.5 }, tI);
    at("#e-dirigir tr", { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 0.3, stagger: 0.2 }, tI + 0.3);
    sfx("click-soft.mp3", tI + 0.3, 0.2);
    leave("e-dirigir", s + d);
  }

  // 11. Fractal: el motor de decisiones; primero las reglas, después optimiza; tres módulos opcionales.
  {
    const x = S.fractal; const [s, d] = span(x);
    const M = [["Fractal Process", "Procesos, tareas y recursos", "en Arvantti OS", "Fractal Process"], ["Fractal Finance", "Márgenes, caja y riesgo", "en Arvantti OS Enterprise", "Fractal Finance"], ["Fractal Industrial", "Con el gemelo digital de su planta", "en Arvantti Digital Twin", "Fractal Industrial"]];
    const tR = P(x, "Primero aprende"), tO = P(x, "después optimiza"), tU = P(x, "Un solo");
    clip("e-fractal", "scene", s, d, `
      <div class="fx-core"><p class="fx-k">MOTOR DE DECISIONES</p><h3>Arvantti Fractal</h3></div>
      <div class="fx-flujo"><span class="fx-a">Reglas de su empresa</span><i class="fx-f">→</i><span class="fx-b">Optimiza</span></div>
      <div class="fx-mods">${M.map(([n, q, w]) => `<div class="fx-m"><b>${n}</b><p>${q}</p><small>${w}</small></div>`).join("")}</div>
      <p class="fx-u">${words("Un solo núcleo · tres módulos opcionales")}</p>`);
    enter("e-fractal", s);
    at("#e-fractal .fx-core", { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration: 0.6, ease: "back.out(1.8)" }, P(x, "Arvantti Fractal"));
    sfx("spark.wav", P(x, "Arvantti Fractal"), 0.22);
    at("#e-fractal .fx-a", { opacity: 0, x: -40 }, { opacity: 1, x: 0, duration: 0.45 }, tR);
    at("#e-fractal .fx-f", { opacity: 0 }, { opacity: 1, duration: 0.3 }, tO - 0.2);
    at("#e-fractal .fx-b", { opacity: 0, x: 40 }, { opacity: 1, x: 0, duration: 0.45, ease: "back.out(2)" }, tO);
    sfx("click.wav", tO, 0.2);
    M.forEach(([, , , f], i) => {
      at(`#e-fractal .fx-m:nth-child(${i + 1})`, { opacity: 0, y: 50 }, { opacity: 1, y: 0, duration: 0.5, ease: "back.out(1.6)" }, P(x, f));
      to(`#e-fractal .fx-m:nth-child(${i + 1})`, { boxShadow: "0 0 0 3px #4ea7ff, 0 0 50px #2d7ff988", duration: 0.3 }, P(x, f));
      to(`#e-fractal .fx-m:nth-child(${i + 1})`, { boxShadow: "0 0 0 0px #4ea7ff, 0 0 0px #2d7ff900", duration: 0.4 }, P(x, f) + 1.6);
      sfx("pop.mp3", P(x, f), 0.15);
    });
    wordsIn("#e-fractal .fx-u", tU, 0.07);
    leave("e-fractal", s + d);
  }

  // 11. Rinde cuentas: comprobante que solo se agrega; ISO/IEC 42001.
  {
    const x = S.rinde; const [s, d] = span(x);
    const F = [["Quién", "Agente de finanzas · agente", "quién"], ["Qué", "Margen 31,8 % → 32,4 %", "hizo qué"], ["Con qué", "Hoja de cálculo · Claude", "con qué"], ["Cuándo", "16 nov 2026 · 08:47:12", "cuándo"]];
    const tA = P(x, "Apoya");
    clip("e-comp", "scene", s, d, `
      <p class="center figcap">${words("Arvantti OS rinde cuentas.")}</p>
      <div class="badge-prom" style="--c:${C.rinde}">RINDE CUENTAS</div>
      <div class="recibo"><p class="ph">COMPROBANTE #000847</p><dl>${F.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>
        <div class="pie"><span class="solo"><span class="lock"></span>Solo se agrega</span><span class="huella">Huella: 9f2c…a71e</span></div></div>
      <div class="sello-iso"><b>ISO/IEC</b><span>42001</span></div>
      <div class="iso-t"><p class="i1">Apoya las prácticas de ISO/IEC 42001</p><p class="i0">La norma internacional para gestionar la IA en las empresas</p><p class="i2">Evidencia lista para la certificación</p></div>`);
    enter("e-comp", s);
    set("#e-comp .sello-iso, #e-comp .iso-t", { opacity: 0 }, s);
    at("#e-comp .badge-prom", { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(2)" }, x.voiceAt);
    wordsIn("#e-comp .figcap", x.voiceAt + 0.2, 0.06);
    sfx("spark.wav", x.voiceAt, 0.2);
    at("#e-comp .recibo", { opacity: 0, y: 80 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, P(x, "cada acción"));
    F.forEach(([, , f], i) => {
      at(`#e-comp dt:nth-of-type(${i + 1}), #e-comp dd:nth-of-type(${i + 1})`, { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 0.35 }, P(x, f));
      sfx("click-soft.mp3", P(x, f), 0.2);
    });
    at("#e-comp .solo", { opacity: 0, scale: 0.7 }, { opacity: 1, scale: 1, duration: 0.4, ease: "back.out(2)" }, P(x, "no se puede"));
    at("#e-comp .huella", { opacity: 0 }, { opacity: 1, duration: 0.4 }, P(x, "no se puede") + 0.4);
    to("#e-comp .recibo, #e-comp .badge-prom", { opacity: 0, duration: 0.4 }, tA - 0.4);
    to("#e-comp .figcap", { opacity: 0, duration: 0.4 }, tA - 0.4);
    to("#e-comp .sello-iso, #e-comp .iso-t", { opacity: 1, duration: 0.01 }, tA - 0.05);
    at("#e-comp .sello-iso", { scale: 0.4, rotate: -20 }, { scale: 1, rotate: 0, duration: 0.7, ease: "back.out(1.8)" }, tA);
    sfx("hit.wav", tA, 0.25);
    at("#e-comp .i1", { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 0.4 }, tA + 0.2);
    at("#e-comp .i0", { opacity: 0 }, { opacity: 1, duration: 0.4 }, tA + 0.8);
    at("#e-comp .i2", { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 0.4 }, P(x, "deja la evidencia"));
    sfx("spark.wav", P(x, "deja la evidencia"), 0.2);
    leave("e-comp", s + d);
  }

  // 12. Coding: la segunda edición sobre el mismo núcleo.
  {
    const x = S.coding; const [s, d] = span(x);
    const fig = figura("fc").replace(/<div class="capa ent" id="fc-ent">([\s\S]*?)<\/div>/,
      `<div class="eds"><div class="capa ent" id="fc-ent">$1</div><div class="capa ent cod" id="fc-cod"><h3>Arvantti OS Coding</h3><p>Para equipos de software · con su propia serie</p></div></div>`);
    clip("e-cod", "scene", s, d, `<p class="center figcap">${words("Dos ediciones, un mismo núcleo.")}</p>${fig}`);
    enter("e-cod", s);
    PROMESAS.forEach((_, i) => promOn(c, "fc", i, s + 0.2 + i * 0.08));
    at("#fc-ent", { opacity: 0.4 }, { opacity: 1, duration: 0.4 }, s + 0.2);
    at("#fc-cod", { opacity: 0, x: VERT ? 0 : 80, y: VERT ? 40 : 0 }, { opacity: 1, x: 0, y: 0, duration: 0.6, ease: "back.out(1.6)" }, P(x, "Arvantti OS Coding"));
    to("#fc-cod", { boxShadow: "0 0 0 4px #c4b5fd, 0 0 90px #c4b5fd88", duration: 0.5 }, P(x, "Arvantti OS Coding") + 0.4);
    wordsIn("#e-cod .figcap", x.voiceAt, 0.06);
    sfx("spark.wav", P(x, "Arvantti OS Coding"), 0.22);
    leave("e-cod", s + d);
  }

  // 13. Firma.
  firma(c, S.firma);

  [S.titulo, S.base, S.organiza, S.recuerda, S.controla, S.protege, S.enterprise, S.dirigir, S.fractal, S.rinde, S.coding, S.firma].forEach((x) => sweep(x.start));
}

/** Grafo de decisiones en un lienzo de 760x520 (se escala por CSS), con dos nodos que llegan después. */
function grafo(id) {
  const N = [...NODOS, ["Precio 2027", "Decisión", 660, 470, "extra"], ["Proveedor nuevo", "Cliente", 300, 60, "extra"]];
  const L = [...ENL, [2, 6, "extra"], [3, 7, "extra"]];
  return `<div class="grafo" id="${id}"><svg viewBox="0 0 760 520">${L.map(([a, b, k]) => `<line class="l ${k || ""}" x1="${N[a][2]}" y1="${N[a][3]}" x2="${N[b][2]}" y2="${N[b][3]}" pathLength="1"/>`).join("")}</svg>
    ${N.map(([n, t, x, y, k]) => `<div class="n ${k || ""} t-${t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()}" style="left:${x}px;top:${y}px"><small>${t}</small>${n}</div>`).join("")}</div>`;
}
