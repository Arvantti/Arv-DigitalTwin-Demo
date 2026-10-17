"""Solucionador hidráulico. Los valores esperados se calculan a mano en cada prueba (ver comentarios)."""

import math

import pytest
from twin_runtime.primitives.hydraulics import MCA_PER_BAR, HydraulicNetwork, darcy_friction

BAR = MCA_PER_BAR  # 1 bar en mca


def test_emitter_discharges_by_kv_and_square_root_of_pressure() -> None:
    # Q = Kv·√p[bar] = 0,12 · √2 = 0,16971 m³/h. La válvula de Kv 10.000 no pierde nada a ese caudal.
    net = HydraulicNetwork()
    net.add_fixed_head("tank", 2 * BAR)
    net.add_node("n", 0.0)
    net.add_valve("feed", "tank", "n", kv_m3h=10_000)
    net.add_emitter("house", "n", kv_m3h=0.12)
    res = net.solve()
    assert res.converged
    assert res.flows_m3h["house"] == pytest.approx(0.12 * math.sqrt(2), rel=1e-4)
    assert res.pressures_mca["n"] == pytest.approx(2 * BAR, rel=1e-4)


def test_two_valves_in_series_split_the_pressure_drop() -> None:
    # Kv equivalente = 1/√(1/10² + 1/10²) = 7,0711; Q = 7,0711·√2 = 10,0 m³/h; cada válvula pierde 1 bar.
    net = HydraulicNetwork()
    net.add_fixed_head("up", 2 * BAR)
    net.add_fixed_head("down", 0.0)
    net.add_node("mid", 0.0)
    net.add_valve("v1", "up", "mid", kv_m3h=10)
    net.add_valve("v2", "mid", "down", kv_m3h=10)
    res = net.solve()
    assert res.flows_m3h["v1"] == pytest.approx(10.0, rel=1e-4)
    assert res.flows_m3h["v2"] == pytest.approx(10.0, rel=1e-4)
    assert res.pressures_mca["mid"] == pytest.approx(BAR, rel=1e-4)


def test_parallel_valves_share_flow_by_kv() -> None:
    # Con 1 bar en ambas: Q = Kv → 3 y 4 m³/h.
    net = HydraulicNetwork()
    net.add_fixed_head("up", BAR)
    net.add_fixed_head("down", 0.0)
    net.add_valve("a", "up", "down", kv_m3h=3)
    net.add_valve("b", "up", "down", kv_m3h=4)
    res = net.solve()
    assert res.flows_m3h["a"] == pytest.approx(3.0, rel=1e-4)
    assert res.flows_m3h["b"] == pytest.approx(4.0, rel=1e-4)


def test_half_open_linear_valve_halves_kv() -> None:
    net = HydraulicNetwork()
    net.add_fixed_head("up", BAR)
    net.add_fixed_head("down", 0.0)
    net.add_valve("v", "up", "down", kv_m3h=4, opening=0.5)
    assert net.solve().flows_m3h["v"] == pytest.approx(2.0, rel=1e-4)
    net.set("v", opening=0.0)
    assert net.solve().flows_m3h["v"] == pytest.approx(0.0, abs=1e-6)


def _pump_into_valve(n_pumps: int, speeds: list[float]) -> tuple[HydraulicNetwork, dict]:
    net = HydraulicNetwork()
    net.add_fixed_head("suction", 0.0)
    net.add_fixed_head("outlet", 0.0)
    net.add_node("header", 0.0)
    for i in range(n_pumps):
        net.add_pump(f"p{i}", "suction", "header", shutoff_head_m=100, design_flow_m3h=8, design_head_m=80, speed=speeds[i])
    net.add_valve("load", "header", "outlet", kv_m3h=2)
    return net, net.solve().flows_m3h


def test_pump_meets_system_curve() -> None:
    # Bomba H = 100 − 0,3125·Q² (pasa por 8 m³/h a 80 m). Sistema: válvula Kv 2 → h = 10,197·(Q/2)² = 2,5493·Q².
    # 100 = (0,3125 + 2,5493)·Q² → Q = 5,9113 m³/h.
    _, flows = _pump_into_valve(1, [1.0])
    assert flows["p0"] == pytest.approx(5.9113, rel=1e-3)


