// Gráficos animados de la serie: red tipo neuronal con señales, búsqueda de caminos, curvas y minigráficas.
// Cada función devuelve el SVG y registra su animación en la línea de tiempo del contexto `c`.

/** Números pseudoaleatorios repetibles (mismo dibujo en cada render). */
export function azar(seed = 7) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/**
 * Red por capas (estilo red neuronal): nodos, conexiones que se dibujan y señales que viajan de capa en capa.
 * Representa el análisis con IA; no se usa para los algoritmos genéticos.
 */
export function red(c, id, { w = 640, h = 420, capas = [4, 6, 6, 3], t0, dur = 3, seed = 3, etiquetaSalida } = {}) {
  const r = azar(seed);
  const xs = capas.map((_, i) => 40 + (i * (w - 80)) / (capas.length - 1));
  const nodos = capas.map((n, i) => Array.from({ length: n }, (_, k) => ({ x: xs[i], y: h / 2 + (k - (n - 1) / 2) * Math.min(70, (h - 60) / Math.max(1, n - 1)) })));
  const aristas = [];
  for (let i = 0; i < capas.length - 1; i++) for (const a of nodos[i]) for (const b of nodos[i + 1]) if (r() < 0.62) aristas.push({ a, b, i });
  const svg = `<svg class="red" id="${id}" viewBox="0 0 ${w} ${h}">
    ${aristas.map((e, k) => `<line class="ra" id="${id}-e${k}" x1="${e.a.x}" y1="${e.a.y}" x2="${e.b.x}" y2="${e.b.y}" pathLength="1"/>`).join("")}
    ${nodos.flat().map((n, k) => `<circle class="rn" id="${id}-n${k}" cx="${n.x}" cy="${n.y}" r="11"/>`).join("")}
    ${Array.from({ length: 14 }, (_, k) => `<circle class="rp" id="${id}-p${k}" r="6" cx="0" cy="0"/>`).join("")}
  </svg>`;
  if (t0 != null) {
    c.at(`#${id} .rn`, { opacity: 0, scale: 0, transformOrigin: "50% 50%" }, { opacity: 1, scale: 1, duration: 0.35, stagger: 0.025, ease: "back.out(2)" }, t0);
    c.at(`#${id} .ra`, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.5, stagger: 0.006, ease: "power2.out" }, t0 + 0.2);
    // Señales: cada una recorre un camino de entrada a salida, una capa por paso.
    const paso = Math.max(0.18, (dur - 0.6) / (capas.length - 1) / 2);
    for (let k = 0; k < 14; k++) {
      let n = nodos[0][Math.floor(r() * capas[0])];
      const t = t0 + 0.5 + (k * (dur - 0.6)) / 14;
      for (let i = 0; i < capas.length - 1; i++) {
        const sig = nodos[i + 1][Math.floor(r() * capas[i + 1])];
        c.at(`#${id}-p${k}`, { attr: { cx: n.x, cy: n.y }, opacity: 1 }, { attr: { cx: sig.x, cy: sig.y }, duration: paso, ease: "none", immediateRender: false }, t + i * paso);
        n = sig;
      }
      c.to(`#${id}-p${k}`, { opacity: 0, duration: 0.15 }, t + (capas.length - 1) * paso);
    }
    const sal = nodos[capas.length - 1].length;
    c.tl.push(`tl.to(${JSON.stringify(`#${id} .rn`)},{fill:"#4ea7ff",duration:.25,stagger:{each:.03,from:"start"},yoyo:true,repeat:1},${(t0 + 0.6).toFixed(2)});`);
    void sal;
  }
  return svg;
}

/**
 * Búsqueda de caminos: una malla de nodos entre un inicio y un destino; se exploran muchos caminos (tenues) y al
 * final se resaltan los mejores. No dice "el óptimo": muestra las mejores opciones encontradas.
 */
