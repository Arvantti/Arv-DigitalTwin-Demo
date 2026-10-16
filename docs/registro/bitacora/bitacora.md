---
tipo: bitacora
tags: [registro, bitacora]
actualizado: 2026-10-16
---
# Bitácora de avances

Índice: [[00-indice]] · Plan: [[plan-del-proyecto]] · Cómo actualizarla: [[como-actualizar]] · Plantilla: [[plantilla-entrada]].
Horas en UTC (Colombia = UTC−5). Más reciente arriba. PR = pull request en `Arvantti/Arv-sfot-demo-Fabtimus`.

| Fecha | PR | Resumen | Fase |
|---|---|---|---|
| 2026-10-16 | #12 | Fase 5: la planta de inyección se simula y se ve en la escena (29 inyectoras y banda principal) | 5 |
| 2026-10-16 | #11 | Fase 5: el desvío del pasteurizador regresa a la marmita que descarga (motor, contratos, escena) | 5 |
| 2026-10-16 | #10 | Fase 5: el motor publica el caudal de cada enlace y las tuberías se animan con él | 5 |
| 2026-10-16 | #9 | Fase 5: pasarelas, tuberías animadas y recorrido de cámara | 5 |
| 2026-10-16 | #8 | Fase 5: escena de planta en 3D con simulación en vivo, selección, cámaras y HUD | 5 |
| 2026-10-16 | #7 | Registro para software en Colombia: plan, bitácora, decisiones e histórico de IA (esta carpeta) | transversal |
| 2026-10-16 | #6 | Tolerancia del control de peso en % del nominal | 4 |
| 2026-10-16 | #5 | Motor de planta y línea caliente de 1.000 ml | 4 |
| 2026-10-16 | #4 | Línea de sachets de la planta de salsas | 3 |
| 2026-10-16 | #3 | Corrección del lint que rompía el CI | 3 |
| 2026-10-16 | #2 | Librería de equipos | 2 |
| 2026-10-16 | #1 | Layouts de las plantas | 1 |

## Entradas

### 2026-10-16 22:31–22:45 · PR #12 · Planta de inyección en la escena (fase 5)
- **Fecha/hora (UTC):** 2026-10-16 22:31 a 22:45.
- **Fase del plan:** [[plan-del-proyecto]] fase 5.
- **Solicitado por:** Carlos Andrés Quiceño, «Si» (22:08) a la propuesta de enlazar el desvío del pasteurizador y cubrir la planta de inyección; esta es la segunda entrega, después de fusionar el PR #11 (22:29).
- **Qué se hizo:** `industrial-models/plastic-injection-plant-v1/simulation.yaml` simula las 29 inyectoras con los parámetros del `plant.yaml` (tonelaje, cavidades, peso de pieza, ciclo, robot) sobre el preset de su tonelaje, y la banda principal de 88 m recibe las piezas de la inyectora 3. El puerto `parts_out` de la inyectora publica sus piezas buenas. La banda gana el parámetro `entry_buffer_units` (por defecto 1, sin cambio para la línea de sachets; 8 en el preset de la nave, supuesto): sin él descartaba las ráfagas de 4 piezas por ciclo y perdía la mitad de la producción. Dos escenarios: `nominal` y `conveyor-trip`. La escena y la API no necesitaron código: la planta aparece como simulada. Documentado en `docs/plant-engine.md` y `docs/plant-scene.md`.
- **Verificación:** `uv run pytest` (prueba nueva de piezas sin pérdida entre la inyectora 3 y la banda; las pruebas de la API se ajustaron porque ya no queda una planta solo de plano, y la planta sin simulación se prueba con una copia temporal), `twin-lib validate`, `twin-lib plant validate`, `ruff`, `pnpm -r typecheck` y `pnpm -r test`. Expectativas calculadas a mano: 300 ciclos × 4 piezas, 98 piezas que siguen en la banda (293 s de recorrido), ≈ 700 piezas con la banda detenida 20 min. Capturas con Chromium y la API local: [[fase5e-planta-inyeccion-banda-detenida.png]] (00:35, `conveyor-trip`, banda en falla y `accepting = 0`).
- **Decisiones:** [[decisiones]] D14.
- **Conversación:** [[hilo-desvio-pasteurizador]].

