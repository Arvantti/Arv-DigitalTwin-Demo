# Hoja de ruta de datos reales para todos los gemelos

Estado (2026-10-25): **fase E, paso E1 hecho**: pedidos inventados con ventana móvil, secuenciador de referencia y tabla de programación en el panel lateral de salsas y plásticos, con pedido urgente (D75, [programacion.md](programacion.md)). Antes (2026-10-19): **fases A, B, C y D hechas**: catálogo de plásticos, salsas y cajas con su panel de productos y ruta en 3D (decisiones D56, D59 y D60), más el editor de hojas de ruta con tiempos por etapa (D61); sigue la fase E (pedidos). Plan en la decisión D54 de `docs/registro/decisiones/decisiones.md`.

El autor definió esta hoja de ruta para la planta de plásticos (D48) y el 2026-10-18 la extendió a todos los gemelos. Hoy cada planta tiene sus datos repartidos en `plant.yaml` (parámetros de cada equipo, recetas de salsas) y `simulation.yaml`, todos supuestos. El objetivo es que el gemelo se alimente con un **catálogo** de datos reales y que los **pedidos** los secuencie el backend Fractal.

Los seis pasos del autor:

1. Alimentación con datos reales: productos, tiempo de ciclo, tiempo entre etapas, proceso de ensamble, librería de moldes o recetas por producto, materia prima y color.
2. Tamaños de equipos (por ejemplo, tres tamaños de inyectora).
3. Pocos productos de ejemplo.
4. Interfaz para cargar productos y, al seleccionar uno, ver su ruta en el 3D.
5. Ventana de pedidos: cantidad y fecha.
6. Los pedidos pasan al backend Fractal, que secuencia la producción con la configuración de la planta.

Excepciones del autor: el **aeropuerto** solo tiene entrada y destino de maletas, y el **acueducto** trata de optimizar caudales, presiones y ahorros, sin pedidos.

---

## 1. Modelo de datos común

Un catálogo por planta en `industrial-models/<planta>/catalog/`, en YAML, validado con un JSON Schema común (`industrial-models/_schema/catalog.schema.json`). Las mismas entidades sirven para las cinco plantas; cada planta usa las que le aplican.

| Entidad | Qué es | Campos principales |
|---|---|---|
| `materials` | Materia prima e insumos | `id`, nombre, unidad, densidad, color (si aplica), costo por unidad (opcional), `assumed` |
| `products` | Lo que sale de la planta (SKU) o un semielaborado | `id`, nombre, familia, presentación o tamaño, unidad de conteo, `bom` (materiales y semielaborados con cantidad), `routing` |
| `routing` (dentro del producto) | Ruta de proceso: etapas en orden | por etapa: `stage`, clase de equipo que la hace (`equipment_class` o lista de equipos), `tooling` requerido, tasa o tiempo de ciclo, cambio (setup) y **tiempo hasta la etapa siguiente** (transporte o espera) |
| `tooling` | Lo que se monta en un equipo para hacer un producto | `kind: mold \| recipe \| die \| format`, `id`, compatibilidad con equipos (tonelaje, formato, ancho), tiempo de cambio, cavidades o tamaño de lote |
| `equipment_sizes` | Tamaños de un tipo de equipo | preset de la librería por tamaño (pequeña, mediana, grande) con su capacidad; cada equipo del `plant.yaml` apunta a uno |
| `orders` | Pedido | `id`, producto, cantidad, fecha de entrega, prioridad, cliente ficticio |
| `schedule` | Respuesta de Fractal | por asignación: pedido, etapa, equipo, herramental, inicio, fin y cambio previo |

Reglas:

- **El catálogo es la fuente; el motor lo lee.** Los parámetros que hoy están repetidos en `plant.yaml` (`product`, `cycle_s`, `part_g`, `cavities` de cada inyectora; `recipes` de salsas) pasan a referenciar el catálogo (`tooling: mold-balde-12l`). Durante la migración el motor acepta las dos formas.
- **Ruta por producto calculada, no dibujada.** La ruta en 3D se obtiene uniendo las etapas del `routing` con los enlaces de `simulation.yaml` y las rutas de montacargas; así nunca queda desfasada del motor.
- **Compatibilidad verificada.** El validador rechaza, por ejemplo, un molde de 7 kg de inyección en una inyectora de 0,15 kg, o un sachet de 1.000 ml en una sachetadora de 250 ml.
- **Datos inciertos marcados** con `assumed: true`, como en la librería. Sin marcas ni nombres de empresas reales.
- **Tolerancias en porcentaje** de cada presentación (regla del autor), no en gramos o mililitros fijos.

