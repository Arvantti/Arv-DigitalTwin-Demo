# belt-conveyor

Banda transportadora (plana, malla, tablillas o rodillos). Visual V2 · comportamiento B2. Ver `FICHA.md`.

- Las unidades avanzan a la velocidad de la banda y se acumulan contra la descarga con la separación `pitch_m` cuando la salida no recibe (`blocked`).
- Al llenarse deja de aceptar (`accepting = 0`, evento `full`): la máquina anterior debe quedar bloqueada (se conecta en la fase 4).
- Entradas: `inflow_upm`, `downstream_free`. Presets: `sachet-250`, `sachet-1000`, `case-roller`, `imm-main-88m` y, para el equipaje de aeropuerto (`item: bag`), `bhs-collector-46m`, `bhs-transfer-9m`, `bhs-inbound-18m` y `bhs-bridge-20m`.
- Perfil de altura (solo dibujo): la entrada está a `height_m` y la descarga a `height_m + rise_m`. Con `crest_height_m` la banda sube con pendiente `ramp_deg`, cruza a nivel (un puente sobre un pasillo) y baja; si el largo no alcanza, las rampas se empinan. Las patas crecen con la altura y llevan arriostramiento. El comportamiento sigue cada unidad sobre el recorrido real (`path_length_m`).
- Confluencia (solo dibujo): con `merge_at_m` > 0 la guía del lado `merge_side` se abre `merge_width_m` en ese punto para que otra banda entregue de costado. En la simulación las unidades de los dos enlaces se suman en la entrada.
- Física simple: separación mínima `pitch_m` (una unidad que alcanza a la de adelante con más de 0,05 m/s cuenta como choque, `collisions`) y fricción `friction_coef` (0,45 por defecto): en una subida con tan θ mayor la unidad resbala y se detiene al pie (`slip`, `slipping`) y en una bajada así se desliza más rápido que la banda. La posición de cada unidad sale en el snapshot (`items`) y la escena la dibuja. Escenarios `bridge-steady`, `steep-ramp-slip` y `queue-collisions`.
