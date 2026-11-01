/**
 * Cartera de pedidos inventada (`customer-orders.v1`).
 *
 * Con la demanda del catálogo (carga, tamaños de pedido, clientes ficticios) se inventan los pedidos de cada día de
 * entrega con su propia semilla. La ventana de entrega sale de aps/aps.yaml (una semana: un pedido llega entre 3 y 7
 * días antes de su entrega; los de importancia alta, entre 1 y 2). Todo es supuesto.
 */
import type { CustomerOrder, CustomerOrders, Importance } from "../../core/contracts.ts";
import { DAY_MIN, dateOf, iso, parseLocal, rng } from "../../core/time.ts";
import type { PlasticsModel } from "./model.ts";

const LOW_SHARE = 0.15;

export interface PortfolioOptions {
  portfolioId: string;
  /** Lunes en que arranca la programación ("2026-10-26"). */
  planStart: string;
  firstDue: string;
  lastDue: string;
}

export function inventPortfolio(model: PlasticsModel, opt: PortfolioOptions): CustomerOrders {
  const cal = model.calendar;
  const open = Math.min(...cal.spans.map(([a]) => a));
  const close = Math.max(...cal.spans.map(([, b]) => b));
  const load = model.loadPct / 100;
  const rushShare = model.rushSharePct / 100;
  const orders: CustomerOrder[] = [];
  for (let d = parseLocal(opt.firstDue); d <= parseLocal(opt.lastDue); d += DAY_MIN) {
    if (!cal.isWorkday(d)) continue;
    const day = dateOf(d);
    const r = rng(`${model.plant}:cartera:${day}`);
    const between = ([lo, hi]: [number, number]) => lo + Math.floor(r() * (hi - lo + 1));
    let n = 0;
    for (const line of model.demand) {
      const p = model.products[line.product];
      const [lo, hi] = line.order_qty;
      const step = line.round ?? 1;
      const expected = (line.daily * load) / ((lo + hi) / 2);
      const count = Math.floor(expected) + (r() < expected - Math.floor(expected) ? 1 : 0);
      for (let k = 0; k < count; k++) {
        n += 1;
        const quantity = Math.max(step, Math.round((lo + r() * (hi - lo)) / step) * step);
        const x = r();
        const importance: Importance = x < rushShare ? "alta" : x < rushShare + LOW_SHARE ? "baja" : "normal";
        const lead = between(importance === "alta" ? model.rushLeadDays : model.leadDays);
        const order: CustomerOrder = {
          // Sin fecha en el código: D = día de entrega contado desde el arranque de la cartera (día 0).
          id: `PED-D${String(Math.round((d - parseLocal(opt.planStart)) / DAY_MIN)).padStart(2, "0")}-${String(n).padStart(2, "0")}`,
          customer: model.customers[Math.floor(r() * model.customers.length)],
          product: p.id,
          quantity,
          unit: p.unit,
          due: iso(d + close, model.timezone),
          created: iso(d - lead * DAY_MIN + open, model.timezone),
          importance,
        };
        if (p.colors.length) order.color = p.colors[Math.floor(r() * p.colors.length)];
        orders.push(order);
      }
    }
  }
  return {
    contract: "customer-orders.v1",
    plant: model.plant,
    portfolio_id: opt.portfolioId,
    timezone: model.timezone,
    plan_start: iso(parseLocal(opt.planStart) + open, model.timezone),
    orders,
  };
}
