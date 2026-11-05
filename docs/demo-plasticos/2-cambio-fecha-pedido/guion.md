---
title: Guion · Cambio de fecha de un pedido
escenario: 2-cambio-fecha-pedido
tags: [demo, plasticos, guion, fractal]
duracion_aprox: 2,5 min
cifras:
  - ["día 12 → día 11", "nueva fecha de entrega del pedido"]
  - ["0,6 s", "para estudiar las opciones"]
  - ["92,5 %", "de pedidos a tiempo: el resto no se atrasa"]
ahorro:
  - ["Pedidos nuevos atrasados", "—", "0", "ninguno"]
  - ["Moldes que cambiar", "—", "0", "ninguno"]
  - ["Atraso total", "182,3 h", "182,3 h", "sin aumento"]
  - ["Tiempo de respuesta", "—", "0,6 s", "en lugar de rehacer el plan a mano"]
---

# Escenario 2 · Cambio de fecha de un pedido

Mensaje central: un cliente pide su pedido antes. El sistema dice en segundos si se puede cumplir sin atrasar a los demás y qué hay que cambiar.

### S01 · La cartera de pedidos
- imagen: capturas/01-pedidos.png
- duración: 16 s
- en pantalla: la fila PED-D12-01
- foco: noventa y tres pedidos => 93 + pedidos en la cartera => 93 pedidos
- foco: Supermercados La Esquina tiene => PED-D12-01 => PED-D12-01 · 211.000 cubiertos · día 12
- foco: lo necesita un día antes => — => Nueva fecha: día 11

> Esta es la cartera de pedidos: noventa y tres pedidos con su producto, cantidad y fecha de entrega. Supermercados La Esquina tiene un pedido de doscientos once mil cubiertos desechables para el día doce. Hoy es el día nueve. El cliente llama y lo necesita un día antes, el día once.

### S02 · La pregunta a Fractal
- imagen: capturas/02-fractal-pregunta.png
- duración: 14 s
- en pantalla: tarjeta "Adelantar un pedido" con el pedido y la nueva fecha
- foco: elegimos el pedido => Pedido + Nueva entrega => Pedido y nueva fecha
- foco: pulsamos estudiar => ◆ ESTUDIAR => Estudiar

> En Fractal elegimos el pedido y la nueva fecha, el día once, y pulsamos estudiar. La pregunta es: ¿cómo movemos todo para cumplirle sin atrasar a los demás?

### S03 · La respuesta
- imagen: capturas/03-fractal.png
- duración: 24 s
- en pantalla: la frase de recomendación, la fila A "MEJOR" y la columna OCUPACIÓN PLANTA
- foco: Fractal prueba dos combinaciones => 2 combinaciones en 1,3 s => 2 combinaciones en 1 s
- foco: La recomendación es recalcular => Recalcular con la nueva fecha => Recalcular con la nueva fecha
- foco: noventa y dos coma cinco => A tiempo + 92,5 % => 92,5 % a tiempo
- foco: del sesenta y uno al sesenta => Ocupación planta + 60,3 % => Ocupación 61,3 % → 60,3 %

> Con el plan vigente el pedido terminaría el día doce a las siete de la mañana: tarde para la nueva fecha. Fractal prueba dos combinaciones en menos de un segundo. La recomendación es recalcular con la nueva fecha. No hace falta cambiar moldes; basta con recolocar la secuencia, y el resto de la cartera sigue igual: noventa y dos coma cinco por ciento a tiempo, y la ocupación de la planta incluso baja un punto, del sesenta y uno al sesenta por ciento.

### S04 · Ocupación por máquina
- imagen: capturas/03b-fractal-full.png
- duración: 12 s
- en pantalla: barras de ocupación vigente contra la opción

> Las barras muestran que la carga de las máquinas casi no cambia. Las cinco inyectoras de cubiertos absorben el cambio.

### S05 · El Gantt adoptado
- imagen: capturas/04-gantt-adoptado.png
- duración: 14 s
- en pantalla: las barras del pedido PED-D12-01 en el Gantt

> Adoptamos la recomendación, aunque cualquier opción se puede adoptar, y el Gantt muestra el pedido adelantado en las inyectoras de cubiertos.

### S06 · Seguir la orden en planta
- imagen: capturas/05-centro-control-orden.png
- duración: 16 s
- en pantalla: el filtro de orden arriba y las máquinas filtradas
- foco: filtrar por esa orden => ORDEN => Filtro: PED-D12-01
- foco: treinta y tres de las trescientas => Ocupación de PED-D12-01 · semana + 8,7 % => 33 h de 378 h = 8,7 %

> En el centro de control podemos filtrar por esa orden: vemos solo las máquinas que la fabrican y cuánto de su tiempo usa. El pedido ocupa treinta y tres de las trescientas setenta y ocho horas de esas máquinas en la semana. El comercial puede confirmar la nueva fecha al cliente con datos.

### S07 · La orden en el gemelo 3D
- imagen: capturas/06-gemelo-orden.png
- orbita: orbitas/06-imm01
- duración: 16 s
- en pantalla: el panel ÓRDENES EN EL GEMELO con PED-D12-01 seguida y la lista EN PROCESO AHORA
- foco: qué órdenes se están procesando => EN PROCESO AHORA EN EL GEMELO · 9 => En proceso ahora
- foco: cero de doscientas once mil => 0 / 211.000 => 0 de 211.000 u
- foco: el día once a las diez de la noche => Supermercados La Esquina · entrega día 11 22:00 · fin programado día 11 21:55 => Fin programado: día 11, 21:55

> En el gemelo 3D seguimos la misma orden. El panel dice qué órdenes se están procesando en este instante y en qué máquinas. La orden adelantada todavía está pendiente: cero de doscientas once mil unidades, y termina programada el día once a las diez de la noche, antes de la nueva entrega.

### S08 · Lo producido con el play
- imagen: capturas/07-gemelo-orden-play.png
- duración: 16 s
- en pantalla: el contador de unidades terminadas y las estrellas sobre las inyectoras uno y dos
- foco: avanzamos un día => · 10:00 del día 10 => Día 10, 10:00
- foco: cincuenta y un mil unidades => 51.149 => 51.149 de 211.000 u

> Con el play avanzamos un día. Al día diez a las diez de la mañana la orden va en cincuenta y un mil unidades, en proceso en las inyectoras uno y dos, que llevan una estrella en su letrero. Así se ve, hora a hora, cómo avanza cada pedido en la planta.

### S09 · El ahorro potencial
- imagen: capturas/03-fractal.png
- duración: 20 s
- en pantalla: las filas VIGENTE y A MEJOR: pedidos tarde y atraso iguales
- foco: seis décimas de segundo => 2 combinaciones en 1,3 s => Respuesta en segundos
- foco: siete tarde => Pedidos tarde + 7 => 7 tarde, igual que antes
- foco: ciento ochenta y dos horas => Atraso total + 182,3 h => 182,3 h de atraso, igual

> Aquí el ahorro es de tiempo y de riesgo. Fractal responde en seis décimas de segundo, no hace falta cambiar ningún molde y ningún otro pedido se atrasa: siguen siendo siete tarde y ciento ochenta y dos horas de atraso, igual que antes del cambio. El comercial confirma la fecha con datos, sin rehacer el plan a mano.
