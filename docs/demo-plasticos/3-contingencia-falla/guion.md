---
title: Guion · Contingencia por falla de máquina
escenario: 3-contingencia-falla
tags: [demo, plasticos, guion, fractal]
modulos: [DigitalTwin, APS, CoSimulation, Fractal, Control Center]
duracion_aprox: 4 min
cifras:
  - ["10 → 7", "pedidos tarde con la recomendación de Fractal"]
  - ["295,5 → 182,3 h", "de atraso total"]
  - ["90 min", "para montar el molde de repuesto en la IMM-20"]
ahorro:
  - ["Pedidos tarde", "10", "7", "3 pedidos salvados"]
  - ["Atraso total", "295,5 h", "182,3 h", "113,2 h menos"]
  - ["Costo de la recomendación", "—", "90 min", "de montaje del molde de repuesto"]
---

# Escenario 3 · Contingencia: falla de máquina

Mensaje central: cuando una máquina falla, el gemelo avisa, el cosimulador replanea y Fractal compara opciones de planta (no solo de secuencia). La persona decide y el cambio se ve de inmediato en la planta.

### S01 · La planta en vivo
- imagen: capturas/01-emulador.png
- duración: 14 s
- en pantalla: vista general del emulador 2D
- foco: Cada rectángulo es una máquina => 21 => Cada rectángulo, una máquina
- foco: las diez de la mañana del día nueve => EN VIVO · día 9 10:00:00 => Día 9, 10:00

> Este es el emulador de la planta de inyección de plásticos. Cada rectángulo es una máquina trabajando en tiempo real: inyectoras, buffers, montacargas y la línea de ensamble. Son las diez de la mañana del día nueve de la programación.

### S02 · El PLC de la inyectora veintiuno
- imagen: capturas/02-plc-imm21.png
- duración: 14 s
- en pantalla: zoom al panel PLC de la IMM-21
- foco: vemos su PLC => IMM-21 => PLC de IMM-21
- foco: la orden que está haciendo => Orden + PED-D10-03 + · Plásticos del Caribe => Orden en curso
- foco: baldes de doce litros => Balde de 12 L => Balde de 12 L

> Al hacer clic en una máquina vemos su PLC: la orden que está haciendo, el tiempo de ciclo, las unidades buenas, los rechazos y el OEE del turno. La inyectora veintiuno fabrica baldes de doce litros.

### S03 · Llega la falla
- imagen: capturas/03-falla.png
- duración: 14 s
- en pantalla: resaltar la alarma roja de la IMM-21
- foco: se quema la resistencia => 9 produciendo · 3 sin orden · + 1 fuera de servicio + · programación APS-SOL-01 => IMM-21 fuera de servicio
- foco: hasta el día doce => — => Reparación hasta el día 12, 10:00

> De pronto se quema la resistencia del cañón de la inyectora veintiuno. Mantenimiento estima tres días de reparación: hasta el día doce a las diez de la mañana.

### S04 · El Control Center lo ve
- imagen: capturas/04-centro-control.png
- duración: 14 s
- en pantalla: tarjeta de la IMM-21 en rojo y los indicadores de planta
- foco: recibe la alarma => IMM-21 => Alarma de IMM-21
- foco: su disponibilidad cae => Disponibilidad · semana => Disponibilidad de la semana

> El centro de control recibe la alarma al instante. La máquina queda fuera de servicio, su disponibilidad cae y la planta sabe qué órdenes estaban en ella.

### S05 · El APS avisa qué pedidos se afectan
- imagen: capturas/05-aps-alerta.png
- duración: 14 s
- en pantalla: banda roja de alerta arriba
- foco: la falla afecta ocho órdenes => IMM-21 => 8 órdenes afectadas

> En la programación de producción aparece la alerta: la falla afecta ocho órdenes del plan vigente. Ahora la pregunta es: ¿esperamos la reparación o movemos el trabajo a otra máquina?

