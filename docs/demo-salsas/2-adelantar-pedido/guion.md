---
title: Guion · Un cliente adelanta su pedido
escenario: 2-adelantar-pedido
tags: [demo, salsas, guion, fractal]
duracion_aprox: 1,5 min
---

# Escenario 2 · Un cliente adelanta su pedido

Mensaje central: ante un pedido urgente, Fractal prueba tres respuestas calculadas por el cosimulador y recomienda la que
cumple sin atrasar a nadie.

### S01 · El cliente llama
- imagen: capturas/01-pedido-gantt.png
- foco: tres mil quinientas sesenta unidades => PED-D11-04 => PED-D11-04 · mayonesa 1.000 ml

> Un cliente llama: necesita un día antes su pedido de mayonesa en doypack de mil mililitros, tres mil quinientas sesenta unidades. Su fecha de entrega es el día once.

### S02 · Fractal prueba tres respuestas
- imagen: capturas/02-fractal-pregunta.png
- foco: Elegimos el pedido => Pedido => El pedido: PED-D11-04
- foco: y la nueva fecha => Nueva entrega (cierre del turno, 22:00) => Nueva entrega: día 10

> Para responderle usamos Fractal, el módulo que compara escenarios. Elegimos el pedido y la nueva fecha, y Fractal prueba tres respuestas, cada una calculada por el cosimulador desde ahora: solo cambiar la fecha, cambiarla y darle importancia alta, o además organizar la planta en campañas por día, donde cada línea recorre su orden de recetas una sola vez al día.

### S03 · La recomendación
- imagen: capturas/03-fractal.png
- foco: Recomienda la importancia alta con campañas por día => Prioridad alta + campañas por día => Recomendación
- foco: el CIP baja a setenta y siete horas => 77,3 h => CIP 77,3 h
- foco: la merma a tres mil quinientos kilos => 3.508 kg => Merma 3.508 kg

> Recomienda la importancia alta con campañas por día: el pedido llega a tiempo, ningún otro se atrasa, y de paso el CIP baja a setenta y siete horas y la merma a tres mil quinientos kilos. Hacerlo a mano habría sido rehacer el plan entero.
