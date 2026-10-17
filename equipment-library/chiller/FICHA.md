# Ficha: enfriador de agua (chiller)

- Tipo: nuevo · Función: agua fría del circuito de moldes (ficha 18 de `docs/fichas/fase-3.md`)
- Confirmada por: usuario · 2026-10-16 (fichas de la fase 3); geometría pedida el 2026-10-17

| Dato | Valor | Origen |
|---|---|---|
| Capacidad y consigna | 600 kW, 12 °C (y 150 kW, 4 °C en salsas) | user (plant.yaml, layout) |
| Caudal | 180 m³/h (moldes) | user (plant.yaml) |
| Huella | 6,0 × 2,5 × 2,5 m | user (plant.yaml) |
| Etapas | 3 compresores | **assumed** |
| Volumen de agua del circuito | 20 m³ | **assumed** |
| Carga nominal | 360 kW (60 %) | **assumed** |
| COP | 4,5 a 30 °C | **assumed** |

- Fallas: disparo por alta presión (MTBF 3.000 h, MTTR 45 min); condensador sucio (degradación).
- El segundo chiller de la nave (`chiller-02`) es de respaldo y arranca apagado.
