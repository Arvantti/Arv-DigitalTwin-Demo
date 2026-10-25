---
tipo: propuesta
tags: [arquitectura, fractal, plc, propuesta]
estado: propuesta para revisión de Andy
fecha: 2026-10-25
---
# Esquema del acueducto (emulador · PLC · gemelo · Fractal) aplicado a los demás gemelos

> Estado: **propuesta, sin decisión**. No cambia código ni el acueducto.
> Pedido de Andy (2026-10-25): revisar cómo el acueducto define el gemelo digital, Fractal, el simulador y el emulador, y cómo se adaptaría a plásticos, salsas y los demás.
> Aclaración de Andy: el acueducto **no está terminado**; hoy existe el **Fractal simulador de escenarios** (proyección base y alternativa) y **falta el Fractal optimizador**.
> Fuentes leídas en `main` (8a05343): [co-simulación PLC/Fractal](plc-fractal-cosimulation.md), [estudios y vistas temporales](fractal-studies-and-temporal-views.md), [plan de sesión PLC](plc-session-fractal-implementation-plan.md), [escritorio PLC](plc-fractal-desktop-workspace.md), [modelos portables](portable-industrial-models.md), `docs/plc-simulation.md`, `docs/programacion.md`, `docs/datos-reales.md`, `docs/ciudad.md`, decisiones D70 a D75 y el código de `apps/twin-emulator-api` y `apps/fractal-engineering-api`.

## 1. Cómo lo define hoy el acueducto

### 1.1 Las cinco piezas

| Pieza | Qué es en el acueducto | Dónde vive | Regla clave |
|---|---|---|---|
| **Emulador** («calculadora A», realidad ficticia) | Motor de planta con la hidráulica de la red. Produce las señales que recibiría un PLC real. No optimiza. | `packages/twin-runtime`, `equipment-library`, `industrial-models/water-network-scale-v1/network.py` | Fuente de verdad de la simulación. |
| **PLC virtual / HMI** | Autoridad única de mando. Ejecuta perfiles horarios, valida cada mando contra un permiso y un rango, guarda el historian y publica tags. | `industrial-models/…/plc.yaml`, `apps/twin-emulator-api` (sesiones, perfiles, historian, tags), `apps/gallery/plc.html` | Solo él manda al emulador. |
| **Gateway OPC UA simulado** | Espacio de tags planos, solo lectura y con alcance de sesión. | `plc_tags.py`, rutas `/opcua-schema` y `/opcua` | Es la **única** puerta de Fractal. |
| **Gemelo 3D** | Visor. Dos líneas de tiempo con la misma geometría: operación (pasado y presente, sólido) y futuro de un estudio (translúcido, «FUTURO SIMULADO · NO APLICADO»). | `apps/gallery/plant.html` | No calcula, no manda, no adelanta el reloj. |
| **Fractal de Ingeniería** («calculadora B») | Motor independiente de estudios futuros con su propio modelo del dominio. | `fractal/hydraulics/…`, `apps/fractal-engineering-api` | No importa el emulador; nunca escribe; recomienda y el operador decide. |

```text
Operador ──mandos aprobados──► PLC virtual ──mandos permitidos──► Emulador (calculadora A)
                                  ▲   │ tags solo lectura (OPC UA simulado)        │ señales
                                  │   ▼                                            ▼
               estudio / borrador │ Fractal (calculadora B) ◄── plan publicado   Gemelo 3D (visor)
                                  └──────────── nunca escribe ──────────────────────┘
```

### 1.2 Conceptos de operación

- **Sesión** (`session_id`): una sola corrida del emulador, compartida por el PLC (rol `plc`, único que manda), el 3D (`viewer`) y Fractal (`fractal`, solo tags).
- **Perfil de operación** = escenario PLC de 24 franjas horarias (plantillas versionadas PDD-RCA-01 y PFL-BASE-01, más personalizados). Es el **plan** que el PLC publica como `PLC.Plan` / `PLC.Profile.FutureHours`.
- **Pruebas técnicas** (`simulation.yaml`): regresión, no operación rutinaria.
- **Reloj**: ×240 por defecto (15 s reales = 1 h simulada), ajustable solo desde el PLC.
- **Historian**: muestras de tags y fotogramas 3D en SQLite; permite mirar el pasado sin rebobinar la sesión.
- **Escenarios por conversación (visión)**: el usuario crea escenarios chateando con Claude conectado por MCP; el sistema responde como uno cuasi real. Aún no implementado.

### 1.3 Los tres estudios de Fractal (D70, D71)

