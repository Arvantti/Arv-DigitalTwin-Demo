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
| `lines` | Líneas con su puerto de salida, para los KPIs de planta; `unit` opcional (por defecto `u`; el acueducto usa `m³` con el contador `volume_m3` de las bombas) |
| `scenarios` | Línea de tiempo y expectativas, igual que en un equipo |

Si la planta tiene catálogo (`industrial-models/<planta>/catalog/`, ver `docs/datos-reales.md`), el motor lo valida al cargar la planta y cada inyectora con molde montado en `catalog/setup.yaml` toma de él `product`, `material`, `cavities`, `part_g` y `cycle_s`; una llenadora con formato toma su `unit_ml` y una convertidora con formato o troquel sus `boxes_per_sheet` (campo `params` del herramental). Esos parámetros no se repiten en `simulation.yaml` (si se repiten, la planta no carga). En un equipo con receta montada, cada lote de la línea de tiempo (`run_phases`) debe cargar el `batch_kg` de la receta (±0,5 %).

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

`sauce-plant-v1`: las tres familias de producto (D53). Dos líneas calientes con la receta `rcp-tomato-sauce`: la de 1.000 ml (marmitas 1 y 2) y la de 250 ml (marmita 3 con su propio pasteurizador, pulmón, túnel y control de peso; supuesto D45). Una línea fría de emulsiones con la receta `rcp-mayo-natural` y una línea de mostaza con `rcp-mustard`. Una salida no se reparte entre dos destinos cuando lleva caudal, por eso las líneas calientes no comparten pasteurizador; el pulmón frío sí alimenta a tres llenadoras porque su enlace al llenador solo transmite demanda y disponibilidad (el pulmón entrega la suma de lo que piden). Las pesadoras son una por formato (supuesto): cada una promedia el peso de lo que recibe, y la de mostaza es dedicada por alérgeno.

```
caldera ─vapor 3 bar (steam-station-01)─▶ marmita 1, marmita 2, pasteurizador
marmita 1 ┐
marmita 2 ┴─(pump-hot-01)─▶ pasteurizador ─(holding-tube-01)─▶ pulmón ─▶ sachetadora ─▶ túnel ─▶ control de peso ─▶ empaque manual (cajas de 4)
               │
               └─ desvío (holding-tube-01) ─▶ la marmita que descarga

emulsificador (marmita sin vapor) ─(colloid-mill-01)─▶ pulmón frío 1 ─┬─▶ sachetadora 250 ml ─▶ pesadora 3 ─▶ mesa 2 de 250 ml
                                                                       ├─▶ pouch 500 ml ─▶ pesadora 4 ─▶ mesa de 500 ml
                                                                       └─▶ pouch 1.000 ml ─▶ pesadora 5 ─▶ mesa de 1.000 ml (compartida con la línea caliente)
tanque de mostaza ─(mustard-mill-01)─▶ pulmón de mostaza ─▶ sachetadora 250 ml dedicada ─▶ pesadora 6 ─▶ mesa 1 de 250 ml (compartida con la caliente)
```

El emulsificador y el tanque de mostaza se modelan con el tipo `jacketed-kettle` sin vapor (presets `2000l-emulsifier` y `1200l-mustard`): los batches son cargas, esperas y descarga; el rotor de 3.000 rpm y el vacío de -0,8 bar se anotan como esperas, y no hay Brix ni pH (esos cálculos son de la salsa de tomate). Los molinos (coloidal y de piedra) se atraviesan con `via`. El pulmón frío 2 queda de reserva sin simular.

