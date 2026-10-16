"""Valida un plant.yaml y genera su plano 2D en SVG.

Uso:
    python tools/layout/render_layout.py industrial-models/<planta>/plant.yaml [-o salida.svg]

Comprobaciones:
    - Zonas dentro del predio y sin solaparse entre sí.
    - Cada equipo dentro de su zona y sin solaparse con otro (salvo overhead: true).
    - Pasarelas (walkways) dentro de su zona y bajo su cubierta.
    - Flujos, líneas y recetas solo referencian ids existentes.
Termina con código 1 si hay errores.
"""

from __future__ import annotations

import argparse
import html
import math
import sys
from dataclasses import dataclass
from pathlib import Path

import yaml

EPS = 1e-6

ZONE_COLORS = {
    # por clase higiénica (plantas de proceso)
    "dirty": "#e9dcc3",
    "clean": "#cfe3f2",
    "high_care": "#b9d7b1",
    "service": "#e3e3e3",
    "admin": "#efe7f5",
    "exterior": "#f4f4ef",
    # por tipo de zona (plantas discretas)
    "production": "#cfe3f2",
    "storage": "#e9dcc3",
    "utility": "#e3e3e3",
    "airlock": "#d9ecd4",
}
ZONE_LABELS = {
    "dirty": "Zona sucia",
    "clean": "Zona limpia",
    "high_care": "Alto cuidado",
    "service": "Servicios",
    "admin": "Administración",
    "exterior": "Exterior",
    "production": "Producción",
    "storage": "Almacenamiento",
    "utility": "Servicios industriales",
    "airlock": "Esclusa",
}
ROUND_TYPES = ("silo", "tank", "kettle", "emulsifier", "cooling_tower")


@dataclass(frozen=True)
class Rect:
    x: float
    y: float
    w: float
    h: float

    @property
    def x2(self) -> float:
        return self.x + self.w

    @property
    def y2(self) -> float:
        return self.y + self.h

    @property
    def cx(self) -> float:
        return self.x + self.w / 2

    @property
    def cy(self) -> float:
        return self.y + self.h / 2

    @property
    def area(self) -> float:
        return self.w * self.h

    def overlaps(self, o: Rect) -> bool:
        return self.x < o.x2 - EPS and o.x < self.x2 - EPS and self.y < o.y2 - EPS and o.y < self.y2 - EPS

    def contains(self, o: Rect) -> bool:
        return o.x >= self.x - EPS and o.y >= self.y - EPS and o.x2 <= self.x2 + EPS and o.y2 <= self.y2 + EPS


def equipment_rect(eq: dict) -> Rect:
    dx, dy = eq["footprint"][0], eq["footprint"][1]
    if int(round(eq.get("rotation_deg", 0))) % 180 == 90:
        dx, dy = dy, dx
    x, y = eq["position"][0], eq["position"][1]
    return Rect(x - dx / 2, y - dy / 2, dx, dy)


def _split_by_comma(node: object, path: str, errors: list[str]) -> None:
    """Detecta claves creadas por una coma sin comillas dentro de un mapa { ... } de YAML."""
    if isinstance(node, dict):
        for k, v in node.items():
            if v is None and " " in str(k):
                errors.append(f"{path}: texto con coma sin comillas cerca de {k!r}")
            _split_by_comma(v, f"{path}.{k}", errors)
    elif isinstance(node, list):
        for i, v in enumerate(node):
            _split_by_comma(v, f"{path}[{v.get('id', i) if isinstance(v, dict) else i}]", errors)


