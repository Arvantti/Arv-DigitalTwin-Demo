# Plan: autenticación global de Digital Twin

## Estado

La rama `feat/google-oauth-study-library` parte del merge `f27b397`. Incluye cambios locales para biblioteca durable de estudios y acceso común: núcleo deny-by-default, API de control de acceso/Auth0, consola `/access-admin.html`, middleware Pages, controles del gateway Acueducto y botones de sesión en la portada. La galería aún no tiene el API de autorización desplegado ni la variable de Pages que lo conecta; por tanto, los permisos de servidor y la consola no están activos en producción. Solo Acueducto tiene integración de autorización en el código. No se ha desplegado ni se ha aplicado ninguna migración remota adicional durante esta tarea.

### Estado de configuración externa (2026-11-14)

- Auth0 tenant `arvantti-digitaltwin` (región US). La conexión `DigitalTwin-Users` tiene el registro público desactivado; el cliente de Cloudflare Access está federado con Auth0.
- El cliente M2M `DigitalTwin Access Control API` cuenta con permisos de Management API para leer/crear/actualizar usuarios y revocar sesiones. Su secreto no está en Git ni se ha cargado todavía en Cloudflare.
- La Action `DigitalTwin require verified email` fue desplegada y exige correo verificado para el cliente de Cloudflare Access. Falta confirmar que esté vinculada al trigger Post Login activo.
- Cloudflare Access tiene la aplicación `DigitalTwin Gallery` para `digitaltwin.arvantti.online`, con proveedor Auth0 y política `Allow DigitalTwin Auth0 users`. La ruta sin sesión redirige al login de Auth0. Esta protección de borde fue habilitada con autorización del usuario.
- D1 `digitaltwin-access-control` se creó y recibió la migración inicial `0001_access_control.sql` con autorización. La configuración local está en `wrangler.access-control.jsonc`; contiene identificadores no secretos, pero no el secreto M2M.
- El Worker de control de acceso, el middleware Pages con `ACCESS_CONTROL_API_URL` y las APIs protegidas todavía no se desplegaron/configuraron. No crear cuentas de prueba ni afirmar que los permisos de backend están activos hasta desplegar y probar esa cadena.
- No se modificaron las otras aplicaciones de Cloudflare Access. Acueducto es el único gemelo conectado al control de acceso en el código.
- No mostrar tokens, secretos, códigos ni contraseñas por chat o capturas. El usuario los introduce directamente en los paneles; no leerlos, copiarlos ni registrarlos.

Decisión pendiente: confirmar si el login de Gallery conservará Google además de email/contraseña o si se limitará a cuentas invitadas de `DigitalTwin-Users`. La cuenta administradora existente de Andrés está asociada a Google; para conservar su identidad debe autenticarse con **Continue with Google**.

Decisión vigente del usuario: el login se presenta **una sola vez al inicio** y la misma sesión da acceso a todos los escenarios y proyectos del sitio, no solo al PLC. No habrá un login por planta/proyecto. Las aplicaciones Access que protegen Gallery (incluida la portada), el host de API y sus aliases deben usar el mismo IdP y la misma allowlist global; SSO evita pedir credenciales de nuevo. Las variantes `pages.dev` y `workers.dev` no deben servir como bypass. Las páginas/modelos individuales no requieren cambios de autenticación propios.

## Recomendación

Usar **Auth0 como proveedor y almacén de identidades**, permitir a Andrés autenticarse con su método administrador y habilitar una conexión de base de datos para usuarios/contraseñas individuales de clientes y resellers. Usar **Cloudflare Access como puerta de entrada (edge gate)** para páginas privadas y APIs. Así Auth0 hospeda el formulario de login, Google y las cuentas/contraseñas; Access mantiene la sesión web HttpOnly y protege las rutas antes de llegar a la aplicación. No construir login ni almacenamiento de contraseñas propios.

Cloudflare Access solo no satisface el requisito de cuentas individuales. Auth0 hospeda identidad y credenciales; el API de control implementado localmente valida la aserción de Access y aplica permisos por usuario/gemelo. La integración está pendiente de despliegue y validación extremo a extremo.

### Experiencia de entrada

