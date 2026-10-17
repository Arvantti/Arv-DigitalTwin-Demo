# Ficha: chiller (enfriador de agua)

- Tipo: nuevo
- Función y lugar en el proceso: enfría el agua de los moldes de las inyectoras (12 °C) y el agua de proceso de la planta de salsas (4 °C); con banco de hielo, entrega agua helada para el emulsificador.
- Referencias recibidas: layouts `plastic-injection-plant-v1` (chiller-01 y -02) y `sauce-plant-v1` (chiller-01, ice-bank-01); ficha 18 de `docs/fichas/fase-3.md`
- Confirmada por: usuario · 2026-10-16 (fichas de la fase 3, opción A)

| Dato | Valor | Origen |
|---|---|---|
| Presets | 600 kW a 12 °C (moldes), 150 kW a 4 °C (proceso), banco de hielo de 600 kWh | layout |
| Caudal del lazo | 180 m³/h en moldes | layout |
| Compresores | 4 etapas (600 kW), 2 etapas (150 kW y banco) | assumed |
| Inercia del lazo | 15 m³ (moldes), 5 m³ (proceso), 6 m³ (banco) | assumed |
| COP | 3,2 a 7 °C de suministro, +3 % por K | assumed |
| Control | Banda muerta ±1 K y 3 min mínimo entre cambios de etapa | assumed |

- Fallas: disparo por alta presión (MTBF 3.000 h, MTTR 45 min): se detienen todos los compresores y el agua de los moldes se calienta; fuga de refrigerante (8.000 h, 120 min, degradación): la capacidad baja al 60 %.
- Qué es un rechazo y qué lo causa: el chiller no rechaza. Entrega la temperatura del agua a la inyectora (entrada `cooling_water_c`); si llega a menos de 8 °C bajo la consigna del molde, el molde se calienta, el ciclo se alarga y aparecen rechupes y deformación.
- Variables, alarmas y KPIs: suministro, retorno, carga, frío producido, etapas, COP, potencia, energía, carga del hielo; alarma con suministro sobre consigna + 3 K; COP promedio, temperatura máxima y arranques por hora.
- Qué se anima: ventiladores, LED por compresor, bomba, color de la tubería de suministro, nivel del hielo y baliza.
- Pendiente o desconocido: modelos reales, temperatura exterior de diseño y curvas de los compresores.
