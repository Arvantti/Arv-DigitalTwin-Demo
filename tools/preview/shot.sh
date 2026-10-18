#!/usr/bin/env bash
# Captura una imagen de un equipo de la librería con Chromium sin interfaz.
#
#   tools/preview/shot.sh <tipo> [preset] [salida.png] [frame-json] [params-json] [lighting]
#
# Requiere la galería compilada y servida (pnpm gallery:build && pnpm --filter @twin/gallery preview),
# o define GALLERY_URL. Sirve para que una persona o una IA compare el modelo con fotos reales.
set -euo pipefail
TYPE="${1:?tipo de equipo}"
PRESET="${2:-}"
OUT="${3:-preview-$TYPE.png}"
FRAME="${4:-}"
PARAMS="${5:-}"
LIGHTING="${6:-night}"
URL_BASE="${GALLERY_URL:-http://localhost:4173}"
CHROME="${CHROME:-$(ls -d /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
CHROME="${CHROME:-$(command -v chromium || command -v google-chrome)}"
enc() { python3 -c 'import sys,urllib.parse; print(urllib.parse.quote(sys.argv[1]))' "$1"; }
Q="type=$(enc "$TYPE")&shot=1&lighting=$LIGHTING"
[ -n "$PRESET" ] && Q="$Q&preset=$(enc "$PRESET")"
[ -n "$FRAME" ] && Q="$Q&frame=$(enc "$FRAME")"
[ -n "$PARAMS" ] && Q="$Q&params=$(enc "$PARAMS")"
"$CHROME" --headless --no-sandbox --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist \
  --hide-scrollbars --window-size=1600,987 --virtual-time-budget=15000 \
  --screenshot="$OUT" "$URL_BASE/equipos.html?$Q" 2>/dev/null
# el viewport de Chromium sin interfaz es más bajo que la ventana: recorta la franja vacía
if command -v convert >/dev/null; then convert "$OUT" -crop 1600x900+0+0 +repage "$OUT"; fi
echo "$OUT"
