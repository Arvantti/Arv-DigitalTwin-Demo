---
title: Guion · Contingencia por falla de máquina
escenario: 3-contingencia-falla
tags: [demo, plasticos, guion, fractal]
duracion_aprox: 3 min
cifras:
  - ["10 → 7", "pedidos tarde con la recomendación de Fractal"]
  - ["295,5 → 182,3 h", "de atraso total"]
  - ["90 min", "para montar el molde de repuesto en la IMM-20"]
---

# Escenario 3 · Contingencia: falla de máquina

Mensaje central: cuando una máquina falla, el gemelo avisa, el cosimulador replanea y Fractal compara opciones de planta (no solo de secuencia). La persona decide y el cambio se ve de inmediato en la planta.

### S01 · La planta en vivo
- imagen: capturas/01-emulador.png
- duración: 14 s
- en pantalla: vista general del emulador 2D

> Este es el emulador de la planta de inyección de plásticos. Cada rectángulo es una máquina trabajando en tiempo real: inyectoras, buffers, montacargas y la línea de ensamble. Son las diez de la mañana del día nueve de la programación.

### S02 · El PLC de la inyectora veintiuno
- imagen: capturas/02-plc-imm21.png
- duración: 14 s
- en pantalla: zoom al panel PLC de la IMM-21

> Al hacer clic en una máquina vemos su PLC: la orden que está haciendo, el tiempo de ciclo, las unidades buenas, los rechazos y el OEE del turno. La inyectora veintiuno fabrica baldes de doce litros.

### S03 · Llega la falla
- imagen: capturas/03-falla.png
- duración: 14 s
- en pantalla: resaltar la alarma roja de la IMM-21

> De pronto se quema la resistencia del cañón de la inyectora veintiuno. Mantenimiento estima tres días de reparación: hasta el día doce a las diez de la mañana.

### S04 · El centro de control lo ve
- imagen: capturas/04-centro-control.png
- duración: 14 s
- en pantalla: tarjeta de la IMM-21 en rojo y los indicadores de planta

> El centro de control recibe la alarma al instante. La máquina queda fuera de servicio, su disponibilidad cae y la planta sabe qué órdenes estaban en ella.

### S05 · El APS avisa qué pedidos se afectan
- imagen: capturas/05-aps-alerta.png
- duración: 14 s
- en pantalla: banda roja de alerta arriba

> En la programación de producción aparece la alerta: la falla afecta ocho órdenes del plan vigente. Ahora la pregunta es: ¿esperamos la reparación o movemos el trabajo a otra máquina?

### S06 · Fractal estudia las opciones
- imagen: capturas/06-fractal.png
- duración: 30 s
- en pantalla: tabla de opciones A a E; resaltar la fila D "MEJOR" y la columna OCUPACIÓN PLANTA

> Aquí entra Fractal. En menos de un segundo prueba tres combinaciones. No solo reordena la secuencia: también prueba cambios en la planta, como mudar el molde a otra máquina o montar el molde de repuesto que está en el almacén. Si solo esperamos y repartimos, quedan diez pedidos tarde, con doscientas noventa y cinco horas de atraso. La recomendación es montar el molde de repuesto del balde en la inyectora veinte, con noventa minutos de montaje. Así quedan siete pedidos tarde y el atraso baja a ciento ochenta y dos horas. La tabla también muestra la ocupación de la planta con cada opción: con la recomendada queda en sesenta y uno por ciento.

### S07 · Comparar antes de decidir
- imagen: capturas/06b-fractal-full.png
- duración: 14 s
- en pantalla: barras de ocupación por máquina y los botones VER EN GANTT y ADOPTAR

> Abajo se ve cómo cambia la ocupación de cada máquina con la recomendación: la inyectora veinte, que estaba libre, toma el trabajo de la veintiuno. Cada opción se puede abrir en el Gantt y adoptar, no solo la recomendada.

### S08 · Adoptar
- imagen: capturas/07-gantt-adoptado.png
- duración: 14 s
- en pantalla: el Gantt con la IMM-20 trabajando y el plan vigente arriba

> Con un clic adoptamos la recomendación. Pasa a ser la programación vigente, con noventa y dos coma cinco por ciento de pedidos a tiempo. Fractal recomienda; la persona decide.

### S09 · El centro de control después
- imagen: capturas/08-centro-control-despues.png
- duración: 12 s
- en pantalla: la IMM-20 ahora con orden

> El centro de control ya muestra a la inyectora veinte con su nueva orden, mientras la veintiuno sigue en reparación.

### S10 · El emulador después
- imagen: capturas/09-emulador-despues.png
- duración: 10 s
- en pantalla: la IMM-20 produciendo

> Y en el emulador la planta sigue trabajando con el nuevo plan.

### S11 · El gemelo 3D
- imagen: capturas/10-gemelo-3d.png
- duración: 14 s
- en pantalla: la IMM-21 en rojo y su PLC a la derecha

> En el gemelo 3D vemos lo mismo: la inyectora veintiuno marcada fuera de servicio, con su ocupación contra disponibilidad por día.

### S12 · El 3D con el plan nuevo
- imagen: capturas/11-gemelo-3d-despues.png
- duración: 14 s
- en pantalla: etiqueta de la IMM-20 con la orden de baldes

> Y con el plan adoptado, la inyectora veinte aparece produciendo baldes. Del aviso de falla a un plan nuevo en la planta, en menos de un minuto.
