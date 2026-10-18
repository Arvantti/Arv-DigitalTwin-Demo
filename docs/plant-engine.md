# Motor de planta

El motor de planta toma un `plant.yaml`, crea con la librería los equipos que se van a simular y los conecta por sus puertos. Así un equipo deja de recibir entradas inventadas por un escenario y pasa a recibir lo que entrega el equipo vecino: si la caldera pierde presión, el pasteurizador lo siente; si el túnel se detiene, la sachetadora se bloquea.

```bash
uv run twin-lib plant list
uv run twin-lib plant validate                     # enlaces contra la librería y el plano, y escenarios
uv run twin-lib plant run sauce-plant-v1 --scenario boiler-trip --every 600
uv run twin-lib plant run sauce-plant-v1 --json    # muestras y eventos para otra herramienta
```

## 1. `simulation.yaml`

Vive junto al layout, en `industrial-models/<planta>/simulation.yaml`:

| Sección | Qué contiene |
|---|---|
| `equipment` | Los equipos del `plant.yaml` que se simulan: id del plano → tipo de librería, preset y parámetros |
| `links` | Conexiones `equipo.puerto → equipo.puerto`. Cada una debe existir en los `flows` del plano, directa o pasando por equipos que no se simulan (`via`). `max` limita una magnitud, por ejemplo la presión después de una estación reductora; `when: <equipo>.<variable>` abre el enlace solo mientras esa variable sea > 0 (el desvío regresa a la marmita que descarga) |
| `startup` | Comandos que se aplican al inicio de todos los escenarios (`every_s` los repite) |
| `lines` | Líneas con su puerto de salida, para los KPIs de planta |
| `scenarios` | Línea de tiempo y expectativas, igual que en un equipo |

Un equipo del plano sin tipo en la librería no se simula. Si está en medio de un flujo (una bomba, un tubo de retención), se nombra en `via` y el enlace lo atraviesa sin cambios.

## 2. Enlaces por puerto

Cada puerto del contrato puede declarar qué magnitudes viajan por él:

```yaml
ports:
  - { id: items_in,  kind: item, direction: in,  link: { units: inflow_upm, ready: accepting } }
  - { id: items_out, kind: item, direction: out, link: { units: units_out, ready: downstream_free } }
```

El nombre a la derecha es una **variable** del contrato si el equipo la publica por ese puerto, o una **entrada** de `DEFAULT_INPUTS` si la recibe. `twin-lib validate` lo comprueba.

| Magnitud | Sentido | Qué es | Si llegan varias |
|---|---|---|---|
| `units` | adelante | Contador acumulado de unidades; el motor lo convierte en u/min | Se suman |
| `flow_kg_h` | adelante | Caudal de material | Se suman |
| `available` | adelante | 1 si hay producto. Si la salida no la declara, se deduce de `flow_kg_h > 0` | Basta una |
| `temp_c`, `pressure_bar` | adelante | Temperatura del producto, presión del servicio | Promedio de las fuentes que están entregando |
| `moisture_pct` | adelante | Humedad de la resina que entrega un secador, en % | Promedio de las fuentes que están entregando |
| `weight_mean_g`, `weight_sd_g` | adelante | Peso de las unidades. Atraviesa los equipos que no lo publican (el túnel no cambia el peso) | Promedio |
| `ready` | atrás | 1 si el equipo de abajo recibe; llega como `downstream_free` | Todas deben estar listas |
| `demand_kg_h` | atrás | Lo que pide el equipo de abajo (vapor, producto) | Se suman |

Reglas:

