# Ficha: clasificador de bandejas basculantes (baggage-sorter)

- Tipo: nuevo · Función: leer la etiqueta de cada maleta despejada y llevarla a la rampa de su vuelo.
- Referencias recibidas: ninguna (pedido en lenguaje natural del 2026-10-18; ficha de planta en `/mnt/project-files/aeropuerto/ficha-diseno-bhs.md`).
- Confirmada por: pendiente (valores típicos propuestos) · 2026-10-18

| Dato | Valor | Origen |
|---|---|---|
| Lazo | 2 rectas de 28 m, curvas de 10,5 m (≈ 89 m) | assumed |
| Velocidad y bandejas | 2 m/s, una cada 1,4 m (63 bandejas) | assumed |
| Lectura de etiquetas | 97 % | assumed |
| Rampas | 4 de vuelo + 1 de manual, 4 maletas cada una | assumed |
| Recirculación | máximo 2 vueltas extra | assumed |

- Fallas: disparo de motores (MTBF 4.000 h, 20 min), bandeja trabada (800 h, 8 min), lector desalineado (1.500 h, 30 min, degradación).
- Variables y KPIs: inducidas, sin lectura, vueltas extra, descartadas, entregadas por rampa, ocupación, velocidad, corriente; maletas/h, lectura, vueltas por maleta, fracción a manual.
- Qué se anima: bandejas sobre el óvalo, maletas en bandejas y rampas, baliza.
