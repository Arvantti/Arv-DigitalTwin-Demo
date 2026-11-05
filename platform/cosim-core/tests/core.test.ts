import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Calendar, combine, holdLeft, iso, pairMin, parseLocal, weekday } from "../index.ts";

const schema = (name: string) => JSON.parse(readFileSync(new URL(`../schemas/${name}.schema.json`, import.meta.url), "utf-8"));

describe("tablas de cambio", () => {
  const cip = { default_min: 35, pairs: { "con-huevo": { "sin-alergeno": 90, "con-mostaza": 90 } } };

  it("la misma clase no cambia; un par listado usa su valor; los demás, el de por defecto", () => {
    expect(pairMin(cip, "sin-alergeno", "sin-alergeno")).toBe(0);
    expect(pairMin(cip, "con-huevo", "sin-alergeno")).toBe(90);
    expect(pairMin(cip, "sin-alergeno", "con-huevo")).toBe(35);
    expect(pairMin(cip, null, "con-huevo")).toBe(0);
  });

  it("suma lo que va en serie y toma la parte más larga de lo que se cubre", () => {
    // Molde 90 + max(resina 45, color 60) = 150, manda el molde.
    expect(combine([{ kind: "molde", min: 90 }], [{ kind: "resina", min: 45 }, { kind: "color", min: 60 }])).toEqual({ min: 150, kind: "molde" });
    // Receta 45 + CIP completo 90 = 135, manda el alérgeno.
    expect(combine([{ kind: "receta", min: 45 }, { kind: "alergeno", min: 90 }])).toEqual({ min: 135, kind: "alergeno" });
    expect(combine([{ kind: "formato", min: 0 }])).toEqual({ min: 0 });
  });

  it("tiempo de espera: 4 h de tomate caliente, hecho a las 06:00", () => {
    const made = parseLocal("2026-11-04T06:00");
    expect(holdLeft(made, 240, parseLocal("2026-11-04T09:30"))).toBe(30);
    expect(holdLeft(made, 240, parseLocal("2026-11-04T10:30"))).toBe(-30);
  });
});

describe("calendario", () => {
  it("dos turnos de lunes a sábado: el domingo no cuenta", () => {
    const cal = new Calendar([1, 2, 3, 4, 5, 6], [{ name: "A", start: "06:00", end: "14:00" }, { name: "B", start: "14:00", end: "22:00" }]);
    const sat = parseLocal("2026-11-07T20:00");
    expect(weekday(sat)).toBe(6);
    // Quedan 2 h del sábado; el domingo no se trabaja; el lunes arranca a las 06:00 y 3 h después son las 09:00.
    expect(iso(cal.advance(sat, 5 * 60), "-05:00")).toBe("2026-11-09T09:00-05:00");
  });
});

describe("esquemas", () => {
  it("production-plan.v1 acepta los cambios de alimentos y los lotes de proceso", () => {
    const row = schema("production-plan.v1").properties.schedule.items.properties;
    expect(row.changeover_kind.enum).toEqual(["molde", "resina", "color", "receta", "formato", "cip", "alergeno"]);
    expect(row.batch_kg.type).toBe("number");
  });
});
