# Endpoint local del modelo de cosimulación del acueducto

Se agregó `apps/water-network-cosim-model-api/`, API HTTP independiente con `/health` y `/v2/project`, un Containerfile y contrato dirigido al adaptador `fractal/hydraulics/runtime/mpc.project_24h`. Se incorporó al workspace/lockfile. El modelo conserva el perfil, opera solo con paso de 1 h y horizonte 1–24 h, y declara `assumed_quasi_steady_hourly_not_transient_validated`; no optimiza ni aplica resultados.

Validación: E2E local engine→API de modelo con solicitud de prueba produjo 4 frames (history/present/2 forecast), fue aceptado con perfil/hash/rejilla y devolvió `applied_to_plc=false`; también se construyó el contenedor Podman y `/health` identificó modelo y calidad. Ruff pasó y `uv run pytest -q` pasó 475 pruebas (aviso deprecado de FastAPI TestClient/httpx). Los frames corresponden a un fixture de prueba, no a una sesión PLC real y no se publicaron ni persistieron en el historian de producción.

No se desplegó ni configuró servicio remoto. El endpoint aún no tiene autenticación; no exponerlo. Cloudflare Containers no tiene salida a Internet, por lo que antes se requiere diseñar/provisionar transporte interno autenticado entre Fractal, engine y modelo. También falta validar unidades/señales con sesión real, persistir una trayectoria real (con autorización) y verificar el replay de tríada en browser.