export function caminos(c, id, { w = 640, h = 420, cols = 6, filas = 4, explorar = 12, mejores = 3, t0, dur = 3, seed = 11, etiquetas = ["A", "B", "C"] } = {}) {
  const r = azar(seed);
  const pos = (i, j) => ({ x: 70 + (i * (w - 140)) / (cols - 1) + (i > 0 && i < cols - 1 ? (r() - 0.5) * 30 : 0), y: 50 + (j * (h - 100)) / (filas - 1) + (i > 0 && i < cols - 1 ? (r() - 0.5) * 24 : 0) });
  const N = Array.from({ length: cols }, (_, i) => Array.from({ length: filas }, (_, j) => pos(i, j)));
  const ini = { x: 20, y: h / 2 }, fin = { x: w - 20, y: h / 2 };
  const ruta = () => {
    const pts = [ini];
    let j = Math.floor(r() * filas);
    for (let i = 0; i < cols; i++) { pts.push(N[i][j]); j = Math.max(0, Math.min(filas - 1, j + Math.floor(r() * 3) - 1)); }
    pts.push(fin);
    return pts;
  };
  const d = (pts) => pts.map((p, k) => `${k ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const exp = Array.from({ length: explorar }, ruta);
  const best = Array.from({ length: mejores }, ruta);
  const svg = `<svg class="cam" id="${id}" viewBox="0 0 ${w} ${h}">
    ${N.flat().map((p) => `<circle class="cn" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="6"/>`).join("")}
    ${exp.map((p, k) => `<path class="ce" id="${id}-x${k}" d="${d(p)}" pathLength="1"/>`).join("")}
    ${best.map((p, k) => `<path class="cb b${k}" id="${id}-b${k}" d="${d(p)}" pathLength="1"/>`).join("")}
    <circle class="cio" cx="${ini.x}" cy="${ini.y}" r="14"/><circle class="cio fin" cx="${fin.x}" cy="${fin.y}" r="14"/>
    ${best.map((p, k) => `<text class="ct" id="${id}-t${k}" x="${(p[p.length - 2].x + 14).toFixed(1)}" y="${(p[p.length - 2].y - 14).toFixed(1)}">${etiquetas[k] || ""}</text>`).join("")}
  </svg>`;
  if (t0 != null) {
    c.at(`#${id} .cn, #${id} .cio`, { opacity: 0 }, { opacity: 1, duration: 0.4, stagger: 0.01 }, t0);
    const te = Math.max(0.6, dur * 0.55);
    exp.forEach((_, k) => {
      const t = t0 + 0.2 + (k * te) / explorar;
      c.at(`#${id}-x${k}`, { strokeDashoffset: 1, opacity: 0.9 }, { strokeDashoffset: 0, duration: 0.5, ease: "power1.inOut" }, t);
      c.to(`#${id}-x${k}`, { opacity: 0.18, duration: 0.4 }, t + 0.5);
    });
    best.forEach((_, k) => {
      const t = t0 + 0.3 + te + k * 0.3;
      c.at(`#${id}-b${k}`, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.7, ease: "power2.out" }, t);
      c.at(`#${id}-t${k}`, { opacity: 0 }, { opacity: 1, duration: 0.3 }, t + 0.5);
    });
  }
  return svg;
}

/** Curva con área (tendencia), dibujada de izquierda a derecha. */
export function curva(c, id, { w = 300, h = 90, puntos, t0, dur = 0.9, banda = false } = {}) {
  const max = Math.max(...puntos), min = Math.min(...puntos);
  const pt = puntos.map((v, i) => [(i * w) / (puntos.length - 1), h - 8 - ((v - min) / (max - min || 1)) * (h - 16)]);
  const linea = pt.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = `${linea} L${w} ${h} L0 ${h} Z`;
  const svg = `<svg class="curva" id="${id}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    ${banda ? `<path class="cv-band" d="${pt.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${(y - 10).toFixed(1)}`).join(" ")} ${pt.slice().reverse().map(([x, y]) => `L${x.toFixed(1)} ${(y + 10).toFixed(1)}`).join(" ")} Z"/>` : ""}
    <path class="cv-area" d="${area}"/><path class="cv-line" d="${linea}" pathLength="1"/></svg>`;
  if (t0 != null) {
    c.at(`#${id} .cv-line`, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: dur, ease: "power2.out" }, t0);
    c.at(`#${id} .cv-area, #${id} .cv-band`, { opacity: 0 }, { opacity: 1, duration: dur, ease: "power2.out" }, t0 + 0.2);
  }
  return svg;
}

/** Minibarras verticales que crecen. */
export function barras(c, id, { valores, t0, alerta = -1 } = {}) {
  const svg = `<div class="mbar" id="${id}">${valores.map((v, i) => `<i class="${i === alerta ? "al" : ""}" style="height:${v}%"></i>`).join("")}</div>`;
  if (t0 != null) c.at(`#${id} i`, { scaleY: 0 }, { scaleY: 1, duration: 0.5, stagger: 0.05, ease: "power2.out" }, t0);
  return svg;
}

