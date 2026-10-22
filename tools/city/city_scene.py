"""Prepare compact, georeferenced OSM geometry for the interactive 3D city twin."""

from __future__ import annotations

import argparse
import json
import math
import re
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path
from typing import Any

MOTOR_ROADS = {
    "motorway",
    "motorway_link",
    "trunk",
    "trunk_link",
    "primary",
    "primary_link",
    "secondary",
    "secondary_link",
    "tertiary",
    "tertiary_link",
    "unclassified",
    "residential",
    "living_street",
    "service",
}
DEFAULT_LANES = {
    "motorway": 3,
    "motorway_link": 1,
    "trunk": 3,
    "trunk_link": 1,
    "primary": 2,
    "primary_link": 1,
    "secondary": 2,
    "secondary_link": 1,
    "tertiary": 1,
    "tertiary_link": 1,
    "unclassified": 1,
    "residential": 1,
    "living_street": 1,
    "service": 1,
}
DEFAULT_SPEED = {
    "motorway": 60,
    "motorway_link": 40,
    "trunk": 50,
    "trunk_link": 35,
    "primary": 40,
    "primary_link": 30,
    "secondary": 35,
    "secondary_link": 25,
    "tertiary": 30,
    "tertiary_link": 25,
    "unclassified": 25,
    "residential": 25,
    "living_street": 15,
    "service": 15,
}


def _tags(element: ET.Element) -> dict[str, str]:
    return {tag.get("k", ""): tag.get("v", "") for tag in element.findall("tag")}


def _number(value: str | None) -> float | None:
    if not value:
        return None
    match = re.search(r"-?\d+(?:[.,]\d+)?", value)
    if not match:
        return None
    result = float(match.group(0).replace(",", "."))
    if "ft" in value.lower() or "'" in value:
        result *= 0.3048
    return result


def _clip_segment(a: tuple[float, float], b: tuple[float, float], bbox: tuple[float, float, float, float]):
    """Liang–Barsky clip for WGS84 points (lat, lon)."""
    south, west, north, east = bbox
    lat1, lon1 = a
    lat2, lon2 = b
    dx, dy = lon2 - lon1, lat2 - lat1
    p, q = (-dx, dx, -dy, dy), (lon1 - west, east - lon1, lat1 - south, north - lat1)
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


def _inside(p: tuple[float, float], bbox: tuple[float, float, float, float]) -> bool:
    south, west, north, east = bbox
    return south <= p[0] <= north and west <= p[1] <= east


def _clipped_paths(refs: list[str], nodes: dict[str, tuple[float, float]], bbox: tuple[float, float, float, float]):
    paths: list[list[tuple[str | None, float, float]]] = []
    current: list[tuple[str | None, float, float]] = []
    for rid_a, rid_b in zip(refs, refs[1:], strict=False):
        if rid_a not in nodes or rid_b not in nodes:
            if len(current) > 1:
                paths.append(current)
            current = []
            continue
        a, b = nodes[rid_a], nodes[rid_b]
        clipped = _clip_segment(a, b, bbox)
        if clipped is None:
            if len(current) > 1:
                paths.append(current)
            current = []
            continue
        start, end = clipped
        start_id = rid_a if start == a else None
        end_id = rid_b if end == b else None
        if current and abs(current[-1][1] - start[0]) < 1e-10 and abs(current[-1][2] - start[1]) < 1e-10:
            current.append((end_id, end[0], end[1]))
        else:
            if len(current) > 1:
                paths.append(current)
            current = [(start_id, start[0], start[1]), (end_id, end[0], end[1])]
        if end_id is None:
            if len(current) > 1:
                paths.append(current)
            current = []
    if len(current) > 1:
        paths.append(current)
    return paths


def _lanes(tags: dict[str, str], direction: str, oneway: bool, highway: str) -> tuple[int, bool]:
    key = f"lanes:{direction}"
    value = _number(tags.get(key))
    if value is not None and value > 0:
        return max(1, round(value)), False
    total = _number(tags.get("lanes"))
    if total is not None and total > 0:
        if oneway:
            return max(1, round(total)), False
        return max(1, math.ceil(total / 2) if direction == "forward" else math.floor(total / 2)), False
    return max(1, DEFAULT_LANES.get(highway, 1)), True


