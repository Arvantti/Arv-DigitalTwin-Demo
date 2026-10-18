"""La planta de plásticos usa las piezas por estiba que calcula tools/logistics/pallet_sizing.py."""

import importlib.util
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
PLANT = ROOT / "industrial-models" / "plastic-injection-plant-v1"


def _sizing():
    spec = importlib.util.spec_from_file_location("pallet_sizing", ROOT / "tools" / "logistics" / "pallet_sizing.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_buffers_use_the_sized_pallet():
    expected = _sizing().table()
    assert len(expected) == 28
    for name in ("plant.yaml", "simulation.yaml"):
        text = (PLANT / name).read_text(encoding="utf-8")
        for buf, n in expected.items():
            line = next(ln for ln in text.split("\n") if re.search(rf"\b{buf}\b[:,]", ln) and "pallet" in ln)
            assert f'pallet_pieces": {n}' in line or f"pallet_pieces: {n}" in line, (name, buf, n)


def test_rack_and_route_pallets_match_their_product():
    expected = _sizing().table()
    sim = (PLANT / "simulation.yaml").read_text(encoding="utf-8")
    for rack, buf in (("rack-sf-01", "buf-06"), ("rack-sf-02", "buf-19"), ("rack-sf-03", "buf-08"), ("rack-sf-04", "buf-14")):
        assert f'{rack}: {{ type: pallet-store, preset: semielaborado-48, params: {{"pallet_pieces": {expected[buf]},' in sim
    for route_in, route_out, buf in ((1, 6, "buf-06"), (2, 7, "buf-19"), (3, 8, "buf-08"), (4, 9, "buf-14")):
        for route in (route_in, route_out):
            assert f'"route_{route}_pallet_pieces": {expected[buf]}' in sim
