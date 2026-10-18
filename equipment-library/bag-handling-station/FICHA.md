# Ficha: estación manual de equipaje (bag-handling-station)

- Tipo: nuevo · Función: atender a mano las maletas con alarma no despejada (nivel 3) o sin etiqueta legible (codificación) y devolverlas al clasificador.
- Referencias recibidas: ninguna (pedido en lenguaje natural del 2026-10-18; ficha de planta en `/mnt/project-files/aeropuerto/ficha-diseno-bhs.md`).
- Confirmada por: pendiente (valores típicos propuestos) · 2026-10-18

| Dato | Valor | Origen |
|---|---|---|
| Nivel 3 | 3 operarios, 4 min por maleta, 1 % retenidas | assumed |
| Codificación | 1 operario, 20 s por etiqueta | assumed |
| Mesa de llegada | 10 maletas (nivel 3), 8 (codificación) | assumed |

- Fallas: detector de trazas (MTBF 1.000 h, 30 min, degradación), evacuación del área (20.000 h, 45 min).
- Variables y KPIs: mesa, en atención, atendidas, retenidas, devueltas, espera de la más antigua; maletas/h, utilización, tasa de retención, espera promedio.
- Qué se anima: maletas en la mesa, maletas abiertas, banda de reingreso, baliza.
