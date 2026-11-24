// Piezas comunes de la serie del ecosistema: animaciones cortas, tarjetas de opciones y el cierre de la serie.

export function ayudas(c) {
  const pop = (sel, t) => c.at(sel, { opacity: 0, scale: 0.6, y: 30 }, { opacity: 1, scale: 1, y: 0, duration: 0.5, ease: "back.out(1.8)" }, t);
  const fade = (sel, t, d = 0.5) => c.at(sel, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: d, ease: "power3.out" }, t);
  const izq = (sel, t, st = 0) => c.at(sel, { opacity: 0, x: -40 }, { opacity: 1, x: 0, duration: 0.45, stagger: st, ease: "power3.out" }, t);
  const luz = (sel, t) => c.to(sel, { backgroundColor: "#2d7ff9", borderColor: "#4ea7ff", color: "#ffffff", boxShadow: "0 0 40px #2d7ff988", duration: 0.35 }, t);
  const tachar = (sel, t) => c.at(sel, { "--x": 0 }, { "--x": 1, duration: 0.45, ease: "power2.out" }, t);
  const kick = (n) => `<p class="kick"><b>EP ${n}</b> ARVANTTI · SISTEMA EMPRESARIAL</p>`;
  return { pop, fade, izq, luz, tachar, kick };
}

/** Tarjetas de opciones con barras de impacto. ops: [[nombre, [valores], nota?]], metricas: [[nombre, clase?]] */
export function opciones(id, ops, metricas) {
  return `<div class="opts" id="${id}">${ops.map(([n, v, nota], i) => `<div class="panel opt" id="${id}-${i}"><b>${n}</b>${metricas.map(([m, cls = ""], k) => `<div class="bar"><span>${m}</span><i class="${cls}" style="--n:${v[k]}"></i></div>`).join("")}${nota ? `<small>${nota}</small>` : ""}</div>`).join("")}</div>`;
}

export function animarOpciones(c, id, t, tBarras) {
  c.at(`#${id} .opt`, { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.25, ease: "power3.out" }, t);
  c.at(`#${id} .bar i`, { scaleX: 0 }, { scaleX: 1, duration: 0.7, stagger: 0.06, ease: "power2.out" }, tBarras ?? t + 0.4);
}

export const FAMILIAS = ["Inteligencia artificial", "Optimización matemática", "Genéticos y evolutivos", "Estocásticos", "Monte Carlo"];
export const familias = (id) => `<div class="row fams" id="${id}">${FAMILIAS.map((f, i) => `<span class="chip" id="${id}-${i}">${f}</span>`).join("")}</div>`;

/** Cierre común de la serie. */
export function cierre(c, x) {
  const { span, clip, enter, at, to, sfx, P } = c;
  const [s, d] = span(x);
  clip("e-cierre", "scene", s, d, `
    <div class="st fin">
      <img class="marca" src="assets/clips/marca.png" alt="">
      <h1 class="h xl ti">Arvantti</h1>
      <p class="firma">Gobierna tu IA, entiende tu operación<br>y decide mejor.</p>
      <p class="url">arvantti.tech</p>
    </div>`, 3);
  enter("e-cierre", s);
  at("#e-cierre .marca", { opacity: 0, scale: 0.5, rotate: -8 }, { opacity: 1, scale: 1, rotate: 0, duration: 1, ease: "back.out(1.6)" }, x.voiceAt - 0.4);
  at("#e-cierre h1", { opacity: 0, letterSpacing: "30px", filter: "blur(10px)" }, { opacity: 1, letterSpacing: "-3px", filter: "blur(0px)", duration: 1.1, ease: "power3.out" }, x.voiceAt);
  at("#e-cierre .firma", { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.8, ease: "power3.out" }, P(x, "Gobierna"));
  at("#e-cierre .url", { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.8, ease: "power3.out" }, P(x, "decide mejor") + 0.6);
  to("#e-cierre .fin", { opacity: 0, duration: 1 }, s + d - 1);
  sfx("fin", "hit.wav", x.voiceAt, 0.28);
}
