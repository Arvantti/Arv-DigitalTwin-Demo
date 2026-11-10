---
title: Video tutorial de la demo de salsas
tags: [demo, salsas, video, guion, elevenlabs, hyperframes]
fecha: 2026-11-06
---

# Video tutorial de la demo de salsas

Mismo formato que el de plásticos (`docs/demo-plasticos/VIDEO.md`): horizontal 1920×1080, unos 15 minutos, voz con
ElevenLabs y montaje con HyperFrames en
[`video-production/ARVANTTI/ARV-W01-V002-demo-salsas/`](../../video-production/ARVANTTI/ARV-W01-V002-demo-salsas/README.md).
Lo nuevo es la apertura: un recorrido por el gemelo 3D que muestra los productos y sigue tres de ellos por sus equipos.

## 1. Estructura del video

| Capítulo | Contenido | Guion |
|---|---|---|
| 0 · Apertura | La planta, sus diez productos, el recorrido de tomate, mayonesa y mostaza, las cuatro reglas de los alimentos y la cartera | sección 4 de este documento |
| 1 · Calcular la programación | Del plan manual al del cosimulador | [guion](1-calcular-programacion/guion.md) |
| 2 · Un cliente adelanta su pedido | Fractal prueba tres respuestas | [guion](2-adelantar-pedido/guion.md) |
| 3 · Se cae la llenadora de mostaza | Falla en el emulador, replaneo y Fractal | [guion](3-falla-llenadora-mostaza/guion.md) |
| 4 · Optimizar la secuencia con Fractal | Campañas por día: menos CIP y merma | [guion](4-menos-cip/guion.md) |
| 5 · Cuánta merma vale la pena ahorrar | Agrupar más contra entregar a tiempo | [guion](5-merma-entregas/guion.md) |
| 6 · Cierre | Lo que ahorra optimizar | sección 4 de este documento |

Reglas: todo en "día N" (hoy es el día 9 a las 10:00), sin marcas reales, clientes y pedidos inventados, cifras tal como
salen en pantalla, y cada sigla (CIP, APS, SKU, Gantt, OEE) se explica en palabras simples la primera vez.

## 2. Material de pantalla

```bash
pnpm gallery                                                   # galería en http://localhost:5173
uv run uvicorn twin_emulator_api.main:app --port 8000          # el 3D lo necesita
NODE_PATH="$(pnpm root -g)" node tools/demo-video/grabar-salsas.cjs todos --video --hd
NODE_PATH="$(pnpm root -g)" node tools/demo-video/grabar-salsas.cjs 0 --hd --orbitas   # vuelos y recorridos del 3D
```

Las capturas quedan en `docs/demo-salsas/<capítulo>/capturas/`; videos, marcas y órbitas no van al repo.

## 3. Voz

Un audio por segmento con el texto de cada cita (`>`): los números van en palabras y las siglas se pronuncian como dice
`PRONUNCIA` en `armar.mjs` (BBQ, SKU, CIP, APS, OEE, doypack, sachet). Misma voz y ajustes que el video de plásticos.

## 4. Guion de apertura y cierre

### 0-S01 · La planta y su gemelo
- orbita: 0-apertura/orbitas/01-planta

> Esta es una planta de salsas y aderezos, y este es su gemelo digital. Cocina salsa de tomate, mayonesa y mostaza en tres líneas de proceso, y las empaca en seis llenadoras. Todo lo que se ve aquí se mueve según la programación de la planta.

### 0-S02 · Estos son los productos
- tarjeta: productos
- foco: Salsa de tomate en doypack => caliente
- foco: Mayonesa en tres tamaños => fria
- foco: Y mostaza => mostaza

> La planta fabrica diez productos. En la industria cada uno se llama SKU: cada presentación distinta que se vende. Salsa de tomate en doypack de mil mililitros y en sachet de doscientos cincuenta, BBQ y picante. Mayonesa en tres tamaños, mayonesa light y salsa rosada. Y mostaza. El doypack es la bolsa con pico; el sachet, el sobre pequeño.

