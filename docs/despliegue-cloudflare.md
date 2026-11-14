# Despliegue en Cloudflare (CI/CD)

Cada push a `main` publica la galería web en **Cloudflare Pages** con el workflow `.github/workflows/deploy.yml`. No hace falta desplegar desde ninguna máquina propia: todo corre en GitHub Actions y los pasos de configuración se hacen una sola vez desde un navegador (sirve el del celular).

## Qué se publica y qué no
| Pieza | Estado |
|---|---|
| Galería de equipos en 3D (`index.html`) | Se publica. Ver y parametrizar cada equipo funciona. |
| Consola de acceso (`access-admin.html`) y middleware Pages | Código local; requiere configurar y desplegar Access Control antes de habilitar la variable de runtime. |
| Escena de planta (`plant.html`): salsas, inyección, acueducto, aeropuerto, cajas | Se publica. El plano de cada planta va como archivo estático; **▶ SIMULAR** sin API reproduce una grabación de 15 min de la operación normal (`api/replays/{id}.json`, la genera `tools/deploy/export_static_plants.py` al desplegar). Escenarios, comandos y fallas necesitan la API (ver abajo). |
| PLC Master del acueducto (`plc.html?plant=water-network-scale-v1`) | Se publica como HMI; las señales, mandos y curvas de sesión requieren el emulador API. |
| API de simulación (`apps/twin-emulator-api`, FastAPI + WebSocket) | **Fuera de Pages.** Es Python con numpy y WebSocket; no corre en Pages ni en Workers de Python. El gateway Worker/Container descrito abajo la publica por HTTPS/WSS. `EMULATOR_API_URL` en GitHub Actions configura el endpoint público compilado para la galería; `?api=https://<host-del-gateway>` lo puede sustituir en pruebas. El Container no se expone directamente. |

En desarrollo local, perfiles e historian usan SQLite y la sesión vive en memoria. El Worker/Container de Acueducto ya está desplegado con D1 para perfiles, historian, comandos, estudios del emulador y checkpoints. También enruta a un Container Fractal separado; solo admite proyecciones asociadas a una sesión PLC propia y publica el resultado en D1. Salud, esquema PLC, sesión/WSS y proyección Fractal PLC-backed se verificaron contra Cloudflare; la galería modificada en este checkout aún requiere un despliegue Pages autorizado. Optimización sigue deshabilitada. CORS nunca se considera autenticación.

## Contenedores para frontend y emulador

El frontend compila con Node `26.12.1` (declarado también en `.node-version`, `package.json` y los workflows). Los `Containerfile` usan la raíz del repositorio como contexto y se ejecutan sin daemon, en modo rootless con Podman:

```bash
# Galería estática (Node 26 durante compilación)
podman build -f apps/gallery/Containerfile -t arvantti/gallery:node26 .
podman run --rm -p 8080:80 arvantti/gallery:node26

# Emulador FastAPI/WebSocket (Python 3.12)
podman build -f apps/twin-emulator-api/Containerfile -t arvantti/twin-emulator-api .
podman run --rm -p 8000:8000 \
  -e TWIN_CORS_ORIGINS=https://digitaltwin.arvantti.online \
  -v twin-data:/app/.twin-data:Z \
  arvantti/twin-emulator-api
```

```bash
# Fractal independiente (Python 3.12; lee tags y perfil desde el gateway PLC)
podman build -f apps/fractal-engineering-api/Containerfile -t arvantti/fractal-engineering-api .
podman run --rm -p 8100:8100 \
  -e FRACTAL_PLC_API_URL=http://host.containers.internal:8000 \
  arvantti/fractal-engineering-api
```

La HMI publicada apunta a ambos servicios con `?api=https://<host-del-emulador>&fractal=https://<host-fractal>`. Fractal usa `FRACTAL_PLC_API_URL` **interno** para obtener tags y perfil PLC y publicar el estudio; nunca acepta la copia de tags/perfil del navegador en `/studies/horizon/from-plc`. El estudio horario optimizado requiere sesión/perfil PLC del visitante y permanece como futuro no aplicado; el backend puede deshabilitarlo explícitamente con `FRACTAL_ENABLE_OPTIMIZATION=0`. La recomendación instantánea y las rutas de decisión/activación siguen bloqueadas en el gateway público. El proxy HTTPS delante de ambos APIs debe conservar la actualización WebSocket (`wss`). **El workflow Deploy solo publica la galería; no despliega las APIs ni configura un proxy.**

## Emulador en Cloudflare: Acueducto desplegado

Estado del código desplegado en `main`: la galería y el Worker Acueducto siguen con el modo demo previo; este código no identifica usuarios. En la rama local `feat/google-oauth-study-library` se implementan Access global y autorización por usuario/gemelo, pero no se han desplegado. La aplicación Cloudflare Access `DigitalTwin Gallery` sí fue creada y protege `digitaltwin.arvantti.online`; por ello, el borde puede pedir autenticación aunque la autorización de producto del backend aún no esté desplegada. El Worker limita la planta API a `water-network-scale-v1`, manda WSS al Container y bloquea mandos de optimización/decisión Fractal. Lee `apps/cloudflare-emulator-worker/README.md` para diseño y configuración.

