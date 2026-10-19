# Fábrica de cajas de cartón corrugado (`corrugated-box-plant-v1`)

Cuarto gemelo del repositorio, centrado en el **sistema de transporte** (manejo de materiales) de una planta de cajas. Planta ficticia de referencia: todo valor es un supuesto plausible, no un dato de una planta real.

```bash
uv run python tools/layout/render_layout.py industrial-models/corrugated-box-plant-v1/plant.yaml   # valida y dibuja layout.svg
uv run twin-lib plant run corrugated-box-plant-v1 --scenario nominal --every 1800   # simulación en consola
pnpm gallery    # http://localhost:5173/plant.html?plant=corrugated-box-plant-v1&autosim=1 (con la API en el puerto 8000)
```

## Flujo

```
bodega de bobinas ─(montacargas con pinza)─▶ portabobinas
corrugadora: 2 single facers (ondas B y C) ─▶ puente ─▶ engomadora ─▶ doble mesa ─▶ cortadora longitudinal ─▶ cuchilla ─▶ apilador
apilador ─▶ rodillos ─▶ mesa giratoria ─▶ rodillos ─▶ mesa giratoria ─▶ carro de transferencia (riel norte-sur, 58 m)
carro ─▶ 3 carriles de alimentación (uno por máquina, al oeste del riel) y 4 carriles de pulmón (al este del riel)
línea 1 (cajas grandes): impresora-plegadora-pegadora ─▶ amarradora ─▶ banda ─▶ mesa manual (revisión y etiquetado) ─▶ banda ─▶ paletizador 1 ─▶ envolvedora 1
línea 2 (cajas medianas): impresora-plegadora-pegadora ─▶ amarradora ─▶ banda ─▶ mesa manual (revisión y etiquetado) ─▶ banda ─┐
línea 3 (cajas pequeñas): troqueladora rotativa ─▶ amarradora ─▶ banda ─▶ mesa manual (división y conteo) ─▶ banda ────────────┴▶ banda de unión ─▶ paletizador 2 (compartido) ─▶ envolvedora 2
envolvedoras ─(montacargas)─▶ bodega de producto terminado ─▶ muelles del sur ─▶ camiones
recorte (cortadora y conversión) ─▶ ciclón ─▶ compactadora de pacas
servicios: caldera (vapor a single facers y doble mesa), cocina de almidón (adhesivo), compresores, subestación
```

## Supuestos principales

| Dato | Valor |
|---|---|
| Corrugadora | 2,5 m de ancho, 200 m/min |
| Tamaños de caja (imaginarios) | grande 600 × 400 × 400 mm (línea 1), mediana 400 × 300 × 300 mm (línea 2), pequeña troquelada 250 × 200 × 150 mm (línea 3) |
| Lámina de referencia | caja mediana en doble pared BC: 1,45 × 0,62 m, 3 por ancho ≈ 414 láminas/min |
| Pila | 1,4 m ≈ 600 láminas, una cada ≈ 1,45 min (≈ 41 pilas/h) |
| Transportador de pilas | rodillos motorizados por zonas de 2,4 m, 0,3 m/s |
| Carro de transferencia | 2 m/s, 10 s para cargar y 10 para descargar, una pila por viaje; reparte por peso 10 : 15 : 12 (las pilas por hora que gasta cada máquina) |
| Conversión | impresoras-plegadoras-pegadoras 100 (grandes) y 150 (medianas) láminas/min, troqueladora rotativa 120 láminas/min con 2 cajas por lámina: gastan 10, 15 y 12 pilas/h, 37 de las 41,4 que entrega la corrugadora |
| Fajos y estibas | 25 cajas por fajo (4, 6 y 9,6 fajos/min); paletizador 1 (12 fajos/min, estibas de 24) solo para la línea 1; paletizador 2 (22 fajos/min, estibas de 40) compartido por las líneas 2 y 3, que le llevan 15,6 fajos/min (≈ 71 % de uso) |

## Simulación (`simulation.yaml`)

Tipos de librería de esta planta: `corrugator` (el apilador `stacker-01` representa a toda la corrugadora), `transfer-car`, `box-converter`, `palletizer` e `inline-station` (mesas giratorias, amarradoras y mesas manuales); los transportadores de pilas y las bandas de fajos usan `belt-conveyor` con control por zonas. Las envolvedoras no se simulan.

```
stacker-01 ─▶ cv-st-01 ─▶ tt-01 ─▶ cv-st-02 ─▶ cv-st-03 ─▶ tt-02 ─▶ cv-st-04 ─▶ tc-01
tc-01 ─out_1─▶ lane-01 ─▶ ffg-01 ─▶ strap-01 ─▶ bc-01a ─▶ man-01 ─▶ bc-01b ─▶ pal-01
tc-01 ─out_2─▶ lane-02 ─▶ ffg-02 ─▶ strap-02 ─▶ bc-02a ─▶ man-02 ─▶ bc-02b ─┐
tc-01 ─out_3─▶ lane-03 ─▶ rdc-01 ─▶ strap-03 ─▶ bc-03a ─▶ man-03 ─▶ bc-03b ─┴▶ bc-merge-01 ─▶ pal-02
```

El carro tiene un puerto de salida por carril, así que el motor no necesita repartir una salida entre varios destinos: el reparto es la lógica del carro (cada pila va al carril libre con menos pilas entregadas respecto de su peso).

