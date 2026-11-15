/**
 * Cartera de pedidos inventada de la planta de salsas (`customer-orders.v1`), con el mismo método que la de plásticos
 * para que la demo sea equivalente: por cada día de entrega, con su propia semilla, tantos pedidos de cada producto
 * como da su capacidad diaria × la carga de la planta (demand.yaml, load_pct) / el pedido promedio. Con pocos pedidos al
 * día el azar puede pedir de más o de menos (una línea quedaba al 85 % con load_pct 65), así que al final las cantidades
 * de cada producto se escalan para que el total sea exactamente su capacidad × la carga × los días laborables de la
 * ventana. La ventana sale de aps/aps.yaml. Todo es supuesto; los clientes son ficticios.
 */
import { DAY_MIN, dateOf, iso, parseLocal, rng, type CustomerOrder, type CustomerOrders, type Importance } from "@twin/cosim-core";
import type { SauceModel } from "./model.ts";

const LOW_SHARE = 0.15;

export interface PortfolioOptions {
  portfolioId: string;
  /** Lunes en que arranca la programación ("2026-10-26"): día 0. */
  planStart: string;
  firstDue: string;
  lastDue: string;
}

export function inventPortfolio(model: SauceModel, opt: PortfolioOptions): CustomerOrders {
  const cal = model.calendar;
  const open = Math.min(...cal.spans.map(([a]) => a));
  const close = Math.max(...cal.spans.map(([, b]) => b));
  const load = model.loadPct / 100;
  const rushShare = model.rushSharePct / 100;
  const orders: CustomerOrder[] = [];
  let workdays = 0;
  for (let d = parseLocal(opt.firstDue); d <= parseLocal(opt.lastDue); d += DAY_MIN) {
    if (!cal.isWorkday(d)) continue;
    workdays += 1;
    const r = rng(`${model.plant}:cartera:${dateOf(d)}`);
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
        orders.push({
          // D = día de entrega contado desde el arranque de la cartera (día 0); sin fechas en el código.
          id: `PED-D${String(Math.round((d - parseLocal(opt.planStart)) / DAY_MIN)).padStart(2, "0")}-${String(n).padStart(2, "0")}`,
          customer: model.customers[Math.floor(r() * model.customers.length)],
          product: p.id,
          quantity,
          unit: p.unit,
          due: iso(d + close, model.timezone),
          created: iso(d - lead * DAY_MIN + open, model.timezone),
          importance,
        });
      }
    }
  }
  for (const line of model.demand) {
    const mine = orders.filter((o) => o.product === line.product);
    const asked = mine.reduce((sum, o) => sum + o.quantity, 0);
    if (!asked) continue;
    const step = line.round ?? 1;
    const f = (line.daily * load * workdays) / asked;
    for (const o of mine) o.quantity = Math.max(step, Math.round((o.quantity * f) / step) * step);
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
