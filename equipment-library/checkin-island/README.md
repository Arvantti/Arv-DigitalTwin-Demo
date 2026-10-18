# checkin-island

Isla de mostradores de check-in (facturación de equipaje). Visual V2 · comportamiento B2. Ver `FICHA.md`.

- Fila única: cada mostrador abierto que queda libre toma al siguiente pasajero y lo atiende en `process_s`.
- Al terminar, el pasajero deja `bags_per_pax` maletas (en promedio) en la báscula. Las que pasan de `max_kg` van a fuera de norma (`oog_bags`); sobre `excess_kg` se cobra exceso (`excess_bags`).
- La isla inyecta a la colectora una maleta cada `release_gap_s` mientras la colectora recibe (`downstream_free`). Si no recibe, las maletas esperan en las básculas y el agente no atiende al siguiente: la isla queda `blocked` y la fila crece.
- Fallas: caída del sistema de salidas (detiene todo), atasco de impresora (un mostrador menos), báscula descalibrada (+30 s por pasajero en un mostrador).
- Entradas: `downstream_free`. Comandos: `set_arrivals`, `open_counters`. Presets: `island-4-small`, `island-8`, `island-12-hub`.
- Limitaciones: llegadas uniformes dentro de la hora (las oleadas se arman con `set_arrivals`); no hay fila preferencial ni autoservicio.
