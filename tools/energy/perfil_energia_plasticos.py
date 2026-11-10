"""Genera catalog/energy.yaml de la planta de plásticos corriendo los modelos físicos de la librería.

Los kW no se escriben a mano: cada inyectora se simula con su fuerza de cierre (plant.yaml) y cada molde que le cabe
(catalog/tooling.yaml): se enciende fría hasta que el cilindro llega a temperatura, produce una hora y queda en espera
caliente. Así salen los minutos y kWh de calentamiento, los kW produciendo, en espera caliente y apagada.
Los servicios (enfriador de moldes, secadores, compresor y transporte de resina) se cuentan por lo que piden las
inyectoras de hoy produciendo todas a la vez, con su modelo de la librería cuando lo hay o con la placa de plant.yaml
por la parte que se usa; las unidades de respaldo no suman.

Uso: uv run python tools/energy/perfil_energia_plasticos.py [--write]   (sin --write imprime y compara con el archivo)
"""

from __future__ import annotations

import sys
from pathlib import Path

import yaml
from twin_runtime import Simulator
from twin_runtime.library import Library

ROOT = Path(__file__).resolve().parents[2]
PLANT_DIR = ROOT / "industrial-models" / "plastic-injection-plant-v1"
OUT = PLANT_DIR / "catalog" / "energy.yaml"
LIB = Library(ROOT / "equipment-library")

# Fracción de la potencia nominal que piden los servicios con las inyectoras encendidas pero sin producir.
# Decisión de Andy (2026-11-10): sin exagerar ni sobredimensionar, los servicios piden nominal × fracción de
# producción, así que la base es cero. Se deja el dato por si la planta mide un consumo en vacío.
IDLE_FRACTION = {"chiller": 0.0, "desiccant_dryer": 0.0, "air_compressor": 0.0, "vacuum_conveying_station": 0.0}
# Sin sobredimensionar: cada servicio se cuenta por lo que piden las inyectoras de hoy produciendo todas a la vez, no
# por su placa (los servicios se dimensionaron para una nave más grande). Supuestos hasta medir en la planta:
MOLD_HEAT_KWH_PER_KG = 0.12  # calor que el agua de moldes le quita a la pieza (de masa fundida a expulsión)
AIR_M3_MIN_PER_IMM = 0.4  # aire comprimido de una inyectora con robot y soplado


def _load(name: str) -> dict:
    return yaml.safe_load((PLANT_DIR / name).read_text(encoding="utf-8"))


def _energy_after(sim: Simulator, eq, seconds: float) -> float:
    e0 = eq.energy_kwh
    sim.run(seconds)
    return eq.energy_kwh - e0


def injection_profile(machine: dict, mold: dict, resin: str) -> dict:
    p = machine["params"]
    eq = LIB.get("injection-molding-machine").create(
        machine["id"],
        params={
            "clamp_t": p["clamp_t"],
            "max_shot_kg": p["max_shot_kg"],
            "material": resin,
            "cavities": mold["cavities"],
            "part_g": mold["part_g"],
            "cycle_s": mold["cycle_s"],
            "robot": p.get("robot", "cartesiano"),
            "start_hot": False,
        },
        seed=1,
        random_faults=False,
    )
    sim = Simulator([eq], dt=1.0)
    # 1) Encendido en frío hasta que el cilindro llega a temperatura.
    sim.schedule(0, eq.id, "power_on")
    while not any(e.type == "heat_up_completed" for e in sim.step()):
        if sim.t > 4 * 3600:
            raise SystemExit(f"{eq.id}: no llegó a temperatura en 4 h")
    heat_min = sim.t / 60.0
    heat_kwh = eq.energy_kwh
    # 2) Una hora produciendo.
    sim.schedule(sim.t, eq.id, "start")
    sim.run(600)  # el ciclo se estabiliza
    kg0 = eq.resin_kg
    run_kwh = _energy_after(sim, eq, 3600)
    kg_h = eq.resin_kg - kg0
    # 3) Espera caliente: encendida y a temperatura, sin ciclar.
    sim.schedule(sim.t, eq.id, "stop")
    sim.run(900)
    standby_kwh = _energy_after(sim, eq, 1800) * 2
    # 4) Apagada.
    sim.schedule(sim.t, eq.id, "power_off")
    sim.run(60)
    off_kwh = _energy_after(sim, eq, 3600)
    return {
        "run_kw": round(run_kwh, 1),
        "standby_kw": round(standby_kwh, 1),
        "off_kw": round(off_kwh, 2),
        "heatup_min": round(heat_min),
        "heatup_kwh": round(heat_kwh, 1),
        "kwh_per_kg": round(run_kwh / kg_h, 3) if kg_h else None,
    }


