# vffs-sachet-filler

Sachetadora vertical: forma, llena, sella, codifica y corta sachets (1 a 8 pistas, llenado en frío o en caliente). Visual V2 · comportamiento B3. Ver `FICHA.md`.

## Qué simula
- **Ciclo** de arrastre de película, dosificación y sellado con corte, a `cycles_min`; cada ciclo produce `lanes` sachets. El ritmo no depende del paso de simulación.
- **Peso** de cada sachet: nominal (`unit_ml` × `density_kg_l`) más el sobrellenado objetivo, con la desviación del dosificador. Reporta media, desviación y producto regalado; el rechazo por peso es del control de peso.
- **Rechazos** por sello (temperatura de mordazas fuera de ventana, goteo), por código y, en llenado en caliente, por producto bajo la temperatura mínima.
- **Laminado:** consumo por rollo y cambio automático; **cambio de formato** con `change_format` (estado `setup`).
- **Paradas:** sin producto o sin aire (`starved`), salida llena (`blocked`).

## Entradas del entorno
`product_available`, `product_temp_c` (del tanque pulmón), `downstream_free`, `air_pressure_bar` (del compresor).

## Presets
`250ml-2-lanes`, `250ml-2-lanes-hot`, `250ml-1-lane`, `500ml-1-lane`, `1000ml-1-lane-hot`, `1000ml-1-lane`.
