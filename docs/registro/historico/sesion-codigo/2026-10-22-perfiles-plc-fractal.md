---
tipo: historico-ia
fuente: sesión Pi Coding Agent
desde: 2026-10-22
tags: [registro, historico-ia, acueducto, plc, fractal]
---
# Histórico: perfiles PLC y co-simulación Fractal

## Conversación

**Autor · 2026-10-22 UTC:** solicitó revisar el PLC Master para mostrar la estación VRP/PRS y los modificadores de válvulas de usuario; después pidió levantar el sistema localmente.

**IA · 2026-10-22 UTC:** verificó las pantallas de regulación y de consumo, levantó la galería en `127.0.0.1:5173` y el emulador en `127.0.0.1:8000`.

**Autor · 2026-10-22 UTC:** pidió una pantalla, dentro del sistema PLC, para construir perfiles operativos por cada hora. Indicó que cada perfil debe poder crear escenarios, copiar una hora configurada hacia otra, guardar/cargar configuraciones y combinar aperturas globales, por piso o individuales. También pidió pensar la integración de gráficas de optimización del gemelo Fractal.

**IA · 2026-10-22 UTC:** propuso perfiles horarios, historian persistente, comparación entre señales PLC y proyecciones Fractal, y separación entre emulador, PLC y Fractal.

**Autor · 2026-10-22 UTC:** corrigió la arquitectura: Fractal de Ingeniería no puede comunicarse directamente con el emulador hidráulico. Debe leer exclusivamente la información que publica el PLC Master mediante una conexión simulada tipo OPC UA. Las curvas Fractal deben superponerse a las curvas PLC y mostrar futuro base versus futuro corregido; la recomendación no se aplica automáticamente.

**IA · 2026-10-22 UTC:** formalizó el flujo `emulador → PLC virtual → OPC UA simulado de solo lectura → Fractal → recomendaciones → HMI → aceptación de operador → PLC → emulador`, y distinguió medición PLC, proyección base y proyección optimizada.

**Autor · 2026-10-22 UTC:** añadió que el usuario debe escoger las restricciones y objetivos de optimización, por ejemplo presión mínima deseada, máximos de presión y rango de operación de la PRV. Preguntó dónde almacenar Fractal, reiteró la pantalla de perfiles y pidió tanques 3D transparentes con nivel de líquido y flechas de flujo.

**IA · 2026-10-22 UTC:** definió `fractal/` como raíz de algoritmos independientes, con `fractal/hydraulics/models/water-network-scale-v1/`; propuso el plan por fases y las restricciones/objetivos configurables.

**Autor · 2026-10-22 UTC:** eligió la opción **C** para el perfil horario: casas, fugas, válvulas entre niveles y PRV.

**Autor · 2026-10-22 UTC:** pidió documentar el contexto largo en Markdown y luego proceder con el plan.

**IA · 2026-10-22 UTC:** creó `docs/architecture/plc-fractal-cosimulation.md` y comenzó la implementación: perfiles persistentes SQLite, contrato de perfil, ejecución de perfil desde el PLC virtual, tags de solo lectura OPC UA simulados, editor inicial de perfiles, tanques de agua translúcidos y flechas de caudal orientadas por las señales publicadas.

**Autor · 2026-10-22 UTC:** reportó que las tarjetas de niveles 3 y 4 no se veían en el viewport, pidió acelerar a 15 segundos reales por hora hidráulica y solicitó un escenario técnico con apertura uniforme de 30 % en hora 01, máximo 100 % en hora 12 y retorno amortiguado a 30 % en hora 24.

**IA · 2026-10-22 UTC:** ajustó el modo de rejilla para usar las cuatro tarjetas desde 1200 px, cambió el ciclo a 6 minutos y creó `PDD-RCA-01 · Demanda diurna con rampa cosenoidal amortiguada`, disponible como plantilla persistida del modelo.

