# ARV-W05-V001 · Serie Arvantti OS Enterprise (7 videos, horizontal 1920×1080 y vertical 1080×1920)

Serie para directivos sobre Arvantti OS, «el sistema operativo empresarial para la IA». Guiones aprobados por Andy el
2026-11-16 en el documento «Serie Arvantti OS Enterprise · Guiones» (https://claude.ai/artifact/HBW9Ceuktnxo5VCdsE1Pmd).
Estructura oficial en el «Mapa maestro de Arvantti OS» (https://claude.ai/artifact/6j52qTKDWU5x5qQZR6JMbF).

Episodios: 1 Arvantti OS, 2 Organiza, 3 Recuerda, 4 Controla, 5 Protege, 6 Arvantti OS Enterprise, 7 Rinde cuentas.

Reglas de la serie:

- Trato de «usted». Hilo común: el lunes del informe de cierre (tarea T-12).
- En la voz el nombre se dice «Arvantti Operating System for AI» la primera vez y en la firma; luego «Arvantti OS».
  En pantalla, «Arvantti OS». Cada voz se revisa con Scribe (`revisar`) antes de renderizar.
- Sello visual: la figura de tres capas (`comun.mjs`), con la promesa del episodio encendida.
- Firma: «La IA bajo su gobierno.» Solo marca Arvantti. Sin precios ni licencias, sin LangGraph, cada sigla explicada.
- Voz de ElevenLabs «Andy» (ELEVENLABS_VOICE_ID del entorno); una sola pista de música para la serie.

## Estructura

- `armar.mjs`: voz, revisión, música, composición y render (común a todos los episodios).
- `plantilla.html`: estilos base y figura de capas; `{{EPCSS}}` recibe `episodios/<ep>/estilos.css`.
- `episodios/<ep>/escenas/<escena>/script.md`: texto de la voz; `episodios/<ep>/episodio.mjs`: escenas y animación.
- `snap.cjs`: capturas de cuadros sueltos para revisar sin renderizar.

## Producir

```bash
node armar.mjs preparar                       # marca recortada
node armar.mjs musica --enviar                # una vez para la serie
EP=01-arvantti-os node armar.mjs voz --enviar
EP=01-arvantti-os node armar.mjs revisar      # transcripción de cada escena
EP=01-arvantti-os node armar.mjs componer && FORMATO=vertical EP=01-arvantti-os node armar.mjs componer
EP=01-arvantti-os node armar.mjs render v001  # out/01-arvantti-os-horizontal-v001.mp4
FORMATO=vertical EP=01-arvantti-os node armar.mjs render v001
```

Voz, música, mezclas y renders no van al repo (`.gitignore`).
