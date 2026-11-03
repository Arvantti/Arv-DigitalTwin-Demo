/**
 * Resumen gerencial de la planta de plásticos (resumen-plasticos.html): historia, capacidades, los cinco escenarios,
 * el ahorro potencial de la optimización y el cierre. Presentación de láminas con animaciones tipo motion graphics
 * (CSS + un lienzo de fondo). Teclas: ← → o espacio, A avanza solo, F pantalla completa. `?s=7` abre una lámina.
 *
 * Las cifras salen de las corridas de la demo, las mismas del frontmatter `cifras` de docs/demo-plasticos/<n>/guion.md.
 * Las capturas se leen de esas carpetas: si se vuelven a tomar, esta página ya las trae.
 */
import "./resumen-plasticos.css";

const shots = import.meta.glob("../../../docs/demo-plasticos/**/capturas/*.png", { query: "?url", import: "default", eager: true }) as Record<string, string>;
const shot = (p: string) => shots[`../../../docs/demo-plasticos/${p}`] ?? "/portal/plasticos.jpg";

const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Número con coma decimal y punto de miles (es-CO). */
const fmt = (v: number, dec = 0) => v.toLocaleString("es-CO", { minimumFractionDigits: dec, maximumFractionDigits: dec });

/** Cifras de la demo (corridas del cosimulador y de Fractal). */
const K = {
  pedidos: 93,
  inyectoras: 12,
  manualATiempo: 90.3,
  cosimATiempo: 92.5,
  manualTarde: 9,
  manualAtraso: 229,
  ocManual: 69.3,
  ocCosim: 61,
  ocFractal: 60.7,
  horasCosim: 91,
  cambiosAntes: 30,
  cambiosDespues: 12,
  hCambiosAntes: 22.5,
  hCambiosDespues: 9,
  atrasoFallaAntes: 295.5,
  atrasoFallaDespues: 182.3,
  tardeFallaAntes: 10,
  tardeFallaDespues: 7,
};
const horasFractal = K.hCambiosAntes - K.hCambiosDespues; // 13,5 h/semana menos en cambios
const horasSemana = K.horasCosim + horasFractal; // ≈ 104,5 h/semana
const horasAno = Math.round(horasSemana * 52);

interface Slide {
  id: string;
  label: string;
  html: string;
  /** Tono del fondo (grados de matiz). */
  hue: number;
}

/** Fila de 12 inyectoras animadas para la portada. */
const machines = Array.from({ length: K.inyectoras }, (_, i) => {
  const st = [2, 6, 9].includes(i) ? "w" : i === 4 ? "r" : "g";
  return `<div class="rg-imm ${st}" style="--d:${0.6 + i * 0.07}s"><span class="rg-imm-hopper"></span><span class="rg-imm-body"><b>IMM-${String(i + 1).padStart(2, "0")}</b></span><span class="rg-imm-led"></span></div>`;
}).join("");

const cap = (n: number, title: string, img: string, alt: string, kicker: string, items: string[], chip: string, side: "l" | "r" = "r") => `
  <div class="rg-cap rg-cap-${side}">
    <div class="rg-cap-txt">
      <div class="rg-kicker a" data-a="left" style="--d:.1s">CAPACIDAD ${n} / 5 · ${kicker}</div>
      <h2 class="rg-h2 kin">${title}</h2>
      <ul class="rg-list">${items.map((t, i) => `<li class="a" data-a="up" style="--d:${0.7 + i * 0.16}s"><i></i>${t}</li>`).join("")}</ul>
      <div class="rg-chip a" data-a="pop" style="--d:${0.9 + items.length * 0.16}s">${chip}</div>
    </div>
    <figure class="rg-shot a" data-a="${side === "r" ? "right" : "left"}" style="--d:.35s">
      <img src="${img}" alt="${alt}" loading="lazy" />
      <span class="rg-shot-scan"></span><span class="rg-shot-frame"></span>
    </figure>
  </div>`;

