#!/usr/bin/env bash
# Renderiza los episodios indicados (o todos) en horizontal y vertical, uno por uno.
cd "$(dirname "$0")/.."
V=${V:-v001}
EPS=${*:-01-coding 02-organiza 03-terminales 04-recuerda 05-controla 06-protege 07-concilio 08-flujos 09-rinde-cuentas}
for e in $EPS; do
  for f in horizontal vertical; do
    out=out/$e-$f-$V.mp4
    [ -s "$out" ] && { echo "ya existe $out"; continue; }
    if [ $f = vertical ]; then FORMATO=vertical EP=$e node armar.mjs componer >/dev/null; else EP=$e node armar.mjs componer >/dev/null; fi
    s=$(date +%s)
    if [ $f = vertical ]; then FORMATO=vertical EP=$e node armar.mjs render $V > out/log-$e-$f.txt 2>&1; else EP=$e node armar.mjs render $V > out/log-$e-$f.txt 2>&1; fi
    echo "$e $f: $? en $(( $(date +%s) - s )) s"
  done
done
