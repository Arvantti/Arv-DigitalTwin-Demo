# box-converter

Convertidora de cajas: impresora-plegadora-pegadora o troqueladora rotativa alimentada por pilas de láminas. Visual V1 · comportamiento B2. Ver `FICHA.md`.

- El alimentador recibe pilas completas (`infeed_stacks` caben) y la máquina gasta `speed_sheets_min` láminas por minuto; cada lámina da `boxes_per_sheet` cajas y cada `boxes_per_bundle` cajas sale un fajo amarrado.
- Sin láminas queda `starved`; con `delivery_bundles` fajos esperando en la salida queda `blocked`. El cambio de pedido (`order_change`) para `order_change_s`.
- Entradas: `inflow_upm` (pilas/min), `downstream_free`. Presets: `ffg-large`, `ffg-medium` (impresoras-plegadoras-pegadoras) y `rdc-small` (troqueladora rotativa, 2 cajas por lámina).
- Limitaciones: sin rechazos, recorte ni calidad de impresión; la amarradora va incluida en la salida de fajos.
