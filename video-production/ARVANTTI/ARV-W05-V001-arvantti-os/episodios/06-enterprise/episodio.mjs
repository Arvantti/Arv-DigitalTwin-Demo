// Parte 6 de 7 · Arvantti OS Enterprise (capa superior: la edición para directivos y áreas de negocio).
// Momento del lunes: 9:10, la gerente pregunta por voz, desde el carro, cómo va el informe.
import { kicker, firma, sello } from "../../comun.mjs";

export const ESCENAS = [
  { id: "recap", dir: "01-recap", lead: 0.6, tail: 0.5 },
  { id: "gancho", dir: "02-gancho", lead: 0.3, tail: 0.8 },
  { id: "dolor", dir: "03-dolor", lead: 0.3, tail: 0.8 },
  { id: "edicion", dir: "04-edicion", lead: 0.3, tail: 0.8 },
  { id: "organigrama", dir: "05-organigrama", lead: 0.2, tail: 0.8 },
  { id: "panel", dir: "06-panel", lead: 0.2, tail: 0.9 },
  { id: "lunes", dir: "07-lunes", lead: 0.3, tail: 1.2 },
  { id: "figura", dir: "08-figura", lead: 0.3, tail: 0.5 },
  { id: "siguiente", dir: "09-siguiente", lead: 0.2, tail: 1.6 },
  { id: "firma", dir: "10-firma", lead: 0.6, tail: 3.5 },
];

const AZUL = "#4ea7ff";
const orbe = (id) => `<div class="orb" id="${id}"><div class="ring r1"></div><div class="ring r2"></div><div class="mic"><svg viewBox="0 0 24 24"><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zm-7 9h2a5 5 0 0 0 10 0h2a7 7 0 0 1-6 6.9V21h-2v-2.1A7 7 0 0 1 5 12z"/></svg></div></div>`;
const pulso = (c, id, t, n = 4) => {
  c.tl.push(`tl.fromTo("#${id} .r1",{scale:1,opacity:.8},{scale:1.6,opacity:0,duration:1,repeat:${n},ease:"power1.out"},${t.toFixed(2)});`);
  c.tl.push(`tl.fromTo("#${id} .r2",{scale:1,opacity:.6},{scale:2,opacity:0,duration:1.3,repeat:${n},ease:"power1.out"},${(t + 0.3).toFixed(2)});`);
};

