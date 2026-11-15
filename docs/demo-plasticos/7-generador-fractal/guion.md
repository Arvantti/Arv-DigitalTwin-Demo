---
title: Guion · Fractal con generador genético
escenario: 7-generador-fractal
tags: [demo, plasticos, guion, fractal, generador, emulador]
modulos: [DigitalTwin, APS, CoSimulation, Fractal]
duracion_aprox: 2,5 min
cifras:
  - ["128", "planes armados por el generador en 3,6 s"]
  - ["4", "calculados por el cosimulador, solo los mejores"]
  - ["30", "ejecuciones con imprevistos del emulador por opción"]
ahorro:
  - ["Cambios de referencia", "23", "12", "11 menos"]
  - ["Pedidos tarde", "9", "7", "2 menos"]
  - ["Atraso total", "224,6 h", "180,7 h", "43,9 h menos"]
---

# Escenario 7 · Fractal con generador genético

Mensaje central: Fractal ya no prueba solo unas variantes fijas. Genera cientos de planes cruzando y mutando las palancas (prioridades, moldes de repuesto, mudar moldes, un color por máquina), los ordena con las reglas de la planta, el cosimulador calcula solo los mejores y cada opción trae su probabilidad de cumplir con los imprevistos que entrega el emulador. Fractal recomienda; la persona decide.

Cada módulo hace lo suyo: el emulador genera las fallas (al azar o a mano), el APS lleva los paros previstos, el cosimulador calcula y Fractal genera las opciones. Sin CoSimulation, Fractal entrega sus mejores opciones calculadas con las reglas.

### S01 · El generador
- imagen: capturas/01-fractal-generador.png
- duración: 16 s
- en pantalla: la casilla GENERADOR GENÉTICO bajo el título

> En la pestaña de Fractal está el generador genético. Con él, Fractal no se limita a unas pocas variantes escritas a mano: combina prioridades, moldes de repuesto, mudanzas de molde y colores por máquina, y busca las mejores combinaciones como lo haría la evolución.

### S02 · Generando opciones
- imagen: capturas/02-generando.png
- duración: 14 s
- en pantalla: la línea de avance bajo las tarjetas

> Le preguntamos cómo hacer menos cambios de referencia. Mientras trabaja, muestra su avance: el generador cruza y muta planes, y las reglas de despacho de la planta evalúan cada uno en milisegundos.

### S03 · La recomendación
- imagen: capturas/03-recomendacion.png
- duración: 24 s
- en pantalla: la etiqueta "128 planes por reglas · 4 con el cosimulador" y el texto de la recomendación

> En menos de cuatro segundos armó ciento veintiocho planes, y el cosimulador calculó solo los cuatro mejores. La recomendación es dedicar un color por máquina: de veintitrés cambios a doce, dos pedidos tarde menos y casi cuarenta y cuatro horas menos de atraso.

### S04 · La probabilidad de cumplir
- imagen: capturas/04-opciones-probabilidad.png
- duración: 26 s
- en pantalla: la columna PROB. DE CUMPLIR, sobre todo la opción D

> Cada opción trae su probabilidad de cumplir. Fractal ejecuta el plan treinta veces con los imprevistos que entrega el emulador: fallas al azar y variaciones del tiempo de ciclo. La recomendada cumple en treinta y siete por ciento de las ejecuciones. La opción D, montar el molde de repuesto, hace más cambios, pero cumple en noventa y siete por ciento. Fractal muestra las dos caras; la persona decide qué pesa más.

### S05 · Cualquier opción en el Gantt
- imagen: capturas/05-opcion-en-gantt.png
- duración: 14 s
- en pantalla: la franja PROPUESTA · FRACTAL arriba del Gantt

> Cualquier opción se puede ver en el Gantt y en el gemelo 3D antes de adoptarla. Aquí está la recomendada, con sus indicadores frente a la vigente.

### S06 · Las fallas vienen del emulador
- imagen: capturas/06-emulador-fallas-azar.png
- duración: 18 s
- en pantalla: la casilla FALLAS AL AZAR y el evento AZ-001 en la inyectora veintitrés

> Las fallas no las inventa Fractal ni el cosimulador. Las genera el emulador: se pueden declarar a mano en una máquina, o activar las fallas al azar con la tasa real de la planta. Aquí la inyectora veintitrés cae a las seis de la mañana, y el aviso llega al centro de control, al gemelo y al APS.

## Datos de la corrida

- AHORA = día 9. Vigente: programación manual APS-MAN-01 (90,3 % a tiempo, 9 tarde, 23 cambios).
- Estudio FRA-01 "menos cambios": 128 planes por reglas, 4 con el cosimulador, 4 opciones en 3,6 s, 30 ejecuciones con imprevistos por opción.
- Opciones: A un color por máquina (12 cambios, 37 %), B solo recolocar (31 cambios, 37 %), C repuesto en IMM-20 + un color por máquina (12 cambios, 47 %), D repuesto en IMM-20 (30 cambios, 97 %).
- Las fallas al azar usan `demand.yaml` (5 % por inyectora y día, 1 a 5 h); el ciclo varía ±5 %. Todo es supuesto de la demo.
