# Plan de implementación · sesión PLC compartida y estudios Fractal

> Estado: fases A–C verificadas; D, E, F y G tienen implementación inicial funcional; los contenedores de los tres servicios existen. Pendientes: solver hidráulico nodal validado, E2E integral, autorización/retención y proxy HTTPS/WSS.
> Alcance inicial: `water-network-scale-v1`.  
> Seguridad: todo componente es simulado. No existe conexión ni escritura a infraestructura física.

## 1. Estado de avance

### Implementado inicialmente

```text
[A–C] Runtime compartido por session_id, PLC autoridad y 3D visor
[C.1] Inicio autónomo del 3D retirado; E2E visual completo pendiente
[D] Perfiles PLC horarios; separación completa de pruebas pendiente
[E] Tags PLC read-only por sesión, incluidos caudal/presión/apertura por vivienda y fuga
[F] Estudios base, alternativo y optimizado; horizonte, tres escenarios, snapshots futuros,
    persistencia PLC, frames horarios, aprobación y programación separadas
[G] Historian SQLite, auditoría de mandos/decisiones y persistencia inicial de estudios
[H] Containerfiles de galería, emulador y Fractal
```

### Pendiente priorizado (decisión D71)

```text
1. FUTURO SIMULADO: Fractal lee tags y perfil activo desde PLC (implementado en /studies/horizon/from-plc);
   validar las 24 horas frente a operación del emulador: demandas por vivienda, fugas, PRS,
   bomba, recirculación y tanques, incluso límites de hora y transitorios.
2. E2E PLC → estudio base/alternativo → persistencia PLC → frame 3D futuro NO APLICADO.
3. Solo después: reconsiderar optimización horaria, objetivos, robustez y aprobación/programación.
   La HMI no ofrece optimización y las rutas Fractal están deshabilitadas por defecto.
4. Reconexión/expiración de sesiones, autorización/retención y despliegue de las dos APIs más proxy HTTPS/WSS.
```

## 2. Problema que se corrige

Hoy el PLC Master y `plant.html` abren WebSocket separados en `/api/plants/{id}/simulate`. Cada conexión crea su propio `PlantModel`; por ello un mando aplicado desde PLC no aparece en el gemelo 3D.

La corrección establece una sola sesión hidráulica por operación:

```text
Operador → PLC virtual → sesión hidráulica compartida
                              ├── gemelo 3D (visor)
                              ├── historian y tags PLC
                              └── Fractal (lectura y recomendaciones)
```

El PLC es la única autoridad normal de mando. El emulador calcula una vez. El 3D representa el estado publicado por PLC: operación (pasado/presente) o una rama futura Fractal explícitamente marcada. La política completa está en [estudios Fractal y visualización temporal](fractal-studies-and-temporal-views.md).

## 3. Principios y límites

- Cada operación tiene `session_id` UUID; sesiones de operadores distintos no se mezclan.
- El PLC crea e inicia la sesión. El 3D se conecta como visor.
- El visor 3D no puede enviar comandos hidráulicos ni iniciar un runtime independiente.
- Fractal solo lee tags PLC virtuales con alcance de sesión; no lee `PlantModel`, `network.py` ni el WebSocket operativo.
- Fractal solo publica recomendaciones; nunca aplica comandos automáticamente.
- El operador acepta o rechaza; si acepta, el PLC virtual emite el comando a la sesión.
- `simulation.yaml` conserva escenarios y expectativas como pruebas de regresión, no como perfiles operativos rutinarios.

## 4. Fase A · Runtime de sesión compartida

**Estado: implementada inicialmente y verificada.** `SessionManager`, sesión UUID, runtime único y difusión de snapshots ya existen. Pendiente: política de expiración y pruebas de reconexión/aislamiento de múltiples sesiones.

### Entregables backend

Crear `apps/twin-emulator-api/src/twin_emulator_api/sessions.py` con:

```text
PlantSession
  id, plant_id, runtime, simulated_time, speed, paused
  active_profile_id, subscribers, historian
  created_at, last_activity, lifecycle

SessionManager
  create, get, start, stop, subscribe, unsubscribe, expire
```

Una tarea de sesión avanza el `PlantModel` una sola vez y distribuye un único snapshot a todos los suscriptores.

### API y WebSocket

