"""Pruebas del gemelo de ciudad sobre SUMO (tools/city/sumo_city.py). Requieren `uv sync --group city`."""

from __future__ import annotations

import importlib.util
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

import pytest

pytest.importorskip("sumo", reason="SUMO no instalado: uv sync --group city")

ROOT = Path(__file__).resolve().parents[3]
MODEL = ROOT / "city-models" / "centro-medellin-v1"
_spec = importlib.util.spec_from_file_location("city_sumo", ROOT / "tools" / "city" / "sumo_city.py")
sumo_city = importlib.util.module_from_spec(_spec)
sys.modules["city_sumo"] = sumo_city
_spec.loader.exec_module(sumo_city)
network = sys.modules["city_network"]


@pytest.fixture(scope="module")
def model():
    return network.load(MODEL)


@pytest.fixture(scope="module")
def net_file(model, tmp_path_factory):
    return sumo_city.build_net(model[0], tmp_path_factory.mktemp("red"))


def test_red_de_sumo(net_file):
    root = ET.parse(net_file).getroot()
    junctions = [j for j in root.iter("junction") if j.get("type") not in ("internal", "dead_end")]
    assert len(junctions) == 35
    assert len({j.get("id") for j in junctions if j.get("type") == "traffic_light"}) == 20


def test_programas_por_franja_cierran_el_ciclo(model, net_file):
    net, demand = model
    add = sumo_city.tls_programs(net, demand, net_file)
    progs = add.findall("tlLogic")
    assert len(progs) == 20 * 7
    plan_of = {s["node"]: s["plan"] for s in net["signals"]}
    for p in progs:
        cycle = net["plans"][plan_of[p.get("id")]][p.get("programID")]["cycle_s"]
        assert sum(int(ph.get("duration")) for ph in p.findall("phase")) == cycle
        # nunca verde a la vez para carreras y calles: cada fase verde deja en rojo al menos un enlace
        for ph in p.findall("phase"):
            assert "r" in ph.get("state")


def test_viajes_por_hora_siguen_el_perfil(model):
    net, demand = model
    trips = sumo_city.trips(net, demand, seed=1)
    per_hour = [0] * 24
    for t in trips:
        per_hour[int(t["depart"] // 3600)] += 1
    assert per_hour[7] == 5100  # 8,5 % de 60.000
    assert per_hour[3] == 180   # 0,3 % de 60.000
    assert sum(per_hour) == sum(round(p / 100 * 60000) for p in demand["hourly_pct"])


def test_mezcla_con_pico_y_placa_y_carga_pesada(model):
    _, demand = model
    peak = sumo_city.mix_for_hour(demand, 7)
    night = sumo_city.mix_for_hour(demand, 23)
    assert peak["carga-pesada"] == 0
    assert night["carga-pesada"] > 0
    # a las 23 h no hay pico y placa: carro 28 de 100; a las 7 h: 28 * 0,8 / (100 - 4 - 28 * 0,2)
    assert night["carro"] == pytest.approx(0.28)
    assert peak["carro"] == pytest.approx(28 * 0.8 / (100 - 4 - 28 * 0.2))


def test_misma_semilla_mismos_viajes(model):
    net, demand = model
    a = sumo_city.trips(net, demand, seed=3, from_h=7, to_h=8)
    b = sumo_city.trips(net, demand, seed=3, from_h=7, to_h=8)
    c = sumo_city.trips(net, demand, seed=4, from_h=7, to_h=8)
    assert a == b
    assert a != c


def test_corrida_corta_de_madrugada(tmp_path):
    # 23 a 24 h: 1,0 % de 60.000 = 600 viajes, red casi vacía
    cfg = sumo_city.prepare(MODEL, tmp_path, seed=1, from_h=23, to_h=24)
    sumo_city.run(cfg)
    res = sumo_city.indicators(MODEL, tmp_path)
    assert res["viajes_cargados"] == 600
    assert res["viajes_completados"] == 600
    assert res["bloqueos_teletransporte"] == 0
    assert res["velocidad_media_kmh"] > 15
    streets = network.load(MODEL)[0]["streets"]
    assert {c["calle"] for c in res["corredores"]} <= {s["id"] for g in ("carreras", "calles") for s in streets[g]}