### 2026-10-16 22:08–22:30 · PR #11 · Desvío del pasteurizador enlazado (fase 5)
- **Fecha/hora (UTC):** 2026-10-16 22:08 a 22:30.
- **Fase del plan:** [[plan-del-proyecto]] fase 5.
- **Solicitado por:** Carlos Andrés Quiceño, «Si» (22:08) a la propuesta de enlazar el desvío del pasteurizador y cubrir la planta de inyección. Esta es la primera de dos entregas pequeñas; la planta de inyección va en un PR aparte. El PR #10 ya estaba en `main`.
- **Qué se hizo:** el pasteurizador publica `divert_kg_h` por su puerto `divert_out` y la marmita recibe por el nuevo puerto `return_in` (`returned_kg`): el producto desviado regresa con la receta del batch y se mezcla a la temperatura de retorno, y el descargado neto es descargado − regresado. El motor de planta incorpora `when` en los enlaces (compuerta: el desvío va solo a la marmita que descarga, repartido en proporción si descargan las dos) y una regla de entrada compartida (las dos marmitas comparten la bomba: solo una descarga a la vez; la otra espera). `plant.yaml` agrega el flujo `holding-tube-01 → kettle-02`; en `boiler-trip` el desvío ya no saca producto del modelo (1.498 L devueltos, 1.678 kg) y el batch de la marmita 2 se alarga. La escena no necesitó código: la API entrega los enlaces de esas tuberías y se animan con su caudal. Documentado en `docs/plant-engine.md` y `docs/plant-scene.md`.
- **Verificación:** `uv run pytest` (pruebas nuevas: lo desviado regresa completo y el resto llega al pulmón, el desvío va solo a la marmita que descarga, una sola marmita descarga a la vez, la compuerta nombra una variable del contrato; la prueba de balance anterior se ajustó porque el desvío ya no sale del modelo), `twin-lib validate`, `twin-lib plant validate`, `ruff`, `pnpm -r typecheck`. Expectativas nuevas de `boiler-trip` calculadas a mano (≥ 20 min de desvío × 56 kg/min). Captura con Chromium del escenario `boiler-trip` a ×900 con la API local: [[fase5d-desvio-pasteurizador.png]] (03:16, `divert = 1`, `divert_kg_h = 3360`, `forward_kg_h = 0`).
- **Decisiones:** [[decisiones]] D13.
- **Conversación:** [[hilo-desvio-pasteurizador]].

### 2026-10-16 21:31–22:00 · PR #10 · Caudal real por enlace (fase 5)
- **Fecha/hora (UTC):** 2026-10-16 21:31 a 22:00.
- **Fase del plan:** [[plan-del-proyecto]] fase 5.
- **Solicitado por:** Carlos Andrés Quiceño, «Si» (21:31) a la propuesta de que el motor publique el caudal de cada enlace para animar las tuberías con datos reales. El PR #9 ya estaba en `main`.
- **Qué se hizo:** el motor de planta guarda en cada paso el estado de cada enlace (`snapshot.links`: caudal en kg/h o u/min, temperatura, presión, demanda, `flowing`); el vapor circula con la demanda del destino mientras haya presión. `PlantModel.links_for_flow` asocia los tramos del plano con los enlaces; `GET /api/plants/{id}` entrega en cada tubería `rate`, `unit` y `links`. La escena anima cada tubería con la suma de los caudales de sus enlaces sobre un caudal de referencia (más esferas y más rápidas con más carga, ninguna sin caudal); los tramos sin simular conservan el indicio por estado. Documentado en `docs/plant-engine.md` y `docs/plant-scene.md`.
- **Verificación:** 3 pruebas nuevas del motor (caudal de la descarga igual al de la marmita, vapor a 3 bar y a pedido, servicio sin presión, tramos a enlaces) y una ampliación de la prueba de la API; `ruff`, `pnpm -r typecheck`; capturas con Chromium del escenario `nominal` a ×900 con la API local: [[fase5c-tuberias-sin-caudal.png]] (02:03, solo circula lo que hay) y [[fase5c-tuberias-con-caudal.png]] (04:00, esferas en las tuberías con caudal).
- **Decisiones:** [[decisiones]] D12.
- **Conversación:** [[hilo-caudal-de-enlaces]].

