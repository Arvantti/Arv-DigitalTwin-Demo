---
title: Guion · Calcular la programación
escenario: 1-calcular-programacion
tags: [demo, plasticos, guion, aps, cosimulador, fractal]
modulos: [DigitalTwin, APS, CoSimulation, Fractal, Control Center]
duracion_aprox: 6 min
cifras:
  - ["90,3 % → 92,5 %", "pedidos a tiempo: manual contra CoSimulation"]
  - ["69,2 % → 60,7 %", "ocupación de planta en la semana, con la misma producción"]
  - ["28,5 t", "de resina para la semana, calculadas del plan"]
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
- foco: noventa y tres pedidos => 93 + pedidos en la cartera => 93 pedidos
- foco: Aquí también se agregan => AGREGAR PEDIDO

> Todo empieza con los pedidos. La planta tiene noventa y tres pedidos de cuatro productos: cubiertos desechables, baldes de doce litros y papeleras de pedal con su cuerpo y su pedal. Cada pedido tiene cliente, cantidad, color, fecha de entrega e importancia. Aquí también se agregan pedidos nuevos.

### S02a · De dónde sale la programación
- tarjeta: fuentes
- duración: 20 s
- foco: hizo el programador a mano => manual
- foco: importar desde Excel => excel
- foco: integrarse con el ERP => erp
- foco: el asistente de IA => ia
- foco: antes de programar => aps

> La programación vigente de hoy la hizo el programador a mano, con las herramientas de Arvantti. También se puede importar desde Excel, o integrarse con el ERP u otro sistema por API; en ese caso, el asistente de IA, entrenado para eso, normaliza los datos antes de programar.

### S02 · La programación manual
- imagen: capturas/02-gantt-manual.png
- duración: 18 s
- en pantalla: la etiqueta VIGENTE · MANUAL arriba (a tiempo y ocupación) y los rombos de entrega
- foco: cada barra es una orden => PED-D11-02 + día 5 06:00 → día 9 15:21 => Una barra = una orden
- foco: cada rombo => @1048,300,16,40 => Rombo = fecha de entrega
- foco: el noventa coma tres => VIGENTE · + · 90,3 % a tiempo · ocupación 69,2 % => 90,3 % a tiempo
- foco: nueve pedidos llegan tarde => — => 9 pedidos tarde · 229 h de atraso
- foco: sesenta y nueve por ciento => VIGENTE · + · 90,3 % a tiempo · ocupación 69,2 % => Ocupación 69,2 %

> Así queda en el Gantt esa programación manual: cada barra es una orden y cada rombo, su fecha de entrega. Las fechas se cuentan en días desde el arranque de la programación, el día cero. Con este plan, el noventa coma tres por ciento de los pedidos sale a tiempo: nueve pedidos llegan tarde, con doscientas veintinueve horas de atraso. Y la planta queda ocupada al sesenta y nueve por ciento de sus horas disponibles en la semana.

### S03 · La planta con el plan manual
- imagen: capturas/03-centro-control-manual.png
- duración: 14 s
- en pantalla: los indicadores de ocupación y disponibilidad de la semana
- foco: cada máquina con su ocupación => IMM-21 + OCUPACIÓN · SEM => Ocupación de la semana por máquina
- foco: Rojo es una máquina saturada => ENSAMBLE-01 => Rojo: saturada
- foco: verde con holgura => IMM-19 => Verde: con holgura

> En el centro de control vemos cada máquina con su ocupación contra su disponibilidad, día por día. Rojo es una máquina saturada, ámbar casi llena y verde con holgura.

### S03b · Los datos también se cargan a mano
- imagen: configuracion/capturas/01-configuracion.png
- duración: 20 s
- en pantalla: la pestaña ⚙ CONFIGURACIÓN y el recuadro PLAN MANUAL CON ESTE BORRADOR
- foco: en la pestaña de configuración => ⚙ CONFIGURACIÓN => Configuración del APS
- foco: recalcula al instante => PLAN MANUAL CON ESTE BORRADOR => El plan del borrador, al instante

> Esta cartera y este plan venían ya cargados, pero todos los datos se pueden cargar a mano, en la pestaña de configuración del APS. Se trabaja sobre un borrador: arriba, el sistema recalcula al instante el plan manual con esos datos, con los pedidos a tiempo, los pedidos tarde, el atraso y los cambios de referencia.

### S03c · Los pedidos
- imagen: configuracion/capturas/02-pedido-nuevo.png
- duración: 18 s
- en pantalla: el formulario AGREGAR PEDIDO y el pedido nuevo en la tabla
- foco: Agregamos uno => AGREGAR PEDIDO => Agregar pedido
- foco: ahora hay diez pedidos tarde => pedidos tarde => 10 pedidos tarde
- foco: En la misma tabla => ELIMINAR => Editar o eliminar

