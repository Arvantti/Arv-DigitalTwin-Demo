"""Red vial del gemelo de ciudad: valida network.yaml + demand.yaml y dibuja el plano en SVG.

Uso:
    uv run python tools/city/network.py city-models/centro-medellin-v1 [-o plano.svg]

Comprobaciones:
    - Ids únicos, posiciones distintas y sentidos válidos.
    - Semáforos sobre cruces existentes, con un plan para cada franja cuyos tiempos cierran el ciclo.
    - Franjas que cubren de 0 a 24 h sin huecos; perfil horario y mezcla de vehículos que suman 100.
    - Desde cada puerta de entrada se llega a cada puerta de salida y a cada atractor (red bien conectada).
Termina con código 1 si hay errores. Sin argumento -o escribe layout.svg en la carpeta del modelo.
"""

from __future__ import annotations

import argparse
import html
import importlib.util
import sys
from collections import deque
from dataclasses import dataclass, field
from pathlib import Path

import yaml

FORWARD = {"north", "east"}   # sentido creciente del eje de la calle
BACKWARD = {"south", "west"}
SENTIDOS = {"carreras": {"both", "north", "south"}, "calles": {"both", "east", "west"}}


@dataclass
class Node:
    id: str
    x: float
    y: float
    kind: str  # intersection | gate


@dataclass
class Link:
    a: str
    b: str
    street: str
    lanes: int
    speed_kmh: float
    length_m: float


@dataclass
class Graph:
    nodes: dict[str, Node] = field(default_factory=dict)
    links: list[Link] = field(default_factory=list)

    def out(self) -> dict[str, list[str]]:
        adj: dict[str, list[str]] = {n: [] for n in self.nodes}
        for lk in self.links:
            adj[lk.a].append(lk.b)
        return adj

    def entry_gates(self) -> dict[str, int]:
        """Puertas por las que se entra, con sus carriles de entrada."""
        res: dict[str, int] = {}
        for lk in self.links:
            if self.nodes[lk.a].kind == "gate":
                res[lk.a] = res.get(lk.a, 0) + lk.lanes
        return res

    def exit_gates(self) -> dict[str, int]:
        res: dict[str, int] = {}
        for lk in self.links:
            if self.nodes[lk.b].kind == "gate":
                res[lk.b] = res.get(lk.b, 0) + lk.lanes
        return res


def load(folder: Path) -> tuple[dict, dict]:
    net = yaml.safe_load((folder / "network.yaml").read_text(encoding="utf-8"))
    demand = yaml.safe_load((folder / "demand.yaml").read_text(encoding="utf-8"))
    if net.get("map_source", {}).get("file"):
        net["_osm_source_path"] = (folder / net["map_source"]["file"]).resolve()
    return net, demand


def _add(g: Graph, a: str, b: str, street: dict, length: float, forward: bool) -> None:
    s = street["sentido"]
    if s == "both" or s in FORWARD:
        if forward or s == "both":
            g.links.append(Link(a, b, street["id"], street["lanes"], street["speed_kmh"], length))
    if s == "both" or s in BACKWARD:
        g.links.append(Link(b, a, street["id"], street["lanes"], street["speed_kmh"], length))


def build_graph(net: dict) -> Graph:
    g = Graph()
    cras = sorted(net["streets"]["carreras"], key=lambda s: s["x"])
    cls = sorted(net["streets"]["calles"], key=lambda s: s["y"])
    gl = net.get("gate_length_m", 100)
    for c in cras:
        for k in cls:
            nid = f"{c['id']}-{k['id']}"
            g.nodes[nid] = Node(nid, c["x"], k["y"], "intersection")
    y0, y1 = cls[0]["y"] - gl, cls[-1]["y"] + gl
    x0, x1 = cras[0]["x"] - gl, cras[-1]["x"] + gl
    for c in cras:
        g.nodes[f"{c['id']}-s"] = Node(f"{c['id']}-s", c["x"], y0, "gate")
        g.nodes[f"{c['id']}-n"] = Node(f"{c['id']}-n", c["x"], y1, "gate")
        chain = [f"{c['id']}-s"] + [f"{c['id']}-{k['id']}" for k in cls] + [f"{c['id']}-n"]
        for a, b in zip(chain, chain[1:], strict=False):
            _add(g, a, b, c, abs(g.nodes[b].y - g.nodes[a].y), forward=True)
    for k in cls:
        g.nodes[f"{k['id']}-w"] = Node(f"{k['id']}-w", x0, k["y"], "gate")
        g.nodes[f"{k['id']}-e"] = Node(f"{k['id']}-e", x1, k["y"], "gate")
        chain = [f"{k['id']}-w"] + [f"{c['id']}-{k['id']}" for c in cras] + [f"{k['id']}-e"]
        for a, b in zip(chain, chain[1:], strict=False):
            _add(g, a, b, k, abs(g.nodes[b].x - g.nodes[a].x), forward=True)
    for i, e in enumerate(net.get("extra_links") or []):
        a, b = e["from"], e["to"]
        if a not in g.nodes or b not in g.nodes:
            continue  # lo reporta validate()
        na, nb = g.nodes[a], g.nodes[b]
        length = e.get("length_m") or ((na.x - nb.x) ** 2 + (na.y - nb.y) ** 2) ** 0.5
        sid = e.get("id", f"extra-{i}")
        g.links.append(Link(a, b, sid, e["lanes"], e["speed_kmh"], length))
        if e.get("sentido", "one") == "both":
            g.links.append(Link(b, a, sid, e["lanes"], e["speed_kmh"], length))
    return g


