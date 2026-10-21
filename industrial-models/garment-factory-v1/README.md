# Gemelo digital de confecciones (v1)

Modelo conceptual y balance inicial para una planta de camisetas. **Todos los tiempos, cantidades, dimensiones y dotaciones son supuestos de ingeniería para simulación**, no datos medidos de una fábrica real. SAM = minutos estándar por prenda (incluye tolerancias de operación asumidas; debe validarse con estudio de tiempos y método).

## Distribución y recursos

- Tres módulos de confección idénticos, cada uno con 2 máquinas planas (`lockstitch-sewing-machine`), 2 fileteadoras (`overlock-sewing-machine`) y 1 recubridora (`coverstitch-sewing-machine`): **15 máquinas** en total. Los tres tipos tienen contrato, geometría y comportamiento en `equipment-library/`.
- Una operaria por máquina durante el ciclo (15 operarias directas), representadas en los puestos. La asignación es por operación y balance; una operación no implica que cada prenda visite todas las máquinas.
- Soporte propuesto por turno: 1 supervisora de producción compartida, 1 inspectora de calidad compartida, 1 auxiliar de abastecimiento/WIP, 1 mecánico de mantenimiento compartido. No están incluidos en SAM directo.
- Una línea de corte: recepción e inspección de rollos, reposo/acondicionamiento, tendido, extendido, tizado, corte, piquete/perforación si aplica, numerado, paquetes por talla/color y despacho interno a módulos.
- Almacén de tela separado por lote/color/composición y estado (recibido, inspeccionado, liberado, cuarentena); ubicaciones FIFO y conteo de rollos. Almacén de producto terminado con inspección final, empaque, etiquetado, consolidación por pedido y despacho.
- Flujo: almacén de tela → corte → supermercado de paquetes → módulos 1–3 → inspección/acabado → almacén PT → despacho. Evitar mezclar lotes y mantener trazabilidad de rollo a paquete y pedido.

## Operaciones estándar y SAM inicial

SAM en minutos por unidad terminada. Estimación de método para talla adulta, máquina industrial convencional y operaria calificada. Tiempos pueden variar por talla, material, diseño, habilidad y calidad. No incluye corte ni manejo logístico, que se controlan como procesos/lotes separados.

| # | Camiseta Polo: operación | Máquina / recurso | SAM |
|---|---|---|---:|
| 1 | Cerrar hombros y estabilizar con cinta | Plana | 0.55 |
| 2 | Preparar, unir y pespuntear pie de cuello | Plana | 1.05 |
| 3 | Cerrar extremos y montar cuello | Plana | 0.90 |
| 4 | Preparar cartera (doblar/reforzar) | Plana | 0.75 |
| 5 | Montar cartera al delantero y pespuntear | Plana | 1.00 |
| 6 | Pegar mangas a sisas | Fileteadora | 1.20 |
| 7 | Cerrar costados y bajo mangas | Fileteadora | 1.05 |
| 8 | Recubrir ruedo de mangas | Recubridora | 0.70 |
| 9 | Recubrir ruedo inferior | Recubridora | 0.85 |
| 10 | Presillas/remates de cartera y etiquetas | Plana | 0.55 |
| 11 | Inspección en proceso y limpieza de hilos | Manual | 0.55 |
|  | **Total SAM Polo** |  | **9.15 min** |

| # | Camiseta Oversize: operación | Máquina / recurso | SAM |
|---|---|---|---:|
| 1 | Cerrar hombros y estabilizar | Plana | 0.55 |
| 2 | Pegar mangas caídas a sisas | Fileteadora | 1.15 |
| 3 | Cerrar costados y bajo mangas | Fileteadora | 1.05 |
| 4 | Recubrir ruedo de mangas | Recubridora | 0.65 |
| 5 | Recubrir ruedo inferior | Recubridora | 0.80 |
| 6 | Preparar y montar cuello rib | Fileteadora | 1.05 |
| 7 | Pespuntear cuello / asegurar costura | Plana | 0.55 |
| 8 | Colocar marquilla y etiqueta de talla | Plana | 0.45 |
| 9 | Remates, revisión y limpieza de hilos | Manual | 0.55 |
|  | **Total SAM Oversize** |  | **6.80 min** |

Los tiempos de cada fila son SAM de contenido de trabajo por prenda, no takt ni ciclo de línea; cuando se balancee la línea, se asignarán elementos a puestos y se medirá el ciclo de cada puesto. En polo la carga de planas es alta; conviene balancear preparación de cartera/cuello entre puestos o módulos sin asumir que la capacidad teórica equivale a producción real.

## Supuestos de capacidad (referencia)

Con 8 horas/turno, 85% de eficiencia planificada (408 min productivos por operaria) y mezcla 50/50: capacidad laboral ideal = 408 / ((9.15 + 6.80)/2) = **51 prendas por operaria-turno equivalentes**, o **765 prendas-turno para 15 operarias**. Es un límite de contenido de trabajo agregado, no una promesa de salida: el cuello de botella por tipo de máquina, balance, cambios, ausentismo, defectos, pausas y abastecimiento lo reducirán. Corte, calidad y logística deben modelarse aparte.

Corte y almacenes requieren datos adicionales para capacidad: ancho/gramaje/composición y consumo por talla, largo de tendido, capas, rendimiento de trazo, tiempos de reposo, volumen de rollos, política de inventario, empaque y perfiles de pedido. No se inventa SAM de corte por prenda sin especificación de marcador y lote.
