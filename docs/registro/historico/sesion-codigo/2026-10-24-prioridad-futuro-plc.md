---
tipo: historico-ia
fuente: sesión Pi Coding Agent
desde: 2026-10-24
hasta: 2026-10-24
tags: [registro, historico-ia, plc, fractal, despliegue]
---
# Histórico: prioridad del futuro simulado PLC

**Autor · 2026-10-24 UTC:** «commit push deploy

y lo que preguntas, una cosa es el futuro simulado con los escenarios y otra diferente es la optimizacion , asi que deberiamos primero completar el futuro simulado con el escenario de datos leido desde el plc hacia fractal, y otra diferente es la optimizacion, deberiamos primero trabajar en futuro simulado  y cuando ese este ok ahi si evaluamos de nuevo a fractal optimizacion hora a hora»

**IA · 2026-10-24 UTC:** Separé el flujo de proyección base/alternativa de la optimización experimental: Fractal ahora consulta tags y perfil activo guardado de la misma sesión PLC a través de `/studies/horizon/from-plc`; la HMI no le entrega su copia de esos datos ni ofrece optimización mientras se valida el forecast. Se distingue en documentación la galería estática de los dos servicios Python que necesitan alojamiento y proxy propios. Se actualizaron bitácora, decisión D71 y plan. Se verificaron 36 pruebas específicas, Ruff, typecheck, build y validador. Commit `582e7ef` en la rama `feat/plc-fractal-future-simulation`, push a origin y PR #78. El workflow Deploy publica Gallery solo tras aprobar y fusionar en main; no se desplegaron APIs Python ni proxy HTTPS/WSS. Sin datos de acceso ni credenciales.

**Herramientas:** lectura/edición de API Fractal, PLC HMI, pruebas y registro; verificaciones con pytest, Ruff, pnpm y Git; GitHub Actions/Podman según disponibilidad.
