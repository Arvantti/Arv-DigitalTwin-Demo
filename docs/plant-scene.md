# Escena de planta (fase 5)

La escena de planta dibuja un `plant.yaml` completo en 3D y, cuando la planta tiene `simulation.yaml`, la anima con la simulación del motor de planta (`docs/plant-engine.md`). Vive en la galería: `plant.html`.

```bash
uv run uvicorn twin_api.main:app --port 8000   # API (planos y simulación)
pnpm gallery                                    # http://localhost:5173/plant.html
```

Parámetros de URL, pensados para capturas automáticas:

| Parámetro | Efecto |
|---|---|
| `plant=<id>` | Planta (por defecto `sauce-plant-v1`; también `plastic-injection-plant-v1`, con sus 29 inyectoras, la banda, el empaque, los secadores, los chillers y el molino animados; escenarios `nominal`, `conveyor-trip`, `dryer-stop`, `chiller-trip` y `pelletizer-jam`) |
| `camera=general`, `camera=<id de zona>` o `camera=nivel-<n>` | Cámara inicial (`nivel-<n>`: el equipo con `params.level: n`, en un edificio por pisos) |
| `select=<id de equipo>` | Equipo seleccionado |
| `focus=<id de equipo>` | Acerca la cámara a ese equipo |
| `routes=0` | Oculta los pasillos, las rutas y los montacargas y operarios que las recorren |
| `autosim=1&scenario=boiler-trip&speed=900` | Conecta la simulación al cargar |
| `tour=1` | Inicia el recorrido de cámara |
| `lighting=day\|night\|golden`, `quality=high` | Iluminación y calidad |
| `shot=1` (`ui=1` conserva la interfaz) | Modo captura: `window.__ready` se marca al terminar; con `autosim`, tras recibir datos (`messages=N`) |

## Qué muestra

- **Zonas** como pisos de color por clase higiénica (sucia, limpia, alto cuidado, servicios, administrativa, exterior), con su volumen en líneas y su nombre.
- **Equipos simulados** con la geometría de su tipo de librería y los parámetros ya resueltos por la API (`sim.type`, `sim.params`). Se animan con los canales que publica el comportamiento; el modelo no calcula nada.
- **Equipos sin tipo en la librería** como volúmenes de su huella (`footprint`). Los marcados `overhead: true` (puente grúa de la planta de inyección) se dibujan como vías y viga puente a su altura.
- **Pasarelas** (`walkways` del `plant.yaml`): piso de rejilla a su elevación, barandas a ambos lados, columnas y escalera en los puntos de acceso.
- **Tuberías** de los flujos `piped: true`: suben a un nivel de rack, cruzan en ortogonal y bajan al equipo de destino; el color sale del medio (vapor, aceite, agua, producto). Cuando llevan producto circulan esferas luminosas. La animación sale del caudal que publica el motor (`snapshot.links`, ver `docs/plant-engine.md`): la tubería suma el `flow_kg_h` de los enlaces que cruzan su tramo (las dos marmitas comparten la bomba) y lo divide por un caudal de referencia, el `rate` del plano si viene en kg/h o L/h, o el máximo visto. Con más carga las esferas son más numerosas y avanzan más rápido; sin caudal desaparecen. El desvío del pasteurizador también es un enlace del motor (de la salida de retorno del pasteurizador a la marmita que descarga): sus tuberías solo llevan esferas mientras el pasteurizador desvía, y entonces la que va al pulmón se apaga. Los tramos que el motor no simula (CIP, agua helada) conservan el indicio por estado: circulan si el origen simulado está en servicio (y, con fases, descargando), o, si el origen no se simula, si lo está el destino. El trazado es de recorrido, no de ingeniería de detalle.
- **Selección de activos:** clic en un equipo para ver su estado, fase, fallas, variables y los comandos y fallas que se pueden inyectar. Un clic en el piso deselecciona.
- **Cámaras:** vista general y una por zona de producción o servicios grande. **Recorrido** (`tour=1` o el botón): la cámara visita la vista general y esas zonas de oeste a este, el sentido del flujo; cualquier clic o la rueda del ratón lo interrumpe.
- **HUD de planta:** reloj de simulación, selector de escenario, velocidad, pausa, KPIs de cada línea y eventos de toda la planta.

## API

| Endpoint | Qué entrega |
|---|---|
| `GET /api/plants` | Plantas con plano y si tienen simulación conectada |
| `GET /api/plants/{id}` | Zonas (con `elevation` si la traen), equipos (con `sim` si el motor los simula), pasarelas, tuberías (flujos `piped`, con `rate`, `unit`, `route`, `diameter_in` y `links`: los enlaces del motor que las cruzan), líneas y escenarios |
| `WS /api/plants/{id}/simulate?scenario=&speed=` | Cada 100 ms: `{t, speed, paused, snapshot: {equipment, lines, links}, events}`. Cliente → servidor: `{equipment, command, args}`, `{speed}`, `{pause}` |

