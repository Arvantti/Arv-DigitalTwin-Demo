---
title: Parte 6 · La falla, de principio a fin
serie: el-gemelo-digital
parte: 6
duracion_aprox: 65 s
palabras: 154
siguiente: "Fin de la serie"
cifras:
  - ["9 → 7", "pedidos tarde con la recomendación"]
  - ["27 h", "menos de atraso (208,9 → 181,8 h)"]
  - ["menos de 1 minuto", "del aviso de falla al plan nuevo"]
---

# Parte 6 · La falla, de principio a fin

Idea: la promesa de la parte 1 se cumple; cada pieza hace su parte, de la alarma al plan nuevo. Cifras de
`docs/demo-plasticos/3-contingencia-falla/guion.md`.

## Guion

### S01 · La promesa
- imagen: mapa completo encendido
- duración: 7 s
- en pantalla: zoom out del mapa con las seis piezas
- texto: PARTE 6 · LA FALLA

> En la parte uno te prometí contarte cómo esta planta resolvió una falla en menos de un minuto. Aquí está.

### S02 · La alarma
- imagen: docs/demo-plasticos/3-contingencia-falla/capturas/03-falla.png, luego docs/demo-plasticos/3-contingencia-falla/capturas/04-centro-control.png
- duración: 12 s
- en pantalla: la alarma roja de la inyectora 21 y luego su tarjeta en rojo en el centro de control
- texto: Alarma · 3 días de reparación

> Diez de la mañana: se quema la resistencia de la inyectora veintiuno. Tres días de reparación. Su PLC da la alarma y el centro de control la ve al instante.

### S03 · Los pedidos en riesgo
- imagen: docs/demo-plasticos/3-contingencia-falla/capturas/05-aps-alerta.png
- duración: 8 s
- en pantalla: la banda roja de alerta
- texto: ¿Esperar o mover el trabajo?

> La programación marca las órdenes afectadas. ¿Esperamos la reparación o movemos el trabajo?

### S04 · Las opciones
- imagen: docs/demo-plasticos/3-contingencia-falla/capturas/06-fractal.png
- duración: 16 s
- en pantalla: la tabla de opciones; resaltar la fila D "MEJOR"
- texto: 9 → 7 pedidos tarde · 27 h menos

> El simulador prueba cinco opciones en poco más de un segundo. Si solo esperamos, quedan nueve pedidos tarde. Si montamos el molde de repuesto en la inyectora veinte, que está libre, quedan siete, y veintisiete horas menos de atraso.

### S05 · Un clic
- imagen: docs/demo-plasticos/3-contingencia-falla/capturas/07-gantt-adoptado.png, luego docs/demo-plasticos/3-contingencia-falla/capturas/11-gemelo-3d-despues.png
- duración: 9 s
- en pantalla: el Gantt con la inyectora 20 trabajando y luego la inyectora 20 produciendo en el 3D; efecto de clic
- texto: Un clic

> Un clic, y el plan nuevo llega al centro de control, a la planta y al gemelo en tres D.

### S06 · Cierre
- imagen: mapa completo encendido, luego tarjeta final sobre #0e1430
- duración: 13 s
- en pantalla: las palabras VER · CALCULAR · PROBAR; luego logo de AndyOpenDev y firma "Arvantti · Digital Twin Engineering"
- texto: Fin de la serie

> Eso es un gemelo digital: ver la planta, calcular el plan y probar el futuro antes de que pase. ¿Qué planta te gustaría ver con un gemelo? Te leo en los comentarios.

## Copy de publicación

Diez de la mañana: se quema la resistencia de una inyectora. Tres días de reparación y varios pedidos en riesgo.

El PLC da la alarma, el centro de control la ve, la programación marca las órdenes afectadas y el simulador prueba cinco
opciones en poco más de un segundo. La mejor: montar el molde de repuesto en una máquina libre. 7 pedidos tarde en vez de
9 y 27 horas menos de atraso. Un clic y el plan nuevo está en la planta.

Eso es un gemelo digital: ver, calcular y probar el futuro antes de que pase.

Parte 6 de 6, fin de la serie. ¿Qué planta te gustaría ver con un gemelo? Te leo en los comentarios.

#GemeloDigital #DigitalTwin #Industria40 #Manufactura #Mantenimiento #AndyOpenDev #Arvantti

## Portada

Texto encima: **PARTE 6** · **La falla, de principio a fin** · 9 → 7 pedidos tarde

Prompt de imagen (sin texto; el título se pone encima en la composición):

```text
Vertical 9:16 cinematic image, dark navy background (#0e1430). Inside a plastic injection molding factory, one machine
glows with a red warning light and a faint wisp of smoke, while a neighboring machine lights up in calm cyan as work is
transferred to it along a bright violet light trail. A subtle holographic wireframe overlay of the factory hints at its
digital twin. Dramatic but clean lighting, premium technical style, no readable text, no logos, no brand names. Keep
the upper central area darker for a title overlay.
```
