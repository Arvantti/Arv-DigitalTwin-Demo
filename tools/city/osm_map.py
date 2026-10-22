"""Render an OpenStreetMap XML extract as a clipped, attributed SVG basemap."""

from __future__ import annotations

import html
import math
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any

# Roads open to motor traffic; pedestrian/cycle-only ways are intentionally omitted.
ROAD_STYLES = {
    "motorway": ("#d98783", 8.0),
    "motorway_link": ("#d98783", 5.0),
    "trunk": ("#df9d83", 7.0),
    "trunk_link": ("#df9d83", 4.5),
    "primary": ("#e7a96a", 6.5),
    "primary_link": ("#e7a96a", 4.2),
    "secondary": ("#e9c979", 5.5),
    "secondary_link": ("#e9c979", 4.0),
    "tertiary": ("#f2e0a9", 4.2),
    "tertiary_link": ("#f2e0a9", 3.5),
    "unclassified": ("#ffffff", 3.1),
    "residential": ("#ffffff", 3.1),
    "living_street": ("#ffffff", 3.1),
    "service": ("#e3e4e0", 2.2),
}
LABEL_ROADS = {"motorway", "trunk", "primary", "secondary", "tertiary"}


def _inside(lat: float, lon: float, bbox: tuple[float, float, float, float]) -> bool:
    south, west, north, east = bbox
    return south <= lat <= north and west <= lon <= east


def _clip_segment(
    a: tuple[float, float], b: tuple[float, float], bbox: tuple[float, float, float, float]
) -> tuple[tuple[float, float], tuple[float, float]] | None:
    """Liang–Barsky clip; points are (lat, lon)."""
    south, west, north, east = bbox
    lat1, lon1 = a
    lat2, lon2 = b
    dx, dy = lon2 - lon1, lat2 - lat1
    p = (-dx, dx, -dy, dy)
    q = (lon1 - west, east - lon1, lat1 - south, north - lat1)
    lo, hi = 0.0, 1.0
    for pi, qi in zip(p, q, strict=True):
        if abs(pi) < 1e-15:
            if qi < 0:
                return None
            continue
        t = qi / pi
        if pi < 0:
            lo = max(lo, t)
        else:
            hi = min(hi, t)
        if lo > hi:
            return None
    return ((lat1 + lo * dy, lon1 + lo * dx), (lat1 + hi * dy, lon1 + hi * dx))


def _way_paths(points: list[tuple[float, float]], bbox: tuple[float, float, float, float]) -> list[list[tuple[float, float]]]:
    paths: list[list[tuple[float, float]]] = []
    current: list[tuple[float, float]] = []
    for a, b in zip(points, points[1:], strict=False):
        clipped = _clip_segment(a, b, bbox)
        if clipped is None:
            if len(current) > 1:
                paths.append(current)
            current = []
            continue
        start, end = clipped
        if current and abs(current[-1][0] - start[0]) < 1e-10 and abs(current[-1][1] - start[1]) < 1e-10:
            current.append(end)
        else:
            if len(current) > 1:
                paths.append(current)
            current = [start, end]
        # An endpoint on the map edge means the next outside segment must not join across the map.
        if not _inside(*b, bbox):
            if len(current) > 1:
                paths.append(current)
            current = []
    if len(current) > 1:
        paths.append(current)
    return paths


def parse_osm(path: Path, bbox: tuple[float, float, float, float]) -> tuple[list[dict[str, Any]], list[tuple[float, float]]]:
    root = ET.parse(path).getroot()
    nodes: dict[str, tuple[float, float]] = {}
    signals: list[tuple[float, float]] = []
    for node in root.findall("node"):
        point = (float(node.get("lat", "0")), float(node.get("lon", "0")))
        nodes[node.get("id", "")] = point
        if _inside(*point, bbox) and any(t.get("k") == "highway" and t.get("v") == "traffic_signals" for t in node.findall("tag")):
            signals.append(point)

    roads: list[dict[str, Any]] = []
    for way in root.findall("way"):
        tags = {t.get("k", ""): t.get("v", "") for t in way.findall("tag")}
        highway = tags.get("highway", "")
        if highway not in ROAD_STYLES or tags.get("area") == "yes":
            continue
        if tags.get("access") in {"no", "private"} or tags.get("motor_vehicle") in {"no", "private"}:
            continue
        points = [nodes[nd.get("ref", "")] for nd in way.findall("nd") if nd.get("ref", "") in nodes]
        if len(points) < 2:
            continue
        paths = _way_paths(points, bbox)
        if paths:
            roads.append(
                {
                    "id": way.get("id", ""),
                    "highway": highway,
                    "name": tags.get("name") or tags.get("ref") or "",
                    "oneway": tags.get("oneway") in {"yes", "1", "true", "-1"},
                    "reverse": tags.get("oneway") == "-1",
                    "paths": paths,
                }
            )
    return roads, signals


