/** Datos de la planta de salsas para el navegador: los mismos YAML y JSON que lee el cosimulador en Node. */
import yaml from "js-yaml";
import type { CustomerOrders, ManualSequence } from "@twin/cosim-core";
import type { SauceData } from "@plants/sauce-plant-v1-cosim/model.ts";
import productsYaml from "../catalog/products.yaml?raw";
import toolingYaml from "../catalog/tooling.yaml?raw";
import demandYaml from "../catalog/demand.yaml?raw";
import changeoversYaml from "../catalog/changeovers.yaml?raw";
import setupYaml from "../catalog/setup.yaml?raw";
import apsYaml from "../aps/aps.yaml?raw";
import plantYaml from "../plant.yaml?raw";
import portfolioJson from "../orders/cartera-2026-11.json?raw";
import manualJson from "../aps/plans/APS-MAN-01.json?raw";

export const sauceData = (): SauceData => ({
  plant: "sauce-plant-v1",
  products: yaml.load(productsYaml) as SauceData["products"],
  tooling: yaml.load(toolingYaml) as SauceData["tooling"],
  demand: yaml.load(demandYaml) as SauceData["demand"],
  changeovers: yaml.load(changeoversYaml) as SauceData["changeovers"],
  aps: yaml.load(apsYaml) as SauceData["aps"],
  setup: yaml.load(setupYaml) as SauceData["setup"],
  layout: yaml.load(plantYaml) as SauceData["layout"],
});

/** Cartera de la demo (CART-2026-11) y la secuencia del planificador (APS-MAN-01). */
export const demoPortfolio = (): CustomerOrders => JSON.parse(portfolioJson) as CustomerOrders;
export const demoManual = (): ManualSequence => JSON.parse(manualJson) as ManualSequence;

/** Equipos de la planta con sus parámetros (para los rótulos del Gantt). */
export const layoutEquipment = (): { id: string; params?: Record<string, unknown> }[] => (yaml.load(plantYaml) as SauceData["layout"]).equipment;
