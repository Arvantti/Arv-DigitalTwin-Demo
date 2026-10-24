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

**Autor · 2026-10-24 UTC:** Aclaró que Fractal no debe ser exactamente igual al emulador: desviaciones acotadas son esperables en gemelos digitales; mencionó 2 % y 4 % como recuerdos orientativos de otros sistemas. Indicó continuar.

**IA · continuación:** Registré la decisión D72 sin convertir esos porcentajes en un umbral aprobado ni afirmar calibración con realidad física. Construí un comparador reproducible de las 24 consignas diurnas del PLC con ventanas estabilizadas de 120 s por punto y guardé el informe íntegro. Caudal medio/pico 0,20/0,65 %, presión crítica 0,15/0,44 %, descarga 0,06/0,15 %, PRS 0,16/0,42 %; ningún desacuerdo sobre ≥15 mca. Distinguí expresamente ese contraste por punto de régimen de una operación continua de 24 horas con niveles/transitorios, que sigue pendiente.

**Autor · 2026-10-24 UTC:** Preguntó si cada hora pasó a durar un minuto; aclaré que la HMI sigue en ×240 (15 s reales por hora), mientras la validación offline no se rige por ese reloj. Solicitó revisar la causa del ≈35 % de diferencia de nivel comparando emulador y Fractal.

**IA · continuación:** Corrí un día continuo de 86.400 pasos: suministro difirió hasta 34,47 **puntos porcentuales**, mientras la distribución se mantuvo dentro de 0,6 % en picos y la masa total quedó próxima a 4,53 m³. A iguales niveles y velocidad, la curva de la bomba de retorno independiente coincidió dentro de 0,054 m³/h en 25 muestras; reanclando el estado de los tres tanques desde PLC a cada hora, el error de suministro de la hora 4 bajó de 13,94 a 3,17 puntos en el diagnóstico posterior al arreglo (retorno 0,688→0,122 m³). La explicación es el desfase amplificado de arranques y paradas con histéresis en horizonte abierto, no falta de capacidad ni un cambio de velocidad. Detecté un defecto adicional: la API PLC remuestreaba sensores al consultar dos veces el mismo segundo simulado; ahora comparte un snapshot por tick e invalida con comandos. Se ensayó y descartó propagar tres tanques por escenario: multiplicaba el tiempo de proyección sin cubrir el desfase de fase con una banda de demanda. Se evita presentar `robust` como validación real. La corrida completa debe repetirse con el snapshot corregido; no se declara terminada la validación de tanques ni se habilita la optimización.

**Herramientas:** lectura/edición de API Fractal, PLC HMI, pruebas y registro; verificaciones con pytest, Ruff, pnpm y Git; GitHub Actions/Podman según disponibilidad.