| Escenario | Qué muestra |
|---|---|
| `nominal` | Turno de 8 h con dos marmitas alternadas. La línea queda limitada por la cocción: dos batches de 2.000 kg cada 2 h dan ≈ 2.000 kg/h y la sachetadora pide 2.036 kg/h |
| `boiler-trip` | Falla de llama de 1 h. La marmita que calienta gasta el vapor almacenado; bajo ≈ 0,6 bar el pasteurizador ya no llega a 92 °C en la retención y desvía. El producto desviado regresa a la marmita que descarga, así que esa descarga se alarga lo que dura el desvío y la otra marmita espera su turno en la bomba |
| `tunnel-stop` | El túnel se detiene 80 min. La sachetadora se bloquea, el pulmón llega al 90 % y la marmita 2 espera para descargar |
| `cold-nominal` | Turno de 8 h de la línea fría: un batch de 1.500 kg cada 75 min (≈ 68 min de ciclo) y las tres llenadoras corren ≈ 26 % del turno, porque piden 4.325 kg/h a tope y el emulsificador entrega ≈ 1.125 kg/h; da ≈ 9 t por turno contra las 9,9 t/día del reparto del 45 % |
| `mustard-nominal` | Turno de 8 h de la mostaza: un batch de 1.000 kg cada 150 min; el molino de 1.000 kg/h limita la descarga a 60 min por batch; ≈ 3 t por turno contra las 3,3 t/día del reparto del 15 % |

`plastic-injection-plant-v1`: la nave de inyección, simplificada para la demo (2026-11-01) a las 12 inyectoras de los 4 productos del catálogo: cubiertos (imm-01, 02, 04, 05 y 08), pedal y palanca (imm-06 y 07), cuerpo de papelera (imm-18 y 19), balde de 12 L (imm-21 y 23) y la imm-20 en reserva para el molde de repuesto; la celda `assembly-01` arma la papelera. Las máquinas conservan sus ids. Cada inyectora se simula con los parámetros del `plant.yaml` y del molde montado (`catalog/setup.yaml`) sobre el preset de su tonelaje. También se simulan los 4 secadores de resina (`desiccant-dryer`), los 2 chillers (`chiller`, el segundo de respaldo y apagado), el molino de reciclaje (`granulator`) y las 4 estaciones de empaque (`packing-station`). Desde la cascada de materiales y servicios, las inyectoras reciben su resina seca, su agua de moldes y entregan su scrap al molino:

```
imm-xx ─ piezas ─▶ buf-xx (estiba) ─▶ fleet-01 ─▶ rack-sf-01 / rack-sf-02 ─▶ fleet-01 ─▶ assembly-01 ─▶ pack-station-03

dryer-03 ─ resina seca + humedad ─▶ imm-01          dryer-04 ─ resina seca + humedad ─▶ imm-19
chiller-01 ─ agua de moldes (temperatura y disponibilidad) ─▶ las 12 inyectoras
las 12 inyectoras ─ scrap (rechazos y coladas) ─(sort-01, wash-line-01 sin simular)─▶ grinder-rec-01 ─ molido ─▶ extruder-pel-01 ─ pellet ─(bagger-01 sin simular)─▶ silo-05
dryer-01, dryer-02 (ABS, ninguna inyectora lo moldea) y chiller-02 (respaldo): trabajan solos
```