| Estudio | Pregunta | Estado en el acueducto |
|---|---|---|
| Proyección base | ¿Qué pasa si se ejecuta el plan del PLC tal cual? | Hecho (`/studies/horizon/from-plc`), en validación |
| Escenario alternativo | ¿Qué pasa con este cambio hipotético? | Hecho, en validación |
| Escenario optimizado | ¿Qué plan mejora el objetivo y cumple las restricciones? | **Falta.** Hay un prototipo DE→SLSQP apagado por defecto (409) |

Las dos primeras filas son el **Fractal simulador de escenarios**; la tercera es el **Fractal optimizador**. Solo la optimización produce algo aceptable (borrador `PFL-FRA-*`), y aceptar nunca manda al instante: crea un perfil que el PLC aplica desde la siguiente hora.

### 1.4 Validación (D72, D73)

Fractal no tiene que reproducir exactamente al emulador. Se compara por canal y por hora, se revisa la conservación (agua) y el acuerdo sobre los límites de seguridad (≥ 15 mca). Lo que no está validado se marca (`validation_status`, «no validado dinámicamente»). Este banco de contraste es parte del esquema, no un extra.

## 2. Qué es genérico hoy y qué es solo del acueducto

Revisado en el código de `main`:

| Parte | Hoy | Qué haría falta para otras plantas |
|---|---|---|
| Sesiones, roles, reloj, difusión (`sessions.py`) | Casi genérico | Nada grave; ya recibe cualquier `PlantModel` |
| Tags PLC (`plc_tags.py`) | **Escrito a mano para el acueducto** (bombas, PRS, rejilla) | Mapa declarativo de tags en el `plc.yaml` de cada planta |
| Perfiles (`profiles.py`) | Normalización y `commands_for_hour` con viviendas y fugas; siembra solo el acueducto | Un adaptador de **plan** por dominio |
| Contrato del PLC (`plc.yaml`) | Solo existe en el acueducto | Un `plc.yaml` por planta |
| Fractal (`fractal/`, `fractal-engineering-api`) | Solo `hydraulics` | Carpetas `fractal/manufacturing`, `process`, `logistics`, `traffic` (ya previstas en `fractal/README.md`) |
| Programación de producción (`twin_runtime.planning`, `/api/schedules`) | Vive **en el emulador**; el «pedido urgente» se replanea ahí | Ver §4: el urgente es un estudio alternativo de Fractal |
| PLC de bandas del aeropuerto (`belt-plc.ts`) | El navegador manda directo por el WebSocket heredado `/simulate`, sin contrato | Pasar a sesión con rol `plc` y `plc.yaml` |
| Escena 3D de las demás plantas | Usa `/simulate`: cada conexión crea su propio runtime | Unirse a la sesión como `viewer` (ya soportado por `plant.ts`) |

Nada de esto exige tocar el acueducto si la generalización se hace **al lado**: las plantas nuevas usan el mapa declarativo y el acueducto sigue con su `plc_tags.py` hasta que Andy decida migrarlo.

## 3. Cómo se traduce a cada gemelo

La idea: cada gemelo tiene las mismas cinco piezas; lo que cambia es **qué es el PLC**, **qué es el plan** y **qué calcula Fractal**.

