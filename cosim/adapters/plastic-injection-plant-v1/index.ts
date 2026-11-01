/** Adaptador del cosimulador para plastic-injection-plant-v1 (ver cosim/README.md). */
export { buildModel, PLANT_ID, type PlasticsModel } from "./model.ts";
export { inventPortfolio } from "./portfolio.ts";
export { manualPlan, type ManualPlan } from "./manual.ts";
export { solve, buildLp, type HighsLike } from "./solve.ts";
