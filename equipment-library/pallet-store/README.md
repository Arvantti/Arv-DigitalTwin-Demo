# pallet-store

Almacén de estibas: estantería de semielaborado que recibe estibas llenas, las guarda como inventario y entrega una estiba por pedido. Visual V2 · comportamiento B2. Ver `FICHA.md`.

- Recibe piezas en bloques de estiba (`pallets_in`) y las acumula; ocupa una posición por cada `pallet_pieces` (la estiba en formación cuenta). Con todas las posiciones ocupadas, `accepting` = 0 y deja de recibir.
- Entrega una estiba completa (`pallets_out`, contador de piezas) cuando el siguiente tramo está libre (`downstream_free`), con `release_gap_s` de separación.
- Estados: `running`, `starved` (menos de una estiba completa), `blocked` (llena), `fault` (pasillo obstruido).
- `initial_pallets` fija el inventario inicial: una planta no arranca con las estanterías vacías.
- Presets: `semielaborado-48` (48 posiciones, 16 m, 4 niveles) y `semielaborado-small-12`.
