"""La plantilla de equipos debe ser un punto de partida válido: se copia como tipo real y se valida."""

import shutil
from pathlib import Path

from twin_runtime import Library, check_expectations, find_library_root, run_scenario
from twin_runtime.library import check_behavior_contract


def test_template_is_a_valid_equipment_type(tmp_path: Path) -> None:
    real = find_library_root(Path(__file__))
    lib_root = tmp_path / "equipment-library"
    shutil.copytree(real / "_schema", lib_root / "_schema")
    shutil.copytree(real / "_template", lib_root / "template-machine")
    lib = Library(lib_root)
    eq = lib.get("template-machine")
    assert check_behavior_contract(eq) == []
    for sc in eq.scenarios.values():
        inst, sim, _ = run_scenario(eq, sc)
        assert check_expectations(inst.snapshot(), sc.expect, sim.events) == []
