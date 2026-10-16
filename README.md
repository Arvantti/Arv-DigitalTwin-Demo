# Gemelo digital industrial (demo + plataforma)

Plataforma para construir gemelos digitales de plantas industriales a partir de una **librería de equipos estandarizados**. Cada equipo es una pieza de código configurable: un modelo 3D paramétrico más un comportamiento simulado. La demo arma dos plantas de referencia ficticias:

| Planta | Tipo de manufactura | Layout |
|---|---|---|
| Inyección de artículos plásticos | Discreta | `industrial-models/plastic-injection-plant-v1/` |
| Salsas y aderezos | Por procesos (batch + continuo) | `industrial-models/sauce-plant-v1/` |

Los datos de las plantas son estimaciones plausibles, no de una instalación real.

## Estructura

```
equipment-library/        librería de equipos (un tipo por carpeta) + _schema + _template
packages/twin-runtime/    runtime de comportamiento en Python + CLI twin-lib
packages/twin-3d/         piezas 3D, materiales PBR y escenario (three.js)
apps/api/                 API FastAPI con simulación en vivo por WebSocket
apps/gallery/             galería web de la librería
industrial-models/        layouts de planta (plant.yaml + plano 2D)
docs/                     guías (crear equipos: docs/equipment-authoring.md; plan: docs/roadmap.md)
tools/                    validación de layouts y capturas de vista previa
```

## Inicio rápido

```bash
uv sync && pnpm install
uv run twin-lib list                               # tipos de equipo
uv run twin-lib run jacketed-kettle --scenario tomato-sauce-batch --every 600
uv run uvicorn twin_api.main:app --port 8000 &     # API de simulación
pnpm gallery                                       # http://localhost:5173
```

En la galería: elige un equipo, ajusta sus parámetros, selecciona un escenario y pulsa **SIMULAR**.

## Crear equipos nuevos

Con Claude (skill `new-equipment`) o con Codex (`AGENTS.md`), entregando fotos, catálogos o una descripción. El procedimiento está en [docs/equipment-authoring.md](docs/equipment-authoring.md).

## Verificación

```bash
uv run twin-lib validate && uv run pytest && uv run ruff check . && pnpm -r typecheck && pnpm -r test
```