D1 es el almacenamiento persistente obligatorio en Cloudflare; el disco efímero del Container no es una fuente de verdad. La base remota de Acueducto y sus migraciones están aplicadas, y su Worker está desplegado; su endpoint se configura mediante variables de entorno, no se documenta aquí. La base remota `digitaltwin-access-control` recibió `0001_access_control.sql` con autorización, y el Worker `apps/access-control-api` se desplegó el 2026-11-14 en `https://digitaltwin-access-control.andres-quiceno.workers.dev`. Su `/health` respondió OK y `/v1/me` sin identidad respondió 401. Falta cargar el secreto M2M y configurar `ACCESS_CONTROL_API_URL` en Pages/runtime; por tanto, la consola y la autorización por usuario/gemelo aún no están conectadas a la Gallery. La galería no se conecta directamente a URLs de Containers. Los checkpoints versionados usan pickle comprimido: la recuperación depende de compatibilidad de código y puede retroceder hasta 3600 segundos simulados. Quedan por medir costo, latencia, cuotas bajo carga, expiración y recuperación; el cierre WSS debe volver a comprobarse con una instancia recién iniciada. La variable Pages `EMULATOR_API_URL` configura el gateway compilado. Para activar Access en el gateway, Gallery requiere `EMULATOR_ACCESS_ENABLED=true`; el Worker requiere `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` y `EMULATOR_API_DOMAIN` en Actions. `ACCESS_AUD` puede ser una lista separada por comas de los audience IDs de las aplicaciones Access de Gallery y API; todos deben compartir las mismas políticas/allowlist. La autorización por asignaciones requiere desplegar `apps/access-control-api` y configurar `ACCESS_CONTROL_API_URL` en runtime de Pages y del Worker Acueducto. La consola usa el relay same-origin `/api/access`; Pages reenvía solo la aserción firmada de Access y nunca cookies/bearers. El Worker Access Control necesita `AUTH0_DOMAIN`, conexión Auth0 Database, `AUTH0_MANAGEMENT_CLIENT_ID` y el secreto M2M guardado como secret, más `ACCESS_CONTROL_ADMIN_SUBJECTS` con el `sub` verificado del único administrador. Cloudflare Access protege la Gallery; falta configurar/validar los aliases y los hostnames first-party de las APIs antes de activar el gateway. El workflow backend `.github/workflows/deploy-acueducto-emulator.yml` es manual y aplica migraciones D1; **no ejecutarlo sin aprobación explícita**. `deploy.yml` publica Pages automáticamente desde `main`; los cambios locales todavía no se han desplegado.

## Pendiente antes de activar autenticación

La consola y el relay Pages aún no están conectados en producción. El gateway Acueducto es el único API con integración de permisos; los demás APIs necesitan adaptadores antes de otorgarles acceso. El middleware Pages protege rutas estáticas y hace relay de la consola solo cuando recibe `ACCESS_CONTROL_API_URL`. El D1, la aplicación Access de Gallery y el Worker de control ya existen; faltan el secreto M2M, la configuración de runtime, conectar Acueducto y probar integralmente acceso/revocación. No desplegar Pages ni otros Workers ni aplicar migraciones adicionales sin autorización explícita.

## Pasos de una sola vez (en dash.cloudflare.com, cuenta Arvantti)
1. **Account ID.** Entra a la cuenta Arvantti, abre *Workers & Pages* y copia el **Account ID** del panel derecho (o de la URL: `dash.cloudflare.com/<ACCOUNT_ID>/...`).
2. **Token de API con permisos mínimos.** *Mi perfil → Tokens de API → Crear token → Crear token personalizado*:
   - Permisos mínimos requeridos para Pages: **Cuenta → Cloudflare Pages → Editar**. Para el emulador, agrega **Containers → Read y Edit**, Workers Scripts, Durable Objects y D1 (Edit), todos limitados a la cuenta del proyecto. Añade permisos de custom domains/routes solo si `EMULATOR_API_DOMAIN` se configura. No agregues R2, KV o Tunnel si el workflow no los usa.
   - Recursos de la cuenta: *Incluir → Arvantti* (solo esa cuenta).
   - Caducidad de 90 días y filtro de IP vacío.
   - Crear y **copiar el token ahora**: no se vuelve a mostrar.
3. **Secretos en GitHub.** En el repo: *Settings → Secrets and variables → Actions → New repository secret*. Crea dos:
   - `CLOUDFLARE_API_TOKEN` = el token del paso 2.
   - `CLOUDFLARE_ACCOUNT_ID` = el ID del paso 1.
4. **Pages.** *Actions → Deploy → Run workflow* (o push a `main`). El workflow crea el proyecto de Pages `digitaltwin-arvantti` y publica. Configura `EMULATOR_API_URL` con el hostname HTTPS del gateway. Mantén `EMULATOR_ACCESS_ENABLED` vacío/false mientras la autenticación no esté configurada; solo después de crear y validar las políticas globales establece `true` y vuelve a desplegar Pages.
5. **Subdominio.** En Cloudflare: *Workers & Pages → digitaltwin-arvantti → Custom domains → Set up a custom domain* → escribe `digitaltwin.arvantti.online`. Si el dominio `arvantti.online` está en la misma cuenta, Cloudflare crea el CNAME solo y emite el certificado; tarda unos minutos.

Mientras los secretos no existan, el workflow termina en verde con un aviso y no despliega.

## Seguridad
- **Rotación cada 90 días** (caducidad del token): crea un token nuevo con los mismos permisos, reemplaza el secreto `CLOUDFLARE_API_TOKEN` (en la organización, si es compartido) y borra el anterior en *Mi perfil → Tokens de API*. Anótalo en el calendario unos días antes de que caduque.
- El token solo actúa sobre la cuenta Arvantti y con los permisos listados. Si se filtra, se revoca en *Mi perfil → Tokens de API*.
- Nunca pegues el token en el chat, en el código ni en `docs/registro/`.

## Cómo comprobar
- *Actions → Deploy* en verde y la URL `digitaltwin-arvantti.pages.dev` abre la galería; el PLC Master abre en `/plc.html?plant=water-network-scale-v1`.
