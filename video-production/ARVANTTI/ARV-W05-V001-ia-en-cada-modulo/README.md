# ARV-W05-V001 · Arvantti Digital Twin: la IA en cada módulo (vertical 1080×1920 y horizontal 1920×1080, ~2 min 14 s)

La IA no es un módulo aparte: el video recorre el núcleo y los siete módulos del gemelo y muestra qué hace la IA en cada uno.
Guion aprobado por Andy el 2026-11-22: https://claude.ai/artifact/LBpSthbSNk3eNS3EBRr4P6

## Producir

```bash
pnpm gallery                                                    # terminal 1
uv run uvicorn twin_emulator_api.main:app --port 8000           # terminal 2
P=video-production/ARVANTTI/ARV-W05-V001-ia-en-cada-modulo
VUELO_N=24 node $P/tomas.cjs todo     # 3D en los dos formatos y pantallas (lento en la nube: ~15-35 s por cuadro)
node $P/voz.mjs --enviar              # voz por escena (ElevenLabs); --revisar la transcribe con Scribe
node $P/armar.mjs preparar            # vuelo interpolado, marca y música de respaldo
FMT=v node $P/armar.mjs componer && FMT=v node $P/armar.mjs render v001
FMT=h node $P/armar.mjs componer && FMT=h node $P/armar.mjs render v001
```

La música (ElevenLabs Music, prompt en `musica-prompt.txt`) va en `assets/clips/musica-serie.mp3`. Grabaciones, audios y renders no van al repo.
