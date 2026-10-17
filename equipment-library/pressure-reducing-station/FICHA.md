# Ficha: estación reguladora de presión (pressure-reducing-station)

- Tipo: nuevo
- Función y lugar en el proceso: recibe el agua del grupo de bombeo a ≈ 79 mca (1 m más arriba de las bombas) y la entrega a la red de cuatro niveles; baja la presión para que la válvula más crítica (nivel 4) reciba 20 mca.
- Referencias recibidas: descripción del autor del 2026-10-17 y diseño [docs/water-network-plant.md](../../docs/water-network-plant.md).
- Confirmada por: Carlos Andres Quiceno · 2026-10-17 (al fusionar el diseño, PR #13, con los supuestos S1–S7)

| Dato | Valor | Origen |
|---|---|---|
| Diámetro | 4" hasta la estación | user |
| Bifurcación | manual, una rama con PRV automática y otra con PRV manual | user |
| Objetivo | 20 mca en la válvula más crítica, no solo a la salida de la estación | user |
| Medición del punto crítico | por telemetría desde el nivel 4 | assumed (S5) |
| Salida de diseño | 26,66 mca con 13 m³/h de día | assumed (predimensionamiento, sección 4) |
| Kv de cada PRV | 60 m³/h | assumed |
| Válvulas de corte | compuerta de 4", Kv 400 m³/h | assumed |
| PID | kp 0,3, ki 0,05 1/s; salida entre 15 y 40 mca | assumed |
| Cambio de rama | 20 s por maniobra (abre y luego cierra) | assumed |

- Fallas: pérdida de telemetría (MTBF 3.000 h, MTTR 45 min), deriva del piloto (6.000 h, 60 min), diafragma roto (15.000 h, 180 min).
- Qué es un rechazo y qué lo causa: no aplica; las alarmas son presión crítica baja (−10 %) o alta (+15 %).
- Variables, alarmas y KPIs: presiones de entrada, salida y punto crítico, caudal total y por rama, consignas, rama en servicio, potencia y energía disipadas; presión crítica media, % del tiempo en ± 5 % y potencia disipada media.
- Qué se anima: volantes y vástagos de las válvulas de corte, indicador de posición de cada PRV, manómetros, pantalla del controlador y baliza.
- Pendiente o desconocido: modelo y Kv reales de las PRV del modelo físico.
