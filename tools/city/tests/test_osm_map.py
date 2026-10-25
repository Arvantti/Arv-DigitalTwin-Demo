"""The city plan must render real OSM road geometry, not the abstract SUMO grid."""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
MODEL = ROOT / "city-models" / "centro-medellin-v1"
_spec = importlib.util.spec_from_file_location("city_osm_map_test", ROOT / "tools" / "city" / "osm_map.py")
osm_map = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = osm_map
_spec.loader.exec_module(osm_map)
_network_spec = importlib.util.spec_from_file_location("city_network_osm_test", ROOT / "tools" / "city" / "network.py")
network = importlib.util.module_from_spec(_network_spec)
sys.modules[_network_spec.name] = network
_network_spec.loader.exec_module(network)


def test_osm_extract_drives_the_rendered_city_map():

    net, demand = network.load(MODEL)
    source = net["_osm_source_path"]
    roads, _ = osm_map.parse_osm(source, tuple(net["map_source"]["bbox"]))
    svg = network.render_svg(net, demand)

    assert roads
    assert any(road["name"] == "Avenida Carrera 57" for road in roads)
    assert "© OpenStreetMap contributors" in svg
    assert "ODbL 1.0" in svg
    assert "Trazado APROXIMADO" not in svg
