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
| `camera=general` o `camera=<id de zona>` | Cámara inicial |
| `select=<id de equipo>` | Equipo seleccionado |
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
| `GET /api/plants/{id}` | Zonas, equipos (con `sim` si el motor los simula), pasarelas, tuberías (flujos `piped`, con `rate`, `unit` y `links`: los enlaces del motor que las cruzan), líneas y escenarios |
| `WS /api/plants/{id}/simulate?scenario=&speed=` | Cada 100 ms: `{t, speed, paused, snapshot: {equipment, lines, links}, events}`. Cliente → servidor: `{equipment, command, args}`, `{speed}`, `{pause}` |

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

## Pendiente de la fase 5

- Los equipos de la librería que aún no tienen tipo siguen siendo volúmenes (fase 3).
- Las tuberías de tramos sin simular siguen animándose por estado (CIP, agua helada).
- Selección desde la lista de activos y recorridos definidos por la planta (hoy se derivan de las zonas).
- Muros con aberturas, escaleras de acceso con geometría de escalón y pasarelas de la planta de inyección (el plano no las describe).
- De la planta de inyección siguen como volúmenes los equipos sin tipo en la librería (silos, mezcladores, estaciones de ensamble, compresores, torre de enfriamiento y otros); el empaque, los secadores, los chillers y el molino de reciclaje ya tienen geometría propia.