const slides: Slide[] = [
  {
    id: "portada",
    label: "Portada",
    hue: 210,
    html: `
    <div class="rg-cover">
      <div class="rg-kicker a" data-a="left" style="--d:.1s">RESUMEN GERENCIAL · PLANTA DE PLÁSTICOS</div>
      <h1 class="rg-h1 kin">Del pedido a la máquina, con un gemelo digital</h1>
      <p class="rg-lead a" data-a="up" style="--d:1.2s">La historia de cómo una planta de inyección pasó de programar a mano a comparar escenarios antes de decidir, y cuánto puede ahorrar.</p>
      <div class="rg-floor a" data-a="fade" style="--d:.4s">${machines}<div class="rg-belt"><i></i><i></i><i></i><i></i><i></i><i></i></div></div>
      <div class="rg-cover-tags">
        ${["Emulador", "Centro de control", "Gemelo 3D", "APS", "Fractal"].map((t, i) => `<span class="a" data-a="pop" style="--d:${1.6 + i * 0.12}s">${t}</span>`).join("")}
      </div>
    </div>`,
  },
  {
    id: "reto",
    label: "El punto de partida",
    hue: 20,
    html: `
    <div class="rg-split">
      <div>
        <div class="rg-kicker a" data-a="left" style="--d:.1s">HISTORIA · EL PUNTO DE PARTIDA</div>
        <h2 class="rg-h2 kin">Una planta con más pedidos que certezas</h2>
        <p class="rg-lead a" data-a="up" style="--d:.9s">Doce inyectoras y una línea de ensamble fabrican cubiertos desechables, baldes de 12 litros y papeleras de pedal, en dos turnos al día. La programación se hacía a mano, en hojas de cálculo, y nadie sabía con certeza qué pasaba si un cliente adelantaba un pedido o una máquina fallaba.</p>
      </div>
      <div class="rg-kpis">
        <div class="rg-kpi a" data-a="pop" style="--d:.5s"><b data-count="${K.pedidos}">0</b><span>pedidos en cartera</span></div>
        <div class="rg-kpi a" data-a="pop" style="--d:.65s"><b data-count="${K.inyectoras}">0</b><span>inyectoras y 1 línea de ensamble</span></div>
        <div class="rg-kpi warn a" data-a="pop" style="--d:.8s"><b data-count="${K.manualATiempo}" data-dec="1" data-suf=" %">0</b><span>pedidos a tiempo con el plan manual</span></div>
        <div class="rg-kpi bad a" data-a="pop" style="--d:.95s"><b data-count="${K.manualAtraso}" data-suf=" h">0</b><span>de atraso en ${K.manualTarde} pedidos tarde</span></div>
        <div class="rg-kpi warn a" data-a="pop" style="--d:1.1s"><b data-count="${K.ocManual}" data-dec="1" data-suf=" %">0</b><span>de ocupación de la planta en la semana</span></div>
        <div class="rg-kpi a" data-a="pop" style="--d:1.25s"><b>?</b><span>qué pasa si cambia un pedido o falla una máquina</span></div>
      </div>
    </div>`,
  },
  {
    id: "construccion",
    label: "Cómo se construyó",
    hue: 260,
    html: `
    <div class="rg-center">
      <div class="rg-kicker a" data-a="left" style="--d:.1s">HISTORIA · CÓMO SE CONSTRUYÓ</div>
      <h2 class="rg-h2 kin">Seis capas, una sola verdad de planta</h2>
      <div class="rg-timeline">
        <svg class="rg-tl-line" viewBox="0 0 1000 20" preserveAspectRatio="none" aria-hidden="true"><path class="draw" d="M10 10 H990" style="--d:.6s;--len:1000" /></svg>
        ${[
          ["01", "Datos de la planta", "Productos, ciclos, moldes, resinas, colores y pedidos con su fecha de entrega."],
          ["02", "Motor de planta", "Cada equipo simulado con su comportamiento: inyectoras, buffers, montacargas y ensamble."],
          ["03", "Emulador y centro de control", "La planta en 2D con el PLC de cada máquina, y la ocupación día por día."],
          ["04", "Gemelo 3D", "La misma planta en tres dimensiones, con play para adelantar el tiempo."],
          ["05", "APS y cosimulador", "La programación en tabla y Gantt, calculada con optimización en menos de un segundo."],
          ["06", "Fractal", "Escenarios qué pasa si, comparados con métricas antes de decidir."],
        ]
          .map(([n, t, d], i) => `<div class="rg-step a" data-a="up" style="--d:${0.8 + i * 0.22}s"><span class="rg-step-n">${n}</span><b>${t}</b><p>${d}</p></div>`)
          .join("")}
      </div>
    </div>`,
  },
  {
    id: "flujo",
    label: "Cómo fluye la información",
    hue: 190,
    html: `
    <div class="rg-center">
      <div class="rg-kicker a" data-a="left" style="--d:.1s">HISTORIA · CÓMO FLUYE LA INFORMACIÓN</div>
      <h2 class="rg-h2 kin">Comparar primero, adoptar después</h2>
      <svg class="rg-flow" viewBox="0 0 1000 380" role="img" aria-label="Pedidos al APS, el cosimulador proyecta al gemelo, Fractal crea escenarios y lo adoptado va al PLC">
        <defs>
          <marker id="rg-ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="currentColor" /></marker>
        </defs>
        <g class="rg-flow-links">
          <path class="draw flowp" d="M150 200 H250" style="--d:.7s;--len:100" />
          <path class="draw flowp" d="M390 200 H470" style="--d:.95s;--len:80" />
          <path class="draw flowp" d="M610 200 C650 200 650 80 690 80" style="--d:1.2s;--len:200" />
          <path class="draw flowp" d="M610 200 H690" style="--d:1.25s;--len:80" />
          <path class="draw flowp" d="M610 200 C650 200 650 320 690 320" style="--d:1.3s;--len:200" />
          <path class="draw flowp f" d="M540 250 V330 H390" style="--d:1.6s;--len:230" />
          <path class="draw flowp f" d="M320 330 V250" style="--d:1.8s;--len:80" />
          <path class="draw flowp g" d="M320 160 V14 H937 V160" style="--d:2.1s;--len:1020" />
        </g>
        ${[
          [20, 160, 130, "Pedidos", "cantidad y fecha", "nc"],
          [250, 160, 140, "APS", "tabla y Gantt", "na"],
          [470, 160, 140, "Cosimulador", "1 objetivo, &lt; 1 s", "ng"],
          [690, 40, 175, "Gemelo 3D", "play y estela", "nc"],
          [690, 160, 175, "Centro de control", "ocupación", "nc"],
          [690, 280, 175, "Emulador 2D", "PLC por máquina", "nc"],
          [250, 290, 140, "Fractal", "escenarios", "nv"],
          [885, 160, 105, "PLC", "al adoptar", "na"],
        ]
          .map(
            ([x, y, w, t, s, c], i) =>
              `<g class="rg-node ${c} a" data-a="pop" style="--d:${0.4 + i * 0.13}s"><rect x="${x}" y="${y}" width="${w}" height="80" rx="12" /><text x="${Number(x) + Number(w) / 2}" y="${Number(y) + 36}">${t}</text><text class="s" x="${Number(x) + Number(w) / 2}" y="${Number(y) + 58}">${s}</text></g>`,
          )
          .join("")}
        <circle class="rg-pulse" r="5"><animateMotion dur="3.2s" repeatCount="indefinite" path="M85 200 H610 C650 200 650 80 777 80" /></circle>
        <circle class="rg-pulse pv" r="5"><animateMotion dur="3.8s" repeatCount="indefinite" begin="1s" path="M540 200 V330 H320 V200" /></circle>
        <circle class="rg-pulse pa" r="5"><animateMotion dur="4.2s" repeatCount="indefinite" begin="2s" path="M320 200 V14 H937 V200" /></circle>
      </svg>
      <p class="rg-lead rg-small a" data-a="up" style="--d:2.4s">El cosimulador calcula y proyecta; el gemelo muestra cada escenario; la persona compara y solo lo que adopta llega al PLC.</p>
    </div>`,
  },
  {
    id: "emulador",
    label: "Emulador",
    hue: 200,
    html: cap(1, "La planta en vivo, máquina por máquina", shot("3-contingencia-falla/capturas/01-emulador.png"), "Emulador 2D de la planta de plásticos", "EMULADOR 2D", [
      "Cada inyectora, buffer, montacargas y la línea de ensamble trabajando en tiempo real.",
      "Clic en una máquina: su PLC con orden, ciclo, unidades buenas, rechazos y OEE del turno.",
      "Las fallas aparecen como alarma y se propagan al resto del sistema.",
    ], "Sigue el mismo instante del play del gemelo 3D"),
  },
  {
    id: "control",
    label: "Centro de control",
    hue: 160,
    html: cap(2, "Toda la planta en una pantalla", shot("centro-de-control/capturas/centro-control-1920x1080.png"), "Centro de control con la ocupación de cada máquina", "CENTRO DE CONTROL", [
      "Ocupación contra disponibilidad de cada máquina, día por día.",
      "Semáforo: rojo saturada, ámbar casi llena, verde con holgura.",
      "Indicadores de planta, OEE y alarmas al instante.",
    ], "Muestra dónde está el cuello de botella antes de que duela", "l"),
  },
  {
    id: "gemelo",
    label: "Gemelo 3D",
    hue: 220,
    html: cap(3, "La misma planta, en tres dimensiones", shot("3-contingencia-falla/capturas/11-gemelo-3d-despues.png"), "Gemelo 3D con la inyectora 20 produciendo", "GEMELO 3D", [
      "Play que adelanta el tiempo: montacargas, carritos, montaje de moldes y producto saliendo.",
      "Panel de órdenes: cada pedido se sigue por las máquinas que lo fabrican.",
      "Cada escenario se puede ver en la planta antes de decidir.",
    ], "Pasado, presente y futuro de la planta en una escena"),
  },
  {
    id: "aps",
    label: "APS",
    hue: 35,
    html: cap(4, "La programación, calculada y ajustable", shot("1-calcular-programacion/capturas/05-gantt-cosimulador.png"), "Gantt del APS con la programación del cosimulador", "APS + COSIMULADOR", [
      "Cartera de pedidos, tabla y Gantt: arrastrar, soltar y fijar órdenes a mano.",
      "Calcular con un objetivo: casi cinco mil variables resueltas en menos de un segundo.",
      "Respeta turnos, moldes montados, lo que ya empezó y siempre las entregas.",
      "Traduce el plan en insumos: 27,5 t de resina, 524 kg de masterbatch y 733 h de máquina.",
    ], "Compras, almacén y producción trabajan con el mismo número", "l"),
  },
  {
    id: "fractal",
    label: "Fractal",
    hue: 275,
    html: cap(5, "Escenarios para decidir con datos", shot("1-calcular-programacion/capturas/07-fractal-balancear.png"), "Fractal comparando opciones de balanceo", "FRACTAL", [
      "Prueba combinaciones en menos de un segundo: secuencia y también cambios de planta.",
      "Mudar un molde, montar el de repuesto, dedicar un color a cada máquina.",
      "Cada opción con sus métricas, VER EN GANTT y ADOPTAR.",
    ], "Fractal recomienda; la persona decide"),
  },
  {
    id: "escenarios",
    label: "Cinco escenarios",
    hue: 300,
    html: `
    <div class="rg-center">
      <div class="rg-kicker a" data-a="left" style="--d:.1s">CAPACIDADES EN ACCIÓN · CINCO ESCENARIOS</div>
      <h2 class="rg-h2 kin">Cinco preguntas, cinco respuestas</h2>
      <div class="rg-scen">
        ${[
          ["1", "Calcular según entregas", "90,3 → 92,5 %", "pedidos a tiempo, con 91 h de máquina menos en la semana"],
          ["2", "Un cliente adelanta su pedido", "0,6 s", "para saber que se cumple sin atrasar a los demás"],
          ["3", "Falla una inyectora", "10 → 7", "pedidos tarde montando el molde de repuesto en 90 min"],
          ["4", "Pedidos fijados a mano", "65,9 → 61,6 %", "de ocupación sin mover las órdenes bloqueadas"],
          ["5", "Menos cambios de referencia", "30 → 12", "cambios: de 22,5 a 9 h de máquina en purgas y montajes"],
        ]
          .map(
            ([n, t, v, d], i) =>
              `<article class="rg-scard a" data-a="flip" style="--d:${0.6 + i * 0.18}s"><span class="rg-scard-n">${n}</span><h3>${t}</h3><b>${v}</b><p>${d}</p></article>`,
          )
          .join("")}
      </div>
    </div>`,
  },
  {
    id: "ahorro",
    label: "Ahorro potencial",
    hue: 140,
    html: `
    <div class="rg-save">
      <div class="rg-save-head">
        <div class="rg-kicker a" data-a="left" style="--d:.1s">EL AHORRO POTENCIAL DE LA OPTIMIZACIÓN</div>
        <h2 class="rg-h2 kin">La misma producción, con menos horas de máquina</h2>
      </div>
      <div class="rg-save-hero a" data-a="zoom" style="--d:.5s">
        <i class="rg-ring" aria-hidden="true"></i>
        <b data-count="${horasSemana}" data-dec="1">0</b>
        <span>horas de máquina libres por semana</span>
        <small>≈ <em data-count="${horasAno}">0</em> h al año</small>
      </div>
      <div class="rg-save-break">
        <div class="rg-brk a" data-a="left" style="--d:.9s"><div class="rg-brk-top"><b data-count="${K.horasCosim}" data-suf=" h">0</b><span>cosimulador: mejor secuencia contra el plan manual</span></div><div class="rg-meter"><i style="--w:${(K.horasCosim / horasSemana) * 100}%"></i></div></div>
        <div class="rg-brk v a" data-a="left" style="--d:1.1s"><div class="rg-brk-top"><b data-count="${horasFractal}" data-dec="1" data-suf=" h">0</b><span>Fractal: 60 % menos cambios de referencia (30 → 12)</span></div><div class="rg-meter"><i style="--w:${(horasFractal / horasSemana) * 100}%"></i></div></div>
        <div class="rg-occ a" data-a="up" style="--d:1.3s">
          <div class="rg-occ-t">Ocupación de la planta en la semana</div>
          ${[
            ["Manual", K.ocManual, "w"],
            ["Cosimulador", K.ocCosim, "g"],
            ["Fractal balanceado", K.ocFractal, "v"],
          ]
            .map(([l, v, c], i) => `<div class="rg-occ-row ${c}"><span>${l}</span><div class="rg-occ-bar"><i style="--w:${v}%;--d:${1.5 + i * 0.2}s"></i></div><b>${fmt(Number(v), Number(v) % 1 ? 1 : 0)} %</b></div>`)
            .join("")}
        </div>
      </div>
      <div class="rg-save-side">
        <div class="rg-mini a" data-a="pop" style="--d:1.7s"><b data-count="${K.atrasoFallaAntes - K.atrasoFallaDespues}" data-dec="1" data-suf=" h">0</b><span>menos de atraso ante una falla (−38 %), 3 pedidos rescatados</span></div>
        <div class="rg-mini a" data-a="pop" style="--d:1.85s"><b>70 → 62 %</b><span>la máquina más cargada, con el molde de repuesto</span></div>
        <div class="rg-calc a" data-a="up" style="--d:2s">
          <label for="rg-rate">Valor de una hora de máquina <small>(supuesto, ajústelo a su costo)</small></label>
          <div class="rg-calc-row"><input id="rg-rate" type="range" min="50000" max="400000" step="10000" value="150000" /><output id="rg-rate-out">$ 150.000</output></div>
          <div class="rg-calc-res">Ahorro potencial al año: <b id="rg-year">—</b></div>
        </div>
      </div>
    </div>`,
  },
  {
    id: "resumen",
    label: "Resumen",
    hue: 210,
    html: `
    <div class="rg-center rg-end">
      <div class="rg-kicker a" data-a="left" style="--d:.1s">RESUMEN</div>
      <h2 class="rg-h1 kin">Ver, comparar y decidir antes de tocar la planta</h2>
      <div class="rg-sum">
        ${[
          ["◉", "Visibilidad", "Emulador, centro de control y gemelo 3D muestran el mismo instante de la planta."],
          ["▦", "Programación en segundos", "El APS y el cosimulador pasan del 90,3 al 92,5 % de pedidos a tiempo."],
          ["◇", "Escenarios antes de actuar", "Fractal compara opciones de secuencia y de planta, con métricas."],
          ["▲", "Ahorro medible", `≈ ${fmt(horasSemana, 1)} h de máquina libres por semana para más pedidos.`],
        ]
          .map(([g, t, d], i) => `<div class="rg-sum-i a" data-a="up" style="--d:${0.8 + i * 0.18}s"><span>${g}</span><b>${t}</b><p>${d}</p></div>`)
          .join("")}
      </div>
      <p class="rg-motto a" data-a="zoom" style="--d:1.7s">Fractal recomienda; <em>la persona decide.</em></p>
      <div class="rg-next a" data-a="up" style="--d:2s"><b>Lo que sigue:</b> Fractal multiobjetivo, datos en vivo del PLC por OPC UA y la misma receta para otras plantas.</div>
      <div class="rg-cta a" data-a="up" style="--d:2.2s">
        <a class="rg-btn primary" href="/plant.html?plant=plastic-injection-plant-v1">VER EL GEMELO 3D</a>
        <a class="rg-btn" href="/aps.html">APS</a>
        <a class="rg-btn" href="/control.html">CENTRO DE CONTROL</a>
        <a class="rg-btn" href="/presentaciones.html">ESCENARIO POR ESCENARIO</a>
      </div>
    </div>`,
  },
];

