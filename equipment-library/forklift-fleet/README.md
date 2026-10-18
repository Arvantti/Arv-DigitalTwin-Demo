# forklift-fleet

Flota finita de montacargas por área: hasta 12 vehículos y 10 rutas fijas. Visual V2 · comportamiento B2. Ver `FICHA.md`.

- Cada ruta N tiene su puerto de entrada `pallets_in_N` (piezas que llegan, en bloques de estiba) y su puerto de salida `pieces_out_N` (piezas entregadas en el destino). Una estiba espera en la cola de su ruta hasta que un montacargas libre la carga (`load_s`), la lleva (`route_N_m ÷ speed_m_s`), la descarga (`unload_s`) y regresa por el carril contrario.
- Los montacargas no salen a la vez: entre salida y salida hay al menos `headway_s` (corredor compartido sin adelantamientos). El que espera aparece en `v*_wait`.
- La ruta deja de aceptar estibas (`accepting_N` = 0) cuando suma `max_pallets_per_route` entre cola, viaje y entrega pendiente; eso se propaga como `ready` hasta el buffer o el almacén que la surte.
- Las piezas descargadas salen hacia el destino a `route_N_feed_upm` (con 1.000.000 llegan juntas; en una línea de ensamble, el ritmo con que se sacan de la estiba) y solo si el destino las recibe.
- Falla `vehicle_breakdown`: un montacargas menos para nuevos viajes hasta repararlo.
- Presets: `plant-6` (6 montacargas, rutas de la planta de plásticos) y `compact-2` (2 montacargas).
- Canales por montacargas `v1…v12`: `_route`, `_pos` (0 = origen, 0,5 = destino, 1 = de regreso), `_loaded`, `_wait`.
- Limitación: los 10 puertos de salida son independientes; una ruta cuyo puerto no se enlaza entrega a un destino que no se simula (el vehículo se ocupa igual).
