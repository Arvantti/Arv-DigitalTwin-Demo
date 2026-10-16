# Crear un tipo de equipo para la librería

Esta guía es el procedimiento para pasar de "esto es lo que tengo" (fotos, catálogo, placa de datos o una descripción en lenguaje natural) a un tipo de equipo funcional en `equipment-library/`: modelo 3D paramétrico, comportamiento simulado, presets y pruebas.

Sirve igual para una persona, para Claude (skill `new-equipment`) o para Codex (`AGENTS.md`).

> **Objetivo:** un reflejo **aproximado pero coherente** del equipo real. No tiene que ser exacto: tiene que verse como ese equipo, comportarse con orden de magnitud correcto y declarar honestamente qué es supuesto.

---

## 0. Antes de empezar: ¿hace falta un tipo nuevo?

Revise los tipos existentes (`uv run twin-lib list`). Muchas veces basta con un **preset** de un tipo que ya existe:

| Lo que piden | Qué hacer |
|---|---|
| Otro tamaño, capacidad o material de un equipo existente (una inyectora de 450 t, un tanque de 10 m³) | Agregar un archivo en `presets/` del tipo existente |
| Una variante con una pieza o un comportamiento distinto (un tanque con serpentín) | Agregar un parámetro al tipo existente (con `default` que no cambie lo actual) |
| Una máquina con otro principio de funcionamiento (llenadora, compresor, horno) | Crear un tipo nuevo |

---

## 1. Entrevista y ficha del equipo

**No se escribe código hasta que el usuario confirme la ficha.** Quien pide el equipo conoce su máquina, pero no tiene por qué saber qué es un contrato o un preset. La entrevista traduce lo que sabe a los datos que el equipo necesita.

### 1.1 Leer primero lo entregado

Antes de preguntar, extraiga lo que ya venga en las fotos, el catálogo, la placa de datos o la descripción:
- **Identidad:** qué es, para qué sirve, en qué paso del proceso está.
- **Dimensiones:** largo, ancho, alto, diámetros. En fotos, estime la escala con referencias conocidas: una persona ≈ 1,75 m, una puerta ≈ 2,1 m, una estiba ≈ 1,2 × 1,0 m.
- **Capacidades:** volumen, caudal, unidades por minuto, ciclo, potencia, temperaturas, presiones.
- **Partes visibles y qué se mueve.**

No pregunte lo que ya está respondido.

### 1.2 Preguntar por bloques

- Como máximo **5 preguntas por mensaje**, en lenguaje cotidiano. Explique con un ejemplo cualquier término técnico.
- Adapte el siguiente bloque a las respuestas y profundice solo en lo relevante para ese equipo.
- Acepte "no sé" o "no lo medimos": registre el hueco y propóngale un valor típico marcado como supuesto. **No invente datos como si fueran del usuario.**
- No pida contraseñas, claves ni datos personales.

| Bloque | Qué averiguar | Preguntas de ejemplo |
|---|---|---|
| **A. Identidad** (siempre) | Función, ubicación en el proceso, referencias, tamaño, producción | ¿Qué hace la máquina y qué paso del proceso cumple? ¿Tienes fotos, catálogo o placa de datos? ¿Qué tamaño tiene, aproximadamente? ¿Qué produce y a qué ritmo? ¿Qué la alimenta y adónde entrega? |
| **B. Operación** | Ciclo o fases, cambios de producto, servicios que consume | ¿Cómo es un ciclo o un batch, paso a paso? ¿Hay cambios de formato o de producto, y cuánto tardan? ¿Usa vapor, aire, agua fría o algún otro servicio? |
| **C. Fallas y calidad** | Paradas frecuentes, qué es un rechazo y por qué ocurre | ¿Qué paradas o fallas son frecuentes, y cada cuánto pasan? ¿Cuánto tarda arreglarlas? ¿Qué cuenta como producto malo y qué lo causa? |
| **D. Medición** | Variables que mira el operario, alarmas, KPIs | ¿Qué valores muestra su pantalla? ¿Qué alarmas tiene? ¿Con qué indicador evalúan la máquina? |
| **E. Apariencia** (si no hay fotos) | Colores, guardas, plataformas, accesorios | ¿De qué color es? ¿Tiene guardas, escaleras o plataforma? ¿Dónde se para el operario? |

Si el usuario pide solo otro tamaño o configuración de un tipo existente (sección 0), basta con el bloque A.

### 1.3 Ficha para confirmar

