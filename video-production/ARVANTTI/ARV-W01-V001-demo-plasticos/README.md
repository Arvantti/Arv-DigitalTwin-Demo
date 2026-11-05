# ARV-W01-V001 · Video de la demo de plásticos (horizontal 1920×1080)

Video tutorial de unos 17 minutos con narración: apertura, los cinco escenarios de la demo, el zoom del Gantt y las
versiones del APS, y el cierre con el ahorro potencial de Fractal. Cada segmento muestra primero el tramo real del
recorrido grabado en la galería (clics, cálculo, carga de pantallas) y luego la captura del resultado con un zoom suave;
abajo van los subtítulos con el mismo texto de la voz.

- Guion: el de cada escenario en `docs/demo-plasticos/<escenario>/guion.md`, la apertura y el cierre de
  `docs/demo-plasticos/VIDEO.md` (sección 4) y `guion-versiones.md` (capítulo 6). `segmentos.json` y
  `capitulos/<capítulo>/script.md` se generan de ahí con `preparar`; no se editan a mano.
- Composición HyperFrames: `index.html`, generada por `armar.mjs componer`.
- Brief, fuentes, claims y QA: `brief.md`, `sources.md`, `claims.json`, `QA.md`.

## Producirlo en tu computador

Desde la raíz del repo (pnpm, Node 22, ffmpeg):

```bash
pnpm install
P=video-production/ARVANTTI/ARV-W01-V001-demo-plasticos

# 1. Grabar la demo a 1920×1080 (galería y emulador en otras terminales)
pnpm gallery
uv sync && uv run uvicorn twin_emulator_api.main:app --port 8000
pnpm add -g playwright@1.63.0 && pnpm dlx playwright@1.63.0 install chromium   # una vez
DEMO_OUT="$PWD/$P/assets/grabacion" NODE_PATH="$(pnpm root -g)" node tools/demo-video/grabar.cjs todos --video --hd

# 2. Voz y música con ElevenLabs (las claves solo en el entorno, nunca en archivos)
export ELEVENLABS_API_KEY='…'
export ELEVENLABS_VOICE_ID='…'
node $P/armar.mjs preparar          # guiones -> segmentos.json
node $P/armar.mjs voz               # muestra qué segmentos cambiaron y cuántos caracteres se enviarían
node $P/armar.mjs voz --enviar      # voz por segmento con el tiempo de cada letra (solo lo que cambió)
node $P/armar.mjs musica --enviar   # música épica, una pista por párrafo de musica-prompt.txt

# 3. Componer y renderizar
node $P/armar.mjs componer          # CAPITULOS=0,1 arma solo esos capítulos (vista previa)
node $P/armar.mjs render v003       # deja $P/out/demo-plasticos-v003.mp4
```

Cómo se arma cada segmento:

- **Tramo grabado sin cargas de página.** `grabar.cjs` deja en `marcas.json` cada captura, cada clic (con el recuadro del
  botón), cada carga de página y los textos visibles de cada captura con su recuadro. El tramo de video que lleva a una
  captura empieza cuando la página terminó de cargar, así no aparecen pantallas en blanco ni otras pestañas de paso.
- **Cursor y zoom en cada clic.** En la grabación se ve el cursor ir al botón y un pulso al hacer clic; el montaje acerca
  la cámara al botón justo antes del clic.
- **Cada dato que dice la voz se ve.** Las líneas `- foco: <frase de la voz> => <texto en pantalla> [=> rótulo]` del
  guion llevan la cámara al texto en la captura (búscalo con `node armar.mjs textos <carpeta>/capturas/<png> [filtro]`),
  lo enmarcan y muestran el rótulo, en el segundo exacto en que la voz dice la frase. `a + b` une dos textos; `@x,y,w,h`
  es un recuadro a mano; `—` muestra solo el rótulo (dato que no está en esa pantalla).
- **Tarjetas animadas.** `- tarjeta: escenarios | modulos | fuentes | cosimulador | …` con focos cuyo objetivo es la
  clave de cada elemento (se enciende cuando la voz lo nombra).
- **Música.** Las pistas se encadenan con fundidos y bajan solas cuando habla la voz.

Sin ElevenLabs, `node $P/armar.mjs voz-temporal` genera una voz local de prueba (Kokoro); el video sale marcado
`TEMP_AUDIO` y no es entrega final.

## Qué no va al repo

Grabaciones, audios, clips y renders (`.gitignore` de esta carpeta). Se regeneran con los pasos de arriba.
