# Arquitectura objetivo: PLC, cosimulación y optimización

El plan de implementación, fases y criterios de aceptación está en [`plan-reconstruccion-triada-temporal-acueducto.md`](plan-reconstruccion-triada-temporal-acueducto.md).

## Decisiones

- Hay tres series independientes: emulador, cosimulador y optimizador. Cada una conserva ejecuciones y frames propios e inmutables.
- El emulador conserva la historia observada de su sesión. Cosimulación y optimización nunca la editan ni la reemplazan.
- El cosimulador ejecuta **un solo modelo** alimentado por los datos y el perfil recibidos del PLC/emulador; no se acopla a dos participantes.
- Los tres motores reciben exactamente el mismo perfil versionado, incluidos todos los valores horarios de consumo por vivienda y apertura de fugas. Optimizar no modifica esas entradas.
- Cada motor puede entregar su serie temporal propia. La serie del optimizador incluye reconstrucción de pasado/presente con los datos disponibles y futuro optimizado; no reescribe observaciones.
- Cosimulación y optimización devuelven frames al almacenamiento PLC/HMI en namespaces de resultados separados de tags operativos. Se grafican, pero no accionan equipos automáticamente.
- Una tríada por instante referencia los frames disponibles de las tres series; no mezcla datos, no rellena faltantes y no interpola para aparentar alineación.
- El usuario selecciona la presión objetivo entre 10 y 45 mca. No se fija por código un objetivo de 18 mca ni un mínimo de 15 mca. La precisión del modelo se informa aparte del objetivo de operación.
- Las válvulas entre pisos serán variables de decisión para un estudio de balance, respetando el perfil de demanda/fugas y restricciones de servicio. Bomba y PRS se agregan como variables multiobjetivo cuando sus mandos y modelos estén suficientemente definidos.

## Flujo de datos objetivo

```text
perfil horario versionado + señales/historial PLC
        ├── emulador → frames observados ─────────┐
        ├── cosimulador (un modelo) → frames ─────┼→ almacenamiento de resultados PLC/HMI
        └── optimizador → frames y perfil propuesto┘        │
                                                            ├→ tríadas y reproducción PLC
                                                            └→ slider y capas del gemelo 3D
```

Las series comparten perfil y base temporal, pero tienen procedencia, ejecución, modelo y almacenamiento lógico separados. Un cálculo nuevo crea una ejecución nueva. La navegación por una ejecución guardada solo lee frames persistidos; no vuelve a simular.

## Separación de procesos

Las APIs de ingeniería Fractal, optimización y cosimulación siguen siendo procesos independientes e integrados por contratos JSON versionados. La separación de procesos se conserva; lo que cambia es el contrato y la lógica del coordinador, no el principio de aislamiento.

## Estado de implementación y corrección necesaria

- `apps/fractal-optimization-api/` y `fractal/optimization/` separan el servicio. El trabajo v2 exige un objetivo seleccionado por el usuario (10–45 mca) para C44, valida hash del perfil y mantiene intactas las demandas/aperturas de fuga; no hace fallback de 18 a 15 mca. La HMI muestra el perfil activo de la sesión (debe coincidir para alinear el historial) y deja claro que el estudio no se aplica automáticamente.
- `apps/cosimulation-engine-api/` y `cosimulation/` aceptan `cosimulation-job.v2` y envían la solicitud a un único modelo mediante `COSIMULATION_MODEL_URL/v2/project`, incluyendo la rejilla explícita `forecast_times_s`. El runner valida identificación/calidad declarada del modelo, hash del perfil y frames `history/present/forecast` contra el snapshot y la rejilla solicitados. Existe un adaptador callable a `mpc.project_24h` limitado a 1 h/≤24 h y etiquetado cuasiestacionario/no validado transitoriamente; aún no es endpoint HTTP ni está conectado por defecto. La ruta `POST /studies/cosimulation/from-plc` lee perfil/tags/historial del PLC, somete el trabajo y publica su resultado validado al historian append-only; no conserva el token de demo en la solicitud del motor. `FRACTAL_ENGINEERING_API` requiere `COSIMULATION_ENGINE_API_URL`; el motor requiere `COSIMULATION_MODEL_URL`. **El endpoint/modelo hidráulico v2 sigue sin implementar/configurar**: los trabajos continúan `blocked` y no se generan trayectorias ficticias.
- El optimizador ya publica frames forecast al historian PLC append-only; la HMI consulta/reproduce tríadas disponibles y envía snapshots al gemelo 3D. La fuente cosimulador publica por el mismo historian cuando el modelo existe; falta probar reproducción E2E con los tres motores reales.
- Las publicaciones de ambos modelos incluyen y conservan `model_quality`; el HMI la expone en replay para no presentar predicción asumida como validación.
- Cada comparación mantiene eventos append-only de estado por fuente (`in_progress`, `ready`, `blocked`, `failed`; `not_requested` es el estado inicial calculado). La publicación exitosa mueve la fuente a `ready`; el selector HMI comunica estados y detalle de bloqueo/error. Cloudflare requiere la migración D1 `0004_comparison_source_events.sql`.
- El historian PLC fija un manifiesto inmutable por comparación (`profile/hash`, snapshot/tags, historia/hash, tiempo base y rejilla exacta), y valida que cada publicación coincida con ese contexto; corridas legadas sin manifiesto no se amplían. La ruta de publicación cosim está cableada, pero no tendrá frames hasta configurar un modelo aprobado.
- Gallery puede solicitar cosimulación desde la sesión activa con paso de 1–24 h y horizonte de 1–168 h (horas enteras); API y HMI validan la misma rejilla para limitar costo. El gateway público reenvía solo sesiones propias de la capacidad anónima. Sin endpoint del motor/modelo configurado en Cloudflare, responde no disponible y mantiene frames ausentes; no simula ni interpola en el navegador.

Hasta que concluyan las fases del plan, ninguna curva vacía se rellena con datos inventados y ninguna propuesta futura se presenta como aplicada o validada físicamente.
