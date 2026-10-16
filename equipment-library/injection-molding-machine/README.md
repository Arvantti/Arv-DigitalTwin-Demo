# injection-molding-machine

Inyectora horizontal de termoplásticos (manufactura discreta). Visual V2 · comportamiento B3.

## Qué simula
- **Ciclo por fases** (cierre → inyección → sostenimiento → enfriamiento/dosificación → apertura → expulsión), derivado de `cycle_s`. El ritmo no depende del paso de simulación.
- **Térmica**: cilindro (consigna por resina), molde (termorregulador) y aceite hidráulico, con respuesta de primer orden. Arranque en frío opcional (`start_hot: false`).
- **Proceso**: presión de inyección instantánea y pico, colchón, energía por fase. Potencias según tonelaje.
- **Calidad**: probabilidad de defecto por cavidad según desviaciones de temperatura del cilindro y del molde, colchón y humedad de la resina (`short_shot`, `flash`, `sink_marks`, `warp`, `splay`).
- **Estados**: `blocked` si la salida está llena, `starved` sin material, `setup` en cambio de molde.
- **Fallas**: resistencia del cilindro, sobretemperatura hidráulica, pieza pegada, robot, termorregulador, válvula antirretorno.
- **KPIs**: OEE (disponibilidad × rendimiento × calidad), scrap, kWh/kg, piezas por hora.

## Entradas del entorno
`material_available`, `downstream_free`, `cooling_water_ok`, `resin_moisture_pct` (la entrega el secador).

## Presets
`100t-cutlery`, `300t-container`, `650t-bucket`, `1500t-bin`.

## Limitaciones
No simula el llenado de la cavidad (CFD) ni la dinámica hidráulica detallada. Las relaciones son de orden de magnitud de catálogo, suficientes para operación y KPIs.

## Validar
```bash
uv run twin-lib validate injection-molding-machine
uv run twin-lib run injection-molding-machine --scenario heater-failure --every 300
```
