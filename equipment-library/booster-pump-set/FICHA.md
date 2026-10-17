# Ficha: grupo de bombeo en paralelo (booster-pump-set)

- Tipo: nuevo
- Función y lugar en el proceso: bombea el agua de los tanques del piso 3 hacia la estación reguladora y la red del acueducto a escala (preset principal), y sube el agua de los tanques de recirculación del piso 2 a los de bombeo (preset de recirculación).
- Referencias recibidas: descripción del autor del 2026-10-17 y diseño [docs/water-network-plant.md](../../docs/water-network-plant.md).
- Confirmada por: Carlos Andres Quiceno · 2026-10-17 (al fusionar el diseño, PR #13, con los supuestos S1–S7)

| Dato | Valor | Origen |
|---|---|---|
| Bombas principales | 3 multietapa verticales en paralelo, 2 trabajan y 1 de reserva | user (paralelo), assumed (número, S4) |
| Presión de entrega | 80 mca en la descarga | user |
| Caudal de diseño | 8 m³/h por bomba a 80 m; 13 m³/h de demanda de día | assumed (sección 4 del diseño) |
| Altura a caudal cero | 100 m | assumed |
| Eficiencia y motor | 62 %, 4 kW por bomba | assumed |
| Colector | 4" hasta la estación reguladora | user |
| Antirretorno | uno por bomba en la descarga, Kv = 5 × caudal de diseño | user (antirretornos), assumed (Kv) |
| Bombas de recirculación | 2 centrífugas horizontales, 1 + 1, 15 m³/h a 10 m, por nivel | user (bombas normales), assumed (datos) |
| Niveles de recirculación | arranca con el origen > 60 %, para < 20 % o con el destino > 90 % | assumed |

- Fallas: disparo de la bomba líder (MTBF 4.000 h, MTTR 60 min), variador (8.000 h, 90 min), impulsores desgastados (6.000 h, 240 min, degradación).
- Qué es un rechazo y qué lo causa: no aplica; la alarma es presión de descarga 10 % bajo la consigna.
- Variables, alarmas y KPIs: presiones de succión y descarga, caudal, velocidad, bombas en marcha y disponibles, bomba líder, potencia, energía y energía específica; potencia media, presión mínima, arranques.
- Qué se anima: rotores de cada bomba, luces de marcha y disparo, LEDs del variador, manómetro, HMI y baliza.
- Pendiente o desconocido: curvas reales de las bombas del modelo físico (el autor mencionó una marca; el repositorio usa bombas genéricas, S6).