/** Árbol de opciones que se ramifica (muchas combinaciones). */
export function arbol(c, id, { w = 900, h = 460, niveles = 5, t0, dur = 2.5, seed = 4 } = {}) {
  const r = azar(seed);
  const segs = [];
  const rama = (x, y, ang, len, n) => {
    if (n === 0) return;
    const hijos = n > 3 ? 2 : 3;
    for (let k = 0; k < hijos; k++) {
      const a = ang + (k - (hijos - 1) / 2) * (0.5 + r() * 0.2);
      const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
      segs.push({ x, y, x2, y2, n: niveles - n });
      rama(x2, y2, a, len * 0.78, n - 1);
    }
  };
  rama(40, h / 2, 0, w / 5.2, niveles);
  const ys = segs.flatMap((g) => [g.y, g.y2]), xs = segs.flatMap((g) => [g.x, g.x2]);
  const y0 = Math.min(...ys) - 14, x1 = Math.max(...xs) + 14;
  const svg = `<svg class="arbol" id="${id}" viewBox="20 ${y0.toFixed(0)} ${(x1 - 20).toFixed(0)} ${(Math.max(...ys) + 14 - y0).toFixed(0)}">${segs.map((s, k) => `<line class="ar n${s.n}" x1="${s.x.toFixed(1)}" y1="${s.y.toFixed(1)}" x2="${s.x2.toFixed(1)}" y2="${s.y2.toFixed(1)}" pathLength="1"/>`).join("")}<circle class="aroot" cx="40" cy="${h / 2}" r="12"/></svg>`;
  if (t0 != null) for (let n = 0; n < niveles; n++) c.at(`#${id} .ar.n${n}`, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: dur / niveles, ease: "none" }, t0 + (n * dur) / niveles);
  return svg;
}

/** Región factible (optimización matemática): restricciones que recortan el plano y un punto que mejora el objetivo. */
export function region(c, id, { w = 520, h = 400, t0, dur = 3 } = {}) {
  const svg = `<svg class="region" id="${id}" viewBox="0 0 ${w} ${h}">
    <line class="ax" x1="40" y1="${h - 40}" x2="${w - 20}" y2="${h - 40}"/><line class="ax" x1="40" y1="${h - 40}" x2="40" y2="20"/>
    <line class="rs" x1="40" y1="90" x2="${w - 60}" y2="${h - 40}" pathLength="1"/>
    <line class="rs" x1="40" y1="230" x2="${w - 40}" y2="120" pathLength="1"/>
    <line class="rs" x1="330" y1="20" x2="330" y2="${h - 40}" pathLength="1"/>
    <polygon class="rf" points="40,${h - 40} 40,230 248,184 330,206 330,${h - 40}"/>
    <line class="obj" x1="140" y1="${h - 40}" x2="40" y2="${h - 140}"/>
    <circle class="rpto" cx="90" cy="${h - 90}" r="12"/>
    <text class="rlab" x="250" y="${h - 12}">Restricciones de tu operación</text></svg>`;
  if (t0 != null) {
    c.at(`#${id} .rs`, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.6, stagger: 0.25 }, t0);
    c.at(`#${id} .rf`, { opacity: 0 }, { opacity: 1, duration: 0.6 }, t0 + 0.9);
    c.at(`#${id} .rpto`, { opacity: 0 }, { opacity: 1, duration: 0.3 }, t0 + 1.2);
    c.to(`#${id} .rpto`, { attr: { cx: 248, cy: 184 }, duration: dur - 1.4, ease: "power2.inOut" }, t0 + 1.4);
    c.at(`#${id} .obj`, { x: 0, y: 0, opacity: 0.2 }, { x: 230, y: -100, opacity: 0.8, duration: dur - 1.4, ease: "power2.inOut" }, t0 + 1.4);
  }
  return svg;
}

