# Gateway público del emulador hidráulico

Este Worker expone la demo de `water-network-scale-v1` a la galería pública sin pedir cuenta de usuario. Emite una capacidad anónima firmada y temporal, limita el tráfico y asocia cada sesión de simulación a esa capacidad en D1. Esto **no identifica visitantes** ni impide toda automatización: las cuotas reducen abuso, pero no sustituyen autenticación humana. El servicio es un modelo virtual, sin conexión a un PLC físico.

## Arquitectura y límites

- Pages aloja la galería; este Worker es el único endpoint público de la API. No publicar URLs de Containers.
- El gateway permite solo `water-network-scale-v1`; D1 conserva perfiles, historian, estudios, auditoría y checkpoints. SQLite es únicamente para desarrollo local.
- Las rutas de API requieren una capacidad Bearer anónima emitida por `POST /api/demo/session`; `/api/health` es público y limitado. WebSocket usa dos subprotocolos: el token viaja al Worker y el Container recibe únicamente `arvantti-demo`.
- Las clases de Container usan la API nativa de Containers dentro de Durable Objects, con `scheduling_policy: durable_object`, imagen fijada por digest y `standard-1`. El acceso a Internet está deshabilitado: solo se intercepta HTTPS al Worker para el bridge D1; el proxy rechaza otros hosts y rutas. No cambiar la política de scheduling ni exponer el Container directamente.
- La capacidad vence a las 12 h. La sesión vence a las 2 h, cada visitante puede crear 2 y el gateway limita a 10 sesiones retenidas simultáneamente. Se eliminan datos asociados a visitantes vencidos al emitir nuevas capacidades.
- Límite Worker: 10 emisiones/min/IP, 120 llamadas API/min/IP y por capacidad, y 10 solicitudes Fractal/min/IP y por capacidad. Mandos WebSocket PLC: hasta 30 mensajes/s, una conexión PLC operativa por sesión. La API detiene la simulación PLC al cerrar la conexión en pruebas locales; verifica ese comportamiento a través del relay WSS antes de darlo por garantizado en Cloudflare.
- Las acciones de decisión/activación Fractal y los estudios de optimización no están disponibles; optimización permanece deshabilitada. Perfiles editables se aíslan por capacidad anónima.
- `/_internal/d1` solo acepta el secreto de bridge. `/_admin/*` deniega por defecto; puede protegerse además con Cloudflare Access. CORS solo controla lectura desde navegadores, **no es autenticación**.

Los límites son defensas de abuso, no una garantía de costo máximo ni de continuidad. Vigilar consumo/cuotas y ajustar límites en Cloudflare después de medir carga real. La demo abierta permite a cualquier visitante anónimo que llegue al gateway crear una sesión hasta alcanzar las cuotas globales; si el presupuesto no admite ese riesgo, no publicar el endpoint todavía o añadir Turnstile/WAF.

## Recursos Cloudflare requeridos

- Workers Paid/Containers, Durable Objects y D1 habilitados; revisar costes, límites y compatibilidad en la cuenta antes de publicar.
- Cuenta/subdominio `workers.dev`; opcionalmente un hostname propio HTTPS para el gateway. No se asume que exista ningún dominio o recurso.
- GitHub Actions con un API token de privilegios mínimos, `CLOUDFLARE_ACCOUNT_ID` y los secretos/variables descritos abajo.
- Docker Buildx en Actions. El Worker no expone el Container directamente.

## Provisionamiento y despliegue

Desde la raíz del repo:

1. Provisionar D1: `pnpm --filter @twin/cloudflare-emulator-worker exec wrangler d1 create acueducto-emulator --config ../../wrangler.acueducto.jsonc`. Configurar localmente el identificador devuelto en `wrangler.acueducto.jsonc`; no copiarlo a documentación, capturas ni notas.
2. Configurar GitHub Actions secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `D1_BRIDGE_TOKEN` (aleatorio, 32 bytes o más) y `DEMO_TOKEN_SECRET` (aleatorio, al menos 32 caracteres). No pegarlos en el repositorio, navegador ni chat.
3. Configurar GitHub Actions variables: `D1_GATEWAY_ORIGIN` (origen HTTPS `workers.dev` del mismo Worker), `CORS_ORIGINS` (orígenes exactos de Pages, actualmente `https://digitaltwin.arvantti.online,https://digitaltwin-arvantti.pages.dev`) y, opcionalmente, `EMULATOR_API_DOMAIN` (hostname propio HTTPS del Worker). Mantener `D1_GATEWAY_ORIGIN` en `workers.dev` porque lo usa el bridge interno Container→Worker→D1. Para Access administrativo opcional, configurar juntas `ACCESS_TEAM_DOMAIN` y `ACCESS_AUD` y crear una aplicación Access limitada a `/_admin/*`; no proteger el hostname completo que usa la galería.
4. Tras el primer despliegue, configurar también la variable Pages `EMULATOR_API_URL` con el endpoint HTTPS público del Worker. El workflow Pages la compila como `VITE_EMULATOR_API_URL`; el parámetro `?api=` puede sustituirlo para pruebas. Sin esta variable, la HMI buscará la API en el origen de Pages.
5. Ejecutar manualmente `Actions → Deploy acueducto emulator → Run workflow` en `main`. El workflow valida placeholders, corre pruebas, aplica migraciones D1, carga secretos y despliega Worker/Containers. Para Pages, `Actions → Deploy` publica la galería con el endpoint configurado.
6. Comprobar `/_worker/health`, `POST /api/demo/session` desde el origen Pages, `/api/health`, crear sesión, conexión WSS PLC y espectador 3D, aislamiento con otra capacidad, perfiles, proyección Fractal de solo lectura y persistencia tras dormir/reiniciar Container. Probar explícitamente cuotas, recuperación y eliminación de sesiones vencidas. No aceptar despliegue como validado hasta hacer estas pruebas con D1/Containers remotos.

El workflow se ejecuta solo a demanda, no con cada push. Los nombres/URLs placeholder son intencionales; el despliegue falla antes de publicar si `database_id` o los secretos no están configurados. Ninguna URL de Container ni credencial se debe incluir en JavaScript.

## Desarrollo local y validaciones

- Desarrollo local de FastAPI usa SQLite; no defina `TWIN_DATA_BACKEND`.
- `pnpm --filter @twin/cloudflare-emulator-worker typecheck`
- `pnpm --filter @twin/cloudflare-emulator-worker test`
- `pnpm --filter @twin/cloudflare-emulator-worker exec wrangler d1 migrations apply acueducto-emulator --local --config ../../wrangler.acueducto.jsonc`
- `pnpm --filter @twin/cloudflare-emulator-worker exec wrangler deploy --dry-run --containers-rollout=none --config ../../wrangler.acueducto.jsonc`
- El build completo de Container/despliegue requiere Docker Buildx y recursos/secretos Cloudflare reales.

Los checkpoints internos usan pickle comprimido y versión de esquema. Restaurar exige compatibilidad de clases/modelo. El Container puede dormir tras 10 minutos inactivo. La continuidad/retroceso, comportamiento de desconexión WSS, latencia, costos y recuperación requieren seguimiento en Cloudflare antes de presentar la demo como servicio confiable.