```text
POST /api/plants/{plant_id}/sessions
GET  /api/plants/{plant_id}/sessions/{session_id}
POST /api/plants/{plant_id}/sessions/{session_id}/start
POST /api/plants/{plant_id}/sessions/{session_id}/stop

WS /api/plants/{plant_id}/sessions/{session_id}?role=plc
WS /api/plants/{plant_id}/sessions/{session_id}?role=viewer
```

Roles:

| Rol | Lee snapshots | Envía mandos |
|---|---:|---:|
| `plc` | sí | sí |
| `viewer` | sí | no |
| `fractal` | tags/historian | no |

El backend rechaza comandos emitidos por `viewer` o `fractal`.

### Snapshot común

```json
{
  "session_id": "uuid",
  "t": 3600,
  "speed": 240,
  "paused": false,
  "profile": { "id": "PFL-NOC-01", "hour": 1 },
  "snapshot": { "equipment": {}, "lines": {}, "links": {} },
  "plc_tags": {},
  "events": []
}
```

## 5. Fase B · PLC propietario de operación

**Estado: implementada inicialmente y verificada.** PLC crea/inicia sesión, conecta como `role=plc` y transmite `session_id` al enlace 3D. Pendiente: UI explícita de identificador corto, detener sesión y auditoría de mandos.

Cambiar el botón de PLC a:

```text
▶ INICIAR OPERACIÓN PLC
```

Al iniciar:

1. crea/recupera una `session_id`;
2. abre el WebSocket como `role=plc`;
3. aplica el perfil seleccionado;
4. inicia el runtime;
5. muestra sesión, perfil, estado y hora simulada.

Agregar:

```text
▣ ABRIR GEMELO 3D DE ESTA OPERACIÓN
```

El enlace incluye `plant`, `api` y `session`. Cada orden del PLC queda en historian con operador/origen, hora real y simulada, valor anterior y valor aplicado.

## 6. Fase C · Gemelo 3D visor de PLC

**Estado: implementada y verificada.** Con `session` en URL, el 3D conecta como `role=viewer`, sigue el snapshot y bloquea su control autónomo. Sin `session`, su acción abre PLC Master; ya no crea un runtime local. Se verificó PLC → cierre de consumo N2 → snapshot del viewer de la misma sesión. Pendiente: captura visual automatizada de válvula/caudal/presión.

`plant.html` recibe `session=<uuid>` y se conecta con `role=viewer`.

El control actual `▶ SIMULAR` deja de crear un runtime propio. Sus estados serán:

```text
ABRIR / CONECTAR A SESIÓN PLC
CONECTANDO A PLC · <id corto>
SIGUIENDO OPERACIÓN PLC · <id corto>
OPERACIÓN PLC DETENIDA
```

El visor actualiza desde el snapshot compartido:

- válvulas y aperturas;
- niveles y volumen visual de tanques;
- bombas, PRS, rejillas, viviendas y fugas;
- caudal, flechas, alarmas y tendencias de activo.

Los escenarios de prueba se retiran del flujo operativo del visor.

## 7. Fase D · Perfiles y pruebas

**Estado: parcialmente implementada.** Los perfiles `PFL-*` existen y se agrupan en el PLC; falta separar la pantalla de pruebas de falla del selector legado del 3D.

Perfiles operativos PLC versionados:

```text
PFL-BASE-01 · Operación diurna automática · demanda residencial 100 %
PFL-NOC-01 · Operación nocturna automática · demanda residencial 30 %
PFL-NOC-02 · Operación nocturna en PRS manual · consigna fija 20,94 mca
PFL-RES-01 · Restricción vertical N2→N3 · válvula al 50 %
```

Pruebas técnicas separadas:

```text
PRB-FAL-01 · Falla de una bomba principal · operación con una sola bomba
PRB-FUG-01 · Rotura simulada en fuga L1 · rejilla nivel 2
```

Las pruebas se ejecutan desde una pantalla explícita de validación/entrenamiento, no como perfil rutinario.

## 8. Fase E · Tags PLC por sesión y Fractal

**Estado: implementación inicial hecha.** El contrato OPC UA y un WebSocket de sesión exponen exclusivamente tags PLC marcados de solo lectura; no exponen runtime ni aceptan mandos. Pendiente: catálogo completo de tags de perfil futuro y autenticación/autorización de consumidores Fractal.

### Fuente de Fractal

Fractal solo recibe un gateway PLC de sesión:

