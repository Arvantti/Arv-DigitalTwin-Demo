# Plan: tríada temporal PLC, cosimulación y optimización del acueducto

## Objetivo

Representar en el PLC/HMI y en el gemelo 3D tres recorridos independientes —emulador, cosimulador y optimizador— sobre una línea temporal común. Cada recorrido conserva su historia y resultados, y una tríada los referencia para compararlos y reproducirlos después sin volver a simular.

Este documento corrige el prototipo actual de cosimulación de dos participantes. No afirma que la nueva arquitectura ya esté implementada.

## Decisiones acordadas

1. **Tres series, tres historiales.** Emulador, cosimulador y optimizador guardan frames separados e inmutables. Un cálculo nuevo crea otra ejecución; no reescribe el historial del emulador ni ejecuciones previas de los otros motores.
2. **Un solo modelo de cosimulación.** El cosimulador recibe señales, tiempo, estado y perfil desde el PLC/emulador; calcula su propia trayectoria. No coordina dos modelos participantes.
3. **Un perfil operativo compartido.** Los tres motores usan exactamente el mismo perfil seleccionado, identificado por `profile_id`, versión/hash y sus valores horarios de demanda por vivienda y apertura de cada fuga. El optimizador no cambia demanda ni aperturas de fugas. Si se quiere probar otras, el usuario selecciona o crea otro perfil.
4. **Entradas fijas no son resultados fijos.** Una apertura de fuga definida por el perfil permanece igual; el caudal resultante sí puede variar si cambian las presiones, según el modelo hidráulico.
5. **El optimizador devuelve una trayectoria completa.** Su resultado incluye pasado/presente reconstruidos con los datos disponibles y el futuro de la solución optimizada. El tramo pasado/presente calculado no modifica ni sustituye los datos observados del emulador.
6. **Resultados calculados vuelven al PLC/HMI.** Cosimulación y optimización publican frames en una colección de resultados separada de los tags operativos. El PLC/HMI puede almacenarlos, graficarlos y enviarlos al gemelo 3D; no son mandos ni se aplican automáticamente.
7. **La tríada referencia, no mezcla.** Para un instante, enlaza referencias a los frames de los tres motores. Si uno falta o los tiempos no coinciden, se marca como ausente/desalineado; no se interpola ni se inventan datos.
8. **Objetivos configurados por el usuario.** No se fija un objetivo de 18 mca ni un mínimo duro de 15 mca. El usuario selecciona la presión mínima deseada en un control de 10–45 mca antes de ejecutar. Los límites físicos de los equipos son restricciones distintas: deben provenir de datos validados o señalarse como supuestos.
9. **Precisión del modelo no es objetivo de operación.** El error frente a las señales recibidas (presión, caudal, marcas de tiempo, cobertura) se reporta como validación/calidad. El objetivo operativo es configurable por separado.
10. **Ninguna proyección toma autoridad operativa.** Resultados y perfiles optimizados son de lectura/recomendación hasta que un operador realice una acción explícita de aceptación/aplicación desde el PLC.

## Modelo de datos propuesto

### Ejecución y frame

Cada serie persiste como ejecución independiente, con al menos:

- `run_id`, `session_id`, `source` (`emulator`, `cosimulation`, `optimization`), estado y origen temporal;
- `profile_id`, versión y hash del perfil inmutable compartido;
- versión del modelo, configuración/objetivo y referencia al snapshot inicial;
- para cada frame: `simulation_time`, índice/tick, señales, calidad, procedencia y estado de cálculo.

Los frames de emulador son observaciones de la sesión. Los del cosimulador son cálculos de su único modelo. Los del optimizador identifican los tramos reconstruido y optimizado. No se etiquetan cálculos como observaciones.

### Tríada y reproducción

Una tríada identifica `session_id` + tiempo de simulación y contiene referencias independientes a los frames disponibles, además de estado de alineación/comparabilidad. La API de consulta recupera una ejecución/tríada guardada por rango temporal. El slider navega por los tiempos persistidos; reproducir, avanzar y retroceder no inicia cálculo alguno.

## Fases de trabajo

### Fase 1 — Contratos y perfil común