**Autor · 2026-10-22 UTC:** reportó leyendas de gráficas recortadas y pidió barras explicativas de color para análisis. También pidió que el paro del grupo de recirculación fuera claro y que el control automático se reactive según los niveles críticos de los tanques.

**IA · 2026-10-22 UTC:** corrigió el diseño de leyendas para que cada serie se muestre con su color y significado. El grupo de recirculación ahora expone y muestra explícitamente `AUTO`, `EN ESPERA DE NIVEL`, `RECIRCULANDO`, `PARO MANUAL · AUTO BLOQUEADO`, los niveles origen/destino y los umbrales. El comportamiento existente conserva el arranque automático al retorno ≥ 60 %, paro bajo 20 % y paro con tanque de destino ≥ 90 %; el botón `REARMAR AUTO` vuelve a habilitarlo tras un paro manual.

**Autor · 2026-10-22 UTC:** pidió reorganizar Bombeo/Tanques para caber en una pantalla de 1005 px de alto, mostrar tres gráficas por fila y ofrecer ampliación modal individual con cierre y retorno a la pantalla.

**IA · 2026-10-22 UTC:** agregó modo compacto de escritorio para Bombeo y Día 24 H (sin árbol lateral), tres gráficas por fila en Día 24 H y botón `⤢ AMPLIAR` en cada gráfica de Día 24 H, Tendencias y monitoreo hidráulico. El modal incluye `× CERRAR` y también puede cerrarse con Escape.

**Autor · 2026-10-22 UTC:** pidió reducir las flechas externas de flujo, mostrar dirección dentro de las rejillas y mover únicamente el piso visual para que el nivel negativo de recirculación no parezca enterrado.

**IA · 2026-10-22 UTC:** movió el suelo y cuadrícula del render al piso más bajo declarado, sin modificar cotas hidráulicas; redujo y espació las flechas externas; y agregó indicadores de dirección pequeños en cabezal y ramales de cada rejilla, gobernados por `flow_in_norm` publicado por el comportamiento.

**Autor · 2026-10-22 UTC:** pidió que, al seleccionar un equipo en la escena 3D, se pueda abrir un modal con gráficas de sus señales.

**IA · 2026-10-22 UTC:** añadió un historial de señales numéricas por equipo, el botón `TENDENCIA DEL EQUIPO` en el HUD de selección y un modal con selector de variable, curva, mínimo, máximo, muestras y cierre explícito.

**Autor · 2026-10-22 UTC:** reportó que las cámaras del gemelo parecían la misma vista y pidió zoom real.

**IA · 2026-10-22 UTC:** cambió el encuadre para aceptar dirección de vista explícita. Cada piso/zona usa una dirección distinta, encuadre más cercano y objetivo en su propia cota; los niveles de la rejilla alternan vista lateral. Los botones de cámara indican cuál está activo.

**Autor · 2026-10-22 UTC:** indicó que los eventos predefinidos deben modelarse como perfiles del PLC y reportó que la HMI publicada muestra `SyntaxError: Unexpected token '<'`.

**IA · 2026-10-22 UTC:** verificó que Pages devuelve el HTML estático en lugar de JSON porque el emulador FastAPI/WebSocket no está desplegado allí. La HMI ahora detecta respuestas no JSON, explica que necesita el emulador y admite `?api=https://host-del-emulador`; dejó pendiente acordar la separación entre perfiles operativos y pruebas de falla.

**Autor · 2026-10-22 UTC:** autorizó ejecutar el plan de separación de perfiles, corrección Frontend/Backend y configuración de acceso al emulador.

**IA · 2026-10-22 UTC:** creó las plantillas PLC PFL-BASE-01, PFL-NOC-01, PFL-NOC-02 y PFL-RES-01; agrupó los perfiles operativos en la HMI; añadió validación de respuestas JSON y origen API configurable; y habilitó CORS restringido por `TWIN_CORS_ORIGINS` en FastAPI. Las fallas permanecen como pruebas técnicas, no como perfiles operativos.