def test_parallel_pumps_share_flow_and_stopped_pump_does_not_backflow() -> None:
    # Dos iguales: 100 − 0,3125·(Q/2)² = 2,5493·Q² → Q = 6,1694 m³/h, 3,0847 por bomba.
    _, flows = _pump_into_valve(2, [1.0, 1.0])
    assert flows["load"] == pytest.approx(6.1694, rel=1e-3)
    assert flows["p0"] == pytest.approx(3.0847, rel=1e-3)
    # Una detenida: su antirretorno no deja que el agua regrese por ella; queda el caso de una sola bomba.
    _, flows = _pump_into_valve(2, [1.0, 0.0])
    assert flows["p1"] == pytest.approx(0.0, abs=1e-6)
    assert flows["load"] == pytest.approx(5.9113, rel=1e-3)


def test_pump_speed_scales_head_with_square() -> None:
    # A 80 % de velocidad: H0 = 64 m. 64 = 2,8618·Q² → Q = 4,7290 m³/h.
    _, flows = _pump_into_valve(1, [0.8])
    assert flows["p0"] == pytest.approx(4.7290, rel=1e-3)


def _prv_net(upstream_head: float) -> HydraulicNetwork:
    net = HydraulicNetwork()
    net.add_fixed_head("supply", upstream_head)
    net.add_node("a", 0.0)
    net.add_node("b", 0.0)
    net.add_valve("feed", "supply", "a", kv_m3h=10_000)
    net.add_prv("prv", "a", "b", setting_mca=20.0, kv_m3h=50)
    net.add_emitter("city", "b", kv_m3h=2)
    return net


def test_prv_holds_downstream_pressure() -> None:
    # Activa: p_b = 20 mca → Q = 2·√(20/10,197) = 2,8010 m³/h, sin importar los 80 m de arriba.
    res = _prv_net(80.0).solve()
    assert res.status["prv"] == "active"
    assert res.pressures_mca["b"] == pytest.approx(20.0, rel=1e-4)
    assert res.flows_m3h["city"] == pytest.approx(2.8010, rel=1e-3)
    assert res.flows_m3h["prv"] == pytest.approx(2.8010, rel=1e-3)


def test_prv_opens_when_upstream_is_below_setting() -> None:
    # Con 15 m arriba no alcanza los 20: queda abierta (Kv 50) en serie con la descarga (Kv 2):
    # Kv eq = 1/√(1/50² + 1/2²) = 1,99840; Q = 1,99840·√(15/10,197) = 2,4238 m³/h.
    res = _prv_net(15.0).solve()
    assert res.status["prv"] == "open"
    assert res.flows_m3h["city"] == pytest.approx(2.4238, rel=1e-3)


def test_check_valve_blocks_reverse_flow() -> None:
    net = HydraulicNetwork()
    net.add_fixed_head("low", 0.0)
    net.add_fixed_head("high", 10.0)
    net.add_check_valve("nrv", "low", "high", kv_m3h=20)
    res = net.solve()
    assert res.status["nrv"] == "closed"
    assert res.flows_m3h["nrv"] == 0.0


def test_laminar_pipe_matches_hagen_poiseuille() -> None:
    # Q = π·g·ΔH·D⁴ / (128·ν·L) = π·9,81·0,01·0,01⁴ / (128·1e-6·10) = 2,4077e-6 m³/s (Re ≈ 307).
    net = HydraulicNetwork()
    net.add_fixed_head("up", 0.01)
    net.add_fixed_head("down", 0.0)
    net.add_pipe("tube", "up", "down", length_m=10, diameter_m=0.01)
    res = net.solve()
    assert res.flows_m3h["tube"] / 3600 == pytest.approx(2.4077e-6, rel=1e-3)


def test_turbulent_pipe_loss_follows_darcy_weisbach() -> None:
    # Con el caudal resuelto, la pérdida de Darcy-Weisbach (f de Swamee-Jain) debe dar los 0,1 m impuestos.
    net = HydraulicNetwork()
    net.add_fixed_head("up", 0.1)
    net.add_fixed_head("down", 0.0)
    net.add_pipe("main", "up", "down", length_m=10, diameter_m=0.1022)
    res = net.solve()
    q = res.flows_m3h["main"] / 3600
    v = res.velocity_m_s["main"]
    f = darcy_friction(v * 0.1022 / 1e-6, 1.5e-6 / 0.1022)
    assert v * 0.1022 / 1e-6 > 4000
    assert f * 10 / 0.1022 * v * v / (2 * 9.81) == pytest.approx(0.1, rel=1e-4)
    assert q == pytest.approx(v * math.pi * 0.1022**2 / 4)


def test_warm_start_converges_fast_after_small_change() -> None:
    net, _ = _pump_into_valve(2, [1.0, 1.0])
    first = net.solve()
    net.set("load", opening=0.9)
    again = net.solve()
    assert again.converged and again.iterations <= first.iterations + 2


# --- Red de diseño del acueducto a escala (docs/water-network-plant.md, sección 4) ---

