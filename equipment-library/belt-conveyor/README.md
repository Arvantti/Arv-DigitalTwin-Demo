# belt-conveyor

Banda transportadora (plana, malla, tablillas o rodillos). Visual V2 · comportamiento B2. Ver `FICHA.md`.

- Las unidades avanzan a la velocidad de la banda y se acumulan contra la descarga con la separación `pitch_m` cuando la salida no recibe (`blocked`).
- Al llenarse deja de aceptar (`accepting = 0`, evento `full`): la máquina anterior debe quedar bloqueada (se conecta en la fase 4).
- Entradas: `inflow_upm`, `downstream_free`. Presets: `sachet-250`, `sachet-1000`, `case-roller`, `imm-main-88m` y, para el equipaje de aeropuerto (`item: bag`), `bhs-collector-46m`, `bhs-transfer-9m`, `bhs-inbound-18m` y `bhs-bridge-20m`.
- Perfil de altura (solo dibujo): la entrada está a `height_m` y la descarga a `height_m + rise_m`. Con `crest_height_m` la banda sube con pendiente `ramp_deg`, cruza a nivel (un puente sobre un pasillo) y baja; si el largo no alcanza, las rampas se empinan. Las patas crecen con la altura y llevan arriostramiento. El comportamiento sigue usando `length_m` (largo en planta).
