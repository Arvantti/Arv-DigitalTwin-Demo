// Parte 5 de 7 · Protege (módulo técnico: Guardianes).
// Momento del lunes: 8:21, en la carpeta de ventas aparece el archivo con la clave del banco.
import { kicker, firma, sello, recap } from "../../comun.mjs";

export const ESCENAS = [
  { id: "recap", dir: "01-recap", lead: 0.6, tail: 0.5 },
  { id: "gancho", dir: "02-gancho", lead: 0.3, tail: 0.8 },
  { id: "dolor", dir: "03-dolor", lead: 0.3, tail: 0.8 },
  { id: "guardianes", dir: "04-guardianes", lead: 0.3, tail: 0.8 },
  { id: "claves", dir: "05-claves", lead: 0.2, tail: 0.8 },
  { id: "vigilan", dir: "06-vigilan", lead: 0.2, tail: 0.9 },
  { id: "lunes", dir: "07-lunes", lead: 0.3, tail: 1.2 },
  { id: "figura", dir: "08-figura", lead: 0.3, tail: 0.5 },
  { id: "siguiente", dir: "09-siguiente", lead: 0.2, tail: 1.6 },
  { id: "firma", dir: "10-firma", lead: 0.6, tail: 3.5 },
];

const MOR = "#a78bfa";
const CLAVE = "sk-live-7Hq2x9Kp4Lm8";

