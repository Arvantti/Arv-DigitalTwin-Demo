# cooling-tunnel

Túnel de enfriamiento por aspersión para envases llenados en caliente. Visual V2 · comportamiento B3. Ver `FICHA.md`.

- Cada unidad se enfría con una curva de primer orden hacia la temperatura media del agua; la constante depende del volumen.
- El agua de retorno se calienta según la carga térmica (balance con el caudal de agua).
- Sin aspersión (falla o sin agua del chiller) enfría por aire: salen unidades calientes y se registran.
- La banda se detiene si la salida no recibe. Entradas: `inflow_upm`, `inlet_temp_c`, `water_available`, `downstream_free`.