> Primero, los pedidos. Agregamos uno: una ferretería pide mil quinientos baldes de doce litros, en azul, para el día catorce. Arriba se ve el efecto: con las inyectoras de balde tan llenas, ahora hay diez pedidos tarde. En la misma tabla se cambia el color, la cantidad, la fecha de entrega o la importancia de cualquier pedido, o se elimina.

### S03d · Qué molde lleva cada inyectora
- imagen: configuracion/capturas/04-molde-rechazado.png
- duración: 24 s
- en pantalla: la inyectora 20 en el balde y el aviso en rojo al intentar con la 8
- foco: la inyectora veinte => IMM-20 + Balde de 12 L => Inyectora 20: ahora hace baldes
- foco: el sistema la rechaza => No se puede => Rechazada: no le cabe el molde

> Segundo, qué molde lleva cada inyectora. Basta arrastrar una inyectora sobre una pieza para montarle su molde: la inyectora veinte, que estaba libre, ahora también hace baldes, y el plan vuelve a nueve pedidos tarde. Si el molde no le cabe, el sistema la rechaza: la inyectora ocho, de ochenta toneladas, no puede cerrar un molde de balde que necesita quinientas. Y nunca monta un molde en más máquinas que las copias que existen.

### S03e · La secuencia del planificador
- imagen: configuracion/capturas/05-secuencia.png
- duración: 22 s
- en pantalla: el tablero por máquina; el pedido nuevo en la inyectora 20
- foco: está sin asignar => SIN ASIGNAR => Sin asignar
- foco: lo arrastramos a la inyectora veinte => PED-D14-07 => El pedido nuevo, en la inyectora 20
- foco: los indicadores se recalculan => PLAN MANUAL CON ESTE BORRADOR => Se recalcula con cada movimiento

> Tercero, la secuencia: en qué máquina va cada pedido y en qué orden, como lo decidiría el planificador. El pedido nuevo está sin asignar: lo arrastramos a la inyectora veinte, y en la veintiuno subimos otro pedido al primer lugar. Solo se aceptan las máquinas que tienen el molde de esa pieza. Arriba, los indicadores se recalculan con cada movimiento.

### S03f · Guardar la versión y usarla
- imagen: configuracion/capturas/07-en-la-planta.png
- duración: 22 s
- en pantalla: la versión guardada y, al usarla, el Gantt con VIGENTE · MANUAL APS-MAN-CFG-01
- foco: Al usarla => APS-MAN-CFG-01 => En la planta

> Por último, guardamos esta configuración como una versión con nombre. Cada versión es una foto completa de los datos, sin el historial de cambios, y se puede abrir, usar en la planta o eliminar. Al usarla, el APS, el emulador, el centro de control y el gemelo 3D trabajan con estos datos. Para los escenarios volvemos a la cartera precargada.

### S04 · ¿Qué objetivo calcula?
- imagen: capturas/03b-objetivo.png
- duración: 18 s
- en pantalla: la lista de objetivos y la casilla Cumplir entregas marcada
- foco: qué objetivo buscar => ¿Qué objetivo calcula el cosimulador?
- foco: menos cambios de molde => Minimizar cambios de molde y color
- foco: balancear cuellos => Balancear cuellos de botella
- foco: maximizar la capacidad => Maximizar capacidad ocupada
- foco: un solo objetivo por corrida => El cosimulador optimiza un solo objetivo por corrida. => Un objetivo por corrida
- foco: Hoy elegimos cumplir entregas => Cumplir entregas => Cumplir entregas

> Pulsamos calcular con el cosimulador y el sistema pregunta primero qué objetivo buscar: cumplir entregas, menos cambios de molde y color, balancear cuellos de botella o maximizar la capacidad ocupada. El cosimulador optimiza un solo objetivo por corrida. Para buscar varios a la vez está Fractal, el módulo de escenarios que presentamos al inicio: lo veremos en acción en unos minutos. Las entregas siempre se respetan. Hoy elegimos cumplir entregas.

### S05 · Calcular con CoSimulation
- imagen: capturas/04-calcular.png
- tarjeta: cosimulador | 4.877 variables | 1.301 restricciones | 0,8 s
- duración: 14 s
- foco: arma un modelo => armar
- foco: lo resuelve => resolver
- foco: lo que ya empezó => empezo
- foco: los turnos => turnos
- foco: los moldes => moldes
- foco: las fechas de entrega => entregas

