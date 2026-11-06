# ARV-W01-V002 · Video de la demo de salsas (horizontal 1920×1080)

Video tutorial de unos 12 minutos con narración, en el mismo estilo que el de plásticos
([ARV-W01-V001](../ARV-W01-V001-demo-plasticos/README.md)): apertura, cinco escenarios y cierre. La apertura recorre el
gemelo 3D: los diez productos, y tomate, mayonesa y mostaza siguiendo cada uno sus equipos; luego las cuatro reglas de
los alimentos, cómo se conecta el gemelo y la cartera de pedidos.

- Guion: `docs/demo-salsas/VIDEO.md` (apertura y cierre, sección 4) y `docs/demo-salsas/<capítulo>/guion.md`.
  `segmentos.json` y `capitulos/<capítulo>/script.md` se generan con `preparar`; no se editan a mano.
- Composición HyperFrames: `index.html`, generada por `armar.mjs componer`.
- Brief, fuentes y QA: `brief.md`, `sources.md`, `QA.md`.

## Producirlo

Desde la raíz del repo (pnpm, Node 22, ffmpeg):

```bash
P=video-production/ARVANTTI/ARV-W01-V002-demo-salsas

# 1. Grabar a 1920×1080 (galería y emulador en otras terminales)
pnpm gallery
uv run uvicorn twin_emulator_api.main:app --port 8000
DEMO_OUT="$PWD/$P/assets/grabacion" NODE_PATH="$(pnpm root -g)" node tools/demo-video/grabar-salsas.cjs todos --video --hd
# Vuelos y recorridos del 3D (cuadro a cuadro, ~1 cuadro/s sin GPU): se graban aparte y se copian solo las órbitas.
for n in 0 1 3; do DEMO_OUT=/tmp/orb NODE_PATH="$(pnpm root -g)" node tools/demo-video/grabar-salsas.cjs $n --hd --orbitas; done
for d in /tmp/orb/*/orbitas; do cp -r "$d" "$P/assets/grabacion/$(basename "$(dirname "$d")")/"; done

# 2. Voz y música con ElevenLabs (las claves solo en el entorno, nunca en archivos)
node $P/armar.mjs preparar
node $P/armar.mjs voz               # muestra cuántos caracteres se enviarían
node $P/armar.mjs voz --enviar
node $P/armar.mjs musica --enviar

# 3. Componer y renderizar
node $P/armar.mjs componer          # CAPITULOS=0,1 arma solo esos capítulos
node $P/armar.mjs render v001       # deja $P/out/demo-salsas-v001.mp4
```

Lo propio de este video, además de lo que hace el montaje de plásticos (tramo grabado sin cargas de página, zoom a cada
clic, recuadro en cada dato que dice la voz):

- **Recorridos de producto.** `- ruta: 0-apertura/orbitas/<nombre>` con una línea `- parada: <frase> => <equipo> =>
  <rótulo>` por equipo. `grabar-salsas.cjs` vuela de un equipo al siguiente y lo resalta; `ruta.json` dice en qué cuadro
  llega a cada uno, y el montaje estira cada tramo para que la cámara llegue justo cuando la voz lo nombra, con el
  rótulo del equipo abajo a la izquierda.
- **Tarjetas nuevas.** `productos` (los diez SKU por familia), `reglas` (orden de recetas, alérgenos, tiempo de espera y
  tandas), `puntaje` (el de Fractal, de `aps/aps.yaml`) y `partes` (emulador, centro de control, 3D y APS).
- **Pronunciación.** BBQ, SKU, CIP, APS, OEE, Gantt, doypack y sachet se le escriben a la voz como se dicen
  (`PRONUNCIA`); el subtítulo queda igual.

Grabaciones, audios, clips y renders no van al repo (`.gitignore`).
