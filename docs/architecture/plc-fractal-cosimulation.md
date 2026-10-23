# PLC Master, perfiles operativos y co-simulación Fractal

> Estado: diseño aprobado para implementación incremental.  
> Alcance: `water-network-scale-v1`.  
> Seguridad: todo componente es **simulado**; no hay conexión ni escritura a PLC, OPC UA, sensores o infraestructura física.

## Propósito

El PLC Master es la interfaz operativa del emulador hidráulico. Fractal de Ingeniería es una calculadora independiente de proyección y optimización. Ambos se comunican como lo harían sistemas industriales reales: Fractal únicamente lee información publicada por el PLC virtual mediante una interfaz OPC UA simulada; no lee el emulador ni el modelo hidráulico operativo directamente.

La HMI permite al operador:

1. operar manualmente las válvulas;
2. crear y ejecutar perfiles horarios de operación;
3. observar señales actuales del PLC;
4. solicitar un estudio Fractal con objetivos y restricciones definidos por el operador;
5. comparar proyección base y proyección optimizada;
6. aceptar o rechazar explícitamente cualquier recomendación.

## Principios no negociables

- El emulador hidráulico operativo y Fractal usan cálculos independientes.
- Fractal no importa `network.py`, `PlantModel` ni variables internas del emulador para conocer el estado actual.
- Fractal solo recibe tags y perfil publicados por el PLC virtual.
- Fractal nunca escribe mandos al PLC virtual, al emulador ni a una integración física.
- Una recomendación solo se aplica mediante `Operador → HMI → PLC virtual → emulador`.
- La escena 3D y la HMI son consumidoras de señales; no calculan hidráulica.
- Toda pantalla y recomendación conserva la marca `SIMULADO`.

## Arquitectura

```text
Operador
  │ mandos aprobados
  ▼
HMI / PLC Master virtual
  │ comandos permitidos
  ▼
Emulador hidráulico operativo
  │ señales calculadas
  ▼
PLC Master virtual ── tags OPC UA simulados, solo lectura ──► Fractal de Ingeniería
  ▲                                                        │
  │ recomendaciones visibles, sin escritura                │ proyección/optimización
  └────────────────────────────────────────────────────────┘
```

### Capas y carpetas

```text
apps/
  twin-emulator-api/             # sesiones WebSocket, PLC virtual, historian y API de perfiles
  fractal-engineering-api/        # futuro host independiente de trabajos Fractal
  gallery/                        # HMI, PLC Master y escena 3D

packages/
  twin-runtime/                  # tiempo, equipos, enlaces, snapshots y simulación genérica
  twin-contracts/                # futuro: contratos PLC, perfiles y resultados Fractal

equipment-library/               # equipos reutilizables
industrial-models/
  water-network-scale-v1/        # emulador operativo del acueducto

fractal/
  core/                           # trabajos, objetivos, restricciones y recomendaciones
  hydraulics/
    runtime/                      # utilidades hidráulicas propias de Fractal
    models/
      water-network-scale-v1/     # modelo, topología y optimizador independientes

integrations/
  opcua/                          # futuro servidor/cliente OPC UA simulado y conectores reales aislados

deployments/                      # configuración/entrega por cliente
```

El modelo Fractal de agua puede representar una topología equivalente, pero debe tener implementación propia dentro de `fractal/hydraulics/models/water-network-scale-v1/`.

## Tiempo de simulación

El día hidráulico se ejecuta acelerado:

```text
15 segundos reales = 1 hora hidráulica simulada
6 minutos reales = 24 horas hidráulicas simuladas
```

La HMI recibe muestras actuales desde el PLC virtual. Estas son datos **en tiempo real de la simulación**, no telemetría de una planta física.

## Perfiles de operación

Un perfil es un escenario operativo de 24 franjas horarias. Cada hora describe una configuración completa de mandos.

### Alcance aprobado: opción C

### Plantilla inicial incluida

El modelo publica la plantilla versionada `PDD-RCA-01 · Demanda diurna con rampa cosenoidal amortiguada`. Usa una apertura global idéntica para todos los niveles: 30 % en hora 01, ascenso cosenoidal sin escalones hasta 100 % en hora 12 y descenso amortiguado hasta 30 % en hora 24. Vive en `industrial-models/water-network-scale-v1/operation-profiles/pdd-rca-01.json` y se instala como perfil disponible al iniciar el PLC virtual.

Cada franja incluye:

```text
Viviendas
  - apertura global
  - apertura por nivel
  - apertura individual

Fugas
  - L1 y L2 de cada nivel

Válvulas verticales
  - nivel 1 → 2
  - nivel 2 → 3
  - nivel 3 → 4

Estación reguladora PRV
  - modo AUTO/MANUAL
  - consigna crítica
  - consigna manual de salida
```

