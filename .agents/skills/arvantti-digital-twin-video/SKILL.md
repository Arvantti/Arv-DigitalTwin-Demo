---
name: arvantti-digital-twin-video
description: Produce technically verified ARVANTTI Digital Twin videos using this repository's models, demos, local brand assets and approved media workflow.
---

# ARVANTTI Digital Twin video production

Usa esta skill para piezas cuya identidad es **ARVANTTI Digital Twin**. No mezcles AndyOpenDev ni otras identidades. Esta skill organiza el flujo; no aprueba claims, voz, gastos, publicación ni el video final por sí sola.

## Fuentes locales obligatorias

Antes de una pieza, lee:

- `AGENTS.md` y `video-production/ARVANTTI_VIDEO_PRODUCTION_WORKFLOW.md`.
- Brief, documentación, código y pruebas pertinentes al gemelo o planta que aparece.
- `video-production/README.md` y el paquete vigente más cercano en `video-production/ARVANTTI/`.
- Para el Acueducto, `docs/architecture/plan-reconstruccion-triada-temporal-acueducto.md` y las fuentes específicas indicadas en el brief.

Las fuentes del repositorio de referencia AndyOpenDev son únicamente contexto de proceso. No copies sus assets, guiones, identidad, voz o configuración.

## Descubrimiento y formato

Confirma antes de producir: tema, audiencia, propósito/tesis, canal, uno o más formatos y dimensiones, duración, idioma, voz/proveedor/modelo, CTA, fuentes, assets/uso permitido, renderer, licencia/uso de música y si se necesita demo real.

Este proyecto admite formatos **vertical 1080×1920**, **horizontal 1920×1080**, **cuadrado 1080×1080** y dimensiones personalizadas. No hay formato predeterminado. Cada rendition requiere su propia composición/configuración, safe areas, captions y QA; no basta con recortar automáticamente un master. Un brief puede pedir solo una rendition o un conjunto.

No crees guion, storyboard, escenas, assets ni renders antes de resolver decisiones editoriales esenciales y obtener los gates definidos abajo. No produzcas un video si la solicitud solo es revisar o configurar el flujo.

## Evidencia y claims

- Prioriza fuentes primarias: contratos y resultados persistidos, código vigente, pruebas, documentación técnica del proyecto y demo verificable.
- `sources.md` registra ruta/URL, fecha de consulta, afirmación respaldada y límites. `claims.json` contiene claims literales, evidencia y estado (`verified`, `illustrative`, `assumed`, `pending` o `rejected`).
- Distingue capacidad implementada, resultado calculado, supuesto del modelo, demo ilustrativa y propuesta futura. No inventes métricas, clientes, benchmarks, resultados ni estados.
- Los datos inciertos se califican. El QA técnico no convierte un supuesto hidráulico en validación física.
- Una captura de sesión real del software no demuestra conexión a una instalación física. En el Acueducto, “Planta Real” es la etiqueta aprobada de la fuente del gauge; el material debe aclarar que representa la sesión virtual/PLC virtualizado cuando el contexto pueda sugerir telemetría física.

## Guion y gates

El guion canónico es un único `script.md` por paquete. Separa locución, texto en pantalla e intención visual; usa lenguaje natural para la audiencia y termina con el CTA acordado. Los cambios se sincronizan en storyboard/captions/voz. No dupliques guiones en índices.

Gates separados y explícitos:

1. **Brief/fuentes/claims:** aprobación editorial del brief y de afirmaciones relevantes.
2. **Guion:** aprobación explícita antes de storyboard final, TTS o montaje.
3. **Voz/TTS:** confirmar proveedor, modelo, voz y permiso de uso; mostrar el texto exacto y solicitar autorización explícita de envío y gasto. Una aprobación previa de la voz no aprueba automáticamente cada texto.
4. **Storyboard/plan de captura:** aprobar antes de capturar/crear assets de producción.
5. **Preview:** revisión humana del video completo o del corte representativo.
6. **Master:** requiere aprobación explícita del video completo y QA técnico aprobado.
7. **Publicación/distribución:** autorización explícita independiente. Nunca subir, publicar ni enviar contenido automáticamente.

Una etiqueta como “final” o el QA técnico no equivalen a aprobación humana.

## ElevenLabs y secretos