- [x] Reemplazar el contrato de cosimulación de dos participantes por una solicitud a un único modelo (`cosimulation-job.v2`).
- [x] Definir contratos versionados para solicitud de trabajo, entrada/salida del modelo y resultado temporal. El contrato de tríada/almacenamiento sigue pendiente.
- [x] Pasar al optimizador el perfil guardado seleccionado, con viviendas/fugas horarios y hash canónico; no se aplican escalas de demanda/fuga.
- [x] Validar en el proceso optimizador que el hash coincide exactamente con el perfil recibido.
- Pasar el mismo `profile_id`/versión/hash y serie a cosimulación y tríada; sigue pendiente.
- Validar coincidencia del perfil entre cosimulación, emulador y tríada; sigue pendiente.
- Mantener separados el perfil base inmutable y la configuración/variables de decisión del optimizador.

**Aceptación:** pruebas demuestran que demanda y aperturas de fugas no cambian en ninguna ejecución; cambios del perfil crean una ejecución distinta.

### Fase 2 — Persistencia append-only y API de resultados

- [x] Añadir almacenamiento append-only de ejecuciones de optimización y referencias de tríada en el historian, separado de PLC.Actual.
- [x] Publicar frames forecast del optimizador al historian PLC con hash del perfil; el almacenamiento es idempotente/append-only.
- Añadir recepción/publicación de frames de cosimulación y completar durabilidad distribuida (pendiente).
- Conservar resultados anteriores al recalcular; evitar actualizaciones destructivas y soportar reintentos idempotentes.
- Crear consultas por sesión, ejecución, origen y rango temporal; generar referencias de tríada sin alterar las series.
- Resolver retención y almacenamiento local/Cloudflare antes del despliegue.

**Aceptación:** se puede guardar, consultar y comparar una ejecución completa; ningún endpoint de resultados escribe tags de mando; repetir un envío no duplica frames.

### Fase 3 — Cosimulador de modelo único

- [x] Refactorizar `cosimulation/runner.py` y `apps/cosimulation-engine-api/` para eliminar participantes `emulator` y `fractal` y su acople Jacobi; ahora se configura un solo endpoint `COSIMULATION_MODEL_URL/v2/project`.
- El trabajo consume historial/snapshot del PLC, perfil compartido y horizonte/paso; el único modelo debe generar frames propios de pasado disponible, presente y futuro. **Pendiente:** implementar y configurar el endpoint/modelo hidráulico.
- Si no hay historial suficiente, marcar desde qué instante puede reconstruirse; no reconstruir datos faltantes ficticiamente.
- Publicar los frames calculados al almacén de resultados del PLC/HMI.

**Aceptación:** una ejecución contiene una sola fuente/modelo de cosimulación, tiempos verificables y perfil inalterado; la historia del emulador permanece byte por byte sin cambios.

### Fase 4 — Optimización configurable sobre el mismo perfil

- Requerir perfil seleccionado y objetivo del usuario antes de iniciar; mostrar claramente qué perfil y qué horas se van a optimizar.
- [x] Añadir presión mínima seleccionable y obligatoria entre 10 y 45 mca para la optimización, sin fallback fijo de 15 mca.
- [x] Retirar escalas/overrides del estudio Fractal; el perfil fuente de demanda y fugas permanece intacto.
- Producir perfil de desempeño de la PRS por hora y frames propios de pasado/presente/futuro; guardar la propuesta y devolverla al PLC/HMI como resultado separado.
- Mantener todas las entradas horarias de viviendas y fugas exactamente iguales al perfil fuente.
- Separar dos estudios iniciales:
  1. **Presión/PRS:** variar el control de PRS para cumplir la presión mínima elegida en las viviendas, sujeto a límites físicos documentados.
  2. **Balance entre pisos:** congelar perfil, bombas y PRS; variar solo apertura de las válvulas 12, 23 y 34. Cumplir la presión mínima elegida en todas las viviendas y reportar presión por piso, caudal bombeado, fugas resultantes y caída de presión por válvula.
