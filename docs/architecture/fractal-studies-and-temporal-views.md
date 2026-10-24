# Estudios Fractal y visualización temporal del gemelo

> Estado: decisión de arquitectura aprobada antes de completar la implementación.
> Alcance inicial: `water-network-scale-v1`; contrato reutilizable para los demás gemelos.
> Seguridad: todos los datos, PLC y escenarios son simulados; no hay conexión física.

## 1. Propósito

Fractal no es solamente un optimizador. Es un motor independiente de **estudios futuros** que toma el estado y el plan publicados por PLC, calcula una rama temporal y devuelve resultados al PLC para visualización y, cuando aplique, decisión humana.

```text
PLC.Actual + PLC.Plan
        ↓
     Fractal
        ↓
  estudio futuro
        ↓
PLC publica la rama al gemelo 3D
```

El calculador físico depende del dominio:

```text
acueducto     → emulador hidráulico
manufactura   → secuencia/producción
logística     → rutas, inventario y despacho
otros         → calculador específico del modelo
```

Fractal permanece separado de esos calculadores. Lee el contrato PLC y usa su propio adaptador de estudio.

## 2. Tipos de estudio

### Proyección base

```text
Pregunta: ¿qué ocurrirá si se ejecuta exactamente el plan PLC programado?
Entrada: estado actual + perfil futuro PLC.
Salida: rama futura sin cambios propuestos.
```

### Escenario alternativo

```text
Pregunta: ¿qué ocurrirá con cambios hipotéticos definidos por el operador?
Entrada: estado actual + perfil PLC + modificaciones de escenario.
Salida: rama futura alternativa no aplicada.
```

### Escenario optimizado

```text
Pregunta: ¿qué plan mejora un objetivo cumpliendo restricciones?
Entrada: estado actual + perfil PLC + objetivo + restricciones.
Salida: rama optimizada y borrador PFL-FRA-* pendiente de aprobación.
```

Solo el tercer tipo genera recomendaciones que pueden ser aceptadas. Ningún estudio cambia operación automáticamente.

## 3. Dos líneas temporales visuales

El sistema usa una sola geometría/layout 3D, pero dos contratos de estado incompatibles.

### Operación PLC: pasado y presente

```text
Fuente: PLC.Actual.* y PLC.Historian.*
Tiempo permitido: t ≤ PLC.Session.CurrentTime
Color: azul/cian, equipos sólidos
Etiqueta: OPERACIÓN PLC · PASADO/PRESENTE
```

El gemelo operativo no puede adelantar el reloj ni crear una simulación autónoma. Solo PLC controla inicio, pausa, velocidad, perfiles y mandos.

### Estudio Fractal: futuro no aplicado

```text
Fuente: PLC.Fractal.Forecast.<study_id>.*
Tiempo permitido: base_time ≤ t ≤ base_time + horizonte
Color: violeta/ámbar, equipos translúcidos
Etiqueta fija: FUTURO SIMULADO · NO APLICADO
```

La interfaz debe mostrar siempre tipo de estudio, perfil, hora futura, tiempo base y estudio identificado. Debe existir comparación opcional lado a lado entre operación actual y rama futura.

## 4. Barrera temporal

```text
Gemelo operativo
  no visualiza futuro como realidad
  no modifica velocidad
  no emite mandos

Gemelo predictivo
  no modifica PLC.Actual
  no modifica emulador
  permite recorrer horas del estudio
```

Aceptar un estudio optimizado crea/publica un perfil PLC. Solo cuando llegue cada hora simulada, PLC manda los mandos aprobados al emulador; su resultado pasa a `PLC.Actual` y entonces al gemelo operativo.

## 5. Contratos PLC

```text
PLC.Actual.*
PLC.Historian.*
PLC.Plan.*
PLC.Fractal.Forecast.<study_id>.*
```

Cada frame futuro debe incluir:

```json
{
  "temporal_context": "forecast",
  "study_id": "EST-001",
  "study_type": "baseline|alternative|optimized",
  "base_time": 29640,
  "forecast_hour": 6,
  "applied": false,
  "snapshot": {},
  "plc_tags": {}
}
```

## 6. Velocidad de operación

La velocidad por defecto es:

```text
15 segundos reales = 1 hora simulada
6 minutos reales = 24 horas simuladas
×240 = default
```

PLC permite al operador cambiarla dentro de límites autorizados:

```text
×60, ×120, ×240, ×600
```

El cambio se audita como `PLC.Session.Speed`, usuario y tiempo. El 3D solo informa la velocidad vigente.

## 7. Estado de implementación y prioridad

**Etapa activa: validar futuro simulado del escenario PLC.** `POST /studies/horizon/from-plc` lee directamente tags y perfil guardado de la misma sesión PLC; no toma la copia de estado enviada por navegador. Proyección base y alternativa nunca optimizan, emiten mandos ni requieren aceptación. Debe comprobarse el horizonte frente a la operación PLC, incluyendo volumen/niveles y hora del perfil, antes de volver a la optimización.

**Etapa posterior: optimización hora a hora.** El prototipo DE→SLSQP permanece en código pero las rutas Fractal de optimización responden 409 por defecto; solo se habilitan explícitamente con `FRACTAL_ENABLE_OPTIMIZATION=1` para pruebas. No se ofrece en la HMI durante esta etapa.

- `POST /studies/horizon` conserva el contrato experimental con `baseline`, `alternative` y, si se habilita, `optimized`; el flujo normal de la HMI usa únicamente `/studies/horizon/from-plc`.
- PLC persiste estudios por sesión y ofrece listado y frames bajo `fractal/studies/{study_id}/frames`; los frames se marcan forecast y `applied: false`.
- PLC HMI permite elegir proyección base o alternativa, overrides alternativos iniciales y velocidad ×60/×120/×240/×600. No muestra optimización mientras se valida la proyección.
- Frames ahora incluyen snapshot estimado de equipos, enlaces y líneas; el visor puede seleccionar hora y renderiza la rama con marca futura y controles de mando desactivados.
- En el prototipo de optimización (deshabilitado por defecto), la aprobación de un estudio optimizado exige que todas las horas y los tres escenarios cumplan restricciones (`robust`); si alguna falla, PLC rechaza la aprobación. Un estudio aprobado crea un perfil y su programación aplica desde la siguiente hora simulada; queda separado de la decisión y no manda cambios inmediatos.
- El solver Fractal independiente resuelve nodos, pérdidas y cruces de la distribución, 64 consumos y ocho fugas con continuidad simultánea; reproduce curvas de bombeo, pérdidas aguas arriba y PRS (rama manual o AUTO asentada), y calcula recirculación y tanques por pasos con histéresis. Hay casos de referencia estacionarios de distribución, bombeo/PRS y recirculación. **Pendiente:** contrastar el horizonte completo y transitorios (rampas, PID y cambios de rama) contra el emulador, además de E2E browser. Los frames siguen siendo futuro simulado, nunca operación aplicada.

## 8. Trabajo pendiente

1. Validar horizonte completo frente a operación emulada y ampliar paridad a PID/rampas, conmutación de ramas, fallas y transitorios. El estudio usa equilibrio hidráulico por hora y eventos de tanque aproximados.
2. Completar overrides de nivel vivienda/fuga en la HMI y verificar que el perfil horario completo se ejecute en PLC.
3. Automatizar el E2E browser: crear estudio, revisar frames, aprobar, programar, ejecutar el perfil y observar el estado operativo en 3D.
4. Definir autenticación/autorización, retención de estudios/historian y proxy HTTPS/WSS de producción.
