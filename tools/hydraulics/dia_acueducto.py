"""Un día de operación del acueducto a escala en 24 ciclos de una hora, para el panel de gráficos del PLC.

Corre el banco hidráulico (industrial-models/water-network-scale-v1/network.py, la misma red del motor) hora a hora
con dos escenarios:
- actual: la rama manual de la reguladora, fija en la salida de diseño de día (la que deja la casa crítica en
  CRITICAL_TARGET_MCA con todas las casas abiertas, 20,94 mca en D31);
- opt: la consigna mínima de cada hora que deja la casa más desfavorable en CRITICAL_TARGET_MCA (gemelo, lo que hace
  la rama automática).
En los dos, las bombas van a la velocidad que sostiene PUMP_SETPOINT_MCA en su sensor de descarga.

La apertura de cada casa es perfil diario × factor fijo de la casa (0,70–1,00) × variación horaria (±15 %), con
semilla fija; las fugas quedan abiertas como en su preset.

Uso: uv run python tools/hydraulics/dia_acueducto.py [salida.json]
(por defecto apps/gallery/public/data/acueducto-dia.json; tarda unos minutos, usa todos los núcleos)."""

from __future__ import annotations

import json
import random
import sys
from multiprocessing import Pool
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "industrial-models" / "water-network-scale-v1"))
import network as n  # noqa: E402

PROFILE = [0.15, 0.12, 0.10, 0.10, 0.15, 0.35, 0.70, 1.00, 0.85, 0.65, 0.55, 0.60,
           0.75, 0.70, 0.55, 0.50, 0.55, 0.70, 0.90, 0.95, 0.80, 0.60, 0.40, 0.25]
TARGET_MCA = n.CRITICAL_TARGET_MCA  # 15 mca de norma + 3 % (D29)
MANUAL_SETTING_MCA = n.setting_for(TARGET_MCA)  # rama manual: salida de diseño de día
SEED = 17
RETRY_TOLERANCE = 5e-3

_rng = random.Random(SEED)
_net0, _info0 = n.build(station_setting_mca=MANUAL_SETTING_MCA, pump_speed=1.0)
CONSUMERS = [(g, v) for g, mp in _info0["grids"].items() for v in mp if v.startswith("c")]
MULT = {cv: _rng.uniform(0.7, 1.0) for cv in CONSUMERS}
JIT = {(h, cv): _rng.uniform(0.85, 1.15) for h in range(24) for cv in CONSUMERS}


def run(h: int, setting: float, speed: float = 1.0):
    net, info = n.build(station_setting_mca=setting, pump_speed=speed)
    for g, mp in info["grids"].items():
        for v, d in mp.items():
            if v.startswith("c"):
                net.set(d["link"], opening=max(0.02, min(1.0, PROFILE[h] * MULT[(g, v)] * JIT[(h, (g, v))])))
    res = net.solve()
    if not res.converged:
        # Con consumo muy bajo algunas ramas quedan en un ciclo límite de caudales casi nulos (ver network.py);
        # se acepta con una tolerancia relativa algo mayor, que no cambia ningún caudal útil.
        net.tolerance = RETRY_TOLERANCE
        res = net.solve()
    return net, info, res


def worst(res, info) -> tuple[str, float]:
    c = {f"{g}:{v}": res.pressures_mca[d["node"]] for g, mp in info["grids"].items() for v, d in mp.items()
         if v.startswith("c")}
    k = min(c, key=c.get)
    return k, c[k]


def speed_floor(h: int, setting: float) -> float:
    """Velocidad de las bombas que deja PUMP_SETPOINT_MCA en su sensor de descarga."""
    lo, hi = 0.3, 1.0
    for _ in range(14):
        mid = (lo + hi) / 2
        if run(h, setting, mid)[2].pressures_mca["descarga"] >= n.PUMP_SETPOINT_MCA:
            hi = mid
        else:
            lo = mid
    return hi


