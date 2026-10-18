# baggage-carousel

Carrusel de equipaje de placas articuladas, de armado (salidas) o de reclamo (llegadas). Visual V2 · comportamiento B2. Ver `FICHA.md`.

- Capacidad = `length_m` ÷ `pitch_m`; deja de admitir al llegar a `fill_limit_pct`. Entra una maleta por cada espacio que pasa frente a la rampa (`pitch_m` ÷ `speed_m_s`).
- Armado (`mode: makeup`): `handlers` × `handler_upm` maletas por minuto pasan a los carros, solo si hay carro (`downstream_free`).
- Reclamo (`mode: reclaim`): los pasajeros recogen `pick_upm` desde `pick_delay_s` después de la primera maleta de la oleada; eventos `first_bag` y `last_bag` y KPI `wave_min`.
- Lleno: la entrada se llena y deja de aceptar, lo que llena la rampa del clasificador o la banda de llegadas.
- Fallas: disparo del motor y placa trabada (se retira a la mitad del ritmo). Comando: `set_handlers`. Presets: `makeup-40`, `reclaim-60`.
