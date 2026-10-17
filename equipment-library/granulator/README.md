# granulator

Molino granulador de cuchillas. Visual V2 · comportamiento B2. Ver `FICHA.md`.

- Capacidad efectiva = nominal × (0,6 + 0,4 × filo) × √(criba ÷ 10 mm). El filo baja con el material procesado; baja la capacidad, sube la corriente y aumentan los finos (3 % → 12 %) hasta `sharpen`.
- Tolva con `hopper_kg` (`accepting = 0` cuando se llena, evento `hopper_full`); estados `starved` (gira sin material), `blocked` (salida sin recibir), `fault` (atasco).
- Entradas: `feed_kg_h`, `downstream_free`. Presets: `500kg-recycling`, `40kg-beside-press`, `500kg-worn`.
- Limitación: el scrap lo entrega `nominal_feed_kg_h` mientras la línea de lavado no tenga tipo en la librería.