- La clave solo se lee de `ELEVENLABS_API_KEY` ya disponible en el entorno seguro del proceso. Nunca leer `.env` de otro proyecto, copiar credenciales entre proyectos o sesiones, mostrarlas, guardarlas o ponerlas en argumentos, código, notas, logs o salidas.
- La cuenta/proceso de otro agente no hereda necesariamente las variables de Pi. El agente ejecutor comprueba solo presencia (`[ -n "${ELEVENLABS_API_KEY:-}" ]`) y nunca muestra valores. Si falta, el propietario la inyecta por el gestor de secretos/entorno de ese ejecutor.
- Locución: `ELEVENLABS_VOICE_ID` explícito y `ELEVENLABS_MODEL_ID` si corresponde; el valor de referencia es `eleven_v4` cuando el proyecto lo aprueba. La voz de AndyOpenDev requiere autorización explícita para este producto y cuenta; no hardcodear su ID ni inferir acceso.
- Música: ElevenLabs Music usa la clave API, no un Voice ID; el flujo local fija el modelo/end-point que documenta el proyecto. Mostrar prompt y duración antes de enviar; no hacer reintentos tras errores de autenticación, cuota o servicio ni cambiar cuenta, modelo, voz o proveedor silenciosamente.
- La música generada no es garantía automática de ausencia de reclamos ni de autorización universal. Antes de distribución registra los términos/licencia aplicables a la cuenta/plan y confirma que permiten el uso en el canal previsto. No afirmes “sin problemas de derechos” por el mero hecho de ser generada.
- Registrar texto/prompt exactos enviados, proveedor/modelo, parámetros no sensibles, duración, salida, fecha y QA. Nunca almacenar claves, tokens, datos personales ni datos reales no autorizados.

## Reglas para demos y modelos

- Captura pantallas de una sesión del producto autorizada; revisa datos visibles, notificaciones, URLs y credenciales antes de usar el material.
- No cambies perfiles compartidos, tags operativos ni mandes comandos como parte de grabación sin autorización. Usa sesiones/datos de demo aislados.
- Para comparar resultados, fija perfil/hash, snapshot, rejilla temporal, unidades y procedencia. Solo presenta frames realmente producidos/persistidos; no interpolar ausencias para aparentar continuidad ni coherencia.
- Si una salida requerida está pendiente, bloquea esa etapa de producción y resuelve el cálculo/configuración antes de grabar. No fabriques una curva, no la sustituyas por una visualización ilustrativa sin marcarla claramente y no menciones una limitación de servicio al público como sustituto de preparar el material.
- En el Acueducto, los controles existentes de reproducción deben inspeccionarse en el build/commit que se vaya a grabar. Las trayectorias elegidas se reproducen como datos guardados, no como aplicación automática al PLC. Fractal para el sprint actual optimiza PRS manteniendo fijas las aperturas de válvulas entre pisos según el perfil; no afirmar búsqueda combinatoria de válvulas.

## Identidad y assets

- Identidad editorial: ARVANTTI Digital Twin. Reutiliza únicamente recursos aprobados que pertenezcan al propio proyecto destino. No copies assets de `Arvantti_Content_Manager`.
- El kit local contiene recursos ARVANTTI Labs y material previo de lanzamiento Digital Twin. Comprueba la aprobación y la pertinencia del logo exacto para cada brief; no conviertas automáticamente el logo de Labs en un logo distinto.
- No dependas de fuentes remotas al renderizar. El repositorio no tiene una familia tipográfica de video completa instalada; declara y valida solo las fuentes disponibles/autorizadas.
- Conserva originales. Capturas de la demo y exportaciones suelen estar ignoradas por Git; respeta `.gitignore` y no subas datos de sesión sin autorización.

## Renderer, paquete y QA

Usa HyperFrames, renderer actual del proyecto, para composición HTML/SVG/GSAP; verifica la versión efectiva con PNPM antes de producir. FFmpeg/FFprobe sirven para medios y QA. Playwright se usa para capturas deterministas después de confirmar su instalación y origen de datos. No instales proveedores/servicios ni cambies renderer en silencio.

Cada paquete se ubica bajo `video-production/ARVANTTI/<ID-y-slug>/`, con al menos README, brief, sources, claims, script, configuración, assets, preview y QA según etapa. El paquete registra estado y agente dueño. No sobrescribir previews/masters vigentes ni artefactos de otro agente.

QA técnico: formato/dimensiones/FPS/duración, cobertura de timeline, audio/codec/loudness/true peak/decodificación, captions, safe areas/legibilidad, errores del renderer, integridad/procedencia de assets y revisión de keyframes. Registrar por rendition. La revisión editorial humana y aprobación final son campos separados.

## Protocolo entre agentes

Pi mantiene el workflow, skills y herramientas comunes. Claude (u otro agente editorial asignado) trabaja únicamente en el paquete de video que el responsable le asigne. Antes de editar, declarar archivos asignados y revisar `git status`/`git diff`; no editar un archivo que otro agente tenga en curso. Entregar un resumen de rutas absolutas, cambios, checks y bloqueos. No hacer commit, despliegue ni distribución sin instrucción explícita.
