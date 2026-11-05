import type { PlanKpis, ProductionPlan } from "@twin/cosim-core";
import { describe, expect, it } from "vitest";
import { dayLabel, runStudy, weighted, type StudyModel, type Variant } from "../index.ts";

const kpis = (late: number, tard: number, cipH: number): PlanKpis => ({
  orders: 10,
  on_time_pct: 100 - late * 10,
  late_orders: late,
  tardiness_h: tard,
  changeovers: 4,
  changeover_h: 3,
  cip_h: cipH,
  busiest: { equipment: "m1", busy_pct: 80 },
});

const plan = (id: string, k: PlanKpis): ProductionPlan => ({
  contract: "production-plan.v1",
  plan_id: id,
  source: "solver",
  status: "vigente",
  plant: "demo-plant-v1",
  portfolio_id: "P",
  from: "2026-11-02",
  to: "2026-11-09",
  timezone: "-05:00",
  load_pct: 85,
  calendar: { workdays: [1, 2, 3, 4, 5, 6], shifts: [] },
  orders: [],
  schedule: [],
  downtime: [],
  equipment: {},
  products: [],
  kpis: k,
});

// Tres variantes con resultados fijos (el cosimulador de mentira solo devuelve lo que trae la variante).
const outcomes: Record<string, { k: PlanKpis; loads: Record<string, number> }> = {
  base: { k: kpis(2, 10, 6), loads: { m1: 90, m2: 40 } },
  agrupar: { k: kpis(1, 3, 3), loads: { m1: 80, m2: 50 } },
  alterna: { k: kpis(0, 0, 6), loads: { m1: 60, m2: 70 } },
};

function model(costMin: number): StudyModel {
  const variants: Variant[] = [
    { label: "Solo recalcular", levers: [{ kind: "recalcular", text: "Recolocar" }], data: "base" },
    { label: "Agrupar recetas", levers: [{ kind: "agrupar", text: "Agrupar" }], data: "agrupar" },
    { label: "Usar la llenadora alterna", levers: [{ kind: "alterna", text: "Montar formato" }], costs: { montaje: costMin / 60 }, data: "alterna" },
  ];
  return {
    plant: "demo-plant-v1",
    now: "2026-11-04T06:00-05:00",
    scenario: "cip",
    previous: plan("VIG", kpis(2, 10, 6)),
    baselineLoads: { m1: 90, m2: 40 },
    frame: () => ({ question: "¿Cómo hacer menos CIP?", variants }),
    evaluate: async (v, id) => ({ plan: plan(id, outcomes[v.data as string].k), loads: outcomes[v.data as string].loads }),
    terms: (k, o) => ({ tardiness_h: k.tardiness_h, late: k.late_orders, cip_h: k.cip_h ?? 0, montaje_h: o.costs.montaje ?? 0 }),
    weights: { tardiness_h: 1, late: 20, cip_h: 2, montaje_h: 2 },
    explain: (b, a) => `Pasa de ${a.kpis.late_orders} a ${b.kpis.late_orders} pedidos tarde.`,
  };
}

describe("bucle de Fractal", () => {
  it("puntúa cada opción con los pesos y recomienda la menor", async () => {
    // base: 10 + 20·2 + 2·6 = 62; agrupar: 3 + 20 + 6 = 29; alterna con 30 min de montaje: 0 + 0 + 12 + 1 = 13.
    const s = await runStudy(model(30), "FRA-T");
    expect(s.options.map((o) => o.score)).toEqual([62, 29, 13]);
    expect(s.best).toBe("FRA-T-C");
    expect(s.options[2].terms).toEqual({ tardiness_h: 0, late: 0, cip_h: 12, montaje_h: 1 });
    expect(s.options[2].plan.source).toBe("fractal");
    expect(s.options[2].plan.status).toBe("propuesta");
    expect(s.recommendation).toBe("Recomendación: usar la llenadora alterna. Pasa de 2 a 0 pedidos tarde.");
    expect(s.baseline.max_load).toEqual({ equipment: "m1", pct: 90 });
  });

  it("si la palanca cuesta demasiado, gana otra", async () => {
    // alterna con 600 min de montaje: 12 + 2·10 = 32 > 29.
    const s = await runStudy(model(600));
    expect(s.best).toBe("FRA-B");
  });

  it("términos sin peso no cuentan", () => {
    expect(weighted({ a: 2, b: 5 }, { a: 3 })).toEqual({ terms: { a: 6 }, score: 6 });
  });

  it("los textos usan el día N y no fechas", () => {
    expect(dayLabel("2026-10-26", "2026-11-04T06:30-05:00")).toBe("día 9 06:30");
  });
});
