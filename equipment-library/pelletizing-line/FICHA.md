# Ficha: línea de peletizado de reciclaje (pelletizing-line)

- Tipo: nuevo · Función: fundir el molido que entrega el molino de reciclaje y cortarlo en pellet, para devolverlo a los silos de reciclado (plano: `extruder-pel-01`, zona de reciclaje).
- Confirmada por: usuario · 2026-10-17 02:19 («Sí, por favor», a cerrar el lazo de reciclaje con la extrusora de pellet). Los datos que el plano no da son supuestos; se revisan con el usuario en el PR.

| Dato | Valor | Origen |
|---|---|---|
| Capacidad | 350 kg/h | user (plant.yaml) |
| Filtro | cambiador de malla | user (plant.yaml) |
| Huella | 14 × 2 × 2,5 m (el modelo ocupa ≈ 9,6 × 2,0 × 2,4 m) | user (plant.yaml) |
| Alimentación | molido del molino de reciclaje; 250 kg/h si el entorno no la fija | **assumed** |
| Motor del husillo | 110 kW | **assumed** |
| Temperatura de fundido | 230 °C | **assumed** (PP/HDPE reciclado) |
| Tolva | 200 kg | **assumed** |
| Vida de la malla | 60 t | **assumed** |
| Presión del filtro | 60 bar con la malla limpia, aviso a 140 bar | **assumed** |
| Energía | ≈ 0,3 kWh/kg a 86 % de carga | **assumed** |

- Fallas: atasco de la cortadora (MTBF 400 h, MTTR 15 min); malla tapada (degradación, MTBF 1.000 h); falla de calefacción (degradación, MTBF 3.000 h).
- Pendiente: la mezcla de pellet reciclado en la resina de las inyectoras (silo 5 → manifold → inyectora) y la humedad del pellet reciclado.
