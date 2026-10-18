# Ficha: convertidora de cajas (box-converter)

- Tipo: nuevo · Función: convertir las pilas de láminas en fajos de cajas en la fábrica de cajas (`docs/box-plant.md`)
- Confirmada por: decisión del autor del 2026-10-18 (todo imaginario, varios tamaños de caja, lo que consuma menos): todos los valores son supuestos

| Dato | Valor | Origen |
|---|---|---|
| Cajas grandes (línea 1) | impresora-plegadora-pegadora, 100 láminas/min, 1 caja por lámina | **assumed** |
| Cajas medianas (línea 2) | impresora-plegadora-pegadora, 150 láminas/min, 1 caja por lámina | **assumed** |
| Cajas pequeñas (línea 3) | troqueladora rotativa, 120 láminas/min, 2 cajas por lámina | **assumed** |
| Fajo | 25 cajas | **assumed** |
| Alimentador | 2 pilas de 600 láminas | **assumed** |
| Cambio de pedido | 15 min (clisés), 20 min (troquel) | **assumed** |

- Fallas: atasco del alimentador (MTBF 25 h, MTTR 6 min), atasco de la plegadora (40 h, 8 min), troquel gastado (300 h, baja al 85 %).
- Qué se anima: las láminas del alimentador y la baliza.
