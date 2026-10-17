# Instrucciones para agentes

Este repositorio construye una plataforma de gemelos digitales industriales. Las plantas de demostración se arman con una **librería de equipos** reutilizable.

## Estructura
- `equipment-library/<tipo>/`: un tipo de equipo por carpeta con contrato (`equipment.yaml`), comportamiento (`behavior.py`), geometría 3D (`geometry.ts`), presets, escenarios y pruebas. `_schema/` tiene el JSON Schema; `_template/` es el punto de partida.
- `packages/twin-runtime/`: runtime de Python. Clase base `EquipmentBehavior`, primitivas (PID, retardos, sensores, fallas, OEE, vapor), simulador y CLI `twin-lib`.
- `packages/twin-3d/`: piezas 3D, materiales PBR y escenario de render (three.js).
- `apps/api/`: FastAPI con la simulación en vivo por WebSocket.
- `apps/gallery/`: galería web para ver, parametrizar y simular cada equipo.
- `industrial-models/<planta>/plant.yaml`: layouts de planta. `tools/layout/render_layout.py` los valida y dibuja.
- `industrial-models/<planta>/twin.yaml` y `scenarios.yaml`: gemelo de planta (equipos de la librería conectados por puertos) y sus escenarios. Motor en `twin_runtime/plant.py`; ver `docs/plant-engine.md`.

## Crear o modificar equipos
Siga **`docs/equipment-authoring.md`** paso a paso. Reglas no negociables:
- El modelo 3D nunca es fuente de verdad: solo refleja los canales que publica el comportamiento.
- `true_values()` y `animation()` devuelven exactamente lo que declara el contrato.
- Cada escenario con `expect` es una prueba; los valores esperados se calculan a mano, no se ajustan para que pasen.
- Los datos inciertos se marcan como `assumed`. No se usan marcas ni nombres de empresas reales.
- Para que un equipo se pueda conectar en una planta, sus puertos declaran `bind` y el contrato su `plant_role` (sección 3 de la guía).

## Comandos
```bash
uv sync && pnpm install
uv run twin-lib validate          # librería completa
uv run twin-lib plant validate    # gemelos de planta y sus escenarios
uv run twin-lib plant run sauce-plant-v1 --scenario turno-8h
uv run pytest                     # pruebas de Python
uv run ruff check .
pnpm -r typecheck && pnpm -r test   # tipos y prueba genérica de geometrías
pnpm gallery                      # galería en http://localhost:5173 (con la API: uv run uvicorn twin_api.main:app --port 8000)
```
