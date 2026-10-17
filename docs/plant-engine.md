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

## 3. Lo que ya está conectado

`sauce-plant-v1`: la línea caliente de 1.000 ml, con la receta `rcp-tomato-sauce` en las marmitas.

```
caldera ─vapor 3 bar (steam-station-01)─▶ marmita 1, marmita 2, pasteurizador
marmita 1 ┐
marmita 2 ┴─(pump-hot-01)─▶ pasteurizador ─(holding-tube-01)─▶ pulmón ─▶ sachetadora ─▶ túnel ─▶ control de peso ─▶ encajadora
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
imm-01 … imm-29 ─ scrap (rechazos y coladas) ─(sort-01, wash-line-01 sin simular)─▶ grinder-rec-01
dryer-01, dryer-02 (ABS, ninguna inyectora lo moldea), chiller-02 (respaldo) y pack-station-02 … 04: trabajan solos
```

- **Resina seca.** La inyectora publica la resina que pide (`resin_demand_kg_h`, el disparo por ciclo repartido en el ciclo; 0 si está parada o bloqueada) y el secador entrega exactamente eso, hasta su caudal máximo y lo que tenga en la tolva, con la humedad que tiene en ese momento (`resin_moisture_pct`). Si el secador no entrega (apagado, tolva vacía), la inyectora gasta los 10 s de reserva de su tolva y pasa a `starved`. Una humedad por encima del límite de la resina produce rechazos por vetas (`splay`). Cada salida de resina va a una sola inyectora (sin reparto), por eso solo dos de las 29 tienen secador enlazado: la imm-28 (HDPE reciclado) con el secador 4 y la imm-01 (PS) con el secador 3; la imm-02 (también PS) conserva la humedad por defecto.
- **Agua de moldes.** El chiller 1 publica la temperatura de suministro y `water_ok` (la alarma `supply_temp_high` no está activa: ≤ consigna + 3 °C). Si no hay agua, el molde se calienta 25 °C sobre la consigna, el ciclo se alarga y aparecen rechupes y deformación. La carga del chiller sigue siendo la nominal: las inyectoras todavía no le piden calor.
- **Scrap.** Cada inyectora publica el scrap del último ciclo por hora de ciclo (`scrap_flow_kg_h`: rechazos más colada) y el molino suma las 29 entregas (≈ 100 kg/h en la hora nominal). El molino todavía no entrega a la extrusora de pellet reciclado, que no existe en la librería, así que el lazo molido → pellet → secador no está cerrado.

| Escenario | Qué muestra |
|---|---|
| `nominal` | Una hora estable. La inyectora 3 da 300 ciclos × 4 piezas; ≈ 1.090 llegan al final de la banda (293 s de recorrido) y la estación 1 las cuenta (4 cajas de 250). Los secadores de ABS entregan 150 kg/h, el 3 y el 4 lo que piden la imm-01 (24,6 kg/h) y la imm-28 (273 kg/h), el chiller de 600 kW mantiene 12 °C con 360 kW de carga y el molino tritura los ≈ 100 kg/h de scrap de las 29 inyectoras |
| `dryer-stop` | El secador 4 se apaga a los 30 min: la imm-28 espera sin resina (`starved` ≈ 47 % de la hora) y las otras 28 no se enteran |
| `chiller-trip` | El chiller 1 se dispara 45 min a los 30 min: el agua del circuito sube 0,0043 K/s, pasa de 15 °C a los ≈ 2.500 s, los moldes se calientan a ≈ 55 °C y los rechazos de la imm-01 pasan de ≈ 65 a ≈ 300 en la hora; el scrap que llega al molino sube ≈ 60 % (de ≈ 100 a ≈ 160 kg) |
| `conveyor-trip` | El motor de la banda se dispara 20 min: la zona de entrada (8 piezas, `entry_buffer_units`) se llena, la banda deja de aceptar y la inyectora 3 se bloquea; las otras 28 no se enteran. La estación de empaque solo cuenta lo que entregó la banda |

Una máquina que suelta varias piezas por ciclo entrega ráfagas, no un flujo continuo: la banda las recibe en una zona de entrada con `entry_buffer_units` plazas (por defecto 1, llegadas una a una como en la línea de sachets). Sin ella, la banda descartaba lo que no cabía entre dos piezas y se perdía la mitad de la producción.

## 4. Limitaciones actuales

- El producto desviado regresa a la marmita con su receta y se mezcla a la temperatura de salida del pasteurizador (`return_in`, `returned_kg`); no hay tubería de retorno con volumen ni retardo, solo el paso de retraso del motor.
- Las recetas se escriben como fases de la marmita en `simulation.yaml`; todavía no se traducen solas desde `recipes` del plano.
- La planta de inyección conecta la inyectora 3 con la banda y el empaque 1, y enlaza resina seca (2 secadores con 2 inyectoras), agua de moldes (chiller 1 con las 29) y scrap (las 29 con el molino). Quedan fuera: el reparto de resina de un secador entre varias inyectoras (hoy una salida atiende un solo destino), la carga térmica real del chiller (las inyectoras no le piden calor), el efecto de la temperatura del agua sobre el molde (solo cuenta si hay o no agua), la humedad de la resina como causa de un escenario completo (el secador cambia de humedad en horas, no en minutos) y la central de materiales y la extrusora de pellet reciclado, que cerrarían el lazo del reciclaje.
- La planta conectada se ve en 3D y en vivo en la escena de planta (`docs/plant-scene.md`); la API la expone en `/api/plants`.
