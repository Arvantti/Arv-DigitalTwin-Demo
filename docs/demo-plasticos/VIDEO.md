---
title: Video tutorial de la demo de plásticos
tags: [demo, plasticos, video, guion, elevenlabs, hyperframes]
fecha: 2026-11-01
---

# Video tutorial de la demo de plásticos

Instrucciones para producir el video en el computador que tiene ElevenLabs y HyperFrames configurados. El video resume
las tres presentaciones y muestra la planta: emulador, centro de control, gemelo 3D, APS con el cosimulador y Fractal.

## 1. Estructura del video (unos 9 minutos)

| Capítulo | Contenido | Guion | Material |
|---|---|---|---|
| 0 · Apertura | Qué es el gemelo y cómo se conectan sus partes | sección 4 de este documento | capturas de los escenarios 1 y 3 |
| 1 · Calcular la programación | De los pedidos a un plan con más entregas a tiempo y menos horas de máquina | [guion](1-calcular-programacion/guion.md) | `1-calcular-programacion/` |
| 2 · Cambio de fecha de un pedido | Un cliente adelanta su pedido un día | [guion](2-cambio-fecha-pedido/guion.md) | `2-cambio-fecha-pedido/` |
| 3 · Contingencia | Falla de una inyectora y plan de reemplazo | [guion](3-contingencia-falla/guion.md) | `3-contingencia-falla/` |
| 4 · Cierre | Lo que gana la planta | sección 4 de este documento | tarjeta con cifras |

Reglas del contenido: sin fechas de calendario (todo es "día N"; hoy es el día 9), sin marcas reales, clientes y
pedidos inventados, cifras tal como salen en las capturas.

## 2. Material de pantalla

Las capturas ya están en el repo (`<escenario>/capturas/`). Para tomarlas de nuevo o grabar recorridos en video:

```bash
pnpm install
pnpm gallery                       # deja la galería en http://localhost:5173 (otra terminal)
pnpm add -g playwright@1.63.0
pnpm dlx playwright@1.63.0 install chromium
NODE_PATH="$(pnpm root -g)" node tools/demo-video/grabar.cjs todos --video   # o 1, 2, 3; --lento para pausas más largas
```

- Capturas: `docs/demo-plasticos/<escenario>/capturas/*.png`, con los mismos nombres que usan los guiones.
- Video: `docs/demo-plasticos/<escenario>/video/recorrido.webm`, un recorrido continuo por escenario, 1600×900. Está en
  `.gitignore` para no subir videos al repo.
- No hace falta grabar la pantalla a mano. Si quieres tomas propias (por ejemplo, mover la cámara del 3D), graba solo
  esas y úsalas en lugar de la captura del segmento.

## 3. Voz con ElevenLabs

- Un audio por segmento: el texto de cada cita (`>`) de los `guion.md`, más las de la sección 4. Los textos ya vienen
  escritos para leerse en voz alta (números en palabras, "inyectora veintiuno" en vez de "IMM-21").
- Nombre de archivo sugerido: `audio/<capítulo>-S<nn>.mp3`, por ejemplo `audio/3-S06.mp3`.
- Voz en español latino, neutra y pausada. Usa la misma voz y los mismos ajustes en todos los segmentos.

## 4. Guion de apertura y cierre

### 0-S01 · La planta y su gemelo
- imagen: 3-contingencia-falla/capturas/10-gemelo-3d.png
- duración: 16 s

> Esta es una planta de inyección de plásticos y su gemelo digital. Tiene veintinueve inyectoras, una línea de ensamble, almacenes y montacargas, y fabrica cuatro productos: cubiertos desechables, baldes de doce litros y papeleras de pedal.

### 0-S02 · Cómo se conecta todo
- imagen: 3-contingencia-falla/capturas/01-emulador.png
- duración: 20 s

> El emulador hace de planta real: cada máquina produce en tiempo real y aquí se simulan las fallas. El centro de control recibe las señales de todas las máquinas. El gemelo 3D muestra la planta en el pasado, el presente y el futuro programado. Y el APS es donde se programa la producción.

### 0-S03 · Sin fechas de calendario
- imagen: 1-calcular-programacion/capturas/01-pedidos.png
- duración: 12 s

> Todo se cuenta en días desde el arranque de la programación, el día cero. Hoy es el día nueve. Veamos tres escenarios.

### 4-S01 · Lo que gana la planta
- imagen: tarjeta con tres cifras (fondo oscuro): "90,3 % → 92,5 % a tiempo", "69 % → 59 % de ocupación con la misma producción", "9 → 7 pedidos tarde ante una falla"
- duración: 20 s

> En resumen: el cosimulador cumple más entregas con menos horas de máquina, Fractal prueba cambios en la planta y recomienda el mejor, y ante una falla la planta tiene un plan nuevo en menos de un minuto. Fractal recomienda; la persona decide.

## 5. Montaje con HyperFrames

- Lienzo de 1920×1080. Las capturas son de 1600×900: escálalas al ancho completo o ponlas sobre un fondo oscuro
  (#0e1430, el mismo de las presentaciones).
- Un cuadro por segmento, con la imagen de `imagen` y la duración del audio más medio segundo. La línea `en pantalla`
  dice dónde hacer el zoom suave o el recuadro de resaltado.
- Al inicio de cada capítulo, una tarjeta de título de 3 s ("Escenario 1 · Calcular la programación", etc.).
- Subtítulos con el mismo texto de la voz.
- Opcional: en lugar de una captura fija, un tramo del `recorrido.webm` del escenario que muestre la misma pantalla.

## 6. Prompt para el agente

Copia este texto en el agente que tiene HyperFrames y ElevenLabs:

```text
En el repo clonado, lee docs/demo-plasticos/VIDEO.md y los tres guion.md de docs/demo-plasticos/.
Produce un video tutorial en español de unos 9 minutos, 1920x1080, con cinco capítulos:
0 apertura, 1 calcular la programación, 2 cambio de fecha de un pedido, 3 contingencia, 4 cierre.

1. Si faltan capturas o quieres recorridos en video, levanta la galería con `pnpm gallery` y corre
   `NODE_PATH="$(pnpm root -g)" node tools/demo-video/grabar.cjs todos --video`.
2. Con ElevenLabs genera un audio por segmento con el texto de cada cita (las líneas que empiezan con ">"),
   misma voz en español latino para todo. Guarda los audios en docs/demo-plasticos/audio/<capítulo>-S<nn>.mp3.
3. Con HyperFrames arma una escena por segmento: la imagen del campo "imagen", duración igual al audio más 0,5 s,
   zoom suave o recuadro donde dice "en pantalla", subtítulos con el texto de la voz, fondo #0e1430 y
   una tarjeta de título de 3 s al inicio de cada capítulo.
4. Exporta docs/demo-plasticos/video-demo-plasticos.mp4 y una versión por capítulo.
No cambies cifras ni textos de los guiones, no muestres fechas de calendario (todo es "día N") y no subas
los videos ni los audios al repo.
```
