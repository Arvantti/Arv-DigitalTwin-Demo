"""Regresión de la proyección base con apertura fija del PLC."""

from twin_runtime.prs_curve import outlet_target_from_opening

from fractal.hydraulics.runtime.mpc import project_24h


def test_baseline_keeps_fixed_opening_instead_of_critical_pressure_pid() -> None:
    tags = {
        "PLC.Session.SimulatedTime": 0,
        "PLC.Tank.Supply.LevelPct": 70,
        "PLC.Tank.Recirc01.LevelPct": 40,
        "PLC.Tank.Recirc02.LevelPct": 40,
        "PLC.Pump.RunningCount": 2,
        "PLC.Pump.SetpointMca": 72.1,
        "PLC.PRS.InletPressureMca": 71,
        "PLC.PRS.OutletPressureMca": 17,
        "PLC.PRS.BranchAuto": 1,
        "PLC.PRS.AutoOpeningPct": 30,
    }
    frame = project_24h(tags, {"hours": {"0": {"global_consumers_pct": 30, "prs": {
        "branch": "auto", "auto_opening_pct": 30,
    }}}}, horizon_hours=1)[0]
    state = frame["end_state"]
    expected = outlet_target_from_opening(30, state["prs_inlet_mca"])
    # La salida medida incluye las pérdidas de la estación después de la consigna.
    assert state["prs_outlet_mca"] < expected
    assert abs(state["prs_outlet_mca"] - expected) < 0.2
    assert frame["plc_tags"]["PLC.PRS.AutoOpeningPct"] == 30