### Precedencia de aperturas de viviendas

```text
Global → Nivel → Vivienda individual
```

Cada nivel posterior sobrescribe solamente los valores que declare. Antes de ejecutar, el PLC resuelve cada hora a un conjunto explícito de mandos para garantizar repetibilidad y trazabilidad.

### Editor de perfiles

Nueva pantalla propuesta:

```text
REJILLA Y CONSUMO → PERFILES DE OPERACIÓN
```

Funciones mínimas:

- crear, nombrar y describir un perfil;
- editar horas 01 a 24;
- copiar una hora a otra;
- copiar una hora a un rango;
- clonar un perfil existente;
- guardar borrador y versión publicada;
- cargar un perfil guardado;
- ejecutar un perfil durante el ciclo acelerado;
- convertir una sesión manual registrada en perfil reutilizable.

### Modos operativos

1. **Manual en vivo:** el operador ajusta mandos directamente; cada cambio queda en el historian.
2. **Perfil programado:** el PLC aplica la franja vigente al avanzar cada hora simulada.

## Tags PLC y OPC UA simulado

Fractal leerá únicamente un espacio de tags PLC. El contrato final se definirá en `twin-contracts`, pero debe cubrir:

```text
PLC.Pump.DischargePressure
PLC.Pump.Flow
PLC.PRS.InletPressure
PLC.PRS.OutletPressure
PLC.PRS.Flow
PLC.PRS.CriticalPressure
PLC.PRS.AutoValveOpening
PLC.PRS.ManualValveOpening
PLC.Grid.<nivel>.ConsumerOpenings
PLC.Grid.<nivel>.LeakOpenings
PLC.Grid.<nivel>.MinPressure
PLC.Grid.<nivel>.Flow
PLC.Profile.ActiveId
PLC.Profile.CurrentHour
PLC.Profile.FutureHours
```

El perfil futuro debe ser visible como datos PLC para que Fractal pueda anticipar la operación sin consultar el emulador.

## Estudios Fractal

Fractal no optimiza con un criterio oculto. El operador crea un estudio de optimización y define las restricciones y prioridades.

### Restricciones configurables

```text
- presión mínima requerida en vivienda crítica;
- presión máxima a la salida de la PRV;
- presión máxima de descarga de bombas;
- rango de apertura permitido para PRV;
- rango de apertura permitido para válvulas;
- caudal máximo permitido;
- límite de fugas, si aplica.
```

Ejemplos:

```text
Presión crítica ≥ 20 mca
Salida PRV ≤ 28 mca
Descarga de bomba ≤ 78 mca
Apertura PRV entre 20 % y 85 %
```

### Objetivos configurables

```text
1. garantizar servicio de presión;
2. minimizar fugas;
3. minimizar presión/energía innecesaria;
4. evitar cambios bruscos de consigna;
5. reducir intervenciones de válvulas.
```

La primera versión ofrece prioridades y pesos predefinidos, no fórmulas arbitrarias.

### Estados posibles de un estudio

```text
ÓPTIMO ENCONTRADO
ÓPTIMO PARCIAL
NO FACTIBLE
```

Si las restricciones son incompatibles, Fractal debe explicar el conflicto y mostrar el mejor límite alcanzable; no debe producir una recomendación engañosa.

## Curvas y comparación visual

Las gráficas PLC mantienen el historial de señales ya ocurridas. Desde el instante actual `t0`, Fractal agrega dos curvas futuras.

```text
Pasado y presente                    Futuro
──────────────────────────┼────────────────────────────────
Medición PLC              │ Proyección base Fractal
                          │ Proyección optimizada Fractal
                          │
                          t0 = instante actual
```

| Serie | Significado | Estilo sugerido |
|---|---|---|
| Medición PLC / emulador | Estado que ya ocurrió en la simulación | Azul sólido Arvantti |
| Proyección base | Futuro con perfil PLC sin corrección | Azul tenue punteado |
| Proyección optimizada Fractal | Futuro aplicando recomendaciones | Violeta o verde punteado |

Aplicación inicial:

- presión de descarga de bomba;
- presión antes de PRV;
- presión después de PRV;
- presión crítica;
- caudal total;
- consumo;
- fugas;
- consignas y aperturas PRV.

### Sin perfil futuro

Sin un perfil programado, Fractal solo puede:

1. recomendar una corrección puntual para el estado actual; o
2. proyectar con el supuesto visible `mantener aperturas actuales`.

Una proyección sin perfil no debe presentarse como pronóstico operativo confiable.

## Recomendaciones y aprobación

Una recomendación debe contener:

```text
ID de recomendación
hora de inicio y horizonte
perfil considerado
supuestos
restricciones verificadas
curva base
curva optimizada
parámetros sugeridos
impacto esperado: fugas, presión, caudal y energía
resultado: óptimo, parcial o no factible
```