> Pulsamos calcular. El cosimulador arma un modelo de programación lineal con casi cinco mil variables y lo resuelve en menos de un segundo. Respeta lo que ya empezó, los turnos, los moldes montados en cada máquina y las fechas de entrega.

### S05b · El resultado
- imagen: capturas/04-calcular.png
- duración: 22 s
- en pantalla: el recuadro de PROPUESTA con los cinco indicadores; resaltar "Ocupación planta"
- foco: noventa y dos coma cinco => A tiempo + 92,5 % => 90,3 % → 92,5 % a tiempo
- foco: dos pedidos tarde menos => Pedidos tarde + 7 => 9 → 7 pedidos tarde
- foco: cuarenta y siete horas menos => Atraso total + 182,3 h => 229,4 h → 182,3 h de atraso
- foco: del sesenta y nueve al sesenta y uno => Ocupación planta · 7 días + 61,3 % => Ocupación 69,2 % → 61,3 %
- foco: noventa horas de máquina menos => Ocupación planta · 7 días + 793 → 703 h de 1.146 h => 793 h → 703 h: 90 h libres

> El resultado: noventa y dos coma cinco por ciento a tiempo, dos pedidos tarde menos y cuarenta y siete horas menos de atraso. Y la ocupación de la planta baja del sesenta y nueve al sesenta y uno por ciento: la misma producción con noventa horas de máquina menos en la semana. Esas horas quedan libres para más pedidos.

### S05c · Dos escenarios para comparar
- imagen: capturas/04-calcular.png
- duración: 16 s
- foco: A, cumplir entregas => A · Cumplir entregas => A: cumplir entregas
- foco: B, menos cambios => B · Menos cambios, mismas entregas => B: menos cambios, mismas entregas
- foco: más cambios de referencia => Cambios de referencia + 30 => 23 → 30 cambios de referencia

> El cosimulador deja dos escenarios para comparar: A, cumplir entregas, y B, menos cambios con las mismas entregas. A cambio, el A hace más cambios de referencia, y cada uno se cobra con su tiempo real de purga: de claro a oscuro es corto y de oscuro a claro es largo.

### S06 · El Gantt de CoSimulation
- imagen: capturas/05-gantt-cosimulador.png
- duración: 14 s
- en pantalla: las barras que terminan antes de su rombo
- foco: pasa a ser la programación vigente => VIGENTE · + COSIMULADOR APS-SOL-01 => Antes: manual 90,3 % · 69,2 %  →  Ahora: cosimulador 92,5 % · 61,3 %
- foco: Las órdenes se reacomodan => ÓRDENES DE PRODUCCIÓN + PED-D11-02 => Las órdenes terminan antes de su rombo

> Pulsamos adoptar como vigente y la propuesta pasa a ser la programación vigente: arriba, la etiqueta cambia de manual, con noventa coma tres por ciento a tiempo, a cosimulador, con noventa y dos coma cinco. Las órdenes se reacomodan para llegar antes de su fecha.

### S07 · Qué máquinas hacen cada orden
- imagen: capturas/05b-gantt-orden.png
- duración: 16 s
- en pantalla: la orden seleccionada arriba y sus tres máquinas resaltadas abajo
- foco: la inyectora diecinueve => @27,836,136,28 => IMM-19: cuerpo
- foco: la siete hace el pedal => @27,796,125,28 => IMM-07: pedal
- foco: la línea de ensamble => ENSAMBLE-01 => Ensamble

> Al hacer clic en una orden, sus máquinas suben y se resaltan, con sus lotes y sus horas, y el resto queda atenuado. Esta papelera pasa por tres recursos: la inyectora diecinueve hace el cuerpo, la siete hace el pedal y la línea de ensamble la arma.

### S08 · La planta con el plan nuevo
- imagen: capturas/06-centro-control.png
- duración: 18 s
- en pantalla: las tarjetas de IMM-21 e IMM-23 en ámbar y rojo
- foco: sesenta y uno por ciento => Ocupación · semana + 61,3 % => Ocupación de la planta: 61,3 %
- foco: las dos inyectoras del balde => IMM-21 + IMM-23 => IMM-21 e IMM-23: casi llenas
- foco: y la línea de ensamble => ENSAMBLE-01 + 99 % => Ensamble al 99 %
- foco: otras tienen tiempo libre => IMM-18 + 27,2 % => Tiempo libre

> Con el plan del cosimulador, la planta queda ocupada al sesenta y uno por ciento en la semana. Pero si miramos máquina por máquina, las dos inyectoras del balde y la línea de ensamble están casi llenas, mientras otras tienen tiempo libre. Ese es el cuello de botella.

