# ARV-W03-V001 · Video de Arvantti Harness (1920×1080, ~1:46)

Video comercial horizontal, estilo keynote como el lanzamiento (ARV-W02-V001), basado en la presentación para
directivos de Arvantti Harness®. Recorre: la pregunta (¿quién controla la IA?), arnés de arneses (cualquier IA),
creación de agentes, conversación por voz con el coordinador de agentes y el coordinador de hilos, seguridad
(guardianes, hooks y aprobación humana), cerebro empresarial, log de auditoría con ISO/IEC 42001 y cierre con la firma
"La IA bajo su gobierno."

- Guion aprobado por Andy el 2026-11-09 (respondió ENVIAR). Texto de la voz: `escenas/<escena>/script.md` (9 escenas).
- Composición: `plantilla.html` (estilos) + `armar.mjs componer` → `index.html` (no se edita a mano).
- Imágenes: capturas del Shell V3 de la presentación (carpeta del proyecto `harness-clevel/`). No van al repo; `preparar`
  las copia a `assets/tomas/` (otra ruta con `HARNESS_CAPTURAS=...`). El resto (orbe de voz, coordinadores, guardián,
  grafo del cerebro, comprobante) es animación propia.

## Producirlo

Desde esta carpeta (Node 22, ffmpeg, Python con Pillow):

```bash
node armar.mjs preparar             # capturas y marca
node armar.mjs voz                  # muestra qué se enviaría a ElevenLabs
node armar.mjs voz --enviar         # solo escenas nuevas o cambiadas; claves solo en el entorno
node armar.mjs musica --enviar      # música épica (musica-prompt.txt) con ElevenLabs Music
node armar.mjs componer             # mide la voz y escribe index.html
node armar.mjs render v001          # deja out/harness-v001.mp4
```

## Notas

- Pronunciación (`PRONUNCIA` en `armar.mjs`): "Harness" se envía como "Jarnes", "hooks" como "juks" e "ISO 42001" en
  palabras. En pantalla dice ISO/IEC 42001 y "Evidencia lista para la certificación" (la certificación la otorga un
  organismo certificador; no se dice "certificado").
- Sin rótulos de "en desarrollo" ni cifras de ahorro (pedido de Andy, 2026-11-09). Los zooms de las capturas evitan
  las etiquetas de estado del mockup.
- Voz, música, capturas y renders no van al repo (`.gitignore`).
