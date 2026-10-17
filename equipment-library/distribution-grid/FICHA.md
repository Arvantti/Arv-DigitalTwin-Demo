# Ficha: rejilla de distribución de un nivel (distribution-grid)

- Tipo: nuevo
- Función y lugar en el proceso: cada uno de los cuatro niveles de la red (una comuna); las válvulas de consumo son las casas y las de fuga representan pérdidas y fraudes. El agua cae a canaletas que la llevan a los tanques de recirculación.
- Referencias recibidas: descripción del autor del 2026-10-17 y diseño [docs/water-network-plant.md](../../docs/water-network-plant.md).
- Confirmada por: Carlos Andres Quiceno · 2026-10-17 (al fusionar el diseño, PR #13, con los supuestos S1–S7)

| Dato | Valor | Origen |
|---|---|---|
| Forma | rejilla rectangular, distribución libre | user |
| Distribución | cabezal + 4 ramales de 4 válvulas, 2,0 × 2,0 m, nodos cada 0,5 m | assumed (S1) |
| Válvulas de fuga | 2 por nivel, en otro color (rojo), misma función | user (color y función), assumed (número y lugar) |
| Tubería | 2" | user |
| Separación entre niveles | 1,20 m | user |
| Medición | caudal y presión en cada válvula | user |
| Kv de consumo y de fuga | 0,12 m³/h al 100 % | assumed (S3) |
| Válvula de cada ramal | bola de 2", Kv 20 m³/h | assumed |
| Presión mínima de servicio | 15 mca | assumed |

- Fallas: fuga que revienta (MTBF 2.000 h, MTTR 120 min), ramal obstruido (5.000 h, 90 min).
- Qué es un rechazo y qué lo causa: no aplica; la alarma es una casa bajo la presión mínima de servicio.
- Variables, alarmas y KPIs: caudal y presión de cada una de las 18 válvulas, totales del nivel, % de fugas, presión mínima y su válvula; consumo, fugas, agua no contabilizada y presión mínima registrada.
- Apariencia: cada válvula lleva una placa con su número (C11 a C44, L1 y L2 las de fuga, los mismos ids del comando set_opening); las canaletas van 5 cm bajo la salida de las válvulas para que el agua no salpique (pedido del autor, 2026-10-17).
- Forma de la red (pedido del autor, 2026-10-17): cada ramal tiene 5 posiciones; las casas ocupan las que no tienen fuga y la fuga de los ramales 2 y 4 va en la posición 1, 3 o 5 (parámetros leak_slot_branch2 y leak_slot_branch4; por defecto 5). Los extremos (posición 5) y la tercera posición de los ramales 1–2 y 3–4 están unidos por caminos entre ramales vecinos: rejilla cerrada. Todas las válvulas de bola (las 18 de descarga y las 4 de entrada a los ramales) son de PVC de unión doble: colas, tuercas de unión, cuerpo abombado y manija plana que gira 90° con la apertura (11:42).
- Qué se anima: manija de cada válvula con su apertura, chorro proporcional al caudal hacia la canaleta y manómetro de entrada.
- Pendiente o desconocido: Kv y tipo reales de las válvulas del modelo físico.
