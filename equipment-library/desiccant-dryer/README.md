# desiccant-dryer

Secador desecante de tolva para resina. Visual V2 · comportamiento B2. Ver `FICHA.md`.

- Modela el aire de proceso (temperatura y punto de rocío con retardo), la tolva (nivel, cargador de vacío que repone al 90 %) y la humedad de salida de la resina: `m_eq + (m_in − m_eq)·exp(−t_res/τ_sec)` con retardo igual al tiempo de residencia.
- `resin_dry = 1` mientras la humedad esté bajo `moisture_limit_pct`; si falla la regeneración del desecante el rocío sube a −10 °C y la resina sale húmeda (evento `moisture_alarm`).
- Entradas: `resin_available`, `demand_kg_h`. Presets: `abs-150`, `recycled-ps-250`, `recycled-pp-400`.
- Limitación: no entrega la humedad a la inyectora (la cascada secador → inyectora queda para una fase posterior); `resin_out` ya declara `flow_kg_h` y `available`.
