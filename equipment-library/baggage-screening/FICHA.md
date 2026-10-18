# Ficha: inspección de equipaje en bodega (baggage-screening)

- Tipo: nuevo · Función: inspeccionar con CT cada maleta documentada antes del clasificador; separar las que necesitan revisión manual.
- Referencias recibidas: ninguna (pedido en lenguaje natural del 2026-10-18; ficha de planta en `/mnt/project-files/aeropuerto/ficha-diseno-bhs.md`).
- Confirmada por: pendiente (valores típicos propuestos) · 2026-10-18

| Dato | Valor | Origen |
|---|---|---|
| Capacidad | 600 maletas/h | assumed |
| Tránsito hasta la decisión de nivel 1 | 12 s | assumed |
| Alarma de nivel 1 | 25 % | assumed |
| Nivel 2 | 2 operadores, 30 s por imagen, despejan 80 %, límite 120 s | assumed |
| Huella | 5 m de cuerpo + bandas de entrada y salida, banda de 1 m | assumed |

- Fallas: rayos X (MTBF 1.500 h, 45 min), atasco en el túnel (300 h, 5 min), caída del enlace de imágenes (2.000 h, 30 min, degradación).
- Variables y KPIs: inspeccionadas, alarmas, despejadas en nivel 2, vencidas, enviadas a nivel 3, colas, tensión del tubo; maletas/h, tasa de alarma, tasa a nivel 3.
- Qué se anima: bandas, maletas en el túnel y en la entrada, luz de rayos X, baliza.
