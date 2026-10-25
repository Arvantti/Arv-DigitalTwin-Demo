"""Línea de comandos de la librería de equipos.

    twin-lib list                         tipos disponibles
    twin-lib validate [tipo ...]          valida contratos, presets, comportamiento y escenarios
    twin-lib run <tipo> [--scenario id]   ejecuta un escenario y muestra la evolución
    twin-lib plant list                   plantas con simulation.yaml
    twin-lib plant validate [planta ...]  valida enlaces contra la librería y el plano, y corre sus escenarios
    twin-lib plant run <planta> [--scenario id]   simula la planta conectada
    twin-lib catalog validate [planta ...]        valida el catálogo de datos (productos, moldes, tamaños, montaje)
    twin-lib catalog route <planta> <producto>    ruta del producto por los equipos de la planta
    twin-lib plan <planta> [--from --to --back]   pedidos inventados y su programación (docs/programacion.md)
"""

from __future__ import annotations

import argparse
import json
import sys

from .catalog import Catalog
from .library import Library, check_behavior_contract
from .plant import SIM_FILE, PlantModel, check_plant_expectations, find_models_root, run_plant_scenario
from .sim import check_expectations, run_scenario
from .spec import SpecError, load_yaml


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


def _plants(lib: Library, names: list[str] | None = None) -> list[PlantModel]:
    root = find_models_root(lib.root)
    folders = [root / n for n in names] if names else sorted(p.parent for p in root.glob(f"*/{SIM_FILE}"))
    return [PlantModel(f, lib) for f in folders]


def cmd_plant(lib: Library, args: argparse.Namespace) -> int:
    if args.action == "list":
        for m in _plants(lib):
            print(f"{m.id:<28} {len(m.equipment)} equipos, {len(m.links)} enlaces  escenarios: {', '.join(m.scenarios) or '-'}")
        return 0
    if args.action == "validate":
        failed = 0
        root = find_models_root(lib.root)
        names = args.names or sorted(p.parent.name for p in root.glob(f"*/{SIM_FILE}"))
        for name in names:
            try:
                model = PlantModel(root / name, lib)
                errors = []
                for sc in model.scenarios.values():
                    plant, _ = run_plant_scenario(model, sc)
                    errors += [f"escenario {sc.id}: {m}" for m in check_plant_expectations(plant.snapshot(), sc.expect, plant.events)]
            except Exception as exc:  # noqa: BLE001 - se informa cualquier error de carga
                errors = [f"{type(exc).__name__}: {exc}"]
            print(f"[{'OK ' if not errors else 'ERR'}] {name}")
            for e in errors:
                print(f"       {e}")
            failed += bool(errors)
        return 1 if failed else 0
    # run
    if not args.names:
        print("indique la planta: twin-lib plant run <planta>", file=sys.stderr)
        return 2
    model = _plants(lib, args.names[:1])[0]
    if not model.scenarios:
        print(f"{model.id} no tiene escenarios", file=sys.stderr)
        return 1
    sc = model.scenarios[args.scenario] if args.scenario else next(iter(model.scenarios.values()))
    plant, samples = run_plant_scenario(model, sc, sample_every_s=args.every)
    if args.json:
        json.dump({"samples": [s for _, s in samples], "events": [e.to_dict() for e in plant.events]}, sys.stdout)
        return 0
    ids = list(model.equipment)
    print(f"{model.id} · escenario {sc.id}: {sc.description}")
    print(f"{'t (min)':>8}  " + " ".join(f"{eid[:13]:<13}" for eid in ids))
    for t, snap in samples:
        print(f"{t / 60:>8.0f}  " + " ".join(f"{snap['equipment'][eid]['state']:<13}" for eid in ids))
    for line_id, kpi in plant.line_kpis().items():
        print(f"\nLínea {line_id} ({kpi['name']}): {kpi['output_units']:.0f} unidades, {_fmt(kpi['output_per_h'])} por hora")
        print("  en marcha:", {eid: f"{v:.0%}" for eid, v in kpi["running_pct"].items()})
    counts: dict[str, int] = {}
    for e in plant.events:
        if e.type != "state_changed":
            key = f"{e.equipment_id}.{e.type}"
            counts[key] = counts.get(key, 0) + 1
    print("Eventos:", counts)
    failures = check_plant_expectations(plant.snapshot(), sc.expect, plant.events)
    print("Expectativas:", "todas se cumplen" if not failures else "\n  " + "\n  ".join(failures))
    return 0


