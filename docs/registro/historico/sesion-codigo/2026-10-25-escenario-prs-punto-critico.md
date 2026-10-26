---
tipo: historico-ia
fuente: sesión de código (identificador no disponible en el contexto recuperado)
desde: 2026-10-25
hasta: 2026-10-25
tags: [registro, historico-ia]
---
# Histórico: escenario PRS de salida variable en punto de control fijo

## Mensajes recuperables

- **Andy, fecha UTC no recuperada:** «go».
- **Andy, fecha UTC no recuperada:** «no veo en la grafica las de emulador».
- **Andy, fecha UTC no recuperada:** «ahi no veo las de fractal, es por que no estan calvuladas aun. elnemulador que escenario uso _».
- **Claude, registro reconstruido desde el resumen persistido:** continué el siguiente paso del plan: crear el modo AUTO de salida variable que sostiene provisionalmente 18 mca en L4.C44; enlazar un sensor explícito de C44 separado de la mínima global; contrastar C44 y las 64 viviendas para demanda ×0,9/×1,0/×1,1; mantener la rama manual cerrada y la optimización deshabilitada.

El historial previo a esta continuación había sido compactado. No se dispone del texto literal de mensajes anteriores; no se reconstruye ni se atribuye al autor una confirmación de que C44 sea el punto crítico físico.

**Respuestas IA a las observaciones de la gráfica:** el HTML inicial mostraba solo un punto del emulador porque el replay guardado cubría una hora. Extendí el replay a las 24 horas y regeneré la gráfica con 24 marcas por piso para ambos modelos. Las curvas Fractal sí estaban calculadas, pero quedaban visualmente solapadas por ser muy próximas; hice el HTML autocontenido y añadí un subgráfico ampliado de diferencia PLC−Fractal. El emulador usa el perfil `pdd-prs-punto-critico-18-01`: demanda PDD-RCA-01, rama AUTO y control variable de 18 mca en C44; rama manual cerrada.

## Trabajo y resultado

Se añadió el modo `critical_point` a la PRS AUTO, un puerto independiente `grid-04.control_point → prs-01.control_point_pressure`, el perfil `pdd-prs-punto-critico-18-01`, y soporte de lectura en Fractal con solver hidráulico independiente. El punto fijo queda restringido a C44 en este modelo. La HMI permite seleccionar el modo y mostrar control, objetivo, presión mínima global y margen de las 64 viviendas; no escribe al PLC desde Fractal.

La evaluación Fractal abarca 24 horas y 72 escenarios de demanda: en todos, C44 queda empatado con el mínimo global dentro de 0,00001 mca; comparte ese mínimo con C43, C24, C34 y otras viviendas, por lo que no es único. La mínima calculada es 17,99807 mca (>15). Después se ejecutó el replay dinámico completo del emulador virtual: 86.371 muestras a 1 s entre t=30 y 86400; mínima 17,51569 mca en C44 y cero muestras bajo 15. La gráfica compara las 24 marcas horarias de ambos modelos, mientras el mínimo de 1 s puede ocurrir entre ellas. No se afirma equivalencia con una instalación física.

Evidencia: [[../../architecture/validation/pdd-prs-critical-point-18-01-validation.json]], [[../../architecture/validation/pdd-prs-critical-point-18-01-validation-hourly.csv]] y [gráfica HTML por piso](../../architecture/validation/pdd-prs-critical-point-18-01-pressure-by-floor.html). Diseño y límites: [[../../architecture/prs-critical-point-scenario]]. Verificación: suite completa Python, 368 pasaron y 1 omitida, antes de los últimos ajustes de pantalla/contrato; luego pasaron 22 pruebas dirigidas de API, Fractal y modelo. Con el código final pasaron Ruff, `twin-lib validate`, validación de planta y modelo Fractal, typecheck, 149 pruebas de geometría, build de Gallery, validación JSON Schema del perfil normalizado y diff-check.

## Continuación 2026-10-26 UTC: diagnóstico de ciclos

**Andy (hora exacta no disponible):** «haz la comparacion, he asignado un modelomas potente astra para revisar la tarea de entender por que los flujos y caudales varian tanto entre emulado y fractal,».

**IA:** «Voy a comparar los arranques, las paradas y los volúmenes transferidos, empezando por los primeros ciclos del perfil C44. Mantendré los modelos sin cambios para localizar dónde empieza la divergencia; después podremos probar cada posible causa por separado.»

Herramientas: lectura de integración Fractal y secuencia PLC; ejecución de `trace_recirculation_cycles.diagnose` con perfil C44 durante 2 h; JSON/CSV persistidos. Tres ciclos; desfases de parada −3,919/−11,465/−20,138 s. Fractal contabiliza 9,101991 m³, PLC 9,137727 m³. Sobrepaso de nivel PLC y conmutación interpolada Fractal identificados; todavía no se ha aislado cada contribución ni cerrado balances efectivos de vasos. Informe: [[../../architecture/validation/pdd-prs-c44-cycles-diagnosis]]. No se modificaron modelos ni mandos operativos.

## Plan y primeras pruebas, 2026-10-26 UTC

**Andy (hora exacta no disponible):** «escribe un plan md para esas pruebas y comienza con ellas y ve dejando evidencia, necesitamos resolver eso pronto».

**IA:** «Voy a dejar el plan en Markdown y empezar con el balance de los tanques y el primer ciclo con demanda constante. Guardaré las muestras por segundo y los resultados de cada prueba, sin modificar todavía los modelos.»

Herramientas: nuevo plan y script `diagnose_c44_tank_balance.py`, ejecución real de t=30 a 1800, 5310 filas CSV y resumen JSON. Balance PLC por vaso, por paso y contra contadores verificado por aserciones (<1e-8 m³). Diferencia bomba/recepción 0,309 litros. Experimento de niveles verdaderos reduce adelanto de parada 3,919→2,668 s; aún quedan 10,158 litros de diferencia en retorno Fractal frente al recibido PLC. No se cambió física ni se declaró causa raíz completa. Detalle y estado: [[../../architecture/recirculation-parity-test-plan]].

## Herramientas

Lectura de contratos, perfiles, runtime, solver y HMI; ediciones de Python/YAML/JSON/TypeScript; pruebas dirigidas de emulador y Fractal, validación del modelo y tipo/build de Gallery; proyección completa Fractal de 24 horas; replay PLC virtual de 1 hora; generación de JSON/CSV reproducibles.
