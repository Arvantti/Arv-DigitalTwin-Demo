# Motor de planta

El motor de planta toma equipos de la librería, los conecta por sus puertos y simula la planta completa sobre un reloj virtual. No hay código por planta: una planta es un archivo `twin.yaml` y sus escenarios. El mismo mecanismo servirá para la cascada de inyección (secador, chiller, molino) y para cualquier planta que un usuario arme después vía MCP.

```
industrial-models/<planta>/
├── plant.yaml       layout (fase 1): ubicación, zonas, flujos dibujados
├── twin.yaml        gemelo: qué tipo de la librería es cada equipo y cómo se conectan
└── scenarios.yaml   escenarios de planta con expectativas (son las pruebas)
```

Código: `packages/twin-runtime/src/twin_runtime/plant.py` (`load_twin`, `PlantSimulator`, `run_plant_scenario`) y `expr.py` (condiciones seguras).

## 1. `twin.yaml`

```yaml
twin: sauce-hot-line-1000
name: Línea caliente de salsa de tomate, sachet de 1.000 ml
layout: plant.yaml        # los ids deben existir en el layout, salvo los marcados virtual
dt: 1.0                   # paso de simulación en s

equipment:
  - { id: kettle-01, type: jacketed-kettle, preset: 2500l-sauce }
  - id: pasteurizer-01
    type: tubular-pasteurizer
    preset: 3000lh-sauce
    represents: [holding-tube-01, pump-hot-01]   # piezas del layout que este equipo ya incluye
  - { id: conveyor-pouch-01, type: belt-conveyor, preset: sachet-1000, virtual: true }
  - id: boiler-01
    type: steam-boiler
    input_offsets: { steam_demand_kg_h: 150 }    # consumo del resto de la planta, no modelado

links:
  - { from: kettle-01.product_out, to: pasteurizer-01.product_in }
  - { from: boiler-01.steam_out, to: kettle-01.steam_in, max: 3 }   # estación reductora a 3 bar
  - { kind: signal, from: filler-pouch-01.fill_weight_avg_g, to: checkweigher-01.upstream_mean_g }

controllers:
  - { kind: batch_loop, equipment: kettle-01, phases: *receta, start_at_s: 0 }

timeline:
  - { at_s: 0, equipment: pasteurizer-01, command: start }

kpis:
  - { id: sachets_ok, ref: checkweigher-01.units_accepted }
  - { id: batches, refs: [kettle-01.batch_count, kettle-02.batch_count] }
  - { id: sachets_per_h, ref: checkweigher-01.units_accepted, per_hour: true }
```

Cada equipo admite además `params` (sobre el preset) e `inputs` (entradas fijas).

## 2. Cómo se conecta un puerto: `bind`

El contrato de cada tipo dice, en sus puertos, qué variables y qué entradas usar. El motor no conoce los equipos por dentro; solo lee esto.

| Campo | Significado | Ejemplo |
|---|---|---|
| `counter` + `counter_unit` | Variable acumulada de lo que pasa por el puerto (u, kg o L) | `delivered`, `discharged_kg`, `pasteurized_l` |
| `rate_input` | Entrada que recibe el caudal del otro lado (u/min en item, kg/h en material) | `inflow_upm`, `outflow_kg_h` |
| `ready` | Condición: el puerto puede transferir ahora. Usa variables, `state` y `phase` | `"accepting == 1"`, `"phase == 'discharge'"` |
| `ready_input` | Entrada que recibe si el otro lado está listo | `downstream_free`, `product_available` |
| `temperature` / `temperature_input` | Temperatura del producto que sale / que llega | `temperature_c` → `product_in_c` |
| `supply` / `supply_input` | Servicio ofrecido / recibido | `pressure_bar` → `steam_supply_bar` |
| `demand` / `demand_input` | Consumo del equipo / suma de consumos que recibe el proveedor | `steam_flow_kg_h` → `steam_demand_kg_h` |
| `properties` / `property_inputs` | Propiedades del material que viajan con el flujo: nombre → variable en la salida, nombre → entrada en la llegada | `moisture_pct: outlet_moisture_pct` → `moisture_pct: resin_moisture_pct` |

`twin-lib validate` comprueba que cada nombre exista en el contrato o en `DEFAULT_INPUTS`. Las condiciones se evalúan con un subconjunto de Python sin llamadas ni atributos, así que un texto escrito por un usuario no ejecuta código.