def render_svg(path: Path, bbox_values: list[float], title: str = "Centro de Medellín — OpenStreetMap") -> str:
    south, west, north, east = map(float, bbox_values)
    bbox = (south, west, north, east)
    roads, signals = parse_osm(path, bbox)
    mid_lat = (south + north) / 2
    width_m = (east - west) * 111_320 * math.cos(math.radians(mid_lat))
    height_m = (north - south) * 110_540
    pad, view_w, view_h = 38.0, 1280.0, 900.0
    scale = min((view_w - 2 * pad) / width_m, (view_h - 2 * pad) / height_m)
    draw_w, draw_h = width_m * scale, height_m * scale
    left, top = (view_w - draw_w) / 2, (view_h - draw_h) / 2

    def project(lat: float, lon: float) -> tuple[float, float]:
        x = left + (lon - west) * 111_320 * math.cos(math.radians(mid_lat)) * scale
        y = top + (north - lat) * 110_540 * scale
        return x, y

    out = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {view_w:.0f} {view_h:.0f}" role="img" aria-labelledby="title desc">',
        f'<title id="title">{html.escape(title)}</title>',
        (
            '<desc id="desc">Trazado vial basado en OpenStreetMap; geometría y clasificación '
            'de vías del extracto indicado.</desc>'
        ),
        '<rect width="100%" height="100%" fill="#f5f4ef"/>',
        (
            '<defs><filter id="halo"><feMorphology in="SourceAlpha" operator="dilate" '
            'radius="2" result="d"/><feColorMatrix in="d" values="0 0 0 0 1 0 0 0 0 1 '
            '0 0 0 0 1 0 0 0 1 0" result="h"/><feMerge><feMergeNode in="h"/>'
            '<feMergeNode in="SourceGraphic"/></feMerge></filter></defs>'
        ),
    ]
    label_candidates: dict[str, tuple[float, str, list[tuple[float, float]]]] = {}
    for road in roads:
        color, width = ROAD_STYLES[road["highway"]]
        for points in road["paths"]:
            xy = [project(lat, lon) for lat, lon in points]
            d = "M" + " L".join(f"{x:.2f},{y:.2f}" for x, y in xy)
            out.append(
                (
                    f'<path d="{d}" fill="none" stroke="#fff" '
                    f'stroke-width="{width + 2.2:.2f}" stroke-linecap="round" '
                    'stroke-linejoin="round"/>'
                )
            )
            out.append(
                (
                    f'<path d="{d}" fill="none" stroke="{color}" '
                    f'stroke-width="{width:.2f}" stroke-linecap="round" '
                    'stroke-linejoin="round"/>'
                )
            )
            if road["oneway"] and len(xy) > 2:
                i = len(xy) // 2
                ax, ay = xy[i - 1]
                bx, by = xy[i]
                if road["reverse"]:
                    ax, ay, bx, by = bx, by, ax, ay
                out.append(
                    (
                        f'<path d="M{ax:.1f},{ay:.1f} L{bx:.1f},{by:.1f}" '
                        'fill="none" stroke="#665b4a" stroke-width="1.1" '
                        'marker-end="url(#arrow)"/>'
                    )
                )
            length = sum(math.dist(xy[i], xy[i + 1]) for i in range(len(xy) - 1))
            name = road["name"]
            if name and road["highway"] in LABEL_ROADS and length > 85:
                if name not in label_candidates or label_candidates[name][0] < length:
                    label_candidates[name] = (length, road["highway"], xy)
    out.insert(
        4,
        (
            '<defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" '
            'markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10z" '
            'fill="#665b4a"/></marker></defs>'
        ),
    )

    for name, (_, highway, xy) in sorted(label_candidates.items()):
        length = sum(math.dist(xy[i], xy[i + 1]) for i in range(len(xy) - 1))
        target = length / 2
        for a, b in zip(xy, xy[1:], strict=False):
            seg = math.dist(a, b)
            if target <= seg:
                frac = target / max(seg, 1e-9)
                x, y = a[0] + frac * (b[0] - a[0]), a[1] + frac * (b[1] - a[1])
                angle = math.degrees(math.atan2(b[1] - a[1], b[0] - a[0]))
                if angle > 90 or angle < -90:
                    angle += 180
                break
            target -= seg
        else:
            continue
        size = 13 if highway in {"motorway", "trunk", "primary"} else 11
        out.append(
            (
                f'<text x="{x:.1f}" y="{y - 6:.1f}" font-size="{size}" '
                'font-weight="600" text-anchor="middle" fill="#4a463d" '
                f'filter="url(#halo)" transform="rotate({angle:.1f} {x:.1f} {y:.1f})">'
                f'{html.escape(name)}</text>'
            )
        )

    for lat, lon in signals:
        x, y = project(lat, lon)
        out.append(
            (
                f'<circle cx="{x:.1f}" cy="{y:.1f}" r="3.2" fill="#d4433f" '
                'stroke="#fff" stroke-width="1.2"><title>Semáforo OSM</title></circle>'
            )
        )

    # OSM extract bounding box, drawn in a fine blue outline for geographic context.
    corners = [project(north, west), project(north, east), project(south, east), project(south, west)]
    out.append(
        '<polygon points="'
        + " ".join(f"{x:.1f},{y:.1f}" for x, y in corners)
        + '" fill="none" stroke="#7592a4" stroke-width="1.2" '
        + 'stroke-dasharray="5 4"/>'
    )
    legend_y = view_h - 47
    out.extend(
        [
            '<rect x="22" y="18" width="1236" height="48" rx="8" fill="#ffffff" fill-opacity=".9"/>',
            f'<text x="40" y="49" font-size="21" font-weight="700" fill="#202c32">{html.escape(title)}</text>',
            (
                f'<text x="36" y="{legend_y:.0f}" font-size="12" fill="#4e565a">'
                'Vías y geometría: OpenStreetMap · puntos rojos: semáforos mapeados · '
                'escala geográfica real</text>'
            ),
            (
                f'<text x="36" y="{view_h - 25:.0f}" font-size="11" fill="#4e565a">'
                '© OpenStreetMap contributors · ODbL 1.0 · '
                'openstreetmap.org/copyright</text>'
            ),
            "</svg>",
        ]
    )
    return "\n".join(out)
