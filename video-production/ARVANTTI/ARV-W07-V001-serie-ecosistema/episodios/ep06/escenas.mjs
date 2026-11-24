// Episodio 6 · Integrator y los datos compartidos (guion aprobado por Andy, ajustado el 2026-11-24).
export const ESCENAS = [
  { id: "fuentes", dir: "01-fuentes", lead: 1.4, tail: 1.0 },
  { id: "integrator", dir: "02-integrator", lead: 0.4, tail: 1.2 },
  { id: "conectores", dir: "03-conectores", lead: 0.3, tail: 1.3 },
  { id: "donde", dir: "04-donde", lead: 0.3, tail: 1.2 },
  { id: "base", dir: "05-base", lead: 0.3, tail: 1.4 },
  { id: "cierre", dir: "06-cierre", lead: 0.9, tail: 4.5, sinSubtitulos: true },
];

import { ayudas, cierre } from "../../comun.mjs";

export function componerEpisodio(c) {
  const { S, P, at, to, clip, words, sfx, span, enter, leave, titleIn, sweep, VERT } = c;
  const { pop, fade, luz, kick } = ayudas(c);
  const KICK = kick(6);

  // 1. Seis fuentes en círculo alrededor de la pregunta.
  {
    const x = S.fuentes; const [s, d] = span(x);
    const F = ["ventas", "pedidos", "inventarios", "costos", "capacidad", "finanzas"];
    const R = VERT ? 360 : 380;
    clip("e-fue", "scene", s, d, `${KICK}
      <div class="st">
        <div class="circ">
          <div class="centro panel"><b>La pregunta de la junta</b></div>
          ${F.map((f, i) => { const a = -Math.PI / 2 + (i * Math.PI * 2) / 6; return `<span class="chip fu" id="fu${i}" style="left:calc(50% + ${(Math.cos(a) * R * (VERT ? 1 : 1.5)).toFixed(0)}px);top:calc(50% + ${(Math.sin(a) * R * 0.75).toFixed(0)}px)">${f[0].toUpperCase() + f.slice(1)}</span>`; }).join("")}
        </div>
      </div>`, 3);
    at("#e-fue .kick", { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 0.6 }, s + 0.3);
    pop("#e-fue .centro", x.voiceAt);
    F.forEach((f, i) => pop(`#fu${i}`, P(x, f) - 0.1));
    F.forEach((f, i) => sfx(`1${i}`, "pop.mp3", P(x, f), 0.1));
    leave("e-fue", s + d);
  }

  // 2. Integrator conecta ERP, CRM, SCADA y más.
  {
    const x = S.integrator; const [s, d] = span(x);
    const SI = [["el ERP", "ERP", "Gestiona la empresa"], ["el CRM", "CRM", "Gestiona clientes"], ["el SCADA", "SCADA", "Supervisa los equipos"], ["y más", "Y más", "Bases de datos, planillas…"]];
    clip("e-int", "scene", s, d, `${KICK}
      <div class="st">
        <div class="panel card on hub"><b>Integrator</b><small>Conecta tus sistemas</small></div>
        <svg class="cables" viewBox="0 0 1400 90" preserveAspectRatio="none">${[175, 525, 875, 1225].map((xx, i) => `<line id="cb${i}" x1="700" y1="0" x2="${xx}" y2="90" pathLength="1"/>`).join("")}</svg>
        <div class="row sist">${SI.map(([, n, f], i) => `<div class="panel card si" id="si${i}"><b>${n}</b><small>${f}</small></div>`).join("")}</div>
      </div>`, 3);
    enter("e-int", s);
    pop("#e-int .hub", x.voiceAt);
    SI.forEach(([k], i) => { at(`#cb${i}`, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.4 }, P(x, k) - 0.3); pop(`#si${i}`, P(x, k) - 0.1); });
    SI.forEach(([k], i) => sfx(`2${i}`, "click.wav", P(x, k), 0.15));
    leave("e-int", s + d);
  }

  // 3. Un solo juego de conectores para los tres productos.
  {
    const x = S.conectores; const [s, d] = span(x);
    const PR = [["Arvantti OS", "Arvantti OS"], ["el gemelo", "Digital Twin"], ["y Fractal", "Fractal"]];
    clip("e-con", "scene", s, d, `${KICK}
      <div class="st">
        <div class="row pr3">${PR.map(([, n], i) => `<div class="panel card" id="pr${i}"><b>${n}</b></div>`).join("")}</div>
        <svg class="hilos" viewBox="0 0 1200 80" preserveAspectRatio="none">${[200, 600, 1000].map((xx, i) => `<line id="hl${i}" x1="${xx}" y1="0" x2="${xx}" y2="80" pathLength="1"/>`).join("")}</svg>
        <div class="panel capa-c"><b>Un solo juego de conectores</b><div class="row">${["Mismas fuentes", "Mismos permisos"].map((t, i) => `<span class="chip" id="mm${i}">${t}</span>`).join("")}</div></div>
      </div>`, 3);
    enter("e-con", s);
    pop("#e-con .capa-c", P(x, "un solo juego"));
    PR.forEach(([k], i) => { pop(`#pr${i}`, P(x, k) - 0.1); at(`#hl${i}`, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.4 }, P(x, k) + 0.1); });
    pop("#mm0", P(x, "las mismas fuentes")); luz("#mm0", P(x, "las mismas fuentes") + 0.3);
    pop("#mm1", P(x, "los mismos permisos")); luz("#mm1", P(x, "los mismos permisos") + 0.3);
    sfx("3a", "spark.wav", P(x, "un solo juego"), 0.18);
    leave("e-con", s + d);
  }

  // 4. Consultar los datos donde ya están.
  {
    const x = S.donde; const [s, d] = span(x);
    const tC = P(x, "Los datos se pueden");
    clip("e-don", "scene", s, d, `${KICK}
      <div class="st">
        <div class="row don">
          <div class="panel card copia"><b>Copiar todo a un solo lugar</b><small>Lento y duplicado</small></div>
          <div class="panel card on cons"><b>Consultar donde ya están</b>
            <div class="row bd">${["ERP", "CRM", "SCADA"].map((t, i) => `<span class="tag" id="bd${i}">${t} <em class="ok">✓</em></span>`).join("")}</div>
          </div>
        </div>
      </div>`, 3);
    enter("e-don", s);
    pop("#e-don .copia", x.voiceAt);
    to("#e-don .copia", { opacity: 0.35, scale: 0.9, filter: "grayscale(1)", duration: 0.5 }, tC - 0.2);
    pop("#e-don .cons", tC);
    at("#e-don .bd .tag", { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.3, stagger: 0.2 }, P(x, "donde ya están"));
    sfx("4a", "pop.mp3", tC, 0.15);
    leave("e-don", s + d);
  }

  // 5. Una base común que relaciona todo.
  {
    const x = S.base; const [s, d] = span(x);
    const E = [["productos", 300, 60], ["pedidos", 560, 110], ["materiales", 620, 260], ["capacidades", 440, 360], ["costos", 160, 330], ["decisiones", 60, 170]];
    const tA = P(x, "Así todos");
    clip("e-bas", "scene", s, d, `${KICK}
      <div class="st">
        <svg class="rel" viewBox="0 0 700 420">
          ${E.map(([, x1, y1], i) => E.slice(i + 1).map(([, x2, y2], k) => `<line class="re" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" pathLength="1"/>`).join("")).join("")}
          ${E.map(([n, xx, yy], i) => `<g class="en" id="en${i}"><circle cx="${xx}" cy="${yy}" r="44"/><text x="${xx}" y="${yy + 6}" text-anchor="middle">${n[0].toUpperCase() + n.slice(1)}</text></g>`).join("")}
        </svg>
        <span class="chip on mismo">El mismo pedido, el mismo costo</span>
      </div>`, 3);
    enter("e-bas", s);
    E.forEach(([k], i) => at(`#en${i}`, { opacity: 0, scale: 0, transformOrigin: "50% 50%" }, { opacity: 1, scale: 1, duration: 0.35, ease: "back.out(2)" }, P(x, k) - 0.1));
    at("#e-bas .re", { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.4, stagger: 0.04 }, P(x, "decisiones") + 0.2);
    pop("#e-bas .mismo", tA);
    sfx("5a", "spark.wav", P(x, "decisiones"), 0.15); sfx("5b", "pop.mp3", tA, 0.15);
    leave("e-bas", s + d);
  }

  cierre(c, S.cierre);
  [S.integrator, S.conectores, S.donde, S.base, S.cierre].forEach((x) => sweep(x.start));
  void fade; void titleIn; void words;
}