## 3. Tipos de enlace

El modo de un enlace de flujo sale de los `bind`:

| Modo | Cuándo | Qué hace |
|---|---|---|
| **push** | la salida tiene `counter` y la entrada `rate_input` | Lo que sale en un paso entra como caudal al siguiente; la salida recibe `ready_input` = entrada lista. Ej.: sachetadora → banda. |
| **pull** | la entrada tiene `counter` y la salida `rate_input` | Lo que consume el destino se descuenta del origen; el destino recibe `ready_input` = origen listo. Ej.: pulmón → sachetadora. |
| **fixed** | ninguno fija el caudal del otro | Solo se acoplan las señales de listo. Varios orígenes a una misma entrada se atienden **de a uno** (selector de válvulas). Ej.: dos marmitas → pasteurizador. |

Si los dos extremos llevan contador, el motor pide **lo pendiente** (lo enviado menos lo recibido) en lugar del caudal del último paso. Así la masa cuadra aunque un paso llegue más de lo que la entrada admite (la sachetadora toma 1,13 kg de golpe en cada ciclo y la salida del tanque está limitada a 3.000 kg/h).

Con `input_offsets` sobre la `rate_input` de un origen en modo pull se representan consumidores que no están en el gemelo (p. ej. otras inyectoras que toma el mismo secador): el motor se los entrega aparte y los descuenta del contador del origen para que el balance de los equipos modelados siga cuadrando.

Enlaces de **servicio** (`kind: utility`, deducido de los puertos): el destino recibe lo ofrecido con `scale`, `offset`, `min` y `max`; el proveedor recibe la suma de los consumos más su `input_offsets`. Enlaces de **señal** (`kind: signal`): una variable pasa a una entrada con la misma transformación.

Todo acople usa los valores al final del paso anterior: un paso de retardo, y el resultado no depende del orden de los equipos.

## 4. Controladores y línea de tiempo

- `batch_loop`: cuando la marmita queda en `idle` sin fase, le envía `run_phases` con la receta. Opciones: `start_at_s`, `cip_every` (batches entre CIP), `cip_min`, `max_batches`.
- `maintenance_crew`: `technicians` (equipos de tipo `operator`) y `covers` (equipos atendidos; por defecto todos). Cuando un equipo atendido levanta una falla, su reloj de reparación se detiene; el primer técnico libre camina por pasillos desde donde esté hasta la posición del equipo (la del layout o `position: [x, y]`) y la reparación corre desde que llega. Al repararse vuelve a su base o va a la siguiente falla en cola. El snapshot de planta trae `maintenance` con la cola, los trabajos en curso y el tiempo de respuesta promedio y máximo.
- `timeline`: comandos a una hora dada (`command`, `args`). `inputs` impone entradas por encima de los enlaces (para simular, por ejemplo, una salida cerrada a mano) hasta que `release` las devuelve a los enlaces.

## 5. KPIs de planta y cuello de botella

- KPIs declarados en `kpis:` (suma de variables o KPIs de equipos, opcionalmente por hora).
- Fracción del tiempo en cada estado por equipo (`equipment.<id>.states`).
- **Cuello de botella** por el método del periodo activo: la estación (`plant_role: station`) que pasa más tiempo activa, es decir, sin esperar entrada (`starved`, `idle`) ni salida (`blocked`). Bandas y túneles (`transport`), pulmones (`storage`) y servicios (`utility`) no compiten. Se devuelven todas las estaciones a menos de 2 puntos de la máxima.

## 6. Escenarios de planta

```yaml
scenarios:
  - id: una-marmita
    duration_s: 28800
    disable: [kettle-02]                       # equipos fuera de servicio
    params: { filler-pouch-01: { cycles_min: 28 } }
    timeline:
      - { at_s: 7200, equipment: boiler-01, command: inject_fault, args: { fault: flame_failure, duration_s: 3600 } }
    expect:
      - { path: plant.kpis.sachets_ok, min: 5900, max: 7000, description: "(cuenta a mano)" }
      - { path: plant.bottleneck, equals: [kettle-01] }
      - { path: equipment.filler-pouch-01.states.starved, min: 0.40 }
      - { path: equipment.boiler-01.state, equals: running }
      - { path: events.pasteurizer-01.divert_started, min: 1 }   # o events.<tipo> para toda la planta
```

