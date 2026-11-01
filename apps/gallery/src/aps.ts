/**
 * APS de la planta de plásticos en el panel lateral del gemelo 3D: el enlace a la pantalla completa del APS
 * (aps.html: pedidos, CALCULAR con el cosimulador y Gantt).
 *
 * La tabla de órdenes es la de schedule.ts, alimentada con la programación vigente de aps-store.ts. Si el APS cambia
 * la vigente en otra ventana, el gemelo se entera al instante.
 */
import type { PlanDoc } from "./schedule.ts";
import { buildSchedule } from "./schedule.ts";
import { onChange, SOURCE_NAMES, vigente } from "./aps-store.ts";

interface Options {
  plantId: string;
  select: (id: string) => void;
  showProduct?: (id: string) => void;
}

export function buildAps(opts: Options): void {
  let current = vigente();
  const section = document.createElement("div");
  section.id = "aps-section";
  document.getElementById("schedule-section")!.before(section);

  const schedule = buildSchedule({
    plantId: opts.plantId,
    select: opts.select,
    showProduct: opts.showProduct,
    provider: () => ({ plan: current as unknown as PlanDoc, label: `${SOURCE_NAMES[current.source]} ${current.plan_id}` }),
  });

  section.innerHTML = `
    <h3>APS <span class="dim">· pedidos y programación</span></h3>
    <div class="sim-controls"><a class="btn-link" href="/aps.html" target="_blank" rel="noopener">▦ ABRIR APS · PEDIDOS Y GANTT</a></div>`;
  onChange(() => {
    current = vigente();
    schedule.refresh();
  });
}
