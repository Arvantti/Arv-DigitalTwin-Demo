---
tipo: propuesta
tags: [arquitectura, fractal, plc, propuesta]
estado: propuesta con la forma de los gemelos decidida por Andy (D79)
fecha: 2026-10-25
---
# Esquema del acueducto (emulador · PLC · gemelo · Fractal) aplicado a los demás gemelos

> Estado: **propuesta**; Andy ya decidió las dos formas de gemelo (D79, §3). No cambia código ni el acueducto.
> Matriz editable para complementar: [Matriz de gemelos digitales](https://claude.ai/artifact/NnYGE1QKXvQbjLxYnbq5SW).
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

## 3. Dos formas de gemelo (decisión de Andy, D79)

Andy definió el 2026-10-25 y el 2026-10-26 que no todos los gemelos llevan las cinco piezas. Hay dos formas:

| Forma | Gemelos | Emulador | «PLC» | Escenarios | Fractal de aplicación | Fractal de optimización |
|---|---|---|---|---|---|---|
| **Con emulador** | Acueducto, aeropuerto, ciudad | Sí: calcula la «realidad» | PLC virtual (o centro de control en ciudad) | Perfiles guardados en el PLC (en el acueducto, cambios de válvulas, fugas y PRS) | Sí: simula escenarios con su propio modelo | Sí (en el acueducto todavía falta) |
| **Solo optimizador** | Plásticos, salsas, cajas, confecciones | **Vacío a propósito** | **Programación de producción del cliente**, como un MES | **Contingencias grabadas en la programación** | **No va**: la programación ya tiene los tiempos | **Sí**: reprograma ante cada contingencia |

Los huecos de la forma «solo optimizador» son intencionales: se pueden llenar después (por ejemplo, un emulador de proceso de salsas con presiones y máquinas) sin cambiar el resto. Hoy ese nivel de detalle no se busca; lo que se busca es optimizar la manufactura discreta y de procesos sobre la programación.

### 3.1 Cómo funciona la forma «solo optimizador»

```text
Programación vigente (MES del cliente)
   │  + escenario de contingencia grabado en ella («¿qué pasaría si…?»)
   ▼
Fractal de optimización ──► programación propuesta (rama futura NO APLICADA)
   │                               │
   │                               ▼
   │                    comparación contra la programación vigente
   ▼                    (atrasos, cambios, ocupación)
Planificador acepta o descarta ──► la aceptada pasa a ser la vigente
   │
   ▼
Gemelo 3D: muestra la programación (vigente o propuesta) en una fecha
```

- **El homólogo de los perfiles de válvulas** son las contingencias: cambios de pedidos (urgente, cancelación, cantidad, fecha), cambios de venta, mantenimientos de máquinas, paros de operación, insumos tarde y condiciones inesperadas.
- **Las contingencias se guardan en la misma programación**, con nombre, como los escenarios personalizados del acueducto, y se pueden volver a correr.
- **La comparación se hace sobre la programación**, porque ya tiene tiempos, turnos, herramental y rutas.
- **Fractal nunca cambia la programación vigente**: entrega una propuesta y el planificador decide, igual que la aprobación de `PFL-FRA-*` en el acueducto.

### 3.2 Traducción por gemelo

| | Plásticos | Salsas | Cajas | Confecciones | Aeropuerto | Ciudad |
|---|---|---|---|---|---|---|
| **Forma** | Solo optimizador | Solo optimizador | Solo optimizador | Solo optimizador | Con emulador | Con emulador |
| **Emulador** | Vacío (futuro: inyección y ensamble) | Vacío (futuro: proceso con presiones y máquinas) | Vacío (la simulación de bandas actual sirve de punto de partida) | Vacío (futuro: corte y módulos) | Check-in, inspección, clasificador, bandas, carruseles | SUMO; JEV decide ruta y afán (D66) |
| **«PLC»** | Programación MES: órdenes por inyectora y turno, moldes, colores, ensamble | Programación MES: lotes por receta y familia, llenado por formato | Programación MES: combinación en corrugadora, órdenes por convertidora | Programación MES: órdenes por módulo, referencia y talla (SAM) | PLC de bandas (ya existe, D62) | Centro de control de tráfico |
| **Escenarios** | Pedidos, urgentes, mantenimiento de inyectoras y moldes, paros, resina o color tarde, ventas, imprevistos | Pedidos, mantenimiento (caldera, CIP, sachetadoras), paros, tomate, aceite o empaque tarde, ventas, imprevistos | Pedidos, mantenimiento de corrugadora y convertidoras, paros, papel o almidón tarde, ventas, imprevistos | Pedidos, mantenimiento, ausencia de operaria, tela tarde, ventas, imprevistos | Itinerario de vuelos y llegada de maletas (solo entrada y destino), fallas de escáner o clasificador | Demanda por franja, cierre de vía, evento |
| **Fractal de aplicación** | No va | No va | No va | No va | Modelo de colas y rutas del BHS | Modelo de tráfico propio (decisión abierta) |
| **Fractal de optimización** | Menos atrasos y cambios de molde y color | Secuencia por familia y alérgenos, menos CIP; nunca toca pasteurización ni retención | Menos desperdicio de ancho y cambios de formato | Balanceo de módulos y secuencia | Asignación de carruseles, alertas de cierre de vuelo | Planes semafóricos con menos demora |
| **Qué lee Fractal** | Programación + contingencia (sin OPC UA por ahora) | Igual | Igual | Igual | Tags OPC UA simulados del PLC | Tags del centro de control |

## 4. Dónde vive la programación

| Hoy | Con el esquema |
|---|---|
| Secuenciador de referencia en `twin_runtime.planning` y tabla del panel (D75) | Es la **programación vigente** que en la demo hace las veces del MES del cliente. |
| Pedido urgente replaneado en el emulador (`/api/schedules/{planta}/urgent`) | Es la primera **contingencia**; pasa a ser un escenario guardado y lo resuelve el **Fractal de optimización**. |
| Aceptar urgente lo guarda el navegador | Aceptar convierte la propuesta en la programación vigente, guardada en el servidor (fase F de datos reales). |
| Fase F: «Fractal reemplaza al secuenciador» | Fractal **propone**; el secuenciador queda como línea base para medir cuánto mejora. |

## 5. Contrato común propuesto

Forma «solo optimizador», por planta:

```text
industrial-models/<planta>/
  catalog/                  # ya existe: productos, rutas, herramental, tamaños, demanda
  contingencies.schema.json # tipos de contingencia (pedido, mantenimiento, paro, insumo, venta, imprevisto)
  fractal/
    objectives.yaml         # atrasos, cambios de herramental, CIP, ocupación (el planificador elige)
    constraints.yaml        # turnos, compatibilidad de moldes, alérgenos, seguridad alimentaria
fractal/manufacturing/models/<planta>/   # optimizador propio, lee programación + contingencia
```

API sugerida (al lado de `/api/schedules`, sin tocar el acueducto):

```text
GET  /api/schedules/{planta}                         (programación vigente)
POST /api/schedules/{planta}/contingencies           (guardar una contingencia con nombre)
POST /api/schedules/{planta}/contingencies/{id}/optimize  (Fractal de optimización → propuesta)
POST /api/schedules/{planta}/proposals/{id}/decision      (aceptar o descartar)
```

Forma «con emulador»: la del acueducto (sesión, `plc.yaml`, tags OPC UA de solo lectura, `fractal/studies`), con un mapa de tags declarativo en el `plc.yaml` de cada planta en vez de `plc_tags.py` escrito a mano.

El MCP de la visión (escenarios por conversación) usa las mismas rutas: Claude graba una contingencia y pide la optimización, nunca cambia la programación vigente.

## 6. Orden sugerido (PR pequeños, sin tocar el acueducto)

| Paso | Contenido | Toca |
|---|---|---|
| 0 | Este documento y la matriz | Solo docs |
| 1 | Esquema de contingencias y contingencias guardadas en el servidor para plásticos (el urgente es la primera) | `catalog`, API de programación |
| 2 | `fractal/manufacturing/models/plastic-injection-plant-v1`: optimizador que reprograma ante una contingencia y compara contra la vigente | Fractal nuevo |
| 3 | Panel de la escena: lista de contingencias, propuesta, comparación y aceptar o descartar | Galería |
| 4 | Repetir 1–3 en salsas, cajas y confecciones | Cada planta |
| 5 | Aeropuerto y ciudad con la forma «con emulador» | Cada uno |
| 6 | Optimizador del acueducto (D71) cuando Andy lo libere | Acueducto (Andy) |

## 7. Decisiones abiertas para Andy

1. **Piloto**: ¿plásticos primero (recomendado, ya tiene programación y urgente)?
2. **Objetivos del optimizador** en manufactura: ¿atrasos, cambios de herramental o CIP y ocupación, con pesos predefinidos como en el acueducto?
3. **Nombre del protocolo** en la forma «con emulador»: ¿«OPC UA simulado» para todos o un gateway neutro con el protocolo por planta?
4. **Ciudad**: ¿Fractal con un modelo de tráfico propio más simple o una segunda instancia de SUMO?
5. **Archivos del API que usa el acueducto** (`sessions.py`, `profiles.py`, `plc_tags.py`): solo se generalizan cuando Andy lo apruebe.

## 8. Fuera de alcance

Conexión a PLC físico, escritura automática desde Fractal, cambios al acueducto y despliegue de las APIs (sigue pendiente el proxy HTTPS/WSS y la autorización por sesión).
