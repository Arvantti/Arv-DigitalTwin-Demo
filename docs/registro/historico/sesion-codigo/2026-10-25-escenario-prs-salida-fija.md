---
tipo: historico-ia
fuente: sesión de código pi `01a16579-c8e7-73a2-9010-cfbb6b34f387`
desde: 2026-10-25 06:08:47 UTC
hasta: 2026-10-25 07:17 UTC
tags: [registro, historico-ia, plc, fractal]
---
# Histórico: primer escenario PRS de salida fija

Índice: [[historico-sesion-codigo]] · Bitácora: [[bitacora]] · Decisión: [[decisiones#PRS automática: salida fija y objetivo de entrada]].

**Autor · 2026-10-25 06:08:47 UTC:** «continua».

**IA · 2026-10-25 07:17 UTC:** Implementé el primer escenario configurable de la PRS: perfil `pdd-prs-fijo-01`, objetivo de entrada 70 mca y salida AUTO fija 40 mca, con rama manual cerrada. La entrada es un objetivo aproximado por compensación del setpoint de bomba con el diferencial bomba→PRS medido; se muestran presiones reales y no se atribuye esta lógica al PLC Grundfos. Fractal conserva el setpoint vigente en la primera franja parcial, muestra la mínima de 64 viviendas para demanda ×0,9/×1,0/×1,1, y la HMI reporta el peor escenario. Replay de 86.371 muestras de 1 s simulado: presión mínima del emulador 30,40013 mca (L4.C44), cero muestras bajo 15; Fractal mínimo 29,33345 mca (L4.C44, hora 11, ×1,1). Evidencia JSON/CSV: [[../../architecture/validation/pdd-prs-fijo-01-24h.json]]. También se actualizó el benchmark estacionario `network.py` con los antirretornos D76–D78, corrigiendo la prueba fallida del CI de PR #82. Suite Python: 367 pasaron y 1 se omitió; Ruff, validación del modelo de planta y Gallery typecheck/build pasaron. Se abrió PR #83: https://github.com/Arvantti/Arv-sfot-demo-Fabtimus/pull/83. Los niveles futuros siguen sin validarse, la muestra de 1 s no certifica presión entre pasos ni física real, y la optimización permanece apagada.

**Herramientas (resumen):** inspección de perfiles, runtime, solver, prueba CI y topología; implementación y tests; replay PLC/Fractal de 24 h, exportación de evidencia; validaciones, commit y PR.

**IA · 2026-10-25 07:17 UTC:** Las verificaciones son sobre los modelos y el perfil de esta demo, no certifican una instalación física ni validan la dinámica de niveles del tanque.
