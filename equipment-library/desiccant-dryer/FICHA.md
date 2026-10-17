# Ficha: secador desecante (desiccant-dryer)

- Tipo: nuevo · Función: secar la resina higroscópica antes de las inyectoras (ficha 12 de `docs/fichas/fase-3.md`)
- Confirmada por: usuario · 2026-10-16 (fichas de la fase 3); geometría pedida el 2026-10-17

| Dato | Valor | Origen |
|---|---|---|
| Capacidad | 150 (ABS), 250 y 400 kg/h | user (plant.yaml) |
| Temperatura | 80 °C (ABS, PP/HDPE), 70 °C (PS) | user (plant.yaml) |
| Punto de rocío | −40 °C (ABS) | user (plant.yaml) |
| Huella | 2,0 × 1,5 × 3,0 m | user (plant.yaml); el modelo escala con la capacidad |
| Residencia en tolva | 4 h (ABS), 3 h, 2 h | **assumed** |
| Humedad de entrada y límite | 0,2 % y 0,02 % (ABS) | **assumed** |
| τ de secado | 1,2 h a 80 °C, el doble cada 15 °C menos | **assumed** |

- Fallas: regeneración del desecante (MTBF 2.500 h, MTTR 60 min), disparo del soplador, resistencia del calentador.
- Pendiente: la cascada hacia la humedad de la inyectora.
