# Adaptadores de modelos

`water_network_scale.py` es una adaptación de solo cálculo del solver horario existente (`fractal.hydraulics.runtime.mpc.project_24h`) al contrato de entrada/salida `cosimulation-model.v2`.

- Reutiliza la misma física del modelo hidráulico existente; no implementa otro solver ni invoca la optimización.
- Acepta explícitamente solo paso de 1 h y horizonte de 1–24 h, y verifica cada frame contra `forecast_times_s`.
- Conserva exactamente los frames de historial PLC recibidos y el snapshot presente; no reconstruye frames de historia.
- Cada frame futuro declara `quality=assumed_quasi_steady_hourly_not_transient_validated`, `applied=false` y lleva snapshot/tags separados.
- **No afirma validación física ni transitoria:** el solver opera por estados horarios, con aproximaciones de control e inventario. El adaptador aún no es un endpoint HTTP desplegado ni está conectado automáticamente al Cosimulation Engine.

Para habilitarlo en una plataforma se necesita decidir/provisionar el transporte interno modelo→engine, acordar el alcance temporal y validar sus unidades/señales contra fixtures y evidencia física. Hasta entonces `COSIMULATION_MODEL_URL` sigue siendo requerido; no se generan trayectorias de fallback.