- **Resina seca.** La inyectora publica la resina que pide (`resin_demand_kg_h`, el disparo por ciclo repartido en el ciclo; 0 si está parada o bloqueada) y el secador entrega exactamente eso, hasta su caudal máximo y lo que tenga en la tolva, con la humedad que tiene en ese momento (`resin_moisture_pct`). Si el secador no entrega (apagado, tolva vacía), la inyectora gasta los 10 s de reserva de su tolva y pasa a `starved`. Una humedad por encima del límite de la resina produce rechazos por vetas (`splay`). Cada salida de resina va a una sola inyectora (sin reparto): la imm-19 (PP reciclado) con el secador 4 y la imm-01 (PS) con el secador 3.
- **Agua de moldes.** El chiller 1 publica la temperatura de suministro y `water_ok` (la alarma `supply_temp_high` no está activa: ≤ consigna + 3 °C). Si no hay agua, el molde se calienta 25 °C sobre la consigna, el ciclo se alarga y aparecen rechupes y deformación.
- **Scrap.** Cada inyectora publica el scrap del último ciclo por hora de ciclo (`scrap_flow_kg_h`: rechazos más colada) y el molino suma las 12 entregas (≈ 31 kg/h en la hora nominal).
- **Proceso conectado (buffers, estibas, montacargas y estanterías).** Cada inyectora entrega sus piezas a su buffer (`pallet-buffer`, estiba estándar con las piezas que caben de ese producto, hasta 2 estibas llenas esperando) y este, a la flota de montacargas (`fleet-01`, 6 vehículos). La flota lleva las estibas de pedal/palanca (imm-06) y cuerpos (imm-19) a las estanterías `rack-sf-01` y `rack-sf-02` (`pallet-store`, 48 posiciones, 6 estibas de inventario al inicio) y de ahí, por estiba y a pedido, a la celda de ensamble. Las estibas de cubiertos y baldes usan la ruta 5, que ocupa montacargas pero cuyo destino (bodega de producto terminado) no se simula. El tamaño de la estiba lo calcula `tools/logistics/pallet_sizing.py` con `pallet-sizing.yaml`. Cada paso hacia atrás es un `ready` del motor: una celda llena frena la estiba, la flota, la estantería y, si se acumula, hasta la inyectora (que queda `blocked`).
- **Flota sin cruces.** La flota exige 30 s entre salidas por el corredor y atiende primero la estiba que lleva más tiempo esperando. En la escena sin motor (`apps/gallery/src/pallet-transport.ts`) cada montacargas va por el carril derecho del pasillo (ida y regreso por carriles distintos) y espera si tiene otro adelante a menos de 3,5 m en el mismo sentido.
- **Ensamble manual.** `assembly-01` recibe el pedal/palanca de la estantería 1 y el cuerpo de papelera de la estantería 2 y entrega unidades armadas al empaque 3; el operario arma una cada 35 s: 97 unidades en la hora nominal.
- **Reciclaje.** El molino entrega el molido a la línea de peletizado (`extruder-pel-01`) y esta el pellet al silo 5 por la estación de big-bag, que no se simula. Si la línea se apaga o su tolva se llena, deja de aceptar molido y el molino se bloquea; si se atasca, la tolva guarda el molido.

| Escenario | Qué muestra |
|---|---|
| `nominal` | Una hora estable de las 12 inyectoras: el secador 3 entrega lo que pide la imm-01 (24,6 kg/h) y el 4 lo de la imm-19 (≈ 75 kg/h), el chiller mantiene 12 °C, el molino tritura ≈ 31 kg/h de scrap y la celda arma 97 papeleras con 4 viajes de montacargas |
| `pelletizer-jam` | La cortadora de la línea de peletizado se atasca a los 30 min: el pellet deja de llegar al silo 5 (≈ 15 kg de los ≈ 31 kg que trituró el molino) y el molido se acumula en la tolva de la extrusora (≈ 8 %); el molino y las inyectoras no se enteran |
| `body-stop` | La imm-19 se apaga a los 30 min: su buffer deja de llenarse, pero la celda sigue con el inventario de la estantería |
| `fleet-short` | La flota baja a 1 montacargas: sirve las 4 estibas de la celda una por vez y la celda arranca tarde (93 unidades contra 97) |
| `pallet-chain` | Cuatro horas: la imm-19 junta 240 cuerpos, el buffer cierra la estiba, un montacargas la lleva y la estantería 2 la recibe |
| `dryer-stop` | El secador 4 se apaga a los 30 min: la imm-19 espera sin resina (`starved` ≈ 49 % de la hora) y las demás no se enteran |
| `chiller-trip` | El chiller 1 se dispara 45 min a los 30 min: el agua del circuito pasa de 15 °C, los moldes se calientan, los rechazos de la imm-01 suben y el scrap que llega al molino pasa de ≈ 31 a ≈ 55 kg |

`water-network-scale-v1`: el acueducto a escala (diseño en `docs/water-network-plant.md`), con el dominio hidráulico.