export function componer(c) {
  const { S, VERT, at, to, clip, sfx, span, enter, leave, words, wordsIn, sweep, P } = c;

  kicker(c, 6, S.recap.start, S.firma.start);
  // Recap: la clave tapada de la parte 5.
  {
    const x = S.recap; const [s, d] = span(x);
    clip("e-recap", "scene", s, d, `<p class="center figcap">${words(x.txt)}</p><div class="msg ia rc"><b>IA</b> Clave del banco: <code class="tapada on">•••••••• tapada</code></div>`);
    wordsIn("#e-recap .figcap", x.voiceAt, 0.06);
    at("#e-recap .rc", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.5, ease: "back.out(1.6)" }, 0.2);
    leave("e-recap", s + d);
  }

  // 2. Gancho: agentes que se multiplican hasta llenar la pantalla.
  {
    const x = S.gancho; const [s, d] = span(x);
    const N = 48, cols = VERT ? 6 : 12;
    clip("e-gancho", "scene", s, d, `
      <div class="enjambre">${Array.from({ length: N }, (_, i) => `<span class="ag-d" style="--h:${(i * 47) % 360}"></span>`).join("")}</div>
      <h1 class="center q q6">${words("¿Y quién responde por cada uno?")}</h1>`);
    enter("e-gancho", s);
    at("#e-gancho .ag-d", { opacity: 0, scale: 0 }, { opacity: 1, scale: 1, duration: 0.25, stagger: { each: 2.4 / N, from: "center", grid: [N / cols, cols] }, ease: "back.out(2)" }, x.voiceAt);
    const tY = P(x, "¿Y quién");
    to("#e-gancho .enjambre", { opacity: 0.18, filter: "blur(3px)", duration: 0.4 }, tY - 0.2);
    at("#e-gancho .q .w", { opacity: 0, y: 40, filter: "blur(14px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.55, stagger: 0.09, ease: "power3.out" }, tY);
    sfx("whoosh.wav", x.voiceAt, 0.2);
    leave("e-gancho", s + d);
  }

  // 3. Dolor: parece cosa de programadores; nadie sabe cuántos son ni de quién.
  {
    const x = S.dolor; const [s, d] = span(x);
    const tY = P(x, "Y cuando");
    clip("e-dolor", "scene", s, d, `
      <div class="codigo"><pre>${["const agente = new Agent({", "  model: \"…\",", "  tools: [ … ],", "  prompt: `…`", "});"].join("\n")}</pre><p class="lbl l6">${words("¿Cosa de programadores?")}</p></div>
      <div class="cuantos"><p class="cnt"><b id="cnt6">0</b><small>agentes</small></p>
        <div class="org"><div class="ob top">?</div><div class="orow">${[0, 1, 2, 3].map(() => `<div class="ob">?</div>`).join("")}</div></div>
        <div class="tres-q">${["¿Cuántos son?", "¿Qué hacen?", "¿Quién es su dueño?"].map((q) => `<span>${q}</span>`).join("")}</div></div>`);
    enter("e-dolor", s);
    at("#e-dolor .codigo pre", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.5 }, x.voiceAt);
    wordsIn("#e-dolor .l6", P(x, "programadores") - 0.3, 0.08);
    to("#e-dolor .codigo", { opacity: 0, duration: 0.4 }, tY - 0.4);
    at("#e-dolor .cuantos", { opacity: 0 }, { opacity: 1, duration: 0.3 }, tY - 0.1);
    at("#cnt6", { innerText: 0 }, { innerText: 63, duration: 1.6, snap: { innerText: 1 }, ease: "power2.in" }, tY);
    at("#e-dolor .ob", { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.3, stagger: 0.1 }, P(x, "nadie sabe"));
    [["cuántos son", 1], ["qué hacen", 2], ["quién es su dueño", 3]].forEach(([f, i]) => at(`#e-dolor .tres-q span:nth-child(${i})`, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.35, ease: "back.out(2)" }, P(x, f)));
    leave("e-dolor", s + d);
  }

  // 4. La edición para dirigir: diseñador visual, +120 habilidades y las suyas.
  {
    const x = S.edicion; const [s, d] = span(x);
    const tD = P(x, "lo dibuja"), tH = P(x, "elige entre"), tC = P(x, "crea las suyas");
    const PASOS = ["Recibe pedidos", "Revisa atrasos", "Consulta la memoria", "Pide aprobación", "Entrega informe"];
    clip("e-edicion", "scene", s, d, `
      <div class="ent-box"><h3>Arvantti OS Enterprise</h3><p>${words("La edición para dirigir")}</p></div>
      <div class="disenador"><p class="ph">DISEÑADOR VISUAL · Revisión de pedidos</p>${PASOS.map((n, i) => `<div class="fn" id="fn${i}"><i>${i + 1}</i>${n}</div>`).join("")}</div>
      <div class="habil"><p class="cnt"><b id="cnt120">0</b><small>habilidades listas</small></p><button class="crear">+ Crear habilidad</button><span class="nueva">Política de descuentos · de su empresa</span></div>`);
    enter("e-edicion", s);
    at("#e-edicion .ent-box", { opacity: 0, y: -40 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, x.voiceAt);
    wordsIn("#e-edicion .ent-box p", P(x, "es la edición"), 0.07);
    sfx("spark.wav", x.voiceAt, 0.22);
    at("#e-edicion .disenador", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.5 }, tD - 0.3);
    PASOS.forEach((_, i) => {
      at(`#fn${i}`, { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.35, ease: "back.out(2)" }, tD + i * 0.25);
      sfx("click-soft.mp3", tD + i * 0.25, 0.12);
    });
    at("#e-edicion .habil", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.5 }, tH - 0.2);
    at("#cnt120", { innerText: 0 }, { innerText: 120, duration: 1.3, snap: { innerText: 1 }, ease: "power2.out" }, tH);
    c.tl.push(`tl.call(()=>{const e=document.getElementById("cnt120");if(e)e.textContent="+120"},null,${(tH + 1.4).toFixed(2)});`);
    to("#e-edicion .crear", { scale: 0.92, backgroundColor: "#ffffff", color: "#0b1020", duration: 0.12, yoyo: true, repeat: 1 }, tC);
    at("#e-edicion .nueva", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.4, ease: "back.out(2)" }, tC + 0.3);
    sfx("click.wav", tC, 0.25);
    leave("e-edicion", s + d);
  }

  // 5. Organigrama de agentes y dirección por voz.
  {
    const x = S.organigrama; const [s, d] = span(x);
    const tP = P(x, "Para dirigirlos"), tA = P(x, "el coordinador de agentes"), tH = P(x, "el coordinador de hilos");
    const AG = [["Agente CFO", "Finanzas", "Gerente financiera"], ["Agente COO", "Operaciones", "Dir. de operaciones"], ["Agente CMO", "Mercadeo", "Dir. de mercadeo"]];
    clip("e-org", "scene", s, d, `
      <div class="organi"><div class="jefe">Gerente</div><div class="lineas"></div><div class="fila3">${AG.map(([n, a, r]) => `<div class="ficha2"><b>${n}</b><dl><dt>Cargo</dt><dd>${n.split(" ")[1]}</dd><dt>Alcance</dt><dd>${a}</dd><dt>Responsable</dt><dd>${r}</dd></dl></div>`).join("")}</div></div>
      <div class="voz">${orbe("orb6")}<p class="habla">${words("Basta con hablar.")}</p>
        <div class="coords"><div class="coord"><p>Coordinador de agentes</p>${["CFO", "COO", "CMO"].map((n) => `<span class="pill">${n}</span>`).join("")}</div>
        <div class="coord"><p>Coordinador de hilos</p>${[0.9, 0.6, 0.35].map((v) => `<div class="hbar"><i style="--v:${v}"></i></div>`).join("")}</div></div></div>`);
    enter("e-org", s);
    at("#e-org .jefe", { opacity: 0, y: -30 }, { opacity: 1, y: 0, duration: 0.4 }, x.voiceAt);
    at("#e-org .ficha2", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.45, stagger: 0.15, ease: "back.out(1.6)" }, x.voiceAt + 0.2);
    ["cargo", "alcance", "responsable"].forEach((f, i) => at(`#e-org dt:nth-of-type(${i + 1}), #e-org dd:nth-of-type(${i + 1})`, { opacity: 0 }, { opacity: 1, duration: 0.3 }, P(x, f)));
    to("#e-org .organi", { opacity: 0, y: -40, duration: 0.4 }, tP - 0.4);
    at("#e-org .voz", { opacity: 0 }, { opacity: 1, duration: 0.3 }, tP - 0.1);
    at("#orb6", { opacity: 0, scale: 0.5 }, { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(2)" }, tP);
    pulso(c, "orb6", tP + 0.3, 5);
    wordsIn("#e-org .habla", P(x, "basta"), 0.08);
    at("#e-org .coord:nth-child(1)", { opacity: 0, x: -40 }, { opacity: 1, x: 0, duration: 0.4 }, tA);
    at("#e-org .coord:nth-child(1) .pill", { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.3, stagger: 0.15, ease: "back.out(2)" }, P(x, "reparte"));
    at("#e-org .coord:nth-child(2)", { opacity: 0, x: 40 }, { opacity: 1, x: 0, duration: 0.4 }, tH);
    at("#e-org .hbar i", { scaleX: 0 }, { scaleX: 1, duration: 1.6, stagger: 0.1, ease: "power1.out", transformOrigin: "0 50%" }, P(x, "sigue cada"));
    sfx("whoosh-short.mp3", tP, 0.2);
    leave("e-org", s + d);
  }

  // 6. Panel de dirección, trabajo programado e inventario.
  {
    const x = S.panel; const [s, d] = span(x);
    const tT = P(x, "El trabajo que"), tI = P(x, "Y un inventario");
    const INV = [["Agente CFO", "Claude", "ERP, Banco", "Gerente financiera"], ["Agente COO", "ChatGPT", "CRM", "Dir. de operaciones"], ["Agente CMO", "Gemini", "Nube", "Dir. de mercadeo"]];
    clip("e-panel", "scene", s, d, `
      <div class="panel"><p class="ph">PANEL DE DIRECCIÓN</p><div class="preg">¿Qué está bloqueado?</div>
        <div class="resps"><span class="r-ok">Avanzó: informe de cierre, 80 %</span><span class="r-no">Bloqueado: espera aprobación del margen</span></div></div>
      <div class="cal"><p class="ph">TRABAJO PROGRAMADO</p><div class="dias">${Array.from({ length: 28 }, (_, i) => `<span class="${[6, 13, 20, 27].includes(i) ? "rep" : ""}">${i + 1}</span>`).join("")}</div><p class="cada">Cada viernes · corre solo</p></div>
      <div class="inv"><p class="ph">INVENTARIO DE IA</p><table><tr><th>Agente</th><th>IA</th><th>Conexiones</th><th>Dueño</th></tr>${INV.map((r) => `<tr>${r.map((v) => `<td>${v}</td>`).join("")}</tr>`).join("")}</table></div>`);
    enter("e-panel", s);
    at("#e-panel .panel", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.5 }, x.voiceAt);
    at("#e-panel .preg", { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 0.4 }, P(x, "pregunta"));
    at("#e-panel .r-ok", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.35 }, P(x, "qué avanzó"));
    at("#e-panel .r-no", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.35 }, P(x, "bloqueado"));
    sfx("pop.mp3", P(x, "qué avanzó"), 0.15);
    to("#e-panel .panel", { opacity: 0, duration: 0.4 }, tT - 0.4);
    at("#e-panel .cal", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.5 }, tT);
    at("#e-panel .dias .rep", { backgroundColor: "#16243f" }, { backgroundColor: AZUL, duration: 0.25, stagger: 0.2 }, P(x, "programado"));
    at("#e-panel .cada", { opacity: 0 }, { opacity: 1, duration: 0.4 }, P(x, "corre solo"));
    to("#e-panel .cal", { opacity: 0, duration: 0.4 }, tI - 0.4);
    at("#e-panel .inv", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.5 }, tI);
    at("#e-panel tr", { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 0.3, stagger: 0.25 }, tI + 0.3);
    sfx("click-soft.mp3", tI + 0.3, 0.2);
    leave("e-panel", s + d);
  }

  // 7. Lunes 9:10: la gerente pregunta por voz desde el carro y aprueba.
  {
    const x = S.lunes; const [s, d] = span(x);
    const tC = P(x, "El coordinador"), tA = P(x, "Ella aprueba"), tY = P(x, "Y desde");
    clip("e-lunes", "scene", s, d, `
      <div class="reloj r2"><span class="dia">LUNES</span><span class="hora">9:10</span></div>
      <div class="cel">${orbe("orb7")}<div class="bur yo">¿Cómo va el informe de la junta?</div><div class="bur co"><b>Coordinador</b>Listo en un 80 %. Falta su aprobación del margen por producto.</div><div class="aprobar"><span class="a1">Aprobar</span><span class="a2">✓ Aprobado</span></div></div>
      <div class="prog"><p class="ph">PROGRAMADO</p><b>Informe de cierre</b><span>Cada fin de mes · el borrador se arma solo</span></div>`);
    enter("e-lunes", s);
    at("#e-lunes .reloj", { opacity: 0, y: -30 }, { opacity: 1, y: 0, duration: 0.5 }, x.voiceAt - 0.2);
    at("#e-lunes .cel", { opacity: 0, y: 80 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, x.voiceAt);
    pulso(c, "orb7", P(x, "pregunta"), 3);
    at("#e-lunes .yo", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.35 }, P(x, "¿Cómo"));
    at("#e-lunes .co", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.35 }, tC);
    at("#e-lunes .aprobar", { opacity: 0, scale: 0.7 }, { opacity: 1, scale: 1, duration: 0.3 }, tA - 0.4);
    to("#e-lunes .aprobar", { backgroundColor: "#34d399", scale: 1.08, duration: 0.2, yoyo: true, repeat: 1 }, tA + 0.2);
    to("#e-lunes .a1", { opacity: 0, duration: 0.1 }, tA + 0.3);
    at("#e-lunes .a2", { opacity: 0 }, { opacity: 1, duration: 0.1 }, tA + 0.3);
    sfx("spark.wav", tA + 0.2, 0.25);
    at("#e-lunes .prog", { opacity: 0, x: 60 }, { opacity: 1, x: 0, duration: 0.5, ease: "power3.out" }, tY);
    sfx("click.wav", P(x, "programado"), 0.2);
    leave("e-lunes", s + d);
  }

  sello(c, S.figura, S.siguiente, { prom: "", n: 6, sigue: "Rinde cuentas", sigueId: "rinde" });
  firma(c, S.firma);

  [S.gancho, S.dolor, S.edicion, S.organigrama, S.panel, S.lunes, S.figura, S.firma].forEach((x) => sweep(x.start));
}

