# Despliegue en Cloudflare (CI/CD)

Cada push a `main` publica la galería web en **Cloudflare Pages** con el workflow `.github/workflows/deploy.yml`. No hace falta desplegar desde ninguna máquina propia: todo corre en GitHub Actions y los pasos de configuración se hacen una sola vez desde un navegador (sirve el del celular).

## Qué se publica y qué no
| Pieza | Estado |
|---|---|
| Galería de equipos en 3D (`index.html`) | Se publica. Ver y parametrizar cada equipo funciona. |
| Escena de planta (`plant.html`): salsas, inyección, acueducto | Se publica; **necesita la API** para simular y cargar la planta (ver abajo). |
| Panel del PLC del acueducto (`acueducto.html`) | Se publica completo: lee `data/acueducto-dia.json`, no usa la API. |
| API de simulación (`apps/api`, FastAPI + WebSocket) | **Fuera de este PR.** Es Python con numpy y WebSocket; no corre en Pages ni en Workers de Python. Opciones futuras: contenedor (Cloudflare Containers) o un VPS detrás de un túnel de Cloudflare. |

Sin base de datos por ahora.

## Pasos de una sola vez (en dash.cloudflare.com, cuenta Arvantti)
1. **Account ID.** Entra a la cuenta Arvantti, abre *Workers & Pages* y copia el **Account ID** del panel derecho (o de la URL: `dash.cloudflare.com/<ACCOUNT_ID>/...`).
2. **Token de API con permisos mínimos.** *Mi perfil → Tokens de API → Crear token → Crear token personalizado*:
   - Permiso: **Cuenta → Cloudflare Pages → Editar**. Nada más.
   - Recursos de la cuenta: *Incluir → Arvantti* (solo esa cuenta).
   - Opcional: caducidad (por ejemplo 1 año) y filtro de IP vacío.
   - Crear y **copiar el token ahora**: no se vuelve a mostrar.
3. **Secretos en GitHub.** En el repo: *Settings → Secrets and variables → Actions → New repository secret*. Crea dos:
   - `CLOUDFLARE_API_TOKEN` = el token del paso 2.
   - `CLOUDFLARE_ACCOUNT_ID` = el ID del paso 1.
4. **Primer despliegue.** *Actions → Deploy → Run workflow* (rama `main`). El workflow crea el proyecto de Pages `digitaltwin-arvantti` y publica. La dirección provisional queda en `https://digitaltwin-arvantti.pages.dev`.
5. **Subdominio.** En Cloudflare: *Workers & Pages → digitaltwin-arvantti → Custom domains → Set up a custom domain* → escribe `digitaltwin.arvantti.online`. Si el dominio `arvantti.online` está en la misma cuenta, Cloudflare crea el CNAME solo y emite el certificado; tarda unos minutos.

Mientras los secretos no existan, el workflow termina en verde con un aviso y no despliega.

## Seguridad
- **Rotación cada 30 días** (práctica del autor): crea un token nuevo con los mismos permisos, reemplaza el secreto `CLOUDFLARE_API_TOKEN` (en la organización, si es compartido) y borra el anterior en *Mi perfil → Tokens de API*. Usa caducidad de 30 días al crearlo para que no se te olvide.
- El token solo puede editar Pages de esa cuenta. Si se filtra, se revoca en *Mi perfil → Tokens de API*.
- Nunca pegues el token en el chat, en el código ni en `docs/registro/`.

## Cómo comprobar
- *Actions → Deploy* en verde y la URL `digitaltwin-arvantti.pages.dev` abre la galería; `/acueducto.html` muestra el panel.
