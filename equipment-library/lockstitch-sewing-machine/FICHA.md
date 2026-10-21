# Ficha: máquina plana industrial

- Tipo: tipo nuevo, reutilizable.
- Función: puntada recta para cerrar hombros, pespuntear cuello/cartera y colocar etiquetas.
- Referencia recibida: el usuario solicitó buscar una máquina plana JUKI; se eligió el modelo DDL-8700 como referencia de puntada recta de una aguja.
- Confirmada por: usuario · 2026-10-21 («sí», aprobación de las referencias recomendadas).

| Dato | Valor | Origen |
|---|---:|---|
| Velocidad máxima mecánica | 5.500 puntadas/min; capacidad de referencia, no prenda/min | catalog (ficha comercial consultada) |
| Puntada | hasta 5 mm; configuración del preset 4,5 mm | catalog |
| Huella mesa/puesto | 1,2 × 0,65 × 1,2 m aproximados | assumed |
| Ciclo por unidad | 45 s default genérico; catálogo de producto sobreescribe ciclo para operación real | assumed |
| Potencia, cola | 0,55 kW y 8 piezas | assumed |

- Fallas: rotura de hilo (35 h MTBF / 2 min MTTR) y aguja rota (120 h / 4 min); supuestos iniciales.
- Calidad: se reporta unidad completada, no se inventa porcentaje de defectos; inspección y rechazo se modelarán como proceso aparte.
- Variables: unidades, cola, caudal, avance, velocidad aproximada, potencia, aceptación de entrada; KPI de utilización, salida/h y starvation.
- Animación: barra de aguja, volante, operaria, ciclo y baliza.
- Pendiente: placa exacta, dimensiones del cabezal/mesa instalado, potencia real, SAM por operación y fallas medidas.

Fuente de referencia: https://www.jacksew.com/juki-ddl-8700-high-speed-single-needle-straight-lockstitch-industrial-sewing-machine-with-table-and-servo-motor/
