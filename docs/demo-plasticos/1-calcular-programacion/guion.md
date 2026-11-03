---
title: Guion · Calcular la programación
escenario: 1-calcular-programacion
tags: [demo, plasticos, guion, aps, cosimulador, fractal]
duracion_aprox: 4 min
cifras:
  - ["90,3 % → 92,5 %", "pedidos a tiempo: manual contra cosimulador"]
  - ["69,2 % → 60,7 %", "ocupación de planta en la semana, con la misma producción"]
  - ["27,5 t", "de resina para la semana, calculadas del plan"]
ahorro:
  - ["Pedidos a tiempo", "90,3 %", "92,5 %", "2 pedidos tarde menos"]
  - ["Atraso total", "229,4 h", "182,3 h", "47,1 h menos"]
  - ["Horas de máquina en la semana", "793 h", "703 h", "90 h libres"]
  - ["Carga de la máquina más cargada", "71 %", "62 %", "9 puntos menos con Fractal"]
---

# Escenario 1 · Calcular la programación según las entregas

Mensaje central: a partir de los pedidos y sus fechas de entrega, el cosimulador calcula la programación que cumple más entregas con el mayor uso de la capacidad, y Fractal reparte la carga para que no haya cuellos de botella. Al final, el plan dice cuántos insumos necesita.

### S01 · La cartera de pedidos
- imagen: capturas/01-pedidos.png
- duración: 18 s
- en pantalla: los indicadores de arriba y la columna ENTREGA

> Todo empieza con los pedidos. La planta tiene noventa y tres pedidos de cuatro productos: cubiertos desechables, baldes de doce litros y papeleras de pedal con su cuerpo y su pedal. Cada pedido tiene cliente, cantidad, color, fecha de entrega e importancia. Aquí también se agregan pedidos nuevos.

### S02 · La programación manual
- imagen: capturas/02-gantt-manual.png
- duración: 18 s
- en pantalla: la etiqueta VIGENTE · MANUAL arriba (a tiempo y ocupación) y los rombos de entrega

> Así está hoy, día nueve, la programación hecha a mano: cada barra es una orden y cada rombo, su fecha de entrega. Las fechas se cuentan en días desde el arranque de la programación, el día cero. Con este plan, el noventa coma tres por ciento de los pedidos sale a tiempo: nueve pedidos llegan tarde, con doscientas veintinueve horas de atraso. Y la planta queda ocupada al sesenta y nueve por ciento de sus horas disponibles en la semana.

### S03 · La planta con el plan manual
- imagen: capturas/03-centro-control-manual.png
- duración: 14 s
- en pantalla: los indicadores de ocupación y disponibilidad de la semana

> En el centro de control vemos cada máquina con su ocupación contra su disponibilidad, día por día. Rojo es una máquina saturada, ámbar casi llena y verde con holgura.

### S04 · ¿Qué objetivo calcula?
- imagen: capturas/03b-objetivo.png
- duración: 18 s
- en pantalla: la lista de objetivos y la casilla Cumplir entregas marcada

> Antes de calcular, el sistema pregunta qué objetivo buscar: cumplir entregas, menos cambios de molde y color, balancear cuellos de botella o maximizar la capacidad ocupada. El cosimulador optimiza un solo objetivo por corrida; si se eligen varios a la vez, eso es trabajo de Fractal. Las entregas siempre se respetan. Hoy elegimos cumplir entregas.

### S05 · Calcular con el cosimulador
- imagen: capturas/04-calcular.png
- duración: 24 s
- en pantalla: el recuadro de PROPUESTA con los cinco indicadores; resaltar "Ocupación planta"

> Pulsamos calcular. El cosimulador arma un modelo de programación lineal con casi cinco mil variables y lo resuelve en menos de un segundo. Respeta lo que ya empezó, los turnos, los moldes montados en cada máquina y las fechas de entrega. El resultado: noventa y dos coma cinco por ciento a tiempo, dos pedidos tarde menos y cuarenta y siete horas menos de atraso. Y la ocupación de la planta baja del sesenta y nueve al sesenta y uno por ciento: la misma producción con noventa horas de máquina menos en la semana. Esas horas quedan libres para más pedidos. El cosimulador deja dos escenarios para comparar: A, cumplir entregas, y B, menos cambios con las mismas entregas. A cambio, el A hace más cambios de referencia, y cada uno se cobra con su tiempo real de purga: de claro a oscuro es corto y de oscuro a claro es largo.

