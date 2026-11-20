# 2026-11-20 · Dependencias del modelo hidráulico cosimulado

## Evidencia
El intento corto PDD-RCA-01 después de desplegar #231 fijó el manifiesto en 6,23 s con disponibilidad de contenedor de 0 ms. El motor aceptó el trabajo, pero lo marcó `failed` por un HTTP 500 al solicitar la proyección; Fractal devolvió 409 a la HMI. D1 confirmó un manifiesto y cero ejecuciones del modelo para la sesión, que quedó pausada. El motor y el modelo no tenían configurada la captura de logs de sus contenedores; no se recuperó una traza remota que identifique la excepción exacta.

Con la instalación exclusiva del paquete del modelo (`uv sync --frozen --no-dev --package water-network-cosim-model-api`), `/health` funciona, pero una entrada válida a la proyección carga el solver y reproduce `ModuleNotFoundError: No module named 'numpy'`. La instalación conjunta de los paquetes del monorepo ocultaba la falta de dependencias directas.

## Cambio y verificación
Declarar NumPy, SciPy y PyYAML en el paquete del modelo, actualizar el lockfile y probar `/v2/project` con el solver real. El workflow manual verifica el API en un entorno separado de Python 3.12 antes de modificar servicios remotos. Pruebas aisladas: 4 aprobadas. La evidencia local explica un posible origen del 500, no prueba por sí sola que producción fallara exclusivamente por ese motivo. Sin nuevo despliegue, cosimulación remota ni aplicación al PLC.

## Continuación: horizonte de Fractal sobre manifiesto fijo
Tras desplegar la corrección de dependencias, un único intento autorizado PDD-RCA-01 (objetivo ×60, paso/horizonte 1 h) fijó el manifiesto en 4,66 s y persistió 15 frames del modelo: 13 históricos, el presente en t=743 s y un futuro en t=3600 s. En la comparación D1 había 13 escenas de Planta Real coincidentes con el historial y cero ejecuciones Fractal. Los huecos del presente/futuro y la fuente Fractal ausente se muestran como tales, sin interpolar. La sesión quedó pausada; no se aplicaron resultados ni se archivó un estudio en la biblioteca.

Fractal forzaba paso 1 h/horizonte 24 h en el manifiesto incluso al elegir uno ya fijado de 1 h, por lo que ese ID devolvía conflicto. En este cambio local la HMI transmite la rejilla de la comparación seleccionada cuando aún no tiene fuente Fractal; la API verifica que el manifiesto devuelto conserve esa rejilla, snapshot y perfil, y pasa las horas (1–24) al proceso independiente. Las solicitudes sin rejilla mantienen por defecto 24 h. Se rechazan rejillas fuera de la capacidad del solver antes de publicar un estudio. Fractal continúa publicando solo pronósticos propios: no inventa observaciones históricas ni convierte su futuro en Planta Real. Validación local dirigida, sin despliegue, sin nuevo cálculo remoto ni comandos PLC.
