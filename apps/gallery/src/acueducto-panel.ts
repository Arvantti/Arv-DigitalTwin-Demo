/**
 * Panel de gráficos del PLC del acueducto a escala (fuera de la escena 3D).
 *
 * Cuatro pantallas sobre un día de 24 ciclos de una hora: curva del día (consumos y presiones por sistema, piso o
 * válvula), bombas Grundfos, sensores en tiempo real (reproducción del día) y la optimización del gemelo digital.
 * Los datos salen de `tools/hydraulics/dia_acueducto.py`, que corre el banco hidráulico hora a hora y escribe
 * `public/data/acueducto-dia.json`. Cuando el simulador de tiempo real esté conectado, la pantalla de sensores
 * leerá sus tramas en lugar de reproducir el día.
 */
import "./acueducto-panel.css";

interface Scenario {
  setting: number[];
  speed: number[];
  p_discharge: number[];
  p_station_in: number[];
  p_station_out: number[];
  prv_opening_pct: number[];
  worst: string[];
  worst_p: number[];
  cons_m3h: number[];
  leak_m3h: number[];
  pump_m3h: number[];
  pump_head: number[][];
  pump_q: number[][];
  /** Presión (mca) por hora y válvula, en el orden de `valves`. */
  vp: number[][];
  /** Caudal (L/h) por hora y válvula. */
  vq: number[][];
}
interface DayData {
  target: number;
  manual: number;
  pump_floor: number;
  legacy_setting: number;
  legacy_leak: number;
  valves: string[];
  actual: Scenario;
  opt: Scenario;
}
interface Series {
  name: string;
  values: number[];
  c: string;
  type?: "bar" | "line";
  w?: number;
  dash?: boolean;
  op?: number;
  label?: string;
  noTip?: boolean;
  noLeg?: boolean;
}
interface Band {
  name: string;
  c: string;
  lo: number[];
  hi: number[];
}
interface Ref {
  y: number;
  label: string;
  c: string;
}
interface ChartOpts {
  series: Series[];
  unit: string;
  label: string;
  band?: Band[];
  refs?: Ref[];
  yMin?: number;
  yMax?: number;
  zero?: boolean;
  dec?: number;
  rpad?: number;
  h?: number;
  tipExtra?: (h: number) => string;
}

const HOURS = [...Array(24).keys()];
const hh = (h: number) => String(h).padStart(2, "0");
const fmt = (x: number, d = 1) => x.toLocaleString("es-CO", { minimumFractionDigits: d, maximumFractionDigits: d });
const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
const avg = (a: number[]) => sum(a) / a.length;
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

/** Semáforo de la casa: verde ≥ 20, amarillo ≥ 18, naranja ≥ 15 (norma), rojo bajo 15. */
const STAT: [number, string, string][] = [
  [20, "verde", "var(--good)"],
  [18, "amarillo", "var(--warn)"],
  [15, "naranja", "var(--serious)"],
  [-Infinity, "rojo", "var(--crit)"],
];
const stat = (p: number) => STAT.find((s) => p >= s[0]) ?? STAT[3];
const REFS: Ref[] = [
  { y: 20, label: "20 verde", c: "var(--good)" },
  { y: 18, label: "18 amarillo", c: "var(--warn)" },
  { y: 15, label: "15 norma", c: "var(--crit)" },
];

function niceStep(x: number): number {
  const e = Math.pow(10, Math.floor(Math.log10(x)));
  const f = x / e;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e;
}

