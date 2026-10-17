---
tipo: bitacora
tags: [registro, bitacora]
actualizado: 2026-10-17
---
# Bitácora de avances

Índice: [[00-indice]] · Plan: [[plan-del-proyecto]] · Cómo actualizarla: [[como-actualizar]] · Plantilla: [[plantilla-entrada]].
Horas en UTC (Colombia = UTC−5). Más reciente arriba. PR = pull request en `Arvantti/Arv-sfot-demo-Fabtimus`.

| Fecha | PR | Resumen | Fase |
|---|---|---|---|
| 2026-10-17 | #18 | Fase 5: sala de control del PLC en la planta de salsas, con gabinete, puesto del operador y panel de gráficos configurable | 5 |
| 2026-10-17 | #17 | Fase 3 y 5: línea de peletizado (tipo `pelletizing-line`) y silo 5 de reciclado enlazados al molino; escenario `pelletizer-jam` | 3 y 5 |
| 2026-10-17 | #16 | Fase 3 y 5: cascada de la planta de inyección (resina seca y humedad desde los secadores, agua de moldes desde el chiller, scrap hacia el molino) y escenarios `dryer-stop` y `chiller-trip` | 3 y 5 |
| 2026-10-17 | #15 | Fase 3 y 5: geometría y comportamiento de empaque, secadores, chillers y molino de la planta de inyección, simulados en la escena | 3 y 5 |
| 2026-10-17 | #13 | Diseño de la tercera planta: acueducto a escala (documento y predimensionamiento, sin código de producción) | acueducto |
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

### 2026-10-17 03:55–04:25 · PR #18 · Sala de control del PLC y panel de gráficos
- **Fecha/hora (UTC):** 2026-10-17 03:55 a 04:25.
- **Fase del plan:** [[plan-del-proyecto]] fase 5.
- **Solicitado por:** Carlos Andrés Quiceño, «nos falta una parte que es la sala de control del PLC, y en el PLC tener como un panel de gráficos que ya después definiremos» (03:54). La parte de empaque de salsas y las rutas de operarios y montacargas del mismo mensaje van en otros hilos.
- **Qué se hizo:** zona `sala-control` (14 × 10 m, junto a la subestación) y tres equipos en `plant.yaml`: `plc-01` (gabinete), `operator-desk-01` y `scada-wall-01` (panel). Pieza de escena nueva `apps/gallery/src/control-room.ts`: gabinete con luces de estado, puesto con dos monitores y panel de 8 gráficos de tendencia dibujados en un canvas con las variables de la simulación (6 asignadas, 2 libres). La API entrega la clave `panel` del equipo; la escena gana la cámara «Sala de control del PLC»; `layout.svg` regenerado; `docs/plant-scene.md` documenta el panel.
- **Commits:** ver el PR #18.
- **Verificación:** `uv run twin-lib plant validate`, `uv run pytest`, `uv run ruff check .`, `pnpm -r typecheck` y `pnpm -r test`. Capturas con la API en vivo: [[fase7-sala-de-control.png]] (panel con los gráficos recibiendo datos de la simulación) y [[fase7-sala-de-control-plc.png]] (gabinete del PLC).
- **Decisiones:** [[decisiones]] D19.
- **Conversación:** [[hilo-sala-de-control-plc]].

