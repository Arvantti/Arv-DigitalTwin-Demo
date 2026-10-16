# case-packer

Encajadora semiautomática. Visual V2 · comportamiento B2. Ver `FICHA.md`.

- Pulmón de unidades: cuando se llena deja de aceptar (`accepting = 0`) y bloquea a la línea.
- Ciclo por caja: armado, carga y cierre. Sin cajas plegadas queda `starved`; si el paletizado no recibe, retiene la caja cerrada (`blocked`).
- Entradas: `inflow_upm`, `boxes_available`, `downstream_free`. Presets: `250ml-24`, `500ml-20`, `1000ml-12`.