/** Población evolutiva: puntos que se seleccionan, recombinan y mutan; cada generación se acerca a mejores zonas. */
export function poblacion(c, id, { w = 760, h = 420, n = 26, gens = 4, t0, dur = 4, seed = 9 } = {}) {
  const r = azar(seed);
  const meta = { x: w * 0.78, y: h * 0.28 };
  let pts = Array.from({ length: n }, () => ({ x: 40 + r() * (w - 80), y: 40 + r() * (h - 80) }));
  const G = [pts];
  for (let g = 1; g <= gens; g++) {
    const k = g / gens;
    pts = pts.map((p) => ({ x: p.x + (meta.x - p.x) * (0.35 + 0.1 * k) + (r() - 0.5) * 60 * (1 - k), y: p.y + (meta.y - p.y) * (0.35 + 0.1 * k) + (r() - 0.5) * 60 * (1 - k) }));
    G.push(pts);
  }
  const svg = `<svg class="pob" id="${id}" viewBox="0 0 ${w} ${h}">
    <circle class="meta" cx="${meta.x}" cy="${meta.y}" r="70"/>
    ${Array.from({ length: 8 }, (_, k) => `<line class="cruce" id="${id}-x${k}" x1="0" y1="0" x2="0" y2="0"/>`).join("")}
    ${G[0].map((p, k) => `<circle class="ind${k % 7 === 0 ? " mut" : ""}" id="${id}-i${k}" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="9"/>`).join("")}
    <text class="gen" id="${id}-g" x="20" y="${h - 14}">Generación 1</text></svg>`;
  if (t0 != null) {
    c.at(`#${id} .ind`, { opacity: 0, scale: 0, transformOrigin: "50% 50%" }, { opacity: 1, scale: 1, duration: 0.4, stagger: 0.02 }, t0);
    const pg = (dur - 0.6) / gens;
    for (let g = 1; g <= gens; g++) {
      const t = t0 + 0.6 + (g - 1) * pg;
      // Recombinación: líneas entre parejas.
      for (let k = 0; k < 8; k++) {
        const a = G[g - 1][(k * 3) % n], b = G[g - 1][(k * 3 + 5) % n];
        c.at(`#${id}-x${k}`, { attr: { x1: a.x, y1: a.y, x2: b.x, y2: b.y }, opacity: 0.8 }, { opacity: 0, duration: pg * 0.5, immediateRender: false }, t);
      }
      G[g].forEach((p, k) => c.to(`#${id}-i${k}`, { attr: { cx: p.x, cy: p.y }, duration: pg * 0.7, ease: "power2.inOut" }, t + pg * 0.2));
      c.set(`#${id}-g`, { textContent: `Generación ${g + 1}` }, t + pg * 0.2);
    }
  }
  return svg;
}

/** Frontera de mejores planes con dos objetivos (multiobjetivo). */
export function pareto(c, id, { w = 620, h = 420, ejeX = "Menos energía", ejeY = "Entregas a tiempo", t0, seed = 13 } = {}) {
  const r = azar(seed);
  const pts = Array.from({ length: 34 }, () => { const x = 60 + r() * (w - 120), y = 40 + r() * (h - 110); return { x, y }; });
  const front = Array.from({ length: 7 }, (_, k) => { const a = (k / 6) * Math.PI / 2; return { x: 70 + Math.cos(a) * (w - 150), y: h - 60 - Math.sin(a) * (h - 120) }; });
  const svg = `<svg class="pareto" id="${id}" viewBox="0 0 ${w} ${h}">
    <line class="ax" x1="50" y1="${h - 50}" x2="${w - 10}" y2="${h - 50}"/><line class="ax" x1="50" y1="${h - 50}" x2="50" y2="10"/>
    <text class="axl" x="${w - 10}" y="${h - 16}" text-anchor="end">${ejeX} →</text><text class="axl" x="60" y="26">↑ ${ejeY}</text>
    ${pts.filter((p) => (p.x - 70) ** 2 / (w - 150) ** 2 + (h - 60 - p.y) ** 2 / (h - 120) ** 2 < 0.9).map((p) => `<circle class="pp" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="7"/>`).join("")}
    <path class="pf" d="${front.map((p, k) => `${k ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ")}" pathLength="1"/>
    ${front.map((p) => `<circle class="pb" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="11"/>`).join("")}</svg>`;
  if (t0 != null) {
    c.at(`#${id} .pp`, { opacity: 0 }, { opacity: 1, duration: 0.3, stagger: 0.02 }, t0);
    c.at(`#${id} .pf`, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 1, ease: "power2.out" }, t0 + 0.8);
    c.at(`#${id} .pb`, { opacity: 0, scale: 0, transformOrigin: "50% 50%" }, { opacity: 1, scale: 1, duration: 0.3, stagger: 0.1 }, t0 + 0.9);
  }
  return svg;
}

