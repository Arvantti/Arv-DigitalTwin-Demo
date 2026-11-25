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


def modeled_leakage_volume_m3(hours: list[dict[str, Any]]) -> float:
    """Integra la fuga horaria modelada sin completar intervalos ausentes."""
    return sum(
        float(frame["scenarios"][0]["state"]["leakage_m3h"]) * float(frame["duration_s"]) / 3600
        for frame in hours
    )


def modeled_volumes_m3(hours: list[dict[str, Any]]) -> dict[str, float]:
    """Volúmenes del solver: caudal total = consumo entregado + fugas."""
    total = leakage = 0.0
    for frame in hours:
        state = frame["scenarios"][0]["state"]
        duration_h = float(frame["duration_s"]) / 3600
        flow = float(state["flow_m3h"])
        leak = float(state["leakage_m3h"])
        if flow < 0 or leak < 0 or leak > flow:
            raise ValueError("balance hidráulico inválido para volumen modelado")
        total += flow * duration_h
        leakage += leak * duration_h
    return {"total_m3": total, "leakage_m3": leakage, "delivered_consumption_m3": total - leakage}


def compare_leakage(
    hours: list[dict[str, Any]], baseline: list[dict[str, Any]], *, target_pressure_mca: float | None = None
) -> dict[str, Any]:
    """Compara dos trayectorias completas sobre exactamente los mismos intervalos."""
    if not hours or len(hours) != len(baseline):
        raise ValueError("comparación de fugas sin intervalos completos")
    for proposed, reference in zip(hours, baseline, strict=True):
        for field in ("start_t_s", "end_t_s", "duration_s", "profile_hour"):
            if proposed[field] != reference[field]:
                raise ValueError(f"comparación de fugas con {field} desalineado")
        if proposed["duration_s"] <= 0 or proposed["end_t_s"] - proposed["start_t_s"] != proposed["duration_s"]:
            raise ValueError("intervalo de comparación inválido")
    base_metrics = modeled_volumes_m3(baseline)
    proposed_metrics = modeled_volumes_m3(hours)
    base_volume = base_metrics["leakage_m3"]
    proposed_volume = proposed_metrics["leakage_m3"]
    feasible = all(bool(frame["robust"]) and bool(frame.get("commands", {}).get("constraints_satisfied")) for frame in hours)
    baseline_meets_target = (
        target_pressure_mca is not None
        and all(
            len(frame["end_state"]["consumer_pressures_mca"]) == 64
            and min(frame["end_state"]["consumer_pressures_mca"].values()) >= target_pressure_mca
            for frame in baseline
        )
    )
    improvement = base_volume - proposed_volume if feasible else None
    return {
        "baseline_leakage_volume_m3": base_volume,
        "proposed_leakage_volume_m3": proposed_volume,
        "baseline_volumes_m3": base_metrics,
        "proposed_volumes_m3": proposed_metrics,
        "modeled_total_reduction_m3": base_metrics["total_m3"] - proposed_metrics["total_m3"] if feasible else None,
        "modeled_reduction_m3": improvement,
        "modeled_reduction_pct": 100 * improvement / base_volume if improvement is not None and base_volume > 0 else None,
        "comparison_start_t_s": hours[0]["start_t_s"],
        "comparison_end_t_s": hours[-1]["end_t_s"],
        "feasible": feasible,
        "baseline_meets_target": baseline_meets_target,
        "improves_leakage": improvement is not None and improvement > 0,
        "interpretation": (
            "feasible_vs_feasible" if baseline_meets_target and feasible
            else "pressure_recovery_vs_infeasible_baseline" if feasible
            else "proposed_plan_infeasible"
        ),
        "kind": "modeled_counterfactual_not_observed_savings",
    }


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
    from cosimulation import progress
    from fractal.hydraulics.runtime.mpc import project_24h

    total = job.get("horizon_hours", 24)
    key = job.get("job_id")
    hours = project_24h(
        tags, profile, study_type="optimized", objective_id=objective_id, target_pressure_mca=target_pressure_mca,
        horizon_hours=total,
        **({"on_hour_completed": progress.hourly(key, "Optimizando apertura VRP", total, work_total=2 * total)} if key else {}),
    )
    feasible = all(bool(frame.get("commands", {}).get("constraints_satisfied")) and bool(frame["robust"]) for frame in hours)
    baseline = project_24h(
        tags, profile, study_type="baseline", horizon_hours=total,
        **({"on_hour_completed": progress.hourly(key, "Verificando contra perfil base", total, offset=total, work_total=2 * total)}
           if key else {}),
    )
    leakage_comparison = compare_leakage(hours, baseline, target_pressure_mca=float(target_pressure_mca))
    draft_hours: dict[str, Any] = {}
    if feasible:
        for frame in hours:
            hour = str(frame["profile_hour"])
            plan = dict(profile.get("hours", {}).get(hour, {}))
            settings = frame.get("commands") or {}
            if settings:
                # El plan adoptado debe actuar sobre la apertura optimizada,
                # no activar una consigna manual distinta de la trayectoria.
                original_prs = plan.get("prs", {})
                plan["prs"] = {
                    **({"inlet_pressure_mca": original_prs["inlet_pressure_mca"]} if "inlet_pressure_mca" in original_prs else {}),
                    **settings["prs"],
                }
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
        "modeled_leakage_volume_m3": modeled_leakage_volume_m3(hours),
        "leakage_comparison": leakage_comparison,
        "optimization_quality": "bounded_hourly_candidate_search_not_global_horizon_optimum",
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
