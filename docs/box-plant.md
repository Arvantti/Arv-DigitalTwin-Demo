# Fábrica de cajas de cartón corrugado (`corrugated-box-plant-v1`)

Cuarto gemelo del repositorio, centrado en el **sistema de transporte** (manejo de materiales) de una planta de cajas. Planta ficticia de referencia: todo valor es un supuesto plausible, no un dato de una planta real.

```bash
uv run python tools/layout/render_layout.py industrial-models/corrugated-box-plant-v1/plant.yaml   # valida y dibuja layout.svg
pnpm gallery    # http://localhost:5173/plant.html?plant=corrugated-box-plant-v1 (con la API en el puerto 8000)
```

## Flujo

```
bodega de bobinas ─(montacargas con pinza)─▶ portabobinas
corrugadora: 2 single facers (ondas B y C) ─▶ puente ─▶ engomadora ─▶ doble mesa ─▶ cortadora longitudinal ─▶ cuchilla ─▶ apilador
apilador ─▶ rodillos ─▶ mesa giratoria ─▶ rodillos ─▶ mesa giratoria ─▶ carro de transferencia (riel norte-sur, 58 m)
carro ─▶ 4 carriles de alimentación (uno por máquina, al oeste del riel) y 4 carriles de pulmón (al este del riel)
línea 1 y 2: impresora-troqueladora-plegadora-pegadora ─▶ amarradora ─▶ banda de fajos ─▶ paletizador ─▶ envolvedora
línea 3: troqueladora rotativa ─▶ amarradora ─▶ banda ─▶ paletizador ─▶ envolvedora
línea 4: troqueladora plana ─▶ rodillos ─▶ pegadora ─▶ amarradora ─▶ banda ─▶ paletizador ─▶ envolvedora
envolvedoras ─(montacargas)─▶ bodega de producto terminado ─▶ muelles del sur ─▶ camiones
recorte (cortadora y conversión) ─▶ ciclón ─▶ compactadora de pacas
servicios: caldera (vapor a single facers y doble mesa), cocina de almidón (adhesivo), compresores, subestación
```

## Supuestos principales

| Dato | Valor |
|---|---|
| Corrugadora | 2,5 m de ancho, 200 m/min |
| Lámina de ejemplo | caja regular 400 × 300 × 300 mm en doble pared BC: 1,45 × 0,62 m, 3 por ancho ≈ 414 láminas/min |
| Pila | 1,4 m ≈ 600 láminas, una cada ≈ 1,45 min (≈ 41 pilas/h) |
| Transportador de pilas | rodillos motorizados por zonas de 2,4 m, 0,3 m/s |
| Carro de transferencia | 1 m/s, una pila por viaje |
| Conversión | impresoras-plegadoras-pegadoras 250 láminas/min, troqueladora rotativa 200, troqueladora plana 115, pegadora 250 cajas/min |
| Fajos y estibas | 25 cajas por fajo, 40 fajos por estiba |

## Estado

- **Plano y escena (este PR):** zonas, 78 equipos, flujos, pasillos y rutas de montacargas; en la escena cada tipo tiene forma propia (`apps/gallery/src/box-plant-pieces.ts`): bobinas, portabobinas, single facer, puente con festones, engomadora, doble mesa, cortadoras, apilador, transportadores de rodillos con pilas, mesas giratorias, carro de transferencia sobre riel, impresoras-plegadoras-pegadoras, troqueladoras, pegadora, amarradora, banda de fajos, paletizador, cocina de almidón, ciclón y compactadora. Las pilas en los transportadores son ilustrativas: sin simulación.
- **Siguiente:** tipos de librería para simular el transporte (corrugadora como fuente de pilas, transportador de pilas por zonas de acumulación, carro de transferencia que reparte entre carriles, máquina de conversión, paletizador) y `simulation.yaml` con las líneas conectadas en el motor y escenarios (cambio de pedido, carro detenido, rotura de papel). El motor hoy no reparte una salida entre varios destinos (`docs/plant-engine.md`); el carro necesitará esa regla.