def fits(machine: dict, mold: dict) -> bool:
    p = machine["params"]
    return p["clamp_t"] >= mold.get("min_clamp_t", 0) and p["max_shot_kg"] >= mold.get("shot_kg", 0)


def steady_kw(type_id: str, preset: str, inputs: dict | None = None, settle_s: float = 3600) -> float:
    eq = LIB.get(type_id).create("svc", preset=preset, seed=1, random_faults=False)
    sim = Simulator([eq], dt=1.0)
    sim.inputs["svc"].update(inputs or {})
    sim.schedule(0, "svc", "start")
    sim.run(settle_s)
    # Seis horas para promediar los ciclos de arranque y parada de las etapas.
    return round(_energy_after(sim, eq, 6 * 3600) / 6, 1)


def services(plant: dict, injection: dict, setup: dict) -> dict:
    """Servicios que trabajan para las inyectoras. Los de respaldo y los que no alimentan a ningún molde no suman."""
    eqs = {e["id"]: e for e in plant["equipment"]}
    out: dict[str, dict] = {}
    # Lo que producen las inyectoras montadas trabajando todas a la vez.
    mounted = {m: s["tooling"] for m, s in setup.items() if s.get("tooling") in injection.get(m, {})}
    kg_h = sum(injection[m][t]["run_kw"] / injection[m][t]["kwh_per_kg"] for m, t in mounted.items())
    # Enfriador del agua de moldes: modelo de la librería con el calor de los moldes a plena producción.
    ch = eqs["chiller-01"]
    assert ch["params"].get("role") != "respaldo"
    load = round(kg_h * MOLD_HEAT_KWH_PER_KG, 1)
    out["chiller-01"] = {
        "name": "Enfriador del agua de moldes",
        "nominal_kw": steady_kw("chiller", "600kw-mold-water", {"load_kw": load}),
        "idle_fraction": IDLE_FRACTION["chiller"],
        "source": f"librería chiller (600kw-mold-water) con {load} kW de calor: {round(kg_h)} kg/h × {MOLD_HEAT_KWH_PER_KG} kWh/kg",
    }
    # Secadores: solo los que secan una resina que usa algún molde del catálogo.
    out["dryer-03"] = {
        "name": "Secador de PS",
        "nominal_kw": steady_kw("desiccant-dryer", "recycled-ps-250"),
        "idle_fraction": IDLE_FRACTION["desiccant_dryer"],
        "feeds": ["ps"],
        "source": "librería desiccant-dryer, preset recycled-ps-250",
    }
    out["dryer-04"] = {
        "name": "Secador de PP reciclado",
        "nominal_kw": steady_kw("desiccant-dryer", "recycled-pp-400"),
        "idle_fraction": IDLE_FRACTION["desiccant_dryer"],
        "feeds": ["pp-reciclado"],
        "source": "librería desiccant-dryer, preset recycled-pp-400",
    }
    # Compresor: placa de plant.yaml por la parte de su caudal que piden las inyectoras (no hay modelo en la librería).
    co = eqs["compressor-01"]["params"]
    air = len(mounted) * AIR_M3_MIN_PER_IMM
    share = min(1.0, air / float(co["flow_m3_min"]))
    out["compressor-01"] = {
        "name": "Compresor de aire",
        "nominal_kw": round(float(co["power_kw"]) * share, 1),
        "idle_fraction": IDLE_FRACTION["air_compressor"],
        "source": (
            f"placa {co['power_kw']} kW × {round(air, 1)} de {co['flow_m3_min']} m³/min ({len(mounted)} inyectoras × {AIR_M3_MIN_PER_IMM})"
        ),
    }
    # Transporte de resina: placa por la parte de sus líneas que van a inyectoras con molde.
    vp = eqs["vacuum-central-01"]["params"]
    n, kw = str(vp["power_kw"]).split("x")  # "3x7.5"
    plate = int(n) * float(kw)
    out["vacuum-central-01"] = {
        "name": "Central de transporte de resina",
        "nominal_kw": round(plate * min(1.0, len(mounted) / int(vp["lines"])), 1),
        "idle_fraction": IDLE_FRACTION["vacuum_conveying_station"],
        "source": f"placa {plate} kW × {len(mounted)} de {vp['lines']} líneas",
    }
    return out


