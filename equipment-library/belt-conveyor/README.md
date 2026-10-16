# belt-conveyor

Banda transportadora (plana, malla, tablillas o rodillos). Visual V2 · comportamiento B2. Ver `FICHA.md`.

- Las unidades avanzan a la velocidad de la banda y se acumulan contra la descarga con la separación `pitch_m` cuando la salida no recibe (`blocked`).
- Al llenarse deja de aceptar (`accepting = 0`, evento `full`): la máquina anterior debe quedar bloqueada (se conecta en la fase 4).
- Entradas: `inflow_upm`, `downstream_free`. Presets: `sachet-250`, `sachet-1000`, `case-roller`, `imm-main-88m`.
