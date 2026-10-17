# Ficha: molino granulador (granulator)

- Tipo: nuevo · Función: moler scrap y mazarotas en granulado para reciclar (ficha 15 de `docs/fichas/fase-3.md`)
- Confirmada por: usuario · 2026-10-16 (fichas de la fase 3); geometría pedida el 2026-10-17

| Dato | Valor | Origen |
|---|---|---|
| Capacidad | 500 kg/h (de 300 a 500) | user (plant.yaml) |
| Criba | 10 mm | user (plant.yaml) |
| Alimentación | 300 kg/h de scrap lavado | user (flujo del plano) |
| Huella | 3,0 × 2,5 × 2,5 m | user (plant.yaml) |
| Motor | 37 kW | **assumed** |
| Tolva | 150 kg | **assumed** |
| Vida de las cuchillas | 150 t | **assumed** |
| Preset pequeño | 40 kg/h al pie de máquina | **assumed** (ficha) |

- Fallas: atasco (MTBF 300 h, MTTR 10 min); cuchillas desafiladas (degradación, MTBF 800 h).
