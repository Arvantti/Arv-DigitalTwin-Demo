"""Piezas por estiba de cada producto de la planta de plásticos.

La estiba es estándar; el número de piezas depende del volumen que ocupa cada una y de su peso:

    X = min(volumen útil / volumen por pieza, carga máxima / peso de la pieza), redondeado hacia abajo

Uso: python tools/logistics/pallet_sizing.py [--write]   (sin --write solo imprime la tabla y verifica)
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

import yaml

PLANT_DIR = Path(__file__).resolve().parents[2] / "industrial-models" / "plastic-injection-plant-v1"


def load() -> tuple[dict, dict, dict]:
    sizing = yaml.safe_load((PLANT_DIR / "pallet-sizing.yaml").read_text(encoding="utf-8"))
    # Las inyectoras con molde del catálogo toman el volumen por pieza del producto (catalog/products.yaml).
    catalog = PLANT_DIR / "catalog"
    products = {p["id"]: p for p in yaml.safe_load((catalog / "products.yaml").read_text(encoding="utf-8"))["products"]}
    molds = {t["id"]: t for t in yaml.safe_load((catalog / "tooling.yaml").read_text(encoding="utf-8"))["tooling"]}
    setup = yaml.safe_load((catalog / "setup.yaml").read_text(encoding="utf-8"))["setup"]
    for imm, mounted in setup.items():
        if imm in sizing["bulk_l"]:
            raise SystemExit(f"pallet-sizing.yaml: {imm} tiene molde en el catálogo; su volumen va en catalog/products.yaml")
        sizing["bulk_l"][imm] = products[molds[mounted["tooling"]]["product"]]["bulk_l"]
    plant = yaml.safe_load((PLANT_DIR / "plant.yaml").read_text(encoding="utf-8"))
    imms = {e["id"]: e["params"] for e in plant["equipment"] if e["type"] == "injection_molding_machine"}
    bufs = {e["id"]: e for e in plant["equipment"] if e["type"] == "pallet_buffer"}
    return sizing, imms, bufs


def pallet_pieces(sizing: dict, imm: str, part_g: float) -> int:
    p = sizing["pallet"]
    usable_l = p["length_m"] * p["width_m"] * p["stack_height_m"] * p["packing_efficiency"] * 1000.0
    by_volume = usable_l / sizing["bulk_l"][imm]
    by_weight = p["max_load_kg"] * 1000.0 / part_g
    step = p["round_down_to"]
    return max(step, int(min(by_volume, by_weight) // step * step))


def table() -> dict[str, int]:
    """Piezas por estiba de cada buffer (buf-NN, con NN igual al número de su inyectora)."""
    sizing, imms, bufs = load()
    out = {}
    for buf in bufs:
        imm = "imm-" + buf.split("-")[1]
        out[buf] = pallet_pieces(sizing, imm, imms[imm]["part_g"])
    return out


def main() -> None:
    sizing, imms, _ = load()
    x = table()
    for buf, n in x.items():
        imm = "imm-" + buf.split("-")[1]
        pp = imms[imm]
        name, kg = pp["product"][:38], n * pp["part_g"] / 1000
        print(f"{buf}  {name:38}  {pp['part_g']:>7} g  {sizing['bulk_l'][imm]:>6} L  X = {n:>6}  ({kg:.0f} kg)")
    if "--write" in sys.argv:
        for name in ("plant.yaml", "simulation.yaml"):
            path = PLANT_DIR / name
            lines = path.read_text(encoding="utf-8").split("\n")
            for i, line in enumerate(lines):
                m = re.match(r"\s+(?:- \{ id: )?(buf-\d+)[:,]", line)
                if not m:
                    continue
                n = x[m.group(1)]
                if "pallet_pieces:" in line:
                    lines[i] = re.sub(r"pallet_pieces: \d+", f"pallet_pieces: {n}", line)
                elif name == "simulation.yaml":
                    lines[i] = line.replace('params: {"product"', f'params: {{"pallet_pieces": {n}, "product"')
            path.write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    main()
