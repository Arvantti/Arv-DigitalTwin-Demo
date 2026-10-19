"""Gemelo de ciudad sobre SUMO (fase 2, D66): convierte la red y la demanda, corre el día y calcula indicadores.

Uso:
    uv sync --group city
    uv run python tools/city/sumo_city.py city-models/centro-medellin-v1 [--from-h 0 --to-h 24] [--seed 1]

Pasos:
    1. network.yaml -> nodos y tramos de SUMO -> netconvert -> red.net.xml (35 cruces, 20 semáforos).
    2. Un programa de semáforo por franja (dos fases con amarillo y todo rojo) y un WAUT que los cambia a la hora.
    3. demand.yaml -> viajes del día: tipo de vehículo por la mezcla (con pico y placa y la carga pesada fuera de
       los picos), puerta de entrada por carriles, destino interno (atractores) o puerta de salida, y afán según la franja.
    4. sumo con el modelo de subcarriles (las motos filtran entre carros) -> tripinfo, datos por tramo cada 5 min.
    5. Indicadores del panel (docs/ciudad.md, sección 6) en resultados/<corrida>.json.
Los archivos de SUMO se generan en build/ (no se versionan); el resumen de la línea base sí se versiona.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import random
import subprocess
import sys
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path

_here = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location("city_network", _here / "network.py")
network = sys.modules.get("city_network") or importlib.util.module_from_spec(_spec)
if "city_network" not in sys.modules:
    sys.modules["city_network"] = network
    _spec.loader.exec_module(network)

INTERVAL_S = 300          # datos por tramo cada 5 minutos
JAM_KMH = 5.0             # por debajo de esto un tramo cuenta como atascado
LATERAL_RESOLUTION = 0.8  # m; modelo de subcarriles para que las motos pasen entre carros

# Parámetros de SUMO por tipo de vehículo de demand.yaml (supuestos).
VCLASS = {"moto": "motorcycle", "moto-domicilio": "motorcycle", "carro": "passenger", "taxi": "taxi",
          "carga-liviana": "delivery", "bus": "bus", "carga-pesada": "truck"}
BASE_DRIVER = {  # aceleración, frenado, imperfección, factor de velocidad, separación mínima
    "moto": dict(accel=3.5, decel=6.0, sigma=0.6, speedFactor=1.1, minGap=1.0),
    "moto-domicilio": dict(accel=3.8, decel=6.5, sigma=0.7, speedFactor=1.2, minGap=0.8),
    "carro": dict(accel=2.6, decel=4.5, sigma=0.5, speedFactor=1.0, minGap=2.5),
    "taxi": dict(accel=2.8, decel=4.5, sigma=0.6, speedFactor=1.05, minGap=2.0),
    "carga-liviana": dict(accel=1.8, decel=4.0, sigma=0.5, speedFactor=0.95, minGap=2.5),
    "bus": dict(accel=1.2, decel=4.0, sigma=0.4, speedFactor=0.9, minGap=3.0),
    "carga-pesada": dict(accel=1.0, decel=3.5, sigma=0.4, speedFactor=0.85, minGap=3.0),
}


def sumo_home() -> Path:
    try:
        import sumo  # paquete eclipse-sumo
    except ImportError as exc:  # pragma: no cover - mensaje para quien no instaló el grupo
        raise SystemExit("Falta SUMO: uv sync --group city") from exc
    return Path(sumo.SUMO_HOME)


def _bin(name: str) -> str:
    return str(sumo_home() / "bin" / name)


def _write(path: Path, root: ET.Element) -> None:
    ET.indent(root)
    path.write_text(ET.tostring(root, encoding="unicode") + "\n", encoding="utf-8")


def _street_index(net: dict) -> dict[str, dict]:
    return {s["id"]: {**s, "axis": grp} for grp in ("carreras", "calles") for s in net["streets"][grp]}


def edge_id(a: str, b: str) -> str:
    return f"{a}_{b}"


# ---------------------------------------------------------------- 1. red

def build_net(net: dict, out: Path) -> Path:
    """Escribe los nodos y tramos de SUMO y llama a netconvert. Devuelve la ruta de red.net.xml."""
    out.mkdir(parents=True, exist_ok=True)
    g = network.build_graph(net)
    signals = {s["node"] for s in net.get("signals") or []}
    streets = _street_index(net)
    nodes = ET.Element("nodes")
    for n in g.nodes.values():
        kind = "traffic_light" if n.id in signals else ("priority" if n.kind == "intersection" else "dead_end")
        ET.SubElement(nodes, "node", id=n.id, x=f"{n.x:.2f}", y=f"{n.y:.2f}", type=kind)
    edges = ET.Element("edges")
    for lk in g.links:
        st = streets.get(lk.street, {"lanes": lk.lanes})
        prio = 3 if st.get("lanes", 1) >= 3 else (2 if st.get("sentido") == "both" else 1)
        ET.SubElement(edges, "edge", id=edge_id(lk.a, lk.b), **{"from": lk.a, "to": lk.b},
                      numLanes=str(lk.lanes), speed=f"{lk.speed_kmh / 3.6:.2f}", priority=str(prio))
    _write(out / "nodos.nod.xml", nodes)
    _write(out / "tramos.edg.xml", edges)
    net_file = out / "red.net.xml"
    cmd = [_bin("netconvert"), "--node-files", str(out / "nodos.nod.xml"), "--edge-files", str(out / "tramos.edg.xml"),
           "--output-file", str(net_file), "--no-turnarounds", "true", "--default.lanewidth", str(net.get("lane_width_m", 3.3)),
           "--tls.default-type", "static", "--junctions.corner-detail", "5", "--no-warnings", "true"]
    subprocess.run(cmd, check=True, capture_output=True, text=True)
    return net_file


def read_tls_links(net_file: Path) -> dict[str, list[tuple[int, str, str]]]:
    """Por semáforo: (índice del enlace, tramo de llegada, dirección) leídos de red.net.xml."""
    res: dict[str, list[tuple[int, str, str]]] = defaultdict(list)
    for c in ET.parse(net_file).getroot().iter("connection"):
        if "tl" in c.attrib:
            res[c.get("tl")].append((int(c.get("linkIndex")), c.get("from"), c.get("dir")))
    return res


def tls_programs(net: dict, demand: dict, net_file: Path) -> ET.Element:
    """Un programa por franja y semáforo, con fase de carreras (ns) y de calles (eo), y el WAUT que los cambia."""
    streets = _street_index(net)
    g = network.build_graph(net)
    link_street = {edge_id(lk.a, lk.b): lk.street for lk in g.links}
    t = net["signal_timing"]
    plans = net["plans"]
    sig_by_node = {s["node"]: s for s in net.get("signals") or []}
    add = ET.Element("additional")
    for tl, links in sorted(read_tls_links(net_file).items()):
        size = max(i for i, _, _ in links) + 1

        def state(axis: str, color: str, links=links, size=size) -> str:
            chars = ["r"] * size
            for i, from_edge, direction in links:
                if streets[link_street[from_edge]]["axis"] == axis:
                    chars[i] = ("g" if direction in ("l", "L") and color == "G" else color)
            return "".join(chars)

        sig = sig_by_node[tl]
        for f in demand["franjas"]:
            p = plans[sig["plan"]][f["id"]]
            prog = ET.SubElement(add, "tlLogic", id=tl, type="static", programID=f["id"], offset=str(sig.get("offset_s", 0)))
            for axis, green in (("carreras", p["green_ns"]), ("calles", p["green_eo"])):
                ET.SubElement(prog, "phase", duration=str(green), state=state(axis, "G"))
                ET.SubElement(prog, "phase", duration=str(t["amber_s"]), state=state(axis, "y"))
                ET.SubElement(prog, "phase", duration=str(t["all_red_s"]), state="r" * size)
    waut = ET.SubElement(add, "WAUT", refTime="0", id="franjas", startProg=demand["franjas"][0]["id"])
    for day in (0, 1):  # el WAUT no se repite solo; se escriben dos días para corridas que pasan de 24 h
        for f in sorted(demand["franjas"], key=lambda f: f["from_h"]):
            ET.SubElement(waut, "wautSwitch", time=str(day * 86400 + f["from_h"] * 3600), to=f["id"])
    for tl in sorted(read_tls_links(net_file)):
        ET.SubElement(add, "wautJunction", wautID="franjas", junctionID=tl)
    return add


# ---------------------------------------------------------------- 2. demanda

def vehicle_types(demand: dict) -> ET.Element:
    """Cada tipo en dos variantes: tranquilo y con afán (más rápido, más agresivo al cambiar de carril, re-enruta)."""
    root = ET.Element("additional")
    for v in demand["vehicle_mix"]:
        base = BASE_DRIVER[v["type"]]
        for afan in (False, True):
            attrs = dict(id=f"{v['type']}{'-afan' if afan else ''}", vClass=VCLASS[v["type"]],
                         length=str(v["length_m"]), width=str(v["width_m"]), accel=str(base["accel"]),
                         decel=str(base["decel"]), sigma=str(base["sigma"]), minGap=str(base["minGap"]),
                         speedFactor=f"norm({base['speedFactor'] * (1.15 if afan else 1.0):.2f},0.1)",
                         lcStrategic="1", lcSpeedGain=str(2.0 if afan else 1.0), lcCooperative=str(0.5 if afan else 1.0),
                         lcAssertive=str(1.8 if afan else 1.0), lcImpatience=str(0.8 if afan else 0.2),
                         jmDriveAfterRedTime="1" if afan and v.get("lane_filtering") else "-1")
            if v.get("lane_filtering"):
                attrs.update(latAlignment="arbitrary", minGapLat="0.5", lcSublane="5", maxSpeedLat="1.5")
            else:
                attrs.update(latAlignment="center", minGapLat="0.6")
            vt = ET.SubElement(root, "vType", **attrs)
            if afan:
                ET.SubElement(vt, "param", key="has.rerouting.device", value="true")
    return root


def _franja(demand: dict, hour: int) -> dict:
    return next(f for f in demand["franjas"] if f["from_h"] <= hour < f["to_h"])


def mix_for_hour(demand: dict, hour: int) -> dict[str, float]:
    """Mezcla de la hora: pico y placa quita su parte de carros y la carga pesada no circula en sus franjas prohibidas."""
    fr = _franja(demand, hour)["id"]
    ppp = demand.get("pico_y_placa") or {}
    mix = {}
    for v in demand["vehicle_mix"]:
        pct = v["pct"]
        if fr in v.get("banned_franjas", []):
            pct = 0.0
        if v["type"] in ppp.get("applies_to", []) and ppp["from_h"] <= hour < ppp["to_h"]:
            pct *= 1 - ppp["removed_pct"] / 100
        mix[v["type"]] = pct
    total = sum(mix.values())
    return {k: v / total for k, v in mix.items()}


def trips(net: dict, demand: dict, seed: int = 1, from_h: int = 0, to_h: int = 24) -> list[dict]:
    """Viajes del día con semilla fija: la misma semilla da los mismos viajes (para comparar escenarios)."""
    rng = random.Random(seed)
    g = network.build_graph(net)
    out_edges = {gid: [edge_id(lk.a, lk.b) for lk in g.links if lk.a == gid] for gid in g.entry_gates()}
    in_edges_gate = {gid: [edge_id(lk.a, lk.b) for lk in g.links if lk.b == gid] for gid in g.exit_gates()}
    entries = g.entry_gates()
    exits = g.exit_gates()
    attractors = demand.get("attractors", [])
    # destino interno: tramos que llegan al atractor desde otro cruce (el que viene de una puerta solo se usa para entrar)
    in_edges_node = {a["node"]: [edge_id(lk.a, lk.b) for lk in g.links if lk.b == a["node"] and g.nodes[lk.a].kind == "intersection"]
                     for a in attractors}
    internal = demand.get("internal_destination_pct", 0) / 100
    res = []
    for hour in range(from_h, to_h):
        n = round(demand["hourly_pct"][hour] / 100 * demand["daily_entries"])
        mix = mix_for_hour(demand, hour)
        afan = _franja(demand, hour)["afan_pct"] / 100
        departs = sorted(hour * 3600 + rng.random() * 3600 for _ in range(n))
        for k, dep in enumerate(departs):
            gate = rng.choices(list(entries), weights=list(entries.values()))[0]
            vtype = rng.choices(list(mix), weights=list(mix.values()))[0]
            if attractors and rng.random() < internal:
                a = rng.choices(attractors, weights=[x["weight"] for x in attractors])[0]
                dest, to_edge = a["node"], rng.choice(in_edges_node[a["node"]])
            else:
                street = gate.rsplit("-", 1)[0]
                options = [x for x in exits if x != gate and x.rsplit("-", 1)[0] != street] or [x for x in exits if x != gate]
                dest = rng.choices(options, weights=[exits[x] for x in options])[0]
                to_edge = rng.choice(in_edges_gate[dest])
            hurry = rng.random() < afan
            res.append({"id": f"h{hour:02d}.{k:04d}.{gate}.{dest}", "type": f"{vtype}{'-afan' if hurry else ''}",
                        "depart": min(round(dep, 1), hour * 3600 + 3599.9), "from": rng.choice(out_edges[gate]), "to": to_edge})
    res.sort(key=lambda t: t["depart"])
    return res


def write_trips(trip_list: list[dict], path: Path) -> None:
    root = ET.Element("routes")
    for t in trip_list:
        ET.SubElement(root, "trip", id=t["id"], type=t["type"], depart=f"{t['depart']:.1f}", departLane="best",
                      departSpeed="max", **{"from": t["from"], "to": t["to"]})
    _write(path, root)


# ---------------------------------------------------------------- 3. corrida

def prepare(folder: Path, build: Path, seed: int = 1, from_h: int = 0, to_h: int = 24) -> Path:
    net, demand = network.load(folder)
    errs = network.validate(net, demand)
    if errs:
        raise SystemExit("\n".join(f"ERROR {e}" for e in errs))
    net_file = build_net(net, build)
    _write(build / "semaforos.add.xml", tls_programs(net, demand, net_file))
    _write(build / "tipos.add.xml", vehicle_types(demand))
    write_trips(trips(net, demand, seed, from_h, to_h), build / "viajes.rou.xml")
    edgedata = ET.Element("additional")
    ET.SubElement(edgedata, "edgeData", id="tramos", period=str(INTERVAL_S), file="tramos.xml", excludeEmpty="true")
    _write(build / "salidas.add.xml", edgedata)
    cfg = ET.Element("configuration")
    inp = ET.SubElement(cfg, "input")
    ET.SubElement(inp, "net-file", value="red.net.xml")
    ET.SubElement(inp, "route-files", value="tipos.add.xml,viajes.rou.xml")
    ET.SubElement(inp, "additional-files", value="semaforos.add.xml,salidas.add.xml")
    tm = ET.SubElement(cfg, "time")
    ET.SubElement(tm, "begin", value=str(from_h * 3600))
    ET.SubElement(tm, "end", value=str(to_h * 3600 + 3600))  # una hora más para que terminen los últimos viajes
    ET.SubElement(tm, "step-length", value="0.5")
    proc = ET.SubElement(cfg, "processing")
    ET.SubElement(proc, "lateral-resolution", value=str(LATERAL_RESOLUTION))
    ET.SubElement(proc, "time-to-teleport", value="300")
    ET.SubElement(proc, "ignore-route-errors", value="true")
    ET.SubElement(cfg, "random_number").append(ET.Element("seed", value=str(seed)))
    out = ET.SubElement(cfg, "output")
    ET.SubElement(out, "tripinfo-output", value="viajes-salida.xml")
    ET.SubElement(out, "statistic-output", value="estadisticas.xml")
    rep = ET.SubElement(cfg, "report")
    ET.SubElement(rep, "no-step-log", value="true")
    ET.SubElement(rep, "no-warnings", value="true")
    ET.SubElement(rep, "duration-log.statistics", value="true")
    _write(build / "corrida.sumocfg", cfg)
    return build / "corrida.sumocfg"


def run(cfg: Path) -> None:
    proc = subprocess.run([_bin("sumo"), "-c", cfg.name], capture_output=True, text=True, cwd=cfg.parent)
    if proc.returncode != 0:
        raise SystemExit(f"SUMO falló:\n{proc.stderr[-2000:]}")


# ---------------------------------------------------------------- 4. indicadores

def _level(value: float, yellow: float, red: float, higher_is_worse: bool = True) -> str:
    if not higher_is_worse:
        value, yellow, red = -value, -yellow, -red
    return "rojo" if value > red else ("amarillo" if value > yellow else "verde")


def indicators(folder: Path, build: Path) -> dict:
    """Indicadores del panel a partir de las salidas de SUMO (umbrales supuestos, docs/ciudad.md sección 6)."""
    net, demand = network.load(folder)
    g = network.build_graph(net)
    free_kmh = {edge_id(lk.a, lk.b): lk.speed_kmh for lk in g.links}
    length = {edge_id(lk.a, lk.b): lk.length_m for lk in g.links}
    street_of = {edge_id(lk.a, lk.b): lk.street for lk in g.links}
    names = {s["id"]: s["name"] for s in _street_index(net).values()}

    trips_out = list(ET.parse(build / "viajes-salida.xml").getroot().iter("tripinfo"))
    hourly = defaultdict(lambda: {"entradas": 0, "salidas": 0, "demora_s": 0.0, "viaje_s": 0.0})
    od = defaultdict(list)
    wait_in = [float(t.get("departDelay", 0)) for t in trips_out]
    for t in trips_out:
        dep, arr = float(t.get("depart")), float(t.get("arrival"))
        h = int(dep // 3600)
        hourly[h]["entradas"] += 1
        hourly[h]["demora_s"] += float(t.get("timeLoss"))
        hourly[h]["viaje_s"] += float(t.get("duration"))
        hourly[min(int(arr // 3600), 24)]["salidas"] += 1
        _, _, origin, dest = t.get("id").split(".", 3)
        od[(origin, dest)].append((float(t.get("duration")), float(t.get("timeLoss"))))

    curve = []
    for h in sorted(hourly):
        x = hourly[h]
        n = max(x["entradas"], 1)
        curve.append({"hora": h, "entradas": x["entradas"], "salidas": x["salidas"],
                      "viaje_medio_s": round(x["viaje_s"] / n, 1), "demora_media_s": round(x["demora_s"] / n, 1)})

    # ruta crítica: par origen-destino (con al menos 20 viajes y 1 min sin demora) con mayor índice tiempo real / tiempo sin demora
    critical = None
    for (o, d), vals in od.items():
        if len(vals) < 20:
            continue
        dur = sum(v[0] for v in vals) / len(vals)
        loss = sum(v[1] for v in vals) / len(vals)
        if dur - loss < 60:  # viajes muy cortos inflan el índice; la ruta crítica es un recorrido real
            continue
        idx = dur / (dur - loss)
        if critical is None or idx > critical["indice"]:
            critical = {"origen": o, "destino": d, "viajes": len(vals), "viaje_medio_s": round(dur, 1), "indice": round(idx, 2)}
    if critical:
        critical["nivel"] = _level(critical["indice"], 2, 3)

    # tramos dentro de la zona (sin los de las puertas): índice de congestión por corredor = tiempo de recorrido
    # real / tiempo a la velocidad límite, pesado por vehículos que entran; minutos con velocidad bajo JAM_KMH
    inside = {e for e in free_kmh if all(g.nodes[n].kind == "intersection" for n in e.split("_"))}
    jam_min = defaultdict(float)
    corridor = defaultdict(lambda: {"t_real": 0.0, "t_libre": 0.0})
    for iv in ET.parse(build / "tramos.xml").getroot().iter("interval"):
        for e in iv.iter("edge"):
            eid = e.get("id")
            if eid not in inside:
                continue
            entered = float(e.get("entered", 0))
            if e.get("speed") is not None and float(e.get("sampledSeconds", 0)) > 0 and float(e.get("speed")) * 3.6 < JAM_KMH:
                jam_min[eid] += INTERVAL_S / 60
            if entered > 0 and e.get("traveltime") is not None:
                c = corridor[street_of[eid]]
                c["t_real"] += entered * float(e.get("traveltime"))
                c["t_libre"] += entered * length[eid] / (free_kmh[eid] / 3.6)
    corridors = []
    for sid, c in corridor.items():
        idx = c["t_real"] / max(c["t_libre"], 1e-6)
        corridors.append({"calle": sid, "nombre": names.get(sid, sid), "indice": round(idx, 2), "nivel": _level(idx, 1.5, 2.5)})
    corridors.sort(key=lambda c: -c["indice"])
    worst_jam = sorted(jam_min.items(), key=lambda kv: -kv[1])[:5]

    stats = ET.parse(build / "estadisticas.xml").getroot()
    teleports = int(stats.find("teleports").get("total")) if stats.find("teleports") is not None else 0
    vt = stats.find("vehicleTripStatistics")
    loaded = int(stats.find("vehicles").get("loaded"))
    arrived = len(trips_out)
    entries_total = sum(x["entradas"] for x in curve)
    peak = max(curve, key=lambda x: x["demora_media_s"]) if curve else None
    return {
        "modelo": net["id"],
        "supuesto": True,
        "viajes_cargados": loaded,
        "viajes_completados": arrived,
        "bloqueos_teletransporte": teleports,
        "velocidad_media_kmh": round(float(vt.get("speed")) * 3.6, 1) if vt is not None else None,
        "demora_media_s": round(float(vt.get("timeLoss")), 1) if vt is not None else None,
        "horas_vehiculo_demora": round(sum(x["demora_media_s"] * x["entradas"] for x in curve) / 3600, 1),
        "hora_mas_lenta": peak["hora"] if peak else None,
        "espera_media_para_entrar_s": round(sum(wait_in) / max(len(wait_in), 1), 1),
        "ruta_critica": critical,
        "corredores": corridors,
        "tramos_mas_atascados": [{"tramo": e, "minutos": round(m)} for e, m in worst_jam],
        "curva_24h": curve,
        "entradas_registradas": entries_total,
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("folder", type=Path)
    ap.add_argument("--from-h", type=int, default=0)
    ap.add_argument("--to-h", type=int, default=24)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--name", default="linea-base", help="nombre del resumen en resultados/")
    ap.add_argument("--build", type=Path, help="carpeta de trabajo (por defecto <modelo>/build)")
    args = ap.parse_args(argv)
    build = args.build or args.folder / "build"
    cfg = prepare(args.folder, build, args.seed, args.from_h, args.to_h)
    print(f"corriendo SUMO de {args.from_h}:00 a {args.to_h}:00 (semilla {args.seed})...", flush=True)
    run(cfg)
    res = indicators(args.folder, build)
    res.update({"semilla": args.seed, "desde_h": args.from_h, "hasta_h": args.to_h})
    out = args.folder / "resultados" / f"{args.name}.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps(res, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{res['viajes_completados']} de {res['viajes_cargados']} viajes completados, {res['bloqueos_teletransporte']} bloqueos, "
          f"velocidad media {res['velocidad_media_kmh']} km/h, demora media {res['demora_media_s']} s")
    if res["ruta_critica"]:
        rc = res["ruta_critica"]
        print(f"ruta crítica {rc['origen']} -> {rc['destino']}: índice {rc['indice']} ({rc['nivel']})")
    print(f"resumen: {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