def _reach(adj: dict[str, list[str]], start: str) -> set[str]:
    seen, q = {start}, deque([start])
    while q:
        for nb in adj[q.popleft()]:
            if nb not in seen:
                seen.add(nb)
                q.append(nb)
    return seen


def validate(net: dict, demand: dict) -> list[str]:
    errs: list[str] = []
    streets = net["streets"]
    ids = [s["id"] for grp in ("carreras", "calles") for s in streets[grp]]
    if len(ids) != len(set(ids)):
        errs.append("ids de calle repetidos")
    for grp, axis in (("carreras", "x"), ("calles", "y")):
        pos = [s[axis] for s in streets[grp]]
        if len(pos) != len(set(pos)):
            errs.append(f"{grp}: dos calles en la misma posición")
        for s in streets[grp]:
            if s["sentido"] not in SENTIDOS[grp]:
                errs.append(f"{s['id']}: sentido '{s['sentido']}' no vale para {grp}")
            if s["lanes"] < 1 or s["speed_kmh"] <= 0:
                errs.append(f"{s['id']}: carriles y velocidad deben ser positivos")
    g = build_graph(net)
    for e in net.get("extra_links") or []:
        for end in (e["from"], e["to"]):
            if end not in g.nodes:
                errs.append(f"tramo adicional: el nodo '{end}' no existe")

    franjas = demand["franjas"]
    fids = [f["id"] for f in franjas]
    hour = 0
    for f in sorted(franjas, key=lambda f: f["from_h"]):
        if f["from_h"] != hour or f["to_h"] <= f["from_h"]:
            errs.append(f"franja {f['id']}: debe empezar a las {hour} h y terminar después")
        hour = f["to_h"]
    if hour != 24:
        errs.append("las franjas deben terminar a las 24 h")

    t = net["signal_timing"]
    lost = 2 * (t["amber_s"] + t["all_red_s"])
    for pid, plan in net["plans"].items():
        for fid in fids:
            if fid not in plan:
                errs.append(f"plan {pid}: falta la franja {fid}")
                continue
            p = plan[fid]
            if p["green_ns"] + p["green_eo"] + lost != p["cycle_s"]:
                errs.append(f"plan {pid}/{fid}: verdes + {lost} s perdidos no suman el ciclo de {p['cycle_s']} s")
    seen_sig: set[str] = set()
    for s in net.get("signals") or []:
        if s["node"] not in g.nodes or g.nodes[s["node"]].kind != "intersection":
            errs.append(f"semáforo en '{s['node']}': no es un cruce")
        if s["node"] in seen_sig:
            errs.append(f"semáforo repetido en {s['node']}")
        seen_sig.add(s["node"])
        if s["plan"] not in net["plans"]:
            errs.append(f"semáforo en {s['node']}: plan '{s['plan']}' no existe")

    if len(demand["hourly_pct"]) != 24:
        errs.append("hourly_pct debe tener 24 valores")
    if abs(sum(demand["hourly_pct"]) - 100) > 0.01:
        errs.append(f"hourly_pct suma {sum(demand['hourly_pct']):.2f}, no 100")
    mix = sum(v["pct"] for v in demand["vehicle_mix"])
    if abs(mix - 100) > 0.01:
        errs.append(f"vehicle_mix suma {mix}, no 100")
    for v in demand["vehicle_mix"]:
        for fid in v.get("banned_franjas", []):
            if fid not in fids:
                errs.append(f"{v['type']}: franja prohibida '{fid}' no existe")
    for a in demand.get("attractors", []):
        if a["node"] not in g.nodes:
            errs.append(f"atractor en '{a['node']}': el nodo no existe")

    adj = g.out()
    entries, exits = g.entry_gates(), g.exit_gates()
    if not entries or not exits:
        errs.append("la red necesita puertas de entrada y de salida")
    targets = set(exits) | {a["node"] for a in demand.get("attractors", []) if a["node"] in g.nodes}
    for gate in entries:
        missing = targets - _reach(adj, gate)
        if missing:
            errs.append(f"desde la puerta {gate} no se llega a: {', '.join(sorted(missing))}")
    return errs