const deck = document.getElementById("rg-deck") as HTMLElement;
const dots = document.getElementById("rg-dots") as HTMLElement;
const count = document.getElementById("rg-count") as HTMLElement;
const bar = document.getElementById("rg-bar") as HTMLElement;
const autoBtn = document.getElementById("rg-auto") as HTMLButtonElement;

deck.innerHTML = slides.map((s, i) => `<section class="rg-slide" id="s-${s.id}" data-i="${i}" aria-label="${s.label}"><div class="rg-slide-in">${s.html}</div></section>`).join("");
dots.innerHTML = slides.map((s, i) => `<button type="button" class="rg-dot" data-i="${i}" aria-label="${i + 1}. ${s.label}" title="${s.label}"></button>`).join("");

// Títulos con tipografía cinética: cada palabra entra por separado.
deck.querySelectorAll<HTMLElement>(".kin").forEach((el) => {
  const words = el.textContent!.trim().split(/\s+/);
  el.innerHTML = words.map((w, i) => `<span class="w"><span style="--d:${0.25 + i * 0.07}s">${w}</span></span>`).join(" ");
});

const sections = [...deck.querySelectorAll<HTMLElement>(".rg-slide")];
const dotEls = [...dots.querySelectorAll<HTMLElement>(".rg-dot")];
let cur = -1;
const timers: number[] = [];