La HMI ofrece:

```text
VER IMPACTO | ACEPTAR | RECHAZAR
```

La aceptación crea un evento auditado y traduce únicamente los cambios aprobados a comandos permitidos del PLC virtual.

## Historian y persistencia

El historian de navegador actual es temporal. Perfiles, estudios y decisiones deben persistir en backend.

Entidades mínimas:

```text
operation_profiles
operation_profile_hours
simulation_sessions
plc_history_samples
fractal_optimization_runs
fractal_recommendations
operator_decisions
```

Evolución prevista:

```text
Primera etapa local: SQLite
Etapa multiusuario/cliente: PostgreSQL + almacenamiento de series temporales
```

## Visualización 3D

### Tanques

Los tanques de recirculación y bombeo deben usar:

```text
- carcasa translúcida;
- volumen de agua azul visible;
- altura vinculada a level_pct publicado por el PLC;
- nivel vacío/lleno visible durante simulación y grabación.
```

La escena no calcula niveles: refleja las señales del modelo.

### Dirección de flujo

Las tuberías deben mostrar flechas o partículas animadas:

```text
dirección = signo de caudal publicado
velocidad = magnitud del caudal
sin flujo = flechas detenidas u ocultas
caudal inverso = flechas invertidas
```

No se usarán flechas decorativas fijas.

## Plan de implementación

### Fase 1 — Contratos PLC, perfiles e historian

**Estado: en curso.** Se implementaron el CRUD persistente local de perfiles (SQLite), el contrato de perfil y el espacio de tags PLC de solo lectura. Falta el historian compartido de muestras y el servidor OPC UA interoperable.

- definir tags PLC de proceso, perfil y recomendación;
- construir registro de tags y servidor OPC UA simulado;
- formalizar esquema de perfil horario;
- crear persistencia inicial para perfiles, sesiones y muestras;
- migrar el historian de sesión fuera de `localStorage`.

**Criterio de aceptación:** un perfil y sus 24 franjas pueden guardarse, cargarse y auditarse desde backend.

### Fase 2 — Editor y ejecución de perfiles

**Estado: en curso.** La HMI permite crear, guardar, cargar, clonar la franja siguiente, capturar mandos individuales actuales y ejecutar un perfil persistido. Falta la edición directa de cada vivienda/fuga dentro del editor y el rango de clonación.

- pantalla `PERFILES DE OPERACIÓN`; 
- editor de 24 horas;
- clonación/copia de franjas;
- resolución global/nivel/individual;
- programación de fugas, válvulas verticales y PRV;
- ejecución de 24 minutos y registro de mandos aplicados.

**Criterio de aceptación:** el emulador recibe únicamente mandos PLC resueltos por la franja activa y las curvas reflejan su respuesta.

### Fase 3 — Mejoras de escena 3D

**Estado: implementado para la escena de agua.** Los tanques cuyo contenido es agua tienen carcasa translúcida y líquido vinculado al canal `level`; las tuberías muestran flechas animadas según la velocidad y sentido publicados.

- carcasa transparente de tanques;
- líquido y nivel dinámico;
- flechas de flujo basadas en señales publicadas.

**Criterio de aceptación:** los niveles y direcciones cambian solo cuando lo hacen las señales del emulador.

### Fase 4 — Fractal hidráulico puntual

- crear `fractal/hydraulics/models/water-network-scale-v1/`;
- crear `apps/fractal-engineering-api/`;
- lectura exclusiva de tags OPC UA simulados;
- objetivos y restricciones configurables;
- recomendación puntual sin escritura automática.

**Criterio de aceptación:** Fractal puede recomendar una consigna PRV con trazabilidad de tags, restricciones y resultado.

### Fase 5 — Proyección por horizonte y superposición

- leer perfil futuro publicado por PLC;
- calcular proyección base;
- calcular proyección optimizada;
- superponer ambas sobre gráficas PLC;
- mostrar supuestos, restricciones y horizonte.

**Criterio de aceptación:** desde un mismo estado PLC y perfil futuro se comparan visualmente los dos futuros posibles.

### Fase 6 — Operación auditada y preparación de cliente

- aceptar/rechazar recomendaciones;
- historial de decisiones;
- comparación entre perfiles, sesiones y estudios;
- migración de SQLite a PostgreSQL/series temporales cuando haya operación multiusuario.

**Criterio de aceptación:** cada cambio aplicado puede rastrearse al operador, perfil, recomendación y sesión que lo originaron.

## Fuera de alcance inicial

- conexión a PLC físico;
- servidor OPC UA real hacia infraestructura industrial;
- escritura automática desde Fractal;
- optimización de otras plantas;
- fórmulas arbitrarias creadas por usuario.
