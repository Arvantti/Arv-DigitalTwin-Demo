Todo empieza con los pedidos. La planta tiene noventa y tres pedidos de cuatro productos: cubiertos desechables, baldes de doce litros y papeleras de pedal con su cuerpo y su pedal. Cada pedido tiene cliente, cantidad, color, fecha de entrega e importancia. Aquí también se agregan pedidos nuevos.

La programación vigente de hoy la hizo el programador a mano, con las herramientas de Arvantti. También se puede importar desde Excel, o integrarse con el ERP u otro sistema por API; en ese caso, el asistente de IA, entrenado para eso, normaliza los datos antes de programar.

Así queda en el Gantt esa programación manual: cada barra es una orden y cada rombo, su fecha de entrega. Las fechas se cuentan en días desde el arranque de la programación, el día cero. Con este plan, el noventa coma tres por ciento de los pedidos sale a tiempo: nueve pedidos llegan tarde, con doscientas veintinueve horas de atraso. Y la planta queda ocupada al sesenta y nueve por ciento de sus horas disponibles en la semana.

En el centro de control vemos cada máquina con su ocupación contra su disponibilidad, día por día. Rojo es una máquina saturada, ámbar casi llena y verde con holgura.

Pulsamos calcular con el cosimulador y el sistema pregunta primero qué objetivo buscar: cumplir entregas, menos cambios de molde y color, balancear cuellos de botella o maximizar la capacidad ocupada. El cosimulador optimiza un solo objetivo por corrida. Para buscar varios a la vez está Fractal, el módulo de escenarios que presentamos al inicio: lo veremos en acción en unos minutos. Las entregas siempre se respetan. Hoy elegimos cumplir entregas.

Pulsamos calcular. El cosimulador arma un modelo de programación lineal con casi cinco mil variables y lo resuelve en menos de un segundo. Respeta lo que ya empezó, los turnos, los moldes montados en cada máquina y las fechas de entrega.

El resultado: noventa y dos coma cinco por ciento a tiempo, dos pedidos tarde menos y cuarenta y siete horas menos de atraso. Y la ocupación de la planta baja del sesenta y nueve al sesenta y uno por ciento: la misma producción con noventa horas de máquina menos en la semana. Esas horas quedan libres para más pedidos.

El cosimulador deja dos escenarios para comparar: A, cumplir entregas, y B, menos cambios con las mismas entregas. A cambio, el A hace más cambios de referencia, y cada uno se cobra con su tiempo real de purga: de claro a oscuro es corto y de oscuro a claro es largo.

Pulsamos adoptar como vigente y la propuesta pasa a ser la programación vigente: arriba, la etiqueta cambia de manual, con noventa coma tres por ciento a tiempo, a cosimulador, con noventa y dos coma cinco. Las órdenes se reacomodan para llegar antes de su fecha.

Al hacer clic en una orden, sus máquinas suben y se resaltan, con sus lotes y sus horas, y el resto queda atenuado. Esta papelera pasa por tres recursos: la inyectora diecinueve hace el cuerpo, la siete hace el pedal y la línea de ensamble la arma.

Con el plan del cosimulador, la planta queda ocupada al sesenta y uno por ciento en la semana. Pero si miramos máquina por máquina, las dos inyectoras del balde y la línea de ensamble están casi llenas, mientras otras tienen tiempo libre. Ese es el cuello de botella.

Aquí entra Fractal, el módulo que compara escenarios con varios objetivos. Pulsamos estudiar en balancear la ocupación. Además de la secuencia, prueba cambios en la planta. Su recomendación: montar el molde de repuesto del balde, que está en el almacén, en la inyectora veinte, que está libre. Con noventa minutos de montaje, la máquina más cargada baja del setenta y uno al sesenta y dos por ciento, sin atrasar ningún pedido, y la ocupación de la planta baja al sesenta coma siete por ciento. Cada opción se puede ver en el Gantt y adoptar; Fractal recomienda y la persona decide.

Pulsamos adoptar la recomendación. Adoptamos y el trabajo del balde queda repartido entre dos máquinas.

Con una máquina más en juego, la planta tiene mil doscientas cuarenta horas disponibles en la semana y la ocupación baja al sesenta coma siete por ciento. Queda espacio para recibir más pedidos.

Por último, la vista de insumos traduce el plan en lo que hay que tener: veintiocho toneladas y media de resina y quinientos cuarenta y cuatro kilos de masterbatch en la semana, setecientas cincuenta y dos horas de máquina, noventa y cuatro turnos-máquina y doscientas cincuenta y nueve horas de operario. Compras, almacén y producción trabajan con el mismo número.

El ahorro de este escenario sale de la corrida, no de una estimación. Frente al plan manual, el cosimulador cumple dos pedidos más a tiempo y quita cuarenta y siete horas de atraso. Con la misma producción libera noventa horas de máquina en la semana. Y Fractal baja la carga de la máquina más cargada del setenta y uno al sesenta y dos por ciento, sin atrasar ningún pedido. Cada hora libre es capacidad para vender.
