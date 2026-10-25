"""Perfiles horarios de operación para el PLC virtual.

Los perfiles son mandos planificados del PLC, no instrucciones del modelo Fractal.
El emulador solamente recibe los comandos ya resueltos por el PLC al iniciar cada
hora simulada.
"""

from __future__ import annotations

import json
import os
import sqlite3
from collections.abc import Mapping
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

PROFILE_VERSION = 1
HOURS_PER_DAY = 24


def _data_root() -> Path:
    configured = os.environ.get("TWIN_DATA")
    root = Path(configured) if configured else Path.cwd() / ".twin-data"
    root.mkdir(parents=True, exist_ok=True)
    return root


def _now() -> str:
    return datetime.now(UTC).isoformat()


def _models_root() -> Path:
    return Path(os.environ.get("TWIN_MODELS", Path.cwd() / "industrial-models"))


def _number(value: Any, field: str, low: float = 0, high: float = 100) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not low <= value <= high:
        raise ValueError(f"{field} debe ser un número entre {low} y {high}")
    return float(value)


def _opening_map(value: Any, field: str) -> dict[str, float]:
    if value is None:
        return {}
    if not isinstance(value, Mapping):
        raise ValueError(f"{field} debe ser un objeto")
    return {str(key): _number(item, f"{field}.{key}") for key, item in value.items()}


def normalize_profile(payload: Mapping[str, Any]) -> dict[str, Any]:
    """Valida el contrato de perfil y descarta propiedades no declaradas.

    La jerarquía global/nivel/vivienda se conserva sin resolver para que el
    operador pueda editarla. ``commands_for_hour`` la resuelve al ejecutarla.
    """
    name = payload.get("name")
    if not isinstance(name, str) or not name.strip():
        raise ValueError("name es obligatorio")
    description = payload.get("description", "")
    if not isinstance(description, str):
        raise ValueError("description debe ser texto")
    raw_hours = payload.get("hours", {})
    if not isinstance(raw_hours, Mapping):
        raise ValueError("hours debe ser un objeto con horas 0 a 23")

    hours: dict[str, Any] = {}
    for key, raw_hour in raw_hours.items():
        try:
            hour = int(key)
        except (TypeError, ValueError) as exc:
            raise ValueError(f"hora inválida: {key}") from exc
        if not 0 <= hour < HOURS_PER_DAY or not isinstance(raw_hour, Mapping):
            raise ValueError(f"hora inválida: {key}")
        item: dict[str, Any] = {}
        if "global_consumers_pct" in raw_hour:
            item["global_consumers_pct"] = _number(raw_hour["global_consumers_pct"], f"hours.{hour}.global_consumers_pct")
        levels = _opening_map(raw_hour.get("levels"), f"hours.{hour}.levels")
        if any(level not in {"1", "2", "3", "4"} for level in levels):
            raise ValueError(f"hours.{hour}.levels solo admite 1 a 4")
        if levels:
            item["levels"] = levels
        dwellings = raw_hour.get("dwellings")
        if dwellings is not None:
            if not isinstance(dwellings, Mapping):
                raise ValueError(f"hours.{hour}.dwellings debe ser un objeto")
            item["dwellings"] = {str(grid): _opening_map(valves, f"hours.{hour}.dwellings.{grid}") for grid, valves in dwellings.items()}
        leaks = raw_hour.get("leaks")
        if leaks is not None:
            if not isinstance(leaks, Mapping):
                raise ValueError(f"hours.{hour}.leaks debe ser un objeto")
            item["leaks"] = {str(grid): _opening_map(valves, f"hours.{hour}.leaks.{grid}") for grid, valves in leaks.items()}
        between = _opening_map(raw_hour.get("between_levels"), f"hours.{hour}.between_levels")
        if any(valve not in {"12", "23", "34"} for valve in between):
            raise ValueError(f"hours.{hour}.between_levels solo admite 12, 23 y 34")
        if between:
            item["between_levels"] = between
        prs = raw_hour.get("prs")
        if prs is not None:
            if not isinstance(prs, Mapping):
                raise ValueError(f"hours.{hour}.prs debe ser un objeto")
            checked: dict[str, Any] = {}
            if "branch" in prs:
                if prs["branch"] not in {"auto", "manual"}:
                    raise ValueError(f"hours.{hour}.prs.branch debe ser auto o manual")
                checked["branch"] = prs["branch"]
            if "critical_setpoint_mca" in prs:
                checked["critical_setpoint_mca"] = _number(prs["critical_setpoint_mca"], f"hours.{hour}.prs.critical_setpoint_mca", 15, 30)
            if "manual_setting_mca" in prs:
                checked["manual_setting_mca"] = _number(prs["manual_setting_mca"], f"hours.{hour}.prs.manual_setting_mca", 15, 35)
            mode = prs.get("control_mode", "fixed_outlet" if "auto_outlet_mca" in prs else None)
            if mode is not None:
                if mode not in {"critical_pressure", "fixed_outlet"}:
                    raise ValueError(f"hours.{hour}.prs.control_mode debe ser critical_pressure o fixed_outlet")
                checked["control_mode"] = mode
            if "auto_outlet_mca" in prs:
                checked["auto_outlet_mca"] = _number(prs["auto_outlet_mca"], f"hours.{hour}.prs.auto_outlet_mca", 15, 40)
            if "inlet_pressure_mca" in prs:
                checked["inlet_pressure_mca"] = _number(prs["inlet_pressure_mca"], f"hours.{hour}.prs.inlet_pressure_mca", 15, 100)
            if checked.get("control_mode") == "fixed_outlet":
                if checked.get("branch", "auto") != "auto":
                    raise ValueError(f"hours.{hour}.prs fixed_outlet requiere la rama auto")
                checked["branch"] = "auto"
                if "auto_outlet_mca" not in checked:
                    raise ValueError(f"hours.{hour}.prs.auto_outlet_mca es obligatorio en fixed_outlet")
            if checked:
                item["prs"] = checked
        hours[str(hour)] = item

    return {"schema_version": PROFILE_VERSION, "name": name.strip(), "description": description.strip(), "hours": hours}


