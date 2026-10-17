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

`plastic-injection-plant-v1`: la nave de inyección. Las 29 inyectoras se simulan con los parámetros del `plant.yaml` (tonelaje, cavidades, peso de pieza, ciclo, robot) sobre el preset de su tonelaje, y la banda principal de 88 m recibe las piezas de la inyectora 3 (`imm-03.parts_out → conveyor-main-01.items_in`) y las entrega a la estación de empaque 1 (`conveyor-main-01.items_out → pack-station-01.items_in`). Las demás inyectoras trabajan solas. También se simulan, sin enlace con las inyectoras, los 4 secadores de resina (`desiccant-dryer`), los 2 chillers (`chiller`, el segundo de respaldo y apagado), el molino de reciclaje (`granulator`) y las otras 3 estaciones de empaque (`packing-station`, sin banda: no tienen llegadas).

```
imm-03 ─ piezas (4 por ciclo) ─▶ conveyor-main-01 (88 m) ─▶ pack-station-01 (cajas de 250 y tarima de 40)
imm-01 … imm-29 (las otras 28): ciclan en paralelo, sin enlace
dryer-01 … 04, chiller-01 y 02, grinder-rec-01, pack-station-02 … 04: trabajan solos
```

| Escenario | Qué muestra |
|---|---|
| `nominal` | Una hora estable. La inyectora 3 da 300 ciclos × 4 piezas; ≈ 1.090 llegan al final de la banda (293 s de recorrido) y la estación 1 las cuenta (4 cajas de 250). Los secadores entregan 150, 250 y 400 kg/h con la resina seca, el chiller de 600 kW mantiene 12 °C con 360 kW de carga y el molino tritura los 300 kg/h que le llegan |
| `conveyor-trip` | El motor de la banda se dispara 20 min: la zona de entrada (8 piezas, `entry_buffer_units`) se llena, la banda deja de aceptar y la inyectora 3 se bloquea; las otras 28 no se enteran. La estación de empaque solo cuenta lo que entregó la banda |

Una máquina que suelta varias piezas por ciclo entrega ráfagas, no un flujo continuo: la banda las recibe en una zona de entrada con `entry_buffer_units` plazas (por defecto 1, llegadas una a una como en la línea de sachets). Sin ella, la banda descartaba lo que no cabía entre dos piezas y se perdía la mitad de la producción.

## 4. Limitaciones actuales

- El producto desviado regresa a la marmita con su receta y se mezcla a la temperatura de salida del pasteurizador (`return_in`, `returned_kg`); no hay tubería de retorno con volumen ni retardo, solo el paso de retraso del motor.
- Las recetas se escriben como fases de la marmita en `simulation.yaml`; todavía no se traducen solas desde `recipes` del plano.
- La planta de inyección conecta la inyectora 3 con la banda y el empaque 1. Secadores, chillers y molino se simulan pero sin enlaces: las inyectoras no consumen su resina seca ni su agua de enfriamiento (usan los valores por defecto), el chiller trabaja con una carga nominal y el molino con una alimentación nominal. Esa cascada (humedad de la resina, temperatura del agua de moldes, scrap hacia el molino) y la central de materiales quedan para otra entrega.
- La planta conectada se ve en 3D y en vivo en la escena de planta (`docs/plant-scene.md`); la API la expone en `/api/plants`.
