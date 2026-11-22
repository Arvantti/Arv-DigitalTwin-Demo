#!/usr/bin/env bash
# Compone un episodio en ambos formatos y saca hojas de contacto (un cuadro al final de cada escena) en $2.
set -e
e=$1; SN=${2:?carpeta de salida}
mkdir -p "$SN/$e"
EP=$e node armar.mjs componer >/dev/null && FORMATO=vertical EP=$e node armar.mjs componer >/dev/null
TS=$(python3 -c "import json;print(' '.join(str(round(x['voiceAt']+x['voz']*0.9,1)) for x in json.load(open('episodios/$e/tiempos.json')) if x['id'] not in ('recap','firma','siguiente')))")
node snap.cjs episodios/$e "$SN/$e/h" $TS
node snap.cjs episodios/$e/vertical "$SN/$e/v" $TS
cd "$SN/$e" && python3 -I "$SN/../sheet.py" "$SN/$e-h.png" 4 480 $(ls -v h-*.png) && python3 -I "$SN/../sheet.py" "$SN/$e-v.png" 8 240 $(ls -v v-*.png)
echo "$e $TS"