D4, D2 = 0.1022, 0.0525


def _scale_aqueduct(prv_setting_mca: float, consumer_opening: float = 1.0) -> HydraulicNetwork:
    """Misma red que tools/hydraulics/predimensionamiento.py: bombas a 80 mca, PRV a z = +1 m, 4 rejillas."""
    net = HydraulicNetwork()
    net.add_fixed_head("pumps", 80.0, elevation_m=0.0)
    net.add_node("station_in", 1.0)
    net.add_node("prv_out", 1.0)
    net.add_node("reducer", 0.0)
    net.add_pipe("main-4in", "pumps", "station_in", 10, D4, minor_k=3.0)
    net.add_prv("prv", "station_in", "prv_out", setting_mca=prv_setting_mca, kv_m3h=60)
    net.add_pipe("down-4in", "prv_out", "reducer", 4, D4, minor_k=1.5)
    for k in range(4):
        z = 1.2 * k
        net.add_node(f"L{k}", z)
        for j in range(4):
            net.add_node(f"L{k}h{j}", z)
            net.add_pipe(f"L{k}hp{j}", f"L{k}" if j == 0 else f"L{k}h{j - 1}", f"L{k}h{j}", 0.5, D2, minor_k=0.3)
            for i in range(4):
                net.add_node(f"L{k}b{j}{i}", z)
                net.add_pipe(f"L{k}bp{j}{i}", f"L{k}h{j}" if i == 0 else f"L{k}b{j}{i - 1}", f"L{k}b{j}{i}", 0.5, D2,
                             minor_k=0.5)
                net.add_emitter(f"L{k}house{j}{i}", f"L{k}b{j}{i}", kv_m3h=0.12, opening=consumer_opening)
        net.add_emitter(f"L{k}leak0", f"L{k}h1", kv_m3h=0.12)
        net.add_emitter(f"L{k}leak1", f"L{k}h3", kv_m3h=0.12)
    net.add_pipe("riser-L0", "reducer", "L0", 2, D2, minor_k=1.0)
    for k in range(3):
        net.add_node(f"V{k}", 1.2 * (k + 1))
        net.add_pipe(f"riser-L{k + 1}", f"L{k}", f"V{k}", 1.7, D2, minor_k=2.0)
        net.add_valve(f"between-{k + 1}{k + 2}", f"V{k}", f"L{k + 1}", kv_m3h=20)
    return net


def test_scale_aqueduct_reproduces_design_point() -> None:
    # Diseño: con la salida de la PRV a 26,66 mca, 20,0 mca en la válvula más crítica (nivel 4) y 13,0 m³/h.
    res = _scale_aqueduct(26.66).solve()
    assert res.converged
    supplied = res.flows_m3h["main-4in"]
    discharged = sum(q for k, q in res.flows_m3h.items() if "house" in k or "leak" in k)
    assert discharged == pytest.approx(supplied, rel=1e-6)  # lo que entra, sale
    assert supplied == pytest.approx(12.99, rel=0.02)
    critical = min(res.pressures_mca[f"L3b{j}3"] for j in range(4))
    assert critical == pytest.approx(20.0, rel=0.02)
    assert res.pressures_mca["L3b33"] == pytest.approx(critical)  # la más lejana es la más crítica
    leaks = sum(q for k, q in res.flows_m3h.items() if "leak" in k)
    assert leaks == pytest.approx(0.39 + 0.37 + 0.35 + 0.34, rel=0.03)


def test_scale_aqueduct_night_with_fixed_prv_raises_critical_pressure() -> None:
    # Diseño, noche al 30 % con la PRV manual fija: 23,4 mca en la válvula crítica y 1,50 m³/h de fugas.
    res = _scale_aqueduct(26.66, consumer_opening=0.3).solve()
    assert res.pressures_mca["L3b33"] == pytest.approx(23.39, rel=0.02)
    assert sum(q for k, q in res.flows_m3h.items() if "leak" in k) == pytest.approx(1.50, rel=0.03)


def test_prv_closes_when_downstream_is_above_setting() -> None:
    # Aguas abajo hay un tanque a 30 m, más que la consigna de 20: la PRV no deja pasar nada ni regresar.
    net = HydraulicNetwork()
    net.add_fixed_head("supply", 80.0)
    net.add_fixed_head("high-tank", 30.0, elevation_m=0.0)
    net.add_prv("prv", "supply", "high-tank", setting_mca=20.0, kv_m3h=50)
    res = net.solve()
    assert res.status["prv"] == "closed"
    assert res.flows_m3h["prv"] == 0.0
