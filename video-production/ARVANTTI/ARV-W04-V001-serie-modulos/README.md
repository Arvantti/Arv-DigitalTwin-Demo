# ARV-W04-V001 · Serie de videos verticales por módulo (1080×1920, 60 a 90 s)

Un video corto por cada pieza de Arvantti (núcleo + 7 módulos + un especial de la red de bombeo) para LinkedIn,
Reels, Shorts, TikTok y WhatsApp. Guiones, ganchos y calendario aprobados por Andy el 2026-11-08 en el documento
"Estrategia de videos verticales: 8 módulos Arvantti" (https://claude.ai/artifact/7KxecMhrfEyhpARHHejrsz).

Reglas de la serie:

- El gemelo digital 3D aparece desde el primer cuadro y se nombra en el gancho.
- Bloques fijos: gancho, dolor en cuatro industrias (manufactura, logística, procesos y servicios con procesos),
  solución, heptágono con el módulo encendido y cierre con llamado a la acción y "Decide antes de que pase".
- Subtítulos quemados, con la palabra que suena resaltada; cada sigla se explica en la voz.
- Cuando se habla de CoSimulation o Fractal, la voz explica que las reglas de la empresa se enseñan antes de calcular.
- Sin precios; el caso de la red de bombeo no nombra al acueducto ni a ningún cliente.

## Estructura

- `videos/<id>/video.json`: textos de voz por escena, frases de las industrias, cortes y llamado a la acción.
- `plantilla.tpl` + `armar.mjs componer` → `index.html` (se genera por video, no se edita a mano).
- `tomas.cjs`: 3D en vertical (vuelo de cámara, lapso del play, una planta por industria) y pantallas de la interfaz.
- `musica-prompt.txt`: una sola pista de ElevenLabs Music para toda la serie; cada video la recorta y la baja bajo la voz.

## Producir

```bash
P=video-production/ARVANTTI/ARV-W04-V001-serie-modulos
pnpm gallery                                                    # terminal 1
uv run uvicorn twin_emulator_api.main:app --port 8000           # terminal 2
node $P/tomas.cjs todo                                          # ~25 min en la nube
node $P/armar.mjs preparar
node $P/armar.mjs musica --enviar                               # una vez para la serie
VIDEO=01-nucleo node $P/armar.mjs voz --enviar                  # solo envía las escenas que cambiaron
VIDEO=01-nucleo node $P/armar.mjs componer
VIDEO=01-nucleo node $P/armar.mjs render v001                   # out/serie-01-nucleo-v001.mp4
```

Grabaciones, audios y renders no van al repo (`.gitignore`).
