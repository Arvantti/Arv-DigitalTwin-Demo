# transfer-car

Carro de transferencia de pilas sobre riel. Visual V1 · comportamiento B2. Ver `FICHA.md`.

- Recibe una pila en la posición de carga (`load_s`), viaja a `speed_m_s` hasta el carril de destino, la entrega (`unload_s`) y regresa.
- Atiende hasta cuatro carriles (`dist_1_m` … `dist_4_m`; 0 = sin carril). Cada pila va al carril que recibe (`free_n`) con menos pilas entregadas respecto de su peso (`weight_n`, por ejemplo las pilas por hora del plan). Sin carril libre espera cargado (`blocked`) y deja de aceptar pilas.
- Cada carril es un puerto de salida propio (`out_1` … `out_4`), así el motor de planta no necesita repartir una salida entre varios destinos.
- Presets: `stack-3-lanes` (fábrica de cajas) y `short-4-lanes`.
- Limitaciones: sin rampas de aceleración; una pila por viaje; en la entrada guarda como máximo dos pilas en espera, como el transportador que la alimenta.
