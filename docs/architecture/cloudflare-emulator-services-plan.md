# Plan de servicios de emulación en Cloudflare

> Estado: Worker/Containers de Acueducto y D1 desplegados. Se verificaron salud, sesiones anónimas aisladas, WSS PLC y una proyección Fractal PLC-backed en Cloudflare; quedan pendientes la publicación de la galería modificada y la comprobación de cierre WSS tras renovar la instancia.
> Alcance inicial: gemelo digital del acueducto (`water-network-scale-v1`).
> Regla: el emulador y toda la HMI son simulados; no hay conexión ni escritura a infraestructura física.

## 1. Objetivo

Publicar los servicios del gemelo digital en Cloudflare sin confundir cuatro responsabilidades ni sus estados:

1. **Disponibilidad del servicio emulador**: despliegue y salud de la API del gemelo elegido.
2. **Sesión de simulación**: crear, iniciar, pausar/reanudar y detener una ejecución hidráulica del emulador.
3. **Proyección Fractal**: solicitar un estudio futuro independiente y no aplicado.
4. **Optimización**: proceso diferente de una proyección; permanece deshabilitado hasta completar sus validaciones y autorización explícita.

La galería estática ya publicada en Cloudflare Pages es solo el frontend. Que Pages abra no significa que el emulador esté desplegado ni que haya una sesión en ejecución.

## Estado de implementación

- Implementado en el repo: `apps/cloudflare-emulator-worker/` (Worker, Container bindings, allowlist, capacidades anónimas HMAC, cuotas por IP/capacidad, aislamiento de sesiones, expiración/limpieza, CORS y bridge D1), migraciones D1, `wrangler.acueducto.jsonc`, Dockerfiles, adaptador SQLite/D1, historian/perfiles/estudios del emulador y checkpoints versionados.
- Implementado en la galería: cliente HTTP/WSS de capacidad anónima; endpoint Worker configurable mediante `EMULATOR_API_URL`/`VITE_EMULATOR_API_URL` o `?api=`. Los enlaces públicos no contienen secretos ni apuntan directamente a Containers.
- Validado localmente: typecheck y pruebas del Worker; suite Python, migraciones D1 locales, build/typecheck de Gallery y dry-run Wrangler. En Cloudflare se comprobó `/api/health`, bootstrap/CORS, schema y perfiles PLC, creación/aislamiento de sesiones, handshake WSS y proyección Fractal PLC-backed; D1 persiste tras reiniciar el Container.
- Desplegados D1 remoto, Worker y Containers con imágenes fijadas por digest; no se exponen URLs directas de Container. La galería modificada todavía no está publicada porque requiere el despliegue Pages autorizado.
- Pendiente: comprobar el auto-stop al cerrar WSS tras renovar la instancia, medir costos/cuotas/latencia y completar pruebas de expiración y recuperación. Los eventos de ciclo de sesión aún usan actor genérico `operator`; las mutaciones de perfiles registran el id anónimo efímero, no una identidad humana.
- Fractal (`apps/fractal-engineering-api`) se ejecuta en un Container separado y sin estado persistente local. La ruta pública solo permite estudios PLC-backed y los almacena en la sesión PLC/D1 mediante el Worker; vistas previas de perfil son transitorias. La optimización sigue deshabilitada.
- Los checkpoints almacenan el objeto hidráulico Python con pickle comprimido y schema version. Son datos internos de D1 vía bearer bridge; recuperar exige compatibilidad de clases y pruebas. La sesión se reanuda en el siguiente websocket PLC, no corre durante el sueño del Container; el intervalo es 3600 s simulados y puede causar retroceso.

## 2. Arquitectura objetivo

