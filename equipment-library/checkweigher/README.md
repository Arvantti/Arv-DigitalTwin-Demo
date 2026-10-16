# checkweigher

Control de peso dinámico con detector de metales. Visual V2 · comportamiento B2. Ver `FICHA.md`.

- Pesa cada unidad (error de báscula 0,3 g más la deriva por falla) y la acepta o rechaza; cuenta rechazos falsos y aceptaciones falsas comparando con el peso real.
- El detector encuentra el 99,5 % del metal; si la prueba con patrón se vence, el lote queda retenido (`lot_on_hold`).
- Entradas: `inflow_upm`, `upstream_mean_g`, `upstream_sd_g` (de la sachetadora), `downstream_free`.
