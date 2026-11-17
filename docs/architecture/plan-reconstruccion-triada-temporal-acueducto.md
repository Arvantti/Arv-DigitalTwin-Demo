# Plan: tríada temporal PLC, cosimulación y optimización del acueducto

## Objetivo

Representar en HMI/PLC virtual y gemelo 3D tres recorridos independientes —emulador, cosimulador y optimizador— sobre una línea temporal común. Cada recorrido conserva su historia y resultados; una comparación puede ser bipartita o tríada según las fuentes solicitadas. Un único playback sincronizado presenta las fuentes disponibles en curvas y en la escena 3D sin volver a simular.

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
11. **Identidad de comparación inmutable.** `comparison_id` referencia una comparación concreta, no solo un grupo por sesión. Su manifiesto fija el perfil/hash, snapshot y tiempo base, horizonte, paso y linaje de entradas. Cada `run_id` se asocia solo si coincide con ese manifiesto; cualquier cambio genera una comparación nueva.
12. **Fuentes opcionales.** Emulador, cosimulación y optimización tienen estados independientes (`no_solicitada`, `en_proceso`, `lista`, `bloqueada`, `fallida`). Una comparación bipartita es válida; optimización puede añadirse después solo si usa el snapshot/manifiesto original.
13. **Roles correctos.** El emulador representa el proceso físico y responde a mandos de la HMI/PLC virtual. No controla un PLC físico. Fractal y cosimulación leen el mismo contexto operativo, calculan por separado y nunca escriben tags operativos.
14. **Edición temporal segura, sin retardo fijo `d`.** La edición desde un punto de gráfica debe resolver su tiempo/franja absoluta contra el reloj de simulación vigente. Una franja cuyo inicio sea menor o igual al tiempo actual es de solo lectura; el backend vuelve a validar al guardar/aplicar para cerrar carreras entre avance del reloj y edición. El pasado nunca se reescribe. Una franja futura se edita como cambio de escenario futuro y pasa a ser efectiva automáticamente en su tiempo programado, sin botón Guardar de cambios operativos. Se informa claramente qué franja no se puede editar y por qué. No se impone margen fijo de dos horas.
15. **Invalidación de proyecciones por versión de escenario.** Cada cambio futuro crea una versión/hash nueva del escenario. Los resultados de cosimulación/Fractal calculados sobre una versión anterior permanecen consultables como historial, pero se marcan obsoletos para el escenario vigente; solo se recalculan cuando el usuario lo solicita.
16. **Selección explícita de motores y trayectorias.** El usuario decide iniciar emulador, cosimulación y Fractal. Cosimulación calcula sin optimizar; Fractal optimiza únicamente el futuro para el objetivo configurado. Ningún resultado futuro se aplica automáticamente al emulador/PLC. Al concluir Fractal, el usuario elige qué trayectoria futura reproducir en 3D.
17. **Permisos de edición para visor.** El `viewer` puede crear y editar escenarios privados/sandbox versionados y solicitar cálculos sobre esa copia, sin alterar sesiones compartidas ni mandar comandos al PLC. No puede publicar/aplicar su escenario en una sesión compartida ni modificar perfiles ajenos; esas acciones requieren un permiso operativo explícito. Autorización backend, aislamiento de resultados y cuotas de cómputo son requisitos, no basta ocultar controles en la interfaz.

## Slice acordado para avanzar

### Aceleración medida del emulador