| Escenario | Qué muestra |
|---|---|
| `nominal` | Cuatro horas: la corrugadora entrega 165 pilas sin bloquearse, el carro reparte 44, 66 y 53; las máquinas trabajan ≈ 97 % (solo esperan la primera pila); 38 estibas del paletizador 1 y 89 del compartido |
| `paper-break` | Rotura de papel de 45 min a las 2 h: faltan 31 pilas y, como el excedente es solo 4,4 pilas/h, los carriles guardan poco y cada máquina para ≈ 30 min; la línea 1 hace 5 estibas menos |
| `shared-palletizer-stop` | El paletizador compartido para 30 min: la banda de unión y las bandas, mesas y amarradoras de las líneas 2 y 3 se llenan una tras otra (cada fotocelda de acumulación detiene a la anterior) y esas máquinas se bloquean ≈ 22 y 27 min; la línea 1, con su paletizador propio, no se entera |
| `strapper-jams` | La amarradora de la línea 3 traba uno de cada 50 fajos: 34 atascos, cada uno con 5 s de vigilante y 2 min de despeje. La troqueladora pasa ≈ 23 % bloqueada y la línea 3 hace 1.697 fajos en vez de 2.222: un 2 % de atascos le cuesta ≈ 24 % |
| `operator-break` | Dos de los tres operarios de la mesa de división de la línea 3 salen 30 min: la mesa atiende 4,3 fajos/min, la cola y las bandas se llenan y la troqueladora se bloquea ≈ 14 min |
| `manual-stop` | Un operario oprime el pulsador de la mesa manual de la línea 2 por 10 min: la mesa no recibe, la banda de 19 m y la amarradora se llenan en ≈ 3 min y la máquina 2 pasa ≈ 7 min bloqueada |
| `random-jams` | Turno de 8 h con atascos al azar (semilla 7) en todas las estaciones: mesas giratorias 0,5 %, amarradoras 1 %, mesas manuales 0,5 %; sirve para ver en la escena cómo se forman y se deshacen las colas |

## Sensores y paradas

Cada banda es una unidad independiente: tiene su motor, su control por zonas y su fotocelda de descarga, y solo se comunica con la anterior y la siguiente por dos señales (entrego una unidad / estoy libre). Entre bandas van las estaciones donde la unidad para y espera una operación. Así un problema en un punto se propaga hacia atrás zona por zona, como en la planta real, en lugar de detener una banda larga entera.

| Dónde | Sensores | Parada automática | Parada manual |
|---|---|---|---|
| Transportadores de pilas y bandas de fajos | Una fotocelda por zona (2,4 m de pilas, 1,2 m de fajos) y la de descarga | La zona para si la de adelante está ocupada; la de cabeza para si la siguiente estación no recibe. Con la banda llena deja de recibir y bloquea a la anterior | Pulsador de paro o cordón a lo largo de la banda (falla `motor_trip` en la simulación) |
| Mesas giratorias `tt-01`, `tt-02` | Acumulación, posición (centrado de la pila) y salida | Vigilante: si la pila no llega a la fotocelda de posición en 5 + 10 s, alarma de atasco y la mesa para hasta que la despejan (5 min) | Pulsador de paro de la mesa |
| Amarradoras `strap-01` a `strap-03` | Acumulación (cola de 2), posición (fajo bajo el arco) y salida | Vigilante de 5 s: fajo torcido o fleje que no cierra; parada hasta el despeje (2 min). Con la cola llena detiene la descarga de la convertidora | Pulsador de paro; el rearme después del atasco es manual |
| Mesas manuales `man-01` a `man-03` | Acumulación (cola de 4), posición (fajo en el puesto de cada operario) y salida | La cola llena detiene la banda anterior; un fajo trabado en el traslado para la mesa (despeje de 1 min) | El operario detiene la mesa con su pulsador; si falta gente (`set_operators`) la mesa sigue, pero más lenta |

Las señales del motor de planta llegan con un paso de retraso, así que las estaciones dejan al menos 2 s entre fajos que salen (con uno por segundo la banda siguiente recibiría el segundo antes de avisar que se llenó). La banda, por su lado, ya no descarta la unidad que llega cuando acaba de avisar que está llena: la deja esperando en la entrada (antes, con la línea 3 atascada, la banda de unión perdía fajos).

## Estado

- **Plano y escena (PR #46):** zonas, 69 equipos, flujos, pasillos y rutas de montacargas; en la escena cada tipo tiene forma propia (`apps/gallery/src/box-plant-pieces.ts`): bobinas, portabobinas, single facer, puente con festones, engomadora, doble mesa, cortadoras, apilador, transportadores de rodillos con pilas, mesas giratorias, carro de transferencia sobre riel, impresoras-plegadoras-pegadoras, troqueladora rotativa, amarradora, banda de fajos, paletizador, cocina de almidón, ciclón y compactadora. Con la simulación, los equipos simulados se dibujan con la geometría de su tipo de librería y se animan en vivo; las piezas de escena quedan para los que no se simulan.
- **Simulación (PR #54):** cuatro tipos de librería y `simulation.yaml` con el transporte conectado.
- **Sensores, estaciones y atascos (este PR):** tipo `inline-station`; mesas giratorias y amarradoras simuladas; una mesa manual por línea que parte la banda larga en dos; control por zonas en todas las bandas; cuatro escenarios de atascos y paros (secciones anteriores).
- **Siguiente, si se pide:** carritos manuales que saquen fajos de la línea, encintadora, usar los carriles de pulmón (el carro los llena con el excedente y los vacía cuando una máquina espera), cambios de pedido en la corrugadora y las máquinas, y montacargas de estibas a la bodega.
