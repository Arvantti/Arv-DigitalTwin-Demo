# granulator

Molino granulador de plástico, al pie de máquina o central. Visual V2 · comportamiento B2. Ver `FICHA.md`.

- La alimentación entra a la tolva; si pasa de `throat_kg`, rebosa (`overflow_kg`).
- El rotor muele hasta `capacity_kg_h × (1 − 0,4 × desgaste)`. Desgaste = toneladas molidas / `knife_life_t`.
- Finos = (1 + 6 × desgaste) % × √(8 / criba). Sin transporte de salida (`downstream_free = false`) el molido llena el recipiente y el molino se bloquea.
- Entradas: `feed_kg_h` (None = `nominal_feed_kg_h`), `downstream_free`. En una planta, la salida `scrap_out` de la inyectora empuja su `scrap_kg` al puerto `scrap_in`.
