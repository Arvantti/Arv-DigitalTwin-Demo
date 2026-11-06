/** Datos de la planta leídos del disco (scripts y pruebas en Node). */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import type { SauceData } from "./model.ts";

/** Carpeta de la planta (plants/sauce-plant-v1/), con barra final. */
export const PLANT_DIR = fileURLToPath(new URL("../", import.meta.url));
const read = (path: string) => yaml.load(readFileSync(`${PLANT_DIR}${path}`, "utf8"));

export const fsData = (): SauceData => ({
  plant: "sauce-plant-v1",
  products: read("catalog/products.yaml") as SauceData["products"],
  tooling: read("catalog/tooling.yaml") as SauceData["tooling"],
  demand: read("catalog/demand.yaml") as SauceData["demand"],
  changeovers: read("catalog/changeovers.yaml") as SauceData["changeovers"],
  aps: read("aps/aps.yaml") as SauceData["aps"],
  setup: read("catalog/setup.yaml") as SauceData["setup"],
  layout: read("plant.yaml") as SauceData["layout"],
});

export const json = (x: unknown) => `${JSON.stringify(x, null, 1)}\n`;
