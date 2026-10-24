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

**Etapa activa: validar futuro simulado del escenario PLC.** `POST /studies/horizon/from-plc` lee directamente tags y perfil guardado de la misma sesión PLC; no toma la copia de estado enviada por navegador. Proyección base y alternativa nunca optimizan, emiten mandos ni requieren aceptación. Un E2E de API cubre sesión estabilizada → 24 frames base + 24 alternativos → persistencia PLC y comprueba hora, balance de caudales por nivel/enlace, ocho fugas y ausencia de mandos. El arranque frío se rechaza (409), no se extrapola como equilibrio. **Todavía falta** contrastar volúmenes/niveles y transitorios del día completo contra una ejecución del emulador, así como el E2E browser de la vista 3D; no equivale a validación dinámica del horizonte.

**Contraste reproducible de las 24 consignas diurnas:** `TWIN_DATA=/tmp/fractal-check uv run python -m tools.hydraulics.validate_fractal_hourly --output /tmp/fractal-hourly.json`. El informe de referencia está en `docs/architecture/validation/pdd-rca-01-hourly.json` (perfil PDD-RCA-01, 120 s de estabilización operativa por consigna). Errores medios / picos: caudal 0,20 / 0,65 %, presión crítica 0,15 / 0,44 %, descarga 0,06 / 0,15 %, PRS 0,16 / 0,42 %; **0 desacuerdos** sobre presión crítica ≥15 mca. Esta comparación recorre **24 puntos de régimen**, NO una corrida continua de 24 horas: el emulador avanzó 120 s en cada consigna, mientras Fractal integró las 24 horas; por eso no certifica niveles/tanques de todo el día ni fallas/rampas intermedias. Ningún umbral de 2 %/4 % ha sido adoptado como criterio formal (D72).

**Diagnóstico dinámico del circuito de retorno (24 h continuas):** `TWIN_DATA=/tmp/fractal-day-data uv run python -m tools.hydraulics.validate_fractal_day --output /tmp/fractal-day.json` ejecuta 86.400 pasos de 1 segundo simulado del emulador (modo **offline**, no modifica ×240 ni los 15 s reales/h de la HMI). El informe íntegro **anterior** al arreglo de muestras PLC está en `docs/architecture/validation/pdd-rca-01-continuous-pre-cache.json`: es evidencia diagnóstica, no criterio de aceptación posterior al cambio. El primer banco detectó hasta **34,47 puntos porcentuales** de diferencia en suministro a la hora 18, aunque caudal y presiones mantuvieron picos <0,6 % y no hubo desacuerdos con 15 mca. No faltan 35 % de agua: en la hora 18 Fractal sitúa ≈1,34 m³ **más en suministro** y ≈1,32 m³ **menos en los dos retornos**; el volumen combinado de los tres tanques permanece cercano a 4,53 m³ en ambos modelos (≈0,018 m³ de diferencia por lectura redondeada/ruido). El error grande es **reparto/instante de conmutación** del retorno con histéresis, amplificado en horizonte abierto: al terminar la hora 3, Fractal tenía ≈52,34 % de nivel medio en los retornos frente a ≈49,0 % en el emulador; el arranque ocurre en 60 %. Una diferencia pequeña antes de cruzar ese umbral cambia minutos del ciclo activo y mueve cientos de litros de un vaso al otro en la hora siguiente. El diagnóstico de cuatro horas **posterior al arreglo** (`tools/hydraulics/diagnose_fractal_recirculation.py`, informe `docs/architecture/validation/pdd-rca-01-recirculation-reanchored-4h.json`) redujo el error del suministro en la hora 4 de **13,94 a 3,17 puntos** al reanclar cada hora los tres niveles desde el PLC; el retorno difirió **0,688 m³ en proyección libre contra 0,122 m³ reanclada**. Con iguales niveles y velocidad, la bomba de retorno Fractal difirió de la operativa en un máximo de ≈0,054 m³/h en 25 muestras (`tools/hydraulics/compare_recirculation_pump.py`), por lo que **la curva de bomba no explica** el desfase acumulado. Las 25 muestras están en `docs/architecture/validation/pdd-rca-01-recirculation-pump.json`.

**Defecto operativo encontrado al comparar:** dos lecturas PLC al mismo segundo simulado generaban sensores distintos porque el snapshot se recalculaba en cada GET, e incluso podían alterar el muestreo posterior. La sesión ahora comparte una muestra por tick con PLC y 3D e invalida al avanzar o al mandar. La prueba de regresión comprueba que PLC REST y 3D leen exactamente la misma muestra en un instante fijo. El diagnóstico corto de 4 h posterior al arreglo está reproducido; pendiente repetir las 24 h continuas con la muestra estable. No se presentan los escenarios de demanda ±10 % como intervalo de confianza del tanque: su rango no captura necesariamente un cambio de fase de los arranques. El tanque sigue siendo una estimación nominal **no validada dinámicamente**; una integración completa por cada escenario se difiere hasta poder calcularla sin volver obsoleto el estado de entrada (a ×240, cada hora transcurre en 15 s reales). Los frames marcan `validation_status: hydraulic_setpoints_only`; `robust` significa factibilidad del **modelo**, no certificación dinámica frente al emulador.

