"""Espacio de tags del PLC virtual expuesto a consumidores de ingeniería.

Este adaptador es el límite entre el emulador y sistemas externos simulados. Un
cliente Fractal recibe esta representación y nunca objetos del motor de planta.
"""

from __future__ import annotations

from typing import Any


def _value(snapshot: dict[str, Any], equipment: str, variable: str) -> Any:
    return snapshot["equipment"].get(equipment, {}).get("variables", {}).get(variable)


def _channel(snapshot: dict[str, Any], equipment: str, channel: str) -> Any:
    return snapshot["equipment"].get(equipment, {}).get("animation", {}).get(channel)


def plc_tags(
    snapshot: dict[str, Any], *, profile_id: str | None = None, profile_hour: int | None = None, simulated_time: float | None = None
) -> dict[str, Any]:
    """Convierte un snapshot operativo en valores PLC planos y de solo lectura."""
    tags: dict[str, Any] = {
        "PLC.Pump.DischargePressureMca": _value(snapshot, "pumpset-main-01", "discharge_pressure_mca"),
        "PLC.Pump.FlowM3h": _value(snapshot, "pumpset-main-01", "flow_m3h"),
        "PLC.Pump.SpeedPct": _value(snapshot, "pumpset-main-01", "speed_pct"),
        "PLC.Pump.PowerKw": _value(snapshot, "pumpset-main-01", "power_kw"),
        "PLC.Pump.SetpointMca": _value(snapshot, "pumpset-main-01", "setpoint_mca"),
        "PLC.Pump.RunningCount": _value(snapshot, "pumpset-main-01", "pumps_running"),
        "PLC.Pump.RecirculationFlowM3h": _value(snapshot, "pumpset-recirc-01", "flow_m3h"),
        "PLC.Pump.RecirculationAutoActive": _value(snapshot, "pumpset-recirc-01", "level_auto_active"),
        "PLC.PRS.InletPressureMca": _value(snapshot, "prs-01", "inlet_pressure_mca"),
        "PLC.PRS.OutletPressureMca": _value(snapshot, "prs-01", "outlet_pressure_mca"),
        "PLC.PRS.FlowM3h": _value(snapshot, "prs-01", "flow_m3h"),
        "PLC.PRS.CriticalPressureMca": _value(snapshot, "prs-01", "critical_pressure_mca"),
        "PLC.PRS.CriticalSetpointMca": _value(snapshot, "prs-01", "critical_setpoint_mca"),
        "PLC.PRS.ManualSettingMca": _value(snapshot, "prs-01", "manual_setting_mca"),
        "PLC.PRS.BranchAuto": _value(snapshot, "prs-01", "branch_auto"),
        "PLC.Tank.Supply.LevelPct": _value(snapshot, "tank-supply-01", "level_pct"),
        "PLC.Tank.Recirc01.LevelPct": _value(snapshot, "tank-recirc-01", "level_pct"),
        "PLC.Tank.Recirc02.LevelPct": _value(snapshot, "tank-recirc-02", "level_pct"),
        "PLC.Profile.ActiveId": profile_id,
        "PLC.Profile.CurrentHour": profile_hour,
        "PLC.Session.SimulatedTime": simulated_time if simulated_time is not None else snapshot.get("t", 0),
    }
    for connection in (12, 23, 34):
        tags[f"PLC.Valve.Vertical{connection}OpeningPct"] = _value(snapshot, f"valve-between-{connection}", "opening_pct")
    for level in range(1, 5):
        grid = f"grid-0{level}"
        tags[f"PLC.Grid.L{level}.ConsumptionM3h"] = _value(snapshot, grid, "consumption_m3h")
        tags[f"PLC.Grid.L{level}.LeakageM3h"] = _value(snapshot, grid, "leakage_m3h")
        tags[f"PLC.Grid.L{level}.MinimumPressureMca"] = _value(snapshot, grid, "min_pressure_mca")
        for branch in range(1, 5):
            for position in range(1, 5):
                valve = f"c{branch}{position}"
                prefix = f"PLC.Grid.L{level}.Consumer.{valve.upper()}"
                tags[f"{prefix}.OpeningPct"] = 100 * (_channel(snapshot, grid, f"open_{valve}") or 0)
                tags[f"{prefix}.FlowLMin"] = _value(snapshot, grid, f"q_{valve}")
                tags[f"{prefix}.PressureMca"] = _value(snapshot, grid, f"p_{valve}")
        for leak in ("l1", "l2"):
            prefix = f"PLC.Grid.L{level}.Leak.{leak.upper()}"
            tags[f"{prefix}.OpeningPct"] = 100 * (_channel(snapshot, grid, f"open_{leak}") or 0)
            tags[f"{prefix}.FlowLMin"] = _value(snapshot, grid, f"q_{leak}")
            tags[f"{prefix}.PressureMca"] = _value(snapshot, grid, f"p_{leak}")
    return tags