### 2026-10-17 02:19–02:50 · PR #17 · Línea de peletizado y lazo de reciclaje
- **Fecha/hora (UTC):** 2026-10-17 02:19 a 02:50.
- **Fase del plan:** [[plan-del-proyecto]] fases 3 y 5.
- **Solicitado por:** Carlos Andrés Quiceño, «No entiendo cómo es que las inyectoras le entregan al molino, no es al revés» (02:19) y, a la propuesta de cerrar el lazo de reciclaje con la extrusora de pellet, «Sí, por favor» (02:19). También preguntó adónde van las piezas después de la inyección; se le respondió con los flujos del plano (sin cambios de código).
- **Qué se hizo:** tipo nuevo `pelletizing-line` en `equipment-library/` con contrato, comportamiento (tolva, capacidad que baja con la suciedad de la malla, temperatura de fundido, potencia), 3 presets, 9 escenarios con expectativas calculadas a mano, geometría 3D (tolva con cargador, extrusor con resistencias, cambiador de malla, baño de agua con hebras, cortadora, big-bag), `FICHA.md` y `README.md`. `simulation.yaml` simula `extruder-pel-01` y `silo-05` (un `vessel` con la forma `silo`) y enlaza molino → peletizado → silo 5 (por la estación de big-bag, sin simular). Escenario nuevo `pelletizer-jam`; `nominal` suma tres expectativas. PR apilado sobre el #16.
- **Commits:** ver el PR #17.
- **Verificación:** `uv run twin-lib validate`, `uv run twin-lib plant validate`, `uv run pytest`, `uv run ruff check .`, `pnpm -r typecheck` y `pnpm -r test`. Expectativas calculadas a mano (arranque en frío: 600 × ln(205 ÷ 3) = 2.534 s; potencia a 86 % de carga: 110 × (0,25 + 0,6 × 0,857) + 8,8 = 92,9 kW; tolva tras el atasco: ≈ 54 kg de 200 kg). Capturas: [[fase6-peletizadora.png]] (galería) y [[fase6-reciclaje-en-la-escena.png]] (escena con la API en vivo, escenario `pelletizer-jam`: tolva al 26,5 %, 46,7 kg entregados al silo 5).
- **Decisiones:** [[decisiones]] D18.
- **Conversación:** [[hilo-cascada-de-inyeccion]].

### 2026-10-17 01:31–01:52 · PR #16 · Cascada de la planta de inyección
- **Fecha/hora (UTC):** 2026-10-17 01:31 a 01:52.
- **Fase del plan:** [[plan-del-proyecto]] fases 3 y 5.
- **Solicitado por:** Carlos Andrés Quiceño, «los equipos todavía se ven como bloques simples […] hay que darle su geometría de verdad […] y después también entonces arrancamos con los equipos de inyección» (01:31). La geometría de empaque, secadores, chillers y molino ya estaba hecha en el PR #15; la de la inyectora ya era detallada (V2, 463 líneas), así que este PR hace la segunda parte: incorporarlos a las inyectoras.
- **Qué se hizo:** el motor de planta gana la magnitud `moisture_pct` (humedad de la resina; esquema, `links.py` y `docs/plant-engine.md`). Contratos: la inyectora publica la resina que pide (`resin_demand_kg_h`) y su scrap (`scrap_flow_kg_h`), recibe caudal y humedad por `resin_in` y la disponibilidad del agua por `cooling_water` (puerto ahora de tipo `material`, como la salida del chiller); sin caudal de resina más de 10 s pasa a `starved`. El secador entrega lo que pide la inyectora y su humedad; el chiller publica `water_ok`. `simulation.yaml` enlaza secador 3 → imm-01, secador 4 → imm-28 (un secador por inyectora: el motor no reparte caudal), chiller 1 → las 29 inyectoras y las 29 → molino (por `sort-01` y `wash-line-01`, sin simular); `plant.yaml` gana los flujos correspondientes sin `piped`. Escenarios nuevos `dryer-stop` y `chiller-trip`; `nominal` recalculado (secador 4: 273 kg/h, no 400; molino: ≈ 100 kg/h, no 300). Dos pruebas nuevas de la inyectora.
- **Commits:** ver el PR #16.
- **Verificación:** `uv run twin-lib validate`, `uv run twin-lib plant validate`, `uv run pytest` (119 pruebas), `uv run ruff check .`, `pnpm -r typecheck` y `pnpm -r test` (57). Expectativas calculadas a mano (consumo de resina 7 × 1,03 ÷ 95 s = 273 kg/h; coladas de las 29 = 79 kg/h y rechazos base = 21,6 kg/h; circuito del chiller sin compresores 360 kW ÷ (4.186 kJ/m³K × 20 m³) = 0,0043 K/s). Capturas de la escena con la API en vivo, escenarios `chiller-trip` y `dryer-stop` a ≈ 1 h 10 min simulados: [[fase6-chiller-trip-moldes.png]] (molde de la imm-01 a 54,8 °C) y [[fase6-secador-4-detenido.png]] (imm-28 en `starved`). La geometría no cambió.
- **Decisiones:** [[decisiones]] D17.
- **Conversación:** [[hilo-cascada-de-inyeccion]].