- **Un paso de retraso.** En cada paso el motor lee los valores de todos los equipos y calcula las entradas del siguiente. El orden de simulación no cambia el resultado. Por eso, cuando un equipo deja de recibir, alcanza a llegarle lo de un paso: las máquinas de unidades guardan esas pocas unidades en la entrada en vez de perderlas.
- **Sin reparto.** Una salida que entrega `units` o `flow_kg_h` va a un solo destino; repartir entre dos (por formato, por ejemplo) necesita una regla que aún no existe. El vapor sí se reparte: la presión llega a todos y las demandas se suman. La excepción son los enlaces con `when` (compuerta): varios enlaces de una misma salida cuentan como un destino y el caudal se reparte entre los que están abiertos, en proporción al valor de su variable. Así el desvío del pasteurizador regresa a la marmita que está descargando, y si descargan las dos, a cada una según su caudal; el producto no se crea ni se pierde.
- **Una entrada compartida atiende a una sola fuente.** Cuando varias salidas con caudal alimentan la misma entrada (las dos marmitas y la bomba del pasteurizador), solo una descarga a la vez: la que ya circulaba conserva el turno (la primera declarada si hay varias) y las demás reciben `ready = 0` y esperan en estado `blocked`. Si nadie circula, todas están listas y la primera que empiece toma el turno.
- **Las entradas que calcula un enlace no se fijan en un escenario.** El motor lo rechaza para que la prueba no contradiga la planta.

### Caudal de cada enlace

En cada paso el motor deja en `snapshot["links"]` el estado de cada enlace, con id `<equipo>:<puerto>><equipo>:<puerto>` (usa `:` para que las rutas de expectativa, como `links.kettle-01:product_out>pasteurizer-01:product_in.flow_kg_h`, no se corten en el punto):

| Campo | Qué es |
|---|---|
| `from`, `to`, `via` | Extremos del enlace y equipos intermedios sin simular |
| `flow_kg_h`, `units_per_min`, `temp_c`, `pressure_bar`, `weight_*` | Lo que entrega la salida, ya con `max` aplicado (por eso el vapor llega a 3 bar) |
| `demand_kg_h`, `ready` | Lo que pide y lo que acepta el destino |
| `flowing` | `true` si `flow_kg_h` o `units_per_min` son mayores que cero |

Un servicio (el vapor) se entrega a pedido: su `flow_kg_h` es la `demand_kg_h` del destino mientras haya presión útil (> 0,05 bar), y cero si no. Los demás caudales los publica el equipo de origen. Los valores llevan el paso de retraso de la sección siguiente. `PlantModel.links_for_flow(a, b)` dice qué enlaces cruzan un tramo `a → b` del plano; la API lo usa para que la escena anime cada tubería.

## 2b. Dominio hidráulico (redes de agua a presión)

Una red de agua no se puede pasar de equipo en equipo con un paso de retraso: el caudal de cada válvula depende de la presión en su nodo, y esa presión de lo que consumen todas las demás. Por eso el motor tiene un dominio hidráulico (`twin_runtime/plant_hydraulics.py`) sobre el solucionador de `primitives/hydraulics.py`:

- **Puertos hidráulicos.** Un puerto declara `hydraulic: <nodo>`, el nodo de su banco de prueba que expone a la red (por ejemplo `discharge` en el grupo de bombas, `inlet` en la rejilla). El comportamiento implementa `hydraulic_build(net, prefijo, cota)`, que agrega sus elementos a la red de la planta con las mismas funciones de su banco (`add_pump_set`, `add_distribution_grid`…).
- **Enlace hidráulico = tubo.** Un enlace entre dos puertos `hydraulic` no pasa magnitudes: es un tubo de la red. Sale del flujo del plano, que debe ser `piped: true` con `diameter_in` (PVC a presión: 2" = 52,5 mm, 3" = 77,9 mm, 4" = 102,2 mm) o `inner_diameter_mm`; la longitud es la de su `route` (puntos `[x, y, z]`), o `length_m`, o la distancia entre equipos; `minor_k` suma los accesorios (0,5 por defecto). No admite `via`, `max` ni `when`.
- **Cotas.** Cada nodo queda a la cota del equipo (`position[2]` del plano): la presión en mca es la de ese punto.
- **Tanques.** Un `vessel` es cabeza fija: el fondo a su cota más la altura del agua, con una válvula de fondo hacia `outlet` que cierra si se vacía; `inlet` descarga libre por arriba. El motor le fija `demand_kg_h` y `supply_kg_h` con el agua que mueve la red (más lo que llega por enlaces normales, como las bajantes). Si dos tanques comparten una succión y se pasan agua, eso entra al que recibe: el agua se conserva.
- **El equipo no cambia.** Después de armar la red, el motor reemplaza `equipo.net` (su banco) por una vista con su prefijo: `set`, `set_head` y `solve` usan los nombres del banco; lo que solo existe en el banco (la carga, la cabeza de prueba) se ignora.
- **Paso.** Al empezar el paso el motor actualiza los tanques (`hydraulic_sync`) y resuelve la red. Si un equipo cambia algo de la red durante su `update` (velocidad, apertura, consigna), su `solve()` la vuelve a resolver con arranque en caliente: la red responde al instante, como en el banco de cada equipo. Con el paso de retraso, el lazo de presión de las bombas oscilaba de 60 a 81 mca al dispararse una bomba. El resultado depende del orden de `equipment` en `simulation.yaml`, que es fijo. Unas 3 soluciones por paso, ≈ 20 ms para el acueducto a escala.
- **Señales.** `pressure_mca` (telemetría de presión; si llegan varias, la menor: el punto más crítico) y `level_pct` (nivel de un tanque; si llegan varios, el promedio) son magnitudes normales del motor.
- **Snapshot.** Cada tubo aparece en `links` con `hydraulic: true`, `flow_m3h` (con signo), `flow_kg_h`, `velocity_m_s`, `from_pressure_mca`, `to_pressure_mca` y `flowing`; `snapshot["hydraulics"]` dice si la red convergió y en cuántas iteraciones.

## 3. Lo que ya está conectado

`sauce-plant-v1`: la línea caliente de 1.000 ml, con la receta `rcp-tomato-sauce` en las marmitas.

```
caldera ─vapor 3 bar (steam-station-01)─▶ marmita 1, marmita 2, pasteurizador
marmita 1 ┐
marmita 2 ┴─(pump-hot-01)─▶ pasteurizador ─(holding-tube-01)─▶ pulmón ─▶ sachetadora ─▶ túnel ─▶ control de peso ─▶ empaque manual (cajas de 4)
               │
               └─ desvío (holding-tube-01) ─▶ la marmita que descarga
```

| Escenario | Qué muestra |
|---|---|
| `nominal` | Turno de 8 h con dos marmitas alternadas. La línea queda limitada por la cocción: dos batches de 2.000 kg cada 2 h dan ≈ 2.000 kg/h y la sachetadora pide 2.036 kg/h |
| `boiler-trip` | Falla de llama de 1 h. La marmita que calienta gasta el vapor almacenado; bajo ≈ 0,6 bar el pasteurizador ya no llega a 92 °C en la retención y desvía. El producto desviado regresa a la marmita que descarga, así que esa descarga se alarga lo que dura el desvío y la otra marmita espera su turno en la bomba |
| `tunnel-stop` | El túnel se detiene 80 min. La sachetadora se bloquea, el pulmón llega al 90 % y la marmita 2 espera para descargar |

`plastic-injection-plant-v1`: la nave de inyección. Las 29 inyectoras se simulan con los parámetros del `plant.yaml` (tonelaje, cavidades, peso de pieza, ciclo, robot) sobre el preset de su tonelaje, y la banda principal de 88 m recibe las piezas de la inyectora 3 (`imm-03.parts_out → conveyor-main-01.items_in`) y las entrega a la estación de empaque 1 (`conveyor-main-01.items_out → pack-station-01.items_in`). Las demás inyectoras trabajan solas. También se simulan los 4 secadores de resina (`desiccant-dryer`), los 2 chillers (`chiller`, el segundo de respaldo y apagado), el molino de reciclaje (`granulator`) y las otras 3 estaciones de empaque (`packing-station`, sin banda: no tienen llegadas). Desde la cascada de materiales y servicios, las inyectoras reciben su resina seca, su agua de moldes y entregan su scrap al molino:

```
imm-03 ─ piezas (4 por ciclo) ─▶ conveyor-main-01 (88 m) ─▶ pack-station-01 (cajas de 250 y tarima de 40)
imm-01 … imm-29 (las otras 28): ciclan en paralelo, sin enlace de piezas

dryer-03 ─ resina seca + humedad ─▶ imm-01          dryer-04 ─ resina seca + humedad ─▶ imm-28
chiller-01 ─ agua de moldes (temperatura y disponibilidad) ─▶ imm-01 … imm-29
imm-01 … imm-29 ─ scrap (rechazos y coladas) ─(sort-01, wash-line-01 sin simular)─▶ grinder-rec-01 ─ molido ─▶ extruder-pel-01 ─ pellet ─(bagger-01 sin simular)─▶ silo-05
dryer-01, dryer-02 (ABS, ninguna inyectora lo moldea), chiller-02 (respaldo) y pack-station-02 … 04: trabajan solos
```

- **Resina seca.** La inyectora publica la resina que pide (`resin_demand_kg_h`, el disparo por ciclo repartido en el ciclo; 0 si está parada o bloqueada) y el secador entrega exactamente eso, hasta su caudal máximo y lo que tenga en la tolva, con la humedad que tiene en ese momento (`resin_moisture_pct`). Si el secador no entrega (apagado, tolva vacía), la inyectora gasta los 10 s de reserva de su tolva y pasa a `starved`. Una humedad por encima del límite de la resina produce rechazos por vetas (`splay`). Cada salida de resina va a una sola inyectora (sin reparto), por eso solo dos de las 29 tienen secador enlazado: la imm-28 (HDPE reciclado) con el secador 4 y la imm-01 (PS) con el secador 3; la imm-02 (también PS) conserva la humedad por defecto.
- **Agua de moldes.** El chiller 1 publica la temperatura de suministro y `water_ok` (la alarma `supply_temp_high` no está activa: ≤ consigna + 3 °C). Si no hay agua, el molde se calienta 25 °C sobre la consigna, el ciclo se alarga y aparecen rechupes y deformación. La carga del chiller sigue siendo la nominal: las inyectoras todavía no le piden calor.
- **Scrap.** Cada inyectora publica el scrap del último ciclo por hora de ciclo (`scrap_flow_kg_h`: rechazos más colada) y el molino suma las 29 entregas (≈ 100 kg/h en la hora nominal).
- **Proceso conectado (buffers, estibas, montacargas y estanterías).** Las 28 inyectoras que no van a la banda (todas menos la imm-3) entregan sus piezas a su buffer (`pallet-buffer`, estiba de 1.000 piezas, hasta 2 estibas llenas esperando) y este, a la flota de montacargas de la planta (`fleet-01`, tipo `forklift-fleet`, 6 vehículos, 9 rutas). La flota lleva las estibas de pedal/palanca (imm-06), cuerpos (imm-19), bisagras (imm-08) y tapas (imm-14) a las estanterías `rack-sf-01` … `rack-sf-04` (`pallet-store`, 48 posiciones, 6 estibas de inventario al inicio) y de ahí, por estiba y a pedido, a las celdas de ensamble: la línea saca las piezas de la estiba a 12 u/min como máximo, y cuando su cubeta se llena la ruta deja de pedir. Las estibas de las otras 24 inyectoras usan la ruta 5, que ocupa montacargas pero cuyo destino (estantería general) no se simula. Cada paso hacia atrás es un `ready` del motor: una celda llena frena la estiba, la flota, la estantería y, si se acumula, hasta la inyectora (que queda `blocked`).
- **Flota sin cruces.** Todos los montacargas comparten un corredor: la flota exige 30 s entre salidas (un vehículo por tramo reservado), atiende primero la estiba que lleva más tiempo esperando y la escena mueve cada montacargas con los canales `v*_route`, `v*_pos`, `v*_loaded`, `v*_wait`. Los dos montacargas de producto terminado, que no están en el motor, ceden el paso si hay un vehículo de la flota a menos de 7 m.
- **Ensamble manual.** `assembly-01` (tipo `assembly-cell`) recibe el pedal/palanca de la estantería 1 y el cuerpo de papelera de la estantería 2 y entrega unidades armadas al empaque 3; `assembly-02` recibe bisagras de la estantería 3 y tapas de la 4 (flujos supuestos). El operario arma una unidad cada `cycle_s` (35 s y 20 s). En la hora nominal las estibas llegan a los ≈ 148 y 169 s (celda 1) y a los 203 y 242 s (celda 2): 97 y 167 unidades.
- **Reciclaje.** El molino entrega el molido a la línea de peletizado (`extruder-pel-01`, tipo `pelletizing-line`: tolva, malla que se ensucia, temperatura de fundido) y esta el pellet al silo 5 (`silo-05`, un `vessel` con la forma `silo`) por la estación de big-bag, que no se simula. Si la línea se apaga o su tolva se llena, deja de aceptar molido (`ready`) y el molino se bloquea; si se atasca, la tolva guarda el molido. El lazo todavía no llega a las inyectoras: del silo 5 al manifold y a la mezcla de resina de cada inyectora no hay enlace, el silo solo acumula.

| Escenario | Qué muestra |
|---|---|
| `nominal` | Una hora estable. La inyectora 3 da 300 ciclos × 4 piezas; ≈ 1.090 llegan al final de la banda (293 s de recorrido) y la estación 1 las cuenta (4 cajas de 250). Los secadores de ABS entregan 150 kg/h, el 3 y el 4 lo que piden la imm-01 (24,6 kg/h) y la imm-28 (273 kg/h), el chiller de 600 kW mantiene 12 °C con 360 kW de carga y el molino tritura los ≈ 100 kg/h de scrap de las 29 inyectoras, que la línea de peletizado convierte en pellet para el silo 5 |
| `pelletizer-jam` | La cortadora de la línea de peletizado se atasca 45 min a los 10 min: el pellet deja de llegar al silo 5 (≈ 45 kg de los ≈ 99 kg que trituró el molino) y el molido se acumula en la tolva de la extrusora (≈ 27 %); el molino y las inyectoras no se enteran |
| `body-stop` | La imm-19 se apaga a los 30 min: su buffer deja de llenarse, pero la celda 1 sigue con el inventario de la estantería y la estiba en la línea (6 estibas = 9,7 h de cuerpos) |
| `fleet-short` | La flota baja a 1 montacargas: sirve las estibas una por vez (≈ 177 s por viaje, ≤ 20 por hora), se forma cola y las celdas arrancan tarde |
| `pallet-chain` | Cuatro horas: la imm-06 junta 1.000 piezas a las ≈ 3,5 h, el buffer cierra la estiba, un montacargas la lleva y la estantería 1 la recibe |
| `dryer-stop` | El secador 4 se apaga a los 30 min: la imm-28 espera sin resina (`starved` ≈ 47 % de la hora) y las otras 28 no se enteran |
| `chiller-trip` | El chiller 1 se dispara 45 min a los 30 min: el agua del circuito sube 0,0043 K/s, pasa de 15 °C a los ≈ 2.500 s, los moldes se calientan a ≈ 55 °C y los rechazos de la imm-01 pasan de ≈ 65 a ≈ 300 en la hora; el scrap que llega al molino sube ≈ 60 % (de ≈ 100 a ≈ 160 kg) |
| `conveyor-trip` | El motor de la banda se dispara 20 min: la zona de entrada (8 piezas, `entry_buffer_units`) se llena, la banda deja de aceptar y la inyectora 3 se bloquea; las otras 28 no se enteran. La estación de empaque solo cuenta lo que entregó la banda |

Una máquina que suelta varias piezas por ciclo entrega ráfagas, no un flujo continuo: la banda las recibe en una zona de entrada con `entry_buffer_units` plazas (por defecto 1, llegadas una a una como en la línea de sachets). Sin ella, la banda descartaba lo que no cabía entre dos piezas y se perdía la mitad de la producción.

`water-network-scale-v1`: el acueducto a escala (diseño en `docs/water-network-plant.md`), con el dominio hidráulico.

```
tanques de retorno (piso 0) ─▶ bombas de recirculación (por nivel) ─▶ tanque de bombeo (piso 1)
tanque de bombeo ─▶ 2 bombas multietapa (las dos de trabajo, 72,1 mca) ─4", sube 1 m─▶ estación reguladora ─4", baja 1 m─▶ nivel 1
nivel 1 ─2"─▶ válvula 1-2 ─▶ nivel 2 ─▶ válvula 2-3 ─▶ nivel 3 ─▶ válvula 3-4 ─▶ nivel 4
niveles 1 y 2 ─bajantes─▶ tanque de retorno 1      niveles 3 y 4 ─bajantes─▶ tanque de retorno 2
telemetría: la casa más baja de los 4 niveles ─▶ estación (rama automática)
```

| Escenario | Qué muestra |
|---|---|
| `nominal` | Día: estación en 20,94 mca y casa crítica (c44 del nivel 4) en 15,45 mca; bombas 11,53 m³/h a 72,1 mca, 71,1 mca a la entrada de la reguladora; la recirculación arranca y para por nivel cada ≈ 20 min |
| `night-pressure` | Las casas al 30 %: la rama automática baja la salida a 18,46 mca y la casa crítica sigue en 15,45 |
| `manual-branch` | De noche, rama manual con la salida del día: la casa crítica sube a 17,87 mca y las fugas de la red suben 6,4 % (de 1,253 a 1,338 m³/h) |
| `pump-trip` | Se dispara una bomba: la otra salta a ≈ 93 % y la presión baja a 68,9 mca un segundo (regla D29: piso 65 mca) |
| `leak-burst` | La fuga l1 del nivel 2 se abre a 5 veces su Kv (0,98 m³/h); la estación sube a 21,25 mca |
| `between-valve` | La válvula entre los niveles 2 y 3 al 50 %: la estación sube a 23,28 mca para sostener la casa crítica |

Los valores esperados salen del banco en régimen permanente `industrial-models/water-network-scale-v1/network.py`, que arma la misma red con los mismos tubos del plano; `test_plant_hydraulics.py` compara el motor con él (± 0,5 %). Los escenarios del archivo son pruebas: los de operación los crea el usuario conversando con Claude conectado al simulador.

## 4. Limitaciones actuales

- El producto desviado regresa a la marmita con su receta y se mezcla a la temperatura de salida del pasteurizador (`return_in`, `returned_kg`); no hay tubería de retorno con volumen ni retardo, solo el paso de retraso del motor.
- Las recetas se escriben como fases de la marmita en `simulation.yaml`; todavía no se traducen solas desde `recipes` del plano.
- La planta de inyección conecta la inyectora 3 con la banda y el empaque 1, y enlaza resina seca (2 secadores con 2 inyectoras), agua de moldes (chiller 1 con las 29) y scrap (las 29 con el molino), y de ahí molino → peletizado → silo 5. Quedan fuera: el reparto de resina de un secador entre varias inyectoras (hoy una salida atiende un solo destino), la carga térmica real del chiller (las inyectoras no le piden calor), el efecto de la temperatura del agua sobre el molde (solo cuenta si hay o no agua), la humedad de la resina como causa de un escenario completo (el secador cambia de humedad en horas, no en minutos) y la central de materiales: el silo 5 → manifold → inyectoras con pellet reciclado, que cerraría el lazo del reciclaje.
- Acueducto: las bajantes llegan a los tanques de retorno en el paso siguiente (≈ 3 kg en tránsito), sin el tiempo real de caída por la canaleta; no hay golpe de ariete (régimen cuasiestacionario) ni agua guardada en los tubos.
- La planta conectada se ve en 3D y en vivo en la escena de planta (`docs/plant-scene.md`); la API la expone en `/api/plants`.