def build() -> dict:
    plant = _load("plant.yaml")
    molds = _load("catalog/tooling.yaml")["tooling"]
    resin_of = {m["id"]: m["resin"] for m in _load("catalog/materials.yaml")["materials"] if m["kind"] == "resin"}
    imms = [e for e in plant["equipment"] if e["type"] == "injection_molding_machine"]
    injection: dict[str, dict] = {}
    for m in sorted(imms, key=lambda e: e["id"]):
        injection[m["id"]] = {mold["id"]: injection_profile(m, mold, resin_of[mold["material"]]) for mold in molds if fits(m, mold)}
    return {
        "energy": {
            "policy": {
                "off_outside_shifts": True,
                "preheat": "before_first_lot",
            },
            "injection": injection,
            "services": services(plant, injection, _load("catalog/setup.yaml")["setup"]),
            "assumed": True,
        }
    }


HEADER = """\
# Energía de la planta de plásticos (la lee el cosimulador del APS). Solo kWh: sin precio ni franjas horarias.
# NO EDITAR A MANO: lo genera tools/energy/perfil_energia_plasticos.py corriendo los modelos de la librería.
#
# injection: por inyectora y por cada molde que le cabe (cierre y tiro), lo que mide el modelo físico:
#   run_kw      potencia media produciendo;
#   standby_kw  encendida y a temperatura sin ciclar (espera caliente: resistencias y bomba en recirculación);
#   off_kw      apagada (solo el control);
#   heatup_min / heatup_kwh  encendido en frío hasta que el cilindro llega a la temperatura de la resina;
#   kwh_per_kg  energía específica produciendo.
# policy: fuera de turno (22:00-06:00 y domingo) las inyectoras se apagan; el calentamiento se hace antes del primer
#   lote del día para que la producción empiece a la hora programada. Entre lotes del mismo día quedan en espera
#   caliente. Durante un cambio de molde o una purga se cuentan en espera caliente.
# services: cada servicio pide nominal_kw × fracción de producción de las inyectoras que atiende (`feeds`: resinas;
#   sin feeds, todas): la parte de la potencia de producción de esas inyectoras que está produciendo. idle_fraction
#   es lo que pediría con las inyectoras encendidas sin producir (cero hasta medirlo en la planta). nominal_kw es lo
#   que pide con todas las inyectoras de hoy produciendo, no la placa (ver `source`). Los equipos de respaldo
#   (chiller-02, compressor-02) y los secadores de ABS (sin moldes de ABS) no suman.
# Todo es supuesto hasta tener mediciones de la planta.
"""


def _flow(d: dict) -> str:
    return yaml.safe_dump(d, sort_keys=False, allow_unicode=True, width=1000, default_flow_style=True).strip()


def dump(data: dict) -> str:
    """Una línea por inyectora y molde, y por servicio, para que el archivo se lea como tabla."""
    e = data["energy"]
    lines = ["energy:", f"  policy: {_flow(e['policy'])}", "  injection:"]
    for m, molds in e["injection"].items():
        lines.append(f"    {m}:")
        lines += [f"      {mold}: {_flow(v)}" for mold, v in molds.items()]
    lines.append("  services:")
    lines += [f"    {sid}: {_flow(v)}" for sid, v in e["services"].items()]
    lines.append(f"  assumed: {str(e['assumed']).lower()}")
    text = HEADER + "\n".join(lines) + "\n"
    assert yaml.safe_load(text) == data
    return text


def main() -> None:
    text = dump(build())
    if "--write" in sys.argv:
        OUT.write_text(text, encoding="utf-8")
        print(f"Escrito {OUT.relative_to(ROOT)}")
        return
    print(text)
    if OUT.exists() and OUT.read_text(encoding="utf-8") != text:
        raise SystemExit(f"{OUT.relative_to(ROOT)} no coincide con el modelo: corre con --write")


if __name__ == "__main__":
    main()
