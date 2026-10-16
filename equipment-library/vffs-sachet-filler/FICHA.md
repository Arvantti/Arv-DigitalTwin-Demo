# Ficha: sachetadora vertical (vffs-sachet-filler)

- Tipo: nuevo
- Función y lugar en el proceso: forma, llena, sella, codifica y corta sachets de salsa desde un rollo de laminado. Recibe producto del tanque pulmón y entrega a la banda hacia el túnel o el control de peso.
- Referencias recibidas: layout `sauce-plant-v1` y respuestas del usuario (todo en sachet; tamaños de 250, 500 y 1.000 ml)
- Confirmada por: usuario · 2026-10-16 (fichas de la fase 3, opción A)

| Dato | Valor | Origen |
|---|---|---|
| Tamaños | 250, 500 y 1.000 ml | user |
| 250 ml | 2 pistas, 80 a 100 u/min; mostaza en 1 pista, 60 u/min | assumed |
| 500 ml | 1 pista, 45 u/min | assumed |
| 1.000 ml | 1 pista, 30 u/min | assumed |
| Cambio de formato | 500 ↔ 1.000 ml en ≈ 30 min | assumed |
| Llenado en caliente | Tomate y BBQ ≥ 85 °C; por debajo, rechazo | user |
| Densidades | Tomate 1,12 · mayonesa 0,93 · mostaza 1,05 kg/L | assumed |
| Sellado | 150 °C ± 10 | assumed |
| Dosificación | Desviación típica 1,5 %; sobrellenado objetivo 1 % | assumed |
| Rollo | 6.000 (250 ml), 4.000 (500 ml), 3.000 (1.000 ml) sachets; cambio de 8 min | assumed |
| Aire comprimido | ≥ 6 bar | layout, assumed |

- Fallas: atasco de película (MTBF 200 h, MTTR 6 min), resistencia de mordaza (600 h, 15 min, degradación), cinta de codificadora (150 h, 3 min), goteo del dosificador (900 h, 20 min, degradación).
- Qué es un rechazo y qué lo causa: sello débil (mordazas fuera de ventana, goteo), código ilegible, producto frío en llenado en caliente. El rechazo por peso lo hace el control de peso.
- Variables, alarmas y KPIs: velocidad, rechazos por causa, temperatura de mordazas y de producto, peso medio y desviación, sobrellenado, laminado restante; OEE.
- Qué se anima: avance de película, mordazas, pistón, diámetro del rollo, caída del sachet, baliza.
- Pendiente o desconocido: velocidades reales de las máquinas de la planta.
