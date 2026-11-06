"""Ejecución aislada de trabajos de optimización Fractal.

Este paquete no lee ni escribe sesiones PLC. Recibe una instantánea inmutable y
un perfil, y devuelve un resultado candidato que requiere decisión operativa.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

JOB_CONTRACT_VERSION = "fractal-optimization-job.v2"
RESULT_CONTRACT_VERSION = "fractal-optimization-result.v2"
OBJECTIVE_ID = "OBJ-PRESSURE-MIN"


def profile_fingerprint(profile: dict[str, Any]) -> str:
    canonical = json.dumps(profile, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def optimize_job(job: dict[str, Any]) -> dict[str, Any]:
    snapshot = job["snapshot"]
    tags = snapshot["plc_tags"]
    kind = job["kind"]
    objective_id = job.get("objective_id", OBJECTIVE_ID)
    target_pressure_mca = job["target_pressure_mca"]
    if kind == "instant":
        from .optimizer import recommend_instant

        return {
            "contract_version": RESULT_CONTRACT_VERSION,
            "kind": kind,
            "snapshot_id": snapshot["snapshot_id"],
            "objective_id": objective_id,
            "simulation_time_s": snapshot["simulation_time_s"],
            "temporal_context": "forecast",
            "applied": False,
            "requires_operator_acceptance": True,
            "profile_id": job.get("profile", {}).get("id"),
            "profile_hash": job.get("profile_hash"),
            "target_pressure_mca": target_pressure_mca,
            "recommendation": recommend_instant(tags, objective_id, target_pressure_mca),
        }
    if kind != "profile-horizon":
        raise ValueError(f"tipo de trabajo no soportado: {kind}")

    profile = job["profile"]
    profile_hash = profile_fingerprint(profile)
    if job.get("profile_hash") != profile_hash:
        raise ValueError("profile_hash no coincide con el perfil operativo recibido")
    from fractal.hydraulics.runtime.mpc import project_24h

    hours = project_24h(
        tags, profile, study_type="optimized", objective_id=objective_id, target_pressure_mca=target_pressure_mca
    )
    feasible = all(bool(frame.get("commands", {}).get("constraints_satisfied")) for frame in hours)
    draft_hours: dict[str, Any] = {}
    if feasible:
        for frame in hours:
            hour = str(frame["profile_hour"])
            plan = dict(profile.get("hours", {}).get(hour, {}))
            settings = frame.get("commands") or {}
            if settings:
                plan["prs"] = {**plan.get("prs", {}), **settings["prs"]}
            draft_hours[hour] = plan
    return {
        "contract_version": RESULT_CONTRACT_VERSION,
        "kind": kind,
        "snapshot_id": snapshot["snapshot_id"],
        "simulation_time_s": snapshot["simulation_time_s"],
        "profile_id": profile.get("id"),
        "profile_name": profile.get("name"),
        "profile_hash": profile_hash,
        "objective_id": objective_id,
        "target_pressure_mca": target_pressure_mca,
        "temporal_context": "forecast",
        "applied": False,
        "validation_status": "hydraulic_setpoints_only",
        "hours": hours,
        "draft_profile": (
            {
                "name": f"PFL-FRA-{job['job_id'][:8].upper()} · optimizado",
                "description": f"Recomendación optimizada para {objective_id}; requiere aprobación del operador PLC.",
                "hours": draft_hours,
            }
            if feasible
            else None
        ),
        "vrp_opening_profile_pct": {
            str(frame["profile_hour"]): frame.get("commands", {}).get("vrp_opening_pct") for frame in hours
        },
        "vrp_opening_required_profile_pct": {
            str(frame["profile_hour"]): frame.get("commands", {}).get("vrp_opening_required_pct") for frame in hours
        },
        "requires_operator_acceptance": feasible,
    }
