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

La API del Container no implementa auth por sí misma. En Cloudflare debe quedar detrás del relay interno del Worker, que acepta solo rutas engine/modelo allowlisted, exige `COSIMULATION_INTERNAL_TOKEN` de 32–256 caracteres, valida el bearer en comparación de tiempo constante y lo elimina antes de proxyar al Container. El Container no tiene salida general a Internet ni endpoint público. No habilitar el secreto ni desplegar los nuevos Containers hasta tener autorización y completar las validaciones; en despliegues locales mantener bind en loopback.
