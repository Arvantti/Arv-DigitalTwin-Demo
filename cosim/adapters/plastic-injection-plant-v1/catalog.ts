/**
 * Catálogo de la planta tal como está en industrial-models (fuente única): Vite lo incluye en el paquete del
 * navegador como texto y aquí se lee con js-yaml. Así el cosimulador no depende de ninguna API.
 */
import yaml from "js-yaml";
import products from "../../../industrial-models/plastic-injection-plant-v1/catalog/products.yaml?raw";
import tooling from "../../../industrial-models/plastic-injection-plant-v1/catalog/tooling.yaml?raw";
import setup from "../../../industrial-models/plastic-injection-plant-v1/catalog/setup.yaml?raw";
import demand from "../../../industrial-models/plastic-injection-plant-v1/catalog/demand.yaml?raw";
import materials from "../../../industrial-models/plastic-injection-plant-v1/catalog/materials.yaml?raw";
import changeovers from "../../../industrial-models/plastic-injection-plant-v1/catalog/changeovers.yaml?raw";
import aps from "../../../industrial-models/plastic-injection-plant-v1/aps/aps.yaml?raw";
import portfolio from "../../../industrial-models/plastic-injection-plant-v1/orders/cartera-2026-11.json";
import manual from "../../../industrial-models/plastic-injection-plant-v1/aps/plans/APS-MAN-01.json";
import type { CustomerOrders } from "../../core/contracts.ts";
import type { ManualPlan } from "./manual.ts";
import { buildModel, type CatalogData } from "./model.ts";

export const catalogData = (): CatalogData => ({
  products: yaml.load(products) as CatalogData["products"],
  tooling: yaml.load(tooling) as CatalogData["tooling"],
  setup: yaml.load(setup) as CatalogData["setup"],
  demand: yaml.load(demand) as CatalogData["demand"],
  aps: yaml.load(aps) as CatalogData["aps"],
  materials: yaml.load(materials) as CatalogData["materials"],
  changeovers: yaml.load(changeovers) as CatalogData["changeovers"],
});
export const plasticsModel = () => buildModel(catalogData());
export const basePortfolio = portfolio as CustomerOrders;
export const baseManual = manual as ManualPlan;
