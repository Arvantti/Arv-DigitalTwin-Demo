# baggage-sorter

Clasificador de equipaje de bandejas basculantes en lazo cerrado. Visual V2 · comportamiento B2. Ver `FICHA.md`.

- Largo del lazo = 2 × `straight_m` + π × `loop_width_m`; bandejas cada `tray_pitch_m`. La inducción pone hasta `induct_max_upm` maletas por minuto en bandejas libres. En la escena la inducción llega por el extremo -X del lado de las rampas (a ancho/2 + 3,0 m del eje): tramo recto, curva motorizada y banda a 30° que entrega a favor del flujo en el borde de las bandejas, al inicio de la recta de descarga.
- El lector lee `read_rate_pct` % de las etiquetas; las demás van a la rampa de codificación manual. Las leídas se reparten entre los vuelos según `split_<n>_pct` (método del mayor déficit).
- Cada rampa guarda `chute_capacity` maletas y entrega al carrusel una cada `release_gap_s` mientras el carrusel recibe. Con la rampa llena la maleta da otra vuelta; tras `max_recirc` vueltas va a manual (`dumped`).
- Salidas: `out_1` … `out_4` y `manual_out`. Entradas: `inflow_upm`, `downstream_free_1..4`, `manual_free`.
- Fallas: disparo de motores y bandeja trabada (detienen el lazo), lector desalineado (lee 60 %).
- Comandos: `set_speed`, `set_split`. Presets: `tilt-tray-4`, `compact-2`.
- Limitaciones: un vuelo fijo por rampa; no hay asignación dinámica ni almacén de maletas tempranas.
