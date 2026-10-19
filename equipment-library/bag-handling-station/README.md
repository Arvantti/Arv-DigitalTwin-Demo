# bag-handling-station

Estación manual de equipaje: nivel 3 de seguridad o codificación de etiquetas. Visual V2 · comportamiento B2. Ver `FICHA.md`.

- Las maletas llegan a la mesa (hasta `queue_capacity`); cada uno de los `operators` atiende una en `handle_s`.
- `reject_pct` % queda retenida; el resto regresa al sistema por la banda de reingreso, una cada `release_gap_s`, si el clasificador recibe. En la escena la banda de reingreso corre por el borde -Z y entrega, con su tambor, en el borde +X de la huella, donde la recibe la banda de regreso de la planta.
- Fallas: detector de trazas fuera de servicio (+50 % de tiempo), evacuación del área (detiene todo). Comando: `set_operators`.
- Presets: `level3-3ops` (4 min por maleta, 1 % retenidas), `encoding-1op` (20 s por etiqueta).
