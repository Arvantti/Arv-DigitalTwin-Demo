---
title: Serie de videos · El gemelo digital, parte por parte
tags: [videos, redes, serie, gemelo-digital, plasticos, hyperframes, elevenlabs]
fecha: 2026-11-02
---

# Serie · El gemelo digital, parte por parte

Seis videos verticales de alrededor de 1 minuto que cuentan por qué un gemelo digital es pertinente y cómo se construyó el
de la planta de plásticos. Hilo de toda la serie: la falla de la inyectora 21. La parte 1 promete contar cómo se resolvió
en menos de un minuto, cada parte muestra una pieza y la parte 6 cierra la historia.

| Parte | Archivo | Título | Una idea | Una cifra |
|---|---|---|---|---|
| 1 | [parte-1-por-que.md](parte-1-por-que.md) | Por qué un gemelo digital | Decidir sin ver la planta cuesta horas | menos de 1 minuto |
| 2 | [parte-2-planta-virtual.md](parte-2-planta-virtual.md) | La planta virtual | Un emulador con un PLC virtual por máquina | 12 inyectoras |
| 3 | [parte-3-ver-en-vivo.md](parte-3-ver-en-vivo.md) | Ver la planta en vivo | Centro de control y gemelo 3D | pasado, presente y futuro |
| 4 | [parte-4-programar-mejor.md](parte-4-programar-mejor.md) | Programar mejor | El cosimulador calcula un plan mejor que el manual | 90,3 % → 92,5 % a tiempo |
| 5 | [parte-5-probar-el-futuro.md](parte-5-probar-el-futuro.md) | Probar el futuro | El simulador de escenarios responde antes de tocar la planta | menos de 1 segundo |
| 6 | [parte-6-la-falla.md](parte-6-la-falla.md) | La falla, de principio a fin | De la alarma al plan nuevo | 9 → 7 pedidos tarde |

El prompt para producir los videos con el agente local está en [PROMPT.md](PROMPT.md).

## Marca y canal

- Se publica en los canales de **AndyOpenDev**, con la voz aprobada de AndyOpenDev y narración en primera persona.
- Logo de AndyOpenDev pequeño en una esquina durante todo el video.
- Arvantti es el producto: aparece en la tarjeta final con su logo y la firma **"Arvantti · Digital Twin Engineering"**.
- El simulador de escenarios se describe en la voz; el nombre **Fractal** aparece solo como texto en pantalla (parte 5).

## Reglas de cada video

1. Arranca con la etiqueta "Parte N" en pantalla. Desde la parte 2, el primer segmento es un recordatorio corto de lo anterior.
2. Una sola idea y una sola cifra protagonista.
3. Entre 120 y 150 palabras de voz: unos 55 a 65 s a velocidad 1.
4. Termina con la tarjeta "Continúa en la parte N+1: <título>" (en la parte 6, "Fin de la serie"), logo de AndyOpenDev y
   firma de Arvantti.
5. Cifras tal como salen de los guiones de `docs/demo-plasticos/`. Sin fechas de calendario (todo es "día N"; hoy es el
   día 9), sin marcas ni clientes reales.

## Formato

- Vertical 1080×1920, 30 fps. Zona segura: x 96–984, y 220–1325; banda de subtítulos y 1180–1310.
- Las capturas son horizontales (1600×900): cada segmento muestra un recorte de la zona de `en pantalla`, con zoom suave,
  sobre el fondo #0e1430 (el mismo de las presentaciones).
- "Mapa" = recorte de `docs/demo-plasticos/arquitectura/arquitectura-plasticos.png` con el bloque indicado iluminado y el
  resto atenuado. Bloques: 1 emulador, 2 centro de control, 3 gemelo 3D, 4 APS, 5 cosimulador, 6 Fractal.
- Audio: voz y efectos discretos, sin música. Subtítulos con el mismo texto de la voz.
- Portada de Instagram: 1080×1920 con el título dentro del área central 1080×1350, para que también se vea bien recortada
  en el perfil.

## Forma de cada parte

Cada `parte-N-*.md` tiene tres secciones:

- **Guion:** segmentos con el mismo formato de `docs/demo-plasticos/` (`imagen`, `duración`, `en pantalla`, `texto`) y la
  voz en las líneas que empiezan con `>`.
- **Copy de publicación:** texto para Instagram, TikTok, Shorts y LinkedIn.
- **Portada:** prompt para generar la imagen de fondo y el texto que se pone encima.
