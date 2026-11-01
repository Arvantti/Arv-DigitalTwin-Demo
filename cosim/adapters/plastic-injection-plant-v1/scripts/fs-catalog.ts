/** Catálogo leído del disco (pruebas y scripts en Node). */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import type { CatalogData } from "../model.ts";

export const MODEL_DIR = fileURLToPath(new URL("../../../../industrial-models/plastic-injection-plant-v1/", import.meta.url));
const read = (name: string) => yaml.load(readFileSync(`${MODEL_DIR}catalog/${name}.yaml`, "utf8"));

export const fsCatalog = (): CatalogData => ({
  products: read("products") as CatalogData["products"],
  tooling: read("tooling") as CatalogData["tooling"],
  setup: read("setup") as CatalogData["setup"],
  demand: read("demand") as CatalogData["demand"],
  aps: yaml.load(readFileSync(`${MODEL_DIR}aps/aps.yaml`, "utf8")) as CatalogData["aps"],
});
