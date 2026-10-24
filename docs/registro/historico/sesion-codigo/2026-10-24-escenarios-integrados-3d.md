---
tipo: historico-ia
fuente: sesión de código pi en PR 79, rama feat/fractal-240x-replay
desde: 2026-10-24
hasta: 2026-10-24
tags: [registro, historico-ia, plc, fractal, escenarios, 3d]
---
# Escenarios personalizados y PLC en un solo escritorio 3D

**Autor (2026-10-24 UTC):** «ese perfil lo podemos borrar , no aporta, realmente yo preferiria cambiarlo por un perfil personalizado, donde el usuario previamente configure las aperuras de casas y fugas

ah y me falta que en todos los perfiles siempre se debe calcular cual es la grafica de apertura y presion vs tiempo (en la misma grafica con dos ejes y una a izq %apertura y otro a derecha presion a la salida de la Estacion reguladora de presion )auto escalados ambos ejes

hasta ahi tenemos y quedaremos con esos 3 escenarios
nota, para correr l simulador fractal se puede hacer en cualquier momento siempre y cuando el sistam este en play, pero no necesariamente el fractal tiene que star prendido cuando emulador esta funcionando y cuando emulador este funcionando debo poder devolverme en el tiempo . por eso me gustaria que sobre el mismo 3d EN UNA PESTAñA NAV BAR PODAMOS DISEñAR EL PLC Y NO TENER QUE MOSTRARLO EN UNA PAGINA APARTE, revisa como integrar todo ahi para que el 3d sea la unica pantalla
inicialmente desarrollemos para pantalla de compu, despues nos ocuparemos de mobile».

**Autor (2026-10-24 UTC):** «continua y al terminar revisa lo siguiente los escenarios personalizados se deben poder guardar nombrar editar y eliminar, en una ppantalla de administracion de escenarios».

**IA (2026-10-24 UTC):** Se retiraron presets operativos sin curva representativa (`pfl-noc-01`, `pfl-noc-02`, `pfl-res-01`) y se limpiaron sus semillas existentes en SQLite sin borrar personalizaciones. Quedaron PDD, base y plantilla personalizada; la administración crea, nombra, guarda, renombra, edita y borra copias del operador, protege plantillas y el perfil de una sesión activa, y permite configurar 64 viviendas y ocho fugas antes de play. El PLC programa un perfil nuevo para la próxima hora sin modificar el ID activo antes del límite. La gráfica muestra medias de aperturas de viviendas/fugas en eje izquierdo autoescalado y presión **salida** PRS en eje derecho desde Fractal bajo demanda con PLC en play; si faltan tags o Fractal, la presión se declara pendiente (no se equipara a la consigna crítica). Se añadió la barra 3D/PLC/HISTÓRICO en `plant.html`: HMI embebida con sesión compartida verificada por `postMessage` y snapshots 3D persistidos para navegar el pasado sin alterar el presente. Fractal no queda encendido por obligación mientras el emulador marcha. Mobile y despliegue público quedan para después; el horizonte de tanques no se declara validado.

**Herramientas resumidas:** inspección de contratos/gateway/galería, edición dirigida y nuevas pruebas, `uv run ruff check .`, `uv run pytest` (41 pruebas pertinentes), `pnpm -r typecheck`, build Gallery, geometría Vitest con un worker (149 pruebas) y smoke browser con Playwright (crear, guardar, cambiar aperturas, consulta de presión Fractal, historial con sesión viva, vuelta a presente, renombrar y eliminar). Informe continuo poscorrección: 2596,71 s de cálculo y 34,268 pp de diferencia máxima en tanque suministro, sin desacuerdo de seguridad; reproducción 24 horas/360,004 s, no cálculo en vivo.