def summary(net: dict, demand: dict) -> dict:
    g = build_graph(net)
    inter = [n for n in g.nodes.values() if n.kind == "intersection"]
    hourly = [round(p / 100 * demand["daily_entries"]) for p in demand["hourly_pct"]]
    cap = demand["capacity_veh_h"]
    entries = g.entry_gates()
    total = sum(entries.values())
    return {
        "intersections": len(inter),
        "signals": len(net.get("signals") or []),
        "entry_gates": len(entries),
        "exit_gates": len(g.exit_gates()),
        "directed_links": len(g.links),
        "lane_km": round(sum(lk.lanes * lk.length_m for lk in g.links) / 1000, 1),
        "peak_veh_h": max(hourly),
        "peak_hour": hourly.index(max(hourly)),
        "hours_over_capacity": [h for h, v in enumerate(hourly) if v > cap],
        "entry_share_pct": {gid: round(lanes / total * 100, 1) for gid, lanes in sorted(entries.items())},
    }


# ---------------------------------------------------------------- plano SVG

def render_svg(net: dict, demand: dict) -> str:
    map_source = net.get("map_source") or {}
    source_path = net.get("_osm_source_path")
    if source_path and Path(source_path).is_file():
        module = sys.modules.get("city_osm_map")
        if module is None:
            spec = importlib.util.spec_from_file_location("city_osm_map", Path(__file__).with_name("osm_map.py"))
            if spec is None or spec.loader is None:
                raise RuntimeError("no se puede cargar tools/city/osm_map.py")
            module = importlib.util.module_from_spec(spec)
            sys.modules["city_osm_map"] = module
            spec.loader.exec_module(module)
        return module.render_svg(Path(source_path), map_source["bbox"], net.get("map_title", net["name"]))
    g = build_graph(net)
    lw = net.get("lane_width_m", 3.3)
    xs = [n.x for n in g.nodes.values()]
    ys = [n.y for n in g.nodes.values()]
    pad, s = 60, 0.8
    w = (max(xs) - min(xs)) * s + 2 * pad
    h = (max(ys) - min(ys)) * s + 2 * pad + 40

    def px(x: float) -> float:
        return (x - min(xs)) * s + pad

    def py(y: float) -> float:
        return (max(ys) - y) * s + pad + 30

    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.0f} {h:.0f}" font-family="sans-serif">',
           f'<rect width="{w:.0f}" height="{h:.0f}" fill="#eef0ea"/>',
           f'<text x="{pad}" y="28" font-size="16" font-weight="600" fill="#222">{html.escape(net["name"])}: '
           f'{sum(1 for n in g.nodes.values() if n.kind == "intersection")} cruces, '
           f'{len(net.get("signals") or [])} con semáforo (trazado aproximado)</text>']
    cras = net["streets"]["carreras"]
    cls = net["streets"]["calles"]
    # manzanas
    sx = sorted(c["x"] for c in cras)
    sy = sorted(k["y"] for k in cls)
    for x0, x1 in zip(sx, sx[1:], strict=False):
        for y0, y1 in zip(sy, sy[1:], strict=False):
            m = 14
            out.append(f'<rect x="{px(x0) + m:.1f}" y="{py(y1) + m:.1f}" width="{(x1 - x0) * s - 2 * m:.1f}" '
                       f'height="{(y1 - y0) * s - 2 * m:.1f}" rx="3" fill="#d9d4c7"/>')
    # vías
    for grp, items in (("carreras", cras), ("calles", cls)):
        for st in items:
            n_lanes = st["lanes"] * (2 if st["sentido"] == "both" else 1)
            width = max(4.0, n_lanes * lw * s)
            if grp == "carreras":
                x = px(st["x"])
                line = f'x1="{x:.1f}" x2="{x:.1f}" y1="{py(max(ys)):.1f}" y2="{py(min(ys)):.1f}"'
            else:
                y = py(st["y"])
                line = f'x1="{px(min(xs)):.1f}" x2="{px(max(xs)):.1f}" y1="{y:.1f}" y2="{y:.1f}"'
            out.append(f'<line {line} stroke="#6b6e73" stroke-width="{width:.1f}"/>')
            if st.get("median"):
                out.append(f'<line {line} stroke="#9bb98a" stroke-width="1.5"/>')
    # sentido único: flechas a mitad de cada tramo
    for lk in g.links:
        st_one = next((st for grp in ("carreras", "calles") for st in net["streets"][grp]
                       if st["id"] == lk.street and st["sentido"] != "both"), None)
        if not st_one:
            continue
        a, b = g.nodes[lk.a], g.nodes[lk.b]
        mx, my = px((a.x + b.x) / 2), py((a.y + b.y) / 2)
        dx, dy = (b.x - a.x), -(b.y - a.y)
        norm = (dx * dx + dy * dy) ** 0.5 or 1
        ux, uy = dx / norm * 6, dy / norm * 6
        out.append(f'<path d="M{mx - ux:.1f} {my - uy:.1f} L{mx + ux:.1f} {my + uy:.1f}" stroke="#fff" '
                   f'stroke-width="1.6" marker-end="url(#a)"/>')
    out.insert(1, '<defs><marker id="a" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" '
                  'orient="auto"><path d="M0 0L10 5L0 10z" fill="#fff"/></marker></defs>')
    # semáforos, atractores y puertas
    sig = {sg["node"] for sg in net.get("signals") or []}
    for n in g.nodes.values():
        if n.kind == "intersection":
            fill = "#d23c3c" if n.id in sig else "#f2f2f2"
            out.append(f'<circle cx="{px(n.x):.1f}" cy="{py(n.y):.1f}" r="4.5" fill="{fill}" stroke="#333" stroke-width="0.8"/>')
    for a in demand.get("attractors", []):
        n = g.nodes[a["node"]]
        out.append(f'<text x="{px(n.x) + 8:.1f}" y="{py(n.y) - 8:.1f}" font-size="10" fill="#5a3e8c">'
                   f'{html.escape(a["name"])}</text>')
    entries, exits = g.entry_gates(), g.exit_gates()
    for gid in sorted(set(entries) | set(exits)):
        n = g.nodes[gid]
        kind = "E/S" if gid in entries and gid in exits else ("E" if gid in entries else "S")
        color = "#1f6fd1" if kind != "S" else "#7a7a7a"
        out.append(f'<rect x="{px(n.x) - 9:.1f}" y="{py(n.y) - 7:.1f}" width="18" height="14" rx="3" fill="{color}"/>'
                   f'<text x="{px(n.x):.1f}" y="{py(n.y) + 3.5:.1f}" font-size="8" text-anchor="middle" fill="#fff">{kind}</text>')
    # nombres
    for c in cras:
        out.append(f'<text x="{px(c["x"]):.1f}" y="{py(max(ys)) - 14:.1f}" font-size="10" text-anchor="middle" '
                   f'fill="#222">{html.escape(c["name"].split(" (")[0])}</text>')
    for k in cls:
        out.append(f'<text x="{px(min(xs)) + 14:.1f}" y="{py(k["y"]) - 8:.1f}" font-size="10" fill="#222">'
                   f'{html.escape(k["name"].split(" (")[0])}</text>')
    out.append(f'<text x="{pad}" y="{h - 10:.0f}" font-size="10" fill="#444">Rojo = cruce con semáforo · blanco = pare '
               f'o prioridad · E entrada, S salida, E/S ambas · flechas = sentido único · línea verde = separador</text>')
    out.append("</svg>")
    return "\n".join(out)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("folder", type=Path)
    ap.add_argument("-o", "--out", type=Path)
    args = ap.parse_args(argv)
    net, demand = load(args.folder)
    errs = validate(net, demand)
    if errs:
        for e in errs:
            print(f"ERROR {e}")
        return 1
    info = summary(net, demand)
    print(f"grafo SUMO reducido {net['id']}: {info['intersections']} cruces, {info['signals']} semáforos supuestos, "
          f"{info['entry_gates']} puertas de entrada, {info['exit_gates']} de salida, {info['lane_km']} km-carril")
    print(f"pico {info['peak_veh_h']} veh/h a las {info['peak_hour']}:00; horas sobre la capacidad: "
          f"{', '.join(f'{h}:00' for h in info['hours_over_capacity']) or 'ninguna'}")
    out = args.out or args.folder / "layout.svg"
    out.write_text(render_svg(net, demand), encoding="utf-8")
    print(f"plano: {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
