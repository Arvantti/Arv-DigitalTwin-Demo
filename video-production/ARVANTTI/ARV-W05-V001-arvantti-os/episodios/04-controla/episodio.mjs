// Parte 4 de 7 · Controla (módulos técnicos: Policy y Grants).
// Momento del lunes: 8:14 el agente quiere enviar las ventas afuera; 8:15 recibe permiso de solo lectura.
import { kicker, firma, sello, recap } from "../../comun.mjs";

export const ESCENAS = [
  { id: "recap", dir: "01-recap", lead: 0.6, tail: 0.5 },
  { id: "gancho", dir: "02-gancho", lead: 0.3, tail: 0.8 },
  { id: "dolor", dir: "03-dolor", lead: 0.3, tail: 0.8 },
  { id: "principio", dir: "04-principio", lead: 0.3, tail: 0.8 },
  { id: "niveles", dir: "05-niveles", lead: 0.2, tail: 0.8 },
  { id: "permiso", dir: "06-permiso", lead: 0.2, tail: 0.8 },
  { id: "sensible", dir: "07-sensible", lead: 0.2, tail: 0.9 },
  { id: "lunes", dir: "08-lunes", lead: 0.3, tail: 1.2 },
  { id: "figura", dir: "09-figura", lead: 0.3, tail: 0.5 },
  { id: "siguiente", dir: "10-siguiente", lead: 0.2, tail: 1.6 },
  { id: "firma", dir: "11-firma", lead: 0.6, tail: 3.5 },
];

const ROJO = "#f87171";

