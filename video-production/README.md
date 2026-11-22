# Producción de video · ARVANTTI Digital Twin

Flujo y tooling del proyecto para preparar videos con identidad **ARVANTTI Digital Twin**. El paquete de cada pieza vive bajo `video-production/ARVANTTI/<ID-y-slug>/`; los assets, capturas y renders no se copian a esta carpeta común. Esta configuración no crea un video ni hace llamadas a proveedores hasta que una persona aprueba la salida concreta.

## Configurar un paquete

Desde la raíz del repositorio:

```bash
pnpm video:configure
```

El asistente define brief inicial, CTA, fuentes, assets permitidos y entre una y cuatro renditions. Los tamaños predefinidos son vertical 1080×1920, horizontal 1920×1080, cuadrado 1080×1080 y personalizado. Ninguno es el formato por defecto. Cada rendition se compone y revisa por separado; el asistente guarda solo `video-config.json` y no redacta guion/storyboard ni produce medios.

La identidad del configurador es `digital-twin`. El kit local tiene el símbolo de ARVANTTI Labs utilizado en piezas previas de Digital Twin; confirmar su pertinencia en el brief de cada pieza. No importar branding ni assets de AndyOpenDev o del proyecto de referencia.

## ElevenLabs Music

La generación requiere `ELEVENLABS_API_KEY` en el entorno seguro del proceso. No necesita `ELEVENLABS_VOICE_ID`. El CLI muestra proveedor/modelo, duración y prompt exacto, y solo realiza una llamada si se escribe `ENVIAR` tras confirmar que se acepta el consumo de cuota:

```bash
pnpm video:music --project <paquete> --prompt <archivo-prompt.txt> --duration-seconds <segundos>
```

La salida MP3 y un sidecar `.meta.json` quedan en `assets/audio/` por defecto. No se sobrescriben archivos; fallas de autenticación/cuota/servicio no se reintentan. Las pruebas son simuladas y no contactan ElevenLabs:

```bash
pnpm video:music:test
```

La música generada no garantiza automáticamente ausencia de reclamos ni derechos universales. Antes de distribución, revisar y registrar los términos/licencia aplicables a la cuenta/plan y al canal; no hacer claims legales absolutos.

## ElevenLabs TTS

El flujo existente de locución requiere `ELEVENLABS_API_KEY` y `ELEVENLABS_VOICE_ID` en el entorno; `ELEVENLABS_MODEL_ID` es opcional. No leer ni copiar `.env` de otro proyecto, no pegar secretos en chat/archivos/argumentos ni asumir que otra sesión de agente hereda las variables. El ejecutor solo comprueba presencia de variables y detiene el proceso si faltan.

```bash
pnpm video:voice --project <paquete> [--script <guion-aprobado.md>]
pnpm video:voice:test
```

Antes de llamar a TTS, aprobar guion exacto, voz, proveedor/modelo y envío. La aprobación del guion no aprueba automáticamente consumo de cuota. Se guardan audio y metadatos no secretos, nunca la API key. La voz de AndyOpenDev solo se usa con autorización del propietario y acceso autorizado en la cuenta del destino; el ID se lee del entorno, no se hardcodea.

La clave no se carga automáticamente desde `.env` por los comandos existentes. El propietario debe disponerla mediante un secret manager o el entorno seguro desde el que se ejecutará. Para un proceso local, no es necesario GitHub. Si alguna vez se usa GitHub Actions, configurar un secret allí y poner un gate humano antes de llamadas facturables. No se ha hecho ninguna llamada a ElevenLabs durante la configuración del flujo.

## Renderer, capturas y QA

- Renderer previsto: HyperFrames mediante PNPM (verificar versión/comandos antes de producir); no está instalado como dependencia directa en este workspace.
- Capturas de la aplicación: Playwright solo después de verificar instalación, origen de datos y aislamiento de la sesión. No incluir credenciales, notificaciones o datos reales no autorizados.
- `ffmpeg` y `ffprobe` están disponibles en el entorno inspeccionado para mezcla y revisión técnica.
- La skill específica y gates están en `.agents/skills/arvantti-digital-twin-video/SKILL.md`; el acuerdo con Claude está en `video-production/AGENT-HANDOFF.md`.
- HyperFrames/FFmpeg QA no sustituye revisión editorial humana. La aprobación del video completo no autoriza publicación, subida o distribución.

## Plantilla de paquete

La estructura detallada se mantiene flexible según el tipo de pieza, pero suele incluir `README.md`, `brief.md`, `sources.md`, `claims.json`, `script.md`, `storyboard.json`, `video-config.json`, `assets/`, `previews/`, `out/` y `QA.md`. Los guiones/claims deben estar respaldados; datos dudosos se califican como asumidos. Preservar originales y las versiones vigentes de otras personas.
