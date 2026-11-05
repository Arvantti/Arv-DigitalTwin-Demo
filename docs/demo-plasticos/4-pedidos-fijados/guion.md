---
title: Guion · Pedidos fijados a mano
escenario: 4-pedidos-fijados
tags: [demo, plasticos, guion, fractal, aps]
duracion_aprox: 3 min
cifras:
  - ["3", "órdenes fijadas a mano que Fractal no mueve"]
  - ["185,8 → 182,3 h", "de atraso al organizar el resto"]
  - ["65,9 → 61,6 %", "de ocupación de la planta con la opción recomendada"]
ahorro:
  - ["Atraso total", "185,8 h", "182,3 h", "3,5 h menos"]
  - ["Ocupación de la planta", "65,9 %", "61,6 %", "4,3 puntos menos"]
  - ["Órdenes fijadas movidas", "—", "0", "ni un minuto"]
---

# Escenario 4 · Pedidos fijados a mano

Mensaje central: el planificador tiene pedidos que se entregan sí o sí en su fecha. Los bloquea en el Gantt y Fractal organiza todo lo demás alrededor, sin moverlos ni un minuto.

### S01 · El plan de partida
- imagen: capturas/01-gantt-vigente.png
- duración: 16 s
- en pantalla: el Gantt con las órdenes de producción arriba y las máquinas abajo
- foco: noventa y dos coma cinco => VIGENTE · + · 92,5 % => 92,5 % a tiempo

> Partimos del plan que calculó el cosimulador, con noventa y dos coma cinco por ciento de pedidos a tiempo. Pero un planificador sabe cosas que el sistema no sabe: hay pedidos que se prometieron con fecha firmada y no pueden moverse.

### S02 · Bloquear a mano
- imagen: capturas/02-gantt-fijadas.png
- duración: 26 s
- en pantalla: los tres candados cerrados y las barras rayadas; la franja de la propuesta arriba
- foco: Arrastramos la papelera => PED-D12-07 => Arrastrada un día
- foco: con el candado fijamos => orden fijada => 🔒 Tres órdenes fijadas
- foco: siete pedidos tarde => — => 7 tarde · 185 h de atraso

> Arrastramos la papelera de pedal del día doce un día más tarde, a la fecha que pactó el comercial. Y con el candado fijamos tres órdenes donde están: los cubiertos del día once, esa papelera y la otra papelera del día catorce. Las barras rayadas ya no se pueden correr. El plan manual queda con siete pedidos tarde y ciento ochenta y cinco horas de atraso.

### S03 · Fractal recibe lo fijado
- imagen: capturas/03-fractal-pregunta.png
- duración: 14 s
- en pantalla: la tarjeta 4, órdenes fijadas a mano
- foco: el cuarto escenario => ÓRDENES FIJADAS => 4 · Órdenes fijadas
- foco: las tres órdenes bloqueadas => están fijadas => 3 órdenes bloqueadas

> En la pestaña de Fractal aparece el cuarto escenario: órdenes fijadas a mano. Muestra cuáles son las tres órdenes bloqueadas y la pregunta es clara: organizar el resto de la producción sin moverlas.

### S04 · Fractal reorganiza el resto
- imagen: capturas/04-fractal.png
- duración: 28 s
- en pantalla: las filas A y B de la tabla; resaltar la fila B "MEJOR" y la columna de atraso
- foco: prueba dos combinaciones => combinaciones en => 2 combinaciones
- foco: de ciento ochenta y cinco coma ocho => Atraso total + 182,3 h => 185,8 h → 182,3 h
- foco: monta el molde de repuesto => Montaje de moldes => Molde de repuesto en IMM-20
- foco: sesenta coma cuatro => Ocupación planta + 60,4 % => Ocupación 66,1 % → 60,4 %

> En menos de un segundo Fractal prueba dos combinaciones. La primera solo reorganiza el resto con el cosimulador: el atraso baja de ciento ochenta y cinco coma ocho a ciento ochenta y dos coma tres horas. La segunda, además, monta el molde de repuesto del balde en la inyectora veinte, con noventa minutos de montaje, y deja la ocupación de la planta en sesenta coma cuatro por ciento. En las dos, las tres órdenes fijadas quedan exactamente en la misma máquina y a la misma hora.

### S05 · Comparar antes de decidir
- imagen: capturas/04b-fractal-full.png
- duración: 14 s
- en pantalla: las barras de ocupación por máquina y los botones VER EN GANTT y ADOPTAR

> Abajo se ve cómo cambia la carga de cada máquina. Cada opción se puede abrir en el Gantt y adoptar; Fractal recomienda y la persona decide.

### S06 · Adoptar y ver que lo fijado no se movió
- imagen: capturas/05-gantt-adoptado.png
- duración: 18 s
- en pantalla: los tres candados y sus barras en la misma posición que antes
- foco: siguen con su candado => orden fijada => Las 3 siguen fijadas

> Adoptamos la recomendación. Es la programación vigente y las tres órdenes siguen con su candado, en la misma fecha. Lo demás se reacomodó a su alrededor. Si mañana cambia algo, se vuelve a pedir un estudio y los compromisos firmados se mantienen.

### S07 · La planta lo ejecuta
- imagen: capturas/06-centro-control.png
- duración: 14 s
- en pantalla: la franja de programación vigente arriba y el molde montado en la inyectora veinte
- foco: la inyectora veinte => IMM-20 => IMM-20: montaje del repuesto

> El centro de control ya muestra la nueva programación de Fractal y la inyectora veinte con el montaje del molde de repuesto. El planificador conserva el control de lo importante y deja el resto al optimizador.

### S08 · El ahorro potencial
- imagen: capturas/04-fractal.png
- duración: 22 s
- en pantalla: la fila ACTUAL contra la fila B MEJOR: atraso y ocupación
- foco: de ciento ochenta y cinco coma ocho => Atraso total + 182,3 h => 185,8 h → 182,3 h
- foco: sesenta y seis coma uno => Ocupación planta + 60,4 % => Ocupación 66,1 % → 60,4 %

> Con tres órdenes fijadas a mano, Fractal organiza el resto y baja el atraso de ciento ochenta y cinco coma ocho a ciento ochenta y dos coma tres horas, y la ocupación de la planta de sesenta y seis coma uno a sesenta coma cuatro por ciento. Y las tres órdenes firmadas no se movieron ni un minuto.