### 2026-10-16 19:25–19:55 · PR #9 · Pasarelas, tuberías y recorrido de cámara (fase 5)
- **Fecha/hora (UTC):** 2026-10-16 19:25 a 19:55.
- **Fase del plan:** [[plan-del-proyecto]] fase 5.
- **Solicitado por:** Carlos Andrés Quiceno, «Si» (19:25) a la propuesta de completar los pendientes de la fase 5 (pasarelas, tuberías animadas y recorrido de cámara). Los PR #7 y #8 ya estaban en `main`.
- **Qué se hizo:** sección `walkways` en el `plant.yaml` (formato nuevo, validado y dibujado en el plano 2D por `render_layout.py`) con dos pasarelas en la planta de salsas; la API entrega `walkways` y `pipes` (flujos `piped`); la escena dibuja las pasarelas con barandas, columnas y escalera, las tuberías por rack con color según el medio y esferas que circulan cuando el origen está en servicio, y un recorrido de cámara de oeste a este que se interrumpe con un clic. Documentado en `docs/plant-scene.md`.
- **Verificación:** pruebas de Python (la de la API de plantas cubre `walkways` y `pipes`), `ruff`, validación de ambos layouts, `pnpm -r typecheck` y pruebas de geometría; capturas con Chromium en `docs/registro/evidencia/`: [[fase5b-proceso-caliente-tuberias-pasarela.png]], [[fase5b-proceso-frio-pasarela.png]], [[fase5b-vista-general-tuberias.png]], [[fase5b-recorrido-de-camara.png]]; el recorrido, probado en el navegador: avanza por las zonas y se detiene con un clic.
- **Decisiones:** [[decisiones]] D11.
- **Conversación:** [[hilo-escena-de-planta]].

### 2026-10-16 18:32–18:55 · PR #8 · Escena de planta en 3D (fase 5)
- **Fecha/hora (UTC):** 2026-10-16 18:32 a 18:55.
- **Fase del plan:** [[plan-del-proyecto]] fase 5.
- **Solicitado por:** Carlos Andrés Quiceño, «si» (18:32) a la pregunta «¿Hago el merge de los PRs #5 y #6 y arranco la fase 5?». Los PR #5 y #6 ya estaban fusionados a `main` cuando el hilo arrancó.
- **Qué se hizo:** API de plantas (`GET /api/plants`, `GET /api/plants/{id}`, `WS /api/plants/{id}/simulate`); página `plant.html` de la galería con zonas por clase higiénica, equipos simulados con su geometría de librería y animados en vivo, volúmenes para los equipos sin tipo, puente grúa, selección de activos con variables y comandos, cámaras por zona y HUD de líneas y eventos; documento `docs/plant-scene.md`. Se aplica la regla D07: ningún valor de tolerancia se fija en la escena, todo viene del motor.
- **Base del PR:** apilado sobre la rama del PR #7 (`docs/registro/` aún no estaba en `main`).
- **Verificación:** 82 pruebas de Python (4 nuevas de la API de plantas), `ruff`, `pnpm -r typecheck` y pruebas de geometría; capturas con Chromium de la vista general, la sala de llenado (escenario `nominal`, ×900), el cuarto de caldera (`boiler-trip`) y la planta de inyección: [[fase5-escena-vista-general.png]], [[fase5-escena-sala-de-llenado.png]], [[fase5-escena-caldera-boiler-trip.png]], [[fase5-escena-planta-inyeccion.png]] en `docs/registro/evidencia/`.
- **Decisiones:** [[decisiones]] D10.
- **Conversación:** [[hilo-escena-de-planta]].

### 2026-10-16 · PR #7 · Registro para el registro de software
- **Solicitado por:** Carlos Andrés Quiceño: «es muy muy importante dejar en el repo redactado el plan en md y los avances de la ejecución del plan, así como respaldo […] el histórico de conversaciones con la IA», y que las notas sean compatibles con Obsidian.
- **Qué se hizo:** carpeta `docs/registro/` como bóveda de Obsidian: [[00-indice]], [[plan-del-proyecto]], esta bitácora, [[decisiones]], [[como-actualizar]] e histórico en [[historico-sesion-codigo]] e [[historico-proyecto]].
- **Verificación:** revisión de secretos con `grep` (el token de un enlace de Drive se reemplazó por `[REDACTADO]`).

### 2026-10-16 17:15 · PR #6 · Tolerancia del control de peso en porcentaje
- **Solicitado por:** el autor (16:46 UTC): la tolerancia «debe ser medida en porcentaje con respecto a cada medida de cada paquete de entrega».
- **Qué se hizo:** el contrato y los presets del `checkweigher` expresan la tolerancia como % del nominal; los porcentajes son equivalentes exactos de los gramos previos (1.000 ml tomate −1,34 % / +5,00 %; 250 ml mayonesa −3,87 % / +5,16 %; 250 ml tomate −3,21 % / +5,00 %; 500 ml mayonesa −3,23 % / +4,95 %).
- **Commit:** `fa8aca1`. Merge `10e11f2`. **Verificación:** 78 pruebas Python, pruebas de la planta y CI (python y web) en verde.
- **Conversación:** [[historico-proyecto]] (hilo «Motor de planta vs cascada»). Decisión: [[decisiones]].