- Al entrar al host canónico de Gallery, Cloudflare Access inicia el flujo hospedado de Auth0 si hace falta; no se implementa login/modal distinto por proyecto ni formulario propio en Gallery. La portada ofrece enlaces explícitos para iniciar y cerrar la sesión común de Access.
- Tras autenticar una vez, la sesión común permite navegar entre todos los gemelos y herramientas cubiertos por la aplicación Access. Las otras aplicaciones Access del mismo equipo deben reutilizar el mismo IdP/SSO para evitar volver a pedir credenciales.
- Proteger el host completo de Gallery y el host first-party del API. Proteger también o redirigir el alias `pages.dev`; el Worker valida Access por criptografía y rechaza el acceso directo a `workers.dev`.
- El callback de Auth0/Access es parte del proveedor, no una pantalla de login de cada planta. Las URLs profundas deben regresar al recurso solicitado después de autenticarse.

## Identidades y permisos

- La cuenta personal de Andrés será la única `admin`; su identidad se verifica mediante el proveedor configurado. Ninguna cuenta reseller/cliente recibe privilegios administrativos. No fijar permisos por encabezados ni por correo declarado por el cliente.
- Los usuarios/contraseñas se crean solo por administración; deshabilitar auto-registro. Auth0 almacena y verifica contraseñas (hash gestionado por el proveedor). Nunca mostrar ni recuperar una contraseña existente.
- Los usuarios de clientes y resellers serán identidades individuales de Auth0 Database con correo y contraseña; no se usará un usuario compartido ni se exigirá Google. La creación será por invitación/administración, sin auto-registro.
- Andrés será el único administrador, con acceso global y capacidad para administrar usuarios/asignaciones. Clientes y resellers solo obtienen las capacidades concedidas por gemelo; no administran cuentas ni operan mandos PLC.
- El administrador asigna los gemelos permitidos a cada usuario. La asignación debe verificarse en servidor y no solo ocultar tarjetas en Gallery.
- Política inicial de resellers: al asignar un gemelo, queda habilitada por defecto la lectura de ese gemelo y de sus escenarios guardados; Andrés puede revocar cada permiso por usuario/gemelo desde la consola. Al asignar un gemelo a cualquier visualizador se concede `view`; los resellers además reciben `saved_studies.read` por defecto. La creación/edición sigue siendo explícita. Crear y editar escenarios quedan deshabilitados hasta asignación expresa. Para clientes, cada permiso se asigna expresamente. Los usuarios no pueden borrar escenarios ajenos. La biblioteca conserva propietario original. En Acueducto el gateway concede lectura/edición compartida solo tras validar el permiso por usuario/gemelo; los editores agregan versiones o renombran, pero no borran escenarios ajenos.
- Esto aplica a todo el catálogo de gemelos de la plataforma, no solo al acueducto. La consola administrativa permitirá a Andrés invitar, suspender/reactivar y revocar sesiones de usuarios; para cada usuario y cada gemelo podrá asignar/quitar acceso y permisos independientes: ver gemelo, leer escenarios guardados, crear escenarios y editar escenarios. Gemelos nuevos se deniegan por defecto hasta asignación explícita. Nunca muestra contraseñas; el usuario las define mediante flujo hospedado de Auth0. Registrar actor y fecha de cada cambio.
- Separar permisos `view`, `saved_studies.read`, `saved_studies.create`, `saved_studies.edit` y `manage_users`; denegar por defecto lo no concedido. Borrar escenarios ajenos, `simulate`, `virtual_plc` y demás acciones operativas quedan denegados para usuarios no administradores salvo decisión futura explícita.

## Arquitectura de sesión y autorización

1. Cloudflare Access protege los paths privados del hostname canónico y recibe las identidades de Auth0. Pages y APIs no implementan el formulario ni guardan tokens en el navegador.
2. Access mantiene cookie `Secure`, `HttpOnly` y `SameSite`; el navegador no guarda bearer/refresh/access tokens en `localStorage`, `sessionStorage` o IndexedDB. El Worker valida criptográficamente la aserción de Access (`iss`, `aud`, `exp`, `sub`) y no confía en encabezados de identidad proporcionados por el cliente.
3. El hostname del API debe ser propio y same-site, por ejemplo `api.digitaltwin.arvantti.online`, no `workers.dev` directo. Proteger también el dominio Pages alterno o redirigirlo al canónico. Validar `Origin`/CSRF en mutaciones y WebSocket; CORS no sustituye autenticación.
4. Mantener autorización de producto en servidor: asignaciones por usuario/gemelo/acción en D1. El API Access Control verifica identidad JWT Access y aplica deny-by-default; los endpoints protegidos deben verificar cada petición. Access demuestra identidad; no concede automáticamente permisos de negocio.
5. Mantener administración separada de la sesión de usuario: una API backend usa Auth0 Management API para crear/actualizar usuarios e invitaciones. El secreto de aplicación/M2M vive únicamente en Cloudflare Worker Secrets. No pasa al browser ni a Fractal.
6. El recálculo Fractal recibe solo snapshot/perfil archivados. No reenviar cookie ni JWT de Access al motor; Worker coordina la autorización o emite una aserción interna de alcance mínimo y expiración breve.
7. Las sesiones PLC continúan siendo temporales y separadas de la identidad de la cuenta. Ningún cambio de permisos o login puede mandar órdenes a PLC físico.