- [x] Medir en el Acueducto 24 h simuladas para cada selector vigente (×60, ×120, ×240, ×600), reportando duración real, velocidad efectiva, carga/pasos y cualquier tiempo pendiente o descartado. No asumir que el multiplicador solicitado equivale al alcanzado. Resultado y límites en `docs/architecture/validation/acueducto-emulator-24h-benchmarks-2026-11-16.md`; script de reproducción en `tools/hydraulics/benchmark_emulator_day.py`.
- Optimizar el bucle sin aumentar el paso físico ni cambiar la física para maquillar rendimiento. Eliminar o hacer observable cualquier descarte de pasos; informar degradación cuando el objetivo no se alcance.
- Aceptación: informe reproducible, comparación de señales/regresión hidráulica y ausencia de descarte silencioso.
- **Primer diagnóstico local (no es benchmark completo):** el solver disperso seleccionaba el siguiente pivote escaneando todos los nodos restantes. Se reemplazó por una heap de mínimo grado con desempate determinista. En 60 pasos del Acueducto, comparación secuencial en el mismo proceso: 49,1 pasos/s referencia y 76,4 pasos/s optimizado (1,56×); snapshots finales idénticos. Es una prueba corta, no acredita 24 h a cada multiplicador ni rendimiento en producción.
- La sesión ahora publica `effective_speed` y `simulation_lag_s`, acumula presupuesto usando reloj monotónico y tiempo real transcurrido, no descarta retraso y cede el event loop entre lotes de 10 pasos; cuando va al día espera solo hasta el siguiente paso objetivo. La HMI muestra hora simulada, objetivo ×, velocidad efectiva y retraso.
- **Smoke test aislado anterior (≈4,3 s por velocidad):** objetivo ×60 → ×57,2 (retraso 3 s); ×120 → ×66,5 (211 s); ×240 → ×58,6 (769 s); ×600 → ×60,5 (2248 s). No equivalía a corrida diaria. El benchmark sostenido inicial está registrado en `docs/architecture/validation/acueducto-emulator-24h-benchmarks-2026-11-16.md`: ×60 promedió 60,00× con 0,16 s pendientes; ×120/×240/×600 promediaron 71,33×/70,08×/76,35× y acumularon 16,37/58,21/164,65 h simuladas pendientes. Luego se cacheó el orden estructural de mínimo grado: A/B de 600 pasos, 1,078× y snapshots idénticos; corridas cortas actuales rondan 90× para selectors altos pero acumulan presupuesto. Pruebas locales en memoria, no son producción. Falta repetir 24 h por selector tras esta optimización y comparar señales a tiempo idéntico.

### Edición futura desde gráficas

- Cada punto editable lleva tiempo/franja absoluta, no solo índice visual. Al seleccionar, mostrar fecha/hora de simulación y parámetro afectado.
- Bloquear en UI y backend todo punto cuya franja ya inició; aviso claro indicando el intervalo bloqueado porque corresponde al pasado/en curso. Revalidar al confirmar por si el reloj avanzó después de abrir el editor.
- Aceptar cambios solo en franjas futuras. Aplicarlos automáticamente al llegar su tiempo; conservar historial y versiones anteriores. No exigir `d = 2 h`.
- Tras cambiar parámetros, identificar como obsoletos los futuros de cosimulación/Fractal incompatibles. No recalcular automáticamente: presentar la acción explícita para solicitar cada motor.

### Curvas, playback y gauges

- [x] HMI dibuja curvas sincronizadas por `comparison_id` y origen, con leyenda/color estable, unidades, calidad declarada y datos faltantes explícitos: apertura VRP; presiones de entrada/salida VRP; alimentación antes y caudal a la salida de VRP; descarga de bomba; presión crítica y mínima por piso; consumos/fugas; válvulas entre pisos; niveles de tanques; recirculación; velocidad/potencia/número de bombas. Las señales discretas usan escalones y huecos rompen la curva; no se interpolan. Falta E2E con corridas de motores reales persistidas.
- Emulador: historia observada y presente. Cosimulador: reconstrucción disponible y futuro sin optimización. Fractal: resultado optimizado del futuro y objetivo/restricciones usados. Aperturas/consignas se representan como escalones; nunca rellenar una señal no producida por un motor.
- [x] HMI permite elegir explícitamente Emulador/Cosimulador/Fractal como trayectoria 3D única; las curvas mantienen la comparación simultánea. La reproducción usa frames persistidos exactos. Completar gauges anclados en puntos físicos con valores independientes y etiquetas Emulador/Cosimulador/Fractal; la tabla actual sigue mostrando `—` cuando falta una fuente.
- Aceptación: cursor temporal común entre curvas y gemelo, solo frames persistidos/alineados, cambio de escenario obsoleto visible y ningún playback modifica mandos.

