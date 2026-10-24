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

**Autor · 2026-10-24 UTC:** «completslo». Solicitó terminar lo pendiente de Fractal, priorizando el futuro simulado.

**IA · continuación:** Detecté que la proyección arrancada con la bomba apagada tardaba indefinidamente; ahora la ruta de sesión rechaza expresamente ese estado hasta presurizarse. Probé E2E de API con sesión real, perfil guardado, arranque simulado, estudios base/alternativo de 24 horas, publicación/consulta de frames y ausencia de comandos en el gemelo operativo. La ruta offline ya no puede persistir estudios con tags suministrados por el cliente. Corregí visualización de las ocho fugas y caudales por ramal/enlace. Pasaron 39 pruebas específicas, Ruff y typecheck; una prueba por HTTP entre dos procesos FastAPI confirmó 24 frames persistidos. En un contraste adicional de 3600 pasos reales del emulador frente a la primera hora proyectada, la distribución coincidió a ≈0,004 m³/h en promedio. Inicialmente el retorno difirió 0,078 m³ y el suministro ≈1,98 puntos porcentuales; implementé la rampa del variador en el modelo Fractal sin importar el runtime. Nuevo retorno 4,260 vs 4,295 m³ (diferencia 0,035), suministro 69,83 vs 70,7 % (diferencia 0,87). Persiste un desfase de fase/histéresis que impide dar por validada la precisión dinámica. No confundí este E2E de API con la comparación transitoria completa del día ni con una prueba browser 3D: ambas permanecen por verificar.

**Herramientas:** lectura/edición de API Fractal, PLC HMI, pruebas y registro; verificaciones con pytest, Ruff, pnpm y Git; GitHub Actions/Podman según disponibilidad.