```text
Navegador
  └── Cloudflare Pages: digitaltwin.arvantti.online (HTML/CSS/JS y escenas)
        └── Worker/API Gateway: HTTPS, autenticación, selección del servicio y WebSocket
              ├── Durable Object/router del acueducto
              │     └── Cloudflare Container: FastAPI + twin-runtime + modelo hidráulico
              ├── [futuro] Durable Object/router de manufactura de plásticos
              │     └── [futuro] Cloudflare Container de plásticos
              └── [separado] API/Container Fractal

Datos persistentes: **Cloudflare D1** es la fuente de verdad para perfiles, historian, auditoría y checkpoints de sesión; no el disco temporal del Container.
```

- **Cloudflare Pages** conserva la responsabilidad de alojar la galería. Su workflow actual no despliega el backend.
- **Cloudflare Worker** es puerta de entrada y proxy/orquestador; no ejecuta por sí solo el runtime Python ni reemplaza al emulador.
- **Cloudflare Containers** ejecuta la imagen existente de FastAPI/Python 3.12 (`apps/twin-emulator-api/Containerfile`). El Container procesa la simulación, pero sus archivos locales pueden borrarse cuando se reinicia.
- **Durable Objects** pueden usarse para enrutamiento estable por servicio/sesión y coordinación de ciclo de vida/WebSockets; no serán el almacenamiento de verdad, que será D1.
- El servicio Fractal sigue siendo independiente. Su conexión a PLC es de lectura del estado autorizado; no comparte el ciclo de arranque del emulador ni el de la simulación.

### Identidad y rutas por gemelo

Cada servicio tendrá identidad, lista permitida de plantas, endpoint, configuración, aislamiento de acceso y datos propios. Ejemplo:

| Gemelo | Servicio | Endpoint ilustrativo | Plantas permitidas |
|---|---|---|---|
| Acueducto | `emulator-acueducto` | `https://acueducto-api.arvantti.online` | `water-network-scale-v1` |
| Manufactura de plásticos | `emulator-plasticos` | `https://plasticos-api.arvantti.online` | identificadores declarados para ese gemelo |

Los nombres y dominios son ejemplos, no DNS ni servicios ya creados. La URL de la galería especificará el endpoint correspondiente mediante el parámetro existente `api`, por ejemplo:

```text
https://digitaltwin.arvantti.online/plant.html?plant=water-network-scale-v1&api=https://acueducto-api.arvantti.online
https://digitaltwin.arvantti.online/plant.html?plant=plastic-injection-plant-v1&api=https://plasticos-api.arvantti.online
```

El Worker puede ser común y enrutar por hostname/identidad de servicio; cada Container se despliega con una lista de plantas permitidas. El API actual carga múltiples modelos, por lo que no basta con duplicar el Container: hay que implementar y probar ese allowlist para evitar que un endpoint atienda accidentalmente plantas de otro gemelo.

Se conservarán los contratos existentes (`/api/plants/{plant_id}/...`, `/api/health` y WebSockets). El Worker reenviará rutas, métodos, cuerpos, códigos y cabeceras sin inventar mandos ni alterar el protocolo.

## 3. Separación de estados y acciones

Aquí «separar» no significa que haya que desplegar tres plataformas ni duplicar código. Significa que el sistema muestra estados distintos y que cada botón/API hace solo su trabajo: servicio disponible, sesión simulando, estudio Fractal calculado u optimización ejecutándose. Arrancar uno no debe arrancar los otros.

| Ciclo | Acción | Responsable | Efecto y límites |
|---|---|---|---|
| Servicio emulador | Desplegar/arrancar/consultar salud del servicio | Infraestructura/administrador | Pone disponible la API del gemelo. No crea sesión ni inicia hidráulica. En Containers, una petición puede despertar el Container automáticamente; eso no significa que el PLC esté simulando. |
| Simulación | Crear sesión (`POST .../sessions`), conectar el WebSocket del rol PLC para iniciarla, pausar/reanudar por el protocolo vigente y detenerla (`POST .../stop`) | Operador PLC de la demo | Ejecuta una instancia del modelo hidráulico y emite señales PLC. El WebSocket inicia la sesión para evitar ciclos anónimos huérfanos; no despliega el backend, no inicia Fractal y no optimiza. |
| Proyección Fractal | Solicitar estudio base/alternativo | Operador/flujo de análisis autorizado | Lee el estado y perfil válidos de la sesión; produce futuro simulado `NO APLICADO`. No manda órdenes ni inicia optimización. |
| Optimización | Acción explícita y separada, aún no disponible en operación | Rol autorizado, tras compuerta de seguridad | Permanece apagada hasta validar dependencias hidráulicas, restricciones, autorización y revisión humana. Nunca se dispara automáticamente al arrancar otro ciclo. |