### Permisos del visor — decisión tomada, implementación pendiente

El visor puede crear/modificar escenarios privados y solicitar cosimulación/Fractal sobre una copia aislada; no puede cambiar sesiones compartidas, perfiles ajenos ni tags operativos. El escenario y sus resultados son privados por defecto. Compartir/publicar o aplicar requiere autorización independiente. El backend debe imponer propietario/permisos y límites de cómputo; `view` global no se convierte en mando operativo.

## Modelo de datos propuesto

### Ejecución y frame

Cada serie persiste como ejecución independiente, con al menos:

- `run_id`, `session_id`, `source` (`emulator`, `cosimulation`, `optimization`), estado y origen temporal;
- `profile_id`, versión y hash del perfil inmutable compartido;
- versión del modelo, configuración/objetivo y referencia al snapshot inicial;
- para cada frame: `simulation_time`, índice/tick, señales, calidad, procedencia y estado de cálculo.
- un contrato visual canónico de `observables` (presiones en mca, apertura VRP en %, caudales en unidades declaradas) y `flows` asociados a tramos/entidades del layout, más calidad y origen; cada solver mapea sus salidas sin rellenar variables ausentes.

Los frames de emulador son observaciones de la sesión. Los del cosimulador son cálculos de su único modelo. Los del optimizador identifican los tramos reconstruido y optimizado. No se etiquetan cálculos como observaciones.

### Manifiesto de comparación y reproducción

Cada `comparison_id` tiene una definición inmutable con `session_id`, `profile_id`, hash canónico, `snapshot_id`, `base_time_s`, `time_step_s`, `horizon_s`, rejilla temporal exacta y procedencia del snapshot. Los `run_id`, versiones de modelo y cambios de estado por fuente se anexan como eventos; se validan contra esa definición antes de publicar. Reintentos del mismo `run_id` son idempotentes; una corrida distinta no puede reemplazarlo.

Una comparación puede tener dos o tres fuentes calculadas; la fuente emulador se referencia a frames realmente guardados de esa sesión. La tríada es la vista de un instante: enlaza los frames existentes de cada fuente y declara ausencias/desalineación. La API no completa muestras. Fractal puede añadirse más tarde sobre el snapshot persistido original; no se toma silenciosamente el estado PLC más reciente.

El playback usa una sola línea temporal y actualiza juntas las curvas y la capa 3D. Solo muestra valores en tiempos exactos guardados; sin coincidencia, indica «sin frame». El playback no inicia cálculo ni manda comandos.

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
- [x] Añadir orquestación de cosimulación desde la sesión PLC y publicación append-only de sus frames al endpoint común del historian; faltan durabilidad distribuida y configuración del modelo real.
- Conservar resultados anteriores al recalcular; evitar actualizaciones destructivas y soportar reintentos idempotentes.
- Crear consultas por sesión, ejecución, origen y rango temporal; generar referencias de tríada sin alterar las series.
- [x] Crear manifiesto inmutable por `comparison_id`; enlazar `run_id` de cada origen y rechazar sesión, perfil/hash, snapshot, base temporal, paso u horizonte incompatibles. Incluye hash de entradas y listas explícitas de tiempos de historial/futuro; publicaciones validan cada frame contra el contexto.
- [x] Permitir comparaciones bipartitas con estados persistidos por fuente (`not_requested`, `in_progress`, `ready`, `blocked`, `failed`); asociar una optimización tardía solo desde el snapshot guardado del manifiesto.
- Resolver retención y almacenamiento local/Cloudflare antes del despliegue.

