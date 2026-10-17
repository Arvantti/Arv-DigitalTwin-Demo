# Ficha: estación de empaque (packing-station)

- Tipo: nuevo · Función: contar las piezas que llegan por banda, encajarlas y estibarlas (ficha 23 de `docs/fichas/fase-3.md`, empaque)
- Confirmada por: usuario · 2026-10-16 (fichas de la fase 3); geometría pedida el 2026-10-17

| Dato | Valor | Origen |
|---|---|---|
| Huella | 3,0 × 2,0 × 1,0 m | user (plant.yaml) |
| Piezas que llegan a la estación 1 | las de la inyectora 3 por la banda de 88 m | user (flujo del plano) |
| Piezas por caja | 250 (tapas) | **assumed** |
| Ritmo del operario | 120 u/min | **assumed** |
| Cambio de caja | 20 s | **assumed** |
| Mesa de espera | 200 piezas | **assumed** |
| Cajas por tarima | 40 | **assumed** |

- Fallas: impresora de etiquetas (MTBF 150 h, MTTR 6 min) y sellador (300 h, 8 min).
- Las estaciones 2 a 4 no tienen banda en el plano: se simulan sin llegadas.
