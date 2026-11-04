---
name: arvantti-labs-video
description: Create ARVANTTI Labs videos from this digital-twin project's verified source material, with local ARVANTTI assets, deterministic HyperFrames timelines, editorial review and technical QA.
---

# Videos ARVANTTI Labs · Digital Twin

Usa esta skill solo para piezas con identidad ARVANTTI Labs. No combines logos, mascotas ni estilos de otras marcas.

## Antes de producir

Lee primero:

- `video-production/ARVANTTI_VIDEO_PRODUCTION_WORKFLOW.md`
- `video-production/README.md`
- el brief y las fuentes del proyecto indicadas por la persona usuaria.

Para claims sobre este gemelo digital, consulta la documentación y el código vigentes (`docs/`, `industrial-models/`, `equipment-library/`, `packages/`, `apps/` y pruebas pertinentes). Distingue capacidades implementadas, demos, supuestos y validación física; nunca inventes métricas, clientes, resultados ni fechas. Si una fuente contradice otra, registra la diferencia y pide resolución antes de afirmarla.

## Primera pregunta obligatoria

Antes de crear storyboard, composición o render, pregunta el formato y tamaño:

```text
¿Qué tipo y tamaño quieres para el video?
1) Vertical social: 1080×1920
2) Horizontal: 1920×1080
3) Cuadrado: 1080×1080
4) Personalizado
```

Confirma tema, audiencia, canal, objetivo editorial, duración, idioma/voz, CTA, fuentes y assets permitidos. No asumas duración, canal, CTA ni formato.

El asistente de configuración pregunta esos datos y crea `video-config.json`:

```bash
pnpm video:configure
```

Es una configuración inicial; no produce ni aprueba por sí misma un video.

## Identidad visual ARVANTTI

Usa los recursos locales:

- Logo: `video-production/shared/arvantti/branding/ArvanttiLabsLogo.png`.
- Componentes, estilos, motion y SFX: `video-production/shared/core/`.

Paleta:

```text
Azul ARVANTTI       #2D7FF9
Azul eléctrico      #4EA7FF
Titanio claro       #D8DADF
Titanio oscuro      #7A7E86
Negro profundo      #0B0F18
Blanco ártico       #F8FAFC
```

Tipografía: Orbit para titulares, Inter para texto y captions, IBM Plex Mono para código y métricas. Usa archivos locales con `@font-face` cuando estén disponibles; no dependas de fuentes remotas. Cards y botones de interfaces ARVANTTI usan esquinas rectas; nodos de datos pueden ser circulares.

El logo se centra horizontalmente salvo que un brief aprobado indique otra composición. Prioriza diagramas, sistemas, interfaces y transformaciones causales. El movimiento debe explicar: transiciones suaves, entradas escalonadas, parallax sutil y microinteracciones solo cuando ayuden a entender. Mantén textos legibles en móvil y dentro de las zonas seguras.

No agregues otra marca, mascota o logo. Si el brief necesita assets o lineamientos que no estén en el kit, solicita los aprobados; no recrees ni improvises branding.

## Guion, evidencia y aprobación

1. Registra objetivo, audiencia, tesis, canal, formato y acción esperada en `brief.md`.
2. Anota en `sources.md` las rutas/URLs y fecha de consulta.
3. Registra cada claim literal y su evidencia en `claims.json`; elimina o marca los claims no comprobados.
4. Escribe `script.md` y storyboard temporal antes de implementar. La locución debe sonar natural y guiar el ritmo; evita frases telegráficas y clichés.
5. Espera aprobación humana del guion/storyboard antes de una pieza completa.
6. Implementa el video y crea previews versionados; nunca sobrescribas versiones previas.
7. Revisa visualmente las previews, el audio y el QA; la aprobación técnica no sustituye la editorial.
8. No publiques, subas ni envíes el video fuera del repositorio sin autorización explícita.

Estructura recomendada para cada pieza:

```text
video-production/ARVANTTI/ARV-W01-V001-<slug>/
├── brief.md
├── sources.md
├── claims.json
├── script.md
├── script.json
├── storyboard.json
├── motion-design-plan.json
├── video-config.json
├── assets/shared -> ../../../shared/
├── assets/audio/
├── previews/v001/
├── out/
└── QA.md
```

## Locución ElevenLabs

Si la persona pide locución generada, usa el guion aprobado con `pnpm video:voice --project <proyecto> [--script <archivo>]`. Requiere `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` y opcionalmente `ELEVENLABS_MODEL_ID` (default `eleven_v4`) en el entorno. Nunca pidas que peguen la clave en el chat ni la guardes en archivos. El comando muestra el texto completo y exige que el operador escriba `ENVIAR`; no uses una llamada HTTP alternativa ni un modo automático que omita el consentimiento. Produce `assets/audio/voiceover.mp3` y `voiceover-meta.json` sin secretos. Parámetros fijos: stability 0.50, similarity boost 0.85, style 0.00, speed 1.00, speaker boost activado. Para GitHub Actions, la clave debe vivir en Settings → Secrets and variables → Actions → Secrets.

## HyperFrames

Usa HyperFrames como motor predeterminado para motion graphics HTML/SVG/GSAP. Remotion es opcional y requiere justificación en el brief. Usa PNPM:

```bash
pnpm dlx hyperframes --help
pnpm dlx hyperframes check --json
pnpm dlx hyperframes snapshot --review
pnpm dlx hyperframes preview --background
pnpm dlx hyperframes render --quality draft --output out/preview-v001.mp4
```

Cumple el contrato determinista de HyperFrames:

- Cada elemento temporal tiene `.clip`, `data-start` y `data-duration`.
- Cada composición registra una timeline pausada en `window.__timelines`.
- No uses `Date.now()`, `Math.random()` sin semilla, timers, fetchs de red durante render ni timelines infinitas.
- No animes `display`, `visibility` o `autoAlpha` en `.clip`; anima un hijo.
- No combines transformaciones CSS y GSAP en el mismo elemento.
- Todo `<audio>` tiene `id`; el `<video>` es `muted` si no tiene audio propio.
- Las fuentes externas se incluyen con `@font-face`; las rutas de assets parten de la raíz del proyecto.

Antes de entregar: ejecuta `check --json`, corrige errores y revisa los frames y audio. No hagas el render final hasta tener aprobación humana del preview, salvo que la persona lo solicite explícitamente. No publiques.