**Aceptación:** se puede guardar y consultar una comparación parcial; una fuente incompatible se rechaza y requiere nuevo `comparison_id`; ningún endpoint de resultados escribe tags de mando; repetir un envío no duplica frames.

### Fase 3 — Cosimulador de modelo único

- [x] Refactorizar `cosimulation/runner.py` y `apps/cosimulation-engine-api/` para eliminar participantes `emulator` y `fractal` y su acople Jacobi; ahora se configura un solo endpoint `COSIMULATION_MODEL_URL/v2/project`.
- [x] El trabajo consume historial/snapshot del PLC, perfil compartido y horizonte/paso con la rejilla futura exacta del manifiesto; el único modelo debe generar frames propios de pasado disponible, presente y futuro. **Pendiente:** implementar y configurar el endpoint/modelo hidráulico.
- [x] Adaptar el solver horario existente `fractal/hydraulics/runtime/mpc.project_24h` tras un adaptador v2; no se duplica la física ni se invoca la optimización. El adaptador conserva historia/presente y verifica la rejilla, limita paso 1 h/horizonte ≤24 h, y rotula sus predicciones `assumed_quasi_steady_hourly_not_transient_validated`.
- [ ] Provisionar el endpoint HTTP/transporte interno del adaptador y validar unidades, señales y alcance del modelo; sigue prohibido presentar sus horas como transitorios o como validación física.
- [ ] Convertir las señales del modelo al contrato visual común de gauges/caudales y probar unidades, puntos y tiempos con fixtures de frames persistidos de una sesión.
- Si no hay historial suficiente, marcar desde qué instante puede reconstruirse; no reconstruir datos faltantes ficticiamente.
- [x] Publicar los frames calculados al almacén de resultados del PLC/HMI cuando el modelo devuelve una trayectoria válida; sin modelo configurado, el trabajo queda bloqueado y no publica frames.

**Aceptación:** una ejecución contiene una sola fuente/modelo de cosimulación, tiempos verificables y perfil inalterado; la historia del emulador permanece byte por byte sin cambios.

### Fase 4 — Optimización configurable sobre el mismo perfil

- [x] La optimización tardía desde PLC obtiene perfil, snapshot y rejilla del manifiesto ya guardado; exige objetivo explícito de 10–45 mca antes de fijarlo y publica la ejecución con el mismo contexto. Requiere perfil seleccionado y muestra qué perfil y horas se optimizan.
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
- [x] HMI puede solicitar cosimulación de 24 h con paso editable; envía el perfil activo y reutiliza la comparación seleccionada cuando el origen cosimulado todavía no existe.
- [x] La HMI envía al gemelo 3D el snapshot disponible del frame elegido, rotulado por origen y «NO APLICADO».
- Completar playback persistido de las tres ejecuciones tras integrar frames válidos de cosimulación.
- Reproducir ejecuciones ya guardadas sin re-simular; distinguir datos ausentes, no alineados y no comparables. No interpolar entre motores para fabricar coincidencias.
- [ ] Unificar visualización de curvas por comparación: señales de los tres orígenes con leyenda/color persistente y un cursor temporal compartido; incluir entradas/salidas de VRP y presiones críticas.
- [x] Añadir en la vista 3D una tabla de lectura simultánea con seis presiones, apertura PRS, caudales de bombeo/VRP y columnas para los tres orígenes; usa exclusivamente el frame exacto del slider persistido y muestra `—` si falta. No conserva valores viejos ni envía mandos.
- [ ] Convertir la tabla en gauges anclados en los puntos físicos del 3D y dibujar tres flujos diferenciados sobre la tubería; el modelo cosimulado todavía no entrega un contrato de señales aprobado.
- [ ] Instrumentar seis presiones: salida de bombeo/entrada VRP, salida VRP, salida de piso 1 después de válvula 1–2, salida de piso 2 después de válvula 2–3, salida de piso 3 después de válvula 3–4 y punto crítico de piso 4 (C44). Instrumentar además apertura de VRP en porcentaje para cada origen.
- Diferenciar **Play PLC** (solo avanza el emulador) de **Reproducir comparación** (recorre frames persistidos de las fuentes ya calculadas). Si falta una fuente/frame, mostrar ausencia; nunca conservar su último valor ni interpolar.