### S06 · El Gantt del cosimulador
- imagen: capturas/05-gantt-cosimulador.png
- duración: 14 s
- en pantalla: las barras que terminan antes de su rombo

> Adoptamos la propuesta y pasa a ser la programación vigente. Las órdenes se reacomodan para llegar antes de su fecha.

### S07 · Qué máquinas hacen cada orden
- imagen: capturas/05b-gantt-orden.png
- duración: 16 s
- en pantalla: la orden seleccionada arriba y sus tres máquinas resaltadas abajo

> Al hacer clic en una orden, sus máquinas suben y se resaltan, con sus lotes y sus horas, y el resto queda atenuado. Esta papelera pasa por tres recursos: la inyectora diecinueve hace el cuerpo, la siete hace el pedal y la línea de ensamble la arma.

### S08 · La planta con el plan nuevo
- imagen: capturas/06-centro-control.png
- duración: 18 s
- en pantalla: las tarjetas de IMM-21 e IMM-23 en ámbar y rojo

> Con el plan del cosimulador, la planta queda ocupada al sesenta y uno por ciento en la semana. Pero si miramos máquina por máquina, las dos inyectoras del balde y la línea de ensamble están casi llenas, mientras otras tienen tiempo libre. Ese es el cuello de botella.

### S09 · Fractal balancea la ocupación
- imagen: capturas/07-fractal-balancear.png
- duración: 26 s
- en pantalla: la recomendación, la fila B "MEJOR" y la columna OCUPACIÓN PLANTA

> Aquí entra Fractal. Además de la secuencia, prueba cambios en la planta. Su recomendación: montar el molde de repuesto del balde, que está en el almacén, en la inyectora veinte, que está libre. Con noventa minutos de montaje, la máquina más cargada baja del setenta y uno al sesenta y dos por ciento, sin atrasar ningún pedido, y la ocupación de la planta baja al sesenta coma siete por ciento. Cada opción se puede ver en el Gantt y adoptar; Fractal recomienda y la persona decide.

### S10 · El Gantt balanceado
- imagen: capturas/08-gantt-balanceado.png
- duración: 12 s
- en pantalla: las filas IMM-20 e IMM-21 en la parte de recursos

> Adoptamos y el trabajo del balde queda repartido entre dos máquinas.

### S11 · Más capacidad disponible
- imagen: capturas/09-centro-control-balanceado.png
- duración: 14 s
- en pantalla: el indicador de ocupación semanal

> Con una máquina más en juego, la planta tiene mil doscientas cuarenta horas disponibles en la semana y la ocupación baja al sesenta coma siete por ciento. Queda espacio para recibir más pedidos.

### S12 · Los insumos del plan
- imagen: capturas/10-insumos.png
- duración: 24 s
- en pantalla: los indicadores de arriba y la tabla de materia prima

> Por último, la vista de insumos traduce el plan en lo que hay que tener: veintisiete toneladas y media de resina y quinientos veinticuatro kilos de masterbatch en la semana, setecientas treinta y tres horas de máquina, noventa y dos turnos-máquina y doscientas cincuenta y cinco horas de operario. Compras, almacén y producción trabajan con el mismo número.

### S13 · El ahorro potencial
- imagen: capturas/07-fractal-balancear.png
- duración: 26 s
- en pantalla: los indicadores de la propuesta y la columna CARGA MÁXIMA de la tabla de Fractal

> El ahorro de este escenario sale de la corrida, no de una estimación. Frente al plan manual, el cosimulador cumple dos pedidos más a tiempo y quita cuarenta y siete horas de atraso. Con la misma producción libera noventa horas de máquina en la semana. Y Fractal baja la carga de la máquina más cargada del setenta y uno al sesenta y dos por ciento, sin atrasar ningún pedido. Cada hora libre es capacidad para vender.
