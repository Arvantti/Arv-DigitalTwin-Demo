# Despliegue en Cloudflare (CI/CD)

Cada push a `main` publica la galería web en **Cloudflare Pages** con el workflow `.github/workflows/deploy.yml`. No hace falta desplegar desde ninguna máquina propia: todo corre en GitHub Actions y los pasos de configuración se hacen una sola vez desde un navegador (sirve el del celular).

## Qué se publica y qué no
| Pieza | Estado |
|---|---|
| Galería de equipos en 3D (`index.html`) | Se publica. Ver y parametrizar cada equipo funciona. |
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

La HMI publicada apunta a ambos servicios con `?api=https://<host-del-emulador>&fractal=https://<host-fractal>`. Fractal usa `FRACTAL_PLC_API_URL` **interno** para obtener tags y perfil PLC y publicar el estudio; nunca acepta la copia de tags/perfil del navegador en `/studies/horizon/from-plc`. Por defecto la optimización está deshabilitada (`FRACTAL_ENABLE_OPTIMIZATION=0`) hasta validar el horizonte. El proxy HTTPS delante de ambos APIs debe conservar la actualización WebSocket (`wss`). **El workflow Deploy solo publica la galería; no despliega las APIs ni configura un proxy.**

## Emulador en Cloudflare: Acueducto desplegado

El gateway está en `apps/cloudflare-emulator-worker/` y su configuración en `wrangler.acueducto.jsonc`. La galería queda pública y sin login; el Worker emite capacidades anónimas temporales, limita solicitudes y aísla sesiones por visitante. Eso no identifica humanos ni impide toda automatización. Rutas `/api` requieren capacidad salvo health; el Worker solo permite `water-network-scale-v1`, manda WSS al Container y bloquea mandos de optimización/decisión Fractal. Access no se pone delante de la galería; puede proteger rutas administrativas. Lee `apps/cloudflare-emulator-worker/README.md` para recursos, límites y configuración. Los nombres y hosts placeholder no crean DNS ni bases.

D1 es el almacenamiento persistente obligatorio en Cloudflare; el disco efímero del Container no es una fuente de verdad. La base remota y sus migraciones están aplicadas, y el Worker de Acueducto está desplegado; su endpoint se configura mediante variables de entorno, no se documenta aquí. La galería no se conecta directamente a URLs de Containers. Los checkpoints versionados usan pickle comprimido: la recuperación depende de compatibilidad de código y puede retroceder hasta 3600 segundos simulados. Quedan por medir costo, latencia, cuotas bajo carga, expiración y recuperación; el cierre WSS debe volver a comprobarse con una instancia recién iniciada. La variable Pages `EMULATOR_API_URL` está preparada en GitHub, pero los cambios locales de la galería no se han publicado: se requiere el próximo despliegue autorizado de Pages. El workflow backend `.github/workflows/deploy-acueducto-emulator.yml` es manual; `deploy.yml` sigue publicando solo Pages.

## Pasos de una sola vez (en dash.cloudflare.com, cuenta Arvantti)
1. **Account ID.** Entra a la cuenta Arvantti, abre *Workers & Pages* y copia el **Account ID** del panel derecho (o de la URL: `dash.cloudflare.com/<ACCOUNT_ID>/...`).
2. **Token de API con permisos mínimos.** *Mi perfil → Tokens de API → Crear token → Crear token personalizado*:
   - Permisos mínimos requeridos para Pages: **Cuenta → Cloudflare Pages → Editar**. Para el despliegue opcional del emulador, agrega Workers Scripts, Workers Containers, Durable Objects y D1 (Edit) y únicamente los permisos de custom domains/routes si `EMULATOR_API_DOMAIN` los usa. No agregues R2, KV o Tunnel si el workflow no los usa.
   - Recursos de la cuenta: *Incluir → Arvantti* (solo esa cuenta).
   - Caducidad de 90 días y filtro de IP vacío.
   - Crear y **copiar el token ahora**: no se vuelve a mostrar.
3. **Secretos en GitHub.** En el repo: *Settings → Secrets and variables → Actions → New repository secret*. Crea dos:
   - `CLOUDFLARE_API_TOKEN` = el token del paso 2.
   - `CLOUDFLARE_ACCOUNT_ID` = el ID del paso 1.
4. **Primer despliegue Pages.** *Actions → Deploy → Run workflow* (rama `main`). El workflow crea el proyecto de Pages `digitaltwin-arvantti` y publica. La dirección provisional queda en `https://digitaltwin-arvantti.pages.dev`. Para conectar el backend, crea la variable Pages `EMULATOR_API_URL` con el endpoint Worker HTTPS y vuelve a desplegar Pages.
5. **Subdominio.** En Cloudflare: *Workers & Pages → digitaltwin-arvantti → Custom domains → Set up a custom domain* → escribe `digitaltwin.arvantti.online`. Si el dominio `arvantti.online` está en la misma cuenta, Cloudflare crea el CNAME solo y emite el certificado; tarda unos minutos.

Mientras los secretos no existan, el workflow termina en verde con un aviso y no despliega.

## Seguridad
- **Rotación cada 90 días** (caducidad del token): crea un token nuevo con los mismos permisos, reemplaza el secreto `CLOUDFLARE_API_TOKEN` (en la organización, si es compartido) y borra el anterior en *Mi perfil → Tokens de API*. Anótalo en el calendario unos días antes de que caduque.
- El token solo actúa sobre la cuenta Arvantti y con los permisos listados. Si se filtra, se revoca en *Mi perfil → Tokens de API*.
- Nunca pegues el token en el chat, en el código ni en `docs/registro/`.

## Cómo comprobar
- *Actions → Deploy* en verde y la URL `digitaltwin-arvantti.pages.dev` abre la galería; el PLC Master abre en `/plc.html?plant=water-network-scale-v1`.
