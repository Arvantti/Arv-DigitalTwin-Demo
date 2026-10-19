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
línea 1 (cajas grandes): impresora-plegadora-pegadora ─▶ amarradora ─▶ banda de fajos ─▶ paletizador 1 ─▶ envolvedora 1
línea 2 (cajas medianas): impresora-plegadora-pegadora ─▶ amarradora ─▶ banda ─┐
línea 3 (cajas pequeñas): troqueladora rotativa ─▶ amarradora ─▶ banda ────────┴▶ banda de unión ─▶ paletizador 2 (compartido) ─▶ envolvedora 2
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

Tipos de librería de esta planta: `corrugator` (el apilador `stacker-01` representa a toda la corrugadora), `transfer-car`, `box-converter` y `palletizer`; los transportadores de pilas y las bandas de fajos usan `belt-conveyor`. Las mesas giratorias, las amarradoras y las envolvedoras no se simulan (`via`).

```
stacker-01 ─▶ cv-st-01 ─(tt-01)─▶ cv-st-02 ─▶ cv-st-03 ─(tt-02)─▶ cv-st-04 ─▶ tc-01
tc-01 ─out_1─▶ lane-01 ─▶ ffg-01 ─(strap-01)─▶ bc-01 ─▶ pal-01
tc-01 ─out_2─▶ lane-02 ─▶ ffg-02 ─(strap-02)─▶ bc-02 ─┐
tc-01 ─out_3─▶ lane-03 ─▶ rdc-01 ─(strap-03)─▶ bc-03 ─┴▶ bc-merge-01 ─▶ pal-02
```

El carro tiene un puerto de salida por carril, así que el motor no necesita repartir una salida entre varios destinos: el reparto es la lógica del carro (cada pila va al carril libre con menos pilas entregadas respecto de su peso).

| Escenario | Qué muestra |
|---|---|
| `nominal` | Cuatro horas: la corrugadora entrega 165 pilas sin bloquearse, el carro reparte 44, 66 y 53; las máquinas trabajan ≈ 97 % (solo esperan la primera pila); 38 estibas del paletizador 1 y 89 del compartido |
| `paper-break` | Rotura de papel de 45 min a las 2 h: faltan 31 pilas y, como el excedente es solo 4,4 pilas/h, los carriles guardan poco y cada máquina para ≈ 30 min; la línea 1 hace 5 estibas menos |
| `shared-palletizer-stop` | El paletizador compartido para 30 min: la banda de unión y las bandas de las líneas 2 y 3 se llenan en ≈ 7 min y esas máquinas se bloquean ≈ 23 y 25 min; la línea 1, con su paletizador propio, no se entera |

## Estado

- **Plano y escena (PR #46):** zonas, 69 equipos, flujos, pasillos y rutas de montacargas; en la escena cada tipo tiene forma propia (`apps/gallery/src/box-plant-pieces.ts`): bobinas, portabobinas, single facer, puente con festones, engomadora, doble mesa, cortadoras, apilador, transportadores de rodillos con pilas, mesas giratorias, carro de transferencia sobre riel, impresoras-plegadoras-pegadoras, troqueladora rotativa, amarradora, banda de fajos, paletizador, cocina de almidón, ciclón y compactadora. Con la simulación, los equipos simulados se dibujan con la geometría de su tipo de librería y se animan en vivo; las piezas de escena quedan para los que no se simulan.
- **Simulación (este PR):** cuatro tipos de librería y `simulation.yaml` con el transporte conectado (sección anterior).
- **Siguiente, si se pide:** usar los carriles de pulmón (el carro los llena con el excedente y los vacía cuando una máquina espera), cambios de pedido en la corrugadora y las máquinas, y montacargas de estibas a la bodega.
