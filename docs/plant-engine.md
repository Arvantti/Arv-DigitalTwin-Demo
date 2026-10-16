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
| `links` | Conexiones `equipo.puerto → equipo.puerto`. Cada una debe existir en los `flows` del plano, directa o pasando por equipos que no se simulan (`via`). `max` limita una magnitud, por ejemplo la presión después de una estación reductora |
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
- **Sin reparto.** Una salida que entrega `units` o `flow_kg_h` va a un solo destino; repartir entre dos (por formato, por ejemplo) necesita una regla que aún no existe. El vapor sí se reparte: la presión llega a todos y las demandas se suman.
- **Las entradas que calcula un enlace no se fijan en un escenario.** El motor lo rechaza para que la prueba no contradiga la planta.

## 3. Lo que ya está conectado

`sauce-plant-v1`: la línea caliente de 1.000 ml, con la receta `rcp-tomato-sauce` en las marmitas.

```
caldera ─vapor 3 bar (steam-station-01)─▶ marmita 1, marmita 2, pasteurizador
marmita 1 ┐
marmita 2 ┴─(pump-hot-01)─▶ pasteurizador ─(holding-tube-01)─▶ pulmón ─▶ sachetadora ─▶ túnel ─▶ control de peso ─▶ encajadora
```

| Escenario | Qué muestra |
|---|---|
| `nominal` | Turno de 8 h con dos marmitas alternadas. La línea queda limitada por la cocción: dos batches de 2.000 kg cada 2 h dan ≈ 2.000 kg/h y la sachetadora pide 2.036 kg/h |
| `boiler-trip` | Falla de llama de 1 h. La marmita que calienta gasta el vapor almacenado; bajo ≈ 0,6 bar el pasteurizador ya no llega a 92 °C en la retención y desvía. El producto desviado no sale como pasteurizado |
| `tunnel-stop` | El túnel se detiene 80 min. La sachetadora se bloquea, el pulmón llega al 90 % y la marmita 2 espera para descargar |

## 4. Limitaciones actuales

- El producto desviado sale del modelo (en la planta vuelve a la marmita).
- Las recetas se escriben como fases de la marmita en `simulation.yaml`; todavía no se traducen solas desde `recipes` del plano.
- Falta conectar la planta de inyección: sus secadores, chillers y molinos aún no tienen tipo en la librería.
- La API y la galería todavía muestran un equipo a la vez; la escena de planta es la fase 5.
