# Plataforma

Piezas comunes a todas las plantas, versionadas. No nombran ninguna planta: cada una en `plants/<planta>/` las
importa y pone lo suyo. Ver `docs/architecture/plataforma-y-plantas.md`.

| Paquete | Qué trae |
|---|---|
| `cosim-core/` (`@twin/cosim-core`) | contratos del cosimulador, calendario de turnos, tablas de cambio (`pairMin`, `combine`), tiempo de espera (`holdLeft`), esquemas JSON |
| `fractal-core/` (`@twin/fractal-core`) | contrato `fractal-study.v1` y bucle de estudio `runStudy(model)` con puntaje ponderado |

```bash
pnpm --filter @twin/cosim-core --filter @twin/fractal-core test
```