```
tanques de retorno (piso 0) ─▶ bombas de recirculación (por nivel) ─▶ tanque de bombeo (piso 1)
tanque de bombeo ─▶ 2 bombas multietapa (las dos de trabajo, 72,1 mca) ─4", sube 1 m─▶ estación reguladora ─4", baja 1 m─▶ nivel 1
nivel 1 ─2"─▶ válvula 1-2 ─▶ nivel 2 ─▶ válvula 2-3 ─▶ nivel 3 ─▶ válvula 3-4 ─▶ nivel 4
niveles 1–4 ─▶ montante común ↓ ─▶ tronco por costado sur ─▶ ↓ T entre tanques ─┬─▶ entrada tanque 1
                                                                                 └─▶ entrada tanque 2 (50/50 supuesto)
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

`corrugated-box-plant-v1`: la fábrica de cajas (`docs/box-plant.md`). La corrugadora (`corrugator`) entrega pilas a cuatro transportadores de rodillos (`belt-conveyor`); el carro de transferencia (`transfer-car`) tiene un puerto de salida por carril y reparte él mismo las pilas, así el motor sigue sin repartir una salida entre varios destinos. Las mesas giratorias, las amarradoras y una mesa manual por línea son estaciones en línea (`inline-station`) con tres fotoceldas, atascos y pulsador de paro; cada banda es una unidad independiente con control por zonas. Tres convertidoras (`box-converter`) entregan fajos a sus amarradoras; la línea 1 termina en su paletizador y las líneas 2 y 3 se juntan en una banda de unión (dos enlaces a la misma entrada: las unidades se suman) antes del paletizador compartido (`palletizer`). Escenarios `nominal`, `paper-break`, `shared-palletizer-stop`, `strapper-jams`, `operator-break`, `manual-stop` y `random-jams`.

`airport-baggage-v1`: el sistema de equipaje de un aeropuerto (ficha de diseño en la carpeta compartida del proyecto, `aeropuerto/ficha-diseno-bhs.md`). Dos islas de check-in de 8 mostradores entregan a dos colectoras de 46 m, cada una con su máquina de inspección por tomografía (CT). Lo que la CT y el operador despejan va al clasificador de bandejas basculantes: la línea norte gira con una curva motorizada y entra de costado (confluencia) a la línea sur, que es la única inducción; esta sube, gira 45° con otra curva y entra en la parte recta del lazo, a favor del flujo, antes de las rampas; lo que no se despeja va a nivel 3 (revisión manual), y cada sala devuelve lo que despeja por su propia banda de regreso, que entra de costado a la línea de inducción (la norte a la banda norte, la sur a la inducción). El clasificador reparte por vuelo a 4 carruseles de armado (30/25/25/20 %); las etiquetas sin lectura y las maletas que agotan sus vueltas van a codificación manual, que las devuelve por una banda que sube por el costado este hasta una reinducción del lado de retorno del lazo. Todas las bandas de maletas tienen control por zonas con fotoceldas (`zone_control`): acumulan sin choques, y cada banda tiene señales de marcha: arranca cuando su fotocelda de entrada ve una maleta y se duerme tras 10 s sin maletas (`run_on_s`); el operador la habilita o la para con `start`/`stop`. Velocidades: inducción 0,75 m/s y línea sur 1,0 m/s (acelera para abrir hueco entre maletas antes del lazo), colectoras 0,6, llegadas 0,5, alarma y regresos de nivel 3 0,4, regreso de codificación 0,5. En llegadas, dos bandas desde la plataforma llenan dos carruseles de reclamo.

```
check-in A ─▶ colectora A (46 m) ─▶ CT 1 ─despejadas─▶ curva ─▶ banda norte ─┐ (confluencia)
check-in B ─▶ colectora B (46 m) ─▶ CT 2 ─despejadas─▶ inducción ◀───────────┘ ─▶ clasificador
CT 1 ─alarma─▶ banda ─▶ nivel 3 norte ─regreso─▶ banda norte (de costado)
CT 2 ─alarma─▶ banda ─▶ nivel 3 sur ───regreso─▶ inducción (de costado)
clasificador ─rampas 1…4─▶ carruseles de armado 1…4 (vuelos V101, V205, V317, V422) ─▶ carros hacia el avión
clasificador ─rampa manual (sin lectura o sin vueltas)─▶ codificación manual ─regreso─▶ reinducción del clasificador
banda de llegadas 1 ─▶ carrusel de reclamo 1        banda de llegadas 2 ─▶ carrusel de reclamo 2
```

| Escenario | Qué muestra |
|---|---|
| `nominal` | Hora pico: 300 pasajeros por isla (1,1 maletas cada uno). Casi no hay fila (capacidad 320 por hora). La CT 1 inspecciona ≈ 312 maletas y manda ≈ 16 a nivel 3; el clasificador induce ≈ 637 y el vuelo V101 recibe ≈ 184 (30 %). A los 20 min llega un vuelo de 180 maletas al reclamo 1 |
| `screening-fault` | Falla de rayos X de la CT 1 durante 15 min: la colectora A se llena en ≈ 8 min, la isla A se bloquea y la fila crece a 20–45 pasajeros; la isla B no se entera |
| `makeup-short-staff` | Los operarios del carrusel 1 se van 20 min: el carrusel se llena, su rampa también y el clasificador recircula y manda a codificación manual 10–35 maletas |
| `sorter-trip` | Disparo del clasificador 10 min: las inducciones y la salida de las CT se llenan en ≈ 3 min y las dos CT quedan bloqueadas ≥ 15 % de la media hora |
| `arrivals-wave` | Dos vuelos llegan a la vez, 180 maletas por banda a 20 por min; cada oleada dura ≈ 10 min de la primera maleta a la última recogida |
| `slippery-collector` | La colectora A pierde agarre 15 min (fricción 0,25 < tan 16°): las maletas resbalan al pie de la subida, las que llegan chocan contra ellas (≈ 27 choques), la colectora se tapa y la isla A queda bloqueada ≈ 35 % del tiempo con 65 pasajeros en fila |

Cada maleta se sigue una por una sobre el recorrido real de su banda, con sus subidas y bajadas: respeta la separación mínima, cuenta un choque cuando alcanza a la de adelante con velocidad relativa y, si la pendiente supera su ángulo de fricción (tan θ > `friction_coef`, 0,45 por defecto, ≈ 24°), resbala y se detiene al pie de la subida. La API publica la posición de cada una (`items` en el snapshot) y la escena las dibuja donde están.

Un equipo con varias salidas (clasificador, CT) usa un puerto por destino (`out_1` … `out_4`, `manual_out`, `cleared_out`, `alarm_out`), porque un enlace no reparte. Las islas, las colectoras, la CT, el clasificador y los carruseles dejan de recibir cuando se llenan y vuelven a recibir con una plaza libre (histéresis), así un bloqueo se propaga aguas arriba hasta la fila de pasajeros.

## 4. Limitaciones actuales

- El producto desviado regresa a la marmita con su receta y se mezcla a la temperatura de salida del pasteurizador (`return_in`, `returned_kg`); no hay tubería de retorno con volumen ni retardo, solo el paso de retraso del motor.
- Las recetas se escriben como fases de la marmita en `simulation.yaml`; todavía no se traducen solas desde `recipes` del plano.
- La planta de inyección conecta la inyectora 3 con la banda y el empaque 1, y enlaza resina seca (2 secadores con 2 inyectoras), agua de moldes (chiller 1 con las 29) y scrap (las 29 con el molino), y de ahí molino → peletizado → silo 5. Quedan fuera: el reparto de resina de un secador entre varias inyectoras (hoy una salida atiende un solo destino), la carga térmica real del chiller (las inyectoras no le piden calor), el efecto de la temperatura del agua sobre el molde (solo cuenta si hay o no agua), la humedad de la resina como causa de un escenario completo (el secador cambia de humedad en horas, no en minutos) y la central de materiales: el silo 5 → manifold → inyectoras con pellet reciclado, que cerraría el lazo del reciclaje.
- Acueducto: las bajantes llegan a los tanques de retorno en el paso siguiente (≈ 3 kg en tránsito), sin el tiempo real de caída por la canaleta; no hay golpe de ariete (régimen cuasiestacionario) ni agua guardada en los tubos.
- Aeropuerto: el reparto por vuelo es fijo por porcentaje (no hay horarios de vuelo ni cierre de vuelo), los carros hacia el avión no se simulan (el carrusel de armado entrega siempre que haya operario) y las bandas de llegadas reciben un caudal fijo, sin la descarga real del avión.
- La planta conectada se ve en 3D y en vivo en la escena de planta (`docs/plant-scene.md`); la API la expone en `/api/plants`.
