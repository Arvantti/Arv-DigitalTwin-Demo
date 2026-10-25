# Gemelo digital de confecciones (v1)

Modelo conceptual y balance inicial para una planta de camisetas. **Todos los tiempos, cantidades, dimensiones y dotaciones son supuestos de ingeniería para simulación**, no datos medidos de una fábrica real. SAM = minutos estándar por prenda (incluye tolerancias de operación asumidas; debe validarse con estudio de tiempos y método).

## Distribución y recursos

- Tres módulos de confección idénticos en `plant.yaml`; cada módulo se representa como fila de cinco equipos contiguos: 2 planas JUKI DDL-8700, 2 fileteadoras JACK JK-E4S-4-M03/333 y 1 recubridora Siruba F007K/F007KD. La biblioteca conserva los tipos individuales, mientras que `garment-sewing-module` integra el pipeline compuesto del módulo.
- Una operaria sentada frente a cada máquina (15 en total), con pedal, silla, motor y agujas animadas; una pantalla pequeña junto a cada estación presenta su contador de prendas y cola. Las unidades avanzan por cinco puestos agrupados en el módulo, pero esto no afirma que todo taller textil tenga un orden universal: es una asignación de operaciones para esta simulación.
- Soporte propuesto por turno: 1 supervisora de producción compartida, 1 inspectora de calidad compartida, 1 auxiliar de abastecimiento/WIP, 1 mecánico de mantenimiento compartido. No están incluidos en SAM directo.
- Una línea de corte: recepción e inspección de rollos, reposo/acondicionamiento, tendido, extendido, tizado, corte, piquete/perforación si aplica, numerado, paquetes por talla/color y despacho interno a módulos.
- Almacén de tela separado por lote/color/composición y estado (recibido, inspeccionado, liberado, cuarentena); ubicaciones FIFO y conteo de rollos. Almacén de producto terminado con inspección final, empaque, etiquetado, consolidación por pedido y despacho.
- Flujo simulado en `simulation.yaml`: almacén FIFO de rollos → línea de tendido/corte → seis colas por SKU y módulo → tres módulos en paralelo → inspección final → inventario separado de Polo/Oversize en PT. Las señales `ready` aplican backpressure y conservan WIP en las colas; el almacén PT aún no despacha sin pedidos.

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

Corte y almacenes requieren datos adicionales para capacidad: ancho/gramaje/composición y consumo por talla, largo de tendido, capas, rendimiento de trazo, tiempos de reposo, volumen de rollos, política de inventario, empaque y perfiles de pedido. El corte usa 180 s/rollo, un rendimiento de 48 unidades por rollo Polo o 60 por rollo Oversize y una mezcla de rollos 50/50 como supuestos visuales; cada rollo pertenece a un único SKU. No se inventa SAM de corte por prenda sin especificación de marcador y lote.

## Simulación conectada

La simulación no es una medición de producción: el abastecimiento medio de 0,33 rollos/min, yields por rollo, colas (180 piezas por módulo, 120 en inspección), 33 s de inspección y 2.400 posiciones PT son supuestos editables en contratos/presets. Las operaciones del módulo se agrupan en cinco ciclos derivados del SAM por prenda: Polo [147, 141, 72, 63, 93] s y Oversize [60, 33, 132, 63, 87] s. Cada prenda atraviesa las cinco estaciones; tres módulos corren en paralelo. Se acepta toda prenda inspeccionada mientras no exista una tasa de rechazo confirmada.

Validación del modelo: `uv run twin-lib plant validate garment-factory-v1`; incluye `turno-conectado`, `corte-detencion` e `inspection-stop`. Los `geometry.ts` de los cinco equipos nuevos dibujan almacenes, línea de corte, cinco puestos compactos por módulo, HMI/contadores y producto terminado.