/** Gráfico SVG de 24 horas con barras apiladas o líneas, banda opcional, líneas de referencia y tooltip. */
function chart(el: HTMLElement, o: ChartOpts): void {
  el.innerHTML = "";
  const W = Math.max(320, el.clientWidth || 700);
  const Ht = o.h ?? 260;
  const m = { l: 46, r: o.rpad ?? 16, t: 12, b: 30 };
  const iw = W - m.l - m.r;
  const ih = Ht - m.t - m.b;
  const vals: number[] = [];
  o.series.forEach((s) => vals.push(...s.values));
  (o.band ?? []).forEach((b) => vals.push(...b.lo, ...b.hi));
  (o.refs ?? []).forEach((r) => vals.push(r.y));
  const bars = o.series.filter((s) => s.type === "bar");
  if (bars.length) vals.push(...HOURS.map((h) => sum(bars.map((s) => s.values[h]))));
  let lo = o.yMin ?? Math.min(...vals);
  let hi = o.yMax ?? Math.max(...vals);
  if (o.zero) lo = Math.min(0, lo);
  const pad = (hi - lo) * 0.08 || 1;
  if (o.yMin == null && !o.zero) lo -= pad;
  if (o.yMax == null) hi += pad;
  const step = niceStep((hi - lo) / 5);
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  const bw = iw / 24;
  const X = (h: number) => m.l + bw * (h + 0.5);
  const Y = (v: number) => m.t + ih - ((v - lo) / (hi - lo)) * ih;
  const tickDec = Number.isInteger(step) ? 0 : Number.isInteger(step * 10) ? 1 : 2;
  const axis = "fill:var(--ink3);font:11px var(--f-mono)";
  let g = `<svg viewBox="0 0 ${W} ${Ht}" role="img" aria-label="${o.label}">`;
  for (let v = lo; v <= hi + 1e-9; v += step) {
    g += `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(v)}" y2="${Y(v)}" style="stroke:var(--grid)"/>`;
    g += `<text x="${m.l - 6}" y="${Y(v) + 4}" text-anchor="end" style="${axis}">${fmt(v, tickDec)}</text>`;
  }
  HOURS.forEach((h) => {
    if (h % 3 === 0 || (W > 700 && h % 2 === 0))
      g += `<text x="${X(h)}" y="${Ht - 10}" text-anchor="middle" style="${axis}">${hh(h)}</text>`;
  });
  (o.refs ?? []).forEach((r) => {
    if (r.y < lo || r.y > hi) return;
    g += `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(r.y)}" y2="${Y(r.y)}" style="stroke:${r.c};stroke-width:1.5;stroke-dasharray:5 4"/>`;
    g += `<text x="${W - m.r - 2}" y="${Y(r.y) - 4}" text-anchor="end" style="fill:var(--ink2);font:11px var(--f-body)">${r.label}</text>`;
  });
  (o.band ?? []).forEach((b) => {
    const pts = [...HOURS.map((h) => `${X(h)},${Y(b.hi[h])}`), ...[...HOURS].reverse().map((h) => `${X(h)},${Y(b.lo[h])}`)];
    g += `<polygon points="${pts.join(" ")}" style="fill:${b.c};opacity:.16"/>`;
  });
  if (bars.length) {
    const base = HOURS.map(() => 0);
    bars.forEach((s) =>
      HOURS.forEach((h) => {
        const y0 = base[h];
        const y1 = y0 + s.values[h];
        const top = Y(y1);
        const hgt = Math.max(0, Y(Math.max(lo, y0)) - top - (y0 > 0 ? 2 : 0));
        g += `<rect x="${X(h) - bw * 0.34}" y="${top}" width="${bw * 0.68}" height="${hgt}" rx="${y0 > 0 ? 0 : 2}" style="fill:${s.c}"/>`;
        base[h] = y1;
      }),
    );
  }
  o.series
    .filter((s) => s.type !== "bar")
    .forEach((s) => {
      const d = HOURS.map((h, i) => `${i ? "L" : "M"}${X(h)},${Y(s.values[h])}`).join("");
      g += `<path d="${d}" style="fill:none;stroke:${s.c};stroke-width:${s.w ?? 2};${s.dash ? "stroke-dasharray:6 4;" : ""}opacity:${s.op ?? 1};stroke-linejoin:round"/>`;
      if (s.label) g += `<text x="${X(23) + 6}" y="${Y(s.values[23]) + 4}" style="fill:var(--ink2);font:11px var(--f-body)">${s.label}</text>`;
    });
  g += `<line class="xh" y1="${m.t}" y2="${m.t + ih}" style="stroke:var(--ink3);stroke-width:1" opacity="0"/>`;
  g += `<rect class="hit" x="${m.l}" y="${m.t}" width="${iw}" height="${ih}" fill="transparent"/></svg>`;
  el.insertAdjacentHTML("beforeend", g);

  const tip = document.createElement("div");
  tip.className = "tip";
  tip.hidden = true;
  el.appendChild(tip);
  const svg = el.querySelector("svg")!;
  const xh = svg.querySelector(".xh")!;
  const hit = svg.querySelector(".hit")!;
  const show = (e: Event) => {
    const pe = e as PointerEvent;
    const r = svg.getBoundingClientRect();
    const sx = ((pe.clientX - r.left) * W) / r.width;
    const h = Math.max(0, Math.min(23, Math.floor((sx - m.l) / bw)));
    xh.setAttribute("x1", String(X(h)));
    xh.setAttribute("x2", String(X(h)));
    xh.setAttribute("opacity", "1");
    const rows = o.series
      .filter((s) => !s.noTip)
      .map((s) => `<div class="r"><span><span class="sw" style="background:${s.c}"></span>${s.name}</span><b>${fmt(s.values[h], o.dec ?? 2)}</b></div>`)
      .join("");
    tip.innerHTML = `<div style="margin-bottom:4px;color:var(--ink2)">${hh(h)}:00 a ${hh(h)}:59 · ${o.unit}</div>${rows}${o.tipExtra ? o.tipExtra(h) : ""}`;
    tip.hidden = false;
    const px = (X(h) / W) * r.width;
    tip.style.left = `${Math.min(r.width - tip.offsetWidth - 4, Math.max(0, px + 12))}px`;
    tip.style.top = "8px";
  };
  hit.addEventListener("pointermove", show);
  hit.addEventListener("pointerdown", show);
  hit.addEventListener("pointerleave", () => {
    tip.hidden = true;
    xh.setAttribute("opacity", "0");
  });
  const lg = document.createElement("div");
  lg.className = "legend";
  lg.innerHTML =
    o.series
      .filter((s) => !s.noLeg)
      .map((s) => `<span><i class="${s.dash ? "dash" : ""}" style="background:${s.c};color:${s.c}"></i>${s.name}</span>`)
      .join("") + (o.band ?? []).map((b) => `<span><i style="background:${b.c};opacity:.35;height:8px"></i>${b.name}</span>`).join("");
  el.appendChild(lg);
}

