# Ficha: secador desecante (desiccant-dryer)

- Tipo: nuevo
- Función y lugar en el proceso: seca el pellet higroscópico (ABS, PS) o el reciclado lavado antes de la inyectora, en la central de materiales. Recibe pellet húmedo por cargador al vacío y entrega pellet seco a una o varias inyectoras.
- Referencias recibidas: layout `plastic-injection-plant-v1` (dryer-01 a dryer-04) y ficha 12 de `docs/fichas/fase-3.md`
- Confirmada por: usuario · 2026-10-16 (fichas de la fase 3, opción A)

| Dato | Valor | Origen |
|---|---|---|
| Capacidad | 150 kg/h (ABS), 250 kg/h (PS), 400 kg/h (PP/HDPE reciclado) | layout |
| Temperatura y rocío | 80 °C / −40 °C (ABS); 70 °C (PS); 80 °C (reciclado) | layout |
| Residencia | 3 h ABS, 1,5 h PS, 1 h reciclado lavado | assumed |
| Humedad de entrada | 0,30 % ABS, 0,15 % PS, 0,50 % reciclado lavado | assumed |
| Cinética | Constante de secado 0,8 h (ABS), 0,4 h (PS), 0,25 h (reciclado); se duplica cada 12 °C bajo la consigna y crece con el rocío | assumed |
| Límite de humedad | 0,10 % (ABS y PS), 0,20 % (poliolefinas), igual que en la inyectora | assumed |
| Torres de desecante | Cambio cada 4 h | assumed |

- Fallas: falla de regeneración (MTBF 2.500 h, MTTR 60 min): el rocío sube hacia el del ambiente (+12 °C) y el pellet sale húmedo; falla del calentador (4.000 h, 45 min); falla del cargador (1.500 h, 15 min): la tolva se vacía.
- Qué es un rechazo y qué lo causa: el secador no rechaza; entrega la humedad a la inyectora (entrada `resin_moisture_pct`), que rechaza por rayas plateadas.
- Variables, alarmas y KPIs: masa y nivel de tolva, humedad de salida, rocío, temperatura del aire, caudal, residencia, potencia y energía; alarma de humedad; kWh/kg y fracción entregada fuera de límite.
- Qué se anima: nivel en la mirilla, cargador, calentador, indicador de rocío, torre activa y baliza.
- **Ajuste respecto de la ficha aprobada:** la ficha decía "punto de rocío sube a −10 °C". Con aire a 80 °C, un rocío de −10 °C todavía seca casi igual; lo que daña el secado es que el desecante saturado deja pasar el aire de la planta. Se modela el rocío subiendo hacia el del ambiente (+12 °C, parámetro `ambient_dew_c`) y el secado que se vuelve hasta 6 veces más lento.
- Pendiente o desconocido: curvas reales de secado de las resinas de la planta.
