/** Cosimulador de la planta de salsas: modelo, cartera, plan manual, despacho y programa lineal. */
export { buildModel, type SauceData, type SauceModel } from "./model.ts";
export { inventPortfolio } from "./portfolio.ts";
export { manualPlan, manualSequence } from "./manual.ts";
export { context, dispatch, toPlan } from "./plan.ts";
export { solve, type HighsLike, type SolveOptions } from "./solve.ts";