export function componer(c) {
  const { S, VERT, at, to, clip, sfx, span, enter, leave, words, wordsIn, sweep, P } = c;

  kicker(c, 4, S.recap.start, S.firma.start);
  recap(c, S.recap);

  // 2. Gancho: la base de clientes vuela hacia un servicio externo.
  {
    const x = S.gancho; const [s, d] = span(x);
    const tP = P(x, "porque");
    clip("e-gancho", "scene", s, d, `
      <div class="archivo" id="arch"><i></i><b>clientes.xlsx</b><small>Base de clientes</small></div>
      <div class="nube-ext"><span>?</span><p>Servicio externo</p></div>
      <h1 class="center q q4">${words("…porque le pareció útil.")}</h1>`);
    enter("e-gancho", s);
    at("#arch", { opacity: 0, scale: 0.7 }, { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(2)" }, x.voiceAt);
    at("#e-gancho .nube-ext", { opacity: 0, scale: 0.7 }, { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(2)" }, P(x, "servicio externo") - 0.3);
    to("#arch", VERT ? { y: -760, x: 0, scale: 0.4, rotate: 12, opacity: 0.2, duration: 1.2, ease: "power2.in" } : { x: 1000, y: -120, scale: 0.4, rotate: 12, opacity: 0.2, duration: 1.2, ease: "power2.in" }, P(x, "servicio externo"));
    sfx("whoosh.wav", P(x, "servicio externo"), 0.25);
    to("#e-gancho .nube-ext", { opacity: 0.3, duration: 0.4 }, tP);
    at("#e-gancho .q .w", { opacity: 0, y: 40, filter: "blur(14px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.6, stagger: 0.1, ease: "power3.out" }, tP);
    leave("e-gancho", s + d);
  }

  // 3. Dolor: todo permitido; permisos que nadie vuelve a quitar.
  {
    const x = S.dolor; const [s, d] = span(x);
    const tL = P(x, "Los permisos");
    clip("e-dolor", "scene", s, d, `
      <div class="puertas">${Array.from({ length: 5 }, (_, i) => `<div class="puerta" id="pu${i}"><div class="hoja"></div></div>`).join("")}</div>
      <p class="lbl l1">${words("Todo permitido…")}</p>
      <div class="llavero"><div class="aro"></div>${Array.from({ length: 7 }, (_, i) => `<span class="llave" style="--r:${-60 + i * 20}deg"></span>`).join("")}<p class="agl">Agente</p></div>
      <p class="lbl l2">${words("«Para que funcione». Y nadie los quita.")}</p>`);
    enter("e-dolor", s);
    at("#e-dolor .puerta", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.3, stagger: 0.08 }, x.voiceAt);
    for (let i = 0; i < 5; i++) {
      to(`#pu${i} .hoja`, { rotateY: -75, duration: 0.5, ease: "power2.out" }, P(x, "todo está") + i * 0.35);
      sfx("click.wav", P(x, "todo está") + i * 0.35, 0.12);
    }
    wordsIn("#e-dolor .l1", P(x, "todo está"), 0.1);
    to("#e-dolor .puertas, #e-dolor .l1", { opacity: 0, duration: 0.4 }, tL - 0.4);
    at("#e-dolor .llavero", { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.6, ease: "back.out(1.8)" }, tL);
    at("#e-dolor .llave", { opacity: 0, scale: 0 }, { opacity: 1, scale: 1, duration: 0.25, stagger: 0.12, ease: "back.out(3)" }, tL + 0.3);
    wordsIn("#e-dolor .l2", P(x, "para que"), 0.08);
    sfx("hit.wav", P(x, "nadie"), 0.2);
    leave("e-dolor", s + d);
  }

  // 4. Principio: todo prohibido hasta que alguien lo autoriza.
  {
    const x = S.principio; const [s, d] = span(x);
    const tT = P(x, "todo está prohibido");
    clip("e-principio", "scene", s, d, `
      <p class="center figcap">${words("Arvantti OS controla.")}</p>
      <div class="badge-prom" style="--c:${ROJO}">CONTROLA</div>
      <div class="switch"><div class="track"><div class="knob"></div></div><p class="sw-l">${words("Todo prohibido")}</p><p class="sw-s">${words("hasta que alguien lo autoriza")}</p></div>`);
    enter("e-principio", s);
    wordsIn("#e-principio .figcap", x.voiceAt, 0.06);
    at("#e-principio .badge-prom", { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(2)" }, P(x, "controla"));
    at("#e-principio .switch", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.5 }, P(x, "principio"));
    to("#e-principio .knob", { x: VERT ? 150 : 170, duration: 0.35, ease: "back.out(2)" }, tT);
    to("#e-principio .track", { backgroundColor: ROJO, boxShadow: `0 0 50px ${ROJO}`, duration: 0.3 }, tT);
    sfx("click.wav", tT, 0.35);
    wordsIn("#e-principio .sw-l", tT, 0.08);
    wordsIn("#e-principio .sw-s", P(x, "hasta que"), 0.06);
    leave("e-principio", s + d);
  }

  // 5. Niveles: empresa, proyecto (más estricto) y persona.
  {
    const x = S.niveles; const [s, d] = span(x);
    clip("e-niveles", "scene", s, d, `
      <div class="nivel n1"><p class="nt">EMPRESA <span>reglas para todos</span></p>
        <div class="nivel n2"><p class="nt">PROYECTO <span>más estricto, nunca más flojo</span></p>
          <div class="nivel n3"><p class="nt">PERSONA <span>ve y aprueba lo suyo</span></p></div></div></div>`);
    enter("e-niveles", s);
    at("#e-niveles .n1", { opacity: 0, scale: 0.94 }, { opacity: 1, scale: 1, duration: 0.5 }, x.voiceAt);
    at("#e-niveles .n2", { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(1.6)" }, P(x, "cada proyecto"));
    at("#e-niveles .n2 > .nt span", { opacity: 0 }, { opacity: 1, duration: 0.4 }, P(x, "nunca"));
    at("#e-niveles .n3", { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(1.6)" }, P(x, "cada persona"));
    [P(x, "La empresa"), P(x, "cada proyecto"), P(x, "cada persona")].forEach((t) => sfx("click-soft.mp3", t, 0.22));
    leave("e-niveles", s + d);
  }

  // 6. Permiso puntual: quién, sobre qué y para qué; dura la tarea y se retira con un clic.
  {
    const x = S.permiso; const [s, d] = span(x);
    const R = [["Quién", "Agente de finanzas", "quién", "el agente de finanzas"], ["Sobre qué", "Carpeta de ventas", "sobre qué", "la carpeta de ventas"], ["Para qué", "Solo leer", "para qué", "solo leer"]];
    const tE = P(x, "Ese permiso"), tC = P(x, "con un clic");
    clip("e-permiso", "scene", s, d, `
      <div class="escarapela"><div class="cinta"></div><p class="vis">VISITANTE · HOY</p><h3>Permiso puntual</h3>
        <dl>${R.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>
        <div class="dura"><span>Dura: lo que dura la tarea</span><button>Retirar</button></div>
        <div class="retirado">RETIRADO</div></div>`);
    enter("e-permiso", s);
    at("#e-permiso .escarapela", { opacity: 0, y: -200, rotate: -8 }, { opacity: 1, y: 0, rotate: 0, duration: 0.8, ease: "back.out(1.4)" }, x.voiceAt + 0.3);
    R.forEach(([, , k, v], i) => {
      at(`#e-permiso dt:nth-of-type(${i + 1})`, { opacity: 0, x: -20 }, { opacity: 1, x: 0, duration: 0.3 }, P(x, k));
      at(`#e-permiso dd:nth-of-type(${i + 1})`, { opacity: 0, x: -20 }, { opacity: 1, x: 0, duration: 0.3 }, P(x, v));
      sfx("click-soft.mp3", P(x, v), 0.2);
    });
    at("#e-permiso .dura", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.4 }, tE);
    to("#e-permiso button", { scale: 0.9, backgroundColor: "#ffffff", color: "#0b1020", duration: 0.12, yoyo: true, repeat: 1 }, tC);
    sfx("click.wav", tC, 0.35);
    to("#e-permiso dl, #e-permiso h3", { opacity: 0.25, duration: 0.3 }, tC + 0.2);
    at("#e-permiso .retirado", { opacity: 0, scale: 1.8, rotate: -12 }, { opacity: 1, scale: 1, rotate: -8, duration: 0.3, ease: "power4.in" }, tC + 0.2);
    leave("e-permiso", s + d);
  }

  // 7. Lo sensible espera a una persona; cada negativa queda con su razón.
  {
    const x = S.sensible; const [s, d] = span(x);
    const A = [["Publicar", "publicar"], ["Borrar", "borrar"], ["Conectarse afuera", "conectarse"]];
    const tN = P(x, "Cuando algo");
    clip("e-sensible", "scene", s, d, `
      <div class="acciones">${A.map(([a]) => `<div class="acc"><span class="lock"></span>${a}</div>`).join("")}</div>
      <div class="aprob"><p class="ph">ESPERA APROBACIÓN</p><p class="who">Una persona decide</p><div class="btns"><span class="si">Aprobar</span><span class="no">Negar</span></div></div>
      <div class="razon"><p class="ph">NEGADO · RAZÓN ESCRITA</p><p>«Publicar el informe antes de la junta no está autorizado.»</p></div>`);
    enter("e-sensible", s);
    A.forEach(([, f], i) => {
      at(`#e-sensible .acc:nth-child(${i + 1})`, { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.4, ease: "back.out(2)" }, P(x, f));
      sfx("pop.mp3", P(x, f), 0.14);
    });
    at("#e-sensible .aprob", { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, duration: 0.5, ease: "power3.out" }, P(x, "siempre espera"));
    to("#e-sensible .no", { scale: 1.1, backgroundColor: ROJO, duration: 0.2, yoyo: true, repeat: 1 }, tN);
    at("#e-sensible .razon", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.45, ease: "power3.out" }, tN + 0.3);
    sfx("typing.mp3", tN + 0.4, 0.12);
    leave("e-sensible", s + d);
  }

  // 8. Lunes 8:14 bloqueo; 8:15 permiso de solo lectura que se vence solo.
  {
    const x = S.lunes; const [s, d] = span(x);
    const tD = P(x, "lo detiene"), t15 = P(x, "8:15"), tV = P(x, "Al cerrarla");
    clip("e-lunes", "scene", s, d, `
      <div class="reloj r2"><span class="dia">LUNES</span><span class="hora"><span class="h1">8:14</span><span class="h2">8:15</span></span></div>
      <div class="salida"><div class="box ven">Ventas</div><div class="flecha-x"><i></i></div><div class="barrera"></div><div class="box ext">Sitio externo de gráficas</div>
        <div class="bloq">BLOQUEADO<small>Motivo: salida a internet no autorizada</small></div></div>
      <div class="lectura"><div class="carpeta"><span class="pest"></span><b>ventas/octubre</b></div><span class="solo">Solo lectura · esta tarea</span>
        <div class="timer"><i></i></div><p class="vence">Permiso vencido</p></div>`);
    enter("e-lunes", s);
    at("#e-lunes .reloj", { opacity: 0, y: -30 }, { opacity: 1, y: 0, duration: 0.5 }, x.voiceAt - 0.2);
    at("#e-lunes .h2", { opacity: 0 }, { opacity: 0, duration: 0.01 }, s);
    at("#e-lunes .salida", { opacity: 0 }, { opacity: 1, duration: 0.4 }, P(x, "intenta"));
    at("#e-lunes .flecha-x i", { scaleX: 0 }, { scaleX: 1, duration: 1.2, ease: "power1.in", transformOrigin: "0 50%" }, P(x, "subir"));
    at("#e-lunes .barrera", { opacity: 0, scaleY: 0 }, { opacity: 1, scaleY: 1, duration: 0.25, ease: "back.out(3)" }, tD - 0.1);
    to("#e-lunes .flecha-x i", { scaleX: 0.55, backgroundColor: ROJO, duration: 0.2 }, tD);
    at("#e-lunes .bloq", { opacity: 0, scale: 1.8 }, { opacity: 1, scale: 1, duration: 0.3, ease: "power4.in" }, tD + 0.1);
    sfx("hit.wav", tD + 0.3, 0.3);
    to("#e-lunes .salida", { opacity: 0, duration: 0.4 }, t15 - 0.4);
    to("#e-lunes .h1", { opacity: 0, duration: 0.2 }, t15);
    to("#e-lunes .h2", { opacity: 1, duration: 0.2 }, t15);
    at("#e-lunes .lectura", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" }, t15 + 0.2);
    at("#e-lunes .solo", { opacity: 0, scale: 0.7 }, { opacity: 1, scale: 1, duration: 0.35, ease: "back.out(2)" }, P(x, "para leer"));
    at("#e-lunes .timer i", { scaleX: 1 }, { scaleX: 0, duration: P(x, "vence solo") - tV + 0.4, ease: "none", transformOrigin: "0 50%" }, tV);
    at("#e-lunes .vence", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.4 }, P(x, "vence solo"));
    to("#e-lunes .solo", { opacity: 0.3, duration: 0.3 }, P(x, "vence solo"));
    sfx("click.wav", P(x, "vence solo"), 0.25);
    leave("e-lunes", s + d);
  }

  sello(c, S.figura, S.siguiente, { prom: "controla", n: 4, sigue: "Protege", sigueId: "protege" });
  firma(c, S.firma);

  [S.gancho, S.dolor, S.principio, S.niveles, S.permiso, S.sensible, S.lunes, S.figura, S.firma].forEach((x) => sweep(x.start));
}