def validate(plant: dict) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    _split_by_comma(plant, "plant.yaml", errors)
    site = Rect(0, 0, plant["plant"]["site"]["width_x"], plant["plant"]["site"]["length_y"])

    zones = {z["id"]: Rect(*z["rect"]) for z in plant["zones"]}
    if len(zones) != len(plant["zones"]):
        errors.append("ids de zona duplicados")
    zone_items = list(zones.items())
    for i, (zid, zr) in enumerate(zone_items):
        if not site.contains(zr):
            errors.append(f"zona {zid} sale del predio")
        for oid, orr in zone_items[i + 1 :]:
            if zr.overlaps(orr):
                errors.append(f"zonas solapadas: {zid} / {oid}")

    eq_rects: dict[str, Rect] = {}
    for eq in plant["equipment"]:
        eid = eq["id"]
        if eid in eq_rects:
            errors.append(f"id de equipo duplicado: {eid}")
        r = equipment_rect(eq)
        eq_rects[eid] = r
        zr = zones.get(eq["zone"])
        if zr is None:
            errors.append(f"{eid}: zona inexistente {eq['zone']}")
        elif not zr.contains(r):
            errors.append(f"{eid}: sale de su zona {eq['zone']}")

    ground = [e for e in plant["equipment"] if not e.get("overhead")]
    for i, a in enumerate(ground):
        for b in ground[i + 1 :]:
            if eq_rects[a["id"]].overlaps(eq_rects[b["id"]]):
                errors.append(f"equipos solapados: {a['id']} / {b['id']}")

    for aisle in plant.get("aisles") or []:
        ar = Rect(*aisle["rect"])
        for e in ground:
            if eq_rects[e["id"]].overlaps(ar):
                warnings.append(f"{e['id']} invade el pasillo {aisle['id']}")

    zone_heights = {z["id"]: z.get("height") for z in plant["zones"]}
    walkway_ids: set[str] = set()
    for w in plant.get("walkways") or []:
        wid = w["id"]
        if wid in walkway_ids:
            errors.append(f"id de pasarela duplicado: {wid}")
        walkway_ids.add(wid)
        zr = zones.get(w["zone"])
        if zr is None:
            errors.append(f"pasarela {wid}: zona inexistente {w['zone']}")
        if len(w["path"]) < 2:
            errors.append(f"pasarela {wid}: el eje necesita al menos 2 puntos")
        if w["width"] <= 0 or w["elevation"] <= 0:
            errors.append(f"pasarela {wid}: ancho y elevación deben ser positivos")
        for px, py in [*w["path"], *(w.get("access") or [])]:
            if zr is not None and not (zr.x <= px <= zr.x2 and zr.y <= py <= zr.y2):
                errors.append(f"pasarela {wid}: el punto [{px}, {py}] sale de su zona {w['zone']}")
        roof = zone_heights.get(w["zone"]) or 0
        if roof and w["elevation"] >= roof:
            errors.append(f"pasarela {wid}: la elevación {w['elevation']} no cabe bajo la cubierta de {w['zone']}")
        for e in ground:
            clearance = e["footprint"][2] if len(e.get("footprint", [])) > 2 else 0
            if clearance < w["elevation"]:
                continue
            for (ax, ay), (bx, by) in zip(w["path"], w["path"][1:], strict=False):
                half = w["width"] / 2
                seg = Rect(min(ax, bx) - half, min(ay, by) - half, abs(bx - ax) + w["width"], abs(by - ay) + w["width"])
                if eq_rects[e["id"]].overlaps(seg):
                    warnings.append(f"pasarela {wid} cruza {e['id']}, que es más alto que la pasarela")

    ids = set(eq_rects) | set(zones)
    for f in plant.get("flows") or []:
        for end in ("from", "to"):
            if f[end] not in ids:
                errors.append(f"flujo {f['from']} → {f['to']}: id inexistente {f[end]}")
    for line in plant.get("lines") or []:
        for eid in line["equipment"]:
            if eid not in eq_rects:
                errors.append(f"línea {line['id']}: equipo inexistente {eid}")
    for rcp in plant.get("recipes") or []:
        total = sum(rcp.get("formula_pct", {}).values())
        if abs(total - 100) > 0.05:
            errors.append(f"receta {rcp['id']}: la fórmula suma {total:.2f} %")
        for ph in rcp["phases"]:
            if ph["equipment"] not in eq_rects:
                errors.append(f"receta {rcp['id']}: equipo inexistente {ph['equipment']}")
    return errors, warnings


def summary(plant: dict) -> list[str]:
    by_kind: dict[str, float] = {}
    for z in plant["zones"]:
        by_kind[z["kind"]] = by_kind.get(z["kind"], 0) + Rect(*z["rect"]).area
    roofed = sum(a for k, a in by_kind.items() if k != "exterior")
    lines = [f"  {k:<12} {a:>8.0f} m²" for k, a in sorted(by_kind.items())]
    lines.append(f"  {'cubierta':<12} {roofed:>8.0f} m²")
    types: dict[str, int] = {}
    for e in plant["equipment"]:
        types[e["type"]] = types.get(e["type"], 0) + 1
    lines.append(f"  equipos: {len(plant['equipment'])} ({len(types)} tipos)")
    return lines