- No llamar “ahorro de pérdidas” a una simple reducción de caudal si se logra recortando suministro. La demanda del perfil debe quedar satisfecha.
- Después, ofrecer optimización multiobjetivo (presión como restricción y compromisos entre fuga, caudal/volumen, energía y disipación hidráulica). Mostrar alternativas/Pareto o prioridades explícitas; no elegir pesos silenciosamente.
- Considerar bomba como variable solo cuando el modelo exponga un mando físico definido (velocidad/consigna) y estén disponibles curvas/eficiencia. El caudal se reporta como resultado, no se finge como mando independiente.

**Aceptación:** la configuración del trabajo explica perfil, objetivo, variables libres y restricciones; el resultado incluye tanto propuesta como métricas; no altera perfil ni estado PLC.

### Fase 5 — Validación del algoritmo y del modelo

- Comenzar el estudio de válvulas con tres variables acotadas; comparar una malla de combinaciones/referencia determinista antes de elegir método estocástico.
- Para horarios acoplados y varios objetivos, evaluar un algoritmo multiobjetivo (por ejemplo, una búsqueda evolutiva) y verificar cada candidato con el solver hidráulico completo.
- Validar balance de caudal, presiones en las 64 viviendas, caudales de fuga, válvulas, bombas, niveles y límites temporales.
- Marcar los supuestos físicos y no presentar resultados como validados sin datos/ensayos suficientes.

**Aceptación:** pruebas reproducibles cubren perfil nominal, horario variable, fugas con porcentajes distintos, cierres parciales de cada válvula, objetivos en extremos permitidos e infeasibilidad cuando no hay solución.

### Fase 6 — PLC/HMI, slider y gemelo 3D

- [x] HMI consulta comparaciones/tríadas persistidas; el slider recorre frames guardados sin simular ni interpolar y señala fuentes ausentes/desalineadas.
- [x] La HMI envía al gemelo 3D el snapshot disponible del frame elegido, rotulado por origen y «NO APLICADO».
- Completar playback persistido de las tres ejecuciones tras integrar frames válidos de cosimulación.
- Reproducir ejecuciones ya guardadas sin re-simular; distinguir datos ausentes, no alineados y no comparables. No interpolar entre motores para fabricar coincidencias.
- Dibujar los mismos frames/estados de cada origen en las señales PLC y en el gemelo 3D, respetando la geometría y los canales publicados.

**Aceptación:** una prueba guarda las tres fuentes, cierra/reabre la vista y reproduce el mismo recorrido en PLC y 3D sin invocar motores; los tags operativos del emulador no cambian.

### Fase 7 — Despliegue y operación

- Documentar migraciones, cuotas, retención, observabilidad, errores/reintentos y permisos de las APIs.
- Desplegar solo con autorización explícita; el despliegue no forma parte de este plan de código.

## Dependencias y riesgos

- El historian debe conservar datos suficientes y con tiempo/origen para reconstruir pasado y presente; lo anterior a la retención no se puede recrear.
- La validez de perfiles compartidos requiere hash/versión, unidad, zona horaria, índice horario y tratamiento de límites de día definidos.
- El cierre de válvulas entre pisos puede reducir caudal a costa de desabastecer pisos; la presión mínima por vivienda y el cumplimiento de demanda son restricciones obligatorias.
- Caudal menor no equivale siempre a pérdida menor. Deben separarse volumen fugado, energía consumida y pérdida hidráulica en válvulas/tuberías.
- Los estudios necesitan límites y curvas de equipo validados; los supuestos se etiquetan y quedan en el resultado.

## Estado actual

El runner/API de cosimulación usa contrato v2 de modelo único y hash de perfil, pero aún falta implementar/configurar su modelo hidráulico. Fractal exige usar el perfil activo de la sesión para alinear el historial, solicita objetivo 10–45 mca en C44 y publica sus frames forecast en el historian append-only; demanda/fugas quedan sin cambios y los resultados no se aplican. La HMI consulta tríadas, recorre frames guardados y refleja snapshots disponibles en la escena 3D, marcando faltantes. El recorrido Playwright local ejecutó una optimización con objetivo explícito de 18 mca, publicó 24 frames, cargó la comparación tras reabrir la vista y verificó que mover el slider cambia el snapshot 3D sin simular ni aplicar mandos. Falta integrar frames reales de cosimulación y comprobar playback de las tres fuentes. Sin despliegue.
