# Instrucciones para agentes

Este repositorio construye una plataforma de gemelos digitales industriales. Las plantas de demostración se arman con una **librería de equipos** reutilizable.

## Estructura
- `equipment-library/<tipo>/`: un tipo de equipo por carpeta con contrato (`equipment.yaml`), comportamiento (`behavior.py`), geometría 3D (`geometry.ts`), presets, escenarios y pruebas. `_schema/` tiene el JSON Schema; `_template/` es el punto de partida.
- `packages/twin-runtime/`: runtime de Python. Clase base `EquipmentBehavior`, primitivas (PID, retardos, sensores, fallas, OEE, vapor), simulador y CLI `twin-lib`.
- `packages/twin-3d/`: piezas 3D, materiales PBR y escenario de render (three.js).
- `apps/twin-emulator-api/`: host FastAPI/WebSocket para sesiones de emulación; no contiene reglas exclusivas de una planta.
- `apps/gallery/`: galería web para ver, parametrizar y simular cada equipo, y escena de planta en 3D (`plant.html`, `docs/plant-scene.md`).
- `apps/gallery/plc.html`: PLC Master/HMI simulado del acueducto. Se abre desde la escena 3D y desde el portal; consume el contrato `/api/plants/{id}/plc-schema`, simulación WebSocket y `public/data/acueducto-dia.json` para la curva diaria de referencia, generada por `tools/hydraulics/dia_acueducto.py`.
- `industrial-models/corrugated-box-plant-v1/`: fábrica de cajas de cartón corrugado centrada en el transporte de pilas (`docs/box-plant.md`), simulada con los tipos `corrugator`, `transfer-car`, `box-converter`, `palletizer`, `inline-station` (mesas giratorias, amarradoras y mesas manuales con fotoceldas y atascos) y `belt-conveyor`; las piezas de escena de los equipos no simulados están en `apps/gallery/src/box-plant-pieces.ts`.
- `industrial-models/<planta>/plant.yaml`: layouts de planta. `tools/layout/render_layout.py` los valida y dibuja.
- `industrial-models/<planta>/catalog/`: catálogo de datos de la planta (materiales, productos con su ruta, moldes o recetas, tamaños de equipo, montaje y pedidos) con el esquema común `industrial-models/_schema/catalog.schema.json`; el motor lo lee (`docs/datos-reales.md`). Hoy solo plásticos.
- `industrial-models/<planta>/manifest.yaml`: paquete portable de cada planta; declara runtime, entrypoints y equipos reutilizables requeridos. Valídalo con `uv run python tools/validate_model.py`.
- `industrial-models/<planta>/simulation.yaml`: qué equipos del layout se simulan y cómo se conectan por puertos (motor de planta, `docs/plant-engine.md`).

## Crear o modificar equipos
Siga **`docs/equipment-authoring.md`** paso a paso. Reglas no negociables:
- El modelo 3D nunca es fuente de verdad: solo refleja los canales que publica el comportamiento.
- `true_values()` y `animation()` devuelven exactamente lo que declara el contrato.
- Cada escenario con `expect` es una prueba; los valores esperados se calculan a mano, no se ajustan para que pasen.
- Los datos inciertos se marcan como `assumed`. No se usan marcas ni nombres de empresas reales.

## Comandos
```bash
uv sync && pnpm install
uv run twin-lib validate          # librería completa
uv run twin-lib plant validate    # plantas conectadas: enlaces y escenarios
uv run twin-lib plant run sauce-plant-v1 --scenario boiler-trip
uv run twin-lib catalog validate    # catálogos de datos (productos, moldes o recetas, tamaños, montaje)
uv run twin-lib catalog route plastic-injection-plant-v1 papelera-20l
uv run pytest                     # pruebas de Python
uv run ruff check .
pnpm -r typecheck && pnpm -r test   # tipos y prueba genérica de geometrías
pnpm gallery                      # galería en http://localhost:5173 (con el emulador: uv run uvicorn twin_emulator_api.main:app --port 8000)
                                  # escena de planta: http://localhost:5173/plant.html (docs/plant-scene.md)
```

## Registro del proyecto (obligatorio)
`docs/registro/` es una bóveda de Obsidian con el plan, la bitácora, las decisiones y el histórico de conversaciones con la IA, que respaldan el registro de software en Colombia. **Todo PR actualiza la bitácora y el histórico** siguiendo `docs/registro/como-actualizar.md`. Nunca incluyas credenciales ni tokens en esas notas.
