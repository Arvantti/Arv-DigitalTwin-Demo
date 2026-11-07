# QA · ARV-W01-V002-demo-salsas

## Preparación (2026-11-06)

- Grabación de pantallas a 1920×1080 con video y marcas por capítulo (`tools/demo-video/grabar-salsas.cjs todos --video --hd`).
- Vuelos del 3D cuadro a cuadro: vista de planta y recorridos de tres productos (salsa de tomate, mayonesa, mostaza),
  play de la programación y falla de la llenadora de sachets 03.
- `componer` sin voz (duración estimada): sin avisos de focos salvo un recuadro que toca el texto vecino en 2-S01.
- Pendiente: aprobación del guion, voz de ElevenLabs, música, vista previa y render final.

## Aprobación humana

```text
[ ] El claim es correcto.
[ ] La explicación se entiende sin contexto adicional.
[ ] La locución y el montaje están sincronizados.
[ ] La marca se usa correctamente.
[ ] El audio es aceptable.
[ ] La versión está lista para el canal indicado.
```

## v001 (2026-11-07)
- Duración 701,2 s, 1920×1080 h264 + aac.
- Hoja de contactos cada 20 s: todos los capítulos en orden (0, 0b, 1–5, cierre), sin cuadros vacíos.
- Sin tramos negros (blackdetect) ni destellos blancos (0 cuadros con luminancia media > 180).
- Audio: volumen medio −18,5 dB, pico −2,6 dB.
- Pendiente: visto bueno humano antes del render final.
