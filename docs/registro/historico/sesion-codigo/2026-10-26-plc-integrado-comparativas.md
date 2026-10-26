---
tipo: historico-ia
fuente: sesión de código
desde: 2026-10-26
hasta: 2026-10-26
tags: [registro, historico-ia]
---
# PLC únicamente dentro del modelo 3D y comparativas

## Solicitud del autor (2026-10-26 UTC, hora exacta no recuperada)

**Andy:** «el panel plc solo debe quedar en la pagina dentro del modelo 3d».

**Andy:** «y las graficas comparativas de los escenarios deben quedar tambien en el panel delplc que esta integrado en el 3d».

**IA:** «También integraré las comparativas en una pestaña del PLC dentro del 3D, con un selector para C44 a 18 mca y salida fija a 40 mca. Las marcaré como evidencia precalculada, separada de la sesión en vivo.»

## Implementación y evidencia

`plc-entry.ts` solo carga la HMI en el iframe `water-plc-frame` del mismo origen. Fuera de él redirige al escritorio conservando parámetros, elimina `embedded` y fija `workspace=plc`. Se mantiene `plc.html` como recurso interno, no como aplicación independiente. El arranque no muestra temporalmente la HMI antes de redirigir.

`plc-comparisons.ts` empaqueta dos JSON de evidencia vía Vite e incluye selector sin mandos, curvas PLC/Fractal y error relativo porcentual por señal. No representa datos en vivo ni certifica instalación. Niveles ausentes del escenario fijo quedan pendientes; caudales de referencia cero no producen porcentajes inventados. El contexto `screen` se propaga al iframe.

Typecheck y build pasan. Smoke browser sobre build: acceso directo redirige a 3D, C44 16 paneles/32 SVG, fijo 13 paneles/20 SVG y 3 niveles pendientes. La pestaña de browser del harness estaba oculta y suspendía requestAnimationFrame durante arranque 3D; para el smoke se sustituyó RAF por temporizador solo mediante `addInitScript`, no en el producto. API local de prueba aislada; no se inició sesión ni se enviaron mandos.

Trabajo hidráulico previo permanece separado: replay de salida fija ampliado con siete caudales, 144 pares de distribución, desviación estándar relativa 0,006718 %, varianza 0,0000451323 %², máximo 0,02240865 %. No mezclar recirculación con esas estadísticas de distribución.