def cmd_catalog(lib: Library, args: argparse.Namespace) -> int:
    root = find_models_root(lib.root)
    if args.action == "route":
        if len(args.names) != 2:
            print("uso: twin-lib catalog route <planta> <producto>", file=sys.stderr)
            return 2
        cat = Catalog.load(root / args.names[0])
        if cat is None or args.names[1] not in cat.products:
            print(f"{args.names[0]}: sin catálogo o producto desconocido {args.names[1]!r}", file=sys.stderr)
            return 1
        for st in cat.route(args.names[1]):
            extra = f"  molde {st['tooling']}" if st.get("tooling") else ""
            print(f"{st['product']:<24} {st['stage']:<22} {', '.join(st['active'])}{extra}")
        return 0
    failed = 0
    names = args.names or sorted(p.parent.name for p in root.glob("*/catalog"))
    for name in names:
        try:
            cat = Catalog.load(root / name)
            if cat is None:
                errors = ["no tiene catálogo (carpeta catalog/)"]
            else:
                errors = cat.validate(load_yaml(root / name / "plant.yaml"), lib)
        except SpecError as exc:
            errors = [str(exc)]
        summary = ""
        if not errors and cat:
            summary = f"  {len(cat.products)} productos, {len(cat.tooling)} herramentales, {len(cat.setup)} montados"
        print(f"[{'OK ' if not errors else 'ERR'}] {name}{summary}")
        for e in errors:
            print(f"       {e}")
        failed += bool(errors)
    return 1 if failed else 0


def cmd_plan(lib: Library, args: argparse.Namespace) -> int:
    from datetime import date

    from . import planning

    folder = find_models_root(lib.root) / args.plant
    cat = Catalog.load(folder)
    if cat is None or not cat.data.get("demand"):
        print(f"{args.plant}: sin catálogo o sin demanda (catalog/demand.yaml)", file=sys.stderr)
        return 1
    layout = load_yaml(folder / "plant.yaml")
    first, last = planning.default_range(planning.tz_of(cat), args.back)
    first = date.fromisoformat(args.first) if args.first else first
    last = date.fromisoformat(args.last) if args.last else last
    out = planning.to_json(planning.build_plan(args.plant, cat, layout, first, last), layout)
    if args.json:
        print(json.dumps(out, ensure_ascii=False, indent=1))
        return 0
    late = [o for o in out["orders"] if o["late_h"] > 0]
    print(f"{args.plant}: {first} a {last}, carga objetivo {out['load_pct']} %")
    print(f"  {len(out['orders'])} pedidos, {len(late)} tarde, {len(out['schedule'])} asignaciones, {len(out['downtime'])} paradas")
    for eid, u in sorted(out["equipment"].items()):
        print(f"  {eid:<18} ocupado {u['busy_pct']:>5.1f} %   paradas {u['down_h']:>5.1f} h")
    return 0


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
    pl = sub.add_parser("plant", help="motor de planta")
    pl.add_argument("action", choices=["list", "validate", "run"])
    pl.add_argument("names", nargs="*", help="carpetas de industrial-models/")
    pl.add_argument("--scenario")
    pl.add_argument("--every", type=float, default=600.0, help="segundos virtuales entre muestras")
    pl.add_argument("--json", action="store_true")
    ca = sub.add_parser("catalog", help="catálogo de datos de una planta (docs/datos-reales.md)")
    ca.add_argument("action", choices=["validate", "route"])
    ca.add_argument("names", nargs="*", help="validate: plantas; route: <planta> <producto>")
    pn = sub.add_parser("plan", help="programación de producción de la demo (docs/programacion.md)")
    pn.add_argument("plant")
    pn.add_argument("--from", dest="first", help="primer día (ISO); por defecto el 1 del mes en curso")
    pn.add_argument("--to", dest="last", help="último día (ISO); por defecto hoy + 30 días")
    pn.add_argument("--back", default="month", help="month o Nd (p. ej. 7d) para el inicio por defecto")
    pn.add_argument("--json", action="store_true")
    args = ap.parse_args(argv)
    lib = Library()
    commands = {"list": cmd_list, "validate": cmd_validate, "run": cmd_run, "plant": cmd_plant, "catalog": cmd_catalog, "plan": cmd_plan}
    return commands[args.cmd](lib, args)


if __name__ == "__main__":
    sys.exit(main())
