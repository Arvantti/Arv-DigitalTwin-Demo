# Despliegue en Cloudflare (CI/CD)

Cada push a `main` publica la galería web en **Cloudflare Pages** con el workflow `.github/workflows/deploy.yml`. No hace falta desplegar desde ninguna máquina propia: todo corre en GitHub Actions y los pasos de configuración se hacen una sola vez desde un navegador (sirve el del celular).

## Qué se publica y qué no
| Pieza | Estado |
|---|---|
| Galería de equipos en 3D (`index.html`) | Se publica. Ver y parametrizar cada equipo funciona. |
| Escena de planta (`plant.html`): salsas, inyección, acueducto, aeropuerto, cajas | Se publica. El plano de cada planta va como archivo estático; **▶ SIMULAR** sin API reproduce una grabación de 15 min de la operación normal (`api/replays/{id}.json`, la genera `tools/deploy/export_static_plants.py` al desplegar). Escenarios, comandos y fallas necesitan la API (ver abajo). |
| PLC Master del acueducto (`plc.html?plant=water-network-scale-v1`) | Se publica como HMI; las señales, mandos y curvas de sesión requieren el emulador API. |
| API de simulación (`apps/twin-emulator-api`, FastAPI + WebSocket) | **Fuera de Pages.** Es Python con numpy y WebSocket; no corre en Pages ni en Workers de Python. Opciones: contenedor (Cloudflare Containers) o un VPS detrás de un túnel de Cloudflare. La HMI publicada se abre con `plc.html?plant=water-network-scale-v1&api=https://<host-del-emulador>`; el host debe exponer HTTPS/WSS y definir `TWIN_CORS_ORIGINS=https://digitaltwin.arvantti.online` (más los dominios autorizados). |

La sesión, el historiador y los estudios usan SQLite local en el volumen del emulador. Pages solo publica archivos estáticos: para proyectar desde PLC se necesitan **ambas APIs** desplegadas aparte (emulador y Fractal).

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

## Pasos de una sola vez (en dash.cloudflare.com, cuenta Arvantti)
1. **Account ID.** Entra a la cuenta Arvantti, abre *Workers & Pages* y copia el **Account ID** del panel derecho (o de la URL: `dash.cloudflare.com/<ACCOUNT_ID>/...`).
2. **Token de API con permisos mínimos.** *Mi perfil → Tokens de API → Crear token → Crear token personalizado*:
   - Permiso mínimo: **Cuenta → Cloudflare Pages → Editar**. Si ya vas a desplegar el backend, agrega también Workers Scripts, D1, R2, KV y Tunnel (cada uno con Edit) y, sobre el dominio, DNS y Workers Routes.
   - Recursos de la cuenta: *Incluir → Arvantti* (solo esa cuenta).
   - Caducidad de 90 días y filtro de IP vacío.
   - Crear y **copiar el token ahora**: no se vuelve a mostrar.
3. **Secretos en GitHub.** En el repo: *Settings → Secrets and variables → Actions → New repository secret*. Crea dos:
   - `CLOUDFLARE_API_TOKEN` = el token del paso 2.
   - `CLOUDFLARE_ACCOUNT_ID` = el ID del paso 1.
4. **Primer despliegue.** *Actions → Deploy → Run workflow* (rama `main`). El workflow crea el proyecto de Pages `digitaltwin-arvantti` y publica. La dirección provisional queda en `https://digitaltwin-arvantti.pages.dev`.
5. **Subdominio.** En Cloudflare: *Workers & Pages → digitaltwin-arvantti → Custom domains → Set up a custom domain* → escribe `digitaltwin.arvantti.online`. Si el dominio `arvantti.online` está en la misma cuenta, Cloudflare crea el CNAME solo y emite el certificado; tarda unos minutos.

Mientras los secretos no existan, el workflow termina en verde con un aviso y no despliega.

## Seguridad
- **Rotación cada 90 días** (caducidad del token): crea un token nuevo con los mismos permisos, reemplaza el secreto `CLOUDFLARE_API_TOKEN` (en la organización, si es compartido) y borra el anterior en *Mi perfil → Tokens de API*. Anótalo en el calendario unos días antes de que caduque.
- El token solo actúa sobre la cuenta Arvantti y con los permisos listados. Si se filtra, se revoca en *Mi perfil → Tokens de API*.
- Nunca pegues el token en el chat, en el código ni en `docs/registro/`.

## Cómo comprobar
- *Actions → Deploy* en verde y la URL `digitaltwin-arvantti.pages.dev` abre la galería; el PLC Master abre en `/plc.html?plant=water-network-scale-v1`.
