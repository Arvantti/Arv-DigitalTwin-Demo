# Ficha: isla de check-in de equipaje (checkin-island)

- Tipo: nuevo · Función: atender pasajeros, pesar y etiquetar maletas y enviarlas a la banda colectora (inicio del sistema de equipaje).
- Referencias recibidas: ninguna (pedido en lenguaje natural del 2026-10-18; ficha de planta en `/mnt/project-files/aeropuerto/ficha-diseno-bhs.md`).
- Confirmada por: pendiente (valores típicos propuestos) · 2026-10-18

| Dato | Valor | Origen |
|---|---|---|
| Mostradores por isla | 8, de 3,5 m | assumed |
| Atención por pasajero | 90 s | assumed |
| Maletas por pasajero | 1,1 | assumed |
| Peso de maleta | 17 ± 5 kg; exceso sobre 23 kg; máximo 32 kg | assumed |
| Inyección a la colectora | una maleta cada 2,5 s por isla | assumed |

- Fallas: caída del sistema de salidas (MTBF 4.000 h, 20 min), atasco de impresora de etiquetas (150 h, 10 min), báscula descalibrada (2.000 h, 30 min).
- Variables y KPIs: fila, atendidos, maletas, fuera de norma, exceso, peso, espera estimada; espera promedio, fila máxima, maletas/h.
- Qué se anima: agentes ocupados, pasajeros en fila, maletas en las básculas, bandas de inyección, baliza.
