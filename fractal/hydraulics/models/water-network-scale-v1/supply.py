"""Bombeo y regulación independientes para el estado cuasiestacionario Fractal.

La bomba usa H=s²H0-rQ², antirretorno Kv y succión del tanque; la PRS
limita la salida a su consigna solo si dispone de presión aguas arriba.
El control de presión se considera asentado dentro de cada franja horaria.
"""

from __future__ import annotations

import math
from typing import Any

G = 9.81
MCA_PER_BAR = 10.197
INNER_DIAMETER_M = {1.0: 0.0266, 1.5: 0.0409, 2.0: 0.0525, 3.0: 0.0779, 4.0: 0.1022, 6.0: 0.1541}


def tank_head(model: dict[str, Any], tank: str, level_pct: float) -> float:
    params = model["equipment_models"][tank]["params"]
    volume = float(params["volume_l"]) / 1000
    diameter = float(params["diameter_m"])
    height = volume / (math.pi * diameter**2 / 4)
    return float(model["equipment_models"][tank]["layout"]["position"][2]) + height * level_pct / 100


def pipe_loss(model: dict[str, Any], source: str, target: str, flow: float) -> float:
    item = next(f for f in model["plant"]["flows"] if f["from"] == source and f["to"] == target)
    points = item.get("route") or [
        model["equipment_models"][source]["layout"]["position"],
        model["equipment_models"][target]["layout"]["position"],
    ]
    length = max(0.1, sum(math.dist(a, b) for a, b in zip(points, points[1:], strict=False)))
    d = float(item["inner_diameter_mm"]) / 1000 if item.get("inner_diameter_mm") else INNER_DIAMETER_M[float(item["diameter_in"])]
    area = math.pi * d * d / 4
    velocity = flow / 3600 / area
    re = max(abs(velocity) * d / 1e-6, 1e-9)
    friction = 64 / re if re < 2000 else 0.25 / math.log10(1.5e-6 / d / 3.7 + 5.74 / re**0.9) ** 2
    return (friction * length / d + float(item.get("minor_k", 0.5))) * velocity**2 / (2 * G)


def pump_and_prs(model: dict[str, Any], tags: dict[str, Any], flow: float, setting: float) -> dict[str, float | bool]:
    flow = float(flow)
    pump = model["equipment_models"]["pumpset-main-01"]["params"]
    station = model["equipment_models"]["prs-01"]["params"]
    supply_level = float(tags.get("PLC.Tank.Supply.LevelPct") if tags.get("PLC.Tank.Supply.LevelPct") is not None else 70)
    water_head = tank_head(model, "tank-supply-01", supply_level)
    outlet_loss = MCA_PER_BAR * (flow / 400) ** 2  # válvula de fondo del tanque, Kv 400
    if model["equipment_models"]["tank-supply-01"]["params"]["outlet_check_valve"]:
        check_kv = model["equipment_models"]["tank-supply-01"]["params"]["outlet_check_kv_m3h"]
        outlet_loss += MCA_PER_BAR * (flow / check_kv) ** 2  # antirretorno individual
    suction_head = water_head - outlet_loss - pipe_loss(model, "tank-supply-01", "pumpset-main-01", flow)
    running_tag = tags.get("PLC.Pump.RunningCount")
    count = int(pump.get("min_running", pump["pumps"]) if running_tag is None else running_tag)
    count = min(max(0, count), int(pump["pumps"]))
    q_per_pump = flow / count if count else 0.0
    curve_r = (float(pump["shutoff_head_m"]) - float(pump["design_head_m"])) / float(pump["design_flow_m3h"]) ** 2
    check_loss = MCA_PER_BAR * (q_per_pump / (5 * float(pump["design_flow_m3h"]))) ** 2 if count else 0.0
    discharge_target = float(tags.get("PLC.Pump.SetpointMca") or pump["setpoint_mca"])
    discharge_z = float(model["equipment_models"]["pumpset-main-01"]["layout"]["position"][2])
    required_head = discharge_z + discharge_target - suction_head + check_loss + curve_r * q_per_pump**2
    speed = math.sqrt(max(0.0, required_head / float(pump["shutoff_head_m"]))) if count else 0.0
    speed_limited = min(1.0, speed)
    discharge = (
        suction_head + speed_limited**2 * float(pump["shutoff_head_m"]) - curve_r * q_per_pump**2 - check_loss - discharge_z
        if count
        else 0.0
    )
    station_z = float(model["equipment_models"]["prs-01"]["layout"]["position"][2])
    inlet_head = discharge_z + discharge - pipe_loss(model, "pumpset-main-01", "prs-01", flow)
    inlet_pressure = inlet_head - station_z
    isolation_loss = MCA_PER_BAR * (flow / float(station["isolation_kv_m3h"])) ** 2
    prv_loss = MCA_PER_BAR * (flow / float(station["prv_kv_m3h"])) ** 2
    outlet = min(setting - isolation_loss, inlet_pressure - 2 * isolation_loss - prv_loss)
    check_kv = float(station["outlet_check_kv_m3h"])
    if check_kv > 0:
        outlet -= MCA_PER_BAR * (flow / check_kv) ** 2  # antirretorno PRS → nivel 1
    hydraulic_power = 998 * G * (flow / 3600) * max(0.0, discharge_z + discharge + check_loss - suction_head) / 1000
    return {
        "pump_speed_pct": round(speed_limited * 100, 5),
        "pump_speed_required_pct": round(speed * 100, 5),
        "pump_control_feasible": count > 0 and speed <= 1.0 and discharge >= 0,
        "pump_discharge_mca": round(discharge, 5),
        "pump_suction_mca": round(suction_head - discharge_z, 5),
        "pump_power_kw": round(hydraulic_power / max(0.1, float(pump["efficiency"])), 5),
        "prs_inlet_mca": round(inlet_pressure, 5),
        "prs_outlet_mca": round(outlet, 5),
        "prs_regulating": inlet_pressure - isolation_loss >= setting,
        "pump_count": count,
    }
