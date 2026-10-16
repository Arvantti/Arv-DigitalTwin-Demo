# steam-boiler

Caldera pirotubular a gas. Visual V2 · comportamiento B3. Ver `FICHA.md`.

- Presión por balance: `dP/dt = (generación − demanda) / inercia`. Con presión en cero solo llega lo que genera el quemador.
- Quemador modulante con PID sobre la presión; bajo el fuego mínimo cicla con prebarrido en cada encendido (`burner_starts`).
- Gas según la entalpía del vapor, la eficiencia y el poder calorífico. Entradas: `steam_demand_kg_h`, `fuel_available`.
