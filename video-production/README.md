# Generador de videos ARVANTTI Labs

Kit local para preparar proyectos de video de ARVANTTI con HyperFrames: identidad visual, recursos compartidos, guía editorial y asistente de configuración. **No genera ni publica un MP4 automáticamente**; crea la configuración inicial para que el proyecto se diseñe, revise y renderice con HyperFrames.

## Empezar

Desde la raíz del repositorio:

```bash
pnpm video:configure
```

El asistente pregunta formato y dimensiones, tema, audiencia, canal, duración, voz y fuente de claims. Guarda `video-config.json` en una carpeta versionada bajo `video-production/ARVANTTI/`. No asume un formato ni duración. Si la carpeta elegida ya existe, no la sobrescribe.

## Generar locución con ElevenLabs

El guion predeterminado es `<proyecto>/script.md`. Configura `ELEVENLABS_API_KEY` y `ELEVENLABS_VOICE_ID` en el entorno del proceso; `ELEVENLABS_MODEL_ID` es opcional y usa `eleven_v4` si no está definida. La CLI no carga `.env` automáticamente: puedes exportar las variables en la shell o usar un gestor de secretos local. `.env.example` contiene solo placeholders; el archivo `.env` real y variantes como `.env.local` están ignorados por Git. No pongas la clave en argumentos, archivos, YAML ni logs.

```bash
export ELEVENLABS_API_KEY='tu-clave-local'
export ELEVENLABS_VOICE_ID='tu-id-de-voz'
pnpm video:voice --project video-production/ARVANTTI/ARV-W01-V001-mi-video
# opcional: --script ruta/al/guion-aprobado.md
```

El comando muestra el texto exacto y solicita escribir `ENVIAR` antes de hacer la petición. Cualquier otra respuesta cancela sin enviar. Guarda `assets/audio/voiceover.mp3` y `voiceover-meta.json` (modelo, voz y parámetros, nunca la clave), sin sobrescribir archivos existentes. Ajustes: stability 0.50, similarity boost 0.85, style 0.00, speed 1.00, speaker boost activado. Pruebas HTTP simuladas: `pnpm video:voice:test`.

Para GitHub Actions, configura `ELEVENLABS_API_KEY` en **Settings → Secrets and variables → Actions → Secrets**; refiérela solo como secret de entorno del paso, nunca como literal en YAML. No hay envío automatizado configurado.

Después, crea/edita la composición con HyperFrames y usa sus comandos con PNPM, por ejemplo `pnpm dlx hyperframes --help`. Revisa la guía completa en [`ARVANTTI_VIDEO_PRODUCTION_WORKFLOW.md`](./ARVANTTI_VIDEO_PRODUCTION_WORKFLOW.md) y la skill local `.agents/skills/arvantti-labs-video/SKILL.md`.

## Recursos de marca

- `shared/arvantti/`: logo oficial ARVANTTI Labs.
- `shared/core/`: estilos, utilidades de motion y efectos de sonido compartidos (créditos de SFX en su carpeta).
- Los proyectos deben referenciar estos recursos desde `assets/shared/`, sin duplicarlos ni modificarlos.
- Tipografías oficiales: Orbit, Inter e IBM Plex Mono. Cargar archivos locales con `@font-face` cuando estén disponibles; no depender de fuentes remotas.

## Límites

- Los claims y métricas deben citar documentación del proyecto y sus límites; nunca inventarlos.
- Preview y QA técnico no equivalen a aprobación editorial.
- No publicar, subir ni enviar material fuera del repositorio sin autorización explícita.
- Los recursos originales y entregas anteriores se conservan; cada preview/render lleva versión.