def summarize(net, info, r, setting: float, speed: float) -> dict:
    def q(link: str) -> float:
        return max(0.0, r.flows_m3h[link])

    valves = {f"{g}:{v}": (round(r.pressures_mca[d["node"]], 2), round(q(d["link"]) * 1000, 1))
              for g, mp in info["grids"].items() for v, d in mp.items()}
    prv = "est_prv_a" if q("est_prv_a") > q("est_prv_b") else "est_prv_b"
    link = net.links[prv]
    dp = r.heads_m[link.start] - r.heads_m[link.end]
    kv_eff = q(prv) / max(1e-6, dp / 10.197) ** 0.5
    wk, wp = worst(r, info)
    pumps = [(round(r.heads_m[f"bombas_pump{i}_out"] - r.heads_m["succion"], 2), round(r.flows_m3h[f"bombas_pump{i}"], 3))
             for i in (1, 2)]
    return {
        "setting": round(setting, 3), "speed": round(speed, 4),
        "p_discharge": round(r.pressures_mca["descarga"], 2), "p_station_in": round(r.pressures_mca["entrada_est"], 2),
        "p_station_out": round(r.pressures_mca["salida_est"], 2),
        "prv_opening_pct": round(min(100.0, 100 * kv_eff / link.params["kv_m3h"]), 1),
        "worst": wk, "worst_p": round(wp, 2),
        "cons_m3h": round(sum(p for k, (_, p) in valves.items() if ":c" in k) / 1000, 3),
        "leak_m3h": round(sum(p for k, (_, p) in valves.items() if ":l" in k) / 1000, 3),
        "pump_m3h": round(sum(p[1] for p in pumps), 3), "pumps": pumps, "valves": valves,
        "converged": r.converged,
    }


def hour(h: int) -> dict:
    fixed = MANUAL_SETTING_MCA
    sp = speed_floor(h, fixed)
    actual = summarize(*run(h, fixed, sp), fixed, sp)
    lo, hi = 10.0, 30.0
    for _ in range(18):
        mid = (lo + hi) / 2
        _, info, res = run(h, mid)
        if worst(res, info)[1] >= TARGET_MCA:
            hi = mid
        else:
            lo = mid
    sp2 = speed_floor(h, hi)
    opt = summarize(*run(h, hi, sp2), hi, sp2)
    print(f"hora {h:02d}: casa crítica {actual['worst_p']} mca, consigna gemelo {opt['setting']} mca", file=sys.stderr)
    return {"actual": actual, "opt": opt}


def compact(hours: list[dict]) -> dict:
    """Arreglos por variable (24 valores), como los lee el panel."""
    keys = list(hours[0]["actual"]["valves"])
    out = {"target": TARGET_MCA, "manual": MANUAL_SETTING_MCA, "pump_setpoint": n.PUMP_SETPOINT_MCA,
           "demand": PROFILE, "seed": SEED, "valves": keys}
    for sc in ("actual", "opt"):
        s: dict = {f: [h[sc][f] for h in hours] for f in ("setting", "speed", "p_discharge", "p_station_in",
                   "p_station_out", "prv_opening_pct", "worst", "worst_p", "cons_m3h", "leak_m3h", "pump_m3h")}
        s["pump_head"] = [[h[sc]["pumps"][i][0] for h in hours] for i in (0, 1)]
        s["pump_q"] = [[h[sc]["pumps"][i][1] for h in hours] for i in (0, 1)]
        s["vp"] = [[h[sc]["valves"][k][0] for k in keys] for h in hours]
        s["vq"] = [[h[sc]["valves"][k][1] for k in keys] for h in hours]
        out[sc] = s
    return out


if __name__ == "__main__":
    dst = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "apps" / "gallery" / "public" / "data" / "acueducto-dia.json"
    with Pool() as pool:
        hours = pool.map(hour, range(24))
    if not all(h[sc]["converged"] for h in hours for sc in ("actual", "opt")):
        sys.exit("el banco no convergió en alguna hora")
    dst.write_text(json.dumps(compact(hours), separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"escrito {dst}", file=sys.stderr)
