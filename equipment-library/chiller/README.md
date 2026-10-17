# chiller

Enfriador de agua enfriado por aire con compresores por etapas. Visual V2 · comportamiento B2. Ver `FICHA.md`.

- Circuito de temperatura única (`C·dT/dt = carga − frío`), etapas con banda muerta de ±0,5 °C y 180 s mínimo entre cambios, derrateo por ambiente y COP variable.
- Si la carga supera la capacidad o hay un disparo por alta presión, el suministro sube (eventos `supply_temp_high` / `supply_temp_normal`).
- Entradas: `load_kw`, `ambient_c`. Presets: `600kw-mold-water`, `600kw-standby` (apagado), `150kw-process`.
- Limitación: la carga térmica no la entregan las inyectoras; el circuito usa `nominal_load_kw` (la cascada chiller → inyectora queda para una fase posterior).
