# Arquitectura portable de modelos industriales

Cada carpeta en `industrial-models/<modelo>` es un paquete portable: describe una planta concreta, sus dependencias de equipos y sus puntos de entrada. No contiene implementaciones duplicadas de los equipos ni reglas de transporte HTTP/WebSocket.

## Capas

- `packages/twin-runtime`: motor general de tiempo, eventos, enlaces y snapshots.
- `equipment-library/<tipo>`: contrato y comportamiento reutilizable de cada equipo.
- `industrial-models/<modelo>`: topología, configuración, reglas exclusivas, escenarios y dependencias explícitas.
- `apps/twin-emulator-api`: host FastAPI/WebSocket; crea y comunica sesiones, sin lógica particular de una planta.
- `apps/gallery`: HMI, portal y escena 3D.
- `integrations`: futuros adaptadores OPC UA, MQTT, ERP o historiadores reales; no pertenecen al emulador.
- `deployments`: configuración y empaquetado específico de cada cliente.

## Manifest

Todo modelo incluye `manifest.yaml`. Declara:

- compatibilidad con el runtime;
- archivos de layout y simulación;
- modelo de dominio exclusivo, cuando exista;
- lista exacta de tipos de `equipment-library` requeridos.

La relación se valida con:

```bash
uv run python tools/validate_model.py
uv run python tools/validate_model.py sauce-plant-v1
```

Esto permite que un empaquetador futuro entregue solo el runtime, API host, modelo seleccionado y los equipos declarados por su manifest.
