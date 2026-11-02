---
title: Parte 4 · Programar mejor
serie: el-gemelo-digital
parte: 4
duracion_aprox: 60 s
palabras: 137
siguiente: "Parte 5 · Probar el futuro"
cifras:
  - ["90,3 % → 92,5 %", "pedidos a tiempo: manual contra cosimulador"]
  - ["83 h", "de máquina menos en la semana con la misma producción"]
  - ["27,5 t", "de resina para la semana"]
---

# Parte 4 · Programar mejor

Idea: con los pedidos y sus fechas, el cosimulador calcula en menos de un segundo un plan que cumple más entregas con menos
horas de máquina. Cifras de `docs/demo-plasticos/1-calcular-programacion/guion.md`.

## Guion

### S01 · Recordatorio
- imagen: mapa con los bloques 4 (APS) y 5 (cosimulador) iluminados
- duración: 6 s
- en pantalla: zoom a los bloques 4 y 5
- texto: PARTE 4 · PROGRAMAR MEJOR

> Ya vemos la planta en vivo. Ahora, el plan: qué hace cada máquina y cuándo.

### S02 · Los pedidos
- imagen: docs/demo-plasticos/1-calcular-programacion/capturas/01-pedidos.png
- duración: 8 s
- en pantalla: los indicadores de arriba y la columna ENTREGA
- texto: 93 pedidos

> La planta tiene noventa y tres pedidos, cada uno con su cantidad y su fecha de entrega.

### S03 · El plan a mano
- imagen: docs/demo-plasticos/1-calcular-programacion/capturas/02-gantt-manual.png
- duración: 12 s
- en pantalla: la etiqueta VIGENTE · MANUAL y los rombos de entrega
- texto: Manual: 90,3 % a tiempo

> Con la programación hecha a mano, el noventa coma tres por ciento sale a tiempo, y la planta queda ocupada al sesenta y nueve por ciento de sus horas.

### S04 · El cosimulador
- imagen: docs/demo-plasticos/1-calcular-programacion/capturas/04-calcular.png
- duración: 18 s
- en pantalla: el recuadro PROPUESTA; resaltar "a tiempo" y "Ocupación planta"
- texto: 92,5 % a tiempo · 83 h menos

> Mi cosimulador arma un modelo matemático con casi cinco mil variables y lo resuelve en menos de un segundo. Resultado: noventa y dos coma cinco por ciento a tiempo, con ochenta y tres horas de máquina menos en la semana.

### S05 · Los insumos
- imagen: docs/demo-plasticos/1-calcular-programacion/capturas/10-insumos.png
- duración: 10 s
- en pantalla: el indicador de resina y la tabla de materia prima
- texto: 27,5 t de resina

> Y del plan salen los insumos: veintisiete toneladas y media de resina para la semana. Compras, almacén y producción, con el mismo número.

### S06 · Continúa
- imagen: tarjeta final sobre #0e1430
- duración: 6 s
- en pantalla: logo de AndyOpenDev y firma "Arvantti · Digital Twin Engineering"
- texto: Continúa en la parte 5: probar el futuro

> Pero un plan dura hasta que algo cambia. Parte cinco: probar el futuro.

## Copy de publicación

93 pedidos, 12 inyectoras y una pregunta: ¿qué hace cada máquina y cuándo?

A mano, el 90,3 % de los pedidos salía a tiempo. Mi cosimulador arma un modelo matemático con casi cinco mil variables, lo
resuelve en menos de un segundo y sube al 92,5 %, con 83 horas de máquina menos en la semana. Y del plan salen los insumos
que compras, almacén y producción necesitan.

Parte 4 de 6. En la próxima: probar el futuro.

#GemeloDigital #DigitalTwin #Optimización #ProgramaciónDeProducción #APS #AndyOpenDev #Arvantti

## Portada

Texto encima: **PARTE 4** · **Programar mejor** · 90,3 % → 92,5 %

Prompt de imagen (sin texto; el título se pone encima en la composición):

```text
Vertical 9:16 image, dark navy background (#0e1430). An elegant production schedule visualized as glowing horizontal
Gantt bars in cyan, green and amber, flowing out of a stylized injection molding machine and rearranging themselves into
a cleaner, tighter pattern. Faint mathematical symbols (sigma, integral, inequality signs) float in the background like
constellations. Premium, technical, minimal style, soft light, no readable text, no logos, no brand names. Keep the
upper central area darker for a title overlay.
```