### S09 · Fractal balancea la ocupación
- imagen: capturas/07-fractal-balancear.png
- duración: 26 s
- en pantalla: la recomendación, la fila B "MEJOR" y la columna OCUPACIÓN PLANTA
- foco: Aquí entra Fractal => ◆ ESTUDIAR + 2 + BALANCEAR LA OCUPACIÓN => Fractal · balancear la ocupación
- foco: Su recomendación => Montar el molde de repuesto en IMM-20 => Molde de repuesto en IMM-20
- foco: del setenta y uno al sesenta y dos => CARGA MÁXIMA + 62 % => Carga máxima 71 % → 62 %
- foco: sesenta coma siete por ciento => OCUPACIÓN PLANTA + 60,7 % => Ocupación 61,3 % → 60,7 %
- foco: Cada opción se puede ver => VER EN GANTT + ADOPTAR => Ver en Gantt o adoptar

> Aquí entra Fractal, el módulo que compara escenarios con varios objetivos. Pulsamos estudiar en balancear la ocupación. Además de la secuencia, prueba cambios en la planta. Su recomendación: montar el molde de repuesto del balde, que está en el almacén, en la inyectora veinte, que está libre. Con noventa minutos de montaje, la máquina más cargada baja del setenta y uno al sesenta y dos por ciento, sin atrasar ningún pedido, y la ocupación de la planta baja al sesenta coma siete por ciento. Cada opción se puede ver en el Gantt y adoptar; Fractal recomienda y la persona decide.

### S10 · El Gantt balanceado
- imagen: capturas/08-gantt-balanceado.png
- duración: 12 s
- en pantalla: las filas IMM-20 e IMM-21 en la parte de recursos
- foco: repartido entre dos máquinas => VIGENTE · + FRACTAL FRA-01-B => Vigente: Fractal · balde en IMM-20 e IMM-21

> Pulsamos adoptar la recomendación. Adoptamos y el trabajo del balde queda repartido entre dos máquinas.

### S11 · Más capacidad disponible
- imagen: capturas/09-centro-control-balanceado.png
- duración: 14 s
- en pantalla: el indicador de ocupación semanal
- foco: la inyectora veinte => IMM-20 + Montaje de mold-balde-12l => IMM-20 monta el molde de balde
- foco: sesenta coma siete => Ocupación · semana + 60,7 % => Ocupación 60,7 %

> Ahora la inyectora veinte también hace baldes: monta su molde y entra en juego. Con una máquina más, la ocupación de la planta baja al sesenta coma siete por ciento. Queda espacio para recibir más pedidos.

### S12 · Los insumos del plan
- imagen: capturas/10-insumos.png
- duración: 24 s
- en pantalla: los indicadores de arriba y la tabla de materia prima
- foco: veintiocho toneladas => 28.539 kg + resina · semana => 28,5 t de resina
- foco: quinientos cuarenta y cuatro kilos => 544 kg + masterbatch · semana => 544 kg de masterbatch
- foco: setecientas cincuenta y dos horas => 752 h + máquina · 13 recursos => 752 h de máquina
- foco: noventa y cuatro turnos => 94 + turnos-máquina de 8 h => 94 turnos-máquina
- foco: doscientas cincuenta y nueve horas => 259 h + operario · 32 turnos-persona => 259 h de operario

> Por último, la vista de insumos traduce el plan en lo que hay que tener: veintiocho toneladas y media de resina y quinientos cuarenta y cuatro kilos de masterbatch en la semana, setecientas cincuenta y dos horas de máquina, noventa y cuatro turnos-máquina y doscientas cincuenta y nueve horas de operario. Compras, almacén y producción trabajan con el mismo número.

### S13 · El ahorro potencial
- imagen: capturas/07-fractal-balancear.png
- duración: 26 s
- en pantalla: los indicadores de la propuesta y la columna CARGA MÁXIMA de la tabla de Fractal
- foco: cumple dos pedidos más => — => +2 pedidos a tiempo · −47 h de atraso
- foco: libera noventa horas => — => 90 h de máquina libres por semana
- foco: del setenta y uno al sesenta y dos => CARGA MÁXIMA + 62 % => Carga máxima 71 % → 62 %

> El ahorro de este escenario sale de la corrida, no de una estimación. Frente al plan manual, el cosimulador cumple dos pedidos más a tiempo y quita cuarenta y siete horas de atraso. Con la misma producción libera noventa horas de máquina en la semana. Y Fractal baja la carga de la máquina más cargada del setenta y uno al sesenta y dos por ciento, sin atrasar ningún pedido. Cada hora libre es capacidad para vender.
