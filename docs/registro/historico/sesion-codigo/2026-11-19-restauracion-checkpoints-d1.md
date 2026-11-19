# 2026-11-19 · Restauración de checkpoints D1

## Solicitud
Diagnosticar por qué se desconecta el PLC virtual al intentar reanudar la demo de Acueducto, antes de la cosimulación corta.

## Evidencia y cambio
- En la reanudación, el log del emulador registró `checkpoint de sesión incompatible o corrupto` en la lectura del estado desde la ruta WebSocket. Una consulta de metadatos confirmó una sesión vigente y un BLOB de 772.400 bytes con la versión esperada (2). No se descargó el payload.
- D1 documenta que los resultados de columna BLOB se devuelven como arreglos de bytes. El Worker codificaba solo `ArrayBuffer` y sus vistas. El arreglo JSON llegaba sin el marcador que Python transforma en `bytes`, por lo que lo rechazaba antes de descomprimirlo.
- Se codifican los arreglos de bytes con el marcador binario existente. No se modifica el esquema, la fila, el formato persistido ni la autenticación. Las pruebas cubren la respuesta del puente y el viaje de ida y vuelta con arreglos vacíos y de tamaño representativo.

## Pendiente
Validar reanudación en producción con autorización y verificar por separado la pantalla de carga de la HMI. No se ejecutó ni persistió una cosimulación; la latencia del manifiesto sigue sin aislarse.
