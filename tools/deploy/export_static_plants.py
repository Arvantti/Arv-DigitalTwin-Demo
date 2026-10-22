"""Exporta el plano de cada planta como archivo estático para publicar la galería sin la API.

La escena de planta pide `/api/plants/{id}`; este script guarda esa misma respuesta (la que arma `twin_emulator_api.main`)
en apps/gallery/public/api/plants/{id}, sin extensión, para que Cloudflare Pages la sirva en la misma ruta.
La simulación en vivo (WebSocket) sigue necesitando la API; para las plantas con simulación conectada guarda además
una grabación de la operación normal en apps/gallery/public/api/replays/{id}.json (twin_emulator_api.replay), que la escena
reproduce con ▶ SIMULAR cuando no hay API.

Uso: uv run python tools/deploy/export_static_plants.py [carpeta_de_salida]"""

from __future__ import annotations

import json
import sys
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")

from fastapi.testclient import TestClient  # noqa: E402
from twin_emulator_api.main import _plant_model, app  # noqa: E402
from twin_emulator_api.replay import record_plant  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
out = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "apps" / "gallery" / "public" / "api" / "plants"
out.mkdir(parents=True, exist_ok=True)
replays = out.parent / "replays"

client = TestClient(app)
plants = client.get("/api/plants")
plants.raise_for_status()
for plant in plants.json():
    doc = client.get(f"/api/plants/{plant['id']}")
    doc.raise_for_status()
    (out / plant["id"]).write_text(json.dumps(doc.json(), ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{plant['id']}: {(out / plant['id']).stat().st_size / 1024:.0f} kB")
    if plant["simulated"]:
        keep = {link for pipe in doc.json().get("pipes", []) for link in pipe.get("links", [])}
        rec = record_plant(_plant_model(plant["id"]), keep_links=keep)
        replays.mkdir(parents=True, exist_ok=True)
        path = replays / f"{plant['id']}.json"
        path.write_text(json.dumps(rec, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(f"  grabación: {len(rec['frames'])} cuadros, {path.stat().st_size / 1024:.0f} kB")
