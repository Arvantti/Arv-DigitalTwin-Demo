# Plan: identidad segura para la biblioteca de estudios

## Estado y criterio de salida

Plan acordado para la rama posterior a `feat/durable-study-library`. La biblioteca D1 y su migración `0005_saved_studies.sql` son una primera entrega funcional, **no lista para producción** mientras la recuperación dependa de claves de navegador. El trabajo de identidad se hará en una rama propia, basada en el merge de la biblioteca. No desplegar la biblioteca anónima antes de cerrar los criterios de salida de este plan.

## Decisión arquitectónica

- Conservar la escena y emulación PLC públicas como experiencia de invitado. Los invitados pueden simular, pero deben autenticarse para guardar, recuperar, renombrar, recalcular o eliminar estudios durables.
- Usar inicio de sesión Google federado por Cloudflare Access (OIDC/OAuth), si la cuenta permite habilitarlo. Access gestiona el flujo y la cookie; el Worker valida criptográficamente el JWT de Access y su `issuer`, `audience`, expiración y sujeto. No implementar OAuth propio salvo que una restricción de cuenta impida Access.
- El propietario D1 deriva de identidad estable (`issuer` + `sub`), no de email, IP, `visitor_id`, `localStorage` ni un encabezado recibido del navegador. Worker sobrescribe toda identidad interna antes de hablar con las APIs.
- El archivo y las operaciones PLC siguen aislados: Fractal recibe solo el snapshot/perfil que necesita y nunca obtiene autorización para mandar al PLC.

## Sesión de navegador y dominios

La web no guarda bearer tokens, claves de recuperación, refresh tokens ni Access JWT en `localStorage`, `sessionStorage` ni IndexedDB. El login federado y la capacidad de invitado usan cookies `Secure`, `HttpOnly` y `SameSite` con expiración/rotación adecuadas. Una cookie HttpOnly sigue almacenada por el navegador, pero JavaScript no puede leerla; es el mecanismo estándar para una sesión web sin exponer secretos a XSS.

Para evitar cookies de terceros, servir el gateway bajo un hostname propio del mismo sitio, por ejemplo `api.digitaltwin.arvantti.online`, o usar una función BFF en Pages bajo el mismo origen. No basar autenticación en el hostname `workers.dev`. Si se mantiene un origen API separado, configurar CORS con credenciales y la lista exacta de orígenes; además, validar `Origin`/CSRF en toda mutación. CORS solo no es una defensa de autenticación.

La cookie de invitado es una sesión corta y revocable para la demo; su pérdida solo termina la sesión temporal y no afecta estudios de una cuenta. El navegador envía cookies también durante el handshake WebSocket; el Worker valida `Origin` allí y no recibe el token en subprotocolos.

## Separación de responsabilidades

1. Cloudflare Access controla el flujo de Google y coloca el contexto autenticado en la solicitud protegida.
2. El Worker valida la identidad, exige login en rutas de biblioteca y deriva un `owner_id` estable. Las rutas de demo PLC conservan la política de invitado y sus límites de abuso.
3. El Worker transmite el propietario al emulador solo por un canal interno autenticado; el API no acepta `owner_id` del cliente.
4. Para recalcular, no reenviar la cookie de Access ni el JWT de usuario a Fractal. Usar una aserción servicio-a-servicio firmada, de alcance mínimo, asociada a propietario/estudio/versión y con expiración breve, o hacer que Worker coordine la lectura y escritura de D1. Fractal solo recibe inputs de cálculo inmutables.
5. D1 mantiene `saved_studies` y sus versiones con `owner_id` autenticado, borrado definitivo y cuotas. El propietario se valida en cada lectura, escritura y borrado.

## Trabajo por fases

1. **Verificar prerequisitos**: disponibilidad de Cloudflare Access, Google como IdP, audience/domain y hostname API same-site. Definir si el login Google se permite a cualquier cuenta o a una lista/dominio autorizado.
2. **Diseñar sesión BFF**: establecer dominio/ruta Access para la biblioteca, cookies, callback/retorno a la HMI, CSRF/Origin, revocación y expiración. Conservar la demo de invitado.
3. **Eliminar secretos legibles por JS**: sustituir el token Bearer de `demo-client.ts` por cookie HttpOnly y quitar la clave persistente anónima y `demo_study_owner_keys`; adaptar HTTP y WebSocket.
4. **Vincular datos a cuentas**: persistir una identidad estable y filtrar todos los estudios por ella. Añadir pruebas de aislamiento entre dos sujetos, spoofing de headers, token vencido, cookie ausente y borrado/retención.
5. **Asegurar el recálculo interno**: firmar y validar aserciones entre Worker/Fractal/API, sin transmitir credenciales Google/Access al motor.
6. **Migrar con cuidado**: `0005_saved_studies.sql` no se ha aplicado en D1 remoto. No borrar bases locales ni estudios existentes a ciegas. Antes de una migración destructiva, inventariar las filas; si hay archivos anónimos previos, decidir explícitamente si se importan con autorización válida o quedan fuera de la biblioteca de cuentas. Crear migración correctiva (no cambiar silenciosamente una migración ya aplicada).
7. **Validar antes del despliegue**: pruebas Worker/Access con JWT real de entorno de prueba, D1 remoto de staging, dos cuentas, recuperación en otro navegador, expiración y revocación, CSRF, XSS sin acceso a cookies, WebSocket con Origin permitido y rechazo de emisores/audiences inválidos. No afirmar validación hasta tener esa evidencia.

## Seguridad que no se debe usar como sustituto

No usar fingerprinting del navegador, IP, User-Agent, email hasheado, `visitor_id` autodeclarado ni `localStorage` como identidad durable. Ninguno ofrece recuperación segura de cuenta. La Google/Access cookie HttpOnly es una sesión de autenticación, no una clave de recuperación accesible a JavaScript.
