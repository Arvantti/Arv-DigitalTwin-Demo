---
title: Demo de la planta de plásticos · capturas y guiones
tags: [demo, plasticos, guion, video]
fecha: 2026-11-01
---

# Demo de la planta de plásticos

Capturas y guiones de narración para la demo del gemelo de la planta de inyección de plásticos. Hay una carpeta por escenario. Cada carpeta tiene:

- `capturas/`: las imágenes, numeradas en el orden en que se muestran (1600×900, PNG).
- `guion.md`: la narración por segmento, con la imagen que va en pantalla y la duración aproximada.

| Carpeta | Escenario | Duración aprox. |
|---|---|---|
| [1-calcular-programacion](1-calcular-programacion/guion.md) | Programación según las entregas con el mayor uso de la capacidad: pedidos, manual contra cosimulador, ocupación, balanceo con Fractal e insumos | 3 min |
| [2-cambio-fecha-pedido](2-cambio-fecha-pedido/guion.md) | Un cliente pide su pedido un día antes | 2 min |
| [3-contingencia-falla](3-contingencia-falla/guion.md) | Se quema la resistencia de la IMM-21 y Fractal propone cómo seguir | 3 min |

Cada escenario arranca donde termina el anterior: el 2 parte del plan del cosimulador y el 3 de una falla sobre ese plan.

## Cómo usar los guiones para el video

Cada segmento del guion tiene esta forma:

```
### S03 · Título corto
- imagen: capturas/03-calcular.png
- duración: 12 s
- en pantalla: qué resaltar (zoom, flecha o recuadro)

> Texto que lee la voz.
```

- **ElevenLabs:** use solo el texto de las citas (`>`). Ya viene escrito para leerse en voz alta: los códigos de máquina van como "inyectora veintiuno" y las cifras como se dicen. Un audio por segmento facilita el montaje.
- **HyperFrames:** un cuadro por segmento con la imagen de `imagen`. La duración es una guía; ajústela a la duración real del audio. La línea `en pantalla` dice dónde hacer el zoom o el resaltado.

## Datos de la corrida

- Sin fechas de calendario: todo se muestra como "día N". El día 0 es el arranque de la cartera y AHORA es siempre el día 9 (en las capturas, a las 10:00). Los pedidos se llaman `PED-D<día de entrega>-NN`.
- Cartera: 93 pedidos inventados con entrega entre el día 1 y el día 19, carga objetivo 85 % de la capacidad.
- 12 inyectoras con molde montado (cubiertos IMM-01, 02, 04, 05 y 08; pedal IMM-06 y 07; cuerpo de papelera IMM-18 y 19; balde IMM-21 y 23) y la línea de ensamble ENSAMBLE-01.
- Programación manual: 90,3 % a tiempo (9 tarde, 228,9 h de atraso), ocupación de planta 69,3 % (794 de 1.146 h en 7 días). Cosimulador: 92,5 % a tiempo (7 tarde, 181,8 h), ocupación 62 % (711 h): la misma producción con 83 h de máquina menos. Balanceado con Fractal: 59,1 % de 1.240 h.
- Todos los datos son supuestos; ninguna marca ni cliente es real.

Para producir el video (voz con ElevenLabs y montaje con HyperFrames) siga [VIDEO.md](VIDEO.md): trae el guion de apertura y cierre, el prompt para el agente y cómo volver a tomar las capturas o grabar los recorridos con `tools/demo-video/grabar.cjs`.
