import criticalRaw from "../../../docs/architecture/validation/pdd-prs-critical-point-18-01-validation.json?raw";
import fixedRaw from "../../../docs/architecture/validation/pdd-prs-fijo-01-24h.json?raw";

// Evidencia empaquetada por Vite: también funciona en el despliegue estático sin servir /docs.
type Row = {
  t_s?: number; end_t_s?: number;
  prs_inlet_mca: number; prs_outlet_mca: number;
  minimum_dwelling_pressure_mca?: number;
  flows_m3h?: Record<string, number>;
  tank_levels_pct?: Record<string, number>;
  floor_minimum_pressure_mca?: Record<string, number>;
  scenario_results?: { demand_factor: number; consumer_pressures_mca: Record<string, number> }[];
};
type Report = { emulator: { hourly: Row[] }; fractal: { hourly: Row[] } };
const reports: Record<string, Report> = {
  c44: JSON.parse(criticalRaw) as Report,
  fixed: JSON.parse(fixedRaw) as Report,
};
type Reading = number | undefined;
const format = (value: number) => value.toLocaleString("es-CO", { maximumFractionDigits: 5 });

function plot(title: string, unit: string, plc: Reading[], fractal: Reading[], percentage = false): string {
  const width = 720, height = 220, left = 66, right = 18, top = 22, bottom = 30;
  const finite = [...plc, ...fractal].filter((v): v is number => v !== undefined && Number.isFinite(v));
  if (!finite.length) return `<p>${title}: sin porcentaje definido (referencia cero) o sin datos.</p>`;
  let lo = Math.min(...finite), hi = Math.max(...finite);
  const padding = hi === lo ? Math.max(0.01, Math.abs(hi) * 0.05) : (hi - lo) * 0.12;
  lo -= padding; hi += padding;
  const x = (i: number) => left + i / 23 * (width - left - right);
  const y = (v: number) => top + (hi - v) / (hi - lo) * (height - top - bottom);
  const series = (values: Reading[], color: string, label: string, dashed: boolean) => {
    let previous = false;
    const path = values.map((v, i) => {
      if (v === undefined || !Number.isFinite(v)) { previous = false; return ""; }
      const segment = `${previous ? "L" : "M"}${x(i).toFixed(2)},${y(v).toFixed(2)}`;
      previous = true;
      return segment;
    }).join(" ");
    const dots = values.map((v, i) => v === undefined || !Number.isFinite(v) ? "" :
      `<circle cx="${x(i)}" cy="${y(v)}" r="${dashed ? 4 : 2.5}" fill="${color}"><title>${label} · hora ${i + 1}: ${format(v)} ${unit}</title></circle>`).join("");
    return `<path d="${path}" fill="none" stroke="${color}" stroke-width="2.5" ${dashed ? 'stroke-dasharray="8 5"' : ""}/>${dots}`;
  };
  const ticks = Array.from({ length: 5 }, (_, i) => {
    const v = lo + (hi - lo) * i / 4;
    return `<line x1="${left}" y1="${y(v)}" x2="${width - right}" y2="${y(v)}" stroke="#34465a"/><text x="${left - 6}" y="${y(v) + 4}" text-anchor="end">${format(v)}</text>`;
  }).join("");
  const hours = [0, 3, 7, 11, 15, 19, 23].map(i => `<text x="${x(i)}" y="${height - 8}" text-anchor="middle">${i + 1} h</text>`).join("");
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${title}" style="width:100%;display:block;font:11px system-ui;fill:#c6d6e8">${ticks}${hours}<text x="${left}" y="14">${unit}</text>${series(plc, percentage ? "#c4b8ff" : "#ff9b62", percentage ? "Error relativo" : "Planta Real", !percentage)}${percentage ? "" : series(fractal, "#56b4ff", "Fractal", false)}</svg>`;
}

export function mountComparisons(): void {
  const select = document.getElementById("comparison-scenario") as HTMLSelectElement;
  const root = document.getElementById("comparison-charts")!;
  const render = () => {
    const report = reports[select.value];
    const e = report.emulator.hourly, f = report.fractal.hourly;
    if (e.length !== 24 || f.length !== 24 || e.some((row, i) => row.t_s !== f[i].end_t_s)) {
      root.textContent = "Evidencia incompleta o tiempos no alineados; no se muestran curvas.";
      return;
    }
    const panels: string[] = [];
    const add = (title: string, unit: string, getter: (row: Row) => Reading) => {
      const a = e.map(getter), b = f.map(getter);
      if (a.some(v => v === undefined) || b.some(v => v === undefined)) {
        panels.push(`<article class="panel"><h3>${title}</h3><p>Pendiente: no registrado en esta evidencia. No se extrapola.</p></article>`);
        return;
      }
      const delta = a.map((v, i) => v === undefined || v === 0 || b[i] === undefined ? undefined : 100 * (b[i]! - v) / v);
      const undefinedCount = delta.filter(v => v === undefined).length;
      panels.push(`<article class="panel"><h3>${title}</h3>${plot(title, unit, a, b)}<p>Diferencia relativa Fractal − Planta Real (%)${undefinedCount ? ` · ${undefinedCount} horas sin porcentaje definido` : ""}</p>${plot(`Diferencia relativa · ${title}`, "%", delta, [], true)}</article>`);
    };
    add("Presión de entrada PRS", "mca", r => r.prs_inlet_mca);
    add("Presión de salida PRS", "mca", r => r.prs_outlet_mca);
    if (select.value === "fixed") add("Presión mínima entre las 64 viviendas", "mca", r => r.minimum_dwelling_pressure_mca);
    else for (let level = 1; level <= 4; level++) {
      add(`Presión mínima · piso ${level}`, "mca", row => {
        if (row.floor_minimum_pressure_mca) return row.floor_minimum_pressure_mca[`L${level}`];
        const nominal = row.scenario_results?.find(s => s.demand_factor === 1);
        const values = Object.entries(nominal?.consumer_pressures_mca ?? {}).filter(([key]) => key.startsWith(`L${level}.`)).map(([, v]) => v);
        return values.length ? Math.min(...values) : undefined;
      });
    }
    const flows: [string, string][] = [
      ["pump_supply_outlet", "Salida bomba de alimentación"], ["prs_outlet", "Salida estación reguladora"],
      ...[1, 2, 3, 4].map(level => [ `floor_${level}_local`, `Caudal local · piso ${level}` ] as [string, string]),
      ["supply_tank_inlet", "Entrada tanque de alimentación · recirculación"],
    ];
    for (const [key, label] of flows) add(label, "m³/h", r => r.flows_m3h?.[key]);
    for (const [key, label] of [["tank-supply-01", "Alimentación"], ["tank-recirc-01", "Retorno 1"], ["tank-recirc-02", "Retorno 2"]]) {
      add(`Nivel · ${label}`, "% de capacidad", r => r.tank_levels_pct?.[key]);
    }
    root.innerHTML = panels.join("");
  };
  select.addEventListener("change", render);
  render();
}
