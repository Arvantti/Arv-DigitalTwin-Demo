import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { CustomerOrders } from "../../../core/contracts.ts";
import { applyConfig, configManual, configPortfolio, mountProblem, preloadedConfig, type PlasticsConfig } from "../config.ts";
import { manualPlan, type ManualPlan } from "../manual.ts";
import { buildModel } from "../model.ts";
import { fsCatalog, MODEL_DIR } from "../scripts/fs-catalog.ts";

const cat = fsCatalog();
const portfolio = JSON.parse(readFileSync(`${MODEL_DIR}orders/cartera-2026-11.json`, "utf8")) as CustomerOrders;
const manual = JSON.parse(readFileSync(`${MODEL_DIR}aps/plans/APS-MAN-01.json`, "utf8")) as ManualPlan;

const planOf = (cfg: PlasticsConfig) => {
  const pf = configPortfolio(portfolio, cfg);
  return manualPlan(buildModel(applyConfig(cat, cfg)), pf, configManual(manual, cfg, pf.portfolio_id));
};
const saved = (patch: Partial<PlasticsConfig>): PlasticsConfig => ({ ...preloadedConfig(portfolio, manual), id: "CFG-01", name: "Prueba", ...patch });

describe("configuración cargada a mano (plásticos)", () => {
  it("la precargada da el mismo plan manual que APS-MAN-01", () => {
    const base = manualPlan(buildModel(cat), portfolio, manual);
    const p = planOf(preloadedConfig(portfolio, manual));
    expect(p.portfolio_id).toBe(portfolio.portfolio_id);
    expect(p.schedule).toEqual(base.schedule);
  });

  it("una versión guardada tiene su propia cartera y su secuencia", () => {
    const cfg = saved({});
    expect(configPortfolio(portfolio, cfg).portfolio_id).toBe(`${portfolio.portfolio_id}·CFG-01`);
    expect(configManual(manual, cfg).plan_id).toBe("APS-MAN-CFG-01");
  });

  it("valida el montaje: cierre de la máquina y copias libres del molde", () => {
    expect(mountProblem(cat, {}, "imm-08", "mold-balde-12l")).toMatch(/cierre/);
    expect(mountProblem(cat, {}, "imm-18", "mold-cubiertos-16c")).toMatch(/copias/);
    expect(mountProblem(cat, {}, "imm-20", "mold-balde-12l")).toBeUndefined();
    expect(mountProblem(cat, { "imm-21": null }, "imm-18", "mold-cubiertos-16c")).toMatch(/copias/);
    expect(mountProblem(cat, { "imm-01": null }, "imm-18", "mold-cubiertos-16c")).toBeUndefined();
  });

  it("montar un molde en una máquina libre la suma a la pieza y el plan la usa", () => {
    const order = manual.sequence["imm-21"].at(-1)!;
    const sequence = { ...manual.sequence, "imm-21": manual.sequence["imm-21"].slice(0, -1), "imm-20": [order] };
    const cfg = saved({ molds: { "imm-20": "mold-balde-12l" }, sequence });
    const model = buildModel(applyConfig(cat, cfg));
    expect(model.machines).toContain("imm-20");
    expect(model.products["balde-12l"].final.machines).toContain("imm-20");
    const rows = planOf(cfg).schedule.filter((r) => r.order === order);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.equipment === "imm-20")).toBe(true);
  });

  it("desmontar un molde saca la máquina y su trabajo pasa a las otras", () => {
    const cfg = saved({ molds: { "imm-02": null } });
    const model = buildModel(applyConfig(cat, cfg));
    expect(model.machines).not.toContain("imm-02");
    const p = planOf(cfg);
    expect(p.schedule.some((r) => r.equipment === "imm-02")).toBe(false);
    for (const id of manual.sequence["imm-02"]) expect(p.schedule.some((r) => r.order === id)).toBe(true);
  });

  it("el plan manual respeta el orden que pone el planificador", () => {
    const list = [...manual.sequence["imm-01"]];
    [list[0], list[1]] = [list[1], list[0]];
    const p = planOf(saved({ sequence: { ...manual.sequence, "imm-01": list } }));
    const first = (id: string) => p.schedule.filter((r) => r.order === id && r.equipment === "imm-01").map((r) => r.start).sort()[0];
    expect(first(list[0]) < first(list[1])).toBe(true);
  });

  it("un pedido nuevo sin asignar se programa igual, al final de una máquina de su pieza", () => {
    const extra = { ...portfolio.orders[0], id: "PED-D12-09", due: "2026-11-07T22:00-05:00", created: "2026-11-04T10:00-05:00", added: true };
    const p = planOf(saved({ orders: [...portfolio.orders, extra] }));
    const rows = p.schedule.filter((r) => r.order === extra.id);
    expect(rows.reduce((s, r) => s + r.quantity, 0)).toBe(extra.quantity);
    expect(rows.every((r) => buildModel(cat).products.cubiertos.final.machines.includes(r.equipment))).toBe(true);
  });
});