def render_svg(plant: dict) -> str:
    meta = plant["plant"]
    W, L = meta["site"]["width_x"], meta["site"]["length_y"]
    scale = max(6.0, min(14.0, 1400 / W))
    pad, title_h, legend_h = 30, 50, 70
    width = W * scale + 2 * pad
    height = L * scale + 2 * pad + title_h + legend_h
    process = meta.get("kind") == "process"

    def sx(x: float) -> float:
        return pad + x * scale

    def sy(y: float) -> float:
        return pad + title_h + (L - y) * scale

    out: list[str] = []
    a = out.append
    a(
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width:.0f}" height="{height:.0f}" '
        f'viewBox="0 0 {width:.0f} {height:.0f}" font-family="Inter, Helvetica, Arial, sans-serif">'
    )
    a(
        "<defs>"
        '<pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">'
        '<line x1="0" y1="0" x2="0" y2="6" stroke="#d4a017" stroke-width="1.2" stroke-opacity="0.45"/></pattern>'
        '<marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
        '<path d="M0,0 L10,5 L0,10 z" fill="#c2410c"/></marker>'
        "</defs>"
    )
    a('<rect width="100%" height="100%" fill="#ffffff"/>')
    a(
        f'<text x="{pad}" y="{pad + 18}" font-size="20" font-weight="700" fill="#1f2937">{html.escape(meta["name"])}</text>'
    )
    a(
        f'<text x="{pad}" y="{pad + 38}" font-size="12" fill="#4b5563">'
        f'{html.escape(meta["id"])} · {"manufactura por procesos" if process else "manufactura discreta"} · '
        f"predio {W} × {L} m · datos de referencia, no de una planta real</text>"
    )
    # predio
    a(
        f'<rect x="{sx(0)}" y="{sy(L)}" width="{W * scale}" height="{L * scale}" fill="#fbfbf8" '
        f'stroke="#9ca3af" stroke-dasharray="6 4"/>'
    )

    # zonas
    for z in plant["zones"]:
        r = Rect(*z["rect"])
        key = z.get("hygiene_class") if process else z["kind"]
        if z["kind"] == "airlock":
            key = "airlock"
        fill = ZONE_COLORS.get(key, "#eeeeee")
        a(
            f'<rect x="{sx(r.x):.1f}" y="{sy(r.y2):.1f}" width="{r.w * scale:.1f}" height="{r.h * scale:.1f}" '
            f'fill="{fill}" stroke="#6b7280" stroke-width="1"/>'
        )
        label = z["name"]
        # ajusta la fuente al ancho de la zona; si no cabe, recorta con "…"
        fs = max(7.0, min(11.0, (r.w * scale - 8) / (len(label) * 0.58)))
        max_chars = int((r.w * scale - 8) / (fs * 0.58))
        if len(label) > max_chars:
            label = label[: max(1, max_chars - 1)] + "…"
        a(
            f'<text x="{sx(r.x) + 4:.1f}" y="{sy(r.y2) + fs + 3:.1f}" font-size="{fs}" font-weight="600" '
            f'fill="#374151">{html.escape(label)}</text>'
        )
        if z.get("temperature_c") is not None and z["kind"] != "exterior":
            a(
                f'<text x="{sx(r.x) + 4:.1f}" y="{sy(r.y2) + 2 * fs + 5:.1f}" font-size="{fs - 1}" '
                f'fill="#6b7280">{z["temperature_c"]} °C</text>'
            )

    # pasillos
    for aisle in plant.get("aisles") or []:
        r = Rect(*aisle["rect"])
        a(
            f'<rect x="{sx(r.x):.1f}" y="{sy(r.y2):.1f}" width="{r.w * scale:.1f}" height="{r.h * scale:.1f}" '
            f'fill="url(#hatch)" stroke="none"/>'
        )

    # pasarelas elevadas
    for wk in plant.get("walkways") or []:
        pts = " ".join(f"{sx(px):.1f},{sy(py):.1f}" for px, py in wk["path"])
        a(
            f'<polyline points="{pts}" fill="none" stroke="#d4a017" stroke-width="{wk["width"] * scale:.1f}" '
            f'stroke-opacity="0.55" stroke-linejoin="round"><title>{html.escape(wk["name"])} · +{wk["elevation"]} m</title></polyline>'
        )
        for px, py in wk.get("access") or []:
            r_acc = max(3.0, 0.5 * scale)
            a(f'<circle cx="{sx(px):.1f}" cy="{sy(py):.1f}" r="{r_acc:.1f}" fill="#92400e"><title>Escalera de acceso</title></circle>')

    # equipos
    for eq in plant["equipment"]:
        r = equipment_rect(eq)
        x, y, w, h = sx(r.x), sy(r.y2), r.w * scale, r.h * scale
        if eq.get("overhead"):
            a(
                f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" fill="none" '
                f'stroke="#7c3aed" stroke-width="1.2" stroke-dasharray="8 4"/>'
            )
            a(
                f'<text x="{x + w - 4:.1f}" y="{y + h - 4:.1f}" font-size="9" text-anchor="end" fill="#7c3aed">'
                f'{html.escape(eq["id"])} (elevado)</text>'
            )
            continue
        round_ = any(t in eq["type"] for t in ROUND_TYPES) and abs(r.w - r.h) < 0.5
        if round_:
            a(
                f'<circle cx="{x + w / 2:.1f}" cy="{y + h / 2:.1f}" r="{min(w, h) / 2:.1f}" fill="#64748b" '
                f'fill-opacity="0.85" stroke="#1f2937" stroke-width="0.8"/>'
            )
        else:
            fill = "#1d4ed8" if eq["type"] == "injection_molding_machine" else "#475569"
            a(
                f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="1.5" fill="{fill}" '
                f'fill-opacity="0.85" stroke="#1f2937" stroke-width="0.8"/>'
            )
        tip = eq["id"] + " · " + eq["type"]
        a(f"<title>{html.escape(tip)}</title>")
        label = eq["id"]
        fs = 7.5
        text_w = len(label) * fs * 0.58
        if text_w <= w - 2 and h >= fs + 1:
            a(
                f'<text x="{x + w / 2:.1f}" y="{y + h / 2 + fs / 3:.1f}" font-size="{fs}" text-anchor="middle" '
                f'fill="#ffffff">{html.escape(label)}</text>'
            )
        elif text_w <= h - 2 and w >= fs + 1:
            cx, cy = x + w / 2, y + h / 2
            a(
                f'<text x="{cx:.1f}" y="{cy + fs / 3:.1f}" font-size="{fs}" text-anchor="middle" fill="#ffffff" '
                f'transform="rotate(-90 {cx:.1f} {cy:.1f})">{html.escape(label)}</text>'
            )
        else:
            a(
                f'<text x="{x + w / 2:.1f}" y="{y - 2:.1f}" font-size="{fs - 0.5}" text-anchor="middle" '
                f'fill="#111827">{html.escape(label)}</text>'
            )

    # flujos principales
    rects = {e["id"]: equipment_rect(e) for e in plant["equipment"]}
    rects.update({z["id"]: Rect(*z["rect"]) for z in plant["zones"]})
    for f in plant.get("flows") or []:
        if not f.get("show"):
            continue
        r1, r2 = rects[f["from"]], rects[f["to"]]
        x1, y1, x2, y2 = sx(r1.cx), sy(r1.cy), sx(r2.cx), sy(r2.cy)
        dist = math.hypot(x2 - x1, y2 - y1)
        if dist < 1:
            continue
        # recorta la flecha para que no tape los equipos
        shrink = min(10.0, dist / 4)
        ux, uy = (x2 - x1) / dist, (y2 - y1) / dist
        a(
            f'<line x1="{x1 + ux * shrink:.1f}" y1="{y1 + uy * shrink:.1f}" x2="{x2 - ux * shrink:.1f}" '
            f'y2="{y2 - uy * shrink:.1f}" stroke="#c2410c" stroke-width="1.6" stroke-opacity="0.8" '
            f'marker-end="url(#arrow)"><title>{html.escape(f["medium"])}: {f["rate"]} {html.escape(str(f["unit"]))}</title></line>'
        )

    # leyenda
    ly = sy(0) + 22
    used = []
    for z in plant["zones"]:
        key = "airlock" if z["kind"] == "airlock" else (z.get("hygiene_class") if process else z["kind"])
        if key not in used:
            used.append(key)
    lx = pad
    for key in used:
        a(f'<rect x="{lx}" y="{ly}" width="14" height="14" fill="{ZONE_COLORS.get(key, "#eee")}" stroke="#6b7280"/>')
        a(f'<text x="{lx + 19}" y="{ly + 11}" font-size="11" fill="#374151">{ZONE_LABELS.get(key, key)}</text>')
        lx += 30 + len(ZONE_LABELS.get(key, key)) * 6.5
    ly2 = ly + 24
    lx = pad
    items = [
        ('<rect x="{x}" y="{y}" width="14" height="10" fill="#475569"/>', "Equipo"),
        ('<circle cx="{cx}" cy="{cy}" r="6" fill="#64748b"/>', "Tanque / silo"),
    ]
    if any(e["type"] == "injection_molding_machine" for e in plant["equipment"]):
        items.insert(0, ('<rect x="{x}" y="{y}" width="14" height="10" fill="#1d4ed8"/>', "Inyectora"))
    if plant.get("aisles"):
        items.append(('<rect x="{x}" y="{y}" width="14" height="10" fill="url(#hatch)" stroke="#d4a017"/>', "Pasillo montacargas"))
    if plant.get("walkways"):
        items.append(('<rect x="{x}" y="{y}" width="14" height="10" fill="#d4a017" fill-opacity="0.55"/>', "Pasarela elevada"))
    if any(e.get("overhead") for e in plant["equipment"]):
        items.append(('<rect x="{x}" y="{y}" width="14" height="10" fill="none" stroke="#7c3aed" stroke-dasharray="4 2"/>', "Puente grúa"))
    arrow = '<line x1="{x}" y1="{cy}" x2="{x2}" y2="{cy}" stroke="#c2410c" stroke-width="1.6" marker-end="url(#arrow)"/>'
    items.append((arrow, "Flujo principal"))
    for tpl, text in items:
        a(tpl.format(x=lx, y=ly2 + 2, cx=lx + 7, cy=ly2 + 7, x2=lx + 16))
        a(f'<text x="{lx + 21}" y="{ly2 + 11}" font-size="11" fill="#374151">{text}</text>')
        lx += 34 + len(text) * 6.5

    # barra de escala y norte
    bar_m = 20 if W > 120 else 10
    bx, by = width - pad - bar_m * scale, ly + 6
    a(f'<rect x="{bx:.1f}" y="{by}" width="{bar_m * scale / 2:.1f}" height="6" fill="#111827"/>')
    a(f'<rect x="{bx + bar_m * scale / 2:.1f}" y="{by}" width="{bar_m * scale / 2:.1f}" height="6" fill="#ffffff" stroke="#111827"/>')
    a(f'<text x="{bx:.1f}" y="{by + 20}" font-size="10" fill="#374151">0</text>')
    a(f'<text x="{bx + bar_m * scale:.1f}" y="{by + 20}" font-size="10" text-anchor="end" fill="#374151">{bar_m} m</text>')
    nx, ny = width - pad - 12, pad + 12
    a(f'<path d="M{nx},{ny - 10} L{nx + 7},{ny + 10} L{nx},{ny + 5} L{nx - 7},{ny + 10} z" fill="#111827"/>')
    a(f'<text x="{nx}" y="{ny + 24}" font-size="11" font-weight="700" text-anchor="middle" fill="#111827">N</text>')
    a("</svg>")
    return "\n".join(out)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("plant_yaml", type=Path)
    ap.add_argument("-o", "--output", type=Path, help="SVG de salida (por defecto: layout.svg junto al YAML)")
    args = ap.parse_args()

    plant = yaml.safe_load(args.plant_yaml.read_text(encoding="utf-8"))
    errors, warnings = validate(plant)
    print(f"{plant['plant']['id']}:")
    print("\n".join(summary(plant)))
    for w in warnings:
        print(f"  AVISO: {w}")
    for e in errors:
        print(f"  ERROR: {e}")
    if errors:
        return 1
    out = args.output or args.plant_yaml.with_name("layout.svg")
    out.write_text(render_svg(plant), encoding="utf-8")
    print(f"  plano: {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