## Edificio por pisos y red de agua (acueducto a escala)

`plant=water-network-scale-v1` dibuja el banco de pruebas del acueducto (`docs/water-network-plant.md`) como un edificio de tres pisos:

- **Pisos:** cada zona con `elevation` se dibuja a su cota. Los pisos elevados llevan una losa delgada translúcida, para ver lo que hay debajo, y su volumen arranca en esa cota.
- **Tubos de la red de agua:** los flujos con `route` siguen el trazado del plano (puntos `[x, y, z]`). Su grosor sale de `diameter_in` (4" hasta el nivel 1, 2" en la columna, 3" en la recirculación). Las esferas avanzan a la velocidad real del agua (`velocity_m_s` del dominio hidráulico) y su número sigue el caudal frente al `rate` del plano (en m³/h se compara en kg/h).
- **Bajantes:** un flujo sin ruta cuyo origen está por encima de la tapa del destino baja vertical desde el costado del equipo de arriba y entra por la tapa del de abajo. Varias bajantes al mismo tanque se separan.
- **Soportes:** un equipo apoyado por encima del piso de su zona (la estación reguladora, 1 m sobre el piso 1; los niveles 2 a 4 de la rejilla) lleva cuatro patas y un marco. Los equipos chicos, como las válvulas entre niveles, cuelgan de su tubería.
- **Cámaras:** vista general del edificio, una por piso (zona) y una por nivel de la rejilla (`NIVEL 1` a `NIVEL 4`).

La API entrega en cada tubería, además, `route`, `diameter_in` e `inner_diameter_mm` cuando el plano los trae.

## Sala de control del PLC (planta de salsas)

La zona `sala-control` (14 × 10 m, junto a la subestación) tiene tres piezas de escena que no son equipos de la librería y no calculan nada: `plc_cabinet` (gabinete del PLC con luces de estado), `operator_desk` (puesto con dos monitores) y `control_panel` (panel de pared con un mosaico de gráficos de tendencia). Cámara «SALA DE CONTROL DEL PLC» o `camera=sala-control`.

El panel se configura en el `plant.yaml`, en la clave `panel` del equipo; la API la entrega tal cual en `GET /api/plants/{id}`:

```yaml
panel:
  title: Panel de planta
  slots:                      # 8 espacios, 4 columnas × 2 filas
    - { title: Presión de vapor, equipment: boiler-01, variable: pressure_bar, unit: bar }
    - { title: Libre 1, equipment: null, variable: null }   # sin asignar: se muestra «SIN ASIGNAR»
```

Cada espacio guarda las últimas 160 muestras de `snapshot.equipment[equipment].variables[variable]` (una por mensaje del WebSocket) y dibuja el valor actual y la tendencia. Para cambiar un gráfico basta cambiar `equipment` y `variable` por cualquier variable que publique un equipo simulado; los gráficos definitivos se definen después.

## Bodega de producto terminado y despacho (planta de salsas)

La bodega `bodega-pt` (14 × 58 m) es contigua a la zona de empaque (`encajado`): la tarima sale de la envolvedora `wrapper-01`, pasa directo por la puerta `door-pt-01` de la pared (sin esclusa), se estiba en las estanterías y, para despachar, sale por el carril de alistamiento a los muelles del patio, donde se carga el camión. El flujo del plano es `wrapper-01 → rack-pt-02 → dock-02 → truck-01`. El plano no traía medidas de esta parte; la distribución es un supuesto (ver D30 en el registro).

Son piezas de la escena (`apps/gallery/src/warehouse.ts`), no equipos de la librería: no calculan nada. Se dimensionan con la `footprint` del `plant.yaml`:

| Tipo en `plant.yaml` | Pieza |
|---|---|
| `pallet_rack` | Estantería de 4 niveles con tarimas (85 % ocupadas); de doble fondo si el ancho es ≥ 2,2 m. Sirve también a la planta de inyección (el largo es el lado mayor) |
| `pass_through_door` | Marco del paso directo empaque → bodega |
| `dock_leveler` | Andén con nivelador, topes y semáforo de muelle |
| `delivery_truck` | Camión sencillo de caja seca de 8,4 m; `params.state: loading` abre las puertas y muestra tarimas cargadas, `waiting` lo deja cerrado |

Dos pasillos de recibo y uno de alistamiento (`aisles`) y dos rutas de montacargas (`routes`): `fk-empaque-bodega` y `fk-bodega-despacho`. Cámara «BODEGA Y DESPACHO» o `camera=bodega-pt`. La API entrega ahora la clave `params` de cada equipo.

## Pasarelas en el `plant.yaml`

Sección opcional `walkways`, validada por `tools/layout/render_layout.py` y dibujada en el plano 2D:

```yaml
walkways:
  - { id: walk-marmitas, name: Pasarela de marmitas, zone: proceso-caliente,
      path: [[35.5, 35.2], [47, 35.2]],   # eje, puntos [x, y] en metros
      width: 1.0,                          # ancho libre
      elevation: 3.0,                      # altura del piso de la pasarela
      access: [[35.5, 35.2]] }             # escaleras: puntos [x, y] que bajan al piso
```

El validador exige: eje de 2 o más puntos, ancho y elevación positivos, todos los puntos dentro de su zona, elevación por debajo de la cubierta de la zona, y avisa si cruza un equipo más alto que la pasarela. El formato se definió en esta fase porque el plano no describía pasarelas.

## Pasillos y rutas en el `plant.yaml`

Secciones opcionales `aisles` (pasillos) y `routes` (rutas de montacargas y de operarios). El validador las comprueba y el plano 2D las dibuja (naranja continua los montacargas, verde punteada los operarios). La escena pinta los pasillos de montacargas como franjas amarillas tenues en el piso y cada ruta como una cinta; sobre cada una circula un montacargas (de ida cargado con una estiba de cajas, de vuelta vacío), un carro de canastillas (`kind: cart`, azul punteada en el plano 2D) o un operario que camina (`routes=0` en la URL las oculta). Es un recorrido ilustrativo: el motor de planta no simula todavía el transporte.

```yaml
aisles:
  - { id: aisle-semielaborado, kind: forklift, rect: [34, 87.2, 90, 3.8] }
routes:
  - { id: fk-sf-ensamble-1, name: "Semielaborado a la celda de ensamble 1", kind: forklift,
      from: rack-sf-03, to: assembly-01,           # equipo (extremo a ≤ 3,5 m de su huella) o zona (extremo dentro)
      load: "pedal, palanca y cuerpos de papelera", width: 1.5, trips_per_h: 3,
      path: [[98, 89.1], [79, 89.1], [79, 74.25], [134, 74.25], [134, 66.5], [129, 66.5]] }
  - { id: pe-ensamble-empaque, name: "Operario lleva unidades armadas a empaque 3", kind: pedestrian,
      from: assembly-01, to: pack-station-03, width: 1.0, walkers: 1,
      path: [[131, 59], [131, 53], [136, 53], [136, 33]] }
```

El validador exige: `kind` `forklift` o `pedestrian`, 2 o más puntos dentro del predio, ancho positivo, `from` y `to` existentes con el extremo junto al equipo o dentro de la zona, que ninguna ruta cruce un equipo de piso (`passes_under` permite cruzar uno elevado a propósito, pero la planta de plásticos ya no lo usa: la banda no se cruza) y que las de montacargas vayan siempre dentro de un pasillo de `aisles` con `kind: forklift`. `trips_per_h` y `walkers` son supuestos.

**Carriles.** En la escena, montacargas y carros circulan por la derecha: la ida (cargada) y el regreso (vacío) van por carriles distintos a 0,8 m (montacargas) y 0,5 m (carros) del eje de la ruta, y ambos se dibujan en el piso. Los operarios caminan por el eje.

**Almacenes.** `almacen-semielaborado` (al norte de la nave, estanterías con cajas plásticas azules, `params.stage: semielaborado`) guarda las piezas inyectadas que llevan los montacargas desde los buffers de las inyectoras y alimenta las celdas de ensamble; la bodega de producto terminado (`params.stage: terminado`, cajas de cartón) recibe lo armado y empacado. Hoy ninguno de los dos se simula (sin inventario), ver `docs/registro` D40.

## Pendiente de la fase 5

- Los equipos de la librería que aún no tienen tipo siguen siendo volúmenes (fase 3).
- Las tuberías de tramos sin simular siguen animándose por estado (CIP, agua helada).
- Selección desde la lista de activos y recorridos definidos por la planta (hoy se derivan de las zonas).
- Muros con aberturas, escaleras de acceso con geometría de escalón y pasarelas de la planta de inyección (el plano no las describe).
- De la planta de inyección siguen como volúmenes los equipos sin tipo en la librería (silos, mezcladores, estaciones de ensamble, compresores, torre de enfriamiento y otros); el empaque, los secadores, los chillers y el molino de reciclaje ya tienen geometría propia.

**Ciclo ilustrativo de las inyectoras.** Sin simulación conectada (p. ej. la versión publicada sin la API) cada inyectora repite sus fases (cierre, inyección, enfriamiento, apertura, expulsión) y el robot deposita la pieza en la canastilla de su costado; con la API conectada manda el simulador.

**Equipos de proceso sin tipo de librería.** Los tipos del plano que no se simulan (tanques, bombas, molinos, emulsificador, CIP, servicios, mesas y estantes) se dibujan con las piezas de `apps/gallery/src/process-pieces.ts`, dimensionadas con la huella; los que sí están en la librería pero sin simular (selladoras, pesadora, túnel de enfriamiento, cocedores) usan su forma con parámetros por defecto. Un tipo sin pieza sigue viéndose como un cubo.