Con las respuestas, presente la ficha y pida confirmarla o corregirla **una sola vez** antes de construir. Guárdela como `FICHA.md` en la carpeta del equipo: queda como registro de lo que se pidió y de lo que se supuso.

```markdown
# Ficha: <nombre del equipo>
- Tipo: <tipo nuevo | preset de <tipo existente>>
- Función y lugar en el proceso: …
- Referencias recibidas: fotos (3), catálogo (pág. 12), placa de datos

| Dato | Valor | Origen |
|---|---|---|
| Velocidad | 60 u/min | user |
| Cabezales | 12 | photo |
| Huella | 3,0 × 2,0 × 2,2 m | photo (estimado) |
| MTBF del atasco | 300 h | **assumed** |

- Fases o ciclo: …
- Fallas: …
- Variables y alarmas: …
- KPIs: …
- Qué se anima: …
- Pendiente o desconocido: …
```

El origen de cada dato usa los mismos valores que el `provenance` de los presets: `catalog`, `nameplate`, `photo`, `measured`, `user` o `assumed`. **No invente marcas ni modelos comerciales.**

Después de la confirmación, avance con los pasos siguientes sin pedir aprobación para cada detalle. Si al construir aparece algo que contradice la ficha, avise al usuario en lugar de resolverlo en silencio.

---

## 2. Crear la carpeta desde la plantilla

```bash
cp -r equipment-library/_template equipment-library/<tipo>
```

`<tipo>` en kebab-case, en inglés y genérico (`rotary-filler`, `belt-conveyor`, `plate-heat-exchanger`). Reemplace `template-machine` por `<tipo>` en `equipment.yaml` y en `behavior.py`.

```
<tipo>/
├── equipment.yaml   contrato: parámetros, estados, variables, eventos, fallas, comandos, KPIs, canales de animación
├── behavior.py      simulación (Python)
├── geometry.ts      modelo 3D paramétrico (TypeScript + three.js)
├── presets/*.yaml   configuraciones típicas (como referencias de catálogo)
├── scenarios.yaml   escenarios con expectativas: son las pruebas del equipo
├── tests/           test_scenarios.py (genérico) y pruebas propias
└── README.md        qué simula, entradas, presets, limitaciones
```

---

## 3. Contrato (`equipment.yaml`)

Valídelo contra `equipment-library/_schema/equipment.schema.json`. Puntos clave:

- **`params`:** solo lo que cambia la geometría o el comportamiento, cada uno con `unit`, `min`, `max`, `default` y `affects`. Los rangos deben cubrir el catálogo real del tipo de equipo.
- **`states`:** use los estados estándar (`off`, `idle`, `starting`, `setup`, `running`, `blocked`, `starved`, `fault`, `maintenance`, `cleaning`) que apliquen. `off` va entre comillas: `id: "off"`.
- **`variables`:** lo que un sistema SCADA leería. Marque `kind: measured` para sensores y dé un `noise_sd` y una `resolution` realistas.
- **`faults`:** de 2 a 5 fallas típicas con `mtbf_h` y `mttr_min` plausibles. Use `stops_equipment: false` para degradaciones.
- **`ports`:** cada entrada y salida física. Para que el motor de planta pueda conectar el equipo, declare en el puerto `link: { magnitud: nombre }` con las magnitudes que viajan por él (unidades, caudal, temperatura, presión, `ready`, `demand_kg_h`…). Vea `docs/plant-engine.md`; `twin-lib validate` comprueba que cada nombre sea una variable o una entrada del comportamiento.
- **`animation_channels`:** valores normalizados (0..1) o físicos (rpm) que la geometría necesita para moverse.
- **YAML:** dentro de `{ ... }`, un texto con coma debe ir entre comillas. El cargador detecta este error y lo explica.

---

## 4. Comportamiento (`behavior.py`)

Subclase de `twin_runtime.EquipmentBehavior`, con `type` igual a la carpeta. Use las primitivas de `twin_runtime.primitives` en lugar de reescribirlas:

| Necesidad | Primitiva |
|---|---|
| Ciclo por fases (máquinas discretas) | `PhaseSequencer`: conserve `leftover` para que el ritmo no dependa de `dt` |
| Temperaturas, niveles o presiones que tienden a un valor | `FirstOrderLag` |
| Lazos de control (válvula de vapor, velocidad) | `PID` |
| Rampas de actuadores | `RateLimiter` |
| OEE | `OEEAccumulator` |
| Vapor | `saturation_temp_c`, `steam_latent_kj_kg` |
| Ruido, deriva o transmisor congelado | los aplica la base con `noise_sd`; use `self.sensors[id].stick()` para fallas de instrumento |
| Fallas por MTBF/MTTR | las maneja la base desde `faults`; reaccione en `on_fault` y `on_fault_cleared` |