La HMI mostrará **salud del servicio** y **estado de la sesión** en componentes distintos. El botón «Iniciar simulación» solo actúa sobre la sesión. El estado/arranque del Container no se presentará como «simulación en curso». Una optimización no se presentará como proyección ni como recomendación normal.

## 4. Bloqueadores de persistencia y continuidad

Cloudflare documenta que el disco local de Containers es efímero. Al dormir, la siguiente instancia parte de una imagen limpia. Los snapshots son inmutables; no equivalen a un disco SQLite que acepte escrituras persistentes. FUSE sobre almacenamiento de objetos es una opción documentada, pero Cloudflare advierte que no ofrece rendimiento de SSD; no se asumirá que es seguro para SQLite.

El backend actual tiene dos tipos de estado diferentes:

- **Datos que deben persistir en D1**: perfiles de operación en `profiles.py`; muestras, comandos, fotogramas, recomendaciones e historial en `historian.py`; además, checkpoints versionados para recuperar las sesiones.
- **Estado vivo hoy en memoria**: sesiones y `PlantModel` en `SessionManager` (`sessions.py`), incluyendo tiempo, estado hidráulico, mandos pendientes, velocidad y pausa. El plan incluye guardar/restaurar ese estado mediante checkpoints en D1.

Por tanto, cambiar solo la ruta del archivo SQLite no basta. El plan requiere:

1. Mantener un adaptador de almacenamiento para conservar SQLite en desarrollo local y usar D1 en Cloudflare.
2. Hacer de **D1 el almacenamiento persistente obligatorio** para perfiles, historian, frames, comandos, estudios, decisiones y checkpoints de sesión. FastAPI accederá mediante un Worker con binding D1 y un canal interno autenticado. No guardar tokens de cuenta Cloudflare dentro del Container ni tratar R2/FUSE como disco SQLite.
3. Diseñar checkpoints versionados del runtime hidráulico y sus mandos en D1, con consistencia del historian, ante sleep, reinicio, despliegue y reconexión. Si no se puede restaurar con fidelidad, la sesión debe permanecer fijada a una instancia activa mientras corre, con comportamiento y coste explícitos; no declarar tolerancia a reinicios sin probarla.
4. Probar escrituras concurrentes, transacciones, límites de D1, latencia, retención, backup y recuperación.

**Compuerta:** no publicar operación continua del acueducto hasta demostrar que D1 conserva perfiles, historian, auditoría y checkpoints, y que la reanudación no inventa ni pierde estado.

## 5. Seguridad y límites de acceso

La galería permanece abierta y sin login. El acceso API usa una capacidad anónima firmada, temporal, emitida por el Worker; no representa identidad autenticada y puede ser automatizada. CORS controla navegadores, no autentica. La política implementada reduce abuso, no promete impedirlo:

