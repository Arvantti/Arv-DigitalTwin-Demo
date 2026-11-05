---
title: Guion · Menos cambios de referencia
escenario: 5-menos-cambios
tags: [demo, plasticos, guion, fractal, cambios]
duracion_aprox: 2 min
cifras:
  - ["30 → 12", "cambios de referencia en la programación"]
  - ["22,5 → 9 h", "de máquina en purgas y montajes"]
  - ["0,7 s", "para estudiar las opciones, sin atrasar más pedidos"]
ahorro:
  - ["Cambios de referencia", "30", "12", "18 menos (60 %)"]
  - ["Horas de máquina en purgas y montajes", "22,5 h", "9 h", "13,5 h por semana"]
  - ["Pedidos tarde", "7", "7", "ninguno más"]
---

# Escenario 5 · Menos cambios de referencia

Mensaje central: cada cambio de referencia cuesta tiempo de máquina: montaje de molde, purga de resina y purga de color. Los tiempos salen de los datos de la planta, y Fractal busca cómo hacer menos cambios sin atrasar ningún pedido.

### S01 · Los cambios en la programación
- imagen: capturas/01-gantt-cambios.png
- duración: 22 s
- en pantalla: las rayas blancas en las barras de IMM-21 e IMM-23
- foco: la veintiuno y la veintitrés => @27,968,134,72 => IMM-21 e IMM-23
- foco: Cada raya blanca => cambio (molde, resina o color) => Raya = cambio de referencia

> Esta es la programación que calculó el cosimulador. Miremos las dos inyectoras del balde, la veintiuno y la veintitrés. Cada raya blanca es un cambio de referencia: la máquina deja de producir para limpiar el color. Pasar de blanco a azul toma treinta minutos, pero de azul a blanco toma una hora, porque hay que sacar todo el pigmento. Si cambia el molde, se suma el montaje, y si cambia la resina, la purga es más larga. Ninguno de esos tiempos está fijo en el programa: salen de los datos de cada molde, cada resina y cada color.

### S02 · La pregunta a Fractal
- imagen: capturas/02-fractal-pregunta.png
- duración: 14 s
- en pantalla: la tarjeta 4 · MENOS CAMBIOS DE REFERENCIA
- foco: treinta cambios => 30 cambios + 22,5 h => 30 cambios · 22,5 h
- foco: Le preguntamos a Fractal => MENOS CAMBIOS DE REFERENCIA => 5 · Menos cambios

> El plan vigente tiene treinta cambios y veintidós horas y media de máquina en cambios. Le preguntamos a Fractal: ¿cómo hacer menos cambios sin atrasar los pedidos?

### S03 · La recomendación
- imagen: capturas/03-fractal.png
- duración: 24 s
- en pantalla: la fila B · MEJOR y la columna CAMBIOS DE REFERENCIA
- foco: Su recomendación => RECOMENDACIÓN => Un color por máquina
- foco: Los cambios bajan de treinta a doce => Cambios de referencia + 12 => 30 → 12 cambios
- foco: Los pedidos a tiempo son los mismos => A tiempo + 92,5 % => A tiempo: igual

> En menos de un segundo compara las opciones. Su recomendación: dedicar un color a cada máquina. La veintiuno se queda en azul y la veintitrés en blanco. Los cambios bajan de treinta a doce, y las horas de cambio, de veintidós y media a nueve. Los pedidos a tiempo son los mismos: no se atrasa ninguno más.

### S04 · El plan adoptado
- imagen: capturas/04-gantt-adoptado.png
- duración: 16 s
- en pantalla: las barras de IMM-21 e IMM-23 después de AHORA
- foco: las barras del balde => @27,966,1880,76 => Casi sin rayas

> Adoptamos la recomendación. Desde ahora, las barras del balde corren casi sin rayas. Son trece horas y media de máquina que vuelven a producción en lugar de purgar.

### S05 · Los insumos
- imagen: capturas/05-insumos.png
- duración: 14 s
- en pantalla: la columna CAMBIOS DE REFERENCIA de la tabla de horas de máquina
- foco: la columna de cambios => CAMBIOS => Horas de cambio por máquina

> En insumos, la columna de cambios de referencia muestra las horas de cambio por máquina en la semana: con el plan adoptado, esta semana no queda ninguna. Menos purgas también significa menos resina y menos colorante botados en cada limpieza.

### S06 · El ahorro potencial
- imagen: capturas/03-fractal.png
- duración: 26 s
- en pantalla: las filas VIGENTE y B MEJOR: columna CAMBIOS DE REFERENCIA
- foco: de treinta a doce => Cambios de referencia + 12 => 30 → 12 cambios (−60 %)
- foco: de veintidós y media a nueve => — => 22,5 h → 9 h: 13,5 h por semana

> Este es el ahorro más directo. Dedicar un color a cada máquina baja los cambios de referencia de treinta a doce, un sesenta por ciento menos, y las horas de máquina en purgas y montajes, de veintidós y media a nueve: trece horas y media por semana que vuelven a producción, sin atrasar ningún pedido. Menos purgas también es menos resina y colorante desechados.