def opcua_schema() -> dict[str, Any]:
    """Contrato de la futura interfaz OPC UA; no inicia un servidor físico."""
    return {
        "simulated": True,
        "transport": "opcua-simulated",
        "access": "read-only",
        "namespace": "urn:arvantti:plc:water-network-scale-v1",
        "description": "Contrato de tags publicado por el PLC virtual para Fractal de Ingeniería.",
        "nodes": [
            {"id": "PLC.Pump.DischargePressureMca", "unit": "mca"},
            {"id": "PLC.Pump.FlowM3h", "unit": "m3/h"},
            {"id": "PLC.Pump.SpeedPct", "unit": "%"},
            {"id": "PLC.Pump.PowerKw", "unit": "kW"},
            {"id": "PLC.Pump.SetpointMca", "unit": "mca"},
            {"id": "PLC.Pump.RunningCount", "unit": None},
            {"id": "PLC.Pump.RecirculationFlowM3h", "unit": "m3/h"},
            {"id": "PLC.Pump.RecirculationAutoActive", "unit": None},
            {"id": "PLC.PRS.InletPressureMca", "unit": "mca"},
            {"id": "PLC.PRS.OutletPressureMca", "unit": "mca"},
            {"id": "PLC.PRS.FlowM3h", "unit": "m3/h"},
            {"id": "PLC.PRS.CriticalPressureMca", "unit": "mca"},
            {"id": "PLC.PRS.CriticalSetpointMca", "unit": "mca"},
            {"id": "PLC.PRS.ManualSettingMca", "unit": "mca"},
            {"id": "PLC.PRS.BranchAuto", "unit": None},
            *[{"id": f"PLC.Valve.Vertical{connection}OpeningPct", "unit": "%"} for connection in (12, 23, 34)],
            {"id": "PLC.Tank.Supply.LevelPct", "unit": "%"},
            {"id": "PLC.Tank.Recirc01.LevelPct", "unit": "%"},
            {"id": "PLC.Tank.Recirc02.LevelPct", "unit": "%"},
            {"id": "PLC.Profile.ActiveId", "unit": None},
            {"id": "PLC.Profile.CurrentHour", "unit": "h"},
            {"id": "PLC.Session.SimulatedTime", "unit": "s"},
            *[
                {"id": f"PLC.Grid.L{level}.{signal}", "unit": unit}
                for level in range(1, 5)
                for signal, unit in (("ConsumptionM3h", "m3/h"), ("LeakageM3h", "m3/h"), ("MinimumPressureMca", "mca"))
            ],
            *[
                {"id": f"PLC.Grid.L{level}.{kind}.{valve}.{signal}", "unit": unit}
                for level in range(1, 5)
                for kind, valves in (
                    ("Consumer", [f"C{branch}{position}" for branch in range(1, 5) for position in range(1, 5)]),
                    ("Leak", ["L1", "L2"]),
                )
                for valve in valves
                for signal, unit in (("OpeningPct", "%"), ("FlowLMin", "L/min"), ("PressureMca", "mca"))
            ],
        ],
    }