- Las solicitudes API y WSS requieren capacidad; health está expuesto y limitado. El Worker valida firma/expiración, allowlist, origen del bootstrap, propiedad de sesión en D1 y cuotas por IP/capacidad. Las sesiones vencen en 2 h; máximo 2 por visitante y 10 retenidas globales. El PLC WebSocket admite una conexión operativa y 30 mensajes/s.
- Solicitudes a Fractal tienen límites inferiores. Optimización, auditoría pública y decisiones/activación están bloqueadas. Perfiles se filtran por propietario anónimo. Datos vencidos se limpian al emitir una nueva capacidad.
- La autorización administrativa de `/_admin/` usa Cloudflare Access si se configura y deniega por defecto. No poner Access delante de Pages ni de la experiencia de demo pública.
- El bridge Worker → D1 requiere secreto; Containers solo se alcanzan mediante bindings Worker, nunca por URL pública. Las APIs hablan HTTPS/WSS; no guardar credenciales Cloudflare en el frontend.
- Acueducto solo acepta `water-network-scale-v1`; otros gemelos requieren servicios, allowlists y datos aislados propios.
- Fractal lee la sesión PLC autorizada y publica estudios `NO APLICADO`; revisión humana y emisión de mandos son rutas independientes. Mantener `FRACTAL_ENABLE_OPTIMIZATION=0`.
- Antes de publicar, ajustar quotas, costos, WAF/Turnstile opcional, política de retención, alertas y respuesta a abuso según límites reales del plan. Sin login no se identifica al usuario ni se evita abuso distribuido.

## 6. Fases de implementación

### Fase 0 — Inventario y decisiones de arquitectura

- Confirmar cuenta/plan Cloudflare Workers, disponibilidad de Containers, dominios y presupuesto permitido.
- Medir requisitos del simulador (CPU, memoria, duración, conexiones WebSocket, sesiones simultáneas y cold start).
- Definir si sesiones desconectadas continúan, se pausan o se detienen; preservar deliberadamente el comportamiento acordado.
- Probar D1 como almacenamiento persistente y definir el formato/frecuencia de checkpoints para recuperar una simulación activa y la política de retención.
- Acordar identidad, autorización y allowlist por servicio.

**Salida:** diseño probado localmente y decisiones registradas; sin exponer un API sin auth.

### Fase 1 — Separar contratos y proveedor de datos

- Añadir configuración explícita por servicio (`service_id`, plantas permitidas, origen de datos, límites), manteniendo defaults de desarrollo.
- Crear una capa de almacenamiento intercambiable y pruebas; mantener SQLite local y migrar los datos persistentes de producción a D1.
- Añadir checkpoints/versionado de sesión, restauración y pruebas ante reinicio.
- Separar de forma verificable health del emulador, creación/inicio/pausa/parada de simulación, proyección y optimización.

### Fase 2 — Worker y Container del acueducto (implementada en código; despliegue pendiente)

- Desplegar la imagen del emulador en Cloudflare Containers, configurada únicamente para `water-network-scale-v1`.
- El Worker enruta HTTP/WSS y aplica capacidades anónimas temporales, aislamiento de sesión, cuotas por IP/capacidad y límites de carga; no expone Containers.
- FastAPI → Worker → binding D1 usa bridge autenticado; no guardar datos persistentes en disco efímero.
- Health del servicio es distinto del estado de sesión. Validar remótamente salud, cuotas y recuperación.
- Demo de galería abierta, con Workers variables/secrets y dominio reales; `/_admin/` opcionalmente bajo Access. No requerir login Access para la HMI pública.

### Fase 3 — Conectar Gallery/HMI

- Configurar el endpoint de API por gemelo; no codificar el endpoint del acueducto como backend universal.
- Mostrar salud API, estado de sesión y disponibilidad de Fractal por separado.
- «Iniciar simulación» llama al flujo de sesión existente; no arranca servicios ni estudios.
- «Proyectar» solicita solo Fractal base/alternativo; futuro `NO APLICADO`.
- No ofrecer acción de optimización hasta que se levante su compuerta y se habilite mediante un despliegue/configuración diferente.
- Mantener `plant.html` en modo replay estático si el API no está configurado, explicando que es reproducción y no sesión en vivo.

### Fase 4 — Verificación y piloto público controlado (pendiente en Cloudflare)