### S06 · Fractal estudia las opciones
- imagen: capturas/06-fractal.png
- duración: 30 s
- en pantalla: tabla de opciones A a E; resaltar la fila D "MEJOR" y la columna OCUPACIÓN PLANTA
- foco: prueba tres combinaciones => combinaciones en => 3 combinaciones
- foco: quedan diez pedidos tarde => Pedidos tarde + 10 => Solo esperar: 10 tarde · 295 h
- foco: La recomendación es montar => RECOMENDACIÓN => Molde de repuesto en IMM-20
- foco: siete pedidos tarde => Pedidos tarde + 7 => 10 → 7 pedidos tarde
- foco: ciento ochenta y dos horas => Atraso total + 182,3 h => 295,5 h → 182,3 h
- foco: sesenta y uno por ciento => Ocupación planta + 61 % => Ocupación planta 61 %

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
- foco: Con un clic adoptamos => VIGENTE · + FRACTAL => Ahora vigente: Fractal
- foco: noventa y dos coma cinco => VIGENTE · + FRACTAL => 92,5 % a tiempo

> Con un clic adoptamos la recomendación. Pasa a ser la programación vigente, con noventa y dos coma cinco por ciento de pedidos a tiempo. Fractal recomienda; la persona decide.

### S09 · El Control Center después
- imagen: capturas/08-centro-control-despues.png
- duración: 12 s
- en pantalla: la IMM-20 ahora con orden
- foco: la inyectora veinte con su nueva orden => IMM-20 => IMM-20 con su nueva orden
- foco: la veintiuno sigue en reparación => IMM-21 => IMM-21 en reparación

> El centro de control ya muestra a la inyectora veinte con su nueva orden, mientras la veintiuno sigue en reparación.

### S10 · El emulador después
- imagen: capturas/09-emulador-despues.png
- duración: 10 s
- en pantalla: la IMM-20 produciendo
- foco: el nuevo plan => 9 produciendo · 2 sin orden · + 1 fuera de servicio + · programación FRA-01-C => Emulador con el plan nuevo

> Y en el emulador la planta sigue trabajando con el nuevo plan.

### S11 · El gemelo 3D
- imagen: capturas/10-gemelo-3d.png
- orbita: orbitas/10-imm21
- duración: 14 s
- en pantalla: la IMM-21 en rojo y su PLC a la derecha

> En el gemelo 3D vemos lo mismo: la inyectora veintiuno marcada fuera de servicio, con su ocupación contra disponibilidad por día.

### S12 · El 3D con el plan nuevo
- imagen: capturas/11-gemelo-3d-despues.png
- orbita: orbitas/11-imm20
- duración: 14 s
- en pantalla: etiqueta de la IMM-20 con la orden de baldes

> Y con el plan adoptado, la inyectora veinte aparece produciendo baldes. Del aviso de falla a un plan nuevo en la planta, en menos de un minuto.

### S13 · El montaje del molde en el gemelo 3D
- imagen: capturas/12-gemelo-montaje-grua.jpg
- orbita: orbitas/12-montaje-ida
- duración: 18 s
- en pantalla: IMM-20, el carro de moldes y el letrero morado del cambio de molde

> Y la opción adoptada no se queda en una tabla: con el play, el gemelo 3D muestra el cambio de molde en la inyectora veinte. El puente grúa saca su molde y lo baja al carro, y un operario lo lleva al almacén de moldes.

### S14 · El montaje en la inyectora veinte
- imagen: capturas/13-gemelo-montaje-imm20.jpg
- orbita: orbitas/13-montaje-vuelta
- duración: 16 s
- en pantalla: el carro que vuelve del almacén, el montaje y IMM-20 produciendo baldes

> Regresa con el molde de balde de repuesto, la grúa lo monta y la inyectora veinte queda produciendo baldes. Son noventa minutos de montaje, que nunca se parten, y el letrero dice qué molde entra y en qué fase va.

### S15 · El ahorro potencial
- imagen: capturas/06-fractal.png
- duración: 24 s
- en pantalla: las filas A y C MEJOR: columnas TARDE y ATRASO
- foco: quedan diez pedidos tarde => Pedidos tarde + 10 => Esperar: 10 tarde · 295,5 h
- foco: quedan siete tarde => Pedidos tarde + 7 => Fractal: 7 tarde · 182,3 h
- foco: tres pedidos salvados => — => 3 pedidos salvados · 113 h menos de atraso
- foco: noventa minutos de montaje => Montaje de moldes => Costo: 90 min de montaje

> Este es el ahorro de la contingencia. Si solo se espera la reparación, quedan diez pedidos tarde y doscientas noventa y cinco horas y media de atraso. Con la recomendación de Fractal quedan siete tarde y ciento ochenta y dos coma tres horas: tres pedidos salvados y ciento trece horas de atraso menos. El costo es noventa minutos de montaje del molde de repuesto.
