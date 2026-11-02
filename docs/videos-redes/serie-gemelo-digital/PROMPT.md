---
title: Prompt para producir la serie con el agente local
tags: [videos, redes, serie, prompt, hyperframes, elevenlabs]
fecha: 2026-11-02
---

# Prompt para el agente local

Se usa en el computador que tiene HyperFrames, ElevenLabs y el repo Content_Manager. El token de ElevenLabs vive solo en el
`.env` local de Content_Manager (ignorado por git); nunca se pega en el chat ni se sube a ningún repo.

Antes de empezar:

1. Actualiza el clon del gemelo: `git -C <ruta>/Arv-DigitalTwin-Demo pull` (rama `main`, una vez fusionado el PR de la serie).
2. Abre el agente en la raíz de Content_Manager.
3. Cambia `N` por la parte que vas a producir (de 1 a 6). Recomendado: una parte por sesión y aprobar cada una antes de la siguiente.

## Prompt

```text
Vas a producir la PARTE N de la serie "El gemelo digital, parte por parte" para AndyOpenDev.

Fuentes (solo lectura, no las modifiques):
- Repo del gemelo: <ruta>/Arv-DigitalTwin-Demo
- Reglas, marca y formato de la serie: docs/videos-redes/serie-gemelo-digital/README.md
- Guion, copy y portada de esta parte: docs/videos-redes/serie-gemelo-digital/parte-N-*.md
- Capturas: las rutas del campo "imagen" de cada segmento (docs/demo-plasticos/...).
- Mapa de arquitectura: docs/demo-plasticos/arquitectura/arquitectura-plasticos.png

Dónde trabajar (en este repo, Content_Manager):
- Crea marketing/production/hyperframes/AndyOpenDev/AOD-GD-P0N-<slug>/ con la misma estructura del video de referencia
  marketing/production/hyperframes/AndyOpenDev/AOD-W01-V05-recursos-frontend/: README.md, video-config.json, script.md,
  publication-copy.md, image-prompt-v001.md, QA.md, assets/screens, assets/audio, assets/captions, previews/ y out/.
  <slug> sale del nombre del archivo de la parte (por ejemplo, AOD-GD-P01-por-que).
- Copia a assets/screens solo las capturas que usa esta parte.

Pasos:
1. script.md: copia el guion de la parte tal cual (segmentos S01..S06, voz en las líneas que empiezan con ">").
   No cambies cifras, palabras ni el orden.
2. Voz con ElevenLabs: usa la misma voz, el mismo modelo y los mismos ajustes de
   AOD-W01-V05-recursos-frontend/video-config.json (voiceId, voiceModel, voiceSettings, velocidad 1.0).
   Lee el token de ELEVENLABS_API_KEY en el .env local; nunca lo imprimas, nunca lo escribas en archivos versionados.
   Genera un MP3 por segmento (assets/audio/S01-v001.mp3, ...) y únelos en assets/audio/voiceover-v001.mp3.
   Genera los subtítulos en español (assets/captions/voiceover-v001.es.vtt) con el texto exacto de la voz.
3. Composición HyperFrames, vertical 1080x1920 a 30 fps:
   - Fondo #0e1430. Zona segura x 96-984, y 220-1325; subtítulos en la banda y 1180-1310.
   - Un cuadro por segmento. Duración = audio del segmento + 0,4 s.
   - Las capturas son 1600x900: muestra el recorte de la zona que dice "en pantalla", con zoom o paneo suave y un recuadro
     de resaltado cuando lo pida el guion.
   - "Mapa" = recorte del diagrama de arquitectura con el bloque indicado iluminado y el resto atenuado
     (1 emulador, 2 centro de control, 3 gemelo 3D, 4 APS, 5 cosimulador, 6 Fractal).
   - El campo "texto" va como título grande en la parte alta de la zona segura, con animación de entrada corta.
   - Etiqueta "PARTE N" visible desde el primer cuadro.
   - Logo de AndyOpenDev pequeño en una esquina todo el video (usa el logo de la marca que ya tienes en este repo).
   - Tarjeta final: "Continúa en la parte N+1: <título>" (o "Fin de la serie" en la parte 6), logo de AndyOpenDev y la firma
     "Arvantti · Digital Twin Engineering" con el logo de public/Branding/ArvanttiLabsBrand/.
   - Audio: voz y efectos discretos donde el guion los pide; sin música.
4. Preview: renderiza previews/v001/AOD-GD-P0N-<slug>-preview-v001.mp4 y detente para que yo lo revise.
   Corre "hyperframes lint" y "hyperframes check" antes del render.
5. Cuando yo apruebe, renderiza el máster en out/AOD-GD-P0N-<slug>-v001-final.mp4 sin cambiar guion, audio ni montaje.
   Verifica con ffprobe: H.264/AAC, 1080x1920, 30 fps, duración. Revisa al menos 15 cuadros. Anota todo en QA.md.
6. publication-copy.md: copia la sección "Copy de publicación" de la parte.
7. Portada de Instagram:
   - image-prompt-v001.md: copia el prompt de la sección "Portada".
   - Genera la imagen de fondo con ese prompt (sin texto).
   - Compón la portada 1080x1920 con el "Texto encima" de la parte (título grande, "PARTE N" arriba) dentro del área
     central 1080x1350, logo de AndyOpenDev pequeño y fondo #0e1430 donde haga falta. Expórtala como out/cover-v001.png.
     Si no hay generador de imágenes disponible, usa como fondo la captura de S01 desenfocada y oscurecida.

Reglas:
- No muestres fechas de calendario (todo es "día N"), ni marcas o clientes reales, ni datos que no estén en el guion.
- No subas MP3, MP4, PNG de portada ni el .env a ningún repo público. No publiques en redes: eso lo hago yo.
- No reemplaces versiones: cada cambio es v002, v003...
- Al terminar, dime la duración final, las rutas del máster y la portada, y cualquier diferencia con el guion.
```