def commands_for_hour(
    profile: Mapping[str, Any], hour: int, *, inlet_pressure_offset_mca: float = 0.0
) -> list[dict[str, Any]]:
    """Resuelve una hora a comandos declarados del PLC virtual.

    El orden hace explícita la precedencia global → nivel → vivienda.
    """
    entry = profile.get("hours", {}).get(str(hour % HOURS_PER_DAY), {})
    if not isinstance(entry, Mapping):
        return []
    commands: list[dict[str, Any]] = []
    global_opening = entry.get("global_consumers_pct")
    if global_opening is not None:
        for level in range(1, 5):
            commands.append(
                {"equipment": f"grid-0{level}", "command": "set_opening", "args": {"valve": "consumers", "pct": global_opening}}
            )
    for level, opening in entry.get("levels", {}).items():
        commands.append({"equipment": f"grid-0{level}", "command": "set_opening", "args": {"valve": "consumers", "pct": opening}})
    for grid, valves in entry.get("dwellings", {}).items():
        for valve, opening in valves.items():
            commands.append({"equipment": grid, "command": "set_opening", "args": {"valve": valve, "pct": opening}})
    for grid, valves in entry.get("leaks", {}).items():
        for valve, opening in valves.items():
            commands.append({"equipment": grid, "command": "set_opening", "args": {"valve": valve, "pct": opening}})
    for valve, opening in entry.get("between_levels", {}).items():
        commands.append({"equipment": f"valve-between-{valve}", "command": "set_opening", "args": {"pct": opening}})
    prs = entry.get("prs", {})
    if "inlet_pressure_mca" in prs:
        commands.append({
            "equipment": "pumpset-main-01", "command": "set_setpoint",
            "args": {"mca": prs["inlet_pressure_mca"] + float(inlet_pressure_offset_mca)},
        })
    if "branch" in prs:
        commands.append({"equipment": "prs-01", "command": "select_branch", "args": {"branch": prs["branch"]}})
    if "critical_setpoint_mca" in prs:
        commands.append({"equipment": "prs-01", "command": "set_critical_setpoint", "args": {"mca": prs["critical_setpoint_mca"]}})
    if "manual_setting_mca" in prs:
        commands.append({"equipment": "prs-01", "command": "set_manual_setting", "args": {"mca": prs["manual_setting_mca"]}})
    if prs.get("control_mode") == "fixed_outlet":
        commands.append({
            "equipment": "prs-01", "command": "set_auto_control",
            "args": {"mode": "fixed_outlet", "mca": prs["auto_outlet_mca"]},
        })
    elif prs.get("control_mode") == "critical_pressure":
        commands.append({
            "equipment": "prs-01", "command": "set_auto_control",
            "args": {"mode": "critical_pressure", "mca": prs.get("auto_outlet_mca", 20.94)},
        })
    return commands