**Aceptación:** una prueba guarda dos fuentes, cierra/reabre la vista y reproduce ambas sincronizadas en curvas y 3D; al añadir después una optimización compatible, reproduce las tres. No invoca motores durante playback y los tags operativos del emulador no cambian.

### Fase 7 — Despliegue y operación

- Documentar migraciones, cuotas, retención, observabilidad, errores/reintentos y permisos de las APIs.
- Definir transporte interno autenticado Fractal→Cosimulation Engine→modelo para Cloudflare. Los Containers tienen salida a Internet deshabilitada; no basta configurar una URL pública ni exponer el modelo.
- Documentar salud, cuotas, timeouts y fallo seguro: si engine/modelo no está disponible, no publicar runs ni mostrar frames.
- Desplegar solo con autorización explícita; el despliegue no forma parte de este plan de código.

## Dependencias y riesgos

- El historian debe conservar datos suficientes y con tiempo/origen para reconstruir pasado y presente; lo anterior a la retención no se puede recrear.
- La validez de perfiles compartidos requiere hash/versión, unidad, zona horaria, índice horario y tratamiento de límites de día definidos.
- El cierre de válvulas entre pisos puede reducir caudal a costa de desabastecer pisos; la presión mínima por vivienda y el cumplimiento de demanda son restricciones obligatorias.
- Caudal menor no equivale siempre a pérdida menor. Deben separarse volumen fugado, energía consumida y pérdida hidráulica en válvulas/tuberías.
- Los estudios necesitan límites y curvas de equipo validados; los supuestos se etiquetan y quedan en el resultado.

## Estado actual

El historian fija manifiestos append-only por comparación con perfil/hash, snapshot PLC (incluido tag set), historial/historial hash, tiempo base y rejilla futura explícita. Las publicaciones de cosimulación/optimización deben coincidir en hash, snapshot, origen, paso, horizonte y rejilla; cada frame se valida contra sus marcas `history`, `present` o `forecast`. La optimización tardía reutiliza el snapshot congelado, no relee el PLC vivo. Comparaciones antiguas sin manifiesto no pueden recibir nuevas corridas; HMI las identifica como contexto no versionado y crea otra comparación. El runner v2 de cosimulación transmite la lista exacta de tiempos al modelo y rechaza frames fuera de ella. Las sesiones con capacidad anónima tienen comprobación de propietario al crear/leer manifiestos y publicar runs.

Falta configurar el engine/modelo real: sin `COSIMULATION_ENGINE_API_URL` y `COSIMULATION_MODEL_URL`, el trabajo permanece bloqueado y no hay frames de cosimulación; no se generan datos ficticios. Falta provisionar el endpoint/transporte del adaptador y validar su solver hidráulico con evidencia/unidades, además de una prueba E2E que reproduzca una tríada persistida después de cerrar/reabrir la vista. Las curvas comparativas HMI ya cubren tags hidráulicos disponibles con calidad, unidades, huecos explícitos y cursor sincronizado; la persona usuaria elige qué fuente lleva el playback 3D. Los estados por fuente se guardan append-only y se exponen en el selector HMI; el worker requiere aplicar la migración D1 0004 en el próximo despliegue. El 3D conserva la tabla sincronizada de lecturas, pero siguen pendientes los gauges anclados y los flujos separados sobre las tuberías, además de instrumentar mediciones por punto físico. Benchmark local del scheduler para 24 h simuladas: ×60 alcanzó 60,00× media; ×120/×240/×600 acumularon gran retraso por límite de cómputo. No se comprobó paridad A/B a tiempo idéntico ni rendimiento en producción. Fractal continúa sin cambiar demanda/fugas ni aplicar resultados. No se desplegó.
