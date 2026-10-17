# pelletizing-line

Línea de extrusión y peletizado de hebras para reciclar el molido. Visual V2 · comportamiento B2. Ver `FICHA.md`.

- Capacidad efectiva = nominal × (1 − 0,6 × suciedad de la malla) × (1 − 0,02 × déficit de temperatura sobre 5 °C, mínimo 0,2). La malla se ensucia con el material procesado (de 0 a 100 % en `screen_life_t` toneladas); `change_screen` la limpia. Presión del filtro = 60 + 120 × suciedad bar, con aviso a 140 bar.
- El fundido tiende a la consigna con constante de 600 s; en frío pasa por `starting` y sale a menos de 3 °C de la consigna. Con `heater_fault` baja unos 35 °C y la capacidad cae.
- Tolva con `hopper_kg` (`accepting = 0` cuando se llena o la línea está apagada; evento `hopper_full`); estados `starved` (gira sin molido), `blocked` (la descarga no recibe), `fault` (atasco de la cortadora). Mientras está en `fault` o `starting` la tolva sigue recibiendo.
- Puertos: `granulate_in` (caudal y `ready`), `pellet_out` (caudal y `ready`). Entradas: `feed_kg_h`, `downstream_free`. Presets: `350kg-recycling`, `350kg-dirty-screen`, `350kg-cold-start`.
- En el motor de planta recibe el molido del molino (`grinder-rec-01`) y entrega pellet al silo 5 por la estación de big-bag (`docs/plant-engine.md`).
- Limitación: el pellet no pasa por una criba de finos ni se mide su calidad; la humedad del pellet reciclado no se modela.
