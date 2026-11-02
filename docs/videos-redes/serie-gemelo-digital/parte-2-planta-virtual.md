---
title: Parte 2 · La planta virtual
serie: el-gemelo-digital
parte: 2
duracion_aprox: 60 s
palabras: 135
siguiente: "Parte 3 · Ver la planta en vivo"
---

# Parte 2 · La planta virtual

Idea: antes de conectar un gemelo a una planta real necesitaba una planta donde probarlo sin riesgo, con un PLC virtual por
máquina.

## Guion

### S01 · Recordatorio
- imagen: mapa con el bloque 1 (emulador) iluminado
- duración: 6 s
- en pantalla: zoom al bloque 1
- texto: PARTE 2 · LA PLANTA VIRTUAL

> En la parte uno te conté por qué construí un gemelo digital. Hoy, la primera pieza.

### S02 · Por qué una planta virtual
- imagen: docs/demo-plasticos/3-contingencia-falla/capturas/01-emulador.png
- duración: 10 s
- en pantalla: vista general del emulador, zoom suave
- texto: Probar sin riesgo

> Antes de conectar un gemelo a una planta real, necesitaba una planta donde probarlo sin riesgo. Así que construí una planta virtual: un emulador.

### S03 · La planta
- imagen: docs/demo-plasticos/3-contingencia-falla/capturas/01-emulador.png
- duración: 10 s
- en pantalla: paneo por las inyectoras, los buffers y la línea de ensamble
- texto: 12 inyectoras · en tiempo real

> Es una planta de inyección de plásticos: doce inyectoras, una celda de ensamble, almacenes y montacargas. Cada máquina produce en tiempo real.

### S04 · Un PLC por máquina
- imagen: docs/demo-plasticos/3-contingencia-falla/capturas/02-plc-imm21.png
- duración: 16 s
- en pantalla: zoom al panel PLC de la inyectora 21; resaltar ciclo, unidades buenas, rechazos y OEE a medida que se nombran
- texto: Un PLC virtual por máquina

> Y cada máquina tiene su PLC virtual. El PLC es el controlador lógico programable, el que en una planta real manda las señales: qué orden está haciendo, su tiempo de ciclo, las piezas buenas, los rechazos y su eficiencia.

### S05 · Fallas a propósito
- imagen: docs/demo-plasticos/3-contingencia-falla/capturas/03-falla.png
- duración: 10 s
- en pantalla: resaltar la alarma roja de la inyectora 21
- texto: Fallas a propósito

> Aquí también puedo provocar una falla, como quemar la resistencia de una inyectora, y ver cómo responde todo el sistema.

### S06 · Continúa
- imagen: tarjeta final sobre #0e1430
- duración: 8 s
- en pantalla: logo de AndyOpenDev y firma "Arvantti · Digital Twin Engineering"
- texto: Continúa en la parte 3: ver la planta en vivo

> ¿Y a dónde van todas esas señales? Parte tres: ver la planta en vivo.

## Copy de publicación

Antes de conectar un gemelo digital a una planta real, necesitaba una planta donde probarlo sin riesgo.

Por eso construí una planta virtual: doce inyectoras, ensamble, almacenes y montacargas, cada máquina con su PLC virtual
mandando señales en tiempo real. Y puedo provocar fallas a propósito para ver cómo responde todo el sistema.

Parte 2 de 6. En la próxima: ver la planta en vivo.

#GemeloDigital #DigitalTwin #PLC #Industria40 #Automatización #AndyOpenDev #Arvantti

## Portada

Texto encima: **PARTE 2** · **La planta virtual**

Prompt de imagen (sin texto; el título se pone encima en la composición):

```text
Vertical 9:16 image, dark navy background (#0e1430). A top-down schematic of a plastic injection molding plant drawn as
a glowing blueprint: rectangular machines connected by thin cyan lines, small forklifts, a storage rack and an assembly
cell. In the foreground, an industrial PLC control panel floats in 3D with glowing status lights, cycle-time gauges and
green and red indicators, connected to the machines by light trails. Precise, technical, premium style, cyan and violet
accents, no text, no logos, no brand names. Keep the upper central area darker for a title overlay.
```