**Corrida continua posterior al arreglo de muestras PLC:** informe `docs/architecture/validation/pdd-rca-01-continuous-post-cache.json` (24 horas, 2596,71 s de cálculo offline). Persistió el desfase: máximo **34,268 puntos porcentuales** en suministro (hora 18), sin desacuerdos sobre presión ≥15 mca; la corrección de snapshot eliminó lecturas contradictorias por tick, pero **no** resolvió la fase acumulada de histéresis. Los niveles futuros siguen **no validados dinámicamente**. La reproducción se comprobó aparte con 24 marcas exactas a intervalos de 15 s (`docs/architecture/validation/pdd-rca-01-replay-240x.json`; duración 360,004 s).

**D75 · Control de inventario posterior a los informes anteriores:** el autor priorizó suministro ≤30 % y protección individual de retorno ≥90 %, con parada por suministro ≥90 % o retornos <20 %. Emulador y Fractal implementan esta misma política desde sus parámetros compartidos; véase [[recirculation-inventory-and-control]]. Los informes horarios y continuos enumerados arriba y el contraste de una hora indicado abajo pertenecen a la **política anterior de retorno a 60 %**. Siguen siendo diagnósticos históricos, no miden los niveles de la nueva política. El contraste continuo de 24 horas bajo D75 está en [[validation/pdd-rca-01-continuous-supply-priority.json]]: diferencia máxima de suministro **19,276 pp (hora 15)**, sin desacuerdo con presión ≥15 mca; persiste un desfase de fase de recirculación, por lo que el horizonte de tanques sigue **no validado dinámicamente**. No activar optimización.

**Reproducción representativa a ×240 (decisión del autor):** calcular la corrida completa **fuera de línea** con `TWIN_DATA=/tmp/fractal-day-data uv run python -m tools.hydraulics.validate_fractal_day --output /tmp/fractal-day-post-cache.json`, y luego ejecutar `uv run python -m tools.hydraulics.replay_fractal_day --input /tmp/fractal-day-post-cache.json --events /tmp/fractal-playback-events.json`. La reproducción espera 15 s reales entre las 24 horas y termina a los 360 s (seis minutos). Se anuncia en consola **PRECALCULADA · NO EN VIVO**, rechaza informes incompletos o anteriores al arreglo de sensor y nunca aplica mandos. **No cambia el paso de 1 s ni el reloj de la HMI PLC.** En esta máquina una sesión en vivo solicitada a ×240 avanzó solo 336 s simulados durante 15,7 s reales (≈×21,4 efectivo); la plataforma requiere optimización de rendimiento si se exige física completa en vivo a ×240. Aumentar sin más `dt` a 15 s redujo la presión crítica a 6,8 mca y no es aceptable como atajo físico.

**Etapa posterior: optimización hora a hora.** El prototipo DE→SLSQP permanece en código pero las rutas Fractal de optimización responden 409 por defecto; solo se habilitan explícitamente con `FRACTAL_ENABLE_OPTIMIZATION=1` para pruebas. No se ofrece en la HMI durante esta etapa.

- `POST /studies/horizon` conserva un contrato **offline sin publicación PLC** con `baseline`, `alternative` y, si se habilita, `optimized`; solo `/studies/horizon/from-plc` verifica sesión/perfil/tags de gateway y puede persistir frames. El gateway rechaza arranques sin bombas o sin presión PRS para no proyectar una física estacionaria inválida. Los primeros segundos de rampas siguen fuera del alcance del forecast horario. Contraste manual de una hora con el perfil `30 %` y PRS AUTO desde t=12 s: Fractal sin rampa terminó con niveles (suministro, retorno 1, retorno 2) `68,72 / 41,84 / 40,52 %`, emulador `70,7 / 39,7 / 39,7 %`; recirculación `4,217 vs 4,295 m³`. Tras incorporar la rampa del variador al cálculo Fractal independiente: `69,83 / 40,84 / 39,62 %` y `4,260 m³` retornados (diferencia `0,035 m³`). Caudal nominal Fractal `4,259 m³/h` y promedio operativo ≈`4,263 m³/h`. El desfase restante de fase del retorno impide declarar precisión de niveles hora a hora sin más contrastes; no usar estos frames para optimización todavía.
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
