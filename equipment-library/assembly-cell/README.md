# assembly-cell

Celda de ensamble manual: operarios de pie ante una mesa con dos cubetas de componentes, dispositivo de sujeción y bandeja de salida. Visual V2 · comportamiento B2. Ver `FICHA.md`.

- Cada unidad toma `cycle_s` de un operario; con `operators` operarios el ritmo crece en proporción (con el paso de 1 s, 35 s ÷ 2 se redondea a 18 s). Consume `parts_a_per_unit` y `parts_b_per_unit` componentes al empezar y entrega la unidad al terminar.
- Estados: `running` (arma), `starved` (falta un componente), `blocked` (la salida no recibe; la unidad espera en la bandeja), `idle` (sin operario) y `fault`.
- Cada cubeta acepta hasta `bin_capacity_units`; llena, deja de aceptar (`accepting_a`/`accepting_b` = 0) y bloquea a la máquina que la surte. Lo que llega estando llena se descarta (una ráfaga de la inyectora puede perder una pieza), igual que en `packing-station`.
- Puertos: `parts_a_in`, `parts_b_in` (unidades), `units_out` (unidades armadas). Entradas: `inflow_a_upm`, `inflow_b_upm`, `operator_present`, `downstream_free`. Presets: `pedal-lever-35s`, `hinges-lids-20s`.
- En la planta de inyección: `assembly-01` recibe de imm-06 y imm-19 y entrega al empaque 3; `assembly-02` recibe de imm-08 e imm-14 (flujos supuestos) y no tiene salida simulada.
