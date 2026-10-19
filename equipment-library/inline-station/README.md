# inline-station

Estación en línea con fotoceldas: tramo corto donde cada unidad para, espera una operación y sigue. Visual V1 · comportamiento B2. Ver `FICHA.md`.

- `role` cambia el dibujo: mesa giratoria (`turntable`), amarradora (`strapper`), encintadora (`taper`) o mesa manual (`manual_table`).
- `mode: automatic` atiende una unidad a la vez en `index_s + cycle_s + index_s`; `mode: manual` tiene un puesto por operario (`operators`) con `handle_s` por unidad.
- Fotoceldas (variables `pe_*`): **acumulación** (cola llena: `accepting = 0`, la banda anterior para su descarga), **posición** (la unidad está detenida en el puesto) y **salida** (la unidad terminada espera porque la banda siguiente no recibe; el puesto queda `blocked`).
- **Parada automática por atasco**: con `jam_pct` una de cada 100 ÷ `jam_pct` unidades se traba antes de la fotocelda de posición (al azar con `jam_random`). El vigilante avisa `jam_detect_s` después (`jam_detected`) y el puesto queda en falla `jam` durante `jam_clear_s`, lo que tarda el operario en llegar, despejar y rearmar (`reset` lo acorta). La cola sigue recibiendo hasta llenarse.
- **Parada manual**: `manual_stop` (pulsador) detiene toda la estación (estado `off`), que no recibe ni despacha; `resume` o `duration_s` la arrancan.
- Presets: `stack-turntable`, `bundle-strapper` y `manual-table` (fábrica de cajas, `docs/box-plant.md`).
- Limitaciones: la unidad no cambia (lo que entra sale); en la mesa manual un atasco para todos los puestos.
