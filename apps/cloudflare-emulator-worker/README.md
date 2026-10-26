# Worker/Container del emulador hidráulico

Este paquete despliega el gateway del acueducto. El Worker valida Cloudflare Access, restringe las plantas permitidas, termina HTTP/WebSocket y expone al Container un bridge D1 autenticado. El Container Python usa SQLite solo fuera de Cloudflare; en el despliegue, perfiles, historian, estudios, comandos, bitácora de auditoría y checkpoints se guardan en D1. No publicar la HMI apuntando a este servicio hasta completar los secretos y probar la política Access.

## Recursos y requisitos

- Cuenta Cloudflare con Workers Containers, D1 y Durable Objects habilitados; costes/cuotas deben revisarse en esa cuenta antes de publicar.
- Docker CLI y daemon local (para `wrangler deploy`, también en dry-run normal), o un runner CI con Docker.
- Un host HTTPS para el API, otro host de galería y un Cloudflare Access self-hosted application para el API. No se presupone que existan esos dominios.
- Acceso a la cuenta para crear D1, definir dominios/Access y cargar secretos. CORS no autentica.

## Primer despliegue (manual y aún privado)

Desde la raíz del repo:

1. Crear D1 con Wrangler: `pnpm --filter @twin/cloudflare-emulator-worker exec wrangler d1 create acueducto-emulator --config ../../wrangler.acueducto.jsonc`. Copiar el `database_id` que informa y sustituir el placeholder en `wrangler.acueducto.jsonc`.
2. En el panel Cloudflare, obtener el subdominio Workers de la cuenta y formar `https://acueducto-emulator-api.<subdominio>.workers.dev`. Crear el Access application para el host custom del API, con política de usuarios autorizados; guardar el team domain y el Audience (AUD) como variables de GitHub Actions (o en el archivo Wrangler para despliegue local). El dominio debe pertenecer a una zona activa de la cuenta.
3. Configurar `D1_GATEWAY_ORIGIN` con esa URL `workers.dev` y `CORS_ORIGINS` con el origen exacto de la galería. **El bridge Container→D1 usa `workers.dev`**, que no debe pasar por Access; las rutas públicas validan JWT Access en el Worker aun si alguien usa `workers.dev` directamente.
4. La galería envía cookies de credenciales; el enlace «INICIAR SESIÓN API» abre `/api/health` para completar el login antes de volver a la HMI. El workflow asocia el Worker al host configurado en `EMULATOR_API_DOMAIN`.
5. Cargar secreto aleatorio sin imprimirlo en consola ni guardarlo en el repo: `openssl rand -hex 32 | pnpm --filter @twin/cloudflare-emulator-worker exec wrangler secret put D1_BRIDGE_TOKEN --config ../../wrangler.acueducto.jsonc`.
6. Aplicar el esquema y desplegar desde la raíz: `pnpm --filter @twin/cloudflare-emulator-worker exec wrangler d1 migrations apply acueducto-emulator --remote --config ../../wrangler.acueducto.jsonc`, luego `pnpm --filter @twin/cloudflare-emulator-worker exec wrangler deploy --config ../../wrangler.acueducto.jsonc --domain <host-custom-del-api>`.
7. Verificar `/_worker/health`, login Access, preflight con credenciales desde el origen configurado, `/api/health`, perfil, sesión WebSocket, persistencia tras reinicio y restauración de checkpoint. La URL pública para la HMI es `?api=https://<custom-host-api>`.

El archivo `wrangler.acueducto.jsonc` tiene valores placeholder intencionales; no desplegarlo tal cual. La migración D1 es versionada en `migrations/`. El gateway bridge interno solo acepta el Bearer secreto y no registra sentencias ni valores. La auditoría registra acciones con `actor_id=operator` (aún no vincula cada evento con una identidad Access individual) y se consulta mediante `GET /api/plants/{plant_id}/audit-events?limit=100`. El Worker separa el tráfico de cada servicio y permite solo `water-network-scale-v1`.

## Despliegue manual desde GitHub Actions

El workflow `.github/workflows/deploy-acueducto-emulator.yml` solo se ejecuta a demanda en `main` (`Actions → Deploy acueducto emulator → Run workflow`). Antes, provisiona D1, Access y dominio; completa el `database_id` en `wrangler.acueducto.jsonc`. Configura estos repository secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `D1_BRIDGE_TOKEN`. Configura estas variables: `D1_GATEWAY_ORIGIN` (URL workers.dev del mismo Worker, para el bridge interno), `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `CORS_ORIGINS` (origen exacto Pages) y `EMULATOR_API_DOMAIN` (host HTTPS protegido por Access). El token Cloudflare requiere permisos mínimos para Workers/Containers, Durable Objects, D1 y DNS/custom domains. El workflow aplica migraciones, carga el bearer secreto y construye/despliega Worker + Container; no corre automáticamente al hacer push.

Antes del primer despliegue, conoce el subdominio `workers.dev` de la cuenta, configura Access para el host custom y carga las variables/secrets indicados. Si recursos, permisos o secretos no están provisionados, el workflow falla antes del despliegue.

## Desarrollo y pruebas

- Backend local: no definir `TWIN_DATA_BACKEND`; el emulador usa SQLite.
- `pnpm --filter @twin/cloudflare-emulator-worker test`
- `pnpm --filter @twin/cloudflare-emulator-worker typecheck`
- Validación del bundle Worker (no construye la imagen): `pnpm --filter @twin/cloudflare-emulator-worker exec wrangler deploy --dry-run --containers-rollout=none --config ../../wrangler.acueducto.jsonc`.
- Build/deploy completo requiere Docker, Cloudflare credentials, `database_id`, Access y secretos; solo se ejecuta mediante el workflow manual de Cloudflare, nunca automáticamente con un push.

Los checkpoints usan pickle comprimido y `schema_version=1`, aceptado solo desde D1 detrás del bridge de servicio; cualquier cambio de clases/modelo que rompa compatibilidad requiere migración/versionado antes de reanudar sesiones antiguas. El Container duerme tras 10 min sin actividad: al reconectar el rol PLC se reanuda desde el último checkpoint, con posible retroceso de hasta 3600 segundos simulados (y cambios de mando siempre checkpointados inmediatamente). Esta cadencia/recuperación debe medirse con la imagen y D1 reales antes de declarar continuidad de operación.
