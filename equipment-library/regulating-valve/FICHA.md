# Ficha: válvula de regulación en línea (regulating-valve)

- Tipo: nuevo
- Función y lugar en el proceso: estrangula el paso entre dos niveles de la rejilla del acueducto a escala con una apertura fija; más adelante podrá automatizarse para regular la presión aguas abajo.
- Referencias recibidas: descripción del autor del 2026-10-17 y diseño [docs/water-network-plant.md](../../docs/water-network-plant.md).
- Confirmada por: Carlos Andres Quiceno · 2026-10-17 (al fusionar el diseño, PR #13, con los supuestos S1–S7)

| Dato | Valor | Origen |
|---|---|---|
| Diámetro | 2" (tubería de la red) | user |
| Operación | manual con apertura fija; automatizable después | user |
| Kv a apertura total | 20 m³/h | assumed (S3) |
| Característica | lineal; igual porcentaje disponible | assumed |
| Recorrido del actuador | 30 s de cerrada a abierta | assumed |
| Medición | caudal y presión en la válvula | user (todas las válvulas miden caudal y presión) |
| Consigna con actuador | 21 mca aguas abajo | assumed |

- Fallas: actuador trabado (MTBF 8.000 h, MTTR 60 min), fuga por el asiento (20.000 h, 120 min, 2 % del Kv).
- Qué es un rechazo y qué lo causa: no aplica.
- Variables, alarmas y KPIs: apertura y apertura ordenada, caudal, presiones de entrada y salida, caída de presión, Kv efectivo, volumen; caudal y caída medios.
- Qué se anima: volante y vástago (o indicador del actuador y su LED) con la apertura, y los dos manómetros.
- Pendiente o desconocido: tipo y Kv reales de las válvulas del modelo físico.