export function componer(c) {
  const { S, VERT, at, to, clip, sfx, span, enter, leave, words, wordsIn, sweep, P } = c;

  kicker(c, 5, S.recap.start, S.firma.start);
  // Recap propio: la escarapela de solo lectura de la parte 4.
  {
    const x = S.recap; const [s, d] = span(x);
    clip("e-recap", "scene", s, d, `<p class="center figcap">${words(x.txt)}</p><div class="mini-esc"><p class="vis">PERMISO</p><b>Solo leer · ventas</b></div>`);
    wordsIn("#e-recap .figcap", x.voiceAt, 0.06);
    at("#e-recap .mini-esc", { opacity: 0, y: -120, rotate: -6 }, { opacity: 1, y: 0, rotate: 0, duration: 0.8, ease: "back.out(1.5)" }, 0.2);
    leave("e-recap", s + d);
  }

  // 2. Gancho: una clave en un chat que se copia a muchos lugares.
  {
    const x = S.gancho; const [s, d] = span(x);
    const pos = VERT ? [[120, 300], [560, 380], [80, 1380], [600, 1460], [300, 1640], [520, 560]] : [[120, 140], [1300, 120], [180, 820], [1250, 800], [760, 900], [1500, 460]];
    clip("e-gancho", "scene", s, d, `
      <div class="msg ia clv"><b>Chat</b> La clave del banco es <code>${CLAVE}</code></div>
      ${pos.map(([l, t], i) => `<code class="copia" id="cp${i}" style="left:${l}px;top:${t}px">${CLAVE}</code>`).join("")}
      <h1 class="center q q5">${words("Puede costar más que todo su proyecto.")}</h1>`);
    enter("e-gancho", s);
    at("#e-gancho .clv", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.4, ease: "back.out(1.6)" }, x.voiceAt);
    sfx("pop.mp3", x.voiceAt, 0.15);
    pos.forEach((_, i) => {
      at(`#cp${i}`, { opacity: 0, scale: 0.4 }, { opacity: 0.8, scale: 1, duration: 0.3, ease: "back.out(2)" }, P(x, "filtrada") + i * 0.15);
      sfx("click-soft.mp3", P(x, "filtrada") + i * 0.15, 0.1);
    });
    const tP = P(x, "puede costar");
    to("#e-gancho .clv, #e-gancho .copia", { opacity: 0.2, filter: "blur(3px)", duration: 0.4 }, tP);
    at("#e-gancho .q .w", { opacity: 0, y: 40, filter: "blur(14px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.55, stagger: 0.08, ease: "power3.out" }, tP);
    leave("e-gancho", s + d);
  }

  // 3. Dolor: qué es una clave de acceso, cómo se escapa y el agente que se sale de su carpeta.
  {
    const x = S.dolor; const [s, d] = span(x);
    const tU = P(x, "Una IA"), tY = P(x, "Y puede");
    clip("e-dolor", "scene", s, d, `
      <div class="b1"><div class="def"><b>Clave de acceso (API key)</b> = la llave con la que un programa entra a un servicio</div>
        <div class="servs">${["Banco", "Nube", "Proveedores"].map((n) => `<div class="serv"><span class="llv"></span>${n}</div>`).join("")}</div>
        <p class="lbl">${words("Cualquiera entra y gasta a su nombre.")}</p></div>
      <div class="b2"><div class="fuga">${["La lee", "La pega en el chat", "La deja en un registro"].map((n) => `<div class="fg"><code>${CLAVE.slice(0, 10)}…</code><span>${n}</span></div>`).join("")}</div></div>
      <div class="b3"><div class="proyecto"><p>Su carpeta</p><div class="ag-dot"></div><div class="trasera"></div></div><p class="lbl">${words("Se sale sin que nadie lo note.")}</p></div>`);
    enter("e-dolor", s);
    at("#e-dolor .def", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.5 }, P(x, "claves de acceso") - 0.2);
    ["bancos", "nubes", "proveedores"].forEach((f, i) => at(`#e-dolor .serv:nth-child(${i + 1})`, { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.4, ease: "back.out(2)" }, P(x, f)));
    wordsIn("#e-dolor .b1 .lbl", P(x, "cualquiera"), 0.07);
    to("#e-dolor .b1", { opacity: 0, duration: 0.4 }, tU - 0.4);
    at("#e-dolor .b2", { opacity: 0 }, { opacity: 1, duration: 0.3 }, tU - 0.1);
    ["leerlas", "pegarlas", "dejarlas"].forEach((f, i) => {
      at(`#e-dolor .fg:nth-child(${i + 1})`, { opacity: 0, x: -60 }, { opacity: 1, x: 0, duration: 0.4, ease: "power3.out" }, P(x, f));
      sfx("click-soft.mp3", P(x, f), 0.2);
    });
    to("#e-dolor .b2", { opacity: 0, duration: 0.4 }, tY - 0.4);
    at("#e-dolor .b3", { opacity: 0 }, { opacity: 1, duration: 0.3 }, tY - 0.1);
    to("#e-dolor .ag-dot", VERT ? { x: 340, y: 160, duration: 1.4, ease: "power2.inOut" } : { x: 420, y: 60, duration: 1.4, ease: "power2.inOut" }, P(x, "salirse"));
    wordsIn("#e-dolor .b3 .lbl", P(x, "sin que"), 0.07);
    sfx("whoosh-short.mp3", P(x, "salirse"), 0.2);
    leave("e-dolor", s + d);
  }

  // 4. Guardianes que revisan cada acción; el agente se queda en su proyecto.
  {
    const x = S.guardianes; const [s, d] = span(x);
    const tE = P(x, "El agente");
    const AC = ["Leer archivo", "Enviar correo", "Abrir conexión", "Borrar carpeta"];
    clip("e-guard", "scene", s, d, `
      <p class="center figcap">${words("Arvantti OS protege.")}</p>
      <div class="badge-prom" style="--c:${MOR}">PROTEGE</div>
      <div class="control"><div class="cola">${AC.map((a, i) => `<span class="ac" id="ac${i}">${a}</span>`).join("")}</div><div class="escudo"><span>Guardián</span></div><div class="res">${AC.map((_, i) => `<span class="ok${i === 3 ? " no" : ""}">${i === 3 ? "✕ Detenida" : "✓ Revisada"}</span>`).join("")}</div></div>
      <div class="encierro"><p>Proyecto: Informe de cierre</p><div class="ag-in">Agente</div><span class="sin">Sin atajos para salirse</span></div>`);
    enter("e-guard", s);
    wordsIn("#e-guard .figcap", x.voiceAt, 0.06);
    at("#e-guard .badge-prom", { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(2)" }, P(x, "protege"));
    sfx("spark.wav", P(x, "protege"), 0.2);
    const tG = P(x, "guardianes");
    at("#e-guard .control", { opacity: 0 }, { opacity: 1, duration: 0.4 }, tG - 0.1);
    at("#e-guard .escudo", { opacity: 0, scale: 0.5 }, { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(2)" }, tG);
    AC.forEach((_, i) => {
      at(`#ac${i}`, { opacity: 0, x: -80 }, { opacity: 1, x: 0, duration: 0.35 }, P(x, "revisan") + i * 0.4);
      at(`#e-guard .res span:nth-child(${i + 1})`, { opacity: 0, x: -20 }, { opacity: 1, x: 0, duration: 0.3 }, P(x, "revisan") + i * 0.4 + 0.4);
      sfx("click.wav", P(x, "revisan") + i * 0.4 + 0.4, 0.15);
    });
    to("#e-guard .control, #e-guard .figcap, #e-guard .badge-prom", { opacity: 0, duration: 0.4 }, tE - 0.4);
    at("#e-guard .encierro", { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, duration: 0.5, ease: "power3.out" }, tE);
    to("#e-guard .ag-in", { x: VERT ? 200 : 380, duration: 0.6, ease: "power2.in" }, P(x, "sin atajos") - 0.6);
    to("#e-guard .ag-in", { x: VERT ? 150 : 330, duration: 0.25, ease: "power2.out" }, P(x, "sin atajos"));
    at("#e-guard .sin", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.4 }, P(x, "sin atajos"));
    sfx("hit.wav", P(x, "sin atajos"), 0.2);
    leave("e-guard", s + d);
  }

  // 5. Claves tapadas y conexiones sin clave.
  {
    const x = S.claves; const [s, d] = span(x);
    const tT = P(x, "se tapa"), tC = P(x, "Cuando un agente");
    clip("e-claves", "scene", s, d, `
      <div class="tapa"><p class="ph">RESPUESTA DEL AGENTE</p><p class="rt">La clave del banco es <code class="real">${CLAVE}</code><code class="tapada">•••••••• tapada</code></p></div>
      <div class="conex"><div class="nodo ag">Agente</div><div class="via v1"><i></i></div><div class="nodo bov"><span class="cand2"></span>Arvantti<small>guarda las credenciales</small></div><div class="via v2"><i></i></div><div class="nodo sis">CRM · ERP</div>
        <div class="ve">Usa la conexión <b>✓</b> · Ve la clave <b class="x">✕</b></div></div>`);
    enter("e-claves", s);
    at("#e-claves .tapa", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" }, x.voiceAt);
    at("#e-claves .real", { opacity: 0 }, { opacity: 1, duration: 0.3 }, P(x, "si alguna"));
    to("#e-claves .real", { opacity: 0, duration: 0.2 }, tT);
    at("#e-claves .tapada", { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.35, ease: "back.out(2)" }, tT);
    sfx("spark.wav", tT, 0.25);
    to("#e-claves .tapa", { opacity: 0, y: -40, duration: 0.4 }, tC - 0.4);
    at("#e-claves .conex", { opacity: 0 }, { opacity: 1, duration: 0.3 }, tC - 0.1);
    at("#e-claves .ag", { opacity: 0, x: -40 }, { opacity: 1, x: 0, duration: 0.4 }, tC);
    at("#e-claves .sis", { opacity: 0, x: 40 }, { opacity: 1, x: 0, duration: 0.4 }, P(x, "como el CRM"));
    at("#e-claves .bov", { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(2)" }, P(x, "las guarda"));
    at("#e-claves .via i", { scaleX: 0 }, { scaleX: 1, duration: 0.5, stagger: 0.3, transformOrigin: "0 50%" }, P(x, "usa la conexión"));
    at("#e-claves .ve", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.4 }, P(x, "jamás"));
    sfx("click.wav", P(x, "jamás"), 0.25);
    leave("e-claves", s + d);
  }

  // 6. Cuatro escudos y agentes que vigilan.
  {
    const x = S.vigilan; const [s, d] = span(x);
    const E = [["Ruta segura", "puntos de control"], ["Claves tapadas", "puntos de control"], ["Conexiones sin clave", "momentos clave"], ["Gasto bajo control", "el gasto"]];
    const tM = P(x, "Y mientras");
    clip("e-vig", "scene", s, d, `
      <div class="escudos">${E.map(([n]) => `<div class="esc4"><span class="sh"></span>${n}</div>`).join("")}</div>
      <div class="carriles"><div class="car tr"><p>TRABAJAN</p>${["Finanzas", "Datos", "Redactor"].map((n) => `<span>${n}</span>`).join("")}</div><div class="car vg"><p>VIGILAN</p>${["Seguridad", "Gasto"].map((n) => `<span>${n}</span>`).join("")}</div></div>`);
    enter("e-vig", s);
    E.forEach(([, f], i) => {
      at(`#e-vig .esc4:nth-child(${i + 1})`, { opacity: 0, y: 40, scale: 0.8 }, { opacity: 1, y: 0, scale: 1, duration: 0.4, ease: "back.out(2)" }, P(x, f) + (i === 1 ? 0.4 : 0));
      sfx("click.wav", P(x, f) + (i === 1 ? 0.4 : 0), 0.18);
    });
    to("#e-vig .escudos", { opacity: 0.25, y: VERT ? 0 : -20, duration: 0.4 }, tM - 0.2);
    at("#e-vig .car.tr", { opacity: 0, x: -60 }, { opacity: 1, x: 0, duration: 0.45 }, tM);
    at("#e-vig .car.vg", { opacity: 0, x: 60 }, { opacity: 1, x: 0, duration: 0.45 }, P(x, "otros vigilan"));
    sfx("whoosh-short.mp3", tM, 0.2);
    leave("e-vig", s + d);
  }

  // 7. Lunes 8:21: la clave del banco, bloqueada y tapada.
  {
    const x = S.lunes; const [s, d] = span(x);
    const tB = P(x, "lo bloquea"), tR = P(x, "En la respuesta"), tI = P(x, "El informe sigue");
    clip("e-lunes", "scene", s, d, `
      <div class="reloj r2"><span class="dia">LUNES</span><span class="hora">8:21</span></div>
      <div class="archivo banco"><i></i><b>banco_clave.txt</b><small>carpeta ventas</small><div class="shield"></div></div>
      <div class="bloq2">BLOQUEADO</div>
      <div class="notif"><p class="ph">AVISO</p><p>Para: Responsable de seguridad</p><small>El agente de finanzas intentó abrir banco_clave.txt</small></div>
      <div class="msg ia resp2"><b>IA</b> Clave encontrada: <code class="tapada on">•••••••• tapada</code></div>
      <div class="sigue2">El informe sigue · <b>sin fugas</b></div>`);
    enter("e-lunes", s);
    at("#e-lunes .reloj", { opacity: 0, y: -30 }, { opacity: 1, y: 0, duration: 0.5 }, x.voiceAt - 0.2);
    at("#e-lunes .archivo", { opacity: 0, scale: 0.7 }, { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(2)" }, P(x, "se topa"));
    at("#e-lunes .shield", { opacity: 0, scale: 2 }, { opacity: 1, scale: 1, duration: 0.35, ease: "power4.in" }, tB);
    at("#e-lunes .bloq2", { opacity: 0, scale: 1.8 }, { opacity: 1, scale: 1, duration: 0.3, ease: "power4.in" }, tB + 0.1);
    sfx("hit.wav", tB + 0.3, 0.3);
    at("#e-lunes .notif", { opacity: 0, x: 80 }, { opacity: 1, x: 0, duration: 0.45, ease: "power3.out" }, P(x, "avisa"));
    sfx("pop.mp3", P(x, "avisa"), 0.18);
    at("#e-lunes .resp2", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.4, ease: "back.out(1.6)" }, tR);
    at("#e-lunes .sigue2", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.45 }, tI);
    sfx("spark.wav", P(x, "sin fugas"), 0.22);
    leave("e-lunes", s + d);
  }

  sello(c, S.figura, S.siguiente, { prom: "protege", n: 5, sigue: "Arvantti OS Enterprise", sigueId: "" });
  firma(c, S.firma);

  [S.gancho, S.dolor, S.guardianes, S.claves, S.vigilan, S.lunes, S.figura, S.firma].forEach((x) => sweep(x.start));
}
