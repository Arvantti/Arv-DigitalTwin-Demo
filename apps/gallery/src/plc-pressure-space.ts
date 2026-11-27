export type PressureSample = { t: number; point: number; source: number; pressure: number };
export const PRESSURE_POINTS = ["Salida de bombeo", "Salida VRP", "Salida piso 1", "Salida piso 2", "Salida piso 3", "Salida piso 4", "Presión crítica"];
const colors = ["#4ea7ff", "#55d58c", "#f4b56c"];
const labels = ["Emulador (Real)", "Cosimulado", "Optimizado"];
let yaw = -28, pitch = 24;
const enabled = [true, true, true];

type Projected = [number, number];

/**
 * Superficie perspectiva SVG de las lecturas publicadas.
 * No interpola: solo dibuja una celda cuando existen sus cuatro vértices exactos.
 */
export function mountPressureSpace(host: HTMLElement, samples: PressureSample[]): void {
  host.innerHTML = `<article class="panel pressure-space"><div class="section-head"><div><p class="eyebrow">ESPACIO HIDRÁULICO · MISMA COMPARACIÓN</p><h2>Presión × hora × punto de la red</h2><p class="muted">X: hora · Y: presión (mca) · Z: punto de la red. Arrastre para rotar; pulse una superficie o lectura para consultar sus valores. No se interpolan datos faltantes.</p></div></div><div class="controls"><div class="pressure-space-sources">${labels.map((label,i)=>`<button type="button" data-space-source="${i}" aria-pressed="${enabled[i]}" style="--source-color:${colors[i]}">${label}</button>`).join("")}</div><label>Giro<input data-space-yaw type="range" min="-120" max="120" value="${yaw}" /></label><label>Elevación<input data-space-pitch type="range" min="5" max="75" value="${pitch}" /></label></div><div class="pressure-space-scroll"><svg viewBox="0 0 1100 570" role="img" aria-label="Gráfica tridimensional de presión, hora y punto de red"></svg></div><p class="step-note" data-space-status></p><p class="pressure-space-selection" data-space-selection>Pulse una lectura o una celda para ver sus valores.</p></article>`;
  const svg = host.querySelector<SVGSVGElement>("svg")!;
  const status = host.querySelector<HTMLElement>("[data-space-status]")!;
  const selection = host.querySelector<HTMLElement>("[data-space-selection]")!;
  let dragging = false;
  let moved = false;
  let startX = 0, startY = 0, startYaw = yaw, startPitch = pitch;
  const bySourceTimePoint = new Map<string, PressureSample>();
  for (const sample of samples) bySourceTimePoint.set(`${sample.source}|${sample.t}|${sample.point}`, sample);
  const sampleAt = (source: number, t: number, point: number) => bySourceTimePoint.get(`${source}|${t}|${point}`);
  const formatSample = (sample: PressureSample) => `${labels[sample.source]} · ${sample.t / 3600 < 0.005 ? "00:00" : `${(sample.t / 3600).toFixed(2)} h`} · ${PRESSURE_POINTS[sample.point]} · ${sample.pressure.toFixed(2)} mca`;
  const showSelection = (sample: PressureSample, extra?: PressureSample) => {
    selection.textContent = extra ? `${formatSample(sample)} · siguiente ${extra.pressure.toFixed(2)} mca` : formatSample(sample);
  };
  const draw = () => {
    const maxT = Math.max(3600, ...samples.map(s => s.t));
    const maxP = Math.max(10, ...samples.map(s => s.pressure)) * 1.1;
    const a = yaw * Math.PI / 180, b = pitch * Math.PI / 180;
    const project = (t: number, p: number, z: number): Projected => {
      const x = (t / maxT - .5) * 580, y = (p / maxP) * 260, depth = (z / 6 - .5) * 290;
      const xr = x * Math.cos(a) + depth * Math.sin(a), zr = -x * Math.sin(a) + depth * Math.cos(a);
      return [550 + xr, 365 - y * Math.cos(b) + zr * Math.sin(b)];
    };
    const line = (from: Projected, to: Projected, stroke = "#46576b") => `<path d="M${from.join(",")}L${to.join(",")}" stroke="${stroke}" fill="none"/>`;
    const text = (point: Projected, value: string, anchor = "middle") => `<text x="${point[0]}" y="${point[1]}" text-anchor="${anchor}" fill="#dcecff" font-size="11">${value}</text>`;
    let grid = "";
    for (let point = 0; point < 7; point++) { grid += line(project(0, 0, point), project(maxT, 0, point)); const end = project(maxT, 0, point); grid += text([end[0] + 12, end[1] + 4], PRESSURE_POINTS[point], "start"); }
    for (let i = 0; i <= 4; i++) { const t = maxT * i / 4; grid += line(project(t, 0, 0), project(t, 0, 6)); const xt = project(t, 0, 0); grid += text([xt[0], xt[1] + 22], `${(t / 3600).toFixed(2)} h`); const pressure = maxP * i / 4; grid += line(project(0, pressure, 0), project(maxT, pressure, 0), "#334155"); const yp = project(0, pressure, 0); grid += text([yp[0] - 12, yp[1]], pressure.toFixed(2), "end"); }
    grid += line(project(0, 0, 0), project(0, maxP, 0), "#dcecff") + text(project(0, maxP * 1.08, 0), "Y · Presión (mca)") + text([550, 545], "X · Hora") + text([1010, 535], "Z · Punto de red", "start");
    const visible = samples.filter(sample => enabled[sample.source]);
    const times = [...new Set(visible.map(sample => sample.t))].sort((a, b) => a - b);
    let surfaces = "";
    for (const source of [0, 1, 2]) {
      if (!enabled[source]) continue;
      for (let ti = 0; ti + 1 < times.length; ti++) {
        const t = times[ti], nextT = times[ti + 1];
        for (let point = 0; point < 6; point++) {
          const left = sampleAt(source, t, point), right = sampleAt(source, t, point + 1), next = sampleAt(source, nextT, point), nextRight = sampleAt(source, nextT, point + 1);
          if (!left || !right || !next || !nextRight) continue;
          const corners = [project(left.t, left.pressure, left.point), project(right.t, right.pressure, right.point), project(nextRight.t, nextRight.pressure, nextRight.point), project(next.t, next.pressure, next.point)];
          const metadata = `${source}|${t}|${point}`;
          surfaces += `<polygon class="pressure-space-surface" data-space-cell="${metadata}" points="${corners.map(c => c.join(",")).join(" ")}" fill="${colors[source]}" fill-opacity=".16" stroke="${colors[source]}" stroke-opacity=".42" stroke-width="1"><title>${labels[source]} · ${PRESSURE_POINTS[point]} → ${PRESSURE_POINTS[point + 1]} · ${(t / 3600).toFixed(2)}–${(nextT / 3600).toFixed(2)} h</title></polygon>`;
        }
      }
    }
    const dots = visible.map(sample => { const point = project(sample.t, sample.pressure, sample.point); return `<circle class="pressure-space-point" data-space-sample="${sample.source}|${sample.t}|${sample.point}" cx="${point[0]}" cy="${point[1]}" r="3.2" fill="${colors[sample.source]}" stroke="#07132a" stroke-width="1"><title>${formatSample(sample)}</title></circle>`; }).join("");
    svg.innerHTML = grid + surfaces + dots;
    status.textContent = labels.map((label, i) => `${label}: ${samples.some(sample => sample.source === i) ? `${samples.filter(sample => sample.source === i).length} lecturas · ${samples.filter(sample => sample.source === i && enabled[i]).length} visibles` : "— sin datos"}`).join(" · ");
    svg.querySelectorAll<SVGElement>("[data-space-sample]").forEach(node => node.addEventListener("click", event => { if (moved) return; const [source, t, point] = node.dataset.spaceSample!.split("|").map(Number); const sample = sampleAt(source, t, point); if (sample) showSelection(sample); event.stopPropagation(); }));
    svg.querySelectorAll<SVGElement>("[data-space-cell]").forEach(node => node.addEventListener("click", event => { if (moved) return; const [source, t, point] = node.dataset.spaceCell!.split("|").map(Number); const first = sampleAt(source, t, point), next = sampleAt(source, t, point + 1); if (first && next) showSelection(first, next); event.stopPropagation(); }));
  };
  svg.addEventListener("pointerdown", event => { dragging = true; moved = false; startX = event.clientX; startY = event.clientY; startYaw = yaw; startPitch = pitch; svg.setPointerCapture(event.pointerId); });
  svg.addEventListener("pointermove", event => { if (!dragging) return; const dx = event.clientX - startX, dy = event.clientY - startY; if (Math.abs(dx) + Math.abs(dy) > 3) moved = true; yaw = Math.max(-120, Math.min(120, startYaw + dx * .35)); pitch = Math.max(5, Math.min(75, startPitch - dy * .25)); const yawInput = host.querySelector<HTMLInputElement>("[data-space-yaw]")!, pitchInput = host.querySelector<HTMLInputElement>("[data-space-pitch]")!; yawInput.value = String(Math.round(yaw)); pitchInput.value = String(Math.round(pitch)); draw(); });
  svg.addEventListener("pointerup", event => { dragging = false; svg.releasePointerCapture(event.pointerId); window.setTimeout(() => { moved = false; }, 0); });
  svg.addEventListener("pointercancel", () => { dragging = false; });
  host.querySelectorAll<HTMLButtonElement>("[data-space-source]").forEach(button => button.onclick = () => { const i = Number(button.dataset.spaceSource); enabled[i] = !enabled[i]; button.setAttribute("aria-pressed", String(enabled[i])); draw(); });
  host.querySelectorAll<HTMLInputElement>("input").forEach(input => input.oninput = () => { yaw = Number(host.querySelector<HTMLInputElement>("[data-space-yaw]")!.value); pitch = Number(host.querySelector<HTMLInputElement>("[data-space-pitch]")!.value); draw(); });
  draw();
}
