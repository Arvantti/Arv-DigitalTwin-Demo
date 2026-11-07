---
title: Guion · Se cae la llenadora de mostaza
escenario: 3-falla-llenadora-mostaza
tags: [demo, salsas, guion, emulador, cosimulador, fractal]
duracion_aprox: 2,5 min
---

# Escenario 3 · Se cae la llenadora de mostaza

Mensaje central: una falla declarada en el emulador llega al instante al 3D, al centro de control y al APS; el
cosimulador pasa la mostaza a la llenadora multipropósito y no agrega ningún pedido tarde.

### S01 · La falla en el emulador
- imagen: capturas/03-falla.png
- foco: la llenadora de mostaza se daña => FILLER-SACHET-03 => Llenadora de sachet 3 (mostaza)
- foco: el día once a las diez de la noche => Reparación estimada hasta vie 6 nov 22:00. => Reparación: día 11, 22:00

> Ahora, una contingencia. En el emulador, la llenadora de mostaza se daña, y mantenimiento estima la reparación para el día once a las diez de la noche.

### S02 · Todo el gemelo se entera
- imagen: capturas/06-aps-alerta.png
- foco: el APS avisa => ALARMA DEL EMULADOR => Alarma en el APS

> Todo el gemelo se entera al instante: en el 3D la llenadora queda en rojo, el centro de control muestra la alarma, y el APS avisa que el plan vigente ya no se puede cumplir.

### S03 · Seguir como estaba contra replanear
- imagen: capturas/07-propuesta.png
- foco: catorce pedidos tarde => — => Sin replanear: 14 tarde, 498 h de atraso
- foco: quedan los mismos tres pedidos tarde => Pedidos tarde + 3 => 3 pedidos tarde
- foco: dos horas más de lavado => Horas de CIP + 85,9 h => CIP 85,9 h

> Si el planificador sigue su secuencia, la mostaza se queda esperando la reparación: catorce pedidos tarde y casi quinientas horas de atraso. El cosimulador pasa la mostaza a la llenadora multipropósito de mayonesa, con cuarenta y dos llenados, y quedan los mismos tres pedidos tarde de antes. El precio son dos horas más de lavado por alérgeno.

### S04 · Lo que dice Fractal
- imagen: capturas/09-fractal.png
- foco: Recomienda campañas por día => Campañas por día => Recomendación: campañas por día
- foco: No cruzar llenadoras => — => No cruzar llenadoras: 11 tarde

> Fractal también prueba tres formas de responder a la falla: esperar la reparación y repartir, organizar campañas por día, o no cruzar llenadoras. Recomienda campañas por día. No cruzar llenadoras dejaría once pedidos tarde.