- Contratos HTTP: health, esquema PLC, perfiles propios, crear/consultar/iniciar/detener sesión, historian y errores.
- WebSocket: handshake WSS con subprotocolo sin secreto, streaming, mandos, reconexión, pausa/reanudación, una conexión PLC y límite de mensajes.
- Persistencia/retención: dormir/reiniciar Container, restaurar D1, comprobar checkpoints y cuotas, limpieza de sesiones/datos vencidos, consistencia historian y ausencia de muestras duplicadas/perdidas.
- Aislamiento: planta ajena rechazada; capacidad anónima A no lee/modifica sesión/perfiles de B; API sin capacidad 401; manipulación de origin no sustituye capacidad.
- Comportamiento: despliegue no inicia simulación; proyección no cambia PLC; decisiones/optimización bloqueadas.
- Rendimiento/costo: medir cold start, sesiones simultáneas, CPU, cuotas, egreso, latencia y presupuesto; probar respuesta a límites y abuso.
- E2E navegador desktop/móvil contra API/WSS y D1/Containers reales.

**Salida:** abrir la demo solo tras revisar costos, cuotas, políticas de retención, WSS, aislamiento y recuperación con recursos reales.

### Fase 5 — Añadir manufactura de plásticos y futuros gemelos

- Crear identidad `emulator-plasticos`, allowlist de `plastic-injection-plant-v1` (y otros IDs aprobados), URL y almacenamiento propios.
- Reutilizar Worker/gateway solo si la política de aislamiento es clara; desplegar Container con configuración y límites independientes.
- Añadir una entrada al catálogo de servicios/gemelos para que `plant.html` elija endpoint por `plant_id` o configuración explícita; mantener override de `?api=` para desarrollo/diagnóstico.
- Repetir contratos, auth, WSS, persistencia D1 y límites para cada nuevo servicio. No asumir que una sesión/DB del acueducto sirve a todos los gemelos.

## 7. Criterios de aceptación globales

- Un servicio de emulador puede estar disponible sin que exista una simulación.
- La simulación puede iniciar/parar sin arrancar/desplegar el servicio ni activar Fractal.
- Fractal base/alternativo y optimización son operaciones y permisos distintos; proyección no emite mandos.
- Los estados hidráulicos y datos que deban persistir sobreviven a los eventos de ciclo de vida definidos.
- WSS y capacidades anónimas limitadas funcionan desde el dominio publicado; denegación por defecto para sesiones/acciones no autorizadas, entendiendo que la demo no identifica usuarios.
- Un hostname de API solo acepta los gemelos configurados para ese servicio.
- Pages sin `api` no se presenta como simulador en vivo; la reproducción estática se identifica como tal.
- No se cambia geometría 3D por desplegar los servicios.

## 8. Fuentes y estado comprobado

- Código actual: `apps/twin-emulator-api/src/twin_emulator_api/{main.py,sessions.py,historian.py,profiles.py}`.
- Imagen FastAPI existente: `apps/twin-emulator-api/Containerfile`; el build de Gallery es estático: `apps/gallery/Containerfile` y `.github/workflows/deploy.yml`.
- Despliegue actual: `docs/despliegue-cloudflare.md`.
- Cloudflare Containers: <https://developers.cloudflare.com/containers/>.
- Cloudflare FAQ sobre disco efímero/snapshots/FUSE: <https://developers.cloudflare.com/containers/faq/#is-disk-persistent-what-happens-to-my-disk-when-my-container-sleeps>.
- Cloudflare WebSocket a Container: <https://developers.cloudflare.com/containers/examples/websocket/>.
- Cloudflare Storage: <https://developers.cloudflare.com/containers/concepts/>.
- Cloudflare D1: <https://developers.cloudflare.com/d1/>.
- Containers requiere Workers Paid según la documentación consultada; los cargos dependen de recursos/tiempo/egreso y deben verificarse en el plan/cuenta antes de desplegar.

## 9. No incluido

- Conectar o mandar a un PLC físico.
- Habilitar optimización o aplicar automáticamente recomendaciones.
- Prometer durabilidad del runtime usando snapshots inmutables o SQLite sobre R2 FUSE sin pruebas.
- Crear los dominios de ejemplo ni afirmar que existe un Worker/Container en Cloudflare antes de desplegarlo.