**Autor · 2026-10-22 UTC:** indicó que el frontend debe usar Node 26 y autorizó ajustar frontend y backend.

**IA · 2026-10-22 UTC:** alineó Node 26.12.1 en CI, metadatos y build; añadió `Containerfile` para galería estática y emulador FastAPI, `.dockerignore` y guía de ejecución con Podman rootless. El backend sigue en Python 3.12; se conecta mediante HTTPS/WSS y CORS configurado por entorno. Se construyeron ambas imágenes y se comprobó `GET /api/health` en el contenedor del emulador.

**Autor · 2026-10-22 UTC:** reportó que la escena 3D no cargaba al usar los contenedores locales.

**IA · 2026-10-22 UTC:** hizo que `plant.html` respete el parámetro `?api=` para obtener el plano y abrir su WebSocket contra el emulador externo, y que preserve dicho origen al abrir el PLC. Se verificó la escena 3D, sus activos y una simulación en vivo con Playwright sin errores de consola.

**Autor · 2026-10-22 UTC:** pidió registrar en Markdown el plan completo antes de implementar la unificación de sesión PLC, escena 3D y Fractal.

**IA · 2026-10-22 UTC:** creó `docs/architecture/plc-session-fractal-implementation-plan.md` con fases para runtime de sesión única, roles, PLC propietario, 3D visor, historian, tags por sesión, objetivos Fractal, optimización instantánea/futura, recomendaciones con aceptación humana, Podman y pruebas de aceptación.

**Autor · 2026-10-22 UTC:** autorizó implementar la arquitectura de sesión compartida.

**IA · 2026-10-22 UTC:** inició la implementación: añadió `SessionManager` con una planta compartida y difusión de snapshots, endpoints REST/WebSocket con roles `plc`, `viewer` y `fractal`, PLC que crea/inicia la sesión y transmite su identificador al 3D, y escena 3D que se une como visor. Se mantienen los endpoints antiguos durante la transición.

**IA · 2026-10-22 UTC:** verificó la sesión compartida con Playwright: PLC inició una sesión, se reconectó usando su URL, envió el cierre del consumo del nivel 2 y un cliente viewer recibió `grid-02.open_c11 = 0` dentro de la misma sesión. La escena 3D siguió el reloj de la sesión como visor.

**Autor · 2026-10-22 UTC:** pidió señalar en el plan Markdown el punto de avance actual.

**IA · 2026-10-22 UTC:** marcó estados por fase y agregó el diagrama de secuencia de ejecución; el punto actual es C.1 (prueba visual completa y retiro del flujo legado), seguido por historian compartido.

**IA · 2026-10-22 UTC:** completó el retiro del inicio autónomo desde 3D: sin sesión, la escena abre PLC Master; con sesión, permanece como visor bloqueado. Actualizó el plan: C.1 implementado y G (historian compartido) es el bloque actual.

**IA · 2026-10-22 UTC:** completó la implementación inicial del gateway de tags por sesión: schema OPC UA contextual y WebSocket que entrega únicamente tags PLC de solo lectura a Fractal. Actualizó el plan: F (objetivos y optimización Fractal) es el bloque actual.

**Autor · 2026-10-22 UTC:** pidió actualizar avances y pendientes del plan Markdown antes de continuar.

**IA · 2026-10-22 UTC:** añadió el estado consolidado de fases implementadas y el backlog priorizado; el siguiente punto marcado es activar desde PLC el estudio instantáneo Fractal y presentar caso base frente a caso optimizado.

## Herramientas

Se inspeccionaron contratos PLC, API FastAPI/WebSocket, HMI TypeScript/CSS, geometrías 3D y pruebas. Se ejecutaron pruebas API, Ruff, TypeScript y pruebas de geometrías; no se usaron credenciales ni infraestructura física.