## 2. Qué aplica a cada gemelo

| Paso | Plásticos | Salsas | Fábrica de cajas | Aeropuerto | Acueducto |
|---|---|---|---|---|---|
| 1. Datos reales | Productos, moldes (cavidades, peso, ciclo, tonelaje), resina y color (masterbatch), ensamble de la papelera | SKU = receta × presentación (250, 500 y 1.000 ml); fórmulas y fases ya están en `recipes`; tasas de llenado; CIP entre sabores | Referencias de caja (tamaño, flauta, impresión), troqueles y clisés, ancho de bobina | Maleta con **entrada** (isla de check-in o banda de llegada) y **destino** (vuelo y carrusel); plan de vuelos | Curvas de demanda por casa, fugas, curva de las bombas, consignas de la PRV y aperturas de válvulas |
| 2. Tamaños de equipos | 3 tamaños de inyectora: pequeña (100–150 t), mediana (300–650 t), grande (1.000–1.500 t), sobre los presets existentes | Marmitas por lote, sachetadoras por formato | Convertidoras por tamaño de caja (grande, mediana, pequeña) | Islas, máquinas CT y carruseles por capacidad | Bombas, PRV y diámetros (ya modelados) |
| 3. Productos de ejemplo | Cubiertos (sin ensamble), balde 12 L, papelera 20 L (cuerpo + tapa + pedal + bisagras, con ensamble) | Salsa de tomate 1.000 ml, mayonesa 500 ml, mostaza 250 ml (una por familia) | Una caja por línea: grande, mediana y pequeña | Cuatro vuelos ficticios (V101, V205, V317, V422) y una llegada | No aplica: en su lugar, 2 o 3 perfiles de día (laborable, fin de semana, pico) |
| 4. Interfaz y ruta 3D | Seleccionar producto → resaltar inyectora, buffer, montacargas, estantería, ensamble y almacén | Seleccionar SKU → marmita, pasteurizador, túnel, llenadora, empaque y bodega | Seleccionar caja → corrugadora, carro, carril, convertidora y paletizador | Seleccionar vuelo → recorrido de sus maletas desde la entrada hasta el carrusel | Seleccionar casa → camino del agua desde las bombas y la PRV, con su presión |
| 5. Pedidos | Cantidad y fecha | Cantidad y fecha | Cantidad y fecha | **Plan de vuelos** (hora, carrusel, maletas esperadas) en lugar de pedidos | **Objetivo de optimización** (presión mínima 15 mca en la casa crítica, meta de reducción de pérdidas) en lugar de pedidos |
| 6. Fractal | Secuencia pedidos en inyectoras compatibles, minimiza cambios de molde y color | Secuencia lotes por familia y alérgenos, minimiza CIP | Combina pedidos en la corrugadora (ancho y flauta) y reparte en convertidoras | Opcional: asignación de carruseles y alertas de cierre de vuelo | Optimiza consignas hora a hora (PRV y válvulas) y devuelve el ahorro estimado |

## 3. Arquitectura del paso 6 (Fractal)

Decidida por el autor: backend de la aplicación en Cloudflare Workers y backend Fractal (IA + procesos determinísticos) en un VPS conectado a Cloudflare.

```
Galería (Pages)  ──pedido──▶  Worker /api/orders  ──▶  cola  ──túnel──▶  Fractal (VPS)
      ▲                         │  D1: catálogo y pedidos                    │ secuenciador determinístico
      └──── schedule ◀──────────┴──────────── schedule (JSON) ◀──────────────┘ + IA para explicar y ajustar
```

- El **contrato** (`orders` y `schedule` del modelo común) se fija antes que el servicio: es lo que permite trabajar en paralelo.
- Mientras Fractal no esté, un **secuenciador local de referencia** en `twin_runtime` (regla de fecha de entrega más próxima, respetando compatibilidad y cambios) produce el mismo `schedule`. Sirve como prueba y como línea base para medir lo que Fractal mejora.
- El motor **ejecuta** el `schedule` (cambia el herramental y el producto de cada equipo a su hora) y devuelve KPIs: cumplimiento de fechas, cambios, OEE.
- El acueducto usa el mismo canal con otro cuerpo: el "pedido" es un objetivo y el "schedule" son consignas por hora. Encaja con la visión del autor de crear escenarios conversando con Claude por MCP y con OPC UA hacia el PLC.