def build_scene(osm_path: Path, bbox_values: list[float]) -> dict[str, Any]:
    south, west, north, east = map(float, bbox_values)
    bbox = (south, west, north, east)
    root = ET.parse(osm_path).getroot()
    coords: dict[str, tuple[float, float]] = {}
    node_tags: dict[str, dict[str, str]] = {}
    for node in root.findall("node"):
        node_id = node.get("id", "")
        coords[node_id] = (float(node.get("lat", "0")), float(node.get("lon", "0")))
        node_tags[node_id] = _tags(node)

    ways: list[tuple[ET.Element, dict[str, str], list[str]]] = []
    uses: dict[str, set[str]] = defaultdict(set)
    for way in root.findall("way"):
        tags = _tags(way)
        highway = tags.get("highway", "")
        if highway not in MOTOR_ROADS or tags.get("area") == "yes":
            continue
        if tags.get("access") in {"no", "private"} or tags.get("motor_vehicle") in {"no", "private"}:
            continue
        refs = [nd.get("ref", "") for nd in way.findall("nd")]
        if len(refs) < 2 or not any(ref in coords and _inside(coords[ref], bbox) for ref in refs):
            continue
        way_id = way.get("id", "")
        ways.append((way, tags, refs))
        for ref in refs:
            uses[ref].add(way_id)

    center_lat, center_lon = (south + north) / 2, (west + east) / 2
    cos_lat = math.cos(math.radians(center_lat))

    def project(lat: float, lon: float) -> tuple[float, float]:
        # Local metric frame: x east, z north. The scene maps north to Three.js -Z.
        return ((lon - center_lon) * 111_320 * cos_lat, (lat - center_lat) * 110_540)

    signal_points = {
        node_id for node_id, tags in node_tags.items() if tags.get("highway") == "traffic_signals" and _inside(coords[node_id], bbox)
    }
    junction_ids = {node_id for node_id, members in uses.items() if len(members) > 1}
    key_nodes = junction_ids | signal_points
    road_parts: list[dict[str, Any]] = []
    segments: list[dict[str, Any]] = []
    node_index: dict[str, tuple[float, float]] = {}

    def emit_segment(
        way_id: str, tags: dict[str, str], refs: list[str], part_index: int, points: list[tuple[str | None, float, float]]
    ) -> None:
        if len(points) < 2:
            return
        xy = [project(lat, lon) for _, lat, lon in points]
        length = sum(math.dist(xy[i], xy[i + 1]) for i in range(len(xy) - 1))
        if length < 3:
            return
        highway = tags["highway"]
        oneway_tag = tags.get("oneway", "")
        oneway = oneway_tag in {"yes", "1", "true", "-1"}
        name = tags.get("name") or tags.get("ref") or ""
        width_f, assumed_f = _lanes(tags, "forward", oneway, highway)
        width_b, assumed_b = _lanes(tags, "backward", oneway, highway)
        lane_count = max(width_f, width_b)
        speed = _number(tags.get("maxspeed"))
        speed_assumed = speed is None
        speed = speed if speed is not None else DEFAULT_SPEED[highway]
        coords_list = [[round(x, 2), round(z, 2)] for x, z in xy]
        part_id = f"{way_id}:{part_index}"
        road_parts.append(
            {
                "id": part_id,
                "way": way_id,
                "name": name,
                "class": highway,
                "points": coords_list,
                "width": round(max(3.0, lane_count * 3.15), 2),
                "lanes": lane_count,
                "lanesAssumed": assumed_f or assumed_b,
                "oneway": oneway,
                "reverse": oneway_tag == "-1",
            }
        )
        from_id, to_id = points[0][0], points[-1][0]
        if from_id is None or to_id is None:
            return
        for node_id in (from_id, to_id):
            if node_id in coords:
                node_index[node_id] = project(*coords[node_id])

        def add_directed(suffix: str, a: str, b: str, line: list[list[float]], lanes: int, lane_assumed: bool):
            segments.append(
                {
                    "id": f"{part_id}:{suffix}",
                    "part": part_id,
                    "way": way_id,
                    "from": a,
                    "to": b,
                    "points": line,
                    "class": highway,
                    "name": name,
                    "lanes": lanes,
                    "lanesAssumed": lane_assumed,
                    "speedKmh": round(speed, 1),
                    "speedAssumed": speed_assumed,
                }
            )

        if oneway_tag == "-1":
            add_directed("b", to_id, from_id, list(reversed(coords_list)), width_b, assumed_b)
        else:
            add_directed("f", from_id, to_id, coords_list, width_f, assumed_f)
            if not oneway:
                add_directed("b", to_id, from_id, list(reversed(coords_list)), width_b, assumed_b)

    for way, tags, refs in ways:
        wid = way.get("id", "")
        paths = _clipped_paths(refs, coords, bbox)
        part_index = 0
        for path in paths:
            chunk: list[tuple[str | None, float, float]] = []
            for point in path:
                chunk.append(point)
                if point[0] in key_nodes and len(chunk) > 1:
                    emit_segment(wid, tags, refs, part_index, chunk)
                    part_index += 1
                    chunk = [point]
            if len(chunk) > 1:
                emit_segment(wid, tags, refs, part_index, chunk)
                part_index += 1

    signals = [
        {"id": node_id, "x": round(project(*coords[node_id])[0], 2), "z": round(project(*coords[node_id])[1], 2)}
        for node_id in sorted(signal_points)
    ]
    junctions = [
        {
            "id": node_id,
            "x": round(project(*coords[node_id])[0], 2),
            "z": round(project(*coords[node_id])[1], 2),
            "signal": node_id in signal_points,
        }
        for node_id in sorted(junction_ids)
        if node_id in coords and _inside(coords[node_id], bbox)
    ]

    buildings: list[dict[str, Any]] = []
    for way in root.findall("way"):
        tags = _tags(way)
        if not tags.get("building") or tags.get("building") == "no":
            continue
        refs = [nd.get("ref", "") for nd in way.findall("nd")]
        if len(refs) < 4 or refs[0] != refs[-1] or any(ref not in coords or not _inside(coords[ref], bbox) for ref in refs):
            continue
        polygon = [project(*coords[ref]) for ref in refs[:-1]]
        area = abs(
            sum(
                polygon[i][0] * polygon[(i + 1) % len(polygon)][1] - polygon[(i + 1) % len(polygon)][0] * polygon[i][1]
                for i in range(len(polygon))
            )
            / 2
        )
        if area < 12:
            continue
        raw_height = _number(tags.get("height"))
        levels = _number(tags.get("building:levels"))
        if raw_height is not None and raw_height > 2:
            height, height_source = min(raw_height, 90), "osm:height"
        elif levels is not None and levels > 0:
            height, height_source = min(levels * 3.1, 90), "osm:building:levels"
        else:
            # Visible fallback is explicitly tagged as an estimate, never as measured height.
            height = 7 + (int(way.get("id", "0")) % 7) * 2.2
            height_source = "estimated"
        buildings.append(
            {
                "id": way.get("id", ""),
                "name": tags.get("name", ""),
                "kind": tags.get("building", "yes"),
                "points": [[round(x, 2), round(z, 2)] for x, z in polygon],
                "height": round(height, 1),
                "heightSource": height_source,
            }
        )

    # OSM footprints occasionally overlap the mapped carriageway; exclude those whole footprints
    # from the visual extrusion rather than drawing traffic through a solid-looking building.
    def inside_polygon(point: list[float], polygon: list[list[float]]) -> bool:
        x, y = point
        inside = False
        for i, (x1, y1) in enumerate(polygon):
            x2, y2 = polygon[(i + 1) % len(polygon)]
            if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
                inside = not inside
        return inside

    filtered_buildings = []
    for building in buildings:
        polygon = building["points"]
        bx = (min(p[0] for p in polygon), max(p[0] for p in polygon))
        bz = (min(p[1] for p in polygon), max(p[1] for p in polygon))
        overlaps_road = False
        for road in road_parts:
            rp = road["points"]
            if (
                max(p[0] for p in rp) < bx[0]
                or min(p[0] for p in rp) > bx[1]
                or max(p[1] for p in rp) < bz[0]
                or min(p[1] for p in rp) > bz[1]
            ):
                continue
            if any(inside_polygon(point, polygon) for point in rp):
                overlaps_road = True
                break
            for a, b in zip(rp, rp[1:], strict=False):
                length = math.dist(a, b)
                samples = max(1, math.ceil(length / 3.0))
                if any(
                    inside_polygon([a[0] + (b[0] - a[0]) * i / samples, a[1] + (b[1] - a[1]) * i / samples], polygon)
                    for i in range(1, samples)
                ):
                    overlaps_road = True
                    break
            if overlaps_road:
                break
        if not overlaps_road:
            filtered_buildings.append(building)
    buildings = filtered_buildings

    all_points = [point for part in road_parts for point in part["points"]]
    if not all_points:
        raise ValueError("El extracto no contiene vías transitables en el bbox configurado")
    xs, zs = [p[0] for p in all_points], [p[1] for p in all_points]
    return {
        "schema": "city-scene-v1",
        "source": "OpenStreetMap",
        "attribution": "© OpenStreetMap contributors · ODbL 1.0 · openstreetmap.org/copyright",
        "bounds": {
            "south": south,
            "west": west,
            "north": north,
            "east": east,
            "width": round(max(xs) - min(xs), 1),
            "height": round(max(zs) - min(zs), 1),
        },
        "counts": {
            "roadParts": len(road_parts),
            "directedSegments": len(segments),
            "buildings": len(buildings),
            "trafficSignals": len(signals),
            "junctions": len(junctions),
        },
        "roadParts": road_parts,
        "segments": segments,
        "buildings": buildings,
        "signals": signals,
        "junctions": junctions,
    }