/** Grupo de botones excluyentes; `cb` recibe el dataset del botón pulsado. */
function seg(id: string, cb: (d: DOMStringMap) => void): void {
  const el = $(id);
  el.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest("button");
    if (!b) return;
    el.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    cb(b.dataset);
  });
}
const pressed = (id: string) => (document.querySelector(`#${id} button[aria-pressed="true"]`) as HTMLElement).dataset;
function kpis(id: string, list: [string, string, string, string?][]): void {
  $(id).innerHTML = list
    .map((k) => `<div class="kpi"><div class="l">${k[0]}</div><div class="v">${k[1]}<small>${k[2]}</small></div><div class="n">${k[3] ?? ""}</div></div>`)
    .join("");
}

function start(D: DayData): void {
  const A = D.actual;
  const O = D.opt;
  const V = D.valves;
  /** Índices de las válvulas de un nivel; `pref` = "c" para solo casas. */
  const idx = (lvl: number, pref?: string): [string, number][] =>
    V.map((k, i) => [k, i] as [string, number]).filter(([k]) => k.startsWith(`nivel${lvl}:`) && (!pref || k.split(":")[1].startsWith(pref)));
  const lvlAvg = (S: Scenario, l: number, f: "vp" | "vq" = "vp") => HOURS.map((h) => avg(idx(l, "c").map(([, i]) => S[f][h][i])));
  const houseLabel = (key: string) => key.replace("nivel", "N").replace(":", " ").toUpperCase();

  /* ---------- 1. curva del día ---------- */
  const consDay = sum(A.cons_m3h);
  const leakDay = sum(A.leak_m3h);
  const peakH = A.cons_m3h.indexOf(Math.max(...A.cons_m3h));
  const minP = Math.min(...A.worst_p);
  kpis("k-dia", [
    ["Consumo del día", fmt(consDay, 1), "m³", "24 ciclos de 1 h"],
    ["Fugas del día", fmt(leakDay, 1), "m³", `${fmt((100 * leakDay) / (consDay + leakDay), 1)} % de lo bombeado`],
    ["Hora pico", `${hh(peakH)}:00`, "", `${fmt(A.cons_m3h[peakH], 2)} m³/h a las casas`],
    ["Presión mínima", fmt(minP, 2), "mca", `casa ${houseLabel(A.worst[A.worst_p.indexOf(minP)])}`],
  ]);
  const drawCons = () => {
    const lpm = pressed("q-unit").u === "lpm";
    const k = lpm ? 1000 / 60 : 1;
    chart($("c-cons"), {
      unit: lpm ? "L/min" : "m³/h",
      zero: true,
      dec: lpm ? 1 : 2,
      label: "Consumo por hora",
      series: [
        { name: "Consumo de las casas", type: "bar", c: "var(--s1)", values: A.cons_m3h.map((x) => x * k) },
        { name: "Fugas", type: "bar", c: "var(--s2)", values: A.leak_m3h.map((x) => x * k) },
        { name: "Total bombeado", c: "var(--ink2)", w: 1.5, dash: true, values: A.pump_m3h.map((x) => x * k) },
      ],
    });
  };
  const drawPres = () => {
    const v = pressed("p-view").v;
    const isP = pressed("p-y").y === "p";
    const f = isP ? "vp" : "vq";
    const unit = isP ? "mca" : "L/h";
    const lvlSel = $<HTMLSelectElement>("p-lvl");
    const sel = $<HTMLSelectElement>("p-val");
    lvlSel.hidden = sel.hidden = v !== "val";
    const el = $("c-pres");
    const hint = $("p-hint");
    const base = { unit, refs: isP ? REFS : [], yMin: isP ? 12 : undefined, zero: !isP, dec: isP ? 2 : 0 };
    if (v === "sis") {
      const cs = [1, 2, 3, 4].flatMap((l) => idx(l, "c"));
      const all = HOURS.map((h) => cs.map(([, i]) => A[f][h][i]));
      hint.textContent = isP
        ? "Las 64 válvulas de casa de los cuatro pisos: promedio y rango entre la mínima y la máxima."
        : "Caudal total de las 64 válvulas de casa.";
      chart(el, {
        ...base,
        label: "Presión del sistema",
        band: isP ? [{ name: "Rango mínimo a máximo", c: "var(--s1)", lo: all.map((a) => Math.min(...a)), hi: all.map((a) => Math.max(...a)) }] : [],
        series: [{ name: isP ? "Promedio del sistema" : "Total del sistema", c: "var(--s1)", values: all.map(isP ? avg : sum) }],
        tipExtra: isP
          ? (h) => `<div class="r"><span>Mínima</span><b>${fmt(Math.min(...all[h]), 2)}</b></div><div class="r"><span>Máxima</span><b>${fmt(Math.max(...all[h]), 2)}</b></div>`
          : undefined,
      });
    } else if (v === "piso") {
      hint.textContent = isP ? "Promedio de las 16 válvulas de casa de cada piso de la rejilla." : "Caudal de las 16 válvulas de casa de cada piso.";
      const cols = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)"];
      chart(el, {
        ...base,
        rpad: 70,
        label: "Presión por piso",
        series: [1, 2, 3, 4].map((l) => ({
          name: `Nivel ${l}`,
          label: `Nivel ${l}`,
          c: cols[l - 1],
          values: isP ? lvlAvg(A, l) : HOURS.map((h) => sum(idx(l, "c").map(([, i]) => A.vq[h][i]))),
        })),
      });
    } else {
      const l = Number(lvlSel.value);
      const list = idx(l);
      const prev = sel.value;
      // En el código Cji, j es el ramal e i la casa dentro del ramal; cada nivel tiene su propia C11 a C44.
      sel.innerHTML = [1, 2, 3, 4]
        .map((j) => {
          const opts = list
            .filter(([k]) => {
              const n = k.split(":")[1];
              return n.startsWith(`c${j}`) || n === (j === 2 ? "l1" : j === 4 ? "l2" : "");
            })
            .map(([k]) => {
              const n = k.split(":")[1];
              const txt = n.startsWith("l") ? `N${l} · R${j} · Fuga ${n.toUpperCase()}` : `N${l} · R${j} · Casa ${n[2]} (${n.toUpperCase()})`;
              return `<option value="${k}">${txt}</option>`;
            })
            .join("");
          return `<optgroup label="Nivel ${l} · Ramal ${j}">${opts}</optgroup>`;
        })
        .join("");
      sel.value = list.some(([k]) => k === prev) ? prev : `nivel${l}:c44`;
      const si = V.indexOf(sel.value);
      const name = sel.value.split(":")[1].toUpperCase();
      hint.textContent = `Válvula ${name} del nivel ${l} (Cji: ramal j, casa i), con las demás válvulas del nivel en gris y el promedio del nivel.`;
      const others: Series[] = list
        .filter(([k]) => k !== sel.value)
        .map(([, i], j) => ({ name: "Otras válvulas del piso", c: "var(--ink3)", w: 1, op: 0.35, noTip: true, noLeg: j > 0, values: HOURS.map((h) => A[f][h][i]) }));
      chart(el, {
        ...base,
        label: "Presión por válvula",
        series: [
          ...others,
          { name: "Promedio del piso", c: "var(--s3)", dash: true, values: lvlAvg(A, l, f) },
          { name, c: "var(--s1)", w: 2.5, values: HOURS.map((h) => A[f][h][si]) },
        ],
      });
    }
  };
  seg("q-unit", drawCons);
  seg("p-view", drawPres);
  seg("p-y", drawPres);
  $("p-lvl").addEventListener("change", drawPres);
  $("p-val").addEventListener("change", drawPres);

  /* ---------- 2. bombas ---------- */
  const spA = A.speed.map((x) => x * 100);
  kpis("k-bom", [
    ["Entrada de la reguladora", `${fmt(Math.min(...A.p_station_in), 1)} a ${fmt(Math.max(...A.p_station_in), 1)}`, "mca", `sensor PT-201, piso de ${fmt(D.pump_floor, 0)} mca`],
    ["Velocidad de las bombas", `${fmt(Math.min(...spA), 0)} a ${fmt(Math.max(...spA), 0)}`, "%", `mínima que sostiene ${fmt(D.pump_floor, 0)} mca`],
    ["Caudal pico por bomba", fmt(Math.max(...A.pump_q[0]), 2), "m³/h", "diseño 13 m³/h cada una"],
    ["Cabeza de cada bomba", `${fmt(Math.min(...A.pump_head[0]), 1)} a ${fmt(Math.max(...A.pump_head[0]), 1)}`, "mca", "succión a descarga"],
  ]);
  const drawBom = () => {
    const y = pressed("b-y").y;
    const el = $("c-bom");
    const hint = $("b-hint");
    if (y === "h") {
      hint.textContent =
        "Presión a la entrada de la reguladora (sensor que controla el PLC de Grundfos) y cabeza de cada bomba, en metros de columna de agua. Las dos bombas son iguales y sus curvas se superponen.";
      chart(el, {
        unit: "mca",
        yMin: 60,
        yMax: 85,
        rpad: 84,
        label: "Presión de las bombas",
        refs: [
          { y: 80, label: "80 pico máx.", c: "var(--warn)" },
          { y: 70, label: "70 mínimo", c: "var(--crit)" },
          { y: 65, label: "65 por 5 s", c: "var(--serious)" },
        ],
        series: [
          { name: "Cabeza bomba 1", c: "var(--s1)", w: 3, values: A.pump_head[0] },
          { name: "Cabeza bomba 2", c: "var(--s2)", dash: true, values: A.pump_head[1] },
          { name: "Entrada reguladora PT-201", c: "var(--s3)", values: A.p_station_in },
        ],
      });
    } else if (y === "q") {
      hint.textContent = "Caudal de cada bomba por hora.";
      chart(el, {
        unit: "m³/h",
        zero: true,
        dec: 3,
        label: "Caudal de las bombas",
        series: [
          { name: "Bomba 1", type: "bar", c: "var(--s1)", values: A.pump_q[0] },
          { name: "Bomba 2", type: "bar", c: "var(--s2)", values: A.pump_q[1] },
        ],
      });
    } else {
      hint.textContent = `Velocidad de las dos bombas en % de la nominal, la mínima que sostiene ${fmt(D.pump_floor, 0)} mca a la entrada de la reguladora.`;
      chart(el, { unit: "%", yMin: 50, yMax: 100, dec: 1, label: "Velocidad de las bombas", series: [{ name: "Bombas 1 y 2", c: "var(--s1)", values: spA }] });
    }
  };
  seg("b-y", drawBom);

  /* ---------- 4. gemelo ---------- */
  const lA = sum(A.leak_m3h);
  const lO = sum(O.leak_m3h);
  kpis("k-gem", [
    [`Fugas frente a ${fmt(D.legacy_setting, 2)} mca`, fmt(D.legacy_leak - lA, 1), "m³/día evitados", `−${fmt((100 * (D.legacy_leak - lA)) / D.legacy_leak, 1)} % con la consigna de ${fmt(D.manual, 2)} mca`],
    ["Ajuste hora a hora", fmt(lA - lO, 2), "m³/día más", `−${fmt((100 * (lA - lO)) / lA, 1)} % de fugas sobre la consigna fija`],
    ["Consigna recomendada", `${fmt(Math.min(...O.setting), 2)} a ${fmt(Math.max(...O.setting), 2)}`, "mca", `hoy fija en ${fmt(D.manual, 2)} mca`],
    ["Casa crítica con el gemelo", fmt(Math.min(...O.worst_p), 2), "mca", `norma 15 mca + 3 % = ${fmt(D.target, 2)}`],
  ]);
  const drawGem = () => {
    chart($("c-crit"), {
      unit: "mca",
      refs: REFS,
      yMin: 12,
      label: "Casa crítica",
      series: [
        { name: "Operación actual", c: "var(--s1)", values: A.worst_p },
        { name: "Con el gemelo", c: "var(--s3)", w: 2.5, values: O.worst_p },
      ],
      tipExtra: (h) => `<div class="r"><span>Casa crítica</span><b>${houseLabel(O.worst[h])}</b></div>`,
    });
    chart(
      $("c-set"),
      pressed("g-prv").y === "s"
        ? {
            unit: "mca",
            yMin: 12,
            refs: [{ y: 15, label: "15", c: "var(--crit)" }],
            label: "Consigna",
            series: [
              { name: "Actual (fija)", c: "var(--s1)", values: A.p_station_out },
              { name: "Recomendada por el gemelo", c: "var(--s3)", w: 2.5, values: O.p_station_out },
            ],
          }
        : {
            unit: "% apertura",
            zero: true,
            dec: 1,
            label: "Apertura PRV",
            series: [
              { name: "Actual", c: "var(--s1)", values: A.prv_opening_pct },
              { name: "Con el gemelo", c: "var(--s3)", w: 2.5, values: O.prv_opening_pct },
            ],
          },
    );
    chart($("c-leak"), {
      unit: "m³/h",
      zero: true,
      dec: 3,
      label: "Fugas",
      series: [
        { name: "Operación actual", c: "var(--s1)", values: A.leak_m3h },
        { name: "Con el gemelo", c: "var(--s3)", w: 2.5, values: O.leak_m3h },
      ],
    });
    chart($("c-gpump"), {
      unit: "%",
      yMin: 50,
      yMax: 100,
      dec: 1,
      label: "Velocidad de las bombas",
      series: [
        { name: "Operación actual", c: "var(--s1)", values: A.speed.map((x) => x * 100) },
        { name: "Con el gemelo", c: "var(--s3)", w: 2.5, values: O.speed.map((x) => x * 100) },
      ],
    });
  };
  seg("g-prv", drawGem);

  /* ---------- 3. sensores en tiempo real (reproducción del día) ---------- */
  let t = 7.5;
  let speed = matchMedia("(prefers-reduced-motion: reduce)").matches ? 60 : 600;
  let running = true;
  let scn: "actual" | "opt" = "actual";
  let last = performance.now();
  let lastFrame = 0;
  const lerp = (arr: number[], tt: number) => {
    const h = Math.floor(tt) % 24;
    const f = tt - Math.floor(tt);
    return arr[h] * (1 - f) + arr[(h + 1) % 24] * f;
  };
  // ruido de medición simulado, pequeño y suave
  const noise = (k: number, amp: number) => 1 + amp * (Math.sin(k * 12.9898 + performance.now() / 700) * 0.6 + Math.sin(k * 3.7 + performance.now() / 290) * 0.4);
  const valveSeries = (S: Scenario, i: number) => HOURS.map((h) => S.vp[h][i]);
  const SENS: { tg: string; nm: string; u: string; d?: number; sem?: boolean; f: (S: Scenario) => number }[] = [
    { tg: "PT-101", nm: "Descarga bombas", u: "mca", f: (S) => lerp(S.p_discharge, t) },
    { tg: "SC-101", nm: "Velocidad bombas", u: "%", f: (S) => 100 * lerp(S.speed, t) },
    { tg: "FT-101", nm: "Caudal bombeado", u: "m³/h", d: 2, f: (S) => lerp(S.pump_m3h, t) },
    { tg: "PT-201", nm: `Entrada reguladora (piso ${fmt(D.pump_floor, 0)})`, u: "mca", f: (S) => lerp(S.p_station_in, t) },
    { tg: "PT-202", nm: "Salida reguladora", u: "mca", f: (S) => lerp(S.p_station_out, t) },
    { tg: "ZT-201", nm: "Apertura PRV", u: "%", f: (S) => lerp(S.prv_opening_pct, t) },
    ...[1, 2, 3, 4].map((l) => ({
      tg: `PT-30${l}`,
      nm: `Promedio nivel ${l}`,
      u: "mca",
      sem: true,
      f: (S: Scenario) => avg(idx(l, "c").map(([, i]) => lerp(valveSeries(S, i), t))),
    })),
    { tg: "PT-399", nm: "Casa crítica", u: "mca", sem: true, f: (S) => lerp(S.worst_p, t) },
    { tg: "FT-301", nm: "Consumo casas", u: "m³/h", d: 2, f: (S) => lerp(S.cons_m3h, t) },
    { tg: "FT-302", nm: "Fugas L1 y L2", u: "m³/h", d: 3, f: (S) => lerp(S.leak_m3h, t) },
  ];
  const hist: number[][] = SENS.map(() => []);
  $("sens").innerHTML = SENS.map(
    (s, k) => `<div class="sensor"><span class="tg">${s.tg}</span><span class="nm">${s.nm}</span><span class="val" id="sv${k}">–</span><svg id="sp${k}" viewBox="0 0 100 28" preserveAspectRatio="none"></svg></div>`,
  ).join("");
  $("sem-leg").innerHTML = STAT.map((s) => `<span class="pill"><span class="d" style="background:${s[2]}"></span>${s[1]}</span>`).join("");
  // matriz de cada nivel: 4 ramales × (4 casas + la fuga de los ramales 2 y 4)
  $("lvls").innerHTML = [1, 2, 3, 4]
    .map(
      (l) =>
        `<div class="lvl"><h3>Nivel ${l}</h3><div class="mat">${[1, 2, 3, 4]
          .map(
            (j) =>
              `<span class="rh">R${j}</span>` +
              [1, 2, 3, 4].map((i) => `<div class="cell" id="cl${l}c${j}${i}">–</div>`).join("") +
              (j % 2 === 0 ? `<div class="cell leak" id="cl${l}l${j / 2}">–</div>` : `<div class="cell empty"></div>`),
          )
          .join("")}</div></div>`,
    )
    .join("");
  const frames: string[][] = [];
  const clk = $("clk");
  const scrub = $<HTMLInputElement>("scrub");
  const tick = (now: number) => {
    const dt = (now - last) / 1000;
    last = now;
    if (running) {
      t = (t + (dt * speed) / 3600) % 24;
      scrub.value = String(Math.floor(t * 60));
    }
    const S = D[scn];
    const sec = Math.floor(t * 3600);
    clk.textContent = `${hh(Math.floor(t))}:${hh(Math.floor(sec / 60) % 60)}:${hh(sec % 60)}`;
    if (now - lastFrame > 500) {
      lastFrame = now;
      SENS.forEach((s, k) => {
        const v = s.f(S) * noise(k, 0.003);
        hist[k].push(v);
        if (hist[k].length > 60) hist[k].shift();
        const st = s.sem ? stat(v) : null;
        $(`sv${k}`).innerHTML =
          `${fmt(v, s.d ?? 1)}<small>${s.u}</small>` +
          (st ? ` <span class="pill" style="font-size:11px;vertical-align:middle"><span class="d" style="background:${st[2]}"></span>${st[1]}</span>` : "");
        const hv = hist[k];
        const mn = Math.min(...hv);
        const r = Math.max(...hv) - mn || 1;
        $(`sp${k}`).innerHTML = `<polyline points="${hv.map((x, i) => `${(i * 100) / 59},${26 - ((x - mn) / r) * 24}`).join(" ")}" style="fill:none;stroke:var(--s1);stroke-width:1.5" vector-effect="non-scaling-stroke"/>`;
      });
      V.forEach((key, i) => {
        const [lv, vn] = key.split(":");
        const el = document.getElementById(`cl${lv.slice(5)}${vn}`);
        if (!el) return;
        const p = lerp(valveSeries(S, i), t) * noise(i, 0.002);
        const st = stat(p);
        el.style.background = st[2];
        el.innerHTML = `${fmt(p, 1)}<span>${vn.toUpperCase()}</span>`;
        el.title = `${vn.toUpperCase()} nivel ${lv.slice(5)}: ${fmt(p, 2)} mca (${st[1]})`;
      });
      const k = Math.floor(Math.random() * SENS.length);
      frames.unshift([clk.textContent ?? "", SENS[k].tg, SENS[k].nm, `${fmt(hist[k][hist[k].length - 1], SENS[k].d ?? 2)} ${SENS[k].u}`, "OK"]);
      frames.length = Math.min(frames.length, 8);
      $("frm").innerHTML = frames.map((fr) => `<tr>${fr.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("");
    }
    requestAnimationFrame(tick);
  };
  $("play").addEventListener("click", (e) => {
    running = !running;
    (e.target as HTMLElement).textContent = running ? "Pausar" : "Reanudar";
  });
  seg("spd", (d) => (speed = Number(d.x)));
  seg("scn", (d) => (scn = d.c === "opt" ? "opt" : "actual"));
  scrub.addEventListener("input", () => (t = Number(scrub.value) / 60));
  requestAnimationFrame(tick);

  /* ---------- pestañas y redibujo ---------- */
  const draws: Record<string, () => void> = {
    dia: () => {
      drawCons();
      drawPres();
    },
    bom: drawBom,
    gem: drawGem,
    sen: () => {},
  };
  let cur = "dia";
  const go = (s: string) => {
    cur = s;
    document.querySelectorAll("nav.tabs button").forEach((b) => b.setAttribute("aria-selected", String((b as HTMLElement).dataset.s === s)));
    document.querySelectorAll<HTMLElement>("section.screen").forEach((x) => (x.hidden = x.id !== `s-${s}`));
    draws[s]();
    history.replaceState(null, "", `#${s}`);
  };
  document.querySelector("nav.tabs")!.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest("button");
    if (b?.dataset.s) go(b.dataset.s);
  });
  const fromHash = location.hash.slice(1);
  go(fromHash in draws ? fromHash : "dia");
  let rt = 0;
  new ResizeObserver(() => {
    clearTimeout(rt);
    rt = window.setTimeout(() => draws[cur](), 120);
  }).observe(document.querySelector(".wrap")!);
}

fetch("/data/acueducto-dia.json")
  .then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json() as Promise<DayData>;
  })
  .then(start)
  .catch((e) => {
    document.querySelector(".kpis")!.innerHTML =
      `<p class="load-error">No se pudo leer /data/acueducto-dia.json (${e}). Genéralo con: uv run python tools/hydraulics/dia_acueducto.py</p>`;
  });
