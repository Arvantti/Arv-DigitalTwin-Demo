"""Pruebas de la red vial del gemelo de ciudad (tools/city/network.py)."""

from __future__ import annotations

import copy
import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
MODEL = ROOT / "city-models" / "centro-medellin-v1"
_spec = importlib.util.spec_from_file_location("city_network", ROOT / "tools" / "city" / "network.py")
network = importlib.util.module_from_spec(_spec)
sys.modules["city_network"] = network  # dataclasses necesita el módulo registrado
_spec.loader.exec_module(network)


def _model():
    return network.load(MODEL)


def test_modelo_valido():
    net, demand = _model()
    assert network.validate(net, demand) == []


def test_tamano_de_la_zona():
    # 7 carreras x 5 calles; 20 cruces con semáforo (pedido: zona B con la mitad de intersecciones)
    info = network.summary(*_model())
    assert info["intersections"] == 35
    assert info["signals"] == 20


def test_horas_sobre_la_capacidad():
    # 60.000 entradas/día; 8,5 % a las 7 h = 5.100 > 4.250; 8,2 % y 8,0 % a las 17 y 18 h
    info = network.summary(*_model())
    assert info["peak_veh_h"] == 5100
    assert info["hours_over_capacity"] == [7, 17, 18]


def test_reparto_de_entradas_suma_100():
    info = network.summary(*_model())
    assert abs(sum(info["entry_share_pct"].values()) - 100) < 0.5


def test_sentido_unico_solo_en_un_sentido():
    net, _ = _model()
    g = network.build_graph(net)
    # Carrera 55 va al norte: hay tramo de San Juan a la 46 y no al revés
    assert any(lk.a == "cra55-cl44" and lk.b == "cra55-cl46" for lk in g.links)
    assert not any(lk.a == "cra55-cl46" and lk.b == "cra55-cl44" for lk in g.links)


def test_detecta_plan_que_no_cierra_el_ciclo():
    net, demand = _model()
    bad = copy.deepcopy(net)
    bad["plans"]["arterial-ns"]["pico-am"]["green_ns"] += 5
    assert any("no suman el ciclo" in e for e in network.validate(bad, demand))


def test_detecta_zona_desconectada():
    # Si todo el centro fuera de sentido único hacia el oriente, desde las puertas del oriente no se sale por el occidente
    net, demand = _model()
    bad = copy.deepcopy(net)
    for st in bad["streets"]["calles"]:
        st["sentido"] = "east"
    for st in bad["streets"]["carreras"]:
        st["sentido"] = "north"
    assert any("no se llega" in e for e in network.validate(bad, demand))


def test_calle_nueva_se_agrega_como_tramo_adicional():
    net, demand = _model()
    new = copy.deepcopy(net)
    new["extra_links"] = [{"id": "diagonal", "from": "cra53-cl46", "to": "cra51-cl48", "lanes": 1, "speed_kmh": 30}]
    assert network.validate(new, demand) == []
    g = network.build_graph(new)
    lk = next(lk for lk in g.links if lk.street == "diagonal")
    assert round(lk.length_m) == 234  # hipotenusa de 150 m x 180 m
