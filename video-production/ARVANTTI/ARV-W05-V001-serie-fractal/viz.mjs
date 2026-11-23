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