/** Montecarlo: abanico de trayectorias tenues y un histograma que se llena. */
export function montecarlo(c, id, { w = 760, h = 420, n = 40, t0, dur = 3, seed = 31 } = {}) {
  const r = azar(seed);
  const pasos = 12, x0 = 40, hw = w * 0.62;
  const fins = [];
  const lineas = Array.from({ length: n }, () => {
    let y = h / 2; const pts = [[x0, y]];
    for (let k = 1; k <= pasos; k++) { y += (r() - 0.5) * 34 + (r() - 0.5) * 10; pts.push([x0 + (k * hw) / pasos, y]); }
    fins.push(y);
    return pts.map(([x, y], k) => `${k ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  });
  const bins = Array(10).fill(0); const ymin = Math.min(...fins), ymax = Math.max(...fins);
  fins.forEach((y) => bins[Math.min(9, Math.floor(((y - ymin) / (ymax - ymin || 1)) * 10))]++);
  const bmax = Math.max(...bins), bx = x0 + hw + 30, bh = (ymax - ymin) / 10 || 10;
  const svg = `<svg class="mc" id="${id}" viewBox="0 0 ${w} ${h}">
    ${lineas.map((d, k) => `<path class="mcl" id="${id}-l${k}" d="${d}" pathLength="1"/>`).join("")}
    ${bins.map((b, k) => `<rect class="mch" x="${bx}" y="${(ymin + k * bh).toFixed(1)}" width="${((b / bmax) * (w - bx - 20)).toFixed(1)}" height="${Math.max(4, bh - 4).toFixed(1)}" rx="4"/>`).join("")}</svg>`;
  if (t0 != null) {
    lineas.forEach((_, k) => c.at(`#${id}-l${k}`, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.6, ease: "none" }, t0 + (k * (dur - 0.6)) / n));
    c.at(`#${id} .mch`, { scaleX: 0, transformOrigin: "0% 50%" }, { scaleX: 1, duration: dur * 0.6, stagger: 0.05, ease: "power2.out" }, t0 + dur * 0.4);
  }
  return svg;
}

/** Gantt simplificado: barras por recurso; una puede marcarse como cuello de botella. */
export function gantt(c, id, { filas = [["Línea 1", [[0, 30], [34, 60]]], ["Línea 2", [[5, 45], [50, 90]]], ["Línea 3", [[0, 25], [28, 70]]]], cuello = -1, t0 } = {}) {
  const svg = `<div class="gantt" id="${id}">${filas.map(([n, bs], i) => `<div class="gr"><span>${n}</span><div class="gt">${bs.map(([a, b], k) => `<i class="${i === cuello && k === bs.length - 1 ? "al" : ""}" style="left:${a}%;width:${b - a}%"></i>`).join("")}</div></div>`).join("")}</div>`;
  if (t0 != null) c.at(`#${id} i`, { scaleX: 0, transformOrigin: "0% 50%" }, { scaleX: 1, duration: 0.5, stagger: 0.08, ease: "power2.out" }, t0);
  return svg;
}

/**
 * Algoritmo genético legible: planes como tiras de bloques (orden de los pedidos) con su puntaje.
 * tS selecciona los dos mejores, tR corta y recombina en un plan hijo, tM muta un bloque,
 * tG avanza generación tras generación con la curva del mejor puntaje subiendo. tEnd es el final.
 */
export function genetico(c, id, { t0, tS, tR, tM, tG, tEnd, seed = 9 } = {}) {
  const r = azar(seed);
  const NB = 8, BW = 50, BH = 30, GAP = 6, X0 = 30, Y0 = 70, RH = 44;
  const fit = [62, 48, 71, 39, 55, 80];
  const pob = fit.map(() => Array.from({ length: NB }, () => Math.floor(r() * 4)));
  const A = 5, B = 2, CUT = 4; // los dos mejores: 80 y 71
  const hijo = [...pob[A].slice(0, CUT), ...pob[B].slice(CUT)];
  const MUT = 6, mutCol = (hijo[MUT] + 2) % 4;
  const yh = Y0 + fit.length * RH + 34;
  const bx = (k) => X0 + k * (BW + GAP);
  const xs = X0 + NB * (BW + GAP) + 14;
  const gens = 12, best = [80, 86, 86, 88, 89, 89, 91, 91, 92, 93, 93, 94];
  const CX = 760, CY = 70, CW = 310, CH = 330;
  const px = (g) => CX + (g / (gens - 1)) * CW, py = (v) => CY + CH - ((v - 70) / 30) * CH;
  const pts = best.map((v, g) => `${px(g).toFixed(1)},${py(v).toFixed(1)}`).join(" ");
  const svg = `<svg class="gen-svg" id="${id}" viewBox="0 0 1100 470">
    <text class="gt" x="${X0}" y="36">Planes candidatos</text><text class="gt" x="${xs}" y="36">Puntaje</text>
    ${pob.map((p, i) => `<g class="fila" id="${id}-f${i}">${p.map((v, k) => `<rect class="gb c${v}" x="${bx(k)}" y="${Y0 + i * RH}" width="${BW}" height="${BH}" rx="6"/>`).join("")}<rect class="gfb" x="${xs}" y="${Y0 + i * RH + 6}" width="${fit[i] * 1.1}" height="${BH - 12}" rx="4"/><text class="gf" x="${xs + fit[i] * 1.1 + 10}" y="${Y0 + i * RH + 23}">${fit[i]}</text></g>`).join("")}
    <line class="gcut" id="${id}-cut" x1="${bx(CUT) - GAP / 2}" y1="${Y0 - 10}" x2="${bx(CUT) - GAP / 2}" y2="${yh + BH + 10}"/>
    <text class="gt hj" id="${id}-hl" x="${X0}" y="${yh - 10}">Nuevo plan</text>
    ${hijo.map((v, k) => { const src = k < CUT ? A : B; return `<rect class="gb c${v} gh" id="${id}-h${k}" data-y="${Y0 + src * RH}" x="${bx(k)}" y="${yh}" width="${BW}" height="${BH}" rx="6"/>`; }).join("")}
    <rect class="gb c${mutCol} gm" id="${id}-m" x="${bx(MUT)}" y="${yh}" width="${BW}" height="${BH}" rx="6"/>
    <text class="gf gfh" id="${id}-hf" x="${xs}" y="${yh + 23}">86</text>
    <text class="gt" x="${CX - 20}" y="36">Mejor puntaje</text>
    <line class="ax" x1="${CX}" y1="${CY + CH}" x2="${CX + CW}" y2="${CY + CH}"/><line class="ax" x1="${CX}" y1="${CY + CH}" x2="${CX}" y2="${CY}"/>
    <polyline class="gcurva" id="${id}-cv" points="${pts}" pathLength="1"/>
    <text class="gen" id="${id}-g" x="${CX}" y="${CY + CH + 40}">Generación 1</text></svg>`;
  if (t0 != null) {
    c.at(`#${id} .fila`, { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 0.4, stagger: 0.08 }, t0);
    c.at(`#${id} .gfb`, { scaleX: 0, transformOrigin: "0% 50%" }, { scaleX: 1, duration: 0.5, stagger: 0.08 }, t0 + 0.3);
    // Selección: se quedan los dos mejores.
    fit.forEach((_, i) => { if (i !== A && i !== B) c.to(`#${id}-f${i}`, { opacity: 0.22, duration: 0.4 }, tS); });
    c.to(`#${id}-f${A}, #${id}-f${B}`, { filter: "drop-shadow(0 0 10px #4ea7ff)", duration: 0.4 }, tS);
    // Recombinación: corte y mezcla de las dos mitades.
    c.at(`#${id}-cut`, { opacity: 0 }, { opacity: 1, duration: 0.3 }, tR - 0.2);
    c.at(`#${id}-hl`, { opacity: 0 }, { opacity: 1, duration: 0.3 }, tR);
    hijo.forEach((_, k) => { const sy = (k < CUT ? A : B) * RH + Y0 - yh; c.at(`#${id}-h${k}`, { opacity: 0, y: sy }, { opacity: 1, y: 0, duration: 0.6, ease: "power2.inOut" }, tR + 0.1 + (k < CUT ? 0 : 0.35)); });
    // Mutación: un bloque cambia.
    c.at(`#${id}-m`, { opacity: 0, scale: 1.6, transformOrigin: "50% 50%" }, { opacity: 1, scale: 1, duration: 0.4, ease: "back.out(2)" }, tM);
    c.at(`#${id}-hf`, { opacity: 0 }, { opacity: 1, duration: 0.3 }, tM + 0.4);
    // Generación tras generación: la curva del mejor puntaje sube.
    const pg = Math.max(0.12, (tEnd - tG - 0.4) / (gens - 1));
    c.at(`#${id}-cv`, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: pg * (gens - 1), ease: "none" }, tG);
    for (let g = 1; g < gens; g++) c.set(`#${id}-g`, { textContent: `Generación ${g + 1}` }, tG + g * pg);
  }
  return svg;
}