## 4. Orden de fases

| Fase | Contenido | Entrega |
|---|---|---|
| A | Esquema común del catálogo y validador (`twin-lib catalog validate`) | Esquema, validador y pruebas |
| B | Catálogo piloto de **plásticos**: 3 productos, sus moldes, resinas y colores, y los 3 tamaños de inyectora; el motor lee el molde del catálogo | Planta de plásticos corriendo con el catálogo, escenarios iguales |
| C | Catálogos de salsas y de cajas (mismo esquema) | Las dos plantas corriendo con el catálogo |
| D | Interfaz de productos en la escena: lista, carga y edición, selección con la ruta resaltada en 3D | Panel en `plant.html` para las tres plantas de producción |
| E | Ventana de pedidos y secuenciador local de referencia; el motor ejecuta el `schedule` | Pedidos con cantidad y fecha y su efecto en la simulación |
| F | Worker de pedidos en Cloudflare y conexión con Fractal | Pedidos guardados en D1 y secuenciados por Fractal |
| G | Adaptaciones: plan de vuelos del aeropuerto (entrada y destino) y objetivos de optimización del acueducto | Ambos gemelos con su versión del paso 1, 4 y 5 |

Las fases A a C dan los pasos 1 a 3; D el 4; E el 5; F el 6. G puede ir en paralelo desde que exista la fase A.

## 5. Fases A y B (hechas, 2026-10-19)

- Esquema común: `industrial-models/_schema/catalog.schema.json`. Validador: `uv run twin-lib catalog validate` (esquema más reglas cruzadas de `packages/twin-runtime/src/twin_runtime/catalog.py`: referencias, molde que cabe en cada inyectora candidata por tonelaje y capacidad de inyección, color permitido, lista de materiales sin ciclos, cada inyectora del plano en un tamaño, y el plano mostrando los mismos datos del molde montado).
- Catálogo de plásticos en `industrial-models/plastic-injection-plant-v1/catalog/`: `materials.yaml` (PS, HDPE, PP reciclado y masterbatch blanco, azul y gris), `tooling.yaml` (4 moldes), `products.yaml` (cubiertos, balde 12 L y papelera 20 L con sus dos semielaborados y su ruta), `equipment-sizes.yaml` (pequeña 50–200 t: 10 inyectoras; mediana 250–800 t: 14; grande 1.000–2.000 t: 5), `setup.yaml` (molde y color montados en imm-01, imm-02, imm-06, imm-19 e imm-21) y `orders.yaml` (vacío hasta la fase E).
- El motor copia producto, resina, cavidades, peso y ciclo del molde montado a la inyectora; `simulation.yaml` ya no los repite (si los repite, es error). Los 8 escenarios de la planta dan exactamente el mismo resultado que antes.
- `tools/logistics/pallet_sizing.py` toma el volumen por pieza de esas cinco inyectoras del producto del catálogo.
- Ruta de un producto: `uv run twin-lib catalog route plastic-injection-plant-v1 papelera-20l` (la usará la interfaz de la fase D para resaltarla en 3D).

Orden elegido por el autor (2026-10-19): primero la fase D y luego la C.

## 5b. Fase D (hecha, 2026-10-19): productos y su ruta en el 3D

- La API agrega `catalog` a `GET /api/plants/{id}`: cada producto con nombre, colores, moldes, lista de materiales y su ruta como grafo (`stages` con `equipment` y `active`, y `edges` entre etapas; los componentes llegan a la etapa del producto que los usa), más el tamaño de cada equipo. La versión publicada sin API lo recibe igual, porque el export estático guarda esa misma respuesta.
- En la escena (`plant.html`), el panel PRODUCTOS lista los productos. Al elegir uno se resaltan los equipos activos de cada etapa con su número, las alternativas en gris, y un recorrido con piezas que avanzan entre etapas; la cámara encuadra la ruta y el detalle muestra molde, componentes y etapas (cada equipo es un enlace que lo selecciona). Parámetro de URL: `&product=<id>`.
- CARGAR PRODUCTO acepta un YAML o JSON con el formato de `catalog/products.yaml` (uno o una lista `products:`). `POST /api/plants/{id}/products/check` lo valida contra el catálogo y el plano y devuelve su ruta; el producto queda solo en la sesión del navegador (guardarlo es la fase F). Sin API, el botón explica que la validación la necesita.
- El HUD muestra el tamaño de la inyectora seleccionada (pequeña, mediana o grande).

