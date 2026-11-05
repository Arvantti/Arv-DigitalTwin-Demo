# ARV-W02-V001 · Video de lanzamiento de Arvantti Digital Twin (1920×1080, ~2 min)

Video comercial corto, estilo keynote: una idea por toma, frases cortas, tomas limpias del producto con movimiento
(dispositivo en perspectiva, cortinas de luz, empujes de cámara, textos que entran con desenfoque) y la estela de luz
de la marca al abrir y cerrar. Recorre APS con Gantt, cosimulador, gemelo 3D, centro de control, Fractal, Asistente IA
y conexiones, y cierra con el heptágono (el núcleo Arvantti Digital Twin y sus siete módulos, sin precios y sin cobro
por usuario) y la firma "Decide antes de que pase".

- Guion y storyboard aprobados por Andy el 2026-11-04 (documento del proyecto "Video de lanzamiento: Arvantti Digital Twin").
- Texto de la voz: `escenas/<escena>/script.md` (uno por escena, 10 en total).
- Composición: `plantilla.html` (estilos) + `armar.mjs componer` → `index.html` (no se edita a mano).
- Tomas: `tomas.cjs` (capturas 3D con luz de noche, lapso del play, pantallas del APS, centro de control y Fractal).

## Producirlo

Desde la raíz del repo (pnpm, Node 22, ffmpeg, Python con Pillow):

```bash
P=video-production/ARVANTTI/ARV-W02-V001-lanzamiento
pnpm gallery                                                    # terminal 1
uv run uvicorn twin_emulator_api.main:app --port 8000           # terminal 2
node $P/tomas.cjs todo                                          # ~40 min en la nube (el lapso es lo más lento)
node $P/armar.mjs preparar                                      # lapso.mp4, clip del Gantt, marca, música de respaldo

node $P/armar.mjs musica --enviar                               # música épica con ElevenLabs Music (musica-prompt.txt)

# Voz con ElevenLabs, con tiempos por carácter: solo envía las escenas cuyo texto cambió. Claves solo en el entorno.
node $P/armar.mjs voz                                           # muestra qué se enviaría
node $P/armar.mjs voz --enviar

node $P/armar.mjs componer                                      # mide la voz y escribe index.html
node $P/armar.mjs render v001                                   # deja $P/out/lanzamiento-v001.mp4
```

Sin voz, `componer` estima los tiempos (2,5 palabras por segundo) y marca el video "SIN VOZ · TIEMPOS ESTIMADOS".

## Notas

- Música: pista épica original generada con ElevenLabs Music (`musica-prompt.txt`); `componer` la baja sola cuando
  habla la voz (sidechain). Sin ella usa una música sintetizada con ffmpeg. Efectos de sonido de
  `assets/shared/core/sfx` (créditos en esa carpeta).
- El video es genérico para cualquier planta (pedido de Andy, 2026-11-04): el texto no habla de moldes ni inyectoras y
  el gemelo muestra plásticos, salsas, confecciones y cajas.
- El Asistente IA y los conectores todavía no tienen pantalla en la demo: se muestran como maqueta animada y diagrama.
- No se muestran precios (decisión de Andy, 2026-11-04).
- v002 (2026-11-05): la escena 9 dejó de mostrar los tres planes y los 10 usuarios; ahora explica el heptágono (núcleo y
  siete módulos, que se encienden al nombrarlos). Los rótulos de las escenas usan los nombres de los módulos
  (APS · CoSimulation, Control Center, AI Assistant, Integrator · DendroScada). La voz lee "Integrator" en inglés
  (`PRONUNCIA` en `armar.mjs`) y `componer` usa los tiempos por carácter de ElevenLabs para sincronizar cada palabra.
- Grabaciones, audios y renders no van al repo (`.gitignore`).
