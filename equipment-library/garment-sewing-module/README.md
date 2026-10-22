# Módulo de confección: cinco puestos en fila

Una sola entidad de simulación representa el módulo físico completo de cinco máquinas en fila (plana, plana, fileteadora, fileteadora, recubridora). La geometría dibuja los cinco puestos contiguos, cinco operarias sentadas en sillas regulables, pedal/aguja/hilos y una pantalla lateral de producción por máquina. Cada display lee `station_N_units` y `station_N_queue` de los contadores reales del módulo.

El comportamiento es una línea de cinco servidores en pipeline con una cola limitada entre estaciones. Cada unidad cruza los cinco puestos. Los segundos por puesto se agregan a partir de los SAM detallados en el README del gemelo: Polo [147,141,72,63,93] s, Oversize [60,33,132,63,87] s; total con inspección 549 s y 408 s respectivamente. La agrupación de elementos a puestos es propuesta de balance, no estudio industrial aprobado. Las piezas de operaciones que requieren una vuelta a una máquina se consideran agrupadas en el trabajo del puesto, no se simula ruta circular o cambio de fixture.

La fila en planta es compacta y el espacio entre puestos evita islas separadas; las bandas de entrada/salida representan entrega al vecino sin imponer que toda operación textil deba seguir siempre esa secuencia física.
