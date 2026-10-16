# tubular-pasteurizer

Pasteurizador tubular con tubo de retención y válvula de desvío. Visual V2 · comportamiento B3. Ver `FICHA.md`.

- Salida por efectividad del intercambiador con el UA actual (cae con el ensuciamiento) y la temperatura del vapor en la chaqueta (PID sobre la válvula, limitado por la presión que entrega la caldera).
- Desvío cuando la sonda de retención baja del mínimo; la letalidad (valor P) se calcula con la temperatura real, así una sonda con deriva puede dejar pasar producto bajo la letalidad requerida (`under_target_l`).
- CIP elimina el ensuciamiento. Entradas: `product_available`, `product_in_c`, `steam_supply_bar`, `downstream_free`.