def filter_buildings_on_trajectories(scene: dict[str, Any], trajectory_path: Path) -> int:
    """Remove OSM footprints that overlap observed SUMO vehicle paths to prevent visual collisions."""
    if not trajectory_path.is_file():
        return 0
    trajectory = json.loads(trajectory_path.read_text(encoding="utf-8"))
    cell_size = 20.0
    buckets: dict[tuple[int, int], list[tuple[float, float]]] = defaultdict(list)
    for frame in trajectory.get("frames", []):
        for vehicle in frame.get("vehicles", []):
            point = (float(vehicle["x"]), float(vehicle["y"]))
            buckets[(math.floor(point[0] / cell_size), math.floor(point[1] / cell_size))].append(point)

    def inside(point: tuple[float, float], polygon: list[list[float]]) -> bool:
        x, y = point
        result = False
        for i, (x1, y1) in enumerate(polygon):
            x2, y2 = polygon[(i + 1) % len(polygon)]
            if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
                result = not result
        return result

    retained = []
    removed = 0
    for building in scene["buildings"]:
        polygon = building["points"]
        min_x, max_x = min(p[0] for p in polygon), max(p[0] for p in polygon)
        min_y, max_y = min(p[1] for p in polygon), max(p[1] for p in polygon)
        collided = False
        for gx in range(math.floor(min_x / cell_size), math.floor(max_x / cell_size) + 1):
            for gy in range(math.floor(min_y / cell_size), math.floor(max_y / cell_size) + 1):
                if any(inside(point, polygon) for point in buckets.get((gx, gy), [])):
                    collided = True
                    break
            if collided:
                break
        if collided:
            removed += 1
        else:
            retained.append(building)
    scene["buildings"] = retained
    scene["counts"]["buildings"] = len(retained)
    scene["counts"]["buildingsOmittedForTraffic"] = removed
    return removed


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--osm", type=Path, default=Path("city-models/map.osm"))
    parser.add_argument("--network", type=Path, default=Path("city-models/centro-medellin-v1/network.yaml"))
    parser.add_argument("--out", type=Path, default=Path("apps/gallery/public/data/ciudad-modelo.json"))
    parser.add_argument("--tracks", type=Path, default=Path("apps/gallery/public/data/ciudad-trayectorias.json"))
    args = parser.parse_args()
    import yaml

    config = yaml.safe_load(args.network.read_text(encoding="utf-8"))
    scene = build_scene(args.osm, config["map_source"]["bbox"])
    removed = filter_buildings_on_trajectories(scene, args.tracks)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(scene, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"3D city asset: {scene['counts']} (removed {removed} building footprints intersecting vehicle paths) -> {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
