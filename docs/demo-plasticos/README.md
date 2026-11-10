---
title: Demo de la planta de plásticos · capturas y guiones
tags: [demo, plasticos, guion, video]
fecha: 2026-11-03
---

# Demo de la planta de plásticos

Capturas y guiones de narración para la demo del gemelo de la planta de inyección de plásticos. Hay una carpeta por escenario. Cada carpeta tiene:

- `capturas/`: las imágenes, numeradas en el orden en que se muestran (1600×900, PNG).
- `guion.md`: la narración por segmento, con la imagen que va en pantalla y la duración aproximada.

| Carpeta | Escenario | Duración aprox. |
|---|---|---|
| [1-calcular-programacion](1-calcular-programacion/guion.md) | Programación según las entregas con el mayor uso de la capacidad: pedidos, carga manual de los datos (capturas en `configuracion/`), manual contra cosimulador, ocupación, balanceo con Fractal e insumos | 5 min |
| [2-cambio-fecha-pedido](2-cambio-fecha-pedido/guion.md) | Un cliente pide su pedido un día antes | 2,5 min |
| [3-contingencia-falla](3-contingencia-falla/guion.md) | Se quema la resistencia de la IMM-21 y Fractal propone cómo seguir | 3 min |
| [4-pedidos-fijados](4-pedidos-fijados/guion.md) | El planificador bloquea a mano órdenes en el Gantt y Fractal reorganiza el resto sin moverlas | 3 min |
| [5-menos-cambios](5-menos-cambios/guion.md) | Fractal dedica un color a cada inyectora del balde: de 30 a 12 cambios de referencia sin atrasar pedidos | 2 min |

Cada escenario arranca donde termina el anterior: el 2 parte del plan del cosimulador, el 3 de una falla sobre ese plan y el 4 del mismo plan del cosimulador con órdenes bloqueadas a mano.

Con estos archivos se arman las presentaciones en línea, que viven en arvantti.tech (https://www.arvantti.tech/presentaciones, repo andresquiceno/arvantti-labs-site): una por escenario, con notas del orador y el enlace VER EN VIVO en cada lámina. Las cifras del cierre salen de los campos `cifras` y `ahorro` del frontmatter de cada guion. Si cambias un guion o una captura, hay que regenerar las presentaciones en ese repo y desplegarlo.

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
- Programación manual: 90,3 % a tiempo (9 tarde, 229,4 h de atraso), ocupación de planta 69,2 % (793 de 1.146 h en 7 días). Cosimulador: 92,5 % a tiempo (7 tarde, 182,3 h), ocupación 61,3 % (703 h): la misma producción con 90 h de máquina menos. Balanceado con Fractal: 60,7 % de 1.240 h. Los cambios de referencia cobran montaje de molde y purgas de resina y color según `catalog/changeovers.yaml`; el escenario 4 de Fractal (menos cambios) dedica un color a cada inyectora del balde.
- **Ahorro potencial** (el campo `ahorro` del frontmatter de cada guion alimenta la tabla de las presentaciones en arvantti.tech y el cierre del video; son cifras de las corridas, no estimaciones): falla de IMM-21, 10 → 7 pedidos tarde y 295,5 → 182,3 h de atraso (113,2 h menos); menos cambios, 30 → 12 cambios y 22,5 → 9 h de máquina por semana; pedidos fijados, 185,8 → 182,3 h y 65,9 → 61,6 % de ocupación. Para llevarlo a dinero se multiplica por el costo de la hora de máquina de la planta, dato que la demo no inventa.
- Todos los datos son supuestos; ninguna marca ni cliente es real.

Para producir el video (voz con ElevenLabs y montaje con HyperFrames) siga [VIDEO.md](VIDEO.md): trae el guion de apertura y cierre, el prompt para el agente y cómo volver a tomar las capturas o grabar los recorridos con `tools/demo-video/grabar.cjs`.