```text
GET /api/plants/{plant_id}/sessions/{session_id}/opcua-schema
WS  /api/plants/{plant_id}/sessions/{session_id}/opcua
```

Tags mínimos:

```text
PLC.Session.Id
PLC.Session.TimeS
PLC.Session.ProfileId
PLC.Session.Running
PLC.Pump.Main.FlowM3h
PLC.Pump.Main.DischargePressureMca
PLC.PRS.InletPressureMca
PLC.PRS.OutletPressureMca
PLC.PRS.CriticalPressureMca
PLC.Tank.Supply.LevelPct
PLC.Tank.Recirc01.LevelPct
PLC.Tank.Recirc02.LevelPct
PLC.Grid.Level<N>.ConsumerOpeningPct
PLC.Valve.Between23.OpeningPct
PLC.Alarm.LowPressure
PLC.Profile.FutureHours
```

Todos son `read-only`, `simulated` y con alcance de `session_id`.

### Servicio Fractal

Crear `apps/fractal-engineering-api/`. Su modelo hidráulico es independiente y no importa el runtime operativo. Lee tags, calcula y publica recomendaciones al buzón PLC:

```text
GET /api/plants/{plant}/sessions/{session}/fractal/recommendations
WS  /api/plants/{plant}/sessions/{session}/fractal/recommendations
```

## 9. Fase F · Estudios Fractal: proyección, escenarios y optimización

**Estado: implementación funcional inicial.** Fractal procesa proyección base, alternativa y optimización; PLC persiste estudios/frames por hora y el visor 3D puede cargar la rama futura con controles desactivados. El solver Fractal resuelve la red nodal aguas abajo de PRS, incluidos cabezales, ramales, cruces, 64 consumos y ocho fugas; contrasta cuatro puntos estacionarios contra el banco operativo. También calcula bomba principal según curva y altura del tanque, PRS con rama AUTO asentada y disponibilidad de presión; la recirculación usa curva de bomba, cabezas de tanques y eventos de histéresis. Pendientes la validación del horizonte completo contra operación real simulada (PID, rampas y fallas transitorias), prueba browser integral y autenticación/retención.

### Contrato de objetivos

Crear configuración versionada en:

```text
industrial-models/water-network-scale-v1/fractal/
  optimization-objectives.yaml
  optimization-constraints.yaml
```

El operador elige objetivos autorizados desde la pantalla **FRACTAL · OPTIMIZACIÓN Y RECOMENDACIONES** del PLC; no escribe fórmulas libres.

Objetivos iniciales:

```text
OBJ-LEAK-01 · Minimizar fugas manteniendo servicio
OBJ-ENERGY-01 · Minimizar energía manteniendo servicio
OBJ-MARGIN-01 · Maximizar margen de presión crítica
```

Restricciones mínimas:

```text
presión crítica ≥ 15 mca
nivel de tanque de bombeo entre límites operativos
presión de descarga de bombas ≥ 70 mca
rangos permitidos de PRS y válvulas
```

Variables de decisión permitidas inicialmente:

```text
PRS-01 · consigna manual / modo permitido
Válvula N1→N2 · apertura
Válvula N2→N3 · apertura
Válvula N3→N4 · apertura
```

### Optimización instantánea

**Método aprobado:** Differential Evolution para búsqueda global, seguido de SLSQP para refinamiento sujeto a restricciones. La selección PRS AUTO/MANUAL se evalúa como alternativas discretas. Especificación en `fractal/hydraulics/models/water-network-scale-v1/optimization.md`.

Entrada:

```text
tags PLC actuales + objetivo + restricciones
```

Salida: comparación de caso base y caso optimizado para el instante actual. La recomendación es `pending`; PLC muestra propuesta, impacto esperado, restricciones y explicación.

Acciones PLC:

```text
[ RECHAZAR ] [ APROBAR BORRADOR ] [ PROGRAMAR DESDE PRÓXIMA HORA ]
```

Aprobar crea un perfil. Programarlo lo vincula a la sesión para la siguiente hora simulada; no manda comandos en el instante de la aprobación.

### Optimización futura

**Método implementado:** horizonte de 24 horas; cada hora optimiza el caso nominal mediante Differential Evolution→SLSQP y evalúa el mismo mando en −10 %, base y +10 %. El perfil PLC define demanda/aperturas y se propagan tres tanques con balances horarios. Aún no es un MPC acoplado de trayectoria completa; IPOPT queda para cuando crezcan variables/horizonte.