## 5c. Fase C (hecha, 2026-10-19): catálogos de salsas y cajas

- El esquema y el validador sirven ahora para cuatro clases de herramental: molde, receta, formato y troquel. Cada uno puede declarar `layout_types` (dónde se monta) y `params` (lo que impone al equipo en la simulación). Compatibilidad: un molde por tonelaje e inyección; una receta por el `batch_kg` del recipiente; un formato de sachet por los `formats_ml` (o `unit_ml`) de la llenadora.
- Los tamaños de equipo se definen por el rango de cualquier parámetro del plano (`by`, por defecto `clamp_t`) o por una lista de equipos.
- **Salsas** (`sauce-plant-v1/catalog/`): ingredientes de las fórmulas, laminado y caja; 3 recetas (tomate 2.000 kg, mayonesa 1.500 kg, mostaza 1.000 kg) que deben coincidir con `recipes` del plano; 3 formatos de sachet (250, 500 y 1.000 ml); 3 graneles semielaborados y 6 SKU (tomate 1.000 y 250 ml; mayonesa 1.000, 500 y 250 ml; mostaza 250 ml) con tolerancia de 4 %; montaje de las 5 recetas y 6 llenadoras; tamaños de llenadora por formato. El motor da a cada llenadora su `unit_ml` desde el formato y exige que cada lote de los escenarios cargue lo que dice la receta. Salsa BBQ y salsa rosada esperan su receta.
- **Cajas** (`corrugated-box-plant-v1/catalog/`): papel liner y medium, almidón, tinta y fleje; caja grande, mediana y pequeña troquelada, con la ruta común de la corrugadora al carro y luego su línea; formatos de las dos impresoras-plegadoras-pegadoras y troquel de la troqueladora (cajas por lámina); convertidoras por tamaño (grande, mediana, pequeña).
- Los escenarios de salsas y de cajas dan exactamente el mismo resultado que antes. La escena ya muestra los productos de las tres plantas (receta, formato o troquel en la ficha).

## 5d. Editor de hojas de ruta (hecho, 2026-10-19)

Pedido del autor antes de la fase E: ver la ruta de un producto en una tabla y en el 3D, con el tiempo unitario y el del lote mínimo en cada paso, y poder editarla. Detalle en `docs/plant-scene.md` («Hoja de ruta y editor de rutas»).

- La API agrega a cada etapa `times`: tiempo unitario, lote, duración del lote, tiempo hasta la siguiente y de dónde sale cada valor (catálogo, molde, receta o plano). El catálogo de cada producto viaja completo (`source`) para poder editarlo.
- El esquema admite `batch_qty` y `batch_min` en cada etapa. Las cajas declaran el corte de la corrugadora, la pila, el fajo y la estiba.
- El editor guarda en la sesión o descarga el YAML. Guardar en el servidor llega con la fase F.

## 6. Primer PR propuesto (histórico)

**Fases A y B juntas para plásticos**, pequeño y verificable:

- `industrial-models/_schema/catalog.schema.json` y `twin-lib catalog validate`.
- `industrial-models/plastic-injection-plant-v1/catalog/` con `materials.yaml` (PS, PP, HDPE reciclado y tres colores), `tooling.yaml` (moldes de cubiertos, balde 12 L, cuerpo, tapa, pedal y bisagras de papelera), `products.yaml` (los 3 productos con su ruta, incluido el ensamble de la papelera) y `equipment_sizes.yaml` (pequeña, mediana, grande).
- El motor toma `cycle_s`, `cavities` y `part_g` del molde montado en cada inyectora; los escenarios actuales deben dar los mismos KPIs.
- `pallet-sizing.yaml` toma el volumen por pieza del producto, no de la máquina.
- Sin interfaz todavía.

Los valores van con `assumed: true` hasta que el autor entregue los datos reales.
