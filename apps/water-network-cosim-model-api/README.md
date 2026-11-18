# Water Network Cosimulation Model API

Endpoint HTTP v2 que adapta `fractal/hydraulics/runtime/mpc.project_24h` al contrato de un único modelo. Devuelve frames con calidad explícita:

`assumed_quasi_steady_hourly_not_transient_validated`

Solo admite paso de 1 h y horizonte de 1–24 h. Sus horas son proyecciones cuasiestacionarias, no una integración transitoria ni una validación física. No optimiza, no cambia el perfil recibido y no aplica los resultados al PLC.

## Prueba local

Ejecutar desde la raíz del repositorio, manteniendo el modelo en loopback:

```bash
uv sync --all-packages
uv run -- python -m uvicorn water_network_cosim_model_api.main:app --host 127.0.0.1 --port 8400
```

En otra terminal, iniciar el engine con el endpoint local:

```bash
COSIMULATION_MODEL_URL=http://127.0.0.1:8400 \
  uv run -- python -m uvicorn cosimulation_engine_api.main:app --host 127.0.0.1 --port 8300
```

`GET /health` identifica el modelo y su calidad; `POST /v2/project` implementa `cosimulation-model-request.v2`. Los tests de contrato y adaptador se ejecutan con:

```bash
uv run pytest apps/water-network-cosim-model-api/tests apps/cosimulation-engine-api/tests/test_water_network_adapter.py
```

## Seguridad y despliegue

El endpoint todavía no tiene autenticación de servicio. **No exponerlo a Internet ni desplegarlo así.** Cloudflare Containers no tiene salida general a Internet; antes de configurar `COSIMULATION_MODEL_URL` hay que provisionar transporte privado y autenticado entre Fractal, el engine y este servicio. No configurar endpoints remotos ni registrar datos de sesiones aquí hasta aprobar el diseño y el despliegue.
