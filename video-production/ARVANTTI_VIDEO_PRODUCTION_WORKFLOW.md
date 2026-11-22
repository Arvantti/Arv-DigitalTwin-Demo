# Flujo de producción de video — ARVANTTI Digital Twin

## Propósito

Sistema reutilizable para transformar ideas, artículos o demostraciones en videos de marca sin copiar estilos, claims ni assets de terceros.

Este flujo conserva prácticas técnicas transferibles: brief verificable, storyboard temporal, locución real, versionado, renderer existente, animación progresiva, QA técnico y aprobación humana.

## Fuentes de verdad

Antes de producir, consultar en este orden:

1. Brief aprobado de la pieza.
2. Documentación, código, artículo o demo fuente del proyecto. Para el gemelo digital, preferir contratos, `docs/`, código fuente y resultados de pruebas vigentes.
3. Esta guía y `.agents/skills/arvantti-digital-twin-video/SKILL.md`.
4. Recursos del repositorio destino en `video-production/shared/arvantti/` y `video-production/shared/core/`; confirmar que cada asset corresponde a la identidad/brief.
5. Proyecto previo de Digital Twin pertinente. El material AndyOpenDev solo sirve para prácticas transferibles; no copiar sus assets, guiones ni marca.

Si dos fuentes entran en conflicto, detenerse y documentar la duda para aprobación humana. No inventar claims, capacidades, resultados, fechas, clientes o métricas.

## Preguntas obligatorias antes de producir

El agente debe confirmar primero si esta pieza requiere una sola rendition o varias y para cada una preguntar canal/tamaño:

```text
1) Vertical: 1080×1920
2) Horizontal: 1920×1080
3) Cuadrado: 1080×1080
4) Personalizado
```

No hay formato predeterminado. Cada rendition necesita composición, safe areas, captions y QA propios; no asumir que basta con recortar un master.

Después debe confirmar:

- Tema, propósito/tesis y audiencia.
- Uno o más canales de publicación y formato de cada rendition.
- Objetivo editorial.
- Duración deseada, si no está definida por el brief.
- Idioma y voz de narración.
- CTA, si existe.
- Assets y referencias permitidas.
- Si el contenido está basado en un artículo o demo.

No imponer 30 segundos, formato vertical ni un canal concreto si el brief no lo pide.

El asistente de configuración se encuentra en:

```text
video-production/video-pipeline.mjs (atajo: `pnpm video:configure`)
```

## Puertas de aprobación

### Gate 1 — Brief

No crear escenas hasta que estén definidos:

- Problema.
- Audiencia.
- Tesis principal.
- Claim verificable.
- Fuente del claim.
- Canal y formato.
- Acción esperada del espectador.

### Gate 2 — Guion

El guion debe separar:

- Narración.
- Texto en pantalla.
- Acción visual.
- SFX.
- Assets requeridos.
- Tiempo de inicio y fin.

La persona responsable aprueba el guion antes de storyboard final, TTS o montaje. La aprobación del guion no aprueba proveedor, voz ni consumo de cuota.

### Gate 3 — Voz/TTS

Si hay locución, confirmar proveedor, modelo, voz, autorización en la cuenta del destino y presupuesto/cuota. Antes de enviar, enseñar el texto exacto y solicitar una autorización explícita de envío. Nunca transferir claves ni leer `.env` de otro proyecto; no reintentar tras fallos de autenticación/cuota.

### Gate 4 — Datos/captura

Para videos de producto, verificar que los resultados mostrados existen y están persistidos. Para el Acueducto, Cosimulación y Fractal deben estar calculados, validados y persistidos antes de grabar. Si faltan, es un bloqueo de producción: no grabar resultados inventados, interpolar datos ausentes ni narrar al público la indisponibilidad como sustituto. Una sesión virtual no prueba conexión a planta física. No cambiar sesiones compartidas ni mandar comandos PLC sin autorización.

### Gate 5 — Preview

Revisar una preview o contacto de frames antes del render final. La revisión humana decide sobre claridad, ritmo, tono y fidelidad de marca.

### Gate 6 — QA técnico

El agente valida formato, duración, audio, legibilidad, safe area, transiciones y errores del renderer.

### Gate 7 — Aprobación final

