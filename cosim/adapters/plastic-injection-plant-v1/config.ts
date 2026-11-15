/**
 * Configuración cargada a mano en el APS de plásticos (pestaña ⚙ CONFIGURACIÓN): la cartera de pedidos, qué molde
 * lleva cada inyectora y la secuencia del planificador. Es una foto completa, sin historial de cambios.
 *
 * Aquí solo está la parte pura: aplicar una configuración al catálogo, a la cartera y a la secuencia manual, y validar
 * un montaje. Guardar versiones y activar una en la planta es del navegador (apps/gallery/src/aps-store.ts).
 */
import type { CustomerOrder, CustomerOrders } from "../../core/contracts.ts";
import type { ManualPlan } from "./manual.ts";
import { moldFitProblem, type CatalogData } from "./model.ts";

export interface PlasticsConfig {
  contract: "plastics-config.v1";
  /** "PRECARGADA" para la de la demo; CFG-01, CFG-02… para las guardadas. */
  id: string;
  name: string;
  /** Instante de la planta en que se guardó ("" en la precargada). */
  saved_at: string;
  /** La cartera completa (pedidos entregados incluidos). */
  orders: CustomerOrder[];
  /** Montajes cambiados respecto a catalog/setup.yaml: máquina → molde, o null si queda sin molde. */
  molds: Record<string, string | null>;
  /** Por máquina, los pedidos en el orden en que se van a producir (como aps/plans/APS-MAN-*.json). */
  sequence: Record<string, string[]>;
}

export const PRELOADED = "PRECARGADA";

/** La configuración precargada de la demo: cartera CART-2026-11, montaje de setup.yaml y secuencia APS-MAN-01. */
export function preloadedConfig(portfolio: CustomerOrders, manual: ManualPlan): PlasticsConfig {
  return {
    contract: "plastics-config.v1",
    id: PRELOADED,
    name: "Precargada de la demo",
    saved_at: "",
    orders: structuredClone(portfolio.orders),
    molds: {},
    sequence: structuredClone(manual.sequence),
  };
}

type Setup = CatalogData["setup"]["setup"];

/** Montaje con los cambios de la configuración. Una inyectora que recibe un molde toma el color de otra que ya lo lleva. */
export function setupOf(cat: CatalogData, molds: Record<string, string | null>): Setup {
  const base = cat.setup.setup;
  const out: Setup = { ...base };
  for (const [m, tooling] of Object.entries(molds)) {
    if (!tooling) delete out[m];
    else if (base[m]?.tooling !== tooling) out[m] = { tooling, color: Object.values(base).find((s) => s.tooling === tooling)?.color ?? base[m]?.color };
  }
  return out;
}

/**
 * El catálogo con la configuración aplicada: el montaje cambiado y, en la ruta de cada pieza, las inyectoras que ahora
 * llevan su molde (así una máquina que no estaba en la lista del producto puede hacerlo si el molde le cabe).
 */
export function applyConfig(cat: CatalogData, cfg: Pick<PlasticsConfig, "molds"> | null | undefined): CatalogData {
  if (!cfg || !Object.keys(cfg.molds).length) return cat;
  const setup = setupOf(cat, cfg.molds);
  const holders = (tooling: string) => Object.keys(setup).filter((m) => setup[m].tooling === tooling);
  return {
    ...cat,
    setup: { setup },
    products: {
      products: cat.products.products.map((p) => ({
        ...p,
        routing: p.routing.map((r) => (r.tooling ? { ...r, equipment: [...new Set([...r.equipment, ...holders(r.tooling)])] } : r)),
      })),
    },
  };
}

/** La cartera de la configuración (la base si no hay). */
export function configPortfolio(base: CustomerOrders, cfg: PlasticsConfig | null | undefined): CustomerOrders {
  if (!cfg || cfg.id === PRELOADED) return cfg ? { ...base, orders: cfg.orders } : base;
  return { ...base, portfolio_id: `${base.portfolio_id}·${cfg.id}`, orders: cfg.orders };
}

/** La secuencia manual de la configuración (la base si no hay). */
export function configManual(base: ManualPlan, cfg: PlasticsConfig | null | undefined, portfolio = base.portfolio_id): ManualPlan {
  if (!cfg) return base;
  return { ...base, plan_id: cfg.id === PRELOADED ? base.plan_id : `APS-MAN-${cfg.id}`, portfolio_id: portfolio, note: cfg.name, sequence: cfg.sequence };
}

/**
 * Por qué no se puede montar `tooling` en `machine` con esta configuración, o undefined si se puede: el molde tiene que
 * caber (fuerza de cierre y tiro) y tiene que quedar una copia libre del molde.
 */
export function mountProblem(cat: CatalogData, molds: Record<string, string | null>, machine: string, tooling: string): string | undefined {
  const fit = moldFitProblem(cat, machine, tooling);
  if (fit) return fit;
  const setup = setupOf(cat, molds);
  if (setup[machine]?.tooling === tooling) return `${machine} ya tiene el molde ${tooling}`;
  const copies = cat.tooling.tooling.find((t) => t.id === tooling)?.copies;
  const inUse = Object.values(setup).filter((s) => s.tooling === tooling).length;
  if (copies !== undefined && inUse >= copies) return `las ${copies} copias del molde ${tooling} ya están montadas: quita una de otra máquina primero`;
  return undefined;
}