Entrada:

```text
estado actual PLC + perfil PLC de horas futuras + objetivo + restricciones
```

Fractal simula/optimiza cada franja futura y propone un plan horario. No altera la sesión actual.

Acciones PLC:

```text
[ RECHAZAR ESTUDIO ]
[ REVISAR HORA POR HORA ]
[ APROBAR BORRADOR PFL-FRA ]
[ PROGRAMAR PARA HORA SIMULADA SIGUIENTE ]
```

La última opción crea un perfil, por ejemplo:

```text
PFL-FRA-<id> · Plan optimizado · pendiente de aprobación
```

El operador revisa y aprueba el perfil; programarlo establece el próximo límite horario como inicio. PLC envía cada orden al llegar esa hora. Aceptación y programación no aplican mandos inmediatamente.

## 10. Fase G · Historian compartido

**Estado: implementación inicial hecha.** SQLite guarda muestras de tags/perfil/eventos y comandos por `session_id`; persiste estudios y frames, decisiones del operador y auditoría. Pendiente: integrar todas las gráficas PLC a la fuente, política de retención y robustez ante reinicios/expiración.

Sustituir historial exclusivo de `localStorage` por historian de sesión persistente, inicialmente SQLite:

```text
session_id, tiempo real, tiempo simulado, tags, eventos,
órdenes PLC, perfil, recomendaciones Fractal, aceptación/rechazo
```

`localStorage` puede conservarse como caché de interfaz, nunca como fuente de verdad.

## 11. Fase H · Despliegue Podman

**Estado: parcialmente implementada.** Existen `Containerfile` para galería, emulador y Fractal. Pendiente: probar el conjunto integrado con Podman y configurar el proxy HTTPS/WSS de producción.

```text
arvantti-gallery                 # Nginx; Node 26 solo en build
arvantti-twin-emulator-api       # Python 3.12; API, WebSocket, sesiones, SQLite
arvantti-fractal-engineering-api # modelo independiente; lector tags PLC
```

El proxy HTTPS conserva `Upgrade` WebSocket. Variables esenciales:

```text
TWIN_CORS_ORIGINS
TWIN_DATA
TWIN_MODELS
FRACTAL_ALLOWED_SESSIONS
```

## 12. Pruebas de aceptación

1. PLC crea sesión; 3D se une con misma `session_id`.
2. PLC modifica válvula N2; la siguiente muestra muestra el cambio en 3D, tags y historian.
3. Dos sesiones son aisladas.
4. `viewer` y `fractal` no pueden enviar comandos.
5. Fractal lee tags, publica recomendación y no modifica estado por sí mismo.
6. Aceptar recomendación en PLC modifica la sesión única y se ve en 3D.
7. Plan futuro crea borrador de perfil y no cambia operación hasta aprobación.
8. Escenarios `simulation.yaml` siguen pasando como regresión.
9. Playwright verifica PLC ↔ sesión ↔ 3D, incluyendo reconexión y errores.

## 13. Orden de ejecución y punto actual

```text
[A] Runtime compartido                  · inicial implementado
[B] PLC propietario                     · inicial implementado
[C] 3D visor                            · inicial implementado
    ↓ AHORA
[C.1] prueba visual + retiro legado     · implementado; captura visual pendiente
[D] perfiles vs. pruebas                · completar
[G] historian compartido                · implementación inicial hecha
[E] gateway de tags por sesión          · implementación inicial hecha
[F.0] contrato de objetivos/restricciones · implementación inicial hecha
[F.1] servicio Fractal y recomendación instantánea · implementación inicial hecha
[F.2a] buzón backend y decisión humana · implementación inicial hecha
    ↓ AHORA
[F.2b] pantalla PLC y solicitud instantánea · implementación inicial hecha
    ↓ AHORA
[F.2c] caso base/optimizado y persistencia · implementación inicial hecha
    ↓ AHORA
[F.3] horizonte/escenarios y borrador PFL-FRA-* · implementación inicial; validar física y E2E
[H] contenedores de tres servicios        · Containerfiles; probar stack y proxy pendientes
```

La siguiente entrega debe completar **C.1**: prueba visual automatizada PLC → válvula/rejilla → caudal/presión/animación 3D, reconexión y detención limpia. Luego se implementa **G**, historian compartido, antes de construir Fractal.