## Datos de credenciales y secretos

- Google OAuth Client ID/Secret se configura en la conexión Google de Auth0; no se guarda en Git ni en datos de la página.
- El Client ID de la aplicación no es secreto, pero se configura por entorno; los secretos OIDC/M2M se guardan en Auth0/Cloudflare Access/Worker Secrets según el flujo.
- El secreto M2M que permite gestionar usuarios solo se agrega a Cloudflare Worker Secrets cuando el usuario esté presente y autorice el paso. No pegarlo en el chat, issues, documentos, `.env` rastreado o código.
- Cuando el flujo llegue a una pantalla de Google/Cloudflare/Auth0 que genere o revele un secret/token, detenerse y avisar al usuario antes de continuar. No generar ni rotar credenciales sin esa revisión.
- Las contraseñas de clientes y resellers las establece cada usuario mediante invitación/flujo hospedado de Auth0; no se guardan en el repositorio, Cloudflare vars ni D1 de la aplicación.

## Fases de trabajo

1. **Confirmar capacidades/costos y dominios**: tenant Auth0, método de Andrés, conexión de usuario/contraseña, callback OIDC de Access, hostname API same-site y política de acceso. No aceptar planes pagos/condiciones ni generar secretos sin avisar.
2. **Configurar identidad y sesión**: Auth0 Universal Login, Andrés como único administrador, auto-registro deshabilitado y login federado con Cloudflare Access para cuentas individuales.
3. **Cerrar el perímetro web**: aplicaciones Access para el host completo de Pages (incluido el inicio) y el hostname first-party de API; mismas conexiones IdP y allowlist global para SSO en todas las herramientas; proteger o redirigir aliases Pages y rechazar bypass directo a `workers.dev` desde el gateway.
4. **Autorización por rol/modelo**: middleware/Worker verifica identidad y permisos para páginas de modelo y cada API. Mantener guest demo solo si no permite cruzar el perímetro; eliminar bearer y clave de recuperación legibles por JavaScript.
5. **Consola de administración**: endpoints backend protegidos para invitar, asignar permisos, suspender y enviar restablecimientos; registrar auditoría. M2M Secret solo en Worker Secrets.
6. **Migración D1**: la base `digitaltwin-access-control` ya recibió `0001_access_control.sql` con autorización. La migración `0005_saved_studies.sql` de la biblioteca sigue sin aplicarse en D1 remoto. Inventariar datos locales antes de cualquier cambio; no borrar bases ni estudios. Definir una migración explícita de propietario anónimo a cuenta o dejar claro que no hay archivo productivo que migrar.
7. **Validación antes del despliegue productivo del demo**: en local probar gateway y cliente con aserciones simuladas; luego, con autorización, comprobar la cuenta administradora de Andrés, cuentas de contraseña, navegación entre varios modelos con una sola sesión, URLs directas, alias Pages, bypass `workers.dev`, revocación, expiración, CORS/CSRF, WebSocket, estudios y denegación en backend. `main` es producción; no hay staging configurado. No afirmar validación real hasta tener evidencia del proveedor y del servicio desplegado.

## Decisiones pendientes antes de crear cuentas

- La política está definida: Andrés es el único administrador; los usuarios no administradores reciben únicamente los permisos que él asigne por usuario/gemelo. Para resellers, la lectura de escenarios inicia habilitada; crear/editar escenarios requiere asignación expresa. No crear usuarios de prueba hasta desplegar y verificar API, consola y configuración de runtime.
- Queda pendiente confirmar la asociación activa de la Action de verificación al trigger Post Login y la decisión sobre Google junto con la conexión de usuarios invitados.
