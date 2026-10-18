# baggage-screening

Inspección de equipaje en bodega por niveles con una máquina CT en línea. Visual V2 · comportamiento B2. Ver `FICHA.md`.

- Admite una maleta cada 3.600 ÷ `max_bph` s; tras `scan_s` el nivel 1 decide: `l1_alarm_pct` % queda con alarma.
- Nivel 2: `l2_operators` revisan cada imagen en `l2_review_s` y despejan `l2_clear_pct` %. Una imagen que no se termina antes de `l2_timeout_s` (punto de decisión) sale a nivel 3.
- Salidas: `cleared_out` (despejadas, hacia el clasificador) y `alarm_out` (hacia nivel 3), cada una con una maleta cada `release_gap_s` como máximo.
- Si la salida de despejadas no recibe, la máquina deja de admitir cuando la salida, el túnel y las alarmas en revisión suman `exit_buffer_units` (`blocked`); la entrada se llena y deja de aceptar (`accepting = 0`), lo que bloquea la colectora.
- Fallas: rayos X y atasco (detienen la máquina); caída del enlace de imágenes (toda alarma va a nivel 3).
- Entradas: `inflow_upm`, `downstream_free`, `l3_free`. Comando: `set_operators`. Presets: `ct-600`, `ct-1200-hub`.
- Limitaciones: alarmas repartidas de forma uniforme (no aleatoria) para poder calcular a mano; sin categorías de amenaza ni maletas fuera de norma.
