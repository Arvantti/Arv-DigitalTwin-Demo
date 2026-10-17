# operator

Persona de planta con EPP por planta y rol. Visual V2 · comportamiento B2. Ver `FICHA.md`.

- Comandos: `go_to {x, y, task, work_min?}` (con `work_min` trabaja ese tiempo y vuelve solo), `go_home`, `set_home`.
- Eventos `arrived`, `task_done` y `returned_home`. El controlador `maintenance_crew` del motor de planta usa `arrived` para soltar el reloj de reparación del equipo.
- Ruta Manhattan a `speed_m_s`. La geometría mira hacia +X y gira con el canal `heading` (plano +y = mundo −Z).