function countUp(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>("[data-count]").forEach((el) => {
    const to = Number(el.dataset.count);
    const dec = Number(el.dataset.dec ?? 0);
    const suf = el.dataset.suf ?? "";
    const host = el.closest<HTMLElement>(".a");
    const delay = host ? parseFloat(getComputedStyle(host).getPropertyValue("--d")) * 1000 || 0 : 0;
    if (reduced) {
      el.textContent = fmt(to, dec) + suf;
      return;
    }
    el.textContent = fmt(0, dec) + suf;
    timers.push(
      window.setTimeout(() => {
        const t0 = performance.now();
        const dur = 1400;
        const step = (t: number) => {
          const k = Math.min(1, (t - t0) / dur);
          const e = 1 - Math.pow(1 - k, 4);
          el.textContent = fmt(to * e, dec) + suf;
          if (k < 1 && el.isConnected) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }, delay + 150),
    );
  });
}

function go(i: number) {
  i = Math.max(0, Math.min(slides.length - 1, i));
  if (i === cur) return;
  const dir = i > cur ? 1 : -1;
  timers.splice(0).forEach(clearTimeout);
  sections.forEach((s, k) => {
    s.classList.toggle("on", k === i);
    s.classList.toggle("prev", k === cur && k !== i);
    s.style.setProperty("--dir", String(dir));
    s.setAttribute("aria-hidden", k === i ? "false" : "true");
    if (k === i) s.scrollTop = 0;
  });
  dotEls.forEach((d, k) => d.classList.toggle("on", k === i));
  cur = i;
  count.textContent = `${i + 1} / ${slides.length}`;
  bar.style.width = `${((i + 1) / slides.length) * 100}%`;
  targetHue = slides[i].hue;
  countUp(sections[i]);
  if (reduced) requestAnimationFrame(frame);
  const url = new URL(location.href);
  url.searchParams.set("s", String(i + 1));
  history.replaceState(null, "", url);
  restartAuto();
}

document.getElementById("rg-prev")!.addEventListener("click", () => go(cur - 1));
document.getElementById("rg-next")!.addEventListener("click", () => go(cur + 1));
dotEls.forEach((d) => d.addEventListener("click", () => go(Number(d.dataset.i))));
document.getElementById("rg-full")!.addEventListener("click", toggleFull);

function toggleFull() {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen?.();
}

addEventListener("keydown", (e) => {
  if ((e.target as HTMLElement).tagName === "INPUT") return;
  if (["ArrowRight", "PageDown", " "].includes(e.key)) (e.preventDefault(), go(cur + 1));
  else if (["ArrowLeft", "PageUp"].includes(e.key)) (e.preventDefault(), go(cur - 1));
  else if (e.key === "Home") go(0);
  else if (e.key === "End") go(slides.length - 1);
  else if (e.key.toLowerCase() === "f") toggleFull();
  else if (e.key.toLowerCase() === "a") setAuto(!auto);
});

// Deslizar con el dedo en celular.
let sx = 0;
let sy = 0;
deck.addEventListener("touchstart", (e) => ((sx = e.touches[0].clientX), (sy = e.touches[0].clientY)), { passive: true });
deck.addEventListener("touchend", (e) => {
  const dx = e.changedTouches[0].clientX - sx;
  const dy = e.changedTouches[0].clientY - sy;
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(cur + (dx < 0 ? 1 : -1));
});

// Avance automático.
let auto = false;
let autoT = 0;
function restartAuto() {
  clearTimeout(autoT);
  document.body.classList.remove("auto-run");
  if (!auto) return;
  void document.body.offsetWidth;
  document.body.classList.add("auto-run");
  autoT = window.setTimeout(() => go(cur + 1 < slides.length ? cur + 1 : 0), 10000);
}
function setAuto(v: boolean) {
  auto = v;
  autoBtn.setAttribute("aria-pressed", String(v));
  autoBtn.textContent = v ? "❚❚ AUTO" : "▶ AUTO";
  restartAuto();
}
autoBtn.addEventListener("click", () => setAuto(!auto));

// Calculadora del ahorro: horas libres al año por el valor de la hora (supuesto ajustable).
const rate = deck.querySelector<HTMLInputElement>("#rg-rate")!;
const rateOut = deck.querySelector<HTMLElement>("#rg-rate-out")!;
const year = deck.querySelector<HTMLElement>("#rg-year")!;
function calc() {
  const v = Number(rate.value);
  rateOut.textContent = `$ ${fmt(v)}`;
  const total = horasAno * v;
  year.textContent = total >= 1e9 ? `$ ${fmt(total / 1e9, 2)} mil millones` : `$ ${fmt(total / 1e6, 0)} millones`;
}
rate.addEventListener("input", calc);
calc();

// Fondo: rejilla en perspectiva y partículas que cambian de tono con cada lámina.
const cv = document.getElementById("rg-bg") as HTMLCanvasElement;
const ctx = cv.getContext("2d")!;
let hue = 210;
let targetHue = 210;
const parts = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), z: 0.3 + Math.random() * 0.7, s: Math.random() }));
function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  cv.width = innerWidth * dpr;
  cv.height = innerHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
