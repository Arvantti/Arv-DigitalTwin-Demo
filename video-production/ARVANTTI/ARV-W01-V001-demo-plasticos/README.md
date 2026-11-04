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

# 2. Voz con ElevenLabs: un audio por capítulo (8 envíos, cada uno pide escribir ENVIAR)
export ELEVENLABS_API_KEY='…'   # solo en tu shell o gestor de secretos, nunca en archivos
export ELEVENLABS_VOICE_ID='…'
for c in $P/capitulos/*/; do pnpm video:voice --project "$c"; done

# 3. Cortar cada capítulo en segmentos, componer y renderizar
node $P/armar.mjs alinear
node $P/armar.mjs componer
node $P/armar.mjs render v002        # deja $P/out/demo-plasticos-v002.mp4
```

`alinear` corta cada `capitulos/<capítulo>/assets/audio/voiceover.mp3` en los silencios entre párrafos (un párrafo por
segmento) y guarda los cortes en `capitulos/<capítulo>/cortes-detectados.json`. Si un corte cae mal, copia ese archivo
como `cortes.json` en la misma carpeta, corrige los segundos y vuelve a correr `alinear` y `componer`.

Sin ElevenLabs, `node $P/armar.mjs voz-temporal` genera una voz local de prueba (Kokoro, con `hyperframes tts`; necesita
`pip install kokoro-onnx soundfile` o `HYPERFRAMES_PYTHON` apuntando a un entorno que los tenga). El video sale marcado
`TEMP_AUDIO` y no es entrega final. Si existen los dos, `componer` usa el audio de ElevenLabs.

## Qué no va al repo

Grabaciones, audios, clips y renders (`.gitignore` de esta carpeta). Se regeneran con los pasos de arriba.