### 2026-10-16 16:02 · PR #5 · Motor de planta (fase 4)
- **Solicitado por:** el autor eligió «motor de planta» frente a la cascada de inyección (15:11 UTC).
- **Qué se hizo:** motor que lee el `plant.yaml`, instancia equipos y los conecta por puertos de material, piezas y servicios; enlaces por puerto en 9 contratos; simulación de la línea caliente de 1.000 ml (marmitas → pasteurizador → sachetadora → túnel → control de peso → encajonadora). Escenarios: turno normal (823 cajas en 8 h), falla de caldera, parada del túnel. CLI `twin-lib plant`. Documentación en `docs/plant-engine.md`.
- **Hallazgo:** con el dosificador al 1,5 % el control de peso rechaza ≈6,8 % de los sachets de 1.000 ml; pendiente el dato real del autor.
- **Commit:** `f67b643`. Merge `f479f04`. **Verificación:** 78 pruebas Python y 41 de geometría; CI en verde.

### 2026-10-16 15:06 · PR #3 y #4 · Merge de la línea de sachets
- **Solicitado por:** el autor: «aprobados los PR», «haz el merge» (15:05 UTC). Merge commit, mismo método que PR #1 y #2; CI en verde, sin conflictos.

### 2026-10-16 12:50–13:42 · PR #4 · Línea de sachets de la planta de salsas
- **Solicitado por:** el autor: las salsas no se guardan en botellas sino en **sachet**, de 250 ml y 1.000 ml (12:50–12:51), y luego 500 ml (13:15); confirmó la ficha (13:19).
- **Commits:** `2decd3c` fichas de la fase 3; `aeb593b` salsas en sachet 250/1.000 ml; `7edddcc` sachet 500 ml; `b73da88` sachetadora vertical `vffs-sachet-filler`; `3bbac13` banda, túnel de enfriamiento, control de peso y encajonadora; `1b7bdb7` pasteurizador tubular y caldera de vapor.
- **Verificación:** escenarios con `expect`, pruebas de Python y de geometría, capturas de la galería.

### 2026-10-16 05:18 · PR #3 · Lint de `render_layout.py`
- Corrección que rompía el CI en `main`. Commits `2b0bfac`/`a7a5031`.

### 2026-10-16 05:09–05:16 · Entrevista y plan con MCP
- **Solicitado por:** el autor (05:02): la creación de equipos por usuarios será por un **conector MCP** entre Claude y la herramienta, como una de las últimas fases. Se agregó al plan (commit `9480c03`) y la entrevista con ficha confirmada (`309c1c5`). PR #1 y #2 aprobados y fusionados (05:16).

### 2026-10-16 04:12–04:51 · PR #2 · Librería de equipos
- **Solicitado por:** el autor (04:06–04:12): tener todos los equipos «como previamente estandarizados, como si fueran librerías […] piezas de código configurado», dentro de una carpeta del repo (no en rama aparte), sin depender de Blender, y «super realista» con referencias visuales.
- **Commits:** `c401925` librería con runtime y tres tipos de referencia; `99328f1` geometría 3D paramétrica, galería, API de simulación y guía de autoría.

### 2026-10-16 03:53 · PR #1 · Layouts de las plantas
- **Solicitado por:** el autor (01:28–01:29): construir primero un ejemplo de planta de inyección de plástico y otro de salsas de tomate para representar manufactura discreta y de procesos, inspirados en dos empresas de Medellín sin nombrarlas. El autor pidió ver los planos 2D (03:56).
- **Commits:** `308a779` inicializa el repositorio; `ab95f37` layouts de inyección y salsas con validador y plano 2D.

### 2026-10-15 23:17 · Inicio
- El autor abre la sesión: revisar el repositorio (vacío) y el documento «ARVANTTI Harness — Industrial Digital Twin». La IA lee el documento, hace cuatro observaciones y propone empezar por la semana 1 del plan (monorepo, contratos, FastAPI, Vite + React Three Fiber). El autor pide primero el plan (23:26).
- **Conversación:** [[historico-sesion-codigo]].

### 2026-10-16 14:58–17:15 · Configuración del proyecto en Claude
- Proyecto «Fabtimus Demo 3D»: instrucciones del proyecto, rutinas (revisión semanal de PRs los lunes; galería de equipos los viernes), modelo por defecto Haiku 5.5 con Sonnet 5.5 y Opus 5.5 según la tarea, y regla del registro de software. Ver [[historico-proyecto]] y [[decisiones]].
