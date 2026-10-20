/**
 * Página del gemelo de ciudad (centro de Medellín, zona B): plano de la red e indicadores de la línea base.
 *
 * Los datos salen de `tools/city/sumo_city.py` (resultados/linea-base.json del modelo) y se copian a
 * `public/data/ciudad-linea-base.json`; el plano es `layout.svg` del modelo copiado a `public/data/ciudad-plano.svg`.
 * Una prueba en tools/city/tests revisa que las copias sigan iguales al original.
 */
import "./acueducto-panel.css";
import "./ciudad.css";

interface Hour {
  hora: number;
  entradas: number;
  salidas: number;
  viaje_medio_s: number;
  demora_media_s: number;
}
interface Baseline {
  modelo: string;
  viajes_cargados: number;
  viajes_completados: number;
  bloqueos_teletransporte: number;
  velocidad_media_kmh: number;
  demora_media_s: number;
  horas_vehiculo_demora: number;
  hora_mas_lenta: number;
  ruta_critica: { origen: string; destino: string; viajes: number; viaje_medio_s: number; indice: number; nivel: string } | null;
  corredores: { calle: string; nombre: string; indice: number; nivel: string }[];
  tramos_mas_atascados: { tramo: string; minutos: number }[];
  curva_24h: Hour[];
  semilla: number;
}

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const fmt = (v: number, d = 0) => v.toLocaleString("es-CO", { minimumFractionDigits: d, maximumFractionDigits: d });
const LEVEL: Record<string, string> = { verde: "var(--good)", amarillo: "var(--warn)", rojo: "var(--crit)" };
const SIDE: Record<string, string> = { n: "norte", s: "sur", e: "oriente", w: "occidente" };

function start(D: Baseline): void {
  const names = new Map(D.corredores.map((c) => [c.calle, c.nombre]));
  const street = (id: string) => names.get(id) ?? id;
  /** "cra55-s" = puerta de la carrera 55 en el lado sur. */
  const gate = (g: string) => {
    const [s, side] = g.split("-");
    return `${street(s)} por el ${SIDE[side] ?? side}`;
  };
  /** "cra55-cl48_cra55-cl50" = tramo de la carrera 55 entre la calle 48 y la 50. */
  const segment = (t: string) => {
    const [a, b] = t.split("_").map((n) => n.split("-"));
    if (a[0] === b[0]) return `${street(a[0])}, de ${street(a[1])} a ${street(b[1])}`;
    return `${street(a[1])}, de ${street(a[0])} a ${street(b[0])}`;
  };

  $("tag-model").textContent = `${D.modelo} · semilla ${D.semilla}`;
  const rc = D.ruta_critica;
  const k: [string, string, string, string][] = [
    ["Viajes completados", fmt(D.viajes_completados), "", `de ${fmt(D.viajes_cargados)} cargados`],
    ["Velocidad media", fmt(D.velocidad_media_kmh, 1), "km/h", "todo el día"],
    ["Demora media", fmt(D.demora_media_s), "s", `por viaje; la peor hora es la de las ${D.hora_mas_lenta}:00`],
    ["Demora del día", fmt(D.horas_vehiculo_demora), "h-veh", "horas-vehículo perdidas"],
    ["Bloqueos", fmt(D.bloqueos_teletransporte), "", "vehículos detenidos más de 5 min"],
  ];
  if (rc) k.push(["Ruta crítica", fmt(rc.indice, 2), "índice", `${gate(rc.origen)} → ${gate(rc.destino)}`]);
  $("kpis").innerHTML = k
    .map((x) => `<div class="kpi"><div class="l">${x[0]}</div><div class="v">${x[1]}<small>${x[2]}</small></div><div class="n">${x[3]}</div></div>`)
    .join("");

  const max = Math.max(...D.corredores.map((c) => c.indice), 3);
  $("corr").innerHTML = D.corredores
    .map(
      (c) => `<div class="bar-row"><span class="nm">${c.nombre}</span>
        <span class="track"><span style="width:${(100 * c.indice) / max}%;background:${LEVEL[c.nivel] ?? "var(--s1)"}"></span></span>
        <b>${fmt(c.indice, 2)}</b></div>`,
    )
    .join("");
  $("jam").innerHTML = D.tramos_mas_atascados.length
    ? `<ul class="jam">${D.tramos_mas_atascados.map((t) => `<li><span>${segment(t.tramo)}</span><b>${fmt(t.minutos)} min</b></li>`).join("")}</ul>`
    : `<p class="hint">Ningún tramo bajó de 5 km/h.</p>`;

  // la corrida sigue una hora más para vaciar la red; esa hora no entra en la curva del día
  drawDay($("c-dia"), D.curva_24h.filter((h) => h.hora < 24));
}

/** Barras de entradas por hora con la demora media en línea sobre un segundo eje. */
function drawDay(el: HTMLElement, H: Hour[]): void {
  const W = 900, Ht = 260, L = 48, R = 44, T = 12, B = 28;
  const iw = W - L - R, ih = Ht - T - B;
  const nice = (v: number, step: number) => Math.ceil(v / step) * step;
  const maxE = nice(Math.max(...H.map((h) => h.entradas)), 1000);
  const maxD = nice(Math.max(...H.map((h) => h.demora_media_s)), 20);
  const bw = iw / 24;
  const y1 = (v: number) => T + ih - (ih * v) / maxE;
  const y2 = (v: number) => T + ih - (ih * v) / maxD;
  let s = `<svg viewBox="0 0 ${W} ${Ht}" role="img" aria-label="Entradas por hora y demora media del día">`;
  for (let i = 0; i <= 4; i++) {
    const v = (maxE * i) / 4;
    s += `<line x1="${L}" x2="${W - R}" y1="${y1(v)}" y2="${y1(v)}" stroke="var(--grid)"/>`;
    s += `<text x="${L - 6}" y="${y1(v) + 4}" text-anchor="end" class="ax">${fmt(v)}</text>`;
    s += `<text x="${W - R + 6}" y="${y2((maxD * i) / 4) + 4}" class="ax">${fmt((maxD * i) / 4)}</text>`;
  }
  H.forEach((h, i) => {
    const x = L + i * bw;
    s += `<rect x="${x + 2}" y="${y1(h.entradas)}" width="${bw - 4}" height="${T + ih - y1(h.entradas)}" fill="var(--s1)" opacity=".85"><title>${h.hora}:00 · ${fmt(h.entradas)} entradas · demora ${fmt(h.demora_media_s)} s</title></rect>`;
    if (i % 3 === 0) s += `<text x="${x + bw / 2}" y="${Ht - 8}" text-anchor="middle" class="ax">${h.hora}h</text>`;
  });
  const pts = H.map((h, i) => `${L + i * bw + bw / 2},${y2(h.demora_media_s)}`).join(" ");
  s += `<polyline points="${pts}" fill="none" stroke="var(--s2)" stroke-width="2.5"/>`;
  s += `</svg>`;
  el.innerHTML = s;
}

fetch("/data/ciudad-linea-base.json")
  .then((r) => r.json())
  .then(start)
  .catch(() => {
    $("kpis").innerHTML = `<p class="note">No se pudieron leer los indicadores de la línea base.</p>`;
  });
