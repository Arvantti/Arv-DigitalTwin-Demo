# palletizer

Paletizador automático de fajos. Visual V1 · comportamiento B2. Ver `FICHA.md`.

- Mesa de entrada de `infeed_capacity` fajos, ritmo `rate_bundles_min`, estibas de `bundles_per_pallet` fajos y cambio de estiba de `pallet_change_s`.
- La estiba llena sale si la salida recibe (`downstream_free`); si no, espera una y con la siguiente el paletizador se bloquea. Sin estibas vacías queda `starved`. Con la mesa llena deja de aceptar y bloquea la banda.
- Presets: `shared-40` (compartido por las líneas 2 y 3 de la fábrica de cajas) y `single-24` (línea 1).
- Limitaciones: no distingue productos; en el paletizador compartido una estiba mezcla lo que llega.
