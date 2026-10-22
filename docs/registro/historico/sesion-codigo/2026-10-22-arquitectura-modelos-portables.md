---
tipo: historico-ia
fuente: sesión de código Pi
desde: 2026-10-22
hasta: 2026-10-22
tags: [registro, historico-ia, arquitectura]
---
# Arquitectura portable de modelos industriales

## Autor · 2026-10-22 UTC
Pidió separar lo particular de cada planta de lo general del runtime y de la API, de modo que en el futuro se pueda entregar, por ejemplo, únicamente el modelo de salsas a un cliente.

## IA · 2026-10-22 UTC
Propuso capas: runtime genérico, biblioteca reutilizable de equipos, paquetes industriales portables con dependencias explícitas, host de emulación API, aplicaciones HMI y despliegues por cliente.

## Autor · 2026-10-22 UTC
Confirmó avanzar con esa organización.

## IA · 2026-10-22 UTC
Renombró el host FastAPI de `apps/api` a `apps/twin-emulator-api`, conservando el runtime y la librería separados. Añadió `manifest.yaml` a los seis modelos industriales; cada manifiesto declara los equipos de `equipment-library` que el modelo usa en `simulation.yaml`. Añadió un validador, el esquema del manifiesto, documentación de arquitectura y carpetas base para integraciones y despliegues. Se validaron los seis manifiestos, las 15 pruebas de la API y el typecheck de la galería. Las herramientas se ejecutaron de forma local; no hubo conexión a PLC ni a infraestructura física.