QA técnico aprobado no equivale a aprobación editorial. La pieza solo se marca como aprobada cuando la persona responsable confirma copy, montaje, audio y branding.

La aprobación del master completo y la autorización de publicación/distribución son independientes. No publicar ni enviar nada fuera del proyecto sin autorización explícita.

## Estructura de carpetas

No sobrescribir entregas previas. Cada pieza debe tener un slug y una versión:

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
├── assets/
│   ├── shared -> ../../../shared/
│   ├── illustrations/
│   ├── audio/
│   └── captions/
├── previews/
│   ├── v001/
│   └── v002/
├── out/
└── QA.md
```

Usar nombres versionados para previews y no borrar renders anteriores:

```text
previews/v001/preview.mp4
previews/v002/preview.mp4
out/<slug>-v003.mp4
```

## Convención de archivos

- `brief.md`: objetivo y restricciones.
- `sources.md`: URLs, artículos, documentación y fecha de consulta.
- `claims.json`: afirmaciones y evidencia.
- `script.md`: guion humano y prompt de voz.
- `script.json`: estructura consumible por agentes.
- `storyboard.json`: escenas, tiempos y propósito.
- `motion-design-plan.json`: entradas, transformaciones, ritmo, SFX y estados.
- `video-config.json`: tamaño, FPS, duración, safe area y renderer.
- `QA.md`: checks automáticos y aprobación humana.

Los componentes y assets comunes no se copian en cada proyecto. Se mantienen en `video-production/shared/core/`; los recursos ARVANTTI están en `video-production/shared/arvantti/`. Cada proyecto los referencia mediante `assets/shared/` (enlazado a `../../../shared/`). La identidad editorial de esta serie es ARVANTTI Digital Twin. El kit local contiene el símbolo ARVANTTI Labs usado en piezas previas; confirmar su uso en cada brief y no presentarlo como un lockup distinto no aprobado. No se mezclan assets de otras marcas.

## Claims respaldados

Cada claim factual debe registrarse así:

```json
{
  "id": "claim-01",
  "text": "Texto exacto del claim",
  "source": "URL o archivo fuente",
  "status": "verified",
  "notes": "Condiciones o límites relevantes"
}
```

Si el claim no tiene respaldo:

- Reformularlo como hipótesis o explicación general.
- Eliminarlo.
- Marcarlo como pendiente de aprobación.

La comunicación de ARVANTTI debe ser clara, directa, elegante, técnica, humana y basada en evidencia. Evitar hype, absolutos y promesas vacías.

## Identidad ARVANTTI Digital Twin

### Posicionamiento

Comunicar las capacidades de ARVANTTI Digital Twin con evidencia del repositorio, separando arquitectura implementada, resultados calculados, supuestos y propuestas futuras. La comunicación debe mostrar decisiones, límites, evaluación y operación virtual; no presentar un prototipo como producto terminado ni una sesión virtual como instalación física conectada.

La frase de marca aprobada para la pieza de lanzamiento es «Decide antes de que pase». El CTA se confirma en el brief de cada video.

### Paleta oficial

```text
Azul ARVANTTI       #2D7FF9
Azul eléctrico      #4EA7FF
Titanio claro       #D8DADF
Titanio oscuro      #7A7E86
Negro profundo      #0B0F18
Blanco ártico       #F8FAFC
```

### Tipografía

- `Orbit`: titulares, marca y elementos destacados.
- `Inter`: texto largo, interfaces y subtítulos.
- `IBM Plex Mono`: código, datos y métricas.

Las fuentes deben estar disponibles localmente o declararse con `@font-face`. No depender de una fuente remota sin fijarla.

### Motion design

- Movimiento con propósito.
- Transiciones suaves.
- Profundidad y microinteracciones.
- 200 ms para microinteracciones.
- 400 ms para componentes.
- 800–1200 ms para transformaciones narrativas.
- Cards y botones con esquinas rectas (`border-radius: 0`) cuando se representen interfaces ARVANTTI.
- Los nodos y puntos de estado pueden seguir siendo circulares.

## Límites de identidad

Esta instalación es exclusiva de ARVANTTI Digital Twin. No incorporar mascotas, logos o recursos de AndyOpenDev/otras marcas. La identidad Digital Twin no convierte automáticamente el logo ARVANTTI Labs en lockup de producto: utilizar el símbolo/lockup solo según la guía aprobada. Si el brief requiere un asset no incluido, detenerse y solicitar recursos aprobados; no recrearlos ni improvisarlos.

## Proceso de producción

### 1. Brief

Crear `brief.md` con el objetivo de una sola pieza. Una pieza debe resolver una pregunta concreta.

### 2. Investigación y claims

Leer la fuente completa. Registrar en `sources.md` y verificar los claims en `claims.json`.

### 3. Guion

Escribir primero la locución real. Después ajustar el montaje a la duración de la voz. No diseñar una animación muda y forzar la narración al final.

El guion debe incluir pausas naturales, texto en pantalla breve y una idea por escena.

### 4. Storyboard temporal

Cada escena debe especificar:

```json
{
  "id": "scene-01",
  "start": 0,
  "end": 4.5,
  "purpose": "Qué debe entender el espectador",
  "voiceover": "Texto de la locución",
  "visual": "Qué aparece y cómo se construye",
  "transition": "Cómo conecta con la siguiente escena",
  "sfx": [],
  "safeArea": true
}
```

No dejar pausas visuales largas. Durante una pausa de voz debe existir movimiento sutil: partículas, cámara, glow, respiración, línea de progreso o microinteracción.

### 5. Assets

Preparar logo, ilustraciones, fuentes, audio y SFX aprobados antes de programar. Preservar originales. Las versiones procesadas van a `assets/` o `processed/`, nunca reemplazan el original.

### 6. Implementación

Hyperframes es el renderer principal para motion graphics HTML/SVG/GSAP en este flujo. Remotion queda disponible para composiciones React, 3D o datos complejos cuando el brief lo justifique.

Usar el renderer existente del proyecto. No cambiar de motor por defecto.

Para Hyperframes:

- Una timeline pausada por composición.
- Timeline registrada en `window.__timelines`.
- Tiempo determinista.
- Sin `Date.now()`, timers, `Math.random()` no sembrado ni fetchs durante el render.
- Selectores GSAP existentes y con IDs estables.
- No mezclar `transform` CSS con transformaciones GSAP.
- No usar pseudo-elementos como targets GSAP.
- Animar elementos progresivamente, no mostrar una slide completa de golpe.

#### Motion craft — evitar el aspecto de presentación estática

En `motion-design-plan.json`, evaluar y planear las cinco técnicas siguientes. Aplicar las que apoyen la narración; no forzar efectos que no encajen con el tema:

1. **Easing y pequeño rebote final:** curvas de aceleración/desaceleración y un settle/overshoot sutil cuando aporte energía; evitar movimientos robóticos o rebotes que dificulten leer.
2. **Entradas escalonadas:** presentar elementos relacionados uno después de otro, en el orden de la narración, no toda la escena de golpe.
3. **Parallax:** separar fondo, plano medio y primer plano y moverlos a velocidades distintas, con profundidad discreta y sin competir con texto/captions.
4. **Micromovimiento ambiental:** durante pausas o holds, conservar movimiento sutil y relevante para que la imagen no parezca congelada; mantenerlo lo bastante bajo para no distraer.
5. **Rastro luminoso en una mano:** efecto tipo sable de luz solo si hay una mano/pose adecuada y el contenido lo justifica. Es un acento opcional, no un recurso obligatorio; no cubrir contenido ni sugerir capacidades no verificadas.

Evitar una secuencia de tarjetas estáticas con fundidos básicos: crear continuidad entre escenas mediante capas, cámara, transformaciones o seguimiento de objetos. Cada efecto debe tener propósito narrativo y respetar legibilidad, safe area y movimiento cómodo.

### 7. Audio y locución

La locución aprobada puede generarse desde `<proyecto>/script.md` con `pnpm video:voice --project <proyecto> [--script <archivo>]`. El comando muestra el guion exacto y solo lo envía si el operador escribe `ENVIAR`; no eludas esta confirmación. Lee `ELEVENLABS_API_KEY` y `ELEVENLABS_VOICE_ID` del entorno y `ELEVENLABS_MODEL_ID` opcional (por defecto `eleven_v4`). Ningún agente debe leer/copiar `.env` ajenos ni asumir que otra sesión hereda secretos; el operador comprueba solo presencia en el entorno seguro y nunca imprime valores. El audio se guarda en `assets/audio/voiceover.mp3`, junto a `voiceover-meta.json` sin credenciales. Parámetros fijos aprobados: stability 0.50, similarity boost 0.85, style 0.00, speed 1.00 y speaker boost activado. Nunca registres la API key en metadatos, archivos, argumentos, YAML literal ni logs; `.env` debe estar ignorado y `.env.example` lleva solo placeholders. Para GitHub Actions, guardar la clave en **Settings → Secrets and variables → Actions → Secrets**.

La música instrumental se genera con `pnpm video:music --project <proyecto> --prompt <archivo> --duration-seconds <segundos>`; el CLI muestra el prompt exacto y pide `ENVIAR` antes de una única llamada. Usa la clave del entorno seguro, no requiere Voice ID, nunca reintenta fallos y guarda metadatos no secretos. La música generada no garantiza ausencia de reclamos: verificar términos/licencia de la cuenta/plan antes de distribuir. Pruebas simuladas: `pnpm video:music:test` y `pnpm video:voice:test`; ninguna contacta ElevenLabs.

Los SFX deben reforzar acciones visibles. Mezclar voz por encima de música/SFX y validar duración/loudness con FFmpeg. No sustituir voz aprobada por audio temporal ni presentar una preview `TEMP_AUDIO` como entrega final.

### 8. Previews

Cada iteración crea una nueva versión. Revisar frames de:

- Hook.
- Primera explicación.
- Transición principal.
- Momento de error o contraste.
- CTA y marca.

### 9. QA técnico

Usar Hyperframes lint y FFprobe/FFmpeg:

```bash
pnpm dlx hyperframes check --json
ffprobe -v error -show_entries stream=width,height,r_frame_rate,duration \
  -of default=noprint_wrappers=1 out/video.mp4
