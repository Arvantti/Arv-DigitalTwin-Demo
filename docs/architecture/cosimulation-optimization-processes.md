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
- `apps/cosimulation-engine-api/` y `cosimulation/` ahora aceptan el contrato `cosimulation-job.v2` y envían la solicitud completa a un único modelo mediante `COSIMULATION_MODEL_URL/v2/project`. El runner valida identificación del modelo, hash del perfil y frames `history/present/forecast`. **El endpoint/modelo hidráulico v2 aún no está implementado ni configurado**, así que los trabajos permanecen `blocked`; no se generan trayectorias ficticias.
- El optimizador ya publica frames forecast al historian PLC append-only; la HMI consulta/reproduce tríadas disponibles y envía snapshots al gemelo 3D. Falta conectar la fuente cosimulador para completar una tríada de tres motores.
- El historian PLC ya recibe series calculadas con perfil/hash y materializa referencias de tríada; la serie de cosimulación aún no está conectada y sus frames se muestran ausentes.
- Gallery ya presenta señales del emulador y algunos resultados de optimización; la serie de cosimulación permanece vacía hasta implementar el flujo objetivo.

Hasta que concluyan las fases del plan, ninguna curva vacía se rellena con datos inventados y ninguna propuesta futura se presenta como aplicada o validada físicamente.
