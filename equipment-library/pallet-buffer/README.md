# pallet-buffer

Buffer de máquina con estiba: la estiba junto a una inyectora que recibe sus piezas, las junta hasta formar una estiba de `pallet_pieces` (X = 1.000 por defecto, elegido por el usuario) y la deja lista para el montacargas. Visual V2 · comportamiento B2. Ver `FICHA.md`.

- Al llenarse, la estiba se cierra durante `pickup_wait_s` y queda lista; sale cuando el destino (la flota de montacargas) la recibe (`downstream_free`). Mientras tanto se arma la siguiente.
- Con `max_waiting_pallets` estibas llenas esperando y otra completa en armado, `accepting` = 0 y el buffer bloquea a la máquina que lo surte (estado `blocked`).
- Estados: `running`, `blocked`, `fault` (estiba mal armada: no entrega hasta rearmarla).
- Puertos: `pieces_in` (piezas, entrada `inflow_upm`), `pallets_out` (contador `units_delivered`, en piezas; llega a la flota en bloques de una estiba). Presets: `pallet-1000`, `pallet-200`.
- Limitación: el bloque de una estiba se entrega en un paso; el motor lo ve como una ráfaga de u/min.
