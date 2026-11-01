/**
 * INSUMOS del APS de plásticos: lo que hace falta para cumplir la programación en la semana que empieza hoy.
 *
 * - Resina por material: unidades / cavidades × peso de la inyección con colada (`shot_kg` del molde).
 * - Masterbatch por color: la dosificación del catálogo sobre la resina del trabajo.
 * - Horas de máquina, turnos-máquina (8 h) y cambios de color por recurso.
 * - Horas de operario: las de la ruta (ensamble) y, en inyección, un operario cada 4 inyectoras con orden (supuesto).
 *
 * Un trabajo que cruza el borde de la ventana o de un día se reparte por su tiempo de trabajo. Todo es supuesto,
 * como el catálogo del que sale.
 */
import yaml from "js-yaml";
import type { PlanScheduleRow, ProductionPlan } from "@twin/cosim/core/contracts.ts";
import toolingYaml from "../../../industrial-models/plastic-injection-plant-v1/catalog/tooling.yaml?raw";
import materialsYaml from "../../../industrial-models/plastic-injection-plant-v1/catalog/materials.yaml?raw";
import productsYaml from "../../../industrial-models/plastic-injection-plant-v1/catalog/products.yaml?raw";
import { model, now } from "./aps-store.ts";
import { esc, nf } from "./schedule.ts";

interface Tool {
  id: string;
  product: string;
  material: string;
  cavities: number;
  shot_kg: number;
}
interface Material {
  id: string;
  name: string;
  kind: "resin" | "masterbatch";
  dosage_pct?: number;
  color?: string;
}
interface Product {
  id: string;
  name: string;
  routing: { stage: string; equipment: string[]; operators?: number }[];
}

const tools = (yaml.load(toolingYaml) as { tooling: Tool[] }).tooling;
const materials = (yaml.load(materialsYaml) as { materials: Material[] }).materials;
const products = (yaml.load(productsYaml) as { products: Product[] }).products;
const toolOf = (product: string) => tools.find((t) => t.product === product);
const matOf = (id?: string) => materials.find((m) => m.id === id);

const MIN = (iso: string) => Date.parse(`${iso.slice(0, 16)}:00Z`) / 60000;
const WD = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
/** Inyectoras que atiende un operario (supuesto). */
const IMM_PER_OPERATOR = 4;

interface Need {
  resin: Map<string, number[]>;
  mb: Map<string, number[]>;
  units: Map<string, number[]>;
  machineH: Map<string, number[]>;
  changeH: Map<string, number>;
  operatorH: number[];
}

/** Fracción del trabajo de una fila que cae entre a y b (por tiempo de trabajo). */
function share(r: PlanScheduleRow, a: number, b: number): number {
  const s = MIN(r.start);
  const e = MIN(r.end);
  const total = model.calendar.workBetween(s, e);
  if (total <= 0) return 0;
  return model.calendar.workBetween(Math.max(s, a), Math.min(e, b)) / total;
}

function needs(plan: ProductionPlan, days: number[]): Need {
  const n: Need = { resin: new Map(), mb: new Map(), units: new Map(), machineH: new Map(), changeH: new Map(), operatorH: days.map(() => 0) };
  const add = (m: Map<string, number[]>, k: string, i: number, v: number) => {
    if (!m.has(k)) m.set(k, days.map(() => 0));
    m.get(k)![i] += v;
  };
  const from = days[0];
  const to = days[days.length - 1] + 1440;
  for (const r of plan.schedule) {
    if (MIN(r.end) <= from || MIN(r.start) >= to) continue;
    const tool = toolOf(r.product);
    const resin = tool ? matOf(tool.material) : undefined;
    const mb = matOf(r.color);
    const ops = products.find((p) => p.routing.some((s) => s.stage === r.stage && s.equipment.includes(r.equipment)))?.routing.find((s) => s.stage === r.stage)?.operators;
    days.forEach((d, i) => {
      const f = share(r, d, d + 1440);
      if (f <= 0) return;
      const q = r.quantity * f;
      add(n.units, r.product, i, q);
      const h = model.calendar.workBetween(Math.max(MIN(r.start), d), Math.min(MIN(r.end), d + 1440)) / 60;
      add(n.machineH, r.equipment, i, h);
      if (tool && resin) {
        const kg = (q / tool.cavities) * tool.shot_kg;
        add(n.resin, resin.id, i, kg);
        if (mb?.kind === "masterbatch") add(n.mb, mb.id, i, (kg * (mb.dosage_pct ?? 0)) / 100);
        n.operatorH[i] += h / IMM_PER_OPERATOR;
      } else n.operatorH[i] += h * (ops ?? 1);
    });
    // Cambio de color: cuenta en la ventana si el trabajo empieza en ella.
    const s = MIN(r.start);
    if (r.changeover_min > 0 && s >= from && s < to) n.changeH.set(r.equipment, (n.changeH.get(r.equipment) ?? 0) + r.changeover_min / 60);
  }
  return n;
}

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
const kg = (x: number) => (x >= 100 ? nf(x, 0) : nf(x, 1));

