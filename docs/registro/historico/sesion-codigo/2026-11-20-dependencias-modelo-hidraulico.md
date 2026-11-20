# 2026-11-20 · Dependencias del modelo hidráulico cosimulado

## Evidencia
El intento corto PDD-RCA-01 después de desplegar #231 fijó el manifiesto en 6,23 s con disponibilidad de contenedor de 0 ms. El motor aceptó el trabajo, pero lo marcó `failed` por un HTTP 500 al solicitar la proyección; Fractal devolvió 409 a la HMI. D1 confirmó un manifiesto y cero ejecuciones del modelo para la sesión, que quedó pausada. El motor y el modelo no tenían configurada la captura de logs de sus contenedores; no se recuperó una traza remota que identifique la excepción exacta.

Con la instalación exclusiva del paquete del modelo (`uv sync --frozen --no-dev --package water-network-cosim-model-api`), `/health` funciona, pero una entrada válida a la proyección carga el solver y reproduce `ModuleNotFoundError: No module named 'numpy'`. La instalación conjunta de los paquetes del monorepo ocultaba la falta de dependencias directas.

## Cambio y verificación
Declarar NumPy, SciPy y PyYAML en el paquete del modelo, actualizar el lockfile y probar `/v2/project` con el solver real. El workflow manual verifica el API en un entorno separado de Python 3.12 antes de modificar servicios remotos. Pruebas aisladas: 4 aprobadas. La evidencia local explica un posible origen del 500, no prueba por sí sola que producción fallara exclusivamente por ese motivo. Sin nuevo despliegue, cosimulación remota ni aplicación al PLC.