```

Comprobar según el brief, no con valores universales:

- Resolución y relación de aspecto.
- FPS.
- Duración.
- Presencia y sincronización de audio.
- Safe area del canal.
- Legibilidad móvil.
- Contraste.
- Transiciones.
- Ausencia de frames congelados no intencionados.
- Ausencia de errores y advertencias del renderer.
- Logo, colores y tipografía.

### 10. Aprobación humana y distribución

La persona responsable revisa el video completo y confirma:

```text
[ ] El claim es correcto.
[ ] La explicación se entiende sin contexto adicional.
[ ] La locución y el montaje están sincronizados.
[ ] La marca se usa correctamente.
[ ] El audio es aceptable.
[ ] La versión está lista para el canal indicado.
```

Solo después se marca `APPROVED`. Este flujo no publica ni envía contenido automáticamente.

## Coordinación entre agentes

Pi mantiene skills, workflow y herramientas comunes. Claude edita solo el paquete individual que el responsable le asigne, nunca las rutas comunes ni un archivo concurrentemente asignado a otro agente. Consultar `video-production/AGENT-HANDOFF.md`; anunciar archivos antes de editar, revisar `git status`/`git diff` y entregar rutas absolutas, cambios, validaciones y bloqueos. No hacer commits, despliegues ni publicaciones sin instrucción.

## Checklist final

- [ ] Se confirmó una o más renditions con dimensiones/canales explícitos; safe areas y QA se revisaron por rendition.
- [ ] El brief define audiencia, canal, objetivo y CTA.
- [ ] Las fuentes y claims están registrados.
- [ ] El guion fue aprobado antes del montaje.
- [ ] La locución real guía el tiempo de las escenas.
- [ ] Los originales siguen intactos.
- [ ] Los previews están versionados.
- [ ] Se usó el renderer existente.
- [ ] Los textos aparecen progresivamente.
- [ ] No hay pausas visuales no intencionadas.
- [ ] Se revisó la legibilidad en móvil.
- [ ] Se revisaron audio, duración, transiciones y formato.
- [ ] QA técnico y aprobación humana están separados.
- [ ] Se revisaron términos/licencia de música para el uso previsto; no se hizo una garantía legal absoluta.
- [ ] La aprobación del master está registrada y la autorización de publicación/distribución se obtuvo aparte.
- [ ] No se publicó ni envió nada fuera del proyecto.
