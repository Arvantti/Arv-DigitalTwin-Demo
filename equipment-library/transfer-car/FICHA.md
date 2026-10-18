# Ficha: carro de transferencia (transfer-car)

- Tipo: nuevo · Función: repartir las pilas de la corrugadora entre los carriles de alimentación de la fábrica de cajas (`docs/box-plant.md`)
- Confirmada por: decisión del autor del 2026-10-18 (todo imaginario, lo que consuma menos): todos los valores son supuestos

| Dato | Valor | Origen |
|---|---|---|
| Riel | 58 m | **assumed** (plano) |
| Velocidad | 2 m/s | **assumed** |
| Cargar y descargar una pila | 10 s cada una | **assumed** |
| Carriles | 3, a 45, 33 y 21 m de la posición de carga | **assumed** (plano) |

- Regla de reparto: cada pila va al carril libre con menos pilas entregadas respecto de su peso; en la fábrica, 10, 15 y 12 pilas/h, lo que gasta cada máquina.
- Fallas: variador (MTBF 2.000 h, MTTR 30 min) y sensor de posición (3.000 h, 20 min).
- Qué se anima: el carro sobre el riel y la pila que lleva.
