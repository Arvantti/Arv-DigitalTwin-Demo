---
title: Video tutorial de la demo de plásticos
tags: [demo, plasticos, video, guion, elevenlabs, hyperframes]
fecha: 2026-11-03
---

# Video tutorial de la demo de plásticos

Instrucciones para producir el video en el computador que tiene ElevenLabs y HyperFrames configurados. El video resume
las cinco presentaciones y muestra la planta: emulador, centro de control, gemelo 3D, APS con el cosimulador y Fractal.

## 1. Estructura del video (unos 16 minutos)

| Capítulo | Contenido | Guion | Material |
|---|---|---|---|
| 0 · Apertura | Qué es el gemelo y cómo se conectan sus partes | sección 4 de este documento | capturas de los escenarios 1 y 3 |
| 1 · Calcular la programación | De los pedidos a un plan con más entregas a tiempo y menos horas de máquina | [guion](1-calcular-programacion/guion.md) | `1-calcular-programacion/` |
| 2 · Cambio de fecha de un pedido | Un cliente adelanta su pedido un día | [guion](2-cambio-fecha-pedido/guion.md) | `2-cambio-fecha-pedido/` |
| 3 · Contingencia | Falla de una inyectora y plan de reemplazo | [guion](3-contingencia-falla/guion.md) | `3-contingencia-falla/` |
| 4 · Pedidos fijados | El planificador bloquea órdenes a mano y Fractal reorganiza el resto | [guion](4-pedidos-fijados/guion.md) | `4-pedidos-fijados/` |
| 5 · Menos cambios de referencia | Fractal dedica un color a cada inyectora: de 30 a 12 cambios | [guion](5-menos-cambios/guion.md) | `5-menos-cambios/` |
| 6 · Cierre | El ahorro potencial de Fractal | sección 4 de este documento | tarjeta con cifras |

Reglas del contenido: sin fechas de calendario (todo es "día N"; hoy es el día 9), sin marcas reales, clientes y
pedidos inventados, cifras tal como salen en las capturas.

## 2. Material de pantalla

Las capturas ya están en el repo (`<escenario>/capturas/`). Para tomarlas de nuevo o grabar recorridos en video:

```bash
pnpm install
pnpm gallery                       # deja la galería en http://localhost:5173 (otra terminal)
pnpm add -g playwright@1.63.0
pnpm dlx playwright@1.63.0 install chromium
NODE_PATH="$(pnpm root -g)" node tools/demo-video/grabar.cjs todos --video   # o 1, 2, 3, 4, 5; --lento para pausas más largas
# el gemelo 3D necesita también el emulador: uv sync && uv run uvicorn twin_emulator_api.main:app --port 8000
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

> Esta es una planta de inyección de plásticos y su gemelo digital. Tiene doce inyectoras, una celda de ensamble, almacenes y montacargas, y fabrica cuatro productos: cubiertos desechables, baldes de doce litros y papeleras de pedal.

### 0-S02 · Cómo se conecta todo
- imagen: 3-contingencia-falla/capturas/01-emulador.png
- duración: 20 s

> El emulador hace de planta real: cada máquina produce en tiempo real y aquí se simulan las fallas. El centro de control recibe las señales de todas las máquinas. El gemelo 3D muestra la planta en el pasado, el presente y el futuro programado. Y el APS es donde se programa la producción.

### 0-S03 · Sin fechas de calendario
- imagen: 1-calcular-programacion/capturas/01-pedidos.png
- duración: 8 s
- foco: Hoy es el día nueve => día 9 => Hoy: día 9

> Todo se cuenta en días desde el arranque de la programación, el día cero. Hoy es el día nueve.

### 0-S04 · Cinco escenarios
- tarjeta: escenarios
- duración: 16 s
- foco: Uno, => 1
- foco: Dos, => 2
- foco: Tres, => 3
- foco: Cuatro, => 4
- foco: Y cinco, => 5

> Veamos cinco escenarios. Uno, calcular la programación según las entregas. Dos, un cliente adelanta su pedido. Tres, contingencia: falla una inyectora. Cuatro, pedidos fijados a mano. Y cinco, menos cambios de referencia.

### 0-S05 · Arvantti DigitalTwin: un núcleo y siete módulos
- tarjeta: modulos
- duración: 45 s
- foco: Arvantti DigitalTwin => centro
- foco: Uno, Integrator => integrador
- foco: Dos, APS => aps
- foco: Tres, CoSimulation => cosimulacion
- foco: Cuatro, Fractal => fractal
- foco: Cinco, Control Center => control
- foco: Seis, DendroScada => dendro
- foco: Y siete, AI Assistant => ia

> Todo esto corre sobre Arvantti DigitalTwin, el núcleo: el gemelo digital 3D sobre el que funciona todo. A su alrededor se suman siete módulos. Uno, Integrator: integración con ERP, CRM, sistemas SCADA y otros. Dos, APS: programación y planificación de órdenes y recursos. Tres, CoSimulation: el cosimulador matemático, entrenable con las reglas de la empresa. Cuatro, Fractal: simulación robusta por escenarios y multiobjetivo. Cinco, Control Center: monitoreo y control conectado a su SCADA o al control de piso. Seis, DendroScada: hardware SCADA propio que conecta cualquier máquina o proceso y envía sus datos al Control Center. Y siete, AI Assistant, el cerebro empresarial: IA privada para conversar con el sistema en lenguaje natural. Empecemos por el primer escenario.

### 6-S01 · El ahorro potencial de Fractal
- imagen: tarjeta con las cifras de abajo (fondo oscuro, una fila por escenario)
- duración: 40 s

Cifras de la tarjeta, todas de las corridas de la demo:

| Escenario | Antes | Con el plan optimizado | Ahorro |
|---|---|---|---|
| 1 · Calcular (cosimulador y Fractal) | 90,3 % a tiempo, 793 h de máquina | 92,5 % a tiempo, 703 h | 2 pedidos tarde menos, 47 h de atraso menos, 90 h de máquina libres; carga máxima 71 % → 62 % |
| 2 · Cambio de fecha | rehacer el plan a mano | plan en 0,6 s | ningún pedido más atrasado, ningún molde que cambiar |
| 3 · Falla | 10 tarde, 295,5 h de atraso | 7 tarde, 182,3 h | 3 pedidos salvados, 113,2 h de atraso menos (90 min de montaje) |
| 4 · Pedidos fijados | 185,8 h, 66,1 % de ocupación | 182,3 h, 60,4 % | 3,5 h menos y 5,7 puntos de ocupación, con tres órdenes sin mover |
| 5 · Menos cambios | 30 cambios, 22,5 h | 12 cambios, 9 h | 18 cambios y 13,5 h de máquina por semana (60 %) |

> En resumen, esto es lo que ahorra optimizar con Fractal. El cosimulador cumple más entregas y libera noventa horas de máquina en la semana. Ante una falla, Fractal salva tres pedidos y quita ciento trece horas de atraso. Con compromisos firmados, organiza el resto sin moverlos. Y dedicando un color a cada máquina, recupera trece horas y media de producción cada semana. Multiplicadas por lo que cuesta una hora de máquina en la planta, esas horas son el ahorro en dinero. Fractal recomienda; la persona decide.

## 5. Montaje con HyperFrames

El montaje ya está armado en
[`video-production/ARVANTTI/ARV-W01-V001-demo-plasticos/`](../../video-production/ARVANTTI/ARV-W01-V001-demo-plasticos/README.md):
graba la demo a 1920×1080 (`grabar.cjs todos --video --hd`), genera la voz por capítulo con `pnpm video:voice`, la corta
en segmentos y renderiza con HyperFrames. Suma un capítulo de zoom del Gantt y versiones del APS. Lo de abajo describe
el criterio del montaje.

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
En el repo clonado, lee docs/demo-plasticos/VIDEO.md y los cinco guion.md de docs/demo-plasticos/.
Produce un video tutorial en español de unos 16 minutos, 1920x1080, con siete capítulos:
0 apertura, 1 calcular la programación, 2 cambio de fecha de un pedido, 3 contingencia, 4 pedidos fijados, 5 menos cambios, 6 cierre con el ahorro potencial de Fractal.

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