Reglas de realismo:

1. **Conservación:** la masa y la energía cuadran. Escriba una prueba de balance.
2. **Límites físicos:** nada rebosa, nada queda negativo, nada supera la ebullición en un recipiente abierto, etc.
3. **Ritmo:** el tiempo de ciclo y la capacidad nominal reproducen el preset.
4. **Calidad causal:** los rechazos dependen de las condiciones del proceso, no de un número fijo.
5. **Entradas del entorno** en `DEFAULT_INPUTS`: material disponible, salida libre, servicios (vapor, aire, agua).
6. `true_values()` devuelve **exactamente** las variables del contrato y `animation()` **exactamente** los canales. `twin-lib validate` lo verifica.

---

## 5. Geometría (`geometry.ts`)

Exporte por defecto `build(params) => EquipmentModel`. Convenciones:

- Metros; +Y arriba; origen en el piso, en el centro de la huella; eje largo sobre +X; lado del operador hacia +Z.
- Las dimensiones salen de los parámetros con relaciones de catálogo, escritas en el comentario del archivo. Si el comportamiento también usa dimensiones, comparta la misma fórmula (ver `vessel_dimensions` y `vesselDimensions`).
- Construya con `parts` (cajas biseladas, cilindros, fondos toriesféricos, tuberías con codos, motores, gabinetes, HMI, balizas, escaleras, barandas, guardas, patas, válvulas) y `materials` (pintura industrial, inoxidable cepillado, galvanizado, cromo, vidrio, caucho, emisivos).
- `update(frame, dt)` solo lee `frame.channels`, `frame.state` y `frame.variables`.

Lo que más aporta al realismo:

1. **Proporciones correctas.** Es lo primero que delata un modelo falso.
2. **Bordes biselados** (`P.box` ya los trae) y **juntas, costuras, pernos y rejillas.**
3. **Materiales correctos:** inoxidable en alimentos, pintura semimate en máquinas, galvanizado en exteriores.
4. **Elementos de seguridad:** guardas, franjas amarillas, barandas, baliza.
5. **Instrumentación visible:** manómetros, termopozos, cajas de bornes, placas de datos.
6. **Movimiento ligado a la simulación:** la pieza se mueve porque la fase lo dice.

---

## 6. Presets y escenarios

- **`presets/`:** 2 a 4 configuraciones típicas que cubran el rango (pequeña, mediana, grande), con `provenance`.
- **`scenarios.yaml`:**
  - `steady`: operación nominal, con la cuenta esperada escrita en `description`.
  - Uno por cada comportamiento importante: arranque, bloqueo, falla, cambio de producto.
  - `demo`: con `random_faults: true`, para la galería.

  **Calcule los valores esperados a mano antes de correr.** Si la simulación no coincide, revise primero su cuenta y después el modelo; no ajuste la expectativa para que pase.

---

## 7. Verificar

```bash
uv run twin-lib validate <tipo>                     # contrato, presets, comportamiento y escenarios
uv run pytest equipment-library/<tipo>               # pruebas
uv run twin-lib run <tipo> --scenario steady --every 60
pnpm -r typecheck && pnpm -r test                 # la prueba genérica construye y anima cada preset
```

Vista 3D y comparación con las fotos:

```bash
pnpm gallery:build && (pnpm --filter @twin/gallery preview &)
tools/preview/shot.sh <tipo> <preset> /tmp/<tipo>.png '{"canal":0.5}'
```

Abra la captura junto a las fotos del usuario y compare: proporciones, colores, piezas que faltan, posición del operador. Itere hasta que se reconozca el equipo. Con la API corriendo (`uv run uvicorn twin_api.main:app --port 8000`), `?type=<tipo>&autosim=1&scenario=demo` muestra el equipo simulado en vivo.

---

## 8. Checklist de entrega

- [ ] `FICHA.md` confirmada por el usuario y coherente con lo construido
- [ ] `twin-lib validate` en OK y pruebas en verde
- [ ] Al menos un escenario por comportamiento clave, con la cuenta esperada documentada
- [ ] Presets con `provenance`; nada de marcas reales
- [ ] Captura revisada frente a las referencias del usuario
- [ ] README con qué simula, entradas, presets y limitaciones
- [ ] Puertos con `link` si el equipo va a conectarse en una planta (`docs/plant-engine.md`)
- [ ] `fidelity` honesto (V1/V2/V3 y B1/B2/B3)
