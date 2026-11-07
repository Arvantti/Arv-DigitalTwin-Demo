# ARV-W03-V001 · Capacidades de Arvantti Harness (vertical 1080×1920, ~3 min 17 s)

Video explicativo (no demo) para presentar Arvantti Harness® en junta directiva: motion graphics, sin pantallas del
producto. Ocho ideas con contador "1 de 8": controla, protege, gobierna, planea, crea, conoce, dirige y trabaja en equipo.

- Guion aprobado por Andy el 2026-11-07 (Claude Doc "Video vertical: capacidades de Arvantti Harness").
- Texto de la voz: `escenas/<escena>/script.md` (12 escenas). `PRONUNCIA` en `armar.mjs` corrige Harness, RAG,
  GraphRAG, SDD, hooks, Claude Code, Codex y OpenCode.
- Composición: `plantilla.html` (estilos, nativa vertical) + `armar.mjs componer` → `index.html` (no se edita a mano).
- Música original con ElevenLabs Music (`musica-prompt.txt`); sin ella usa la música sintetizada de `preparar`.

## Producirlo

```bash
P=video-production/ARVANTTI/ARV-W03-V001-harness-capacidades
node $P/armar.mjs preparar               # marca del logo y música de respaldo
node $P/armar.mjs voz                    # muestra qué se enviaría a ElevenLabs
node $P/armar.mjs voz --enviar           # voz con tiempos por carácter (claves solo en el entorno)
node $P/armar.mjs musica --enviar        # música original
node $P/armar.mjs componer               # escribe index.html con los tiempos reales
QUALITY=high node $P/armar.mjs render v001   # deja $P/out/harness-capacidades-v001.mp4
```

Grabaciones, audios y renders no van al repo (`.gitignore`).
