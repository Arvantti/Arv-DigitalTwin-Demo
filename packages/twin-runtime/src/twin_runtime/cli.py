"""Línea de comandos de la librería de equipos.

    twin-lib list                         tipos disponibles
    twin-lib validate [tipo ...]          valida contratos, presets, comportamiento y escenarios
    twin-lib run <tipo> [--scenario id]   ejecuta un escenario y muestra la evolución
    twin-lib plant list                   gemelos de planta (industrial-models/*/twin.yaml)
    twin-lib plant validate [planta ...]  carga el gemelo y corre sus escenarios de planta
    twin-lib plant run <planta> [--scenario id]
"""

from __future__ import annotations

import argparse
import json
import sys

from .library import Library, check_behavior_contract
from .plant import check_plant_expectations, find_plants, load_plant_scenarios, load_twin, run_plant_scenario
from .sim import check_expectations, run_scenario


def _fmt(value: object) -> str:
    if isinstance(value, float):
        return f"{value:.3g}" if abs(value) < 1000 else f"{value:.0f}"
    return str(value)


def cmd_list(lib: Library, _: argparse.Namespace) -> int:
    for eq in lib.all():
        raw = eq.spec.raw
        print(
            f"{eq.spec.type:<32} {raw['manufacturing']:<10} {raw['fidelity']['visual']}/{raw['fidelity']['behavior']}  "
            f"{raw['name']}  presets: {', '.join(eq.spec.presets) or '-'}"
        )
    return 0


def cmd_validate(lib: Library, args: argparse.Namespace) -> int:
    names = args.types or [f.name for f in lib.folders()]
    failed = 0
    for name in names:
        try:
            eq = lib.get(name)
            errors = check_behavior_contract(eq)
            for sc in eq.scenarios.values():
                inst, sim, _ = run_scenario(eq, sc)
                errors += [f"escenario {sc.id}: {m}" for m in check_expectations(inst.snapshot(), sc.expect, sim.events)]
        except Exception as exc:  # noqa: BLE001 - se informa cualquier error de carga
            errors = [f"{type(exc).__name__}: {exc}"]
        status = "OK " if not errors else "ERR"
        print(f"[{status}] {name}")
        for e in errors:
            print(f"       {e}")
        failed += bool(errors)
    return 1 if failed else 0


def cmd_run(lib: Library, args: argparse.Namespace) -> int:
    eq = lib.get(args.type)
    if not eq.scenarios:
        print(f"{args.type} no tiene scenarios.yaml", file=sys.stderr)
        return 1
    sc = eq.scenarios[args.scenario] if args.scenario else next(iter(eq.scenarios.values()))
    inst, sim, samples = run_scenario(eq, sc, sample_every_s=args.every)
    if args.json:
        json.dump({"samples": [s for _, s in samples], "events": [e.to_dict() for e in sim.events]}, sys.stdout)
        return 0
    keys = args.vars.split(",") if args.vars else [v["id"] for v in eq.spec.variables][:6]
    print(f"{eq.spec.type} · escenario {sc.id}: {sc.description}")
    print(f"{'t (s)':>8} {'estado':<11} {'fase':<14} " + " ".join(f"{k[:12]:>12}" for k in keys))
    for t, snap in samples:
        values = " ".join(f"{_fmt(snap['variables'].get(k)):>12}" for k in keys)
        print(f"{t:>8.0f} {snap['state']:<11} {str(snap['phase'] or '-'):<14} {values}")
    print("\nKPIs:", {k: _fmt(v) for k, v in inst.kpis().items()})
    counts: dict[str, int] = {}
    for e in sim.events:
        counts[e.type] = counts.get(e.type, 0) + 1
    print("Eventos:", counts)
    return 0


def cmd_plant(lib: Library, args: argparse.Namespace) -> int:
    plants = find_plants(lib)
    if args.plant_cmd == "list":
        for name, path in plants.items():
            twin = load_twin(path, lib)
            print(f"{name:<28} {twin.id:<26} {len(twin.equipment):>3} equipos  {twin.name}")
        return 0
    if args.plant_cmd == "validate":
        failed = 0
        for name in args.plants or list(plants):
            try:
                twin = load_twin(plants[name], lib)
                scen_path = plants[name].parent / "scenarios.yaml"
                scenarios = load_plant_scenarios(scen_path, twin, lib) if scen_path.exists() else {}
                errors: list[str] = []
                for sc in scenarios.values():
                    sim, _ = run_plant_scenario(twin, lib, sc)
                    errors += [f"escenario {sc.id}: {m}" for m in check_plant_expectations(sim, sc.expect)]
            except Exception as exc:  # noqa: BLE001 - se informa cualquier error de carga
                errors = [f"{type(exc).__name__}: {exc}"]
            print(f"[{'OK ' if not errors else 'ERR'}] {name}")
            for e in errors:
                print(f"       {e}")
            failed += bool(errors)
        return 1 if failed else 0
    # run
    twin = load_twin(plants[args.plant], lib)
    scen_path = plants[args.plant].parent / "scenarios.yaml"
    scenarios = load_plant_scenarios(scen_path, twin, lib) if scen_path.exists() else {}
    sc = scenarios[args.scenario] if args.scenario else next(iter(scenarios.values()))
    sim, samples = run_plant_scenario(twin, lib, sc, sample_every_s=args.every)
    if args.json:
        json.dump({"samples": [s for _, s in samples], "events": [e.to_dict() for e in sim.events]}, sys.stdout)
        return 0
    ids = list(sim.equipment)
    print(f"{twin.name} · escenario {sc.id}: {sc.description}")
    print(f"{'t (min)':>8} " + " ".join(f"{i[:11]:>11}" for i in ids))
    for t, snap in samples:
        print(f"{t / 60:>8.0f} " + " ".join(f"{snap['equipment'][i]['state'][:11]:>11}" for i in ids))
    final = sim.snapshot()
    print("\nKPIs de planta:", {k: _fmt(v) for k, v in final["plant"]["kpis"].items()})
    print("Tiempo activo:", {k: f"{v:.0%}" for k, v in final["plant"]["active"].items()})
    print("Cuello de botella:", ", ".join(final["plant"]["bottleneck"]) or "-")
    failures = check_plant_expectations(sim, sc.expect)
    for f in failures:
        print("  ✗", f)
    return 1 if failures else 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="twin-lib", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("list")
    v = sub.add_parser("validate")
    v.add_argument("types", nargs="*")
    r = sub.add_parser("run")
    r.add_argument("type")
    r.add_argument("--scenario")
    r.add_argument("--every", type=float, default=60.0, help="segundos virtuales entre muestras")
    r.add_argument("--vars", help="variables a mostrar, separadas por coma")
    r.add_argument("--json", action="store_true")
    pl = sub.add_parser("plant", help="gemelos de planta")
    psub = pl.add_subparsers(dest="plant_cmd", required=True)
    psub.add_parser("list")
    pv = psub.add_parser("validate")
    pv.add_argument("plants", nargs="*")
    pr = psub.add_parser("run")
    pr.add_argument("plant")
    pr.add_argument("--scenario")
    pr.add_argument("--every", type=float, default=1800.0, help="segundos virtuales entre muestras")
    pr.add_argument("--json", action="store_true")
    args = ap.parse_args(argv)
    lib = Library()
    return {"list": cmd_list, "validate": cmd_validate, "run": cmd_run, "plant": cmd_plant}[args.cmd](lib, args)


if __name__ == "__main__":
    sys.exit(main())