def current_prs_inlet_offset_mca(plant: Any) -> float:
    """Diferencia actual descarga de bomba→entrada PRS para aproximar una presión objetivo a la llegada.

    El perfil traduce la presión objetivo de entrada PRS en consigna de descarga de la bomba usando este diferencial
    medido; pérdidas y caudal futuros pueden hacer que la llegada real difiera, por lo que se informa la medición.
    """
    pump = plant.equipment["pumpset-main-01"].true_values()
    station = plant.equipment["prs-01"].true_values()
    discharge = float(pump.get("discharge_pressure_mca") or 0.0)
    inlet = float(station.get("inlet_pressure_mca") or 0.0)
    if int(pump.get("pumps_running") or 0) <= 0 or discharge < 5 or inlet < 5:
        return 0.0
    return discharge - inlet


class ProfileStore:
    """Almacenamiento local persistente por planta para el primer despliegue."""

    def __init__(self, plant_id: str) -> None:
        self.plant_id = plant_id
        self.path = _data_root() / "plc-profiles.sqlite3"
        with self._connect() as conn:
            conn.execute(
                """CREATE TABLE IF NOT EXISTS operation_profiles (
                id TEXT PRIMARY KEY, plant_id TEXT NOT NULL, name TEXT NOT NULL,
                description TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL)"""
            )
        self._seed_model_profiles()

    def _seed_model_profiles(self) -> None:
        """Instala plantillas versionadas; retira las sustituidas sin borrar perfiles del operador."""
        if self.plant_id == "water-network-scale-v1":
            retired = tuple(f"builtin-{self.plant_id}-{name}" for name in ("pfl-noc-01", "pfl-noc-02", "pfl-res-01"))
            with self._connect() as conn:
                conn.execute(
                    "DELETE FROM operation_profiles WHERE plant_id = ? AND id IN (?, ?, ?)",
                    (self.plant_id, *retired),
                )
        folder = _models_root() / self.plant_id / "operation-profiles"
        if not folder.exists():
            return
        now = _now()
        for path in sorted(folder.glob("*.json")):
            try:
                raw = json.loads(path.read_text(encoding="utf-8"))
                profile = normalize_profile(raw)
                template_id = str(raw.get("id") or path.stem)
            except (OSError, ValueError, json.JSONDecodeError):
                continue
            profile_id = f"builtin-{self.plant_id}-{template_id}"
            with self._connect() as conn:
                conn.execute(
                    "INSERT OR IGNORE INTO operation_profiles VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (profile_id, self.plant_id, profile["name"], profile["description"], json.dumps(profile), now, now),
                )

    def _connect(self) -> sqlite3.Connection:
        return sqlite3.connect(self.path)

    @staticmethod
    def _row(row: tuple[Any, ...]) -> dict[str, Any]:
        profile = json.loads(row[3])
        return {"id": row[0], "plant_id": row[1], **profile, "created_at": row[4], "updated_at": row[5]}

    def list(self) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT id, plant_id, name, data, created_at, updated_at "
                "FROM operation_profiles WHERE plant_id = ? ORDER BY updated_at DESC",
                (self.plant_id,),
            ).fetchall()
        return [self._row(row) for row in rows]

    def get(self, profile_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT id, plant_id, name, data, created_at, updated_at FROM operation_profiles WHERE plant_id = ? AND id = ?",
                (self.plant_id, profile_id),
            ).fetchone()
        return self._row(row) if row else None

    def create(self, payload: Mapping[str, Any]) -> dict[str, Any]:
        profile = normalize_profile(payload)
        profile_id, now = str(uuid4()), _now()
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO operation_profiles VALUES (?, ?, ?, ?, ?, ?, ?)",
                (profile_id, self.plant_id, profile["name"], profile["description"], json.dumps(profile), now, now),
            )
        return self.get(profile_id)  # type: ignore[return-value]

    def update(self, profile_id: str, payload: Mapping[str, Any]) -> dict[str, Any] | None:
        profile = normalize_profile(payload)
        now = _now()
        with self._connect() as conn:
            result = conn.execute(
                "UPDATE operation_profiles SET name = ?, description = ?, data = ?, updated_at = ? WHERE plant_id = ? AND id = ?",
                (profile["name"], profile["description"], json.dumps(profile), now, self.plant_id, profile_id),
            )
        return self.get(profile_id) if result.rowcount else None

    def delete(self, profile_id: str) -> bool:
        with self._connect() as conn:
            result = conn.execute("DELETE FROM operation_profiles WHERE plant_id = ? AND id = ?", (self.plant_id, profile_id))
        return bool(result.rowcount)
