---
tipo: historico-ia
fuente: sesión Pi Coding Agent
desde: 2026-10-24
tags: [registro, historico-ia, acueducto, plc, fractal]
---
# Histórico: solver Fractal y estudios futuros

## Conversación

**Autor · 2026-10-24 UTC:** «Adelante, hazlo y corrige lo que falta.»

**IA · 2026-10-24 UTC:** Continué el solver hidráulico Fractal sin importar el runtime operativo. Añadí tags PLC de apertura/caudal/presión para las 64 viviendas y fugas; el modelo estima los emisores individualmente, calcula pérdidas Darcy-Weisbach/Swamee-Jain y Kv en la columna serial, y propaga caudales por nivel de forma iterativa. Los perfiles horarios pueden representar aperturas por vivienda y fuga. Optimicé el horizonte para buscar un mando nominal por hora y evaluarlo en los tres casos de demanda con el mismo control. Actualicé el snapshot futuro/tag futuro y la documentación para declarar explícitamente que el solver todavía no resuelve nodos y pérdidas de los ramales domésticos ni está validado contra casos hidráulicos de referencia. Añadí pruebas de cierre individual y del contrato de tags.

Verifiqué Ruff, 28 pruebas específicas de emulador/Fractal/solver, typecheck, build de Gallery, validador Fractal y `git diff --check`. La suite completa excedió 360 s y las ejecuciones de `packages/twin-runtime/tests/test_plant.py` no terminaron dentro de su timeout; no atribuyo ese bloqueo a los cambios hidráulicos. No ejecuté la prueba browser integral optimizado→aprobación→programación→operación; sigue pendiente.

**Autor · 2026-10-24 UTC:** «por que el emulador si resolvia pero el fractal no?»

**IA · 2026-10-24 UTC:** expliqué que había implementado Fractal como solver reducido por decisión de implementación, no por necesidad de la separación PLC/Fractal; reconocí que sus frames no eran predicciones físicas validadas.

**Autor · 2026-10-24 UTC:** «pero no son tan diferentes uno del otro, asi sea nuevo no entiendo por que tanta diferencia»

**IA · 2026-10-24 UTC:** reconocí que Fractal podía reproducir las mismas ecuaciones sin importar el runtime operativo y que había interpretado la independencia de forma demasiado restrictiva.

**Autor · 2026-10-24 UTC:** «claro es lo que habia pedido, lo unico que tienen de diferencia es que fractal calcula los diferentes escenarios de cada hora siguiente mientras que el emulador solo el instantaneo, pero de resto son similares, salvo las de optimizacion de fractal pero aun asi las ecuaciones de fisica son similares»

**IA · 2026-10-24 UTC:** reemplacé la aproximación interior por `nodal.py`, una implementación independiente que arma desde `plant.yaml`, presets y tags PLC los mismos cabezales, cuatro ramales por piso, cruces y 72 emisores por planta; resuelve simultáneamente continuidad y presión con pérdidas Darcy-Weisbach/Kv. Comparé cuatro puntos estáticos contra cifras del banco operativo con tolerancia absoluta 0,04 (presión mca y caudal m³/h). Las curvas y controles de bomba, PRS AUTO y tanques dinámicos siguen pendientes; no se declaran validadas las predicciones completas. Verificación: 31 pruebas específicas, Ruff y validador Fractal; typecheck/build del frontend y diff-check se habían verificado previamente en la sesión.

**Autor · 2026-10-24 UTC:** «arreglemos eso, eso como lo resuelve el emulador? revisa e imitamos la forma como se resuelve eso»

**IA · 2026-10-24 UTC:** inspeccioné `twin_runtime/primitives/hydraulics.py`, `plant_hydraulics.py`, los comportamientos de bomba principal/recirculación, estación PRS y tanques y sus contratos. El emulador arma una red global con bombas en paralelo (H=s²H0−rQ²), antirretornos, PRS de dos ramas, vasos de cabeza fija variable y sus tuberías; en cada paso resuelve la red y actualiza PID, rampa, conmutación/histéresis y balance de tanques. En Fractal agregué `supply.py` para el equilibrio bomba/PRS por hora (incluida rama AUTO asentada) y `recirculation.py` para resolver dos succiones y una bomba de retorno, e integrar niveles con eventos de histéresis. Publiqué los nuevos tags de bombeo, añadí velocidad/potencia/presión proyectadas al frame y aseguré que el borrador optimizado seleccione PRS manual para que la consigna tenga efecto. Contrasté puntos de referencia de bomba/PRS y recirculación contra el emulador y conservación de agua. Un estudio optimizado de 24 h con tags nominales terminó en ≈18 s y marcó factibles las 24 franjas en ese caso. No se ha contrastado aún el ciclo completo contra los snapshots del emulador ni PID/rampas/traspaso de rama y fallas segundo a segundo; no afirmo paridad transitoria total.

**Herramientas:** lectura/edición de `fractal/hydraulics`, adaptadores de tags PLC, pruebas API, documentación de arquitectura/registro; comandos Ruff, pytest, typecheck, Vite build, validador Fractal y `git diff --check`.