| | Plásticos | Salsas | Cajas | Aeropuerto | Ciudad |
|---|---|---|---|---|---|
| **Emulador (A)** | Motor de planta: inyectoras, buffers, montacargas, almacenes, ensamble | Motor de proceso: marmitas, pasteurizador, caldera, llenado, empaque | Corrugadora, carros de transferencia, convertidoras, bandas con fotoceldas, paletizado | Check-in, inspección, clasificador, bandas, carruseles | SUMO (física de tráfico); JEV decide ruta y afán de cada agente (D66) |
| **«PLC»** (autoridad de mando) | PLC/MES de planta: arranque y paro por máquina, molde y color montados, liberación de órdenes | PLC de proceso: consignas de temperatura y nivel, CIP, liberación de lotes | PLC de transporte: start/stop por banda, zonas, paradas manuales (ya modelado, D63) | PLC de bandas (ya existe, D62) más asignación de carruseles | Centro de control de tráfico: plan semafórico por cruce y franja |
| **Tags de ejemplo** | `PLC.IMM.<id>.State`, `.CycleS`, `.Mold`, `.Color`, `.Parts`; `PLC.Buffer.<id>.Level`; `PLC.Order.<id>.Progress` | `PLC.Kettle.<id>.TempC`, `.Batch`; `PLC.Pasteurizer.HoldTempC`; `PLC.CIP.<id>.State`; `PLC.Filler.<id>.Rate` | `PLC.Belt.<id>.Run`, `.PhotoEye`, `.Jam`; `PLC.Corrugator.Width`, `.Flute`; `PLC.Stack.<id>.Location` | `PLC.Belt.<id>.Run`; `PLC.Screening.Queue`; `PLC.Sorter.Rate`; `PLC.Carousel.<id>.Flight`, `.Bags` | `TCC.Signal.<cruce>.Phase`, `.Plan`; `TCC.Link.<tramo>.Flow`, `.Queue`, `.SpeedKmh` |
| **Plan publicado** (`PLC.Plan`) | Programa de órdenes por máquina y turno (hoy el secuenciador de referencia) | Programa de lotes por receta y familia | Combinación de pedidos en corrugadora y reparto a convertidoras | Itinerario de vuelos y llegada de maletas (solo entrada y destino, regla de Andy) | Demanda por franja y planes semafóricos |
| **Horizonte y paso** | 30 días, por turno u hora | 1 a 7 días, por lote u hora | 1 a 3 días, por hora | Ventana de vuelos, por minuto | 24 h, por franja de 15 min |
| **Fractal (B)** | Simulación de eventos discretos propia de capacidad y flujo | Modelo de lotes, tiempos de retención y servicios (vapor, frío) | Modelo de flujo de pilas y de combinación de pedidos | Modelo de colas y rutas del BHS | Modelo de tráfico propio (ver decisión abierta 4) |
| **Base** | Fechas reales de entrega si el plan se ejecuta desde el estado actual (buffers, paradas, moldes montados) | Lotes terminados por día, cuellos (túnel, marmitas, mesa de 250 ml) | Pilas por hora y esperas por banda | Maletas que llegan a tiempo al carrusel de su vuelo | Indicadores del día con los planes actuales |
| **Alternativo** | Pedido urgente, falla de inyectora, molde fuera de servicio, material tarde | Falla de caldera, CIP extra, cambio de mezcla 40/45/15 | Atasco, falla de un carro de transferencia | Falla de un escáner o del clasificador, ola de llegadas | Cierre de vía, evento, cambio de plan semafórico |
| **Optimizado** (después) | Re-secuenciar: menos cambios de molde y color, menos atrasos | Secuenciar por familia y alérgenos, menos CIP, menos vapor | Mejor combinación en corrugadora (menos desperdicio de ancho) | Asignación de carruseles, alertas de cierre de vuelo | Planes semafóricos que reducen demora |
| **Restricciones duras** | Molde compatible con la inyectora, 2 turnos de lunes a sábado | Temperatura de pasteurización y retención, alérgenos: Fractal **nunca** propone bajarlas | Capacidad de bandas, seguridad del operario en mesas | Cierre de vuelo, inspección obligatoria | Tiempos mínimos de verde peatonal |
| **Qué se acepta** | Un borrador de programa que el PLC/MES libera desde el siguiente turno | Un borrador de programa de lotes | Un borrador de combinación | Un borrador de asignación de carruseles | Un borrador de planes semafóricos desde la siguiente franja |
| **Validación** | Fractal vs emulador: piezas por máquina y turno, fechas de fin, WIP | Litros por lote, temperaturas, tiempos | Pilas por hora, tiempos de espera | Maletas a tiempo, tiempos de tránsito | Demora, velocidad y colas por tramo |

**Confecciones** (`garment-factory-v1`) entra igual que plásticos: el plan es el programa de módulos y el «PLC» es el tablero de producción (como ya anticipa `docs/plc-simulation.md`).

### 3.1 Lo que cambia frente al acueducto

1. **El plan no es un perfil de 24 aperturas.** En manufactura el plan son órdenes (`orders → schedule`, D75). El contrato de perfil se generaliza a «plan publicado por el PLC» con un esquema por dominio; el de 24 franjas sigue siendo el del acueducto.
2. **El tiempo es más largo.** Un horizonte de 30 días no se mira a ×240 en vivo; la línea de tiempo de D75 (pasado congelado, ahora en vivo, futuro proyectado) ya es la versión de manufactura de las «dos líneas temporales» de D70. Hay que unir ambas ideas en un solo contrato de `temporal_context`.
3. **Fractal debe ser rápido.** En manufactura un estudio de 30 días con eventos discretos tarda segundos, mucho menos que la hidráulica de 1 s.
4. **Seguridad del proceso.** En salsas, ciertos tags (temperatura de pasteurización, retención) son de seguridad alimentaria: se marcan como **no negociables** en el contrato y ningún estudio optimizado los puede proponer.

## 4. Punto a ordenar: dónde vive la programación

Hoy el secuenciador de referencia y el pedido urgente corren en el emulador (`/api/schedules`). Con el esquema del acueducto quedaría así:

| Hoy | Con el esquema |
|---|---|
| Secuenciador de referencia en `twin_runtime.planning` | Es el **planificador del PLC/MES**: genera el plan que el PLC publica. Puede quedarse donde está. |
| Pedido urgente replaneado en el emulador | **Estudio alternativo de Fractal**: lee estado y plan del gateway, devuelve la rama futura NO APLICADA y el impacto. |
| Aceptar urgente lo guarda el navegador | Aceptar crea un **borrador de plan** que el PLC libera desde el siguiente turno (igual que `PFL-FRA-*`). |
| Fractal «reemplaza al secuenciador» (fase F de datos reales) | Fractal **no reemplaza**: el optimizador propone un plan mejor y el operador lo acepta. El secuenciador sigue como línea base para medir la mejora. |

