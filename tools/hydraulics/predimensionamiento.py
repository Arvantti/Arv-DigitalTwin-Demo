"""Predimensionamiento hidráulico del acueducto a escala (docs/water-network-plant.md).

Cálculo de diseño, no de simulación: reparte el caudal de la red de rejillas para unos Kv dados y busca la
presión de salida de la estación reguladora que deja 20 mca en la válvula más crítica (control automático por
punto crítico) o, con una salida fija, la presión que queda en ese punto (control manual).

Modelo: Darcy-Weisbach con Swamee-Jain (PVC, rugosidad 0,0015 mm), pérdidas menores con K, válvulas por Kv
(Q[m³/h] = Kv · √(Δp[bar])) y descargas a la atmósfera (válvulas de consumo y de fuga, exponente 0,5).
Cada rejilla: cabezal de 4 tramos y 4 ramales de 4 válvulas, todos en 2", separados 0,5 m; 2 fugas en el cabezal.

    python tools/hydraulics/predimensionamiento.py
"""

from __future__ import annotations

import argparse
import math

G = 9.81
NU = 1.0e-6  # m²/s, agua a 20 °C
EPS = 1.5e-6  # m, PVC
D4 = 0.1022  # m, 4" SCH 40
D2 = 0.0525  # m, 2" SCH 40
MCA_PER_BAR = 10.2


def pipe_loss(q_m3h: float, d: float, length: float, k: float = 0.0) -> float:
    """Pérdida de carga (m) en un tubo con caudal q (m³/h)."""
    v = abs(q_m3h) / 3600 / (math.pi * d * d / 4)
    if v == 0:
        return 0.0
    re = v * d / NU
    f = 64 / re if re < 2000 else 0.25 / math.log10(EPS / (3.7 * d) + 5.74 / re**0.9) ** 2
    return math.copysign((f * length / d + k) * v * v / (2 * G), q_m3h)


def kv_flow(kv: float, dp_mca: float) -> float:
    return kv * math.sqrt(max(dp_mca, 0.0) / MCA_PER_BAR)


def grid_level(h_in: float, z: float, kv_cons: float, kv_leak: float, spacing: float = 0.5):
    """Caudal de una rejilla dada la cabeza piezométrica a la entrada (m). Devuelve (consumo, fugas, p_min)."""
    qv = [[0.2] * 4 for _ in range(4)]
    ql = [0.2, 0.2]  # fugas en los nodos 2 y 4 del cabezal
    p_min = 0.0
    for _ in range(40):
        h = h_in
        nodes = []
        branch = [sum(r) for r in qv]
        for j in range(4):
            q_seg = sum(branch[j:]) + (ql[0] if j <= 1 else 0.0) + ql[1]
            h -= pipe_loss(q_seg, D2, spacing, k=0.3)
            nodes.append(h)
        new_qv = []
        p_min = 1e9
        for j in range(4):
            hb = nodes[j]
            row = []
            for i in range(4):
                hb -= pipe_loss(sum(qv[j][i:]), D2, spacing, k=0.5)
                p = hb - z
                row.append(kv_flow(kv_cons, p))
                p_min = min(p_min, p)
            new_qv.append(row)
        new_ql = [kv_flow(kv_leak, nodes[1] - z), kv_flow(kv_leak, nodes[3] - z)]
        qv = [[(a + b) / 2 for a, b in zip(x, y, strict=True)] for x, y in zip(qv, new_qv, strict=True)]
        ql = [(a + b) / 2 for a, b in zip(ql, new_ql, strict=True)]
    return sum(map(sum, qv)), sum(ql), p_min


def network(h_top: float, opening: float, args):
    """Disparo desde el nivel 4 hacia abajo: cabeza a la entrada del nivel 4 → cabeza a la salida de la PRV."""
    levels = []
    h = h_top
    q_up = 0.0
    for k in reversed(range(args.levels)):
        z = k * args.dz
        if k < args.levels - 1:
            # Montante de 2" entre niveles + válvula de regulación entre niveles.
            h += pipe_loss(q_up, D2, args.dz + 0.5, k=2.0) + (q_up / args.kv_between) ** 2 * MCA_PER_BAR
        qc, ql, pmin = grid_level(h, z, args.kv_consumer * opening, args.kv_leak)
        levels.insert(0, (qc, ql, h - z, pmin))
        q_up += qc + ql
    # PRV (z = +1 m) → baja 1 m → 4 m de 4" → reducción → 2 m de 2" → nivel 1 (z = 0).
    h_prv = h + pipe_loss(q_up, D4, 4, k=1.5) + pipe_loss(q_up, D2, 2, k=1.0)
    return q_up, levels, h_prv


def solve(opening: float, args, prv_head: float | None = None):
    lo, hi = 0.5, args.pump_mca
    for _ in range(40):
        mid = (lo + hi) / 2
        _, levels, h_prv = network(mid, opening, args)
        low = levels[-1][3] < args.critical_mca if prv_head is None else h_prv < prv_head
        lo, hi = (mid, hi) if low else (lo, mid)
    return network(hi, opening, args)


def report(title: str, result, args) -> None:
    q, levels, h_prv = result
    h_station = args.pump_mca - pipe_loss(q, D4, 10, k=3.0)  # 10 m de 4" con la subida de 1 m y el antirretorno
    v4 = q / 3600 / (math.pi * D4**2 / 4)
    v2 = q / 3600 / (math.pi * D2**2 / 4)
    print(f"== {title}")
    print(f"  caudal total {q:.2f} m³/h ({q / 3.6:.2f} L/s); velocidad 4\" {v4:.2f} m/s, 2\" {v2:.2f} m/s")
    print(f"  llegada a la estación {h_station - 1:.2f} mca; salida PRV {h_prv - 1:.2f} mca; la PRV disipa {h_station - h_prv:.2f} mca")
    for k, (qc, ql, p_in, pmin) in enumerate(levels):
        print(f"  nivel {k + 1}: consumo {qc:.2f} m³/h, fugas {ql:.2f} m³/h, entrada {p_in:.2f} mca, mínima {pmin:.2f} mca")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--kv-consumer", type=float, default=0.12, help="Kv de cada válvula de consumo al 100 %%")
    ap.add_argument("--kv-leak", type=float, default=0.12, help="Kv de cada válvula de fuga")
    ap.add_argument("--kv-between", type=float, default=20.0, help="Kv de la válvula entre niveles")
    ap.add_argument("--levels", type=int, default=4)
    ap.add_argument("--dz", type=float, default=1.2, help="Separación vertical entre niveles (m)")
    ap.add_argument("--pump-mca", type=float, default=80.0)
    ap.add_argument("--critical-mca", type=float, default=20.0)
    ap.add_argument("--night-opening", type=float, default=0.3, help="Apertura de las válvulas de consumo de noche")
    args = ap.parse_args()

    day = solve(1.0, args)
    report("Día (consumo 100 %), PRV automática por punto crítico", day, args)
    report(f"Noche (consumo {args.night_opening:.0%}), PRV automática", solve(args.night_opening, args), args)
    report(f"Noche (consumo {args.night_opening:.0%}), PRV manual fija en la salida del día",
           solve(args.night_opening, args, prv_head=day[2]), args)


if __name__ == "__main__":
    main()
