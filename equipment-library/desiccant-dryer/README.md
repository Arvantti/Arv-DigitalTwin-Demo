# desiccant-dryer

Secador desecante con tolva. Visual V2 · comportamiento B3. Ver `FICHA.md`.

- Tolva FIFO en 40 porciones; el cargador al vacío la mantiene entre 85 y 98 %. La salida entrega la porción del fondo.
- Cada porción se seca hacia 0,01 % con τ = `drying_tau_h` × 2^((consigna − T aire)/12) × (1 + (rocío − rocío de diseño)/10).
- Entradas: `outflow_kg_h` (None = capacidad nominal), `resin_available`, `inlet_moisture_pct`.
- En una planta, el puerto `resin_out` entrega la humedad como propiedad `moisture_pct`; la inyectora la recibe en `resin_moisture_pct`.
- Limitaciones: no modela la temperatura del pellet ni el aire de retorno; la regeneración es un consumo fijo durante la mitad del ciclo de torre.