Igual que en los equipos, los valores esperados se calculan a mano antes de correr. Si no coinciden, primero se revisa la cuenta y luego el modelo.

## 7. Uso

```bash
uv run twin-lib plant list
uv run twin-lib plant validate                      # carga cada gemelo y corre sus escenarios
uv run twin-lib plant run sauce-plant-v1 --scenario turno-8h --every 1800
uv run pytest packages/twin-runtime/tests/test_plants.py
```

API: `GET /api/plants`, `GET /api/plants/{plant}` y `WS /api/plants/{plant}/simulate?scenario=&speed=&seed=&faults=`. Cada 100 ms envía `{t, snapshot, events}`; el snapshot trae `plant` (KPIs, cuello de botella, tiempo activo), `links` (caudal por enlace, para animar tuberías y bandas) y `equipment` (snapshot de cada equipo con sus fracciones de estado). El cliente puede mandar `{"equipment": id, "command": ..., "args": {...}}` o `{"equipment": id, "inputs": {...}}`.

## 8. Primer alcance: línea caliente de 1.000 ml

`industrial-models/sauce-plant-v1/twin.yaml`: caldera → 2 marmitas → pasteurizador (con tubo de retención) → pulmón caliente → sachetadora de 1.000 ml → banda → túnel de enfriamiento → control de peso → encajadora.

Resultados del turno de 8 h (escenario `turno-8h`): 7 batches, ≈ 11.300 sachets aceptados (≈ 940 cajas), sachetadora sin producto 14 % del tiempo (sobre todo al arranque), rechazo de peso 0,15 %. Lo que el gemelo deja ver:

- **Capacidad del lado caliente.** Dos marmitas de 2.000 kg con un batch de ≈ 118 min entregan ≈ 2,0 t/h. Alcanza para la sachetadora de 1.000 ml (2,04 t/h), pero no para esa y la de 250 ml en caliente a la vez (3,36 t/h entre las dos, la capacidad del pasteurizador).
- **Ensuciamiento del pasteurizador.** En 24 h de marcha continua la salida baja de 95 a ≈ 86 °C y empieza a desviar; hace falta un CIP por turno.
- **Falla de llama.** La reserva de la caldera (25 kg/bar) dura pocos minutos cuando una marmita calienta; la descarga en curso se desvía casi completa.

## 9. Segundo alcance: cascada de inyección

`industrial-models/plastic-injection-plant-v1/twin.yaml`: secador de PS (dryer-03) → dos inyectoras de cubiertos; chiller de moldes (chiller-01) → tres inyectoras; inyectora de tapas (imm-03) → molino al pie de máquina; un técnico de mantenimiento.

- **Secador → inyectora:** la humedad sale del secador como propiedad del flujo y entra a la inyectora. Una falla de regeneración de 4 h sube la humedad a ≈ 0,15 % y las inyectoras de PS rechazan ≈ 3 % por rayas plateadas mientras dura (escenario `falla-secador`).
- **Chiller → molde:** el disparo del chiller calienta el lazo ≈ 0,4 K/min; el molde de cubiertos (30 °C) se calienta cuando el agua pasa de 22 °C, el de tapas (40 °C) aguanta hasta 32 °C (escenario `disparo-chiller`).
- **Técnico:** con dos fallas a la vez la segunda espera ≈ 14 min: 12 mientras el técnico atiende la primera y 1,5 caminando hasta ella (escenario `dos-fallas`).
- El secador de 250 kg/h solo con las dos inyectoras de cubiertos (49 kg/h) tendría 7 h de residencia y ninguna falla del secador se notaría en un turno; en el gemelo toma además 150 kg/h de otras inyectoras de PS no modeladas.

## 10. Limitaciones conocidas

- El producto desviado no vuelve a la marmita: se cuenta en `diverted_l`.
- Una salida que empuja con contador no puede repartir a varios destinos todavía (hace falta un desviador); `load_twin` lo rechaza. Un tanque sí puede alimentar a varias llenadoras (modo pull).
- La temperatura viaja solo entre puertos que la declaran; a través de una banda se pasa con un enlace de señal.
- Las marmitas solo tienen el controlador `batch_loop`; la planificación de órdenes y recetas por producto llega con la escena y la persistencia.