### 0-S03 · El recorrido de la salsa de tomate
- ruta: 0-apertura/orbitas/03-tomate
- parada: estas tres marmitas => kettle-02 => Marmita
- parada: lo da la caldera => boiler-01 => Caldera
- parada: pasa por el pasteurizador => pasteurizer-01 => Pasteurizador
- parada: espera caliente en el pulmón => buffer-hot-01 => Pulmón caliente
- parada: La llenadora de doypack uno => filler-pouch-01 => Llenadora de doypack 1
- parada: el túnel de enfriamiento => cooling-tunnel-01 => Túnel de enfriamiento
- parada: a las cajas => pack-sauce-1000 => Encajado
- parada: a la bodega => rack-pt-02 => Bodega de producto terminado

> Sigamos tres de ellos por la planta. La salsa de tomate de mil mililitros se cocina en una de estas tres marmitas, ollas grandes con chaqueta de vapor, en tandas de dos mil kilos. El vapor lo da la caldera. Después pasa por el pasteurizador, que la calienta a noventa y cinco grados para que dure, y espera caliente en el pulmón: el tanque donde la salsa lista aguarda a la llenadora. La llenadora de doypack uno la empaca, el túnel de enfriamiento baja la temperatura de las bolsas, y de ahí van a las cajas y a la bodega.

### 0-S04 · El recorrido de la mayonesa
- ruta: 0-apertura/orbitas/04-mayonesa
- parada: el tanque de fase acuosa => tank-aqueous-01 => Tanque de fase acuosa
- parada: El emulsificador => emulsifier-01 => Emulsificador
- parada: el molino coloidal => colloid-mill-01 => Molino coloidal
- parada: Espera fría en su pulmón => buffer-cold-01 => Pulmón frío
- parada: la llenadora de sachet uno => filler-sachet-01 => Llenadora de sachet 1

> La mayonesa va por la línea fría. En el tanque de fase acuosa se mezclan el huevo, el agua y el vinagre. El emulsificador le incorpora el aceite al vacío, en tandas de mil quinientos kilos, y el molino coloidal la deja fina. Espera fría en su pulmón, y la llenadora de sachet uno la empaca en sobres de doscientos cincuenta mililitros.

### 0-S05 · El recorrido de la mostaza
- ruta: 0-apertura/orbitas/05-mostaza
- parada: se hidrata en su tanque => tank-mustard-01 => Tanque de mostaza
- parada: el molino de piedra => mustard-mill-01 => Molino de piedra
- parada: la llenadora de sachet tres => filler-sachet-03 => Llenadora de sachet 3
- parada: y la de mayonesa son multipropósito => filler-sachet-01 => Llenadoras multipropósito

> La mostaza se hidrata en su tanque, el molino de piedra la muele y la llenadora de sachet tres la empaca. Esa llenadora y la de mayonesa son multipropósito: cualquiera de las dos puede llenar mayonesa o mostaza. Pero entre una y otra hay que lavar, porque la mayonesa lleva huevo, que es un alérgeno.

### 0-S06 · Cuatro reglas propias de los alimentos
- tarjeta: reglas
- foco: Primero, el orden de recetas => recetas
- foco: Segundo, los alérgenos => alergenos
- foco: Tercero, el tiempo de espera => espera
- foco: Y cuarto, las tandas => tandas

> Programar esta planta tiene cuatro reglas que no existen en otras industrias. Primero, el orden de recetas: cada línea va de lo suave a lo fuerte, como tomate, BBQ y picante. Avanzar cuesta un cambio corto; devolverse exige un CIP completo de noventa minutos. CIP quiere decir limpieza en sitio: lavar tanques, tuberías y llenadoras sin desarmarlos. Segundo, los alérgenos: pasar de mayonesa a mostaza en la misma llenadora también exige ese lavado completo, con verificación. Tercero, el tiempo de espera: la salsa de tomate caliente aguanta cuatro horas en el pulmón; si nadie la llena a tiempo, se bota, y eso es merma. Y cuarto, las tandas: una marmita no se deja a medias de un día para otro.

### 0-S06b · Cada empresa, sus reglas
- tarjeta: destacado | CADA EMPRESA, SUS REGLAS | Se le enseñan al modelo antes de calcular | Tiempos de lavado; Alérgenos; Tandas; Cualquier particularidad
- foco: Cada empresa tiene sus propias reglas => banda
- foco: tiempos de lavado => c1
- foco: alérgenos, tandas => c2
- foco: tandas o cualquier => c3
- foco: cualquier particularidad => c4

> Estas cuatro reglas son las de esta planta de ejemplo. Cada empresa tiene sus propias reglas, y antes de calcular u optimizar se le enseñan al modelo: el cosimulador y el emulador se configuran con ellas, tiempos de lavado, alérgenos, tandas o cualquier particularidad de su operación.

