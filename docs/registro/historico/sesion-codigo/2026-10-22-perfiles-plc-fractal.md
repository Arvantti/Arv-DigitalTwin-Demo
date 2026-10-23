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

## Herramientas

Se inspeccionaron contratos PLC, API FastAPI/WebSocket, HMI TypeScript/CSS, geometrías 3D y pruebas. Se ejecutaron pruebas API, Ruff, TypeScript y pruebas de geometrías; no se usaron credenciales ni infraestructura física.
