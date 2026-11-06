/**
 * Inventa la cartera de la demo y la secuencia manual del planificador, y las guarda en plants/sauce-plant-v1.
 * Uso: pnpm --filter @plants/sauce-plant-v1-cosim make-portfolio
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { DEMO } from "../demo.ts";
import { fsData, json, PLANT_DIR } from "../fs-data.ts";
import { manualSequence } from "../manual.ts";
import { buildModel } from "../model.ts";
import { inventPortfolio } from "../portfolio.ts";

const model = buildModel(fsData());
const portfolio = inventPortfolio(model, DEMO);
mkdirSync(`${PLANT_DIR}orders`, { recursive: true });
writeFileSync(`${PLANT_DIR}orders/cartera-2026-11.json`, json(portfolio));
const manual = manualSequence(model, portfolio);
mkdirSync(`${PLANT_DIR}aps/plans`, { recursive: true });
writeFileSync(`${PLANT_DIR}aps/plans/APS-MAN-01.json`, json(manual));
console.log(`${portfolio.orders.length} pedidos; secuencia en ${Object.keys(manual.sequence).length} llenadoras`);
