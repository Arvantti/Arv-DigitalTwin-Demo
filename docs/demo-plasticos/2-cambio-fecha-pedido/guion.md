---
title: Guion · Cambio de fecha de un pedido
escenario: 2-cambio-fecha-pedido
tags: [demo, plasticos, guion, fractal]
duracion_aprox: 2,5 min
---

# Escenario 2 · Cambio de fecha de un pedido

Mensaje central: un cliente pide su pedido antes. El sistema dice en segundos si se puede cumplir sin atrasar a los demás y qué hay que cambiar.

### S01 · La cartera de pedidos
- imagen: capturas/01-pedidos.png
- duración: 16 s
- en pantalla: la fila PED-D12-01

> Esta es la cartera de pedidos: noventa y tres pedidos con su producto, cantidad y fecha de entrega. Supermercados La Esquina tiene un pedido de doscientos once mil cubiertos desechables para el día doce. Hoy es el día nueve. El cliente llama y lo necesita un día antes, el día once.

### S02 · La pregunta a Fractal
- imagen: capturas/02-fractal-pregunta.png
- duración: 14 s
- en pantalla: tarjeta "Adelantar un pedido" con el pedido y la nueva fecha

> En Fractal elegimos el pedido y la nueva fecha, el día once, y pulsamos estudiar. La pregunta es: ¿cómo movemos todo para cumplirle sin atrasar a los demás?

### S03 · La respuesta
- imagen: capturas/03-fractal.png
- duración: 24 s
- en pantalla: la frase de recomendación, la fila A "MEJOR" y la columna OCUPACIÓN PLANTA

> Con el plan vigente el pedido terminaría el día doce a las siete de la mañana: tarde para la nueva fecha. Fractal prueba dos combinaciones en menos de un segundo. La recomendación es recalcular con la nueva fecha. No hace falta cambiar moldes; basta con recolocar la secuencia, y el resto de la cartera sigue igual: noventa y dos coma cinco por ciento a tiempo, y la ocupación de la planta incluso baja un punto, del sesenta y dos al sesenta y uno por ciento.

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

> En el centro de control podemos filtrar por esa orden: vemos solo las máquinas que la fabrican y cuánto de su tiempo usa. El pedido ocupa treinta y tres de las trescientas setenta y ocho horas de esas máquinas en la semana. El comercial puede confirmar la nueva fecha al cliente con datos.

### S07 · La orden en el gemelo 3D
- imagen: capturas/06-gemelo-orden.png
- duración: 16 s
- en pantalla: el panel ÓRDENES EN EL GEMELO con PED-D12-01 seguida y la lista EN PROCESO AHORA

> En el gemelo 3D seguimos la misma orden. El panel dice qué órdenes se están procesando en este instante y en qué máquinas. La orden adelantada todavía está pendiente: cero de doscientas once mil unidades, y termina programada el día once a las diez de la noche, antes de la nueva entrega.

### S08 · Lo producido con el play
- imagen: capturas/07-gemelo-orden-play.png
- duración: 16 s
- en pantalla: el contador de unidades terminadas y las estrellas sobre las inyectoras uno y dos

> Con el play avanzamos un día. Al día diez a las diez de la mañana la orden va en cincuenta y un mil unidades, en proceso en las inyectoras uno y dos, que llevan una estrella en su letrero. Así se ve, hora a hora, cómo avanza cada pedido en la planta.
