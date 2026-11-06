# Biblioteca durable de estudios

> **Estado:** primera entrega funcional en rama, no lista para producción. La recuperación actual usa una clave en `localStorage` y el cliente conserva un bearer anónimo allí; no desplegar así. La identidad segura con Google/Cloudflare Access, cookies HttpOnly y propietarios autenticados queda planificada en [`google-oauth-library-plan.md`](google-oauth-library-plan.md).

## Objetivo y límites

La biblioteca separa los estudios guardados de la sesión efímera PLC. Una sesión puede vencer y sus muestras/checkpoints pueden eliminarse sin borrar las versiones guardadas. El PLC/HMI sigue controlando solo el emulador virtual; Fractal calcula desde snapshots y devuelve resultados de solo lectura. Ninguna versión se aplica automáticamente.

La implementación inicial cubre proyecciones Fractal `baseline` y `optimized`. Cada versión conserva resultado, perfil, tags del snapshot, tiempo base, objetivo y tipo de estudio. Los resultados anteriores son inmutables. Cosimulación y paquetes de comparación completos aún no se archivan en esta biblioteca.

## Identidad provisional actual (solo desarrollo/revisión)

- La galería crea una clave de recuperación aleatoria de 256 bits y la guarda en `localStorage`, separada del token anónimo de 12 h. El Worker guarda únicamente SHA-256 de la clave en D1 y la asocia al identificador anónimo. Aunque no se almacene en claro en D1, una clave en `localStorage` es accesible a JavaScript y puede exfiltrarse ante XSS.
- `demo-client.ts` también conserva actualmente el bearer anónimo de 12 h en `localStorage`; retirar solo la clave de recuperación no resolvería todo el riesgo de credenciales del cliente.
- Si vence el token, el mismo navegador presenta su clave y recibe un token nuevo para el mismo propietario. La clave nunca se envía a Fractal ni se incluye en resultados/logs.
- D1 conserva propietario y estudios mientras haya al menos un estudio guardado. Los datos transitorios de sesión siguen venciendo (2 h); perfiles/datos de demo se limpian según el ciclo vigente cuando ya no hay estudios.
- No hay cuenta ni recuperación entre navegadores/dispositivos. Si el usuario borra los datos del sitio o pierde la clave, no hay mecanismo de recuperación de identidad.
- La acción ELIMINAR borra definitivamente el registro y todas sus versiones. El usuario debe confirmar; la operación no es reversible.
- Límites de control de almacenamiento: 50 estudios por propietario, 50 versiones por estudio, 950.000 bytes por resultado y 50 MB acumulados por propietario/planta. La cuota evita que una identidad anónima consuma almacenamiento ilimitado.

## Versiones y recálculo

1. Guardar copia un estudio Fractal `forecast` con `applied: false` en una nueva biblioteca.
2. Abrir recupera resultados/versiones puntuales desde la API de biblioteca, no desde `localStorage` ni desde la sesión PLC. La escena 3D puede abrir una versión guardada con `plant.html?savedStudy=<id>&savedVersion=<n>` y reproducir solo los frames del resultado archivado, sin crear ni conectar una sesión operativa.
3. Recalcular usa los `study_input` congelados de una versión elegida. No vuelve a leer la sesión PLC, aunque ya haya vencido. Permite conservar el perfil original o seleccionar un perfil editado, y cambiar el objetivo de presión si es optimizado.
4. El resultado recalculado se agrega como versión siguiente con referencia a la versión de origen. Nunca sustituye un resultado anterior; la nueva versión incluye su propio perfil/snapshot/objetivo.
5. Si una versión histórica no contiene los inputs congelados requeridos, el recálculo se rechaza; no se reconstruyen ni interpolan datos ausentes.

## API y persistencia

El almacenamiento productivo usa las tablas D1 `saved_studies`, `saved_study_versions` y `demo_study_owner_keys` (migración `0005_saved_studies.sql`). SQLite local conserva el mismo contrato.

- `GET /api/plants/{plant}/saved-studies`: lista del propietario.
- `POST /api/plants/{plant}/saved-studies`: copia un estudio publicado de una sesión propia.
- `GET /api/plants/{plant}/saved-studies/{id}`: recupera metadatos y un índice liviano de versiones.
- `GET /api/plants/{plant}/saved-studies/{id}/versions/{version}`: recupera un resultado puntual sin transferir todo el archivo.
- `POST /api/plants/{plant}/saved-studies/{id}/versions/from-result`: agrega resultado de recálculo validado como futuro no aplicado.
- `PUT /api/plants/{plant}/saved-studies/{id}`: renombra la biblioteca, sin cambiar resultados.
- `DELETE /api/plants/{plant}/saved-studies/{id}`: elimina el estudio y sus versiones.
- `POST /studies/saved/rerun`: Fractal obtiene la versión archivada por el gateway, calcula solo desde el snapshot conservado y agrega la nueva versión.

El Worker exige la capacidad anónima para todas las rutas, vincula las operaciones al propietario y solo permite el recálculo Fractal autorizado. Debe aplicarse la migración antes del despliegue. Las pruebas locales no constituyen validación de D1 remoto.
