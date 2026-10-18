# corrugator

Corrugadora vista desde el transporte de pilas: ritmo de láminas, apilador y salida hacia el transportador. Visual V1 · comportamiento B1. Ver `FICHA.md`.

- Láminas por minuto = velocidad ÷ largo de lámina × láminas a lo ancho; cada `sheets_per_stack` láminas sale una pila.
- La salida guarda `outfeed_stacks` pilas; si el transportador no recibe y se llena, la línea se detiene (`blocked`).
- Comandos: `order_change` (para `order_change_s` y aplica el nuevo largo y láminas a lo ancho), `set_speed`, `start`, `stop`. Fallas: rotura de papel, empalme fallido y lámina alabeada (baja la velocidad).
- Entradas: `downstream_free`. Presets: `bc-2500` (la de la fábrica de cajas) y `single-wall-1800`.
- Limitaciones: no modela papel, vapor ni goma; con la salida llena para en lugar de bajar la velocidad.
