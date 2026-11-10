# ARV-W03-V002 · Arvantti Harness para C-Level (vertical 1080×1920, ~98 s)

Segundo video de Harness, después del de capacidades (ARV-W03-V001). Más corporativo, sin jerga técnica: beneficios
para la alta dirección con contador "1 de 5" (control, seguridad, eficiencia, conocimiento, dirección).

- Guion aprobado por Andy el 2026-11-10 (Claude Doc "Video vertical C-Level: beneficios de Arvantti Harness").
- No menciona la licencia gratuita: el modelo de licencia aún no está decidido.
- El cierre es distinto al del video de capacidades: pregunta al ejecutivo + tarjeta "Diagnóstico de gobernanza de IA".
- "Harness" se envía tal cual a la voz ("Járnes" a veces sale "yarnes"); revisa cada escena con speech-to-text
  (ElevenLabs scribe_v1) antes de renderizar.
- Reutiliza la música original del video de capacidades (`assets/clips/musica-epica.mp3`, se copia desde V001).

## Producirlo

```bash
P=video-production/ARVANTTI/ARV-W03-V002-harness-clevel
cp video-production/ARVANTTI/ARV-W03-V001-harness-capacidades/assets/clips/{marca.png,musica-epica.mp3} $P/assets/clips/
node $P/armar.mjs voz --enviar
node $P/armar.mjs componer
QUALITY=high HF_ARGS="--crf 10" node $P/armar.mjs render v001
```