addEventListener("resize", resize);
resize();
function frame(t: number) {
  const w = innerWidth;
  const h = innerHeight;
  hue += (((targetHue - hue + 540) % 360) - 180) * 0.03;
  ctx.clearRect(0, 0, w, h);
  const g = ctx.createRadialGradient(w * 0.7, h * 0.2, 0, w * 0.7, h * 0.2, Math.max(w, h));
  g.addColorStop(0, `hsla(${hue},80%,45%,0.18)`);
  g.addColorStop(1, "hsla(220,60%,4%,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // Rejilla del piso.
  const hy = h * 0.62;
  ctx.strokeStyle = `hsla(${hue},80%,60%,0.10)`;
  ctx.lineWidth = 1;
  const off = reduced ? 0 : (t / 40) % 40;
  for (let k = 0; k < 18; k++) {
    const y = hy + Math.pow((k * 40 + off) / 720, 2) * (h - hy) * 1.0;
    if (y > h) break;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  for (let k = -12; k <= 12; k++) {
    ctx.beginPath();
    ctx.moveTo(w / 2 + k * 30, hy);
    ctx.lineTo(w / 2 + k * w * 0.16, h);
    ctx.stroke();
  }
  // Partículas (gránulos de resina).
  for (const p of parts) {
    if (!reduced) {
      p.y -= 0.0006 * p.z;
      p.x += Math.sin(t / 2000 + p.s * 9) * 0.0002;
      if (p.y < -0.02) (p.y = 1.02), (p.x = Math.random());
    }
    ctx.fillStyle = `hsla(${hue + p.s * 40},90%,70%,${0.25 * p.z})`;
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, 1 + p.z * 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  if (!reduced || Math.abs(targetHue - hue) > 0.5) requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

const start = Number(new URLSearchParams(location.search).get("s") ?? 1) - 1;
go(Number.isFinite(start) ? start : 0);