### 2026-10-17 00:54–01:30 · PR #15 · Equipos de la planta de inyección con geometría propia
- **Fecha/hora (UTC):** 2026-10-17 00:54 a 01:30.
- **Fase del plan:** [[plan-del-proyecto]] fases 3 y 5.
- **Solicitado por:** Carlos Andrés Quiceño, «si asigna un hijlo para ello» (00:54), a la propuesta del coordinador de modelar con geometría propia el empaque, los secadores, los chillers y los molinos de la planta de inyección, que seguían como bloques simples en la escena. Las pasarelas de la nave quedaron fuera de este hilo.
- **Qué se hizo:** cuatro tipos nuevos en `equipment-library/`, cada uno con contrato, comportamiento, geometría 3D, presets, escenarios con expectativas calculadas a mano, `FICHA.md` y `README.md`: `desiccant-dryer` (aire de proceso, residencia y humedad de la resina; falla de regeneración del desecante), `chiller` (etapas por banda muerta, inercia del circuito, derrateo por ambiente, disparo por alta presión), `granulator` (capacidad, desgaste de cuchillas, finos, corriente) y `packing-station` (mesa de espera, ritmo del operario, cambio de caja, tarima). `simulation.yaml` de la planta de inyección los simula (4 secadores, 2 chillers con el segundo de respaldo apagado, el molino de reciclaje y las 4 estaciones de empaque) y enlaza `conveyor-main-01 → pack-station-01`: la banda de 88 m ya entrega al empaque. Documentado en `docs/plant-engine.md` y `docs/plant-scene.md`.
- **Commits:** ver el PR #15.
- **Verificación:** `uv run twin-lib validate` (14 tipos), `uv run twin-lib plant validate`, `uv run pytest` (115 pruebas), `uv run ruff check .`, `pnpm -r typecheck` y `pnpm -r test` (57 pruebas de geometría). Expectativas calculadas a mano (por ejemplo, humedad del ABS a 4 h de residencia: 0,0035 + 0,1965·e^(−4/1,2) = 0,0105 %; chiller con 360 kW de carga: ≈ 85,4 kW eléctricos; molino de 500 kg/h con 300 kg/h de alimentación: 43,96 A). Dos expectativas se corrigieron al revisar mi propia cuenta (no la simulación): el tiempo hasta que la resina deja de estar seca ignoraba el retardo del punto de rocío, y el calor neto del chiller sobrecargado ignoraba el arranque escalonado de las etapas. Capturas con Chromium y la API local (01:19, escenario `nominal`): [[fase5f-secadores-en-la-escena.jpg]], [[fase5f-chillers-en-la-escena.jpg]], [[fase5f-empaque-en-la-escena.jpg]], [[fase5f-molino-en-la-escena.jpg]].
- **Decisiones:** [[decisiones]] D16.
- **Conversación:** [[hilo-equipos-de-inyeccion]].

### 2026-10-17 00:21–00:45 · PR #13 · Diseño del acueducto a escala (tercera planta)
- **Fecha/hora (UTC):** 2026-10-17 00:21 a 00:45.
- **Fase del plan:** [[plan-del-proyecto]], nueva planta de demostración (acueducto), entrega 1 de 5.
- **Solicitado por:** Carlos Andrés Quiceño (00:20): «quiero añadir una nueva planta […] va a representar el sistema de acueducto de una ciudad», con bombeo en paralelo a 80 mca, estación reguladora con rama automática y manual, rejilla de cuatro niveles con válvulas de consumo y de fuga, recirculación, y 20 mca en la válvula más crítica; «por ahora la primera fase es crear el modelo digital» y después Navier-Stokes.
- **Qué se hizo:** documento de diseño `docs/water-network-plant.md` (distribución por pisos, equipos y tipos de librería, predimensionamiento, modelo de simulación con un solucionador hidráulico en el motor, control, KPIs, escenarios, escena 3D, preparación para Navier-Stokes, entregas y supuestos S1–S7) y script `tools/hydraulics/predimensionamiento.py` que reproduce las cifras. `docs/roadmap.md` agrega la planta.
- **Verificación:** el script corre (día: 13,0 m³/h, salida PRV 26,7 mca, 20,0 mca en la válvula crítica; noche al 30 %: PRV automática 20,0 mca y 1,42 m³/h de fugas contra 23,4 mca y 1,50 m³/h con la manual) y pasa `ruff`. Sin cambios visuales, por eso no hay captura.
- **Decisiones:** [[decisiones]] D15.
- **Conversación:** [[hilo-acueducto-a-escala]].

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
