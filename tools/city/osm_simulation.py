"""Run a lightweight vehicle-animation scenario on the directed OSM-derived SUMO network.

This deliberately samples 1,200 trips from the assumed daily profile. It is a visual scenario,
not a traffic-volume estimate or a calibrated full-day run.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import random
import subprocess
import sys
import xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
FCD_PERIOD_S = 20
spec = importlib.util.spec_from_file_location("city_scene_data", HERE / "city_scene.py")
city_scene = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = city_scene
spec.loader.exec_module(city_scene)


def sumo_home() -> Path:
    import sumo
    return Path(sumo.SUMO_HOME)


def write(path: Path, root: ET.Element) -> None:
    ET.indent(root)
    path.write_text(ET.tostring(root, encoding="unicode") + "\n", encoding="utf-8")


def build_net(model: dict, build: Path) -> Path:
    build.mkdir(parents=True, exist_ok=True)
    nodes = ET.Element("nodes")
    signal_ids = {signal["id"] for signal in model["signals"]}
    junction_ids = {j["id"] for j in model["junctions"]}
    for j in model["junctions"]:
        node_type = "traffic_light" if j["id"] in signal_ids else "priority"
        ET.SubElement(nodes, "node", id=j["id"], x=str(j["x"]), y=str(j["z"]), type=node_type)
    seen = set(junction_ids)
    for seg in model["segments"]:
        for node_id, x, y in ((seg["from"], seg["points"][0][0], seg["points"][0][1]),
                              (seg["to"], seg["points"][-1][0], seg["points"][-1][1])):
            if node_id not in seen:
                ET.SubElement(nodes, "node", id=node_id, x=str(x), y=str(y), type="priority")
                seen.add(node_id)
    edges = ET.Element("edges")
    used = set()
    for seg in model["segments"]:
        if seg["id"] in used or seg["from"] == seg["to"]:
            continue
        used.add(seg["id"])
        attrs = {"id": seg["id"], "from": seg["from"], "to": seg["to"],
                 "numLanes": str(max(1, int(seg["lanes"]))), "speed": str(max(4.17, seg["speedKmh"] / 3.6)),
                 "priority": "3"}
        # Preserve the OSM centerline shape; SUMO models this as a directed edge.
        shape = " ".join(f"{x:.2f},{y:.2f}" for x, y in seg["points"])
        attrs["shape"] = shape
        ET.SubElement(edges, "edge", attrs)
    write(build / "osm.nod.xml", nodes)
    write(build / "osm.edg.xml", edges)
    net = build / "osm.net.xml"
    subprocess.run([str(sumo_home() / "bin" / "netconvert"), "--node-files", str(build / "osm.nod.xml"),
                    "--edge-files", str(build / "osm.edg.xml"), "--output-file", str(net),
                    "--no-turnarounds", "true", "--tls.default-type", "static", "--junctions.corner-detail", "3", "--no-warnings", "true"],
                   check=True, capture_output=True, text=True)
    return net


def make_demand(model: dict, demand: dict, build: Path, count: int, seed: int, from_hour: int, duration_minutes: int) -> tuple[Path, dict[str, int]]:
    rng = random.Random(seed)
    edges = ET.parse(build / "osm.net.xml").getroot().findall("edge")
    candidates = [e for e in edges if not e.get("function") and e.get("from") and e.get("to")]
    starts = [e for e in candidates if e.get("from") in {j["id"] for j in model["junctions"]}]
    ends = [e for e in candidates if e.get("to") in {j["id"] for j in model["junctions"]}]
    if len(starts) < 2 or len(ends) < 2:
        raise RuntimeError("La red OSM no ofrece suficientes extremos conectados para generar viajes")
    types = demand["vehicle_mix"]
    type_counts: Counter[str] = Counter()
    routes = ET.Element("routes")
    for v in types:
        attrs = dict(id=v["type"], vClass={"moto":"motorcycle", "moto-domicilio":"motorcycle", "carro":"passenger", "taxi":"taxi", "carga-liviana":"delivery", "bus":"bus", "carga-pesada":"truck"}[v["type"]],
                     length=str(v["length_m"]), width=str(v["width_m"]), accel="2.5", decel="4.5", sigma="0.5", minGap="1.2")
        if v.get("lane_filtering"):
            attrs.update(latAlignment="arbitrary", minGapLat="0.5", lcSublane="5", maxSpeedLat="1.5")
        ET.SubElement(routes, "vType", attrs)
    duration_s = duration_minutes * 60
    if not 0 <= from_hour < 24 or not 1 <= duration_minutes <= (24 - from_hour) * 60:
        raise ValueError("La ventana de simulación debe estar entre 0 y 24 h")
    # duarouter rejects some disconnected origin/destination pairs in this clipped extract; oversample candidates,
    # then report only trips that actually received a route.
    candidate_count = round(count * 1.65)
    departures = sorted((from_hour * 3600 + rng.random() * duration_s, i) for i in range(candidate_count))
    for depart, idx in departures:
        origin, dest = rng.choice(starts), rng.choice(ends)
        if origin.get("from") == dest.get("to"):
            continue
        hour = int(depart // 3600) % 24
        franja = next(f for f in demand["franjas"] if f["from_h"] <= hour < f["to_h"])
        pico_placa = demand.get("pico_y_placa", {})
        effective = []
        for vehicle_type in types:
            pct = vehicle_type["pct"]
            if franja["id"] in vehicle_type.get("banned_franjas", []):
                pct = 0
            if vehicle_type["type"] in pico_placa.get("applies_to", []) and pico_placa.get("from_h", 24) <= hour < pico_placa.get("to_h", 0):
                pct *= 1 - pico_placa.get("removed_pct", 0) / 100
            effective.append(pct)
        typ = rng.choices(types, weights=effective)[0]["type"]
        type_counts[typ] += 1
        ET.SubElement(routes, "trip", id=f"osm{idx:05d}", type=typ, depart=f"{depart:.1f}",
                      departLane="best", departSpeed="max", **{"from": origin.get("id", ""), "to": dest.get("id", "")})
    trip_file = build / "trips.rou.xml"
    write(trip_file, routes)
    routed = build / "routed.rou.xml"
    subprocess.run([str(sumo_home() / "bin" / "duarouter"), "--net-file", str(build / "osm.net.xml"),
                    "--route-files", str(trip_file), "--output-file", str(routed), "--ignore-errors", "true",
                    "--no-warnings", "true", "--seed", str(seed)], check=True, capture_output=True, text=True)
    type_counts = Counter(v.get("type", "carro") for v in ET.parse(routed).getroot().findall("vehicle"))
    return routed, dict(type_counts)


def run(folder: Path, build: Path, out: Path, count: int, seed: int, from_hour: int, duration_minutes: int) -> None:
    network_cfg = __import__("yaml").safe_load((folder / "network.yaml").read_text(encoding="utf-8"))
    demand = __import__("yaml").safe_load((folder / "demand.yaml").read_text(encoding="utf-8"))
    osm_path = (folder / network_cfg["map_source"]["file"]).resolve()
    model = city_scene.build_scene(osm_path, network_cfg["map_source"]["bbox"])
    build_net(model, build)
    routed, type_counts = make_demand(model, demand, build, count, seed, from_hour, duration_minutes)
    cfg = ET.Element("configuration")
    inp = ET.SubElement(cfg, "input")
    ET.SubElement(inp, "net-file", value="osm.net.xml")
    ET.SubElement(inp, "route-files", value=routed.name)
    tm = ET.SubElement(cfg, "time")
    ET.SubElement(tm, "begin", value=str(from_hour * 3600))
    ET.SubElement(tm, "end", value=str(from_hour * 3600 + duration_minutes * 60 + 1800))
    ET.SubElement(tm, "step-length", value="1")
    proc = ET.SubElement(cfg, "processing")
    ET.SubElement(proc, "time-to-teleport", value="300")
    ET.SubElement(proc, "lateral-resolution", value="0.8")
    out_cfg = ET.SubElement(cfg, "output")
    ET.SubElement(out_cfg, "fcd-output", value="fcd.xml")
    ET.SubElement(out_cfg, "device.fcd.period", value=str(FCD_PERIOD_S))
    ET.SubElement(out_cfg, "device.fcd.probability", value="1")
    ET.SubElement(out_cfg, "no-step-log", value="true")
    write(build / "city.sumocfg", cfg)
    subprocess.run([str(sumo_home() / "bin" / "sumo"), "-c", "city.sumocfg", "--seed", str(seed), "--no-warnings", "true"],
                   cwd=build, check=True, capture_output=True, text=True)
    net_root = ET.parse(build / "osm.net.xml").getroot()
    net_offset = net_root.find("location").get("netOffset", "0,0").split(",")
    offset_x, offset_y = float(net_offset[0]), float(net_offset[1])
    frames = []
    speed_by_edge: dict[str, list[float]] = {}
    for timestep in ET.parse(build / "fcd.xml").getroot().iter("timestep"):
        time = float(timestep.get("time", "0"))
        vehicles = []
        for v in timestep.findall("vehicle"):
            lane = v.get("lane", "")
            edge = lane.rsplit("_", 1)[0] if "_" in lane else lane
            speed = float(v.get("speed", "0"))
            if edge:
                speed_by_edge.setdefault(edge, []).append(speed * 3.6)
            vehicles.append({"id": v.get("id", ""), "type": v.get("type", "carro"),
                             "x": round(float(v.get("x", "0")) - offset_x, 2), "y": round(float(v.get("y", "0")) - offset_y, 2),
                             "angle": round(float(v.get("angle", "0")) * 3.141592653589793 / 180, 4),
                             "speed": round(speed, 2), "edge": edge})
        frames.append({"time": time, "vehicles": vehicles})
    result = {"schema": "city-trajectory-v1", "duration": frames[-1]["time"] if frames else 0,
              "interval": FCD_PERIOD_S, "sampledTrips": sum(type_counts.values()), "windowMinutes": duration_minutes,
              "assumedHourlyDemand": round(sum(type_counts.values()) * 60 / duration_minutes), "assumed": True,
              "note": "Escenario visual con demanda triplicada respecto al supuesto base; no representa aforos reales.",
              "types": type_counts,
              "roadSpeeds": {edge: {"meanKmh": round(sum(values) / len(values), 1), "samples": len(values)}
                             for edge, values in speed_by_edge.items()},
              "frames": frames}
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Wrote {len(frames)} frames from {sum(len(f['vehicles']) for f in frames)} vehicle observations to {out}")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("folder", type=Path, default=Path("city-models/centro-medellin-v1"), nargs="?")
    ap.add_argument("--build", type=Path, default=Path("city-models/centro-medellin-v1/osm-build"))
    ap.add_argument("--out", type=Path, default=Path("apps/gallery/public/data/ciudad-trayectorias.json"))
    ap.add_argument("--trips", type=int, default=3825, help="target routed trips for the 15-minute x3 visual sample (assumed, not measured volume)")
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--from-hour", type=int, default=7, help="start hour for the visual sample")
    ap.add_argument("--minutes", type=int, default=15, help="duration of departures; trips are spread uniformly over this window")
    args = ap.parse_args()
    run(args.folder, args.build, args.out, args.trips, args.seed, args.from_hour, args.minutes)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
