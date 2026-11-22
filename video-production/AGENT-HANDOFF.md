# Acuerdo de trabajo entre Pi y Claude para video

## Propiedad de rutas

- **Pi** es dueño del flujo general, skills y tooling común: `/home/andydev/Coding/Arvantti-DigitalTwin/main/.agents/skills/` y `/home/andydev/Coding/Arvantti-DigitalTwin/main/video-production/` fuera del paquete que el responsable asigne explícitamente a Claude.
- **Claude** trabaja solo en el paquete individual que Andy le asigne bajo `/home/andydev/Coding/Arvantti-DigitalTwin/main/video-production/ARVANTTI/<ID-y-slug>/`: brief, fuentes, claims, guion y storyboard autorizados. No modifica skills, configuración común, otro paquete ni áreas reservadas.
- Un archivo tiene un solo agente escritor a la vez. Cada agente anuncia sus rutas antes de editar; antes/después revisa `git status` y `git diff`; entrega lista de rutas, checks, estado y bloqueos. No se pisan cambios, no se borran artefactos ajenos ni se hacen commits/despliegues/publicaciones sin autorización.

## Decisiones editoriales confirmadas

- Identidad: **ARVANTTI Digital Twin**, no AndyOpenDev.
- El sistema admite vertical, horizontal, cuadrado y personalizado. El brief de cada pieza decide una o más dimensiones; ninguna es la predeterminada. Cada rendition tiene composición, safe areas, captions y QA propios.
- ElevenLabs Music es el proveedor elegido para música; esto no garantiza por sí solo ausencia de reclamos. Registrar prompt/modelo y verificar términos/licencia de la cuenta/plan antes de distribución.
- Para el video de Acueducto previamente conversado: YouTube, horizontal 1920×1080, 8–10 min, audiencia de ingenieros de fluidodinámica, español, música épica, sesión real virtual y CTA “Conocer más sobre ARVANTTI Digital Twin”. Las etiquetas en gauges son exactamente **Planta Real**, **Cosimulador** y **Fractal**.
- La optimización del sprint actual busca la consigna PRS con válvulas entre pisos fijas por el perfil. No decir que Fractal permuta combinaciones de válvulas.
- Cosimulación y Fractal se calculan, validan y persisten antes de grabar. Si no están listas, es bloqueo de producción que se resuelve antes; sin datos inventados ni menciones de indisponibilidad al público.
- “Planta Real” es el nombre de la fuente/gauge; la sesión del video es virtual/PLC virtualizado, no una instalación física conectada.

## ElevenLabs: límite de entorno

Andy eligió ElevenLabs como proveedor previsto para música y comunicó que recargó saldo; esto no autoriza una generación concreta. La sesión actual de Pi reportó disponibles `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`; no se han hecho llamadas a ElevenLabs. **Esto no implica que la sesión de Claude herede esas variables.** Claude debe comprobar solo presencia de variables en su propio entorno y pedir al responsable que las inyecte por el gestor de secretos adecuado si faltan. Nunca leer/copiar un `.env` de otro proyecto, imprimir valores, transferir la key o guardarla en el repo.

La voz elegida es la misma voz de referencia de AndyOpenDev solo por autorización expresa de Andy; usar el ID desde `ELEVENLABS_VOICE_ID`, nunca hardcodearlo. Modelo predeterminado del flujo actual: `eleven_v4`. El owner debe tener acceso/permisos en la cuenta que ejecuta la generación. Antes de TTS, requiere aprobación explícita del guion exacto y confirmación de envío/cuota. Para música no se requiere Voice ID; antes de generar, enseñar prompt, duración y modelo, obtener confirmación y hacer como máximo una llamada, sin reintentos automáticos.

## Gates

Brief/fuentes/claims → aprobación del guion → autorización de voz y texto TTS (si aplica) → aprobación de storyboard/captura → preparación de resultados reales → captura → preview → QA técnico + revisión editorial → aprobación explícita del video completo → master. Publicación/distribución requiere autorización aparte.

La skill de producción es `/home/andydev/Coding/Arvantti-DigitalTwin/main/.agents/skills/arvantti-digital-twin-video/SKILL.md`. Esta nota coordina agentes; no es aprobación de una pieza ni autorización para consumir cuota o grabar una sesión.
