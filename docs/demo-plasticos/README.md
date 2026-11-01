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

- Fecha simulada ("AHORA"): miércoles 4 de noviembre de 2026, 10:00.
- Cartera: 93 pedidos inventados con entrega entre el 26 de octubre y el 23 de noviembre, carga objetivo 85 % de la capacidad.
- 12 inyectoras con molde montado (cubiertos IMM-01, 02, 04, 05 y 08; pedal IMM-06 y 07; cuerpo de papelera IMM-18 y 19; balde IMM-21 y 23) y la línea de ensamble ENSAMBLE-01.
- Programación manual: 90,3 % a tiempo (9 tarde, 228,9 h de atraso). Cosimulador: 92,5 % a tiempo (7 tarde, 181,8 h).
- Todos los datos son supuestos; ninguna marca ni cliente es real.

Las capturas se tomaron con el código de `main` corriendo en local (`pnpm gallery:dev` y la API del emulador). Para volver a tomarlas, abra las páginas con `?now=2026-11-04T10:00` y, la primera vez, `aps.html?reset=1`.
