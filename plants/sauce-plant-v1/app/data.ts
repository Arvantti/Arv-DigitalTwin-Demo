/**
 * Datos de la planta de salsas para el navegador: los mismos YAML y JSON que lee el cosimulador en Node.
 *
 * Si en CONFIGURACIÓN se activó otra versión (store.ts), los productos, la cartera y la secuencia del planificador salen
 * de esa versión; si no, de la precargada. Así el APS, el emulador, el centro de control y el 3D usan los mismos datos.
 */
import yaml from "js-yaml";
import type { CustomerOrders, ManualSequence } from "@twin/cosim-core";
import type { SauceData } from "@plants/sauce-plant-v1-cosim/model.ts";
import { activeConfig, type SauceConfig } from "./store.ts";
import productsYaml from "../catalog/products.yaml?raw";
import toolingYaml from "../catalog/tooling.yaml?raw";
import demandYaml from "../catalog/demand.yaml?raw";
import changeoversYaml from "../catalog/changeovers.yaml?raw";
import setupYaml from "../catalog/setup.yaml?raw";
import apsYaml from "../aps/aps.yaml?raw";
import plantYaml from "../plant.yaml?raw";
import portfolioJson from "../orders/cartera-2026-11.json?raw";
import manualJson from "../aps/plans/APS-MAN-01.json?raw";

/** Catálogo precargado, sin la configuración activa. */
export const baseSauceData = (): SauceData => ({
  plant: "sauce-plant-v1",
  products: yaml.load(productsYaml) as SauceData["products"],
  tooling: yaml.load(toolingYaml) as SauceData["tooling"],
  demand: yaml.load(demandYaml) as SauceData["demand"],
  changeovers: yaml.load(changeoversYaml) as SauceData["changeovers"],
  aps: yaml.load(apsYaml) as SauceData["aps"],
  setup: yaml.load(setupYaml) as SauceData["setup"],
  layout: yaml.load(plantYaml) as SauceData["layout"],
});

/** Cartera precargada (CART-2026-11) y la secuencia del planificador (APS-MAN-01). */
export const basePortfolio = (): CustomerOrders => JSON.parse(portfolioJson) as CustomerOrders;
export const baseManual = (): ManualSequence => JSON.parse(manualJson) as ManualSequence;

/** Aplica una configuración al catálogo: SKU nuevos y quitados, y las llenadoras de cada SKU. */
export function applyConfig(data: SauceData, cfg: SauceConfig | null): SauceData {
  if (!cfg) return data;
  const products = data.products.products.filter((p) => !cfg.removed_products.includes(p.id));
  for (const n of cfg.new_products) {
    const base = data.products.products.find((p) => p.id === n.base);
    if (base) products.push({ ...structuredClone(base), id: n.id, name: n.name });
  }
  const lots = { ...data.aps.aps.lots };
  for (const n of cfg.new_products) if (lots[n.base]) lots[n.id] = lots[n.base];
  let multipurpose = data.aps.aps.multipurpose;
  for (const p of products) {
    const list = cfg.fillers[p.id];
    if (!list?.length || p.kind !== "finished") continue;
    p.routing = p.routing.map((r) => (r.stage === "llenado" ? { ...r, equipment: [...list] } : r));
    // Las llenadoras del SKU son exactamente las asignadas: ya no entra como multipropósito en otra.
    multipurpose = Object.fromEntries(Object.entries(multipurpose ?? {}).map(([m, ids]) => [m, ids.filter((x) => x !== p.id)]));
  }
  return { ...data, products: { products }, aps: { aps: { ...data.aps.aps, lots, multipurpose } } };
}

/** Datos de la planta con la configuración activa. */
export const sauceData = (): SauceData => applyConfig(baseSauceData(), activeConfig());

/** La configuración en forma de cartera y secuencia del planificador. */
export function configPortfolio(cfg: SauceConfig): CustomerOrders {
  return { ...basePortfolio(), portfolio_id: `CART-2026-11·${cfg.id}`, orders: cfg.orders };
}
export function configManual(cfg: SauceConfig): ManualSequence {
  return {
    ...baseManual(),
    plan_id: `APS-MAN-${cfg.id}`,
    portfolio_id: `CART-2026-11·${cfg.id}`,
    author: "planificador (configuración manual)",
    note: cfg.keep_order ? "Secuencia del planificador en el orden que puso en cada llenadora." : "Llenadoras asignadas por el planificador; cada línea por orden de llegada.",
    sequence: cfg.sequence,
    ...(cfg.keep_order ? { keep_order: true } : {}),
  } as ManualSequence;
}

/** Cartera de la demo y secuencia del planificador (de la configuración activa, o las precargadas). */
export const demoPortfolio = (): CustomerOrders => {
  const cfg = activeConfig();
  return cfg ? configPortfolio(cfg) : basePortfolio();
};
export const demoManual = (): ManualSequence => {
  const cfg = activeConfig();
  return cfg ? configManual(cfg) : baseManual();
};

/** Equipos de la planta con sus parámetros (para los rótulos del Gantt). */
export const layoutEquipment = (): { id: string; params?: Record<string, unknown> }[] => (yaml.load(plantYaml) as SauceData["layout"]).equipment;