Así la programación queda igual que el acueducto: el emulador ejecuta, el PLC manda y publica el plan, Fractal estudia y recomienda.

## 5. Contrato común propuesto

Por planta, al lado de lo que ya existe en `industrial-models/<planta>/`:

```text
industrial-models/<planta>/
  plc.yaml                # activos, pantallas, mandos permitidos con rango y ahora también:
                          #   tags: { "PLC.IMM.imm-21.State": "imm-21.variables.state", ... }
                          #   safety_tags: [...]  # nunca propuestos por un estudio
  plan.schema.json        # forma del plan de ese dominio (perfil 24 h, órdenes, lotes, vuelos, planes semafóricos)
  fractal/
    objectives.yaml       # objetivos autorizados (el operador elige, no escribe fórmulas)
    constraints.yaml      # restricciones con su unidad
fractal/<dominio>/models/<planta>/   # calculadora B propia, sin importar el emulador
```

En el API, el mismo juego de rutas que ya tiene el acueducto, sin cambiar sus nombres:

```text
POST /api/plants/{planta}/sessions                     (crear; PLC propietario)
WS   /api/plants/{planta}/sessions/{id}?role=plc|viewer
GET  /api/plants/{planta}/sessions/{id}/opcua-schema   (tags declarados en plc.yaml)
WS   /api/plants/{planta}/sessions/{id}/opcua
POST /api/plants/{planta}/sessions/{id}/fractal/studies   (base | alternative | optimized)
GET  …/fractal/studies/{estudio}/frames                (temporal_context: forecast, applied: false)
POST …/fractal/studies/{estudio}/decision
```

Y el MCP de la visión (escenarios por conversación) se apoya en estas mismas rutas: Claude crea un escenario alternativo y pide un estudio, nunca manda al emulador.

## 6. Orden sugerido (PR pequeños, sin tocar el acueducto)

| Paso | Contenido | Toca |
|---|---|---|
| 0 | Este documento | Solo docs |
| 1 | Mapa declarativo de tags en `plc.yaml`; `plc_tags.py` lo usa para plantas sin función propia | `twin-emulator-api` (sin cambiar la ruta del acueducto) |
| 2 | Piloto: `plc.yaml` de **plásticos**, escena unida a la sesión como `viewer` | Plásticos |
| 3 | `fractal/manufacturing/models/plastic-injection-plant-v1`: proyección base y alternativa (urgente, falla de inyectora) desde el gateway | Fractal nuevo |
| 4 | Banco de contraste Fractal vs emulador para plásticos (como `validate_fractal_hourly`) | `tools/` |
| 5 | Repetir 1–4 en aeropuerto (ya tiene PLC de bandas), salsas, cajas y confecciones | Cada planta |
| 6 | Ciudad, cuando haya calibración y servicio SUMO en el VPS | Ciudad |
| 7 | Optimizador: primero en el acueducto (D71), luego el mismo contrato de objetivos y restricciones en los demás | Todos |

Por qué plásticos de piloto: ya tiene catálogo, rutas, programación y pedido urgente, que es justo un **escenario alternativo**; es lo que más se parece al Fractal simulador de escenarios que hoy existe en el acueducto. El aeropuerto sería el segundo porque su PLC de bandas ya existe.

## 7. Decisiones abiertas para Andy

1. **Piloto**: ¿plásticos (recomendado) o aeropuerto?
2. **Programación**: ¿de acuerdo con §4 (secuenciador = planificador del PLC/MES, urgente = estudio alternativo de Fractal, Fractal no reemplaza sino recomienda)?
3. **Nombre del protocolo**: ¿«OPC UA simulado» para todos, o dejar el contrato neutro («gateway de tags») y marcar el protocolo por planta (OPC UA en industria, otro en tráfico)?
4. **Independencia en ciudad**: SUMO es el emulador. Para Fractal, ¿un modelo de tráfico propio y más simple (macroscópico), o una segunda instancia de SUMO con su propia configuración? La regla del acueducto pide cálculos independientes.
5. **Cuándo generalizar `sessions.py`, `profiles.py` y `plc_tags.py`**: son archivos que Andy está usando en el acueducto. Propuesta: el paso 1 solo agrega, no mueve nada, y se hace cuando Andy lo apruebe.

## 8. Fuera de alcance

Conexión a PLC físico, escritura automática desde Fractal, cambios al acueducto y despliegue de las APIs (sigue pendiente el proxy HTTPS/WSS y la autorización por sesión).