export function renderInsumos(el: HTMLElement, plan: ProductionPlan): void {
  const start = Math.floor(MIN(now()) / 1440) * 1440;
  const days: number[] = [];
  for (let d = start; d < start + 7 * 1440; d += 1440) if (model.calendar.isWorkday(d)) days.push(d);
  const n = needs(plan, days);
  const head = days.map((d) => {
    const dt = new Date(d * 60000);
    return `<th class="num">${WD[dt.getUTCDay()]} ${dt.getUTCDate()}</th>`;
  });
  const row = (name: string, vals: number[], fmt: (x: number) => string, extra = "") =>
    `<tr><td>${name}</td>${vals.map((v) => `<td class="num">${v ? fmt(v) : "—"}</td>`).join("")}<td class="num"><b>${fmt(sum(vals))}</b></td>${extra}</tr>`;
  const resinKg = sum([...n.resin.values()].map(sum));
  const mbKg = sum([...n.mb.values()].map(sum));
  const machH = sum([...n.machineH.values()].map(sum));
  const opH = sum(n.operatorH);
  const shiftH = model.calendar.spans.reduce((s, [a, b]) => s + (b - a), 0) / 60 / model.calendar.spans.length;
  const machines = [...n.machineH.keys()].sort();
  const label = (m: string) => m.replace("assembly-", "ENSAMBLE-").toUpperCase();
  const kpi = (v: string, l: string) => `<div class="aps-kpi"><b>${v}</b><small>${l}</small></div>`;

  el.innerHTML = `
    <div class="aps-orders-head">
      ${kpi(`${kg(resinKg)} kg`, "resina · semana")}
      ${kpi(`${kg(mbKg)} kg`, "masterbatch · semana")}
      ${kpi(`${nf(machH, 0)} h`, `máquina · ${machines.length} recursos`)}
      ${kpi(nf(machH / shiftH, 0), `turnos-máquina de ${nf(shiftH, 0)} h`)}
      ${kpi(`${nf(opH, 0)} h`, `operario · ${nf(opH / shiftH, 0)} turnos-persona`)}
    </div>
    <p class="dim small">Lo que pide la programación <b>${esc(plan.plan_id)}</b> en la semana que empieza hoy (${days.length} días con turnos). Resina = unidades / cavidades × peso de la inyección con colada; masterbatch = dosificación del catálogo sobre esa resina; en inyección, un operario cada ${IMM_PER_OPERATOR} inyectoras con orden. Valores supuestos del catálogo.</p>
    <h3 class="aps-h3">MATERIA PRIMA (kg)</h3>
    <div class="aps-table-wrap"><table class="route-table aps-table">
      <thead><tr><th>Material</th>${head.join("")}<th class="num">Semana</th></tr></thead>
      <tbody>
        ${[...n.resin.entries()].map(([id, v]) => row(esc(matOf(id)?.name ?? id), v, kg)).join("")}
        ${[...n.mb.entries()].map(([id, v]) => row(`<span class="swatch" style="background:${matOf(id)?.color ?? "#888"}"></span>${esc(matOf(id)?.name ?? id)}`, v, kg)).join("")}
      </tbody>
    </table></div>
    <h3 class="aps-h3">PRODUCCIÓN (unidades)</h3>
    <div class="aps-table-wrap"><table class="route-table aps-table">
      <thead><tr><th>Producto</th>${head.join("")}<th class="num">Semana</th></tr></thead>
      <tbody>${[...n.units.entries()].map(([id, v]) => row(esc(products.find((p) => p.id === id)?.name ?? id), v, (x) => nf(Math.round(x)))).join("")}</tbody>
    </table></div>
    <h3 class="aps-h3">HORAS DE MÁQUINA Y OPERARIOS</h3>
    <div class="aps-table-wrap"><table class="route-table aps-table">
      <thead><tr><th>Recurso</th>${head.join("")}<th class="num">Semana</th><th class="num">Turnos</th><th class="num">Cambios de color</th></tr></thead>
      <tbody>
        ${machines.map((m) => row(label(m), n.machineH.get(m)!, (x) => nf(x, 1), `<td class="num">${nf(sum(n.machineH.get(m)!) / shiftH, 1)}</td><td class="num">${n.changeH.get(m) ? `${nf(n.changeH.get(m)!, 1)} h` : "—"}</td>`)).join("")}
        ${row("<b>Operarios (h)</b>", n.operatorH, (x) => nf(x, 1), `<td class="num">${nf(opH / shiftH, 1)}</td><td></td>`)}
      </tbody>
    </table></div>`;
}
