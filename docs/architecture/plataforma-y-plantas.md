# Plataforma común y carpeta por planta

Decisión del 2026-11-05 para replicar en salsas la cadena de plásticos (APS, cosimulador, Fractal, emulador, gemelo
3D) sin generalizar el código de plásticos con adaptadores. Cada planta es su propio proyecto, se despliega por
separado y solo depende de una plataforma versionada que no nombra ninguna planta.

```
platform/                     piezas comunes, versionadas; no nombran plantas
  cosim-core/                 contratos (customer-orders.v1, manual-sequence.v1, production-plan.v1, plant-event.v1),
                              calendario de turnos, tablas de cambio y tiempo de espera, esquemas JSON
  fractal-core/               contrato fractal-study.v1 y bucle de estudio (variantes → cosimulador → puntaje → mejor)
packages/twin-runtime/        motor físico, librería de equipos, CLI twin-lib (se mudará a platform/ más adelante)
packages/twin-3d/             piezas 3D (ídem)
equipment-library/            tipos de equipo (ídem)

plants/<planta>/              una planta empaquetada como proyecto propio
  plant.yaml, simulation.yaml, manifest.yaml, layout.svg, catalog/, aps/, orders/   modelo (sin código)
  cosim/                      modelo de la planta y programa lineal; importa @twin/cosim-core
  fractal/                    escenarios y palancas de la planta; importa @twin/fractal-core
  app/                        pantallas propias (APS, emulador 2D, centro de control) cuando las tenga
  docs/                       documentación de la planta
```

## Reglas

- Una planta importa solo la plataforma (`@twin/cosim-core`, `@twin/fractal-core`, `twin_runtime`), nunca otra planta.
- La plataforma no nombra plantas: lo propio de cada una (moldes, marmitas, CIP, alérgenos) vive en su carpeta.
- El modelo va en la raíz de `plants/<planta>/` (no en una subcarpeta) porque el nombre de la carpeta es el id de la
  planta para el runtime, la API y `tools/validate_model.py`.
- Una planta no puede estar a la vez en `industrial-models/` y en `plants/`: el runtime lo rechaza.
- `plants/<planta>/` no trae `_schema/`: su catálogo se valida con el esquema común `industrial-models/_schema/`.

## Cómo encuentra el runtime las plantas

`twin_runtime.roots` busca en dos raíces, en este orden: `industrial-models/` (`$TWIN_MODELS`) y `plants/`
(`$TWIN_PLANTS`, o la carpeta `plants` al lado de la de modelos). La CLI (`twin-lib plant`, `catalog`, `plan`), la
API (`/api/plants`) y `tools/validate_model.py` usan las dos. En el contenedor, `TWIN_MODELS=/app/industrial-models`
deja las plantas empaquetadas en `/app/plants` sin configurar nada más.

## Plásticos

Plásticos sigue en `industrial-models/plastic-injection-plant-v1/` con su cosimulador en `cosim/` y su Fractal en
`fractal/manufacturing/`, que tienen su propia copia de los contratos. Se mudará a `plants/` en un PR aparte, cuando
estén grabados los videos de la demo, para que su comportamiento no cambie mientras tanto.

## Fractal como producto

Fractal como motor declarativo independiente (un solo motor que lee el problema de cualquier planta) queda para una
fase posterior, cuando existan plásticos, salsas y aeropuerto y se vea qué tienen en común. Por ahora la plataforma
da el bucle y el contrato, y cada planta pone sus palancas y su puntaje.

## Fases

1. Plataforma mínima: `platform/cosim-core`, `platform/fractal-core`, runtime y API leen `plants/`.
2. `plants/sauce-plant-v1`: modelo de salsas con CIP, alérgenos, pulmón, lotes, cartera fija y plan manual.
3. en adelante: cosimulador, Fractal, pantallas y 3D de salsas (ver el documento de arquitectura de la réplica).
