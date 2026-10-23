"""Espacio de tags del PLC virtual expuesto a consumidores de ingeniería.

Este adaptador es el límite entre el emulador y sistemas externos simulados. Un
cliente Fractal recibe esta representación y nunca objetos del motor de planta.
"""

from __future__ import annotations

from typing import Any


def _value(snapshot: dict[str, Any], equipment: str, variable: str) -> Any:
    return snapshot["equipment"].get(equipment, {}).get("variables", {}).get(variable)


def plc_tags(snapshot: dict[str, Any], *, profile_id: str | None = None, profile_hour: int | None = None) -> dict[str, Any]:
    """Convierte un snapshot operativo en valores PLC planos y de solo lectura."""
    tags: dict[str, Any] = {
        "PLC.Pump.DischargePressureMca": _value(snapshot, "pumpset-main-01", "discharge_pressure_mca"),
        "PLC.Pump.FlowM3h": _value(snapshot, "pumpset-main-01", "flow_m3h"),
        "PLC.PRS.InletPressureMca": _value(snapshot, "prs-01", "inlet_pressure_mca"),
        "PLC.PRS.OutletPressureMca": _value(snapshot, "prs-01", "outlet_pressure_mca"),
        "PLC.PRS.FlowM3h": _value(snapshot, "prs-01", "flow_m3h"),
        "PLC.PRS.CriticalPressureMca": _value(snapshot, "prs-01", "critical_pressure_mca"),
        "PLC.PRS.CriticalSetpointMca": _value(snapshot, "prs-01", "critical_setpoint_mca"),
        "PLC.PRS.ManualSettingMca": _value(snapshot, "prs-01", "manual_setting_mca"),
        "PLC.Profile.ActiveId": profile_id,
        "PLC.Profile.CurrentHour": profile_hour,
    }
    for level in range(1, 5):
        grid = f"grid-0{level}"
        tags[f"PLC.Grid.L{level}.ConsumptionM3h"] = _value(snapshot, grid, "consumption_m3h")
        tags[f"PLC.Grid.L{level}.LeakageM3h"] = _value(snapshot, grid, "leakage_m3h")
        tags[f"PLC.Grid.L{level}.MinimumPressureMca"] = _value(snapshot, grid, "min_pressure_mca")
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
            {"id": "PLC.PRS.InletPressureMca", "unit": "mca"},
            {"id": "PLC.PRS.OutletPressureMca", "unit": "mca"},
            {"id": "PLC.PRS.FlowM3h", "unit": "m3/h"},
            {"id": "PLC.PRS.CriticalPressureMca", "unit": "mca"},
            {"id": "PLC.PRS.CriticalSetpointMca", "unit": "mca"},
            {"id": "PLC.PRS.ManualSettingMca", "unit": "mca"},
            {"id": "PLC.Profile.ActiveId", "unit": None},
            {"id": "PLC.Profile.CurrentHour", "unit": "h"},
            *[
                {"id": f"PLC.Grid.L{level}.{signal}", "unit": unit}
                for level in range(1, 5)
                for signal, unit in (("ConsumptionM3h", "m3/h"), ("LeakageM3h", "m3/h"), ("MinimumPressureMca", "mca"))
            ],
        ],
    }
