# Ficha: molino granulador (granulator)

- Tipo: nuevo
- Función y lugar en el proceso: al pie de la inyectora muele la colada y los rechazos para devolverlos al proceso; en la central de reciclaje (grinder-rec-01) muele scrap lavado antes del peletizado.
- Referencias recibidas: layout `plastic-injection-plant-v1` (grinder-rec-01; inyectoras con `grinder: true`) y ficha 15 de `docs/fichas/fase-3.md`
- Confirmada por: usuario · 2026-10-16 (fichas de la fase 3, opción A)

| Dato | Valor | Origen |
|---|---|---|
| Central | 500 kg/h, criba de 10 mm | layout |
| Al pie de máquina | 40 kg/h, criba de 8 mm | assumed |
| Motor | 45 kW (central), 5,5 kW (al pie) | assumed |
| Tolva | 40 kg (central), 8 kg (al pie) antes de rebosar | assumed |
| Vida de las cuchillas | 120 t (central), 30 t (al pie) | assumed |
| Finos | 1 % con cuchillas afiladas y criba de 8 mm; ×(1 + 6 × desgaste); más con criba fina | assumed |

- Fallas: atasco (MTBF 300 h, MTTR 10 min): el rotor se detiene y la tolva rebosa; cuchillas sin filo (degradación, 2.000 h, 60 min): capacidad −32 %, finos ×5 y más consumo; se repara cambiando las cuchillas.
- Qué es un rechazo y qué lo causa: el molino no rechaza; los finos van al colector de polvo y el material que rebosa cae al piso (se cuenta como pérdida).
- Variables, alarmas y KPIs: tolva, caudal molido, molido y finos acumulados, rebose, desgaste de cuchillas, corriente, potencia y energía; finos promedio, kWh/kg y fracción rebosada.
- Qué se anima: volante del rotor, material cayendo y acumulado en la tolva, nivel del recipiente o saco y baliza.
- Pendiente o desconocido: modelos reales; si la colada molida vuelve a la misma inyectora o al mezclador gravimétrico.