### 0-S07 · Cómo se conecta todo
- tarjeta: partes
- foco: El emulador hace de planta real => emulador
- foco: El centro de control => control
- foco: El gemelo 3D => gemelo
- foco: Y el APS => aps

> El gemelo tiene cuatro partes conectadas. El emulador hace de planta real: cada equipo produce en tiempo real, y aquí se simulan las fallas. El centro de control recibe las señales de todos los equipos. El gemelo 3D muestra la planta en el pasado, el presente y el futuro programado. Y el APS, el sistema de programación de la producción, decide qué se hace, en qué equipo y a qué hora.

### 0-S08 · La cartera de pedidos
- imagen: 0-apertura/capturas/08-pedidos.png
- foco: ciento veintiocho pedidos => pedidos en la cartera => 128 pedidos
- foco: su fecha de entrega => ENTREGA => Fecha de entrega
- foco: Hoy es el día nueve => AHORA · día 9 · mié 4 nov · 10:00 => Hoy: día 9, 10:00

> Todo empieza con los pedidos. Esta es la cartera: ciento veintiocho pedidos de clientes inventados para los diez productos, cada uno con su cantidad, su fecha de entrega y su importancia. Las fechas se cuentan en días desde el arranque de la programación. Hoy es el día nueve, a las diez de la mañana: lo anterior ya pasó y no se mueve.

### 0-S09 · Cinco escenarios
- tarjeta: escenarios
- foco: Uno, => 1
- foco: Dos, => 2
- foco: Tres, => 3
- foco: Cuatro, => 4
- foco: Y cinco, => 5

> Veamos cinco escenarios. Uno, calcular la programación. Dos, un cliente adelanta su pedido. Tres, se cae la llenadora de mostaza. Cuatro, optimizar la secuencia de llenado para lavar menos, con Fractal, nuestro simulador de escenarios. Y cinco, cuánta merma vale la pena ahorrar.

### 0-S10 · Arvantti DigitalTwin
- tarjeta: modulos
- foco: Arvantti DigitalTwin => centro
- foco: el APS para programar => aps
- foco: el cosimulador => cosimulacion
- foco: Fractal para comparar => fractal
- foco: y el centro de control => control

> Todo esto corre sobre Arvantti DigitalTwin, el gemelo 3D, con sus módulos: el APS para programar, el cosimulador que calcula la programación, Fractal para comparar escenarios y el centro de control. El Integrator, DendroScada y el asistente de IA no se usan en este video, porque la demostración se centra en la optimización. Los veremos en otro video, con el hardware físico. Empecemos.

### 6-S01 · Lo que ahorra optimizar
- foco: El cosimulador salva seis pedidos => r0
- foco: Ante un pedido urgente => r1
- foco: con la llenadora de mostaza caída => r2
- foco: Y Fractal, organizando la planta => r3
- foco: Fractal recomienda => r4

| Escenario | Antes | Con el gemelo | Ahorro |
|---|---|---|---|
| 1 · Calcular | 9 tarde, 244 h de atraso, 87 h de CIP, 8.874 kg de merma | 3 tarde, 84 h, 84 h de CIP, 5.722 kg | 6 pedidos salvados, 160 h de atraso y 3,2 t de merma menos |
| 2 · Adelantar un pedido | rehacer el plan a mano | Fractal en menos de un segundo | a tiempo, sin atrasar a nadie |
| 3 · Falla de la llenadora de mostaza | 14 tarde, 498 h | 3 tarde, 84 h | 11 pedidos salvados, 414 h de atraso menos |
| 4 · Lavar menos | 83,8 h de CIP, 5.722 kg | 78,2 h, 4.395 kg | 5,6 h de CIP y 1,3 t de merma menos, mismas entregas |
| 5 · Merma contra entregas | dos opciones | la persona decide | el precio de cada kilo ahorrado, a la vista |

> En resumen. El cosimulador salva seis pedidos y deja de botar más de tres toneladas de salsa. Ante un pedido urgente o una falla, replanea en menos de un segundo; con la llenadora de mostaza caída, salva once pedidos. Y Fractal, organizando la planta en campañas por día, quita casi seis horas de lavado y otra tonelada de merma sin atrasar a nadie. Fractal recomienda; la persona decide.
