# Ficha: estación en línea con fotoceldas (inline-station)

- Tipo: nuevo · Función: los procesos intermedios del transporte de la fábrica de cajas (`docs/box-plant.md`): mesas giratorias de pilas, amarradoras de fajos y mesas manuales donde el fajo para y espera a un operario
- Confirmada por: pedido del autor del 2026-10-19 (cada banda es una unidad independiente con secuencia de sensores; paradas automáticas y manuales; simulador de atascos). Todo es imaginario (decisión del 2026-10-18): los valores son supuestos

| Dato | Valor | Origen |
|---|---|---|
| Mesa giratoria de pilas | 5 s para entrar, 8 s de giro, 5 s para salir; una pila | **assumed** |
| Amarradora | 1 + 3 + 1 s por fajo (12 fajos/min); cola de 2 | **assumed** |
| Mesa manual | 10 s por fajo y operario más 1,5 + 1,5 s de traslado (4,6 fajos/min por operario); cola de 4 | **assumed** |
| Vigilante de atasco | 5 s (amarradora), 10 s (mesa giratoria y manual) | **assumed** |
| Despeje y rearme | 2 min (amarradora), 5 min (mesa giratoria), 1 min (mesa manual) | **assumed** |

- Sensores: tres fotoceldas por estación (acumulación, posición, salida), pulsador de paro y baliza.
- Fallas: atasco (`jam`, solo por el vigilante o inyectado), motor o mecanismo (MTBF 2.000 h, MTTR 20 min), fotocelda sucia (3.000 h, 10 min).
- Qué se anima: la cola, la unidad en el puesto (gira con la mesa, el cabezal de la amarradora baja), la salida, el color de cada haz, los operarios y la baliza.
